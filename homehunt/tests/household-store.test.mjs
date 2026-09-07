import test from 'node:test';
import assert from 'node:assert/strict';
import { createHouseholdStore } from '../server/household-store.mjs';

const contextA = { uid: 'uid-a', householdId: 'family-a' };
const contextB = { uid: 'uid-b', householdId: 'family-b' };
const clock = () => new Date('2026-09-08T00:00:00.000Z');
const snapshot = name => ({ visits: [{ id: 'visit-a', name, address: '개인 방문 주소', memo: '사용자 메모' }] });

// Serial transactions model Firestore's conflict retries: each writer reads
// the document after the previous committed transaction. No real DB is used.
function fakeFirestore() {
  const documents = new Map();
  const touched = [];
  let queue = Promise.resolve();
  const read = ref => ({ exists: documents.has(ref.path), data: () => structuredClone(documents.get(ref.path)) });
  return {
    documents, touched,
    doc(path) {
      touched.push(path);
      return { path, get: async () => read({ path }) };
    },
    runTransaction(callback) {
      const operation = queue.then(async () => {
        const writes = new Map();
        const result = await callback({
          get: async ref => read(ref),
          set: (ref, data) => writes.set(ref.path, structuredClone(data)),
        });
        for (const [path, data] of writes) documents.set(path, data);
        return result;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}

test('new household is empty, first save creates revision 1 and load returns a safe snapshot', async () => {
  const db = fakeFirestore();
  const store = createHouseholdStore({ db, now: clock });
  assert.deepEqual(await store.load(contextA), { snapshot: null, revision: 0, updatedAt: null });
  const saved = await store.save(snapshot('첫 기록'), 0, contextA);
  assert.equal(saved.revision, 1);
  assert.equal(saved.updatedAt, clock().toISOString());
  assert.equal(saved.snapshot.visits[0].name, '첫 기록');
  assert.deepEqual(await store.load(contextA), saved);
  const raw = db.documents.get('homehunt_households/family-a/snapshots/main');
  assert.equal(raw.updatedBy, 'uid-a');
  assert.ok(!('updatedBy' in saved));
});

test('save always takes household from authenticated context and discards body ownership fields', async () => {
  const db = fakeFirestore(); const store = createHouseholdStore({ db, now: clock });
  await store.save({ ...snapshot('A 기록'), householdId: 'family-b', uid: 'uid-b', updatedBy: 'uid-b' }, 0, contextA);
  assert.equal((await store.load(contextA)).snapshot.visits[0].name, 'A 기록');
  assert.equal((await store.load(contextB)).snapshot, null);
  assert.equal(db.documents.size, 1);
  assert.ok(db.documents.has('homehunt_households/family-a/snapshots/main'));
});

test('two households have separate revisions and data while authorized household members can share', async () => {
  const db = fakeFirestore(); const store = createHouseholdStore({ db, now: clock });
  await store.save(snapshot('A 기록'), 0, contextA);
  await store.save(snapshot('B 기록'), 0, contextB);
  await store.save(snapshot('A 다른 기기 수정'), 1, { uid: 'uid-a-member', householdId: 'family-a' });
  assert.equal((await store.load(contextA)).revision, 2);
  assert.equal((await store.load(contextB)).revision, 1);
  assert.equal((await store.load(contextB)).snapshot.visits[0].name, 'B 기록');
});

test('missing authentication and unsafe household paths are rejected before database access', async () => {
  const db = fakeFirestore(); const store = createHouseholdStore({ db, now: clock });
  for (const context of [null, {}, { householdId: 'family-a' }, { uid: '', householdId: 'family-a' }]) {
    await assert.rejects(store.load(context), error => error.status === 401);
    await assert.rejects(store.save(snapshot('x'), 0, context), error => error.status === 401);
  }
  for (const householdId of ['../other', 'a/b', '', '__proto__', 'a'.repeat(129)]) {
    await assert.rejects(store.load({ uid: 'uid-a', householdId }), error => error.status === 403);
  }
  assert.equal(db.touched.length, 0);
});

test('CAS refuses stale updates and never replaces a newer snapshot', async () => {
  const db = fakeFirestore(); const store = createHouseholdStore({ db, now: clock });
  await store.save(snapshot('최신 기록'), 0, contextA);
  await assert.rejects(store.save(snapshot('옛 기기 덮어쓰기'), 0, contextA), error =>
    error.status === 409 && error.code === 'CLOUD_SNAPSHOT_CONFLICT' && error.currentRevision === 1);
  assert.equal((await store.load(contextA)).snapshot.visits[0].name, '최신 기록');
});

test('two concurrent writers of the same revision cannot both succeed', async () => {
  const db = fakeFirestore(); const store = createHouseholdStore({ db, now: clock });
  const results = await Promise.allSettled([
    store.save(snapshot('첫 번째'), 0, contextA), store.save(snapshot('두 번째'), 0, contextA),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal((await store.load(contextA)).revision, 1);
});

test('blind writes, invalid revisions and invalid payloads never create a document', async () => {
  const db = fakeFirestore(); const store = createHouseholdStore({ db, now: clock });
  for (const expected of [undefined, null, -1, 0.5, '0', NaN, Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(store.save(snapshot('x'), expected, contextA), error => error.code === 'INVALID_CLOUD_REVISION');
  }
  await assert.rejects(store.save({ visits: [{ id: 'a', memo: { route: 'not-personal-text' } }] }, 0, contextA), error => error.status === 400);
  assert.equal(db.documents.size, 0);
});

test('server normalizes even when a caller bypasses the browser serializer', async () => {
  const db = fakeFirestore(); const store = createHouseholdStore({ db, now: clock });
  const raw = snapshot('검증');
  raw.visits[0].commute = { provider: 'kakao', durationMinutes: 30 };
  raw.routes = [{ provider: 'naver', totalTime: 200 }];
  raw.wecost_settings = { income: 100 };
  await store.save(raw, 0, contextA);
  const serialized = JSON.stringify([...db.documents.values()]);
  assert.ok(!serialized.includes('kakao'));
  assert.ok(!serialized.includes('naver'));
  assert.ok(!serialized.includes('income'));
  assert.ok(serialized.includes('사용자 메모'));
});

test('read path also normalizes old fields and fails on invalid stored metadata', async () => {
  const db = fakeFirestore(); const store = createHouseholdStore({ db, now: clock });
  const path = 'homehunt_households/family-a/snapshots/main';
  db.documents.set(path, { revision: 3, updatedAt: clock().toISOString(), snapshot: {
    ...snapshot('예전 기록'), routes: [{ provider: 'kakao', durationMinutes: 30 }],
  } });
  assert.ok(!('routes' in (await store.load(contextA)).snapshot));
  db.documents.set(path, { revision: 0, updatedAt: clock().toISOString(), snapshot: snapshot('bad') });
  await assert.rejects(store.load(contextA), error => error.code === 'INVALID_STORED_CLOUD_SNAPSHOT');
  await assert.rejects(store.save(snapshot('overwrite'), 0, contextA), error => error.code === 'INVALID_STORED_CLOUD_SNAPSHOT');
});

test('backend errors propagate without a local fallback or successful save response', async () => {
  const failure = new Error('simulated firestore unavailable');
  const db = { doc: () => ({ get: async () => { throw failure; } }), runTransaction: async () => { throw failure; } };
  const store = createHouseholdStore({ db, now: clock });
  await assert.rejects(store.load(contextA), failure);
  await assert.rejects(store.save(snapshot('x'), 0, contextA), failure);
});
