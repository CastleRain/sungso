import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirestoreProviderQuota, PROVIDER_QUOTA_COLLECTION } from '../server/provider-quota.mjs';
import { createMemoryFirestore } from './helpers/firestore-memory.mjs';

const epoch = Date.parse('2026-09-08T01:00:00Z');

test('shared daily provider counters survive adapter restarts and expose existing UI snapshot fields', async () => {
  const db = createMemoryFirestore();
  const quota = createFirestoreProviderQuota({ db, now: () => epoch });
  const before = await quota.getUsage('kakao');
  assert.deepEqual(before, { provider: 'kakao-transit', date: '2026-09-08', timeZone: 'Asia/Seoul',
    limit: 1000, used: 0, remaining: 1000, resetAt: '2026-09-08T15:00:00.000Z', updatedAt: null });
  await quota.reserve('kakao', 30);
  const restarted = createFirestoreProviderQuota({ db, now: () => epoch });
  assert.equal((await restarted.getUsage('kakao-transit')).used, 30);
  assert.equal((await restarted.getUsage('tmap')).remaining, 10);
  const data = [...db.documents.values()][0];
  assert.deepEqual(Object.keys(data).sort(), ['date', 'provider', 'schemaVersion', 'updatedAt', 'used']);
  assert.match([...db.documents.keys()][0], new RegExp(`^${PROVIDER_QUOTA_COLLECTION}/kakao-transit_2026-09-08$`));
});

test('two server instances racing cannot exceed the provider cap', async () => {
  const db = createMemoryFirestore();
  const first = createFirestoreProviderQuota({ db, now: () => epoch });
  const second = createFirestoreProviderQuota({ db, now: () => epoch });
  const results = await Promise.allSettled(Array.from({ length: 50 }, (_, index) => (index % 2 ? first : second).reserve('tmap')));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 10);
  assert.ok(results.filter(result => result.status === 'rejected').every(result => result.reason.code === 'DAILY_LIMIT'));
  assert.equal((await first.getUsage('tmap')).used, 10);
});

test('batch reservations are atomic and a blocked batch changes no usage', async () => {
  const db = createMemoryFirestore();
  const quota = createFirestoreProviderQuota({ db, now: () => epoch, limits: { kakao: 35 } });
  await quota.reserve('kakao', 30);
  await assert.rejects(quota.reserve('kakao', 10), { code: 'DAILY_LIMIT' });
  assert.equal((await quota.getUsage('kakao')).used, 30);
  assert.equal((await quota.reserve('kakao', 5)).remaining, 0);
});

test('KST midnight opens a new day without deleting or resetting the old shared ledger', async () => {
  let now = Date.parse('2026-09-08T14:59:59.999Z');
  const db = createMemoryFirestore();
  const quota = createFirestoreProviderQuota({ db, now: () => now });
  await quota.reserve('tmap', 10);
  now++;
  assert.equal((await quota.reserve('tmap')).date, '2026-09-09');
  assert.equal((await quota.getUsage('tmap')).used, 1);
  assert.equal(db.documents.size, 2);
});

test('a delayed transaction resolves its reservation day after KST midnight', async () => {
  let now = Date.parse('2026-09-08T14:59:59.999Z');
  const db = createMemoryFirestore();
  const run = db.runTransaction.bind(db);
  db.runTransaction = action => { now++; return run(action); };
  const quota = createFirestoreProviderQuota({ db, now: () => now });
  const result = await quota.reserve('kakao');
  assert.equal(result.date, '2026-09-09');
  assert.match([...db.documents.keys()][0], /2026-09-09$/);
});

test('invalid counts, limits and unknown providers never reserve or reset quota', async () => {
  const db = createMemoryFirestore();
  for (const limit of [-1, 1.5, Infinity, NaN, '10']) {
    assert.throws(() => createFirestoreProviderQuota({ db, limits: { tmap: limit } }));
  }
  const quota = createFirestoreProviderQuota({ db, now: () => epoch, limits: { tmap: 0 } });
  for (const count of [-1, 1.5, Infinity, NaN, '1', Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(quota.reserve('kakao', count));
  await assert.rejects(quota.reserve('naver'), /Unsupported/);
  await assert.rejects(quota.reserve('tmap'), { code: 'DAILY_LIMIT' });
  assert.equal((await quota.reserve('tmap', 0)).used, 0);
  assert.equal(db.documents.size, 0);
});

test('corrupt ledgers and database failures fail closed instead of granting fresh quota', async () => {
  const db = createMemoryFirestore();
  const quota = createFirestoreProviderQuota({ db, now: () => epoch });
  await quota.reserve('kakao');
  const key = [...db.documents.keys()][0];
  const valid = structuredClone(db.documents.get(key));
  for (const change of [{ used: -1 }, { used: NaN }, { schemaVersion: 0 }, { provider: 'tmap-transit' }, { date: '2026-09-07' }, { updatedAt: 'invalid' }]) {
    db.documents.set(key, { ...valid, ...change });
    await assert.rejects(quota.getUsage('kakao'), { code: 'QUOTA_LEDGER_ERROR' });
    await assert.rejects(quota.reserve('kakao'), { code: 'QUOTA_LEDGER_ERROR' });
  }
  const failed = createFirestoreProviderQuota({ db: {
    collection: () => ({ doc: () => ({ get: async () => { throw new Error('offline'); } }) }),
    runTransaction: async () => { throw new Error('offline'); },
  } });
  await assert.rejects(failed.getUsage('kakao'), { code: 'QUOTA_LEDGER_ERROR' });
  await assert.rejects(failed.reserve('kakao'), { code: 'QUOTA_LEDGER_ERROR' });
});
