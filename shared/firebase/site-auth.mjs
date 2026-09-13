import { FIREBASE_CONFIG } from './config.mjs';
import { memberFromClaims, createAuthEpoch } from './auth-core.mjs';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence, GoogleAuthProvider, signInWithPopup, signOut, updateCurrentUser } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDocFromServer, onSnapshot, terminate } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const names = ['homehunt-private-cloud', '[DEFAULT]', 'sungso-travel', 'sungso-travel-budget', 'sungso-invitation'];
const apps = names.map(name => getApps().find(app => app.name === name) || initializeApp(FIREBASE_CONFIG, name));
const primary = apps[0], auth = getAuth(primary), epochs = createAuthEpoch();
const listeners = new Set(), cleanups = new Set();
let state = { status: 'loading', member: null, error: '' }, stopMember, activeUid = null;
let retired = false, signingOut = false;
let synchronization = Promise.resolve();
const logoutKey = 'sungso_logout_pending_v1';
const logoutStores = ['localStorage', 'sessionStorage'];
const knownLogoutStores = new Set();
const pendingLogoutIn = name => {
  try {
    const pending = globalThis[name]?.getItem(logoutKey) === '1';
    if (pending) knownLogoutStores.add(name);
    return pending;
  } catch { return false; }
};
const hasPendingLogout = () => logoutStores.some(pendingLogoutIn);
let logoutRequested = hasPendingLogout();
let logoutTask = null;
const emit = next => { state = next; for (const callback of listeners) callback({ ...state }); };
export const getMember = () => state.status === 'member' ? state.member : null;
export const getAuthState = () => ({ ...state });
export function subscribeAuth(callback) { listeners.add(callback); callback({ ...state }); return () => listeners.delete(callback); }
export function registerPrivateCleanup(callback) { cleanups.add(callback); return () => cleanups.delete(callback); }

function clearPrivate() {
  for (const node of document.querySelectorAll('[data-private-root]')) { node.hidden = true; node.inert = true; node.replaceChildren(); }
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  for (const cleanup of cleanups) { try { cleanup(); } catch {} }
  cleanups.clear();
  window.dispatchEvent(new CustomEvent('sungso:private-clear'));
}

async function retirePage(status, error = '') {
  if (retired) return;
  retired = true; epochs.next(); stopMember?.(); stopMember = null;
  clearPrivate(); emit({ status, member: null, error });
  // Discard SDK memory and late callbacks. Local drafts/IndexedDB keys are untouched.
  await Promise.allSettled(apps.map(app => terminate(getFirestore(app))));
  location.reload();
}

function synchronize(operation) {
  // updateCurrentUser changes SDK state before it resolves. Serialize the side
  // effects, not just their callbacks, so an old account cannot finish last.
  const next = synchronization.catch(() => {}).then(operation);
  synchronization = next;
  return next;
}

export async function syncAppAuth(app) {
  const member = await requireMember();
  if (app.options.projectId !== FIREBASE_CONFIG.projectId) throw new Error('로그인 프로젝트가 다릅니다.');
  const user = auth.currentUser;
  if (!user || user.uid !== member.uid) throw new Error('로그인 계정이 바뀌었어요.');
  const epoch = epochs.current();
  await synchronize(async () => {
    if (!epochs.valid(epoch) || retired || signingOut) throw new Error('로그인 계정이 바뀌었어요.');
    if (getAuth(app) !== auth && getAuth(app).currentUser?.uid !== user.uid) await updateCurrentUser(getAuth(app), user);
  });
  if (getMember()?.uid !== member.uid) throw new Error('로그인 계정이 바뀌었어요.');
  return member;
}

export function requireMember() {
  const current = getMember();
  if (current) return Promise.resolve(current);
  if (state.status !== 'loading') return Promise.reject(new Error('승인된 Google 계정으로 로그인해주세요.'));
  return new Promise((resolve, reject) => {
    const changed = next => {
      if (next.status === 'loading') return;
      listeners.delete(changed);
      if (next.status === 'member') resolve(next.member);
      else reject(new Error(next.error || '승인된 Google 계정으로 로그인해주세요.'));
    };
    listeners.add(changed);
  });
}

export async function signInMember() {
  if (retired) return;
  // A failed logout must be completed before a popup or any member restore.
  // The existing login control becomes an explicit logout retry in this state.
  if (logoutRequested || signingOut || hasPendingLogout()) { logoutRequested = true; await signOutMember(); return; }
  const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

function markLogoutPending() {
  const persisted = { localStorage: false, sessionStorage: false };
  for (const name of logoutStores) {
    persisted[name] = pendingLogoutIn(name);
    try {
      const storage = globalThis[name];
      if (storage) { storage.setItem(logoutKey, '1'); persisted[name] = true; knownLogoutStores.add(name); }
    } catch {}
  }
  return persisted;
}
function clearLogoutPending(persisted) {
  let cleared = true;
  for (const name of logoutStores) {
    // A denied store that never accepted a marker must not make a successful
    // sessionStorage fallback impossible to finish. Known markers still fail
    // closed if access is revoked between the write and removal.
    if (!persisted[name] && !knownLogoutStores.has(name) && !pendingLogoutIn(name)) continue;
    try { globalThis[name]?.removeItem(logoutKey); knownLogoutStores.delete(name); } catch { cleared = false; }
  }
  return cleared;
}
async function performSignOut() {
  signingOut = true;
  logoutRequested = true;
  // This contains no identity or credential. localStorage also locks other app
  // tabs; sessionStorage preserves the same-tab lock if origin storage fails.
  const persisted = markLogoutPending();
  epochs.next(); stopMember?.(); stopMember = null;
  clearPrivate(); emit({ status: 'signed-out', member: null, error: '로그아웃하고 있어요…' });
  try {
    const results = await synchronize(() => Promise.allSettled(apps.map(app => signOut(getAuth(app)))));
    if (results.some(result => result.status === 'rejected') || apps.some(app => getAuth(app).currentUser)) throw new Error('SIGN_OUT_INCOMPLETE');
    if (!clearLogoutPending(persisted)) throw new Error('SIGN_OUT_LOCK_REMAINS');
    logoutRequested = false;
    // clearPrivate also removes unloaded app markup on a denied account. A
    // fresh document is required even when this page never reached member state.
    await retirePage('signed-out');
    return true;
  } catch {
    signingOut = false;
    emit({ status: 'sign-out-failed', member: null, error: '이 기기의 로그아웃을 완료하지 못했어요. 개인 내용은 숨겼어요. 로그아웃을 다시 시도해주세요.'
      + (persisted.localStorage ? '' : persisted.sessionStorage
        ? ' 공유 저장소가 차단되어 이 탭의 새로고침에는 잠금을 유지하지만 새 탭의 잠금 유지는 보장할 수 없어요.'
        : ' 브라우저 저장소에 잠금을 남기지 못했으므로 새로고침이나 새 탭에서는 잠금 유지를 보장할 수 없어요.') });
    return false;
  }
}
export function signOutMember() {
  if (retired) return Promise.resolve(true);
  if (logoutTask) return logoutTask;
  logoutTask = performSignOut().finally(() => { logoutTask = null; });
  return logoutTask;
}

async function restore(user) {
  if (signingOut || retired) return;
  if (logoutRequested || hasPendingLogout()) {
    // A marker can arrive while initial SDK persistence is still resolving,
    // before this page attaches its storage-event listener.
    if (!logoutRequested) { logoutRequested = true; void signOutMember(); }
    return;
  }
  const epoch = epochs.next(); stopMember?.(); stopMember = null;
  if (activeUid && activeUid !== user?.uid) { await retirePage(user ? 'loading' : 'signed-out'); return; }
  emit({ status: user ? 'loading' : 'signed-out', member: null, error: '' });
  if (!user) {
    await synchronize(async () => {
      if (epochs.valid(epoch)) await Promise.allSettled(apps.slice(1).map(app => signOut(getAuth(app))));
    });
    return;
  }
  try {
    const claims = (await user.getIdTokenResult()).claims;
    if (!epochs.valid(epoch)) return;
    const ref = doc(getFirestore(primary), 'site_members', user.uid);
    const snapshot = await getDocFromServer(ref);
    if (!epochs.valid(epoch)) return;
    const member = memberFromClaims(user, claims, snapshot.exists() ? snapshot.data() : null);
    if (!member) throw new Error('이 계정은 아직 승인되지 않았어요. 두 사람의 계정으로 로그인해주세요.');
    await synchronize(async () => {
      if (!epochs.valid(epoch)) return;
      const results = await Promise.allSettled(apps.slice(1).map(app => updateCurrentUser(getAuth(app), user)));
      // Wait for every SDK side effect even if one rejects early; otherwise an
      // old in-flight update could outlive this serialized operation.
      if (results.some(result => result.status === 'rejected')) throw new Error('앱 로그인을 동기화하지 못했어요.');
    });
    if (!epochs.valid(epoch)) return;
    activeUid = user.uid; emit({ status: 'member', member, error: '' });
    if (!epochs.valid(epoch)) return;
    stopMember = onSnapshot(ref, { includeMetadataChanges: true }, snap => {
      if (!epochs.valid(epoch) || snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
      const latest = memberFromClaims(user, claims, snap.exists() ? snap.data() : null);
      if (!latest || latest.role !== member.role) void retirePage('denied', '접근 권한이 변경되었어요.');
    }, () => { if (epochs.valid(epoch)) void retirePage('denied', '접근 권한을 확인하지 못했어요.'); });
  } catch {
    if (!epochs.valid(epoch)) return;
    if (activeUid) { await retirePage('denied'); return; }
    await synchronize(async () => {
      if (epochs.valid(epoch)) await Promise.allSettled(apps.slice(1).map(app => signOut(getAuth(app))));
    });
    if (!epochs.valid(epoch)) return;
    emit({ status: 'denied', member: null, error: '회원 권한을 확인하지 못했어요. 승인 계정과 연결 상태를 확인해주세요.' });
  }
}

try {
  if (!logoutRequested) await setPersistence(auth, browserLocalPersistence);
  onAuthStateChanged(auth, user => { void restore(user); }, () => {
    if (logoutRequested || signingOut || retired) return;
    if (activeUid) void retirePage('denied', '로그인을 복구하지 못했어요. 다시 로그인해주세요.');
    else { epochs.next(); clearPrivate(); emit({ status: 'denied', member: null, error: '로그인을 복구하지 못했어요. 다시 로그인해주세요.' }); }
  });
  if (logoutRequested || hasPendingLogout()) { logoutRequested = true; void signOutMember(); }
} catch { emit({ status: 'denied', member: null, error: '이 브라우저에서 로그인을 시작하지 못했어요. 저장 공간 설정을 확인해주세요.' }); }
window.addEventListener('storage', event => {
  // A delayed set event can arrive after another tab completed logout and
  // removed the marker. Do not recreate that finished request in a new session.
  if (event.key === logoutKey && event.newValue === '1' && pendingLogoutIn('localStorage')) { logoutRequested = true; void signOutMember(); }
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  clearPrivate();
  if (logoutRequested) void signOutMember();
  else location.reload();
});
