import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as jobs from '../server/recommendation-jobs.mjs';

// Reuse the durable, atomic rollback/size-checking fake from the existing job
// suite without registering its tests or maintaining a second Firestore model.
const source = fs.readFileSync(new URL('./recommendation-jobs.test.mjs', import.meta.url), 'utf8');
const fixtureSource = source.slice(source.indexOf('function database()'), source.indexOf("\ntest('create persists"));
const { setup, owner, partner, stranger, filters, initialTime, apartment, month, deferred } = vm.runInNewContext(
  `${fixtureSource}\n({ setup, owner, partner, stranger, filters, initialTime, apartment, month, deferred });`,
  { ...jobs, assert, Buffer, structuredClone, Date, AbortController, AbortSignal, setTimeout, clearTimeout },
);
const preserve = { ...filters, refresh: true, preserveRecent: true };
const recentEntry = (env, identity = owner) => [...env.db.documents].find(([path, value]) =>
  /^homehunt_job_lookups\/recent_[^/]+$/.test(path) && value.uid === identity.uid && value.householdId === identity.householdId);
const queryEntry = (env, jobId) => [...env.db.documents].find(([path, value]) =>
  /^homehunt_job_lookups\/query_[^/]+$/.test(path) && value.jobId === jobId);
const savedPointer = (env, identity = owner) => JSON.stringify(recentEntry(env, identity)?.[1]);

async function completedBase() {
  const env = setup();
  const created = await env.service.create(filters, owner);
  const base = await env.service.advance(created.jobId, owner);
  assert.equal(base.status, 'complete');
  assert.equal(base.resultCount, 1);
  return { env, base };
}

test('enrichment preserves recent and query pointers while pending, then atomically publishes its complete archive', async () => {
  const { env, base } = await completedBase();
  const original = savedPointer(env), query = queryEntry(env, base.jobId);
  env.setTime(initialTime + 1000);
  const created = await env.service.create({ ...preserve,
    destinations: [{ lat: 37, lng: 127, name: 'private-office' }], companyAddress: 'private-address' }, owner);
  assert.notEqual(created.jobId, base.jobId);
  assert.equal(savedPointer(env), original);
  assert.equal(env.db.documents.get(query[0]).jobId, base.jobId);
  assert.equal((await env.restart().recent(owner)).job.jobId, base.jobId);
  const shared = await env.service.create(filters, partner);
  assert.equal(shared.jobId, base.jobId, 'Other tabs/members never reuse the pending enrichment');
  const job = env.db.documents.get(`homehunt_jobs/${created.jobId}`);
  assert.equal(job.recentPromotion.uid, owner.uid);
  assert.equal(job.recentPromotion.jobId, base.jobId);
  assert.equal(created.recentPromotion, undefined);
  assert.equal(created.filters.preserveRecent, undefined);
  assert.ok(!JSON.stringify([...env.db.documents]).includes('private-'));
  const completed = await env.service.advance(created.jobId, owner);
  assert.equal(completed.failedRequestCount, 0);
  const pointer = recentEntry(env)[1];
  assert.equal(pointer.jobId, created.jobId);
  assert.equal(pointer.archive.jobId, created.jobId);
  assert.equal(env.db.documents.get(query[0]).jobId, created.jobId);
  assert.equal((await env.restart().recent(owner)).job.results[0].bestArea.averagePriceManWon, 55000);
  const commits = env.db.calls.transactionWrites.filter(call => call.paths.includes(recentEntry(env)[0]));
  assert.ok(commits.at(-1).paths.some(path => path.includes('/chunks/latest_results_')));
  assert.ok(commits.at(-1).paths.includes(query[0]));
});

test('cancel during an in-flight final advance preserves the previous archive after restart', async () => {
  const { env, base } = await completedBase();
  const original = savedPointer(env), entered = deferred(), reply = deferred();
  const service = env.restart({ loadMonth: async task => { entered.resolve(); await reply.promise; return month(task); } });
  const created = await service.create(preserve, owner);
  const advancing = service.advance(created.jobId, owner);
  await entered.promise;
  await service.cancel(created.jobId, owner);
  reply.resolve();
  assert.equal((await advancing).status, 'cancelled');
  assert.equal(savedPointer(env), original);
  assert.equal((await env.restart().recent(owner)).job.jobId, base.jobId);
});

test('cancel after aggregation but before archive publication fences the paused promotion writer', async () => {
  const { env, base } = await completedBase();
  const created = await env.service.create(preserve, owner);
  const entered = deferred(), release = deferred();
  let paused = false;
  env.db.hooks.afterGet = async path => {
    if (!paused && path === recentEntry(env)[0]) {
      paused = true;
      entered.resolve();
      await release.promise;
    }
  };
  const advancing = env.service.advance(created.jobId, owner);
  await entered.promise;
  assert.equal(env.db.documents.get(`homehunt_jobs/${created.jobId}`).status, 'complete');
  assert.equal((await env.service.cancel(created.jobId, owner)).status, 'cancelled');
  release.resolve();
  await advancing;
  assert.equal((await env.restart().recent(owner)).job.jobId, base.jobId);
  assert.equal(env.db.documents.get(`homehunt_jobs/${created.jobId}`).status, 'cancelled');
});

test('partial results and terminal errors leave the previous recent archive and shared query intact', async () => {
  for (const terminal of ['partial', 'error']) {
    const { env, base } = await completedBase();
    const original = savedPointer(env), query = queryEntry(env, base.jobId);
    const service = env.restart({ loadMonth: async task => {
      if (terminal === 'partial') throw new Error('Fixture provider unavailable');
      return month(task);
    } });
    const created = await service.create(preserve, owner);
    if (terminal === 'error') {
      const key = [...env.db.documents.keys()].find(path => path.startsWith(`homehunt_jobs/${created.jobId}/chunks/catalog_`));
      env.db.documents.delete(key);
    }
    let completed = await service.advance(created.jobId, owner);
    if (completed.status === 'running') completed = await service.advance(created.jobId, owner);
    assert.equal(completed.status, terminal === 'partial' ? 'complete' : 'error');
    if (terminal === 'partial') assert.equal(completed.failedRequestCount, 1);
    assert.equal(savedPointer(env), original);
    assert.equal(env.db.documents.get(query[0]).jobId, base.jobId);
    assert.equal((await env.restart().recent(owner)).job.jobId, base.jobId);
  }
});

test('other-account completion cannot promote the owner pointer and another household cannot access the job', async () => {
  const { env, base } = await completedBase();
  const created = await env.service.create(preserve, owner);
  await assert.rejects(env.service.advance(created.jobId, stranger), { code: 'JOB_NOT_FOUND' });
  assert.equal((await env.service.advance(created.jobId, partner)).status, 'complete');
  assert.equal((await env.service.recent(owner)).job.jobId, base.jobId);
  assert.equal((await env.service.recent(partner)).job, null);
  await env.service.get(created.jobId, owner);
  assert.equal((await env.service.recent(owner)).job.jobId, created.jobId, 'Only an owner-context completion/read promotes their selection');
});

test('a later different search wins over a delayed enrichment completion', async () => {
  const { env } = await completedBase();
  const enrichment = await env.service.create(preserve, owner);
  env.setTime(initialTime + 1000);
  const later = await env.service.create({ ...filters, maxPriceManWon: 61000 }, owner);
  const selected = savedPointer(env);
  await env.service.advance(enrichment.jobId, owner);
  assert.equal(savedPointer(env), selected);
  assert.equal((await env.service.recent(owner)).job.jobId, later.jobId);
});

test('selection tokens reject an ABA reselection of the same job at the same timestamp', async () => {
  const { env, base } = await completedBase();
  const first = recentEntry(env)[1];
  const enrichment = await env.service.create(preserve, owner);
  await env.service.create({ ...filters, maxPriceManWon: 61000 }, owner);
  const reselected = await env.service.create(filters, owner);
  assert.equal(reselected.jobId, base.jobId);
  const latest = recentEntry(env)[1];
  assert.equal(latest.updatedAt, first.updatedAt);
  assert.notEqual(latest.selectionToken, first.selectionToken);
  const before = savedPointer(env);
  await env.service.advance(enrichment.jobId, owner);
  assert.equal(savedPointer(env), before);
});

test('only the first completed enrichment for a shared parent may replace the recent pointer', async () => {
  const { env } = await completedBase();
  const a = await env.service.create(preserve, owner);
  const b = await env.service.create(preserve, owner);
  await env.service.advance(b.jobId, owner);
  const winner = savedPointer(env);
  await env.service.advance(a.jobId, owner);
  assert.equal(savedPointer(env), winner);
  assert.equal((await env.service.recent(owner)).job.jobId, b.jobId);
});

test('a slow enrichment create captures its parent before catalog loading and cannot target a later selection', async () => {
  const { env } = await completedBase();
  const entered = deferred(), catalog = deferred();
  const slow = env.restart({ loadCatalog: async () => { entered.resolve(); return catalog.promise; } });
  const creating = slow.create(preserve, owner);
  await entered.promise;
  const later = await env.service.create({ ...filters, maxPriceManWon: 61000 }, owner);
  const selected = savedPointer(env);
  catalog.resolve({ apartments: [apartment()] });
  const enrichment = await creating;
  assert.equal(savedPointer(env), selected);
  await slow.advance(enrichment.jobId, owner);
  assert.equal(savedPointer(env), selected);
  assert.equal((await env.service.recent(owner)).job.jobId, later.jobId);
});

test('an archive write failure rolls back pointer, chunks and query promotion; reopening retries without provider work', async () => {
  const { env, base } = await completedBase();
  const before = savedPointer(env), query = queryEntry(env, base.jobId);
  const archiveChunks = [...env.db.documents].filter(([path]) => path.startsWith(`${recentEntry(env)[0]}/chunks/`));
  const created = await env.service.create(preserve, owner);
  env.db.hooks.failArchiveWrites = true;
  const completed = await env.service.advance(created.jobId, owner);
  assert.equal(completed.status, 'complete');
  assert.match(completed.archiveWarning, /7일 보관/);
  assert.equal(savedPointer(env), before);
  assert.equal(env.db.documents.get(query[0]).jobId, base.jobId);
  assert.equal(JSON.stringify([...env.db.documents].filter(([path]) => path.startsWith(`${recentEntry(env)[0]}/chunks/`))), JSON.stringify(archiveChunks));
  const providerCalls = env.calls.length;
  env.db.hooks.failArchiveWrites = false;
  await env.restart().get(created.jobId, owner);
  assert.equal(env.calls.length, providerCalls);
  assert.equal((await env.service.recent(owner)).job.jobId, created.jobId);
});

test('a successful retry may promote previously partial enrichment while its original recent selection remains current', async () => {
  const { env, base } = await completedBase();
  const failed = env.restart({ loadMonth: async () => { throw new Error('Fixture failure'); } });
  const created = await failed.create(preserve, owner);
  await failed.advance(created.jobId, owner);
  await failed.advance(created.jobId, owner);
  assert.equal((await env.service.recent(owner)).job.jobId, base.jobId);
  await env.service.retry(created.jobId, owner);
  const completed = await env.service.advance(created.jobId, owner);
  assert.equal(completed.failedRequestCount, 0);
  assert.equal((await env.service.recent(owner)).job.jobId, created.jobId);
});

test('without a valid previous recent result preserveRecent falls back to ordinary search creation', async () => {
  const fresh = setup();
  const first = await fresh.service.create(preserve, owner);
  assert.equal((await fresh.service.recent(owner)).job.jobId, first.jobId);
  assert.equal(fresh.db.documents.get(`homehunt_jobs/${first.jobId}`).recentPromotion, undefined);
  const { env } = await completedBase();
  env.setTime(initialTime + jobs.RECOMMENDATION_SEARCH_ARCHIVE_TTL_MS + 1);
  const created = await env.service.create(preserve, owner);
  assert.equal((await env.service.recent(owner)).job.jobId, created.jobId);
  assert.equal(env.db.documents.get(`homehunt_jobs/${created.jobId}`).recentPromotion, undefined);
});

test('the seven-day archive remains visible while enriching after the previous raw job expires', async () => {
  const { env, base } = await completedBase();
  env.setTime(initialTime + jobs.RECOMMENDATION_JOB_TTL_MS + 1);
  for (const path of [...env.db.documents.keys()]) if (path === `homehunt_jobs/${base.jobId}` || path.startsWith(`homehunt_jobs/${base.jobId}/`)) env.db.documents.delete(path);
  const created = await env.service.create(preserve, owner);
  const retained = (await env.restart().recent(owner)).job;
  assert.equal(retained.jobId, base.jobId);
  assert.equal(retained.stale, true);
  assert.equal(retained.resultCount, 1);
  await env.service.advance(created.jobId, owner);
  assert.equal((await env.restart().recent(owner)).job.jobId, created.jobId);
});

test('owner promotion never overwrites a newer shared-query selection by another household member', async () => {
  const { env, base } = await completedBase();
  const query = queryEntry(env, base.jobId);
  const enrichment = await env.service.create(preserve, owner);
  const partnerSearch = await env.service.create({ ...filters, refresh: true }, partner);
  assert.equal(env.db.documents.get(query[0]).jobId, partnerSearch.jobId);
  await env.service.advance(enrichment.jobId, owner);
  assert.equal((await env.service.recent(owner)).job.jobId, enrichment.jobId);
  assert.equal((await env.service.recent(partner)).job.jobId, partnerSearch.jobId);
  assert.equal(env.db.documents.get(query[0]).jobId, partnerSearch.jobId);
});
