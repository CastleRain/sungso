import { WEDDING } from './wedding-date.mjs?v=20260915-venue-map';
import { getPhoto } from './personal-content.mjs?v=20260915-venue-map';
import { escapeHtml as e } from './core.mjs?v=20260915-venue-map';

const names = '<span>성우</span><i>&</i><span>소희</span>';
const image = (index, className, thumbnail) => `<img class="${className}" src="${e(getPhoto(index).src)}" alt="${e(getPhoto(index).alt)}" width="${getPhoto(index).width}" height="${getPhoto(index).height}" decoding="async" ${thumbnail ? 'loading="lazy"' : 'fetchpriority="high"'}>`;
const root = (id, thumbnail) => `class="cover cover-worlds cover-${id}${thumbnail ? ' experience-thumbnail is-active' : ''}"${thumbnail ? '' : ` data-experience="${id}"`}`;
const starShape = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 19.4 12.6 30 16 19.4 19.4 16 30 12.6 19.4 2 16 12.6 12.6Z"/></svg>';
const action = (kind, idleLabel, activeLabel) => `<button class="world-action" type="button" data-experience-action="${kind}" data-idle-label="${idleLabel}" data-active-label="${activeLabel}" aria-pressed="false"><span data-experience-label>${idleLabel}</span><span class="world-action-icon" aria-hidden="true">↗</span></button>`;
const artworkAction = (kind, idleLabel, activeLabel) => `<button class="world-artwork-action" type="button" data-experience-action="${kind}" data-idle-label="${idleLabel}" data-active-label="${activeLabel}" aria-pressed="false"><span class="world-artwork-label" data-experience-label>${idleLabel}</span></button>`;
const status = message => `<p class="world-status" data-experience-status aria-live="polite">${message}</p>`;
const date = `<p class="cover-date">${WEDDING.dotted} <span>${WEDDING.weekdayEn} · OUR WEDDING DAY</span></p>`;

// Fixed decorative positions keep the sky steady when a star is selected.
const stars = [
  { x: 13, y: 48, name: '첫 번째', word: '우연' },
  { x: 29, y: 17, name: '두 번째', word: '만남' },
  { x: 54, y: 34, name: '세 번째', word: '설렘' },
  { x: 79, y: 16, name: '네 번째', word: '약속' },
  { x: 87, y: 60, name: '다섯 번째', word: '영원' },
];

function constellation(thumbnail) {
  const lines = stars.slice(0, -1).map((point, index) => `<line data-star-line="${index}"${thumbnail ? ' class="is-lit"' : ''} x1="${point.x}" y1="${point.y}" x2="${stars[index + 1].x}" y2="${stars[index + 1].y}"/>`).join('');
  const points = stars.map((point, index) => {
    const contents = `${starShape}<span class="constellation-word">${point.word}</span>`;
    const placement = `style="--star-x:${point.x}%;--star-y:${point.y}%"`;
    return thumbnail
      ? `<span class="constellation-star is-lit" ${placement} aria-hidden="true">${contents}</span>`
      : `<button class="constellation-star" ${placement} type="button" data-experience-action="star" data-star="${index}" aria-label="${point.name} 별 밝히기: ${point.word}" aria-pressed="false">${contents}</button>`;
  }).join('');
  return `<div ${root('constellation', thumbnail)}>
    <div class="constellation-sky" aria-hidden="true"><span>✦</span><span>✧</span><span>·</span><span>✧</span><span>·</span><span>✦</span><span>·</span><span>✧</span><span>·</span><span>✦</span><span>·</span><span>·</span></div>
    <p class="small-caps world-eyebrow">WRITTEN IN THE STARS</p>
    <h2 class="world-title">Our little<br><em>universe.</em></h2>
    <p class="world-subtitle">수많은 별 중에서, 너를 만나</p>
    <div class="constellation-chart">
      <div class="constellation-orbit" aria-hidden="true"></div>
      <div class="constellation-portrait">${image(0, 'world-photo', thumbnail)}<span aria-hidden="true">S <i>&</i> S</span></div>
      <svg class="constellation-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
      ${points}
      <p class="constellation-caption">함께 빛날 우리의 모든 날</p>
    </div>
    <p class="couple-names world-names">${names}</p>${date}
    ${thumbnail ? '<p class="world-thumbnail-note">별을 이어 완성하는 우리의 우주</p>' : `${action('constellation', '별자리 한 번에 잇기', '별자리 다시 그리기')}${status('별 다섯 개를 눌러 우리의 별자리를 완성해 보세요.')}`}
  </div>`;
}

const paperPlant = side => `<svg class="storybook-flower storybook-flower-${side}" viewBox="0 0 110 180" fill="none" aria-hidden="true"><path d="M58 171C52 119 71 81 49 35M58 149C37 130 20 115 20 95M58 127C77 114 89 104 92 83" stroke="currentColor" stroke-width="2"/><path d="M52 125C25 119 17 106 20 94C40 96 51 107 52 125ZM62 116C85 113 96 98 92 83C72 87 63 100 62 116ZM56 84C38 81 25 64 31 51C49 53 56 66 56 84Z" fill="var(--soft)" stroke="currentColor"/><g fill="var(--paper)" stroke="currentColor" stroke-width=".7"><ellipse cx="49" cy="19" rx="10" ry="16"/><ellipse cx="64" cy="31" rx="16" ry="10" transform="rotate(-25 64 31)"/><ellipse cx="59" cy="48" rx="10" ry="16" transform="rotate(-35 59 48)"/><ellipse cx="40" cy="47" rx="10" ry="16" transform="rotate(35 40 47)"/><ellipse cx="33" cy="31" rx="16" ry="10" transform="rotate(25 33 31)"/></g><circle cx="49" cy="34" r="7" fill="currentColor"/><path d="M7 177H101" stroke="currentColor" stroke-width=".6"/></svg>`;

function storybook(thumbnail) {
  return `<div ${root('storybook', thumbnail)}>
    <p class="small-caps world-eyebrow">A NEW CHAPTER BEGINS</p>
    <h2 class="world-title">Once upon<br><em>our forever.</em></h2>
    <p class="world-subtitle">두 사람의 이야기가 펼쳐집니다</p>
    <div class="storybook-stage">
      <div class="storybook-book">
        <div class="storybook-pages" aria-hidden="true"><span></span><span></span></div>
        <div class="storybook-pop-up">
          <div class="storybook-photo">${image(0, 'world-photo', thumbnail)}<p>우리, 함께 쓰는 첫 페이지</p></div>
          ${paperPlant('left')}${paperPlant('right')}
          <span class="storybook-paper-heart" aria-hidden="true">♡</span>
          <span class="storybook-paper-star" aria-hidden="true">✧</span>
        </div>
        <div class="storybook-jacket" aria-hidden="true"><div class="storybook-jacket-border"><span class="small-caps">THE STORY OF US</span><span class="storybook-monogram">S<i>&</i>S</span><span class="storybook-jacket-rule"></span><span class="storybook-jacket-title">펼치면,<br>우리</span><span class="storybook-jacket-date">${WEDDING.enMonthFirst}</span></div></div>
      </div>
      ${thumbnail ? '' : artworkAction('unfold', '책 표지 펼치기', '책 다시 접기')}
    </div>
    <p class="couple-names world-names">${names}</p>${date}
    ${thumbnail ? '<p class="world-thumbnail-note">한 권의 책에서 피어나는 초대</p>' : `${action('unfold', '우리의 이야기 펼치기', '이야기 다시 접기')}${status('표지 속에 숨겨둔 작은 종이 정원을 펼쳐보세요.')}`}
  </div>`;
}

const confetti = Array.from({ length: 16 }, (_, index) => `<i style="--confetti-x:${5 + (index * 29) % 91}%;--confetti-delay:${(index % 5) * 0.075}s;--confetti-turn:${index % 2 ? -180 : 250}deg;--confetti-drift:${(index % 5 - 2) * 18}px"></i>`).join('');

function curtain(thumbnail) {
  return `<div ${root('curtain', thumbnail)}>
    <p class="small-caps world-eyebrow">THE WEDDING PREMIERE</p>
    <h2 class="world-title">The first<br><em>scene of us.</em></h2>
    <p class="world-subtitle">우리의 가장 빛나는 첫 장면</p>
    <div class="theater-stage">
      <div class="theater-scene">${image(0, 'world-photo', thumbnail)}<div class="theater-spotlight" aria-hidden="true"></div><div class="theater-photo-caption"><span class="small-caps">STARRING</span><p class="couple-names">${names}</p><span>${WEDDING.dotted}</span></div></div>
      <div class="theater-curtain theater-curtain-left" aria-hidden="true"></div><div class="theater-curtain theater-curtain-right" aria-hidden="true"></div>
      <div class="theater-closed-title" aria-hidden="true"><span>ꕥ</span><span class="theater-monogram">S <i>&</i> S</span><span class="small-caps">THE BEGINNING OF FOREVER</span></div>
      <div class="theater-valance" aria-hidden="true"></div>
      <div class="theater-confetti" aria-hidden="true">${confetti}</div>
      <div class="theater-frame" aria-hidden="true"></div>
      ${thumbnail ? '' : artworkAction('curtain', '무대 커튼 열기', '무대 커튼 닫기')}
    </div>
    <p class="theater-caption">평생 함께할 이야기, 지금 시작합니다.</p>${date}
    ${thumbnail ? '<p class="world-thumbnail-note">커튼이 열리면 시작되는 우리</p>' : `${action('curtain', '우리의 첫 장면 열기', '커튼 다시 닫기')}${status('커튼을 열고 두 사람의 첫 장면을 만나보세요.')}`}
  </div>`;
}

export function worldsCover(templateId, thumbnail = false) {
  if (templateId === 'constellation') return constellation(thumbnail);
  if (templateId === 'storybook') return storybook(thumbnail);
  if (templateId === 'curtain') return curtain(thumbnail);
  return null;
}
