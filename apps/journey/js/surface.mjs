// Move the existing controls, never copy them or recreate the playback/editor.
export function installJourneySurface({ root, resize, signal }) {
  const document = root.ownerDocument, window = document.defaultView;
  const toolbar = root.querySelector('#journeyGlassToolbar');
  if (!toolbar) return;
  const placements = [
    ['openPeriod', 'journeyGlassPeriod'],
    ['toggleCalendar', 'journeyGlassCalendar'],
    ['toggleStory', 'journeyGlassStory'],
  ].map(([id, slot]) => {
    const control = root.querySelector('#' + id), target = root.querySelector('#' + slot);
    const anchor = document.createComment('journey original control position');
    control.before(anchor);
    return { control, target, anchor };
  });
  let current;
  const update = () => {
    if (signal?.aborted) return;
    const glass = document.documentElement.dataset.ssSurface === 'glass';
    if (glass === current) return;
    current = glass;
    for (const { control, target, anchor } of placements) {
      if (glass) target.append(control);
      else anchor.after(control);
    }
    toolbar.hidden = !glass;
    resize();
  };
  window.addEventListener('sungso:surface-change', update, { signal });
  update();
}
