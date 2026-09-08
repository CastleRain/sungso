import { CloudSnapshotError, normalizeCloudSnapshot } from './cloud-snapshot-core.mjs?v=4.6.1';
import { createUserSnapshotStore } from './cloud-firestore-store.js?v=4.6.1';

const FIREBASE_VERSION = '10.12.0';
const APP_NAME = 'homehunt-private-cloud';

async function firebaseSdk() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
  const [app, auth, firestore] = await Promise.all([
    import(`${base}firebase-app.js`), import(`${base}firebase-auth.js`), import(`${base}firebase-firestore.js`),
  ]);
  return { ...app, ...auth, ...firestore };
}

function apiBase(value) {
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch (_) { throw new CloudSnapshotError('클라우드 API 주소가 올바르지 않습니다.', 'INVALID_CLOUD_API_URL'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:') || url.username || url.password || url.search || url.hash) {
    throw new CloudSnapshotError('클라우드 API는 인증정보가 없는 HTTPS 주소여야 합니다.', 'INVALID_CLOUD_API_URL');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url;
}

function requestUrl(base, value) {
  if (!base) throw new CloudSnapshotError('온라인 검색 API는 아직 연결되지 않았습니다.', 'CLOUD_API_UNAVAILABLE', 503);
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('//')) {
    throw new CloudSnapshotError('허용되지 않은 API 요청 주소입니다.', 'CLOUD_API_URL_FORBIDDEN', 400);
  }
  let target;
  try { target = /^https?:\/\//i.test(value) ? new URL(value) : new URL(value.replace(/^\//, ''), base); }
  catch (_) { throw new CloudSnapshotError('허용되지 않은 API 요청 주소입니다.', 'CLOUD_API_URL_FORBIDDEN', 400); }
  const basePath = base.pathname;
  if (target.origin !== base.origin || !target.pathname.startsWith(basePath)
    || target.username || target.password || target.hash) {
    throw new CloudSnapshotError('로그인 정보는 설정한 HomeHunt API에만 전달할 수 있습니다.', 'CLOUD_API_URL_FORBIDDEN', 400);
  }
  return target.href;
}

export function cloudSessionErrorMessage(error) {
  const code = String(error?.code || '');
  if (/popup-closed-by-user|cancelled-popup-request/.test(code)) return '로그인을 취소했습니다.';
  if (/popup-blocked/.test(code)) return '로그인 팝업을 허용한 뒤 다시 눌러주세요.';
  if (/unauthorized-domain/.test(code)) return 'Firebase 로그인 허용 도메인에 현재 주소를 등록해야 합니다.';
  if (/operation-not-allowed|configuration-not-found/.test(code)) return 'Firebase에서 Google 로그인을 먼저 활성화해야 합니다.';
  if (/permission-denied/.test(code) || error?.status === 403) return '이 계정의 기록 접근 권한을 확인해주세요.';
  if (/network-request-failed|unavailable/.test(code)) return '클라우드에 연결하지 못했습니다. 연결을 확인한 뒤 다시 시도해주세요.';
  if (/unauthenticated/.test(code) || error?.status === 401) return 'Google 로그인을 다시 확인해주세요.';
  return error instanceof CloudSnapshotError ? error.message : '클라우드 작업을 완료하지 못했습니다. 다시 시도해주세요.';
}

/** Tokens remain inside Firebase Auth; neither state nor storage/export
 * helpers expose them. The caller passes only the public Firebase config. */
export function createCloudSession({ apiBaseUrl = '', firebaseConfig = {}, loadSdk = firebaseSdk, fetchImpl = globalThis.fetch } = {}) {
  const base = apiBase(apiBaseUrl);
  const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain);
  let sdk; let auth; let user = null; let privateStore; let initializing; let unsubscribeAuth;
  let generation = 0;
  let state = { configured, apiConfigured: Boolean(base), transport: base ? 'api' : 'firestore',
    status: configured ? 'idle' : 'unconfigured', user: null, error: null };
  const listeners = new Set();
  const getState = () => ({ ...state, user: state.user ? { ...state.user } : null });
  const publish = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(getState()); };
  const updateUser = next => {
    user = next || null; generation += 1;
    publish({ status: user ? 'signed-in' : 'signed-out', error: null,
      user: user ? { uid: user.uid, email: user.email || '', displayName: user.displayName || '', emailVerified: user.emailVerified === true } : null });
  };
  const init = async () => {
    if (!configured) return getState();
    if (initializing) return initializing;
    initializing = (async () => {
      publish({ status: 'loading', error: null });
      sdk = await loadSdk();
      const existing = sdk.getApps().find(app => app.name === APP_NAME);
      if (existing && existing.options.projectId !== firebaseConfig.projectId) throw new CloudSnapshotError('Firebase 프로젝트 설정이 기존 로그인과 다릅니다.', 'CLOUD_PROJECT_MISMATCH');
      const app = existing || sdk.initializeApp(firebaseConfig, APP_NAME);
      auth = sdk.getAuth(app);
      await sdk.setPersistence(auth, sdk.browserLocalPersistence);
      privateStore = createUserSnapshotStore({ db: sdk.getFirestore(app), sdk, getUid: () => user?.uid });
      await new Promise((resolve, reject) => {
        unsubscribeAuth = sdk.onAuthStateChanged(auth, next => { updateUser(next); resolve(); }, reject);
      });
      return getState();
    })().catch(error => {
      initializing = null;
      publish({ status: 'error', error: cloudSessionErrorMessage(error) });
      throw error;
    });
    return initializing;
  };
  const apiFetch = async (input, options = {}) => {
    // Validate BEFORE reading a token or initializing an authentication SDK.
    const url = requestUrl(base, input);
    await init();
    const caller = user; const epoch = generation;
    if (!caller) throw new CloudSnapshotError('온라인 검색과 저장에는 Google 로그인이 필요합니다.', 'CLOUD_AUTH_REQUIRED', 401);
    const token = await caller.getIdToken();
    if (epoch !== generation || user !== caller) throw new CloudSnapshotError('로그인 계정이 바뀌었습니다. 다시 실행해주세요.', 'CLOUD_SESSION_CHANGED', 409);
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetchImpl(url, { ...options, headers, credentials: 'omit', redirect: 'error', cache: 'no-store' });
    if (epoch !== generation || user !== caller) throw new CloudSnapshotError('로그인 계정이 바뀌었습니다. 다시 실행해주세요.', 'CLOUD_SESSION_CHANGED', 409);
    if (response.status === 401) throw new CloudSnapshotError('Google 로그인을 다시 확인해주세요.', 'CLOUD_AUTH_REQUIRED', 401);
    return response;
  };
  const snapshotResponse = async response => {
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new CloudSnapshotError(response.status === 409 ? '다른 기기에서 저장한 변경이 있습니다. 클라우드 기록을 먼저 불러와주세요.'
        : response.status === 403 ? '이 계정의 기록 접근 권한을 확인해주세요.' : '클라우드 기록 요청을 완료하지 못했습니다.',
      typeof data?.error?.code === 'string' ? data.error.code : typeof data?.code === 'string' ? data.code : 'CLOUD_REQUEST_FAILED', response.status);
      if (Number.isSafeInteger(data?.currentRevision)) error.currentRevision = data.currentRevision;
      throw error;
    }
    if (!data || !Number.isSafeInteger(data.revision) || data.revision < 0
      || data.snapshot !== null && typeof data.snapshot !== 'object') {
      throw new CloudSnapshotError('클라우드 기록 응답이 올바르지 않습니다.', 'INVALID_CLOUD_RESPONSE', 502);
    }
    return { snapshot: data.snapshot === null ? null : normalizeCloudSnapshot(data.snapshot), revision: data.revision, updatedAt: data.updatedAt || null };
  };
  return {
    init, getState, apiFetch,
    subscribe(listener) { listeners.add(listener); listener(getState()); return () => listeners.delete(listener); },
    async signIn() {
      await init();
      if (!auth) throw new CloudSnapshotError('Firebase 연결 설정이 필요합니다.', 'CLOUD_UNCONFIGURED', 503);
      const provider = new sdk.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await sdk.signInWithPopup(auth, provider);
      return getState();
    },
    async signOut() { await init(); if (auth) await sdk.signOut(auth); },
    async loadSnapshot() {
      if (base) return snapshotResponse(await apiFetch('/household/snapshot'));
      await init();
      if (!privateStore) throw new CloudSnapshotError('Firebase 연결 설정이 필요합니다.', 'CLOUD_UNCONFIGURED', 503);
      return privateStore.load();
    },
    async saveSnapshot(snapshot, expectedRevision) {
      const safe = normalizeCloudSnapshot(snapshot);
      if (base) return snapshotResponse(await apiFetch('/household/snapshot', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: safe, expectedRevision }),
      }));
      await init();
      if (!privateStore) throw new CloudSnapshotError('Firebase 연결 설정이 필요합니다.', 'CLOUD_UNCONFIGURED', 503);
      return privateStore.save(safe, expectedRevision);
    },
    destroy() { unsubscribeAuth?.(); listeners.clear(); generation += 1; user = null; },
  };
}
