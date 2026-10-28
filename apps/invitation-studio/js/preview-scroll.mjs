// scrollIntoView also scrolls an iframe's ancestors. Move only this invitation's
// viewport so editing a scene never pulls the surrounding studio out of place.
export function scrollPreviewTo(target, { win = window, behavior = 'instant', block = 'start' } = {}) {
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const margin = Number.parseFloat(win.getComputedStyle(target).scrollMarginTop) || 0;
  const offset = block === 'center' ? (win.innerHeight - rect.height) / 2 : margin;
  win.scrollTo({ top: Math.max(0, win.scrollY + rect.top - offset), left: win.scrollX || 0, behavior });
}

// A review should begin at the destination, not halfway through a long smooth
// scroll. This loop exists only during a requested jump and always has a bound.
export function afterPreviewScroll({ win = window, doc = document, onSettled }) {
  let frame = 0, done = false, lastY = win.scrollY;
  const start = win.performance.now();
  let changedAt = start;
  function cancel() { done = true; win.cancelAnimationFrame(frame); }
  function tick() {
    if (done || doc.hidden || doc.querySelector('dialog[open]')) { cancel(); return; }
    const now = win.performance.now();
    if (Math.abs(win.scrollY - lastY) > .5) { lastY = win.scrollY; changedAt = now; }
    if ((now - start >= 120 && now - changedAt >= 90) || now - start >= 1400) {
      done = true; onSettled(); return;
    }
    frame = win.requestAnimationFrame(tick);
  }
  frame = win.requestAnimationFrame(tick);
  return cancel;
}
