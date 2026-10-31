import {mountExpandedScenes,guestEdition} from './expanded-scenes.mjs';
import {mountExpandedSocial} from './expanded-social.mjs';
import config from '../runtime.mjs';
import { $, $$, storageOrNull, readPreference, savePreference, toast, setupDialogs, openDialog, closeDialogs, updateDialogRoute, copyText, addSwipe } from './ui.mjs';
import { countdown, calendarEvent } from './core.mjs';
import { createDemoAdapter } from './demo-data.mjs';
import { setupAccounts, setupGuestbook } from './guest-features.mjs';
import { setupGallery } from './gallery.mjs';
import { setupAudio } from './audio.mjs';
import { createInvitationCard } from './invitation-card.mjs';
import { readComposition, compositionParams, CHOICES } from './composition.mjs';
import { mountStudio, studioMessage, STUDIO_SECTIONS } from './studio-preview.mjs';
import { scrollPreviewTo, afterPreviewScroll } from './preview-scroll.mjs';
import { createSceneReview } from './scene-review.mjs';
import { createSceneDemo } from './scene-demo.mjs';
import { mountContentPreview } from './content-preview.mjs';
import { mountScenePicker } from './scene-picker.mjs';

const variant = document.body.dataset.variant;
if (!/^[fg]$/.test(variant) || config.mode !== 'demo') throw new Error('Invitation lab requires a recognized demo edition.');
const comparison = window.parent !== window && new URLSearchParams(location.search).get('compare') === '1';
let composition = readComposition(location.search);
let canonicalUrl, shareUrl, calendarUrl;
function syncCompositionLinks(next) {
  composition = next;
  const parameters = compositionParams(composition).toString();
  canonicalUrl = `${config.canonicalRoot}preview/?${parameters}`;
  shareUrl = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? `${location.origin}${location.pathname}?${parameters}` : canonicalUrl;
  history.replaceState(history.state, '', `${location.pathname}?${parameters}${comparison ? '&compare=1' : ''}${location.hash}`);
  document.querySelector('.lab-return').href = `../?${parameters}`;
  const calendar = document.querySelector('#google-calendar');
  if (calendar?.href) { const url = new URL(calendar.href); url.searchParams.set('details', canonicalUrl); calendar.href = url.href; }
  if (calendarUrl) URL.revokeObjectURL(calendarUrl);
  calendarUrl = URL.createObjectURL(new Blob([calendarEvent({ ...config.wedding, canonicalUrl })], { type: 'text/calendar;charset=utf-8' }));
  document.querySelectorAll('[data-studio-calendar]').forEach(link => { link.href = calendarUrl; link.download = 'sungso-wedding.ics'; });
}
syncCompositionLinks(composition);
// Font loading can move a directly linked section after the browser's first jump.
// Correct that one initial position only while the visitor has not taken control.
const initialSectionHash = location.hash;
const anchorInputEvents = ['pointerdown', 'touchstart', 'keydown', 'wheel'];
let initialAnchorPending = STUDIO_SECTIONS.includes(initialSectionHash.slice(1));
function cancelInitialAnchor() {
  initialAnchorPending = false;
  anchorInputEvents.forEach(type => window.removeEventListener(type, cancelInitialAnchor, true));
}
if (initialAnchorPending) anchorInputEvents.forEach(type => window.addEventListener(type, cancelInitialAnchor, { capture: true, passive: true }));
document.documentElement.classList.toggle('compare-mode', comparison);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let effects = readPreference('sungso_invitation_studio_motion', 'on') !== 'off';
const motion = () => effects && !reduced.matches;
let themeController, revealObserver, sceneReview, sceneDemo, visualOnly = false;
let contentPreview, expanded;
let scenePicker;
let latestApplyId = -1, stoppedDemoId = -1;
let awaitingApplyId = null;

function revealAll() { $$('.reveal').forEach(element => element.classList.add('is-visible')); }
function updateEffects() {
  const enabled = motion();
  document.documentElement.classList.toggle('motion-off', !enabled);
  document.documentElement.classList.toggle('js-motion', enabled);
  $('#motion-toggle').textContent = effects ? '화면 효과 끄기' : '화면 효과 켜기';
  $('#motion-toggle').setAttribute('aria-pressed', String(!effects));
  if (!enabled) { window.sungsoIntro?.finish(); revealAll(); }
  themeController?.setEnabled(enabled);
  sceneReview?.setEnabled(enabled);
  document.dispatchEvent(new Event('lab:motion-change'));
}
if ('IntersectionObserver' in window) {
  revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); }
  }, { rootMargin: '0px 0px -25px 0px', threshold: .03 });
  $$('.reveal').forEach(element => revealObserver.observe(element));
} else revealAll();
document.addEventListener('focusin', event => event.target.closest?.('.reveal')?.classList.add('is-visible'));
$('#motion-toggle').addEventListener('click', () => { effects = !effects; savePreference('sungso_invitation_studio_motion', effects ? 'on' : 'off'); updateEffects(); });
reduced.addEventListener('change', updateEffects); updateEffects();
if (!document.documentElement.classList.contains('intro-locked')) document.documentElement.classList.add('intro-complete');

function setTextSize(large) {
  document.documentElement.classList.toggle('large-text', large);
  // The guest's readability override is separate from the saved composition.
  // Appearance owns body.dataset.textSize, so turning this off restores that choice.
  $('#text-size-toggle').setAttribute('aria-pressed', String(large));
  $('#text-size-toggle>span').textContent = large ? '기본 글씨로 보기' : '글씨 크게 보기';
  savePreference('sungso_invitation_studio_text_size', large ? 'large' : 'normal');
  requestAnimationFrame(() => { themeController?.refresh(); document.dispatchEvent(new Event('lab:layout-changed')); });
}
setTextSize(readPreference('sungso_invitation_studio_text_size', 'normal') === 'large');
$('#text-size-toggle').addEventListener('click', () => setTextSize(!document.documentElement.classList.contains('large-text')));

const adapter = createDemoAdapter({ variant, photos: config.photos, storage: storageOrNull() });
const gallery = setupGallery({ photos: config.photos, motion });
const storyDialog = $('#story-dialog');
let chapter = 0;
function showChapter(next, { open = false, trigger } = {}) {
  chapter = Math.max(0, Math.min(config.chapters.length - 1, Number(next) || 0));
  $$('.story-page').forEach((page, index) => { page.hidden = index !== chapter; });
  storyDialog.dataset.currentChapter = chapter;
  $('#story-count').textContent = `0${chapter + 1} / 03`;
  $$('[data-chapter-go]').forEach(button => button.setAttribute('aria-current', String(Number(button.dataset.chapterGo) === chapter)));
  $('#story-prev').disabled = chapter === 0; $('#story-next').disabled = chapter === config.chapters.length - 1;
  if (open) openDialog(storyDialog, trigger, `#story/${chapter + 1}`);
  else updateDialogRoute(storyDialog, `#story/${chapter + 1}`);
  storyDialog.scrollTop = 0;
  if (motion() && storyDialog.open && !['d', 'e'].includes(variant)) $(`[data-chapter="${chapter}"]`).animate([{ opacity: .2, transform: 'translateY(9px)' }, { opacity: 1, transform: 'none' }], { duration: 400, easing: 'ease-out' });
  if (document.activeElement?.disabled) $(`[data-chapter-go="${chapter}"]`).focus({ preventScroll: true });
}
function readRoute() {
  const story = location.hash.match(/^#story\/([1-3])$/), photo = location.hash.match(/^#photo\/(\d+)$/);
  if (story) showChapter(Number(story[1]) - 1, { open: true });
  else if (photo) gallery.openPhoto(Number(photo[1]) - 1);
  else if (location.hash === '#album') gallery.openAlbum();
}
setupDialogs(readRoute);
$('.story-entry').addEventListener('click', event => showChapter(0, { open: true, trigger: event.currentTarget }));
$$('[data-chapter-open]').forEach(button => button.addEventListener('click', () => showChapter(button.dataset.chapterOpen, { open: true, trigger: button })));
$$('[data-chapter-go]').forEach(button => button.addEventListener('click', () => showChapter(button.dataset.chapterGo)));
$('#story-prev').addEventListener('click', () => showChapter(chapter - 1)); $('#story-next').addEventListener('click', () => showChapter(chapter + 1));
storyDialog.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); showChapter(chapter + (event.key === 'ArrowRight' ? 1 : -1)); } });
addSwipe($('.story-pages'), delta => showChapter(chapter + delta));
readRoute();

sceneReview = createSceneReview({ doc: document, win: window, enabled: motion() });
let jumpFrame = 0, jumpGeneration = 0, cancelScrollReview = () => {};
function cancelPreviewJump() {
  jumpGeneration++;
  cancelAnimationFrame(jumpFrame); jumpFrame = 0;
  cancelScrollReview(); sceneReview.cancel();
}
function jumpTo(id, { replayOpening = false, reviewKey } = {}) {
  const target = document.getElementById(id); if (!target) return;
  cancelInitialAnchor();
  cancelPreviewJump();
  const generation = jumpGeneration;
  window.sungsoIntro?.finish(); closeDialogs();
  $$('.reveal', target).forEach(element => element.classList.add('is-visible'));
  history.replaceState(null, '', `#${id}`);
  Promise.resolve(themeController?.whenReady).catch(() => {}).then(() => {
    if (generation !== jumpGeneration || document.hidden || $('dialog[open]')) return;
    jumpFrame = requestAnimationFrame(() => {
      jumpFrame = 0;
      scrollPreviewTo(target, { behavior: replayOpening || !motion() ? 'instant' : 'smooth' });
      if (replayOpening && id === 'top') window.sungsoIntro?.replay(composition.opening);
      if (reviewKey) cancelScrollReview = afterPreviewScroll({ win: window, doc: document, onSettled: () => {
        if (generation !== jumpGeneration) return;
        themeController?.refresh();
        if (reviewKey === 'motion') themeController?.previewMotion(id);
        sceneReview.show({ section: id, key: reviewKey, label: CHOICES[reviewKey]?.find(choice => choice.id === composition[reviewKey])?.label || '' });
      } });
    });
  });
}
// A deliberate guest gesture takes precedence over any pending font/scroll wait.
['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(type => window.addEventListener(type, cancelPreviewJump, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelPreviewJump(); });
document.addEventListener('click', event => {
  const link = event.target.closest?.('[data-jump]');
  if (!link || link.hidden) return;
  event.preventDefault(); jumpTo(link.hash.slice(1));
});
function updateCountdown() {
  const count = countdown(config.wedding.startsAt);
  $$('[data-count]').forEach(element => {
    const value = String(count[element.dataset.count]).padStart(2, '0');
    if (value === element.textContent) return;
    const first = element.textContent === '—'; element.textContent = value;
    if (!first && motion() && !document.hidden) { element.classList.remove('is-changing'); void element.offsetWidth; element.classList.add('is-changing'); }
  });
  $('#dday-text').textContent = count.calendarDaysLeft === 0 ? '오늘, 저희 결혼합니다.' : count.phase === 'past' ? '함께해 주셔서 감사합니다.' : `저희의 결혼식이 ${count.calendarDaysLeft}일 남았습니다.`;
  $('#quick-menu-toggle>span').textContent = '더 보기';
}
updateCountdown(); const countdownTimer = setInterval(() => { if (!document.hidden) updateCountdown(); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateCountdown(); });
const coverObserver = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => $('#quick-menu-toggle').classList.toggle('is-cover', entry.isIntersecting), { threshold: .12 }) : null;
coverObserver?.observe($('.hero'));
const map = $('[data-map-src]');
const loadMap = () => { if (!map.getAttribute('src')) map.src = map.dataset.mapSrc; };
if ('IntersectionObserver' in window) { const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { loadMap(); observer.disconnect(); } }, { rootMargin: '150px' }); observer.observe(map); } else loadMap();

$$('[data-copy-address]').forEach(button => button.addEventListener('click', () => copyText(config.wedding.address, '예식장 주소를 복사했어요.')));
$('#copy-link').addEventListener('click', () => copyText(shareUrl, '이 시안의 주소를 복사했어요.'));
$('#share-invitation').addEventListener('click', async () => {
  if (navigator.share) {
    try { await navigator.share({ title: config.wedding.title, text: '3월 6일, 저희 결혼식에 초대합니다. · 비교 시안', url: shareUrl }); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  await copyText(shareUrl, '공유할 시안 주소를 복사했어요.');
});
const google = new URL('https://calendar.google.com/calendar/render');
const stamp = new Date(config.wedding.startsAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
google.search = new URLSearchParams({ action: 'TEMPLATE', text: config.wedding.title, dates: `${stamp}/${stamp}`, ctz: 'Asia/Seoul', location: `${config.wedding.venue} ${config.wedding.room}, ${config.wedding.address}`, details: canonicalUrl }).toString();
$('#google-calendar').href = google.href;

let cardUrl;
function setCardStatus(message) { $$('#save-card-status, [data-card-status]').forEach(node => { node.textContent = message; }); }
async function saveInvitationCard(event) {
  const button = event.currentTarget; if (button.disabled) return; button.disabled = true;
  setCardStatus('사진과 글씨를 한 장에 담고 있어요.');
  try {
    const style = getComputedStyle(document.body);
    const result = await createInvitationCard({ wedding: config.wedding, photoUrl: new URL(`${config.assetBase}photos/date-1440.webp`, location.origin).href, variant, font: composition.font, themeName: document.title, canonicalUrl, colors: Object.fromEntries(['paper', 'ink', 'accent', 'muted', 'line'].map(key => [key, style.getPropertyValue(`--${key}`).trim()])) });
    if (cardUrl) URL.revokeObjectURL(cardUrl); cardUrl = result.url;
    const file = new File([result.blob], result.filename, { type: 'image/png' });
    let shared = false;
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: '성우와 소희의 예식 안내' }); shared = true; }
      catch (error) { if (error.name === 'AbortError') { setCardStatus('공유를 취소했어요. 이미지는 아래에서 확인할 수 있어요.'); } }
    }
    $('#card-preview').src = result.url; $('#card-download').href = result.url; $('#card-download').download = result.filename;
    if (!shared) openDialog('card-dialog', button);
    setCardStatus(shared ? '예식 정보 이미지를 공유했어요.' : '이미지를 열었어요. 다운로드하거나 길게 눌러 저장해 주세요.');
  } catch (error) { setCardStatus(error.message || '이미지를 만들지 못했어요. 연결을 확인하고 다시 시도해 주세요.'); }
  finally { button.disabled = false; }
}
$$('#save-card, [data-save-card]').forEach(button => button.addEventListener('click', saveInvitationCard));
$('#card-dialog').addEventListener('close', () => { if (cardUrl) { URL.revokeObjectURL(cardUrl); cardUrl = undefined; $('#card-preview').removeAttribute('src'); $('#card-download').removeAttribute('href'); } });

function parentMessage(data) { if (comparison) window.parent.postMessage(data, location.origin); }
const audio = setupAudio({ music: config.music, comparison, onState: phase => parentMessage({ type: 'invitation-lab:audio-state', playing: phase === 'playing', phase }) });
window.addEventListener('message', event => {
  if (!comparison || event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'invitation-lab:control') return;
  const { action, section, enabled } = event.data;
  if (action === 'audio' && typeof enabled === 'boolean') { audio.setAllowed(enabled); if (enabled) void audio.play(); else parentMessage({ type: 'invitation-lab:audio-state', playing: false, phase: 'paused' }); }
  else if (action === 'section' && STUDIO_SECTIONS.includes(section)) jumpTo(section);
  else if (action === 'replay') { history.replaceState(null, '', `${location.pathname}${location.search}#top`); location.reload(); }
});

const featureResults = await Promise.allSettled([setupAccounts(adapter), setupGuestbook(adapter)]);
featureResults.forEach((result, index) => {
  if (result.status === 'rejected') { console.error(`Invitation feature ${index} failed`, result.reason); toast('일부 체험 기능을 준비하지 못했어요. 새로고침해 주세요.'); }
});
expanded = mountExpandedScenes({config,gallery,adapter,motion,composition,onWedding:()=>updateCountdown()});
expanded.mountSocial(mountExpandedSocial({config,adapter,motion}));
try {
  themeController = mountStudio({ doc: document, win: window, enabled: motion(), gallery, wedding: config.wedding, composition, onChange: next => { if (!visualOnly) syncCompositionLinks(next); } });
  if (comparison) contentPreview = mountContentPreview({doc:document,win:window,gallery,config,onLayout:()=>themeController?.refresh()});
  requestAnimationFrame(() => themeController.refresh());
} catch (error) { console.error('Invitation motion fallback', error); revealAll(); document.documentElement.classList.remove('js-motion'); }
if (comparison && themeController) sceneDemo = createSceneDemo({
  doc: document, win: window, controller: () => themeController,
  finishOpening: () => window.sungsoIntro?.finish(),
  replayOpening: () => window.sungsoIntro?.replay(themeController.composition.opening, { preview: true }),
  onState: state => parentMessage({ type: 'invitation-studio:demo-state', ...state }),
});
if (comparison) scenePicker = mountScenePicker({ doc: document, win: window, embedded: comparison });
function stopPendingDemo() {
  if (awaitingApplyId === null) return;
  stoppedDemoId = Math.max(stoppedDemoId, awaitingApplyId);
  parentMessage({ type: 'invitation-studio:demo-state', requestId: awaitingApplyId, phase: 'cancelled', reason: 'user-input' });
}
if (comparison) {
  ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(type => window.addEventListener(type, stopPendingDemo, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPendingDemo(); });
}
window.addEventListener('message', async event => {
  const request = studioMessage(event, { origin: location.origin, parent: window.parent, embedded: comparison });
  if (!request) return;
  if (request.type === 'content' && contentPreview) {
    stopPendingDemo(); sceneDemo?.cancel('content-edit'); cancelPreviewJump(); cancelInitialAnchor();
    contentPreview.setDraft(request.draft);
  } else if (request.type === 'apply' && themeController) {
    if (request.requestId !== undefined && request.requestId < latestApplyId) return;
    if (request.requestId !== undefined) latestApplyId = request.requestId;
    awaitingApplyId = request.requestId ?? null;
    sceneDemo?.cancel('new-selection'); cancelPreviewJump(); cancelInitialAnchor();
    // Keep live dialogs, their routes, focus and form drafts mounted during edits.
    if (compositionParams(request.composition).toString() !== compositionParams(themeController.composition).toString()) {
      if (!$('dialog[open]')) window.sungsoIntro?.finish();
      visualOnly = request.previewOnly === true;
      themeController.setComposition(request.composition);
      expanded.setComposition(request.composition);
      visualOnly = false;
    }
    if (!request.previewOnly) syncCompositionLinks(request.composition);
    await Promise.resolve(themeController.whenReady).catch(() => {});
    if (request.requestId !== undefined && request.requestId !== latestApplyId) return;
    awaitingApplyId = null;
    parentMessage({ type: 'invitation-studio:applied', composition: themeController.composition, ...(request.requestId !== undefined ? { requestId: request.requestId } : {}) });
  } else if (request.type === 'demo' && request.requestId === latestApplyId && request.requestId > stoppedDemoId) {
    cancelInitialAnchor(); cancelPreviewJump();
    sceneDemo?.start(request);
  } else if (request.type === 'demo-stop' && request.requestId >= latestApplyId) {
    stoppedDemoId = Math.max(stoppedDemoId, request.requestId);
    sceneDemo?.cancel('stop'); cancelPreviewJump();
  } else if (request.type === 'jump') {
    if ($('dialog[open]')) parentMessage({ type: 'invitation-studio:demo-state', requestId: latestApplyId, phase: 'blocked', reason: 'dialog' });
    else jumpTo(request.section, { replayOpening: request.replayOpening, reviewKey: request.reviewKey });
  }
});
parentMessage({ type: 'invitation-studio:ready', composition, motionReady: Boolean(themeController) });
parentMessage({ type: 'invitation-lab:ready' });
// A modal's Back entry may predate an editor change. Keep its route but share the current visual selection.
window.addEventListener('popstate', () => syncCompositionLinks(composition));
document.fonts.ready.then(() => {
  themeController?.refresh(); document.dispatchEvent(new Event('lab:layout-changed'));
  if (!initialAnchorPending) return;
  requestAnimationFrame(() => {
    if (initialAnchorPending && location.hash === initialSectionHash && !document.hidden && !$('dialog[open]')) {
      scrollPreviewTo(document.getElementById(initialSectionHash.slice(1)));
    }
    cancelInitialAnchor();
  });
});
document.addEventListener('lab:dialog-change', () => { if (!$('dialog[open]')) themeController?.refresh(); });
window.addEventListener('pageshow', () => themeController?.refresh());
window.addEventListener('pagehide', event => {
  cancelInitialAnchor();
  if (event.persisted) return;
  cancelPreviewJump(); sceneReview.destroy(); sceneDemo?.destroy(); scenePicker?.destroy();
  clearInterval(countdownTimer); expanded?.destroy(); themeController?.destroy(); audio.destroy(); revealObserver?.disconnect(); coverObserver?.disconnect();
  if (cardUrl) URL.revokeObjectURL(cardUrl);
  if (calendarUrl) URL.revokeObjectURL(calendarUrl);
});
