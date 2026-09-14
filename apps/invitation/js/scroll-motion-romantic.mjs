// Scroll position is the only clock here: going back recreates the same frame.
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const unit = value => Math.max(0, Math.min(1, finite(value)));
const number = value => String(Number(value.toFixed(4)));
const px = value => `${number(value)}px`;
const deg = value => `${number(value)}deg`;

/** Decorative motion only; existing invitation interactions keep their own state. */
export function romanticMotion(id, { current, transition, progress, panY, width, height } = {}) {
  if (!['constellation', 'envelope', 'promenade'].includes(id)) return null;
  const t = unit(transition), p = unit(progress);
  const w = Math.max(1, finite(width, 390)), h = Math.max(1, finite(height, 640));
  const pan = Math.min(0, finite(panY));
  const incoming = 1 - t;
  // A short, clear handover keeps different paragraphs from cross-fading together.
  const opacity = current ? Math.max(0, 1 - t / .48) : Math.max(0, (t - .44) / .56);
  const base = {
    '--scene-opacity': number(opacity),
    '--scene-rotate': '0deg',
    '--scene-rotate-y': '0deg',
    '--scene-clip': 'inset(0%)',
    '--scene-brightness': '1',
  };

  if (id === 'constellation') {
    return {
      ...base,
      '--scene-x': '0px',
      '--scene-y': px(current ? pan - h * .035 * t : h * .075 * incoming),
      '--scene-scale': number(current ? 1 + .22 * t : .78 + .22 * t),
      '--scene-origin': `50% ${px(h * .43 - (current ? pan : 0))}`,
      '--scene-brightness': number(current ? 1 + .13 * t : .82 + .18 * t),
      '--sky-drift-x': px(-22 * p),
      '--sky-drift-y': px(-54 * p),
      '--sky-orbit-turn': deg(30 * p),
      '--sky-depth': number(1 + .12 * p),
      '--sky-sparkle': number(.44 + .32 * Math.sin(p * Math.PI)),
    };
  }

  if (id === 'envelope') {
    return {
      ...base,
      '--scene-x': px(current ? -w * .08 * t : w * .08 * incoming),
      '--scene-y': px(current ? pan - h * .14 * t : h * .18 * incoming),
      '--scene-scale': number(current ? 1 - .035 * t : .94 + .06 * t),
      '--scene-rotate': deg(current ? -7 * t : 6 * incoming),
      '--scene-rotate-y': deg(current ? -17 * t : 24 * incoming),
      '--scene-origin': `50% ${px(h * .85 - (current ? pan : 0))}`,
      '--scene-clip': current ? 'inset(0%)' : `inset(0% ${number(9 * incoming)}% ${number(28 * incoming)}% 0%)`,
      '--paper-fold-position': `${number(112 - 140 * p)}%`,
      '--paper-fold-opacity': number(.07 + .1 * Math.sin(p * Math.PI)),
      '--paper-stamp-turn': deg(4 - 7 * p),
      '--paper-photo-turn': deg(-3 + 2 * p),
    };
  }

  return {
    ...base,
    '--scene-x': px(current ? -w * t : w * incoming),
    '--scene-y': px(current ? pan : 0),
    '--scene-scale': '1',
    '--scene-origin': '50% 50%',
    '--walk-route-offset': number(-110 * p),
    '--walk-compass-turn': deg(-18 + 36 * p),
    '--walk-marker': `${number(8 + 84 * p)}%`,
    '--walk-route-progress': number(p),
    '--walk-photo-shift': `${number(45 + 10 * p)}%`,
  };
}
