import { ORDER_SECTIONS } from './composition.mjs';

export const PICKER_SECTIONS = Object.freeze([
  { id: 'top', label: '첫 화면' }, ...ORDER_SECTIONS,
  { id: 'closing', label: '마지막 인사' }, { id: 'navigation', label: '빠른 메뉴' },
]);
const allowed = new Set(PICKER_SECTIONS.map(section => section.id));
const INTERACTIVE = 'a,button,input,textarea,select,option,label,summary,details[open]>summary,dialog,[role="button"],[role="tab"],[role="checkbox"],[role="switch"],[role="slider"],[contenteditable]:not([contenteditable="false"])';

/** This protocol changes editor affordances only; it never accepts content or URLs. */
export function scenePickerMessage(event, { origin, parent, embedded }) {
  if (!embedded || !event || event.origin !== origin || event.source !== parent) return null;
  const data = event.data;
  if (!data || data.type !== 'invitation-studio:picker' || typeof data.enabled !== 'boolean') return null;
  if (Object.hasOwn(data, 'section') && data.section !== null && !allowed.has(data.section)) return null;
  return { enabled: data.enabled, ...(Object.hasOwn(data, 'section') ? { section: data.section } : {}) };
}

/** The independent guest view must remain an ordinary invitation, including its tab order. */
export function mountScenePicker({ doc = document, win = window, embedded = false, onSelect = () => {} } = {}) {
  if (!embedded || win.parent === win) return { refresh() {}, destroy() {} };
  const origin = win.location.origin, roots = new Map(), removers = [];
  let enabled = true, selected = null, disposed = false, pointer = null;
  const oldEnabled = doc.documentElement.getAttribute('data-studio-picker');
  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options); removers.push(() => target.removeEventListener(event, handler, options));
  }
  function rootFor(id) {
    const main = doc.querySelector('main.paper');
    if (id === 'navigation') return doc.querySelector('.experience-dock');
    if (id === 'top') return main?.querySelector('.hero');
    if (id === 'closing') return main?.querySelector('.closing-section');
    const node = doc.getElementById(id);
    return node?.parentElement === main ? node : null;
  }
  function available(node) {
    return node && node.isConnected !== false && !node.closest('[hidden],[inert],[aria-hidden="true"]');
  }
  function decorate() {
    doc.documentElement.setAttribute('data-studio-picker', enabled ? 'on' : 'off');
    for (const [id, item] of roots) {
      const visible = enabled && available(item.node);
      item.button.hidden = !visible;
      if (enabled && id === selected && visible) item.node.setAttribute('data-studio-picked', 'true');
      else item.node.removeAttribute('data-studio-picked');
    }
  }
  function refresh() {
    if (disposed) return;
    for (const section of PICKER_SECTIONS) {
      const node = rootFor(section.id), previous = roots.get(section.id);
      if (!node || previous?.node === node) continue;
      if (previous) restoreRoot(previous);
      const original = node.getAttribute('data-studio-scene'), picked = node.getAttribute('data-studio-picked');
      node.setAttribute('data-studio-scene', section.id);
      const button = doc.createElement('button');
      button.type = 'button'; button.className = 'studio-scene-edit';
      button.setAttribute('data-scene-picker-button', section.id);
      button.setAttribute('aria-label', `${section.label} 편집`);
      button.title = `왼쪽에서 ${section.label} 편집`;
      button.textContent = '편집';
      node.append(button); roots.set(section.id, { node, button, original, picked });
    }
    decorate();
  }
  function restoreRoot(item) {
    item.button.remove();
    for (const [name, value] of [['data-studio-scene', item.original], ['data-studio-picked', item.picked]]) {
      if (value === null) item.node.removeAttribute(name); else item.node.setAttribute(name, value);
    }
  }
  function choose(section) {
    const item = roots.get(section);
    if (!item || !available(item.node)) return;
    selected = section; decorate(); onSelect(section);
    win.parent.postMessage({ type: 'invitation-studio:select', section }, origin);
  }
  function pointerDown(event) {
    if (!event.isTrusted || (event.button !== undefined && event.button !== 0)) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, scrollX: win.scrollX, scrollY: win.scrollY };
  }
  function pointerMove(event) {
    if (!pointer || (event.pointerId !== undefined && event.pointerId !== pointer.id)) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) pointer.moved = true;
  }
  function cancelGesture() { if (pointer) pointer.moved = true; }
  function clicked(event) {
    if (!event.isTrusted || !enabled || disposed || doc.hidden || doc.querySelector('dialog[open]')) return;
    const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
    if (!target?.closest) return;
    const badge = target.closest('[data-scene-picker-button]');
    // A keyboard click has detail 0 and no current pointer gesture.
    const moved = event.detail !== 0 && pointer && (pointer.moved || Math.abs(win.scrollX - pointer.scrollX) > 2 || Math.abs(win.scrollY - pointer.scrollY) > 2);
    pointer = null;
    if (moved || win.getSelection?.()?.toString().trim()) return;
    if (badge) {
      const section = badge.getAttribute('data-scene-picker-button');
      if (roots.get(section)?.button !== badge) return;
      event.preventDefault(); choose(section); return;
    }
    if (event.defaultPrevented || target.closest(INTERACTIVE)) return;
    const root = target.closest('[data-studio-scene]'), section = root?.getAttribute('data-studio-scene');
    if (roots.get(section)?.node === root) choose(section);
  }
  listen(doc, 'pointerdown', pointerDown, { capture: true, passive: true });
  listen(doc, 'pointermove', pointerMove, { capture: true, passive: true });
  listen(doc, 'pointercancel', cancelGesture, { capture: true, passive: true });
  listen(win, 'scroll', cancelGesture, { capture: true, passive: true });
  listen(win, 'blur', cancelGesture);
  listen(doc, 'click', clicked);
  listen(doc, 'lab:layout-changed', refresh);
  listen(win, 'message', event => {
    const command = scenePickerMessage(event, { origin, parent: win.parent, embedded });
    if (!command) return;
    enabled = command.enabled; pointer = null;
    if (Object.hasOwn(command, 'section')) selected = command.section;
    refresh();
  });
  refresh();
  return {
    refresh,
    destroy() {
      if (disposed) return;
      disposed = true; pointer = null; removers.forEach(remove => remove());
      roots.forEach(restoreRoot); roots.clear();
      if (oldEnabled === null) doc.documentElement.removeAttribute('data-studio-picker'); else doc.documentElement.setAttribute('data-studio-picker', oldEnabled);
    },
  };
}
