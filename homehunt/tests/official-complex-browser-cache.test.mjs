import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficialComplexClient } from '../js/official-complex-client.mjs';
import { createOfficialComplexStore, officialComplexCacheNamespace } from '../js/official-complex-store.mjs';

const T0 = Date.parse('2026-09-09T00:00:00.000Z');
const HOUR = 3600000;
const URL = 'https://api.example.invalid/api/kapt/complex';
const candidate = id => ({ catalogId: id, amountManWon: 59000, destinations: [{ address: 'PRIVATE-OFFICE' }],
  commuteVerification: { durationMinutes: 45, provider: 'kakao' }, parkingEvidence: { sourceType: 'field', spacesPerHousehold: 1.1 } });
const dto = (id, extra = {}) => ({ schemaVersion: 1, provider: 'kapt', catalogId: id,
  status: 'matched', complexMatchConfirmed: true, kaptCode: 'A10000001', households: 500,
  observedAt: new Date(T0).toISOString(), heatingType: '지역난방', elevatorCount: 15,
  parking: { aboveGroundSpaces: 100, belowGroundSpaces: 550 }, errors: [],
  cache: { expiresAt: new Date(T0 + HOUR).toISOString() }, ...extra });
const reply = value => ({ ok: true, json: async () => value });
function memoryStore() {
  const rows = new Map();
  let reads = 0;
  return { rows, reads: () => reads, load: async () => { reads++; return structuredClone([...rows.values()]); },
    put: async row => { rows.set(row.catalogId, structuredClone(row)); } };
}

test('a second visit restores all 579 public facility records in one read with no API calls', async () => {
  const persistentStore = memoryStore();
  let calls = 0;
  const fetchImpl = async url => { calls++; return reply(dto(new globalThis.URL(url).searchParams.get('catalogId'))); };
  const first = createOfficialComplexClient({ url: URL, persistentStore, now: () => T0, fetchImpl });
  const homes = Array.from({ length: 579 }, (_, i) => candidate(`fixture-${i}`));
  await Promise.all(homes.map(home => first.load(home)));
  assert.equal(calls, 579);
  const second = createOfficialComplexClient({ url: URL, persistentStore, now: () => T0 + 60000, fetchImpl });
  assert.equal(await second.restore(), 579);
  assert.equal(await second.restore(), 579);
  assert.equal(persistentStore.reads(), 2, 'one bulk load per page lifetime');
  const decorated = second.decorate(homes[0]);
  assert.equal(decorated.officialComplexInfo.elevatorCount, 15);
  assert.equal(decorated.officialComplexInfo.heatingType, '지역난방');
  assert.equal(decorated.officialComplexInfo.parking.totalSpaces, 650);
  assert.equal(decorated.officialComplexInfo.cache.hit, true);
  assert.equal(decorated.parkingEvidence, homes[0].parkingEvidence);
  await Promise.all(homes.map(home => second.load(home)));
  assert.equal(calls, 579);
  assert.doesNotMatch(JSON.stringify([...persistentStore.rows.values()]), /PRIVATE-OFFICE|destinations|durationMinutes|kakao|amountManWon|sourceType.*field/);
});

test('restored metadata keeps original expiry, strips unexpected fields and cannot revive expired facts', async () => {
  const persistentStore = memoryStore();
  let now = T0, calls = 0;
  const create = () => createOfficialComplexClient({ url: URL, persistentStore, now: () => now,
    fetchImpl: async () => { calls++; return reply(dto('fixture', { secret: 'PRIVATE-TOKEN' })); } });
  await create().load(candidate('fixture'));
  persistentStore.rows.get('fixture').info.destinations = [{ address: 'PRIVATE-OFFICE' }];
  now += HOUR - 1;
  const second = create();
  assert.equal(await second.restore(), 1);
  const restored = second.decorate(candidate('fixture')).officialComplexInfo;
  assert.equal(Date.parse(restored.cache.expiresAt), T0 + HOUR);
  assert.doesNotMatch(JSON.stringify(restored), /PRIVATE-|destinations/);
  now += 1;
  assert.equal(second.decorate(candidate('fixture')).officialComplexInfo, undefined);
  assert.equal(await create().restore(), 0);
  assert.equal(calls, 1);
});

test('invalid schema, catalog identity and forged extended cache clocks never restore facts', async () => {
  const persistentStore = memoryStore();
  const first = createOfficialComplexClient({ url: URL, persistentStore, now: () => T0,
    fetchImpl: async () => reply(dto('fixture')) });
  await first.load(candidate('fixture'));
  const valid = structuredClone(persistentStore.rows.get('fixture'));
  const broken = [
    { ...valid, schemaVersion: 2 }, { ...valid, catalogId: '../bad' },
    { ...valid, savedAt: T0 + 1 }, { ...valid, expiresAt: T0 + 86400001 },
    { ...valid, retryAt: T0 + HOUR + 1 }, { ...valid, info: dto('other') },
    { ...valid, expiresAt: T0 + 2000 },
  ];
  for (const row of broken) {
    persistentStore.rows.set('fixture', row);
    const client = createOfficialComplexClient({ url: URL, persistentStore, now: () => T0 });
    assert.equal(await client.restore(), 0);
    assert.equal(client.decorate(candidate('fixture')).officialComplexInfo, undefined);
  }
});

test('normal negative identity results are reusable but transport failures are not persisted', async () => {
  for (const status of ['unmatched', 'ambiguous', 'unavailable']) {
    const persistentStore = memoryStore();
    const first = createOfficialComplexClient({ url: URL, persistentStore, now: () => T0,
      fetchImpl: async () => reply(dto('fixture', { status, complexMatchConfirmed: false,
        errors: status === 'unavailable' ? [{ code: 'NETWORK_ERROR' }] : [] })) });
    await first.load(candidate('fixture'));
    assert.equal(persistentStore.rows.size, status === 'unavailable' ? 0 : 1);
    const second = createOfficialComplexClient({ url: URL, persistentStore, now: () => T0 + 1 });
    assert.equal(await second.restore(), status === 'unavailable' ? 0 : 1);
    assert.equal(second.decorate(candidate('fixture')).officialComplexInfo?.parkingEvidence ?? null, null);
  }
});

test('partial facility evidence survives navigation without extending its retry delay', async () => {
  const persistentStore = memoryStore();
  const first = createOfficialComplexClient({ url: URL, persistentStore, now: () => T0,
    fetchImpl: async () => reply(dto('fixture', { status: 'partial', errors: [{ code: 'NETWORK_ERROR', part: 'detail' }], parking: {} })) });
  await first.load(candidate('fixture'));
  let calls = 0;
  const second = createOfficialComplexClient({ url: URL, persistentStore, now: () => T0 + 300000,
    fetchImpl: async () => { calls++; return reply(dto('fixture')); } });
  await second.restore();
  assert.equal(second.isFresh(candidate('fixture')), false);
  assert.equal(second.decorate(candidate('fixture')).officialComplexInfo.heatingType, '지역난방');
  await second.load(candidate('fixture'));
  assert.equal(calls, 1);
  assert.equal(second.decorate(candidate('fixture')).officialComplexInfo.status, 'matched');
});

test('optional browser storage errors cannot fail official metadata loading', async () => {
  const client = createOfficialComplexClient({ url: URL, now: () => T0,
    persistentStore: { load: async () => { throw Error('PRIVATE'); }, put: async () => { throw Error('PRIVATE'); } },
    fetchImpl: async () => reply(dto('fixture')) });
  assert.equal(await client.restore(), 0);
  assert.equal((await client.load(candidate('fixture'))).status, 'matched');
});

test('cache namespaces separate API origins and paths and omit query parameters and fragments', () => {
  const namespace = officialComplexCacheNamespace(URL);
  assert.equal(officialComplexCacheNamespace(`${URL}?token=PRIVATE#secret`), namespace);
  assert.notEqual(officialComplexCacheNamespace('http://localhost:8787/api/kapt/complex'), namespace);
  assert.notEqual(officialComplexCacheNamespace('https://api.example.invalid/another'), namespace);
  assert.equal(officialComplexCacheNamespace('https://username:PRIVATE@api.example.invalid/api'), null);
  assert.equal(officialComplexCacheNamespace('javascript:void(0)'), null);
  assert.equal(createOfficialComplexStore({ url: URL, indexedDB: null }), null);
});

test('blocked and denied IndexedDB opens complete without delaying search indefinitely', async () => {
  for (const indexedDB of [
    { open() { throw Error('denied'); } },
    { open() { const request = {}; queueMicrotask(() => request.onblocked()); return request; } },
    { open() { return {}; } },
  ]) {
    const store = createOfficialComplexStore({ url: URL, indexedDB, timeoutMs: 5 });
    assert.deepEqual(await store.load(), []);
    assert.equal(await store.put({ catalogId: 'fixture', savedAt: T0 }), false);
  }
});

// Event-driven IndexedDB fixture covers transaction completion, nested count /
// cursor operations and cross-client database state without browser globals.
function memoryIndexedDB() {
  const records = new Map();
  let upgraded = false;
  const db = {
    objectStoreNames: { contains: () => upgraded },
    createObjectStore() { upgraded = true; return { createIndex() {} }; },
    close() {},
    transaction() {
      let pending = 0, finished = false;
      const tx = { abort() { finished = true; tx.onabort?.(); } };
      const complete = () => setImmediate(() => { if (!finished && pending === 0) { finished = true; tx.oncomplete?.(); } });
      const dispatch = (req, action) => {
        pending++;
        queueMicrotask(() => {
          try { req.result = action(); req.onsuccess?.(); }
          catch (error) { req.error = error; req.onerror?.(); tx.onerror?.(); }
          finally { pending--; complete(); }
        });
        return req;
      };
      tx.objectStore = () => ({
        put: value => dispatch({}, () => records.set(value.key, structuredClone(value))),
        count: () => dispatch({}, () => records.size),
        getAll: () => dispatch({}, () => structuredClone([...records.values()])),
        index: () => ({ openCursor() {
          const keys = [...records].sort((a, b) => a[1].savedAt - b[1].savedAt).map(([key]) => key);
          const request = {};
          let index = 0;
          const step = () => dispatch(request, () => {
            if (index >= keys.length) return null;
            const key = keys[index];
            return { delete: () => dispatch({}, () => records.delete(key)), continue() { index++; step(); } };
          });
          return step();
        } }),
      });
      return tx;
    },
  };
  return { records, open() {
    const request = { result: db };
    queueMicrotask(() => { if (!upgraded) request.onupgradeneeded?.(); request.onsuccess?.(); });
    return request;
  } };
}

test('IndexedDB persists per API namespace and evicts oldest rows across environments at its bound', async () => {
  const indexedDB = memoryIndexedDB();
  const a = createOfficialComplexStore({ url: URL, indexedDB, maxEntries: 2 });
  const b = createOfficialComplexStore({ url: 'http://localhost:8787/api/kapt/complex', indexedDB, maxEntries: 2 });
  const row = (id, offset) => ({ catalogId: id, savedAt: T0 + offset, marker: id });
  assert.equal(await a.put(row('old', 0)), true);
  assert.equal(await b.put(row('local', 1)), true);
  assert.equal(await a.put(row('new', 2)), true);
  assert.equal(indexedDB.records.size, 2);
  assert.deepEqual(await a.load(), [row('new', 2)]);
  assert.deepEqual(await b.load(), [row('local', 1)]);
  const reloaded = createOfficialComplexStore({ url: `${URL}?ignored=PRIVATE`, indexedDB });
  assert.deepEqual(await reloaded.load(), [row('new', 2)]);
  assert.equal(await a.put(row('new', 3)), true);
  assert.equal(indexedDB.records.size, 2);
  assert.deepEqual(await a.load(), [row('new', 3)]);
});

test('IndexedDB refuses oversized rows and invalid IDs without growing the cache', async () => {
  const indexedDB = memoryIndexedDB();
  const store = createOfficialComplexStore({ url: URL, indexedDB });
  for (const entry of [{ catalogId: '../bad', savedAt: T0 }, { catalogId: 'good', savedAt: NaN },
    { catalogId: 'good', savedAt: T0, value: 'x'.repeat(20001) }]) assert.equal(await store.put(entry), false);
  assert.equal(indexedDB.records.size, 0);
});
