import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  createRecommendationJobService,
  RECOMMENDATION_JOB_BATCH_SIZE,
  RECOMMENDATION_JOB_CONCURRENCY,
  RECOMMENDATION_JOB_LEASE_MS,
  RECOMMENDATION_JOB_TTL_MS,
  RECOMMENDATION_SEARCH_ARCHIVE_TTL_MS,
} from '../server/recommendation-jobs.mjs';

// Transactions serialize atomically and roll back writes on error. The service
// is repeatedly recreated against this shared durable state to model instances.
function database() {
  const documents = new Map();
  let queue = Promise.resolve();
  let largestDocument = 0;
  const hooks = { afterGet: null, failArchiveWrites: false };
  const snapshot = (ref) => ({ exists: documents.has(ref.path), data: () => structuredClone(documents.get(ref.path)) });
  const reference = (path) => ({ path, get: async () => {
    const value = snapshot({ path });
    if (hooks.afterGet) await hooks.afterGet(path, value);
    return value;
  }, collection: (name) => collection(`${path}/${name}`) });
  const collection = (path) => ({ doc: (id) => reference(`${path}/${id}`),
    where: (field, operator, value) => ({ limit: count => ({ get: async () => {
      assert.equal(operator, '==');
      const docs = [...documents].filter(([key, row]) => key.startsWith(`${path}/`)
        && key.split('/').length === path.split('/').length + 1 && row[field] === value)
        .slice(0, count).map(([key]) => snapshot(reference(key)));
      return { docs };
    } }) }) });
  return {
    documents, collection, hooks, get largestDocument() { return largestDocument; },
    runTransaction(action) {
      const pending = queue.then(async () => {
        const writes = [];
        const result = await action({
          get: async (ref) => snapshot(ref),
          set: (ref, value) => {
            if (hooks.failArchiveWrites && value.archive) throw new Error('private database write failure');
            writes.push([ref.path, structuredClone(value)]);
          },
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

test('a partial month still fails after its single retry while validated other months remain provisional', async () => {
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
  assert.equal(done.resultCount, 2);
  const partial = done.results.find((item) => item.regionCode === '41135');
  assert.equal(partial.priceProvisional, true);
  assert.equal(partial.bestArea.count, 1);
  assert.equal(partial.priceCoverage.completedMonthCount, 1);
  assert.deepEqual(partial.priceCoverage.missingMonths, ['202608']);
  assert.deepEqual(done.incompleteDistrictCodes, ['41135']);
  assert.equal(done.excludedIncompleteCandidateCount, 0);
  assert.equal(done.excludedIncompleteRecordCount, 0);
  assert.equal(done.failureSummary[0].count, 1);
  assert.equal(calls.length, 5);
  assert.ok(!JSON.stringify([...env.db.documents]).includes('secret-origin'));
});

test('total upstream failure preserves base apartments as explicit price-pending entries', async () => {
  let calls = 0;
  const env = setup({ loadMonth: async () => { calls += 1; throw new Error('HTTP 403 SERVICE_KEY'); } });
  const created = await env.service.create(filters, owner);
  await env.service.advance(created.jobId, owner);
  const failed = await env.service.advance(created.jobId, owner);
  assert.equal(failed.ok, true);
  assert.equal(failed.status, 'complete');
  assert.equal(failed.partial, true);
  assert.equal(failed.resultCount, 0);
  assert.equal(failed.pendingPriceCandidateCount, 1);
  assert.equal(failed.pendingPriceCandidates[0].priceVerified, false);
  assert.equal(failed.pendingPriceCandidates[0].bestArea, undefined);
  assert.equal(failed.retryAvailable, true);
  assert.equal(failed.failedRequestCount, 1);
  assert.equal(failed.failureSummary[0].reason, '서비스키 승인·인증 오류');
  assert.equal(calls, 2);
  await env.service.advance(created.jobId, owner);
  assert.equal(calls, 2);
});

test('overlapping advances run one bounded pair and cancellation prevents checkpoints or a later pair', async () => {
  const entered = deferred();
  const response = deferred();
  let calls = 0;
  const env = setup({ loadMonth: async (task) => { calls += 1; entered.resolve(); await response.promise; return month(task); } });
  const created = await env.service.create({ ...filters, months: 4 }, owner);
  const first = env.service.advance(created.jobId, owner);
  await entered.promise;
  const other = await env.restart().advance(created.jobId, partner);
  assert.equal(other.status, 'running');
  assert.equal(calls, RECOMMENDATION_JOB_CONCURRENCY);
  const cancelled = await env.restart().cancel(created.jobId, partner);
  assert.equal(cancelled.status, 'cancelled');
  response.resolve();
  const finished = await first;
  assert.equal(finished.status, 'cancelled');
  assert.equal(finished.progress.completed, 0);
  assert.equal(calls, RECOMMENDATION_JOB_CONCURRENCY);
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
  for (const method of ['get', 'advance', 'cancel', 'retry']) {
    await assert.rejects(env.service[method](created.jobId, stranger), { code: 'JOB_NOT_FOUND', status: 404 });
  }
  await assert.rejects(env.service.create(filters, {}), { code: 'UNAUTHORIZED', status: 401 });
  assert.equal(env.calls.length, 0);
});

test('job expires after 24 hours even before Firestore TTL physically deletes it', async () => {
  const env = setup();
  const created = await env.service.create(filters, owner);
  env.setTime(initialTime + RECOMMENDATION_JOB_TTL_MS);
  for (const method of ['get', 'advance', 'cancel', 'retry']) {
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


test('explicit retry reuses saved successes, survives restart, and replaces stale samples without duplicates', async () => {
  let recovered = false;
  const calls = [];
  const env = setup({ loadMonth: async (task) => {
    calls.push(task.dealYmd);
    const value = month(task, recovered ? 59000 : 50000);
    if (task.dealYmd === '202608' && !recovered) return { ...value, updatedAt: '2026-09-01T00:00:00Z',
      warning: { staleCacheUsed: true } };
    return value;
  } });
  const created = await env.service.create({ ...filters, months: 2 }, owner);
  await env.service.advance(created.jobId, owner);
  const initial = await env.service.advance(created.jobId, owner);
  assert.equal(initial.results[0].bestArea.count, 2);
  assert.equal(initial.results[0].priceCoverage.status, 'stale');
  assert.equal(initial.results[0].priceCoverage.sourceUpdatedAt, '2026-09-01T00:00:00Z');
  assert.equal(initial.staleRequestCount, 1);
  recovered = true;
  const retry = await env.restart().retry(created.jobId, partner);
  assert.equal(retry.jobId, initial.jobId);
  assert.equal(retry.status, 'running');
  assert.equal(retry.results[0].bestArea.count, 2, 'existing result remains available during retry');
  await env.restart().retry(created.jobId, partner);
  const done = await env.restart().advance(created.jobId, owner);
  assert.equal(done.partial, false);
  assert.equal(done.retryAvailable, false);
  assert.equal(done.results[0].priceCoverage.status, 'complete');
  assert.equal(done.results[0].bestArea.count, 2);
  assert.equal(done.results[0].bestArea.averagePriceManWon, 54500);
  assert.deepEqual(calls, ['202609', '202608', '202608', '202608']);
  await env.service.retry(created.jobId, owner);
  await env.service.advance(created.jobId, owner);
  assert.equal(calls.length, 4);
});

test('a failing explicit retry retains earlier results and remains retryable', async () => {
  const env = setup({ loadMonth: async (task) => {
    if (task.dealYmd === '202608') throw new Error('fetch failed');
    return month(task);
  } });
  const created = await env.service.create({ ...filters, months: 2 }, owner);
  await env.service.advance(created.jobId, owner);
  const before = await env.service.advance(created.jobId, owner);
  await env.service.retry(created.jobId, owner);
  const after = await env.service.advance(created.jobId, owner);
  assert.deepEqual(after.results, before.results);
  assert.equal(after.failedRequestCount, 1);
  assert.equal(after.retryAvailable, true);
  assert.equal(after.progress.retryCompleted, 1);
  assert.equal(after.progress.completed, 2);
});


test('cancelling a manual retry retains published results and can resume only the unfinished refresh', async () => {
  let pause = false;
  const entered = deferred();
  const release = deferred();
  const env = setup({ loadMonth: async (task) => {
    if (task.dealYmd === '202608') {
      if (pause) { entered.resolve(); await release.promise; return month(task); }
      throw new Error('fetch failed');
    }
    return month(task);
  } });
  const created = await env.service.create({ ...filters, months: 2 }, owner);
  await env.service.advance(created.jobId, owner);
  const initial = await env.service.advance(created.jobId, owner);
  pause = true;
  await env.service.retry(created.jobId, owner);
  const worker = env.service.advance(created.jobId, owner);
  await entered.promise;
  const cancelled = await env.service.cancel(created.jobId, partner);
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(cancelled.results, initial.results);
  assert.equal(cancelled.retryAvailable, true);
  release.resolve();
  await worker;
  await env.service.retry(created.jobId, owner);
  const completed = await env.service.advance(created.jobId, owner);
  assert.equal(completed.results[0].bestArea.count, 2);
  assert.equal(completed.failedRequestCount, 0);
});

test('identical public price searches reuse a completed household job without catalog or month work', async () => {
  const env = setup();
  const created = await env.service.create(filters, owner);
  const finished = await env.service.advance(created.jobId, owner);
  const reused = await env.restart({ loadCatalog: () => { throw new Error('must reuse saved catalog'); } })
    .create({ ...filters, companyAddress: 'private-new-office', destinations: [{ lat: 37, lng: 127 }] }, partner);
  assert.equal(reused.jobId, created.jobId);
  assert.equal(reused.reused, true);
  assert.deepEqual(reused.results, finished.results);
  assert.equal(env.calls.length, 1);
  assert.equal((await env.service.recent(partner)).job.jobId, created.jobId);
  assert.ok(!JSON.stringify([...env.db.documents]).includes('private-new-office'));
});

test('concurrent creation shares one durable job while each member remembers that search', async () => {
  const entered = deferred();
  const release = deferred();
  let catalogCalls = 0;
  const env = setup({ loadCatalog: async () => {
    if (++catalogCalls === 2) entered.resolve();
    await release.promise;
    return { apartments: [apartment()] };
  } });
  const left = env.service.create(filters, owner);
  const right = env.restart().create(filters, partner);
  await entered.promise;
  release.resolve();
  const [a, b] = await Promise.all([left, right]);
  assert.equal(a.jobId, b.jobId);
  assert.equal([a, b].filter(result => result.reused).length, 1);
  assert.equal([...env.db.documents.keys()].filter(path => /^homehunt_jobs\/[^/]+$/.test(path)).length, 1);
  assert.equal((await env.service.recent(owner)).job.jobId, a.jobId);
  assert.equal((await env.service.recent(partner)).job.jobId, a.jobId);
  assert.equal(env.calls.length, 0);
});

test('recent search is account scoped, resumes after restart, and never advances provider work', async () => {
  const env = setup();
  assert.deepEqual(await env.service.recent(owner), { ok: true, job: null });
  const created = await env.service.create(filters, owner);
  const recent = await env.restart().recent(owner);
  assert.equal(recent.job.jobId, created.jobId);
  assert.equal(recent.job.status, 'running');
  assert.equal(recent.job.stale, false);
  assert.equal(recent.job.resumable, true);
  assert.equal(recent.job.advanceRequired, true);
  assert.deepEqual(await env.service.recent(partner), { ok: true, job: null });
  assert.deepEqual(await env.service.recent(stranger), { ok: true, job: null });
  assert.equal(env.calls.length, 0);
  await assert.rejects(env.service.recent({}), { code: 'UNAUTHORIZED' });
});

test('compact latest price archive survives raw-job deletion with honest 24h freshness and seven-day retention', async () => {
  const env = setup();
  const created = await env.service.create(filters, owner);
  const finished = await env.service.advance(created.jobId, owner);
  env.setTime(initialTime + RECOMMENDATION_JOB_TTL_MS + 1);
  for (const path of env.db.documents.keys()) if (path.startsWith('homehunt_jobs/')) env.db.documents.delete(path);
  const recent = await env.restart().recent(owner);
  assert.equal(recent.job.stale, true);
  assert.equal(recent.job.resumable, false);
  assert.equal(recent.job.advanceRequired, false);
  assert.deepEqual(recent.job.results, finished.results);
  assert.equal(recent.job.expiresAt, new Date(initialTime + RECOMMENDATION_JOB_TTL_MS).toISOString());
  assert.equal(recent.job.retentionExpiresAt, new Date(initialTime + RECOMMENDATION_SEARCH_ARCHIVE_TTL_MS).toISOString());
  assert.equal(env.calls.length, 1);
  const archives = [...env.db.documents].filter(([path, value]) => path.startsWith('homehunt_job_lookups/recent_') && value.archive);
  assert.equal(archives.length, 1);
  assert.equal(archives[0][1].archive.tasks, undefined);
  assert.equal(archives[0][1].archive.catalogBlob, undefined);
  assert.equal(archives[0][1].archive.destinations, undefined);
  env.setTime(initialTime + RECOMMENDATION_SEARCH_ARCHIVE_TTL_MS);
  assert.deepEqual(await env.restart().recent(owner), { ok: true, job: null });
});

test('reopening a completed result does not rewrite its archive or extend source freshness', async () => {
  const env = setup();
  const created = await env.service.create(filters, owner);
  await env.service.advance(created.jobId, owner);
  const before = JSON.stringify([...env.db.documents]);
  env.setTime(initialTime + 60 * 60 * 1000);
  await env.restart().get(created.jobId, owner);
  await env.restart().recent(owner);
  await env.restart().create(filters, owner);
  assert.equal(JSON.stringify([...env.db.documents]), before);
  assert.equal(env.calls.length, 1);
});

test('explicit refresh creates a new job while cancel and failure never become reusable searches', async () => {
  const env = setup();
  const first = await env.service.create(filters, owner);
  const refreshed = await env.service.create({ ...filters, refresh: true }, owner);
  assert.notEqual(refreshed.jobId, first.jobId);
  assert.equal(refreshed.reused, false);
  assert.equal(refreshed.filters.refresh, undefined);
  await env.service.cancel(refreshed.jobId, owner);
  assert.deepEqual(await env.service.recent(owner), { ok: true, job: null });
  const next = await env.service.create(filters, owner);
  assert.notEqual(next.jobId, refreshed.jobId);
  const raw = env.db.documents.get(`homehunt_jobs/${next.jobId}`);
  raw.status = 'error';
  const final = await env.service.create(filters, owner);
  assert.notEqual(final.jobId, next.jobId);
});

test('expired price reuse creates a fresh job and KST month changes cannot reuse the old month set', async () => {
  const env = setup({ time: Date.parse('2026-09-30T14:30:00Z') });
  const created = await env.service.create(filters, owner);
  env.setTime(Date.parse('2026-09-30T15:01:00Z'));
  const next = await env.service.create(filters, owner);
  assert.notEqual(next.jobId, created.jobId);
  env.setTime(Date.parse('2026-09-30T15:01:00Z') + RECOMMENDATION_JOB_TTL_MS);
  const expired = await env.service.create(filters, owner);
  assert.notEqual(expired.jobId, next.jobId);
  assert.equal(env.calls.length, 0);
});

test('district subset limits tasks, preserves district priority and canonicalizes equivalent reuse', async () => {
  const env = setup({ loadCatalog: async () => ({ apartments: [apartment('41135'), apartment('41465'), apartment('41463')] }) });
  const created = await env.service.create({ ...filters, months: 2, districtCodes: ['41465', '41135', '41465'] }, owner);
  assert.equal(created.baseCandidateCount, 2);
  assert.equal(created.progress.total, 4);
  assert.deepEqual(created.filters.districtCodes, ['41465', '41135']);
  await env.service.advance(created.jobId, owner);
  assert.deepEqual(env.calls.map(task => task.lawdCd), ['41465', '41465', '41135', '41135']);
  const reused = await env.service.create({ ...filters, months: 2, districtCodes: ['41135', '41465'] }, owner);
  assert.equal(reused.jobId, created.jobId);
  assert.equal(reused.reused, true);
  const whole = await env.service.create({ ...filters, months: 2, districtCodes: [] }, owner);
  assert.notEqual(whole.jobId, created.jobId);
  assert.equal(whole.baseCandidateCount, 3);
});

test('unknown, out-of-region and malformed district subsets fail before any public month request', async () => {
  const env = setup({ loadCatalog: async () => ({ apartments: [apartment('41135'), apartment('11110')] }) });
  for (const districtCodes of [['11110'], ['41999'], ['private-company'], [41135], '41135', Array(101).fill('41135')]) {
    await assert.rejects(env.service.create({ ...filters, districtCodes }, owner), { code: 'INVALID_RECOMMENDATION' });
  }
  assert.equal(env.calls.length, 0);
  assert.equal(env.db.documents.size, 0);
});

test('pre-index searches migrate the latest matching UID and household without copying another account', async () => {
  const env = setup();
  const mine = await env.service.create(filters, owner);
  await env.service.advance(mine.jobId, owner);
  env.setTime(initialTime + 1000);
  await env.service.create({ ...filters, refresh: true }, partner);
  env.setTime(initialTime + 2000);
  await env.service.create({ ...filters, refresh: true }, { ...owner, householdId: 'other-home' });
  for (const path of env.db.documents.keys()) if (path.startsWith('homehunt_job_lookups/')) env.db.documents.delete(path);
  const recent = await env.restart().recent(owner);
  assert.equal(recent.job.jobId, mine.jobId);
  assert.equal(recent.job.resultCount, 1);
  assert.equal(recent.job.legacyRecoveryLimited, false);
  assert.equal(env.calls.length, 1);
});

test('cancelled late results cannot overwrite a newer account search archive', async () => {
  const entered = deferred();
  const release = deferred();
  const env = setup({ loadMonth: async task => { entered.resolve(); await release.promise; return month(task); } });
  const older = await env.service.create(filters, owner);
  const worker = env.service.advance(older.jobId, owner);
  await entered.promise;
  const newer = await env.service.create({ ...filters, maxPriceManWon: 70000 }, owner);
  release.resolve();
  await worker;
  const latest = await env.service.recent(owner);
  assert.equal(latest.job.jobId, newer.jobId);
  assert.deepEqual(latest.job.results, []);
  const archived = [...env.db.documents.values()].find(value => value.archive);
  assert.equal(archived, undefined);
});

test('a slow older create cannot replace the account pointer of a later search', async () => {
  const entered = deferred();
  const release = deferred();
  let count = 0;
  const env = setup({ loadCatalog: async () => {
    if (++count === 1) { entered.resolve(); await release.promise; }
    return { apartments: [apartment()] };
  } });
  const old = env.service.create(filters, owner);
  await entered.promise;
  env.setTime(initialTime + 1000);
  const latest = await env.service.create({ ...filters, maxPriceManWon: 70000 }, owner);
  release.resolve();
  const late = await old;
  assert.notEqual(late.jobId, latest.jobId);
  assert.equal((await env.service.recent(owner)).job.jobId, latest.jobId);
  assert.equal(env.calls.length, 0);
});

test('archive failure never hides completed prices and reopening retries the optional archive', async () => {
  const env = setup();
  const created = await env.service.create(filters, owner);
  env.db.hooks.failArchiveWrites = true;
  const completed = await env.service.advance(created.jobId, owner);
  assert.equal(completed.ok, true);
  assert.equal(completed.status, 'complete');
  assert.equal(completed.resultCount, 1);
  assert.match(completed.archiveWarning, /7일 보관/);
  assert.ok(!completed.archiveWarning.includes('private database'));
  env.db.hooks.failArchiveWrites = false;
  const reopened = await env.service.get(created.jobId, owner);
  assert.equal(reopened.archiveWarning, undefined);
  env.setTime(initialTime + RECOMMENDATION_JOB_TTL_MS + 1);
  assert.deepEqual((await env.service.recent(owner)).job.results, completed.results);
});

test('a newer retry archive survives an old pending archive writer even when timestamps are equal', async () => {
  let recovered = false;
  const env = setup({ loadMonth: async task => {
    if (!recovered && task.dealYmd === '202608') throw new Error('fetch failed');
    return month(task, recovered ? 59000 : 50000);
  } });
  const created = await env.service.create({ ...filters, months: 2 }, owner);
  env.db.hooks.failArchiveWrites = true;
  await env.service.advance(created.jobId, owner);
  const original = await env.service.advance(created.jobId, owner);
  env.db.hooks.failArchiveWrites = false;
  const entered = deferred();
  const release = deferred();
  let pause = true;
  env.db.hooks.afterGet = async path => {
    if (pause && /^homehunt_job_lookups\/recent_[^/]+$/.test(path)) {
      pause = false;
      entered.resolve();
      await release.promise;
    }
  };
  const oldRead = env.service.get(created.jobId, owner);
  await entered.promise;
  recovered = true;
  await env.service.retry(created.jobId, owner);
  const refreshed = await env.service.advance(created.jobId, owner);
  assert.equal(original.updatedAt, refreshed.updatedAt, 'fence/blob version must distinguish same-millisecond revisions');
  assert.equal(refreshed.results[0].bestArea.count, 2);
  release.resolve();
  await oldRead;
  env.db.hooks.afterGet = null;
  env.setTime(initialTime + RECOMMENDATION_JOB_TTL_MS + 1);
  const saved = (await env.service.recent(owner)).job;
  assert.deepEqual(saved.results, refreshed.results);
  assert.equal(saved.partial, false);
});
