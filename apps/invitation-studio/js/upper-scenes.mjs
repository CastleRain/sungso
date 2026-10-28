/** Short native-scroll scenes for the cover, invitation and wedding date. */
export const upperClamp = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
export function upperEntry(top, viewport) {
  if (!Number.isFinite(top) || !Number.isFinite(viewport) || viewport <= 0) return 0;
  const p = upperClamp((viewport * .88 - top) / Math.max(180, viewport * .72));
  return p * p * (3 - 2 * p);
}
export function upperCover(top, height) {
  if (!Number.isFinite(top) || !Number.isFinite(height) || height <= 0) return 0;
  return upperClamp(-top / (height * .7));
}

const choices = Object.freeze({
  cover: ['cinema', 'curtain', 'aperture'],
  intro: ['letter', 'together', 'ribbon'],
  date: ['ticket', 'orbit', 'flip'],
});
export function normalizeUpper(input = {}) {
  return Object.fromEntries(Object.entries(choices).map(([key, values]) => [key, values.includes(input?.[key]) ? input[key] : values[0]]));
}

export function mountUpperScenes({ doc = document, win = window, enabled = true, composition } = {}) {
  let active = false, requested = Boolean(enabled), destroyed = false, frame = 0;
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const body = doc.body, hero = doc.querySelector('.hero'), invite = doc.querySelector('.invitation-section'), date = doc.querySelector('.date-scene');
  const cleanups = [], nodes = [], settled = new Set();
  const oldData = Object.fromEntries(Object.keys(choices).map(key => [key, body.dataset[key]]));
  const listen = (node, type, fn, options) => {
    node?.addEventListener?.(type, fn, options);
    cleanups.push(() => node?.removeEventListener?.(type, fn, options));
  };
  const append = (parent, tag, className) => {
    if (!parent) return null;
    const node = doc.createElement(tag); node.className = className;
    node.setAttribute('aria-hidden', 'true'); parent.append(node); nodes.push(node); return node;
  };
  const svg = (parent, className, viewBox, paths) => {
    if (!parent) return null;
    const node = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('class', className); node.setAttribute('viewBox', viewBox); node.setAttribute('aria-hidden', 'true'); node.setAttribute('focusable', 'false');
    for (const [tag, attributes] of paths) {
      const child = doc.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key, value] of Object.entries(attributes)) child.setAttribute(key, value);
      node.append(child);
    }
    parent.append(node); nodes.push(node); return node;
  };
  const curtains = append(hero, 'div', 'upper-curtains');
  append(curtains, 'span', 'upper-curtain upper-curtain-left');
  append(curtains, 'span', 'upper-curtain upper-curtain-right');
  append(hero, 'span', 'upper-aperture-edge');
  const family = invite?.querySelector('.family-lines');
  const join = append(family, 'span', 'upper-family-join');
  if (join) join.textContent = '&';
  svg(invite?.querySelector('.section-inner'), 'upper-ribbon', '0 0 420 440', [
    ['path', { d: 'M8 105C100 18 379 17 390 142S40 261 44 318S267 402 409 355', fill: 'none', stroke: 'currentColor', 'stroke-width': '1', pathLength: '1' }],
    ['path', { d: 'M14 116C114 33 367 25 379 145S48 266 54 316S269 393 400 349', fill: 'none', stroke: 'currentColor', 'stroke-width': '.5', pathLength: '1' }],
  ]);
  svg(date?.querySelector('.date-face'), 'upper-date-orbit', '0 0 200 200', [
    ['circle', { cx: '100', cy: '100', r: '85', fill: 'none', stroke: 'currentColor', 'stroke-width': '.6' }],
    ['circle', { cx: '100', cy: '100', r: '93', fill: 'none', stroke: 'currentColor', 'stroke-width': '.5', 'stroke-dasharray': '1 9' }],
    ['circle', { class: 'upper-orbit-dot', cx: '100', cy: '15', r: '4', fill: 'currentColor' }],
  ]);
  append(date?.querySelector('.date-detail'), 'span', 'upper-page-hinge');

  const canPaint = () => !destroyed && active && !doc.hidden && !doc.querySelector('dialog[open]');
  const set = (node, property, value) => node?.style.setProperty(property, String(value));
  function cancel() { if (frame) win.cancelAnimationFrame(frame); frame = 0; }
  function finalState() {
    set(hero, '--upper-cover', 0); set(hero, '--cover', 0);
    set(invite, '--upper-intro', 1); set(date, '--upper-date', 1); set(date, '--scene', 1);
  }
  function render() {
    frame = 0;
    if (!canPaint()) return;
    const heroRect = hero?.getBoundingClientRect();
    // The independent handwriting controller owns the initial lock and all ink timing.
    const opening = doc.documentElement.classList.contains('intro-locked');
    const coverProgress = !opening && heroRect ? upperCover(heroRect.top, heroRect.height) : 0;
    set(hero, '--upper-cover', settled.has(hero) ? 0 : coverProgress);
    const viewport = win.innerHeight;
    for (const [node, property] of [[invite, '--upper-intro'], [date, '--upper-date']]) {
      if (!node) continue;
      set(node, property, settled.has(node) ? 1 : upperEntry(node.getBoundingClientRect().top, viewport));
    }
  }
  function schedule() { if (canPaint() && !frame) frame = win.requestAnimationFrame(render); }
  function updateEnabled() {
    active = requested && !reduced?.matches;
    body.classList.toggle('upper-scenes-active', active);
    cancel(); if (active) schedule(); else finalState();
  }
  function setComposition(value) {
    if (destroyed) return;
    const state = normalizeUpper(value);
    for (const key of Object.keys(choices)) body.dataset[key] = state[key];
    settled.clear();
    if (active) schedule(); else finalState();
  }

  listen(win, 'scroll', schedule, { passive: true }); listen(win, 'resize', schedule, { passive: true });
  listen(doc, 'sungso:intro-finished', schedule); listen(doc, 'lab:layout-changed', schedule);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); else schedule(); });
  listen(doc, 'lab:dialog-change', () => { if (doc.querySelector('dialog[open]')) cancel(); else schedule(); });
  listen(reduced, 'change', updateEnabled);
  listen(doc, 'focusin', event => {
    for (const [node, property] of [[hero, '--upper-cover'], [invite, '--upper-intro'], [date, '--upper-date']]) {
      if (node?.contains(event.target)) { settled.add(node); set(node, property, node === hero ? 0 : 1); }
    }
  });
  body.classList.add('upper-scenes-ready');
  setComposition(composition); updateEnabled();
  return {
    setEnabled(value) { if (destroyed) return; requested = Boolean(value); updateEnabled(); },
    setComposition,
    prepareDemo() {
      settled.clear(); schedule();
      return () => {
        settled.add(invite); settled.add(date);
        set(invite, '--upper-intro', 1); set(date, '--upper-date', 1);
      };
    },
    refresh() { if (destroyed) return; if (active) schedule(); else finalState(); },
    destroy() {
      if (destroyed) return;
      destroyed = true; cancel(); cleanups.forEach(fn => fn());
      nodes.reverse().forEach(node => node?.remove());
      for (const key of Object.keys(choices)) { if (oldData[key] === undefined) delete body.dataset[key]; else body.dataset[key] = oldData[key]; }
      for (const [node, keys] of [[hero, ['--upper-cover', '--cover']], [invite, ['--upper-intro']], [date, ['--upper-date', '--scene']]]) keys.forEach(key => node?.style.removeProperty(key));
      body.classList.remove('upper-scenes-ready', 'upper-scenes-active');
    },
  };
}
