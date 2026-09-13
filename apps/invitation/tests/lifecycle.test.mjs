import test from 'node:test';
import assert from 'node:assert/strict';
import { firestoreAdapter } from '../js/firestore-adapter.mjs';
import { createStore } from '../js/store.mjs';
import { defaultSelection } from '../js/core.mjs';

function fixture() {
  let member = { uid: 'member-a', role: 'sohee' }, afterRead;
  const subscriptions = [], writes = [], reads = [];
  const snapshot = raw => ({ exists: () => raw !== null, data: () => raw, metadata: { fromCache: false } });
  const sdk = {
    doc: () => ({}), serverTimestamp: () => 'server-time',
    onSnapshot: (_ref, _options, next, error) => { const sub = { next, error, active: true }; subscriptions.push(sub); return () => { sub.active = false; }; },
    runTransaction: async (_db, action) => action({ get: async ref => { reads.push(ref); afterRead?.(); return snapshot(null); }, set: (...args) => writes.push(args) }),
  };
  return { adapter: firestoreAdapter(sdk, {}, { member: () => member }), subscriptions, writes, reads, snapshot,
    switchMember() { member = { uid: 'member-b', role: 'sungwoo' }; }, afterRead(fn) { afterRead = fn; } };
}

test('Invitation ignores replaced and unsubscribed listeners, keeping the saved choice cleared', () => {
  const env = fixture(), received = [], errors = [];
  const stop = env.adapter.subscribe(raw => received.push(raw), error => errors.push(error));
  env.adapter.retry();
  env.subscriptions[0].next(env.snapshot({ selection: defaultSelection('garden') }));
  assert.equal(received.length, 0);
  env.subscriptions[1].next(env.snapshot(null)); assert.equal(received.length, 1);
  stop();
  for (const sub of env.subscriptions) { sub.next(env.snapshot({ private: true })); sub.error(new Error('late')); }
  assert.equal(received.length, 1); assert.equal(errors.length, 0);
  assert.ok(env.subscriptions.every(sub => !sub.active));
});

test('Invitation verifies the captured member after reading before staging any selection change', async () => {
  const env = fixture(); env.afterRead(() => env.switchMember());
  await assert.rejects(env.adapter.transact({ type: 'favorite', actor: 'sohee', templateId: 'garden', enabled: true }), /계정이 바뀌었어요/);
  assert.equal(env.reads.length, 1); assert.equal(env.writes.length, 0);
});

test('Invitation disposal clears private state and makes a pending save reject without success UI', async () => {
  let next, fail, finish;
  const store = createStore({ subscribe(onNext, onError) { next = onNext; fail = onError; return () => {}; }, transact: () => new Promise(resolve => { finish = resolve; }) });
  const received = []; store.subscribe(state => received.push(state));
  next({ selection: defaultSelection('garden') }, 'live');
  const pending = store.save({ type: 'favorite', actor: 'sohee', templateId: 'garden', enabled: true });
  store.dispose(); const count = received.length;
  next({ selection: defaultSelection('photo') }, 'live'); fail(new Error('late'));
  finish(); await assert.rejects(pending, /계정이 바뀌었어요/);
  assert.equal(received.length, count);
  let clean; store.subscribe(state => { clean = state; });
  assert.equal(clean.data.selection, null); assert.equal(clean.connection, 'signed-out');
});
