import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  createRecommendationJobService,
  RECOMMENDATION_JOB_BATCH_SIZE,
  RECOMMENDATION_JOB_LEASE_MS,
  RECOMMENDATION_JOB_TTL_MS,
} from '../server/recommendation-jobs.mjs';

// Transactions serialize atomically and roll back writes on error. The service
// is repeatedly recreated against this shared durable state to model instances.
function database() {
  const documents = new Map();
  let queue = Promise.resolve();
  let largestDocument = 0;
  const snapshot = (ref) => ({ exists: documents.has(ref.path), data: () => structuredClone(documents.get(ref.path)) });
  const reference = (path) => ({ path, get: async () => snapshot({ path }), collection: (name) => collection(`${path}/${name}`) });
  const collection = (path) => ({ doc: (id) => reference(`${path}/${id}`) });
  return {
    documents, collection, get largestDocument() { return largestDocument; },
    runTransaction(action) {
      const pending = queue.then(async () => {
        const writes = [];
        const result = await action({
          get: async (ref) => snapshot(ref),
          set: (ref, value) => writes.push([ref.path, structuredClone(value)]),
        });
        for (const [path, value] of writes) {
          const bytes = Buffer.byteLength(JSON.stringify(value));
          assert.ok(bytes < 1024 * 1024, `Firestore document too large: ${path} (${bytes})`);
          largestDocument = Math.max(largestDocument, bytes);
          documents.set(path, value);
        }
        return result;
      });
      queue = pending.catch(() => {});
      return pending;
    },
  };
}

const owner = { householdId: 'couple', uid: 'person-a' };
const partner = { householdId: 'couple', uid: 'person-b' };
const stranger = { householdId: 'another-couple', uid: 'stranger' };
const initialTime = Date.parse('2026-09-08T01:00:00.000Z');
const filters = { regions: ['gyeonggi'], minHouseholds: 100, maxPriceManWon: 60000, minAreaM2: 50, maxAgeYears: 30, months: 1 };
function apartment(regionCode = '41135', suffix = '') {
  return { catalogId: `apt-${regionCode}${suffix}`, regionCode, name: `단지${suffix}`, dong: '테스트동', aliases: [], households: 500, builtYear: 2005 };
}
function month(task, amountManWon = 55000) {
  return { lawdCd: task.lawdCd, dealYmd: task.dealYmd, type: task.type, records: [{
    regionCode: task.lawdCd, apartmentName: '단지', dong: '테스트동', builtYear: 2005,
    dealType: '매매', aptSeq: 'test-seq', areaM2: 59.9, amountManWon,
    month: `${task.dealYmd.slice(0, 4)}-${task.dealYmd.slice(4)}`, day: 1,
  }] };
}
function setup(options = {}) {
  const db = options.db || database();
  let time = options.time ?? initialTime;
  let id = 0;
  const calls = [];
  const loadMonth = options.loadMonth || (async (task) => { calls.push(task); return month(task); });
  const args = { db, loadCatalog: options.loadCatalog || (async () => ({ apartments: [apartment()] })), loadMonth,
    now: () => time, idFactory: () => `job-${++id}` };
  return { db, calls, args, service: createRecommendationJobService(args),
    setTime(value) { time = value; }, restart(overrides = {}) { return createRecommendationJobService({ ...args, ...overrides }); } };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('create persists only price filters and starts no provider work until advance', async () => {
  const env = setup();
  const result = await env.service.create({ ...filters, destinations: [{ lat: 37, lng: 127, company: 'private-company' }],
    companyAddress: 'private-address', commuteMaxMinutes: 90, commuteModes: ['transit'], query: 'private-query' }, owner);
  assert.equal(result.status, 'running');
  assert.equal(result.advanceRequired, true);
  assert.equal(result.progress.total, 1);
  assert.equal(env.calls.length, 0);
  assert.deepEqual(result.results, []);
  const data = env.db.documents.get('homehunt_jobs/job-1');
  assert.equal(data.uid, owner.uid);
  assert.equal(data.householdId, owner.householdId);
  assert.equal(data.filters.maxPriceManWon, 60000);
  assert.ok(!Object.hasOwn(data.filters, 'commuteMaxMinutes'));
  assert.ok(!JSON.stringify([...env.db.documents]).includes('private-'));
  assert.equal(data.expiresAt.getTime(), initialTime + RECOMMENDATION_JOB_TTL_MS);
  assert.ok([...env.db.documents.values()].every((value) => value.expiresAt instanceof Date));
});

test('advance completes a real core aggregation and other household member can resume it after restart', async () => {
  const env = setup();
  const created = await env.service.create(filters, owner);
  const restarted = env.restart({ loadCatalog: () => { throw new Error('Catalog must come from the saved snapshot'); } });
  const result = await restarted.advance(created.jobId, partner);
  assert.equal(result.status, 'complete');
  assert.equal(result.advanceRequired, false);
  assert.equal(result.resultCount, 1);
  assert.equal(result.results[0].bestArea.averagePriceManWon, 55000);
  assert.equal(result.results[0].priceVerified, true);
  assert.equal(result.results[0].transportVerified, false);
  assert.equal(result.matchedTransactionCount, 1);
  assert.equal(result.progress.completed, 1);
  assert.equal(env.calls[0].signal instanceof AbortSignal, true);
  const stored = await env.restart().get(created.jobId, owner);
  assert.deepEqual(stored, result);
  await restarted.advance(created.jobId, owner);
  assert.equal(env.calls.length, 1);
});

test('an advance is bounded to eight tasks and checkpointed successes are reused by a new instance', async () => {
  const apartments = Array.from({ length: 12 }, (_, index) => apartment(`41${String(index + 100).padStart(3, '0')}`));
  const env = setup({ loadCatalog: async () => ({ apartments }) });
  const created = await env.service.create(filters, owner);
  const first = await env.service.advance(created.jobId, owner);
  assert.equal(first.status, 'running');
  assert.equal(first.progress.completed, RECOMMENDATION_JOB_BATCH_SIZE);
  assert.equal(env.calls.length, 8);
  const finished = await env.restart().advance(created.jobId, owner);
  assert.equal(finished.status, 'complete');
  assert.equal(finished.resultCount, 12);
  assert.equal(env.calls.length, 12);
  assert.equal(new Set(env.calls.map((task) => `${task.lawdCd}/${task.dealYmd}`)).size, 12);
});

test('same-month one-time retry succeeds without throwing away other successful months', async () => {
  let count = 0;
  const env = setup({ loadMonth: async (task) => {
    count += 1;
    if (count === 1) throw new Error('fetch failed https://provider.invalid?serviceKey=never-store-this');
    return month(task);
  } });
  const created = await env.service.create({ ...filters, months: 2 }, owner);
  const first = await env.service.advance(created.jobId, owner);
  assert.equal(first.status, 'running');
  assert.equal(first.progress.completed, 2);
  assert.equal(first.progress.retryTotal, 1);
  assert.equal(first.failedRequestCount, 0);
  const done = await env.restart().advance(created.jobId, owner);
  assert.equal(done.status, 'complete');
  assert.equal(done.resultCount, 1);
  assert.equal(done.results[0].bestArea.count, 2);
  assert.equal(done.progress.retryCompleted, 1);
  assert.equal(count, 3);
  assert.ok(!JSON.stringify([...env.db.documents]).includes('never-store-this'));
});

test('a stale/partial month still fails after its single retry and excludes its whole district', async () => {
  const calls = [];
  const env = setup({ loadCatalog: async () => ({ apartments: [apartment('41135'), apartment('41465')] }),
    loadMonth: async (task) => {
      calls.push(task);
      const value = month(task);
      return task.lawdCd === '41135' && task.dealYmd === '202608'
        ? { ...value, warning: { staleCacheUsed: true, reason: 'fetch failed secret-origin' } } : value;
    } });
  const created = await env.service.create({ ...filters, months: 2 }, owner);
  await env.service.advance(created.jobId, owner);
  const done = await env.restart().advance(created.jobId, owner);
  assert.equal(done.status, 'complete');
  assert.equal(done.partial, true);
  assert.equal(done.failedRequestCount, 1);
  assert.equal(done.resultCount, 1);
  assert.equal(done.results[0].regionCode, '41465');
  assert.deepEqual(done.incompleteDistrictCodes, ['41135']);
  assert.equal(done.excludedIncompleteCandidateCount, 1);
  assert.equal(done.excludedIncompleteRecordCount, 1);
  assert.equal(done.failureSummary[0].count, 1);
  assert.equal(calls.length, 5);
  assert.ok(!JSON.stringify([...env.db.documents]).includes('secret-origin'));
});

test('total upstream failure is an error with failure counts, not a successful zero-candidate search', async () => {
  let calls = 0;
  const env = setup({ loadMonth: async () => { calls += 1; throw new Error('HTTP 403 SERVICE_KEY'); } });
  const created = await env.service.create(filters, owner);
  await env.service.advance(created.jobId, owner);
  const failed = await env.service.advance(created.jobId, owner);
  assert.equal(failed.ok, false);
  assert.equal(failed.status, 'error');
  assert.equal(failed.code, 'MOLIT_UNAVAILABLE');
  assert.equal(failed.failedRequestCount, 1);
  assert.equal(failed.failureSummary[0].reason, '서비스키 승인·인증 오류');
  assert.equal(calls, 2);
  await env.service.advance(created.jobId, owner);
  assert.equal(calls, 2);
});

test('overlapping advances run one worker and a cancelled worker cannot checkpoint or start another task', async () => {
  const entered = deferred();
  const response = deferred();
  let calls = 0;
  const env = setup({ loadMonth: async (task) => { calls += 1; entered.resolve(); await response.promise; return month(task); } });
  const created = await env.service.create({ ...filters, months: 2 }, owner);
  const first = env.service.advance(created.jobId, owner);
  await entered.promise;
  const other = await env.restart().advance(created.jobId, partner);
  assert.equal(other.status, 'running');
  assert.equal(calls, 1);
  const cancelled = await env.restart().cancel(created.jobId, partner);
  assert.equal(cancelled.status, 'cancelled');
  response.resolve();
  const finished = await first;
  assert.equal(finished.status, 'cancelled');
  assert.equal(finished.progress.completed, 0);
  assert.equal(calls, 1);
  assert.ok(![...env.db.documents.keys()].some((path) => path.includes('/chunks/task_')));
});

test('expired lease permits another instance to recover and fences the old late result', async () => {
  const entered = deferred();
  const response = deferred();
  let calls = 0;
  const env = setup({ loadMonth: async (task) => {
    calls += 1;
    if (calls === 1) { entered.resolve(); await response.promise; return month(task, 50000); }
    return month(task, 59000);
  } });
  const created = await env.service.create(filters, owner);
  const old = env.service.advance(created.jobId, owner);
  await entered.promise;
  env.setTime(initialTime + RECOMMENDATION_JOB_LEASE_MS + 1);
  const recovered = await env.restart().advance(created.jobId, partner);
  assert.equal(recovered.status, 'complete');
  assert.equal(recovered.results[0].bestArea.averagePriceManWon, 59000);
  response.resolve();
  assert.equal((await old).results[0].bestArea.averagePriceManWon, 59000);
  assert.equal(env.db.documents.get('homehunt_jobs/job-1').fence, 2);
  assert.ok(![...env.db.documents.keys()].some((path) => path.includes('/chunks/task_0_1_1_')));
});

test('another household cannot read, advance or cancel even if the job id is known', async () => {
  const env = setup();
  const created = await env.service.create(filters, owner);
  for (const method of ['get', 'advance', 'cancel']) {
    await assert.rejects(env.service[method](created.jobId, stranger), { code: 'JOB_NOT_FOUND', status: 404 });
  }
  await assert.rejects(env.service.create(filters, {}), { code: 'UNAUTHORIZED', status: 401 });
  assert.equal(env.calls.length, 0);
});

test('job expires after 24 hours even before Firestore TTL physically deletes it', async () => {
  const env = setup();
  const created = await env.service.create(filters, owner);
  env.setTime(initialTime + RECOMMENDATION_JOB_TTL_MS);
  for (const method of ['get', 'advance', 'cancel']) {
    await assert.rejects(env.service[method](created.jobId, owner), { code: 'JOB_EXPIRED', status: 410 });
  }
  await assert.rejects(env.service.get(created.jobId, stranger), { code: 'JOB_NOT_FOUND', status: 404 });
  assert.equal(env.calls.length, 0);
});

test('KST month boundary and saved catalog/year remain fixed when a job resumes later', async () => {
  const env = setup({ time: Date.parse('2026-12-31T15:01:00Z') });
  const created = await env.service.create({ ...filters, months: 2 }, owner);
  env.setTime(Date.parse('2027-01-01T01:01:00Z'));
  const done = await env.restart().advance(created.jobId, owner);
  assert.equal(done.status, 'complete');
  assert.deepEqual(env.calls.map((task) => task.dealYmd), ['202701', '202612']);
  assert.equal(done.filters.minBuiltYear, 1997);
});

test('large public month payload uses bounded chunk documents and survives instance restart', async () => {
  const noise = randomBytes(1100 * 1024).toString('base64');
  const env = setup({ loadMonth: async (task) => {
    const result = month(task);
    result.records[0].sourceNote = noise;
    return result;
  } });
  const created = await env.service.create(filters, owner);
  const done = await env.service.advance(created.jobId, owner);
  assert.equal(done.status, 'complete');
  assert.equal((await env.restart().get(created.jobId, partner)).resultCount, 1);
  assert.ok([...env.db.documents.keys()].filter((path) => path.includes('/chunks/task_')).length >= 3);
  assert.ok(env.db.largestDocument < 500 * 1024);
  assert.ok(Buffer.byteLength(JSON.stringify(env.db.documents.get('homehunt_jobs/job-1'))) < 20 * 1024);
});

test('missing persisted record chunk fails closed instead of publishing an incomplete result', async () => {
  const apartments = Array.from({ length: 9 }, (_, index) => apartment(`41${String(index + 100).padStart(3, '0')}`));
  const env = setup({ loadCatalog: async () => ({ apartments }) });
  const created = await env.service.create(filters, owner);
  await env.service.advance(created.jobId, owner);
  env.db.documents.delete([...env.db.documents.keys()].find((path) => path.includes('/chunks/task_0_')));
  const done = await env.restart().advance(created.jobId, owner);
  assert.equal(done.ok, false);
  assert.equal(done.status, 'error');
  assert.equal(done.code, 'JOB_DATA_INVALID');
  assert.deepEqual(done.results, []);
});

test('no matching catalog entries completes honestly without an upstream call', async () => {
  const env = setup({ loadCatalog: async () => ({ apartments: [] }) });
  const created = await env.service.create(filters, owner);
  assert.equal(created.status, 'complete');
  assert.equal(created.resultCount, 0);
  assert.equal(created.failedRequestCount, 0);
  assert.equal(env.calls.length, 0);
  assert.equal((await env.service.advance(created.jobId, owner)).status, 'complete');
});

test('untrusted region values, supply-area conditions, and document path ids are rejected', async () => {
  const env = setup();
  await assert.rejects(env.service.create({ ...filters, regions: ['arbitrary-private-text'] }, owner), { code: 'INVALID_RECOMMENDATION' });
  await assert.rejects(env.service.create({ ...filters, areaBasis: 'supply' }, owner), { code: 'INVALID_RECOMMENDATION' });
  await assert.rejects(env.service.get('../other', owner), { code: 'JOB_NOT_FOUND' });
  assert.equal(env.db.documents.size, 0);
});
