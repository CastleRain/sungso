/** Photo framing, a closing scene, and a calendar accent share existing live content. */
export const PHOTO_FINISH_CHOICES = Object.freeze({
  albumColumns: Object.freeze(['auto', 'two', 'three']),
  albumRatio: Object.freeze(['auto', 'portrait', 'square', 'original']),
  ending: Object.freeze(['original', 'glass', 'letter']),
  calendarMark: Object.freeze(['original', 'ring', 'underline']),
});
export function photoFinishChoices(input) {
  return Object.fromEntries(Object.entries(PHOTO_FINISH_CHOICES).map(([key, values]) => [key, values.includes(input?.[key]) ? input[key] : values[0]]));
}
export function albumLayout(input) {
  const choices = photoFinishChoices(input), masonry = input?.album === 'masonry';
  return {
    columns: choices.albumColumns === 'auto' ? (masonry ? 2 : 3) : choices.albumColumns === 'two' ? 2 : 3,
    ratio: choices.albumRatio === 'auto' ? (masonry ? 'original' : 'portrait') : choices.albumRatio,
  };
}
export function endingProgress(top, viewport) {
  if (!Number.isFinite(top) || !(viewport > 0)) return 1;
  const p = Math.max(0, Math.min(1, (viewport * .9 - top) / (viewport * .55)));
  return p * p * (3 - 2 * p);
}

/** No photo selection, input, audio, or other section is replaced or reparented. */
export function mountPhotoFinishScenes({ doc = document, win = window, gallery, composition, enabled = true } = {}) {
  const body = doc.body, closing = doc.getElementById('closing') || doc.querySelector('.closing-section');
  const inner = closing?.querySelector('.section-inner');
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const cleanups = [], owned = [];
  const datasetKeys = [...Object.keys(PHOTO_FINISH_CHOICES), 'albumShape'];
  const previousData = Object.fromEntries(datasetKeys.map(key => [key, body.dataset[key]]));
  const previousColumns = body.style.getPropertyValue?.('--studio-album-columns') || '';
  const previousMotion = body.classList.contains('photo-finish-motion');
  const previousId = closing?.id || '', previousAvailable = closing?.dataset.photoAvailable;
  const previousProgress = closing?.style.getPropertyValue?.('--ending-progress') || '';
  let choices = photoFinishChoices(composition), input = composition, requested = Boolean(enabled), disposed = false, frame = 0, progress = 0;
  let figure, image, imageSource = '', failed = false;

  const listen = (target, type, fn, options) => {
    target?.addEventListener?.(type, fn, options);
    cleanups.push(() => target?.removeEventListener?.(type, fn, options));
  };
  if (closing && inner) {
    if (!closing.id) closing.id = 'closing';
    figure = doc.createElement('figure'); figure.className = 'studio-ending-photo'; figure.hidden = true; figure.setAttribute('aria-hidden', 'true');
    image = doc.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.setAttribute('data-invitation-photo', '');
    figure.append(image); closing.insertBefore(figure, inner); owned.push(figure);
  }
  const active = () => requested && !reduced?.matches && !disposed;
  const blocked = () => doc.hidden || Boolean(doc.querySelector('dialog[open]'));
  function cancel() { if (frame) win.cancelAnimationFrame(frame); frame = 0; }
  function paint() {
    frame = 0;
    if (!closing || !active() || blocked() || choices.ending === 'original') return;
    progress = Math.max(progress, endingProgress(closing.getBoundingClientRect().top, win.innerHeight));
    closing.style.setProperty('--ending-progress', String(progress));
  }
  function queue() {
    if (closing && choices.ending !== 'original' && active() && !blocked() && !frame) frame = win.requestAnimationFrame(paint);
  }
  function syncMotion() {
    cancel(); body.classList.toggle('photo-finish-motion', active());
    if (!active() || choices.ending === 'original') closing?.style.setProperty('--ending-progress', '1');
    else queue();
  }
  function refreshPhoto() {
    if (!image || !figure || choices.ending === 'original') { if (figure) figure.hidden = true; return; }
    const photos = Array.isArray(gallery?.photos) ? gallery.photos : [];
    const selected = photos.at(-1);
    const hero = doc.querySelector('.hero-photo')?.querySelector('img');
    const src = selected?.src || hero?.getAttribute('src') || '';
    if (src && src !== imageSource) {
      imageSource = src; failed = false;
      image.src = src;
      image.width = Number(selected?.width) > 0 ? Number(selected.width) : Number(hero?.getAttribute('width')) || 960;
      image.height = Number(selected?.height) > 0 ? Number(selected.height) : Number(hero?.getAttribute('height')) || 1439;
    }
    figure.hidden = !src || failed;
    closing.dataset.photoAvailable = String(Boolean(src) && !failed);
  }
  function refresh() {
    if (disposed) return;
    refreshPhoto(); queue();
  }
  function setComposition(value) {
    if (disposed) return;
    input = value;
    const next = photoFinishChoices(input), layout = albumLayout(input);
    if (next.ending !== choices.ending) progress = 0;
    choices = next;
    for (const [key, value] of Object.entries(choices)) body.dataset[key] = value;
    body.dataset.albumShape = layout.ratio;
    body.style.setProperty('--studio-album-columns', String(layout.columns));
    refreshPhoto(); syncMotion();
  }
  listen(image, 'error', () => { if (disposed) return; failed = true; refreshPhoto(); });
  listen(image, 'load', queue);
  listen(win, 'scroll', queue, { passive: true });
  listen(win, 'resize', queue, { passive: true });
  listen(doc, 'lab:layout-changed', refresh);
  listen(doc, 'lab:dialog-change', () => { cancel(); if (!blocked()) queue(); });
  listen(doc, 'visibilitychange', () => { cancel(); if (!doc.hidden) queue(); });
  listen(doc, 'focusin', event => {
    if (closing?.contains(event.target)) { progress = 1; closing.style.setProperty('--ending-progress', '1'); }
  });
  listen(reduced, 'change', syncMotion);
  setComposition(input);
  return {
    setComposition, refresh,
    setEnabled(value) { if (disposed) return; requested = Boolean(value); syncMotion(); },
    prepareDemo(key) {
      if (disposed || key !== 'ending') return () => {};
      progress = 0; syncMotion();
      return () => { if (!disposed) { progress = 1; closing?.style.setProperty('--ending-progress', '1'); } };
    },
    destroy() {
      if (disposed) return;
      disposed = true; cancel(); cleanups.forEach(clean => clean()); owned.forEach(node => node.remove());
      for (const key of datasetKeys) {
        if (previousData[key] === undefined) delete body.dataset[key]; else body.dataset[key] = previousData[key];
      }
      if (previousColumns) body.style.setProperty('--studio-album-columns', previousColumns); else body.style.removeProperty('--studio-album-columns');
      body.classList.toggle('photo-finish-motion', previousMotion);
      if (closing) {
        if (previousId) closing.id = previousId; else closing.removeAttribute('id');
        if (previousAvailable === undefined) delete closing.dataset.photoAvailable; else closing.dataset.photoAvailable = previousAvailable;
        if (previousProgress) closing.style.setProperty('--ending-progress', previousProgress); else closing.style.removeProperty('--ending-progress');
      }
    },
  };
}

