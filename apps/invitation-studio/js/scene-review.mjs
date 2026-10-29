// Editor-only feedback. This controller never reloads a document or mounts guest features.
import { SECTION_IDS } from './composition.mjs';
export const REVIEW_TARGETS = SECTION_IDS;
const names = Object.freeze({ palette: '색감', font: '글씨체', motion: '전체 스크롤 효과', cover: '첫 화면', opening: '첫 손글씨', intro: '초대글 · 가족 소개', date: '예식 날짜', story: '우리의 이야기', album: '사진첩', arrival: '오시는 길', gifting: '마음 전하실 곳', wishes: '축하의 편지', navigation: '빠른 메뉴' });

export function createSceneReview({ doc = document, win = window, enabled = true } = {}) {
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const cleanups = [], animations = new Set();
  let requested = Boolean(enabled), disposed = false, timer = 0, serial = 0, target = null;
  const notice = doc.createElement('div'); notice.id = 'scene-review-notice'; notice.className = 'scene-review-notice'; notice.hidden = true;
  notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite'); notice.setAttribute('aria-atomic', 'true');
  const caption = doc.createElement('small'); caption.textContent = '지금 바뀐 장면';
  const title = doc.createElement('span'); notice.append(caption, title); doc.body.append(notice);
  const marker = doc.createElement('span'); marker.className = 'scene-review-marker'; marker.setAttribute('aria-hidden', 'true');
  const listen = (node, name, fn, options) => { node?.addEventListener?.(name, fn, options); cleanups.push(() => node?.removeEventListener?.(name, fn, options)); };
  const blocked = () => doc.hidden || Boolean(doc.querySelector('dialog[open]'));
  const canMove = () => requested && !reduced?.matches && !doc.documentElement.classList.contains('motion-off') && !blocked();
  function cancelAnimations() { animations.forEach(animation => animation.cancel()); animations.clear(); }
  function cancel() {
    serial++;
    win.clearTimeout(timer); timer = 0;
    cancelAnimations(); marker.remove();
    target?.classList.remove('scene-review-target'); target = null;
    notice.hidden = true; title.textContent = '';
  }
  function animate(node, frames, timing = {}) {
    if (!node?.animate || !canMove()) return;
    try {
      const animation = node.animate(frames, { duration: 620, easing: 'cubic-bezier(.2,.75,.2,1)', fill: 'both', ...timing });
      animations.add(animation);
      // Remove only our own effect after it ends. The scene's natural scroll styles remain.
      animation.finished?.then(() => { if (animations.delete(animation)) animation.cancel(); }, () => animations.delete(animation));
    } catch { /* An unsupported animation must never hide the content. */ }
  }
  function enter(node, delay = 0) {
    animate(node, [{ opacity: .55, translate: '0 13px' }, { opacity: 1, translate: '0 0' }], { delay });
  }
  function playScene(key) {
    // Opening and cover are owned by the actual handwriting / cover controllers.
    if (key === 'cover' || key === 'opening' || key === 'motion') return;
    enter(target.querySelector('.section-title') || target.querySelector('h2'));
    if (key === 'palette' || key === 'font' || key === 'intro') {
      enter(target.querySelector('.invitation-copy'), 55);
      [...target.querySelectorAll('.family-person')].forEach((node, index) => enter(node, 100 + index * 65));
      if (key === 'intro') target.querySelectorAll('.upper-ribbon path').forEach(node => animate(node, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 1000 }));
    } else if (key === 'date') {
      enter(target.querySelector('.date-face'), 45);
      const details = target.querySelector('.date-detail');
      animate(details, [{ opacity: .4, rotate: 'x -12deg', translate: '0 10px' }, { opacity: 1, rotate: 'x 0deg', translate: '0 0' }], { delay: 110, duration: 720 });
      animate(target.querySelector('.upper-date-orbit'), [{ rotate: '-22deg' }, { rotate: '0deg' }], { duration: 1000 });
    } else if (key === 'story') {
      enter(target.querySelector('.story-image'), 45); enter(target.querySelector('.story-copy'), 100);
      [...target.querySelectorAll('.story-chapters button')].forEach((node, index) => enter(node, 120 + index * 60));
    } else if (key === 'album') {
      if (doc.body.dataset.album === 'grid') [...target.querySelectorAll('.gallery-photo')].slice(0, 6).forEach((node, index) => enter(node, index * 45));
      else { enter(target.querySelector('.album-feature'), 55); enter(target.querySelector('.album-filmstrip'), 120); }
    } else if (key === 'arrival') {
      enter(target.querySelector('.arrival-title'), 50); enter(target.querySelector('.journey'), 100);
    } else if (key === 'gifting') {
      enter(target.querySelector('.account-panel-frame'), 70);
    } else if (key === 'wishes') {
      enter(target.querySelector('#guestbook-write'), 55);
    } else if (key === 'navigation') {
      enter(doc.querySelector('.experience-dock'), 35);
    }
  }
  function show({ section, key, label } = {}) {
    cancel();
    if (disposed || !Object.hasOwn(REVIEW_TARGETS, key) || REVIEW_TARGETS[key] !== section || blocked()) return false;
    const next = section === 'top' ? doc.querySelector('.hero') : doc.getElementById(section);
    if (!next) return false;
    target = next;
    target.classList.add('scene-review-target');
    const safeLabel = typeof label === 'string' ? label.trim().slice(0, 80) : '';
    title.textContent = `${names[key]}${safeLabel ? ` · ${safeLabel}` : ''}`;
    notice.hidden = false;
    if (key !== 'cover' && key !== 'opening') {
      target.append(marker);
      animate(marker, [{ opacity: 0, scale: '1 .2' }, { opacity: .8, scale: '1 1' }], { duration: 450 });
    }
    animate(notice, [{ opacity: 0, translate: '0 -5px' }, { opacity: 1, translate: '0 0' }], { duration: 220 });
    playScene(key);
    const current = serial;
    timer = win.setTimeout(() => { if (current === serial) cancel(); }, 2700);
    return true;
  }
  listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
  listen(doc, 'lab:dialog-change', () => { if (blocked()) cancel(); });
  listen(doc, 'focusin', () => cancelAnimations());
  listen(doc, 'pointerdown', () => cancelAnimations(), { passive: true });
  listen(win, 'pagehide', cancel);
  listen(reduced, 'change', () => { if (reduced.matches) cancelAnimations(); });
  return {
    show, cancel,
    setEnabled(value) { requested = Boolean(value); if (!requested) cancelAnimations(); },
    destroy() { if (disposed) return; cancel(); disposed = true; cleanups.forEach(fn => fn()); notice.remove(); },
  };
}
