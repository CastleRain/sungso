import { clamp, ease, entryProgress, createSceneDriver } from './a.mjs';

export const theme = Object.freeze({
  id: 'b', name: '사진이 놓이는 순간', english: 'Collected, together',
  description: '한 장의 사진이 놓이고, 우리의 순간들이 가볍게 펼쳐집니다.',
  heroDecor: '<span class="b-print-corner b-print-corner-left" aria-hidden="true"></span><span class="b-print-corner b-print-corner-right" aria-hidden="true"></span>',
  storyDecor: '<span class="b-story-fold" aria-hidden="true"></span>',
  galleryDecor: '<svg class="b-album-mark" viewBox="0 0 64 24" aria-hidden="true" fill="none"><path d="M4 19L22 4L43 19M21 19L40 4L60 19"/></svg>',
});

export function fanPose(index, length, { x, y, width, gridWidth }, progress) {
  const p = ease(progress);
  const resting = (index - (length - 1) / 2) / Math.max(1, length - 1);
  return {
    x: (gridWidth / 2 - x - width / 2) * (1 - p),
    y: (24 + index * 7 - y) * (1 - p),
    rotation: resting * 12 * (1 - p),
    scale: .88 + .12 * p,
  };
}

export function mountTheme({ doc = document, win = window, enabled = true } = {}) {
  const paper = doc.querySelector('.paper');
  const hero = doc.querySelector('.hero');
  const grid = doc.getElementById('gallery-grid');
  let items = [], boxes = [], settled = false;
  const onFocus = event => {
    if (grid?.contains(event.target)) { settled = true; driver.queue(); }
  };
  function measure() {
    items = [...(grid?.querySelectorAll('.gallery-photo') || [])];
    boxes = items.map(item => ({
      x: item.offsetLeft, y: item.offsetTop, width: item.offsetWidth,
      gridWidth: grid?.clientWidth || 0,
    }));
  }
  function render() {
    const height = win.innerHeight;
    const rect = hero?.getBoundingClientRect();
    const cover = rect ? ease(clamp(-rect.top / Math.max(1, rect.height) * 1.25)) : 0;
    doc.body?.classList.toggle('b-cover-framed', cover > .08);
    paper?.style.setProperty('--b-cover-inset', `${(cover * 6).toFixed(3)}%`);
    paper?.style.setProperty('--b-cover-scale', (1 - cover * .08).toFixed(4));
    paper?.style.setProperty('--b-cover-lift', `${(-cover * 12).toFixed(2)}px`);
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();
    let progress = settled ? 1 : entryProgress(gridRect.top, height, .48);
    if (grid.contains(doc.activeElement) || progress >= .995) { settled = true; progress = 1; }
    items.forEach((item, index) => {
      const pose = fanPose(index, items.length, boxes[index], progress);
      item.style.setProperty('--b-photo-x', `${pose.x.toFixed(2)}px`);
      item.style.setProperty('--b-photo-y', `${pose.y.toFixed(2)}px`);
      item.style.setProperty('--b-photo-rotate', `${pose.rotation.toFixed(3)}deg`);
      item.style.setProperty('--b-photo-scale', pose.scale.toFixed(4));
      item.style.setProperty('--b-photo-order', String(items.length - index));
    });
    grid.classList.toggle('b-album-open', progress === 1);
  }
  function reset() {
    doc.body?.classList.remove('b-cover-framed');
    paper?.style.removeProperty('--b-cover-inset');
    paper?.style.removeProperty('--b-cover-scale');
    paper?.style.removeProperty('--b-cover-lift');
    settled = true;
    items.forEach(item => ['--b-photo-x', '--b-photo-y', '--b-photo-rotate', '--b-photo-scale', '--b-photo-order'].forEach(key => item.style.removeProperty(key)));
    grid?.classList.add('b-album-open');
  }
  const driver = createSceneDriver({ doc, win, render, measure, reset, className: 'theme-b-motion' });
  doc.addEventListener('focusin', onFocus);
  driver.setEnabled(enabled);
  return {
    setEnabled: driver.setEnabled, refresh: driver.refresh,
    destroy() { doc.removeEventListener('focusin', onFocus); driver.destroy(); },
  };
}
