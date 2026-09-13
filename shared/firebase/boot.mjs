import { subscribeAuth, signInMember, signOutMember, getMember, registerPrivateCleanup } from './site-auth.mjs';
import { safeReturnPath } from './auth-core.mjs';

const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet'; stylesheet.href = new URL('./auth.css', import.meta.url).href; document.head.append(stylesheet);
const gate = document.createElement('section');
gate.className = 'site-auth-gate'; gate.setAttribute('aria-label', '우리 둘의 홈 로그인');
gate.innerHTML = '<div class="site-auth-card"><a class="site-auth-brand" href="/sungso/">sungso<span>✿</span></a><div class="site-auth-art" aria-hidden="true">☀︎<span>♡</span>✧</div><p class="site-auth-eyebrow">OUR LITTLE SPACE</p><h1>우리 둘의 일상을<br>함께 모아두는 곳</h1><p class="site-auth-copy">일정도, 여행도, 우리 집 준비도.<br>두 사람의 Google 계정으로 만나세요.</p><p id="site-auth-status" role="status" aria-live="polite">로그인을 확인하고 있어요…</p><button type="button" id="site-auth-login" hidden>Google 계정으로 로그인</button><button type="button" id="site-auth-switch" class="site-auth-secondary" hidden>다른 계정으로 로그인</button></div>';
const toolbar = document.createElement('div'); toolbar.className = 'site-member-bar'; toolbar.hidden = true;
const name = document.createElement('span'), logout = document.createElement('button'); logout.type = 'button'; logout.textContent = '로그아웃';
toolbar.append(name, logout);
const ready = document.readyState === 'loading' ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true })) : Promise.resolve();
await ready; document.body.prepend(gate, toolbar);
const status = gate.querySelector('#site-auth-status'), login = gate.querySelector('#site-auth-login'), change = gate.querySelector('#site-auth-switch');
let started = false, pending = false;
const setError = error => { status.textContent = /popup-closed|cancelled-popup/.test(error?.code || '') ? '로그인을 취소했어요.' : /popup-blocked/.test(error?.code || '') ? '팝업을 허용한 뒤 다시 눌러주세요.' : '로그인을 완료하지 못했어요. 연결 상태와 계정을 확인해주세요.'; };
async function loginAction() { if (pending) return; pending = true; login.disabled = true; try { await signInMember(); } catch (error) { setError(error); } finally { pending = false; login.disabled = false; } }
login.addEventListener('click', loginAction);
change.addEventListener('click', async () => { try { await signOutMember(); await loginAction(); } catch (error) { setError(error); } });
logout.addEventListener('click', () => { void signOutMember(); });
document.addEventListener('click', event => { if (event.target.closest('[data-site-sign-out]')) void signOutMember(); });

function loadScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.async = false;
    const type = source.dataset.type; if (type) script.type = type;
    for (const attr of ['integrity', 'crossorigin', 'referrerpolicy']) if (source.hasAttribute(attr)) script.setAttribute(attr, source.getAttribute(attr));
    script.onload = resolve; script.onerror = () => reject(new Error('앱 파일을 불러오지 못했어요.'));
    if (source.dataset.src) script.src = source.dataset.src;
    else script.textContent = source.textContent;
    source.after(script);
    if (!source.dataset.src && type !== 'module') resolve();
  });
}
async function start(member) {
  if (started) return; started = true;
  const target = safeReturnPath(new URLSearchParams(location.search).get('return'), location.origin);
  if (target && target !== location.pathname + location.search + location.hash) { location.replace(target); return; }
  try {
    // Personal travel reference is fetched only after membership is verified.
    if (['travel', 'honeymoon'].includes(document.body.dataset.app)) {
      const reference = await import('../travel/private-reference.mjs');
      if (document.body.dataset.app === 'travel') await reference.prepareTravelPage();
      else await reference.loadTripReference();
    }
    for (const script of document.querySelectorAll('script[type="application/x-sungso-script"]')) {
      if (getMember()?.uid !== member.uid) return;
      await loadScript(script);
    }
    if (getMember()?.uid !== member.uid) return;
    document.querySelectorAll('[data-private-root]').forEach(node => { node.hidden = false; node.inert = false; });
    gate.hidden = true; toolbar.hidden = false; name.textContent = `${member.name}님과 함께`;
    window.dispatchEvent(new CustomEvent('sungso:ready'));
  } catch { status.textContent = '화면을 불러오지 못했어요. 연결을 확인한 뒤 새로고침해주세요.'; change.hidden = false; }
}
registerPrivateCleanup(() => { gate.hidden = false; toolbar.hidden = true; name.textContent = ''; });
subscribeAuth(state => {
  const member = state.status === 'member' ? state.member : null;
  login.hidden = state.status === 'loading' || !!member;
  change.hidden = state.status !== 'denied';
  if (!member) {
    gate.hidden = false; toolbar.hidden = true;
    status.textContent = state.status === 'loading' ? '로그인을 확인하고 있어요…' : state.error || '로그인하면 두 사람의 기록을 볼 수 있어요.';
    document.querySelectorAll('[data-private-root]').forEach(node => { node.hidden = true; node.inert = true; });
  } else { status.textContent = '우리의 공간을 열고 있어요…'; void start(member); }
});
