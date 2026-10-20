import { subscribeAuth, signInMember, signOutMember, getMember, registerPrivateCleanup } from '../../shared/firebase/site-auth.mjs';

// Invitation-only presentation; membership and token verification stay shared.
const ready = document.readyState === 'loading'
  ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
  : Promise.resolve();
await ready;
const gate = document.createElement('section');
gate.className = 'wedding-auth';
gate.setAttribute('aria-label', '청첩장 관리 로그인');
gate.innerHTML = '<a href="./" class="wedding-auth-home">청첩장으로 돌아가기 ↗</a><p class="wedding-auth-script">Our little wedding</p><h1>두 사람의 청첩장 관리</h1><p>사진첩과 마음 전하실 곳을 관리해요.<br>기존에 승인된 두 사람의 Google 계정만 이용할 수 있어요.</p><p id="auth-status" role="status" aria-live="polite">로그인을 확인하고 있어요…</p><button id="auth-login" hidden>Google 계정으로 로그인</button><button id="auth-switch" hidden>다른 계정으로 로그인</button>';
const bar = document.createElement('div');
bar.className = 'wedding-member-bar'; bar.hidden = true;
const name = document.createElement('span');
const logout = document.createElement('button');
logout.type = 'button'; logout.textContent = '로그아웃';
bar.append(name, logout); document.body.prepend(gate, bar);
const status = gate.querySelector('#auth-status');
const login = gate.querySelector('#auth-login');
const change = gate.querySelector('#auth-switch');
let started = false, pending = false;
const showError = error => {
  status.textContent = /popup-closed|cancelled-popup/.test(error?.code || '') ? '로그인을 취소했어요.'
    : /popup-blocked/.test(error?.code || '') ? '팝업을 허용한 뒤 다시 눌러주세요.'
      : '로그인을 완료하지 못했어요. 승인 계정과 연결 상태를 확인해주세요.';
};
login.addEventListener('click', async () => {
  if (pending) return;
  pending = true; login.disabled = true;
  try { await signInMember(); } catch (error) { showError(error); }
  finally { pending = false; login.disabled = false; }
});
change.addEventListener('click', async () => {
  try { await signOutMember(); } catch (error) { showError(error); }
});
logout.addEventListener('click', () => { void signOutMember(); });
document.addEventListener('click', event => {
  if (event.target.closest('[data-site-sign-out]')) void signOutMember();
});
async function start(member) {
  if (started) return;
  started = true;
  try {
    for (const source of document.querySelectorAll('script[type="application/x-sungso-script"]')) {
      if (getMember()?.uid !== member.uid) return;
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.type = source.dataset.type || 'module'; script.async = false;
        script.src = source.dataset.src;
        script.onload = resolve; script.onerror = reject;
        source.after(script);
      });
    }
    if (getMember()?.uid !== member.uid) return;
    document.querySelectorAll('[data-private-root]').forEach(node => { node.hidden = false; node.inert = false; });
    gate.hidden = true; bar.hidden = false; name.textContent = `${member.name}님의 청첩장`;
    window.dispatchEvent(new CustomEvent('sungso:ready'));
  } catch { status.textContent = '화면을 불러오지 못했어요. 연결을 확인한 뒤 새로고침해주세요.'; change.hidden = false; }
}
registerPrivateCleanup(() => { gate.hidden = false; bar.hidden = true; name.textContent = ''; });
subscribeAuth(state => {
  const member = state.status === 'member' ? state.member : null;
  login.hidden = state.status === 'loading' || !!member;
  login.textContent = state.status === 'sign-out-failed' ? '로그아웃 다시 시도' : 'Google 계정으로 로그인';
  change.hidden = state.status !== 'denied';
  if (!member) {
    gate.hidden = false; bar.hidden = true;
    status.textContent = state.status === 'loading' ? '로그인을 확인하고 있어요…'
      : state.error || '사진과 계좌를 관리하려면 로그인해주세요.';
    document.querySelectorAll('[data-private-root]').forEach(node => { node.hidden = true; node.inert = true; });
  } else { status.textContent = '청첩장 관리를 열고 있어요…'; void start(member); }
});
