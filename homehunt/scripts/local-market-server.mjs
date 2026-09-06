import http from 'node:http';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  aggregateRecommendationRecords,
  filterCatalogForRecommendation,
  normalizeRecommendationFilters,
} from '../js/recommendation-core.mjs';
import {
  KakaoDailyLedger,
  MemoryTtlCache,
  TmapDailyLedger,
  createCommuteCacheKey,
  fetchKakaoPublicTransit,
  fetchNaverDirections5,
  fetchTmapTransitSummary,
} from './commute-provider.mjs';
import { fetchNaverLocalSearch } from './naver-local-search.mjs';
import { connectedHistoryMonthLoader } from './history-request-lifecycle.mjs';
import { normalizeGeoPoint } from '../js/transport-core.mjs';
import { nextWeekdaySearchDateTime } from './commute-time.mjs';
import {
  completeRecommendationScope,
  recommendationMonthFailure,
} from './recommendation-data-safety.mjs';
import { collectHomeSupply } from './fetch-home-supply.mjs';

const require = createRequire(import.meta.url);
const {
  fetchApartmentHistoryDirect,
  fetchMolitMonthDirect,
  resolveHistoryRange,
} = require('../../functions/molit.js');

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const HOMEHUNT_DIR = path.resolve(SCRIPT_DIR, '..');
const CACHE_DIR = path.join(HOMEHUNT_DIR, '.local', 'market-cache');
const MONTH_CACHE_DIR = path.join(CACHE_DIR, 'months');
const HISTORY_CACHE_DIR = path.join(CACHE_DIR, 'history');
const SUPPLY_CACHE_FILE = path.join(CACHE_DIR, 'home-supply.json');
const PUBLIC_SUPPLY_FILE = path.join(HOMEHUNT_DIR, 'data', 'home-supply.json');
const TMAP_LEDGER_FILE = path.join(HOMEHUNT_DIR, '.local', 'tmap-transit-usage.json');
const KAKAO_LEDGER_FILE = path.join(HOMEHUNT_DIR, '.local', 'kakao-transit-usage.json');
const HOST = '127.0.0.1';
const PORT = Number(process.env.HOMEHUNT_LOCAL_API_PORT || 8787);
const MAX_BODY_BYTES = 16 * 1024;
const HISTORY_TTL_MS = 6 * 60 * 60 * 1000;
const JOB_TTL_MS = 60 * 60 * 1000;
const CURRENT_MONTH_TTL_MS = 30 * 60 * 1000;
const RECENT_MONTH_TTL_MS = 12 * 60 * 60 * 1000;
const OLD_MONTH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RECOMMENDATION_CONCURRENCY = 4;
const RECOMMENDATION_RETRY_CONCURRENCY = 2;
const UPSTREAM_START_GAP_MS = 300;
const RETRY_PAUSE_MS = 2500;
const LOCAL_HISTORY_CACHE_SCHEMA_VERSION = 2;
const SUPPLY_TTL_MS = 3 * 60 * 60 * 1000;
const SUPPLY_FAILURE_RETRY_MS = 15 * 60 * 1000;
const DEFAULT_TRANSIT_CACHE_HOURS = 8;
const TRANSIT_CACHE_HOURS = parseNumberSetting(process.env.TRANSIT_CACHE_HOURS, {
  fallback: DEFAULT_TRANSIT_CACHE_HOURS,
  minExclusive: 0,
  maxExclusive: 24,
});
const TMAP_DAILY_LIMIT = parseIntegerSetting(process.env.TMAP_DAILY_LIMIT, { fallback: 10, min: 0, max: 100_000 });
const KAKAO_DAILY_LIMIT = parseIntegerSetting(process.env.KAKAO_DAILY_LIMIT, { fallback: 1_000, min: 0, max: 1_000_000 });
const TRANSIT_CONCURRENCY = parseIntegerSetting(process.env.TRANSIT_CONCURRENCY, { fallback: 2, min: 1, max: 10 });
const TRANSIT_CACHE_TTL_MS = TRANSIT_CACHE_HOURS * 60 * 60 * 1000;

let serviceKey = String(process.env.MOLIT_SERVICE_KEY || '').trim();
let serviceKeySource = serviceKey ? 'environment' : 'none';
let tmapAppKey = String(process.env.TMAP_APP_KEY || '').trim();
let kakaoRestApiKey = String(process.env.KAKAO_REST_API_KEY || '').trim();
let transitProviderPreference = normalizeTransitProvider(process.env.TRANSIT_PROVIDER);
let naverMapsClientId = String(process.env.NAVER_MAPS_CLIENT_ID || '').trim();
let naverMapsClientSecret = String(process.env.NAVER_MAPS_CLIENT_SECRET || '').trim();
let naverLocalSearchClientId = String(process.env.NAVER_LOCAL_SEARCH_CLIENT_ID || '').trim();
let naverLocalSearchClientSecret = String(process.env.NAVER_LOCAL_SEARCH_CLIENT_SECRET || '').trim();
let catalogPromise;
const inFlightMonths = new Map();
const jobs = new Map();
let upstreamQueue = Promise.resolve();
let nextUpstreamStartAt = 0;
let supplyRefreshPromise = null;
let supplyLastFailure = null;
const commuteCache = new MemoryTtlCache({ ttlMs: 20 * 60 * 1000 });
const transitCache = new MemoryTtlCache({ ttlMs: TRANSIT_CACHE_TTL_MS });
const placeSearchCache = new MemoryTtlCache({ ttlMs: 5 * 60 * 1000 });
const tmapLedger = new TmapDailyLedger({ filePath: TMAP_LEDGER_FILE, limit: TMAP_DAILY_LIMIT });
const kakaoLedger = new KakaoDailyLedger({ filePath: KAKAO_LEDGER_FILE, limit: KAKAO_DAILY_LIMIT });
const transitGate = createConcurrencyGate(TRANSIT_CONCURRENCY);
const providerDiagnostics = {
  transit: { kakao: null, tmap: null },
  car: null,
  placeSearch: null,
};

function recordProviderDiagnostic(target, { state = 'reachable', reasonCode = null, httpStatus = null } = {}) {
  const value = {
    state,
    reasonCode: reasonCode ? String(reasonCode) : null,
    httpStatus: httpStatus !== null && Number.isFinite(Number(httpStatus)) ? Number(httpStatus) : null,
    checkedAt: new Date().toISOString(),
  };
  if (target === 'kakao' || target === 'tmap') providerDiagnostics.transit[target] = value;
  else providerDiagnostics[target] = value;
  return value;
}

function parseNumberSetting(value, { fallback, minExclusive, maxExclusive }) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > minExclusive && parsed < maxExclusive ? parsed : fallback;
}

function parseIntegerSetting(value, { fallback, min, max }) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function normalizeTransitProvider(value) {
  const normalized = String(value || 'auto').trim().toLowerCase();
  return ['auto', 'kakao', 'tmap'].includes(normalized) ? normalized : 'auto';
}

function selectedTransitProvider() {
  if (transitProviderPreference === 'kakao') return 'kakao';
  if (transitProviderPreference === 'tmap') return 'tmap';
  return kakaoRestApiKey ? 'kakao' : 'tmap';
}

function transitConfigured(provider = selectedTransitProvider()) {
  return provider === 'kakao' ? Boolean(kakaoRestApiKey) : Boolean(tmapAppKey);
}

function requestTransitProvider(value) {
  const requested = String(value || '').trim().toLowerCase();
  return requested === 'kakao' || requested === 'tmap' ? requested : selectedTransitProvider();
}

function createConcurrencyGate(limit) {
  let active = 0;
  const waiters = [];
  const release = () => {
    active -= 1;
    const next = waiters.shift();
    if (next) next();
  };
  return async (task) => {
    if (active >= limit) await new Promise((resolve) => waiters.push(resolve));
    active += 1;
    try { return await task(); }
    finally { release(); }
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function waitForUpstreamSlot() {
  const scheduled = upstreamQueue.then(async () => {
    const wait = Math.max(0, nextUpstreamStartAt - Date.now());
    if (wait) await sleep(wait);
    nextUpstreamStartAt = Date.now() + UPSTREAM_START_GAP_MS;
  });
  upstreamQueue = scheduled.catch(() => {});
  return scheduled;
}

function localOrigin(origin = '') {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin);
}

function setCors(req, res) {
  const origin = String(req.headers.origin || '');
  if (localOrigin(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function errorPayload(code, message, extra = {}) {
  return { ok: false, error: message, code, ...extra };
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function safeCacheName(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
}

async function readCache(file, ttlMs) {
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

async function writeCache(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, file);
}

function validSupplySnapshot(value) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.notices) && Array.isArray(value.sources));
}

async function readSupplySnapshot(filePath) {
  try {
    const stat = await fs.stat(filePath);
    const value = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (!validSupplySnapshot(value)) return null;
    return { value, ageMs: Math.max(0, Date.now() - stat.mtimeMs), filePath };
  } catch (_) {
    return null;
  }
}

async function bestSupplySnapshot() {
  const local = await readSupplySnapshot(SUPPLY_CACHE_FILE);
  if (local) return local;
  return readSupplySnapshot(PUBLIC_SUPPLY_FILE);
}

function publicSupplyError(error) {
  const code = String(error?.code || error?.name || 'SUPPLY_FETCH_FAILED').replace(/[^A-Z0-9_-]/gi, '_').slice(0, 80);
  const raw = String(error?.message || '공식 분양 공고를 수집하지 못했습니다.');
  const message = /key|service.?key|활용신청|401|403|unauthori[sz]ed|permission|인증/i.test(raw)
    ? '청약홈·LH API 활용신청과 공공데이터포털 서비스키를 확인해주세요.'
    : '공식 분양 공고를 지금 갱신하지 못했습니다. 잠시 후 다시 시도해주세요.';
  return { code, message };
}

async function refreshSupplySnapshot() {
  if (!supplyRefreshPromise) {
    supplyRefreshPromise = collectHomeSupply({
      serviceKey,
      outputPath: SUPPLY_CACHE_FILE,
      write: true,
    }).then((snapshot) => {
      supplyLastFailure = null;
      return snapshot;
    }).finally(() => { supplyRefreshPromise = null; });
  }
  return supplyRefreshPromise;
}

async function handleSupply(url, res) {
  const force = url.searchParams.get('refresh') === '1';
  const cached = await bestSupplySnapshot();
  if (!serviceKey) {
    const value = cached?.value || { schemaVersion: 1, version: 1, complete: false, sources: [], notices: [] };
    return json(res, 200, {
      ...value,
      local: { live: false, cached: Boolean(cached), keyConfigured: false },
      fallbackReason: '공공데이터포털 키가 로컬 서버에 연결되지 않았어요.',
    });
  }
  if (!force && cached?.value?.generatedAt && cached.ageMs <= SUPPLY_TTL_MS) {
    return json(res, 200, {
      ...cached.value,
      local: { live: true, cached: true, cacheAgeMinutes: Math.floor(cached.ageMs / 60000), keyConfigured: true },
    });
  }
  if (!force && supplyLastFailure && Date.now() - supplyLastFailure.at < SUPPLY_FAILURE_RETRY_MS) {
    const retryAfterMinutes = Math.max(1, Math.ceil((SUPPLY_FAILURE_RETRY_MS - (Date.now() - supplyLastFailure.at)) / 60000));
    const value = cached?.value || { schemaVersion: 1, version: 1, complete: false, sources: [], notices: [] };
    return json(res, 200, {
      ...value,
      local: {
        live: false,
        cached: Boolean(cached),
        keyConfigured: true,
        errorCode: supplyLastFailure.safe.code,
        retryAfterMinutes,
      },
      fallbackReason: supplyLastFailure.safe.message,
    });
  }
  try {
    const snapshot = await refreshSupplySnapshot();
    return json(res, 200, {
      ...snapshot,
      local: { live: true, cached: false, keyConfigured: true },
    });
  } catch (error) {
    const safe = publicSupplyError(error);
    supplyLastFailure = { at: Date.now(), safe };
    if (cached?.value) {
      return json(res, 200, {
        ...cached.value,
        local: { live: false, cached: true, keyConfigured: true, errorCode: safe.code },
        fallbackReason: safe.message,
      });
    }
    return json(res, 502, errorPayload(safe.code, safe.message));
  }
}

function validHistoryPayload(payload, criteria) {
  return payload
    && payload.ok === true
    && payload.partial === false
    && Array.isArray(payload.records)
    && String(payload.lawdCd || '') === criteria.lawdCd
    && Number(payload.months) === criteria.months
    && payload.endMonth === criteria.endMonth
    && payload.rangeStart === criteria.rangeStart
    && payload.rangeEnd === criteria.rangeEnd
    && payload.includesCurrentMonth === criteria.includesCurrentMonth
    && Number.isFinite(Date.parse(String(payload.updatedAt || '')))
    && payload.records.every((record) => {
      const month = String(record?.month || '');
      return /^\d{4}-\d{2}$/.test(month) && month >= criteria.rangeStart && month <= criteria.rangeEnd;
    });
}

async function readHistoryCache(file, criteria, ttlMs = Number.POSITIVE_INFINITY) {
  const envelope = await readCache(file, ttlMs);
  if (!envelope || envelope.schemaVersion !== LOCAL_HISTORY_CACHE_SCHEMA_VERSION) return null;
  if (safeCacheName(envelope.criteria) !== safeCacheName(criteria)) return null;
  return validHistoryPayload(envelope.payload, criteria) ? envelope.payload : null;
}

async function writeHistoryCache(file, criteria, payload) {
  if (!validHistoryPayload(payload, criteria)) throw new Error('Refusing to write incomplete or mismatched history cache');
  await writeCache(file, {
    schemaVersion: LOCAL_HISTORY_CACHE_SCHEMA_VERSION,
    criteria,
    payload,
  });
}

async function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fs.readFile(path.join(HOMEHUNT_DIR, 'data', 'apartment-catalog-seoul-gyeonggi.json'), 'utf8')
      .catch(() => fs.readFile(path.join(HOMEHUNT_DIR, 'data', 'apartment-catalog.json'), 'utf8'))
      .then((raw) => JSON.parse(raw))
      .then((payload) => ({
        ...payload,
        apartments: (payload.apartments || []).filter((item) => /^(11|41)/.test(String(item.regionCode || ''))),
      }));
  }
  return catalogPromise;
}

function compactMonth(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}${String(month).padStart(2, '0')}`;
}

function requestedMonths(count) {
  const range = resolveHistoryRange({ months: count, includeCurrentMonth: true });
  return Array.from({ length: range.months }, (_, offset) => compactMonth(range.endIndex - offset));
}

function monthTtl(dealYmd) {
  const current = resolveHistoryRange({ months: 1, includeCurrentMonth: true }).endMonth.replace('-', '');
  if (dealYmd === current) return CURRENT_MONTH_TTL_MS;
  const previous = requestedMonths(2)[1];
  return dealYmd === previous ? RECENT_MONTH_TTL_MS : OLD_MONTH_TTL_MS;
}

function validMonthCache(value, { lawdCd, dealYmd, type }) {
  return value
    && Array.isArray(value.records)
    && String(value.lawdCd || '') === lawdCd
    && String(value.dealYmd || '') === dealYmd
    && value.type === type
    && Number.isFinite(Date.parse(String(value.updatedAt || '')));
}

async function loadMolitMonth(lawdCd, dealYmd, type = 'sale') {
  const identity = `${lawdCd}_${dealYmd}_${type}`;
  if (inFlightMonths.has(identity)) return inFlightMonths.get(identity);
  const promise = (async () => {
    const file = path.join(MONTH_CACHE_DIR, `${identity}.json`);
    const cached = await readCache(file, monthTtl(dealYmd));
    if (validMonthCache(cached, { lawdCd, dealYmd, type })) return { ...cached, cacheHit: true };
    const stale = await readCache(file, Number.POSITIVE_INFINITY);
    // data.go.kr can temporarily reject a burst even when the daily allowance
    // remains. The hook spaces every upstream page; cache hits stay immediate.
    try {
      const fetched = await fetchMolitMonthDirect({
        serviceKey,
        lawdCd,
        dealYmd,
        type,
        beforeRequest: waitForUpstreamSlot,
      });
      const payload = { ...fetched, lawdCd, dealYmd, type, updatedAt: new Date().toISOString() };
      try {
        await writeCache(file, payload);
      } catch (cacheError) {
        console.warn(`Monthly cache write failed (${lawdCd}/${dealYmd}/${type}):`, cacheError.message || cacheError);
      }
      return { ...payload, cacheHit: false };
    } catch (error) {
      if (validMonthCache(stale, { lawdCd, dealYmd, type })) {
        return {
          ...stale,
          cacheHit: true,
          warning: {
            dealYmd,
            type,
            staleCacheUsed: true,
            reason: 'MOLIT upstream unavailable; stale local monthly cache used',
          },
        };
      }
      throw error;
    }
  })().finally(() => inFlightMonths.delete(identity));
  inFlightMonths.set(identity, promise);
  return promise;
}

async function runPool(tasks, concurrency, onComplete) {
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++;
      if (tasks[index].cancelled?.()) break;
      let outcome;
      try { outcome = { status: 'fulfilled', value: await tasks[index].run() }; }
      catch (reason) { outcome = { status: 'rejected', reason }; }
      onComplete?.(outcome, tasks[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
}

function publicJob(job) {
  const finished = ['complete', 'error', 'cancelled'].includes(job.status);
  const failureGroups = new Map();
  job.failures.forEach((failure) => {
    const message = String(failure.message || '조회 실패');
    let reason = '국토부 일시 응답 오류';
    if (/LIMITED_NUMBER|HTTP 429|too many|rate/i.test(message)) reason = '국토부 호출 속도·한도 제한';
    else if (/SERVICE_KEY|인증|AUTH|HTTP 401|HTTP 403/i.test(message)) reason = '서비스키 승인·인증 오류';
    else if (/timeout|abort|fetch failed|HTTP 5\d\d/i.test(message)) reason = '국토부 연결 지연·서버 오류';
    const current = failureGroups.get(reason) || { reason, count: 0, examples: [] };
    current.count += 1;
    if (current.examples.length < 3) current.examples.push(`${failure.lawdCd} · ${failure.dealYmd}`);
    failureGroups.set(reason, current);
  });
  return {
    ok: job.status !== 'error',
    jobId: job.id,
    status: job.status,
    stage: job.stage,
    progress: {
      completed: job.completed,
      total: job.total,
      retryCompleted: job.retryCompleted,
      retryTotal: job.retryTotal,
    },
    baseCandidateCount: job.baseCandidateCount,
    matchedTransactionCount: job.matchedTransactionCount,
    failedRequestCount: job.failures.length,
    failureSummary: [...failureGroups.values()],
    partial: job.status === 'complete' && job.failures.length > 0,
    incompleteDistrictCodes: [...(job.incompleteDistrictCodes || [])],
    excludedIncompleteCandidateCount: Number(job.excludedIncompleteCandidateCount || 0),
    excludedIncompleteRecordCount: Number(job.excludedIncompleteRecordCount || 0),
    results: finished || job.status === 'complete' ? job.results : [],
    resultCount: job.results.length,
    totalResultCount: job.totalResultCount,
    truncated: job.totalResultCount > job.results.length,
    filters: job.filters,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    source: '국토교통부 아파트 매매 실거래가 · 한국부동산원 공동주택 단지정보',
    note: '가격은 조회 기간의 동일 전용면적 실제 거래를 산술평균한 값이며 현재 매물 호가가 아닙니다.',
    error: job.error || '',
  };
}

async function startRecommendationJob(rawFilters) {
  const catalog = await loadCatalog();
  const filters = normalizeRecommendationFilters(rawFilters);
  if (filters.areaBasis === 'supply') throw new Error('공급면적 기준은 공식 실거래로 판정할 수 없습니다. 전용면적을 선택해주세요.');
  const basicCandidates = filterCatalogForRecommendation(catalog.apartments, filters);
  const districtCodes = [...new Set(basicCandidates.map((item) => String(item.regionCode)))].sort();
  const months = requestedMonths(filters.months);
  const id = crypto.randomUUID();
  const job = {
    id, status: 'running', stage: 'actual-prices', filters,
    baseCandidateCount: basicCandidates.length,
    matchedTransactionCount: 0,
    completed: 0, total: districtCodes.length * months.length,
    results: [], failures: [], records: [], cancelled: false,
    totalResultCount: 0,
    incompleteDistrictCodes: [],
    excludedIncompleteCandidateCount: 0,
    excludedIncompleteRecordCount: 0,
    retryCompleted: 0, retryTotal: 0,
    startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), error: '',
  };
  jobs.set(id, job);

  const finishCancelled = () => {
    job.status = 'cancelled';
    job.stage = 'cancelled';
    job.records = [];
    job.updatedAt = new Date().toISOString();
  };

  const tasks = districtCodes.flatMap((lawdCd) => months.map((dealYmd) => ({
    lawdCd, dealYmd,
    cancelled: () => job.cancelled,
    run: () => loadMolitMonth(lawdCd, dealYmd, 'sale'),
  })));
  void (async () => {
    const retryTasks = [];
    await runPool(tasks, RECOMMENDATION_CONCURRENCY, (outcome, task) => {
      job.completed += 1;
      job.updatedAt = new Date().toISOString();
      const incomplete = recommendationMonthFailure(outcome, task);
      if (incomplete) retryTasks.push(task);
      else job.records.push(...outcome.value.records);
    });
    if (job.cancelled) return finishCancelled();
    if (retryTasks.length) {
      job.stage = 'retrying';
      job.retryTotal = retryTasks.length;
      job.updatedAt = new Date().toISOString();
      await sleep(RETRY_PAUSE_MS);
      await runPool(retryTasks, RECOMMENDATION_RETRY_CONCURRENCY, (outcome, task) => {
        job.retryCompleted += 1;
        job.updatedAt = new Date().toISOString();
        const incomplete = recommendationMonthFailure(outcome, task);
        if (incomplete) job.failures.push(incomplete);
        else job.records.push(...outcome.value.records);
      });
    }
    if (job.cancelled) return finishCancelled();
    if (!job.records.length && job.failures.length) throw new Error('국토부 실거래를 불러오지 못했습니다. 서비스키와 승인 상태를 확인해주세요.');
    job.stage = 'matching';
    const completeScope = completeRecommendationScope(basicCandidates, job.records, job.failures);
    job.incompleteDistrictCodes = completeScope.incompleteDistrictCodes;
    job.excludedIncompleteCandidateCount = completeScope.excludedCandidateCount;
    job.excludedIncompleteRecordCount = completeScope.excludedRecordCount;
    const results = aggregateRecommendationRecords(completeScope.candidates, completeScope.records, filters);
    job.matchedTransactionCount = results.reduce((sum, item) => sum + Number(item.actualDealCount || 0), 0);
    job.totalResultCount = results.length;
    // Do not trim by price before the browser can calculate distance to the
    // user's company. A cheap far-away complex must not displace a nearby one.
    job.results = results;
    job.records = [];
    job.status = 'complete';
    job.stage = 'complete';
    job.updatedAt = new Date().toISOString();
  })().catch((error) => {
    job.records = [];
    job.status = 'error';
    job.stage = 'error';
    job.error = error.message || '추천 조회 실패';
    job.updatedAt = new Date().toISOString();
  });
  return job;
}

async function cacheStats() {
  try {
    const [months, histories] = await Promise.all([
      fs.readdir(MONTH_CACHE_DIR).catch(() => []),
      fs.readdir(HISTORY_CACHE_DIR).catch(() => []),
    ]);
    return { months: months.filter((name) => name.endsWith('.json')).length, histories: histories.filter((name) => name.endsWith('.json')).length };
  } catch (_) {
    return { months: 0, histories: 0 };
  }
}

async function handleHistory(url, res) {
  if (!serviceKey) return json(res, 503, errorPayload('LOCAL_KEY_REQUIRED', '로컬 서버에 국토부 서비스키를 연결해주세요.'));
  const lawdCd = String(url.searchParams.get('lawdCd') || '').trim();
  const aptName = String(url.searchParams.get('aptName') || '').trim();
  const aptSeq = String(url.searchParams.get('aptSeq') || '').trim();
  const dong = String(url.searchParams.get('dong') || '').trim();
  const requestedMonths = Math.max(12, Math.min(60, Math.trunc(Number(url.searchParams.get('months')) || 36)));
  if (!/^(11|41)\d{3}$/.test(lawdCd)) return json(res, 400, errorPayload('OUT_OF_SCOPE', '로컬 실거래 범위는 서울·경기입니다.'));
  let range;
  try {
    range = resolveHistoryRange({
      months: requestedMonths,
      endMonth: String(url.searchParams.get('endMonth') || '').trim(),
      includeCurrentMonth: true,
    });
  } catch (_) {
    return json(res, 400, errorPayload('INVALID_END_MONTH', '조회 기준 월을 확인해주세요.'));
  }
  const criteria = {
    lawdCd,
    aptName,
    aptSeq,
    dong,
    months: range.months,
    endMonth: range.endMonth,
    rangeStart: range.rangeStart,
    rangeEnd: range.rangeEnd,
    includesCurrentMonth: range.includesCurrentMonth,
  };
  const file = path.join(HISTORY_CACHE_DIR, `${safeCacheName(criteria)}.json`);
  const historyTtl = range.includesCurrentMonth ? CURRENT_MONTH_TTL_MS : HISTORY_TTL_MS;
  const cached = await readHistoryCache(file, criteria, historyTtl);
  if (cached) return json(res, 200, { ...cached, cacheHit: true, source: 'local-cache' });
  const stale = await readHistoryCache(file, criteria);
  try {
    const payload = await fetchApartmentHistoryDirect({
      serviceKey,
      lawdCd,
      aptName,
      aptSeq,
      dong,
      months: range.months,
      endMonth: range.endMonth,
      beforeRequest: waitForUpstreamSlot,
      concurrency: 3,
      monthLoader: connectedHistoryMonthLoader(res, ({ lawdCd: monthLawdCd, dealYmd, type }) => loadMolitMonth(monthLawdCd, dealYmd, type)),
    });
    if (res.destroyed) return;
    if (payload.partial && !payload.records.length && stale) {
      return json(res, 200, {
        ...stale,
        cacheHit: true,
        stale: true,
        partial: true,
        missingRequests: payload.missingRequests || [],
        staleReason: 'Partial monthly refresh did not contain this apartment; complete stale local history used',
        source: 'local-stale-cache',
      });
    }
    if (!payload.partial) {
      try {
        await writeHistoryCache(file, criteria, payload);
      } catch (cacheError) {
        console.warn('Apartment history cache write failed:', cacheError.message || cacheError);
      }
    }
    return json(res, 200, { ...payload, source: 'molit-live' });
  } catch (error) {
    if (res.destroyed) return;
    if (error.code === 'AMBIGUOUS_APARTMENT') {
      return json(res, 409, errorPayload('AMBIGUOUS_APARTMENT', '같은 이름의 단지가 여러 곳입니다.', {
        candidates: error.candidates || [],
        months: range.months,
        endMonth: range.endMonth,
        rangeStart: range.rangeStart,
        rangeEnd: range.rangeEnd,
        includesCurrentMonth: range.includesCurrentMonth,
      }));
    }
    if (stale) return json(res, 200, {
      ...stale,
      cacheHit: true,
      stale: true,
      partial: true,
      missingRequests: error.missingRequests || [],
      source: 'local-stale-cache',
    });
    console.error('Apartment history request failed:', error.message || error);
    return json(res, 502, errorPayload('MOLIT_UPSTREAM_ERROR', error.message || '국토부 실거래 조회에 실패했습니다.'));
  }
}

function validPoint(point) {
  return normalizeGeoPoint(point);
}

function normalizedModes(requestedModes) {
  return Array.isArray(requestedModes)
    ? [...new Set(requestedModes.filter((mode) => mode === 'car' || mode === 'transit'))]
    : [];
}

function notConfiguredRoute(provider, mode) {
  return { provider, mode, verified: false, status: 'not-configured', durationMinutes: null };
}

function failedRoute(provider, mode, error) {
  return {
    provider,
    mode,
    verified: false,
    status: error?.code === 'DAILY_LIMIT' ? 'quota-exhausted' : 'error',
    reasonCode: error?.code || 'PROVIDER_ERROR',
    httpStatus: error?.httpStatus !== null && error?.httpStatus !== undefined && Number.isFinite(Number(error.httpStatus)) ? Number(error.httpStatus) : null,
    durationMinutes: null,
  };
}

async function resolveCommuteRoutes({ origin, destination, modes, searchDateTime, transitProvider = selectedTransitProvider() }) {
  const routes = [];
  if (modes.includes('transit')) {
    if (transitProvider === 'kakao' && !kakaoRestApiKey) {
      routes.push(notConfiguredRoute('kakao-transit', 'transit'));
    } else if (transitProvider === 'tmap' && !tmapAppKey) {
      routes.push(notConfiguredRoute('tmap-transit', 'transit'));
    } else {
      try {
        const route = await transitGate(() => (
          transitProvider === 'kakao'
            ? fetchKakaoPublicTransit(
              { origin, destination, restApiKey: kakaoRestApiKey },
              {
                cache: transitCache,
                cacheTtlMs: TRANSIT_CACHE_TTL_MS,
                beforeRequest: () => kakaoLedger.reserve(1),
              },
            )
            : fetchTmapTransitSummary(
              { origin, destination, appKey: tmapAppKey, searchDateTime },
              {
                cache: transitCache,
                cacheTtlMs: TRANSIT_CACHE_TTL_MS,
                beforeRequest: () => tmapLedger.reserve(1),
              },
            )
        ));
        recordProviderDiagnostic(transitProvider, {
          state: route?.verified ? 'verified' : 'reachable',
          reasonCode: route?.reasonCode || null,
        });
        routes.push(route);
      } catch (error) {
        recordProviderDiagnostic(transitProvider, {
          state: 'error',
          reasonCode: error?.code || 'PROVIDER_ERROR',
          httpStatus: error?.httpStatus ?? null,
        });
        routes.push(failedRoute(`${transitProvider}-transit`, 'transit', error));
      }
    }
  }
  if (modes.includes('car')) {
    if (!naverMapsClientId || !naverMapsClientSecret) {
      routes.push({ provider: 'naver-directions5', mode: 'car', verified: false, status: 'not-configured', durationMinutes: null });
    } else {
      try {
        const route = await fetchNaverDirections5(
          { origin, destination, clientId: naverMapsClientId, clientSecret: naverMapsClientSecret },
          { cache: commuteCache, cacheTtlMs: 20 * 60 * 1000 },
        );
        recordProviderDiagnostic('car', {
          state: route?.verified ? 'verified' : 'reachable',
          reasonCode: route?.reasonCode || null,
        });
        routes.push(route);
      } catch (error) {
        recordProviderDiagnostic('car', {
          state: 'error',
          reasonCode: error?.code || 'PROVIDER_ERROR',
          httpStatus: error?.httpStatus ?? null,
        });
        routes.push(failedRoute('naver-directions5', 'car', error));
      }
    }
  }
  return routes;
}

function commuteResponse({ routes, departureTime, searchDateTime, transitProvider = selectedTransitProvider() }) {
  return {
    ok: true,
    routes,
    departureTime,
    transitSearchDateTime: searchDateTime,
    configured: {
      transit: transitConfigured(transitProvider),
      car: Boolean(naverMapsClientId && naverMapsClientSecret),
      transitProvider,
    },
    cachePolicy: `transit-memory-only-${TRANSIT_CACHE_HOURS}-hours; car-memory-only-20-minutes`,
  };
}

async function handleCommute(req, res) {
  const body = await readJsonBody(req);
  const origin = validPoint(body.origin);
  const destination = validPoint(body.destination);
  if (!origin || !destination) return json(res, 400, errorPayload('INVALID_COORDINATES', '출발지와 회사 위치 좌표를 확인해주세요.'));
  const modes = normalizedModes(body.modes);
  if (!modes.length) return json(res, 400, errorPayload('INVALID_MODES', '자동차 또는 대중교통을 선택해주세요.'));
  const departureTime = String(body.departureTime || '08:00');
  const transitProvider = requestTransitProvider(body.transitProvider);
  const searchDateTime = nextWeekdaySearchDateTime(departureTime);
  if (!searchDateTime) return json(res, 400, errorPayload('INVALID_DEPARTURE_TIME', '출근 출발 시각을 확인해주세요.'));
  const routes = await resolveCommuteRoutes({ origin, destination, modes, searchDateTime, transitProvider });
  return json(res, 200, {
    ...commuteResponse({ routes, departureTime, searchDateTime, transitProvider }),
  });
}

function pairIdentity(origin, destination, modes = [], searchDateTime = '', transitProvider = selectedTransitProvider()) {
  const providerTime = modes.includes('transit') && transitProvider === 'tmap' ? searchDateTime : '';
  return [origin.lng, origin.lat, destination.lng, destination.lat]
    .map((value) => Number(value).toFixed(7))
    .concat([...modes].sort().join(','), providerTime)
    .join('|');
}

async function preflightBatchTransit(uniquePairs, maxTransitCalls, provider = selectedTransitProvider()) {
  const providerHasKey = provider === 'kakao' ? Boolean(kakaoRestApiKey) : Boolean(tmapAppKey);
  const missingKeys = new Set();
  if (providerHasKey) {
    uniquePairs.forEach(({ origin, destination, modes, searchDateTime }) => {
      if (!modes.includes('transit')) return;
      const key = createCommuteCacheKey({
        provider: `${provider}-transit`,
        origin,
        destination,
        searchDateTime: provider === 'tmap' ? searchDateTime : '',
        option: provider === 'tmap' ? 'summary' : 'publictraffic',
      });
      if (!transitCache.hasOrPending(key)) missingKeys.add(key);
    });
  }
  const misses = missingKeys.size;
  const quota = await (provider === 'kakao' ? kakaoLedger : tmapLedger).snapshot();
  return {
    provider,
    requiredUpstreamCalls: misses,
    maxTransitCalls,
    clientLimitAllowed: misses <= maxTransitCalls,
    providerLimitAllowed: !quota || misses <= quota.remaining,
    quota,
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const values = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      values[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return values;
}

async function handleCommuteBatch(req, res) {
  const body = await readJsonBody(req);
  if (!Array.isArray(body.origins) || !body.origins.length || body.origins.length > 10) {
    return json(res, 400, errorPayload('INVALID_ORIGINS', '출발지는 1~10개까지 입력해주세요.'));
  }
  if (!Array.isArray(body.destinations) || !body.destinations.length || body.destinations.length > 4) {
    return json(res, 400, errorPayload('INVALID_DESTINATIONS', '도착지는 1~4개까지 입력해주세요.'));
  }
  const cleanId = (value) => String(value ?? '').normalize('NFKC').trim();
  const validId = (value) => value.length >= 1 && value.length <= 128 && !/[\u0000-\u001f]/.test(value);
  const origins = body.origins.map((item) => ({ id: cleanId(item?.id), point: validPoint(item) }));
  const destinations = body.destinations.map((item) => ({
    id: cleanId(item?.id),
    label: String(item?.label || '').normalize('NFKC').trim().slice(0, 120),
    point: validPoint(item),
    modes: normalizedModes(item?.modes),
    maxMinutes: Number(item?.maxMinutes),
    departureTime: String(item?.departureTime || '08:00'),
  }));
  if (origins.some((item) => !validId(item.id)) || destinations.some((item) => !validId(item.id))) {
    return json(res, 400, errorPayload('INVALID_LOCATION_ID', '출발지와 도착지마다 1~128자의 ID가 필요합니다.'));
  }
  if (new Set(origins.map((item) => item.id)).size !== origins.length
    || new Set(destinations.map((item) => item.id)).size !== destinations.length) {
    return json(res, 400, errorPayload('DUPLICATE_LOCATION_ID', '출발지와 도착지 ID는 각각 중복될 수 없습니다.'));
  }
  if (origins.some((item) => !item.point) || destinations.some((item) => !item.point)) {
    return json(res, 400, errorPayload('INVALID_COORDINATES', '출발지와 도착지 좌표를 확인해주세요.'));
  }
  if (destinations.some((item) => !item.modes.length)) {
    return json(res, 400, errorPayload('INVALID_MODES', '각 도착지에 자동차 또는 대중교통을 선택해주세요.'));
  }
  if (destinations.some((item) => !Number.isFinite(item.maxMinutes) || item.maxMinutes <= 0 || item.maxMinutes > 300)) {
    return json(res, 400, errorPayload('INVALID_MAX_MINUTES', '각 도착지의 최대 통근 시간은 1~300분이어야 합니다.'));
  }
  destinations.forEach((item) => { item.searchDateTime = nextWeekdaySearchDateTime(item.departureTime); });
  if (destinations.some((item) => !item.searchDateTime)) {
    return json(res, 400, errorPayload('INVALID_DEPARTURE_TIME', '각 도착지의 출근 출발 시각을 확인해주세요.'));
  }
  const maxTransitCalls = body.maxTransitCalls === undefined ? 10 : Number(body.maxTransitCalls);
  if (!Number.isInteger(maxTransitCalls) || maxTransitCalls < 0 || maxTransitCalls > 40) {
    return json(res, 400, errorPayload('INVALID_MAX_TRANSIT_CALLS', '대중교통 원호출 상한은 0~40의 정수여야 합니다.'));
  }

  const transitProvider = requestTransitProvider(body.transitProvider);
  const pairs = origins.flatMap((origin) => destinations.map((destination) => ({
    originId: origin.id,
    destinationId: destination.id,
    origin: origin.point,
    destination: destination.point,
    modes: destination.modes,
    maxMinutes: destination.maxMinutes,
    departureTime: destination.departureTime,
    searchDateTime: destination.searchDateTime,
    identity: pairIdentity(origin.point, destination.point, destination.modes, destination.searchDateTime, transitProvider),
  })));
  const uniqueByIdentity = new Map();
  pairs.forEach((pair) => {
    if (!uniqueByIdentity.has(pair.identity)) uniqueByIdentity.set(pair.identity, pair);
  });
  const uniquePairs = [...uniqueByIdentity.values()];

  let preflight;
  try {
    preflight = await preflightBatchTransit(uniquePairs, maxTransitCalls, transitProvider);
  } catch (error) {
    const providerLabel = transitProvider === 'kakao' ? 'Kakao' : 'TMAP';
    return json(res, 503, errorPayload(`${transitProvider.toUpperCase()}_QUOTA_UNAVAILABLE`, `${providerLabel} 사용량 기록을 확인하지 못했습니다.`, {
      provider: transitProvider,
      reasonCode: error?.code || 'QUOTA_LEDGER_ERROR',
    }));
  }
  if (!preflight.clientLimitAllowed) {
    return json(res, 429, errorPayload('TRANSIT_PREFLIGHT_LIMIT', '이 요청의 대중교통 원호출 안전 상한을 넘었습니다.', {
      provider: preflight.provider,
      requiredTransitCalls: preflight.requiredUpstreamCalls,
      maxTransitCalls,
      quota: preflight.quota,
    }));
  }
  if (!preflight.providerLimitAllowed) {
    const providerLabel = transitProvider === 'kakao' ? 'Kakao' : 'TMAP';
    return json(res, 429, errorPayload(`${transitProvider.toUpperCase()}_DAILY_LIMIT`, `오늘 남은 ${providerLabel} 로컬 호출 한도보다 조회할 경로가 많습니다.`, {
      provider: preflight.provider,
      requiredTransitCalls: preflight.requiredUpstreamCalls,
      maxTransitCalls,
      quota: preflight.quota,
    }));
  }

  const uniqueResults = await mapWithConcurrency(uniquePairs, TRANSIT_CONCURRENCY, async (pair) => ({
    identity: pair.identity,
    routes: await resolveCommuteRoutes({
      origin: pair.origin,
      destination: pair.destination,
      modes: pair.modes,
      searchDateTime: pair.searchDateTime,
      transitProvider,
    }),
    departureTime: pair.departureTime,
  }));
  const resultByIdentity = new Map(uniqueResults.map((result) => [result.identity, result]));
  const items = pairs.map((pair) => {
    const result = resultByIdentity.get(pair.identity);
    return {
      originId: pair.originId,
      destinationId: pair.destinationId,
      routes: result.routes,
      departureTime: pair.departureTime,
    };
  });
  return json(res, 200, {
    ok: true,
    items,
    quota: await commuteQuotaSnapshot(transitProvider),
    provider: transitProvider,
    requestedPairCount: pairs.length,
    uniquePairCount: uniquePairs.length,
    deduplicatedPairCount: pairs.length - uniquePairs.length,
    requiredTransitCalls: preflight.requiredUpstreamCalls,
  });
}

async function safeProviderQuota(ledger, { provider, limit }) {
  try {
    return { ...(await ledger.snapshot()), available: true };
  } catch (error) {
    return {
      provider,
      date: null,
      timeZone: 'Asia/Seoul',
      limit,
      used: null,
      remaining: 0,
      resetAt: null,
      updatedAt: null,
      available: false,
      reasonCode: error?.code || 'QUOTA_LEDGER_ERROR',
    };
  }
}

function safeTmapQuota() {
  return safeProviderQuota(tmapLedger, { provider: 'tmap-transit', limit: TMAP_DAILY_LIMIT });
}

function safeKakaoQuota() {
  return safeProviderQuota(kakaoLedger, { provider: 'kakao-transit', limit: KAKAO_DAILY_LIMIT });
}

async function commuteQuotaSnapshot(provider = selectedTransitProvider()) {
  const [tmap, kakao] = await Promise.all([safeTmapQuota(), safeKakaoQuota()]);
  return {
    provider,
    transitConfigured: transitConfigured(provider),
    tmap,
    kakao,
  };
}

async function handlePlaceSearch(url, res) {
  if (!naverLocalSearchClientId || !naverLocalSearchClientSecret) {
    return json(res, 503, errorPayload(
      'NAVER_LOCAL_SEARCH_KEY_REQUIRED',
      '회사·건물명 검색용 NAVER Developers 지역 검색 키를 연결해주세요.',
    ));
  }
  const query = String(url.searchParams.get('query') || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (query.length < 2 || query.length > 100 || /[\u0000-\u001f]/.test(query)) {
    return json(res, 400, errorPayload('INVALID_PLACE_QUERY', '검색어는 2~100자로 입력해주세요.'));
  }
  try {
    const items = await placeSearchCache.getOrLoad(`naver-local|${query.toLocaleLowerCase('ko-KR')}`, () => (
      fetchNaverLocalSearch({
        query,
        clientId: naverLocalSearchClientId,
        clientSecret: naverLocalSearchClientSecret,
      })
    ));
    recordProviderDiagnostic('placeSearch', { state: 'verified' });
    return json(res, 200, { ok: true, query, items, source: 'naver-developers-local', cachedInMemory: true });
  } catch (error) {
    recordProviderDiagnostic('placeSearch', {
      state: 'error',
      reasonCode: error?.code || 'PLACE_SEARCH_ERROR',
      httpStatus: error?.httpStatus ?? null,
    });
    const status = error?.code === 'INVALID_QUERY' ? 400 : error?.code === 'TIMEOUT' ? 504 : 502;
    return json(res, status, errorPayload(
      error?.code === 'INVALID_QUERY' ? 'INVALID_PLACE_QUERY' : 'NAVER_LOCAL_SEARCH_UNAVAILABLE',
      status === 504
        ? '회사·건물명 검색 응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.'
        : '회사·건물명 검색 서비스에 연결하지 못했어요. 키와 API 신청 상태를 확인해주세요.',
    ));
  }
}

async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const origin = String(req.headers.origin || '');
  if (origin && !localOrigin(origin)) return json(res, 403, errorPayload('ORIGIN_DENIED', '로컬 페이지에서만 사용할 수 있습니다.'));
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    const catalog = await loadCatalog();
    const [tmapQuota, kakaoQuota] = await Promise.all([safeTmapQuota(), safeKakaoQuota()]);
    return json(res, 200, {
      ok: true,
      keyConfigured: Boolean(serviceKey),
      keySource: serviceKeySource,
      commute: {
        transitConfigured: transitConfigured(),
        carConfigured: Boolean(naverMapsClientId && naverMapsClientSecret),
        transitProvider: selectedTransitProvider(),
        transitProviderPreference,
        providers: {
          kakaoTransitConfigured: Boolean(kakaoRestApiKey),
          tmapTransitConfigured: Boolean(tmapAppKey),
          naverDirectionsConfigured: Boolean(naverMapsClientId && naverMapsClientSecret),
        },
        cache: {
          transit: `memory-only-${TRANSIT_CACHE_HOURS}-hours`,
          car: 'memory-only-20-minutes',
        },
        diagnostics: {
          transit: providerDiagnostics.transit,
          car: providerDiagnostics.car,
        },
        tmapQuota,
        kakaoQuota,
      },
      placeSearch: {
        configured: Boolean(naverLocalSearchClientId && naverLocalSearchClientSecret),
        cache: 'memory-only-5-minutes',
        diagnostic: providerDiagnostics.placeSearch,
      },
      supply: {
        configured: Boolean(serviceKey),
        providers: ['applyhome', 'lh', 'sh'],
        publicProviders: ['sh'],
        cache: 'file-3-hours',
      },
      scope: '서울·경기',
      catalogCount: catalog.apartments.length,
      cache: await cacheStats(),
      limits: {
        historyMonthsMax: 60,
        commuteCandidatesPerSearch: 10,
        tmapDailyLimit: TMAP_DAILY_LIMIT,
        kakaoDailyLimit: KAKAO_DAILY_LIMIT,
        transitConcurrency: TRANSIT_CONCURRENCY,
        transitCacheHours: TRANSIT_CACHE_HOURS,
      },
      version: '2.5.1',
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/commute/quota') {
    const quota = await commuteQuotaSnapshot();
    return json(res, 200, {
      ok: true,
      ...quota,
      transitProvider: quota.provider,
      transitProviderPreference,
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/config') {
    const body = await readJsonBody(req);
    const nextKey = String(body.serviceKey || '').trim();
    const nextTmapKey = String(body.tmapAppKey || '').trim();
    const nextKakaoKey = String(body.kakaoRestApiKey || '').trim();
    const nextNaverId = String(body.naverClientId || '').trim();
    const nextNaverSecret = String(body.naverClientSecret || '').trim();
    const nextNaverLocalId = String(body.naverLocalClientId || '').trim();
    const nextNaverLocalSecret = String(body.naverLocalClientSecret || '').trim();
    const hasTransitProvider = Object.prototype.hasOwnProperty.call(body, 'transitProvider');
    const nextTransitProvider = String(body.transitProvider || '').trim().toLowerCase();
    const hasAny = nextKey || nextTmapKey || nextKakaoKey || nextNaverId || nextNaverSecret
      || nextNaverLocalId || nextNaverLocalSecret || hasTransitProvider;
    if (!hasAny) return json(res, 400, errorPayload('EMPTY_CONFIG', '연결할 키를 하나 이상 입력해주세요.'));
    const invalidSecret = (value, min = 6) => value && (value.length < min || value.length > 500 || /[\u0000-\u001f]/.test(value));
    if (invalidSecret(nextKey, 20) || invalidSecret(nextTmapKey, 10) || invalidSecret(nextKakaoKey, 10)
      || invalidSecret(nextNaverId, 5) || invalidSecret(nextNaverSecret, 10)
      || invalidSecret(nextNaverLocalId, 5) || invalidSecret(nextNaverLocalSecret, 10)) {
      return json(res, 400, errorPayload('INVALID_KEY', '입력한 키 형식을 확인해주세요.'));
    }
    if (hasTransitProvider && !['auto', 'kakao', 'tmap'].includes(nextTransitProvider)) {
      return json(res, 400, errorPayload('INVALID_TRANSIT_PROVIDER', '대중교통 공급자는 auto, kakao, tmap 중 하나여야 합니다.'));
    }
    if ((nextNaverId && !nextNaverSecret) || (!nextNaverId && nextNaverSecret)) {
      return json(res, 400, errorPayload('NAVER_KEY_PAIR_REQUIRED', '네이버 Directions는 Client ID와 Secret을 함께 입력해주세요.'));
    }
    if ((nextNaverLocalId && !nextNaverLocalSecret) || (!nextNaverLocalId && nextNaverLocalSecret)) {
      return json(res, 400, errorPayload('NAVER_LOCAL_KEY_PAIR_REQUIRED', 'NAVER Developers 지역 검색은 Client ID와 Secret을 함께 입력해주세요.'));
    }
    if (nextKey) {
      serviceKey = nextKey;
      serviceKeySource = 'memory';
    }
    if (nextTmapKey) {
      tmapAppKey = nextTmapKey;
      providerDiagnostics.transit.tmap = null;
    }
    if (nextKakaoKey) {
      kakaoRestApiKey = nextKakaoKey;
      providerDiagnostics.transit.kakao = null;
    }
    if (hasTransitProvider) transitProviderPreference = nextTransitProvider;
    if (nextNaverId && nextNaverSecret) {
      naverMapsClientId = nextNaverId;
      naverMapsClientSecret = nextNaverSecret;
      providerDiagnostics.car = null;
    }
    if (nextNaverLocalId && nextNaverLocalSecret) {
      naverLocalSearchClientId = nextNaverLocalId;
      naverLocalSearchClientSecret = nextNaverLocalSecret;
      providerDiagnostics.placeSearch = null;
    }
    commuteCache.clear();
    transitCache.clear();
    placeSearchCache.clear();
    return json(res, 200, {
      ok: true,
      keyConfigured: Boolean(serviceKey),
      commute: {
        transitConfigured: transitConfigured(),
        carConfigured: Boolean(naverMapsClientId && naverMapsClientSecret),
        transitProvider: selectedTransitProvider(),
        transitProviderPreference,
        providers: {
          kakaoTransitConfigured: Boolean(kakaoRestApiKey),
          tmapTransitConfigured: Boolean(tmapAppKey),
        },
      },
      placeSearch: { configured: Boolean(naverLocalSearchClientId && naverLocalSearchClientSecret) },
      persisted: false,
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/place-search') return handlePlaceSearch(url, res);
  if (req.method === 'GET' && url.pathname === '/api/supply') return handleSupply(url, res);
  if (req.method === 'GET' && url.pathname === '/api/apartment-history') return handleHistory(url, res);
  if (req.method === 'POST' && url.pathname === '/api/commute') return handleCommute(req, res);
  if (req.method === 'POST' && url.pathname === '/api/commute/batch') return handleCommuteBatch(req, res);
  if (req.method === 'POST' && url.pathname === '/api/recommendations') {
    if (!serviceKey) return json(res, 503, errorPayload('LOCAL_KEY_REQUIRED', '로컬 서버에 국토부 서비스키를 연결해주세요.'));
    try {
      const job = await startRecommendationJob(await readJsonBody(req));
      return json(res, 202, publicJob(job));
    } catch (error) {
      return json(res, 400, errorPayload('INVALID_RECOMMENDATION', error.message || '추천 조건을 확인해주세요.'));
    }
  }
  const jobMatch = url.pathname.match(/^\/api\/recommendations\/([0-9a-f-]+)$/i);
  if (jobMatch && req.method === 'GET') {
    const job = jobs.get(jobMatch[1]);
    return job ? json(res, 200, publicJob(job)) : json(res, 404, errorPayload('JOB_NOT_FOUND', '추천 작업을 찾지 못했습니다.'));
  }
  if (jobMatch && req.method === 'DELETE') {
    const job = jobs.get(jobMatch[1]);
    if (!job) return json(res, 404, errorPayload('JOB_NOT_FOUND', '추천 작업을 찾지 못했습니다.'));
    job.cancelled = true;
    return json(res, 200, { ok: true, jobId: job.id, status: 'cancelling' });
  }
  return json(res, 404, errorPayload('NOT_FOUND', '경로를 찾지 못했습니다.'));
}

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  jobs.forEach((job, id) => {
    if (Date.parse(job.updatedAt) < cutoff) jobs.delete(id);
  });
}, 10 * 60 * 1000).unref();

await fs.mkdir(CACHE_DIR, { recursive: true });
const server = http.createServer((req, res) => {
  handler(req, res).catch((error) => json(res, 500, errorPayload('LOCAL_SERVER_ERROR', error.message || '로컬 서버 오류')));
});
server.listen(PORT, HOST, () => {
  console.log(`HomeHunt local market API: http://${HOST}:${PORT}`);
  console.log(`MOLIT key: ${serviceKey ? 'configured in memory' : 'not configured · connect it from the HomeHunt page'}`);
});
