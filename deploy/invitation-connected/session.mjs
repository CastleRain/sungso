import { subscribeAuth, signInMember, signOutMember, registerPrivateCleanup, requireMember } from '/shared/firebase/site-auth.mjs';
import { getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
let ready = false, running, epoch = 0;
const status = document.querySelector('#login-status');
export async function refreshSession() {
  if (running) return running;
  const current = epoch;
  running = (async () => {
    await requireMember();
    const user = getAuth(getApps().find(a => a.name === 'homehunt-private-cloud')).currentUser;
    if (!user) throw Error('승인된 Google 계정으로 로그인해 주세요.');
    const token = await user.getIdToken();
    if (current !== epoch) throw Error('로그인 계정이 바뀌었어요.');
    const response = await fetch('/api/studio/session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    if (!response.ok) throw Error('관리 권한을 확인하지 못했어요. 승인 계정과 서버 연결을 확인해 주세요.');
    ready = true; return true;
  })().finally(() => { running = null; });
  return running;
}
export async function studioRequest(suffix, options = {}) {
  if (!ready) await refreshSession();
  const currentEpoch = epoch;
  const response = await fetch('/api/studio/' + suffix, { ...options, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000) });
  const data = await response.json();
  if (currentEpoch !== epoch) throw Error('로그인 계정이 바뀌었어요.');
  if (!response.ok || !data.ok) { if (response.status === 401) ready = false; throw Error(data.error || '서버에 연결하지 못했어요. 다시 시도해 주세요.'); }
  return data;
}
export async function logout() {
  const response = await fetch('/api/studio/session', { method: 'DELETE', credentials: 'same-origin' });
  if (!response.ok) throw Error('로그아웃을 완료하지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
  await signOutMember();
}
document.querySelector('#login-google')?.addEventListener('click', async () => { try { await signInMember(); } catch { status.textContent = '로그인 팝업을 확인해 주세요.'; } });
document.querySelector('#login-switch')?.addEventListener('click', () => { void logout().catch(e => { if(status)status.textContent=e.message; }); });
registerPrivateCleanup(() => { epoch++; ready = false; void fetch('/api/studio/session', { method: 'DELETE', credentials: 'same-origin', keepalive: true }); document.querySelector('.workspace')?.replaceChildren(); });
subscribeAuth(async state => {
  const button = document.querySelector('#login-google'); if (button) button.disabled = state.status === 'loading';
  if (state.status !== 'member') { ready = false; if (status) status.textContent = state.error || '승인된 두 사람의 Google 계정으로 로그인해 주세요.'; return; }
  try {
    await refreshSession();
    if (status) {
      const next = new URLSearchParams(location.search).get('next') || '/lab/studio/';
      location.replace(next.startsWith('/lab/') && !next.includes('\\') && !/[\x00-\x1f]/.test(next) ? next : '/lab/studio/');
    }
  } catch (e) { if (status) status.textContent = e.message; }
});
setInterval(() => { if (ready && !document.hidden) void refreshSession().catch(() => { ready = false; }); }, 30 * 60 * 1000);
window.addEventListener('focus', () => { if (ready) void refreshSession().catch(() => { ready = false; }); });
