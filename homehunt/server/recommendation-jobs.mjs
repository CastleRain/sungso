import { randomUUID, createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import {
  aggregateRecommendationRecords,
  filterCatalogForRecommendation,
  normalizeRecommendationFilters,
} from '../js/recommendation-core.mjs';
import {
  completeRecommendationScope,
  recommendationMonthFailure,
} from '../scripts/recommendation-data-safety.mjs';

// Every advance is awaited by its HTTP handler. No background promise, local
// file, or process-local job map is needed to resume after an instance stops.
export const RECOMMENDATION_JOB_TTL_MS = 24 * 60 * 60 * 1000;
// Longer than eight worst-case month timeouts; each checkpoint also renews it.
// The final chunk reads/aggregation therefore have a fresh six-minute lease.
export const RECOMMENDATION_JOB_LEASE_MS = 6 * 60 * 1000;
export const RECOMMENDATION_JOB_BATCH_SIZE = 8;
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
  return Object.fromEntries(PRICE_FIELDS.map((key) => [key, normalized[key]]));
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

async function readBlob(ref, meta, limit = MAX_BLOB_BYTES) {
  if (!meta || meta.encoding !== 'gzip-json-v1' || !/^[a-zA-Z0-9_-]+$/.test(meta.id || '')
    || !Number.isInteger(meta.chunks) || meta.chunks < 1 || meta.chunks > Math.ceil(MAX_ENCODED_BYTES / CHUNK_BYTES)
    || !Number.isInteger(meta.rawBytes) || meta.rawBytes < 0 || meta.rawBytes > limit) {
    fail('JOB_DATA_INVALID', '저장된 검색 자료를 확인할 수 없습니다. 다시 검색해주세요.', 500);
  }
  const snapshots = await Promise.all(Array.from({ length: meta.chunks }, (_, index) => ref.collection('chunks').doc(`${meta.id}_${index}`).get()));
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

function publicJob(job, results = []) {
  return {
    ok: job.status !== 'error', jobId: job.id, status: job.status, stage: job.stage,
    progress: { completed: job.completed, total: job.tasks.length, retryCompleted: job.retryCompleted, retryTotal: job.retryTotal },
    baseCandidateCount: job.baseCandidateCount, matchedTransactionCount: job.matchedTransactionCount,
    failedRequestCount: job.failures.length, failureSummary: summary(job.failures),
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
  const reply = async (ref, job) => publicJob(job, job.status === 'complete' && job.resultBlob ? await readBlob(ref, job.resultBlob, MAX_RESULT_BYTES) : []);
  const read = async (id, context) => {
    const ref = refFor(id);
    return { ref, job: authorize(await ref.get(), context) };
  };

  async function create(rawFilters, context) {
    const identity = contextIdentity(context);
    const time = clock();
    const currentYear = new Date(time + 9 * 60 * 60 * 1000).getUTCFullYear();
    const filters = cleanFilters(rawFilters, currentYear);
    const catalog = await loadCatalog();
    const candidates = filterCatalogForRecommendation(Array.isArray(catalog) ? catalog : catalog?.apartments, filters, currentYear);
    const districtCodes = [...new Set(candidates.map((item) => String(item.regionCode)))].sort();
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
    await db.runTransaction(async (transaction) => {
      if ((await transaction.get(ref)).exists) fail('JOB_ID_CONFLICT', '검색 작업을 다시 시작해주세요.', 409);
      writeBlob(transaction, ref, catalogBlob, job.expiresAt);
      transaction.set(ref, job);
    });
    return publicJob(job);
  }

  async function get(id, context) {
    const { ref, job } = await read(id, context);
    return reply(ref, job);
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
    const blob = failure ? null : encodeBlob(`task_${index}_${task.attempts + 1}_${lease.fence}`, outcome.value.records);
    return db.runTransaction(async (transaction) => {
      const job = authorize(await transaction.get(ref), context);
      if (!ownsLease(job, lease)) return false;
      const current = job.tasks[index];
      if (current.attempts !== task.attempts || !['pending', 'retry'].includes(current.status)) return false;
      const retry = current.attempts === 1;
      const updated = { ...current, attempts: current.attempts + 1, status: failure ? retry ? 'failed' : 'retry' : 'done' };
      if (blob) updated.blob = blob.meta;
      if (failure && retry) updated.failure = safeFailure(failure);
      const tasks = job.tasks.map((item, taskIndex) => taskIndex === index ? updated : item);
      const next = { ...job, tasks, completed: job.completed + (retry ? 0 : 1),
        retryCompleted: job.retryCompleted + (retry ? 1 : 0),
        retryTotal: job.retryTotal + (failure && !retry ? 1 : 0),
        failures: tasks.filter((item) => item.status === 'failed').map((item) => item.failure),
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
    for (const task of job.tasks.filter((item) => item.status === 'done')) {
      recordBytes += task.blob.rawBytes;
      if (recordBytes > MAX_JOB_RECORD_BYTES) fail('JOB_DATA_TOO_LARGE', '검색 자료가 너무 큽니다. 지역·기간 조건을 줄여주세요.', 413);
      const rows = await readBlob(ref, task.blob);
      for (const row of rows) records.push(row);
    }
    if (!records.length && job.failures.length) fail('MOLIT_UNAVAILABLE', '국토부 실거래를 불러오지 못했습니다. 연결 상태를 확인하고 다시 검색해주세요.', 502);
    const scope = completeRecommendationScope(candidates, records, job.failures);
    const results = aggregateRecommendationRecords(scope.candidates, scope.records, job.filters, job.currentYear);
    const blob = encodeBlob(`results_${lease.fence}`, results, MAX_RESULT_BYTES);
    await db.runTransaction(async (transaction) => {
      const current = authorize(await transaction.get(ref), context);
      if (!ownsLease(current, lease)) return;
      writeBlob(transaction, ref, blob, current.expiresAt);
      transaction.set(ref, { ...current, status: 'complete', stage: 'complete', lease: null,
        resultBlob: blob.meta, totalResultCount: results.length,
        matchedTransactionCount: results.reduce((sum, item) => sum + Number(item.actualDealCount || 0), 0),
        incompleteDistrictCodes: scope.incompleteDistrictCodes,
        excludedIncompleteCandidateCount: scope.excludedCandidateCount,
        excludedIncompleteRecordCount: scope.excludedRecordCount,
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
      for (const index of indices) {
        const current = authorize(await ref.get(), context);
        if (!ownsLease(current, lease)) break;
        const outcome = await loadTask(current.tasks[index]);
        if (!await checkpoint(ref, context, lease, index, outcome)) break;
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

  return Object.freeze({ create, get, advance, cancel });
}
