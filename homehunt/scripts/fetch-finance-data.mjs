import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// All providers are public, read-only endpoints. ECOS's public sample access is
// limited to ten rows: request at most ten calendar months, never an all-time
// range whose first ten rows could silently masquerade as the latest data.
export const BOK_BASE_URL = 'https://www.bok.or.kr/portal/singl/baseRate/list.do?dataSeCd=01&menuNo=200643';
export const BOK_NEWS_URL = 'https://www.bok.or.kr/portal/main/main.do';
export const HF_RATE_URL = 'https://www.hf.go.kr/ko/sub01/sub01_01_04.do';
export const FINANCE_OUTPUT_PATH = fileURLToPath(new URL('../data/finance-dashboard.json', import.meta.url));
export const FINANCE_DEFINITIONS = Object.freeze([
  {
    id: 'mortgage_new', sourceId: 'bok_mortgage', label: '은행 주택담보대출 평균', kind: 'average', frequency: 'monthly', unit: '%',
    sourceName: '한국은행 ECOS', sourceUrl: 'https://ecos.bok.or.kr/',
    description: '예금은행이 해당 월 새로 취급한 주택담보대출의 금액 가중평균입니다. 개인에게 제시되는 금리와 다르며 공표까지 시차가 있습니다.',
  },
  {
    id: 'bok_base_rate', sourceId: 'bok_base', label: '한국은행 기준금리', kind: 'policy', frequency: 'decision', unit: '%',
    sourceName: '한국은행', sourceUrl: BOK_BASE_URL,
    description: '한국은행의 정책금리입니다. 기준일은 마지막 변경일이며, 은행 대출에 그대로 적용되는 금리가 아닙니다.',
  },
  {
    id: 'hf_bogeumjari_30', sourceId: 'hf_bogeumjari', label: '아낌e보금자리론 · 30년', kind: 'product', frequency: 'monthly', unit: '%',
    sourceName: '한국주택금융공사', sourceUrl: HF_RATE_URL,
    description: '아낌e보금자리론 30년 만기의 공시 고정금리입니다. 전자약정·등기 방식 금리이며 추가 우대금리 적용 전입니다. 실제 이용 가능 여부·금리는 공사의 심사로 결정됩니다.',
  },
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function financeToday(now = new Date()) {
  const time = new Date(now).getTime();
  if (!Number.isFinite(time)) fail('invalid_check_time');
  return new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function validDate(value, monthly = false) {
  const format = monthly ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!format.test(value)) return false;
  const date = monthly ? `${value}-01` : value;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function rateValue(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,2}(?:\.\d{1,4})?$/.test(text)) fail('invalid_rate_value');
  const number = Number(text);
  if (number < 0 || number > 30) fail('invalid_rate_value');
  return number;
}

function plainHtml(value) {
  return String(value ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, decimal) => {
      const code = parseInt(hex || decimal, hex ? 16 : 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    })
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function tableRows(table) {
  return [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(row => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => plainHtml(cell[1])));
}

function uniqueHistory(rows) {
  const dates = new Map();
  for (const row of rows) {
    if (dates.has(row.date) && dates.get(row.date).value !== row.value) fail('conflicting_observations');
    dates.set(row.date, row);
  }
  return [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildEcosMortgageUrl(now = new Date()) {
  const end = financeToday(now).slice(0, 7);
  const start = new Date(`${end}-01T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - 9);
  return `https://ecos.bok.or.kr/api/StatisticSearch/sample/json/kr/1/10/121Y006/M/${start.toISOString().slice(0, 7).replace('-', '')}/${end.replace('-', '')}/BECBLA0302`;
}

export function parseEcosMortgage(payload, { now = new Date() } = {}) {
  const result = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const rows = result?.StatisticSearch?.row;
  if (!Array.isArray(rows) || !rows.length) fail('ecos_missing_series');
  if (rows.length > 10 || Number(result.StatisticSearch.list_total_count) !== rows.length) fail('ecos_incomplete_window');
  const today = financeToday(now);
  const history = uniqueHistory(rows.map(row => {
    if (row.STAT_CODE !== '121Y006' || row.ITEM_CODE1 !== 'BECBLA0302' || row.ITEM_NAME1 !== '주택담보대출'
      || !/신규취급액/.test(row.STAT_NAME) || !/^연(?:리)?%$/.test(row.UNIT_NAME)
      || [row.ITEM_CODE2, row.ITEM_CODE3, row.ITEM_CODE4].some(Boolean)) fail('ecos_wrong_series');
    if (!/^\d{6}$/.test(row.TIME)) fail('ecos_invalid_month');
    const date = `${row.TIME.slice(0, 4)}-${row.TIME.slice(4)}`;
    if (!validDate(date, true) || date > today.slice(0, 7)) fail('ecos_invalid_month');
    return { date, value: rateValue(row.DATA_VALUE) };
  }));
  const latest = history.at(-1);
  return { value: latest.value, observationDate: latest.date, history, publishedAt: null, dataUrl: buildEcosMortgageUrl(now) };
}

export function parseBokBaseRate(html, { now = new Date() } = {}) {
  const tables = [...String(html).matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)]
    .map(match => match[0]).filter(table => /한국은행 기준금리 추이/.test(plainHtml(table)) && /변경일자/.test(plainHtml(table)));
  if (tables.length !== 1) fail('bok_base_table_missing');
  const today = financeToday(now);
  const rows = tableRows(tables[0]).filter(cells => !cells.some(cell => cell === '변경일자'));
  if (!rows.length) fail('bok_base_rows_missing');
  const history = uniqueHistory(rows.map(cells => {
    if (cells.length !== 3 || !/^\d{4}$/.test(cells[0])) fail('bok_base_invalid_date');
    const dateParts = cells[1].match(/^(\d{1,2})월\s*(\d{1,2})일$/);
    if (!dateParts) fail('bok_base_invalid_date');
    const date = `${cells[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
    if (!validDate(date) || date > today) fail('bok_base_invalid_date');
    return { date, value: rateValue(cells[2]) };
  })).slice(-24);
  const latest = history.at(-1);
  // This table labels the effective change date; it does not expose a separate
  // publication timestamp. Do not relabel the effective date as publication.
  return { value: latest.value, observationDate: latest.date, publishedAt: null, history };
}

export function parseHfBogeumjari(html, { now = new Date() } = {}) {
  const text = plainHtml(html);
  const matches = [...text.matchAll(/공시일\s*:\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g)];
  if (matches.length !== 1) fail('hf_publication_missing');
  const [, year, month, day] = matches[0];
  const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  if (!validDate(date) || date > financeToday(now)) fail('hf_invalid_date');
  const tables = [...String(html).matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)]
    .map(match => match[0]).filter(table => /상품별\s*\/\s*만기/.test(plainHtml(table)) && /아낌e/.test(plainHtml(table)));
  if (tables.length !== 1) fail('hf_rate_table_missing');
  const rows = tableRows(tables[0]);
  const header = rows.find(cells => cells[0] === '상품별/만기');
  const productRows = rows.filter(cells => /^아낌e-?보금자리론$/.test(cells[0]));
  if (!header || productRows.length !== 1) fail('hf_product_missing');
  const tenorIndex = header.indexOf('30년');
  const rates = productRows[0];
  if (tenorIndex < 1 || rates.length !== header.length) fail('hf_tenor_missing');
  const terms = header.slice(1).map((term, index) => {
    if (!/^\d{2}년$/.test(term)) fail('hf_tenor_missing');
    return { years: Number(term.replace('년', '')), value: rateValue(rates[index + 1]) };
  });
  const value = rateValue(rates[tenorIndex]);
  return { value, observationDate: date, publishedAt: date, publicationSourceUrl: HF_RATE_URL,
    publicationBasis: 'hf_rate_table_disclosure_date', history: [{ date: date.slice(0, 7), value }], terms };
}

export function findBokMortgageRelease(html, month) {
  if (!validDate(month, true)) return null;
  const [year, mon] = month.split('-');
  const expected = `${year}년 ${Number(mon)}월 금융기관 가중평균금리`;
  for (const anchor of String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!plainHtml(anchor[2]).startsWith(expected)) continue;
    const url = new URL(anchor[1].replace(/&amp;/g, '&'), BOK_NEWS_URL);
    if (url.origin !== 'https://www.bok.or.kr' || url.pathname !== '/portal/bbs/B0000501/view.do' || !/^\d+$/.test(url.searchParams.get('nttId') || '')) continue;
    return `https://www.bok.or.kr/portal/bbs/B0000501/view.do?menuNo=201264&nttId=${url.searchParams.get('nttId')}`;
  }
  return null;
}

export function parseBokPublicationDate(html, month, { now = new Date() } = {}) {
  const [year, mon] = month.split('-');
  const title = [...String(html).matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(match => plainHtml(match[1]));
  if (!title.includes(`${year}년 ${Number(mon)}월 금융기관 가중평균금리`)) fail('bok_publication_wrong_month');
  const match = String(html).match(/<dd\b[^>]*class=["']date["'][^>]*>\s*(\d{4})\.(\d{2})\.(\d{2})\s*<\/dd>/i);
  const date = match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  if (!validDate(date) || date < `${month}-01` || date > financeToday(now)) fail('bok_publication_invalid_date');
  return date;
}

async function getPublicText(url, { fetchImpl, signal, timeoutMs }) {
  signal?.throwIfAborted();
  const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  const response = await fetchImpl(url, { signal: combined, headers: { accept: 'application/json,text/html;q=0.9', 'user-agent': 'HomeHunt-PublicFinance/1.0 (+https://github.com/CastleRain/sungso)' } });
  if (!response.ok) fail('source_http_error');
  const text = await response.text();
  combined.throwIfAborted();
  if (!text || text.length > 2_000_000) fail('source_body_invalid');
  return text;
}

function freshness(parsed, definition, now) {
  const today = financeToday(now);
  if (definition.id === 'hf_bogeumjari_30' && parsed.observationDate.slice(0, 7) < today.slice(0, 7)) return 'stale';
  if (definition.id === 'mortgage_new' && new Date(`${today}T00:00:00Z`) - new Date(`${parsed.observationDate}-01T00:00:00Z`) > 100 * 86400000) return 'stale';
  return 'ok';
}

function publicationEvidence(definition, row, now) {
  const missing = { publishedAt: null, publicationBasis: null, publicationSourceUrl: null };
  if (!row || !validDate(row.publishedAt || '') || row.publishedAt > financeToday(now)) return missing;
  if (definition.id === 'mortgage_new' && row.publicationBasis === 'bok_press_release_registered_at'
    && validDate(row.observationDate || '', true) && row.publishedAt >= `${row.observationDate}-01`) {
    try {
      const url = new URL(row.publicationSourceUrl);
      if (url.origin !== 'https://www.bok.or.kr' || url.username || url.password
        || url.pathname !== '/portal/bbs/B0000501/view.do' || !/^\d+$/.test(url.searchParams.get('nttId') || '')) return missing;
      return { publishedAt: row.publishedAt, publicationBasis: row.publicationBasis, publicationSourceUrl: url.href };
    } catch { return missing; }
  }
  if (definition.id === 'hf_bogeumjari_30' && row.publicationBasis === 'hf_rate_table_disclosure_date'
    && row.publicationSourceUrl === HF_RATE_URL && row.publishedAt === row.observationDate) {
    return { publishedAt: row.publishedAt, publicationBasis: row.publicationBasis, publicationSourceUrl: HF_RATE_URL };
  }
  // In particular, legacy snapshots inferred BOK publication from its change
  // date. Never preserve that inference, even when today's provider fails.
  return missing;
}

function publicationNote(definition, evidence) {
  if (evidence.publishedAt) return null;
  if (definition.id === 'bok_base_rate') return '기준금리 추이는 변경일을 제공하며 별도 공표일은 미확인입니다.';
  if (definition.id === 'hf_bogeumjari_30') return '공식 금리표의 공시일을 별도로 확인하지 못했습니다.';
  return 'ECOS 응답에 공표일이 없어 별도 공표일은 미확인입니다.';
}

export async function collectFinanceData({ previous = null, now = new Date(), fetchImpl = globalThis.fetch, signal, timeoutMs = 20_000 } = {}) {
  signal?.throwIfAborted();
  const checkedAt = new Date(now).toISOString();
  const requestOptions = { fetchImpl, signal, timeoutMs };
  const collectors = [
    async () => {
      const url = buildEcosMortgageUrl(now);
      const parsed = parseEcosMortgage(await getPublicText(url, requestOptions), { now });
      parsed.sourceUrl = url;
      // ECOS supplies observation months but no publication date. An unavailable
      // press-page lookup must never invent a date or block verified statistics.
      try {
        const main = await getPublicText(BOK_NEWS_URL, requestOptions);
        const article = findBokMortgageRelease(main, parsed.observationDate);
        if (article) {
          parsed.publishedAt = parseBokPublicationDate(await getPublicText(article, requestOptions), parsed.observationDate, { now });
          parsed.sourceUrl = article;
          parsed.publicationSourceUrl = article;
          parsed.publicationBasis = 'bok_press_release_registered_at';
        }
      } catch { signal?.throwIfAborted(); }
      return parsed;
    },
    async () => parseBokBaseRate(await getPublicText(BOK_BASE_URL, requestOptions), { now }),
    async () => parseHfBogeumjari(await getPublicText(HF_RATE_URL, requestOptions), { now }),
  ];
  const results = await Promise.allSettled(collectors.map(collect => collect()));
  signal?.throwIfAborted();
  const sources = [];
  let successes = 0;
  const series = FINANCE_DEFINITIONS.map((definition, index) => {
    const old = previous?.series?.find(item => item.id === definition.id);
    const result = results[index];
    // A provider/cache returning an older period cannot roll back a good value.
    const backwards = result.status === 'fulfilled' && old?.observationDate && result.value.observationDate < old.observationDate;
    if (result.status === 'rejected' || backwards) {
      const reason = backwards ? 'source_period_regressed' : 'source_check_failed';
      sources.push({ id: definition.sourceId, status: 'failed', checkedAt, lastSuccessAt: old?.checkedAt || null, error: reason });
      const publication = publicationEvidence(definition, old, now);
      return { ...definition, ...(old || {}), status: old && Number.isFinite(old.value) ? 'stale' : 'unavailable', value: Number.isFinite(old?.value) ? old.value : null,
        observationDate: old?.observationDate || null, ...publication, publicationNote: publicationNote(definition, publication),
        checkedAt: old?.checkedAt || null, lastAttemptAt: checkedAt, statusReason: reason };
    }
    successes += 1;
    const parsed = result.value;
    const samePeriod = old?.observationDate === parsed.observationDate;
    // New provider rows replace revisions for the same dates; missing periods
    // are retained as actual observations, never interpolated as synthetic data.
    const history = new Map((old?.history || []).filter(row => validDate(row.date, row.date.length === 7) && Number.isFinite(row.value)).map(row => [row.date, row]));
    for (const row of parsed.history) history.set(row.date, row);
    const status = freshness(parsed, definition, now);
    let publication = publicationEvidence(definition, parsed, now);
    if (!publication.publishedAt && definition.id === 'mortgage_new' && samePeriod) {
      publication = publicationEvidence(definition, old, now);
    }
    sources.push({ id: definition.sourceId, status: 'ok', checkedAt, lastSuccessAt: checkedAt });
    return { ...definition, ...parsed, sourceUrl: parsed.sourceUrl || definition.sourceUrl, ...publication,
      checkedAt, lastAttemptAt: checkedAt, status, statusReason: status === 'stale' ? 'observation_outdated' : null,
      publicationNote: publicationNote(definition, publication),
      history: [...history.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-60) };
  });
  return { schemaVersion: 1, generatedAt: successes ? checkedAt : previous?.generatedAt || null, lastAttemptAt: checkedAt,
    status: successes === series.length ? 'ok' : successes ? 'partial' : 'failed',
    collectionNote: '공식 공개 자료를 하루 한 번 확인합니다. 관측월·적용일과 확인시각은 다르며, 수집 실패 시 이전 자료의 기준일을 유지합니다.',
    series, sources };
}

export async function writeFinanceSnapshot(snapshot, outputPath = FINANCE_OUTPUT_PATH, { signal } = {}) {
  signal?.throwIfAborted();
  const temporary = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    signal?.throwIfAborted();
    await rename(temporary, outputPath);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

async function main() {
  let previous = null;
  try { previous = JSON.parse(await readFile(FINANCE_OUTPUT_PATH, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const snapshot = await collectFinanceData({ previous, signal: controller.signal });
    await writeFinanceSnapshot(snapshot, FINANCE_OUTPUT_PATH, { signal: controller.signal });
    console.log(JSON.stringify({ status: snapshot.status, lastAttemptAt: snapshot.lastAttemptAt,
      series: snapshot.series.map(({ id, observationDate, status }) => ({ id, observationDate, status })) }));
    // Commit preserved values + failure flags even when one source is unavailable.
    // The workflow can inspect this JSON without dropping a partial successful run.
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('공식 금리 수집을 완료하지 못했습니다. 기존 저장본은 보존합니다.'); process.exitCode = 1; });
}
