import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { HOME_TARGET_PRICE_STORAGE_KEY, createHomeTargetPriceBridge, validateHomeTargetPriceSnapshot } from '../../shared/home-target-price.mjs';

const NOW = '2026-09-07T01:02:03.000Z';
function memoryStorage() {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}
function bridge(options = {}) {
  return createHomeTargetPriceBridge({ storage: memoryStorage(), eventTarget: new EventTarget(), now: () => NOW, ...options });
}

test('target-only snapshot preserves KRW exactly and drops unrelated financial fields', () => {
  const snapshot = validateHomeTargetPriceSnapshot({ version: 1, source: 'wecost', targetPriceWon: 655000001,
    updatedAt: NOW, loans: [{ amount: 999 }], income: 999, availableCashWon: 999, householdId: 'private' });
  assert.deepEqual(snapshot, { version: 1, source: 'wecost', targetPriceWon: 655000001, updatedAt: NOW });
  assert.equal(snapshot.targetPriceWon / 10000, 65500.0001);
  assert.equal(Object.isFrozen(snapshot), true);
});

test('missing, malformed and invalid target data remain unavailable without an invented default', () => {
  const storage = memoryStorage();
  const service = bridge({ storage });
  assert.deepEqual(service.read(), { status: 'unavailable', reason: 'wecost-not-opened', snapshot: null });
  for (const raw of ['bad-json', '{}', JSON.stringify({ version: 1, source: 'wecost', targetPriceWon: 0, updatedAt: NOW })]) {
    storage.setItem(HOME_TARGET_PRICE_STORAGE_KEY, raw);
    assert.equal(service.read().status, 'unavailable');
    assert.equal(service.read().snapshot, null);
  }
  for (const price of [0, -1, NaN, Infinity, 1.2, '600000000', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(validateHomeTargetPriceSnapshot({ version: 1, source: 'wecost', targetPriceWon: price, updatedAt: NOW }), null);
  }
  assert.equal(validateHomeTargetPriceSnapshot({ version: 1, source: 'wecost', targetPriceWon: 1, updatedAt: '2026-02-30T00:00:00.000Z' }), null);
});

test('publishing stores one target-only key and reading never writes application settings', () => {
  const storage = memoryStorage();
  storage.setItem('unrelated-financial-state', 'unchanged');
  const service = bridge({ storage });
  const result = service.publish(650000000);
  assert.equal(result.status, 'available');
  assert.equal(result.snapshot.updatedAt, NOW);
  assert.deepEqual(JSON.parse(storage.getItem(HOME_TARGET_PRICE_STORAGE_KEY)), {
    version: 1, source: 'wecost', targetPriceWon: 650000000, updatedAt: NOW,
  });
  const before = [...storage.values];
  service.read();
  assert.deepEqual([...storage.values], before);
  assert.equal(storage.values.size, 2);
});

test('same-window consumers receive price updates once and unsubscribing stops delivery', () => {
  const storage = memoryStorage();
  const eventTarget = new EventTarget();
  const publisher = bridge({ storage, eventTarget });
  const consumer = bridge({ storage, eventTarget });
  const received = [];
  const stop = consumer.subscribe((state) => received.push(state));
  publisher.publish(600000000);
  publisher.publish(600000000); // same value and observation timestamp
  publisher.publish(700000000);
  assert.deepEqual(received.map((state) => state.snapshot?.targetPriceWon ?? null), [null, 600000000, 700000000]);
  stop();
  publisher.publish(800000000);
  assert.equal(received.length, 3);
});

test('storage events use the latest stored target and ignore other keys or storage areas', () => {
  const storage = memoryStorage();
  const publisher = bridge({ storage });
  const events = new EventTarget();
  const consumer = bridge({ storage, eventTarget: events });
  const received = [];
  const stop = consumer.subscribe((state) => received.push(state), { emitCurrent: false });
  publisher.publish(600000000);
  const oldValue = storage.getItem(HOME_TARGET_PRICE_STORAGE_KEY);
  publisher.publish(700000000);
  const dispatch = (key, storageArea = storage) => {
    const event = new Event('storage');
    Object.assign(event, { key, storageArea, newValue: oldValue });
    events.dispatchEvent(event);
  };
  dispatch('another-key');
  dispatch(HOME_TARGET_PRICE_STORAGE_KEY, memoryStorage());
  assert.equal(received.length, 0);
  dispatch(HOME_TARGET_PRICE_STORAGE_KEY);
  assert.equal(received[0].snapshot.targetPriceWon, 700000000);
  storage.removeItem(HOME_TARGET_PRICE_STORAGE_KEY);
  dispatch(null);
  assert.equal(received.at(-1).status, 'unavailable');
  stop();
});

test('a cleared or invalid loaded target removes the previous price and announces unavailability', () => {
  const storage = memoryStorage();
  const service = bridge({ storage });
  const states = [];
  const stop = service.subscribe((state) => states.push(state));
  service.publish(600000000);
  service.publish(null);
  assert.equal(storage.getItem(HOME_TARGET_PRICE_STORAGE_KEY), null);
  assert.equal(states.at(-1).status, 'unavailable');
  assert.equal(states.at(-1).reason, 'target-not-set');
  service.publish(650000000);
  service.clear('wecost-unavailable');
  assert.equal(service.read().reason, 'wecost-unavailable');
  stop();
});

test('blocked browser storage does not throw or interrupt a successful owner-side save', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  const service = bridge({ storage: blocked });
  assert.equal(service.read().reason, 'storage-unavailable');
  assert.equal(service.publish(600000000).reason, 'storage-unavailable');
  assert.equal(service.clear().reason, 'storage-unavailable');
  assert.equal(bridge({ storage: null }).read().snapshot, null);
});

const firebaseSource = fs.readFileSync(new URL('../../wecost/js/firebase.js', import.meta.url), 'utf8');
function actualFirebaseFunction(name) {
  const match = firebaseSource.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} must exist in the actual WeCost module`);
  return match[0];
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test('WeCost settings subscription publishes only its loaded target without adding a database subscription', async () => {
  const subscriptions = [];
  const published = [];
  const sandbox = { db: {}, DEFAULT_SETTINGS: {}, DEFAULT_SAVINGS: {},
    doc: (_, name) => name, collection: (_, name) => name,
    onSnapshot: (reference, callback, error) => { subscriptions.push({ reference, callback, error }); return () => {}; },
    homeTargetPriceBridge: { publish: (value) => published.push(value), clear: (reason) => published.push(reason) },
  };
  vm.createContext(sandbox);
  vm.runInContext(actualFirebaseFunction('subscribeAll'), sandbox);
  sandbox.subscribeAll(() => {});
  assert.equal(subscriptions.length, 5, 'No extra public financial subscription may be introduced');
  const settings = subscriptions.find((item) => item.reference === 'wecost_settings');
  await settings.callback({ exists: () => true, data: () => ({ targetHousePrice: 650000000, income: 999, loans: [1] }), metadata: { hasPendingWrites: false } });
  assert.deepEqual(published, [650000000]);
  await settings.callback({ exists: () => true, data: () => ({ targetHousePrice: 700000000 }), metadata: { hasPendingWrites: true } });
  assert.deepEqual(published, [650000000], 'Pending/possibly failed writes are not presented as saved targets');
  settings.error(new Error('fixture connection failure'));
  assert.equal(published.at(-1), 'wecost-unavailable');
});

test('WeCost target updates publish only after successful save and do not expose other setting updates', async () => {
  const published = [];
  const gate = deferred();
  const sandbox = { db: {}, targetPriceWriteSequence: 0, doc: () => 'settings', serverTimestamp: () => 'server-time',
    updateDoc: () => gate.promise, homeTargetPriceBridge: { publish: (price) => published.push(price) } };
  vm.createContext(sandbox);
  vm.runInContext(actualFirebaseFunction('updateSettings'), sandbox);
  const saved = sandbox.updateSettings({ targetHousePrice: 600000000, parentSupportSohee: 999 });
  assert.deepEqual(published, []);
  gate.resolve();
  await saved;
  assert.deepEqual(published, [600000000]);
  await sandbox.updateSettings({ monthlyPaymentLimit: 999 });
  assert.deepEqual(published, [600000000]);
  sandbox.updateDoc = async () => { throw Error('fixture save failure'); };
  await assert.rejects(sandbox.updateSettings({ targetHousePrice: 700000000 }));
  assert.deepEqual(published, [600000000]);
});

test('an older owner-side save cannot overwrite a newer completed target in the browser bridge', async () => {
  const published = [];
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const sandbox = { db: {}, targetPriceWriteSequence: 0, doc: () => 'settings', serverTimestamp: () => 'server-time',
    updateDoc: () => (++calls === 1 ? first.promise : second.promise), homeTargetPriceBridge: { publish: (price) => published.push(price) } };
  vm.createContext(sandbox);
  vm.runInContext(actualFirebaseFunction('updateSettings'), sandbox);
  const older = sandbox.updateSettings({ targetHousePrice: 600000000 });
  const newer = sandbox.updateSettings({ targetHousePrice: 700000000 });
  second.resolve();
  await newer;
  first.resolve();
  await older;
  assert.deepEqual(published, [700000000]);
});
