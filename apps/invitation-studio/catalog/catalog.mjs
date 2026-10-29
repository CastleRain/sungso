import { CHOICES, CHOICE_KEYS, PRESETS, DEFAULT_COMPOSITION, DEFAULT_ORDER, ORDER_SECTIONS, OPTIONAL_SECTIONS, SECTION_IDS, moveSection, normalizeComposition, readComposition, compositionParams, sameComposition } from './js/composition.mjs';
import runtime from './runtime.mjs';
import { readSectionTuning, setSectionTuning } from './js/fine-tuning.mjs';
import { mountGuidedSteps } from './guided-steps.mjs';
import { mountContentEditor } from './js/content-editor.mjs';
import { mountLivePhotoManager } from './js/live-photo-manager.mjs';
import { APPEARANCE_PALETTES, APPEARANCE_FONTS } from './js/appearance.mjs';
import { LIBRARY_LIMIT, LIBRARY_BYTES, cleanName, cleanNote, cleanRating, parseLibrary, selectSaved, updateSaved, exportSelection, parseImport } from './js/saved-library.mjs';

const $ = selector => document.querySelector(selector);
const frame = $('#invitation-preview');
const STORAGE_KEY = 'sungso_invitation_studio_combinations_v1';
const labels = { palette: '색감', font: '글씨체', textSize: '글자 크기', lineSpace: '문장 사이 여유', photoTone: '사진의 색감', coverFocus: '표지 사진 구도', albumColumns: '사진첩 열 수', albumRatio: '사진의 비율', ending: '마지막 장면', calendarMark: '달력의 날짜 표시', motion: '공통 스크롤 효과', spacing: '읽는 여백', divider: '장면 사이의 연결', motionSpeed: '스크롤 속도', motionStrength: '스크롤 강도', cover: '첫 화면', opening: '첫 손글씨', intro: '초대글 · 가족 소개', date: '예식 날짜', story: '우리의 이야기', album: '사진첩', arrival: '오시는 길', gifting: '마음 전하실 곳', wishes: '축하의 편지', navigation: '빠른 메뉴', ...Object.fromEntries(OPTIONAL_SECTIONS.map(section => [section.key, section.label])) };
const keys = CHOICE_KEYS, tuningKeys = ['motionSpeed', 'motionStrength'], globalKeys = ['palette', 'font', 'textSize', 'lineSpace', 'photoTone', 'motion', 'spacing', 'divider'], history = [], orderRows = new Map();
const detailChildren = { cover: ['coverFocus'], date: ['calendarMark'], album: ['albumColumns', 'albumRatio'] };
const detailParents = Object.fromEntries(Object.entries(detailChildren).flatMap(([parent, children]) => children.map(key => [key, parent])));
const styleGroups = { all: globalKeys, type: ['palette', 'font', 'textSize', 'lineSpace'], photo: ['photoTone'], motion: ['motion', 'spacing', 'divider'] };
let styleGroup = 'all';
let guidedSteps, contentEditor, livePhotoManager, contentEditTimer;
let composition = readComposition(location.search), ready = false, audioEnabled = false, noticeTimer, motionReady = true;
let audioPhase = 'paused';
let savedReadFailed = false, savedSnapshot = null, saved = readSaved(), visibleSavedCount = 6, draftRating = 0, editingRecordId;
let editorTab = 'style', openKey = null, beforeVisible = false;
let requestSerial = 0, activeRequest = null, activeReviewKey = null, lastChange = null, demoPhase = 'idle';
const choiceRows = new Map(), optionStates = new Map(), tabScroll = new Map();
const fineControls = [];
const sectionKeys = { invitation: 'intro', 'wedding-day': 'date', location: 'arrival', 'our-story': 'story', gallery: 'album', accounts: 'gifting', guestbook: 'wishes', ...Object.fromEntries(OPTIONAL_SECTIONS.map(section => [section.id, section.key])) };

function tuningSummary(value) { return `속도 ${Number(value.motionSpeed ?? 1).toFixed(2)}× · 강도 ${Number(value.motionStrength ?? 1).toFixed(2)}×`; }
function visibleChoice(key, value) { const extra = OPTIONAL_SECTIONS.find(section => section.key === key); return !extra || value.extras.includes(extra.id); }
function orderForPreset(value, preset) {
  const sequences = { default: DEFAULT_ORDER, guidance: ['invitation', 'wedding-day', 'location', 'accounts', 'our-story', 'gallery', 'guestbook'], photos: ['invitation', 'gallery', 'our-story', 'wedding-day', 'location', 'accounts', 'guestbook'] };
  const base = sequences[preset] || DEFAULT_ORDER; let index = 0;
  // Optional scenes keep their current slots; shortcuts only reorder the seven essentials.
  return value.order.map(id => DEFAULT_ORDER.includes(id) ? base[index++] : id);
}
function comparisonComposition(value, change) { return change ? normalizeComposition({ ...value, [change.field || change.key]: change.before }) : value; }

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
  for (const [id, row] of orderRows) if (!composition.order.includes(id)) row.remove();
  composition.order.forEach((id, index) => {
    const row = orderRows.get(id); if (!row) return;
    row.querySelector('.order-number').textContent = String(index + 1).padStart(2, '0');
    const select = row.querySelector('select');
    if (select.options.length !== composition.order.length) {
      select.replaceChildren(); composition.order.forEach((_, position) => { const option = node('option', '', `${position + 1}번째`); option.value = String(position); select.append(option); });
    }
    select.value = String(index);
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
  choiceRows.forEach((row, key) => { row.hidden = !visibleChoice(key, composition); });
  ['cover', 'opening', ...composition.order.map(id => sectionKeys[id])].flatMap(key => [key, ...(detailChildren[key] || [])]).forEach((key, index) => {
    const item = choiceRows.get(key); if (item && scenes.children[index] !== item) scenes.insertBefore(item, scenes.children[index] || null);
    const number = item?.querySelector('.choice-number'); if (number) number.textContent = detailParents[key] ? 'DETAIL' : key === 'cover' ? 'COVER' : key === 'opening' ? 'OPENING' : String(composition.order.indexOf(SECTION_IDS[key]) + 1).padStart(2, '0');
  });
  syncChoiceVisibility();
  $('#preview-order').textContent = orderLabel(composition.order);
  $('#reset-order').disabled = composition.order.every((id, index) => id === orderForPreset(composition, 'default')[index]);
  document.querySelectorAll('[data-order-preset]').forEach(button => button.setAttribute('aria-pressed', String(composition.order.every((id, index) => id === orderForPreset(composition, button.dataset.orderPreset)[index]))));
  document.querySelectorAll('[data-extra]').forEach(input => { input.checked = composition.extras.includes(input.dataset.extra); input.closest('.extra-choice').classList.toggle('is-selected', input.checked); });
  $('#extra-count').textContent = composition.extras.length ? `${composition.extras.length}개 추가됨` : '선택 사항';
}
function renderChoices() {
  const global = $('#global-controls');
  globalKeys.forEach((key, index) => { const row = choiceRows.get(key); if (row && global.children[index] !== row) global.insertBefore(row, global.children[index] || null); });
  for (const key of keys) {
    document.querySelectorAll(`input[name="${key}"]`).forEach(input => { input.checked = input.value === composition[key]; });
    const choice = CHOICES[key].find(item => item.id === composition[key]);
    const selected = $(`[data-current="${key}"]`); if (selected) selected.textContent = choice.label;
    const sample = $(`[data-choice="${key}"] .choice-mini`); if (sample) { sample.replaceChildren(makeSample(key, choice.id, true)); }
    choiceRows.get(key)?.querySelectorAll('[data-option]').forEach(button => { const selected = button.dataset.option === composition[key]; button.setAttribute('aria-pressed', String(selected)); button.querySelector('.current-marker').textContent = selected ? '선택 중' : '바로 보기'; });
  }
  document.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', String(sameComposition(composition, PRESETS.find(item => item.id === button.dataset.preset).composition))));
  $('#preview-summary').textContent = [...globalKeys.map(key => CHOICES[key].find(item => item.id === composition[key]).label), `글자 ${Math.round(composition.textScale * 100)}%`, tuningSummary(composition)].join(' · ');
  $('#preview-summary').title = [...keys.filter(key => visibleChoice(key, composition)).map(key => `${labels[key]}: ${CHOICES[key].find(item => item.id === composition[key]).label}`), tuningSummary(composition)].join('\n');
  $('#undo-change').disabled = history.length === 0;
  renderTuning();
  renderTextScale();
  renderFineControls();
  renderOrder();
  guidedSteps?.refresh();
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
  const shown = activeRequest?.composition || composition;
  $('#demo-label').textContent = activeReviewKey ? `${beforeVisible ? '변경 전 · ' : ''}${previewLabel(activeReviewKey, shown[activeReviewKey])}${activeReviewKey === 'motion' ? ` · ${tuningSummary(shown)}` : ''}` : '원하는 표현을 선택해 보세요';
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
function apply(next, { section, replayOpening = false, reviewKey, changedField, remember = true } = {}) {
  const normalized = normalizeComposition(next), previous = normalizeComposition(composition);
  const changed = [...keys, ...tuningKeys, 'textScale', 'lineScale', 'sectionSpace', 'sectionTuning'].filter(key => composition[key] !== normalized[key]);
  if (!reviewKey && changed.length) reviewKey = changed.includes('opening') ? 'opening' : tuningKeys.includes(changed[0]) ? 'motion' : ({textScale:'textSize',lineScale:'lineSpace',sectionSpace:'spacing',sectionTuning:'intro'}[changed[0]] || changed[0]);
  if (!section && reviewKey) section = SECTION_IDS[reviewKey];
  if (!section && composition.order.some((id, index) => id !== normalized.order[index])) section = normalized.order.find((id, index) => id !== composition.order[index]);
  if (!sameComposition(composition, normalized) && remember) { history.push(previous); if (history.length > 30) history.shift(); }
  const field = changedField || (changed.includes(reviewKey) ? reviewKey : changed.length === 1 ? changed[0] : null);
  if (reviewKey && field && changed.includes(field)) lastChange = { key: reviewKey, field, before: previous[field] };
  else if (changed.length !== 0 || (!reviewKey && section) || composition.extras.join(',') !== normalized.extras.join(',')) lastChange = null;
  beforeVisible = false; composition = normalized;
  activeReviewKey = reviewKey || (replayOpening ? 'opening' : null);
  renderChoices(); renderDemoTools();
  requestPreview(composition, { key: activeReviewKey, section, replayOpening });
}
function setEditorTab(tab) {
  if (!['style', 'scenes', 'content', 'library'].includes(tab)) return;
  restoreCurrent();
  const content = $('#editor-content'); tabScroll.set(editorTab, content.scrollTop); editorTab = tab;
  document.body.dataset.tab = tab;
  document.querySelectorAll('.editor-tabs [data-tab]').forEach(button => {
    const selected = button.dataset.tab === tab; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
  });
  content.scrollTop = tabScroll.get(tab) || 0;
  if(tab==='content' && contentEditor) contentEditor.openSection(contentEditor.getActiveSection(),{focus:false});
  guidedSteps?.refresh();
}
function renderTextScale() {
  const input = $('#text-scale'); if (!input) return;
  input.value = String(Math.round(composition.textScale * 100));
  $('#text-scale-value').textContent = `${input.value}%`;
  input.setAttribute('aria-valuetext', `선택한 크기의 ${input.value}퍼센트`);
}
function mountTextScale(container) {
  const box = node('section', 'type-tuning');
  const label = node('label', '', '글자 크기 세밀하게'); label.htmlFor = 'text-scale';
  const value = node('output'); value.id = 'text-scale-value'; value.htmlFor = 'text-scale';
  const heading = node('div', 'tuning-heading'); heading.append(label, value);
  const input = node('input'); input.id = 'text-scale'; input.type = 'range'; input.min = '90'; input.max = '120'; input.step = '5';
  input.addEventListener('input', () => { $('#text-scale-value').textContent = `${input.value}%`; input.setAttribute('aria-valuetext', `선택한 크기의 ${input.value}퍼센트`); });
  input.addEventListener('change', () => apply({...composition, textScale:Number(input.value)/100}, {reviewKey:'textSize', changedField:'textScale'}));
  box.append(heading, input, node('p', 'helper', '아래에서 기본 크기를 고른 뒤 90–120%로 조절해요. 손글씨는 원래 모습을 유지해요.'));
  container.append(box);
}
function fineRange(container, {field,label,min,max,onCommit}) {
  const row=node('div','fine-range'), heading=node('label'), output=node('output');
  const input=node('input'); input.type='range'; input.min=String(min); input.max=String(max); input.step='5';
  input.id=`fine-${fineControls.length}-${field}`; heading.htmlFor=input.id; output.htmlFor=input.id;
  heading.append(node('span','',label),output);
  function setValue(value){input.value=String(Math.round(value*100)); output.textContent=`${input.value}%`;input.setAttribute('aria-valuetext',`${label} ${input.value}퍼센트`);}
  input.addEventListener('input',()=>setValue(Number(input.value)/100));
  input.addEventListener('change',()=>onCommit(Number(input.value)/100));
  row.append(heading,input);container.append(row);return {input,setValue};
}
function mountGlobalFine(container,field,label,min,max,key) {
  const box=node('section','type-tuning');
  const range=fineRange(box,{field,label,min,max,onCommit:value=>apply({...composition,[field]:value},{reviewKey:key,changedField:field})});
  fineControls.push({field,...range});
  box.append(node('p','helper','기본 표현을 고른 뒤 바를 움직여 조절해요. 100%는 선택한 표현의 원래 값이에요.'));
  container.append(box);
}
function mountSceneFine(container,key) {
  const section=key==='cover'?'top':SECTION_IDS[key];if(!section)return;
  const box=node('details','scene-fine'), summary=node('summary','','이 장면만 세부 조절');
  const label=node('label','scene-fine-switch'), toggle=node('input');toggle.type='checkbox';
  label.append(toggle,node('span','','이 장면에 다른 값 사용'));box.append(summary,label);
  const ranges=node('div','scene-fine-ranges');box.append(ranges);
  const controller={section,key,toggle,ranges,fields:{}};
  toggle.addEventListener('change',()=>apply({...composition,sectionTuning:setSectionTuning(composition.sectionTuning,section,toggle.checked?{textScale:composition.textScale,lineScale:composition.lineScale,sectionSpace:composition.sectionSpace}:null)},{reviewKey:key,changedField:'sectionTuning'}));
  for(const [field,name,min,max] of [['textScale','글자 크기',90,120],['lineScale','줄 간격',90,140],['sectionSpace','위아래 여백',70,140]]) {
    if(section==='top' && field==='sectionSpace') continue;
    controller.fields[field]=fineRange(ranges,{field,label:name,min,max,onCommit:value=>apply({...composition,sectionTuning:setSectionTuning(composition.sectionTuning,section,{[field]:value})},{reviewKey:key,changedField:'sectionTuning'})});
  }
  box.append(node('p','helper',section==='top'?'체크를 끄면 전체 설정을 따라가요. 표지 높이와 첫 손글씨는 유지돼요.':'체크를 끄면 전체 설정을 따라가요. 버튼의 최소 터치 크기는 유지해요.'));
  fineControls.push(controller);container.append(box);
}
function renderFineControls() {
  const overrides=readSectionTuning(composition.sectionTuning);
  for(const control of fineControls) {
    if(control.field){control.setValue(composition[control.field]);continue;}
    const value=overrides[control.section];control.toggle.checked=Boolean(value);control.ranges.hidden=!value;
    for(const [field,range] of Object.entries(control.fields)){range.input.disabled=!value;range.setValue(value?.[field]||1);}
  }
}
function renderTuning() {
  for (const field of tuningKeys) {
    const input = $(`#${field}`), output = $(`#${field}-value`); if (!input || !output) continue;
    input.value = String(composition[field]); output.textContent = `${Number(composition[field]).toFixed(2)}×`;
    input.setAttribute('aria-valuetext', `${Number(composition[field]).toFixed(2)}배`);
  }
  const inactive = ['signature', 'still'].includes(composition.motion);
  $('#motionStrength').disabled = inactive;
  $('#motion-tuning-note').textContent = inactive
    ? '공통 움직임을 쓰지 않는 표현이라 강도는 잠시 쉬어요. 고른 값은 다른 효과로 돌아와도 유지돼요.'
    : '속도를 낮추면 자동 시연을 천천히 비교해요. 직접 스크롤할 때는 손가락을 따라가며, 같은 위치에서 효과가 나타나는 정도가 달라져요.';
  $('#motion-defaults').disabled = tuningKeys.every(field => composition[field] === 1);
}
function mountTuning(container) {
  const controls = node('section', 'motion-tuning'); controls.setAttribute('aria-label', '스크롤 속도와 강도');
  const heading = node('div', 'tuning-heading'); heading.append(node('strong', '', '우리에게 맞는 움직임'));
  const reset = node('button', 'tuning-reset', '기본값'); reset.id = 'motion-defaults'; reset.type = 'button';
  reset.addEventListener('click', () => apply({ ...composition, motionSpeed: 1, motionStrength: 1 }, { reviewKey: 'motion' })); heading.append(reset); controls.append(heading);
  for (const [field, title, left, right] of [['motionSpeed', '속도', '천천히', '빠르게'], ['motionStrength', '강도', '은은하게', '또렷하게']]) {
    const group = node('div', 'tuning-control'), label = node('label', 'tuning-label'); label.htmlFor = field; label.append(node('span', '', title));
    const output = node('output'); output.id = `${field}-value`; output.htmlFor = field; label.append(output);
    const input = node('input', 'tuning-range'); input.id = field; input.type = 'range'; input.min = '.5'; input.max = '1.5'; input.step = '.25'; input.setAttribute('aria-describedby', 'motion-tuning-note');
    // Dragging changes only the readout. One release/keyboard step makes one saved choice and one demo.
    input.addEventListener('input', () => { output.textContent = `${Number(input.value).toFixed(2)}×`; input.setAttribute('aria-valuetext', `${Number(input.value).toFixed(2)}배`); });
    input.addEventListener('change', () => { apply({ ...composition, [field]: Number(input.value) }, { reviewKey: 'motion', changedField: field }); });
    const ends = node('div', 'tuning-ends'); ends.append(node('span', '', left), node('span', '', right)); group.append(label, input, ends); controls.append(group);
  }
  const note = node('p', 'tuning-note'); note.id = 'motion-tuning-note'; controls.append(note); container.append(controls);
}
function mountExtras() {
  for (const [group, title] of [['utility', '하객에게 편리한 장면'], ['sentiment', '두 사람의 마음을 담는 장면']]) {
    const block = node('section', 'extra-group'); block.append(node('h3', '', title));
    const list = node('div', 'extra-list');
    OPTIONAL_SECTIONS.filter(section => section.group === group).forEach(section => {
      const label = node('label', 'extra-choice'), input = node('input'); input.type = 'checkbox'; input.dataset.extra = section.id;
      const copy = node('span', 'extra-copy'); copy.append(node('strong', '', section.label), node('small', '', section.detail));
      label.append(input, copy, node('span', 'extra-symbol', '＋')); list.append(label);
      input.addEventListener('change', () => {
        const enabled = input.checked, extras = enabled ? [...composition.extras, section.id] : composition.extras.filter(id => id !== section.id);
        if (enabled) openKey = section.key; else if (openKey === section.key) openKey = null;
        apply({ ...composition, extras }, enabled ? { reviewKey: section.key, section: section.id } : { section: 'invitation' }); syncExpanded();
        $('#extra-status').textContent = `${section.label}${enabled ? '을 더했어요. 아래에서 표현과 순서를 골라 보세요.' : '을 뺐어요. 다시 더하면 고른 표현으로 돌아와요.'}`;
      });
    });
    block.append(list); $('#extra-sections').append(block);
  }
}
function makeSample(key, value, mini = false) {
  const sample = node('span', mini ? 'choice-sample is-mini' : 'choice-sample'); sample.dataset.sample = key; sample.dataset.variant = value; sample.setAttribute('aria-hidden', 'true');
  if (key === 'palette') {
    const colors = APPEARANCE_PALETTES[value]; sample.style.background = colors.soft; sample.style.color = colors.accent;
    sample.append(node('span', 'sample-script', 'With love'), node('span', 'sample-caption', '성우 & 소희'));
    const swatches = node('span', 'sample-swatches'); for (const color of [colors.paper, colors.soft, colors.accent]) { const dot = node('i'); dot.style.background = color; swatches.append(dot); } sample.append(swatches);
  } else if (['textSize', 'lineSpace'].includes(key)) {
    sample.append(node('span', 'sample-names', '성우와 소희'), node('span', 'sample-caption', '함께할 소중한 날,'), node('span', 'sample-caption', '편안한 마음으로 와 주세요.'), node('span', 'sample-date', '2027. 03. 06'));
  } else if (key === 'font') {
    const font = APPEARANCE_FONTS[value]; sample.style.fontFamily = `${font.body}, serif`; sample.style.fontWeight = font.bodyWeight;
    sample.append(node('span', 'sample-names', mini ? '성우' : '성우와 소희'), node('span', 'sample-caption', '함께해 주실 소중한 분들을 초대해요.'), node('span', 'sample-date', '2027. 03. 06'));
  } else if (['cover', 'opening', 'story', 'album', 'motion', 'photoTone', 'coverFocus', 'albumColumns', 'albumRatio', 'ending'].includes(key)) {
    const sources = ['album', 'albumColumns', 'albumRatio'].includes(key) ? runtime.photos.slice(0, value === 'two' ? 2 : 3) : [runtime.photos[key === 'story' ? 1 : key === 'ending' ? runtime.photos.length - 1 : 0]];
    sources.filter(Boolean).forEach(photo => { const image = node('img'); image.src = new URL(photo.thumb || photo.src, new URL('./preview/', location.href)).href; image.alt = ''; image.loading = 'lazy'; image.width = photo.width || 640; image.height = photo.height || 960; sample.append(image); });
    sample.append(node('span', 'sample-script', key === 'motion' ? 'With love' : key === 'story' ? 'Our story' : ['album', 'albumColumns', 'albumRatio'].includes(key) ? 'Our moments' : key === 'ending' ? 'See you soon' : 'We are getting married'));
  } else if (key === 'spacing') {
    sample.append(node('span', 'sample-script', 'With love'), node('span', 'sample-names', '성우 & 소희'), node('span', 'sample-caption', '함께할 날을 기다려요.'));
  } else if (key === 'divider') {
    sample.append(node('span', 'sample-caption', '초대합니다'), node('span', 'sample-divider', value === 'chapter' ? '02 · OUR DAY' : '―'), node('span', 'sample-names', '우리의 결혼식'));
  } else if (key === 'guestGuide') {
    sample.append(node('span', 'sample-script', 'For our guests'), node('span', 'sample-names', '오시기 전에'), node('span', 'sample-caption', '예식 · 교통 · 마음 전하기'));
  } else if (key === 'checklist') {
    sample.append(node('span', 'sample-script', 'Ready for our day'), node('span', 'sample-caption', '○ 날짜 확인　○ 길찾기'), node('span', 'sample-caption', '○ 축하의 마음 준비'));
  } else if (key === 'keepsake') {
    const photo = runtime.photos[0]; if (photo) { const image = node('img'); image.src = new URL(photo.thumb || photo.src, new URL('./preview/', location.href)).href; image.alt = ''; image.loading = 'lazy'; sample.append(image); }
    sample.append(node('span', 'sample-script', 'Save our day'), node('span', 'sample-date', '2027. 03. 06'));
  } else if (key === 'promiseStyle') {
    sample.append(node('span', 'sample-script', 'Our promise'), node('span', 'sample-caption', '서로의 하루를 궁금해하기'), node('span', 'sample-caption', '작은 순간에도 함께 웃기'));
  } else if (key === 'noteStyle') {
    sample.append(node('span', 'sample-script', 'Dear you'), node('span', 'sample-caption', '성우에게,　소희에게,'), node('span', 'sample-names', '나란히 쓰는 마음'));
  } else if (key === 'thanksStyle') {
    sample.append(node('span', 'sample-script', 'Thank you'), node('span', 'sample-caption', '우리의 시작에 함께해 주셔서'), node('span', 'sample-names', '성우 · 소희 드림'));
  } else if (key === 'intro') {
    sample.append(node('span', 'sample-script', 'With love'), node('span', 'sample-names', '성우 & 소희'), node('span', 'sample-caption', '저희 두 사람, 결혼합니다.'));
  } else if (key === 'calendarMark') {
    sample.append(node('span', 'sample-caption', 'MARCH 2027'), node('span', 'sample-calendar-date', '6'), node('span', 'sample-caption', 'SATURDAY'));
  } else if (key === 'dayPass') {
    sample.append(node('span', 'sample-script', 'Your day pass'), node('span', 'sample-names', '15:30 · 벨리스홀'), node('span', 'sample-caption', '목화웨딩홀 15층 · 길찾기 ↗'));
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
  syncChoiceVisibility();
  guidedSteps?.refresh();
}
function syncChoiceVisibility() {
  choiceRows.forEach((row, key) => {
    const parent = detailParents[key];
    row.hidden = !visibleChoice(key, composition)
      || (globalKeys.includes(key) && !styleGroups[styleGroup].includes(key))
      || (['albumColumns', 'albumRatio'].includes(key) && !['grid', 'masonry'].includes(composition.album))
      || Boolean(parent && openKey !== parent && detailParents[openKey] !== parent);
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
    const container = $(globalKeys.includes(key) ? '#global-controls' : key === 'navigation' ? '#navigation-controls' : key === 'ending' ? '#ending-controls' : '#scene-controls');
    const group = node('section', 'choice-row'); group.dataset.choice = key;
    if (detailParents[key]) group.classList.add('choice-detail');
    const button = node('button', 'choice-open'); button.type = 'button'; button.setAttribute('aria-controls', `options-${key}`); button.setAttribute('aria-label', `${labels[key]} 고르기`);
    const sample = node('span', 'choice-mini'), text = node('span', 'choice-row-text'), selected = node('small'); selected.dataset.current = key;
    const number = node('span', 'choice-number', globalKeys.includes(key) ? 'STYLE' : 'SCENE');
    text.append(number, node('strong', '', labels[key]), selected);
    const count = node('span', 'choice-count', `${CHOICES[key].length}가지`); count.append(node('span', 'expand-symbol', '＋'));
    button.append(sample, text, count); button.addEventListener('click', () => { const scroll = $('#editor-content'), oldTop = group.getBoundingClientRect().top; restoreCurrent(); openKey = openKey === key ? null : key; syncExpanded(); guidedSteps?.refresh(); scroll.scrollTop += group.getBoundingClientRect().top - oldTop; if (openKey) { activeReviewKey = key; requestPreview(composition, { key }); } });
    const content = node('div', 'inline-options'); content.id = `options-${key}`;
    content.append(node('p', 'inline-hint', key === 'motion'
      ? '같은 초대글과 날짜 구간에서 비교해요. 방향·크기·초점의 차이를 봐주세요.'
      : ['albumColumns', 'albumRatio'].includes(key) ? '고른 사진첩의 배열에 바로 적용돼요. 다른 배열로 바꿔도 이 설정은 기억해요.'
      : '표현을 누르면 실제 장면이 바로 재생돼요.'));
    if (key === 'motion') mountTuning(content);
    if (key === 'textSize') mountTextScale(content);
    if (key === 'lineSpace') mountGlobalFine(content,'lineScale','줄 간격 세밀하게',90,140,'lineSpace');
    if (key === 'spacing') mountGlobalFine(content,'sectionSpace','장면 여백 세밀하게',70,140,'spacing');
    if (['cover','intro','date','story','album','arrival','gifting','wishes','ending',...OPTIONAL_SECTIONS.map(s=>s.key)].includes(key)) mountSceneFine(content,key);
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
    if (preset.featured) {
      button.classList.add('preset-featured');
      button.append(node('span', 'preset-badge', preset.badge));
    }
    button.append(node('strong', '', preset.label), node('small', '', preset.detail));
    button.addEventListener('click', () => { apply(preset.composition, { section: 'top', replayOpening: true, reviewKey: 'opening' }); notify(`${preset.label.replace(/^\d+ · /, '')} 조합을 적용했어요. 마음에 들면 조합 저장을 눌러 주세요.`); }); $(preset.featured ? '#presets' : '#preset-archive').append(button);
  });
  $('#preset-count').textContent = `추천 ${PRESETS.filter(preset => preset.featured).length}가지 ↗`;
  $('#preset-archive-count').textContent = `${PRESETS.filter(preset => !preset.featured).length}가지`;
  syncExpanded();
}
function mountOrder() {
  const changePosition = (id, position, control) => {
    const previous = composition.order.indexOf(id);
    if (previous === position) return;
    const label = ORDER_SECTIONS.find(section => section.id === id).label;
    // Native selects do not consistently acquire focus on every mobile browser.
    (control || orderRows.get(id)?.querySelector('select'))?.focus({ preventScroll: true });
    apply({ ...composition, order: moveSection(composition.order, id, position, composition.extras) }, { section: id });
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
  const setOrderPreset = preset => {
    apply({ ...composition, order: orderForPreset(composition, preset) }, { section: 'invitation' });
    $('#order-status').textContent = '고른 표현과 추가한 장면은 유지했어요.';
  };
  $('#reset-order').addEventListener('click', () => { setOrderPreset('default'); notify('추가한 장면은 두고 기본 일곱 장면의 순서를 돌렸어요.'); });
  document.querySelectorAll('[data-order-preset]').forEach(button => button.addEventListener('click', () => setOrderPreset(button.dataset.orderPreset)));
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
    const summary = node('p', 'saved-style', [...globalKeys.map(key => CHOICES[key].find(choice => choice.id === item.composition[key]).label), `글자 ${Math.round(item.composition.textScale * 100)}%`, tuningSummary(item.composition)].join(' · ')); li.append(summary);
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
    details.append(node('p', '', keys.filter(key => !globalKeys.includes(key) && visibleChoice(key, item.composition)).map(key => `${labels[key]}: ${CHOICES[key].find(choice => choice.id === item.composition[key]).label}`).join(' · ')), node('p', 'saved-order', orderLabel(item.composition.order))); li.append(details);
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
  try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(url); notify(kind === 'editor' ? '디자인 편집 주소를 복사했어요. 문구·사진 초안은 이 기기에 따로 보관돼요.' : '디자인 조합 주소를 복사했어요. 편집한 문구·사진은 내용 파일로 옮겨 주세요.'); }
  catch { $('#link-value').value = url; $('#fallback-link').href = url; $('#link-dialog').showModal(); $('#link-value').focus(); $('#link-value').select(); }
}
mountChoices(); mountOrder(); mountExtras(); renderChoices(); renderSaved(); renderDraftStars(); renderDemoTools();
contentEditor = mountContentEditor({
  root: $('#content-editor'), config: runtime,
  onChange(draft, {section} = {}) {
    restoreCurrent();
    clearTimeout(contentEditTimer);
    contentEditTimer=setTimeout(()=>{if(ready) post({type:'invitation-studio:content', draft});},160);
  },
  onNavigate(section) { restoreCurrent(); if (ready) post({type:'invitation-studio:jump',section}); },
  onSectionChange() { guidedSteps?.refresh(); },
  getComposition:()=>composition,
  onComposition:next=>apply(next,{section:'invitation'}),
});
livePhotoManager = mountLivePhotoManager({root:$('#live-photo-manager'), managerURL:'/manage.html'});
const contentStepLabels = {family:'두 사람 · 가족', invitation:'초대 문구', story1:'이야기 첫 장', story2:'이야기 두 번째 장', story3:'이야기 마지막 장', closing:'마지막 인사', photos:'시안 사진'};
guidedSteps = mountGuidedSteps({
  container:$('#guided-steps'), labels:{...labels, ...contentStepLabels},
  readState:()=>({composition, tab:editorTab, key:editorTab==='content' ? contentEditor.getActiveSection() : openKey}),
  config:{globalKeys, sectionKeys, detailChildren, extraSteps:Object.keys(contentStepLabels).map(key=>({key,tab:'content'}))},
  onOpen({key,tab}) {
    setEditorTab(tab);
    if(tab==='content') { contentEditor.openSection(key); return; }
    if(tab==='style') {
      styleGroup='all';
      document.querySelectorAll('[data-style-group]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.styleGroup==='all')));
    }
    openKey=key; syncExpanded(); activeReviewKey=key; requestPreview(composition,{key});
    const row=choiceRows.get(key), scroller=$('#editor-content');
    if(row) { scroller.scrollTop+=row.getBoundingClientRect().top-scroller.getBoundingClientRect().top-12; row.querySelector('.choice-open')?.focus({preventScroll:true}); }
  },
  onFinish:()=>$('#go-save').click(),
});

document.querySelectorAll('[data-style-group]').forEach(button => button.addEventListener('click', () => {
  styleGroup = button.dataset.styleGroup;
  if (!Object.hasOwn(styleGroups, styleGroup)) styleGroup = 'all';
  document.querySelectorAll('[data-style-group]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.styleGroup === styleGroup)));
  if (openKey && globalKeys.includes(openKey) && !styleGroups[styleGroup].includes(openKey)) { restoreCurrent(); openKey = null; }
  syncExpanded();
}));
const initial = new URL('./preview/', location.href); initial.search = compositionParams(composition).toString(); initial.searchParams.set('compare', '1'); frame.src = initial.href;
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') return;
  const data = event.data;
  if (data.type === 'invitation-studio:ready') {
    motionReady = data.motionReady !== false;
    if (!motionReady) { ready = false; $('#preview-status').textContent = '장면을 준비하지 못했어요. 처음부터 보기로 다시 시도해 주세요.'; return; }
    ready = true;
    if (contentEditor) post({type:'invitation-studio:content', draft:contentEditor.getDraft()});
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
      ? '바뀐 부분을 보여드려요. 변경 전 보기로 차이를 비교해 보세요.' : status[data.phase];
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
$('#replay-scene').addEventListener('click', () => { if (!activeReviewKey) return; const shown = beforeVisible ? comparisonComposition(composition, lastChange) : composition; requestPreview(shown, { key: activeReviewKey, previewOnly: beforeVisible }); });
$('#compare-choice').addEventListener('click', () => { if (!lastChange || lastChange.key !== activeReviewKey) return; beforeVisible = !beforeVisible; requestPreview(beforeVisible ? comparisonComposition(composition, lastChange) : composition, { key: activeReviewKey, previewOnly: beforeVisible }); });
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
