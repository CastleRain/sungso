import { requireMember, getMember, registerPrivateCleanup } from '../firebase/site-auth.mjs';
import { blankState, upsertRecord, removeRecord, toggleRecord, addRecipeIngredients, foodCandidates, guestSummary, safeExternalUrl } from './core.mjs';
import { createLifeStore } from './local-store.mjs';

const spaces = [
  { id: 'table', title: '우리 식탁', href: '../table/' },
  { id: 'footprints', title: '우리 발자국', href: '../footprints/' },
  { id: 'wedding', title: '우리 결혼', href: '../wedding/' },
];
const kindLabels = { shopping: '장보기', recipes: '레시피', places: '장소', visits: '방문·데이트', albums: '사진첩', guests: '하객', tasks: '준비할 일' };
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function button(text, onClick, className = 'life-quiet') {
  const element = node('button', className, text); element.type = 'button';
  if (onClick) element.addEventListener('click', onClick);
  return element;
}
function link(text, href, className = '') {
  const element = node('a', className, text); element.href = href; return element;
}
function textLines(value) {
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : [item.name, item.quantity, item.unit].filter(Boolean).join(' '));
  return String(value ?? '').split('\n').map(item => item.trim()).filter(Boolean);
}
function recordName(record, kind, state) {
  if (kind === 'visits') return state.places.find(place => place.id === record.placeId)?.name || '보관된 장소의 방문';
  return record.title || record.name || kindLabels[kind] || '기록';
}
function readableError(error) {
  return typeof error?.message === 'string' ? error.message : '저장하지 못했어요. 입력한 내용은 그대로 두었으니 다시 시도해 주세요.';
}
function externalLink(value, title) {
  let href;
  try { href = safeExternalUrl(value); } catch { return null; }
  if (!href) return null;
  const result = link(`${title} ↗`, href, 'life-record-link'); result.target = '_blank'; result.rel = 'noopener noreferrer'; return result;
}

/** Shared member-only UI. This layer never writes a production database. */
export async function mountLifeApp(definition) {
  const member = await requireMember();
  const privateRoot = document.querySelector('[data-private-root]');
  if (!privateRoot) throw new Error('앱의 개인 화면을 찾지 못했어요.');
  const mount = document.getElementById('lifeApp') || privateRoot;
  let disposed = false;
  const current = () => !disposed && getMember()?.uid === member.uid;
  if (!current()) return;
  let store;
  try { store = createLifeStore({ uid: member.uid, isCurrent: current }); }
  catch (error) { store = { read() { throw error; }, commit() { throw error; }, subscribe() { return () => {}; }, dispose() {} }; }
  let state = blankState(), blocked = false, activeTab = definition.tabs[0], query = '', filter = 'all', pickedFood = null;
  let busy = false, editing = null, deleting = null, ingredientEditing = null, returnFocus = null, unsubscribe;
  const objectUrls = new Set();
  const disposers = [];
  const shell = node('div', 'life-shell');
  const header = node('header', 'life-header');
  const brand = link('sungso', '../', 'life-brand'); brand.append(node('span', '', '.')); brand.setAttribute('aria-label', 'sungso 우리 홈');
  const spaceNav = node('nav', 'life-space-nav'); spaceNav.setAttribute('aria-label', '생활 공간');
  for (const space of spaces) {
    const anchor = link(space.title, space.href); if (space.id === definition.id) anchor.setAttribute('aria-current', 'page'); spaceNav.append(anchor);
  }
  header.append(brand, spaceNav, link('우리 홈 ↗', '../', 'life-home-link'));
  const main = node('div', 'life-main');
  const intro = node('header', 'life-intro'), introCopy = node('div');
  introCopy.append(node('p', 'life-kicker', definition.kicker), node('h1', '', definition.title), node('p', 'life-description', definition.description)); intro.append(introCopy);
  const storageNote = node('aside', 'life-storage-note');
  const storageCopy = node('p'); storageCopy.append(node('strong', '', '이 브라우저·계정에 저장돼요.'), node('br'), document.createTextNode('다른 기기나 상대 계정과 자동 공유되지 않아요.'));
  const backup = button('백업 내려받기', downloadBackup, 'life-text-button'); storageNote.append(storageCopy, backup);
  const tabs = node('div', 'life-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', `${definition.title} 메뉴`);
  const tabButtons = new Map();
  for (const tab of definition.tabs) {
    const control = button(tab.title, () => selectTab(tab.id), ''); control.id = `life-tab-${tab.id}`; control.setAttribute('role', 'tab'); control.setAttribute('aria-controls', 'life-panel');
    control.addEventListener('keydown', event => {
      const index = definition.tabs.findIndex(item => item.id === tab.id);
      const target = event.key === 'ArrowRight' ? (index + 1) % definition.tabs.length : event.key === 'ArrowLeft' ? (index - 1 + definition.tabs.length) % definition.tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? definition.tabs.length - 1 : -1;
      if (target < 0) return; event.preventDefault(); selectTab(definition.tabs[target].id); tabButtons.get(definition.tabs[target].id).focus();
    });
    tabButtons.set(tab.id, control); tabs.append(control);
  }
  const status = node('p', 'life-status'); status.id = 'life-status'; status.setAttribute('role', 'status');
  const panel = node('section'); panel.id = 'life-panel'; panel.setAttribute('role', 'tabpanel'); panel.tabIndex = 0;
  const sectionHeading = node('div', 'life-section-heading'), sectionCopy = node('div'), sectionTitle = node('h2'), sectionDescription = node('p');
  sectionCopy.append(sectionTitle, sectionDescription);
  const add = button('추가하기', () => openEditor()); add.id = 'life-add';
  const random = button('오늘의 후보 골라줘', chooseFood); random.id = 'life-random';
  sectionHeading.append(sectionCopy, add, random);
  const summary = node('div', 'life-summary'); summary.id = 'life-summary';
  const toolbar = node('div', 'life-toolbar');
  const search = node('input', 'life-search'); search.type = 'search'; search.id = 'life-search'; search.placeholder = '기록에서 찾아보기'; search.setAttribute('aria-label', '기록 검색'); search.autocomplete = 'off';
  search.addEventListener('input', () => { query = search.value; renderRecords(); });
  const filterControl = node('select', 'life-filter'); filterControl.id = 'life-filter'; filterControl.setAttribute('aria-label', '기록 분류');
  filterControl.addEventListener('change', () => { filter = filterControl.value; renderRecords(); });
  toolbar.append(search, filterControl);
  const count = node('p', 'life-count'); count.id = 'life-count'; count.setAttribute('role', 'status');
  const picked = node('div');
  const records = node('div', 'life-records'); records.id = 'life-records';
  panel.append(sectionHeading, summary, toolbar, count, picked, records);
  const connections = node('nav', 'life-connections'); connections.setAttribute('aria-label', '연결된 앱');
  for (const item of definition.links || []) {
    if (!/^\.\.\/[a-z][a-z0-9-]*\/$/.test(item.href)) continue;
    const anchor = link(`${item.title} ↗`, item.href); if (item.description) anchor.title = item.description; connections.append(anchor);
  }
  const footer = node('footer', 'life-footer'); footer.append(node('span', '', '우리의 보통날을, 함께'), node('span', '', '작은 기록부터 하나씩 ♡'));
  main.append(intro, storageNote, tabs, status, panel, connections, footer); shell.append(header, main);

  const editDialog = createDialog('life-edit-dialog', '기록 추가');
  const form = node('form'); form.id = 'life-record-form';
  const fields = node('div', 'life-form-fields');
  const editStatus = node('p', 'life-status'); editStatus.setAttribute('role', 'status');
  const editConflict = createConflict(() => rebaseEditor());
  const editActions = node('div', 'life-dialog-actions'), cancelEdit = button('취소', () => closeEditor());
  const save = button('저장하기', null, 'life-button'); save.type = 'submit'; save.id = 'life-save';
  editActions.append(cancelEdit, save); form.append(fields, editConflict.root, editStatus, editActions); editDialog.body.append(form);
  form.addEventListener('submit', submitEditor);
  editDialog.close.addEventListener('click', closeEditor); editDialog.root.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });

  const deleteDialog = createDialog('life-delete-dialog', '기록 삭제'); deleteDialog.root.classList.add('life-delete-dialog');
  const deleteCopy = node('p', 'life-dialog-description'), deleteStatus = node('p', 'life-status'); deleteStatus.setAttribute('role', 'status');
  const deleteActions = node('div', 'life-dialog-actions'), cancelDelete = button('취소', closeDelete), confirmDelete = button('삭제하기', submitDelete, 'life-button');
  deleteActions.append(cancelDelete, confirmDelete); deleteDialog.body.append(deleteCopy, deleteStatus, deleteActions);
  deleteDialog.close.addEventListener('click', closeDelete); deleteDialog.root.addEventListener('cancel', event => { event.preventDefault(); closeDelete(); });

  const ingredientDialog = createDialog('life-ingredients-dialog', '장보기에 담을 재료');
  const ingredientCopy = node('p', 'life-dialog-description', '필요한 재료만 골라 담으세요. 이미 담은 재료는 중복으로 추가하지 않아요.');
  const ingredientFields = node('div', 'life-ingredients'), ingredientStatus = node('p', 'life-status'); ingredientStatus.setAttribute('role', 'status');
  const ingredientConflict = createConflict(rebaseIngredients);
  const ingredientActions = node('div', 'life-dialog-actions'), cancelIngredients = button('취소', closeIngredients), saveIngredients = button('장보기에 담기', submitIngredients, 'life-button');
  ingredientActions.append(cancelIngredients, saveIngredients); ingredientDialog.body.append(ingredientCopy, ingredientFields, ingredientConflict.root, ingredientStatus, ingredientActions);
  ingredientDialog.close.addEventListener('click', closeIngredients); ingredientDialog.root.addEventListener('cancel', event => { event.preventDefault(); closeIngredients(); });
  shell.append(editDialog.root, deleteDialog.root, ingredientDialog.root);
  mount.replaceChildren(shell);

  function createDialog(id, title) {
    const root = node('dialog', 'life-dialog'); root.id = id;
    const heading = node('div', 'life-dialog-heading'), label = node('h2', '', title); label.id = `${id}-title`;
    root.setAttribute('aria-labelledby', label.id);
    const close = button('×', null, 'life-icon-button'); close.setAttribute('aria-label', '닫기');
    const body = node('div'); heading.append(label, close); root.append(heading, body); return { root, title: label, close, body };
  }
  function createConflict(onReload) {
    const root = node('div', 'life-conflict'); root.hidden = true;
    const copy = node('p', '', '다른 탭에서 기록이 바뀌었어요. 입력은 유지했으니 최신 상태를 확인한 뒤 다시 저장해 주세요.');
    const reload = button('최신 상태로 다시 검토', onReload); root.append(copy, reload); return { root, reload, copy };
  }
  function announce(message) { if (current()) status.textContent = message; }
  function restoreFocus() {
    const target = returnFocus?.isConnected ? returnFocus : add.hidden ? tabButtons.get(activeTab.id) : add;
    target?.focus(); returnFocus = null;
  }
  function setBusy(value, dialog) {
    busy = value;
    for (const control of dialog.querySelectorAll('button, input, select, textarea')) control.disabled = value;
  }
  function selectTab(id, updateHash = true) {
    const next = definition.tabs.find(tab => tab.id === id) || definition.tabs[0];
    activeTab = next; query = ''; filter = 'all'; search.value = ''; pickedFood = null;
    if (updateHash && location.hash !== `#${next.id}`) history.replaceState(null, '', `${location.pathname}${location.search}#${next.id}`);
    render();
  }
  function render() {
    if (!current()) return;
    for (const [id, control] of tabButtons) { control.setAttribute('aria-selected', String(id === activeTab.id)); control.tabIndex = id === activeTab.id ? 0 : -1; }
    panel.setAttribute('aria-labelledby', `life-tab-${activeTab.id}`);
    sectionTitle.textContent = activeTab.title; sectionDescription.textContent = activeTab.description || '';
    add.hidden = activeTab.kind === 'food'; random.hidden = activeTab.kind !== 'food';
    add.disabled = blocked; random.disabled = blocked;
    const filters = filterOptions(); filterControl.replaceChildren();
    for (const option of filters) { const element = node('option', '', option.label); element.value = option.value; filterControl.append(element); }
    filterControl.hidden = filters.length < 2; filterControl.value = filter;
    renderRecords();
  }
  function filterOptions() {
    if (['shopping', 'tasks'].includes(activeTab.kind)) return [{ value: 'all', label: '전체' }, { value: 'open', label: '아직 할 일' }, { value: 'done', label: '완료한 일' }];
    if (activeTab.kind === 'food') return [{ value: 'all', label: '모두' }, { value: 'recipes', label: '집에서 해 먹기' }, { value: 'places', label: '밖에서 먹기' }];
    if (activeTab.kind === 'places') return [{ value: 'all', label: '모든 장소' }, { value: 'wish', label: '가고 싶은 곳' }, { value: 'visited', label: '다녀온 곳' }, ...(activeTab.fields.find(field => field.name === 'category')?.options || []).map(option => ({ value: `category:${option.value}`, label: option.label })), { value: 'archived', label: '보관한 곳' }];
    if (activeTab.kind === 'guests') return [{ value: 'all', label: '전체' }, ...(activeTab.fields.find(field => field.name === 'side')?.options || []).map(option => ({ value: `side:${option.value}`, label: option.label })), ...(activeTab.fields.find(field => field.name === 'attendance')?.options || []).map(option => ({ value: `attendance:${option.value}`, label: option.label }))];
    const field = activeTab.fields.find(item => item.type === 'select');
    return field ? [{ value: 'all', label: '전체' }, ...field.options.map(item => ({ value: item.value, label: item.label }))] : [{ value: 'all', label: '전체' }];
  }
  function matchesFilter(record, kind) {
    if (filter === 'all') return true;
    if (kind === 'food') return record.kind === filter;
    if (['shopping', 'tasks'].includes(kind)) return filter === 'done' ? !!record.done : !record.done;
    if (kind === 'places') return filter.startsWith('category:') ? record.category === filter.slice(9) : filter === 'wish' ? record.wish && !record.archived : filter === 'visited' ? state.visits.some(visit => visit.placeId === record.id) : !!record.archived;
    if (kind === 'guests') { const [key, value] = filter.split(':'); return record[key] === value; }
    const field = activeTab.fields.find(item => item.type === 'select'); return !field || record[field.name] === filter;
  }
  function renderRecords() {
    if (!current()) return;
    records.replaceChildren(); picked.replaceChildren(); summary.replaceChildren();
    if (activeTab.kind === 'food') { renderFood(); return; }
    const all = state[activeTab.kind] || [];
    const visible = all.filter(record => matchesFilter(record, activeTab.kind) && (!query.trim() || `${recordName(record, activeTab.kind, state)} ${Object.values(record).flat().join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
    count.textContent = `${visible.length}개${query || filter !== 'all' ? ' 표시 중' : ''}`;
    if (activeTab.kind === 'guests') renderGuestSummary();
    if (blocked) { records.append(emptyState('저장된 기록을 열지 못했어요.', '기존 저장 내용은 바꾸지 않았어요. 연결된 브라우저 저장소를 확인한 뒤 새로고침해 주세요.', false)); return; }
    if (!visible.length) { records.append(emptyState(query || filter !== 'all' ? '찾는 기록이 없어요.' : activeTab.emptyTitle, query || filter !== 'all' ? '다른 검색어나 분류로 다시 찾아보세요.' : activeTab.emptyDescription, !query && filter === 'all')); return; }
    for (const record of visible) records.append(recordCard(record, activeTab));
  }
  function emptyState(title, description, canAdd) {
    const empty = node('div', 'life-empty'); empty.append(node('div', 'life-empty-mark', '♡'), node('h3', '', title || '아직 기록이 없어요.'), node('p', '', description || '작은 기록부터 하나씩 남겨보세요.'));
    if (canAdd) empty.append(button('첫 기록 남기기', () => openEditor(), 'life-button'));
    return empty;
  }
  function recordCard(record, tab) {
    const card = node('article', `life-record${record.done ? ' is-done' : ''}`); card.dataset.recordId = record.id; card.tabIndex = -1;
    if (record.archived) card.append(node('span', 'life-tag', '방문 이력과 함께 보관 중'));
    const heading = node('div', 'life-record-heading');
    if (['shopping', 'tasks'].includes(tab.kind)) {
      const check = node('input'); check.type = 'checkbox'; check.checked = !!record.done; check.disabled = blocked;
      check.setAttribute('aria-label', `${recordName(record, tab.kind, state)} ${record.done ? '완료 취소' : '완료'}`);
      check.addEventListener('change', async () => {
        const expectedRevision = state.revision; check.disabled = true;
        try { await commit(toggleRecord(state, tab.kind, record.id), expectedRevision); announce(check.checked ? '완료로 표시했어요.' : '다시 할 일로 돌렸어요.'); }
        catch (error) { if (current()) { renderRecords(); announce(readableError(error)); } }
        finally { if (current()) [...records.children].find(item => item.dataset.recordId === record.id)?.querySelector('input')?.focus({ preventScroll: true }); }
      }); heading.append(check);
    }
    heading.append(node('h3', '', recordName(record, tab.kind, state))); card.append(heading);
    const details = node('dl', 'life-record-details');
    for (const field of tab.fields) {
      if (field.name === 'title' || field.name === 'name' || field.type === 'checkbox' && !record[field.name]) continue;
      const value = record[field.name]; if (value === '' || value === undefined || value === null || Array.isArray(value) && !value.length) continue;
      const row = node('div'), label = node('dt', '', field.label), content = node('dd');
      if (field.type === 'url') { const anchor = externalLink(value, field.label); if (anchor) content.append(anchor); else content.textContent = '링크를 확인해 주세요.'; }
      else if (field.type === 'select') content.textContent = field.options.find(option => option.value === value)?.label || value;
      else if (field.type === 'place') content.textContent = state.places.find(place => place.id === value)?.name || '보관된 장소';
      else if (field.type === 'visit') { const visit = state.visits.find(item => item.id === value); content.textContent = visit ? `${recordName(visit, 'visits', state)} · ${visit.date}` : '별도 앨범'; }
      else if (field.type === 'checkbox') content.textContent = '표시했어요';
      else if (Array.isArray(value)) content.textContent = textLines(value).join('\n');
      else content.textContent = String(value);
      row.append(label, content); details.append(row);
    }
    if (tab.kind === 'places') {
      const visits = state.visits.filter(visit => visit.placeId === record.id);
      if (visits.length) { const row = node('div'); row.append(node('dt', '', '함께 다녀온 기록'), node('dd', '', `${visits.length}번 · ${visits.map(visit => visit.date).filter(Boolean).sort().at(-1) || ''}`)); details.append(row); }
    }
    card.append(details);
    const actions = node('div', 'life-record-footer');
    const edit = button('수정', () => openEditor(record), 'life-text-button'); edit.setAttribute('aria-label', `${recordName(record, tab.kind, state)} 수정`); actions.append(edit);
    if (tab.kind === 'recipes') actions.append(button('재료를 장보기에', () => openIngredients(record), 'life-text-button'));
    if (tab.kind === 'places' && !record.archived) actions.append(button('방문 기록', () => { const next = definition.tabs.find(item => item.kind === 'visits'); if (next) { selectTab(next.id); openEditor(null, { placeId: record.id }); } }, 'life-text-button'));
    const remove = button(record.archived ? '보관 정보' : '삭제', () => openDelete(record, tab), 'life-text-button life-delete'); remove.setAttribute('aria-label', `${recordName(record, tab.kind, state)} 삭제`); actions.append(remove);
    card.append(actions); return card;
  }
  function renderGuestSummary() {
    const value = guestSummary(state);
    for (const [label, number] of [['전체 인원', value.totalPeople], ['참석 예정', value.confirmedPeople], ['확인 중', value.pendingPeople], ['불참', value.declinedPeople]]) { const item = node('div', 'life-summary-item'); item.append(node('span', '', label), node('strong', '', `${number}명`)); summary.append(item); }
  }
  function candidateRows() {
    return [
      ...state.recipes.map(record => ({ id: record.id, kind: 'recipes', record, title: record.title })),
      ...foodCandidates(state).map(record => ({ id: record.id, kind: 'places', record, title: record.name })),
    ];
  }
  function renderFood() {
    const all = candidateRows();
    const visible = all.filter(item => matchesFilter(item, 'food') && (!query.trim() || `${item.title} ${Object.values(item.record).flat().join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
    random.disabled = blocked || !visible.length; count.textContent = `우리의 후보 ${visible.length}개`;
    if (pickedFood && all.some(item => item.kind === pickedFood.kind && item.id === pickedFood.id)) {
      const result = button('', () => openCandidate(pickedFood), 'life-candidate'); result.append(node('p', '', '오늘은 이 후보 어때요?'), node('strong', '', pickedFood.title), node('span', '', '  → 자세히 보기')); picked.append(result);
    }
    if (!visible.length) { const empty = emptyState(query || filter !== 'all' ? '이 조건의 후보가 없어요.' : activeTab.emptyTitle, query || filter !== 'all' ? '검색 조건을 바꾸거나 새로운 후보를 담아보세요.' : activeTab.emptyDescription, false); empty.append(link('레시피 남기기', '../table/#recipes', 'life-quiet'), document.createTextNode(' '), link('식당 모으기 ↗', '../footprints/#places', 'life-quiet')); records.append(empty); return; }
    for (const candidate of visible) {
      const card = node('article', 'life-record'); card.append(node('span', 'life-tag', candidate.kind === 'recipes' ? '집에서 해 먹기' : '밖에서 먹기'), node('h3', '', candidate.title));
      const copy = node('p', 'life-description', candidate.kind === 'recipes' ? textLines(candidate.record.ingredients).join(' · ') : [candidate.record.region, candidate.record.address].filter(Boolean).join(' · '));
      const actions = node('div', 'life-record-footer'); actions.append(button('자세히 보기 →', () => openCandidate(candidate), 'life-text-button')); card.append(copy, actions); records.append(card);
    }
  }
  function chooseFood() {
    const visible = candidateRows().filter(item => matchesFilter(item, 'food') && (!query.trim() || `${item.title} ${Object.values(item.record).flat().join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
    if (!current() || !visible.length) return;
    pickedFood = visible[Math.floor(Math.random() * visible.length)]; renderFoodRefresh(); announce(`오늘의 후보는 ${pickedFood.title}예요.`);
  }
  function renderFoodRefresh() { records.replaceChildren(); picked.replaceChildren(); renderFood(); }
  function openCandidate(candidate) {
    if (!current()) return;
    if (candidate.kind === 'recipes') {
      const tab = definition.tabs.find(item => item.kind === 'recipes');
      if (tab) { selectTab(tab.id); const card = [...records.children].find(item => item.dataset.recordId === candidate.record.id); card?.scrollIntoView({ block: 'center' }); card?.focus({ preventScroll: true }); return; }
    }
    location.href = `../footprints/?record=${encodeURIComponent(candidate.record.id)}#places`;
  }

  function fieldValue(field, value) {
    if (field.type === 'lines') return textLines(value).join('\n');
    if (field.type === 'textarea' && Array.isArray(value)) return textLines(value).join('\n');
    return value ?? (field.name === 'count' ? '1' : '');
  }
  function openEditor(record = null, preset = {}) {
    if (!current() || blocked || busy) return;
    returnFocus = document.activeElement;
    editing = { tab: activeTab, record, base: structuredClone(state), expectedRevision: state.revision, inputs: new Map() };
    fields.replaceChildren(); editStatus.textContent = ''; editConflict.root.hidden = true; save.disabled = false;
    editDialog.title.textContent = `${kindLabels[activeTab.kind] || activeTab.title} ${record ? '수정' : '추가'}`;
    for (const field of activeTab.fields) {
      const label = node('label', `life-field${['textarea', 'lines', 'url'].includes(field.type) ? ' is-wide' : ''}${field.type === 'checkbox' ? ' life-checkbox-field' : ''}`);
      label.append(node('span', '', `${field.label}${field.required ? ' *' : ''}`));
      const control = ['select', 'place', 'visit'].includes(field.type) ? node('select') : ['textarea', 'lines'].includes(field.type) ? node('textarea') : node('input');
      control.id = `life-field-${field.name}`; control.name = field.name; control.required = !!field.required;
      if (control.tagName === 'INPUT') control.type = ['number', 'date', 'checkbox', 'url'].includes(field.type) ? field.type : 'text';
      if (field.type === 'number') { control.min = field.name === 'count' ? '1' : '0'; control.max = field.name === 'count' ? '20' : '999'; control.step = '1'; }
      if (field.placeholder) control.placeholder = field.placeholder;
      if (control.tagName === 'INPUT' && control.type === 'text') control.maxLength = field.name === 'name' && activeTab.kind === 'shopping' ? 200 : { title: 120, name: 120, quantity: 80, unit: 40, region: 100, address: 300, relation: 100 }[field.name] || 200;
      if (control.tagName === 'TEXTAREA') { control.rows = field.type === 'lines' ? 5 : 4; control.maxLength = field.type === 'lines' ? 20100 : field.name === 'steps' ? 8000 : 2000; }
      const value = record?.[field.name] ?? preset[field.name];
      if (field.type === 'select') {
        for (const option of field.options || []) { const item = node('option', '', option.label); item.value = option.value; control.append(item); }
      } else if (field.type === 'place' || field.type === 'visit') {
        const options = state[field.type === 'place' ? 'places' : 'visits'];
        const first = node('option', '', field.required ? '선택해 주세요' : '연결하지 않기'); first.value = ''; control.append(first);
        for (const option of options) {
          if (field.type === 'place' && option.archived && option.id !== value) continue;
          const item = node('option', '', field.type === 'place' ? option.name : `${recordName(option, 'visits', state)} · ${option.date}`); item.value = option.id; control.append(item);
        }
      }
      if (field.type === 'checkbox') control.checked = value === undefined ? field.name === 'wish' : !!value;
      else if (value !== undefined || field.type !== 'select') control.value = fieldValue(field, value);
      label.append(control);
      if (field.type === 'lines') label.append(node('small', '', '한 줄에 재료 하나씩 적어주세요. 수량과 단위도 함께 적을 수 있어요.'));
      if (field.type === 'url') label.append(node('small', '', 'HTTPS 링크를 저장해요. 링크는 직접 열 때만 연결돼요.'));
      if (field.type === 'place' && !state.places.some(place => !place.archived)) label.append(node('small', '', '장소 탭에서 장소를 먼저 남겨주세요.'));
      if (field.type === 'visit') label.append(node('small', '', '방문과 연결하거나, 별도 앨범으로 남길 수 있어요.'));
      editing.inputs.set(field.name, { field, control }); fields.append(label);
    }
    editDialog.root.showModal(); fields.querySelector('input, textarea, select')?.focus();
  }
  function collectInputs() {
    const result = {};
    for (const [name, { field, control }] of editing.inputs) result[name] = field.type === 'checkbox' ? control.checked : field.type === 'lines' ? textLines(control.value) : field.type === 'number' ? Number(control.value || (name === 'count' ? 1 : 0)) : control.value.trim();
    return result;
  }
  function closeEditor() {
    if (busy) return;
    editDialog.root.close(); editing = null; fields.replaceChildren(); restoreFocus();
  }
  async function submitEditor(event) {
    event.preventDefault(); if (!current() || !editing || busy || blocked || !form.reportValidity()) return;
    const values = collectInputs(); const pending = editing;
    setBusy(true, editDialog.root); editStatus.textContent = '저장하고 있어요.';
    try {
      if (!pending.record?.id && typeof crypto.randomUUID !== 'function') throw new Error('안전한 기록 ID를 만들 수 없어요. 최신 브라우저에서 다시 열어 주세요.');
      const next = upsertRecord(pending.base, pending.tab.kind, { ...pending.record, ...values, id: pending.record?.id || crypto.randomUUID() });
      await commit(next, pending.expectedRevision);
      if (current()) { setBusy(false, editDialog.root); closeEditor(); announce('이 브라우저·계정에 저장했어요.'); }
    } catch (error) {
      if (current()) { editStatus.textContent = readableError(error); if (isConflict(error)) { editConflict.root.hidden = false; save.disabled = true; } }
    } finally {
      if (current()) { setBusy(false, editDialog.root); if (!editConflict.root.hidden) save.disabled = true; }
    }
  }
  async function rebaseEditor() {
    if (!current() || !editing || busy) return;
    try {
      const latest = await store.read(); if (!current()) return;
      state = latest; blocked = false; const previous = editing.record;
      editing.base = structuredClone(latest); editing.expectedRevision = latest.revision;
      editing.record = previous ? latest[editing.tab.kind].find(item => item.id === previous.id) || null : null;
      editConflict.root.hidden = true; save.disabled = false;
      editStatus.textContent = previous && !editing.record ? '기존 기록이 삭제됐어요. 입력한 내용을 새 기록으로 저장할 수 있어요.' : '최신 상태를 가져왔어요. 입력한 내용을 확인한 뒤 저장해 주세요.';
      render();
    } catch (error) { if (current()) editStatus.textContent = readableError(error); }
  }
  function openDelete(record, tab) {
    if (!current() || busy || blocked) return;
    returnFocus = document.activeElement; deleting = { record, tab, base: structuredClone(state), expectedRevision: state.revision };
    const referenced = tab.kind === 'places' && state.visits.some(visit => visit.placeId === record.id);
    deleteDialog.title.textContent = referenced ? '장소 보관' : '기록 삭제';
    deleteCopy.textContent = referenced ? `‘${recordName(record, tab.kind, state)}’의 방문 기록을 지키기 위해 장소를 보관해요. 이전 방문에서 계속 볼 수 있어요.` : `‘${recordName(record, tab.kind, state)}’ 기록을 삭제할까요? 삭제한 기록은 다시 가져올 수 없어요.`;
    confirmDelete.textContent = referenced ? '보관하기' : '삭제하기'; deleteStatus.textContent = ''; confirmDelete.disabled = false;
    deleteDialog.root.showModal(); cancelDelete.focus();
  }
  function closeDelete() { if (busy) return; deleteDialog.root.close(); deleting = null; restoreFocus(); }
  async function submitDelete() {
    if (!current() || !deleting || busy || blocked) return;
    const pending = deleting; setBusy(true, deleteDialog.root);
    try { await commit(removeRecord(pending.base, pending.tab.kind, pending.record.id), pending.expectedRevision); if (current()) { setBusy(false, deleteDialog.root); closeDelete(); announce('기록을 정리했어요.'); } }
    catch (error) { if (current()) { deleteStatus.textContent = isConflict(error) ? '다른 탭에서 기록이 바뀌었어요. 취소한 뒤 최신 기록을 확인하고 다시 선택해 주세요.' : readableError(error); confirmDelete.disabled = isConflict(error); } }
    finally { if (current()) { const disabled = confirmDelete.disabled; setBusy(false, deleteDialog.root); confirmDelete.disabled = disabled; } }
  }
  function openIngredients(recipe) {
    if (!current() || busy || blocked) return;
    returnFocus = document.activeElement; ingredientEditing = { recipe, base: structuredClone(state), expectedRevision: state.revision };
    ingredientFields.replaceChildren(); ingredientStatus.textContent = ''; ingredientConflict.root.hidden = true; saveIngredients.disabled = false;
    for (const [index, value] of textLines(recipe.ingredients).entries()) {
      const label = node('label', 'life-ingredient'), control = node('input'); control.type = 'checkbox'; control.value = String(index); control.checked = true;
      label.append(control, node('span', '', value)); ingredientFields.append(label);
    }
    if (!ingredientFields.children.length) { ingredientFields.append(node('p', 'life-dialog-description', '레시피에 재료를 먼저 적어주세요.')); saveIngredients.disabled = true; }
    ingredientDialog.root.showModal(); ingredientFields.querySelector('input')?.focus();
  }
  function closeIngredients() { if (busy) return; ingredientDialog.root.close(); ingredientEditing = null; ingredientFields.replaceChildren(); restoreFocus(); }
  async function submitIngredients() {
    if (!current() || !ingredientEditing || busy || blocked) return;
    const pending = ingredientEditing, selected = [...ingredientFields.querySelectorAll('input:checked')].map(input => Number(input.value));
    if (!selected.length) { ingredientStatus.textContent = '담을 재료를 하나 이상 골라주세요.'; return; }
    setBusy(true, ingredientDialog.root);
    try { await commit(addRecipeIngredients(pending.base, pending.recipe.id, selected), pending.expectedRevision); if (current()) { setBusy(false, ingredientDialog.root); closeIngredients(); announce('고른 재료를 장보기에 담았어요. 이미 담은 재료는 그대로 유지해요.'); } }
    catch (error) { if (current()) { ingredientStatus.textContent = readableError(error); if (isConflict(error)) { ingredientConflict.root.hidden = false; saveIngredients.disabled = true; } } }
    finally { if (current()) { setBusy(false, ingredientDialog.root); if (!ingredientConflict.root.hidden) saveIngredients.disabled = true; } }
  }
  async function rebaseIngredients() {
    if (!current() || !ingredientEditing || busy) return;
    try {
      const latest = await store.read(); if (!current()) return;
      const recipe = latest.recipes.find(item => item.id === ingredientEditing.recipe.id);
      if (!recipe) { ingredientStatus.textContent = '레시피가 삭제됐어요. 취소한 뒤 다른 레시피를 골라주세요.'; return; }
      const selectedText = new Set([...ingredientFields.querySelectorAll('input:checked')].map(input => textLines(ingredientEditing.recipe.ingredients)[Number(input.value)]));
      state = latest; blocked = false; ingredientEditing = { recipe, base: structuredClone(latest), expectedRevision: latest.revision };
      ingredientFields.replaceChildren();
      for (const [index, text] of textLines(recipe.ingredients).entries()) { const label = node('label', 'life-ingredient'), input = node('input'); input.type = 'checkbox'; input.value = String(index); input.checked = selectedText.has(text); label.append(input, node('span', '', text)); ingredientFields.append(label); }
      ingredientConflict.root.hidden = true; saveIngredients.disabled = false; ingredientStatus.textContent = '최신 재료를 가져왔어요. 고른 재료를 확인한 뒤 다시 담아주세요.'; render();
    } catch (error) { if (current()) ingredientStatus.textContent = readableError(error); }
  }
  function isConflict(error) { return error?.code === 'conflict' || error?.code === 'revision-conflict' || !!error?.latest; }
  async function commit(next, expectedRevision) {
    if (!current()) throw new Error('로그인 상태가 바뀌었어요.');
    const saved = await store.commit(next, { expectedRevision });
    if (!current()) return;
    state = saved || await store.read(); if (current()) render();
  }
  async function downloadBackup() {
    if (!current() || blocked || busy) return;
    try {
      const snapshot = await store.read(); if (!current()) return;
      const blob = new Blob([JSON.stringify({ format: 'sungso-life-local-backup', version: 1, exportedAt: new Date().toISOString(), state: snapshot }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); objectUrls.add(url);
      const anchor = link('', url); anchor.download = `sungso-life-${new Date().toISOString().slice(0, 10)}.json`;
      if (!current()) { URL.revokeObjectURL(url); objectUrls.delete(url); return; }
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => { URL.revokeObjectURL(url); objectUrls.delete(url); }, 30000);
      announce('생활 기록 세 공간의 로컬 백업을 내려받았어요. 파일에는 개인 기록이 들어 있어요.');
    } catch (error) { announce(readableError(error)); }
  }
  function cleanup() {
    if (disposed) return; disposed = true;
    unsubscribe?.(); store.dispose(); disposers.forEach(dispose => dispose());
    for (const url of objectUrls) URL.revokeObjectURL(url); objectUrls.clear();
    editDialog.root.close(); deleteDialog.root.close(); ingredientDialog.root.close();
    state = blankState(); editing = null; deleting = null; ingredientEditing = null; pickedFood = null;
    fields.replaceChildren(); ingredientFields.replaceChildren(); privateRoot.hidden = true; mount.replaceChildren();
  }
  registerPrivateCleanup(cleanup);
  const hashChanged = () => selectTab(location.hash.slice(1), false);
  window.addEventListener('hashchange', hashChanged); disposers.push(() => window.removeEventListener('hashchange', hashChanged));
  try { state = await store.read(); if (!current()) return; }
  catch (error) { blocked = true; announce(readableError(error)); }
  if (!current()) return;
  unsubscribe = store.subscribe((value, error) => {
    if (!current()) return;
    if (error || !value) {
      blocked = true; const message = readableError(error); announce(message);
      if (editing) { editStatus.textContent = message; editConflict.root.hidden = false; save.disabled = true; }
      if (ingredientEditing) { ingredientStatus.textContent = message; ingredientConflict.root.hidden = false; saveIngredients.disabled = true; }
      if (deleting) { deleteStatus.textContent = message; confirmDelete.disabled = true; }
      render(); return;
    }
    blocked = false;
    state = value;
    if (editing && editing.expectedRevision !== state.revision && !busy) { editConflict.root.hidden = false; save.disabled = true; }
    if (ingredientEditing && ingredientEditing.expectedRevision !== state.revision && !busy) { ingredientConflict.root.hidden = false; saveIngredients.disabled = true; }
    render();
  });
  selectTab(location.hash.slice(1), false);
  privateRoot.hidden = false;
  const initialId = new URLSearchParams(location.search).get('record');
  if (initialId) {
    const card = [...records.children].find(item => item.dataset.recordId === initialId);
    if (card) { card.scrollIntoView({ block: 'center' }); card.focus({ preventScroll: true }); }
  }
  return { dispose: cleanup };
}
