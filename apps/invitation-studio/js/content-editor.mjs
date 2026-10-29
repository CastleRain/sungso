import { CONTENT_FIELDS, CONTENT_MAX_PHOTOS, CONTENT_FILE_BYTES, normalizeContentDraft, draftDefaults, resolveDraftPhotos, exportContentDraft, parseContentDraft, createContentStore, prepareDraftPhoto } from './content-draft.mjs';
import { normalizeComposition } from './composition.mjs';

export const CONTENT_STEPS = Object.freeze([
  { key: 'family', label: '두 사람과 가족' }, { key: 'invitation', label: '초대 문구' },
  { key: 'story1', label: '이야기 첫 장' }, { key: 'story2', label: '이야기 두 번째 장' }, { key: 'story3', label: '이야기 마지막 장' },
  { key: 'closing', label: '마지막 인사' }, { key: 'photos', label: '사진 추가와 순서' },
]);

/** Independent local draft editor. It never imports an authenticated/public data adapter. */
export function mountContentEditor({ root, config = {}, doc = document, win = window, onChange = () => {}, onNavigate = () => {}, onSectionChange = () => {}, getComposition, onComposition = () => {}, store = createContentStore(win.indexedDB) } = {}) {
  if (!root) throw new TypeError('Content editor root required');
  const defaults = draftDefaults(config), basePhotos = (config.photos || []).map(photo => ({ ...photo, src: new URL(photo.src, new URL('./preview/', win.location.href)).href, thumb: new URL(photo.thumb || photo.src, new URL('./preview/', win.location.href)).href }));
  const cleanups = [], controls = new Map(), groups = new Map(), touchedBeforeLoad = new Set();
  let draft = normalizeContentDraft(), revision = 0, mutation = 0, photoOperation = 0, active = 'family', disposed = false, loaded = false, writable = false, photosTouchedBeforeLoad = false, timer, saving = false, queued = false, undoPhoto, persistPromise = Promise.resolve();
  const el = (tag, cls, text) => { const node = doc.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; };
  const listen = (target, type, callback) => { target.addEventListener(type, callback); cleanups.push(() => target.removeEventListener(type, callback)); };
  const status = el('p', 'content-status'); status.id = 'content-draft-status'; status.setAttribute('role', 'status');
  const context = el('p', 'content-context', '이곳의 문구와 사진은 조립용 초안이에요. 이 브라우저에 따로 보관되며, 현재 하객용 청첩장에는 반영되지 않아요. 조합 링크에는 포함되지 않으니 내용 파일로 함께 옮겨 주세요.');
  const tools = el('div', 'content-tools'), save = el('button', '', '내용 저장'), exportButton = el('button', '', '내용 파일 ↓'), importLabel = el('label', 'content-import', '내용 불러오기 ↑'), inputFile = el('input');
  save.type = exportButton.type = 'button'; inputFile.type = 'file'; inputFile.accept = '.json,application/json'; inputFile.setAttribute('aria-label', '문구와 사진 내용 파일 불러오기'); importLabel.append(inputFile); tools.append(save, exportButton, importLabel);
  const retry = el('button', 'content-reload', '저장된 최신 내용 불러오기'); retry.type = 'button'; retry.hidden = true;
  const fieldHint = el('p', 'content-helper', '문구를 비우면 원래 내용으로 돌아가요. 줄바꿈은 그대로 보이고, 사진 설명은 입력하지 않아도 돼요.');
  root.classList.add('content-editor'); root.append(context, tools, status, retry, fieldHint);
  const groupHost = el('div', 'content-groups'); root.append(groupHost);
  const setStatus = (message, state = '') => { if (!disposed) { status.textContent = message; status.dataset.state = state; } };
  const snapshot = () => normalizeContentDraft(draft);
  function emit(section) { if (!disposed) onChange(snapshot(), { section }); }
  function resetForm() {
    for (const field of CONTENT_FIELDS) { const input = controls.get(field.id); input.value = draft.text[field.id] ?? defaults[field.id] ?? ''; }
    renderPhotos();
  }
  function scheduleSave() {
    win.clearTimeout(timer);
    if (!loaded || !writable) return;
    setStatus('변경한 내용을 이 브라우저에 보관하고 있어요.', 'pending');
    timer = win.setTimeout(() => { void flush(); }, 650);
  }
  function commit(next, section, { render = false } = {}) {
    const normalized = normalizeContentDraft(next);
    if (!loaded) {
      CONTENT_FIELDS.forEach(field => { if (draft.text[field.id] !== normalized.text[field.id]) touchedBeforeLoad.add(field.id); });
      if (JSON.stringify([draft.photos, draft.albumOrder]) !== JSON.stringify([normalized.photos, normalized.albumOrder])) photosTouchedBeforeLoad = true;
    }
    draft = normalized; mutation++;
    if (render) resetForm();
    emit(section); scheduleSave();
  }
  function flush() {
    win.clearTimeout(timer);
    if (disposed || !loaded || !writable) return Promise.resolve(false);
    if (saving) { queued = true; return persistPromise; }
    const ownMutation = mutation, toSave = snapshot(); saving = true;
    persistPromise = store.write(toSave, revision).then(nextRevision => {
      revision = nextRevision;
      if (!disposed && mutation === ownMutation) setStatus('문구와 사진 초안을 이 브라우저에 저장했어요.', 'saved');
      return true;
    }).catch(error => {
      writable = false; retry.hidden = false;
      setStatus(error.code === 'conflict' ? error.message : '이 브라우저에 저장하지 못했어요. 현재 내용은 유지돼요. 내용 파일로 내려받아 보관해 주세요.', 'error'); return false;
    }).finally(() => {
      saving = false;
      if (!disposed && writable && (queued || mutation !== ownMutation)) { queued = false; void flush(); }
    });
    return persistPromise;
  }
  function openSection(key, { focus = true } = {}) {
    if (!groups.has(key)) return false;
    active = key; groups.forEach((group, id) => { group.open = id === key; });
    const group = groups.get(key), scroll = root.closest('#editor-content');
    if (scroll) scroll.scrollTop += group.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12;
    if (focus) group.querySelector('summary').focus({ preventScroll: true });
    onSectionChange(key);
    onNavigate(key === 'photos' ? 'gallery' : key.startsWith('story') ? 'our-story' : key === 'closing' ? 'closing' : 'invitation');
    return true;
  }
  for (const step of CONTENT_STEPS) {
    const details = el('details', 'content-group'), summary = el('summary', '', step.label); summary.tabIndex = 0; details.dataset.contentStep = step.key; details.open = step.key === active; details.append(summary); groups.set(step.key, details); groupHost.append(details);
    listen(summary, 'click', event => { event.preventDefault(); if (details.open) { details.open = false; } else openSection(step.key, { focus: false }); });
    if (step.key === 'photos') continue;
    const fields = el('div', 'content-fields'); details.append(fields);
    for (const field of CONTENT_FIELDS.filter(item => item.group === step.key)) {
      const label = el('label', 'content-field'), title = el('span', '', field.label), input = el(field.multiline ? 'textarea' : 'input');
      input.id = `content-${field.id}`; input.name = field.id; input.maxLength = field.limit; input.value = defaults[field.id] || ''; input.placeholder = defaults[field.id] || '내용을 적어 주세요';
      if (field.multiline) input.rows = field.id.endsWith('Body') ? 5 : 3;
      else { input.type = 'text'; input.autocomplete = 'off'; }
      label.append(title, input); fields.append(label); controls.set(field.id, input);
      listen(input, 'input', () => {
        try { const text = { ...draft.text }; if (!input.value.trim() || input.value === defaults[field.id]) delete text[field.id]; else text[field.id] = input.value; commit({ ...draft, text }, field.section); }
        catch (error) { setStatus(error.message, 'error'); }
      });
      listen(input, 'focus', () => { active = step.key; onSectionChange(active); });
    }
    if (step.key.startsWith('story')) details.append(el('p', 'content-helper', '오른쪽 ‘이야기 펼치기’에서 이 장의 문구를 확인할 수 있어요. 이야기 창은 자동으로 열지 않아요.'));
    const reset = el('button', 'content-reset-group', '이 항목 원래 문구로'); reset.type = 'button'; details.append(reset);
    listen(reset, 'click', () => { const text = { ...draft.text }; CONTENT_FIELDS.filter(field => field.group === step.key).forEach(field => delete text[field.id]); commit({ ...draft, text }, step.key.startsWith('story') ? 'our-story' : step.key === 'closing' ? 'closing' : 'invitation', { render: true }); });
  }
  const photoGroup = groups.get('photos'), photoHint = el('p', 'content-helper', '사진을 추가한 뒤 화살표로 순서를 바꿔 보세요. 원본은 건드리지 않고 화면용 사본만 이 브라우저에 보관해요. JPG·PNG·WebP, 최대 20장.');
  const photoLabel = el('label', 'content-photo-add', '사진 추가 ＋'), photoFile = el('input'); photoFile.type = 'file'; photoFile.accept = 'image/jpeg,image/png,image/webp'; photoFile.multiple = true; photoFile.disabled = true; photoFile.setAttribute('aria-label', '초안 사진 추가'); photoLabel.append(photoFile);
  const photoCount = el('p', 'content-photo-count'), photoList = el('ol', 'content-photo-list'); photoList.setAttribute('aria-label', '초안 사진 순서');
  const photoTools = el('div', 'content-photo-tools'), photoUndo = el('button', '', '사진 변경 되돌리기'), photoReset = el('button', '', '기존 사진첩으로'); photoUndo.type = photoReset.type = 'button'; photoUndo.disabled = true; photoTools.append(photoUndo, photoReset);
  photoGroup.append(photoHint, photoLabel, photoCount, photoList, photoTools);
  function renderPhotos() {
    const photos = resolveDraftPhotos(draft, basePhotos); photoList.replaceChildren();
    photoCount.textContent = `${photos.length} / ${CONTENT_MAX_PHOTOS}장 · 추가 사진 ${draft.photos.length}장`;
    photoUndo.disabled = !undoPhoto;
    photos.forEach((photo, index) => {
      const item = el('li', 'content-photo-item'), image = el('img'); image.src = photo.thumb || photo.src; image.alt = `${index + 1}번째 사진`; image.loading = 'lazy'; image.width = 96; image.height = 120;
      const actions = el('div', 'content-photo-actions'); actions.append(el('span', '', `${String(index + 1).padStart(2, '0')} ${photo.id.startsWith('local_') ? '추가한 사진' : '기존 사진'}`));
      const controlsRow = el('div');
      for (const [text, label, delta] of [['↑', '앞으로', -1], ['↓', '뒤로', 1], ['빼기', '초안에서 빼기', 0]]) {
        const button = el('button', '', text); button.type = 'button'; button.setAttribute('aria-label', `${index + 1}번째 사진 ${label}`); button.disabled = delta < 0 && index === 0 || delta > 0 && index === photos.length - 1;
        button.addEventListener('click', () => {
          photoOperation++; undoPhoto = snapshot(); const order = photos.map(item => item.id);
          if (delta) [order[index], order[index + delta]] = [order[index + delta], order[index]]; else order.splice(index, 1);
          commit({ ...draft, photos: delta ? draft.photos : draft.photos.filter(item => item.id !== photo.id), albumOrder: order }, 'gallery', { render: true });
          photoList.children[Math.min(Math.max(0, index + delta), order.length - 1)]?.querySelector('button')?.focus({ preventScroll: true });
        }); controlsRow.append(button);
      }
      actions.append(controlsRow); item.append(image, actions); photoList.append(item);
    });
  }
  listen(photoFile, 'change', async () => {
    const files = [...photoFile.files]; photoFile.value = ''; if (!files.length) return;
    const operation = ++photoOperation, initial = snapshot(), initialMutation = mutation;
    if (resolveDraftPhotos(initial, basePhotos).length + files.length > CONTENT_MAX_PHOTOS) { setStatus(`사진은 합계 ${CONTENT_MAX_PHOTOS}장까지 넣을 수 있어요.`, 'error'); return; }
    photoFile.disabled = true; setStatus('사진을 화면에 맞게 준비하고 있어요.', 'pending');
    try {
      const additions = [];
      for (const file of files) {
        additions.push(await prepareDraftPhoto(file, { win, doc }));
        if (disposed || photoOperation !== operation) return;
      }
      // Text typed while decoding is retained; another photo operation cancels this batch.
      const current = snapshot(), existing = resolveDraftPhotos(current, basePhotos);
      const next = normalizeContentDraft({ ...current, photos: [...current.photos, ...additions], albumOrder: [...existing.map(photo => photo.id), ...additions.map(photo => photo.id)] });
      undoPhoto = { ...initial, text: initialMutation === mutation ? initial.text : current.text };
      commit(next, 'gallery', { render: true }); onNavigate('gallery');
    } catch (error) { if (!disposed && operation === photoOperation) setStatus(error.message || '사진을 준비하지 못했어요. 기존 사진은 그대로예요.', 'error'); }
    finally { if (!disposed) photoFile.disabled = false; }
  });
  listen(photoUndo, 'click', () => { if (!undoPhoto) return; photoOperation++; const previous = undoPhoto; undoPhoto = null; commit({ ...previous, text: draft.text }, 'gallery', { render: true }); });
  listen(photoReset, 'click', () => { photoOperation++; undoPhoto = snapshot(); commit({ ...draft, photos: [], albumOrder: null }, 'gallery', { render: true }); });
  listen(save, 'click', () => { void flush(); });
  listen(exportButton, 'click', () => {
    const data = exportContentDraft(draft); if (getComposition) data.composition = normalizeComposition(getComposition());
    const blob = new win.Blob([JSON.stringify(data)], { type: 'application/json' }), url = win.URL.createObjectURL(blob), link = el('a');
    link.href = url; link.download = 'sungso-wedding-content.json'; doc.body.append(link); link.click(); link.remove(); win.setTimeout(() => win.URL.revokeObjectURL(url), 10000);
    setStatus(getComposition ? '문구·사진·현재 디자인 조합을 한 파일에 보관해요.' : '문구와 추가한 사진을 내용 파일로 보관해요. 조합은 보관함에서 따로 저장할 수 있어요.');
  });
  listen(inputFile, 'change', async () => {
    const file = inputFile.files[0]; inputFile.value = ''; if (!file) return;
    const ownMutation = mutation;
    if (file.size > CONTENT_FILE_BYTES) { setStatus('내용 파일은 10MB 이하여야 해요.', 'error'); return; }
    try {
      const raw = await file.text(), next = parseContentDraft(raw), imported = JSON.parse(raw);
      if (disposed || mutation !== ownMutation) { setStatus('파일을 읽는 동안 내용을 바꾸어 불러오기를 멈췄어요. 다시 선택해 주세요.'); return; }
      photoOperation++; commit(next, undefined, { render: true });
      if (imported.composition && typeof imported.composition === 'object' && !Array.isArray(imported.composition)) onComposition(normalizeComposition(imported.composition));
      setStatus('내용 파일을 불러왔어요. 조립 화면에만 반영돼요.');
    } catch (error) { setStatus(error.message || '내용 파일을 읽지 못했어요. 기존 초안은 그대로예요.', 'error'); }
  });
  async function load({ replace = false } = {}) {
    const before = mutation; setStatus('저장된 초안을 확인하고 있어요.');
    try {
      const record = await store.read(); if (disposed) return;
      // A confirmed reload may still be slow. Keep anything typed since that
      // click instead of treating it as an edit made during the initial load.
      if (replace && before !== mutation) {
        writable = false; retry.hidden = false;
        setStatus('불러오는 동안 내용을 바꾸어 최신 내용 불러오기를 멈췄어요. 현재 초안은 그대로예요. 파일로 보관하거나 다시 불러와 주세요.', 'error');
        return;
      }
      revision = record.revision; writable = true; loaded = true; retry.hidden = true;
      if (before === mutation && (replace || mutation === 0)) { draft = record.draft; resetForm(); emit(); setStatus(record.revision ? '이 브라우저에 보관한 문구와 사진을 불러왔어요.' : '문구와 사진을 바꾸면 이 브라우저에 자동 보관돼요.'); }
      else {
        const text = { ...record.draft.text }; touchedBeforeLoad.forEach(key => { if (Object.hasOwn(draft.text, key)) text[key] = draft.text[key]; else delete text[key]; });
        draft = normalizeContentDraft({ ...(photosTouchedBeforeLoad ? draft : record.draft), text });
        resetForm(); emit(); scheduleSave();
      }
    } catch { loaded = true; writable = false; retry.hidden = false; setStatus('저장된 초안을 읽지 못했어요. 덮어쓰지 않았어요. 지금 내용은 파일로 보관할 수 있어요.', 'error'); }
    finally { if (!disposed) photoFile.disabled = false; }
  }
  listen(retry, 'click', () => {
    if (retry.dataset.confirm !== 'true') { retry.dataset.confirm = 'true'; retry.textContent = '현재 초안 대신 최신 내용 불러오기'; setStatus('현재 초안을 남기려면 먼저 내용 파일을 내려받아 주세요. 한 번 더 누르면 저장된 내용으로 바뀌어요.'); return; }
    delete retry.dataset.confirm; retry.textContent = '저장된 최신 내용 불러오기'; photoOperation++; void load({ replace: true });
  });
  listen(doc, 'visibilitychange', () => { if (doc.hidden) void flush(); });
  renderPhotos();
  const ready = load();
  return {
    ready, getDraft: snapshot, getActiveSection: () => active, openSection, flush,
    async setDraft(value) { await ready; photoOperation++; commit(normalizeContentDraft(value), undefined, { render: true }); return flush(); },
    destroy() { if (disposed) return; void flush(); disposed = true; photoOperation++; win.clearTimeout(timer); cleanups.forEach(clean => clean()); void persistPromise.finally(() => store.close?.()); },
  };
}
