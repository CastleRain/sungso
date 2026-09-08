import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeOfficialParkingEvidence } from '../js/parking-evidence-core.mjs';

// Official Swagger embedded in the two data.go.kr service pages, checked
// 2026-09-08. The August 2026 gateway uses List4 and BasisInfoV5 (JSON).
export const KAPT_ENDPOINTS = Object.freeze({
  list: 'https://apis.data.go.kr/1613000/AptListService4/getSigunguAptList4',
  basic: 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5',
  detail: 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusDtlInfoV5',
});
export const KAPT_SOURCE = Object.freeze({
  name: '국토교통부 K-apt 공동주택 기본·상세 정보',
  url: 'https://www.data.go.kr/data/15058453/openapi.do',
  listUrl: 'https://www.data.go.kr/data/15057332/openapi.do',
});
const DAY_MS = 86_400_000;
const CACHE_VERSION = 1;
const LIST_FIELDS = ['kaptCode', 'kaptName', 'bjdCode', 'as1', 'as2', 'as3', 'as4'];
const BASIC_FIELDS = ['kaptCode', 'kaptName', 'kaptAddr', 'doroJuso', 'bjdCode', 'kaptdaCnt', 'kaptDongCnt', 'codeHeatNm', 'kaptUsedate', 'kaptTopFloor', 'ktownFlrNo', 'kaptBaseFloor', 'kaptdEcntp'];
const DETAIL_FIELDS = ['kaptCode', 'kaptName', 'kaptdPcnt', 'kaptdPcntu', 'kaptdEcnt', 'welfareFacility', 'groundElChargerCnt', 'undergroundElChargerCnt', 'useYn'];
const FIELDS = { list: LIST_FIELDS, basic: BASIC_FIELDS, detail: DETAIL_FIELDS };
const ERROR_MESSAGES = Object.freeze({
  MISSING_CREDENTIAL: '공공데이터 인증키가 연결되지 않았습니다.',
  ACCESS_DENIED: 'K-apt 서비스 활용승인 또는 인증키 권한을 확인해주세요.',
  QUOTA_EXCEEDED: 'K-apt 조회 한도에 도달했습니다.',
  TIMEOUT: 'K-apt 응답 대기시간을 초과했습니다.',
  NETWORK_ERROR: 'K-apt 서버에 연결하지 못했습니다.',
  INVALID_RESPONSE: 'K-apt 응답 형식을 확인하지 못했습니다.',
  UPSTREAM_ERROR: 'K-apt 자료를 조회하지 못했습니다.',
  INCOMPLETE_LIST: 'K-apt 단지 목록 일부를 확인하지 못했습니다.',
  IDENTITY_MISMATCH: 'K-apt 응답의 단지 식별자가 일치하지 않습니다.',
  INVALID_CATALOG: '같은 단지를 확인할 주소와 지역 정보가 부족합니다.',
});

export class KaptProviderError extends Error {
  constructor(code = 'UPSTREAM_ERROR', { part = null, httpStatus = null } = {}) {
    const safeCode = Object.hasOwn(ERROR_MESSAGES, code) ? code : 'UPSTREAM_ERROR';
    super(ERROR_MESSAGES[safeCode]);
    this.name = 'KaptProviderError';
    this.code = safeCode;
    this.part = ['list', 'basic', 'detail'].includes(part) ? part : null;
    this.httpStatus = Number.isInteger(httpStatus) ? httpStatus : null;
  }
  toJSON() { return { code: this.code, part: this.part, message: this.message, httpStatus: this.httpStatus }; }
}

function text(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).normalize('NFKC').trim().slice(0, 1000);
}
function optionalText(value) { return text(value) || null; }
function count(value, { positive = false } = {}) {
  const raw = text(value);
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw)) return null;
  const number = Number(raw.replaceAll(',', ''));
  return Number.isSafeInteger(number) && number >= (positive ? 1 : 0) ? number : null;
}
function code(value) { const raw = text(value); return /^[A-Za-z0-9]{4,30}$/.test(raw) ? raw : ''; }
function region(value) { const raw = text(value); return /^(?:11|41)\d{3}$/.test(raw) ? raw : ''; }
function bjd(value) { const raw = text(value); return /^\d{10}$/.test(raw) ? raw : ''; }
function whitelist(row, part) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new KaptProviderError('INVALID_RESPONSE', { part });
  const output = Object.fromEntries(FIELDS[part].map(key => [key, optionalText(row[key])]));
  if (!code(output.kaptCode)) throw new KaptProviderError('INVALID_RESPONSE', { part });
  return output;
}
function decodeXml(value) {
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
    const value = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
  }).replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&').trim();
}
function xmlField(xml, key) { return decodeXml(new RegExp(`<${key}(?:\\s[^>]*)?>([\\s\\S]*?)</${key}>`, 'i').exec(xml)?.[1] || ''); }
function errorForStatus(status, resultCode, resultMessage, part) {
  const raw = `${resultCode} ${resultMessage}`.toUpperCase();
  if (status === 401 || status === 403 || /(?:SERVICE_KEY|ACCESS_DENIED|PERMISSION_DENIED|EXPIRED)/.test(raw)
    || /^(?:20|30|31)$/.test(resultCode)) return new KaptProviderError('ACCESS_DENIED', { part, httpStatus: status });
  if (status === 429 || /LIMITED_NUMBER|QUOTA/.test(raw) || ['22', '23'].includes(resultCode)) return new KaptProviderError('QUOTA_EXCEEDED', { part, httpStatus: status });
  return new KaptProviderError('UPSTREAM_ERROR', { part, httpStatus: status });
}

/** Only allowlisted public fields leave this parser, including in disk caches.
 * XML remains supported for legacy gateway error envelopes. No external XML
 * entity expansion, response body, upstream message, or credential is returned.
 */
export function parseKaptResponse(raw, { part, httpStatus = 200 } = {}) {
  if (!Object.hasOwn(FIELDS, part)) throw new KaptProviderError('INVALID_RESPONSE');
  let envelope;
  const source = typeof raw === 'string' ? raw.trim() : '';
  try {
    if (source.startsWith('<')) {
      if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error();
      const resultCode = xmlField(source, 'resultCode') || xmlField(source, 'returnReasonCode');
      const resultMessage = xmlField(source, 'resultMsg') || xmlField(source, 'returnAuthMsg');
      const items = [...source.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(match => Object.fromEntries(FIELDS[part].map(key => [key, xmlField(match[1], key)])));
      envelope = { header: { resultCode, resultMsg: resultMessage }, body: { items, totalCount: xmlField(source, 'totalCount'), pageNo: xmlField(source, 'pageNo') } };
    } else envelope = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { throw new KaptProviderError(httpStatus >= 400 ? errorForStatus(httpStatus, '', '', part).code : 'INVALID_RESPONSE', { part, httpStatus }); }
  envelope = envelope?.response || envelope;
  if (!envelope || typeof envelope !== 'object') throw new KaptProviderError('INVALID_RESPONSE', { part });
  const resultCode = text(envelope.header?.resultCode ?? envelope.cmmMsgHeader?.returnReasonCode);
  if (httpStatus >= 400 || !['00', '0000', '0'].includes(resultCode)) {
    throw errorForStatus(httpStatus, resultCode, text(envelope.header?.resultMsg ?? envelope.cmmMsgHeader?.returnAuthMsg), part);
  }
  const body = envelope.body;
  if (!body || typeof body !== 'object') throw new KaptProviderError('INVALID_RESPONSE', { part });
  let rows = body.item ?? body.items?.item ?? body.items;
  if (rows === undefined || rows === null || rows === '') rows = [];
  if (!Array.isArray(rows)) rows = [rows];
  const items = rows.map(row => whitelist(row, part));
  if (part !== 'list' && items.length !== 1) throw new KaptProviderError('INVALID_RESPONSE', { part });
  return { items, totalCount: count(body.totalCount), pageNo: count(body.pageNo) };
}

export function normalizeKaptName(value) {
  return text(value).toLowerCase().replaceAll('아파트', '').replace(/[\s\p{P}\p{S}]/gu, '');
}
function names(catalog) { return [...new Set([catalog.name, ...(Array.isArray(catalog.aliases) ? catalog.aliases : [])].map(normalizeKaptName).filter(Boolean))]; }
const PHASE_PATTERN = /(\d+(?:\s*[,·ㆍ/&~∼-]\s*\d+)*)\s*(단지|차)/g;
function phaseIdentity(value) {
  const phases = [];
  let malformed = false;
  for (const match of text(value).matchAll(PHASE_PATTERN)) {
    let numbers = match[1].match(/\d+/g).map(Number);
    if (/[~∼-]/.test(match[1])) {
      if (numbers.length !== 2 || numbers[1] <= numbers[0] || numbers[1] - numbers[0] > 20) malformed = true;
      else numbers = Array.from({ length: numbers[1] - numbers[0] + 1 }, (_, index) => numbers[0] + index);
    }
    if (numbers.some(number => !Number.isSafeInteger(number) || number <= 0 || number > 999)) malformed = true;
    for (const number of numbers) phases.push({ number, unit: match[2] });
  }
  const unique = [...new Map(phases.map(phase => [`${phase.unit}:${phase.number}`, phase])).values()];
  unique.sort((a, b) => a.unit.localeCompare(b.unit) || a.number - b.number);
  return { phases: unique, signature: unique.map(phase => `${phase.unit}:${phase.number}`).join('|'), malformed,
    combined: ['단지', '차'].some(unit => unique.filter(phase => phase.unit === unit).length > 1) };
}
function catalogPhaseIdentity(catalog) {
  const primary = phaseIdentity(catalog.name);
  if (primary.signature || primary.malformed) return primary;
  const aliases = (Array.isArray(catalog.aliases) ? catalog.aliases : []).map(phaseIdentity).filter(phase => phase.signature || phase.malformed);
  const unique = new Map(aliases.map(phase => [phase.signature, phase]));
  return unique.size > 1 ? { ...primary, malformed: true } : aliases[0] || primary;
}
function samePhases(catalog, officialName) {
  const expected = catalogPhaseIdentity(catalog), actual = phaseIdentity(officialName);
  // An alias without a phase cannot erase a phase in the canonical catalog
  // name, and a combined registration cannot be assigned to one component.
  if (expected.malformed || actual.malformed || expected.combined || actual.combined) return false;
  if (expected.signature === actual.signature) return true;
  // Some official canonical names end in a bare phase number ("칸타빌1")
  // while their catalog aliases spell out "1단지". Only an EXACT canonical
  // name with the same trailing number may use this alias-supplied phase.
  // Do not broaden name variants, infer phases from arbitrary numbers, or
  // permit a contradictory/multiple alias phase to erase phase safety.
  const canonical = normalizeKaptName(catalog.name);
  const suffix = /([0-9]+)$/.exec(canonical);
  return !phaseIdentity(catalog.name).signature && !actual.signature
    && canonical === normalizeKaptName(officialName) && expected.phases.length === 1
    && Boolean(suffix) && Number(suffix[1]) === expected.phases[0].number;
}
function localNamePrefixes(catalog) {
  const province = text(catalog.regionCode).startsWith('11') ? ['서울', '서울특별시'] : [];
  const locationParts = [...text(catalog.regionName).split(/\s+/), text(catalog.dong)];
  const prefixes = [...province];
  for (const part of locationParts) {
    if (!part || ['경기도', '서울특별시'].includes(part)) continue;
    prefixes.push(part);
    if (/[시구동읍면리]$/.test(part)) prefixes.push(part.slice(0, -1));
  }
  return [...new Set(prefixes.map(normalizeKaptName).filter(value => value.length >= 2))].sort((a, b) => b.length - a.length);
}
function variantKeys(value, catalog) {
  // Remove only explicitly recognized phase tokens; the remaining brand/name
  // must still agree. Do not erase arbitrary numbers, words, or village names.
  let base = normalizeKaptName(text(value).replace(PHASE_PATTERN, ''));
  base = base.replaceAll('주공그린빌', '주공');
  const keys = new Set([base]);
  for (const prefix of localNamePrefixes(catalog)) {
    if (base.startsWith(prefix) && base.length - prefix.length >= 4) keys.add(base.slice(prefix.length));
  }
  return [...keys].filter(key => key.length >= 4);
}
function nameRelationship(catalog, officialName) {
  if (!samePhases(catalog, officialName)) return null;
  if (names(catalog).includes(normalizeKaptName(officialName))) return 'exact';
  const expected = [catalog.name, ...(Array.isArray(catalog.aliases) ? catalog.aliases : [])]
    .flatMap(value => variantKeys(value, catalog));
  const actual = variantKeys(officialName, catalog);
  return expected.some(key => actual.includes(key)) ? 'variant' : null;
}
function relatedCombinedComplex(catalog, row) {
  const expected = catalogPhaseIdentity(catalog), actual = phaseIdentity(row.kaptName);
  if (expected.malformed || expected.combined || !expected.phases.length || actual.malformed || !actual.combined) return null;
  if (!expected.phases.every(phase => actual.phases.some(other => other.unit === phase.unit && other.number === phase.number))) return null;
  const expectedKeys = [catalog.name, ...(Array.isArray(catalog.aliases) ? catalog.aliases : [])].flatMap(value => variantKeys(value, catalog));
  if (!variantKeys(row.kaptName, catalog).some(key => expectedKeys.includes(key))) return null;
  const group = actual.phases.filter(phase => phase.unit === expected.phases[0].unit);
  return { kaptCode: row.kaptCode, name: row.kaptName, scope: 'combined-phases',
    phases: group.map(phase => phase.number), scopeLabel: `${group.map(phase => phase.number).join('·')}${expected.phases[0].unit} 통합 등록`,
    sourceUrl: KAPT_SOURCE.listUrl };
}
function address(value) {
  return text(value).replace(/^서울시\s/, '서울특별시 ').replace(/^경기\s/, '경기도 ').replace(/\s+/g, ' ').trim();
}
function parcel(value) {
  const matches = [...address(value).matchAll(/(?:^|\s)(산\s*)?(\d+)(?:-(\d+))?(?=\s|$)/g)];
  if (matches.length !== 1) return '';
  const [, mountain, main, sub] = matches[0];
  return `${mountain ? '산' : ''}${Number(main)}${sub && Number(sub) ? `-${Number(sub)}` : ''}`;
}
function dongMatches(catalog, row) {
  if (bjd(catalog.bjdCode)) return bjd(catalog.bjdCode) === bjd(row.bjdCode);
  const dong = text(catalog.dong).replace(/\s/g, '');
  return Boolean(dong && [text(row.as3), text(row.as4), `${text(row.as3)}${text(row.as4)}`].some(value => value.replace(/\s/g, '') === dong));
}

/** Names shortlist lookups only. A match additionally requires the same legal
 * area and exact parcel, or exact road address. Numeric phases are preserved.
 */
export function matchKaptComplex(catalog, basic, listRow) {
  if (!region(catalog?.regionCode)) return null;
  const relationship = nameRelationship(catalog, basic?.kaptName);
  const listedRelationship = nameRelationship(catalog, listRow?.kaptName);
  if (!relationship || !listedRelationship) return null;
  const variant = relationship === 'variant' || listedRelationship === 'variant';
  if (variant && (count(catalog.households, { positive: true }) === null
    || count(catalog.households, { positive: true }) !== count(basic.kaptdaCnt, { positive: true }))) return null;
  if (!code(basic?.kaptCode) || code(basic.kaptCode) !== code(listRow?.kaptCode)) return null;
  const basicBjd = bjd(basic.bjdCode);
  const listBjd = bjd(listRow.bjdCode);
  if (!basicBjd || basicBjd !== listBjd || basicBjd.slice(0, 5) !== region(catalog.regionCode) || !dongMatches(catalog, listRow)) return null;
  if (bjd(catalog.bjdCode) && bjd(catalog.bjdCode) !== basicBjd) return null;
  const expectedRoad = address(catalog.roadAddress || catalog.doroJuso);
  if (expectedRoad && expectedRoad === address(basic.doroJuso)) return variant ? 'legal-area-road-address-phase-households-name-variant' : 'legal-area-road-address-name';
  const expectedParcel = parcel(catalog.jibun || catalog.address);
  const actualParcel = parcel(basic.kaptAddr);
  if (expectedParcel && actualParcel && expectedParcel === actualParcel) return variant ? 'legal-area-parcel-phase-households-name-variant' : 'legal-area-parcel-name';
  return null;
}
function approvalDate(value) {
  const match = /^(\d{4})[-.]?(\d{2})[-.]?(\d{2})$/.exec(text(value));
  if (!match) return null;
  const result = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${result}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result ? result : null;
}
function resultShell(catalog) {
  return {
    schemaVersion: 1, provider: 'kapt', status: 'unmatched', catalogId: text(catalog?.catalogId),
    kaptCode: null, complexMatchConfirmed: false, matchMethod: null, observedAt: null,
    matchIssue: null, relatedComplex: null,
    sourceName: KAPT_SOURCE.name, sourceUrl: KAPT_SOURCE.url,
    name: null, address: null, roadAddress: null, households: null, buildingCount: null,
    heatingType: null, elevatorCount: null, passengerElevatorCount: null, highestFloor: null,
    approvalDate: null, welfareFacilities: null, groundEvChargers: null, undergroundEvChargers: null,
    parking: { aboveGroundSpaces: null, belowGroundSpaces: null, totalSpaces: null, spacesPerHousehold: null },
    parkingEvidence: null, errors: [], cache: { hit: false, expiresAt: null },
  };
}
function safeError(error, part) { return error instanceof KaptProviderError ? error.toJSON() : new KaptProviderError('UPSTREAM_ERROR', { part }).toJSON(); }

export function createKaptProvider({
  apiKey, getApiKey = null, cacheDir = null, serverCacheDir = cacheDir, persistentCache = null, fetchImpl = globalThis.fetch,
  now = () => Date.now(), timeoutMs = 15_000, listTtlMs = 7 * DAY_MS,
  detailTtlMs = DAY_MS, pageSize = 1000, maxPages = 20, maxBasicLookups = 5,
  minRequestGapMs = 200, maxConcurrency = 2,
} = {}) {
  if (!Number.isFinite(minRequestGapMs) || minRequestGapMs < 0 || minRequestGapMs > 60_000) throw new RangeError('minRequestGapMs must be from 0 to 60000');
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 2) throw new RangeError('maxConcurrency must be 1 or 2');
  const memory = new Map();
  const inflight = new Map();
  const pendingRequests = [];
  let activeRequests = 0;
  let nextRequestStart = 0;
  let queueTimer = null;
  const stats = { requests: 0, cacheHits: 0 };
  const timestamp = () => { const current = Number(now()); return Number.isFinite(current) ? current : Date.now(); };
  const credential = () => {
    let key = text(typeof getApiKey === 'function' ? getApiKey() : typeof apiKey === 'function' ? apiKey() : apiKey);
    if (!key) throw new KaptProviderError('MISSING_CREDENTIAL');
    try { key = decodeURIComponent(key); } catch { /* A raw key is encoded once by URLSearchParams. */ }
    return key;
  };
  // All list/basic/detail misses share this queue. Use a monotonic clock for
  // pacing; the injectable `now` belongs only to evidence/cache freshness.
  // No timeout runs while queued, and no request slot is occupied by a hit.
  function drainRequests() {
    if (queueTimer) { clearTimeout(queueTimer); queueTimer = null; }
    while (activeRequests < maxConcurrency && pendingRequests.length) {
      const wait = nextRequestStart - performance.now();
      if (wait > 0) {
        queueTimer = setTimeout(drainRequests, Math.ceil(wait));
        return;
      }
      const task = pendingRequests.shift();
      activeRequests += 1;
      nextRequestStart = performance.now() + minRequestGapMs;
      let operation;
      try { operation = task.run(); } catch (error) { operation = Promise.reject(error); }
      Promise.resolve(operation).then(task.resolve, task.reject).finally(() => {
        activeRequests -= 1;
        drainRequests();
      });
    }
  }
  function scheduleRequest(run) {
    return new Promise((resolve, reject) => {
      pendingRequests.push({ run, resolve, reject });
      drainRequests();
    });
  }
  async function performRequest(part, params) {
    const url = new URL(KAPT_ENDPOINTS[part]);
    url.searchParams.set('serviceKey', credential());
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const controller = new AbortController();
    let timer;
    try {
      const operation = (async () => {
        stats.requests += 1;
        const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
        const body = await response.text();
        if (body.length > 5_000_000) throw new KaptProviderError('INVALID_RESPONSE', { part });
        return parseKaptResponse(body, { part, httpStatus: response.status });
      })();
      return await Promise.race([operation, new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new KaptProviderError('TIMEOUT', { part })); }, timeoutMs);
      })]);
    } catch (error) {
      if (error instanceof KaptProviderError) throw error;
      throw new KaptProviderError(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR', { part });
    } finally { clearTimeout(timer); }
  }
  const request = (part, params) => scheduleRequest(() => performRequest(part, params));
  function cacheValid(entry, key) {
    return entry?.schemaVersion === CACHE_VERSION && entry.key === key && Number.isFinite(entry.fetchedAt)
      && entry.fetchedAt <= timestamp() && Number.isFinite(entry.expiresAt) && entry.expiresAt > timestamp()
      && entry.expiresAt <= entry.fetchedAt + (key.startsWith('list-') ? listTtlMs : detailTtlMs) && Array.isArray(entry.items);
  }
  function normalizeCacheEntry(entry, key, part, identity) {
    if (!cacheValid(entry, key)) return null;
    try {
      const items = entry.items.map(row => whitelist(row, part));
      if (part !== 'list' && (items.length !== 1 || items[0].kaptCode !== identity)) return null;
      if (part === 'list' && (items.some(row => bjd(row.bjdCode).slice(0, 5) !== identity)
        || new Set(items.map(row => row.kaptCode)).size !== items.length)) return null;
      return { schemaVersion: CACHE_VERSION, key, fetchedAt: entry.fetchedAt, expiresAt: entry.expiresAt, items };
    } catch { return null; }
  }
  async function cached(part, identity, loader) {
    const key = `${part}-${identity}`;
    if (!/^(?:list-(?:11|41)\d{3}|(?:basic|detail)-[A-Za-z0-9]{4,30})$/.test(key)) throw new KaptProviderError('INVALID_CATALOG', { part });
    if (inflight.has(key)) return inflight.get(key);
    const task = (async () => {
      let entry = memory.get(key);
      // Cloud and local runtimes share the exact same allowlist, identity and
      // TTL checks. The adapter stores public source rows, never caller data.
      if (persistentCache && !normalizeCacheEntry(entry, key, part, identity)) {
        const result = await persistentCache.getOrLoad({ key,
          validate: value => normalizeCacheEntry(value, key, part, identity),
          load: async () => {
            const items = await loader(), fetchedAt = timestamp();
            return { schemaVersion: CACHE_VERSION, key, fetchedAt,
              expiresAt: fetchedAt + (part === 'list' ? listTtlMs : detailTtlMs), items };
          } });
        entry = normalizeCacheEntry(result?.entry, key, part, identity);
        if (!entry) throw new KaptProviderError('INVALID_RESPONSE', { part });
        memory.set(key, entry);
        if (result.hit) stats.cacheHits += 1;
        return { items: entry.items, fetchedAt: entry.fetchedAt, expiresAt: entry.expiresAt, hit: Boolean(result.hit) };
      }
      if (!cacheValid(entry, key) && serverCacheDir) {
        try { entry = JSON.parse(await readFile(join(serverCacheDir, `${key}.json`), 'utf8')); } catch { entry = null; }
      }
      if (cacheValid(entry, key)) {
        try {
          const items = entry.items.map(row => whitelist(row, part));
          if (part !== 'list' && (items.length !== 1 || items[0].kaptCode !== identity)) throw new Error();
          if (part === 'list' && items.some(row => bjd(row.bjdCode).slice(0, 5) !== identity)) throw new Error();
          stats.cacheHits += 1;
          memory.set(key, { ...entry, items });
          return { items, fetchedAt: entry.fetchedAt, expiresAt: entry.expiresAt, hit: true };
        } catch { /* Invalid or unrelated cache entries cannot become evidence. */ }
      }
      const items = await loader();
      const fetchedAt = timestamp();
      entry = { schemaVersion: CACHE_VERSION, key, fetchedAt, expiresAt: fetchedAt + (part === 'list' ? listTtlMs : detailTtlMs), items };
      memory.set(key, entry);
      if (serverCacheDir) {
        const temp = join(serverCacheDir, `${key}.${randomUUID()}.tmp`);
        try {
          await mkdir(serverCacheDir, { recursive: true });
          await writeFile(temp, JSON.stringify(entry), { mode: 0o600 });
          await rename(temp, join(serverCacheDir, `${key}.json`));
        } catch { try { await unlink(temp); } catch { /* Disk caching is optional. */ } }
      }
      return { items, fetchedAt, expiresAt: entry.expiresAt, hit: false };
    })();
    inflight.set(key, task);
    try { return await task; } finally { if (inflight.get(key) === task) inflight.delete(key); }
  }
  async function getDistrictList(regionCode) {
    const regionId = region(regionCode);
    if (!regionId) throw new KaptProviderError('INVALID_CATALOG', { part: 'list' });
    return cached('list', regionId, async () => {
      const rows = new Map();
      let expectedTotal = null;
      for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
        const page = await request('list', { sigunguCode: regionId, pageNo, numOfRows: pageSize });
        if (page.pageNo !== null && page.pageNo !== pageNo) throw new KaptProviderError('INCOMPLETE_LIST', { part: 'list' });
        if (page.totalCount === null || expectedTotal !== null && page.totalCount !== expectedTotal) throw new KaptProviderError('INCOMPLETE_LIST', { part: 'list' });
        expectedTotal = page.totalCount;
        for (const row of page.items) {
          if (bjd(row.bjdCode).slice(0, 5) !== regionId || rows.has(row.kaptCode)) throw new KaptProviderError('INCOMPLETE_LIST', { part: 'list' });
          rows.set(row.kaptCode, row);
        }
        if (rows.size === expectedTotal) return [...rows.values()];
        if (!page.items.length || rows.size > expectedTotal) throw new KaptProviderError('INCOMPLETE_LIST', { part: 'list' });
      }
      throw new KaptProviderError('INCOMPLETE_LIST', { part: 'list' });
    });
  }
  const getPart = (part, kaptCode) => cached(part, kaptCode, async () => {
    const parsed = await request(part, { kaptCode });
    if (parsed.items[0].kaptCode !== kaptCode) throw new KaptProviderError('IDENTITY_MISMATCH', { part });
    return parsed.items;
  });
  async function getComplexInfo(catalog) {
    const output = resultShell(catalog);
    if (!catalog || !region(catalog.regionCode) || !names(catalog).length || !text(catalog.dong) && !bjd(catalog.bjdCode)) {
      return { ...output, status: 'unavailable', errors: [new KaptProviderError('INVALID_CATALOG').toJSON()] };
    }
    let list;
    try { list = await getDistrictList(catalog.regionCode); }
    catch (error) { return { ...output, status: 'unavailable', errors: [safeError(error, 'list')] }; }
    // A negative or ambiguous identity check is a completed public-data result,
    // too. Its lifetime is bounded by every row used to reach that conclusion.
    const dependencies = [list];
    const resultCache = () => ({ hit: dependencies.every(part => part.hit),
      expiresAt: new Date(Math.min(...dependencies.map(part => part.expiresAt))).toISOString() });
    const inDong = list.items.filter(row => dongMatches(catalog, row));
    const related = inDong.map(row => relatedCombinedComplex(catalog, row)).filter(Boolean);
    const possible = inDong.filter(row => nameRelationship(catalog, row.kaptName));
    if (!possible.length) return { ...output,
      matchIssue: related.length ? 'combined-complex' : 'name-mismatch', relatedComplex: related.length === 1 ? related[0] : null,
      cache: resultCache() };
    if (possible.length > maxBasicLookups) return { ...output, status: 'ambiguous', cache: resultCache() };
    const matches = [];
    const failures = [];
    const mismatchIssues = [];
    for (const row of possible) {
      try {
        const basic = await getPart('basic', row.kaptCode);
        dependencies.push(basic);
        const method = matchKaptComplex(catalog, basic.items[0], row);
        if (method) matches.push({ row, basic, method });
        else {
          const info = basic.items[0];
          const relationship = nameRelationship(catalog, info.kaptName);
          const listedRelationship = nameRelationship(catalog, row.kaptName);
          const variant = relationship === 'variant' || listedRelationship === 'variant';
          const expectedHouseholds = count(catalog.households, { positive: true });
          const actualHouseholds = count(info.kaptdaCnt, { positive: true });
          mismatchIssues.push(!relationship ? 'name-mismatch' : variant && (expectedHouseholds === null || actualHouseholds === null) ? 'insufficient-identity'
            : variant && expectedHouseholds !== actualHouseholds ? 'household-mismatch' : 'address-mismatch');
        }
      } catch (error) { failures.push(safeError(error, 'basic')); }
    }
    if (matches.length > 1) return { ...output, status: 'ambiguous', errors: failures,
      ...(failures.length ? {} : { cache: resultCache() }) };
    if (failures.length) return { ...output, status: 'unavailable', errors: failures };
    if (!matches.length) return { ...output, matchIssue: related.length ? 'combined-complex' : mismatchIssues[0] || 'insufficient-identity',
      relatedComplex: related.length === 1 ? related[0] : null, cache: resultCache() };
    const { row, basic, method } = matches[0];
    const info = basic.items[0];
    let detail = null;
    try { detail = await getPart('detail', row.kaptCode); }
    catch (error) { failures.push(safeError(error, 'detail')); }
    if (detail) dependencies.push(detail);
    const facts = detail?.items[0];
    const active = facts && text(facts.useYn).toUpperCase() === 'Y';
    const above = active ? count(facts.kaptdPcnt) : null;
    const below = active ? count(facts.kaptdPcntu) : null;
    const households = count(info.kaptdaCnt, { positive: true });
    const totalSpaces = above !== null && below !== null ? above + below : null;
    const observedAt = new Date(Math.min(basic.fetchedAt, detail?.fetchedAt ?? basic.fetchedAt)).toISOString();
    const parkingEvidence = normalizeOfficialParkingEvidence({
      complexId: row.kaptCode, householdComplexId: info.kaptCode, active: Boolean(active),
      aboveGroundSpaces: above, belowGroundSpaces: below, households, observedAt,
      sourceName: KAPT_SOURCE.name, sourceUrl: KAPT_SOURCE.url,
    }, { expectedComplexId: row.kaptCode });
    return {
      ...output, status: !facts || !active || totalSpaces === null || households === null ? 'partial' : 'matched',
      kaptCode: row.kaptCode, complexMatchConfirmed: true, matchMethod: method, observedAt,
      name: info.kaptName, address: info.kaptAddr, roadAddress: info.doroJuso, households,
      buildingCount: count(info.kaptDongCnt), heatingType: optionalText(info.codeHeatNm),
      elevatorCount: active ? count(facts.kaptdEcnt) : null, passengerElevatorCount: count(info.kaptdEcntp),
      highestFloor: count(info.kaptTopFloor, { positive: true }), approvalDate: approvalDate(info.kaptUsedate),
      welfareFacilities: active ? optionalText(facts.welfareFacility) : null,
      groundEvChargers: active ? count(facts.groundElChargerCnt) : null,
      undergroundEvChargers: active ? count(facts.undergroundElChargerCnt) : null,
      parking: { aboveGroundSpaces: above, belowGroundSpaces: below, totalSpaces, spacesPerHousehold: totalSpaces !== null && households !== null ? totalSpaces / households : null },
      parkingEvidence, errors: failures,
      cache: { ...resultCache(), hit: !failures.length && dependencies.every(part => part.hit) },
    };
  }
  return { getComplexInfo, getDistrictList, getStats: () => ({ ...stats,
    activeRequests, queuedRequests: pendingRequests.length, maxConcurrency, minRequestGapMs,
  }) };
}
