const crypto = require('crypto');
const zlib = require('zlib');

const ENDPOINTS = {
  sale: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade',
  rent: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
};

const MONTH_CACHE_SCHEMA_VERSION = 2;
const APARTMENT_CACHE_SCHEMA_VERSION = 3;
const APARTMENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RECENT_MONTH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const HISTORICAL_MONTH_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MONTH_PAGE_SIZE = 1000;
const MONTH_CACHE_INLINE_LIMIT = 700 * 1024;
const MONTH_CACHE_CHUNK_SIZE = 600 * 1024;
const MAX_MONTH_CACHE_CHUNKS = 450;
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const MIN_HISTORY_MONTH_INDEX = 2006 * 12;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeXml(value) {
  return String(value || '')
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function tagValue(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${escapeRegex(name)}>([\\s\\S]*?)<\\/${escapeRegex(name)}>`));
    if (match) return decodeXml(match[1]);
  }
  return '';
}

function numberValue(value) {
  const parsed = Number(String(value || '').replace(/[\s,]/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactMonth(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}${String(month).padStart(2, '0')}`;
}

function monthValue(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthIndex(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return Number.NaN;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return Number.NaN;
  return Number(match[1]) * 12 + month - 1;
}

function seoulCurrentMonth(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid current date');
  const seoul = new Date(date.getTime() + SEOUL_OFFSET_MS);
  return monthValue(seoul.getUTCFullYear() * 12 + seoul.getUTCMonth());
}

function resolveHistoryRange({ months = 36, endMonth = '', includeCurrentMonth = true, now = new Date() } = {}) {
  const requestedMonths = Math.max(1, Math.min(Math.trunc(Number(months) || 36), 60));
  const currentIndex = monthIndex(seoulCurrentMonth(now));
  const requestedEndIndex = endMonth
    ? monthIndex(endMonth)
    : currentIndex - (includeCurrentMonth ? 0 : 1);
  const requestedStartIndex = requestedEndIndex - requestedMonths + 1;
  if (!Number.isInteger(requestedEndIndex)
      || requestedEndIndex > currentIndex
      || requestedStartIndex < MIN_HISTORY_MONTH_INDEX) {
    throw new Error('Invalid endMonth');
  }
  const rangeEnd = monthValue(requestedEndIndex);
  return {
    months: requestedMonths,
    endMonth: rangeEnd,
    rangeStart: monthValue(requestedStartIndex),
    rangeEnd,
    includesCurrentMonth: requestedEndIndex === currentIndex,
    endIndex: requestedEndIndex,
  };
}

function normalizeAptName(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/아파트/g, '').replace(/[\s()[\]{}ㆍ·.,_-]/g, '');
}

function normalizeDong(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function normalizeServiceKey(value) {
  const key = String(value || '').trim();
  if (!key) return '';
  try { return decodeURIComponent(key); }
  catch (_) { return key; }
}

function canonicalJson(value) {
  function normalize(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') return Number.isFinite(item) ? item : null;
    if (item instanceof Date) return item.toISOString();
    if (Array.isArray(item)) return item.map((entry) => entry === undefined ? null : normalize(entry));
    if (item && typeof item === 'object') {
      return Object.keys(item).sort().reduce((result, key) => {
        if (item[key] !== undefined) result[key] = normalize(item[key]);
        return result;
      }, {});
    }
    return null;
  }
  return JSON.stringify(normalize(value));
}

function cacheSignature(serviceKey, namespace, payload) {
  return crypto.createHmac('sha256', serviceKey)
    .update(`${namespace}\n${canonicalJson(payload)}`)
    .digest('hex');
}

function signatureMatches(expected, actual) {
  if (!expected || !actual) return false;
  const left = Buffer.from(String(expected));
  const right = Buffer.from(String(actual));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseResponse(xml, type, lawdCd, pageNo = 1) {
  const gatewayCode = tagValue(xml, ['returnReasonCode']);
  const gatewayMessage = tagValue(xml, ['returnAuthMsg', 'errMsg']);
  if (gatewayCode || gatewayMessage) {
    throw new Error(`MOLIT GATEWAY ${gatewayCode || 'ERROR'}: ${gatewayMessage || '공공데이터포털 오류'}`);
  }
  const resultCode = tagValue(xml, ['resultCode']);
  const resultMessage = tagValue(xml, ['resultMsg']);
  if (!resultCode) throw new Error('MOLIT response format is invalid');
  if (resultCode && !['000', '00'].includes(resultCode)) throw new Error(`MOLIT ${resultCode}: ${resultMessage}`);

  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match, index) => {
    const block = match[1];
    const monthlyRent = numberValue(tagValue(block, ['monthlyRent', '월세금액']));
    const dealType = type === 'sale' ? '매매' : monthlyRent > 0 ? '월세' : '전세';
    const year = tagValue(block, ['dealYear', '년']);
    const month = String(tagValue(block, ['dealMonth', '월'])).padStart(2, '0');
    const day = numberValue(tagValue(block, ['dealDay', '일']));
    const areaM2 = numberValue(tagValue(block, ['excluUseAr', '전용면적']));
    const amountManWon = type === 'sale'
      ? numberValue(tagValue(block, ['dealAmount', '거래금액']))
      : numberValue(tagValue(block, ['deposit', '보증금액']));
    const canceled = ['cdealDay', '해제사유발생일', 'cdealType']
      .some((name) => Boolean(tagValue(block, [name])));
    if (!year || !month || !areaM2 || !amountManWon || canceled) return null;

    const apartmentName = tagValue(block, ['aptNm', '아파트']);
    const aptSeq = tagValue(block, ['aptSeq', '단지일련번호']);
    const dong = tagValue(block, ['umdNm', '법정동']);
    const floor = numberValue(tagValue(block, ['floor', '층']));
    const builtYear = numberValue(tagValue(block, ['buildYear', '건축년도']));
    const roadName = tagValue(block, ['roadNm', '도로명']);
    const jibun = tagValue(block, ['jibun', '지번']);
    const transactionSerial = tagValue(block, ['dealAmountSn', '거래일련번호']);
    const fallbackId = crypto.createHash('sha256').update(canonicalJson({
      type, lawdCd, year, month, day, apartmentName, aptSeq, dong, areaM2,
      amountManWon, monthlyRent, floor, builtYear, roadName, jibun, pageNo, index,
    })).digest('hex').slice(0, 28);

    return {
      id: transactionSerial ? `${type}-${transactionSerial}` : `${type}-${fallbackId}`,
      aptSeq,
      dealType,
      regionCode: tagValue(block, ['sggCd', '지역코드']) || lawdCd,
      regionName: '',
      dong,
      apartmentName,
      month: `${year}-${month}`,
      day,
      areaM2,
      sizeBand: areaM2 < 40 ? 'lt40' : areaM2 < 60 ? '40_60' : areaM2 < 85 ? '60_85' : areaM2 < 102 ? '85_102' : 'gte102',
      amountManWon,
      depositManWon: type === 'rent' ? amountManWon : 0,
      monthlyRentManWon: monthlyRent,
      priceP33: amountManWon * 3.3 / areaM2,
      floor,
      builtYear,
      roadName,
      jibun,
    };
  }).filter(Boolean);
}

async function fetchPage(serviceKey, lawdCd, dealYmd, type, pageNo, beforeRequest) {
  if (typeof beforeRequest === 'function') await beforeRequest();
  const url = new URL(ENDPOINTS[type]);
  url.searchParams.set('serviceKey', serviceKey);
  url.searchParams.set('LAWD_CD', lawdCd);
  url.searchParams.set('DEAL_YMD', dealYmd);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(MONTH_PAGE_SIZE));
  const response = await fetch(url, {
    headers: { Accept: 'application/xml' },
    signal: AbortSignal.timeout(28000),
  });
  if (!response.ok) throw new Error(`MOLIT HTTP ${response.status}`);
  const xml = await response.text();
  const records = parseResponse(xml, type, lawdCd, pageNo);
  return {
    records,
    totalCount: numberValue(tagValue(xml, ['totalCount'])),
    numOfRows: numberValue(tagValue(xml, ['numOfRows'])) || MONTH_PAGE_SIZE,
  };
}

async function fetchMonthFromMolit(serviceKey, lawdCd, dealYmd, type, beforeRequest) {
  const first = await fetchPage(serviceKey, lawdCd, dealYmd, type, 1, beforeRequest);
  const totalPages = Math.max(1, Math.ceil(first.totalCount / first.numOfRows));
  if (totalPages > 200) throw new Error('MOLIT pagination exceeded the safety limit');

  const pages = [first];
  for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
    pages.push(await fetchPage(serviceKey, lawdCd, dealYmd, type, pageNo, beforeRequest));
  }

  const records = pages.flatMap((page) => page.records);
  return { records, totalCount: first.totalCount || records.length };
}

function monthCachePayload({ lawdCd, dealYmd, type, records, totalCount, fetchedAt }) {
  return {
    schemaVersion: MONTH_CACHE_SCHEMA_VERSION,
    lawdCd,
    dealYmd,
    type,
    records,
    totalCount,
    fetchedAt,
  };
}

function monthCacheTtl(dealYmd, now = new Date()) {
  const match = String(dealYmd).match(/^(\d{4})(\d{2})$/);
  if (!match) return RECENT_MONTH_CACHE_TTL_MS;
  const requestedIndex = Number(match[1]) * 12 + Number(match[2]) - 1;
  const currentIndex = monthIndex(seoulCurrentMonth(now));
  return currentIndex - requestedIndex <= 3
    ? RECENT_MONTH_CACHE_TTL_MS
    : HISTORICAL_MONTH_CACHE_TTL_MS;
}

function encodeRecords(records) {
  return zlib.gzipSync(Buffer.from(JSON.stringify(records), 'utf8')).toString('base64');
}

function decodeRecords(encoded) {
  return JSON.parse(zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
}

async function readMonthCache(ref, serviceKey, identity) {
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (data.schemaVersion !== MONTH_CACHE_SCHEMA_VERSION
      || data.lawdCd !== identity.lawdCd
      || data.dealYmd !== identity.dealYmd
      || data.type !== identity.type
      || !/^\d{4}-\d{2}-\d{2}T/.test(String(data.fetchedAt || ''))) return null;

  const chunkCount = Number(data.chunkCount || 0);
  if (!Number.isInteger(chunkCount) || chunkCount < 0 || chunkCount > MAX_MONTH_CACHE_CHUNKS) return null;
  let encoded = String(data.recordsGzipBase64 || '');
  if (chunkCount > 0) {
    const chunkSnaps = await Promise.all(Array.from({ length: chunkCount }, (_, index) => (
      ref.collection('chunks').doc(String(index).padStart(4, '0')).get()
    )));
    if (chunkSnaps.some((chunk) => !chunk.exists)) return null;
    encoded = chunkSnaps.map((chunk) => String(chunk.data()?.data || '')).join('');
  }
  if (!encoded) return null;

  let records;
  try { records = decodeRecords(encoded); }
  catch (_) { return null; }
  if (!Array.isArray(records) || records.length !== Number(data.recordCount || 0)) return null;

  const payload = monthCachePayload({
    lawdCd: data.lawdCd,
    dealYmd: data.dealYmd,
    type: data.type,
    records,
    totalCount: Number(data.totalCount || 0),
    fetchedAt: data.fetchedAt,
  });
  const expected = cacheSignature(serviceKey, 'homehunt-month-cache-v2', payload);
  if (!signatureMatches(expected, data.signature)) return null;
  const fetchedAtMs = Date.parse(data.fetchedAt);
  if (!Number.isFinite(fetchedAtMs)) return null;
  return { ...payload, fetchedAtMs, chunkCount };
}

async function writeMonthCache(db, ref, serviceKey, identity, result) {
  const fetchedAt = new Date().toISOString();
  const payload = monthCachePayload({ ...identity, ...result, fetchedAt });
  const signature = cacheSignature(serviceKey, 'homehunt-month-cache-v2', payload);
  const encoded = encodeRecords(result.records);
  const common = {
    schemaVersion: MONTH_CACHE_SCHEMA_VERSION,
    ...identity,
    totalCount: result.totalCount,
    recordCount: result.records.length,
    fetchedAt,
    updatedAt: new Date(),
    encoding: 'gzip+base64+json',
    signature,
  };

  if (Buffer.byteLength(encoded, 'utf8') <= MONTH_CACHE_INLINE_LIMIT) {
    await ref.set({ ...common, chunkCount: 0, recordsGzipBase64: encoded });
    return;
  }

  const chunks = [];
  for (let offset = 0; offset < encoded.length; offset += MONTH_CACHE_CHUNK_SIZE) {
    chunks.push(encoded.slice(offset, offset + MONTH_CACHE_CHUNK_SIZE));
  }
  if (chunks.length > MAX_MONTH_CACHE_CHUNKS) throw new Error('MOLIT month cache is too large');
  const batch = db.batch();
  chunks.forEach((data, index) => {
    batch.set(ref.collection('chunks').doc(String(index).padStart(4, '0')), { index, data });
  });
  batch.set(ref, { ...common, chunkCount: chunks.length, recordsGzipBase64: '' });
  await batch.commit();
}

async function loadMonth({ db, serviceKey, lawdCd, dealYmd, type }) {
  const identity = { lawdCd, dealYmd, type };
  const cacheId = `${lawdCd}_${dealYmd}_${type}`;
  const ref = db.collection('homehunt_molit_month_cache').doc(cacheId);
  let cached = null;
  try { cached = await readMonthCache(ref, serviceKey, identity); }
  catch (error) { console.warn('MOLIT month cache read failed:', cacheId, error.message); }

  const ttl = monthCacheTtl(dealYmd);
  if (cached && Date.now() - cached.fetchedAtMs < ttl) {
    return { records: cached.records, totalCount: cached.totalCount, source: 'cache', warning: null };
  }

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const upstream = await fetchMonthFromMolit(serviceKey, lawdCd, dealYmd, type);
      try { await writeMonthCache(db, ref, serviceKey, identity, upstream); }
      catch (cacheError) { console.warn('MOLIT month cache write failed:', cacheId, cacheError.message); }
      return { ...upstream, source: 'upstream', warning: null };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }

  if (cached) {
    return {
      records: cached.records,
      totalCount: cached.totalCount,
      source: 'stale-cache',
      warning: {
        dealYmd,
        type,
        staleCacheUsed: true,
        reason: 'MOLIT upstream unavailable; signed stale monthly cache used',
      },
    };
  }
  throw lastError || new Error('MOLIT upstream unavailable');
}

async function runPoolSettled(tasks, concurrency = 6) {
  const results = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++;
      try { results[index] = { status: 'fulfilled', value: await tasks[index].run() }; }
      catch (error) { results[index] = { status: 'rejected', reason: error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

function allowedOrigin(origin) {
  if (!origin) return null;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
  if (origin === 'https://castlerain.github.io') return origin;
  return null;
}

async function checkRateLimit(db, req) {
  const day = new Date().toISOString().slice(0, 10);
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = req.ip || forwarded || 'unknown';
  const hash = crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 24);
  const limits = db.collection('homehunt_api_limits');
  const ipRef = limits.doc(`${day}_ip_${hash}`);
  const globalRef = limits.doc(`${day}_global`);
  return db.runTransaction(async (transaction) => {
    const ipSnap = await transaction.get(ipRef);
    const globalSnap = await transaction.get(globalRef);
    const ipCount = Number(ipSnap.data()?.count || 0);
    const globalCount = Number(globalSnap.data()?.count || 0);
    if (ipCount >= 20) return { allowed: false, scope: 'ip' };
    if (globalCount >= 60) return { allowed: false, scope: 'global' };
    const updatedAt = new Date();
    transaction.set(ipRef, { count: ipCount + 1, day, kind: 'ip', updatedAt }, { merge: true });
    transaction.set(globalRef, { count: globalCount + 1, day, kind: 'global', updatedAt }, { merge: true });
    return { allowed: true };
  });
}

function complexKey(record) {
  // The rent endpoint can omit aptSeq even when the sale endpoint includes it.
  // Group by the stable human identity so one complex does not split by deal type.
  return `identity:${canonicalJson({
    name: normalizeAptName(record.apartmentName),
    dong: normalizeDong(record.dong),
    builtYear: Number(record.builtYear || 0),
  })}`;
}

function candidateFor(records) {
  const representative = records[records.length - 1] || {};
  const identified = [...records].reverse().find((record) => String(record.aptSeq || '').trim()) || representative;
  return {
    aptSeq: String(identified.aptSeq || ''),
    name: String(representative.apartmentName || ''),
    dong: String(representative.dong || ''),
    builtYear: Number(representative.builtYear || 0),
  };
}

function compareRecords(left, right) {
  return String(left.month).localeCompare(String(right.month))
    || Number(left.day) - Number(right.day)
    || Number(left.areaM2) - Number(right.areaM2)
    || Number(left.floor) - Number(right.floor)
    || String(left.id).localeCompare(String(right.id));
}

function selectComplex(records, normalizedTarget, aptSeqQuery, dongQuery) {
  const eligible = records.filter((record) => {
    if (aptSeqQuery && record.aptSeq && String(record.aptSeq) !== aptSeqQuery) return false;
    if (dongQuery && normalizeDong(record.dong) !== dongQuery) return false;
    return true;
  });
  const groups = new Map();
  eligible.forEach((record) => {
    const key = complexKey(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  let matches = [...groups.values()].filter((group) => group.some((record) => {
    const name = normalizeAptName(record.apartmentName);
    return name.includes(normalizedTarget) || normalizedTarget.includes(name);
  }));
  const exact = matches.filter((group) => group.some((record) => normalizeAptName(record.apartmentName) === normalizedTarget));
  if (exact.length) matches = exact;
  matches.forEach((group) => group.sort(compareRecords));
  matches.sort((left, right) => {
    const a = candidateFor(left);
    const b = candidateFor(right);
    return a.name.localeCompare(b.name, 'ko') || a.dong.localeCompare(b.dong, 'ko') || a.aptSeq.localeCompare(b.aptSeq);
  });

  if (matches.length > 1) return { ambiguous: true, candidates: matches.map(candidateFor) };
  if (!matches.length) return { ambiguous: false, candidate: null, records: [] };
  return { ambiguous: false, candidate: candidateFor(matches[0]), records: matches[0] };
}

function apartmentCachePayload(data) {
  return {
    schemaVersion: APARTMENT_CACHE_SCHEMA_VERSION,
    lawdCd: data.lawdCd,
    normalizedQuery: data.normalizedQuery,
    months: data.months,
    endMonth: data.endMonth,
    rangeStart: data.rangeStart,
    rangeEnd: data.rangeEnd,
    includesCurrentMonth: data.includesCurrentMonth,
    aptSeqQuery: data.aptSeqQuery,
    dongQuery: data.dongQuery,
    aptName: data.aptName,
    selectedAptSeq: data.selectedAptSeq,
    selectedDong: data.selectedDong,
    builtYear: data.builtYear,
    records: data.records,
    fetchedAt: data.fetchedAt,
  };
}

function readApartmentCache(snap, serviceKey, criteria) {
  if (!snap?.exists) return null;
  const data = snap.data() || {};
  if (data.schemaVersion !== APARTMENT_CACHE_SCHEMA_VERSION
      || data.lawdCd !== criteria.lawdCd
      || data.normalizedQuery !== criteria.normalizedQuery
      || Number(data.months) !== criteria.months
      || data.endMonth !== criteria.endMonth
      || data.rangeStart !== criteria.rangeStart
      || data.rangeEnd !== criteria.rangeEnd
      || data.includesCurrentMonth !== criteria.includesCurrentMonth
      || String(data.aptSeqQuery || '') !== criteria.aptSeqQuery
      || String(data.dongQuery || '') !== criteria.dongQuery
      || !Array.isArray(data.records)
      || !/^\d{4}-\d{2}-\d{2}T/.test(String(data.fetchedAt || ''))) return null;
  const payload = apartmentCachePayload({ ...data, months: Number(data.months) });
  const expected = cacheSignature(serviceKey, 'homehunt-apartment-cache-v3', payload);
  if (!signatureMatches(expected, data.signature)) return null;
  const fetchedAtMs = Date.parse(data.fetchedAt);
  if (!Number.isFinite(fetchedAtMs)) return null;
  return { ...payload, fetchedAtMs };
}

function apartmentResponse(cached, extra = {}) {
  return {
    ok: true,
    cacheHit: true,
    aptName: cached.aptName,
    aptSeq: cached.selectedAptSeq,
    dong: cached.selectedDong,
    builtYear: cached.builtYear,
    lawdCd: cached.lawdCd,
    records: cached.records,
    months: cached.months,
    endMonth: cached.endMonth,
    rangeStart: cached.rangeStart,
    rangeEnd: cached.rangeEnd,
    includesCurrentMonth: cached.includesCurrentMonth,
    partial: false,
    missingRequests: [],
    updatedAt: cached.fetchedAt,
    ...extra,
  };
}

async function writeApartmentCache(cacheRef, serviceKey, data) {
  const payload = apartmentCachePayload(data);
  const signature = cacheSignature(serviceKey, 'homehunt-apartment-cache-v3', payload);
  await cacheRef.set({
    ...payload,
    query: data.query,
    recordCount: data.records.length,
    signature,
    updatedAt: new Date(),
  });
}

function createApartmentHistoryHandler({ db }) {
  return async (req, res) => {
    const origin = allowedOrigin(req.get('origin'));
    if (origin) res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!origin) return res.status(403).json({ error: 'Origin not allowed' });

    const lawdCd = String(req.query.lawdCd || '').trim();
    const aptName = String(req.query.aptName || '').trim();
    const aptSeqQuery = String(req.query.aptSeq || '').trim();
    const dongRaw = String(req.query.dong || '').trim();
    const dongQuery = normalizeDong(dongRaw);
    const requestedMonths = Math.max(12, Math.min(Math.trunc(Number(req.query.months) || 36), 60));
    if (!/^\d{5}$/.test(lawdCd) || aptName.length < 2 || aptName.length > 60) {
      return res.status(400).json({ error: 'Invalid lawdCd or aptName' });
    }
    if (aptSeqQuery.length > 80 || /[\u0000-\u001f]/.test(aptSeqQuery) || dongRaw.length > 40) {
      return res.status(400).json({ error: 'Invalid aptSeq or dong' });
    }
    const normalizedTarget = normalizeAptName(aptName);
    if (normalizedTarget.length < 2) return res.status(400).json({ error: 'Apartment name is too short' });
    let range;
    try {
      range = resolveHistoryRange({
        months: requestedMonths,
        endMonth: String(req.query.endMonth || '').trim(),
        includeCurrentMonth: true,
      });
    } catch (_) {
      return res.status(400).json({ error: 'Invalid endMonth' });
    }
    const { months, endMonth, rangeStart, rangeEnd, includesCurrentMonth, endIndex } = range;
    const serviceKey = normalizeServiceKey(process.env.MOLIT_SERVICE_KEY);
    if (!serviceKey) return res.status(503).json({ error: 'MOLIT service key is not configured' });

    const criteria = {
      lawdCd,
      normalizedQuery: normalizedTarget,
      months,
      endMonth,
      rangeStart,
      rangeEnd,
      includesCurrentMonth,
      aptSeqQuery,
      dongQuery,
    };
    const cacheId = crypto.createHash('sha256').update(canonicalJson(criteria)).digest('hex').slice(0, 32);
    const cacheRef = db.collection('homehunt_apartment_cache').doc(cacheId);
    let cachedApartment = null;
    try { cachedApartment = readApartmentCache(await cacheRef.get(), serviceKey, criteria); }
    catch (error) { console.warn('Apartment cache read failed:', error.message); }
    if (cachedApartment && Date.now() - cachedApartment.fetchedAtMs < APARTMENT_CACHE_TTL_MS) {
      return res.json(apartmentResponse(cachedApartment));
    }

    let rateLimit;
    try { rateLimit = await checkRateLimit(db, req); }
    catch (error) {
      console.error('HomeHunt rate limit transaction failed:', error);
      return res.status(500).json({ error: 'Failed to verify search limit' });
    }
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: rateLimit.scope === 'global' ? 'Global daily search limit reached' : 'Daily per-IP search limit reached',
      });
    }

    const dealMonths = Array.from({ length: months }, (_, offset) => compactMonth(endIndex - (months - 1 - offset)));
    const tasks = [];
    dealMonths.forEach((dealYmd) => {
      ['sale', 'rent'].forEach((type) => {
        tasks.push({
          dealYmd,
          type,
          run: () => loadMonth({ db, serviceKey, lawdCd, dealYmd, type }),
        });
      });
    });

    const outcomes = await runPoolSettled(tasks, 6);
    const available = [];
    const missingRequests = [];
    outcomes.forEach((outcome, index) => {
      const task = tasks[index];
      if (outcome.status === 'fulfilled') {
        available.push(outcome.value);
        if (outcome.value.warning) missingRequests.push(outcome.value.warning);
      } else {
        missingRequests.push({
          dealYmd: task.dealYmd,
          type: task.type,
          staleCacheUsed: false,
          reason: 'MOLIT upstream unavailable and no valid monthly cache exists',
        });
      }
    });

    if (!available.length) {
      if (cachedApartment) {
        return res.json(apartmentResponse(cachedApartment, {
          stale: true,
          partial: true,
          missingRequests,
          staleReason: 'All monthly requests failed; signed stale apartment cache used',
        }));
      }
      console.error('apartmentHistory: all monthly MOLIT requests failed');
      return res.status(502).json({
        error: 'Failed to load MOLIT apartment history',
        missingRequests,
      });
    }

    const allRecords = available.flatMap((result) => result.records);
    const selection = selectComplex(allRecords, normalizedTarget, aptSeqQuery, dongQuery);
    const partial = missingRequests.length > 0;
    if (partial && !selection.ambiguous && !selection.records.length && cachedApartment?.records?.length) {
      return res.json(apartmentResponse(cachedApartment, {
        stale: true,
        partial: true,
        missingRequests,
        staleReason: 'Partial monthly refresh did not contain this apartment; signed stale apartment cache used',
      }));
    }
    if (selection.ambiguous) {
      return res.status(409).json({
        error: 'Apartment search is ambiguous',
        lawdCd,
        query: aptName,
        candidates: selection.candidates,
        partial,
        missingRequests,
      });
    }

    const candidate = selection.candidate;
    const fetchedAt = new Date().toISOString();
    const responseBody = {
      ok: true,
      cacheHit: false,
      aptName: candidate?.name || aptName,
      aptSeq: candidate?.aptSeq || aptSeqQuery,
      dong: candidate?.dong || dongRaw,
      builtYear: candidate?.builtYear || 0,
      lawdCd,
      records: selection.records,
      months,
      endMonth,
      rangeStart,
      rangeEnd,
      includesCurrentMonth,
      partial,
      missingRequests,
      updatedAt: fetchedAt,
    };

    if (!partial) {
      try {
        await writeApartmentCache(cacheRef, serviceKey, {
          ...criteria,
          query: aptName,
          aptName: responseBody.aptName,
          selectedAptSeq: responseBody.aptSeq,
          selectedDong: responseBody.dong,
          builtYear: responseBody.builtYear,
          records: selection.records,
          fetchedAt,
        });
      } catch (error) {
        console.warn('Apartment cache write failed:', error.message);
      }
    }
    return res.json(responseBody);
  };
}

async function fetchMolitMonthDirect({ serviceKey, lawdCd, dealYmd, type = 'sale', beforeRequest = null }) {
  const normalizedKey = normalizeServiceKey(serviceKey);
  const normalizedLawdCd = String(lawdCd || '').trim();
  const normalizedDealYmd = String(dealYmd || '').trim();
  if (!normalizedKey) throw new Error('MOLIT service key is not configured');
  if (!/^\d{5}$/.test(normalizedLawdCd) || !/^\d{6}$/.test(normalizedDealYmd) || !ENDPOINTS[type]) {
    throw new Error('Invalid MOLIT month request');
  }
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await fetchMonthFromMolit(normalizedKey, normalizedLawdCd, normalizedDealYmd, type, beforeRequest);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw lastError || new Error('MOLIT upstream unavailable');
}

async function fetchApartmentHistoryDirect({
  serviceKey, lawdCd, aptName, aptSeq = '', dong = '', months = 12, includeCurrentMonth = true,
  endMonth = '', beforeRequest = null, concurrency = 6, monthLoader = null,
}) {
  const normalizedKey = normalizeServiceKey(serviceKey);
  const normalizedLawdCd = String(lawdCd || '').trim();
  const query = String(aptName || '').trim();
  const aptSeqQuery = String(aptSeq || '').trim();
  const dongRaw = String(dong || '').trim();
  const dongQuery = normalizeDong(dongRaw);
  const range = resolveHistoryRange({ months, endMonth, includeCurrentMonth });
  const requestedMonths = range.months;
  if (!normalizedKey) throw new Error('MOLIT service key is not configured');
  if (!/^\d{5}$/.test(normalizedLawdCd) || query.length < 2 || query.length > 60) {
    throw new Error('Invalid lawdCd or aptName');
  }
  if (aptSeqQuery.length > 80 || /[\u0000-\u001f]/.test(aptSeqQuery) || dongRaw.length > 40) {
    throw new Error('Invalid aptSeq or dong');
  }
  const normalizedTarget = normalizeAptName(query);
  if (normalizedTarget.length < 2) throw new Error('Apartment name is too short');

  const dealMonths = Array.from({ length: requestedMonths }, (_, offset) => compactMonth(range.endIndex - (requestedMonths - 1 - offset)));
  const loadRequestedMonth = typeof monthLoader === 'function'
    ? monthLoader
    : (request) => fetchMolitMonthDirect(request);
  const tasks = [];
  dealMonths.forEach((dealYmd) => {
    ['sale', 'rent'].forEach((type) => tasks.push({
      dealYmd,
      type,
      run: () => loadRequestedMonth({
        serviceKey: normalizedKey,
        lawdCd: normalizedLawdCd,
        dealYmd,
        type,
        beforeRequest,
      }),
    }));
  });
  const outcomes = await runPoolSettled(tasks, Math.max(1, Math.min(6, Number(concurrency) || 6)));
  const available = [];
  const missingRequests = [];
  outcomes.forEach((outcome, index) => {
    const task = tasks[index];
    if (outcome.status === 'fulfilled') {
      available.push(outcome.value);
      if (outcome.value?.warning) missingRequests.push(outcome.value.warning);
    } else missingRequests.push({
      dealYmd: task.dealYmd,
      type: task.type,
      staleCacheUsed: false,
      reason: String(outcome.reason?.message || 'MOLIT upstream unavailable'),
    });
  });
  if (!available.length) {
    const firstReason = missingRequests.find((item) => item.reason)?.reason || 'MOLIT upstream unavailable';
    const error = new Error(`Failed to load MOLIT apartment history: ${firstReason}`);
    error.missingRequests = missingRequests;
    throw error;
  }

  const selection = selectComplex(available.flatMap((result) => result.records), normalizedTarget, aptSeqQuery, dongQuery);
  if (selection.ambiguous) {
    const error = new Error('Apartment search is ambiguous');
    error.code = 'AMBIGUOUS_APARTMENT';
    error.candidates = selection.candidates;
    error.missingRequests = missingRequests;
    throw error;
  }
  const candidate = selection.candidate;
  return {
    ok: true,
    cacheHit: false,
    aptName: candidate?.name || query,
    aptSeq: candidate?.aptSeq || aptSeqQuery,
    dong: candidate?.dong || dongRaw,
    builtYear: candidate?.builtYear || 0,
    lawdCd: normalizedLawdCd,
    records: selection.records,
    partial: missingRequests.length > 0,
    missingRequests,
    months: requestedMonths,
    endMonth: range.endMonth,
    rangeStart: range.rangeStart,
    rangeEnd: range.rangeEnd,
    includesCurrentMonth: range.includesCurrentMonth,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  createApartmentHistoryHandler,
  fetchApartmentHistoryDirect,
  fetchMolitMonthDirect,
  parseMolitResponse: parseResponse,
  resolveHistoryRange,
  seoulCurrentMonth,
};
