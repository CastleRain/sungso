/** Two short, opt-in reading accents. No timers, pinned scroll, media or data actions. */
export function accentProgress(top, viewport, speed = 1) {
  if (!Number.isFinite(top) || !(viewport > 0)) return 1;
  // Finish before the reader reaches the information, even at the slowest speed.
  const start = viewport * Math.min(.98, .8 / Math.max(.5, Number(speed) || 1));
  const end = viewport * .3;
  const p = Math.max(0, Math.min(1, (start - top) / Math.max(80, start - end)));
  return p * p * (3 - 2 * p);
}

export function mountSceneAccents({doc = document, win = window, composition = {}, enabled = true} = {}) {
  const gallery = doc.getElementById('gallery'), pass = doc.getElementById('day-pass');
  const receipt = pass?.querySelector('.guest-pass-card'), reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const removers = []; let current = composition, requested = Boolean(enabled), disposed = false, frame = 0;
  const progress = {receipt: 0, bridge: 0};
  const bridge = doc.createElement('div'); bridge.className = 'album-breath'; bridge.hidden = true;
  bridge.setAttribute('aria-hidden', 'true');
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 360 84'); svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 49C62 49 81 22 119 37S168 66 180 43C158 5 143 24 158 39C167 47 176 43 180 43C192 9 215 20 202 35C194 45 186 43 180 43C169 62 158 59 164 50C169 44 174 45 180 43C188 63 202 58 195 50C190 45 185 44 180 43C220 67 251 14 283 36S321 50 348 44');
  path.setAttribute('pathLength', '1'); path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1'); path.setAttribute('stroke-linecap', 'round');
  svg.append(path); bridge.append(svg); gallery?.prepend(bridge);
  const active = () => requested && current.motion !== 'still' && !reduced?.matches;
  const blocked = () => doc.hidden || Boolean(doc.querySelector('dialog[open]'));
  const listen = (target, name, fn, options) => {target?.addEventListener?.(name, fn, options); removers.push(() => target?.removeEventListener?.(name, fn, options));};
  function cancel() {if (frame) win.cancelAnimationFrame(frame); frame = 0;}
  function paint(key, target) {target?.style.setProperty('--accent-progress', String(progress[key]));}
  function render() {
    frame = 0; if (disposed || !active() || blocked()) return;
    for (const [key, target, visible] of [['receipt', receipt, current.dayPass === 'receipt' && !pass?.hidden], ['bridge', bridge, !bridge.hidden]]) {
      if (!target || !visible) continue;
      progress[key] = Math.max(progress[key], accentProgress(target.getBoundingClientRect().top, win.innerHeight, current.motionSpeed));
      paint(key, target);
    }
  }
  function queue() {if (!disposed && active() && !blocked() && !frame) frame = win.requestAnimationFrame(render);}
  function sync() {
    cancel(); bridge.hidden = current.divider !== 'breath';
    receipt?.classList.toggle('receipt-motion', active() && current.dayPass === 'receipt');
    bridge.classList.toggle('breath-motion', active());
    receipt?.style.setProperty('--accent-strength', String(Math.max(.5, Math.min(1.5, Number(current.motionStrength) || 1))));
    if (!active()) {for (const [key, target] of [['receipt',receipt],['bridge',bridge]]) {progress[key] = 1; paint(key,target);}}
    else queue();
  }
  listen(win, 'scroll', queue, {passive:true}); listen(win, 'resize', queue, {passive:true});
  listen(doc, 'lab:layout-changed', queue); listen(doc, 'visibilitychange', () => {cancel(); queue();});
  listen(doc, 'lab:dialog-change', () => {cancel(); queue();}); listen(reduced, 'change', sync);
  listen(doc, 'focusin', event => {if (receipt?.contains(event.target)) {progress.receipt = 1; paint('receipt',receipt);}});
  sync();
  return {
    setComposition(next) {if (disposed) return; if (next.dayPass !== current.dayPass) progress.receipt = 0; if (next.divider !== current.divider) progress.bridge = 0; current = next; sync();},
    setEnabled(value) {if (!disposed) {requested = Boolean(value); sync();}}, refresh: queue,
    prepareDemo(key) {
      const part = key === 'dayPass' ? 'receipt' : key === 'divider' ? 'bridge' : null;
      if (!part || !active()) return () => {};
      progress[part] = 0; paint(part,part === 'receipt' ? receipt : bridge); queue();
      return () => {progress[part] = 1; paint(part,part === 'receipt' ? receipt : bridge);};
    },
    destroy() {if (disposed) return; disposed = true; cancel(); removers.forEach(fn => fn()); bridge.remove(); receipt?.classList.remove('receipt-motion'); receipt?.style.removeProperty('--accent-progress'); receipt?.style.removeProperty('--accent-strength');},
  };
}
