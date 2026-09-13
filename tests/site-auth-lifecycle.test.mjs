import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { memberFromClaims, createAuthEpoch, safeReturnPath } from '../shared/firebase/auth-core.mjs';

const source = (await readFile(new URL('../shared/firebase/site-auth.mjs', import.meta.url), 'utf8'))
  .replace(/^import .*?;\r?\n/gm, '').replace(/\bexport /g, '');
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
const user = uid => ({ uid, getIdTokenResult: async () => ({ claims: { email_verified: true, firebase: { sign_in_provider: 'google.com' } } }) });
const logoutKey = 'sungso_logout_pending_v1';
function memoryStorage(values = {}) {
  const data = new Map(Object.entries(values));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
}

async function harness({ delaySync = false, delaySignout = false, storage = memoryStorage(), session = memoryStorage(), initialUser = null } = {}) {
  const apps = [], pendingSync = [], pendingSignout = [], memberships = [], events = [], terminated = [], emitted = [];
  const records = { first: { active: true, role: 'sungwoo' }, second: { active: true, role: 'sohee' } };
  let observer, observerError, reloads = 0, privateClears = 0, unsubscribed = 0, popups = 0;
  const windowListeners = new Map();
  const privateRoot = { hidden: false, inert: false, replaceChildren() { privateClears++; } };
  const finish = (promiseList, auth, next, shouldDelay) => new Promise((resolve, reject) => {
    const action = () => { auth.currentUser = next; resolve(); };
    action.fail = () => reject(new Error('synthetic delayed SDK failure'));
    if (shouldDelay) promiseList.push(action); else action();
  });
  const globals = {
    FIREBASE_CONFIG: { projectId: 'demo-homehunt' }, memberFromClaims, createAuthEpoch,
    getApps: () => apps, initializeApp: (options, name) => { const app = { name, options, auth: { currentUser: initialUser } }; apps.push(app); return app; },
    getAuth: app => app.auth, setPersistence: async () => {}, browserLocalPersistence: {},
    onAuthStateChanged: (_auth, next, error) => { observer = next; observerError = error; },
    updateCurrentUser: (auth, next) => finish(pendingSync, auth, next, delaySync),
    signOut: async auth => { await finish(pendingSignout, auth, null, delaySignout); if (auth === apps[0].auth) observer(null); },
    signInWithPopup: async () => { popups++; }, GoogleAuthProvider: class { setCustomParameters() {} },
    getFirestore: app => app, doc: (app, collection, uid) => ({ app, collection, uid }),
    getDocFromServer: async ref => { memberships.push(ref); return { exists: () => !!records[ref.uid], data: () => records[ref.uid] }; },
    onSnapshot: (ref, _options, next, error) => { events.push({ ref, next, error }); return () => { unsubscribed++; }; },
    terminate: async app => { terminated.push(app.name); },
    document: { querySelectorAll: selector => selector === '[data-private-root]' ? [privateRoot] : [] },
    localStorage: storage, sessionStorage: session,
    window: { dispatchEvent() {}, addEventListener(type, callback) { windowListeners.set(type, callback); } }, CustomEvent: class {},
    location: { reload() { reloads++; } },
  };
  const api = await vm.runInNewContext(`(async () => { ${source}\nreturn { getMember, getAuthState, subscribeAuth, signInMember, signOutMember, syncAppAuth, registerPrivateCleanup }; })()`, globals);
  api.subscribeAuth(state => emitted.push(state));
  return { api, apps, events, records, memberships, emitted, terminated, privateRoot, storage, session,
    emit(next) { apps[0].auth.currentUser = next; observer(next); }, error() { observerError(new Error('synthetic')); },
    releaseSync() { pendingSync.splice(0).forEach(resolve => resolve()); }, releaseSignout() { pendingSignout.splice(0).forEach(resolve => resolve()); },
    failOneSync() { pendingSync.shift().fail(); },
    failSignout(index = 0) { pendingSignout.splice(index, 1)[0].fail(); },
    windowEvent(type, event) { windowListeners.get(type)?.(event); },
    pendingSync: () => pendingSync.length, pendingSignout: () => pendingSignout.length,
    reloads: () => reloads, privateClears: () => privateClears, unsubscribed: () => unsubscribed, popups: () => popups };
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

test('a rejected primary logout keeps private content cleared and cannot restore a persisted member', async () => {
  const f = await harness({ delaySignout: true });
  f.storage.setItem('sungso_invitation_v1', 'existing-local-draft');
  f.emit(user('first')); await settle();
  let cleanupCalls = 0;
  f.api.registerPrivateCleanup(() => { cleanupCalls++; });
  const oldMembership = f.events[0], done = f.api.signOutMember();
  assert.equal(f.api.signOutMember(), done, 'concurrent clicks share the same attempt');
  await settle();
  assert.equal(cleanupCalls, 1);
  assert.equal(f.unsubscribed(), 1);
  assert.equal(f.storage.getItem(logoutKey), '1');
  assert.equal(f.session.getItem(logoutKey), '1');
  f.failSignout(); await settle();
  assert.equal(f.pendingSignout(), 4, 'other SDK sign-outs still complete before reporting failure');
  assert.equal(f.reloads(), 0);
  f.releaseSignout(); assert.equal(await done, false);
  assert.equal(f.api.getAuthState().status, 'sign-out-failed');
  assert.equal(f.api.getMember(), null);
  assert.equal(f.privateRoot.hidden, true);
  assert.equal(f.privateRoot.inert, true);
  assert.equal(f.apps[0].auth.currentUser.uid, 'first', 'the failure fixture retains the primary identity');
  assert.equal(f.reloads(), 0);
  assert.equal(f.terminated.length, 0, 'SDKs remain available for explicit logout retry');
  f.emit(user('first'));
  f.error();
  oldMembership.next({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => true, data: () => ({ active: true, role: 'sungwoo' }) });
  await settle();
  assert.equal(f.memberships.length, 1, 'stale auth cannot even begin a new membership read');
  assert.equal(f.api.getMember(), null);
  assert.equal(f.reloads(), 0);
  assert.equal(f.storage.getItem('sungso_invitation_v1'), 'existing-local-draft');
});

test('a failed named-app logout is retried by the login control before opening a Google popup', async () => {
  const f = await harness({ delaySignout: true });
  f.emit(user('first')); await settle();
  const done = f.api.signOutMember(); await settle();
  f.failSignout(3); f.releaseSignout(); assert.equal(await done, false);
  assert.equal(f.api.getAuthState().status, 'sign-out-failed');
  const retry = f.api.signInMember(); await settle();
  assert.equal(f.pendingSignout(), 5);
  assert.equal(f.popups(), 0);
  assert.equal(f.storage.getItem(logoutKey), '1');
  f.releaseSignout(); await retry;
  assert.ok(f.apps.every(app => app.auth.currentUser === null));
  assert.equal(f.storage.getItem(logoutKey), null);
  assert.equal(f.session.getItem(logoutKey), null);
  assert.equal(f.terminated.length, 5);
  assert.equal(f.reloads(), 1);
  assert.equal(f.popups(), 0);
});

test('a pending logout survives reload or another app entry and runs before membership reads', async () => {
  const storage = memoryStorage({ [logoutKey]: '1', sungso_invitation_v1: 'existing-local-draft' });
  const f = await harness({ storage, initialUser: user('first'), delaySignout: true });
  await settle();
  f.emit(user('first')); await settle();
  assert.equal(f.pendingSignout(), 5);
  assert.equal(f.memberships.length, 0);
  assert.equal(f.events.length, 0);
  assert.equal(f.api.getMember(), null);
  assert.equal(f.privateRoot.hidden, true);
  assert.equal(f.storage.getItem(logoutKey), '1');
  f.releaseSignout(); await settle();
  assert.equal(f.storage.getItem(logoutKey), null);
  assert.equal(f.storage.getItem('sungso_invitation_v1'), 'existing-local-draft');
  assert.equal(f.reloads(), 1);
});

test('another tab logout marker clears this tab immediately and a failed retry never reloads from bfcache', async () => {
  const f = await harness({ delaySignout: true });
  f.emit(user('first')); await settle();
  f.storage.setItem(logoutKey, '1');
  f.windowEvent('storage', { key: logoutKey, newValue: '1' }); await settle();
  assert.equal(f.api.getMember(), null);
  assert.equal(f.privateRoot.hidden, true);
  assert.equal(f.unsubscribed(), 1);
  f.failSignout(); f.releaseSignout(); await settle();
  assert.equal(f.api.getAuthState().status, 'sign-out-failed');
  f.windowEvent('pageshow', { persisted: true }); await settle();
  assert.equal(f.pendingSignout(), 5);
  f.failSignout(); f.releaseSignout(); await settle();
  assert.equal(f.reloads(), 0);
  assert.equal(f.api.getMember(), null);
  assert.equal(f.storage.getItem(logoutKey), '1');
});

test('a delayed storage event cannot recreate an already completed logout request in a new member session', async () => {
  const storage = memoryStorage();
  storage.setItem(logoutKey, '1');
  storage.removeItem(logoutKey);
  const f = await harness({ delaySignout: true, storage });
  f.emit(user('second')); await settle();
  assert.equal(f.api.getMember().uid, 'second');
  f.windowEvent('storage', { key: logoutKey, newValue: '1' }); await settle();
  assert.equal(f.pendingSignout(), 0);
  assert.equal(f.api.getMember().uid, 'second');
  assert.equal(f.privateClears(), 0);
  assert.equal(f.storage.getItem(logoutKey), null);
  assert.equal(f.session.getItem(logoutKey), null);
});

test('blocked storage keeps the current page private and reports the reload limitation', async () => {
  const blocked = { getItem() { throw new Error('storage denied'); }, setItem() { throw new Error('storage denied'); }, removeItem() { throw new Error('storage denied'); } };
  const f = await harness({ delaySignout: true, storage: blocked, session: blocked });
  f.emit(user('first')); await settle();
  const done = f.api.signOutMember(); await settle();
  f.failSignout(); f.releaseSignout(); assert.equal(await done, false);
  assert.equal(f.api.getMember(), null);
  assert.equal(f.privateRoot.hidden, true);
  assert.equal(f.reloads(), 0);
  assert.match(f.api.getAuthState().error, /새로고침이나 새 탭에서는 잠금 유지를 보장할 수 없어요/);
});

test('session-only fallback protects same-tab reloads and explicitly disclaims protection for a new tab', async () => {
  const blocked = { getItem() { throw new Error('storage denied'); }, setItem() { throw new Error('storage denied'); }, removeItem() { throw new Error('storage denied'); } };
  const session = memoryStorage();
  const f = await harness({ delaySignout: true, storage: blocked, session });
  f.emit(user('first')); await settle();
  const done = f.api.signOutMember(); await settle();
  f.failSignout(); f.releaseSignout(); assert.equal(await done, false);
  assert.equal(session.getItem(logoutKey), '1');
  assert.match(f.api.getAuthState().error, /이 탭의 새로고침에는 잠금을 유지하지만 새 탭의 잠금 유지는 보장할 수 없어요/);
  const reloaded = await harness({ delaySignout: true, storage: blocked, session, initialUser: user('first') });
  reloaded.emit(user('first')); await settle();
  assert.equal(reloaded.memberships.length, 0);
  assert.equal(reloaded.pendingSignout(), 5);
  reloaded.failSignout(); reloaded.releaseSignout(); await settle();
  assert.equal(reloaded.api.getMember(), null);
  assert.equal(reloaded.reloads(), 0);
});

test('session-only fallback can complete after every SDK signs out without trying to remove a nonexistent blocked marker', async () => {
  let blockedRemovals = 0;
  const blocked = { getItem() { throw new Error('storage denied'); }, setItem() { throw new Error('storage denied'); },
    removeItem() { blockedRemovals++; throw new Error('storage denied'); } };
  const session = memoryStorage({ homehunt_visits_v1: 'existing-local-draft' });
  const f = await harness({ delaySignout: true, storage: blocked, session });
  f.emit(user('first')); await settle();
  const done = f.api.signOutMember(); await settle();
  assert.equal(session.getItem(logoutKey), '1');
  f.releaseSignout(); assert.equal(await done, true);
  assert.equal(blockedRemovals, 0);
  assert.equal(session.getItem(logoutKey), null);
  assert.equal(session.getItem('homehunt_visits_v1'), 'existing-local-draft');
  assert.ok(f.apps.every(app => app.auth.currentUser === null));
  assert.equal(f.reloads(), 1);
});

test('a marker written before the storage event is delivered blocks the next auth restore', async () => {
  const f = await harness({ delaySignout: true });
  f.storage.setItem(logoutKey, '1');
  f.emit(user('first')); await settle();
  assert.equal(f.memberships.length, 0);
  assert.equal(f.pendingSignout(), 5);
  assert.equal(f.api.getMember(), null);
  f.failSignout(); f.releaseSignout(); await settle();
  assert.equal(f.reloads(), 0);
  assert.equal(f.api.getAuthState().status, 'sign-out-failed');
});

test('a lock that cannot be removed is not reported as a completed logout', async () => {
  const storage = memoryStorage();
  storage.removeItem = () => { throw new Error('storage denied'); };
  const f = await harness({ storage });
  f.emit(user('first')); await settle();
  assert.equal(await f.api.signOutMember(), false);
  assert.ok(f.apps.every(app => app.auth.currentUser === null));
  assert.equal(f.api.getAuthState().status, 'sign-out-failed');
  assert.equal(f.storage.getItem(logoutKey), '1');
  assert.equal(f.reloads(), 0);
});

test('switching away from a denied account reloads the cleared app markup only after logout succeeds', async () => {
  const f = await harness();
  f.emit(user('outsider')); await settle();
  assert.equal(f.api.getAuthState().status, 'denied');
  assert.equal(await f.api.signOutMember(), true);
  assert.equal(f.reloads(), 1);
  assert.equal(f.api.getMember(), null);
  assert.ok(f.apps.every(app => app.auth.currentUser === null));
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
