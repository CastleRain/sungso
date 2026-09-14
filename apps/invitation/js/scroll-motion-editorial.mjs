const clamp = value => Math.max(0, Math.min(1, value));
const number = value => String(Number(value.toFixed(5)));
const px = value => `${number(value)}px`;
const deg = value => `${number(value)}deg`;

/**
 * Each scene closes before the following one opens. All values are derived from
 * scroll position, including ornaments, so revisiting a position restores it.
 * `height` is the visible screen height; the actual scene may be much longer.
 */
export function editorialMotion(id, { current, transition, progress, panY, width, height }) {
  if (!['film', 'greenhouse', 'scrapbook'].includes(id)) return null;
  const close = clamp(transition / .46);
  const open = clamp((transition - .52) / .48);
  const movement = current ? close : 1 - open;
  const reading = current ? progress : 0;
  const offset = current ? -panY : 0;
  const settled = current ? transition === 0 : transition === 1;
  const shared = {
    '--scene-x': '0px',
    '--scene-y': px(current ? panY : 0),
    '--scene-scale': '1',
    '--scene-rotate': '0deg',
    '--scene-rotate-y': '0deg',
    '--scene-origin': `50% ${px(offset + height / 2)}`,
    '--scene-clip': 'inset(0)',
    '--scene-brightness': '1',
    '--scene-opacity': number(current ? 1 - close : open),
  };

  if (id === 'film') {
    // A horizontal cinema shutter closes around the visible portion of a long
    // scene, not around that scene's potentially offscreen geometric centre.
    const top = offset + height * movement / 2;
    const bottom = offset + height * (1 - movement / 2);
    return {
      ...shared,
      '--scene-opacity': number(current ? (close < 1 ? 1 : 0) : (open > 0 ? 1 : 0)),
      '--scene-clip': settled ? 'inset(0)' : `polygon(0 ${px(top)},100% ${px(top)},100% ${px(bottom)},0 ${px(bottom)})`,
      '--scene-brightness': number(1 - movement * .18),
      '--film-grayscale': number(1 - reading),
      '--film-photo-brightness': number(.86 + reading * .14),
      '--film-photo-scale': number(1.1 - reading * .1),
      '--film-light-x': px(-width * .45 + reading * width * 1.05),
      '--film-light-opacity': number(Math.sin(reading * Math.PI) * .3),
      '--film-flare-y': px(25 - reading * 50),
    };
  }

  if (id === 'greenhouse') {
    // An oval aperture echoes the greenhouse arch. It shrinks completely before
    // the next scene grows, avoiding two layers of partially readable copy.
    return {
      ...shared,
      '--scene-opacity': number(current ? (close < 1 ? 1 : 0) : (open > 0 ? 1 : 0)),
      '--scene-clip': settled ? 'inset(0)' : `ellipse(${px(width * .85 * (1 - movement))} ${px(height * .85 * (1 - movement))} at 50% ${px(offset + height / 2)})`,
      '--leaf-left-rotation': deg(-27 + reading * 20),
      '--leaf-right-rotation': deg(-28 + reading * 20),
      '--leaf-scale': number(.8 + reading * .2),
      '--garden-photo-scale': number(1.1 - reading * .1),
      '--garden-saturation': number(.6 + reading * .4),
      '--garden-glass-scale': number(1 + reading * .15),
      '--garden-glass-opacity': number(.9 - reading * .5),
      '--garden-tag-rotation': deg(7 - reading * 10),
      '--flower-bud-x': number(.34 + reading * .34),
      '--flower-bud-y': number(.7 + reading * .18),
      '--flower-turn': deg(-18 + reading * 18),
    };
  }

  return {
    ...shared,
    '--scene-x': px(width * (current ? -.08 : .15) * movement),
    '--scene-scale': number(1 - movement * .04),
    '--scene-rotate': deg((current ? -3 : 4) * movement),
    '--scene-rotate-y': deg((current ? -72 : 58) * movement),
    '--scene-origin': `${current ? '0%' : '100%'} ${px(offset + height / 2)}`,
    '--scene-brightness': number(1 - movement * .13),
    '--paper-fold-opacity': number(movement * .4),
    '--scrap-photo-rotation': deg(5 - reading * 6),
    '--scrap-note-rotation': deg(-3 + reading * 4),
    '--scrap-sticker-rotation': deg(16 - reading * 25),
    '--scrap-tape-rotation': deg(-6 + reading * 4),
    '--scrap-photo-x': px((1 - reading) * 8),
    '--scrap-photo-y': px((1 - reading) * -6),
    '--scrap-heart-scale': number(.85 + reading * .15),
  };
}
