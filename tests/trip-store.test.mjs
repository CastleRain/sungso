import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { defaultTrip, normalizeTrip, applyTripChange, describeTripChange } from '../shared/trip-core.mjs';

// Execute the production store with in-memory SDK adapters. No Firebase SDK,
// credentials, network request, or production database is involved in these tests.
const storeSource = readFileSync(new URL('../shared/trip-store.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/^export /gm, '');
const canonicalPath = 'itineraries/honeymoon_2027';
const historyPrefix = 'honeymoon_2027_log_';
const mockNow = Date.parse('2026-09-12T05:00:00.000Z');
const historyId = (millis, suffix) => `${historyPrefix}${String(9999999999999 - millis).padStart(13, '0')}_${suffix}`;
const clone = value => structuredClone(value);

function createStore(t, options = {}) {
  const documents = new Map([
    [canonicalPath, clone(options.trip ?? defaultTrip())],
    ['itineraries/main', { days: [{ date: '2027-03-07', items: ['이전 기록'] }, { date: '2027-03-14', items: [] }] }],
    ...(options.documents || []),
  ]);
  const storage = new Map(options.storage || []);
  const subscriptions = [];
  const reads = [];
  const queryReads = [];
  const transactions = [];
  const listeners = new Map();
  let failCommit = false;
  let uuid = 0;
  let beforeTransaction = null;

  const docSnapshot = ref => ({
    exists: () => documents.has(ref.path),
    data: () => clone(documents.get(ref.path)),
    metadata: { fromCache: false },
  });
  function querySnapshot(ref) {
    const lower = ref.constraints.find(c => c.type === 'startAt')?.value;
    const upper = ref.constraints.find(c => c.type === 'endAt')?.value;
    const count = ref.constraints.find(c => c.type === 'limit')?.value ?? Infinity;
    const matches = [...documents.entries()].filter(([path]) => {
      const parent = path.slice(0, path.lastIndexOf('/'));
      const id = path.slice(path.lastIndexOf('/') + 1);
      return parent === ref.source.path && (lower === undefined || id >= lower) && (upper === undefined || id <= upper);
    }).sort(([a], [b]) => a.localeCompare(b)).slice(0, count);
    queryReads.push(matches.map(([path]) => path));
    return {
      docs: matches.map(([path, data]) => ({ id: path.slice(path.lastIndexOf('/') + 1), data: () => clone(data) })),
      metadata: { fromCache: false },
    };
  }
  const emit = () => subscriptions.filter(s => s.active).forEach(s => {
    s.next(s.ref.kind === 'query' ? querySnapshot(s.ref) : docSnapshot(s.ref));
  });
  const sdk = {
    initializeApp: (_config, name) => ({ name }), getApps: () => [], getFirestore: () => ({ id: 'mock-db' }),
    doc: (_db, ...parts) => ({ kind: 'doc', path: parts.join('/'), id: parts.at(-1) }),
    collection: (_db, path) => ({ kind: 'collection', path }),
    query: (source, ...constraints) => ({ kind: 'query', source, constraints }),
    documentId: () => '__name__',
    orderBy: value => ({ type: 'orderBy', value }), startAt: value => ({ type: 'startAt', value }),
    endAt: value => ({ type: 'endAt', value }), limit: value => ({ type: 'limit', value }),
    serverTimestamp: () => '__SERVER_TIMESTAMP__',
    onSnapshot: (ref, _options, next, error) => {
      const sub = { ref, next, error, active: true }; subscriptions.push(sub);
      next(ref.kind === 'query' ? querySnapshot(ref) : docSnapshot(ref));
      return () => { sub.active = false; };
    },
    runTransaction: async (_db, fn) => {
      beforeTransaction?.();
      const staged = [];
      const transaction = { writes: staged, committed: false }; transactions.push(transaction);
      const result = await fn({
        get: async ref => { reads.push(ref.path); return docSnapshot(ref); },
        set: (ref, data, setOptions) => staged.push({ path: ref.path, data: clone(data), options: clone(setOptions) }),
      });
      if (failCommit) throw Object.assign(new Error('Mock transaction rejected'), { code: 'permission-denied' });
      for (const write of staged) {
        const data = clone(write.data);
        for (const field of ['updatedAt', 'changedAt']) if (data[field] === '__SERVER_TIMESTAMP__') data[field] = '2026-09-12T05:00:00.000Z';
        documents.set(write.path, write.options?.merge ? { ...documents.get(write.path), ...data } : data);
      }
      transaction.committed = true;
      if (staged.length) emit();
      return result;
    },
  };
  const timers = new Set();
  const context = vm.createContext({
    ...sdk, defaultTrip, normalizeTrip, applyTripChange, describeTripChange, structuredClone,
    Date: class extends Date { static now() { return options.now ?? mockNow; } },
    navigator: { onLine: true }, crypto: { randomUUID: () => `mock-${++uuid}` },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    window: { addEventListener: (name, fn) => listeners.set(name, fn) },
    setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timers.add(timer); return timer; },
    clearTimeout: timer => { timers.delete(timer); clearTimeout(timer); },
  });
  vm.runInContext(storeSource + '\nthis.storeApi={subscribeTrip,subscribeTripHistory,saveHotelChoice,saveDecision,saveDay,getActor,setActor};', context);
  t.after(() => timers.forEach(clearTimeout));
  return {
    api: context.storeApi, documents, reads, queryReads, subscriptions, transactions, storage, emit,
    failCommit: () => { failCommit = true; },
    beforeTransaction: fn => { beforeTransaction = fn; },
    history: () => [...documents.entries()].filter(([path]) => path.startsWith(`itineraries/${historyPrefix}`)),
  };
}

function connect(t, store) {
  const states = [];
  const unsubscribe = store.api.subscribeTrip(state => states.push(clone(state)));
  t.after(unsubscribe);
  assert.equal(states.at(-1).connection, 'live');
  return states;
}

test('one atomic transaction writes the current trip and exact before/after history without legacy writes', async t => {
  const store = createStore(t);
  const states = connect(t, store);
  const legacyBefore = clone(store.documents.get('itineraries/main'));
  store.api.setActor('소희');
  await store.api.saveHotelChoice('arrival', 'fair');

  assert.equal(store.transactions.length, 1);
  const transaction = store.transactions[0];
  assert.equal(transaction.committed, true);
  assert.equal(transaction.writes.length, 2);
  assert.equal(transaction.writes[0].path, canonicalPath);
  assert.match(transaction.writes[1].path, /^itineraries\/honeymoon_2027_log_\d{13}_mock-\d+$/);
  const reverseTime = transaction.writes[1].path.slice(`itineraries/${historyPrefix}`.length).split('_')[0];
  assert.equal(Number(reverseTime) + mockNow, 9999999999999, 'New IDs sort recent client times first with ascending document-ID order');
  assert.deepEqual(transaction.writes[0].options, { merge: true });
  assert.equal(store.documents.get(canonicalPath).hotels.arrival, 'fair');
  assert.deepEqual(store.history()[0][1], {
    tripId: 'honeymoon_2027', type: 'hotel', target: 'arrival', actor: '소희', before: null, after: 'fair', changedAt: '2026-09-12T05:00:00.000Z',
  });
  assert.deepEqual(store.documents.get('itineraries/main'), legacyBefore);
  assert.deepEqual(store.reads, [canonicalPath]);
  assert.equal(states.at(-1).saving, false);
  assert.equal(states.at(-1).data.hotels.arrival, 'fair');
});

test('a rejected transaction leaves both documents and subscriber trip unchanged', async t => {
  const store = createStore(t);
  const states = connect(t, store);
  const before = clone([...store.documents.entries()]);
  store.failCommit();
  await assert.rejects(store.api.saveDecision('flights', { status: 'confirmed', note: '발권 확인' }), /저장 권한/);
  assert.equal(store.transactions[0].writes.length, 2, 'Both writes were staged before the simulated commit failed');
  assert.equal(store.transactions[0].committed, false);
  assert.deepEqual([...store.documents.entries()], before);
  assert.equal(store.history().length, 0);
  assert.equal(states.at(-1).saving, false);
  assert.equal(states.at(-1).data.decisions.flights.status, 'candidate');
  assert.match(states.at(-1).error, /저장 권한/);
});

test('saving the same hotel, decision and day creates no history or canonical writes', async t => {
  const store = createStore(t);
  connect(t, store);
  const before = clone([...store.documents.entries()]);
  const trip = store.documents.get(canonicalPath);
  await store.api.saveHotelChoice('arrival', null);
  await store.api.saveDecision('flights', clone(trip.decisions.flights));
  await store.api.saveDay(trip.days[0].date, clone(trip.days[0].events), clone(trip.days[0].events));
  assert.equal(store.transactions.length, 3);
  assert.ok(store.transactions.every(tx => tx.writes.length === 0));
  assert.equal(store.history().length, 0);
  assert.deepEqual([...store.documents.entries()], before);
});

test('history uses the latest server field as before and preserves concurrent changes outside the target', async t => {
  const store = createStore(t);
  const states = connect(t, store);
  assert.equal(states.at(-1).data.hotels.arrival, null);
  store.beforeTransaction(() => {
    const latest = clone(store.documents.get(canonicalPath));
    latest.hotels = { arrival: 'park', return: 'mbs' };
    latest.decisions.transfers = { status: 'confirmed', note: '함께 확인한 이동편' };
    store.documents.set(canonicalPath, latest); // Server changes before this client receives its next snapshot.
  });
  await store.api.saveHotelChoice('arrival', 'fair');
  assert.equal(store.history()[0][1].before, 'park');
  assert.equal(store.history()[0][1].after, 'fair');
  assert.deepEqual(store.documents.get(canonicalPath).hotels, { arrival: 'fair', return: 'mbs' });
  assert.deepEqual(store.documents.get(canonicalPath).decisions.transfers, { status: 'confirmed', note: '함께 확인한 이동편' });
});

test('history subscription is bounded to this trip history IDs and excludes the canonical and old main records', t => {
  const row = (actor, changedAt, extra = {}) => ({ tripId: 'honeymoon_2027', type: 'hotel', target: 'arrival', before: null, after: 'fair', actor, changedAt, ...extra });
  const store = createStore(t, { documents: [
    [`itineraries/${historyId(Date.parse('2026-09-10T05:00:00.000Z'), 'a')}`, row('성우', '2026-09-10T05:00:00.000Z')],
    [`itineraries/${historyId(Date.parse('2026-09-12T05:00:00.000Z'), 'b')}`, row('소희', '2026-09-12T05:00:00.000Z')],
    ['itineraries/another_trip_history_1770000000003', row('이전 여행', '2026-09-13T05:00:00.000Z')],
    ['itineraries/honeymoon_2027_private', row('다른 기록', '2026-09-14T05:00:00.000Z')],
  ] });
  const states = [];
  const stop = store.api.subscribeTripHistory(state => states.push(clone(state)));
  t.after(stop);
  assert.equal(store.subscriptions.length, 1);
  const ref = store.subscriptions[0].ref;
  assert.equal(ref.kind, 'query');
  assert.equal(ref.source.path, 'itineraries');
  assert.deepEqual(clone(ref.constraints), [
    { type: 'orderBy', value: '__name__' }, { type: 'startAt', value: historyPrefix },
    { type: 'endAt', value: historyPrefix + '\uf8ff' }, { type: 'limit', value: 50 },
  ]);
  assert.equal(states.at(-1).connection, 'live');
  assert.deepEqual(states.at(-1).entries.map(entry => entry.actor), ['소희', '성우']);
  assert.equal(store.transactions.length, 0);
  assert.equal(store.reads.length, 0);
  stop();
  assert.equal(store.subscriptions[0].active, false);
});

test('selected author persists locally and is captured before an asynchronous save', async t => {
  const store = createStore(t, { storage: [['sungso_trip_actor', '소희']] });
  connect(t, store);
  assert.equal(store.api.getActor(), '소희');
  store.api.setActor('성우');
  assert.equal(store.storage.get('sungso_trip_actor'), '성우');
  store.beforeTransaction(() => store.api.setActor('소희'));
  await store.api.saveHotelChoice('return', 'park');
  assert.equal(store.history()[0][1].actor, '성우');
  assert.equal(store.api.getActor(), '소희');
  assert.equal(store.api.setActor('unknown'), '미지정');
});

test('a decision changed on the server rejects a stale draft without writing trip or history', async t => {
  const store = createStore(t);
  const states = connect(t, store);
  const expected = clone(states.at(-1).data.decisions.flights);
  store.beforeTransaction(() => {
    const latest = clone(store.documents.get(canonicalPath));
    latest.decisions.flights = { status: 'confirmed', note: '다른 화면에서 발권 확인 완료' };
    store.documents.set(canonicalPath, latest);
  });
  await assert.rejects(
    store.api.saveDecision('flights', { status: 'candidate', note: '확인 중인 메모' }, expected),
    /바뀌었어요/,
  );
  assert.equal(store.transactions[0].writes.length, 0);
  assert.equal(store.history().length, 0);
  assert.deepEqual(store.documents.get(canonicalPath).decisions.flights, { status: 'confirmed', note: '다른 화면에서 발권 확인 완료' });
  assert.match(states.at(-1).error, /바뀌었어요/);
  assert.equal(states.at(-1).saving, false);
});

test('ascending reverse-time document IDs fetch exactly the latest 50 of 60 entries without reading old history documents', t => {
  const generated = Array.from({ length: 60 }, (_, index) => {
    const millis = mockNow + index * 60000;
    return {
      id: historyId(millis, `entry-${String(index).padStart(2, '0')}`),
      data: { tripId: 'honeymoon_2027', type: 'hotel', target: 'arrival', before: null, after: 'fair', actor: '성우', changedAt: new Date(millis).toISOString() },
    };
  });
  const store = createStore(t, { documents: [
    ...generated.map(row => [`itineraries/${row.id}`, row.data]),
    ['itineraries/honeymoon_2027_history_9999999999999_original', { ...generated[59].data, actor: '보관한 원본' }],
    ['itineraries/other_trip_log_0000000000000_other', generated[59].data],
  ] });
  const received = [];
  const stop = store.api.subscribeTripHistory(state => received.push(clone(state)));
  t.after(stop);
  const expected = generated.slice(-50).reverse().map(row => row.id);
  assert.equal(store.queryReads.length, 1);
  assert.deepEqual(store.queryReads[0], expected.map(id => `itineraries/${id}`));
  assert.deepEqual(received.at(-1).entries.map(entry => entry.id), expected);
  assert.equal(received.at(-1).entries.length, 50);
  assert.equal(received.at(-1).entries[0].changedAt, generated[59].data.changedAt);
  assert.equal(received.at(-1).entries.at(-1).changedAt, generated[10].data.changedAt);
  assert.equal(store.transactions.length, 0);
});
