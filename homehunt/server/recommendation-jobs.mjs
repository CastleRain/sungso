import { randomUUID, createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import {
  filterCatalogForRecommendation,
  normalizeRecommendationFilters,
} from '../js/recommendation-core.mjs';
import {
  buildRecommendationPriceResult,
  recommendationMonthEvidence,
  recommendationMonthFailure,
} from '../scripts/recommendation-data-safety.mjs';

// Every advance is awaited by its HTTP handler. No background promise, local
// file, or process-local job map is needed to resume after an instance stops.
export const RECOMMENDATION_JOB_TTL_MS = 24 * 60 * 60 * 1000;
// Longer than eight worst-case month timeouts; each checkpoint also renews it.
// The final chunk reads/aggregation therefore have a fresh six-minute lease.
export const RECOMMENDATION_JOB_LEASE_MS = 6 * 60 * 1000;
export const RECOMMENDATION_JOB_BATCH_SIZE = 8;
export const RECOMMENDATION_JOB_CONCURRENCY = 2;
export const RECOMMENDATION_SEARCH_ARCHIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_TIMEOUT_MS = 40 * 1000;
const CHUNK_BYTES = 400 * 1024;
const MAX_ENCODED_BYTES = 6 * 1024 * 1024;
const MAX_BLOB_BYTES = 32 * 1024 * 1024;
const MAX_RESULT_BYTES = 24 * 1024 * 1024;
const MAX_JOB_RECORD_BYTES = 64 * 1024 * 1024;
const MAX_TASKS = 600;
const FINAL = new Set(['complete', 'error', 'cancelled']);
const PRICE_FIELDS = [
  'regions', 'minHouseholds', 'householdsOperator', 'maxPriceManWon',
  'priceOperator', 'minAreaM2', 'areaOperator', 'areaBasis',
  'maxAgeYears', 'minBuiltYear', 'months',
];

export class RecommendationJobError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'RecommendationJobError';
    this.code = code;
    this.status = status;
    this.httpStatus = status;
  }
}

function fail(code, message, status) {
  throw new RecommendationJobError(code, message, status);
}

function epoch(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : Date.parse(value);
}

function contextIdentity(context = {}) {
  const householdId = String(context.householdId || '');
  const uid = String(context.uid || '');
  if (!householdId || !uid || householdId.length > 128 || uid.length > 128
    || /[\x00-\x1f/]/.test(householdId + uid)) {
    fail('UNAUTHORIZED', '로그인과 가구 권한을 확인해주세요.', 401);
  }
  return { householdId, uid };
}

function cleanFilters(raw, year) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('INVALID_RECOMMENDATION', '가격 검색 조건을 확인해주세요.', 400);
  }
  const input = Object.fromEntries(PRICE_FIELDS.filter((key) => Object.hasOwn(raw, key)).map((key) => [key, raw[key]]));
  if (input.regions !== undefined) {
    if (!Array.isArray(input.regions) || input.regions.some((region) => !['seoul', 'gyeonggi'].includes(region))) {
      fail('INVALID_RECOMMENDATION', '서울·경기 검색 지역을 선택해주세요.', 400);
    }
  }
  const normalized = normalizeRecommendationFilters(input, year);
  if (normalized.areaBasis === 'supply') fail('INVALID_RECOMMENDATION', '공급면적은 실거래로 판정할 수 없습니다. 전용면적을 선택해주세요.', 400);
  const filters = Object.fromEntries(PRICE_FIELDS.map((key) => [key, normalized[key]]));
  if (raw.districtCodes !== undefined) {
    if (!Array.isArray(raw.districtCodes) || raw.districtCodes.length > 100
      || raw.districtCodes.some(code => typeof code !== 'string' || !/^(11|41)\d{3}$/.test(code))) {
      fail('INVALID_RECOMMENDATION', '검색할 서울·경기 시군구를 확인해주세요.', 400);
    }
    if (raw.districtCodes.length) filters.districtCodes = [...new Set(raw.districtCodes)];
  }
  return filters;
}

function lookupId(kind, value) {
  return `${kind}_${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function searchMonths(count, time) {
  const seoul = new Date(time + 9 * 60 * 60 * 1000);
  const end = seoul.getUTCFullYear() * 12 + seoul.getUTCMonth();
  return Array.from({ length: count }, (_, offset) => {
    const index = end - offset;
    return `${Math.floor(index / 12)}${String(index % 12 + 1).padStart(2, '0')}`;
  });
}

function encodeBlob(id, value, limit = MAX_BLOB_BYTES) {
  const raw = Buffer.from(JSON.stringify(value), 'utf8');
  if (raw.byteLength > limit) fail('JOB_DATA_TOO_LARGE', '검색 자료가 너무 큽니다. 지역·기간 조건을 줄여주세요.', 413);
  const encoded = gzipSync(raw).toString('base64');
  if (Buffer.byteLength(encoded) > MAX_ENCODED_BYTES) fail('JOB_DATA_TOO_LARGE', '검색 자료가 너무 큽니다. 지역·기간 조건을 줄여주세요.', 413);
  const chunks = [];
  for (let start = 0; start < encoded.length; start += CHUNK_BYTES) chunks.push(encoded.slice(start, start + CHUNK_BYTES));
  return {
    meta: { id, chunks: chunks.length, rawBytes: raw.byteLength, sha256: createHash('sha256').update(raw).digest('hex'), encoding: 'gzip-json-v1' },
    chunks,
  };
}

function writeBlob(transaction, ref, blob, expiresAt) {
  blob.chunks.forEach((data, index) => {
    transaction.set(ref.collection('chunks').doc(`${blob.meta.id}_${index}`), { data, expiresAt });
  });
}

async function readBlob(ref, meta, limit = MAX_BLOB_BYTES, read = reference => reference.get()) {
  if (!meta || meta.encoding !== 'gzip-json-v1' || !/^[a-zA-Z0-9_-]+$/.test(meta.id || '')
    || !Number.isInteger(meta.chunks) || meta.chunks < 1 || meta.chunks > Math.ceil(MAX_ENCODED_BYTES / CHUNK_BYTES)
    || !Number.isInteger(meta.rawBytes) || meta.rawBytes < 0 || meta.rawBytes > limit) {
    fail('JOB_DATA_INVALID', '저장된 검색 자료를 확인할 수 없습니다. 다시 검색해주세요.', 500);
  }
  const snapshots = await Promise.all(Array.from({ length: meta.chunks }, (_, index) => read(ref.collection('chunks').doc(`${meta.id}_${index}`))));
  if (snapshots.some((snapshot) => !snapshot.exists)) fail('JOB_DATA_INVALID', '저장된 검색 자료 일부가 없습니다. 다시 검색해주세요.', 500);
  const encoded = snapshots.map((snapshot) => String(snapshot.data()?.data || '')).join('');
  if (Buffer.byteLength(encoded) > MAX_ENCODED_BYTES) fail('JOB_DATA_INVALID', '저장된 검색 자료의 크기가 올바르지 않습니다.', 500);
  try {
    const raw = gunzipSync(Buffer.from(encoded, 'base64'), { maxOutputLength: limit });
    if (raw.byteLength !== meta.rawBytes || createHash('sha256').update(raw).digest('hex') !== meta.sha256) throw new Error('checksum');
    const value = JSON.parse(raw.toString('utf8'));
    if (!Array.isArray(value)) throw new Error('array required');
    return value;
  } catch (_) {
    fail('JOB_DATA_INVALID', '저장된 검색 자료가 손상되었습니다. 다시 검색해주세요.', 500);
  }
}

function failureReason(message = '') {
  if (/LIMITED_NUMBER|HTTP 429|too many|rate/i.test(message)) return '국토부 호출 속도·한도 제한';
  if (/SERVICE_KEY|인증|AUTH|HTTP 401|HTTP 403/i.test(message)) return '서비스키 승인·인증 오류';
  if (/timeout|abort|fetch failed|HTTP 5\d\d/i.test(message)) return '국토부 연결 지연·서버 오류';
  return '국토부 일시 응답 오류';
}

function safeFailure(failure) {
  return {
    lawdCd: failure.lawdCd, dealYmd: failure.dealYmd, type: failure.type,
    kind: failure.kind, message: failureReason(failure.message),
    staleCacheUsed: Boolean(failure.staleCacheUsed),
  };
}

function summary(failures) {
  const groups = new Map();
  failures.forEach((failure) => {
    const reason = failure.message;
    const group = groups.get(reason) || { reason, count: 0, examples: [] };
    group.count += 1;
    if (group.examples.length < 3) group.examples.push(`${failure.lawdCd} · ${failure.dealYmd}`);
    groups.set(reason, group);
  });
  return [...groups.values()];
}

function publicJob(job, results = [], pendingPriceCandidates = []) {
  return {
    ok: job.status !== 'error', jobId: job.id, status: job.status, stage: job.stage,
    progress: { completed: job.completed, total: job.tasks.length, retryCompleted: job.retryCompleted, retryTotal: job.retryTotal },
    baseCandidateCount: job.baseCandidateCount, matchedTransactionCount: job.matchedTransactionCount,
    failedRequestCount: job.failures.length, failureSummary: summary(job.failures),
    failedRequests: job.failures.map((failure) => ({ lawdCd: failure.lawdCd, dealYmd: failure.dealYmd,
      type: failure.type, reason: failure.message })),
    completedRequestCount: job.tasks.filter((task) => task.status === 'done').length,
    staleRequestCount: job.tasks.filter((task) => task.evidenceStatus === 'stale').length,
    partialPriceCandidateCount: Number(job.partialPriceCandidateCount || 0),
    pendingPriceCandidateCount: Number(job.pendingPriceCandidateCount || 0), pendingPriceCandidates,
    retryAvailable: FINAL.has(job.status) && job.tasks.some((task) => task.status === 'failed'
      || job.resultBlob && task.status === 'retry'),
    partial: job.status === 'complete' && job.failures.length > 0,
    incompleteDistrictCodes: job.incompleteDistrictCodes,
    excludedIncompleteCandidateCount: job.excludedIncompleteCandidateCount,
    excludedIncompleteRecordCount: job.excludedIncompleteRecordCount,
    results, resultCount: results.length, totalResultCount: job.totalResultCount,
    truncated: job.totalResultCount > results.length, filters: job.filters,
    startedAt: job.startedAt, updatedAt: job.updatedAt, expiresAt: new Date(epoch(job.expiresAt)).toISOString(),
    advanceRequired: job.status === 'running',
    source: '국토교통부 아파트 매매 실거래가 · 한국부동산원 공동주택 단지정보',
    note: '가격은 조회 기간의 동일 전용면적 실제 거래를 산술평균한 값이며 현재 매물 호가가 아닙니다.',
    error: job.error || '', code: job.errorCode || '',
  };
}

/**
 * The HTTP entry point verifies membership before passing householdId/uid.
 * Members of the same household can resume a job from another device.
 * loadMonth({lawdCd, dealYmd, type, signal}) must return the matching complete
 * public MOLIT month envelope. Company positions and routes never enter jobs.
 */
export function createRecommendationJobService({ db, loadCatalog, loadMonth, now = Date.now, idFactory = randomUUID } = {}) {
  if (!db?.runTransaction || typeof loadCatalog !== 'function' || typeof loadMonth !== 'function') throw new TypeError('db, loadCatalog and loadMonth are required');
  const clock = () => epoch(now());
  const lookupRef = id => db.collection('homehunt_job_lookups').doc(id);
  const recentRef = identity => lookupRef(lookupId('recent', [identity.householdId, identity.uid]));
  const refFor = (id) => {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(String(id || ''))) fail('JOB_NOT_FOUND', '추천 작업을 찾지 못했습니다.', 404);
    return db.collection('homehunt_jobs').doc(id);
  };
  const authorize = (snapshot, context) => {
    const identity = contextIdentity(context);
    if (!snapshot.exists) fail('JOB_NOT_FOUND', '추천 작업을 찾지 못했습니다.', 404);
    const job = snapshot.data();
    // Do not expose existence or expiry to another household.
    if (job.householdId !== identity.householdId) fail('JOB_NOT_FOUND', '추천 작업을 찾지 못했습니다.', 404);
    if (epoch(job.expiresAt) <= clock()) fail('JOB_EXPIRED', '검색 결과 보관 기간이 지났습니다. 다시 검색해주세요.', 410);
    return job;
  };
  const ownsLease = (job, lease) => job.status === 'running' && job.lease?.token === lease.token
    && job.fence === lease.fence && epoch(job.lease.until) > clock() && epoch(job.expiresAt) > clock();
  const reply = async (ref, job) => {
    const [results, pending] = await Promise.all([
      job.resultBlob ? readBlob(ref, job.resultBlob, MAX_RESULT_BYTES) : [],
      job.pendingBlob ? readBlob(ref, job.pendingBlob, MAX_RESULT_BYTES) : [],
    ]);
    return publicJob(job, results, pending);
  };
  const read = async (id, context) => {
    const ref = refFor(id);
    return { ref, job: authorize(await ref.get(), context) };
  };

  // A latest-result archive contains only the already-public price response.
  // Raw monthly copies expire with their job after one day; one compact archive
  // per account survives seven days without extending price freshness.
  async function archiveRecent(job, result, context) {
    if (job.status !== 'complete') return;
    const identity = contextIdentity(context);
    const ref = recentRef(identity);
    const previous = (await ref.get()).data();
    const version = `${job.fence}:${job.resultBlob?.id || 'empty'}:${job.pendingBlob?.id || 'empty'}`;
    if (previous?.jobId !== job.id || previous.archiveVersion === version
      || previous.archiveFence > job.fence) return;
    const results = encodeBlob('latest_results', result.results, MAX_RESULT_BYTES);
    const pending = encodeBlob('latest_pending', result.pendingPriceCandidates, MAX_RESULT_BYTES);
    const expiresAt = new Date(epoch(job.updatedAt) + RECOMMENDATION_SEARCH_ARCHIVE_TTL_MS);
    const { results: ignoredResults, pendingPriceCandidates: ignoredPending, ...summary } = result;
    await db.runTransaction(async transaction => {
      const latest = (await transaction.get(ref)).data();
      if (latest?.jobId !== job.id || latest.archiveVersion === version || latest.archiveFence > job.fence) return;
      const current = (await transaction.get(refFor(job.id))).data();
      if (current?.status !== 'complete' || current.fence !== job.fence
        || current.resultBlob?.id !== job.resultBlob?.id || current.pendingBlob?.id !== job.pendingBlob?.id) return;
      writeBlob(transaction, ref, results, expiresAt);
      writeBlob(transaction, ref, pending, expiresAt);
      transaction.set(ref, { ...latest, expiresAt, archiveUpdatedAt: job.updatedAt, archiveFence: job.fence, archiveVersion: version,
        archive: summary, resultBlob: results.meta, pendingBlob: pending.meta });
    });
  }

  async function preserveRecent(job, result, context) {
    try { await archiveRecent(job, result, context); }
    catch (_) {
      // A failed optional seven-day archive must not hide successfully fetched
      // prices. The durable 24-hour job remains available for another attempt.
      return { ...result, archiveWarning: '가격 결과는 확인됐지만 7일 보관 갱신이 지연되었습니다. 다시 열면 저장을 재시도합니다.' };
    }
    return result;
  }

  async function recent(context) {
    const identity = contextIdentity(context);
    const ref = recentRef(identity);
    let pointer = (await ref.get()).data();
    if (!pointer) {
      // Existing deployments wrote jobs before latest pointers existed. This
      // one-time, account-scoped bounded migration needs no composite index.
      const collection = db.collection('homehunt_jobs');
      if (typeof collection.where === 'function') {
        const legacy = await collection.where('uid', '==', identity.uid).limit(50).get();
        const jobs = legacy.docs.map(snapshot => snapshot.data()).filter(job => job.uid === identity.uid
          && job.householdId === identity.householdId && epoch(job.expiresAt) > clock()
          && (['running', 'complete'].includes(job.status) || job.resultBlob));
        jobs.sort((left, right) => epoch(right.startedAt) - epoch(left.startedAt));
        const latest = jobs[0];
        pointer = await db.runTransaction(async transaction => {
          const existing = (await transaction.get(ref)).data();
          if (existing) return existing;
          const next = { schemaVersion: 1, ...identity, jobId: latest?.id || '',
            expiresAt: new Date(clock() + (latest ? RECOMMENDATION_SEARCH_ARCHIVE_TTL_MS : RECOMMENDATION_JOB_TTL_MS)),
            legacyRecoveryLimited: legacy.docs.length === 50 };
          transaction.set(ref, next);
          return next;
        });
      }
    }
    if (!pointer || pointer.householdId !== identity.householdId || pointer.uid !== identity.uid
      || !pointer.jobId || epoch(pointer.expiresAt) <= clock()) return { ok: true, job: null };
    try {
      const { ref: jobRef, job } = await read(pointer.jobId, context);
      if (job.status === 'cancelled' && !job.resultBlob || job.status === 'error' && !job.resultBlob) return { ok: true, job: null };
      const result = await preserveRecent(job, await reply(jobRef, job), context);
      return { ok: true, job: { ...result, stale: false, resumable: true,
        legacyRecoveryLimited: Boolean(pointer.legacyRecoveryLimited) } };
    } catch (error) {
      if (!['JOB_NOT_FOUND', 'JOB_EXPIRED'].includes(error?.code)) throw error;
    }
    // Read metadata and fixed bounded chunk IDs at one Firestore snapshot so a
    // simultaneous archive replacement cannot mix old metadata with new bytes.
    return db.runTransaction(async transaction => {
      const current = (await transaction.get(ref)).data();
      if (!current?.archive || !current.resultBlob || current.householdId !== identity.householdId
        || current.uid !== identity.uid || epoch(current.expiresAt) <= clock()) return { ok: true, job: null };
      const [results, pendingPriceCandidates] = await Promise.all([
        readBlob(ref, current.resultBlob, MAX_RESULT_BYTES, reference => transaction.get(reference)),
        current.pendingBlob ? readBlob(ref, current.pendingBlob, MAX_RESULT_BYTES, reference => transaction.get(reference)) : [],
      ]);
      return { ok: true, job: { ...current.archive, results, pendingPriceCandidates,
        stale: true, resumable: false, advanceRequired: false,
        retentionExpiresAt: new Date(epoch(current.expiresAt)).toISOString() } };
    });
  }

  async function create(rawFilters, context) {
    const identity = contextIdentity(context);
    const time = clock();
    const currentYear = new Date(time + 9 * 60 * 60 * 1000).getUTCFullYear();
    const filters = cleanFilters(rawFilters, currentYear);
    const key = lookupId('query', [identity.householdId, searchMonths(1, time)[0],
      { ...filters, ...(filters.districtCodes ? { districtCodes: [...filters.districtCodes].sort() } : {}),
        regions: [...filters.regions].sort() }]);
    const indexRef = lookupRef(key);
    const accountRef = recentRef(identity);
    const forceRefresh = rawFilters.refresh === true;
    const reusable = value => value?.householdId === identity.householdId && epoch(value.expiresAt) > clock()
      && ['running', 'complete'].includes(value.status);
    const remember = (transaction, job, previous) => {
      if (epoch(previous?.updatedAt) > time) return;
      transaction.set(accountRef, { schemaVersion: 1, ...identity, jobId: job.id,
        updatedAt: new Date(time).toISOString(), expiresAt: new Date(time + RECOMMENDATION_SEARCH_ARCHIVE_TTL_MS) });
    };
    if (!forceRefresh) {
      const reused = await db.runTransaction(async transaction => {
        const pointer = (await transaction.get(indexRef)).data();
        if (!pointer || epoch(pointer.expiresAt) <= clock()) return null;
        const job = (await transaction.get(refFor(pointer.jobId))).data();
        if (!reusable(job)) return null;
        const previous = (await transaction.get(accountRef)).data();
        if (previous?.jobId !== job.id) remember(transaction, job, previous);
        return job;
      });
      if (reused) {
        const result = await preserveRecent(reused, await reply(refFor(reused.id), reused), context);
        return { ...result, reused: true };
      }
    }
    const catalog = await loadCatalog();
    const apartments = Array.isArray(catalog) ? catalog : catalog?.apartments;
    if (filters.districtCodes) {
      const permitted = new Set((apartments || []).filter(item => filters.regions.includes(String(item.regionCode).startsWith('11') ? 'seoul' : 'gyeonggi'))
        .map(item => String(item.regionCode)));
      if (filters.districtCodes.some(code => !permitted.has(code))) fail('INVALID_RECOMMENDATION', '선택한 지역에 속한 공식 시군구를 확인해주세요.', 400);
    }
    const candidates = filterCatalogForRecommendation(apartments, filters, currentYear)
      .filter(item => !filters.districtCodes || filters.districtCodes.includes(String(item.regionCode)));
    const availableCodes = new Set(candidates.map((item) => String(item.regionCode)));
    const districtCodes = filters.districtCodes ? filters.districtCodes.filter(code => availableCodes.has(code)) : [...availableCodes].sort();
    if (districtCodes.some((code) => !/^(11|41)\d{3}$/.test(code))) fail('JOB_DATA_INVALID', '공식 검색 지역 자료를 확인해주세요.', 500);
    const tasks = districtCodes.flatMap((lawdCd) => searchMonths(filters.months, time).map((dealYmd) => ({ lawdCd, dealYmd, type: 'sale', status: 'pending', attempts: 0 })));
    if (tasks.length > MAX_TASKS) fail('JOB_DATA_TOO_LARGE', '검색 지역·기간 조건을 줄여주세요.', 413);
    const id = String(idFactory());
    const ref = refFor(id);
    const catalogBlob = encodeBlob('catalog', candidates);
    const job = {
      schemaVersion: 1, id, ...identity, filters, currentYear, tasks, catalogBlob: catalogBlob.meta,
      status: tasks.length ? 'running' : 'complete', stage: tasks.length ? 'actual-prices' : 'complete',
      completed: 0, retryCompleted: 0, retryTotal: 0, baseCandidateCount: candidates.length,
      matchedTransactionCount: 0, totalResultCount: 0, failures: [], incompleteDistrictCodes: [],
      excludedIncompleteCandidateCount: 0, excludedIncompleteRecordCount: 0,
      startedAt: new Date(time).toISOString(), updatedAt: new Date(time).toISOString(),
      expiresAt: new Date(time + RECOMMENDATION_JOB_TTL_MS), lease: null, fence: 0, error: '', errorCode: '',
    };
    const saved = await db.runTransaction(async (transaction) => {
      const pointer = !forceRefresh ? (await transaction.get(indexRef)).data() : null;
      const existing = pointer && epoch(pointer.expiresAt) > clock()
        ? (await transaction.get(refFor(pointer.jobId))).data() : null;
      if (reusable(existing)) {
        const previous = (await transaction.get(accountRef)).data();
        if (previous?.jobId !== existing.id) remember(transaction, existing, previous);
        return existing;
      }
      if ((await transaction.get(ref)).exists) fail('JOB_ID_CONFLICT', '검색 작업을 다시 시작해주세요.', 409);
      const previous = (await transaction.get(accountRef)).data();
      writeBlob(transaction, ref, catalogBlob, job.expiresAt);
      transaction.set(ref, job);
      transaction.set(indexRef, { schemaVersion: 1, householdId: identity.householdId, jobId: id, expiresAt: job.expiresAt });
      remember(transaction, job, previous);
      return job;
    });
    const result = await preserveRecent(saved, await reply(refFor(saved.id), saved), context);
    return { ...result, reused: saved.id !== id };
  }

  async function get(id, context) {
    const { ref, job } = await read(id, context);
    return preserveRecent(job, await reply(ref, job), context);
  }

  async function acquire(ref, context) {
    return db.runTransaction(async (transaction) => {
      const job = authorize(await transaction.get(ref), context);
      if (FINAL.has(job.status) || job.lease && epoch(job.lease.until) > clock()) return null;
      const fence = job.fence + 1;
      const lease = { token: randomUUID(), fence, until: new Date(clock() + RECOMMENDATION_JOB_LEASE_MS) };
      transaction.set(ref, { ...job, fence, lease, updatedAt: new Date(clock()).toISOString() });
      return lease;
    });
  }

  async function finishError(ref, lease, error) {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || !ownsLease(snapshot.data(), lease)) return;
      const job = snapshot.data();
      transaction.set(ref, { ...job, status: 'error', stage: 'error', lease: null,
        error: error instanceof RecommendationJobError ? error.message : '검색 자료를 저장하거나 읽지 못했습니다. 다시 시도해주세요.',
        errorCode: error instanceof RecommendationJobError ? error.code : 'JOB_STORAGE_ERROR',
        updatedAt: new Date(clock()).toISOString() });
    });
  }

  async function loadTask(task) {
    const controller = new AbortController();
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('MOLIT timeout')); }, MONTH_TIMEOUT_MS);
      });
      const value = await Promise.race([loadMonth({ lawdCd: task.lawdCd, dealYmd: task.dealYmd, type: task.type, signal: controller.signal }), timeout]);
      return { status: 'fulfilled', value };
    } catch (reason) {
      return { status: 'rejected', reason };
    } finally {
      clearTimeout(timer);
    }
  }

  async function checkpoint(ref, context, lease, index, outcome) {
    // Only the fetched public records are persisted; provider exceptions can
    // contain URLs/keys, so store a fixed failure category instead of messages.
    const before = authorize(await ref.get(), context);
    if (!ownsLease(before, lease)) return false;
    const task = before.tasks[index];
    const failure = recommendationMonthFailure(outcome, task);
    const evidence = recommendationMonthEvidence(outcome, task);
    const blob = evidence.status === 'missing' ? null : encodeBlob(`task_${index}_${task.attempts + 1}_${lease.fence}`, evidence.records);
    return db.runTransaction(async (transaction) => {
      const job = authorize(await transaction.get(ref), context);
      if (!ownsLease(job, lease)) return false;
      const current = job.tasks[index];
      if (current.attempts !== task.attempts || !['pending', 'retry'].includes(current.status)) return false;
      const retry = current.status === 'retry';
      const updated = { ...current, attempts: current.attempts + 1, status: failure ? retry ? 'failed' : 'retry' : 'done' };
      if (blob) {
        updated.blob = blob.meta;
        updated.evidenceStatus = evidence.status;
        updated.sourceUpdatedAt = evidence.sourceUpdatedAt;
      }
      if (failure && retry) updated.failure = safeFailure(failure);
      if (!failure) delete updated.failure;
      const tasks = job.tasks.map((item, taskIndex) => taskIndex === index ? updated : item);
      const next = { ...job, tasks, completed: job.completed + (retry ? 0 : 1),
        retryCompleted: job.retryCompleted + (retry ? 1 : 0),
        retryTotal: job.retryTotal + (failure && !retry ? 1 : 0),
        failures: tasks.filter((item) => item.status === 'failed' || item.status === 'retry' && item.failure).map((item) => item.failure),
        stage: tasks.some((item) => item.status === 'pending') ? 'actual-prices' : 'retrying',
        lease: { ...job.lease, until: new Date(clock() + RECOMMENDATION_JOB_LEASE_MS) },
        updatedAt: new Date(clock()).toISOString() };
      if (Buffer.byteLength(JSON.stringify(next)) > 700 * 1024) fail('JOB_DATA_TOO_LARGE', '검색 작업 자료가 너무 큽니다. 검색 범위를 줄여주세요.', 413);
      if (blob) writeBlob(transaction, ref, blob, job.expiresAt);
      transaction.set(ref, next);
      return true;
    });
  }

  async function finalize(ref, context, lease) {
    const job = authorize(await ref.get(), context);
    if (!ownsLease(job, lease) || job.tasks.some((task) => ['pending', 'retry'].includes(task.status))) return;
    const candidates = await readBlob(ref, job.catalogBlob);
    const records = [];
    let recordBytes = 0;
    const completeTasks = job.tasks.filter((item) => item.status === 'done' || item.evidenceStatus === 'stale' && item.blob);
    for (const task of completeTasks) recordBytes += task.blob.rawBytes;
    if (recordBytes > MAX_JOB_RECORD_BYTES) fail('JOB_DATA_TOO_LARGE', '검색 자료가 너무 큽니다. 지역·기간 조건을 줄여주세요.', 413);
    for (let start = 0; start < completeTasks.length; start += 4) {
      const batches = await Promise.all(completeTasks.slice(start, start + 4).map(task => readBlob(ref, task.blob)));
      for (const rows of batches) for (const row of rows) records.push(row);
    }
    const analysis = buildRecommendationPriceResult(candidates, records, job.failures, job.tasks, job.filters,
      job.currentYear, job.tasks.filter((task) => task.evidenceStatus === 'stale' && task.blob));
    const { results, pendingPriceCandidates, ...counts } = analysis;
    const blob = encodeBlob(`results_${lease.fence}`, results, MAX_RESULT_BYTES);
    const pendingBlob = encodeBlob(`pending_${lease.fence}`, pendingPriceCandidates, MAX_RESULT_BYTES);
    await db.runTransaction(async (transaction) => {
      const current = authorize(await transaction.get(ref), context);
      if (!ownsLease(current, lease)) return;
      writeBlob(transaction, ref, blob, current.expiresAt);
      writeBlob(transaction, ref, pendingBlob, current.expiresAt);
      transaction.set(ref, { ...current, status: 'complete', stage: 'complete', lease: null,
        resultBlob: blob.meta, pendingBlob: pendingBlob.meta, ...counts,
        updatedAt: new Date(clock()).toISOString() });
    });
  }

  async function advance(id, context) {
    const ref = refFor(id);
    const lease = await acquire(ref, context);
    if (!lease) return get(id, context);
    try {
      const job = authorize(await ref.get(), context);
      const indices = job.tasks.map((task, index) => ({ task, index }))
        .filter(({ task }) => task.status === 'pending' || task.status === 'retry')
        .sort((left, right) => left.task.attempts - right.task.attempts || left.index - right.index)
        .slice(0, RECOMMENDATION_JOB_BATCH_SIZE).map(({ index }) => index);
      for (let start = 0; start < indices.length; start += RECOMMENDATION_JOB_CONCURRENCY) {
        const current = authorize(await ref.get(), context);
        if (!ownsLease(current, lease)) break;
        const group = indices.slice(start, start + RECOMMENDATION_JOB_CONCURRENCY);
        const outcomes = await Promise.all(group.map(index => loadTask(current.tasks[index])));
        let active = true;
        for (let index = 0; index < group.length; index++) {
          if (!await checkpoint(ref, context, lease, group[index], outcomes[index])) { active = false; break; }
        }
        if (!active) break;
      }
      await finalize(ref, context, lease);
    } catch (error) {
      if (error?.code === 'JOB_EXPIRED') throw error;
      await finishError(ref, lease, error);
    } finally {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) return;
        const job = snapshot.data();
        if (job.lease?.token === lease.token && job.fence === lease.fence) transaction.set(ref, { ...job, lease: null });
      });
    }
    return get(id, context);
  }

  async function cancel(id, context) {
    const ref = refFor(id);
    await db.runTransaction(async (transaction) => {
      const job = authorize(await transaction.get(ref), context);
      if (FINAL.has(job.status)) return;
      transaction.set(ref, { ...job, status: 'cancelled', stage: 'cancelled', fence: job.fence + 1,
        lease: null, updatedAt: new Date(clock()).toISOString() });
    });
    return get(id, context);
  }

  async function retry(id, context) {
    const ref = refFor(id);
    await db.runTransaction(async (transaction) => {
      const job = authorize(await transaction.get(ref), context);
      const retryable = (task) => task.status === 'failed' || job.resultBlob && task.status === 'retry';
      if (!FINAL.has(job.status) || !job.tasks.some(retryable)) return;
      const tasks = job.tasks.map((task) => retryable(task) ? { ...task, status: 'retry' } : task);
      transaction.set(ref, { ...job, tasks, status: 'running', stage: 'retrying', lease: null, fence: job.fence + 1,
        retryCompleted: 0, retryTotal: tasks.filter((task) => task.status === 'retry').length,
        error: '', errorCode: '', updatedAt: new Date(clock()).toISOString() });
    });
    return get(id, context);
  }

  return Object.freeze({ create, get, recent, advance, cancel, retry });
}
