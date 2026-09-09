import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirestoreMaintenance, MAINTENANCE_COLLECTION, MAINTENANCE_INTERVAL_MS } from '../server/firestore-maintenance.mjs';
import { createFirestoreProviderQuota } from '../server/provider-quota.mjs';

const DAY = 86_400_000;
const start = Date.parse('2026-09-08T01:00:00Z');
const old = () => new Date(start - 2 * DAY);
function database() {
  const documents = new Map(), calls = { reads: 0, deletes: 0, writes: 0, queries: [], transactions: 0 };
  let tail = Promise.resolve();
  const db = { documents, calls, onGet: null, failQuery: false };
  const snap = path => ({ id: path.split('/').at(-1), ref: doc(path), exists: documents.has(path),
    data: () => structuredClone(documents.get(path)) });
  function doc(path) { return { path, collection: name => query(`${path}/${name}`),
    get: async () => { calls.reads++; return snap(path); } }; }
  function query(path, filters = [], ordering = null, cap = null) {
    return { query: true, path, filters, ordering, cap,
      doc: id => doc(`${path}/${id}`),
      where: (field, operator, value) => query(path, [...filters, { field, operator, value }], ordering, cap),
      orderBy: field => query(path, filters, field, cap),
      limit: count => query(path, filters, ordering, count),
      get: async function () { return readQuery(this); },
    };
  }
  function readQuery(request) {
    if (db.failQuery) throw new Error('secret private-url database error');
    assert.ok(request.cap > 0 && request.cap <= 64, 'every query has a server-side bound');
    calls.queries.push({ path: request.path, limit: request.cap, filters: request.filters, order: request.ordering });
    let items = [...documents].filter(([path]) => path.startsWith(`${request.path}/`)
      && path.slice(request.path.length + 1).split('/').length === 1);
    for (const { field, operator, value } of request.filters) {
      assert.equal(operator, '<=');
      assert.equal(field, 'expiresAt');
      items = items.filter(([, data]) => data[field] instanceof Date && data[field].getTime() <= value.getTime());
    }
    if (request.ordering) items.sort((a, b) => a[1][request.ordering] - b[1][request.ordering]);
    const docs = items.slice(0, request.cap).map(([path]) => snap(path));
    calls.reads += Math.max(1, docs.length);
    return { docs, empty: !docs.length };
  }
  db.collection = name => query(name);
  db.doc = doc;
  db.runTransaction = (action, options) => {
    if (options) assert.equal(options.maxAttempts, 1, 'cleanup retries must not silently multiply reads');
    calls.transactions++;
    const operation = tail.then(async () => {
      const writes = new Map(), deletes = new Set();
      const result = await action({
        get: async reference => {
          if (db.onGet) await db.onGet(reference);
          if (reference.query) return readQuery(reference);
          calls.reads++;
          return snap(reference.path);
        },
        set: (reference, value) => writes.set(reference.path, structuredClone(value)),
        delete: reference => deletes.add(reference.path),
      });
      for (const [path, value] of writes) { documents.set(path, value); calls.writes++; }
      for (const path of deletes) { documents.delete(path); calls.deletes++; }
      return result;
    });
    tail = operation.catch(() => {});
    return operation;
  };
  return db;
}

test('bounded cleanup removes only expired server state and never personal data or fresh leases', async () => {
  const db = database();
  for (const name of ['homehunt_request_limits', 'homehunt_kapt_source_cache', 'homehunt_route_cache']) {
    db.documents.set(`${name}/expired`, { expiresAt: old() });
    db.documents.set(`${name}/fresh`, { expiresAt: new Date(start + DAY) });
  }
  for (const path of ['homehunt_user_snapshots/owner', 'homehunt_households/family/snapshots/main',
    'homehunt_members/owner', 'events/event', 'wecost_settings/main']) db.documents.set(path, { expiresAt: old(), personal: true });
  db.documents.set('homehunt_kapt_source_cache/in-progress', { expiresAt: old(), leaseUntil: start + 5000 });
  db.documents.set('homehunt_jobs/in-progress', { expiresAt: old(), lease: { until: new Date(start + 5000) } });
  db.documents.set('homehunt_jobs/in-progress/chunks/data', { expiresAt: old(), data: 'needed' });
  const result = await createFirestoreMaintenance({ db, now: () => start }).runIfDue();
  assert.equal(result.ok, true);
  assert.equal(result.deletes, 3);
  assert.ok([...db.documents.values()].filter(value => value.personal).length === 5);
  assert.ok(db.documents.has('homehunt_kapt_source_cache/in-progress'));
  assert.ok(db.documents.has('homehunt_jobs/in-progress/chunks/data'));
  assert.ok(db.calls.queries.every(query => !/user_snapshots|households|events|wecost|members/.test(query.path)));
});

test('chunked jobs and monthly sources remove children first and resume safely with a small delete budget', async () => {
  const db = database();
  let now = start;
  const job = 'homehunt_jobs/old';
  db.documents.set(job, { expiresAt: old(), lease: null });
  for (let index = 0; index < 11; index++) db.documents.set(`${job}/chunks/part_${index}`, { data: 'expired', expiresAt: old() });
  const maintenance = createFirestoreMaintenance({ db, now: () => now, maxDeletes: 5 });
  for (let run = 0; run < 3; run++) {
    const result = await maintenance.runIfDue();
    assert.ok(result.deletes <= 5);
    const children = [...db.documents.keys()].filter(key => key.startsWith(`${job}/chunks/`));
    if (children.length) assert.ok(db.documents.has(job), 'never orphan chunks by deleting the parent early');
    now += MAINTENANCE_INTERVAL_MS;
  }
  assert.ok(!db.documents.has(job));
  assert.ok(![...db.documents.keys()].some(key => key.startsWith(`${job}/chunks/`)));
  const month = 'homehunt_molit_month_cache/41135_202501_sale';
  db.documents.set(month, { expiresAt: old(), chunkCount: 2 });
  for (const part of ['0000', '0001', 'old-unused-chunk']) db.documents.set(`${month}/chunks/${part}`, { data: 'public-expired' });
  await maintenance.runIfDue();
  assert.ok(![...db.documents.keys()].some(key => key === month || key.startsWith(`${month}/chunks/`)));
});

test('expired jobs within the one-hour grace and signed monthly caches before retention remain', async () => {
  const db = database();
  db.documents.set('homehunt_jobs/recently-expired', { expiresAt: new Date(start - 1000) });
  db.documents.set('homehunt_molit_month_cache/fallback', { fetchedAt: new Date(start - 2 * DAY).toISOString(), expiresAt: new Date(start + DAY) });
  db.documents.set('homehunt_molit_month_cache/legacy-no-expiry', { fetchedAt: old().toISOString() });
  await createFirestoreMaintenance({ db, now: () => start }).runIfDue();
  assert.ok(db.documents.has('homehunt_jobs/recently-expired'));
  assert.ok(db.documents.has('homehunt_molit_month_cache/fallback'));
  assert.ok(db.documents.has('homehunt_molit_month_cache/legacy-no-expiry'), 'legacy documents need an explicit bounded migration, not a full scan');
});

test('latest search archives expire with their chunks while active account archives remain bounded', async () => {
  const db = database();
  db.documents.set('homehunt_job_lookups/query_old', { expiresAt: old(), jobId: 'expired' });
  db.documents.set('homehunt_job_lookups/recent_old', { expiresAt: old(), archive: { resultCount: 1 } });
  db.documents.set('homehunt_job_lookups/recent_old/chunks/latest_results_0', { data: 'public-price' });
  db.documents.set('homehunt_job_lookups/recent_current', { expiresAt: new Date(start + DAY), archive: { resultCount: 1 } });
  db.documents.set('homehunt_job_lookups/recent_current/chunks/latest_results_0', { data: 'public-price' });
  const result = await createFirestoreMaintenance({ db, now: () => start }).runIfDue();
  assert.equal(result.ok, true);
  assert.equal(result.deletes, 3);
  assert.ok(!db.documents.has('homehunt_job_lookups/recent_old'));
  assert.ok(db.documents.has('homehunt_job_lookups/recent_current/chunks/latest_results_0'));
});

test('today and previous KST day ledgers remain even with incorrect expiresAt; old canonical ledger alone is removed', async () => {
  const db = database();
  const ledger = date => ({ schemaVersion: 1, date, provider: 'kakao-transit', used: 363,
    updatedAt: `${date}T01:00:00Z`, expiresAt: old() });
  for (const date of ['2026-09-08', '2026-09-07', '2026-09-06']) db.documents.set(`homehunt_provider_usage/kakao-transit_${date}`, ledger(date));
  db.documents.set('homehunt_provider_usage/corrupt-old', ledger('2026-09-05'));
  db.documents.set('homehunt_provider_usage/tmap-transit_2026-09-05', { ...ledger('2026-09-05'), provider: 'tmap-transit', used: -1 });
  await createFirestoreMaintenance({ db, now: () => start }).runIfDue();
  assert.ok(!db.documents.has('homehunt_provider_usage/kakao-transit_2026-09-06'));
  for (const key of ['kakao-transit_2026-09-08', 'kakao-transit_2026-09-07', 'corrupt-old', 'tmap-transit_2026-09-05']) assert.ok(db.documents.has(`homehunt_provider_usage/${key}`));
  const restartedQuota = createFirestoreProviderQuota({ db, now: () => start });
  assert.equal((await restartedQuota.getUsage('kakao')).used, 363);
  await restartedQuota.reserve('kakao');
  assert.equal((await restartedQuota.getUsage('kakao')).used, 364);
});

test('two instances and later cold starts share the six-hour schedule instead of repeating queries', async () => {
  const db = database();
  let now = start;
  db.documents.set('homehunt_request_limits/expired', { expiresAt: old() });
  const [a, b] = [1, 2].map(() => createFirestoreMaintenance({ db, now: () => now }));
  const results = await Promise.all([a.runIfDue(), b.runIfDue(), a.runIfDue()]);
  assert.equal(db.calls.deletes, 1);
  assert.ok(results.some(result => result.skipped));
  const queries = db.calls.queries.length;
  await createFirestoreMaintenance({ db, now: () => now }).runIfDue();
  assert.equal(db.calls.queries.length, queries);
  now += MAINTENANCE_INTERVAL_MS;
  await a.runIfDue();
  assert.ok(db.calls.queries.length > queries);
});

test('large expired backlogs respect read/delete caps and never issue unbounded collection scans', async () => {
  const db = database();
  for (let index = 0; index < 100; index++) {
    db.documents.set(`homehunt_jobs/job_${index}`, { expiresAt: old() });
    for (let part = 0; part < 80; part++) db.documents.set(`homehunt_jobs/job_${index}/chunks/${part}`, { data: 'x' });
  }
  const result = await createFirestoreMaintenance({ db, now: () => start, maxReads: 70, maxDeletes: 20 }).runIfDue();
  assert.equal(result.ok, true);
  assert.ok(result.reads <= 70, JSON.stringify(result));
  assert.ok(db.calls.reads <= 70);
  assert.ok(result.deletes <= 20);
  assert.ok(db.calls.deletes <= 20);
  assert.ok(db.calls.queries.every(query => Number.isInteger(query.limit) && query.limit <= 64));
});

test('a refreshed parent is reread and retained before any child deletion', async () => {
  const db = database();
  const parent = 'homehunt_molit_month_cache/month';
  db.documents.set(parent, { expiresAt: old() });
  db.documents.set(`${parent}/chunks/0000`, { data: 'fresh' });
  db.onGet = ref => { if (ref.path === parent && !ref.query) db.documents.set(parent, { expiresAt: new Date(start + DAY) }); };
  const result = await createFirestoreMaintenance({ db, now: () => start }).runIfDue();
  assert.equal(result.deletes, 0);
  assert.ok(db.documents.has(`${parent}/chunks/0000`));
});

test('database failure returns a safe code and preserves schedule to prevent repeated startup cleanup work', async () => {
  const db = database();
  db.failQuery = true;
  const first = await createFirestoreMaintenance({ db, now: () => start }).runIfDue();
  assert.equal(first.code, 'MAINTENANCE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(first), /secret|private-url/);
  assert.ok(db.documents.has(`${MAINTENANCE_COLLECTION}/bounded-cleanup-v1`));
  const second = await createFirestoreMaintenance({ db, now: () => start }).runIfDue();
  assert.equal(second.skipped, true);
  assert.equal(db.calls.deletes, 0);
});
