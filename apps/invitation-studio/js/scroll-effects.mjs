/** Global reading rhythm, independent from a section's chosen illustration or interaction. */
export const SCROLL_EFFECTS = Object.freeze(['signature', 'rise', 'focus', 'drift', 'unveil', 'breathe', 'still']);
export const normalizeScrollEffect = value => SCROLL_EFFECTS.includes(value) ? value : 'signature';

export function scrollEntrance(top, viewport) {
  if (!Number.isFinite(top) || !Number.isFinite(viewport) || viewport <= 0) return 1;
  const p = Math.max(0, Math.min(1, (viewport * .94 - top) / Math.max(180, viewport * .62)));
  return p * p * (3 - 2 * p);
}

const properties = ['--global-scroll-opacity', '--global-scroll-y', '--global-scroll-scale', '--global-scroll-blur', '--global-scroll-x', '--global-scroll-breathe', '--global-scroll-veil', '--global-scroll-wipe'];
const animatedModes = new Set(['rise', 'focus', 'drift', 'unveil', 'breathe']);

/** Scroll/resize requests one frame only; read sections never fade away again. */
export function mountScrollEffects({ doc = document, win = window, enabled = true, mode = 'signature' } = {}) {
  const body = doc.body, reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const previousMode = body.dataset.scrollEffect;
  const previousActive = body.classList.contains('global-scroll-active');
  const targets = new Map(), cleanups = [], animations = new Set();
  let requested = Boolean(enabled), current = normalizeScrollEffect(mode), frame = 0, disposed = false;
  const listen = (node, type, callback, options) => {
    node?.addEventListener?.(type, callback, options);
    cleanups.push(() => node?.removeEventListener?.(type, callback, options));
  };
  const blocked = () => doc.hidden || Boolean(doc.querySelector('dialog[open]'));
  const active = () => !disposed && requested && !reduced?.matches && !doc.documentElement.classList.contains('motion-off') && animatedModes.has(current);
  const cancel = () => { if (frame) win.cancelAnimationFrame(frame); frame = 0; };
  function cancelAnimations() { animations.forEach(animation => animation.cancel()); animations.clear(); }

  function paint(node, progress) {
    node.style.setProperty('--global-scroll-opacity', String(.68 + .32 * progress));
    node.style.setProperty('--global-scroll-y', `${16 * (1 - progress)}px`);
    node.style.setProperty('--global-scroll-scale', String(.98 + .02 * progress));
    node.style.setProperty('--global-scroll-blur', `${1.2 * (1 - progress)}px`);
    node.style.setProperty('--global-scroll-x', `${18 * (1 - progress) * (targets.get(node)?.direction || 1)}px`);
    node.style.setProperty('--global-scroll-breathe', String(1 + .035 * (1 - progress)));
    node.style.setProperty('--global-scroll-veil', String(.24 * (1 - progress)));
    node.style.setProperty('--global-scroll-wipe', `${100 * progress}%`);
  }
  function restore(node, record) {
    properties.forEach(property => {
      const previous = record.original.get(property);
      if (previous.value) node.style.setProperty(property, previous.value, previous.priority);
      else node.style.removeProperty(property);
    });
    if (!record.hadClass) node.classList.remove('global-scroll-target');
  }
  function collect() {
    const next = new Set(doc.querySelectorAll('main.paper > .section > .section-inner'));
    for (const [node, record] of targets) if (!next.has(node)) { restore(node, record); targets.delete(node); }
    for (const node of next) if (!targets.has(node)) {
      targets.set(node, {
        section: node.parentElement,
        progress: 0,
        hadClass: node.classList.contains('global-scroll-target'),
        original: new Map(properties.map(property => [property, { value: node.style.getPropertyValue(property), priority: node.style.getPropertyPriority?.(property) || '' }])),
      });
      node.classList.add('global-scroll-target');
    }
    // Reordering changes the reading rhythm, without replacing an existing target.
    [...next].forEach((node, index) => { targets.get(node).direction = index % 2 ? 1 : -1; });
  }
  function readable() { for (const node of targets.keys()) paint(node, 1); }
  function render() {
    frame = 0;
    if (disposed) return;
    if (!active() || blocked()) { readable(); return; }
    for (const [node, record] of targets) {
      // Measure the stable parent, never the transformed/blurred content itself.
      const top = record.section?.getBoundingClientRect().top;
      record.progress = Math.max(record.progress, scrollEntrance(top, win.innerHeight));
      if (record.progress > .995) record.progress = 1;
      paint(node, record.progress);
    }
  }
  function schedule() {
    if (disposed || !active() || blocked()) return;
    if (!frame) frame = win.requestAnimationFrame(render);
  }
  function sync() {
    cancel(); cancelAnimations();
    body.dataset.scrollEffect = current;
    body.classList.toggle('global-scroll-active', active());
    if (!active() || blocked()) readable(); else schedule();
  }
  function refresh() {
    if (disposed) return;
    collect(); sync();
  }
  function settleInteraction(event) {
    cancelAnimations();
    for (const [node, record] of targets) if (node.contains(event.target)) { record.progress = 1; paint(node, 1); }
  }
  function replay(sectionId) {
    cancelAnimations();
    if (!active() || blocked() || typeof sectionId !== 'string') return false;
    const target = [...targets].find(([, record]) => record.section?.id === sectionId);
    if (!target) return false;
    const [node, record] = target;
    record.progress = 1; paint(node, 1);
    if (!node.animate) return false;
    const frames = {
      rise: [{ opacity: .68, translate: '0 16px' }, { opacity: 1, translate: '0 0' }],
      focus: [{ opacity: .68, scale: .98, filter: 'blur(1.2px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)' }],
      drift: [{ opacity: .68, translate: `${18 * record.direction}px 0` }, { opacity: 1, translate: '0 0' }],
      unveil: [{ opacity: .78 }, { opacity: 1 }],
      breathe: [{ opacity: .78, scale: 1.035 }, { opacity: 1, scale: 1 }],
    }[current];
    const track = animation => {
      animations.add(animation);
      animation.finished?.then(() => animations.delete(animation), () => animations.delete(animation));
    };
    try {
      const animation = node.animate(frames, { duration: 650, easing: 'cubic-bezier(.2,.75,.2,1)', fill: 'none' });
      track(animation);
      if (current === 'unveil') {
        // Only the decorative pseudo-element is clipped. The readable, interactive
        // content remains intact, including in browsers without pseudo-element WAAPI.
        try {
          const veil = node.animate([
            { opacity: .24, clipPath: 'inset(0 0% 0 0)' },
            { opacity: 0, clipPath: 'inset(0 100% 0 0)' },
          ], { duration: 800, easing: 'cubic-bezier(.2,.75,.2,1)', fill: 'none', pseudoElement: '::after' });
          track(veil);
          // Older engines may silently ignore this option. Cancel synchronously
          // before the next paint rather than accidentally clipping the content.
          if (veil.effect?.pseudoElement !== '::after') { veil.cancel(); animations.delete(veil); }
        } catch { /* The content opacity replay is still available. */ }
      }
      return true;
    } catch { return false; }
  }
  listen(win, 'scroll', schedule, { passive: true });
  listen(win, 'resize', schedule, { passive: true });
  listen(win, 'pageshow', refresh);
  listen(doc, 'lab:layout-changed', refresh);
  listen(doc, 'lab:motion-change', sync);
  listen(doc, 'visibilitychange', sync);
  listen(doc, 'lab:dialog-change', sync);
  listen(doc, 'focusin', settleInteraction);
  listen(doc, 'pointerdown', settleInteraction, { passive: true });
  listen(reduced, 'change', sync);
  refresh();

  return {
    setMode(value) {
      if (disposed) return;
      const next = normalizeScrollEffect(value);
      if (next !== current) {
        current = next;
        for (const record of targets.values()) record.progress = 0;
      }
      refresh();
    },
    setEnabled(value) { if (disposed) return; requested = Boolean(value); sync(); },
    refresh,
    replay,
    destroy() {
      if (disposed) return;
      disposed = true; cancel(); cancelAnimations(); cleanups.forEach(cleanup => cleanup());
      for (const [node, record] of targets) restore(node, record);
      targets.clear();
      if (previousMode === undefined) delete body.dataset.scrollEffect; else body.dataset.scrollEffect = previousMode;
      body.classList.toggle('global-scroll-active', previousActive);
    },
  };
}
