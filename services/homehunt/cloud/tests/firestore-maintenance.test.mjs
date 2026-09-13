import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Firestore } from 'firebase-admin/firestore';
import { createFirestoreMaintenance, MAINTENANCE_INTERVAL_MS, MAINTENANCE_COLLECTION } from '../../server/firestore-maintenance.mjs';
import { createFirestoreProviderQuota } from '../../server/provider-quota.mjs';

// No ADC, real user, service-account key, or live project can be selected. Both
// the Admin SDK and the clearing endpoint are pinned to this demo emulator.
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
if (!emulator || !/^(?:127\.0\.0\.1|localhost):\d+$/.test(emulator)) throw new Error('A localhost Firestore emulator is required');
const [host, portText] = emulator.split(':');
const previousMetadataDetection = process.env.METADATA_SERVER_DETECTION;
process.env.METADATA_SERVER_DETECTION = 'none';
const projectId = 'demo-homehunt';
const start = Date.parse('2026-09-08T01:00:00Z');
const DAY = 86_400_000;
const expired = () => new Date(start - 2 * DAY);
let environment, db;

before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(portText) } });
  // The underlying Admin Firestore client explicitly uses insecure emulator
  // transport and its synthetic owner header; there is no credential lookup.
  db = new Firestore({ projectId, host: emulator, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => { await environment.clearFirestore(); });
after(async () => {
  await db?.terminate(); await environment?.cleanup();
  if (previousMetadataDetection === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadataDetection;
});

test('real emulator runs timestamp range queries and transactional chunk cleanup without a composite index', async () => {
  const job = db.doc('homehunt_jobs/expired-job');
  const month = db.doc('homehunt_molit_month_cache/41135_202501_sale');
  const batch = db.batch();
  batch.set(job, { expiresAt: expired(), lease: null });
  batch.set(month, { expiresAt: expired(), chunkCount: 2 });
  for (const parent of [job, month]) for (let index = 0; index < 3; index++) {
    batch.set(parent.collection('chunks').doc(`part-${index}`), { data: 'fictional-public-source', expiresAt: expired() });
  }
  batch.set(db.doc('homehunt_request_limits/old'), { expiresAt: expired(), used: 10 });
  batch.set(db.doc('homehunt_kapt_source_cache/old'), { expiresAt: expired(), state: 'ready', payload: 'fixture' });
  batch.set(db.doc('homehunt_route_cache/old-tmap'), { expiresAt: expired(), provider: 'tmap-transit' });
  await batch.commit();
  const result = await createFirestoreMaintenance({ db, now: () => start }).runIfDue();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.deletes, 11);
  assert.ok(result.reads <= 500);
  assert.equal((await job.get()).exists, false);
  assert.equal((await job.collection('chunks').get()).empty, true);
  assert.equal((await month.get()).exists, false);
  assert.equal((await month.collection('chunks').get()).empty, true);
  const control = (await db.doc(`${MAINTENANCE_COLLECTION}/bounded-cleanup-v1`).get()).data();
  assert.equal(control.nextRunAt.toMillis(), start + MAINTENANCE_INTERVAL_MS);
});

test('real emulator preserves today and yesterday quota, fresh cache, active lease and personal snapshots', async () => {
  const batch = db.batch();
  for (const date of ['2026-09-08', '2026-09-07', '2026-09-06']) batch.set(db.doc(`homehunt_provider_usage/kakao-transit_${date}`), {
    schemaVersion: 1, date, provider: 'kakao-transit', used: 363, updatedAt: `${date}T01:00:00Z`, expiresAt: expired(),
  });
  batch.set(db.doc('homehunt_kapt_source_cache/fresh'), { expiresAt: new Date(start + DAY), payload: 'fresh' });
  batch.set(db.doc('homehunt_jobs/active'), { expiresAt: expired(), lease: { until: new Date(start + 60_000) } });
  batch.set(db.doc('homehunt_jobs/active/chunks/part'), { data: 'needed' });
  batch.set(db.doc('homehunt_user_snapshots/fixture-owner'), { expiresAt: expired(), private: true });
  await batch.commit();
  const result = await createFirestoreMaintenance({ db, now: () => start }).runIfDue();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.deletes, 1);
  assert.equal((await db.doc('homehunt_provider_usage/kakao-transit_2026-09-06').get()).exists, false);
  for (const path of ['homehunt_provider_usage/kakao-transit_2026-09-08', 'homehunt_provider_usage/kakao-transit_2026-09-07',
    'homehunt_kapt_source_cache/fresh', 'homehunt_jobs/active/chunks/part', 'homehunt_user_snapshots/fixture-owner']) {
    assert.equal((await db.doc(path).get()).exists, true, path);
  }
  const restarted = createFirestoreProviderQuota({ db, now: () => start });
  assert.equal((await restarted.getUsage('kakao')).used, 363);
  assert.equal((await restarted.reserve('kakao')).used, 364);
});

test('real emulator retains a chunk parent at the delete cap and finishes across scheduled runs', async () => {
  let now = start;
  const parent = db.doc('homehunt_jobs/large-fixture');
  const batch = db.batch();
  batch.set(parent, { expiresAt: expired(), lease: null });
  for (let index = 0; index < 11; index++) batch.set(parent.collection('chunks').doc(`part-${index}`), { data: 'fixture' });
  await batch.commit();
  for (let run = 0; run < 3; run++) {
    const result = await createFirestoreMaintenance({ db, now: () => now, maxReads: 30, maxDeletes: 5 }).runIfDue();
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.deletes <= 5);
    assert.ok(result.reads <= 30);
    const children = await parent.collection('chunks').get();
    if (!children.empty) assert.equal((await parent.get()).exists, true);
    now += MAINTENANCE_INTERVAL_MS;
  }
  assert.equal((await parent.get()).exists, false);
  assert.equal((await parent.collection('chunks').get()).empty, true);
});

test('real emulator skips cleanup after a fresh process starts within the shared schedule', async () => {
  const first = await createFirestoreMaintenance({ db, now: () => start }).runIfDue();
  assert.equal(first.ok, true);
  const second = await createFirestoreMaintenance({ db, now: () => start + 1000 }).runIfDue();
  assert.equal(second.ok, true);
  assert.equal(second.skipped, true);
  assert.equal(second.queries, 0);
  assert.equal(second.deletes, 0);
  assert.equal(second.reads, 1);
});
