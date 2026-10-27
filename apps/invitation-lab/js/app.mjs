import config from '../runtime.mjs';
import { $, $$, storageOrNull, readPreference, savePreference, toast, setupDialogs, openDialog, closeDialogs, updateDialogRoute, copyText, addSwipe } from './ui.mjs';
import { countdown } from './core.mjs';
import { createDemoAdapter } from './demo-data.mjs';
import { setupAccounts, setupGuestbook } from './guest-features.mjs';
import { setupGallery } from './gallery.mjs';
import { setupAudio } from './audio.mjs';
import { createInvitationCard } from './invitation-card.mjs';

const variant = document.body.dataset.variant;
if (!/^[a-e]$/.test(variant) || config.mode !== 'demo') throw new Error('Invitation lab requires a recognized demo edition.');
const comparison = window.parent !== window && new URLSearchParams(location.search).get('compare') === '1';
const canonicalUrl = `${config.canonicalRoot}${variant}/`;
const shareUrl = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? `${location.origin}${location.pathname}` : canonicalUrl;
document.documentElement.classList.toggle('compare-mode', comparison);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let effects = readPreference('sungso_invitation_lab_motion', 'on') !== 'off';
const motion = () => effects && !reduced.matches;
let themeController, revealObserver;

function revealAll() { $$('.reveal').forEach(element => element.classList.add('is-visible')); }
function updateEffects() {
  const enabled = motion();
  document.documentElement.classList.toggle('motion-off', !enabled);
  document.documentElement.classList.toggle('js-motion', enabled);
  $('#motion-toggle').textContent = effects ? '화면 효과 끄기' : '화면 효과 켜기';
  $('#motion-toggle').setAttribute('aria-pressed', String(!effects));
  if (!enabled) { window.sungsoIntro?.finish(); revealAll(); }
  themeController?.setEnabled(enabled);
  document.dispatchEvent(new Event('lab:motion-change'));
}
if ('IntersectionObserver' in window) {
  revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); }
  }, { rootMargin: '0px 0px -25px 0px', threshold: .03 });
  $$('.reveal').forEach(element => revealObserver.observe(element));
} else revealAll();
document.addEventListener('focusin', event => event.target.closest?.('.reveal')?.classList.add('is-visible'));
$('#motion-toggle').addEventListener('click', () => { effects = !effects; savePreference('sungso_invitation_lab_motion', effects ? 'on' : 'off'); updateEffects(); });
reduced.addEventListener('change', updateEffects); updateEffects();
if (!document.documentElement.classList.contains('intro-locked')) document.documentElement.classList.add('intro-complete');

function setTextSize(large) {
  document.documentElement.classList.toggle('large-text', large);
  document.body.dataset.textSize = large ? 'large' : 'normal';
  $('#text-size-toggle').setAttribute('aria-pressed', String(large));
  $('#text-size-toggle>span').textContent = large ? '기본 글씨로 보기' : '글씨 크게 보기';
  savePreference('sungso_invitation_lab_text_size', large ? 'large' : 'normal');
  requestAnimationFrame(() => { themeController?.refresh(); document.dispatchEvent(new Event('lab:layout-changed')); });
}
setTextSize(readPreference('sungso_invitation_lab_text_size', 'normal') === 'large');
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

function jumpTo(id) {
  const target = document.getElementById(id); if (!target) return;
  window.sungsoIntro?.finish(); closeDialogs();
  $$('.reveal', target).forEach(element => element.classList.add('is-visible'));
  history.replaceState(null, '', `#${id}`);
  requestAnimationFrame(() => { target.scrollIntoView({ behavior: motion() ? 'smooth' : 'instant', block: 'start' }); });
}
$$('[data-jump]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); jumpTo(link.hash.slice(1)); }));
function updateCountdown() {
  const count = countdown(config.wedding.startsAt);
  $$('[data-count]').forEach(element => {
    const value = String(count[element.dataset.count]).padStart(2, '0');
    if (value === element.textContent) return;
    const first = element.textContent === '—'; element.textContent = value;
    if (!first && motion() && !document.hidden) { element.classList.remove('is-changing'); void element.offsetWidth; element.classList.add('is-changing'); }
  });
  $('#dday-text').textContent = count.calendarDaysLeft === 0 ? '오늘, 저희 결혼합니다.' : count.phase === 'past' ? '함께해 주셔서 감사합니다.' : `저희의 결혼식이 ${count.calendarDaysLeft}일 남았습니다.`;
  $('#quick-menu-toggle>span').textContent = count.calendarDaysLeft === 0 ? '오늘의 예식 안내' : '빠른 보기';
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
$('#save-card').addEventListener('click', async event => {
  const button = event.currentTarget; if (button.disabled) return; button.disabled = true;
  $('#save-card-status').textContent = '사진과 글씨를 한 장에 담고 있어요.';
  try {
    const style = getComputedStyle(document.body);
    const result = await createInvitationCard({ wedding: config.wedding, photoUrl: new URL(`${config.assetBase}photos/date-1440.webp`, location.origin).href, variant, themeName: document.title, canonicalUrl, colors: Object.fromEntries(['paper', 'ink', 'accent', 'muted', 'line'].map(key => [key, style.getPropertyValue(`--${key}`).trim()])) });
    if (cardUrl) URL.revokeObjectURL(cardUrl); cardUrl = result.url;
    const file = new File([result.blob], result.filename, { type: 'image/png' });
    let shared = false;
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: '성우와 소희의 예식 안내' }); shared = true; }
      catch (error) { if (error.name === 'AbortError') { $('#save-card-status').textContent = '공유를 취소했어요. 이미지는 아래에서 확인할 수 있어요.'; } }
    }
    $('#card-preview').src = result.url; $('#card-download').href = result.url; $('#card-download').download = result.filename;
    if (!shared) openDialog('card-dialog', button);
    $('#save-card-status').textContent = shared ? '예식 정보 이미지를 공유했어요.' : '이미지를 열었어요. 다운로드하거나 길게 눌러 저장해 주세요.';
  } catch (error) { $('#save-card-status').textContent = error.message || '이미지를 만들지 못했어요. 연결을 확인하고 다시 시도해 주세요.'; }
  finally { button.disabled = false; }
});
$('#card-dialog').addEventListener('close', () => { if (cardUrl) { URL.revokeObjectURL(cardUrl); cardUrl = undefined; $('#card-preview').removeAttribute('src'); $('#card-download').removeAttribute('href'); } });

function parentMessage(data) { if (comparison) window.parent.postMessage(data, location.origin); }
const audio = setupAudio({ music: config.music, comparison, onState: phase => parentMessage({ type: 'invitation-lab:audio-state', playing: phase === 'playing', phase }) });
window.addEventListener('message', event => {
  if (!comparison || event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'invitation-lab:control') return;
  const { action, section, enabled } = event.data;
  if (action === 'audio' && typeof enabled === 'boolean') { audio.setAllowed(enabled); if (!enabled) parentMessage({ type: 'invitation-lab:audio-state', playing: false, phase: 'paused' }); }
  else if (action === 'section' && ['top', 'invitation', 'wedding-day', 'location', 'our-story', 'gallery', 'accounts', 'guestbook'].includes(section)) jumpTo(section);
  else if (action === 'replay') { history.replaceState(null, '', `${location.pathname}${location.search}#top`); location.reload(); }
});
parentMessage({ type: 'invitation-lab:ready' });

const featureResults = await Promise.allSettled([setupAccounts(adapter), setupGuestbook(adapter)]);
featureResults.forEach((result, index) => {
  if (result.status === 'rejected') { console.error(`Invitation feature ${index} failed`, result.reason); toast('일부 체험 기능을 준비하지 못했어요. 새로고침해 주세요.'); }
});
try {
  const module = await import(`../themes/${variant}.mjs`);
  themeController = module.mountTheme({ doc: document, win: window, enabled: motion() });
  requestAnimationFrame(() => themeController.refresh());
} catch (error) { console.error('Invitation motion fallback', error); revealAll(); document.documentElement.classList.remove('js-motion'); }
document.fonts.ready.then(() => { themeController?.refresh(); document.dispatchEvent(new Event('lab:layout-changed')); });
document.addEventListener('lab:dialog-change', () => { if (!$('dialog[open]')) themeController?.refresh(); });
window.addEventListener('pageshow', () => themeController?.refresh());
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  clearInterval(countdownTimer); themeController?.destroy(); audio.destroy(); revealObserver?.disconnect(); coverObserver?.disconnect();
  if (cardUrl) URL.revokeObjectURL(cardUrl);
});
