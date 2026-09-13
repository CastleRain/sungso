import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { memberFromClaims, createAuthEpoch, safeReturnPath } from '../shared/firebase/auth-core.mjs';

const source = (await readFile(new URL('../shared/firebase/site-auth.mjs', import.meta.url), 'utf8'))
  .replace(/^import .*?;\r?\n/gm, '').replace(/\bexport /g, '');
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
const user = uid => ({ uid, getIdTokenResult: async () => ({ claims: { email_verified: true, firebase: { sign_in_provider: 'google.com' } } }) });

async function harness({ delaySync = false, delaySignout = false } = {}) {
  const apps = [], pendingSync = [], pendingSignout = [], memberships = [], events = [], terminated = [], emitted = [];
  const records = { first: { active: true, role: 'sungwoo' }, second: { active: true, role: 'sohee' } };
  let observer, observerError, reloads = 0, privateClears = 0;
  const privateRoot = { hidden: false, inert: false, replaceChildren() { privateClears++; } };
  const finish = (promiseList, auth, next, shouldDelay) => new Promise((resolve, reject) => {
    const action = () => { auth.currentUser = next; resolve(); };
    action.fail = () => reject(new Error('synthetic delayed SDK failure'));
    if (shouldDelay) promiseList.push(action); else action();
  });
  const globals = {
    FIREBASE_CONFIG: { projectId: 'demo-homehunt' }, memberFromClaims, createAuthEpoch,
    getApps: () => apps, initializeApp: (options, name) => { const app = { name, options, auth: { currentUser: null } }; apps.push(app); return app; },
    getAuth: app => app.auth, setPersistence: async () => {}, browserLocalPersistence: {},
    onAuthStateChanged: (_auth, next, error) => { observer = next; observerError = error; },
    updateCurrentUser: (auth, next) => finish(pendingSync, auth, next, delaySync),
    signOut: async auth => { await finish(pendingSignout, auth, null, delaySignout); if (auth === apps[0].auth) observer(null); },
    signInWithPopup: async () => {}, GoogleAuthProvider: class {},
    getFirestore: app => app, doc: (app, collection, uid) => ({ app, collection, uid }),
    getDocFromServer: async ref => { memberships.push(ref); return { exists: () => !!records[ref.uid], data: () => records[ref.uid] }; },
    onSnapshot: (ref, _options, next, error) => { events.push({ ref, next, error }); return () => {}; },
    terminate: async app => { terminated.push(app.name); },
    document: { querySelectorAll: selector => selector === '[data-private-root]' ? [privateRoot] : [] },
    window: { dispatchEvent() {}, addEventListener() {} }, CustomEvent: class {},
    location: { reload() { reloads++; } },
  };
  const api = await vm.runInNewContext(`(async () => { ${source}\nreturn { getMember, getAuthState, subscribeAuth, signOutMember, syncAppAuth }; })()`, globals);
  api.subscribeAuth(state => emitted.push(state));
  return { api, apps, events, records, memberships, emitted, terminated, privateRoot,
    emit(next) { apps[0].auth.currentUser = next; observer(next); }, error() { observerError(new Error('synthetic')); },
    releaseSync() { pendingSync.splice(0).forEach(resolve => resolve()); }, releaseSignout() { pendingSignout.splice(0).forEach(resolve => resolve()); },
    failOneSync() { pendingSync.shift().fail(); },
    pendingSync: () => pendingSync.length, pendingSignout: () => pendingSignout.length,
    reloads: () => reloads, privateClears: () => privateClears };
}

test('only own membership is read until a verified active Google membership is established', async () => {
  const f = await harness();
  assert.equal(f.memberships.length, 0);
  f.emit(user('outsider')); await settle();
  assert.equal(f.api.getMember(), null);
  assert.equal(f.api.getAuthState().status, 'denied');
  assert.deepEqual(f.memberships.map(ref => `${ref.collection}/${ref.uid}`), ['site_members/outsider']);
  assert.equal(f.events.length, 0);
  assert.ok(f.apps.slice(1).every(app => app.auth.currentUser === null));
});

test('delayed named-app authentication from an old account cannot finish after and replace the new account', async () => {
  const f = await harness({ delaySync: true });
  f.emit(user('first')); await settle(); assert.equal(f.pendingSync(), 4);
  f.emit(user('second')); await settle(); assert.equal(f.pendingSync(), 4, 'new sync waits for old SDK side effects');
  f.releaseSync(); await settle(); assert.equal(f.pendingSync(), 4);
  assert.equal(f.api.getMember(), null, 'no stale member is exposed');
  f.releaseSync(); await settle();
  assert.equal(f.api.getMember().uid, 'second');
  assert.ok(f.apps.every(app => app.auth.currentUser.uid === 'second'));
  assert.deepEqual(f.emitted.filter(state => state.status === 'member').map(state => state.member.uid), ['second']);
});

test('sign-out during delayed startup clears all named users after pending synchronization', async () => {
  const f = await harness({ delaySync: true });
  f.emit(user('first')); await settle();
  f.emit(null); await settle();
  f.releaseSync(); await settle();
  assert.equal(f.api.getMember(), null);
  assert.ok(f.apps.every(app => app.auth.currentUser === null));
  assert.equal(f.events.length, 0);
});

test('one failed old-account SDK update does not release the queue before its other updates settle', async () => {
  const f = await harness({ delaySync: true });
  f.emit(user('first')); await settle();
  f.emit(user('second')); await settle();
  f.failOneSync(); await settle();
  assert.equal(f.pendingSync(), 3, 'remaining old-account updates still own the queue');
  f.releaseSync(); await settle(); assert.equal(f.pendingSync(), 4);
  f.releaseSync(); await settle();
  assert.equal(f.api.getMember().uid, 'second');
  assert.ok(f.apps.every(app => app.auth.currentUser.uid === 'second'));
});

test('explicit logout hides private content immediately and awaits every named sign-out before reload', async () => {
  const f = await harness({ delaySignout: true });
  f.emit(user('first')); await settle(); assert.equal(f.api.getMember().uid, 'first');
  const done = f.api.signOutMember(); await settle();
  assert.equal(f.api.getMember(), null); assert.equal(f.privateRoot.hidden, true);
  assert.equal(f.pendingSignout(), 5); assert.equal(f.reloads(), 0);
  f.releaseSignout(); await done;
  assert.ok(f.apps.every(app => app.auth.currentUser === null));
  assert.equal(f.terminated.length, 5); assert.equal(f.reloads(), 1);
});

test('revoking an active member or an auth observer error clears private memory and retires the page', async () => {
  for (const reason of ['revoked', 'observer-error']) {
    const f = await harness(); f.emit(user('first')); await settle();
    if (reason === 'revoked') f.events[0].next({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => true,
      data: () => ({ active: false, role: 'sungwoo' }) });
    else f.error();
    await settle();
    assert.equal(f.api.getMember(), null); assert.ok(f.privateClears() > 0);
    assert.equal(f.terminated.length, 5); assert.equal(f.reloads(), 1);
  }
});

test('direct-link return paths stay inside the same origin and sungso base', () => {
  assert.equal(safeReturnPath('/sungso/invitation/#preview/ticket', 'https://example.test'), '/sungso/invitation/#preview/ticket');
  for (const value of ['https://outside.test/sungso/', '//outside.test/sungso/', '/other', '/sungso/%2e%2e/other',
    '/sungso/%2foutside', '/sungso/\\outside', 'javascript:alert(1)']) assert.equal(safeReturnPath(value, 'https://example.test'), null);
});
