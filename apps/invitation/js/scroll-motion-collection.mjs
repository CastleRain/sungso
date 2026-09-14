const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const unit = value => Math.max(0, Math.min(1, finite(value)));
const number = value => String(Number(value.toFixed(5)));
const px = value => `${number(value)}px`;
const deg = value => `${number(value)}deg`;

/** Position-based album, exhibition and festival treatments; no timers or state. */
export function collectionMotion(id, { current, transition, progress, panY, width, height } = {}) {
  if (!['vinyl', 'museum', 'festival'].includes(id)) return null;
  const t = unit(transition), p = current ? unit(progress) : 0;
  const w = Math.max(1, finite(width, 390)), h = Math.max(1, finite(height, 640));
  const pan = current ? Math.min(0, finite(panY)) : 0;
  // Finish one paragraph before revealing the next, with a small paper pause.
  const close = unit(t / .48), open = unit((t - .5) / .5);
  const movement = current ? close : 1 - open;
  const base = {
    '--scene-x': '0px', '--scene-y': px(pan), '--scene-scale': '1',
    '--scene-opacity': number(current ? 1 - close : open),
    '--scene-rotate': '0deg', '--scene-rotate-y': '0deg',
    '--scene-origin': `50% ${px(h / 2 - pan)}`,
    '--scene-clip': 'inset(0)', '--scene-brightness': '1',
  };

  if (id === 'vinyl') return {
    ...base,
    '--scene-x': px((current ? -1 : 1) * w * .12 * movement),
    '--scene-scale': number(1 - .12 * movement),
    '--scene-rotate': deg((current ? -24 : 24) * movement),
    '--record-scroll-turn': deg(p * 220),
    '--record-sleeve-shift': px(p * 14),
    '--record-sticker-turn': deg(-5 + p * 10),
    '--record-wave-scale': number(.45 + Math.sin(p * Math.PI) * .55),
    '--record-wave-alternate': number(1 - Math.sin(p * Math.PI) * .45),
  };

  if (id === 'museum') return {
    ...base,
    '--scene-x': px((current ? -1 : 1) * w * .32 * movement),
    '--scene-scale': number(1 - .04 * movement),
    '--scene-rotate-y': deg((current ? 34 : -34) * movement),
    '--scene-origin': `${current ? '0%' : '100%'} ${px(h / 2 - pan)}`,
    '--scene-brightness': number(1 - .15 * movement),
    '--exhibit-photo-scale': number(1.08 - p * .08),
    '--exhibit-light-x': `${number(25 + p * 50)}%`,
    '--exhibit-mat-depth': px(9 + Math.sin(p * Math.PI) * 7),
  };

  return {
    ...base,
    '--scene-y': px(pan + (current ? -1 : 1) * h * .3 * movement),
    '--scene-scale': number(1 - .07 * movement),
    '--scene-rotate': deg((current ? 4 : -4) * movement),
    '--scene-origin': `50% ${px(h - pan)}`,
    '--festival-rosette-turn': deg(12 + p * 100),
    '--festival-banner-turn': deg(-4 + p * 7),
    '--festival-banner-x': px(-12 + p * 24),
    '--festival-photo-scale': number(1.12 - p * .12),
    '--festival-light-x': `${number(15 + p * 70)}%`,
    '--festival-confetti-y': px(-24 + p * 64),
    '--festival-confetti-turn': deg(-8 + p * 16),
  };
}
