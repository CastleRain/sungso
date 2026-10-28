import { mountGalleryExperience } from './gallery-experience.mjs';

const STORIES = new Set(['chapters', 'line', 'fold', 'light', 'constellation', 'cafe']);
const ALBUMS = new Set(['stack', 'contact', 'grid']);
export function contentChoices(value = {}) {
  return { story: STORIES.has(value?.story) ? value.story : 'chapters', album: ALBUMS.has(value?.album) ? value.album : 'stack' };
}
export function contentProgress(top, viewport) {
  if (!Number.isFinite(top) || !(viewport > 0)) return 1;
  const p = Math.max(0, Math.min(1, (viewport * .88 - top) / (viewport * .72)));
  return p * p * (3 - 2 * p);
}

/** The same real story and album, with independently selectable presentation. */
export function mountContentScenes({ doc = document, win = window, gallery, enabled = true, composition, albumFactory = mountGalleryExperience } = {}) {
  const story = doc.getElementById('our-story'), entry = story?.querySelector('.story-entry');
  const grid = doc.getElementById('gallery-grid');
  const previous = { story: doc.body.dataset.story, album: doc.body.dataset.album };
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const cleanups = [], decorations = [];
  let choices = contentChoices(composition), requested = Boolean(enabled), scrollEnabled = true, frame = 0, disposed = false, progress = 0;
  const album = albumFactory({ doc, win, gallery, enabled: false });
  const active = () => requested && !reduced?.matches && !disposed;
  const blocked = () => doc.hidden || Boolean(doc.querySelector('dialog[open]'));
  const listen = (target, event, fn, options) => {
    target?.addEventListener(event, fn, options);
    cleanups.push(() => target?.removeEventListener(event, fn, options));
  };
  function element(tag, attributes, parent) {
    const node = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    parent?.append(node); return node;
  }
  function illustration(className, viewBox, paths) {
    if (!entry) return;
    const svg = element('svg', { class: `studio-story-art ${className}`, viewBox, 'aria-hidden': 'true', focusable: 'false', fill: 'none' });
    for (const [d, className = 'story-ink'] of paths) element('path', { d, class: className, pathLength: 1, stroke: 'currentColor', 'stroke-width': 1, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    entry.append(svg); decorations.push(svg); return svg;
  }
  illustration('story-line-art', '0 0 400 90', [
    ['M16 65C67 27 111 71 164 45C204 26 257 18 285 42C311 65 276 87 258 60C244 35 320 23 381 41'],
    ['M370 32L383 41L370 49'],
  ]);
  const sky = illustration('story-sky-art', '0 0 400 200', [
    ['M20 169Q170 -2 380 151', 'story-orbit'],
    ['M55 133Q120 73 204 104T345 133'],
    ['M55 123V143M45 133H65M204 90V118M190 104H218M345 123V143M335 133H355', 'story-stars'],
  ]);
  if (sky) [[55,133,3],[204,104,4],[345,133,3]].forEach(([cx,cy,r]) => element('circle', { cx, cy, r, fill: 'currentColor', class: 'story-star-point' }, sky));
  illustration('story-cafe-art', '0 0 420 115', [
    ['M75 71C81 87 125 91 137 73M80 69C88 77 125 79 133 68M85 41C92 35 122 35 129 42C132 48 132 61 127 67C118 75 95 73 89 66C85 61 83 48 85 41ZM85 42C92 49 124 49 130 42M131 45C148 39 151 58 134 58M277 73C288 91 331 90 341 71M282 69C295 78 324 76 335 67M288 42C296 35 325 35 333 42C335 51 333 63 327 68C316 76 296 73 291 65C288 60 287 50 288 42ZM288 42C298 49 324 49 333 42M334 45C351 39 355 58 337 58'],
    ['M101 29C88 17 114 17 105 5M119 28C130 14 109 16 120 4M304 29C291 17 317 17 308 5M321 28C331 14 312 16 322 4', 'story-steam'],
    ['M149 66C167 53 176 78 190 66C199 58 189 46 181 54C170 68 200 91 213 68L225 49M186 47C201 31 225 45 211 56C201 63 201 72 222 77C239 81 249 55 270 65'],
    ['M45 99C139 103 290 103 377 99', 'story-orbit'],
  ]);
  function cancel() { if (frame) win.cancelAnimationFrame(frame); frame = 0; }
  function render() {
    frame = 0;
    if (!active() || !scrollEnabled || blocked() || !entry) return;
    const bounds = entry.getBoundingClientRect();
    // Completed reading remains visible when returning upwards or closing a chapter.
    progress = Math.max(progress, contentProgress(bounds.top, win.innerHeight));
    story.style.setProperty('--content-progress', String(progress));
  }
  function queue() { if (active() && scrollEnabled && !blocked() && !frame) frame = win.requestAnimationFrame(render); }
  function sync() {
    cancel();
    doc.body.classList.toggle('content-motion', active() && scrollEnabled);
    album.setEnabled(active() && choices.album !== 'grid');
    album.setScrollEnabled?.(scrollEnabled);
    if (!active() || !scrollEnabled) story?.style.setProperty('--content-progress', '1');
    else queue();
  }
  function setComposition(value) {
    if (disposed) return;
    const next = contentChoices(value);
    if (next.story !== choices.story) progress = 0;
    choices = next;
    doc.body.dataset.story = choices.story; doc.body.dataset.album = choices.album;
    // Keep one album controller mounted so selection survives stack/contact/grid changes.
    if (grid) grid.hidden = choices.album !== 'grid';
    sync(); album.refresh();
  }
  listen(win, 'scroll', queue, { passive: true });
  listen(win, 'resize', queue, { passive: true });
  listen(win, 'pageshow', queue);
  listen(doc, 'lab:layout-changed', queue);
  listen(doc, 'lab:dialog-change', () => { cancel(); if (!blocked()) queue(); });
  listen(doc, 'visibilitychange', () => { cancel(); if (!doc.hidden) queue(); });
  listen(doc, 'focusin', event => {
    if (story?.contains(event.target)) { progress = 1; story.style.setProperty('--content-progress', '1'); }
  });
  listen(reduced, 'change', sync);
  setComposition(choices);
  return {
    setComposition,
    prepareDemo(key) {
      progress = 0; queue();
      const finishAlbum = key === 'album' ? album.prepareDemo?.() : null;
      return () => { progress = 1; story?.style.setProperty('--content-progress', '1'); finishAlbum?.(); };
    },
    demoInteraction() {
      if (choices.album !== 'grid') return album.demoNext?.() || (() => {});
      // The grid has no selected-photo state. Show its next real thumbnail without opening a dialog.
      const next = grid?.querySelectorAll('.gallery-photo')?.[1];
      next?.classList.add('studio-demo-photo');
      return () => next?.classList.remove('studio-demo-photo');
    },
    setEnabled(value) { if (disposed) return; requested = Boolean(value); sync(); },
    setScrollEnabled(value) { if (disposed) return; scrollEnabled = Boolean(value); sync(); },
    refresh() { if (!disposed) { album.refresh(); queue(); } },
    destroy() {
      if (disposed) return;
      disposed = true; cancel(); album.destroy(); cleanups.forEach(clean => clean()); decorations.forEach(node => node.remove());
      doc.body.classList.remove('content-motion'); story?.style.removeProperty('--content-progress');
      for (const key of ['story', 'album']) { if (previous[key] === undefined) delete doc.body.dataset[key]; else doc.body.dataset[key] = previous[key]; }
    },
  };
}
