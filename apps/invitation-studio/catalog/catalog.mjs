import { CHOICES, CHOICE_KEYS, PRESETS, DEFAULT_COMPOSITION, DEFAULT_ORDER, ORDER_SECTIONS, SECTION_IDS, moveSection, normalizeComposition, readComposition, compositionParams, sameComposition } from './js/composition.mjs';
import { LIBRARY_LIMIT, LIBRARY_BYTES, cleanName, cleanNote, cleanRating, parseLibrary, selectSaved, updateSaved, exportSelection, parseImport } from './js/saved-library.mjs';

const $ = selector => document.querySelector(selector);
const frame = $('#invitation-preview');
const STORAGE_KEY = 'sungso_invitation_studio_combinations_v1';
const labels = { palette: '색감', font: '글씨체', motion: '공통 스크롤 효과', cover: '첫 화면', opening: '첫 손글씨', intro: '초대글 · 가족 소개', date: '예식 날짜', story: '우리의 이야기', album: '사진첩', arrival: '오시는 길', gifting: '마음 전하실 곳', wishes: '축하의 편지', navigation: '빠른 메뉴' };
const keys = CHOICE_KEYS, globalKeys = ['palette', 'font', 'motion'], utilityKeys = ['arrival', 'gifting', 'wishes', 'navigation'], history = [], orderRows = new Map();
let composition = readComposition(location.search), ready = false, audioEnabled = false, noticeTimer, pendingJump, motionReady = true;
let audioPhase = 'paused';
let savedReadFailed = false, savedSnapshot = null, saved = readSaved(), visibleSavedCount = 6, draftRating = 0, editingRecordId;
let editingScroll = 0, editingFocus = null, viewFrame = 0;
let chooserKey, chooserValue, chooserTrigger, chooserScroll = 0;

function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; }
function post(message) { frame.contentWindow?.postMessage(message, location.origin); }
function notify(text) { const el = $('#studio-notice'); el.textContent = text; el.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { el.hidden = true; }, 3800); }
function renderAudioState(phase, { syncIntent = true, announce = false } = {}) {
  if (!['paused', 'loading', 'playing', 'blocked', 'error'].includes(phase)) return;
  const previous = audioPhase; audioPhase = phase;
  if (syncIntent) audioEnabled = phase === 'loading' || phase === 'playing';
  const button = $('#audio-toggle'), playing = phase === 'playing', loading = phase === 'loading';
  button.setAttribute('aria-pressed', String(playing)); button.setAttribute('aria-busy', String(loading));
  button.setAttribute('aria-label', loading ? '미리보기 음악 불러오기 취소' : playing ? '미리보기 음악 끄기' : '미리보기 음악 켜기');
  button.classList.toggle('is-playing', playing); button.classList.toggle('is-loading', loading); button.dataset.phase = phase;
  button.querySelector('span').textContent = loading ? '준비 중' : playing ? '재생 중' : phase === 'error' ? '다시 재생' : '음악';
  button.title = phase === 'blocked' ? '청첩장 오른쪽 위 음악 아이콘을 한 번 눌러 주세요.' : phase === 'error' ? '음악을 불러오지 못했어요. 다시 시도해 주세요.' : '';
  if (announce && phase !== previous && phase === 'blocked') notify('청첩장 오른쪽 위 음악 아이콘을 한 번 누르면 음악이 시작돼요.');
  if (announce && phase !== previous && phase === 'error') notify('음악을 불러오지 못했어요. 다시 재생을 눌러 주세요.');
}
function urlFor(kind) {
  const url = new URL(kind === 'editor' ? './' : './preview/', location.href);
  url.search = compositionParams(composition).toString(); return url.href;
}
function readSaved() {
  try { savedSnapshot = localStorage.getItem(STORAGE_KEY); return parseLibrary(savedSnapshot); }
  catch { savedReadFailed = true; return []; }
}
function persistSaved(next) {
  if (savedReadFailed) { notify('기존 보관함을 읽지 못해 덮어쓰지 않았어요. 현재 조합은 파일로 보관해 주세요.'); return false; }
  try {
    const latest = localStorage.getItem(STORAGE_KEY);
    if (latest !== savedSnapshot) {
      try { saved = parseLibrary(latest); savedSnapshot = latest; renderSaved(); notify('다른 창에서 보관함이 바뀌어 최신 내용으로 맞췄어요. 지금 작업을 한 번 더 눌러 주세요.'); }
      catch { savedReadFailed = true; renderSaved(); notify('다른 창의 보관함을 읽지 못해 덮어쓰지 않았어요.'); }
      return false;
    }
    const serialized = JSON.stringify(next); localStorage.setItem(STORAGE_KEY, serialized); savedSnapshot = serialized; saved = next; renderSaved(); return true;
  }
  catch { notify('이 브라우저에는 저장할 수 없어요. 조합 링크나 파일로 보관해 주세요.'); return false; }
}
function updateURL() {
  const url = new URL(location.href); url.search = compositionParams(composition).toString();
  window.history.replaceState(null, '', url); $('#open-preview').href = urlFor('preview');
}
function orderLabel(order) { return order.map(id => ORDER_SECTIONS.find(section => section.id === id).label).join(' → '); }
function renderOrder() {
  const list = $('#section-order'), focus = document.activeElement;
  const wasOrderControl = list.contains(focus);
  composition.order.forEach((id, index) => {
    const row = orderRows.get(id); if (!row) return;
    row.querySelector('.order-number').textContent = String(index + 1).padStart(2, '0');
    row.querySelector('select').value = String(index);
    row.querySelector('[data-direction="up"]').disabled = index === 0;
    row.querySelector('[data-direction="down"]').disabled = index === composition.order.length - 1;
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
  });
  // A reordered row keeps the keyboard on the same control without scrolling its editor.
  if (wasOrderControl && focus?.isConnected) {
    const target = focus.disabled ? focus.closest('li').querySelector('select') : focus;
    target.focus({ preventScroll: true });
  }
  $('#preview-order').textContent = orderLabel(composition.order);
  $('#reset-order').disabled = composition.order.every((id, index) => id === DEFAULT_ORDER[index]);
}
function renderChoices() {
  for (const key of keys) {
    document.querySelectorAll(`input[name="${key}"]`).forEach(input => { input.checked = input.value === composition[key]; });
    const choice = CHOICES[key].find(item => item.id === composition[key]);
    const selected = $(`[data-current="${key}"]`); if (selected) selected.textContent = choice.label;
    const sample = $(`[data-choice="${key}"] .choice-mini`); if (sample) { sample.replaceChildren(makeSample(key, choice.id, true)); }
  }
  document.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', String(sameComposition(composition, PRESETS.find(item => item.id === button.dataset.preset).composition))));
  $('#preview-summary').textContent = globalKeys.map(key => CHOICES[key].find(item => item.id === composition[key]).label).join(' · ');
  $('#preview-summary').title = keys.map(key => `${labels[key]}: ${CHOICES[key].find(item => item.id === composition[key]).label}`).join('\n');
  $('#undo-change').disabled = history.length === 0;
  renderOrder();
  updateURL();
}
function apply(next, { section, replayOpening = false, reviewKey, remember = true } = {}) {
  const normalized = normalizeComposition(next);
  const changed = keys.filter(key => composition[key] !== normalized[key]);
  if (!section && changed.length) {
    reviewKey = changed.includes('opening') ? 'opening' : changed[0];
    section = SECTION_IDS[reviewKey]; replayOpening = reviewKey === 'opening';
  }
  if (!section && composition.order.some((id, index) => id !== normalized.order[index])) section = normalized.order.find((id, index) => id !== composition.order[index]);
  if (!sameComposition(composition, normalized) && remember) { history.push(normalizeComposition(composition)); if (history.length > 30) history.shift(); }
  composition = normalized; renderChoices();
  if (section) {
    pendingJump = destination(section, replayOpening, reviewKey);
    if (matchMedia('(max-width:740px)').matches) showView('preview');
  }
  if (ready) {
    post({ type: 'invitation-studio:apply', composition });
    $('#preview-status').textContent = '선택한 장면을 이어 붙이고 있어요.';
  }
}
function showView(view) {
  const mobile = matchMedia('(max-width:740px)').matches;
  const previous = document.body.dataset.view;
  if (mobile && previous === 'edit' && view === 'preview') { editingScroll = window.scrollY; editingFocus = document.activeElement; }
  document.body.dataset.view = view;
  document.querySelectorAll('.mobile-view [data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  if (!mobile || previous === view) return;
  const focusAtSwitch = document.activeElement;
  cancelAnimationFrame(viewFrame);
  viewFrame = requestAnimationFrame(() => {
    // A new input chosen during the view transition takes precedence over restoration.
    if (document.activeElement !== focusAtSwitch && document.activeElement !== document.body) return;
    window.scrollTo({ top: view === 'edit' ? editingScroll : $('.mobile-view').offsetTop, behavior: 'instant' });
    if (view === 'edit' && editingFocus?.isConnected && $('.edit-panel').contains(editingFocus)) {
      // A section can move far from its old editor position. Return to that row on mobile.
      const row = editingFocus.closest('.order-row');
      if (row) {
        const bounds = row.getBoundingClientRect(), safeTop = $('.mobile-view').getBoundingClientRect().height + 16;
        if (bounds.top < safeTop || bounds.bottom > window.innerHeight - 16) {
          editingScroll = Math.max(0, Math.min(window.scrollY + bounds.top - safeTop, document.documentElement.scrollHeight - window.innerHeight));
          window.scrollTo({ top: editingScroll, behavior: 'instant' });
        }
      }
      editingFocus.focus({ preventScroll: true });
    }
  });
}
function destination(section, replayOpening = false, reviewKey) {
  return { section, ...(section === 'top' && replayOpening ? { replayOpening: true } : {}), ...(keys.includes(reviewKey) && SECTION_IDS[reviewKey] === section ? { reviewKey } : {}) };
}
function jump(section, mobilePreview = false, replayOpening = false, reviewKey) {
  if (mobilePreview) showView('preview');
  const target = destination(section, replayOpening, reviewKey);
  if (ready) post({ type: 'invitation-studio:jump', ...target }); else pendingJump = target;
}
function makeSample(key, value, mini = false) {
  if (key === 'palette') {
    const sample = node('span', 'palette-sample'); sample.dataset.palette = value; sample.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) sample.append(node('i'));
    return sample;
  }
  if (key === 'font') {
    const sample = node('span', 'font-sample', mini ? '가' : '성우와 소희, 우리의 날'); sample.dataset.font = value; sample.setAttribute('aria-hidden', 'true'); return sample;
  }
  const sample = node('span', 'scene-sample'); sample.dataset.sample = key; sample.dataset.variant = value; sample.setAttribute('aria-hidden', 'true');
  const symbol = { cover: 'S & S', opening: 'With love', intro: '성우 & 소희', date: '03.06', story: 'Our story', album: '▤', arrival: '↗', gifting: 'For you', wishes: 'Dear us', navigation: '· · ·' }[key];
  sample.append(node('i'), node('span', '', symbol || 'Aa'), node('i'));
  return sample;
}
function closeChooser() {
  const trigger = chooserTrigger; chooserTrigger = null;
  $('#choice-dialog').close();
  trigger?.focus({ preventScroll: true });
  window.scrollTo({ top: chooserScroll, behavior: 'instant' });
}
function renderChooser() {
  const list = $('#choice-results'); list.replaceChildren();
  $('#choice-heading').textContent = labels[chooserKey];
  $('#choice-category').value = chooserKey;
  const term = $('#choice-search').value.trim().toLocaleLowerCase('ko');
  const choices = CHOICES[chooserKey].filter(choice => `${choice.label} ${choice.detail}`.toLocaleLowerCase('ko').includes(term));
  list.setAttribute('role', 'radiogroup'); list.setAttribute('aria-label', labels[chooserKey]);
  choices.forEach(choice => {
    const label = node('label', 'choice-label'), input = node('input'); input.type = 'radio'; input.name = 'browser-choice'; input.value = choice.id; input.checked = choice.id === chooserValue;
    const title = node('strong', '', choice.label), detail = node('small', '', choice.detail), check = node('span', 'choice-check', '✓'); check.setAttribute('aria-hidden', 'true');
    input.addEventListener('change', () => { if (input.checked) { chooserValue = choice.id; $('#choice-selection').textContent = `선택: ${choice.label}`; } });
    label.append(input, makeSample(chooserKey, choice.id), title, detail, check);
    if (composition[chooserKey] === choice.id) label.append(node('span', 'current-marker', '지금 적용 중'));
    list.append(label);
  });
  $('#choice-empty').hidden = choices.length > 0;
  $('#choice-selection').textContent = `선택: ${CHOICES[chooserKey].find(choice => choice.id === chooserValue).label}`;
}
function openChooser(key, trigger) {
  chooserKey = key; chooserValue = composition[key]; chooserTrigger = trigger; chooserScroll = window.scrollY;
  $('#choice-search').value = ''; renderChooser(); $('#choice-dialog').showModal();
  $('#choice-results input:checked')?.focus({ preventScroll: true });
}
function mountChoices() {
  keys.forEach(key => {
    const container = $(globalKeys.includes(key) ? '#global-controls' : utilityKeys.includes(key) ? '#utility-controls' : '#scene-controls');
    const group = node('div', 'choice-row'); group.dataset.choice = key;
    const button = node('button', 'choice-open'); button.type = 'button'; button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'choice-dialog'); button.setAttribute('aria-label', `${labels[key]} 고르기`);
    const sample = node('span', 'choice-mini'), text = node('span', 'choice-row-text'), selected = node('small'); selected.dataset.current = key;
    text.append(node('strong', '', labels[key]), selected);
    const count = node('span', 'choice-count', `${CHOICES[key].length}가지`); count.append(node('span', '', '↗'));
    button.append(sample, text, count); button.addEventListener('click', () => openChooser(key, button));
    group.append(button); container.append(group);
    const category = node('option', '', labels[key]); category.value = key; $('#choice-category').append(category);
  });
  $('#close-choices').addEventListener('click', closeChooser);
  $('#choice-dialog').addEventListener('cancel', event => { event.preventDefault(); closeChooser(); });
  $('#choice-category').addEventListener('change', event => { chooserKey = event.target.value; chooserValue = composition[chooserKey]; $('#choice-search').value = ''; renderChooser(); });
  $('#choice-search').addEventListener('input', renderChooser);
  $('#apply-choice').addEventListener('click', () => {
    const key = chooserKey, value = chooserValue;
    closeChooser();
    apply({ ...composition, [key]: value }, { section: SECTION_IDS[key], replayOpening: key === 'opening', reviewKey: key });
  });
  PRESETS.forEach(preset => {
    const button = node('button', 'preset'); button.dataset.preset = preset.id; button.type = 'button';
    button.append(node('strong', '', preset.label), node('small', '', preset.detail));
    button.addEventListener('click', () => { apply(preset.composition, { section: 'top', replayOpening: true }); notify('전체 스타일과 순서까지 추천 조합으로 바꿨어요. 하나씩 다시 골라도 좋아요.'); });
    $('#presets').append(button);
  });
}
function mountOrder() {
  const changePosition = (id, position, control) => {
    const previous = composition.order.indexOf(id);
    if (previous === position) return;
    const label = ORDER_SECTIONS.find(section => section.id === id).label;
    // Native selects do not consistently acquire focus on every mobile browser.
    (control || orderRows.get(id)?.querySelector('select'))?.focus({ preventScroll: true });
    apply({ ...composition, order: moveSection(composition.order, id, position) }, { section: id });
    $('#order-status').textContent = `${label}, ${position + 1}번째로 옮겼어요.`;
    notify(`${label}을 ${position + 1}번째로 옮겼어요. 미리보기에서 확인해 보세요.`);
  };
  ORDER_SECTIONS.forEach(section => {
    const row = node('li', 'order-row'); row.dataset.section = section.id;
    const number = node('span', 'order-number'); number.setAttribute('aria-hidden', 'true');
    const name = node('strong', 'order-name', section.label);
    const controls = node('div', 'order-controls');
    const select = node('select'); select.setAttribute('aria-label', `${section.label} 순서`);
    DEFAULT_ORDER.forEach((_, index) => { const option = node('option', '', `${index + 1}번째`); option.value = String(index); select.append(option); });
    select.addEventListener('change', () => changePosition(section.id, Number(select.value), select));
    controls.append(select);
    for (const [direction, symbol, amount] of [['up', '↑', -1], ['down', '↓', 1]]) {
      const button = node('button', 'order-arrow', symbol); button.type = 'button'; button.dataset.direction = direction;
      button.setAttribute('aria-label', `${section.label} ${direction === 'up' ? '위로' : '아래로'} 이동`);
      button.addEventListener('click', () => changePosition(section.id, composition.order.indexOf(section.id) + amount, button)); controls.append(button);
    }
    row.append(number, name, controls); orderRows.set(section.id, row);
  });
  $('#reset-order').addEventListener('click', () => { apply({ ...composition, order: [...DEFAULT_ORDER] }, { section: 'invitation' }); $('#order-status').textContent = '처음 순서로 돌아왔어요.'; notify('장면 선택은 유지하고 순서만 처음으로 돌렸어요.'); });
}
function mountStars(container, rating, onChange, name) {
  container.replaceChildren();
  for (let value = 1; value <= 5; value++) {
    const button = node('button', 'rating-star', value <= rating ? '★' : '☆'); button.type = 'button'; button.dataset.rating = String(value);
    button.setAttribute('aria-label', `${name} 별점 ${value}개`); button.setAttribute('aria-pressed', String(value === rating)); button.title = value === rating ? '한 번 더 누르면 별점을 지워요.' : `별점 ${value}개`;
    button.addEventListener('click', () => onChange(value === rating ? 0 : value, value)); container.append(button);
  }
}
function renderDraftStars() {
  mountStars($('#draft-stars'), draftRating, (value, focusValue) => {
    draftRating = value; renderDraftStars(); $(`#draft-stars [data-rating="${focusValue}"]`)?.focus({ preventScroll: true });
  }, '지금 조합');
}
function loadMetadata(item) { $('#combination-name').value = item.name; $('#combination-note').value = item.note || ''; draftRating = cleanRating(item.rating); renderDraftStars(); }
function renderSaved() {
  const list = $('#saved-combinations'); list.replaceChildren();
  $('#library-count').textContent = `${saved.length} / ${LIBRARY_LIMIT}`;
  const matches = selectSaved(saved, { search: $('#library-search').value, favorites: $('#library-favorites').checked, sort: $('#library-sort').value });
  $('#library-status').textContent = savedReadFailed ? '기존 보관함을 읽지 못했어요. 원본을 덮어쓰지 않도록 저장을 멈췄어요.' : saved.length ? `${saved.length}개 중 ${matches.length}개 · 별점은 같은 별을 다시 누르면 지워져요.` : '';
  $('#library-more').hidden = matches.length <= visibleSavedCount;
  $('#library-more').textContent = `조합 더 보기 (${Math.max(0, matches.length - visibleSavedCount)}개)`;
  if (!matches.length) { list.append(node('li', 'saved-empty', saved.length ? '조건에 맞는 조합이 없어요.' : '마음에 드는 첫 조합을 보관해 보세요.')); return; }
  matches.slice(0, visibleSavedCount).forEach(item => {
    const li = node('li', 'saved-card'); li.dataset.savedId = item.id;
    const heading = node('div', 'saved-card-heading'), open = node('button', 'saved-open'); open.type = 'button';
    open.append(node('strong', '', item.name), node('span', '', '불러오기 ↗'));
    open.addEventListener('click', () => { loadMetadata(item); apply(item.composition, { section: 'top', replayOpening: true }); notify(`‘${item.name}’ 조합을 불러왔어요.`); });
    heading.append(open); li.append(heading);
    const summary = node('p', 'saved-style', globalKeys.map(key => CHOICES[key].find(choice => choice.id === item.composition[key]).label).join(' · ')); li.append(summary);
    const stars = node('div', 'rating-stars'); stars.setAttribute('role', 'group'); stars.setAttribute('aria-label', `${item.name} 별점`);
    mountStars(stars, item.rating, (rating, focusValue) => {
      if (persistSaved(updateSaved(saved, item.id, { rating }))) {
        const updated = [...list.children].find(el => el.dataset.savedId === item.id);
        (updated?.querySelector(`[data-rating="${focusValue}"]`) || $('#library-favorites')).focus({ preventScroll: true });
        notify(rating ? `‘${item.name}’에 별 ${rating}개를 남겼어요.` : '별점을 지웠어요. 조합은 그대로 보관돼요.');
      }
    }, item.name); li.append(stars);
    if (item.note) li.append(node('p', 'saved-note', item.note));
    const details = node('details', 'saved-details'); details.append(node('summary', '', '조합 내용 보기'));
    details.append(node('p', '', keys.filter(key => !globalKeys.includes(key)).map(key => `${labels[key]}: ${CHOICES[key].find(choice => choice.id === item.composition[key]).label}`).join(' · ')), node('p', 'saved-order', orderLabel(item.composition.order))); li.append(details);
    const actions = node('div', 'saved-actions'), edit = node('button', '', '이름·메모 수정'), exportButton = node('button', '', '파일 ↓'), remove = node('button', 'delete-saved', '삭제');
    edit.type = exportButton.type = remove.type = 'button';
    edit.setAttribute('aria-label', `${item.name} 이름과 메모 수정`);
    edit.addEventListener('click', () => { editingRecordId = item.id; $('#saved-edit-name').value = item.name; $('#saved-edit-note').value = item.note; $('#saved-edit-dialog').showModal(); });
    exportButton.setAttribute('aria-label', `${item.name} 파일로 내보내기`); exportButton.addEventListener('click', () => downloadJSON(exportSelection(item.composition, item), 'sungso-wedding-combination.json'));
    remove.setAttribute('aria-label', `${item.name} 저장된 조합 삭제`);
    remove.addEventListener('click', () => {
      if (remove.dataset.confirm !== 'true') { remove.dataset.confirm = 'true'; remove.textContent = '삭제 확인'; remove.setAttribute('aria-label', `${item.name} 정말 삭제`); return; }
      if (persistSaved(saved.filter(record => record.id !== item.id))) { notify('저장된 조합을 삭제했어요. 지금 보는 조합은 그대로예요.'); $('#save-combination').focus({ preventScroll: true }); }
    });
    actions.append(edit, exportButton, remove); li.append(actions); list.append(li);
  });
}
function downloadJSON(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = node('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function copyURL(kind) {
  const url = urlFor(kind);
  try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(url); notify(kind === 'editor' ? '조립 화면 주소를 복사했어요.' : '선택한 조합의 미리보기 주소를 복사했어요.'); }
  catch { $('#link-value').value = url; $('#fallback-link').href = url; $('#link-dialog').showModal(); $('#link-value').focus(); $('#link-value').select(); }
}
mountChoices(); mountOrder(); renderChoices(); renderSaved(); renderDraftStars();
const initial = new URL('./preview/', location.href); initial.search = compositionParams(composition).toString(); initial.searchParams.set('compare', '1'); frame.src = initial.href;
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') return;
  if (event.data.type === 'invitation-studio:ready') {
    motionReady = event.data.motionReady !== false;
    if (!motionReady) { ready = false; $('#preview-status').textContent = '장면 효과를 불러오지 못했어요. 처음부터 보기로 다시 시도해 주세요.'; $('#preview-status').classList.remove('is-ready'); return; }
    ready = true; post({ type: 'invitation-studio:apply', composition });
    post({ type: 'invitation-lab:control', action: 'audio', enabled: audioEnabled });
  } else if (event.data.type === 'invitation-studio:applied') {
    if (!sameComposition(normalizeComposition(event.data.composition), composition)) return;
    ready = true;
    const reviewed = pendingJump?.reviewKey;
    $('#preview-status').textContent = reviewed ? `${labels[reviewed]} · ${CHOICES[reviewed].find(choice => choice.id === composition[reviewed]).label} 적용했어요.` : '선택한 조합이 연결되어 있어요.';
    $('#preview-status').classList.add('is-ready');
    if (pendingJump) { const destination = pendingJump; pendingJump = undefined; post({ type: 'invitation-studio:jump', ...destination }); }
  } else if (event.data.type === 'invitation-lab:audio-state') {
    // A newly reloaded child first reports paused; keep the requested music choice until its ready handshake.
    renderAudioState(event.data.phase || (event.data.playing === true ? 'playing' : 'paused'), { syncIntent: ready, announce: ready });
  }
});
frame.addEventListener('load', () => { if (ready) post({ type: 'invitation-studio:apply', composition }); });
window.addEventListener('popstate', () => apply(readComposition(location.search), { remember: false }));
document.querySelectorAll('.mobile-view [data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
document.querySelectorAll('[data-jump]').forEach(button => button.addEventListener('click', () => jump(button.dataset.jump, true)));
document.querySelectorAll('[data-width]').forEach(button => {
  if (button.tagName !== 'BUTTON') return;
  button.addEventListener('click', () => { $('.preview-stage').dataset.width = button.dataset.width; document.querySelectorAll('.width-switch button').forEach(item => item.setAttribute('aria-pressed', String(item === button))); });
});
$('#save-combination').addEventListener('click', () => {
  const name = cleanName($('#combination-name').value) || `우리의 조합 ${saved.length + 1}`;
  if (saved.length >= LIBRARY_LIMIT) { notify(`최대 ${LIBRARY_LIMIT}개까지 보관할 수 있어요. 기존 조합은 지우지 않았어요. 파일로도 보관할 수 있어요.`); return; }
  const now = Date.now();
  if (persistSaved([{ id: crypto.randomUUID(), name, rating: draftRating, note: cleanNote($('#combination-note').value), createdAt: now, updatedAt: now, composition: normalizeComposition(composition) }, ...saved])) { $('#combination-name').value = name; notify(`‘${name}’ 조합과 별점·메모를 이 브라우저에 저장했어요.`); }
});
for (const id of ['#library-search', '#library-sort', '#library-favorites']) $(id).addEventListener(id === '#library-search' ? 'input' : 'change', () => { visibleSavedCount = 6; renderSaved(); });
$('#library-more').addEventListener('click', () => { visibleSavedCount += 6; renderSaved(); });
$('#close-saved-edit').addEventListener('click', () => $('#saved-edit-dialog').close());
$('#saved-edit-dialog').addEventListener('close', () => {
  if (document.activeElement && document.activeElement !== document.body && !$('#saved-edit-dialog').contains(document.activeElement)) return;
  const card = [...$('#saved-combinations').children].find(el => el.dataset.savedId === editingRecordId);
  (card?.querySelector('.saved-open') || $('#save-combination')).focus({ preventScroll: true });
});
$('#save-record-meta').addEventListener('click', () => {
  const item = saved.find(entry => entry.id === editingRecordId); if (!item) return;
  if (persistSaved(updateSaved(saved, item.id, { name: cleanName($('#saved-edit-name').value) || item.name, note: cleanNote($('#saved-edit-note').value) }))) {
    $('#saved-edit-dialog').close();
    const card = [...$('#saved-combinations').children].find(el => el.dataset.savedId === item.id); (card?.querySelector('.saved-open') || $('#save-combination')).focus({ preventScroll: true });
    notify('이름과 메모를 저장했어요. 조합은 그대로예요.');
  }
});
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY) return;
  try { saved = parseLibrary(event.newValue); savedSnapshot = event.newValue; savedReadFailed = false; renderSaved(); }
  catch { savedReadFailed = true; renderSaved(); }
});
$('#undo-change').addEventListener('click', () => { if (history.length) { const prior = history.pop(); apply(prior, { remember: false }); notify('이전 선택으로 돌아갔어요.'); } });
$('#reset-combination').addEventListener('click', () => { apply(DEFAULT_COMPOSITION, { section: 'top', replayOpening: true }); notify('기본 조합으로 돌아갔어요. 저장해 둔 조합은 그대로예요.'); });
$('#copy-preview').addEventListener('click', () => copyURL('preview'));
$('#copy-editor').addEventListener('click', () => copyURL('editor'));
$('#replay-preview').addEventListener('click', () => { pendingJump = undefined; ready = false; $('#preview-status').textContent = '선택한 조합을 처음부터 다시 보여드려요.'; post({ type: 'invitation-lab:control', action: 'replay' }); });
$('#close-link').addEventListener('click', () => $('#link-dialog').close());
$('#audio-toggle').addEventListener('click', () => {
  audioEnabled = !(audioPhase === 'playing' || audioPhase === 'loading');
  renderAudioState(audioEnabled ? 'loading' : 'paused');
  post({ type: 'invitation-lab:control', action: 'audio', enabled: audioEnabled });
});
$('#export-combination').addEventListener('click', () => {
  downloadJSON(exportSelection(composition, { name: $('#combination-name').value, rating: draftRating, note: $('#combination-note').value }), 'sungso-wedding-combination.json');
  notify('조합과 별점·메모를 파일로 보관해요.');
});
$('#export-library').addEventListener('click', () => {
  if (savedReadFailed) { notify('보관함을 읽지 못해 내보내지 못했어요. 현재 조합 파일은 따로 저장할 수 있어요.'); return; }
  if (!saved.length) { notify('먼저 마음에 드는 조합을 저장해 주세요.'); return; }
  downloadJSON({ version: 1, kind: 'sungso-studio-library', items: saved }, 'sungso-wedding-library.json'); notify(`${saved.length}개 조합과 별점·메모를 파일로 보관해요.`);
});
$('#import-combination').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > LIBRARY_BYTES) throw new Error('size');
    const data = parseImport(await file.text());
    if (data.kind === 'library') {
      if (saved.length + data.items.length > LIBRARY_LIMIT) { notify(`모두 더하면 ${saved.length + data.items.length}개가 되어 40개를 넘어요. 기존 보관함은 그대로 두었어요.`); return; }
      const now = Date.now();
      if (persistSaved([...data.items.map(item => ({ ...item, id: crypto.randomUUID(), updatedAt: now })), ...saved])) notify(`${data.items.length}개 조합과 별점·메모를 보관함에 더했어요. 기존 조합은 유지했어요.`);
    } else {
      apply(data.composition, { section: 'top', replayOpening: true }); loadMetadata(data); notify('파일의 조합·별점·메모를 불러왔어요. 보관하려면 새로 저장을 눌러 주세요.');
    }
  } catch { notify('이 조립실에서 저장한 조합 또는 보관함 JSON 파일을 선택해 주세요.'); }
  finally { event.target.value = ''; }
});
window.addEventListener('pagehide', () => { clearTimeout(noticeTimer); cancelAnimationFrame(viewFrame); post({ type: 'invitation-lab:control', action: 'audio', enabled: false }); });
