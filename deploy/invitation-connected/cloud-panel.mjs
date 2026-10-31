import { studioRequest, logout } from '/studio-login/session.mjs';
export function mountCloudPanel({ getSnapshot, loadSnapshot, ready, initialDraft }) {
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  const dialog = el('dialog', '', 'cloud-panel'); dialog.setAttribute('aria-labelledby', 'cloud-heading');
  const heading = el('h2', '함께 고르고, 준비되면 공개해요.'); heading.id = 'cloud-heading';
  const close = el('button', '닫기 ×', 'cloud-close'); close.type = 'button'; close.addEventListener('click', () => dialog.close());
  const status = el('p', '공동 보관함을 확인하고 있어요.', 'cloud-status'); status.setAttribute('role', 'status');
  const label = (title, control) => { const n = el('label', title); n.append(control); return n; };
  const name = el('input'); name.maxLength = 32; name.placeholder = '예: 둘이 고른 첫 번째 초안';
  const note = el('textarea'); note.maxLength = 240; note.rows = 2;
  const rating = el('select'); for (let i = 0; i <= 5; i++) { const o = el('option', i ? '★'.repeat(i) : '별점 선택'); o.value = i; rating.append(o); }
  const actions = el('div', '', 'cloud-actions'), drafts = el('ul', '', 'cloud-drafts'), releases = el('ul', '', 'cloud-history');
  const current = el('p', '', 'cloud-current');
  const save = el('button', '새 공동 초안으로 저장'), update = el('button', '선택한 초안에 저장'), publish = el('button', '저장한 초안 공개하기');
  update.disabled = publish.disabled = true;
  const refresh = el('button', '목록 새로고침'), share = el('button', '공동 초안 링크 복사'); share.disabled = true;
  actions.append(save, update, share, publish);
  const preview = el('a', '현재 하객 화면 ↗'); preview.href = '/'; preview.target = '_blank'; preview.rel = 'noopener';
  const members = el('p', '공동 초안은 두 사람만 볼 수 있어요. 저장만으로 하객 화면은 바뀌지 않아요.');
  const accountLink = el('a', '사진·계좌 관리 ↗'); accountLink.href = '/manage.html'; accountLink.target = '_blank'; accountLink.rel = 'noopener';
  const signout = el('button', '로그아웃'); signout.addEventListener('click', () => { void logout().catch(e => { status.textContent = e.message; }); });
  dialog.append(close, heading, members, current, status, label('초안 이름', name), label('기억할 메모', note), label('별점', rating), actions, el('h3', '우리의 공동 초안'), refresh, drafts, el('h3', '공개 기록 · 최근 20개'), releases, preview, document.createTextNode(' · '), accountLink, signout);
  document.body.append(dialog);
  const trigger = el('button', '공동 저장 · 공개', 'cloud-trigger'); trigger.type = 'button';
  document.querySelector('.preview-actions').prepend(trigger);
  trigger.addEventListener('click', () => { dialog.showModal(); if (!state) void run(refreshList); });
  dialog.addEventListener('close', () => trigger.focus({ preventScroll: true }));
  let state, selected, savedFingerprint, busy = false, pendingWrite;
  const snapshot = () => structuredClone(getSnapshot());
  const fingerprint = value => JSON.stringify(value);
  const date = time => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(time);
  async function run(fn) {
    if (busy) return; busy = true; dialog.setAttribute('aria-busy', 'true');
    dialog.querySelectorAll('button:not(.cloud-close)').forEach(b => b.disabled = true);
    try { await ready; await fn(); }
    catch (e) { status.textContent = e.message || '연결하지 못했어요. 현재 작업은 남아 있어요.'; }
    finally { busy = false; dialog.removeAttribute('aria-busy'); dialog.querySelectorAll('button').forEach(b => b.disabled = false); update.disabled = publish.disabled = share.disabled = !selected; }
  }
  function showState() {
    const active = state.releases.find(r => r.id === state.published);
    current.textContent = `공개 중: ${active?.name || '기존 VER5.6'} · 공동 초안 ${state.drafts.length}/40개`;
    drafts.replaceChildren();
    state.drafts.forEach(d => {
      const li = el('li'), title = el('strong', d.name), detail = el('p', `${'★'.repeat(d.rating)} ${d.note}`), time = el('small', `${d.editor === 'sohee' ? '소희' : '성우'} · ${date(d.updatedAt)} · 수정 ${d.revision}`);
      const load = el('button', selected?.id === d.id ? '선택한 초안 다시 불러오기' : '불러와서 편집');
      load.addEventListener('click', () => void run(() => loadDraft(d.id, true))); li.append(title, detail, time, load); drafts.append(li);
    });
    releases.replaceChildren();
    state.releases.forEach(r => {
      const li = el('li'); li.append(el('strong', r.name), el('small', date(r.createdAt)));
      const restore = el('button', state.published === r.id ? '현재 공개본' : '이 공개본으로 복원'); restore.disabled = state.published === r.id;
      restore.addEventListener('click', () => { if (state.published !== r.id) confirmRelease('restore', r.id, r.name); }); li.append(restore); releases.append(li);
    });
    const legacy = el('button', '기존 VER5.6으로 복원'); legacy.addEventListener('click', () => confirmRelease('restore', 'legacy', '기존 VER5.6')); releases.append(legacy);
  }
  async function refreshList() { state = await studioRequest('manage'); showState(); status.textContent = '목록을 확인했어요. 현재 편집 내용은 바뀌지 않았어요.'; }
  async function loadDraft(id, ask = false) {
    if (ask && !window.confirm('현재 편집 중인 내용 대신 공동 초안을 불러올까요? 남길 내용은 먼저 새 공동 초안으로 저장해 주세요.')) return;
    const before = fingerprint(snapshot());
    const data = await studioRequest('draft/' + id);
    if (before !== fingerprint(snapshot())) throw Error('불러오는 동안 내용을 바꾸어 멈췄어요. 현재 작업은 그대로예요.');
    await loadSnapshot(data.draft.snapshot); selected = data.draft; savedFingerprint = fingerprint(data.draft.snapshot); pendingWrite = null;
    name.value = selected.name; note.value = selected.note; rating.value = selected.rating;
    showState(); status.textContent = `‘${selected.name}’을 불러왔어요. 오른쪽에서 확인한 뒤 공개할 수 있어요.`;
  }
  async function write(body) {
    const contentKey = fingerprint(body);
    // Preserve the exact request after a lost response. A changed edit starts a new operation.
    if (!pendingWrite || pendingWrite.key !== contentKey) pendingWrite = { key: contentKey, body: { ...body, operationId: crypto.randomUUID(), expectedRevision: state.revision } };
    const data = await studioRequest('manage', { method: 'POST', body: JSON.stringify(pendingWrite.body) });
    pendingWrite = null; state = data; showState(); return data;
  }
  async function saveDraft(existing) {
    if (!state) await refreshList();
    if (!name.value.trim()) { name.focus(); throw Error('둘이 알아볼 초안 이름을 적어 주세요.'); }
    const content = snapshot(), id = existing ? selected.id : (pendingWrite?.body.action === 'save' ? pendingWrite.body.id : crypto.randomUUID());
    await write({ action: 'save', id, expectedDraftRevision: existing ? selected.revision : 0, name: name.value.trim(), note: note.value, rating: Number(rating.value), snapshot: content });
    selected = state.drafts.find(d => d.id === id); savedFingerprint = fingerprint(content); showState(); status.textContent = '공동 초안으로 저장했어요. 하객 화면은 아직 바뀌지 않았어요.';
  }
  const confirmation = el('dialog', '', 'cloud-confirm'), confirmText = el('p'), confirmButton = el('button', '공개하기'), cancel = el('button', '돌아가기');
  const confirmTitle = el('h2', '하객 화면에 반영할까요?'); confirmation.append(confirmTitle, confirmText, cancel, confirmButton); document.body.append(confirmation);
  cancel.addEventListener('click', () => confirmation.close());
  let intent;
  function confirmRelease(action, id, title) {
    if (busy || !state) return;
    if (action === 'publish' && savedFingerprint !== fingerprint(snapshot())) { status.textContent = '저장한 뒤 바뀐 내용이 있어요. 먼저 선택한 초안에 저장하고 확인해 주세요.'; return; }
    intent = { action, id, ...(action === 'publish' ? { expectedDraftRevision: selected.revision } : {}) };
    confirmText.textContent = `‘${title}’의 디자인·문구·사진을 sungso-wedding.vercel.app에 반영합니다. 새로 방문하거나 새로고침하면 반영돼요. 캐시 때문에 약 10초 정도 걸릴 수 있어요. 기존 방명록과 계좌는 유지돼요. 공개 기록에서 이전 상태로 돌아갈 수 있어요.`;
    confirmButton.textContent = action === 'restore' ? '이 공개본으로 복원' : '이 초안 공개하기'; confirmation.showModal(); cancel.focus();
  }
  confirmButton.addEventListener('click', () => { confirmation.close(); void run(async () => { await write(intent); status.textContent = '공개 설정을 반영했어요. 하객 화면 링크에서 확인해 주세요.'; }); });
  save.addEventListener('click', () => void run(() => saveDraft(false)));
  update.addEventListener('click', () => void run(() => saveDraft(true)));
  publish.addEventListener('click', () => confirmRelease('publish', selected.id, selected.name));
  refresh.addEventListener('click', () => void run(async () => { pendingWrite = null; await refreshList(); }));
  share.addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.origin + '/lab/studio/?draft=' + selected.id); status.textContent = '두 사람만 열 수 있는 공동 초안 링크를 복사했어요.'; } catch { status.textContent = location.origin + '/lab/studio/?draft=' + selected.id; } });
  if (/^[a-f0-9-]{36}$/i.test(initialDraft || '')) { dialog.showModal(); void run(async () => { await refreshList(); await loadDraft(initialDraft, true); }); }
  return { open: () => trigger.click() };
}
