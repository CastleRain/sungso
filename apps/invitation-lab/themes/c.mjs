import { clamp, entryProgress, createSceneDriver } from './a.mjs';

export const theme = Object.freeze({
  id: 'c', name: '빛이 머무는 장면', english: 'In this light',
  description: '사진 위를 지나가는 빛, 그 뒤에 오래 남는 우리의 순간.',
  heroDecor: '<span class="c-cover-edge" aria-hidden="true"></span>',
  storyDecor: '<span class="c-story-light" aria-hidden="true"></span>',
  galleryDecor: '<svg class="c-light-mark" viewBox="0 0 74 28" fill="none" aria-hidden="true"><path d="M2 23C24 23 28 4 37 4S50 23 72 23M37 0V28"/></svg>',
});

export function lightPose(progress) {
  const p = clamp(progress);
  return { position: -45 + p * 190, opacity: Math.sin(p * Math.PI) * .28, inset: (1 - p) * 5 };
}

export function mountTheme({ doc = document, win = window, enabled = true } = {}) {
  const paper = doc.querySelector('.paper');
  const hero = doc.querySelector('.hero');
  const story = doc.getElementById('our-story');
  const grid = doc.getElementById('gallery-grid');
  let storySettled = false, gallerySettled = false;
  function apply(element, progress) {
    if (!element) return;
    const pose = lightPose(progress);
    element.style.setProperty('--c-light-x', `${pose.position.toFixed(2)}%`);
    element.style.setProperty('--c-light-opacity', pose.opacity.toFixed(4));
    element.style.setProperty('--c-window-inset', `${pose.inset.toFixed(3)}%`);
  }
  function render() {
    const height = win.innerHeight;
    const rect = hero?.getBoundingClientRect();
    const progress = rect ? clamp(-rect.top / Math.max(1, rect.height) * 1.8) : 1;
    apply(hero, progress);
    if (story) {
      let p = storySettled ? 1 : entryProgress(story.getBoundingClientRect().top, height, .65);
      if (p >= .995 || story.contains(doc.activeElement)) { p = 1; storySettled = true; }
      apply(story, p);
    }
    if (grid) {
      let p = gallerySettled ? 1 : entryProgress(grid.getBoundingClientRect().top, height, .5);
      if (p >= .995 || grid.contains(doc.activeElement)) { p = 1; gallerySettled = true; }
      apply(grid, p);
    }
  }
  function reset() {
    [hero, story, grid].forEach(element => apply(element, 1));
    storySettled = true;
    gallerySettled = true;
  }
  const driver = createSceneDriver({ doc, win, render, reset, className: 'theme-c-motion' });
  const onFocus = () => driver.queue();
  doc.addEventListener('focusin', onFocus);
  driver.setEnabled(enabled);
  return {
    setEnabled: driver.setEnabled, refresh: driver.refresh,
    destroy() {
      driver.destroy(); doc.removeEventListener('focusin', onFocus);
      [paper, hero, story, grid].filter(Boolean).forEach(element => ['--c-light-x', '--c-light-opacity', '--c-window-inset'].forEach(key => element.style.removeProperty(key)));
    },
  };
}
