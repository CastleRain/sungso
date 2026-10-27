/** One line, one invitation. The path lives only in the generous outer margin. */
export const theme = Object.freeze({
  id: 'a', name: '한 줄로 이어지는 초대', english: 'A line, a lifetime',
  description: '손글씨에서 시작한 한 줄이 우리의 순간들을 이어 줍니다.',
  heroDecor: '<svg class="a-cover-thread" viewBox="0 0 180 110" fill="none" aria-hidden="true"><path d="M16 15C90 8 138 19 131 47C125 70 71 72 65 53C59 32 99 22 112 47C126 75 102 91 91 106" pathLength="1"/></svg>',
  storyDecor: '<svg class="a-story-thread" viewBox="0 0 300 70" fill="none" aria-hidden="true"><path d="M4 51C70 67 166 64 213 35C241 17 264 16 287 24M276 16L289 24L278 32" pathLength="1"/></svg>',
  galleryDecor: '<span class="a-album-line" aria-hidden="true"></span>',
});

export const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
export const ease = value => { const p = clamp(value); return p * p * (3 - 2 * p); };

/** Geometry in, progress out. No element transforms are used as layout anchors. */
export function entryProgress(top, viewport, distance = .62) {
  return ease((viewport * .92 - top) / Math.max(120, viewport * distance));
}

/** All themes schedule work on demand; inactive tabs and open dialogs stay idle. */
export function createSceneDriver({ doc, win, render, measure = () => {}, reset = () => {}, className }) {
  let active = false, frame = 0, disposed = false;
  const cleanups = [];
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const available = () => active && !disposed && !doc.hidden && !doc.querySelector('dialog[open]');
  const listen = (target, type, fn, options) => {
    target?.addEventListener?.(type, fn, options);
    cleanups.push(() => target?.removeEventListener?.(type, fn, options));
  };
  function draw() { frame = 0; if (available()) render(); }
  function queue() { if (available() && !frame) frame = win.requestAnimationFrame(draw); }
  function refresh() {
    if (disposed) return;
    measure();
    if (available()) queue();
  }
  let requested = true;
  function setEnabled(value) {
    if (disposed) return;
    requested = Boolean(value);
    active = requested && !reduced?.matches;
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    doc.body?.classList.toggle(className, active);
    measure();
    if (active) queue(); else reset();
  }
  listen(win, 'scroll', queue, { passive: true });
  listen(win, 'resize', refresh, { passive: true });
  listen(win, 'pageshow', refresh);
  listen(doc, 'sungso:intro-finished', refresh);
  listen(doc, 'sungso:layout-changed', refresh);
  listen(doc, 'lab:layout-changed', refresh);
  listen(doc, 'close', refresh, true);
  listen(doc, 'visibilitychange', () => {
    if (doc.hidden) { if (frame) win.cancelAnimationFrame(frame); frame = 0; }
    else refresh();
  });
  listen(reduced, 'change', () => setEnabled(requested));
  const resize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(refresh) : null;
  const resizeTarget = doc.querySelector('.paper') || doc.body;
  if (resizeTarget) resize?.observe(resizeTarget);
  cleanups.push(() => resize?.disconnect());
  doc.fonts?.ready?.then(() => { if (!disposed) refresh(); });
  return {
    setEnabled, refresh, queue,
    destroy() {
      disposed = true;
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      cleanups.forEach(clean => clean());
      doc.body?.classList.remove(className);
      reset();
    },
  };
}

export function threadPath(points) {
  if (!points.length) return '';
  const [first, ...rest] = points;
  let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
  let previous = first;
  for (const point of rest) {
    const bend = Math.min(70, Math.max(12, (point.y - previous.y) * .22));
    d += ` C ${previous.x.toFixed(1)} ${(previous.y + bend).toFixed(1)}, ${point.x.toFixed(1)} ${(point.y - bend).toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    previous = point;
  }
  return d;
}

export function mountTheme({ doc = document, win = window, enabled = true } = {}) {
  const paper = doc.querySelector('.paper');
  const hero = doc.querySelector('.hero');
  const sections = ['invitation', 'wedding-day', 'location', 'our-story', 'gallery', 'accounts', 'guestbook']
    .map(id => doc.getElementById(id)).filter(Boolean);
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(namespace, 'svg');
  svg.setAttribute('class', 'a-page-thread');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  const quietPath = doc.createElementNS(namespace, 'path');
  quietPath.setAttribute('class', 'a-thread-quiet');
  const inkPath = doc.createElementNS(namespace, 'path');
  inkPath.setAttribute('class', 'a-thread-ink');
  inkPath.setAttribute('pathLength', '1');
  svg.append(quietPath, inkPath);
  paper?.prepend(svg);
  let startY = 0, endY = 1;

  function measure() {
    if (!paper || !hero) return;
    const paperRect = paper.getBoundingClientRect();
    const heroRect = hero.getBoundingClientRect();
    const width = paper.clientWidth;
    const height = paper.offsetHeight || paper.scrollHeight;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    const points = [{ x: width * .5, y: heroRect.bottom - paperRect.top - 12 }];
    let edge = 13;
    for (const section of sections) {
      if (section.hidden || !section.getBoundingClientRect().height) continue;
      const rect = section.getBoundingClientRect();
      const top = rect.top - paperRect.top;
      const bottom = rect.bottom - paperRect.top;
      points.push({ x: edge, y: top + 26 }, { x: edge, y: bottom - 20 });
      edge = edge < width / 2 ? width - 13 : 13;
    }
    startY = points[0].y;
    endY = points.at(-1)?.y || startY + 1;
    const path = threadPath(points);
    quietPath.setAttribute('d', path);
    inkPath.setAttribute('d', path);
  }
  function render() {
    if (!paper) return;
    const height = win.innerHeight;
    const paperRect = paper.getBoundingClientRect();
    const progress = clamp((height * .72 - paperRect.top - startY) / Math.max(1, endY - startY));
    inkPath.style.strokeDashoffset = String(1 - progress);
    const heroRect = hero?.getBoundingClientRect();
    paper.style.setProperty('--a-cover-progress', String(heroRect ? clamp(-heroRect.top / Math.max(1, heroRect.height) * 2) : 1));
    const story = doc.getElementById('our-story');
    paper.style.setProperty('--a-story-progress', String(story ? entryProgress(story.getBoundingClientRect().top, height) : 1));
    const gallery = doc.getElementById('gallery');
    paper.style.setProperty('--a-gallery-progress', String(gallery ? entryProgress(gallery.getBoundingClientRect().top, height) : 1));
  }
  function reset() {
    inkPath.style.strokeDashoffset = '0';
    paper?.style.setProperty('--a-cover-progress', '1');
    paper?.style.setProperty('--a-story-progress', '1');
    paper?.style.setProperty('--a-gallery-progress', '1');
  }
  const driver = createSceneDriver({ doc, win, render, measure, reset, className: 'theme-a-motion' });
  driver.setEnabled(enabled);
  return {
    setEnabled: driver.setEnabled,
    refresh: driver.refresh,
    destroy() { driver.destroy(); svg.remove(); },
  };
}
