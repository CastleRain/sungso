import { requireMember, getMember, syncAppAuth, registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { FIREBASE_CONFIG } from '../../../shared/firebase/config.mjs';
import { APP_REGISTRY, normalizeHomeConfig, moveApp, moveGroup, upcomingEvents, featuredEvents, koreanToday, dayLabel, canDeleteNote } from '../../../shared/home/home-core.mjs';
import { createHomeStore } from '../../../shared/home/home-store.mjs';
import { SHORTCUT_LIMIT, getHomeShortcuts, getLibraryApps, getBrowsableApps, withHomeShortcuts, paginateApps } from './view-core.mjs';

const member = await requireMember();
const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
const sdk = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
const app = getApps().find(item => item.name === '[DEFAULT]') || initializeApp(FIREBASE_CONFIG);
await syncAppAuth(app);
let disposed = false;
const current = () => !disposed && getMember()?.uid === member.uid;
if (!current()) throw new Error('로그인 상태가 바뀌었어요.');
const root = document.querySelector('[data-private-root]');
const $ = id => document.getElementById(id);
const lifecycle = new AbortController();
const store = createHomeStore({ db: sdk.getFirestore(app), sdk, member, isCurrent: current });
let config = normalizeHomeConfig(), homeReady = false;
let draft = null, expectedRevision = 0, editing = false, saving = false;
let shortcutBase = null, shortcutIds = [], shortcutRevision = 0, editingShortcuts = false, savingShortcuts = false, shortcutReturn = null;
let libraryQuery = '', libraryGroup = 'all', libraryPage = 1, libraryView = 'grid';
let notesCache = [], notesCount = 3, notesStop, notesReady = false, notesLoadFailed = false, noteSaving = false, notesReturn = null;
let pendingDelete = null, deleteReturn = null, deleting = false, cachedEvents = [], eventsReady = false, lastDay = '';
let dayTimer;
const compactScreen = window.matchMedia('(max-width:700px)');
registerPrivateCleanup(() => {
  disposed = true;
  lifecycle.abort(); clearInterval(dayTimer); store.close();
  config = null; draft = null; shortcutBase = null; shortcutIds = [];
  notesCache = []; cachedEvents = []; pendingDelete = null; deleteReturn = null; shortcutReturn = null; notesReturn = null;
  root.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  root.hidden = true; root.replaceChildren();
});
root.hidden = false;
$('memberName').textContent = member.name;
$('helloLabel').textContent = `안녕, ${member.name}.`;

const iconPaths = {
  calendar: '<rect x="3" y="5" width="16" height="15" rx="3"/><path d="M7 3v4m8-4v4M3 10h16m-5 4c-2-3-6 1 0 4 6-3 2-7 0-4Z"/>',
  home: '<path d="m3 10 9-7 9 7v10H3Zm6 10v-8h6v8"/>',
  wallet: '<path d="M18 8V4H5a2 2 0 0 0 0 4h15v12H5a2 2 0 0 1-2-2V6m17 6h-5v5h5m-3-2.5h.1"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 7 9-7m-9 5c-4-2-3-6 0-4 3-2 4 2 0 4Z"/>',
  plane: '<path d="m3 10 7 1 7-7c3-2 4 0 2 3l-7 7 1 7-3-3-1-4-4-1Zm8 1L6 6l2-2 7 4"/>',
  palm: '<path d="M12 21c3-7 1-12 1-12m0 0C9 2 3 5 3 10l10-1Zm0 0c3-7 8-5 9 1L13 9Zm0 0c-7-1-8 4-7 7l7-7Zm0 0c5-1 8 3 5 7l-5-7Z"/>',
  basket: '<path d="m4 9 2 11h12l2-11ZM8 9l4-6 4 6M9 13v4m6-4v4M3 9h18"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  heart: '<path d="M12 20C-3 10 5 0 12 7c7-7 15 3 0 13Z"/>',
};
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, label, onClick, className = 'order-button') {
  const node = el('button', className, text); node.type = 'button';
  node.setAttribute('aria-label', label); node.addEventListener('click', onClick); return node;
}
function appIcon(definition) {
  const icon = el('span', 'app-icon'); icon.setAttribute('aria-hidden', 'true');
  // Paths come only from the static icon registry, never saved configuration.
  icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconPaths[definition.icon] || iconPaths.home}</svg>`;
  return icon;
}
function appCopy(definition) {
  const copy = el('span', 'app-copy');
  copy.append(el('strong', '', definition.title), el('small', '', definition.description)); return copy;
}
function rememberLibraryFocus() {
  const active = document.activeElement;
  if (!$('appGroups').contains(active)) return null;
  return { id: active.dataset.appId, pin: active.classList.contains('pin-button') };
}
function renderLibrary() {
  if (!current()) return;
  const focus = rememberLibraryFocus();
  const apps = getBrowsableApps(config, { query: libraryQuery, groupId: libraryGroup });
  const page = paginateApps(apps, { page: libraryPage, pageSize: compactScreen.matches ? 6 : 9 });
  libraryPage = page.page;
  const shortcuts = new Set(getHomeShortcuts(config).map(item => item.id));
  const container = $('appGroups'); container.replaceChildren(); container.dataset.view = libraryView;
  for (const definition of page.items) {
    const item = el('article', 'library-item'); item.dataset.group = definition.groupId;
    const link = el('a', 'app-card'); link.href = definition.href; link.dataset.appId = definition.id;
    link.append(appIcon(definition), appCopy(definition));
    if (definition.local) {
      link.querySelector('.app-copy').append(el('span', 'local-app-label', '기본 버전 · 이 기기에 저장'));
      item.append(link); container.append(item); continue;
    }
    const pin = button('⌖', `${definition.title} ${shortcuts.has(definition.id) ? '바로가기에서 빼기' : '바로가기에 두기'}`, () => openShortcutEditor(definition.id), 'pin-button');
    pin.dataset.appId = definition.id; pin.setAttribute('aria-pressed', String(shortcuts.has(definition.id))); pin.disabled = !homeReady;
    item.append(link, pin); container.append(item);
  }
  if (!page.items.length) container.append(el('p', 'empty', '일치하는 앱이 없어요. 다른 이름이나 분류로 찾아보세요.'));
  $('libraryResultCount').textContent = `${page.total}개${libraryQuery.trim() ? ' 검색됨' : ''} · 홈 바로가기 ${shortcuts.size}개`;
  $('allAppsCount').textContent = String(getBrowsableApps(config).length);
  $('appPageLabel').textContent = `${page.page} / ${page.pageCount}`;
  $('appPagination').hidden = page.pageCount <= 1;
  $('prevApps').disabled = page.page <= 1; $('nextApps').disabled = page.page >= page.pageCount;
  $('libraryGridView').setAttribute('aria-pressed', String(libraryView === 'grid'));
  $('libraryListView').setAttribute('aria-pressed', String(libraryView === 'list'));
  if (focus) [...container.querySelectorAll(focus.pin ? '.pin-button' : '.app-card')].find(item => item.dataset.appId === focus.id)?.focus({ preventScroll: true });
}
function renderFilters() {
  const container = $('appFilters');
  const active = document.activeElement?.dataset.groupId;
  container.replaceChildren();
  if (libraryGroup !== 'all' && !config.groups.some(group => group.id === libraryGroup)) libraryGroup = 'all';
  for (const group of [{ id: 'all', name: '전체' }, ...config.groups]) {
    const control = button(group.name, `${group.name} 앱 보기`, () => {
      libraryGroup = group.id; libraryPage = 1; renderFilters(); renderLibrary();
      [...container.children].find(item => item.dataset.groupId === group.id)?.focus({ preventScroll: true });
    }, 'app-filter');
    control.dataset.groupId = group.id; control.setAttribute('aria-pressed', String(group.id === libraryGroup)); container.append(control);
  }
  if (active) [...container.children].find(item => item.dataset.groupId === active)?.focus({ preventScroll: true });
}
function renderApps() {
  if (!current()) return;
  const container = $('shortcuts');
  const activeId = container.contains(document.activeElement) ? document.activeElement.dataset.appId : null;
  container.replaceChildren();
  if (!homeReady) container.append(el('p', 'empty', '우리의 바로가기를 불러오고 있어요.'));
  else {
    const shortcuts = getHomeShortcuts(config);
    for (const definition of shortcuts) {
      const link = el('a', 'shortcut'); link.href = definition.href; link.dataset.group = definition.groupId; link.dataset.appId = definition.id;
      link.append(appIcon(definition), appCopy(definition)); container.append(link);
    }
    if (!shortcuts.length) container.append(el('p', 'empty', '홈에 둔 앱이 아직 없어요. 바로가기 편집에서 함께 쓸 앱을 골라보세요.'));
    if (activeId) [...container.querySelectorAll('a')].find(item => item.dataset.appId === activeId)?.focus({ preventScroll: true });
  }
  $('editHome').disabled = !homeReady; $('editShortcuts').disabled = !homeReady;
  renderFilters(); renderLibrary();
}
function renderRoute() {
  if (!current()) return;
  const view = location.hash === '#apps' ? 'apps' : 'home';
  $('homeView').hidden = view !== 'home'; $('appsView').hidden = view !== 'apps';
  root.querySelectorAll('[data-home-view]').forEach(link => {
    if (link.dataset.homeView === view) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  document.title = `${view === 'apps' ? '모든 앱' : '우리 홈'} · sungso`;
}
window.addEventListener('hashchange', renderRoute, { signal: lifecycle.signal });
compactScreen.addEventListener('change', () => { libraryPage = 1; renderLibrary(); }, { signal: lifecycle.signal });
$('appSearch').addEventListener('input', event => { libraryQuery = event.target.value; libraryPage = 1; renderLibrary(); });
for (const [id, view] of [['libraryGridView', 'grid'], ['libraryListView', 'list']]) $(id).addEventListener('click', () => { libraryView = view; renderLibrary(); });
function changePage(offset) {
  libraryPage += offset; renderLibrary(); $('appGroups').querySelector('a')?.focus();
}
$('prevApps').addEventListener('click', () => changePage(-1));
$('nextApps').addEventListener('click', () => changePage(1));

function renderEvents() {
  if (!current() || !eventsReady) return;
  $('allEventCount').textContent = String(cachedEvents.length);
  const container = $('upcomingEvents'); container.replaceChildren();
  for (const event of upcomingEvents(cachedEvents)) {
    const row = el('a', 'event-row'); row.href = './dates/';
    const date = el('time', 'event-date', event.date.slice(5).replace('-', '.')); date.dateTime = event.date;
    row.append(date, el('span', 'event-name', `${event.emoji || '📅'} ${event.title || '일정'}`), el('span', 'event-dday', dayLabel(event.date))); container.append(row);
  }
  if (!container.children.length) container.append(el('p', 'empty', '다가오는 일정이 아직 없어요. 우리의 날짜에서 다음 약속을 남겨보세요.'));
  const important = featuredEvents(cachedEvents)[0];
  $('importantEvent').hidden = !important;
  $('importantEventTitle').textContent = important?.title || '우리의 중요한 날';
  $('importantEventDday').textContent = important ? dayLabel(important.date) : '';
}
function refreshDay() {
  if (!current()) return;
  const today = koreanToday(); if (today === lastDay) return;
  lastDay = today;
  $('todayLabel').textContent = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  renderEvents();
}
refreshDay(); dayTimer = setInterval(refreshDay, 60000);
document.addEventListener('visibilitychange', refreshDay, { signal: lifecycle.signal });

function noteAuthor(note) {
  return note.authorUid === member.uid ? member.name : member.role === 'sungwoo' ? '소희' : '성우';
}
function noteMeta(note) {
  const meta = el('div', 'note-meta'); meta.append(el('span', '', noteAuthor(note)));
  const date = note.createdAt?.toDate?.();
  const time = el('time', '', date ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date) : '저장 중');
  if (date) time.dateTime = date.toISOString(); meta.append(time); return meta;
}
function renderNotes() {
  const preview = $('notesPreview'), list = $('notesList');
  const previewFocused = preview.contains(document.activeElement);
  const focusedNote = list.contains(document.activeElement) ? document.activeElement.dataset.noteId : null;
  preview.replaceChildren(); list.replaceChildren();
  if (notesCache.length) {
    const note = notesCache[0];
    const open = button('', `${noteAuthor(note)}의 최근 메모 전문 보기`, () => openNotes(false), 'preview-note');
    open.id = 'previewNote'; open.append(noteMeta(note), el('p', '', note.text)); preview.append(open);
    if (previewFocused) open.focus({ preventScroll: true });
  } else {
    const text = notesLoadFailed ? '메모를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.' : notesReady ? '첫 이야기를 남겨보세요. 두 사람만 함께 읽을 수 있어요.' : '메모를 불러오고 있어요.';
    preview.append(el('p', 'empty', text));
  }
  for (const note of notesCache) {
    const card = el('article', 'note-card'), meta = noteMeta(note);
    if (canDeleteNote(note, member)) {
      const remove = button('삭제', '내 메모 삭제', () => {
        pendingDelete = note; deleteReturn = remove; $('noteDeleteStatus').textContent = '';
        $('noteDeleteDialog').showModal(); $('cancelNoteDelete').focus();
      }, 'delete-note'); remove.dataset.noteId = note.id; meta.append(remove);
    }
    card.append(meta, el('p', '', note.text)); list.append(card);
  }
  if (!notesCache.length) list.append(el('p', 'empty', notesLoadFailed ? '메모를 불러오지 못했어요.' : notesReady ? '첫 이야기를 남겨보세요. 두 사람만 함께 읽을 수 있어요.' : '메모를 불러오고 있어요.'));
  if (focusedNote) {
    const control = [...list.querySelectorAll('.delete-note')].find(item => item.dataset.noteId === focusedNote);
    (control || $('closeNotes')).focus({ preventScroll: true });
  }
}
function openNotes(compose) {
  if (!$('notesDialog').open) { notesReturn = document.activeElement; $('notesDialog').showModal(); }
  if (compose) { $('noteForm').hidden = false; $('noteInput').focus(); }
  else $('closeNotes').focus();
}
function closeNotes() {
  if (noteSaving || deleting) return;
  $('notesDialog').close();
  (notesReturn?.isConnected ? notesReturn : $('openNotes')).focus(); notesReturn = null;
}
$('openNotes').addEventListener('click', () => openNotes(false));
$('openNote').addEventListener('click', () => openNotes(true));
$('openNoteInDialog').addEventListener('click', () => openNotes(true));
$('closeNotes').addEventListener('click', closeNotes);
$('notesDialog').addEventListener('cancel', event => { event.preventDefault(); closeNotes(); });
function watchNotes() {
  notesStop?.();
  notesStop = store.watchNotes(({ notes, hasMore }) => {
    const recovered = notesLoadFailed;
    notesCache = notes; notesReady = true; notesLoadFailed = false; renderNotes();
    $('moreNotes').hidden = !hasMore; $('moreNotes').disabled = false;
    if (recovered) $('notesStatus').textContent = '';
  }, () => {
    notesLoadFailed = true; renderNotes();
    $('notesStatus').textContent = '메모를 불러오지 못했어요. 연결 상태를 확인해 주세요.';
    $('moreNotes').disabled = false;
  }, notesCount);
}
function closeNoteDelete() {
  if (deleting) return;
  $('noteDeleteDialog').close(); pendingDelete = null;
  (deleteReturn?.isConnected ? deleteReturn : $('closeNotes')).focus(); deleteReturn = null;
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
$('cancelNote').addEventListener('click', () => {
  if (noteSaving) return;
  $('noteForm').hidden = true; $('noteInput').value = ''; $('noteCount').textContent = '0 / 500'; $('openNoteInDialog').focus();
});
$('noteInput').addEventListener('input', () => { $('noteCount').textContent = `${$('noteInput').value.length} / 500`; });
$('noteForm').addEventListener('submit', async event => {
  event.preventDefault(); if (noteSaving) return;
  const text = $('noteInput').value; noteSaving = true;
  for (const id of ['saveNote', 'cancelNote', 'closeNotes', 'noteInput']) $(id).disabled = true;
  try {
    await store.addNote(text);
    if (current()) {
      $('noteInput').value = ''; $('noteCount').textContent = '0 / 500'; $('noteForm').hidden = true;
      $('notesStatus').textContent = '메모를 남겼어요.'; $('openNoteInDialog').focus();
    }
  } catch (error) { if (current()) $('notesStatus').textContent = error.message || '저장하지 못했어요. 입력한 내용은 그대로 두었어요.'; }
  finally { noteSaving = false; if (current()) for (const id of ['saveNote', 'cancelNote', 'closeNotes', 'noteInput']) $(id).disabled = false; }
});

function showShortcutConflict(latest) {
  if (latest.revision > config.revision) { config = structuredClone(latest); renderApps(); }
  $('shortcutConflict').hidden = false;
  const names = getHomeShortcuts(config).map(app => app.title);
  $('shortcutLatestSummary').textContent = `최신 바로가기: ${names.join(' · ') || '없음'}`;
  $('saveShortcuts').disabled = true;
}
function renderShortcutChoices() {
  const container = $('shortcutChoices');
  const focusedId = container.contains(document.activeElement) ? document.activeElement.value : null;
  container.replaceChildren();
  for (const definition of getLibraryApps(shortcutBase)) {
    const label = el('label', 'shortcut-choice'); label.dataset.group = definition.groupId;
    const input = el('input'); input.type = 'checkbox'; input.value = definition.id; input.checked = shortcutIds.includes(definition.id);
    input.setAttribute('aria-label', `${definition.title} 바로가기 선택`);
    const copy = appCopy(definition);
    if (input.checked) copy.append(el('span', 'shortcut-order', `${shortcutIds.indexOf(definition.id) + 1}번째`));
    input.addEventListener('change', () => {
      if (input.checked) {
        if (shortcutIds.length >= SHORTCUT_LIMIT) { input.checked = false; $('shortcutStatus').textContent = '네 개까지 고를 수 있어요. 먼저 다른 바로가기를 하나 빼주세요.'; return; }
        shortcutIds.push(definition.id);
      } else shortcutIds = shortcutIds.filter(id => id !== definition.id);
      $('shortcutStatus').textContent = `${shortcutIds.length} / ${SHORTCUT_LIMIT}개 선택`; renderShortcutChoices();
    });
    label.append(input, appIcon(definition), copy); container.append(label);
  }
  $('saveShortcuts').disabled = savingShortcuts || shortcutIds.length > SHORTCUT_LIMIT || !$('shortcutConflict').hidden;
  if (focusedId) [...container.querySelectorAll('input')].find(input => input.value === focusedId)?.focus({ preventScroll: true });
}
function openShortcutEditor(toggleId) {
  if (!homeReady || editingShortcuts || savingShortcuts) return;
  shortcutReturn = document.activeElement; shortcutBase = structuredClone(config); shortcutRevision = config.revision;
  shortcutIds = getHomeShortcuts(config).map(item => item.id);
  if (toggleId) shortcutIds = shortcutIds.includes(toggleId) ? shortcutIds.filter(id => id !== toggleId) : [...shortcutIds, toggleId];
  editingShortcuts = true; $('shortcutConflict').hidden = true;
  $('shortcutStatus').textContent = shortcutIds.length > SHORTCUT_LIMIT ? '새 앱을 선택했어요. 기존 바로가기 하나를 빼서 네 개로 맞춰주세요.' : `${shortcutIds.length} / ${SHORTCUT_LIMIT}개 선택`;
  renderShortcutChoices(); $('shortcutDialog').showModal(); $('closeShortcut').focus();
}
function closeShortcutEditor() {
  if (savingShortcuts) return;
  editingShortcuts = false; shortcutBase = null; shortcutIds = []; $('shortcutDialog').close();
  const appId = shortcutReturn?.dataset.appId;
  const target = appId ? [...$('appGroups').querySelectorAll('.pin-button')].find(item => item.dataset.appId === appId) : null;
  (target || (shortcutReturn?.isConnected ? shortcutReturn : $('editShortcuts'))).focus(); shortcutReturn = null;
}
$('editShortcuts').addEventListener('click', () => openShortcutEditor());
$('closeShortcut').addEventListener('click', closeShortcutEditor);
$('shortcutDialog').addEventListener('cancel', event => { event.preventDefault(); closeShortcutEditor(); });
$('loadLatestShortcuts').addEventListener('click', () => {
  shortcutBase = structuredClone(config); shortcutRevision = config.revision; shortcutIds = getHomeShortcuts(config).map(item => item.id);
  $('shortcutConflict').hidden = true; $('shortcutStatus').textContent = '최신 바로가기를 기준으로 다시 골라주세요.'; renderShortcutChoices();
});
$('saveShortcuts').addEventListener('click', async () => {
  if (savingShortcuts || !editingShortcuts || shortcutIds.length > SHORTCUT_LIMIT) return;
  savingShortcuts = true;
  const controls = [...$('shortcutDialog').querySelectorAll('button,input')];
  controls.forEach(control => { control.disabled = true; });
  try {
    const value = withHomeShortcuts(shortcutBase, shortcutIds);
    const saved = await store.saveHome(value, shortcutRevision);
    if (current()) { config = saved; renderApps(); savingShortcuts = false; closeShortcutEditor(); $('homeStatus').textContent = '바로가기를 두 사람의 홈에 함께 적용했어요.'; }
  } catch (error) {
    if (current()) { $('shortcutStatus').textContent = error.message || '저장하지 못했어요. 선택한 내용은 그대로 두었어요.'; if (error.latest) showShortcutConflict(error.latest); }
  } finally {
    savingShortcuts = false;
    if (current()) { controls.forEach(control => { control.disabled = false; }); if (editingShortcuts) renderShortcutChoices(); }
  }
});

renderApps(); renderRoute(); renderNotes();
store.watchHome(value => {
  config = value; homeReady = true; renderApps();
  if ($('homeStatus').textContent.includes('불러오')) $('homeStatus').textContent = '';
  if (editing && config.revision !== expectedRevision && !saving) showConflict(config);
  if (editingShortcuts && config.revision !== shortcutRevision && !savingShortcuts) showShortcutConflict(config);
}, () => {
  $('homeStatus').textContent = '홈 구성을 불러오지 못했어요. 연결과 로그인 상태를 확인한 뒤 새로고침해 주세요.';
});
store.watchEvents(events => { cachedEvents = events; eventsReady = true; renderEvents(); }, () => {
  cachedEvents = []; eventsReady = false;
  $('allEventCount').textContent = '';
  $('upcomingEvents').replaceChildren(el('p', 'empty', '일정을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.'));
  $('importantEvent').hidden = true;
});
watchNotes();

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
