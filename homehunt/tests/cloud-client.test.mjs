import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudSession, cloudSessionErrorMessage } from '../js/cloud-session.js';
import { createUserSnapshotStore } from '../js/cloud-firestore-store.js';
import { mountCloudPanel } from '../js/cloud-panel.js';
import { normalizeCloudSnapshot } from '../js/cloud-snapshot-core.mjs';

const firebaseConfig = { apiKey: 'public-test-config', projectId: 'test-project', authDomain: 'test-project.firebaseapp.com' };
const personal = () => normalizeCloudSnapshot({ visits: [{ id: 'visit-a', name: '개인 기록', memo: '<script>plain text</script>' }] });
const tick = () => new Promise(resolve => setImmediate(resolve));

function sdkFixture(initialUser = null) {
  let observer; let authUser = initialUser; let tokenReads = 0; let sdkLoads = 0;
  const documents = new Map(); const reads = []; const writes = [];
  let transactions = Promise.resolve();
  const docSnapshot = ref => ({ exists: () => documents.has(ref.path), data: () => structuredClone(documents.get(ref.path)) });
  const user = (uid = 'uid-a') => ({ uid, email: 'test@example.test', displayName: '테스트 사용자', emailVerified: true,
    getIdToken: async () => { tokenReads += 1; return 'synthetic-test-id-token'; } });
  const sdk = {
    getApps: () => [], initializeApp: (config, name) => ({ name, options: config }),
    getAuth: () => ({}), browserLocalPersistence: { type: 'LOCAL' }, setPersistence: async () => {},
    onAuthStateChanged: (_auth, callback) => { observer = callback; callback(authUser); return () => { observer = null; }; },
    GoogleAuthProvider: class { setCustomParameters(value) { this.parameters = value; } },
    signInWithPopup: async () => { authUser = user(); observer?.(authUser); },
    signOut: async () => { authUser = null; observer?.(null); },
    getFirestore: () => ({}), doc: (_db, collection, owner) => ({ path: `${collection}/${owner}` }),
    getDocFromServer: async ref => { reads.push(ref.path); return docSnapshot(ref); },
    runTransaction: (_db, callback) => {
      const operation = transactions.then(async () => {
        const pending = [];
        const value = await callback({
          get: async ref => docSnapshot(ref),
          set: (ref, data) => pending.push([ref.path, structuredClone(data)]),
        });
        for (const [path, data] of pending) { writes.push(path); documents.set(path, data); }
        return value;
      });
      transactions = operation.catch(() => {});
      return operation;
    },
  };
  return { sdk, user, documents, reads, writes,
    loadSdk: async () => { sdkLoads += 1; return sdk; },
    changeUser: value => { authUser = value; observer?.(value); },
    get tokenReads() { return tokenReads; }, get sdkLoads() { return sdkLoads; },
  };
}

test('Firebase-only session restores auth without reading or writing any personal cloud document', async () => {
  const f = sdkFixture(); const session = createCloudSession({ firebaseConfig, loadSdk: f.loadSdk });
  await session.init(); await session.signIn();
  assert.equal(session.getState().status, 'signed-in');
  assert.equal(session.getState().transport, 'firestore');
  assert.equal(session.getState().apiConfigured, false);
  assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, []);
  assert.equal(f.sdkLoads, 1);
  assert.ok(!JSON.stringify(session.getState()).includes('synthetic-test-id-token'));
  await session.signOut(); assert.equal(session.getState().user, null);
});

test('an unconfigured session never loads an SDK and cannot fetch a cloud API', async () => {
  const f = sdkFixture(); const session = createCloudSession({ loadSdk: f.loadSdk });
  assert.equal((await session.init()).configured, false);
  await assert.rejects(session.apiFetch('/health'), error => error.status === 503);
  await assert.rejects(session.signIn(), error => error.code === 'CLOUD_UNCONFIGURED');
  assert.equal(f.sdkLoads, 0);
});

test('API token is limited to the configured origin and path, never arbitrary URLs or redirects', async () => {
  const f = sdkFixture(); const calls = [];
  const session = createCloudSession({ firebaseConfig, apiBaseUrl: 'https://api.example.test/homehunt/api', loadSdk: f.loadSdk,
    fetchImpl: async (...args) => { calls.push(args); return new Response('{}'); } });
  for (const url of ['https://evil.example.test/homehunt/api/health', '//evil.example.test',
    'https://api.example.test/public', 'https://api.example.test/homehunt/api2/health', '../private',
    '%2e%2e/private', '\\evil.example.test', 'https://user:pass@api.example.test/homehunt/api/health']) {
    await assert.rejects(session.apiFetch(url), error => error.code === 'CLOUD_API_URL_FORBIDDEN');
  }
  assert.equal(f.sdkLoads, 0); assert.equal(f.tokenReads, 0); assert.equal(calls.length, 0);
  await session.signIn();
  await session.apiFetch('/health', { headers: { Authorization: 'caller-supplied' }, redirect: 'follow', credentials: 'include' });
  assert.equal(calls[0][0], 'https://api.example.test/homehunt/api/health');
  assert.equal(calls[0][1].headers.get('authorization'), 'Bearer synthetic-test-id-token');
  assert.equal(calls[0][1].redirect, 'error');
  assert.equal(calls[0][1].credentials, 'omit');
  assert.equal(calls[0][1].cache, 'no-store');
});

test('only HTTPS or explicit local HTTP API configuration is allowed', () => {
  for (const apiBaseUrl of ['http://public.example.test/api', 'https://u:p@api.example.test/api',
    'https://api.example.test/api?token=secret', 'https://api.example.test/api#hash', '/relative']) {
    assert.throws(() => createCloudSession({ firebaseConfig, apiBaseUrl }), error => error.code === 'INVALID_CLOUD_API_URL');
  }
  assert.equal(createCloudSession({ firebaseConfig, apiBaseUrl: 'http://localhost:8787/api' }).getState().apiConfigured, true);
});

test('missing auth and expired server authentication yield useful errors without anonymous retries', async () => {
  const f = sdkFixture(); let calls = 0;
  const session = createCloudSession({ firebaseConfig, apiBaseUrl: 'https://api.example.test/api', loadSdk: f.loadSdk,
    fetchImpl: async () => { calls += 1; return new Response('{}', { status: 401 }); } });
  await assert.rejects(session.apiFetch('/health'), error => error.status === 401 && /로그인/.test(error.message));
  assert.equal(calls, 0);
  await session.signIn();
  await assert.rejects(session.apiFetch('/health'), error => error.status === 401);
  assert.equal(calls, 1);
});

test('account changes during token retrieval never send that old token to the API', async () => {
  const f = sdkFixture(); let release; let calls = 0;
  const session = createCloudSession({ firebaseConfig, apiBaseUrl: 'https://api.example.test/api', loadSdk: f.loadSdk,
    fetchImpl: async () => { calls += 1; return new Response('{}'); } });
  await session.signIn();
  const previous = f.user(); previous.getIdToken = () => new Promise(resolve => { release = resolve; });
  f.changeUser(previous);
  const pending = session.apiFetch('/health'); await tick();
  f.changeUser(f.user('uid-b')); release('old-account-token');
  await assert.rejects(pending, error => error.code === 'CLOUD_SESSION_CHANGED');
  assert.equal(calls, 0);
});

test('API snapshots use normalized JSON and revision checks, with no Firestore fallback on failure', async () => {
  const f = sdkFixture(); const calls = [];
  const session = createCloudSession({ firebaseConfig, apiBaseUrl: 'https://api.example.test/api', loadSdk: f.loadSdk,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({
      snapshot: personal(), revision: 1, updatedAt: '2026-09-08T00:00:00.000Z',
    })); } });
  await session.signIn();
  const saved = await session.saveSnapshot({ ...personal(), routes: [{ provider: 'kakao', minutes: 30 }] }, 0);
  assert.equal(saved.revision, 1);
  assert.equal(calls[0].url, 'https://api.example.test/api/household/snapshot');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.expectedRevision, 0); assert.ok(!('routes' in body.snapshot));
  assert.deepEqual(f.writes, []);
});

test('free Firestore adapter shares only the signed-in user path, uses online load and atomic revisions', async () => {
  const f = sdkFixture(); const session = createCloudSession({ firebaseConfig, loadSdk: f.loadSdk });
  await session.signIn();
  assert.deepEqual(await session.loadSnapshot(), { snapshot: null, revision: 0, updatedAt: null });
  const saved = await session.saveSnapshot(personal(), 0);
  assert.equal(saved.revision, 1);
  assert.equal(f.writes[0], 'homehunt_user_snapshots/uid-a');
  assert.equal(f.documents.get(f.writes[0]).updatedBy, 'uid-a');
  await assert.rejects(session.saveSnapshot(personal(), 0), error => error.status === 409);
  f.changeUser(f.user('uid-b'));
  assert.equal((await session.loadSnapshot()).snapshot, null);
  assert.equal(f.reads.at(-1), 'homehunt_user_snapshots/uid-b');
});

test('Firestore concurrent saves of one revision have one winner and sanitize provider fields', async () => {
  const f = sdkFixture(); const store = createUserSnapshotStore({ db: {}, sdk: f.sdk, getUid: () => 'uid-a' });
  const result = await Promise.allSettled([
    store.save({ ...personal(), provider: 'kakao', routes: [{ minutes: 30 }] }, 0), store.save(personal(), 0),
  ]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(result.find(item => item.status === 'rejected').reason.status, 409);
  assert.ok(!JSON.stringify([...f.documents.values()]).includes('kakao'));
});

test('Firestore load does not deliver a previous user record after account switch', async () => {
  let owner = 'uid-a'; let release;
  const f = sdkFixture();
  f.sdk.getDocFromServer = () => new Promise(resolve => { release = resolve; });
  const store = createUserSnapshotStore({ db: {}, sdk: f.sdk, getUid: () => owner });
  const pending = store.load(); owner = 'uid-b';
  release({ exists: () => false });
  await assert.rejects(pending, error => error.code === 'CLOUD_SESSION_CHANGED');
});

test('known Firebase permission and setup errors are shown without raw SDK/credential details', () => {
  assert.match(cloudSessionErrorMessage({ code: 'permission-denied', message: 'private-details' }), /접근 권한/);
  assert.match(cloudSessionErrorMessage({ code: 'auth/configuration-not-found' }), /활성화/);
  assert.match(cloudSessionErrorMessage({ code: 'auth/unauthorized-domain' }), /허용 도메인/);
  assert.doesNotMatch(cloudSessionErrorMessage(new Error('secret raw details')), /secret/);
});

class Element extends EventTarget {
  constructor(tag, ownerDocument) { super(); this.tagName = tag; this.ownerDocument = ownerDocument; this.children = []; this.dataset = {}; this.classList = { add() {} }; this.attributes = {}; this.ownText = ''; }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.ownText = ''; this.children = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
}

function panelFixture({ remote = { snapshot: null, revision: 0, updatedAt: null }, failSave = null, configured = true } = {}) {
  const document = { createElement: tag => new Element(tag, document) }; const root = document.createElement('section');
  let listener; let state = { configured, transport: 'firestore', status: 'signed-out', user: null };
  let reads = 0; let saves = 0; let applies = 0; const applied = []; const savedRequests = []; let local = personal();
  const session = {
    getState: () => ({ ...state }),
    init: async () => ({ ...state }),
    subscribe: callback => { listener = callback; callback(state); return () => {}; },
    signIn: async () => { state = { ...state, status: 'signed-in', user: { uid: 'uid-a', displayName: '사용자' } }; listener(state); },
    signOut: async () => { state = { ...state, status: 'signed-out', user: null }; listener(state); },
    loadSnapshot: async () => { reads += 1; return structuredClone(remote); },
    saveSnapshot: async (snapshot, expected) => {
      saves += 1; savedRequests.push({ snapshot: structuredClone(snapshot), expected });
      if (failSave) throw failSave;
      if (expected !== remote.revision) throw Object.assign(new Error('concurrent update'), { status: 409, code: 'CLOUD_SNAPSHOT_CONFLICT' });
      remote = { snapshot: structuredClone(snapshot), revision: expected + 1 }; return remote;
    },
  };
  const panel = mountCloudPanel({ root, session, captureSnapshot: () => local, applySnapshot: snapshot => { applies += 1; applied.push(snapshot); } });
  const click = async action => { root.descendants().find(item => item.dataset.cloudAction === action).dispatchEvent(new Event('click')); await tick(); };
  return { root, session, panel, click, applied, savedRequests,
    setRemote: value => { remote = value; }, setLocal: value => { local = value; },
    get reads() { return reads; }, get saves() { return saves; }, get applies() { return applies; } };
}

test('cloud panel login never reads, writes or replaces the local snapshot', async () => {
  const f = panelFixture(); await f.click('login');
  assert.equal(f.reads, 0); assert.equal(f.saves, 0); assert.equal(f.applies, 0);
  assert.match(f.root.textContent, /저장 또는 불러오기/);
});

test('explicit first save inspects remote revision and only creates an empty cloud record', async () => {
  const f = panelFixture(); await f.click('login'); await f.click('save');
  assert.equal(f.reads, 1); assert.equal(f.saves, 1); assert.equal(f.applies, 0);
  assert.match(f.root.textContent, /클라우드 저장 완료 · 버전 1/);
});

test('existing cloud record can be explicitly replaced without loading or losing local changes', async () => {
  const remoteSnapshot = personal(); remoteSnapshot.visits[0].memo = '원격에만 있는 개인 메모';
  const f = panelFixture({ remote: { snapshot: remoteSnapshot, revision: 4, updatedAt: '2026-09-08T00:00:00.000Z' } });
  await f.click('login'); await f.click('save');
  assert.equal(f.saves, 0); assert.equal(f.applies, 0);
  assert.match(f.root.textContent, /클라우드 버전 4.*방문 1개.*관심 0개.*회사 0곳/);
  assert.doesNotMatch(f.root.textContent, /원격에만 있는 개인 메모|먼저 불러와/);
  assert.equal(f.root.descendants().find(node => node.className === 'cloud-panel-replacement').hidden, false);
  const modifiedLocal = personal(); modifiedLocal.visits[0].memo = '새로고침 이후 현재 수정한 메모'; f.setLocal(modifiedLocal);
  await f.click('replace');
  assert.equal(f.saves, 1); assert.equal(f.applies, 0);
  assert.equal(f.savedRequests[0].expected, 4);
  assert.equal(f.savedRequests[0].snapshot.visits[0].memo, '새로고침 이후 현재 수정한 메모');
  assert.match(f.root.textContent, /클라우드 저장 완료 · 버전 5/);
  assert.equal(f.root.descendants().find(node => node.className === 'cloud-panel-replacement').hidden, true);
});

test('explicit cloud load remains a separate choice after inspecting an existing record', async () => {
  const f = panelFixture({ remote: { snapshot: personal(), revision: 4, updatedAt: null } });
  await f.click('login'); await f.click('save');
  assert.equal(f.saves, 0); assert.equal(f.applies, 0);
  await f.click('load'); assert.equal(f.applies, 1);
  assert.equal(f.applied[0].visits[0].memo, '<script>plain text</script>');
  await f.click('save'); assert.equal(f.saves, 1);
  assert.match(f.root.textContent, /버전 5/);
});

test('a concurrent-save conflict preserves local input and only reads the new version for review', async () => {
  const error = Object.assign(new Error('conflict'), { status: 409, code: 'CLOUD_SNAPSHOT_CONFLICT' });
  const f = panelFixture({ failSave: error }); await f.click('login'); await f.click('save');
  assert.equal(f.saves, 1); assert.equal(f.applies, 0); assert.equal(f.reads, 2);
  assert.match(f.root.textContent, /다른 기기의 변경을 확인/);
});

test('cancelling replacement leaves cloud and local records intact and rechecks before a later replacement', async () => {
  const f = panelFixture({ remote: { snapshot: personal(), revision: 4, updatedAt: null } });
  await f.click('login'); await f.click('save'); await f.click('cancel-replace');
  assert.equal(f.saves, 0); assert.equal(f.applies, 0);
  assert.equal(f.root.descendants().find(node => node.className === 'cloud-panel-replacement').hidden, true);
  assert.match(f.root.textContent, /교체를 취소/);
  f.setRemote({ snapshot: personal(), revision: 5, updatedAt: null });
  await f.click('save'); await f.click('replace');
  assert.equal(f.savedRequests[0].expected, 5);
});

test('a change after replacement review needs a fresh explicit click using the newer revision', async () => {
  const f = panelFixture({ remote: { snapshot: personal(), revision: 4, updatedAt: null } });
  await f.click('login'); await f.click('save');
  f.setRemote({ snapshot: personal(), revision: 5, updatedAt: null });
  await f.click('replace');
  assert.equal(f.saves, 1); assert.equal(f.applies, 0); assert.equal(f.reads, 2);
  assert.match(f.root.textContent, /클라우드 버전 5/);
  assert.match(f.root.textContent, /다른 기기의 변경/);
  await f.click('replace');
  assert.equal(f.saves, 2); assert.equal(f.applies, 0);
  assert.deepEqual(f.savedRequests.map(request => request.expected), [4, 5]);
  assert.match(f.root.textContent, /클라우드 저장 완료 · 버전 6/);
});

test('logout discards pending replacement authority for the next account', async () => {
  const f = panelFixture({ remote: { snapshot: personal(), revision: 4, updatedAt: null } });
  await f.click('login'); await f.click('save'); await f.click('logout');
  assert.equal(f.root.descendants().find(node => node.className === 'cloud-panel-replacement').hidden, true);
  await f.click('replace');
  assert.equal(f.saves, 0);
});

test('empty-cloud load preserves local data and unconfigured panel disables actions', async () => {
  const f = panelFixture(); await f.click('login'); await f.click('load');
  assert.equal(f.applies, 0); assert.match(f.root.textContent, /이 기기 기록은 유지/);
  const unconfigured = panelFixture({ configured: false });
  assert.ok(unconfigured.root.descendants().filter(item => item.tagName === 'button' && item.dataset.cloudAction !== 'logout').every(item => item.disabled));
});
