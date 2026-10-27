// A table, two cups, and the actual beginning of the couple's story.
export const theme = Object.freeze({
  id: 'e',
  name: '처음 만난 테이블',
  english: 'A table for two',
  description: '커피숍에서 시작된 이야기. 두 잔의 선, 펼쳐지는 편지, 테이블 위에 놓이는 사진.',
  heroDecor: `<svg class="e-hero-thread" viewBox="0 0 400 180" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><path pathLength="1" d="M36 130C77 162 111 125 161 139S245 159 274 115C296 82 264 61 246 80C226 105 272 126 318 115L364 102" fill="none" stroke="currentColor" stroke-width=".9" stroke-linecap="round"/></svg>`,
  storyDecor: `<svg class="e-table-drawing" viewBox="0 0 420 115" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"><path class="e-cup-line" pathLength="1" d="M75 71C81 87 125 91 137 73M80 69C88 77 125 79 133 68M85 41C92 35 122 35 129 42C132 48 132 61 127 67C118 75 95 73 89 66C85 61 83 48 85 41ZM85 42C92 49 124 49 130 42M131 45C148 39 151 58 134 58M277 73C288 91 331 90 341 71M282 69C295 78 324 76 335 67M288 42C296 35 325 35 333 42C335 51 333 63 327 68C316 76 296 73 291 65C288 60 287 50 288 42ZM288 42C298 49 324 49 333 42M334 45C351 39 355 58 337 58"/><path class="e-steam e-steam-left" pathLength="1" d="M101 29C88 17 114 17 105 5M119 28C130 14 109 16 120 4"/><path class="e-steam e-steam-right" pathLength="1" d="M304 29C291 17 317 17 308 5M321 28C331 14 312 16 322 4"/><path class="e-connection" pathLength="1" d="M149 66C167 53 176 78 190 66C199 58 189 46 181 54C170 68 200 91 213 68L225 49M186 47C201 31 225 45 211 56C201 63 201 72 222 77C239 81 249 55 270 65"/><path class="e-table-edge" d="M45 99C139 103 290 103 377 99" opacity=".25"/></g></svg><span class="e-letter-fold" aria-hidden="true"></span>`,
  galleryDecor: `<svg class="e-album-thread" viewBox="0 0 460 54" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><path pathLength="1" d="M19 39C92 11 134 56 199 29C221 19 246 23 251 34C259 52 218 54 222 29C228 2 287 38 331 30C374 23 404 20 442 34" fill="none" stroke="currentColor" stroke-width=".75" stroke-linecap="round"/><path d="M222 29C221 19 226 13 230 14" fill="none" stroke="currentColor" stroke-width=".75"/></svg>`,
});

export function tableProgress(top, height) {
  if (!(height > 0) || !Number.isFinite(top)) return 1;
  const value = Math.min(1, Math.max(0, (height * .93 - top) / (height * .57)));
  return 1 - Math.pow(1 - value, 3);
}

export function tablePhotoPose(index, count, progress, compact = false) {
  if (compact || count < 2) return { x: 0, y: 0, rotation: 0, scale: 1 };
  const remaining = 1 - Math.min(1, Math.max(0, progress));
  const angles = [-4.8, 3.3, -2.7, 3.8, -3.1, 4.2];
  const column = index % 3 - 1;
  return {
    x: -column * 14 * remaining,
    y: (24 + (index % 2) * 10) * remaining,
    rotation: angles[index % angles.length] * remaining,
    scale: 1 - .035 * remaining,
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
    hero?.style.removeProperty('--e-hero-scale');
    hero?.style.removeProperty('--e-hero-y');
    story?.style.removeProperty('--e-story-progress');
    gallery?.style.removeProperty('--e-gallery-progress');
    for (const photo of photos) {
      for (const key of ['--e-photo-x', '--e-photo-y', '--e-photo-rotation', '--e-photo-scale']) photo.style.removeProperty(key);
    }
  }
  function render() {
    frame = 0;
    if (!active() || blocked()) return;
    const height = win.innerHeight || 1;
    const heroRect = hero?.getBoundingClientRect();
    // The cups and photos must still be drawing/settling when they become visible.
    const storyRect = storyAnchor?.getBoundingClientRect();
    const galleryRect = (grid || gallery)?.getBoundingClientRect();
    const compact = win.innerWidth < 360 || body?.dataset.textSize === 'large';
    const heroProgress = heroRect ? Math.min(1, Math.max(0, -heroRect.top / Math.max(1, heroRect.height))) : 0;
    if (heroRect) {
      hero.style.setProperty('--e-hero-scale', (1 + heroProgress * .022).toFixed(4));
      hero.style.setProperty('--e-hero-y', `${(heroProgress * 17).toFixed(2)}px`);
    }
    if (storyRect) {
      storyProgress = Math.max(storyProgress, tableProgress(storyRect.top, height));
      story.style.setProperty('--e-story-progress', storyProgress.toFixed(4));
    }
    if (galleryRect) {
      galleryProgress = Math.max(galleryProgress, tableProgress(galleryRect.top, height));
      gallery.style.setProperty('--e-gallery-progress', galleryProgress.toFixed(4));
      photos.forEach((photo, index) => {
        const pose = tablePhotoPose(index, photos.length, galleryProgress, compact);
        photo.style.setProperty('--e-photo-x', `${pose.x.toFixed(2)}px`);
        photo.style.setProperty('--e-photo-y', `${pose.y.toFixed(2)}px`);
        photo.style.setProperty('--e-photo-rotation', `${pose.rotation.toFixed(2)}deg`);
        photo.style.setProperty('--e-photo-scale', pose.scale.toFixed(4));
      });
    }
  }
  function queue() {
    if (active() && !blocked() && !frame) frame = win.requestAnimationFrame(render);
  }
  function sync() {
    cancel();
    body?.classList.toggle('theme-e-motion', active());
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
    if (story?.contains(event.target)) { storyProgress = 1; queue(); }
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
      body?.classList.remove('theme-e-motion');
    },
  };
}
