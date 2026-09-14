// Original monoline lettering. Separate pen strokes keep the writing order
// independent of fonts and let every cover share its existing one-shot memory.
const strokes = [
  ['w', .10, .84, 'M30 94C48 49 89 18 109 39C129 59 95 133 78 166C97 147 119 101 140 62C133 99 125 143 136 158C147 174 176 132 199 93C188 120 175 151 184 158C189 162 197 151 202 145'],
  ['e', .90, .27, 'M202 145C220 140 241 119 229 113C216 106 199 128 199 143C197 165 227 168 254 141'],
  ['d-first', 1.13, .52, 'M254 141C269 117 294 119 283 146C272 172 246 170 251 148C254 134 272 124 288 126C310 113 345 39 331 39C316 39 290 124 285 147C279 170 298 159 311 141'],
  ['d-second', 1.61, .52, 'M311 141C326 117 351 119 340 146C329 172 303 170 308 148C311 134 329 124 345 126C367 113 402 39 388 39C373 39 347 124 342 147C336 170 355 159 372 141'],
  ['i', 2.09, .21, 'M372 141C380 131 384 123 388 120C381 137 369 156 378 160C385 164 394 152 402 141'],
  ['i-dot', 2.30, .10, 'M394 103L396 100'],
  ['n', 2.32, .41, 'M402 141C408 130 413 119 416 121C418 124 408 146 406 154C419 134 441 115 445 132C449 146 432 162 446 160C457 159 468 149 475 139'],
  ['g', 2.69, .59, 'M475 139C488 119 513 120 506 142C496 166 468 171 470 150C472 131 496 121 509 129C502 157 486 211 465 218C443 225 442 195 471 175C485 165 499 159 514 153C531 145 544 136 555 127'],
  ['flourish', 3.20, .35, 'M528 187C448 208 287 201 191 192C151 188 113 190 93 202'],
];

/** Decorative cover overlay; omit it from thumbnails and passive comparisons. */
export function weddingLettering({ variant = 'paper' } = {}) {
  const selected = ['rose', 'photo', 'paper'].includes(variant) ? variant : 'paper';
  return `<div class="wl-overlay wl-${selected}" aria-hidden="true"><div class="wl-script" data-reference-intro-trigger><svg class="wl-word" viewBox="0 0 590 250" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false" role="presentation">${strokes.map(([name, start, duration, path]) => `<path class="wl-stroke" data-lettering-stroke="${name}" pathLength="100" d="${path}" style="--wl-start:${start}s;--wl-duration:${duration}s"/>`).join('')}</svg></div></div>`;
}
