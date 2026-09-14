import test from 'node:test';
import assert from 'node:assert/strict';
import { profileAdapter } from '../js/profile-adapter.mjs';
import { createProfileStore } from '../js/profile-store.mjs';
import { PROFILE_PATH, ProfileConflict, emptyProfile, emptyProfileSnapshot, emptyVenue } from '../js/profile-core.mjs';

const id = index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const photo = () => ({ dataUrl: 'data:image/jpeg;base64,/9j/2Q==', width: 1600, height: 1067 });
const path = value => `${PROFILE_PATH}/photos/${value}`;
const settings = (patch = {}) => ({ coverId: null, galleryIds: [], venue: emptyVenue(), ...patch });
const saved = (revision = 1, patch = {}) => ({ ...settings(patch), schemaVersion: 1, revision, updatedBy: 'sungwoo-uid', updatedAt: '2027-01-01T00:00:00Z' });
const snapshot = (value, metadata = {}) => ({ exists: () => value !== null && value !== undefined, data: () => value, metadata: { fromCache: false, hasPendingWrites: false, ...metadata } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(initial = {}, options = {}) {
  const data = new Map(Object.entries(initial)), subscribers = [], reads = [], commits = [];
  let identity = { uid: 'sungwoo-uid', role: 'sungwoo' }, mediaRead, transactionRead, commitFailure;
  const sdk = {
    doc: (_db, ...parts) => ({ path: parts.join('/') }),
    serverTimestamp: () => '2027-01-01T00:00:00Z',
    onSnapshot(ref, options, next, error) { const observer = { next, error, active: true }; subscribers.push(observer); return () => { observer.active = false; }; },
    async getDocFromServer(ref) { reads.push(ref.path); return mediaRead ? mediaRead(ref.path) : snapshot(data.get(ref.path)); },
    async runTransaction(db, callback) {
      const staged = [];
      await callback({
        async get(ref) { reads.push(ref.path); return transactionRead ? transactionRead(ref.path) : snapshot(data.get(ref.path)); },
        set(ref, value) { staged.push(['set', ref.path, value]); },
        delete(ref) { staged.push(['delete', ref.path]); },
      });
      if (commitFailure) throw commitFailure(data);
      for (const [op, ref, value] of staged) if (op === 'set') data.set(ref, value); else data.delete(ref);
      commits.push(staged);
    },
  };
  const adapter = profileAdapter(sdk, {}, { member: () => identity, timeout: 1000, ...options });
  return { adapter, data, reads, commits, subscribers, setIdentity: value => { identity = value; }, mediaRead: fn => { mediaRead = fn; }, transactionRead: fn => { transactionRead = fn; }, failCommit: fn => { commitFailure = fn; } };
}

test('subscription waits for the server and all photos, never seeding an empty profile', async () => {
  const view = fixture(), values = [], errors = [];
  const stop = view.adapter.subscribe((data, connection) => values.push({ data, connection }), error => errors.push(error));
  const observer = view.subscribers[0];
  await observer.next(snapshot(null, { fromCache: true }));
  assert.equal(values.at(-1).data.ready, false);
  await observer.next(snapshot(null));
  assert.equal(values.at(-1).data.ready, true);
  assert.equal(values.at(-1).data.profile.revision, 0);
  assert.equal(view.commits.length, 0);
  const pending = deferred(); view.mediaRead(() => pending.promise);
  const loading = observer.next(snapshot(saved(1, { coverId: id(1) })));
  await tick();
  assert.equal(values.at(-1).data.profile.revision, 0);
  assert.equal(values.at(-1).data.ready, false);
  pending.resolve(snapshot(photo())); await loading;
  assert.equal(values.at(-1).connection, 'live');
  assert.equal(values.at(-1).data.profile.revision, 1);
  assert.equal(values.at(-1).data.photos[id(1)].dataUrl, photo().dataUrl);
  assert.equal(errors.length, 0);
  stop();
});

test('a missing media document reports an error without publishing its new profile', async () => {
  const view = fixture(), values = [], errors = [];
  const stop = view.adapter.subscribe(data => values.push(data), error => errors.push(error));
  await view.subscribers[0].next(snapshot(saved(1, { coverId: id(1) })));
  assert.equal(errors.at(-1).code, 'profile-media-missing');
  assert.equal(values.some(value => value.profile.revision === 1), false);
  assert.equal(values.at(-1).ready, false);
  stop();
});

test('late photos cannot replace a newer revision or publish after an account change or disposal', async () => {
  const view = fixture(), values = [], media = deferred();
  view.mediaRead(() => media.promise);
  const stop = view.adapter.subscribe(data => values.push(data), error => { throw error; });
  const observer = view.subscribers[0];
  const older = observer.next(snapshot(saved(1, { coverId: id(1) })));
  await observer.next(snapshot(saved(2)));
  media.resolve(snapshot(photo())); await older;
  assert.equal(values.at(-1).profile.revision, 2);
  const stale = deferred(); view.mediaRead(() => stale.promise);
  const loading = observer.next(snapshot(saved(3, { coverId: id(2) })));
  await tick(); const length = values.length;
  view.setIdentity({ uid: 'sohee-uid', role: 'sohee' });
  stale.resolve(snapshot(photo())); await loading;
  assert.equal(values.length, length);
  await observer.next(snapshot(saved(4)));
  assert.equal(values.length, length);
  stop(); await observer.next(snapshot(saved(5)));
  assert.equal(values.length, length);
  assert.equal(observer.active, false);
});

test('cached or pending profile writes never announce fresh media as ready', async () => {
  const view = fixture(), values = [];
  const stop = view.adapter.subscribe((data, connection) => values.push({ data, connection }), error => { throw error; });
  for (const metadata of [{ fromCache: true }, { hasPendingWrites: true }]) await view.subscribers[0].next(snapshot(saved(1, { coverId: id(1) }), metadata));
  assert.equal(values.some(value => value.data.ready), false);
  assert.deepEqual(view.reads, []);
  stop();
});

test('a photo load timeout cannot publish its late result without a new subscription attempt', async () => {
  const view = fixture({}, { timeout: 20 }), values = [], errors = [], media = deferred();
  view.mediaRead(() => media.promise);
  const stop = view.adapter.subscribe(data => values.push(data), error => errors.push(error));
  const loading = view.subscribers[0].next(snapshot(saved(1, { coverId: id(1) })));
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(errors.at(-1).code, 'profile-media-timeout');
  media.resolve(snapshot(photo())); await loading;
  assert.equal(values.some(value => value.profile.revision === 1), false);
  stop();
});

test('one transaction creates replacement photos, removes unreferenced photos and advances the same shared revision', async () => {
  const view = fixture({ [PROFILE_PATH]: saved(4, { coverId: id(1), galleryIds: [id(2)] }), [path(id(1))]: photo(), [path(id(2))]: photo(), 'couplePicks/invitation_templates': { selectionRevision: 9 } });
  const result = await view.adapter.transact({ expectedRevision: 4, profile: settings({ coverId: id(3), galleryIds: [id(2), id(3)] }), newPhotos: { [id(3)]: photo() } });
  assert.deepEqual(result, { revision: 5 });
  assert.equal(view.data.has(path(id(1))), false);
  assert.deepEqual(view.data.get(path(id(2))), photo());
  assert.equal(view.data.get(path(id(3))).updatedBy, 'sungwoo-uid');
  assert.equal(view.data.get(PROFILE_PATH).revision, 5);
  assert.deepEqual(view.data.get('couplePicks/invitation_templates'), { selectionRevision: 9 });
  assert.equal(view.commits.length, 1);
  assert.equal(view.commits[0].length, 3);
  view.adapter.dispose();
});

test('conflicts, missing references and UUID collisions cannot stage partial writes', async () => {
  const view = fixture({ [PROFILE_PATH]: saved(2), [path(id(2))]: photo() });
  await assert.rejects(view.adapter.transact({ expectedRevision: 1, profile: settings(), newPhotos: {} }), { code: 'profile-conflict' });
  await assert.rejects(view.adapter.transact({ expectedRevision: 2, profile: settings({ coverId: id(1) }), newPhotos: {} }), { code: 'profile-media-missing' });
  await assert.rejects(view.adapter.transact({ expectedRevision: 2, profile: settings({ coverId: id(2) }), newPhotos: { [id(2)]: photo() } }), /사진 번호/);
  assert.equal(view.commits.length, 0);
  assert.equal(view.data.get(PROFILE_PATH).revision, 2);
  view.adapter.dispose();
});

test('a rules rejection caused by a competing revision is classified without retrying or overwriting it', async () => {
  for (const advanced of [false, true]) {
    const view = fixture({ [PROFILE_PATH]: saved(1) });
    const denied = Object.assign(new Error('permission denied'), { code: 'permission-denied' });
    view.failCommit(data => { if (advanced) data.set(PROFILE_PATH, saved(2, { venue: { ...emptyVenue(), name: 'partner venue' } })); return denied; });
    await assert.rejects(view.adapter.transact({ expectedRevision: 1, profile: settings(), newPhotos: {} }), { code: advanced ? 'profile-conflict' : 'permission-denied' });
    assert.equal(view.commits.length, 0);
    assert.equal(view.data.get(PROFILE_PATH).revision, advanced ? 2 : 1);
    assert.equal(view.reads.filter(ref => ref === PROFILE_PATH).length, 2, 'one transaction read and one diagnostic server read');
    view.adapter.dispose();
  }
});

test('account changes during transaction reads reject the pending save before any write is staged', async () => {
  for (const phase of ['profile', 'photo']) {
    const view = fixture({ [PROFILE_PATH]: saved(2), [path(id(1))]: photo() });
    const waiting = deferred();
    view.transactionRead(ref => (phase === 'profile' ? ref === PROFILE_PATH : ref !== PROFILE_PATH) ? waiting.promise : snapshot(view.data.get(ref)));
    const saving = view.adapter.transact({ expectedRevision: 2, profile: settings({ coverId: id(1) }), newPhotos: {} });
    await tick(); view.setIdentity({ uid: 'sohee-uid', role: 'sohee' });
    waiting.resolve(snapshot(phase === 'profile' ? saved(2) : photo()));
    await assert.rejects(saving, /계정/);
    assert.equal(view.commits.length, 0);
    view.adapter.dispose();
  }
});

test('store rejects saves until a complete live snapshot and protects an in-flight save without changing the draft', async () => {
  let publish, fail, pending = deferred(), saves = 0, stopped = false;
  const store = createProfileStore({ subscribe(next, error) { publish = next; fail = error; return () => { stopped = true; }; }, transact() { saves++; return pending.promise; } });
  const values = []; store.subscribe(value => values.push(value));
  const change = { expectedRevision: 0, profile: settings(), newPhotos: {} };
  await assert.rejects(store.save(change), /불러온/);
  publish({ ...emptyProfileSnapshot(), ready: true }, 'live');
  const saving = store.save(change);
  await assert.rejects(store.save(change), /앞선 저장/);
  assert.equal(saves, 1);
  pending.reject(new ProfileConflict());
  await assert.rejects(saving, { code: 'profile-conflict' });
  assert.equal(values.at(-1).saving, false);
  assert.equal(values.at(-1).data.profile.revision, 0);
  assert.equal(change.expectedRevision, 0);
  fail(new Error('offline'));
  await assert.rejects(store.save(change), /불러온/);
  store.dispose(); assert.equal(stopped, true);
  const count = values.length;
  publish({ profile: saved(1), photos: {}, ready: true }, 'live');
  assert.equal(values.length, count);
});

test('store does not expose a partial new profile and disposal clears media and late save results', async () => {
  let publish;
  const pending = deferred();
  const store = createProfileStore({ subscribe(next) { publish = next; }, transact: () => pending.promise });
  let latest; store.subscribe(value => { latest = value; });
  publish({ profile: saved(1), photos: {}, ready: true }, 'live');
  publish({ profile: saved(2, { coverId: id(1) }), photos: {}, ready: true }, 'live');
  assert.equal(latest.connection, 'error');
  assert.equal(latest.data.profile.revision, 1);
  assert.equal(latest.data.ready, false);
  publish({ profile: saved(1), photos: {}, ready: true }, 'live');
  const saving = store.save({ expectedRevision: 1, profile: settings(), newPhotos: {} });
  store.dispose(); pending.resolve({ revision: 2 });
  await assert.rejects(saving, /계정/);
  store.subscribe(value => { latest = value; });
  assert.equal(latest.connection, 'signed-out');
  assert.deepEqual(latest.data.photos, {});
  assert.deepEqual(latest.data.profile, emptyProfile());
});
