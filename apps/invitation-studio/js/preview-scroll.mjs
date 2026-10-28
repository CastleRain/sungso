// scrollIntoView also scrolls an iframe's ancestors. Move only this invitation's
// viewport so editing a scene never pulls the surrounding studio out of place.
export function scrollPreviewTo(target, { win = window, behavior = 'instant', block = 'start' } = {}) {
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const margin = Number.parseFloat(win.getComputedStyle(target).scrollMarginTop) || 0;
  const offset = block === 'center' ? (win.innerHeight - rect.height) / 2 : margin;
  win.scrollTo({ top: Math.max(0, win.scrollY + rect.top - offset), left: win.scrollX || 0, behavior });
}
