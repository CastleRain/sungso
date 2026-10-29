import { FINE_SECTION_IDS, FINE_TUNING_RANGES, normalizeFineTuning, readSectionTuning } from './fine-tuning.mjs';

const TEXT = 'p,h1,h2,h3,h4,h5,h6,blockquote,small,strong,span,a,button,label,li,td,th,figcaption,legend,dt,dd,time';
const PROTECTED = 'svg,.hero-letter,#sound-dock,#music-notice,#intro-skip,.experience-dock,#quick-menu,form,input,textarea,select,.sr-only,.honeypot,[aria-hidden="true"]';
const GLYPH_ONLY = /^[\s←→↗↖↘↙↑↓×＋+−–—·|&⌄⌃]+$/;
const round = value => `${Math.round(value * 10000) / 10000}px`;

export function fineAppearanceChoices(input = {}) {
  return {
    ...Object.fromEntries(Object.entries(FINE_TUNING_RANGES).map(([field, range]) => [field, normalizeFineTuning(input?.[field], range)])),
    sections: readSectionTuning(input?.sectionTuning),
  };
}
export function fineSectionValues(choices, id, { largeText = false } = {}) {
  const value = choices.sections?.[id] || choices;
  // A guest choosing larger text must never have it scaled back down by the editor.
  return { textScale: largeText ? Math.max(1, value.textScale) : value.textScale, lineScale: value.lineScale, sectionSpace: value.sectionSpace };
}

/** Measure the chosen preset's real typography before writing. Local values override global values. */
export function mountFineAppearance({ doc = document, win = window, composition, onLayout = () => {} } = {}) {
  let choices = fineAppearanceChoices(composition), disposed = false, frame = 0, broadcasting = false, signature = '';
  const properties = new Map(), attributes = new Map(), identities = new WeakMap(), cleanups = [];
  let nextIdentity = 0;
  const identify = node => { if (!identities.has(node)) identities.set(node, ++nextIdentity); return identities.get(node); };
  const listen = (target, type, fn, options) => { target?.addEventListener?.(type, fn, options); cleanups.push(() => target?.removeEventListener?.(type, fn, options)); };
  function ownProperty(node, property, value) {
    let original = properties.get(node); if (!original) properties.set(node, original = new Map());
    if (!original.has(property)) original.set(property, [node.style.getPropertyValue(property), node.style.getPropertyPriority(property)]);
    node.style.setProperty(property, value);
  }
  function ownAttribute(node, name, value) {
    let original = attributes.get(node); if (!original) attributes.set(node, original = new Map());
    if (!original.has(name)) original.set(name, node.getAttribute(name));
    node.setAttribute(name, value);
  }
  function restore() {
    properties.forEach((values, node) => values.forEach(([value, priority], property) => {
      if (value) node.style.setProperty(property, value, priority); else node.style.removeProperty(property);
    }));
    attributes.forEach((values, node) => values.forEach((value, name) => {
      if (value === null) node.removeAttribute(name); else node.setAttribute(name, value);
    }));
  }
  function roots() {
    const result = [], main = doc.querySelector('main.paper');
    for (const id of FINE_SECTION_IDS) {
      const node = id === 'top' ? main?.querySelector('.hero') : id === 'closing' ? doc.getElementById('closing') || main?.querySelector('.closing-section') : doc.getElementById(id);
      if (node && (id === 'top' || id === 'closing' || node.parentElement === main)) result.push({ id, node, space: id !== 'top' });
    }
    // The open story continues the same scene; form fields stay at their authored accessible size.
    for (const [id, selector] of [['our-story', '#story-dialog'], ['gallery', '#album-dialog'], ['guestbook', '#guestbook-all'], ['guestbook', '#guestbook-composer'], ['wedding-day', '#calendar-dialog'], ['location', '#tmap-dialog']]) {
      const node = doc.querySelector(selector); if (node) result.push({ id, node, space: false });
    }
    return result;
  }
  function eligible(node) {
    if (node.closest(PROTECTED)) return false;
    // Target own text so inheriting wrappers and explicitly sized children are not multiplied twice.
    const text = [...node.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent).join('');
    return Boolean(text.trim()) && !GLYPH_ONLY.test(text);
  }
  function render() {
    frame = 0;
    if (disposed || doc.hidden) return;
    restore();
    const writes = [], markers = [], measured = new Set();
    const largeText = doc.documentElement.classList.contains('large-text');
    for (const { id, node: root, space } of roots()) {
      const values = fineSectionValues(choices, id, { largeText });
      if (values.textScale !== 1 || values.lineScale !== 1) {
        markers.push(root);
        for (const node of root.querySelectorAll(TEXT)) {
          if (measured.has(node) || !eligible(node)) continue;
          measured.add(node);
          const style = win.getComputedStyle(node), font = Number.parseFloat(style.fontSize), actualLine = Number.parseFloat(style.lineHeight);
          if (!(font > 0)) continue;
          const line = Number.isFinite(actualLine) && actualLine > 0 ? actualLine : font * 1.4;
          if (values.textScale !== 1) writes.push([node, 'font-size', round(font * values.textScale)]);
          writes.push([node, 'line-height', round(line * values.textScale * values.lineScale)]);
        }
      }
      if (space && values.sectionSpace !== 1) {
        const style = win.getComputedStyle(root);
        for (const [property, key] of [['padding-top', 'paddingTop'], ['padding-bottom', 'paddingBottom']]) {
          const amount = Number.parseFloat(style[key]);
          if (Number.isFinite(amount) && amount > 0) writes.push([root, property, round(amount * values.sectionSpace)]);
        }
      }
    }
    // Read all computed metrics before any write: nested <strong>/<span> inherit the unscaled preset.
    writes.forEach(([node, property, value]) => ownProperty(node, property, value));
    markers.forEach(node => ownAttribute(node, 'data-fine-type', 'true'));
    const nextSignature = JSON.stringify(writes.map(([node, property, value]) => [identify(node), property, value]));
    if (nextSignature !== signature) {
      signature = nextSignature;
      broadcasting = true;
      try { onLayout(); doc.dispatchEvent(new win.Event('lab:layout-changed')); } finally { broadcasting = false; }
    }
  }
  function refresh() {
    if (disposed || broadcasting || doc.hidden || frame) return;
    frame = win.requestAnimationFrame(render);
  }
  const observer = typeof win.MutationObserver === 'function' ? new win.MutationObserver(records => {
    // Seconds and text edits reuse existing text styles. New cards/recipients need fresh measurements.
    if (records.some(record => record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && !record.target.closest?.('.countdown')))) refresh();
  }) : null;
  observer?.observe(doc.body, { childList: true, subtree: true });
  observer?.observe(doc.documentElement, { attributes: true, attributeFilter: ['class'] });
  listen(win, 'resize', refresh, { passive: true });
  listen(win, 'pageshow', refresh);
  listen(doc, 'lab:layout-changed', refresh);
  listen(doc, 'lab:dialog-change', refresh);
  listen(doc, 'visibilitychange', () => { if (doc.hidden && frame) { win.cancelAnimationFrame(frame); frame = 0; } else refresh(); });
  listen(doc.fonts, 'loadingdone', refresh);
  refresh();
  return {
    setComposition(next) { if (!disposed) { choices = fineAppearanceChoices(next); refresh(); } },
    refresh,
    setEnabled() {}, // Reading settings stay readable when visual effects are disabled.
    destroy() {
      if (disposed) return; disposed = true;
      if (frame) win.cancelAnimationFrame(frame); frame = 0;
      observer?.disconnect(); cleanups.forEach(clean => clean()); restore(); properties.clear(); attributes.clear();
    },
  };
}
