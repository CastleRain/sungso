import { PHOTOS } from './catalog.mjs?v=20260914-immersive-worlds';
import { escapeHtml as e } from './core.mjs?v=20260914-immersive-worlds';

export const label = text => `<p class="imm-label">${e(text)}</p>`;
export const photo = (index, classes = '', eager = false) => `<img class="${classes}" src="${PHOTOS[index].src}" alt="${PHOTOS[index].alt}" width="${index === 0 ? 1024 : 1536}" height="${index === 0 ? 1536 : 1024}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
export const sampleDate = '<p class="imm-date">성우 & 소희 <span>2030. 05. 18 · SAT · 14:00</span></p>';
export function scene(key, classes, content, hold = 0, root = '') {
  return `<section class="imm-scene ${classes}" data-section="${key}"${hold ? ` data-story-hold="${hold}"` : ''}${root ? ` data-immersive-root="${root}"` : ''}>${content}</section>`;
}
export const unfoldButton = (text = '한 번에 펼쳐보기') => `<button type="button" class="imm-unfold" data-immersive-toggle aria-pressed="false" data-idle-label="${e(text)}"><span>${e(text)}</span><b aria-hidden="true">↗</b></button>`;
export const choices = (values, groupLabel) => `<div class="imm-choices" role="group" aria-label="${e(groupLabel)}">${values.map(([value, text], index) => `<button type="button" data-immersive-choice="${value}" aria-pressed="${index === 0}">${e(text)}</button>`).join('')}</div>`;
export const panel = (value, html, first = false) => `<div class="imm-panel" data-immersive-panel="${value}"${first ? '' : ' hidden'}>${html}</div>`;
export const fixed = (parts, className) => ['date', 'gallery', 'directions', 'accounts', 'rsvp', 'guestbook', 'ending'].map(key => parts[key]?.replace('class="', `class="${className} `) || '').join('');
