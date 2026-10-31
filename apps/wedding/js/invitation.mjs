import { requireMember, getMember, registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
let disposed = false, busy = false, controller;
registerPrivateCleanup(() => { disposed = true; controller?.abort(); document.querySelector('#shared-drafts')?.replaceChildren(); });
const status = document.querySelector('#draft-status'), refresh = document.querySelector('#refresh-drafts');
async function load() {
  if (busy || disposed) return; busy = true; refresh.disabled = true; status.textContent = '공동 보관함을 확인하고 있어요. 처음 연결은 잠시 걸릴 수 있어요.';
  try {
    const member = await requireMember(), user = getAuth(getApps().find(a => a.name === 'homehunt-private-cloud')).currentUser;
    if (!user || member.uid !== user.uid) throw Error('로그인을 확인해 주세요.');
    const token = await user.getIdToken(); if (disposed || getMember()?.uid !== member.uid) return;
    controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 60000);
    let response;
    try { response = await fetch('https://sungso-homehunt-api.onrender.com/api/invitation/studio/manage', { headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', cache: 'no-store', signal: controller.signal }); } finally { clearTimeout(timer); }
    const data = await response.json(); if (disposed || getMember()?.uid !== member.uid) return;
    if (!response.ok || !data.ok) throw Error(data.error || '공동 보관함에 연결하지 못했어요.');
    document.querySelector('#current-release').textContent = '현재 공개 중 · ' + (data.releases.find(r => r.id === data.published)?.name || '기존 VER5.6');
    const list = document.querySelector('#shared-drafts'); list.replaceChildren();
    data.drafts.forEach(d => {
      const li = document.createElement('li'), title = document.createElement('strong'), note = document.createElement('p'), meta = document.createElement('small'), link = document.createElement('a');
      title.textContent = d.name; note.textContent = d.note; meta.textContent = `${'★'.repeat(d.rating)} · 수정 ${d.revision} · ${d.editor === 'sohee' ? '소희' : '성우'}`;
      link.textContent = '이 초안 이어서 편집 ↗'; link.href = 'https://sungso-wedding.vercel.app/lab/studio/?draft=' + encodeURIComponent(d.id); link.target = '_blank'; link.rel = 'noopener'; li.append(title, note, meta, link); list.append(li);
    });
    status.textContent = data.drafts.length ? `함께 저장한 초안 ${data.drafts.length}개` : '아직 공동 초안이 없어요. 스튜디오에서 첫 조합을 함께 저장해 보세요.';
  } catch (e) { if (!disposed) status.textContent = e.name === 'AbortError' ? '서버가 준비 중이에요. 잠시 후 새로고침해 주세요.' : e.message; }
  finally { busy = false; if (!disposed) refresh.disabled = false; }
}
refresh.addEventListener('click', load); void load();
