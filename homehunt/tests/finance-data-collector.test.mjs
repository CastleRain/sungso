import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  BOK_BASE_URL, BOK_NEWS_URL, HF_RATE_URL, buildEcosMortgageUrl,
  collectFinanceData, financeToday, findBokMortgageRelease, parseBokBaseRate,
  parseBokPublicationDate, parseEcosMortgage, parseHfBogeumjari, writeFinanceSnapshot,
} from '../scripts/fetch-finance-data.mjs';

const NOW = '2026-09-09T17:00:00Z';
const ARTICLE = 'https://www.bok.or.kr/portal/bbs/B0000501/view.do?menuNo=201264&nttId=11064110';
const BASE = '<table><caption>한국은행 기준금리 추이</caption><thead><tr><th colspan="2">변경일자</th><th>기준금리</th></tr></thead><tbody><tr><td>2026</td><td>08월 27일</td><td>3.00</td></tr><tr><td>2026</td><td>07월 16일</td><td>2.75</td></tr><tr><td>2025</td><td>05월 29일</td><td>2.50</td></tr></tbody></table>';
const HF = '<div>2026년 09월 u-보금자리론 금리 입니다. 공시일 : 2026년 09월 01일 (연 %)</div><table><thead><tr><th>상품별/만기</th><th>10년</th><th>15년</th><th>20년</th><th>30년</th><th>40년</th><th>50년</th></tr></thead><tbody><tr><td>u-보금자리론</td><td>5.00</td><td>5.10</td><td>5.15</td><td>5.20</td><td>5.25</td><td>5.30</td></tr><tr><td>아낌e보금자리론</td><td>4.90</td><td>5.00</td><td>5.05</td><td>5.10</td><td>5.15</td><td>5.20</td></tr></tbody></table>';
const NEWS = `<a href="${ARTICLE.replace('&', '&amp;')}"><h3>2026년 7월 금융기관 가중평균금리</h3><p>대출금리는 4.27%</p></a>`;
const RELEASE = '<h2 class="subject">2026년 7월 금융기관 가중평균금리</h2><dl><dt>등록일</dt><dd class="date">2026.08.26</dd></dl>';
function ecosRow(time = '202607', value = '4.48') {
  return { STAT_CODE: '121Y006', STAT_NAME: '1.3.3.2.1. 예금은행 대출금리(신규취급액 기준)', ITEM_CODE1: 'BECBLA0302', ITEM_NAME1: '주택담보대출', UNIT_NAME: '연리%', TIME: time, DATA_VALUE: value, ITEM_CODE2: null };
}
function ecos(rows = [ecosRow('202606', '4.36'), ecosRow()]) {
  return { StatisticSearch: { list_total_count: rows.length, row: rows } };
}
function fakeFetch(overrides = {}) {
  return async url => {
    if (overrides[url] instanceof Error) throw overrides[url];
    const body = overrides[url] ?? ({ [BOK_BASE_URL]: BASE, [HF_RATE_URL]: HF, [BOK_NEWS_URL]: NEWS, [ARTICLE]: RELEASE }[url]
      ?? (url.includes('/StatisticSearch/') ? JSON.stringify(ecos()) : null));
    assert.ok(body !== null, `unexpected network URL: ${url}`);
    return { ok: true, text: async () => body };
  };
}

test('rolling public sample request cannot truncate the latest month and uses KST month', () => {
  assert.equal(financeToday(NOW), '2026-09-10');
  assert.equal(financeToday('2026-08-31T15:01:00Z'), '2026-09-01');
  assert.equal(buildEcosMortgageUrl(NOW), 'https://ecos.bok.or.kr/api/StatisticSearch/sample/json/kr/1/10/121Y006/M/202512/202609/BECBLA0302');
});

test('ECOS selects actual latest observed month, never collection month or zero-filled missing months', () => {
  const parsed = parseEcosMortgage(ecos([ecosRow(), ecosRow('202605', '4.32')]), { now: NOW });
  assert.equal(parsed.value, 4.48);
  assert.equal(parsed.observationDate, '2026-07');
  assert.equal(parsed.publishedAt, null);
  assert.deepEqual(parsed.history, [{ date: '2026-05', value: 4.32 }, { date: '2026-07', value: 4.48 }]);
});

test('ECOS rejects household loan/stock/unit/subcategory substitution', () => {
  for (const mutation of [{ ITEM_CODE1: 'BECBLA03' }, { ITEM_NAME1: '가계대출' }, { STAT_CODE: '121Y007' }, { STAT_NAME: '대출금리 잔액기준' }, { UNIT_NAME: '원' }, { ITEM_CODE2: 'extra' }]) {
    assert.throws(() => parseEcosMortgage(ecos([{ ...ecosRow(), ...mutation }]), { now: NOW }), /ecos_wrong_series/);
  }
});

test('ECOS refuses error payload, partial sample results, invalid rates/months and conflicting duplicates', () => {
  assert.throws(() => parseEcosMortgage({ RESULT: { CODE: 'INFO-200' } }), /ecos_missing_series/);
  const incomplete = ecos(); incomplete.StatisticSearch.list_total_count = 12;
  assert.throws(() => parseEcosMortgage(incomplete, { now: NOW }), /ecos_incomplete_window/);
  for (const value of ['', '-', 'NaN', '0x10', '-1', '40']) assert.throws(() => parseEcosMortgage(ecos([ecosRow('202607', value)]), { now: NOW }));
  for (const date of ['2026Q2', '202600', '202613', '202610']) assert.throws(() => parseEcosMortgage(ecos([ecosRow(date)]), { now: NOW }), /ecos_invalid_month/);
  assert.throws(() => parseEcosMortgage(ecos([ecosRow(), ecosRow('202607', '4.49')]), { now: NOW }), /conflicting_observations/);
});

test('BOK parses change dates in reverse chronological source order and preserves policy history', () => {
  const parsed = parseBokBaseRate(BASE, { now: NOW });
  assert.equal(parsed.value, 3);
  assert.equal(parsed.observationDate, '2026-08-27');
  assert.equal(parsed.publishedAt, null);
  assert.deepEqual(parsed.history[0], { date: '2025-05-29', value: 2.5 });
});

test('BOK refuses unrelated, ambiguous, invalid or future change tables', () => {
  assert.throws(() => parseBokBaseRate('<table><tr><td>3.00</td></tr></table>', { now: NOW }), /table_missing/);
  assert.throws(() => parseBokBaseRate(BASE + BASE, { now: NOW }), /table_missing/);
  assert.throws(() => parseBokBaseRate(BASE.replace('08월 27일', '02월 30일'), { now: NOW }), /invalid_date/);
  assert.throws(() => parseBokBaseRate(BASE.replace('08월 27일', '09월 11일'), { now: NOW }), /invalid_date/);
  assert.throws(() => parseBokBaseRate(BASE.replace('<td>2026</td>', '<td>20xx</td>'), { now: NOW }), /invalid_date/);
});

test('HF chooses 30-year 아낌e column, not minimum/u product/discount percentage', () => {
  const parsed = parseHfBogeumjari(HF + '<table><tr><td>우대금리</td><td>1.0%p</td></tr></table>', { now: NOW });
  assert.equal(parsed.value, 5.1);
  assert.equal(parsed.observationDate, '2026-09-01');
  assert.equal(parsed.publishedAt, '2026-09-01');
  assert.equal(parsed.publicationBasis, 'hf_rate_table_disclosure_date');
  assert.deepEqual(parsed.terms[0], { years: 10, value: 4.9 });
  const swapped = HF.replace('<th>30년</th><th>40년</th>', '<th>40년</th><th>30년</th>');
  assert.equal(parseHfBogeumjari(swapped, { now: NOW }).value, 5.15);
});

test('HF rejects unpublished future month, ambiguous publication or missing product/tenor cells', () => {
  assert.throws(() => parseHfBogeumjari(HF.replace(/09월/g, '10월'), { now: NOW }), /hf_invalid_date/);
  assert.throws(() => parseHfBogeumjari(HF + '공시일 : 2026년 08월 01일', { now: NOW }), /publication_missing/);
  assert.throws(() => parseHfBogeumjari(HF.replace('<th>30년</th>', '<th>35년</th>'), { now: NOW }), /tenor_missing/);
  assert.throws(() => parseHfBogeumjari(HF.replace('<td>4.90</td>', ''), { now: NOW }), /tenor_missing/);
  assert.throws(() => parseHfBogeumjari(HF.replace('아낌e보금자리론', '다른상품'), { now: NOW }), /rate_table_missing/);
  assert.throws(() => parseHfBogeumjari(HF.replace('공시일', '적용일'), { now: NOW }), /publication_missing/);
});

test('BOK release lookup matches exact observation and disallows foreign or invalid article URLs', () => {
  assert.equal(findBokMortgageRelease(NEWS, '2026-07'), ARTICLE);
  assert.equal(findBokMortgageRelease(NEWS, '2026-06'), null);
  assert.equal(findBokMortgageRelease(NEWS.replace('https://www.bok.or.kr', 'https://example.com'), '2026-07'), null);
  assert.equal(parseBokPublicationDate(RELEASE, '2026-07', { now: NOW }), '2026-08-26');
  assert.throws(() => parseBokPublicationDate(RELEASE, '2026-06', { now: NOW }), /wrong_month/);
  assert.throws(() => parseBokPublicationDate(RELEASE.replace('2026.08.26', '2026.09.11'), '2026-07', { now: NOW }), /invalid_date/);
});

test('live-source contract returns three distinct, dated official rate types', async () => {
  const snapshot = await collectFinanceData({ now: NOW, fetchImpl: fakeFetch() });
  assert.equal(snapshot.status, 'ok');
  assert.deepEqual(snapshot.series.map(row => [row.id, row.value, row.observationDate, row.kind]), [
    ['mortgage_new', 4.48, '2026-07', 'average'], ['bok_base_rate', 3, '2026-08-27', 'policy'], ['hf_bogeumjari_30', 5.1, '2026-09-01', 'product'],
  ]);
  assert.equal(snapshot.series[0].publishedAt, '2026-08-26');
  assert.equal(snapshot.series[0].sourceUrl, ARTICLE);
});

test('optional publication lookup failure keeps verified ECOS observation without a guessed release date', async () => {
  const snapshot = await collectFinanceData({ now: NOW, fetchImpl: fakeFetch({ [BOK_NEWS_URL]: new Error('offline') }) });
  assert.equal(snapshot.status, 'ok');
  assert.equal(snapshot.series[0].status, 'ok');
  assert.equal(snapshot.series[0].publishedAt, null);
  assert.match(snapshot.series[0].publicationNote, /미확인/);
  assert.match(snapshot.series[0].sourceUrl, /^https:\/\/ecos\.bok\.or\.kr\/api\//);
});

test('legacy inferred BOK publication is removed on both successful and failed refresh without restamping failed evidence', async () => {
  const old = await collectFinanceData({ now: NOW, fetchImpl: fakeFetch() });
  old.series[1].publishedAt = old.series[1].observationDate;
  old.series[1].publicationNote = null;
  for (const offline of [false, true]) {
    const current = await collectFinanceData({ previous: old, now: '2026-09-10T17:00:00Z',
      fetchImpl: fakeFetch(offline ? { [BOK_BASE_URL]: new Error('offline') } : {}) });
    assert.equal(current.series[1].publishedAt, null);
    assert.equal(current.series[1].publicationBasis, null);
    assert.match(current.series[1].publicationNote, /변경일/);
    assert.equal(current.series[1].value, 3);
    assert.equal(current.series[1].observationDate, '2026-08-27');
    if (offline) assert.equal(current.series[1].checkedAt, old.series[1].checkedAt);
  }
});

test('same-month mortgage publication fallback requires verified official release provenance', async () => {
  const old = await collectFinanceData({ now: NOW, fetchImpl: fakeFetch() });
  const fetchImpl = fakeFetch({ [BOK_NEWS_URL]: new Error('offline') });
  const preserved = await collectFinanceData({ previous: old, now: NOW, fetchImpl });
  assert.equal(preserved.series[0].publishedAt, '2026-08-26');
  assert.equal(preserved.series[0].publicationSourceUrl, ARTICLE);
  for (const mutation of [{ publicationBasis: null }, { publicationSourceUrl: 'https://example.com/release' }, { publicationSourceUrl: 'https://www.bok.or.kr/portal/main/main.do' }]) {
    const unverified = structuredClone(old);
    Object.assign(unverified.series[0], mutation);
    const current = await collectFinanceData({ previous: unverified, now: NOW, fetchImpl });
    assert.equal(current.series[0].publishedAt, null);
    assert.equal(current.series[0].status, 'ok');
    assert.equal(current.series[0].value, 4.48);
  }
});

test('HF preserves only an explicitly evidenced disclosure date when its provider fails', async () => {
  const old = await collectFinanceData({ now: NOW, fetchImpl: fakeFetch() });
  const fetchImpl = fakeFetch({ [HF_RATE_URL]: new Error('offline') });
  const current = await collectFinanceData({ previous: old, now: NOW, fetchImpl });
  assert.equal(current.series[2].publishedAt, '2026-09-01');
  assert.equal(current.series[2].publicationSourceUrl, HF_RATE_URL);
  delete old.series[2].publicationBasis;
  const legacy = await collectFinanceData({ previous: old, now: NOW, fetchImpl });
  assert.equal(legacy.series[2].publishedAt, null);
  assert.equal(legacy.series[2].value, 5.1);
  assert.equal(legacy.series[2].observationDate, '2026-09-01');
});

test('partial failure preserves previous source date/value and successful unrelated sources', async () => {
  const old = await collectFinanceData({ now: NOW, fetchImpl: fakeFetch() });
  const now = '2026-09-10T17:00:00Z';
  const current = await collectFinanceData({ previous: old, now, fetchImpl: fakeFetch({ [HF_RATE_URL]: new Error('offline') }) });
  assert.equal(current.status, 'partial');
  const hf = current.series[2];
  assert.equal(hf.value, 5.1);
  assert.equal(hf.status, 'stale');
  assert.equal(hf.checkedAt, old.series[2].checkedAt);
  assert.equal(hf.observationDate, '2026-09-01');
  assert.equal(hf.lastAttemptAt, new Date(now).toISOString());
  assert.equal(current.series[0].status, 'ok');
});

test('all failures never refresh last successful snapshot time and never leak error content', async () => {
  const old = await collectFinanceData({ now: NOW, fetchImpl: fakeFetch() });
  const current = await collectFinanceData({ previous: old, now: '2026-09-10T17:00:00Z', fetchImpl: async () => { throw new Error('private-like-string'); } });
  assert.equal(current.status, 'failed');
  assert.equal(current.generatedAt, old.generatedAt);
  assert.deepEqual(current.series.map(row => row.value), old.series.map(row => row.value));
  assert.ok(current.series.every(row => row.status === 'stale'));
  assert.ok(!JSON.stringify(current).includes('private-like-string'));
});

test('first collection failure uses null unavailable values instead of illustrative rates', async () => {
  const snapshot = await collectFinanceData({ now: NOW, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(snapshot.generatedAt, null);
  assert.ok(snapshot.series.every(row => row.status === 'unavailable' && row.value === null && row.checkedAt === null));
});

test('source observation regression cannot overwrite the newer preserved mortgage period', async () => {
  const old = await collectFinanceData({ now: NOW, fetchImpl: fakeFetch() });
  const url = buildEcosMortgageUrl(NOW);
  const current = await collectFinanceData({ previous: old, now: NOW, fetchImpl: fakeFetch({ [url]: JSON.stringify(ecos([ecosRow('202606', '4.36')])) }) });
  assert.equal(current.series[0].value, 4.48);
  assert.equal(current.series[0].observationDate, '2026-07');
  assert.equal(current.series[0].status, 'stale');
  assert.equal(current.series[0].statusReason, 'source_period_regressed');
});

test('revised same-month actual values replace history and earlier missing dates remain absent', async () => {
  const old = await collectFinanceData({ now: NOW, fetchImpl: fakeFetch() });
  const url = buildEcosMortgageUrl(NOW);
  const current = await collectFinanceData({ previous: old, now: NOW, fetchImpl: fakeFetch({ [url]: JSON.stringify(ecos([ecosRow('202607', '4.49'), ecosRow('202608', '4.50')])) }) });
  assert.deepEqual(current.series[0].history, [{ date: '2026-06', value: 4.36 }, { date: '2026-07', value: 4.49 }, { date: '2026-08', value: 4.5 }]);
  assert.equal(current.series[0].publishedAt, null);
});

test('successful HTTP refresh does not make obsolete monthly observations current', async () => {
  const now = '2026-11-10T00:00:00Z';
  const snapshot = await collectFinanceData({ now, fetchImpl: fakeFetch() });
  assert.equal(snapshot.series[0].status, 'stale');
  assert.equal(snapshot.series[2].status, 'stale');
  assert.equal(snapshot.series[1].status, 'ok');
});

test('cancellation propagates during optional metadata lookup without producing a replacement snapshot', async () => {
  const controller = new AbortController();
  const fetchImpl = async url => { if (url === BOK_NEWS_URL) controller.abort(); return fakeFetch()(url); };
  await assert.rejects(collectFinanceData({ now: NOW, fetchImpl, signal: controller.signal }), { name: 'AbortError' });
});

test('atomic output write succeeds and cancellation keeps previous bytes with no temporary files', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'homehunt-finance-'));
  const file = path.join(directory, 'finance.json');
  try {
    await writeFile(file, 'existing');
    const controller = new AbortController(); controller.abort();
    await assert.rejects(writeFinanceSnapshot({ status: 'failed' }, file, { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(await readFile(file, 'utf8'), 'existing');
    await writeFinanceSnapshot({ status: 'ok' }, file);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { status: 'ok' });
    assert.deepEqual(await readdir(directory), ['finance.json']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
