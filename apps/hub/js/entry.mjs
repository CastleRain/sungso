import { requireMember, getMember, syncAppAuth, registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { FIREBASE_CONFIG } from '../../../shared/firebase/config.mjs';
import { APP_REGISTRY, normalizeHomeConfig, moveApp, moveGroup, upcomingEvents, dayLabel, canDeleteNote } from '../../../shared/home/home-core.mjs';
import { createHomeStore } from '../../../shared/home/home-store.mjs';

const member = await requireMember();
const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
const sdk = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
const app = getApps().find(item => item.name === '[DEFAULT]') || initializeApp(FIREBASE_CONFIG);
await syncAppAuth(app);
const current = () => getMember()?.uid === member.uid;
if (!current()) throw new Error('로그인 상태가 바뀌었어요.');
const root = document.querySelector('[data-private-root]');
const $ = id => document.getElementById(id);
const store = createHomeStore({ db: sdk.getFirestore(app), sdk, member, isCurrent: current });
let config = normalizeHomeConfig(), draft = null, expectedRevision = 0, editing = false, saving = false, notesCount = 3, notesStop, pendingDelete = null, deleteReturn = null, deleting = false;
registerPrivateCleanup(() => {
  store.close(); config = null; draft = null; pendingDelete = null; deleteReturn = null;
  $('homeEditor')?.close(); root.hidden = true; root.replaceChildren();
});
root.hidden = false;
$('memberName').textContent = member.name;
$('helloLabel').textContent = `안녕, ${member.name}.`;
$('todayLabel').textContent = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());

const iconPaths = {
  calendar: '<rect x="3" y="5" width="16" height="15" rx="3"/><path d="M7 3v4m8-4v4M3 10h16m-5 4c-2-3-6 1 0 4 6-3 2-7 0-4Z"/>',
  home: '<path d="m3 10 9-7 9 7v10H3Zm6 10v-8h6v8"/>',
  wallet: '<path d="M18 8V4H5a2 2 0 0 0 0 4h15v12H5a2 2 0 0 1-2-2V6m17 6h-5v5h5m-3-2.5h.1"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 7 9-7m-9 5c-4-2-3-6 0-4 3-2 4 2 0 4Z"/>',
  plane: '<path d="m3 10 7 1 7-7c3-2 4 0 2 3l-7 7 1 7-3-3-1-4-4-1Zm8 1L6 6l2-2 7 4"/>',
  palm: '<path d="M12 21c3-7 1-12 1-12m0 0C9 2 3 5 3 10l10-1Zm0 0c3-7 8-5 9 1L13 9Zm0 0c-7-1-8 4-7 7l7-7Zm0 0c5-1 8 3 5 7l-5-7Z"/>',
};
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function button(text, label, onClick, className = 'order-button') { const node = el('button', className, text); node.type = 'button'; node.setAttribute('aria-label', label); node.addEventListener('click', onClick); return node; }

function renderApps() {
  const container = $('appGroups'); container.replaceChildren();
  for (const group of config.groups) {
    const visible = config.apps.filter(item => item.groupId === group.id && !item.hidden);
    if (!visible.length) continue;
    const section = el('section', 'app-group'); section.dataset.group = group.id; section.append(el('h3', '', group.name));
    for (const item of visible) {
      const app = APP_REGISTRY.find(app => app.id === item.id);
      const link = el('a', 'app-card'); link.href = app.href;
      const icon = el('span', 'app-icon'); icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">${iconPaths[app.icon]}</svg>`;
      const copy = el('div'); copy.append(el('strong', '', app.title), el('p', '', app.name), el('p', '', app.description)); link.append(icon, copy); section.append(link);
    }
    container.append(section);
  }
  if (!container.children.length) container.append(el('p', 'empty', '모든 앱을 잠시 숨겼어요. 홈 편집에서 원하는 앱을 다시 표시해 보세요.'));
}
store.watchHome(value => {
  config = value; renderApps(); $('editHome').disabled = false; $('homeStatus').textContent = '';
  if (editing && config.revision !== expectedRevision && !saving) showConflict(config);
}, () => { $('homeStatus').textContent = '홈 구성을 불러오지 못했어요. 연결과 로그인 상태를 확인한 뒤 새로고침해 주세요.'; });

store.watchEvents(events => {
  const upcoming = upcomingEvents(events); const container = $('upcomingEvents'); container.replaceChildren();
  for (const event of upcoming) {
    const row = el('a', 'event-row'); row.href = './dates/';
    const date = el('div', 'event-date'); const value = new Date(`${event.date}T00:00:00+09:00`);
    date.append(el('small', '', new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', weekday: 'short' }).format(value)), el('strong', '', event.date.slice(8)));
    row.append(date, el('span', 'event-name', `${event.emoji || '📅'} ${event.title || '일정'}`), el('span', 'event-dday', dayLabel(event.date))); container.append(row);
  }
  if (!upcoming.length) container.append(el('p', 'empty', '다가오는 일정이 아직 없어요. 우리의 날짜에서 다음 약속을 남겨보세요.'));
}, () => { $('upcomingEvents').replaceChildren(el('p', 'empty', '일정을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.')); });

function watchNotes() {
  notesStop?.();
  notesStop = store.watchNotes(({ notes, hasMore }) => {
    const list = $('notesList'); list.replaceChildren();
    for (const note of notes) {
      const card = el('article', 'note-card'), meta = el('div', 'note-meta');
      meta.append(el('span', '', note.authorUid === member.uid ? member.name : member.role === 'sungwoo' ? '소희' : '성우'));
      const date = note.createdAt?.toDate?.();
      const time = el('time', '', date ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date) : '저장 중');
      if (date) time.dateTime = date.toISOString(); meta.append(time);
      if (canDeleteNote(note, member)) {
        const remove = button('삭제', '내 메모 삭제', () => {
          pendingDelete = note; deleteReturn = remove; $('noteDeleteStatus').textContent = '';
          $('noteDeleteDialog').showModal(); $('cancelNoteDelete').focus();
        }, 'delete-note'); meta.append(remove);
      }
      card.append(meta, el('p', '', note.text)); list.append(card);
    }
    if (!notes.length) list.append(el('p', 'empty', '첫 이야기를 남겨보세요. 두 사람만 함께 읽을 수 있어요.'));
    $('moreNotes').hidden = !hasMore; $('moreNotes').disabled = false; $('notesStatus').textContent = '';
  }, () => { $('notesStatus').textContent = '메모를 불러오지 못했어요. 연결 상태를 확인해 주세요.'; $('moreNotes').disabled = false; }, notesCount);
}
watchNotes();
function closeNoteDelete() {
  if (deleting) return;
  $('noteDeleteDialog').close(); pendingDelete = null;
  (deleteReturn?.isConnected ? deleteReturn : $('openNote')).focus(); deleteReturn = null;
}
$('cancelNoteDelete').addEventListener('click', closeNoteDelete);
$('noteDeleteDialog').addEventListener('cancel', event => { event.preventDefault(); closeNoteDelete(); });
$('noteDeleteForm').addEventListener('submit', async event => {
  event.preventDefault(); if (deleting || !pendingDelete) return;
  deleting = true; $('confirmNoteDelete').disabled = true; $('cancelNoteDelete').disabled = true;
  try { await store.deleteNote(pendingDelete); if (current()) { deleting = false; closeNoteDelete(); $('notesStatus').textContent = '메모를 삭제했어요.'; } }
  catch { if (current()) $('noteDeleteStatus').textContent = '삭제하지 못했어요. 메모는 그대로 두었으니 다시 시도해 주세요.'; }
  finally { deleting = false; if (current()) { $('confirmNoteDelete').disabled = false; $('cancelNoteDelete').disabled = false; } }
});
$('moreNotes').addEventListener('click', () => { notesCount += 6; $('moreNotes').disabled = true; watchNotes(); });
$('openNote').addEventListener('click', () => { $('noteForm').hidden = false; $('openNote').hidden = true; $('noteInput').focus(); });
$('cancelNote').addEventListener('click', () => { $('noteForm').hidden = true; $('openNote').hidden = false; $('noteInput').value = ''; $('noteCount').textContent = '0 / 500'; });
$('noteInput').addEventListener('input', () => { $('noteCount').textContent = `${$('noteInput').value.length} / 500`; });
$('noteForm').addEventListener('submit', async event => {
  event.preventDefault(); const text = $('noteInput').value; $('saveNote').disabled = true;
  try { await store.addNote(text); if (current()) { $('cancelNote').click(); $('notesStatus').textContent = '메모를 남겼어요.'; } }
  catch (error) { if (current()) $('notesStatus').textContent = error.message || '저장하지 못했어요. 입력한 내용은 그대로 두었어요.'; }
  finally { if (current()) $('saveNote').disabled = false; }
});

function showConflict(latest) {
  // A transaction can see the latest revision before the live listener does.
  if (latest.revision > config.revision) { config = structuredClone(latest); renderApps(); }
  $('editorConflict').hidden = false;
  $('latestSummary').textContent = `최신 구성: ${latest.groups.map(group => `${group.name} (${latest.apps.filter(app => app.groupId === group.id && !app.hidden).length})`).join(' · ')}`;
}
function renderEditor() {
  const container = $('editorGroups'); container.replaceChildren();
  for (const [groupIndex, group] of draft.groups.entries()) {
    const section = el('section', 'editor-group'), heading = el('div', 'editor-group-header');
    const name = el('input'); name.value = group.name; name.maxLength = 30; name.required = true; name.setAttribute('aria-label', `${group.name} 그룹 이름`);
    name.addEventListener('input', () => { group.name = name.value; for (const option of container.querySelectorAll(`option[value="${group.id}"]`)) option.textContent = name.value; });
    const up = button('↑', `${group.name} 그룹 위로`, () => { draft = moveGroup(draft, group.id, -1); renderEditor(); }); up.disabled = groupIndex === 0;
    const down = button('↓', `${group.name} 그룹 아래로`, () => { draft = moveGroup(draft, group.id, 1); renderEditor(); }); down.disabled = groupIndex === draft.groups.length - 1;
    heading.append(name, up, down); section.append(heading);
    const peers = draft.apps.filter(app => app.groupId === group.id);
    for (const [index, app] of peers.entries()) {
      const definition = APP_REGISTRY.find(item => item.id === app.id), row = el('div', `editor-app${app.hidden ? ' is-hidden' : ''}`), label = el('label');
      const visible = el('input'); visible.type = 'checkbox'; visible.checked = !app.hidden; visible.setAttribute('aria-label', `${definition.title} 표시`);
      visible.addEventListener('change', () => { app.hidden = !visible.checked; row.classList.toggle('is-hidden', app.hidden); }); label.append(visible, el('span', '', definition.title));
      const select = el('select'); select.setAttribute('aria-label', `${definition.title} 그룹`);
      for (const target of draft.groups) { const option = el('option', '', target.name); option.value = target.id; option.selected = target.id === app.groupId; select.append(option); }
      select.addEventListener('change', () => { draft = moveApp(draft, app.id, select.value); renderEditor(); });
      const actions = el('div', 'editor-app-actions');
      const up = button('↑', `${definition.title} 위로`, () => { draft = moveApp(draft, app.id, group.id, -1); renderEditor(); }); up.disabled = index === 0;
      const down = button('↓', `${definition.title} 아래로`, () => { draft = moveApp(draft, app.id, group.id, 1); renderEditor(); }); down.disabled = index === peers.length - 1;
      actions.append(up, down); row.append(label, select, actions); section.append(row);
    }
    if (!peers.length) section.append(el('p', 'empty', '앱이 없는 그룹은 홈에서 숨겨져요. 다른 그룹의 앱을 옮길 수 있어요.'));
    container.append(section);
  }
}
function closeEditor() { if (saving) return; editing = false; draft = null; $('homeEditor').close(); $('editHome').focus(); }
$('editHome').addEventListener('click', () => { draft = structuredClone(config); expectedRevision = config.revision; editing = true; $('editorStatus').textContent = ''; $('editorConflict').hidden = true; renderEditor(); $('homeEditor').showModal(); });
for (const id of ['closeEditor', 'cancelEditor']) $(id).addEventListener('click', closeEditor);
$('homeEditor').addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
$('loadLatest').addEventListener('click', () => { draft = structuredClone(config); expectedRevision = config.revision; $('editorConflict').hidden = true; $('editorStatus').textContent = '최신 구성으로 편집을 다시 시작했어요.'; renderEditor(); });
$('homeEditorForm').addEventListener('submit', async event => {
  event.preventDefault(); if (saving) return; saving = true;
  const controls = [...$('homeEditorForm').querySelectorAll('input,select,button')]; const disabled = controls.map(control => control.disabled); controls.forEach(control => { control.disabled = true; });
  try { const saved = await store.saveHome(draft, expectedRevision); if (!current()) return; config = saved; renderApps(); saving = false; closeEditor(); $('homeStatus').textContent = '홈 구성을 함께 적용했어요.'; }
  catch (error) { if (current()) { $('editorStatus').textContent = error.message || '저장하지 못했어요. 초안은 그대로 두었어요.'; if (error.latest) showConflict(error.latest); } }
  finally { saving = false; if (current()) controls.forEach((control, index) => { control.disabled = disabled[index]; }); }
});
