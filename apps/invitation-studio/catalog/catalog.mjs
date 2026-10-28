import { CHOICES, CHOICE_KEYS, PRESETS, DEFAULT_COMPOSITION, DEFAULT_ORDER, ORDER_SECTIONS, SECTION_IDS, moveSection, normalizeComposition, readComposition, compositionParams, sameComposition } from './js/composition.mjs';
import runtime from './runtime.mjs';
import { APPEARANCE_PALETTES, APPEARANCE_FONTS } from './js/appearance.mjs';
import { LIBRARY_LIMIT, LIBRARY_BYTES, cleanName, cleanNote, cleanRating, parseLibrary, selectSaved, updateSaved, exportSelection, parseImport } from './js/saved-library.mjs';

const $ = selector => document.querySelector(selector);
const frame = $('#invitation-preview');
const STORAGE_KEY = 'sungso_invitation_studio_combinations_v1';
const labels = { palette: '색감', font: '글씨체', motion: '공통 스크롤 효과', cover: '첫 화면', opening: '첫 손글씨', intro: '초대글 · 가족 소개', date: '예식 날짜', story: '우리의 이야기', album: '사진첩', arrival: '오시는 길', gifting: '마음 전하실 곳', wishes: '축하의 편지', navigation: '빠른 메뉴' };
const keys = CHOICE_KEYS, globalKeys = ['palette', 'font', 'motion'], history = [], orderRows = new Map();
let composition = readComposition(location.search), ready = false, audioEnabled = false, noticeTimer, motionReady = true;
let audioPhase = 'paused';
let savedReadFailed = false, savedSnapshot = null, saved = readSaved(), visibleSavedCount = 6, draftRating = 0, editingRecordId;
let editorTab = 'style', openKey = 'motion', beforeVisible = false;
let requestSerial = 0, activeRequest = null, activeReviewKey = null, lastChange = null, demoPhase = 'idle';
const choiceRows = new Map(), optionStates = new Map(), tabScroll = new Map();
const sectionKeys = { invitation: 'intro', 'wedding-day': 'date', location: 'arrival', 'our-story': 'story', gallery: 'album', accounts: 'gifting', guestbook: 'wishes' };

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
  const scenes = $('#scene-controls');
  ['cover', 'opening', ...composition.order.map(id => sectionKeys[id])].forEach((key, index) => {
    const item = choiceRows.get(key); if (item && scenes.children[index] !== item) scenes.insertBefore(item, scenes.children[index] || null);
    const number = item?.querySelector('.choice-number'); if (number) number.textContent = index < 2 ? (index === 0 ? 'COVER' : 'OPENING') : String(index - 1).padStart(2, '0');
  });
  $('#preview-order').textContent = orderLabel(composition.order);
  $('#reset-order').disabled = composition.order.every((id, index) => id === DEFAULT_ORDER[index]);
}
function renderChoices() {
  for (const key of keys) {
    document.querySelectorAll(`input[name="${key}"]`).forEach(input => { input.checked = input.value === composition[key]; });
    const choice = CHOICES[key].find(item => item.id === composition[key]);
    const selected = $(`[data-current="${key}"]`); if (selected) selected.textContent = choice.label;
    const sample = $(`[data-choice="${key}"] .choice-mini`); if (sample) { sample.replaceChildren(makeSample(key, choice.id, true)); }
    choiceRows.get(key)?.querySelectorAll('[data-option]').forEach(button => { const selected = button.dataset.option === composition[key]; button.setAttribute('aria-pressed', String(selected)); button.querySelector('.current-marker').textContent = selected ? '선택 중' : '바로 보기'; });
  }
  document.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', String(sameComposition(composition, PRESETS.find(item => item.id === button.dataset.preset).composition))));
  $('#preview-summary').textContent = globalKeys.map(key => CHOICES[key].find(item => item.id === composition[key]).label).join(' · ');
  $('#preview-summary').title = keys.map(key => `${labels[key]}: ${CHOICES[key].find(item => item.id === composition[key]).label}`).join('\n');
  $('#undo-change').disabled = history.length === 0;
  renderOrder();
  updateURL();
}
function previewLabel(key, value = composition[key]) { return `${labels[key]} · ${CHOICES[key].find(choice => choice.id === value)?.label || ''}`; }
function renderDemoTools() {
  $('#replay-scene').disabled = !activeReviewKey;
  $('#compare-choice').disabled = !lastChange || activeReviewKey !== lastChange.key;
  $('#compare-choice').setAttribute('aria-pressed', String(beforeVisible));
  $('#compare-choice').textContent = beforeVisible ? '현재 선택 보기' : '변경 전 보기';
  $('#stop-demo').disabled = !['preparing', 'playing'].includes(demoPhase);
  document.body.dataset.demoPhase = demoPhase;
  $('#demo-label').textContent = activeReviewKey ? `${beforeVisible ? '변경 전 · ' : ''}${previewLabel(activeReviewKey, activeRequest?.composition[activeReviewKey] || composition[activeReviewKey])}` : '원하는 표현을 선택해 보세요';
}
function requestPreview(value, { key, section, replayOpening = false, previewOnly = false } = {}) {
  if (activeRequest) post({ type: 'invitation-studio:demo-stop', requestId: activeRequest.requestId });
  const requestId = ++requestSerial;
  activeRequest = { requestId, composition: normalizeComposition(value), key, section, replayOpening, previewOnly, sentDemo: false };
  demoPhase = key ? 'preparing' : 'idle';
  renderDemoTools();
  if (key) $('#preview-status').textContent = `${labels[key]}를 준비하고 있어요.`;
  if (ready) post({ type: 'invitation-studio:apply', composition: activeRequest.composition, requestId, previewOnly });
}
function stopDemo() {
  if (!activeRequest) return;
  post({ type: 'invitation-studio:demo-stop', requestId: activeRequest.requestId });
  activeRequest.key = null; activeRequest.section = null;
  demoPhase = 'cancelled'; renderDemoTools();
  $('#preview-status').textContent = '자동 시연을 멈췄어요. 직접 내려보셔도 좋아요.';
}
function restoreCurrent() {
  if (beforeVisible) { beforeVisible = false; requestPreview(composition); }
  else stopDemo();
}
function apply(next, { section, replayOpening = false, reviewKey, remember = true } = {}) {
  const normalized = normalizeComposition(next), previous = normalizeComposition(composition);
  const changed = keys.filter(key => composition[key] !== normalized[key]);
  if (!reviewKey && changed.length) reviewKey = changed.includes('opening') ? 'opening' : changed[0];
  if (!section && reviewKey) section = SECTION_IDS[reviewKey];
  if (!section && composition.order.some((id, index) => id !== normalized.order[index])) section = normalized.order.find((id, index) => id !== composition.order[index]);
  if (!sameComposition(composition, normalized) && remember) { history.push(previous); if (history.length > 30) history.shift(); }
  if (reviewKey && changed.includes(reviewKey)) lastChange = { key: reviewKey, before: previous[reviewKey] };
  else if (changed.length !== 0 || (!reviewKey && section)) lastChange = null;
  beforeVisible = false; composition = normalized;
  activeReviewKey = reviewKey || (replayOpening ? 'opening' : null);
  renderChoices(); renderDemoTools();
  requestPreview(composition, { key: activeReviewKey, section, replayOpening });
}
function setEditorTab(tab) {
  if (!['style', 'scenes', 'library'].includes(tab)) return;
  restoreCurrent();
  const content = $('#editor-content'); tabScroll.set(editorTab, content.scrollTop); editorTab = tab;
  document.body.dataset.tab = tab;
  document.querySelectorAll('.editor-tabs [data-tab]').forEach(button => {
    const selected = button.dataset.tab === tab; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
  });
  content.scrollTop = tabScroll.get(tab) || 0;
}
function makeSample(key, value, mini = false) {
  const sample = node('span', mini ? 'choice-sample is-mini' : 'choice-sample'); sample.dataset.sample = key; sample.dataset.variant = value; sample.setAttribute('aria-hidden', 'true');
  if (key === 'palette') {
    const colors = APPEARANCE_PALETTES[value]; sample.style.background = colors.soft; sample.style.color = colors.accent;
    sample.append(node('span', 'sample-script', 'With love'), node('span', 'sample-caption', '성우 & 소희'));
    const swatches = node('span', 'sample-swatches'); for (const color of [colors.paper, colors.soft, colors.accent]) { const dot = node('i'); dot.style.background = color; swatches.append(dot); } sample.append(swatches);
  } else if (key === 'font') {
    const font = APPEARANCE_FONTS[value]; sample.style.fontFamily = `${font.body}, serif`; sample.style.fontWeight = font.bodyWeight;
    sample.append(node('span', 'sample-names', mini ? '성우' : '성우와 소희'), node('span', 'sample-caption', '함께해 주실 소중한 분들을 초대해요.'), node('span', 'sample-date', '2027. 03. 06'));
  } else if (['cover', 'opening', 'story', 'album', 'motion'].includes(key)) {
    const sources = key === 'album' ? runtime.photos.slice(0, 3) : [runtime.photos[key === 'story' ? 1 : 0]];
    sources.filter(Boolean).forEach(photo => { const image = node('img'); image.src = new URL(photo.thumb || photo.src, new URL('./preview/', location.href)).href; image.alt = ''; image.loading = 'lazy'; image.width = photo.width || 640; image.height = photo.height || 960; sample.append(image); });
    sample.append(node('span', 'sample-script', key === 'motion' ? 'With love' : key === 'story' ? 'Our story' : key === 'album' ? 'Our moments' : 'We are getting married'));
  } else if (key === 'intro') {
    sample.append(node('span', 'sample-script', 'With love'), node('span', 'sample-names', '성우 & 소희'), node('span', 'sample-caption', '저희 두 사람, 결혼합니다.'));
  } else if (key === 'date') {
    sample.append(node('span', 'sample-date', '03. 06'), node('span', 'sample-caption', '2027 · 토요일 오후 3시 30분'));
  } else if (key === 'arrival') {
    sample.append(node('span', 'sample-script', 'Meet us here'), node('span', 'sample-names', '목화웨딩홀'), node('span', 'sample-caption', '부산 · 15층 벨리스홀'));
  } else if (key === 'gifting') {
    sample.append(node('span', 'sample-script', 'For you'), node('span', 'sample-names', '신랑 성우'), node('span', 'sample-caption', '예시은행 000-000-0001'));
  } else if (key === 'wishes') {
    sample.append(node('span', 'sample-script', 'A little note'), node('span', 'sample-caption', '두 사람에게 전하는 축하 한마디'));
  } else {
    sample.append(node('span', 'sample-caption', '예식　 길찾기　 사진'), node('span', 'sample-script', 'Always with you'));
  }
  if (key === 'motion' && !mini) sample.append(node('span', 'sample-motion-kind', {
    signature: '장면 고유 연출', rise: '아래 → 위', focus: '작게 · 흐림 → 크게 · 선명',
    drift: '양옆 → 가운데', unveil: '커튼 · 왼쪽 → 오른쪽', breathe: '크게 → 작게', still: '움직임 없음',
  }[value]));
  return sample;
}
function syncExpanded() {
  choiceRows.forEach((row, key) => {
    const expanded = key === openKey;
    row.classList.toggle('is-expanded', expanded); row.querySelector('.choice-open').setAttribute('aria-expanded', String(expanded)); row.querySelector('.inline-options').hidden = !expanded;
  });
}
function renderOptions(key) {
  const row = choiceRows.get(key), state = optionStates.get(key), list = row.querySelector('.choice-options');
  const matches = CHOICES[key].filter(choice => `${choice.label} ${choice.detail}`.toLocaleLowerCase('ko').includes(state.search.toLocaleLowerCase('ko')));
  list.replaceChildren();
  matches.slice(0, state.limit).forEach(choice => {
    const button = node('button', 'choice-option'); button.type = 'button'; button.dataset.option = choice.id;
    button.setAttribute('aria-label', `${choice.label} 선택`); button.setAttribute('aria-pressed', String(composition[key] === choice.id));
    button.append(makeSample(key, choice.id), node('strong', '', choice.label), node('small', '', choice.detail), node('span', 'current-marker', composition[key] === choice.id ? '선택 중' : '바로 보기'));
    button.addEventListener('click', () => { apply({ ...composition, [key]: choice.id }, { reviewKey: key, section: SECTION_IDS[key] }); });
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const buttons = [...list.children], index = buttons.indexOf(button);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus({ preventScroll: true });
    });
    list.append(button);
  });
  row.querySelector('.options-empty').hidden = matches.length > 0;
  const more = row.querySelector('.options-more'); more.hidden = matches.length <= state.limit; more.textContent = `표현 더 보기 (${Math.max(0, matches.length - state.limit)}개)`;
}
function mountChoices() {
  keys.forEach(key => {
    const container = $(globalKeys.includes(key) ? '#global-controls' : key === 'navigation' ? '#navigation-controls' : '#scene-controls');
    const group = node('section', 'choice-row'); group.dataset.choice = key;
    const button = node('button', 'choice-open'); button.type = 'button'; button.setAttribute('aria-controls', `options-${key}`); button.setAttribute('aria-label', `${labels[key]} 고르기`);
    const sample = node('span', 'choice-mini'), text = node('span', 'choice-row-text'), selected = node('small'); selected.dataset.current = key;
    const number = node('span', 'choice-number', globalKeys.includes(key) ? 'STYLE' : 'SCENE');
    text.append(number, node('strong', '', labels[key]), selected);
    const count = node('span', 'choice-count', `${CHOICES[key].length}가지`); count.append(node('span', 'expand-symbol', '＋'));
    button.append(sample, text, count); button.addEventListener('click', () => { const scroll = $('#editor-content'), oldTop = group.getBoundingClientRect().top; restoreCurrent(); openKey = openKey === key ? null : key; syncExpanded(); scroll.scrollTop += group.getBoundingClientRect().top - oldTop; if (openKey) { activeReviewKey = key; requestPreview(composition, { key }); } });
    const content = node('div', 'inline-options'); content.id = `options-${key}`;
    content.append(node('p', 'inline-hint', key === 'motion'
      ? '같은 초대글과 날짜 구간에서 비교해요. 방향·크기·초점의 차이를 봐주세요.'
      : '표현을 누르면 실제 장면이 바로 재생돼요.'));
    optionStates.set(key, { search: '', limit: 6 });
    if (CHOICES[key].length > 6) {
      const search = node('input', 'options-search'); search.type = 'search'; search.placeholder = '이름이나 느낌 찾기'; search.setAttribute('aria-label', `${labels[key]} 표현 검색`);
      search.addEventListener('input', () => { optionStates.get(key).search = search.value.trim(); optionStates.get(key).limit = 6; renderOptions(key); }); content.append(search);
    }
    const options = node('div', 'choice-options'); options.setAttribute('role', 'group'); options.setAttribute('aria-label', `${labels[key]} 표현`);
    const empty = node('p', 'options-empty', '맞는 표현이 없어요. 다른 단어로 찾아보세요.'), more = node('button', 'options-more', '표현 더 보기'); more.type = 'button'; more.addEventListener('click', () => { optionStates.get(key).limit += 6; renderOptions(key); });
    content.append(options, empty, more); group.append(button, content); container.append(group); choiceRows.set(key, group); renderOptions(key);
  });
  PRESETS.forEach(preset => {
    const button = node('button', 'preset'); button.dataset.preset = preset.id; button.type = 'button';
    button.append(node('strong', '', preset.label), node('small', '', preset.detail));
    button.addEventListener('click', () => { apply(preset.composition, { section: 'top', replayOpening: true, reviewKey: 'opening' }); notify('추천 조합으로 바꿨어요. 하나씩 다시 골라도 좋아요.'); }); $('#presets').append(button);
  });
  syncExpanded();
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
  $('#library-count').textContent = `${saved.length} / ${LIBRARY_LIMIT}`; $('#saved-tab-count').textContent = String(saved.length);
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
  restoreCurrent();
  const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = node('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function copyURL(kind) {
  restoreCurrent();
  const url = urlFor(kind);
  try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(url); notify(kind === 'editor' ? '조립 화면 주소를 복사했어요.' : '선택한 조합의 미리보기 주소를 복사했어요.'); }
  catch { $('#link-value').value = url; $('#fallback-link').href = url; $('#link-dialog').showModal(); $('#link-value').focus(); $('#link-value').select(); }
}
mountChoices(); mountOrder(); renderChoices(); renderSaved(); renderDraftStars(); renderDemoTools();
const initial = new URL('./preview/', location.href); initial.search = compositionParams(composition).toString(); initial.searchParams.set('compare', '1'); frame.src = initial.href;
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') return;
  const data = event.data;
  if (data.type === 'invitation-studio:ready') {
    motionReady = data.motionReady !== false;
    if (!motionReady) { ready = false; $('#preview-status').textContent = '장면을 준비하지 못했어요. 처음부터 보기로 다시 시도해 주세요.'; return; }
    ready = true;
    if (activeRequest) post({ type: 'invitation-studio:apply', composition: activeRequest.composition, requestId: activeRequest.requestId, previewOnly: activeRequest.previewOnly });
    else requestPreview(composition);
    post({ type: 'invitation-lab:control', action: 'audio', enabled: audioEnabled });
  } else if (data.type === 'invitation-studio:applied') {
    if (!activeRequest || data.requestId !== activeRequest.requestId || !sameComposition(normalizeComposition(data.composition), activeRequest.composition)) return;
    ready = true; $('#preview-status').classList.add('is-ready');
    if (activeRequest.sentDemo) return;
    activeRequest.sentDemo = true;
    if (activeRequest.key) post({ type: 'invitation-studio:demo', requestId: activeRequest.requestId, key: activeRequest.key });
    else if (activeRequest.section) { post({ type: 'invitation-studio:jump', section: activeRequest.section, replayOpening: activeRequest.replayOpening }); $('#preview-status').textContent = '선택한 순서를 반영했어요.'; }
    else $('#preview-status').textContent = '현재 조합이 연결되어 있어요.';
  } else if (data.type === 'invitation-studio:demo-state') {
    if (!activeRequest || data.requestId !== activeRequest.requestId || (data.key && data.key !== activeRequest.key) || !['preparing', 'playing', 'complete', 'cancelled', 'static', 'blocked'].includes(data.phase)) return;
    if (data.phase === 'cancelled') { activeRequest.key = null; activeRequest.section = null; }
    demoPhase = data.phase; renderDemoTools();
    const status = { preparing: '장면을 준비하고 있어요.', playing: '실제 장면을 보여드리고 있어요. 직접 조작하면 멈춰요.', complete: '이 장면을 확인했어요. 다른 표현도 골라 보세요.', cancelled: '시연을 멈췄어요. 직접 살펴보셔도 좋아요.', static: '움직임을 줄인 상태로 보여드려요.', blocked: '열려 있는 창을 닫은 뒤 다시 보기를 눌러 주세요.' };
    $('#preview-status').textContent = data.phase === 'static' && data.reason === 'appearance'
      ? '같은 장면에서 색감과 글씨체를 비교해 보세요.' : status[data.phase];
  } else if (data.type === 'invitation-lab:audio-state') renderAudioState(data.phase || (data.playing === true ? 'playing' : 'paused'), { syncIntent: ready, announce: ready });
});
window.addEventListener('popstate', () => apply(readComposition(location.search), { remember: false }));
document.querySelectorAll('.editor-tabs [data-tab]').forEach(button => {
  button.addEventListener('click', () => setEditorTab(button.dataset.tab));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const tabs = [...document.querySelectorAll('.editor-tabs [data-tab]')], index = tabs.indexOf(button);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setEditorTab(tabs[next].dataset.tab); tabs[next].focus({ preventScroll: true });
  });
});
$('#toggle-order').addEventListener('click', () => { const expanded = $('#toggle-order').getAttribute('aria-expanded') !== 'true'; $('#toggle-order').setAttribute('aria-expanded', String(expanded)); $('#order-editor').hidden = !expanded; });
$('#panel-toggle').addEventListener('click', () => { const expanded = document.body.dataset.panel !== 'expanded'; document.body.dataset.panel = expanded ? 'expanded' : 'collapsed'; $('#panel-toggle').setAttribute('aria-expanded', String(expanded)); $('#panel-label').textContent = expanded ? '선택 패널 접기' : '선택 패널 펼치기'; });
$('#go-save').addEventListener('click', () => { setEditorTab('library'); document.body.dataset.panel = 'expanded'; $('#panel-toggle').setAttribute('aria-expanded', 'true'); $('#panel-label').textContent = '선택 패널 접기'; $('#editor-content').scrollTop = 0; $('#combination-name').focus({ preventScroll: true }); });
$('#replay-scene').addEventListener('click', () => { if (!activeReviewKey) return; const shown = beforeVisible && lastChange ? { ...composition, [lastChange.key]: lastChange.before } : composition; requestPreview(shown, { key: activeReviewKey, previewOnly: beforeVisible }); });
$('#compare-choice').addEventListener('click', () => { if (!lastChange || lastChange.key !== activeReviewKey) return; beforeVisible = !beforeVisible; requestPreview(beforeVisible ? { ...composition, [lastChange.key]: lastChange.before } : composition, { key: activeReviewKey, previewOnly: beforeVisible }); });
$('#stop-demo').addEventListener('click', stopDemo);
// Editing gestures take precedence, including while a preview waits for fonts.
for (const type of ['wheel', 'touchstart', 'keydown']) $('.edit-panel').addEventListener(type, event => {
  if (event.isTrusted && ['preparing', 'playing'].includes(demoPhase)) stopDemo();
}, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) restoreCurrent(); });

document.querySelectorAll('[data-width]').forEach(button => {
  if (button.tagName !== 'BUTTON') return;
  button.addEventListener('click', () => { $('.preview-stage').dataset.width = button.dataset.width; document.querySelectorAll('.width-switch button').forEach(item => item.setAttribute('aria-pressed', String(item === button))); });
});
$('#save-combination').addEventListener('click', () => {
  restoreCurrent();
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
$('#open-preview').addEventListener('click', restoreCurrent);
$('#copy-editor').addEventListener('click', () => copyURL('editor'));
$('#replay-preview').addEventListener('click', () => { beforeVisible = false; activeReviewKey = 'opening'; requestPreview(composition, { key: 'opening' }); });
$('#close-link').addEventListener('click', () => $('#link-dialog').close());
$('#audio-toggle').addEventListener('click', () => {
  audioEnabled = !(audioPhase === 'playing' || audioPhase === 'loading');
  renderAudioState(audioEnabled ? 'loading' : 'paused');
  post({ type: 'invitation-lab:control', action: 'audio', enabled: audioEnabled });
});
$('#export-combination').addEventListener('click', () => {
  restoreCurrent();
  downloadJSON(exportSelection(composition, { name: $('#combination-name').value, rating: draftRating, note: $('#combination-note').value }), 'sungso-wedding-combination.json');
  notify('조합과 별점·메모를 파일로 보관해요.');
});
$('#export-library').addEventListener('click', () => {
  restoreCurrent();
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
window.addEventListener('pagehide', () => { restoreCurrent(); clearTimeout(noticeTimer); post({ type: 'invitation-lab:control', action: 'audio', enabled: false }); });
