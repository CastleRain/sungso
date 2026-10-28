import { CHOICES, PRESETS, DEFAULT_COMPOSITION, SECTION_IDS, normalizeComposition, readComposition, compositionParams, sameComposition } from './js/composition.mjs';

const $ = selector => document.querySelector(selector);
const frame = $('#invitation-preview');
const STORAGE_KEY = 'sungso_invitation_studio_combinations_v1';
const labels = { cover: '첫 화면', opening: '첫 손글씨', intro: '초대글 · 가족 소개', date: '예식 날짜', story: '우리의 이야기', album: '사진첩' };
const keys = Object.keys(DEFAULT_COMPOSITION), history = [];
let composition = readComposition(location.search), ready = false, audioEnabled = false, noticeTimer, pendingJump, motionReady = true;
let audioPhase = 'paused';
let saved = readSaved();

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
function cleanName(value) { return String(value || '').trim().slice(0, 32); }
function readSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > 32000) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.slice(0, 8).filter(item => item && typeof item === 'object' && typeof item.id === 'string').map(item => ({
      id: item.id.slice(0, 80), name: cleanName(item.name) || '이름 없는 조합', composition: normalizeComposition(item.composition),
    }));
  } catch { return []; }
}
function persistSaved(next) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); saved = next; renderSaved(); return true; }
  catch { notify('이 브라우저에는 저장할 수 없어요. 조합 링크나 파일로 보관해 주세요.'); return false; }
}
function updateURL() {
  const url = new URL(location.href); url.search = compositionParams(composition).toString();
  window.history.replaceState(null, '', url); $('#open-preview').href = urlFor('preview');
}
function renderChoices() {
  for (const key of keys) {
    document.querySelectorAll(`input[name="${key}"]`).forEach(input => { input.checked = input.value === composition[key]; });
    const choice = CHOICES[key].find(item => item.id === composition[key]);
    $(`[data-current="${key}"]`).textContent = choice.label;
  }
  document.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', String(sameComposition(composition, PRESETS.find(item => item.id === button.dataset.preset).composition))));
  $('#preview-summary').textContent = keys.map(key => CHOICES[key].find(item => item.id === composition[key]).label).join(' · ');
  $('#undo-change').disabled = history.length === 0;
  updateURL();
}
function apply(next, { section, replayOpening = false, remember = true } = {}) {
  const normalized = normalizeComposition(next);
  if (!section && composition.opening !== normalized.opening) { section = 'top'; replayOpening = true; }
  if (!sameComposition(composition, normalized) && remember) { history.push({ ...composition }); if (history.length > 30) history.shift(); }
  composition = normalized; renderChoices();
  if (section) pendingJump = { section, ...(section === 'top' && replayOpening ? { replayOpening: true } : {}) };
  if (ready) {
    post({ type: 'invitation-studio:apply', composition });
    $('#preview-status').textContent = '선택한 장면을 이어 붙이고 있어요.';
  }
}
function showView(view) {
  document.body.dataset.view = view;
  document.querySelectorAll('.mobile-view [data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  if (matchMedia('(max-width:740px)').matches) $('.mobile-view').scrollIntoView({ block: 'start', behavior: 'auto' });
}
function jump(section, mobilePreview = false, replayOpening = false) {
  if (mobilePreview) showView('preview');
  const destination = { section, ...(section === 'top' && replayOpening ? { replayOpening: true } : {}) };
  if (ready) post({ type: 'invitation-studio:jump', ...destination }); else pendingJump = destination;
}
function mountChoices() {
  const container = $('#scene-controls');
  keys.forEach((key, index) => {
    const group = node('details', 'scene-group'); group.open = index === 0;
    const summary = node('summary'); const text = node('span', '', `${String(index + 1).padStart(2, '0')}  ${labels[key]}`);
    const selected = node('small'); selected.dataset.current = key; text.append(selected); summary.append(text);
    const list = node('div', 'choice-list'); list.setAttribute('role', 'radiogroup'); list.setAttribute('aria-label', labels[key]);
    CHOICES[key].forEach(choice => {
      const label = node('label', 'choice-label'), input = node('input'); input.type = 'radio'; input.name = key; input.value = choice.id;
      const title = node('strong', '', choice.label), detail = node('small', '', choice.detail), source = node('span', 'choice-source', choice.source), check = node('span', 'choice-check', '✓'); check.setAttribute('aria-hidden', 'true');
      input.addEventListener('change', () => { if (input.checked) apply({ ...composition, [key]: choice.id }, { section: SECTION_IDS[key], replayOpening: key === 'opening' }); });
      label.append(input, title, detail, source, check); list.append(label);
    });
    const tools = node('div', 'scene-tools'), button = node('button', '', key === 'opening' ? '이 효과 다시 보기 ↻' : '이 장면 미리 보기 ↗');
    button.type = 'button'; button.addEventListener('click', () => jump(SECTION_IDS[key], true, key === 'opening')); tools.append(button);
    group.append(summary, list, tools); container.append(group);
  });
  PRESETS.forEach(preset => {
    const button = node('button', 'preset'); button.dataset.preset = preset.id; button.type = 'button';
    button.append(node('strong', '', preset.label), node('small', '', preset.detail));
    button.addEventListener('click', () => { apply(preset.composition, { section: 'top', replayOpening: true }); notify('여섯 가지 선택을 추천 조합으로 바꿨어요. 하나씩 다시 골라도 좋아요.'); });
    $('#presets').append(button);
  });
}
function renderSaved() {
  const list = $('#saved-combinations'); list.replaceChildren();
  if (!saved.length) { const item = node('p', 'saved-empty', '아직 보관한 조합이 없어요.'); list.append(item); return; }
  saved.forEach(item => {
    const li = node('li'), open = node('button'), remove = node('button', 'delete-saved', '×');
    open.type = remove.type = 'button'; open.append(node('span', '', item.name), node('small', '', keys.map(key => CHOICES[key].find(choice => choice.id === item.composition[key]).label).join(' / ')));
    open.addEventListener('click', () => { $('#combination-name').value = item.name; apply(item.composition, { section: 'top', replayOpening: true }); notify(`‘${item.name}’ 조합을 불러왔어요.`); });
    remove.setAttribute('aria-label', `${item.name} 저장된 조합 삭제`);
    remove.addEventListener('click', () => { if (persistSaved(saved.filter(record => record.id !== item.id))) { notify('저장된 조합을 삭제했어요. 지금 보는 조합은 그대로예요.'); $('#save-combination').focus(); } });
    li.append(open, remove); list.append(li);
  });
}
async function copyURL(kind) {
  const url = urlFor(kind);
  try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(url); notify(kind === 'editor' ? '조립 화면 주소를 복사했어요.' : '선택한 조합의 미리보기 주소를 복사했어요.'); }
  catch { $('#link-value').value = url; $('#fallback-link').href = url; $('#link-dialog').showModal(); $('#link-value').focus(); $('#link-value').select(); }
}
mountChoices(); renderChoices(); renderSaved();
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
    ready = true; $('#preview-status').textContent = '선택한 조합이 연결되어 있어요.'; $('#preview-status').classList.add('is-ready');
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
  if (saved.length >= 8) { notify('최대 8개까지 보관할 수 있어요. 필요 없는 조합을 지운 뒤 저장해 주세요.'); return; }
  if (persistSaved([{ id: crypto.randomUUID(), name, composition: { ...composition } }, ...saved])) { $('#combination-name').value = name; notify(`‘${name}’ 조합을 이 브라우저에 저장했어요.`); }
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
  const blob = new Blob([JSON.stringify({ version: 1, name: cleanName($('#combination-name').value) || '우리의 청첩장', composition }, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = node('a'); a.href = url; a.download = 'sungso-wedding-combination.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); notify('조합 파일을 저장해요. 사진과 개인 정보는 포함되지 않아요.');
});
$('#import-combination').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 16384) throw new Error('size');
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || Array.isArray(data) || String(data.version) !== '1' || !data.composition || !keys.some(key => CHOICES[key].some(choice => choice.id === data.composition[key]))) throw new Error('shape');
    apply(normalizeComposition(data), { section: 'top', replayOpening: true }); $('#combination-name').value = cleanName(data.name); notify('파일의 조합을 불러왔어요. 보관하려면 저장을 눌러 주세요.');
  } catch { notify('이 조립실에서 저장한 조합 JSON 파일을 선택해 주세요.'); }
  finally { event.target.value = ''; }
});
window.addEventListener('pagehide', () => { clearTimeout(noticeTimer); post({ type: 'invitation-lab:control', action: 'audio', enabled: false }); });
