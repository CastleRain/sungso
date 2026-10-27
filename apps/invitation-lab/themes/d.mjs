// Three real moments, joined by light. The invitation keeps its native scroll.
export const theme = Object.freeze({
  id: 'd',
  name: '우리의 작은 별자리',
  english: 'Written in our stars',
  description: '세 번의 순간이 선으로 이어지고, 흩어진 사진이 한 장의 앨범으로 모입니다.',
  heroDecor: `<svg class="d-hero-sky" viewBox="0 0 600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width=".8"><path class="d-sky-thread" pathLength="1" d="M55 99Q117 140 172 73T337 111Q404 147 481 88L546 147"/><path d="M171 65V81M163 73H179M481 81V95M474 88H488M55 93V105M49 99H61"/></g><g fill="currentColor"><circle cx="55" cy="99" r="1.6"/><circle cx="172" cy="73" r="2"/><circle cx="337" cy="111" r="1.7"/><circle cx="481" cy="88" r="2"/><circle cx="546" cy="147" r="1.4"/><circle cx="106" cy="205" r=".9"/><circle cx="524" cy="259" r=".8"/><circle cx="43" cy="336" r=".8"/></g><path class="d-horizon" d="M76 771Q300 635 524 771" fill="none" stroke="currentColor" stroke-width=".8"/></svg>`,
  storyDecor: `<svg class="d-story-sky" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><path class="d-story-orbit" d="M18 193Q136 27 380 164" fill="none" stroke="currentColor" stroke-width=".6"/><path class="d-story-thread" pathLength="1" d="M66 142Q132 80 202 106T337 142" fill="none" stroke="currentColor" stroke-width="1"/><g class="d-story-points" fill="currentColor"><circle cx="66" cy="142" r="2.8"/><circle cx="202" cy="106" r="3.2"/><circle cx="337" cy="142" r="2.8"/></g><g fill="none" stroke="currentColor" stroke-width=".6"><circle cx="66" cy="142" r="8"/><circle cx="202" cy="106" r="10"/><circle cx="337" cy="142" r="8"/></g></svg>`,
  galleryDecor: `<svg class="d-gallery-orbit" viewBox="0 0 600 108" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="d-gallery-thread" pathLength="1" d="M12 95Q300 -76 588 95" fill="none" stroke="currentColor" stroke-width=".8"/><g fill="currentColor"><circle cx="12" cy="95" r="2"/><circle cx="300" cy="9.5" r="2.8"/><circle cx="588" cy="95" r="2"/></g></svg>`,
});

export function sceneProgress(top, height) {
  if (!(height > 0) || !Number.isFinite(top)) return 1;
  const value = Math.min(1, Math.max(0, (height * .94 - top) / (height * .62)));
  return value * value * (3 - 2 * value);
}

export function constellationPose(index, count, progress, compact = false) {
  const remaining = 1 - Math.min(1, Math.max(0, progress));
  if (compact || count < 2) return { x: 0, y: 0, rotation: 0 };
  const column = count < 3 ? index % 2 - .5 : index % 3 - 1;
  const row = Math.floor(index / 3);
  return {
    x: column * 12 * remaining,
    y: ((1 - Math.abs(column)) * 32 + row * 10 - 8) * remaining,
    rotation: column * 4.5 * remaining,
  };
}

export function mountTheme({ doc = document, win = window, enabled = true } = {}) {
  const body = doc.body;
  const hero = doc.querySelector('.hero');
  const story = doc.querySelector('#our-story');
  const storyAnchor = doc.querySelector('.story-entry') || story;
  const gallery = doc.querySelector('#gallery');
  const grid = doc.querySelector('#gallery-grid');
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let requested = Boolean(enabled), frame = 0, disposed = false;
  let storyProgress = 0, galleryProgress = 0;
  let photos = [];
  const cleanup = [];

  function listen(target, type, handler, options) {
    target?.addEventListener(type, handler, options);
    cleanup.push(() => target?.removeEventListener(type, handler, options));
  }
  function active() { return requested && !reduced?.matches && !disposed; }
  function blocked() { return doc.hidden || Boolean(doc.querySelector('dialog[open]')); }
  function cancel() { if (frame) win.cancelAnimationFrame(frame); frame = 0; }
  function clearMotion() {
    hero?.style.removeProperty('--d-hero-y');
    hero?.style.removeProperty('--d-hero-scale');
    story?.style.removeProperty('--d-story-progress');
    gallery?.style.removeProperty('--d-gallery-progress');
    for (const photo of photos) {
      for (const key of ['--d-photo-x', '--d-photo-y', '--d-photo-rotation']) photo.style.removeProperty(key);
    }
  }
  function render() {
    frame = 0;
    if (!active() || blocked()) return;
    const height = win.innerHeight || 1;
    // Start when the illustrated content enters, not its heading above the fold.
    const heroRect = hero?.getBoundingClientRect();
    const storyRect = storyAnchor?.getBoundingClientRect();
    const galleryRect = (grid || gallery)?.getBoundingClientRect();
    const compact = win.innerWidth < 360 || body?.dataset.textSize === 'large';
    const heroProgress = heroRect ? Math.min(1, Math.max(0, -heroRect.top / Math.max(1, heroRect.height))) : 0;
    if (heroRect) {
      hero.style.setProperty('--d-hero-y', `${(heroProgress * 24).toFixed(2)}px`);
      hero.style.setProperty('--d-hero-scale', (1.015 + heroProgress * .025).toFixed(4));
    }
    if (storyRect) {
      storyProgress = Math.max(storyProgress, sceneProgress(storyRect.top, height));
      story.style.setProperty('--d-story-progress', storyProgress.toFixed(4));
      if (storyProgress > .62) story.classList.add('d-story-connected');
    }
    if (galleryRect) {
      galleryProgress = Math.max(galleryProgress, sceneProgress(galleryRect.top, height));
      gallery.style.setProperty('--d-gallery-progress', galleryProgress.toFixed(4));
      photos.forEach((photo, index) => {
        const pose = constellationPose(index, photos.length, galleryProgress, compact);
        photo.style.setProperty('--d-photo-x', `${pose.x.toFixed(2)}px`);
        photo.style.setProperty('--d-photo-y', `${pose.y.toFixed(2)}px`);
        photo.style.setProperty('--d-photo-rotation', `${pose.rotation.toFixed(2)}deg`);
      });
    }
  }
  function queue() {
    if (active() && !blocked() && !frame) frame = win.requestAnimationFrame(render);
  }
  function sync() {
    cancel();
    body?.classList.toggle('theme-d-motion', active());
    if (active()) queue(); else clearMotion();
  }
  function refresh() {
    photos = [...(grid?.querySelectorAll('.gallery-photo') || [])];
    if (active()) queue(); else clearMotion();
  }
  listen(win, 'scroll', queue, { passive: true });
  listen(win, 'resize', queue, { passive: true });
  listen(win, 'pageshow', queue);
  listen(doc, 'sungso:intro-finished', queue);
  listen(doc, 'close', queue, true);
  listen(doc, 'visibilitychange', () => { cancel(); if (!doc.hidden) queue(); });
  listen(doc, 'focusin', event => {
    if (grid?.contains(event.target)) { galleryProgress = 1; queue(); }
  });
  listen(reduced, 'change', sync);
  let galleryObserver, dialogObserver;
  if (win.MutationObserver) {
    if (grid) {
      galleryObserver = new win.MutationObserver(refresh);
      galleryObserver.observe(grid, { childList: true });
    }
    if (body) {
      dialogObserver = new win.MutationObserver(() => { cancel(); queue(); });
      dialogObserver.observe(body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    }
  }
  refresh();
  sync();
  return {
    setEnabled(value) { requested = Boolean(value); sync(); },
    refresh,
    destroy() {
      if (disposed) return;
      disposed = true;
      cancel();
      cleanup.forEach(remove => remove());
      galleryObserver?.disconnect();
      dialogObserver?.disconnect();
      clearMotion();
      body?.classList.remove('theme-d-motion');
      story?.classList.remove('d-story-connected');
    },
  };
}
