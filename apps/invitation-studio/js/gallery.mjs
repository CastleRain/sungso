import { $, $$, openDialog, updateDialogRoute, addSwipe } from './ui.mjs';
import { photoIndex } from './core.mjs';

export function fitPhotoRect(bounds, width, height) {
  const scale = Math.min(bounds.width / width, bounds.height / height);
  const w = width * scale, h = height * scale;
  return { left: bounds.left + (bounds.width - w) / 2, top: bounds.top + (bounds.height - h) / 2, width: w, height: h };
}

export function setupGallery({ photos: initialPhotos, motion }) {
  let photos = initialPhotos, index = 0, sourceButton, flight;
  const dialog = $('#photo-dialog'), full = $('#photo-full'), album = $('#album-dialog');
  function photoButton(photo, i) {
    const button = document.createElement('button'); button.className = 'gallery-photo'; button.dataset.photoIndex = i;
    button.setAttribute('aria-label', `${i + 1}번째 사진 크게 보기`);
    const image = document.createElement('img'); image.src = photo.thumb || photo.src; image.alt = photo.alt; image.width = photo.width; image.height = photo.height; image.loading = 'lazy'; image.decoding = 'async';
    image.addEventListener('error', () => { button.classList.add('image-unavailable'); image.alt = '사진을 불러오지 못했어요. 누르면 다시 확인합니다.'; });
    const arrow = document.createElement('span'); arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '↗';
    button.append(image, arrow); return button;
  }
  function render(next = photos) {
    cancelFlight();
    const previousId = photos[index]?.id; photos = next;
    index = Math.max(0, photos.findIndex(photo => photo.id === previousId));
    $('#gallery-grid').replaceChildren(...photos.slice(0, 6).map(photoButton));
    $('#album-full-grid').replaceChildren(...photos.map(photoButton));
    $('#album-count').textContent = photos.length;
    $('#album-open').disabled = !photos.length;
    if (!photos.length) {
      const empty = document.createElement('p'); empty.className = 'gallery-empty'; empty.textContent = '사진을 준비하고 있어요.'; $('#gallery-grid').append(empty);
      if (dialog.open) dialog.close(); if (album.open) album.close();
    } else if (dialog.open) display();
    document.dispatchEvent(new Event('lab:layout-changed'));
  }
  function display() {
    const photo = photos[index]; if (!photo) return;
    full.hidden = false; $('#photo-error').hidden = true;
    full.src = photo.src; full.alt = photo.alt;
    $('#photo-counter').textContent = `${index + 1} / ${photos.length}`;
    const save = $('#photo-save'); save.href = photo.src; save.download = `sungso-${photo.id}.${photo.src.split('.').pop().split('?')[0]}`;
    $('#photo-prev').disabled = photos.length < 2; $('#photo-next').disabled = photos.length < 2;
    updateDialogRoute(dialog, `#photo/${index + 1}`);
  }
  function cancelFlight() { if (flight) { flight.animation?.cancel(); flight.element.remove(); flight = null; } full.style.visibility = ''; }
  function fly(from, to, src, { closing = false } = {}) {
    cancelFlight();
    if (!motion() || !from?.width || !to?.width || from.bottom < 0 || from.top > innerHeight) return;
    const clone = document.createElement('img'); clone.src = src; clone.alt = ''; clone.setAttribute('aria-hidden', 'true');
    clone.style.cssText = `position:fixed;left:${to.left}px;top:${to.top}px;width:${to.width}px;height:${to.height}px;object-fit:cover;transform-origin:top left;z-index:180;pointer-events:none;`;
    (closing ? document.body : dialog).append(clone);
    const transform = `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${from.width / to.width},${from.height / to.height})`;
    const animation = clone.animate([{ transform, opacity: 1 }, { transform: 'none', opacity: 1 }], { duration: 440, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'both' });
    flight = { element: clone, animation };
    if (!closing) full.style.visibility = 'hidden';
    animation.finished.catch(() => {}).finally(() => { clone.remove(); if (flight?.element === clone) { flight = null; full.style.visibility = ''; } });
  }
  function openPhoto(next, trigger) {
    if (!photos.length) return;
    index = photoIndex(next, photos.length); sourceButton = trigger || $(`[data-photo-index="${index}"]`, $('#gallery-grid'));
    const from = sourceButton?.getBoundingClientRect();
    display(); openDialog(dialog, sourceButton, `#photo/${index + 1}`);
    const photo = photos[index], target = fitPhotoRect($('.photo-stage').getBoundingClientRect(), photo.width, photo.height);
    if (from) fly(from, target, photo.src);
  }
  function move(delta) {
    if (!photos.length) return;
    cancelFlight(); index = photoIndex(index + delta, photos.length); display();
    if (motion()) full.animate([{ opacity: .3, transform: `translateX(${delta * 18}px)` }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' });
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-photo-index]');
    if (button) openPhoto(Number(button.dataset.photoIndex), button);
  });
  $('#album-open').addEventListener('click', event => openDialog(album, event.currentTarget, '#album'));
  $('#photo-prev').addEventListener('click', () => move(-1)); $('#photo-next').addEventListener('click', () => move(1));
  $('#photo-retry').addEventListener('click', () => { const url = photos[index]?.src; if (url) { full.src = ''; display(); } });
  full.addEventListener('error', () => { cancelFlight(); full.hidden = true; $('#photo-error').hidden = false; });
  dialog.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); } });
  addSwipe($('.photo-stage'), move);
  dialog.addEventListener('close', () => {
    cancelFlight();
    const photo = photos[index]; if (!photo) return;
    const targetButton = album.open ? $(`[data-photo-index="${index}"]`, album) : $(`[data-photo-index="${index}"]`, $('#gallery-grid'));
    const to = targetButton?.getBoundingClientRect();
    if (!to || to.top < 0 || to.bottom > innerHeight) return;
    const stage = { left: 20, top: 20, width: innerWidth - 40, height: innerHeight - 130 };
    fly(fitPhotoRect(stage, photo.width, photo.height), to, photo.src, { closing: true });
  });
  render();
  return { openPhoto, render, openAlbum: () => openDialog(album, $('#album-open'), '#album'), get photos() { return photos; } };
}
