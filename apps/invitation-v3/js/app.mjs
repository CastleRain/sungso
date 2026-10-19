import { wedding, photos, accountGroups } from './config.mjs?v=3.2.0';
import { countdown, formatWedding, photoIndex, shareUrl, publishedAccounts } from './core.mjs?v=3.2.0';
import { renderNumber, settleDigits } from './countdown-view.mjs?v=3.2.0';
import './guestbook.mjs?v=3.2.0';

const root = document.documentElement;
const storySlides = [...document.querySelectorAll('.story-slide')];
const storyTabs = [...document.querySelectorAll('[data-story]')];
let storyIndex = 0;
function selectStory(index, focus = false) {
  storyIndex = photoIndex(index, storySlides.length);
  storySlides.forEach((slide, i) => { slide.hidden = i !== storyIndex; });
  storyTabs.forEach((tab, i) => tab.setAttribute('aria-pressed', String(i === storyIndex)));
  document.querySelector('#story-status').textContent = storySlides[storyIndex].getAttribute('aria-label');
  if (focus) storyTabs[storyIndex].focus();
}
storyTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectStory(index));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    selectStory(event.key === 'Home' ? 0 : event.key === 'End' ? storySlides.length - 1 : storyIndex + (event.key === 'ArrowLeft' ? -1 : 1), true);
  });
});
document.querySelector('#story-prev').addEventListener('click', () => selectStory(storyIndex - 1));
document.querySelector('#story-next').addEventListener('click', () => selectStory(storyIndex + 1));
const storyViewer = document.querySelector('.story-slides');
let storyPointer;
storyViewer.addEventListener('pointerdown', event => { if (event.isPrimary) storyPointer = {x:event.clientX,y:event.clientY,id:event.pointerId}; });
storyViewer.addEventListener('pointerup', event => {
  if (!storyPointer || event.pointerId !== storyPointer.id) return;
  const dx = event.clientX - storyPointer.x, dy = event.clientY - storyPointer.y;
  storyPointer = null;
  if (Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.5) { selectStory(storyIndex + (dx<0?1:-1)); suppressStoryClick = true; setTimeout(()=>{suppressStoryClick=false;},0); }
});
storyViewer.addEventListener('pointercancel',()=>{storyPointer=null;});
let suppressStoryClick = false;
storyViewer.addEventListener('click',event=>{if(suppressStoryClick){event.preventDefault();event.stopImmediatePropagation();}},true);
const motionButton = document.querySelector('#motion-toggle');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const motionKey = 'sungso_invitation_v3_motion';
let motionPreference;
try { motionPreference = localStorage.getItem(motionKey); } catch { /* Session-only preferences still work. */ }
let motionOn = false, revealObserver;

function applyMotion() {
  motionOn = !reducedMotion.matches && motionPreference !== 'off';
  root.dataset.motion = motionOn ? 'on' : 'off';
  document.body.classList.toggle('motion-on', motionOn);
  document.body.classList.toggle('motion-off', !motionOn);
  if (!motionOn) { document.getAnimations().forEach(animation => animation.cancel()); document.querySelectorAll('.digit-outgoing').forEach(node=>node.remove()); }
  motionButton.hidden = false;
  motionButton.disabled = reducedMotion.matches;
  motionButton.textContent = reducedMotion.matches ? '움직임 줄이는 중' : motionOn ? '효과 끄기' : '효과 켜기';
  motionButton.setAttribute('aria-pressed', String(motionOn));
  motionButton.setAttribute('aria-label', reducedMotion.matches ? '기기 설정에 따라 움직임을 줄이고 있습니다' : motionOn ? '사진과 스크롤 효과 끄기' : '사진과 스크롤 효과 켜기');
  revealObserver?.disconnect();
  const elements = [...document.querySelectorAll('.reveal')];
  if (!motionOn || !('IntersectionObserver' in window)) {
    elements.forEach(element => element.removeAttribute('data-waiting'));
    return;
  }
  revealObserver = new IntersectionObserver(entries => {
    entries.forEach(({ target, isIntersecting }) => {
      if (!isIntersecting) return;
      target.removeAttribute('data-waiting');
      target.dataset.seen = 'true';
      revealObserver.unobserve(target);
      const image = target.querySelector('img:not(.icon)');
      if (image && motionOn) image.animate([{ transform: 'scale(1.035)' }, { transform: 'scale(1)' }], { duration: 1700, easing: 'cubic-bezier(.2,.7,.2,1)' });
    });
  }, { rootMargin: '0px 0px -22px 0px', threshold: .04 });
  elements.forEach(element => {
    if (element.dataset.seen || element.getBoundingClientRect().top < innerHeight - 24) {
      element.removeAttribute('data-waiting');
      element.dataset.seen = 'true';
    } else {
      element.dataset.waiting = '';
      revealObserver.observe(element);
    }
  });
}
motionButton.addEventListener('click', () => {
  motionPreference = motionOn ? 'off' : 'on';
  try { localStorage.setItem(motionKey, motionPreference); } catch { /* Keep the current session usable. */ }
  applyMotion();
});
reducedMotion.addEventListener('change', applyMotion);
document.addEventListener('focusin', event => event.target.closest?.('.reveal')?.removeAttribute('data-waiting'));
applyMotion();

const replay = document.querySelector('#replay-intro');
replay.hidden = false;
replay.addEventListener('click', () => {
  if (!motionOn) { toast('효과를 켜면 손글씨가 쓰이는 모습을 볼 수 있어요.'); return; }
  const title = document.querySelector('.hero h1');
  title.getAnimations().forEach(animation => animation.cancel());
  title.querySelectorAll('.ink-word').forEach((word,index)=>{word.getAnimations().forEach(a=>a.cancel());word.animate([{clipPath:'inset(0 100% -30% -10%)',opacity:0},{clipPath:'inset(0 -10% -30% -10%)',opacity:1}],{duration:1100,delay:index*650,fill:'both',easing:'cubic-bezier(.4,0,.2,1)'});});
});

const message = document.querySelector('#day-message');
let timerPaused = false;
const timerToggle = document.querySelector('#timer-toggle');
timerToggle.hidden = false;
function updateDay({animate = true} = {}) {
  if (timerPaused || document.hidden) return;
  const time = countdown(wedding.startsAt), days = time.calendarDaysLeft;
  const counter = document.querySelector('#countdown');
  const rect = counter.getBoundingClientRect();
  const moving = animate && motionOn && !document.querySelector('#countdown-panel').hidden && rect.bottom > 0 && rect.top < innerHeight;
  ['days', 'hours', 'minutes', 'seconds'].forEach(unit => {
    const field = counter.querySelector(`[data-unit="${unit}"]`), next = String(time[unit]).padStart(2, '0');
    renderNumber(field,next,{animate:moving});
  });
  const progress = document.querySelector('#second-progress');
  progress.style.transition = moving && time.seconds < Number(progress.dataset.second) ? '' : 'none';
  progress.style.transform = `scaleX(${(60-time.seconds)/60})`;
  progress.dataset.second = String(time.seconds);
  counter.setAttribute('aria-label', `예식 시작까지 ${time.days}일 ${time.hours}시간 ${time.minutes}분 ${time.seconds}초`);
  document.querySelector('#countdown-caption').textContent = time.phase === 'waiting' ? '결혼식까지 남은 시간' : time.phase === 'today' ? '바로 오늘, 결혼식 날이에요' : '함께해 주신 모든 마음에 감사드립니다';
  timerToggle.hidden = time.phase !== 'waiting';
  if (message.dataset.day === String(days) && message.dataset.phase === time.phase) return;
  message.dataset.day = String(days); message.dataset.phase = time.phase;
  message.replaceChildren();
  const emphasis = document.createElement('strong');
  if (days > 0) {
    emphasis.textContent = `${days}일`;
    message.append('성우와 소희의 결혼식이 ', emphasis, ' 남았습니다.');
  } else if (days === 0) {
    message.textContent = '바로 오늘이에요. 결혼식에서 만나요.';
  } else {
    message.textContent = '함께해 주셔서 고맙습니다.';
  }
}
updateDay();
setInterval(updateDay, 1000);
document.addEventListener('visibilitychange', () => { settleDigits(document.querySelector('#countdown')); if (!document.hidden) updateDay({animate:false}); });
timerToggle.addEventListener('click', () => {
  timerPaused = !timerPaused;
  settleDigits(document.querySelector('#countdown'));
  document.querySelector('#second-progress').getAnimations().forEach(animation => animation.cancel());
  timerToggle.setAttribute('aria-pressed', String(timerPaused));
  timerToggle.textContent = timerPaused ? '실시간 다시 보기' : '초 단위 멈춤';
  updateDay({animate:false});
});
const dateTabs = [...document.querySelectorAll('.date-tabs [role="tab"]')];
function selectDateTab(tab, focus = false) {
  dateTabs.forEach(item => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  });
  if (focus) tab.focus();
  updateDay();
}
dateTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectDateTab(tab));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    selectDateTab(dateTabs[event.key === 'Home' ? 0 : event.key === 'End' ? dateTabs.length - 1 : (index + 1) % dateTabs.length], true);
  });
});
const celebrate = document.querySelector('#celebrate');
let lastCelebration = 0;
celebrate.addEventListener('click', () => {
  document.querySelector('#celebrate-label').textContent = '마음 잘 받았어요';
  document.querySelector('#celebrate-script').textContent = 'Thank you';
  if (!motionOn || Date.now() - lastCelebration < 1800) return;
  lastCelebration=Date.now();
  [-36,-8,27].forEach((drift,index)=>{
    const word=document.createElement('span');
    word.className='love-note';word.textContent=['love','merci','고마워요'][index];word.setAttribute('aria-hidden','true');
    word.style.setProperty('--drift',drift+'px');word.style.animationDelay=index*140+'ms';
    celebrate.append(word);setTimeout(()=>word.remove(),2100);
  });
});

const nav = document.querySelector('#quick-nav');
const cover = document.querySelector('.cover');
const sections = [...document.querySelectorAll('#story, #wedding-day, #gallery, #location, #guestbook, #accounts')].filter(section => !section.hidden);
const navLinks = [...nav.querySelectorAll('a')];
let scrollFrame = 0;
function updateNavigation() {
  scrollFrame = 0;
  const distance=document.documentElement.scrollHeight-innerHeight;
  document.querySelector('#reading-progress').style.transform='scaleX('+(distance>0?Math.min(1,Math.max(0,scrollY/distance)):0)+')';
  nav.hidden = cover.getBoundingClientRect().bottom > 64;
  const current = sections.filter(section => section.getBoundingClientRect().top < innerHeight * .5).at(-1);
  navLinks.forEach(link => {
    if (current && link.hash === `#${current.id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}
addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateNavigation); }, { passive: true });
addEventListener('resize', updateNavigation);
updateNavigation();

let toastTimer;
function toast(text) {
  const element = document.querySelector('#toast');
  clearTimeout(toastTimer);
  element.textContent = text;
  element.hidden = false;
  toastTimer = setTimeout(() => { element.hidden = true; }, 3200);
}
async function copyText(text, success) {
  try {
    await navigator.clipboard.writeText(text);
    toast(success); return true;
  } catch { /* Some in-app browsers restrict the asynchronous Clipboard API. */ }
  const field = document.createElement('textarea');
  field.value = text;
  field.tabIndex = -1;
  field.style.cssText = 'position:fixed;top:0;left:-9999px;font-size:16px;';
  document.body.append(field);
  const previous = document.activeElement;
  field.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { /* Keep a useful failure state. */ }
  field.remove(); previous?.focus({ preventScroll: true });
  toast(copied ? success : '복사가 제한되어 있어요. 기기의 공유 기능을 이용해 주세요.');
  return copied;
}
accountGroups.forEach(group => publishedAccounts(group).forEach((account, index) => {
  document.querySelector(`[data-account="${group.id}-${index}"]`)?.addEventListener('click', () => copyText(account.number, `${account.bank} ${account.holder} 계좌번호를 복사했어요.`));
}));

// Official Kakao rough-map source generated from the public venue page (24484800).
// Load only near this section; scroll is never trapped by the map.
let mapLoading = false, mapReady = false;
const mapHost = document.querySelector('#venue-map'), mapStatus = document.querySelector('#map-status');
const loadMapButton = document.querySelector('#load-map');
async function loadMap() {
  if (mapLoading || mapReady) return;
  mapLoading = true; loadMapButton.disabled = true;
  mapStatus.querySelector('p').textContent = '예식장 주변 지도를 불러오고 있어요.';
  try {
    const container = document.getElementById(`daumRoughmapContainer${wedding.map.timestamp}`);
    container.hidden = true;
    mapHost.querySelector('iframe')?.remove();
    const frame = document.createElement('iframe');
    frame.title = '부산 목화웨딩컨벤션 카카오 지도';
    frame.src = './map.html'; frame.loading = 'eager';
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { removeEventListener('message', onMessage); reject(new Error('map-timeout')); }, 16000);
      const onMessage = event => {
        if (event.origin !== location.origin || event.source !== frame.contentWindow || !['sungso-map-ready', 'sungso-map-error'].includes(event.data?.type)) return;
        clearTimeout(timeout); removeEventListener('message', onMessage);
        event.data.type === 'sungso-map-ready' ? resolve() : reject(new Error('map-unavailable'));
      };
      addEventListener('message', onMessage); mapHost.append(frame);
    });
    mapReady = true; mapStatus.hidden = true;
    // This is a preview map. A tap on the official marker opens Kakao; page scrolling stays natural.
  } catch {
    mapStatus.hidden = false; mapStatus.querySelector('p').textContent = '지도를 불러오지 못했어요. 아래 지도 앱에서도 위치를 확인할 수 있어요.';
    loadMapButton.textContent = '지도 다시 불러오기';
  } finally { mapLoading = false; loadMapButton.disabled = false; }
}
loadMapButton.addEventListener('click', loadMap);
if ('IntersectionObserver' in window) {
  const mapObserver = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { mapObserver.disconnect(); loadMap(); } }, { rootMargin: '250px' });
  mapObserver.observe(mapHost);
}
document.querySelector('#copy-address').addEventListener('click', () => copyText(wedding.address, '예식장 주소를 복사했어요.'));
document.querySelector('#copy-link').addEventListener('click', () => copyText(shareUrl(wedding, location), '청첩장 링크를 복사했어요.'));
document.querySelector('#share-invitation').addEventListener('click', async () => {
  const format = formatWedding(wedding.startsAt);
  if (navigator.share) {
    try {
      await navigator.share({ title: wedding.title, text: `${format.dateKorean} ${format.time}\n${wedding.venue} ${wedding.room}`, url: shareUrl(wedding, location) });
    } catch (error) {
      if (error.name !== 'AbortError') await copyText(shareUrl(wedding, location), '청첩장 링크를 복사했어요.');
    }
  } else await copyText(shareUrl(wedding, location), '청첩장 링크를 복사했어요.');
});

const tmapDialog=document.querySelector('#tmap-dialog');
document.querySelector('#open-tmap').addEventListener('click',()=>{tmapDialog.showModal();document.querySelector('#close-tmap').focus();});
document.querySelector('#close-tmap').addEventListener('click',()=>tmapDialog.close());
tmapDialog.addEventListener('close',()=>document.querySelector('#open-tmap').focus({preventScroll:true}));
document.querySelector('#tmap-copy').addEventListener('click',()=>copyText(wedding.address,'예식장 주소를 복사했어요.'));
const albumButtons=[...document.querySelectorAll('[data-album]')];
albumButtons.forEach(button=>button.addEventListener('click',()=>{
  albumButtons.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  let count=0;document.querySelectorAll('.gallery-item').forEach(item=>{item.hidden=button.dataset.album!=='all'&&item.dataset.scene!==button.dataset.album;if(!item.hidden){count++;if(motionOn)item.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:450});}});
  document.querySelector('#album-count').textContent=count+'장의 순간';
}));

const dialog = document.querySelector('#lightbox');
const fullImage = document.querySelector('#lightbox-image');
let currentPhoto = 0, trigger;
function showPhoto(index) {
  currentPhoto = photoIndex(index, photos.length);
  const photo = photos[currentPhoto];
  fullImage.src = photo.src;
  fullImage.alt = photo.alt;
  document.querySelector('#photo-download').href=photo.src;
  document.querySelector('#photo-download').download=`성우와소희-${photo.id}.webp`;
  document.querySelectorAll('[data-thumbnail]').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===currentPhoto)));
  document.querySelector(`[data-thumbnail="${currentPhoto}"]`)?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  document.querySelector('#photo-count').textContent = `${String(currentPhoto + 1).padStart(2, '0')} / ${String(photos.length).padStart(2, '0')}`;
  document.querySelector('#photo-description').textContent = photo.alt;
  if (motionOn) fullImage.animate([{ opacity: .45 }, { opacity: 1 }], { duration: 240 });
}
document.querySelectorAll('[data-photo]').forEach(button => {
  button.addEventListener('click', () => {
    trigger = button;
    showPhoto(Number(button.dataset.photo));
    dialog.showModal();
    document.querySelector('#close-photo').focus();
  });
});
document.querySelectorAll('[data-thumbnail]').forEach(button=>button.addEventListener('click',()=>showPhoto(Number(button.dataset.thumbnail))));
document.querySelector('#close-photo').addEventListener('click', () => dialog.close());
document.querySelector('#previous-photo').addEventListener('click', () => showPhoto(currentPhoto - 1));
document.querySelector('#next-photo').addEventListener('click', () => showPhoto(currentPhoto + 1));
dialog.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') { event.preventDefault(); showPhoto(currentPhoto - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); showPhoto(currentPhoto + 1); }
  if (event.key === 'Home') { event.preventDefault(); showPhoto(0); }
  if (event.key === 'End') { event.preventDefault(); showPhoto(photos.length - 1); }
});
dialog.addEventListener('close', () => {
  fullImage.removeAttribute('src');
  trigger?.focus({ preventScroll: true });
});
let pointerStart;
fullImage.addEventListener('pointerdown', event => { if (event.isPrimary) pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId }; });
fullImage.addEventListener('pointerup', event => {
  if (!pointerStart || pointerStart.id !== event.pointerId) return;
  const dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y;
  pointerStart = null;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) showPhoto(currentPhoto + (dx < 0 ? 1 : -1));
});
fullImage.addEventListener('pointercancel', () => { pointerStart = null; });
fullImage.addEventListener('dragstart', event => event.preventDefault());
fullImage.addEventListener('error', () => toast('사진을 불러오지 못했어요. 다음 사진을 보거나 다시 열어 주세요.'));
