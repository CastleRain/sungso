import { editorialMotion } from './scroll-motion-editorial.mjs?v=20260914-immersive-worlds';
import { romanticMotion } from './scroll-motion-romantic.mjs?v=20260914-immersive-worlds';
import { collectionMotion } from './scroll-motion-collection.mjs?v=20260914-immersive-worlds';

/** Every visual value is a function of position; there is no playback clock. */
export function storyMotion(id, input) {
  const { current, transition: t, progress, panY, width } = input;
  return {
    '--scene-x': `${current ? -width * .14 * t : width * .35 * (1 - t)}px`,
    '--scene-y': `${current ? panY : 24 * (1 - t)}px`,
    '--scene-scale': String(current ? 1 - .06 * t : .94 + .06 * t),
    '--scene-opacity': String(current ? Math.max(0, 1 - t * 2.2) : Math.max(0, (t - .45) / .55)),
    '--scene-rotate': '0deg', '--scene-rotate-y': '0deg', '--scene-origin': 'center top',
    '--scene-clip': 'inset(0)', '--scene-brightness': '1',
    '--scene-progress': String(progress), '--photo-scale': String(1.12 - .12 * progress),
    ...(editorialMotion(id, input) || romanticMotion(id, input) || collectionMotion(id, input) || {}),
  };
}
