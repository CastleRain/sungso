import { TEMPLATES, COLLECTIONS, PEOPLE, GALLERIES, SECTIONS, PHOTOS, getTemplate } from './catalog.mjs';
import { defaultSelection, normalizeDocument, escapeHtml as e, readLocal, writeLocal, parseRoute, filterTemplates, exportSelection, selectionText } from './core.mjs';
import { cover, invitation, themeAttributes, heart } from './templates.mjs';
import { createStore } from './store.mjs';
import { createExperiences } from './experiences.mjs';

const experiences = createExperiences();

const main = document.querySelector('#main');
let storage; try { storage = window.localStorage; } catch { storage = null; }
const local = readLocal(storage);
let shared = { data: normalizeDocument(null), connection: 'loading', saving: false, error: '' };
let store, route = parseRoute(location.hash), pendingAction, toastTimer, photoIndex = 0, localWarning = false;
let revealObserver;
history.scrollRestoration = 'manual';
const dialog = id => document.getElementById(id);
const persist = () => { if (!writeLocal(storage, local) && !localWarning) { localWarning = true; toast('이 브라우저에서는 임시 설정을 보관할 수 없어요. 페이지를 닫기 전 우리의 선택으로 저장해주세요.'); } };
function toast(message) { const target = dialog('toast'); target.textContent = message; target.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { target.hidden = true; }, 6000); }
function getDraft(id) {
  if (!local.drafts[id]) {
    const selection = shared.data.selection?.templateId === id ? structuredClone(shared.data.selection) : defaultSelection(id);
    local.drafts[id] = { selection, baseRevision: shared.connection === 'live' ? shared.data.selectionRevision : null };
    persist();
  }
  return local.drafts[id];
}
function personButton() { dialog('actor-button').textContent = local.actor ? `${PEOPLE[local.actor]}의 취향` : '누가 고르나요?'; }
function favoriteButton(id, compact = false) {
  const active = local.actor && shared.data.favorites[local.actor].includes(id);
  return `<button class="favorite-button ${compact ? 'compact' : ''}" data-action="favorite" data-template="${id}" aria-pressed="${!!active}" aria-label="${e(getTemplate(id).name)} ${active ? '찜 해제' : '찜하기'}">${heart(active)}${compact ? '' : `<span>${active ? '찜했어요' : '찜하기'}</span>`}</button>`;
}
function favoriteMarks(id) { return `<div class="favorite-marks">${Object.entries(PEOPLE).map(([person, name]) => `<span class="${shared.data.favorites[person].includes(id) ? 'is-picked' : ''}">${name} ${shared.data.favorites[person].includes(id) ? '♥' : '♡'}</span>`).join('')}</div>`; }
function card(template) {
  return `<article class="template-card ${template.collection === 'special' ? 'special-card' : ''}"><a class="template-thumb" href="#preview/${template.id}" aria-label="${template.name} 전체 미리보기"><div ${themeAttributes(defaultSelection(template.id))}>${cover(template.id, true)}</div><span class="open-preview">${template.collection === 'special' ? '직접 눌러 체험하기' : '전체 펼쳐보기'} <span>${template.collection === 'special' ? '✦' : '↗'}</span></span></a><div class="template-info"><div class="template-name-row"><div><p class="template-number">${template.number} / ${template.english}</p><h2><a href="#preview/${template.id}">${template.name}</a></h2></div>${favoriteButton(template.id, true)}</div><p class="template-description">${template.description}</p>${template.experienceHint ? `<p class="experience-hint"><span aria-hidden="true">✦</span> ${template.experienceHint}</p>` : ''}<p class="photo-hint">${template.photoHint}</p><div class="template-bottom"><span class="mood">${template.mood}</span>${favoriteMarks(template.id)}</div></div></article>`;
}
function renderGrid() {
  const grid = dialog('template-grid'); if (!grid) return;
  const visible = filterTemplates(TEMPLATES, shared.data.favorites, local.filter, local.collection);
  grid.innerHTML = visible.length ? Object.entries(COLLECTIONS).map(([id, collection]) => {
    const templates = visible.filter(template => template.collection === id);
    if (!templates.length) return '';
    return `<section class="template-series series-${id}" aria-label="${collection.name}"><header class="series-heading"><div><p class="eyebrow">${collection.english}</p><h2>${collection.title}</h2><p>${collection.description}</p></div><span class="series-number">${String(templates.length).padStart(2, '0')}</span></header><div class="series-grid">${templates.map(card).join('')}</div></section>`;
  }).join('') : `<div class="empty-state"><span>♡</span><h2>아직 고른 후보가 없어요</h2><p>예시를 내려보며 마음에 드는 디자인을 찜해보세요.</p><button class="button secondary" data-action="filter" data-filter="all">전체 예시 보기</button></div>`;
  dialog('template-count').textContent = `${String(visible.length).padStart(2, '0')} DESIGNS`;
  document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === local.filter)));
  document.querySelectorAll('[data-collection]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.collection === local.collection)));
}
function renderCatalog() {
  main.className = 'catalog-main';
  main.innerHTML = `<section class="catalog-heading"><div><p class="eyebrow">A LITTLE NOTE, A BIG DAY</p><h1>우리의 마음을 담을<br>청첩장을 골라볼까요<span class="heading-flower" aria-hidden="true">✳</span></h1><p class="heading-description">오래 보아도 좋은 기본 여섯 장,<br>누르는 순간 특별해지는 새로운 여섯 장.</p></div><div class="date-stamp"><span>OUR WEDDING</span><b>03<span>/</span>06</b><span>2027 · SUNGWOO & SOHEE</span></div></section><div class="catalog-intro"><p><span>01</span> 펼쳐보기 <i>—</i> <span>02</span> 취향 모으기 <i>—</i> <span>03</span> 함께 고르기</p><span class="intro-note">사진과 일부 예식 정보는 예시예요</span></div><section class="catalog-collection" aria-label="청첩장 템플릿"><div class="collection-tabs" aria-label="디자인 모음">${[['all','모두 보기','12'],['classic','기본 6종','01–06'],['special','특별한 6종','07–12']].map(([id,label,count]) => `<button data-action="collection" data-collection="${id}" aria-pressed="${local.collection === id}"><span>${id === 'special' ? '✦ ' : ''}${label}</span><small>${count}</small></button>`).join('')}</div><div class="collection-toolbar"><div class="filters" aria-label="후보 필터">${[['all','전체'],['sungwoo','성우의 찜'],['sohee','소희의 찜'],['both','둘 다 찜']].map(([id,label]) => `<button data-action="filter" data-filter="${id}" aria-pressed="${local.filter === id}">${label}</button>`).join('')}</div><span id="template-count"></span></div><div id="template-grid" class="template-grid"></div></section><footer class="catalog-footer"><span>sungso</span><p>함께 고르는 오늘도, 우리의 결혼 준비.</p><a href="#selection">우리의 선택 모아보기 →</a></footer>`;
  renderGrid();
}
function optionsMarkup(selection, scope = 'desktop') {
  const template = getTemplate(selection.templateId);
  return `<div class="options-content"><p class="eyebrow">MAKE IT OURS</p><h2>우리답게 꾸미기</h2><p class="options-description">마음에 드는 조합을 찾아보세요.<br>아래 저장 버튼을 눌러야 함께 반영돼요.</p><fieldset><legend>01 <span>색감</span></legend><div class="palette-options">${template.palettes.map(palette => `<label class="palette-option"><input type="radio" name="palette-${scope}-${selection.templateId}" data-option="paletteId" value="${palette.id}" ${selection.paletteId === palette.id ? 'checked' : ''}><span class="palette-swatch" style="--swatch:${palette.paper};--swatch-ink:${palette.accent}"><i></i></span><span>${palette.name}</span></label>`).join('')}</div></fieldset><fieldset ${selection.sections.gallery ? '' : 'disabled'}><legend>02 <span>갤러리 배치</span></legend><div class="gallery-options">${Object.entries(GALLERIES).map(([id,name]) => `<label><input type="radio" name="gallery-${scope}-${selection.templateId}" data-option="galleryLayout" value="${id}" ${selection.galleryLayout === id ? 'checked' : ''}><span>${name}</span></label>`).join('')}</div></fieldset><fieldset><legend>03 <span>담고 싶은 이야기</span></legend><p class="fixed-sections">표지·초대글·예식 정보·마무리는 함께 들어가요.</p><div class="section-options">${Object.entries(SECTIONS).map(([id,name]) => `<label><span>${name}</span><input type="checkbox" role="switch" data-section-option="${id}" ${selection.sections[id] ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label>`).join('')}</div></fieldset><label class="note-label"><span>04 <b>디자인 메모</b></span><textarea data-option="note" maxlength="1000" rows="3" placeholder="예: 사진은 더 크게, 문구는 조금 짧게…">${e(selection.note)}</textarea></label><p class="note-count">${selection.note.length} / 1,000</p><button class="text-button" data-action="reset-draft">이 템플릿의 기본 설정으로</button></div>`;
}
function renderPreview() {
  const template = getTemplate(route.templateId), draft = getDraft(template.id);
  main.className = 'preview-main';
  main.innerHTML = `<div class="preview-topbar"><a href="#catalog" aria-label="전체 예시로 돌아가기">← <span>전체 예시</span></a><h1>${template.name}</h1><div id="preview-favorite">${favoriteButton(template.id, true)}</div></div><p class="preview-disclaimer">디자인 미리보기 · 사진, 시간, 장소는 예시입니다.</p><div class="preview-layout"><div id="preview-canvas">${invitation(draft.selection)}</div><aside class="desktop-options" aria-label="청첩장 옵션">${optionsMarkup(draft.selection)}<button class="button primary full-width save-button" data-action="save">우리의 선택으로 저장 <span>↗</span></button><a class="view-selection-link" href="#selection">함께 저장한 선택 보기</a><p class="draft-status" role="status"></p></aside></div><div class="mobile-preview-actions"><button class="button secondary" data-action="options">꾸미기</button><button class="button primary save-button" data-action="save">우리의 선택으로 저장</button></div>`;
  reveal(); experiences.mount(dialog('preview-canvas')); updateDraftStatus();
}
function updateDraftStatus() {
  if (route.view !== 'preview') return;
  const draft = getDraft(route.templateId);
  document.querySelectorAll('.draft-status').forEach(target => { target.textContent = draft.baseRevision !== null && draft.baseRevision !== shared.data.selectionRevision ? '다른 기기에서 우리의 선택이 바뀌었어요. 저장할 때 최신 선택을 확인해주세요.' : '꾸민 내용은 이 기기에 임시로 보관돼요.'; });
}
function renderSelection() {
  main.className = 'selection-main';
  const saved = shared.data.selection;
  const heading = `<p class="eyebrow">OUR CHOICE, OUR STORY</p><h1>함께 고른 한 장</h1><p class="selection-description">각자의 취향을 모아, 우리다운 청첩장으로.</p>`;
  if (!saved) { main.innerHTML = `${heading}<div class="empty-state selection-empty"><span>♡</span><h2>${shared.connection === 'loading' ? '우리의 선택을 불러오고 있어요' : '아직 함께 고른 청첩장이 없어요'}</h2><p>예시를 펼쳐보고 마음에 드는 조합을 저장해보세요.</p><a class="button primary" href="#catalog">청첩장 예시 둘러보기</a></div>`; return; }
  const template = getTemplate(saved.templateId), palette = template.palettes.find(item => item.id === saved.paletteId);
  main.innerHTML = `${heading}<div class="saved-layout"><div class="saved-cover"><div ${themeAttributes(saved)}>${cover(template.id, true)}</div><span class="saved-label">OUR PICK</span></div><section class="saved-details" aria-label="저장된 디자인 선택"><p class="template-number">${template.english}</p><h2>${template.name}</h2><p class="saved-by">${PEOPLE[shared.data.updatedBy] || '우리'}가 저장한 선택 · ${shared.data.selectionRevision}번째</p><dl><div><dt>색감</dt><dd>${palette.name}</dd></div><div><dt>갤러리</dt><dd>${saved.sections.gallery ? GALLERIES[saved.galleryLayout] : '포함하지 않음'}</dd></div><div><dt>담을 내용</dt><dd>표지·초대글·예식 정보·마무리${Object.entries(SECTIONS).filter(([key]) => saved.sections[key]).map(([, name]) => `<span class="saved-section">${name}</span>`).join('')}</dd></div><div><dt>디자인 메모</dt><dd class="saved-note">${e(saved.note || '아직 남긴 메모가 없어요.')}</dd></div></dl><button class="button secondary full-width" data-action="edit-selection">이 선택으로 다시 꾸미기 ↗</button><div class="export-actions"><button class="button primary" data-action="copy">선택 내용 복사</button><button class="button secondary" data-action="download">선택서 내려받기 ↓</button></div><p class="export-description">따로 만들 제작 페이지에 전달할 디자인 선택서예요.<br>공동으로 저장된 내용만 담겨요.</p></section></div><a class="back-to-catalog" href="#catalog">← 다른 예시도 둘러보기</a>`;
}
function reveal() {
  revealObserver?.disconnect();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  revealObserver = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); } }), { threshold: 0.05 });
  document.querySelectorAll('.reveal').forEach(target => { target.classList.add('will-reveal'); revealObserver.observe(target); });
}
function renderRoute() {
  experiences.dispose();
  document.querySelectorAll('dialog[open]').forEach(target => target.close());
  route = parseRoute(location.hash);
  document.body.dataset.view = route.view;
  dialog('nav-catalog').setAttribute('aria-current', route.view === 'catalog' ? 'page' : 'false');
  dialog('nav-selection').setAttribute('aria-current', route.view === 'selection' ? 'page' : 'false');
  if (route.view === 'preview') renderPreview(); else if (route.view === 'selection') renderSelection(); else renderCatalog();
  updateStateUI();
  requestAnimationFrame(() => { window.scrollTo(0, route.view === 'catalog' ? local.catalogScroll : 0); main.focus({ preventScroll: true }); });
}
function updateStateUI() {
  personButton();
  const status = dialog('sync-status');
  status.textContent = shared.saving ? '함께 저장하는 중…' : shared.error || (shared.connection === 'live' ? '두 사람의 선택이 함께 저장돼요' : shared.connection === 'loading' ? '공동 선택 연결 중… 예시는 바로 볼 수 있어요' : '연결을 확인해주세요. 임시 설정은 유지돼요.');
  status.dataset.connection = shared.connection;
  dialog('retry').hidden = shared.connection === 'live' || shared.connection === 'loading';
  document.querySelector('.selection-dot').hidden = !shared.data.selection;
  document.querySelectorAll('.save-button').forEach(button => { button.disabled = shared.saving; });
  document.querySelectorAll('[data-action="favorite"]').forEach(button => {
    const active = local.actor && shared.data.favorites[local.actor].includes(button.dataset.template);
    button.setAttribute('aria-pressed', String(!!active)); button.setAttribute('aria-label', `${getTemplate(button.dataset.template).name} ${active ? '찜 해제' : '찜하기'}`); button.innerHTML = heart(active); button.disabled = shared.saving;
  });
  updateDraftStatus();
}
function withActor(action) { if (local.actor) return action(); pendingAction = action; dialog('actor-dialog').showModal(); }
async function favorite(id) {
  if (!store) throw new Error('아직 공동 저장에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
  const enabled = !shared.data.favorites[local.actor].includes(id);
  await store.save({ type: 'favorite', actor: local.actor, templateId: id, enabled });
  toast(enabled ? `${PEOPLE[local.actor]}의 찜에 담았어요.` : '찜을 해제했어요.');
}
async function saveSelection() {
  if (!store || route.view !== 'preview') throw new Error('공동 저장 연결을 확인해주세요.');
  const draft = getDraft(route.templateId), oldRevision = draft.baseRevision;
  try {
    await store.save({ type: 'selection', actor: local.actor, selection: structuredClone(draft.selection), expectedRevision: oldRevision });
    draft.baseRevision = oldRevision + 1; persist();
    toast('우리의 선택으로 저장했어요.'); location.hash = '#selection';
  } catch (error) {
    if (error.code === 'selection-conflict') { showConflict(); return; }
    throw error;
  }
}
function latestChoiceMarkup() {
  const saved = shared.data.selection;
  return saved ? `<p><strong>${e(getTemplate(saved.templateId).name)}</strong><br>${e(getTemplate(saved.templateId).palettes.find(item => item.id === saved.paletteId).name)} · ${PEOPLE[shared.data.updatedBy] || '우리'}의 선택</p>` : '<p>최신 선택을 연결 중이에요. 다시 연결한 뒤 확인해주세요.</p>';
}
function showConflict() { dialog('latest-choice').innerHTML = latestChoiceMarkup(); dialog('conflict-dialog').dataset.revision = String(shared.data.selectionRevision); dialog('conflict-dialog').showModal(); }
function refreshPreview() {
  const selection = getDraft(route.templateId).selection, previousScroll = window.scrollY;
  dialog('preview-canvas').innerHTML = invitation(selection); reveal(); experiences.mount(dialog('preview-canvas'));
  document.querySelectorAll('[data-option="paletteId"]').forEach(input => { input.checked = input.value === selection.paletteId; });
  document.querySelectorAll('[data-option="galleryLayout"]').forEach(input => { input.checked = input.value === selection.galleryLayout; input.closest('fieldset').disabled = !selection.sections.gallery; });
  document.querySelectorAll('[data-section-option]').forEach(input => { input.checked = selection.sections[input.dataset.sectionOption]; });
  requestAnimationFrame(() => window.scrollTo(0, previousScroll));
}
function showPhoto(index) {
  photoIndex = (index + PHOTOS.length) % PHOTOS.length;
  dialog('large-photo').src = PHOTOS[photoIndex].src; dialog('large-photo').alt = PHOTOS[photoIndex].alt;
  dialog('photo-count').textContent = `${photoIndex + 1} / ${PHOTOS.length}`;
  if (!dialog('photo-dialog').open) dialog('photo-dialog').showModal();
}
async function copyChoice() {
  const text = selectionText(shared.data.selection);
  try { await navigator.clipboard.writeText(text); toast('선택 내용을 복사했어요.'); }
  catch {
    const fallback = document.createElement('textarea'); fallback.value = text; fallback.setAttribute('aria-label', '복사할 디자인 선택서'); main.append(fallback); fallback.select();
    const copied = document.execCommand('copy');
    if (copied) { fallback.remove(); toast('선택 내용을 복사했어요.'); } else { fallback.focus(); toast('자동 복사를 사용할 수 없어요. 선택된 내용을 직접 복사해주세요.'); }
  }
}
document.addEventListener('click', async event => {
  const link = event.target.closest('a[href^="#"]');
  if (link?.getAttribute('href') === '#main') { event.preventDefault(); main.focus(); return; }
  if (link && route.view === 'catalog') { local.catalogScroll = window.scrollY; persist(); }
  const target = event.target.closest('[data-action]'); if (!target) return;
  try {
    switch (target.dataset.action) {
      case 'actor': pendingAction = null; dialog('actor-dialog').showModal(); break;
      case 'choose-actor': {
        local.actor = target.dataset.person; persist(); dialog('actor-dialog').close(); updateStateUI(); const action = pendingAction; pendingAction = null; if (action) await action(); break;
      }
      case 'favorite': await withActor(() => favorite(target.dataset.template)); break;
      case 'save': await withActor(saveSelection); break;
      case 'collection': local.collection = target.dataset.collection; local.catalogScroll = 0; persist(); renderGrid(); break;
      case 'filter': local.filter = target.dataset.filter; persist(); renderGrid(); break;
      case 'options': dialog('mobile-options').innerHTML = optionsMarkup(getDraft(route.templateId).selection, 'mobile'); dialog('options-dialog').showModal(); break;
      case 'reset-draft': {
        getDraft(route.templateId).selection = defaultSelection(route.templateId); persist();
        const desktop = document.querySelector('.desktop-options .options-content'); desktop.outerHTML = optionsMarkup(getDraft(route.templateId).selection);
        if (dialog('options-dialog').open) dialog('mobile-options').innerHTML = optionsMarkup(getDraft(route.templateId).selection, 'mobile');
        refreshPreview(); toast('기본 설정으로 돌렸어요. 공동 선택은 그대로예요.'); break;
      }
      case 'photo': showPhoto(Number(target.dataset.index)); break;
      case 'previous-photo': showPhoto(photoIndex - 1); break;
      case 'next-photo': showPhoto(photoIndex + 1); break;
      case 'edit-selection': {
        const saved = shared.data.selection; if (!saved) return;
        local.drafts[saved.templateId] = { selection: structuredClone(saved), baseRevision: shared.data.selectionRevision }; persist(); location.hash = `#preview/${saved.templateId}`; break;
      }
      case 'copy': await copyChoice(); break;
      case 'download': {
        const value = exportSelection(shared.data.selection), blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = 'sungso-invitation-selection.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 3000); toast('함께 저장한 선택서를 내려받았어요.'); break;
      }
      case 'view-latest': dialog('conflict-dialog').close(); location.hash = '#selection'; break;
      case 'acknowledge-conflict': {
        if (shared.connection !== 'live') throw new Error('최신 선택에 연결한 뒤 다시 확인해주세요.');
        const seen = Number(dialog('conflict-dialog').dataset.revision);
        if (seen !== shared.data.selectionRevision) { dialog('latest-choice').innerHTML = latestChoiceMarkup(); dialog('conflict-dialog').dataset.revision = String(shared.data.selectionRevision); toast('선택이 한 번 더 바뀌었어요. 최신 내용을 확인해주세요.'); break; }
        getDraft(route.templateId).baseRevision = seen; persist(); dialog('conflict-dialog').close(); updateDraftStatus(); toast('최신 선택을 확인했어요. 원하면 지금 설정을 다시 저장해주세요.'); break;
      }
      case 'retry': if (store) store.retry(); else await connectStore(); break;
    }
  } catch (error) { toast(error.message || '반영하지 못했어요. 다시 시도해주세요.'); }
});
document.addEventListener('input', event => {
  const input = event.target; if (route.view !== 'preview' || !(input.dataset.option || input.dataset.sectionOption)) return;
  const selection = getDraft(route.templateId).selection;
  if (input.dataset.sectionOption) selection.sections[input.dataset.sectionOption] = input.checked;
  else selection[input.dataset.option] = input.value;
  persist();
  if (input.dataset.option === 'note') {
    document.querySelectorAll('[data-option="note"]').forEach(other => { if (other !== input) other.value = selection.note; });
    document.querySelectorAll('.note-count').forEach(target => { target.textContent = `${selection.note.length} / 1,000`; });
  } else refreshPreview();
});
document.addEventListener('keydown', event => { if (dialog('photo-dialog').open) { if (event.key === 'ArrowLeft') showPhoto(photoIndex - 1); if (event.key === 'ArrowRight') showPhoto(photoIndex + 1); } });
let touchStart;
dialog('large-photo').addEventListener('touchstart', event => { touchStart = event.changedTouches[0].clientX; }, { passive: true });
dialog('large-photo').addEventListener('touchend', event => { const delta = event.changedTouches[0].clientX - touchStart; if (Math.abs(delta) > 45) showPhoto(photoIndex + (delta < 0 ? 1 : -1)); }, { passive: true });
document.querySelectorAll('dialog').forEach(target => {
  target.addEventListener('click', event => { if (event.target !== target) return; const box = target.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) target.close(); });
  target.addEventListener('close', () => { if (target.id === 'actor-dialog') pendingAction = null; });
});
window.addEventListener('hashchange', renderRoute);
window.addEventListener('pagehide', () => { experiences.dispose(); if (route.view === 'catalog') { local.catalogScroll = scrollY; persist(); } });
window.addEventListener('pageshow', event => { if (event.persisted && route.view === 'preview') experiences.mount(dialog('preview-canvas')); });
async function connectStore() {
  if (store) return;
  try {
    const { connect } = await import('./firebase.mjs');
    store = createStore(connect());
    store.subscribe(value => {
      shared = value;
      if (shared.connection === 'live' && route.view === 'preview') { const draft = getDraft(route.templateId); if (draft.baseRevision === null) { draft.baseRevision = shared.data.selectionRevision; persist(); } }
      updateStateUI();
      if (route.view === 'catalog') renderGrid();
      if (route.view === 'selection') renderSelection();
    });
  } catch { shared = { ...shared, connection: 'error', error: '공동 선택에 연결하지 못했어요. 예시와 임시 설정은 계속 사용할 수 있어요.' }; updateStateUI(); }
}
renderRoute();
void connectStore();
