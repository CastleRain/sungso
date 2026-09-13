import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { FIREBASE_CONFIG } from '../shared/firebase/config.mjs';
import * as core from '../shared/finance/travel-budget-core.mjs';

// Production source with in-memory Firebase adapters only. No SDK import,
// credentials, external request, or live database mutation occurs in this suite.
const source = readFileSync(new URL('../shared/finance/travel-budget-store.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const planPath = 'itineraries/honeymoon_2027_budget';
const ledgerPath = 'wecost_items/synthetic-trip';
const prefix = 'honeymoon_2027_budget_log_';
const now = Date.parse('2026-08-10T00:00:00.000Z');
const clone = structuredClone;
const item = () => ({ id: 'synthetic-trip', name: '예시 여행', cat: core.TRAVEL_CATEGORY, planned: 6000000, deposit: 300000, actual: 100000, balance: 5600000, balanceDue: null, memo: '보존할 메모', extension: { untouched: true }, updatedAt: { seconds: 100, nanoseconds: 7 } });
const historyId = (time, suffix) => `${prefix}${String(9999999999999 - time).padStart(13, '0')}_${suffix}`;

function createStore(t, options = {}) {
  const { id, ...storedItem } = item();
  const documents = new Map([
    [ledgerPath, storedItem], ['wecost_items/other-expense', { cat: '식대', planned: 5000000 }],
    ['itineraries/honeymoon_2027', { days: ['current itinerary'] }],
    ['itineraries/main', { days: ['legacy itinerary'] }],
    ...(options.documents || []),
  ]);
  const listeners = new Map(), timers = new Map(), subscriptions = [], transactions = [], queries = [], reads = [];
  const storage = new Map([['sungso_trip_actor', '소희']]);
  let uuid = 0, timerId = 0, failHistory = false, beforeTransaction = null;
  let metadata = { fromCache: options.cache ?? false, hasPendingWrites: false };
  const snapshot = ref => ({ exists: () => documents.has(ref.path), data: () => clone(documents.get(ref.path)), metadata: { ...metadata } });
  const querySnapshot = ref => {
    let matches = [...documents.entries()].filter(([path]) => path.slice(0, path.lastIndexOf('/')) === ref.source.path);
    for (const constraint of ref.constraints) {
      if (constraint.type === 'where') matches = matches.filter(([, data]) => data[constraint.field] === constraint.value);
      if (constraint.type === 'startAt') matches = matches.filter(([path]) => path.split('/').at(-1) >= constraint.value);
      if (constraint.type === 'endAt') matches = matches.filter(([path]) => path.split('/').at(-1) <= constraint.value);
    }
    matches.sort(([a], [b]) => a.localeCompare(b));
    const limit = ref.constraints.find(row => row.type === 'limit')?.value;
    if (limit !== undefined) matches = matches.slice(0, limit);
    queries.push(matches.map(([path]) => path));
    return { docs: matches.map(([path, data]) => ({ id: path.split('/').at(-1), data: () => clone(data) })), metadata: { ...metadata } };
  };
  const emit = () => subscriptions.filter(row => row.active).forEach(row => row.next(row.ref.kind === 'query' ? querySnapshot(row.ref) : snapshot(row.ref)));
  const sdk = {
    getApps: () => [{ name: 'another-app' }], initializeApp: (_config, name) => ({ name }),
    getFirestore: app => ({ appName: app.name }),
    doc: (_db, ...parts) => ({ kind: 'doc', path: parts.join('/'), id: parts.at(-1) }),
    collection: (_db, path) => ({ kind: 'collection', path }),
    query: (source, ...constraints) => ({ kind: 'query', source, constraints }),
    where: (field, operator, value) => ({ type: 'where', field, operator, value }),
    documentId: () => '__name__', orderBy: value => ({ type: 'orderBy', value }),
    startAt: value => ({ type: 'startAt', value }), endAt: value => ({ type: 'endAt', value }), limit: value => ({ type: 'limit', value }),
    serverTimestamp: () => '__SERVER_TIMESTAMP__',
    onSnapshot: (ref, _options, next, error) => {
      const sub = { ref, next, error, active: true }; subscriptions.push(sub);
      if (options.errorPath && ref.path === options.errorPath) error(Object.assign(new Error('Read denied'), { code: 'permission-denied' }));
      else if (!options.delayed) next(ref.kind === 'query' ? querySnapshot(ref) : snapshot(ref));
      return () => { sub.active = false; };
    },
    runTransaction: async (_db, action) => {
      beforeTransaction?.();
      const transaction = { writes: [], committed: false }; transactions.push(transaction);
      const result = await action({
        get: async ref => { assert.equal(transaction.writes.length, 0, 'All transactional reads must precede writes'); reads.push(ref.path); return snapshot(ref); },
        update: (ref, data) => {
          if (!documents.has(ref.path)) throw new Error('Missing update document');
          transaction.writes.push({ type: 'update', path: ref.path, data: clone(data) });
        },
        set: (ref, data, options) => transaction.writes.push({ type: 'set', path: ref.path, data: clone(data), options: clone(options) }),
      });
      if (failHistory && transaction.writes.some(write => write.path.startsWith(`itineraries/${prefix}`))) {
        throw Object.assign(new Error('History rejected'), { code: 'permission-denied' });
      }
      for (const write of transaction.writes) {
        const data = clone(write.data);
        for (const key of ['updatedAt', 'changedAt']) if (data[key] === '__SERVER_TIMESTAMP__') data[key] = '2026-08-10T00:00:00.000Z';
        documents.set(write.path, write.type === 'update' || write.options?.merge ? { ...documents.get(write.path), ...data } : data);
      }
      transaction.committed = true;
      if (transaction.writes.length) emit();
      return result;
    },
  };
  const context = vm.createContext({
    ...sdk, ...core, FIREBASE_CONFIG, structuredClone,
    Date: class extends Date { static now() { return now; } },
    navigator: { onLine: true }, crypto: { randomUUID: () => `mock-${++uuid}` },
    localStorage: { getItem: key => storage.get(key) ?? null },
    window: { addEventListener: (name, fn) => listeners.set(name, fn) },
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(source + '\nthis.api = {subscribeTravelBudget, subscribeBudgetHistory, saveTravelBudget, saveTravelLedgerItem};', context);
  return {
    api: context.api, documents, subscriptions, transactions, queries, reads, emit, storage,
    metadata: value => { metadata = { ...metadata, ...value }; },
    offline: () => { context.navigator.onLine = false; listeners.get('offline')(); },
    online: () => { context.navigator.onLine = true; listeners.get('online')(); },
    failHistory: () => { failHistory = true; }, beforeTransaction: fn => { beforeTransaction = fn; },
    history: () => [...documents.entries()].filter(([path]) => path.startsWith(`itineraries/${prefix}`)),
  };
}
function connect(t, store) {
  const states = [];
  const stop = store.api.subscribeTravelBudget(state => states.push(clone(state)));
  t.after(stop);
  return states;
}
function editor(state) {
  const item = state.items[0];
  return { draft: core.deriveBudgetDraft(item, state.plan, state.fx), expected: { item, plan: state.plan } };
}

test('read-only initialization subscribes only to travel expenses, existing plan and saved FX without seeding', t => {
  const store = createStore(t), before = clone([...store.documents]);
  const states = connect(t, store);
  assert.equal(states.at(-1).connection, 'live');
  assert.equal(states.at(-1).items.length, 1);
  assert.equal(states.at(-1).plan, null);
  assert.equal(states.at(-1).fx, null);
  assert.deepEqual(clone(store.subscriptions[0].ref.constraints), [{ type: 'where', field: 'cat', operator: '==', value: core.TRAVEL_CATEGORY }]);
  assert.deepEqual(store.subscriptions.slice(1).map(row => row.ref.path), [planPath, 'honeymoon_fx/usd_krw']);
  assert.equal(store.transactions.length, 0);
  assert.deepEqual([...store.documents], before);
});

test('Travel atomically updates the same expense, a detailed plan and exact audit while preserving unrelated fields', async t => {
  const store = createStore(t), states = connect(t, store);
  const { draft, expected } = editor(states.at(-1));
  draft.rows[0].amount = 7200000; draft.availableCash = 2000000;
  const before = clone([...store.documents]);
  const result = await store.api.saveTravelBudget(draft, expected);
  assert.equal(result.changed, true);
  assert.equal(store.transactions[0].committed, true);
  assert.equal(store.transactions[0].writes.length, 3);
  assert.deepEqual(store.transactions[0].writes[0], { type: 'update', path: ledgerPath, data: { planned: 7200000, balance: 6800000, updatedAt: '__SERVER_TIMESTAMP__' } });
  assert.equal(store.documents.get(planPath).baselineTotal, 6000000);
  assert.equal(store.documents.get(planPath).availableCash, 2000000);
  assert.equal(store.documents.get(ledgerPath).memo, '보존할 메모');
  assert.deepEqual(store.documents.get(ledgerPath).extension, { untouched: true });
  for (const [path, data] of before) if (path !== ledgerPath) assert.deepEqual(store.documents.get(path), data);
  assert.equal([...store.documents.keys()].filter(path => path.startsWith('wecost_items/')).length, 2, 'No duplicate expense was added');
  const [path, audit] = store.history()[0];
  assert.equal(path, `itineraries/${historyId(now, 'mock-1')}`);
  assert.equal(audit.source, 'travel');
  assert.equal(audit.actor, '소희');
  assert.equal(audit.before.planned, 6000000);
  assert.equal(audit.after.planned, 7200000);
  assert.equal(audit.delta, 1200000);
  assert.equal(audit.after.plan.rows[0].amount, 7200000);
  assert.equal(states.at(-1).saving, false);
  assert.equal(states.at(-1).items[0].planned, 7200000);
  assert.deepEqual(store.reads, [ledgerPath, planPath]);
});

test('an audit commit failure rolls back the expense and plan and leaves the draft intact', async t => {
  const store = createStore(t), states = connect(t, store);
  const { draft, expected } = editor(states.at(-1)); draft.rows[0].amount = 8000000;
  const before = clone([...store.documents]), input = clone(draft);
  store.failHistory();
  await assert.rejects(store.api.saveTravelBudget(draft, expected), /저장 권한/);
  assert.equal(store.transactions[0].writes.length, 3);
  assert.equal(store.transactions[0].committed, false);
  assert.deepEqual([...store.documents], before);
  assert.deepEqual(draft, input);
  assert.equal(store.history().length, 0);
  assert.equal(states.at(-1).saving, false);
  assert.equal(states.at(-1).items[0].planned, 6000000);
});

test('stale payment or detailed plan edits reject before any transactional writes', async t => {
  for (const target of ['ledger', 'plan']) {
    const store = createStore(t), states = connect(t, store);
    const { draft, expected } = editor(states.at(-1)); draft.rows[0].amount = 8000000;
    store.beforeTransaction(() => {
      if (target === 'ledger') store.documents.get(ledgerPath).actual = 500000;
      else store.documents.set(planPath, { ...draft, note: '다른 사람이 저장한 계획' });
    });
    await assert.rejects(store.api.saveTravelBudget(draft, expected), /바뀌었어요/);
    assert.equal(store.transactions[0].writes.length, 0);
    assert.equal(store.history().length, 0);
  }
});

test('a matching saved plan is a no-op, including server timestamps and unknown plan fields', async t => {
  const plan = { ...core.deriveBudgetDraft(item()), extraField: 'retain', updatedAt: { seconds: 55, nanoseconds: 9 } };
  const store = createStore(t, { documents: [[planPath, plan]] }), states = connect(t, store);
  const { draft, expected } = editor(states.at(-1));
  const result = await store.api.saveTravelBudget(draft, expected);
  assert.equal(result.changed, false);
  assert.equal(store.transactions[0].writes.length, 0);
  assert.deepEqual(store.documents.get(planPath), plan);
});

test('Travel saves require all live snapshots and connectivity; a cached snapshot is not permission to save', async t => {
  const store = createStore(t, { cache: true }), states = connect(t, store);
  const { draft, expected } = editor(states.at(-1));
  assert.equal(states.at(-1).connection, 'loading');
  await assert.rejects(store.api.saveTravelBudget(draft, expected), /연결/);
  store.metadata({ fromCache: false }); store.emit();
  assert.equal(states.at(-1).connection, 'live');
  store.offline();
  await assert.rejects(store.api.saveTravelBudget(draft, expected), /연결/);
  assert.equal(store.transactions.length, 0);
  store.online();
  assert.equal(states.at(-1).connection, 'live');
});

test('a denied plan read remains an error when the later FX snapshot arrives', async t => {
  const store = createStore(t, { errorPath: planPath }), states = connect(t, store);
  assert.equal(states.at(-1).connection, 'error');
  assert.match(states.at(-1).error, /권한/);
  const { draft, expected } = editor(states.at(-1));
  await assert.rejects(store.api.saveTravelBudget(draft, expected), /연결/);
  assert.equal(store.transactions.length, 0);
});

test('WeCost can save without Travel subscriptions, with payment audit and no plan rewrite', async t => {
  const plan = core.deriveBudgetDraft(item());
  const store = createStore(t, { documents: [[planPath, plan]] });
  store.beforeTransaction(() => store.storage.set('sungso_trip_actor', '성우'));
  await store.api.saveTravelLedgerItem('synthetic-trip', { planned: 6800000, actual: 900000, balanceDue: null }, item());
  assert.equal(store.subscriptions.length, 0);
  assert.equal(store.transactions[0].writes.length, 2);
  assert.equal(store.documents.get(ledgerPath).balance, 5600000);
  assert.deepEqual(store.documents.get(planPath), plan);
  const audit = store.history()[0][1];
  assert.equal(audit.source, 'wecost');
  assert.equal(audit.actor, '소희', 'Author is captured before the asynchronous transaction');
  assert.equal(audit.before.paid, 400000);
  assert.equal(audit.after.paid, 1200000);
  assert.equal(audit.delta, 800000);
  assert.equal(core.calculateTravelBudget(plan, { ...store.documents.get(ledgerPath), id: 'synthetic-trip' }).mismatch, true);
});

test('WeCost payment edits also reject stale snapshots and roll back when history cannot commit', async t => {
  const stale = createStore(t);
  stale.beforeTransaction(() => { stale.documents.get(ledgerPath).memo = '다른 편집'; });
  await assert.rejects(stale.api.saveTravelLedgerItem('synthetic-trip', { actual: 500000 }, item()), /바뀌었어요/);
  assert.equal(stale.transactions[0].writes.length, 0);
  const failed = createStore(t), before = clone([...failed.documents]); failed.failHistory();
  await assert.rejects(failed.api.saveTravelLedgerItem('synthetic-trip', { actual: 500000 }, item()), /권한/);
  assert.deepEqual([...failed.documents], before);
});

test('history uses a bounded reverse-time prefix query and returns latest 50 without unrelated trip records', t => {
  const logs = Array.from({ length: 60 }, (_, i) => [
    `itineraries/${historyId(now + i * 60000, `entry-${i}`)}`,
    { tripId: 'honeymoon_2027', type: 'budget', source: 'travel', actor: '성우', changedAt: new Date(now + i * 60000).toISOString(), before: { planned: i }, after: { planned: i + 1 }, delta: 1 },
  ]);
  const store = createStore(t, { documents: [...logs, ['itineraries/honeymoon_2027_log_0000000000000_old', logs[0][1]]] });
  const states = [], stop = store.api.subscribeBudgetHistory(state => states.push(clone(state))); t.after(stop);
  assert.equal(states.at(-1).connection, 'live');
  assert.equal(states.at(-1).entries.length, 50);
  assert.deepEqual(states.at(-1).entries.map(entry => entry.id), logs.slice(-50).reverse().map(([path]) => path.split('/').at(-1)));
  assert.deepEqual(clone(store.subscriptions[0].ref.constraints), [
    { type: 'orderBy', value: '__name__' }, { type: 'startAt', value: prefix },
    { type: 'endAt', value: prefix + '\uf8ff' }, { type: 'limit', value: 50 },
  ]);
  assert.equal(store.transactions.length, 0);
});
