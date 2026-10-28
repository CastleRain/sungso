/** A real album, with a short entry scene rather than a separate decorative gallery. */
export const clampAlbum = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
export function albumEntry(top, viewport) {
  // Keep part of the scene active while the photograph itself is fully visible.
  // Finishing at mid-screen made the sheets disappear before guests could see them.
  const progress = clampAlbum((viewport * .82 - top) / Math.max(180, viewport * .9));
  return progress * progress * (3 - 2 * progress);
}
export function albumSelection(photos, previousId, previousIndex = 0) {
  if (!photos.length) return -1;
  const retained = photos.findIndex(photo => photo.id === previousId);
  return retained >= 0 ? retained : Math.max(0, Math.min(photos.length - 1, previousIndex));
}
export function albumStep(index, length, delta) {
  return length ? ((index + delta) % length + length) % length : -1;
}
export function albumSwipe(start, end) {
  if (!start || !end) return 0;
  const x = end.x - start.x, y = end.y - start.y;
  return Math.abs(x) >= 48 && Math.abs(x) > Math.abs(y) * 1.8 ? (x < 0 ? 1 : -1) : 0;
}

export function mountGalleryExperience({ doc = document, win = window, gallery, enabled = true } = {}) {
  const stage = doc.getElementById('gallery-stage'), grid = doc.getElementById('gallery-grid');
  if (!stage || !grid || !gallery) return { setEnabled() {}, refresh() {}, destroy() {} };
  const previousHidden = grid.hidden, cleanups = [], reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let photos = [], index = -1, selectedId, fingerprint = '', requested = enabled, active = false, disposed = false, frame = 0;
  let startPointer, suppressClick = false, engaged = false, animation;
  const create = (tag, className, text) => { const node = doc.createElement(tag); node.className = className; if (text) node.textContent = text; return node; };
  const listen = (target, type, fn, options) => { target?.addEventListener?.(type, fn, options); cleanups.push(() => target?.removeEventListener?.(type, fn, options)); };
  const root = create('div', 'experience-album'); root.setAttribute('aria-label', '두 사람의 사진첩');
  const scene = create('div', 'album-scene');
  const ghosts = Array.from({ length: 4 }, (_, i) => {
    const card = create('div', `album-sheet album-sheet-${i + 1}`); card.setAttribute('aria-hidden', 'true');
    const image = create('img', ''); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; card.append(image); scene.append(card);
    return { card, image };
  });
  const focus = create('button', 'album-feature'); focus.type = 'button'; focus.setAttribute('aria-haspopup', 'dialog');
  const picture = create('img', 'album-feature-image'); picture.loading = 'lazy'; picture.decoding = 'async';
  const error = create('span', 'album-image-error', '사진을 불러오지 못했어요. 크게 보기로 다시 확인해 주세요.'); error.hidden = true;
  const expand = create('span', 'album-expand', '크게 보기 ↗'); expand.setAttribute('aria-hidden', 'true');
  focus.append(picture, error, expand); scene.append(focus);
  const controls = create('div', 'album-controls');
  const previous = create('button', 'album-previous', '←'), next = create('button', 'album-next', '→');
  previous.type = next.type = 'button'; previous.setAttribute('aria-label', '이전 사진'); next.setAttribute('aria-label', '다음 사진');
  const count = create('p', 'album-position'); count.setAttribute('aria-live', 'polite'); count.setAttribute('aria-atomic', 'true');
  controls.append(previous, count, next);
  const strip = create('div', 'album-filmstrip'); strip.setAttribute('role', 'group'); strip.setAttribute('aria-label', '사진 선택');
  const empty = create('p', 'album-empty', '사진을 준비하고 있어요.'); empty.hidden = true;
  root.append(scene, controls, strip, empty); stage.append(root); grid.hidden = true; stage.classList.add('has-experience-album');

  const canAnimate = () => active && !doc.hidden && !doc.querySelector('dialog[open]');
  function cancelAnimation() { animation?.cancel(); animation = undefined; }
  function paintProgress() {
    frame = 0;
    if (!canAnimate()) return;
    const bounds = scene.getBoundingClientRect(), viewport = win.innerHeight;
    if (bounds.bottom < -40 || bounds.top > viewport + 40) return;
    root.style.setProperty('--album-reveal', String(engaged ? 1 : albumEntry(bounds.top, viewport)));
  }
  function queue() { if (!disposed && canAnimate() && !frame) frame = win.requestAnimationFrame(paintProgress); }
  function settle() { engaged = true; root.style.setProperty('--album-reveal', '1'); }
  function renderSelection({ animate = false, scrollThumbnail = false } = {}) {
    const photo = photos[index]; if (!photo) return;
    selectedId = photo.id;
    picture.hidden = false; error.hidden = true;
    if (picture.getAttribute('src') !== photo.src) picture.src = photo.src;
    picture.alt = photo.alt || '성우와 소희의 사진'; picture.width = photo.width || 1440; picture.height = photo.height || 2160;
    focus.setAttribute('aria-label', `${index + 1}번째 사진 크게 보기`);
    count.textContent = `${String(index + 1).padStart(2, '0')} / ${String(photos.length).padStart(2, '0')}`;
    previous.disabled = next.disabled = photos.length < 2;
    Array.from(strip.children).forEach((button, i) => {
      button.setAttribute('aria-pressed', String(i === index));
      if (i === index && scrollThumbnail && typeof strip.scrollTo === 'function') {
        const target = button.offsetLeft - strip.offsetLeft - (strip.clientWidth - button.offsetWidth) / 2;
        strip.scrollTo({ left: Math.max(0, target), behavior: canAnimate() ? 'smooth' : 'auto' });
      }
    });
    ghosts.forEach(({ card, image }, i) => {
      card.hidden = photos.length < 2;
      const other = photos[albumStep(index, photos.length, i % 2 ? -i - 1 : i + 1)];
      if (other) { image.src = other.thumb || other.src; image.width = other.width || 1440; image.height = other.height || 2160; }
    });
    cancelAnimation();
    if (animate && canAnimate() && picture.animate) animation = picture.animate([{ opacity: .35, transform: 'scale(1.018)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.7,.3,1)' });
  }
  function select(nextIndex, userAction = false) {
    if (!photos.length) return;
    const changed = index !== nextIndex;
    index = albumStep(nextIndex, photos.length, 0);
    if (userAction) settle();
    renderSelection({ animate: userAction && changed, scrollThumbnail: userAction });
  }
  function move(delta) { if (photos.length > 1) select(albumStep(index, photos.length, delta), true); }
  function refresh() {
    if (disposed) return;
    const nextPhotos = Array.isArray(gallery.photos) ? gallery.photos : [];
    const nextFingerprint = JSON.stringify(nextPhotos.map(photo => [photo.id, photo.src, photo.thumb, photo.alt, photo.width, photo.height]));
    if (nextFingerprint !== fingerprint) {
      fingerprint = nextFingerprint; photos = nextPhotos;
      index = albumSelection(photos, selectedId, index);
      strip.replaceChildren(...photos.map((photo, i) => {
        const button = create('button', 'album-thumbnail'); button.type = 'button'; button.dataset.albumIndex = String(i);
        button.setAttribute('aria-label', `${i + 1}번째 사진 선택`); button.setAttribute('aria-pressed', 'false');
        const image = create('img', ''); image.src = photo.thumb || photo.src; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.width = photo.width || 1440; image.height = photo.height || 2160;
        button.append(image); return button;
      }));
      scene.hidden = controls.hidden = strip.hidden = !photos.length; empty.hidden = Boolean(photos.length);
      if (photos.length) renderSelection();
      else { selectedId = undefined; cancelAnimation(); picture.removeAttribute('src'); }
    }
    queue();
  }
  function setEnabled(value) {
    requested = Boolean(value); active = requested && !reduced?.matches;
    root.classList.toggle('album-motion', active);
    if (frame) win.cancelAnimationFrame(frame); frame = 0;
    if (!active) { root.style.setProperty('--album-reveal', '1'); cancelAnimation(); }
    else queue();
  }
  listen(focus, 'click', event => {
    if (suppressClick && event.detail !== 0) { suppressClick = false; event.preventDefault(); return; }
    suppressClick = false;
    settle(); if (photos.length) gallery.openPhoto(index, focus);
  });
  listen(strip, 'click', event => {
    const target = event.target.closest?.('[data-album-index]');
    if (target && strip.contains(target)) select(Number(target.dataset.albumIndex), true);
  });
  listen(previous, 'click', () => move(-1)); listen(next, 'click', () => move(1));
  listen(root, 'keydown', event => {
    let handled = false;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); handled = true; }
    if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); select(event.key === 'Home' ? 0 : photos.length - 1, true); handled = true; }
    if (handled && event.target.closest?.('[data-album-index]')) strip.children[index]?.focus({ preventScroll: true });
  });
  listen(focus, 'pointerdown', event => { suppressClick = false; startPointer = event.isPrimary === false ? null : { x: event.clientX, y: event.clientY, id: event.pointerId }; }, { passive: true });
  listen(focus, 'pointerup', event => {
    if (startPointer?.id !== event.pointerId) return;
    const direction = albumSwipe(startPointer, { x: event.clientX, y: event.clientY }); startPointer = null;
    if (direction && photos.length > 1) { suppressClick = true; move(direction); }
  }, { passive: true });
  listen(focus, 'pointercancel', () => { startPointer = null; suppressClick = false; }, { passive: true });
  listen(picture, 'error', () => { picture.hidden = true; error.hidden = false; });
  listen(picture, 'load', () => { picture.hidden = false; error.hidden = true; });
  listen(root, 'focusin', settle);
  listen(doc.getElementById('photo-dialog'), 'close', () => {
    const counter = doc.getElementById('photo-counter')?.textContent?.match(/^(\d+)\s*\//);
    if (counter && Number(counter[1]) <= photos.length) select(Number(counter[1]) - 1);
  });
  listen(win, 'scroll', queue, { passive: true }); listen(win, 'resize', queue, { passive: true });
  listen(doc, 'lab:layout-changed', refresh);
  listen(doc, 'lab:dialog-change', () => {
    if (doc.querySelector('dialog[open]')) { if (frame) win.cancelAnimationFrame(frame); frame = 0; cancelAnimation(); }
    else refresh();
  });
  listen(doc, 'visibilitychange', () => {
    if (doc.hidden) { if (frame) win.cancelAnimationFrame(frame); frame = 0; cancelAnimation(); }
    else queue();
  });
  listen(reduced, 'change', () => setEnabled(requested));
  const resize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(queue) : null; resize?.observe(stage);
  refresh(); setEnabled(enabled);
  return {
    setEnabled, refresh,
    get index() { return index; },
    destroy() {
      disposed = true; if (frame) win.cancelAnimationFrame(frame); cancelAnimation();
      cleanups.forEach(clean => clean()); resize?.disconnect(); root.remove(); grid.hidden = previousHidden; stage.classList.remove('has-experience-album');
    },
  };
}
