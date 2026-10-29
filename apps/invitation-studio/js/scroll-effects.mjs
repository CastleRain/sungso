/** Global reading rhythm, independent from a section's chosen illustration or interaction. */
export const SCROLL_EFFECTS = Object.freeze(['signature', 'rise', 'focus', 'drift', 'unveil', 'breathe', 'still']);
export const normalizeScrollEffect = value => SCROLL_EFFECTS.includes(value) ? value : 'signature';
export const normalizeMotionValue = value => typeof value === 'number' && Number.isFinite(value)
  ? Math.round(Math.min(1.5, Math.max(.5, value)) * 4) / 4 : 1;

export function scrollEntrance(top, viewport, speed = 1) {
  if (!Number.isFinite(top) || !Number.isFinite(viewport) || viewport <= 0) return 1;
  // The native viewport always follows the user's input. Speed changes how far
  // the entrance has unfolded at the same scroll position, never wheel/touch rate.
  const p = Math.max(0, Math.min(1, (viewport * .94 - top) / Math.max(180, viewport * .62))) ** (1 / normalizeMotionValue(speed));
  return p * p * (3 - 2 * p);
}

const properties = ['--global-scroll-opacity', '--global-scroll-y', '--global-scroll-scale', '--global-scroll-blur', '--global-scroll-x', '--global-scroll-breathe', '--global-scroll-veil', '--global-scroll-wipe'];
const animatedModes = new Set(['rise', 'focus', 'drift', 'unveil', 'breathe']);

/** Scroll/resize requests one frame only; read sections never fade away again. */
export function mountScrollEffects({ doc = document, win = window, enabled = true, mode = 'signature', speed = 1, strength = 1 } = {}) {
  const body = doc.body, reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const previousMode = body.dataset.scrollEffect;
  const previousActive = body.classList.contains('global-scroll-active');
  const targets = new Map(), cleanups = [], animations = new Set();
  let requested = Boolean(enabled), current = normalizeScrollEffect(mode), frame = 0, disposed = false;
  let currentSpeed = normalizeMotionValue(speed), currentStrength = normalizeMotionValue(strength);
  const listen = (node, type, callback, options) => {
    node?.addEventListener?.(type, callback, options);
    cleanups.push(() => node?.removeEventListener?.(type, callback, options));
  };
  const blocked = () => doc.hidden || Boolean(doc.querySelector('dialog[open]'));
  const active = () => !disposed && requested && !reduced?.matches && !doc.documentElement.classList.contains('motion-off') && animatedModes.has(current);
  const cancel = () => { if (frame) win.cancelAnimationFrame(frame); frame = 0; };
  function cancelAnimations() { animations.forEach(animation => animation.cancel()); animations.clear(); }

  function paint(node, progress) {
    const remaining = 1 - progress, alpha = Math.round(Math.max(.5, 1 - .32 * currentStrength) * 10000) / 10000;
    node.style.setProperty('--global-scroll-opacity', String(alpha + (1 - alpha) * progress));
    node.style.setProperty('--global-scroll-y', `${44 * currentStrength * remaining}px`);
    node.style.setProperty('--global-scroll-scale', String(1 - .1 * currentStrength * remaining));
    node.style.setProperty('--global-scroll-blur', `${3.5 * currentStrength * remaining}px`);
    node.style.setProperty('--global-scroll-x', `${44 * currentStrength * remaining * (targets.get(node)?.direction || 1)}px`);
    node.style.setProperty('--global-scroll-breathe', String(1 + .09 * currentStrength * remaining));
    node.style.setProperty('--global-scroll-veil', String(Math.min(.85, .72 * currentStrength) * remaining));
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
    [...next].filter(node => !targets.get(node).section?.hidden).forEach((node, index) => { targets.get(node).direction = index % 2 ? 1 : -1; });
  }
  function readable() { for (const node of targets.keys()) paint(node, 1); }
  function render() {
    frame = 0;
    if (disposed) return;
    if (!active() || blocked()) { readable(); return; }
    for (const [node, record] of targets) {
      if (record.section?.hidden) continue;
      // Measure the stable parent, never the transformed/blurred content itself.
      const top = record.section?.getBoundingClientRect().top;
      record.progress = Math.max(record.progress, scrollEntrance(top, win.innerHeight, currentSpeed));
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
    const alpha = Math.round(Math.max(.5, 1 - .32 * currentStrength) * 10000) / 10000;
    const frames = {
      rise: [{ opacity: alpha, translate: `0 ${44 * currentStrength}px` }, { opacity: 1, translate: '0 0' }],
      focus: [{ opacity: alpha, scale: 1 - .1 * currentStrength, filter: `blur(${3.5 * currentStrength}px)` }, { opacity: 1, scale: 1, filter: 'blur(0px)' }],
      drift: [{ opacity: alpha, translate: `${44 * currentStrength * record.direction}px 0` }, { opacity: 1, translate: '0 0' }],
      unveil: [{ opacity: alpha }, { opacity: 1 }],
      breathe: [{ opacity: alpha, scale: 1 + .09 * currentStrength }, { opacity: 1, scale: 1 }],
    }[current];
    const track = animation => {
      animations.add(animation);
      animation.finished?.then(() => animations.delete(animation), () => animations.delete(animation));
    };
    try {
      const animation = node.animate(frames, { duration: 650 / currentSpeed, easing: 'cubic-bezier(.2,.75,.2,1)', fill: 'none' });
      track(animation);
      if (current === 'unveil') {
        // Only the decorative pseudo-element is clipped. The readable, interactive
        // content remains intact, including in browsers without pseudo-element WAAPI.
        try {
          const veil = node.animate([
            { opacity: Math.min(.85, .72 * currentStrength), clipPath: 'inset(0 0 0 0%)' },
            { opacity: 0, clipPath: 'inset(0 0 0 100%)' },
          ], { duration: 800 / currentSpeed, easing: 'cubic-bezier(.2,.75,.2,1)', fill: 'none', pseudoElement: '::after' });
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
    setComposition(value) {
      if (disposed) return;
      currentSpeed = normalizeMotionValue(value?.motionSpeed);
      currentStrength = normalizeMotionValue(value?.motionStrength);
      refresh();
    },
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
    prepareDemo() {
      cancel(); cancelAnimations();
      const before = new Map([...targets].map(([node, record]) => [node, record.progress]));
      let restored = false;
      for (const record of targets.values()) record.progress = 0;
      render();
      return () => {
        if (restored || disposed) return;
        restored = true;
        cancel(); cancelAnimations();
        // Settle what is on screen or was already read. Do not consume the entrance
        // of unread sections below the viewport merely because a demo finished.
        for (const [node, record] of targets) {
          if (record.section?.hidden) { record.progress = before.get(node) || 0; paint(node, record.progress); continue; }
          const top = record.section?.getBoundingClientRect().top;
          record.progress = !Number.isFinite(top) || top < win.innerHeight ? 1 : before.get(node) || 0;
          paint(node, active() && !blocked() ? record.progress : 1);
        }
      };
    },
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
