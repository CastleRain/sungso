import { PHOTOS } from './catalog.mjs?v=20260914-reference-samples';
import { escapeHtml as e } from './core.mjs?v=20260914-reference-samples';

// Editorial scenes are fictional. They do not describe real astronomical events.
const SCENES = Object.freeze([
  Object.freeze({ photo: 0, label: '처음의 빛', english: 'THE FIRST LIGHT', photoTitle: '정원의 두 사람', title: '우연이 빛나던 날', line: '수많은 하루 사이에서\n너라는 작은 빛을 만났어.', coordinate: 'CHAPTER 01 · A FIRST HELLO', glow: 'dawn' }),
  Object.freeze({ photo: 1, label: '함께 걷는 밤', english: 'OUR BLUE HOUR', photoTitle: '나란히 걷는 순간', title: '같은 속도로 걷는 밤', line: '어디로 향하는지보다\n누구와 함께인지가 소중해졌어.', coordinate: 'CHAPTER 02 · SIDE BY SIDE', glow: 'blue' }),
  Object.freeze({ photo: 2, label: '앞으로의 별', english: 'THE NEXT ORBIT', photoTitle: '서로를 바라보며', title: '너와, 오래도록', line: '아직 이름 붙이지 못한 계절도\n너와 함께라면 기다려져.', coordinate: 'CHAPTER 03 · ALL OUR TOMORROWS', glow: 'rose' }),
]);

const orbit = `<svg class="cs-orbit-drawing" viewBox="0 0 360 190" fill="none" aria-hidden="true"><ellipse cx="180" cy="95" rx="149" ry="53" transform="rotate(-21 180 95)"/><ellipse cx="180" cy="95" rx="107" ry="79" transform="rotate(32 180 95)"/><path d="M24 95H336M180 13V177" stroke-dasharray="2 8"/><circle cx="180" cy="95" r="28"/><path class="cs-orbit-star" d="m180 69 5 21 21 5-21 5-5 21-5-21-21-5 21-5Z"/><circle class="cs-orbit-point" cx="48" cy="129" r="3"/><circle class="cs-orbit-point" cx="303" cy="56" r="3"/><circle cx="259" cy="136" r="2"/></svg>`;

function scenes(includeStory) {
  const first = SCENES[0], photo = PHOTOS[first.photo];
  return `<section class="cs-scenes" aria-label="우리의 세 가지 예시 장면" data-constellation-scenes data-scene="0" data-glow="${first.glow}" data-show-story="${includeStory}">
    <div class="cs-chapter"><span>02</span><p>THE SEASONS OF US</p><span aria-hidden="true">✦</span></div>
    <div class="cs-scenes-heading"><p class="cs-kicker">우리의 계절을 펼쳐보세요</p><h2>Every season,<br><em>with you.</em></h2><p>작은 순간을 고르면<br>사진 속 우리의 계절이 바뀝니다.</p></div>
    <div class="cs-scene-buttons" role="group" aria-label="예시 사진과 문구 선택">${SCENES.map((scene, index) => `<button type="button" data-constellation-scene="${index}" aria-pressed="${index === 0}" aria-controls="constellation-scene-stage"><span aria-hidden="true">0${index + 1}</span><span>${scene.label}</span><i aria-hidden="true">✧</i></button>`).join('')}</div>
    <div class="cs-scene-stage" id="constellation-scene-stage">
      <div class="cs-scene-orbit" aria-hidden="true"></div>
      <p class="cs-scene-coordinate" data-constellation-coordinate>${first.coordinate}</p>
      <figure class="cs-scene-figure"><img data-constellation-scene-photo src="${e(photo.src)}" alt="${e(photo.alt)}" width="${first.photo === 0 ? 1024 : 1536}" height="${first.photo === 0 ? 1536 : 1024}" loading="lazy" decoding="async"><span class="cs-photo-corner" aria-hidden="true">S <i>&</i> S</span><figcaption><span data-constellation-english>${first.english}</span><span data-constellation-counter>01 / 03</span></figcaption></figure>
      <div class="cs-scene-copy" aria-live="polite" aria-atomic="true"><p class="cs-kicker" data-constellation-scene-label>${first.label}</p><h3 data-constellation-scene-title>${includeStory ? first.title : first.photoTitle}</h3>${includeStory ? `<p data-constellation-scene-line>${first.line}</p>` : ''}</div>
    </div>
    <p class="cs-example-note">${includeStory ? '같은 가상 커플의 사진과 예시 이야기입니다.' : '같은 가상 커플의 사진을 활용한 세 장면입니다.'}</p>
  </section>`;
}

/** Returns the inside of the existing article; optional parts stay optional. */
export function renderSignatureConstellation(_selection, parts) {
  return `<div class="cs-edition"><span>AN INVITATION, IN THE STARS</span><span>VOL. 08</span></div>
    <div class="cs-opening">${parts.cover}</div>
    <div class="cs-invitation-letter"><div class="cs-chapter"><span>01</span><p>TWO SOULS, ONE UNIVERSE</p><span aria-hidden="true">✦</span></div>${orbit}${parts.greeting}<p class="cs-letter-postscript">서로에게 돌아갈 수 있는<br>가장 다정한 별이 되어.</p></div>
    ${parts.story ? `<div class="cs-story">${parts.story}</div>` : ''}
    ${parts.gallery ? `${scenes(Boolean(parts.story))}<div class="cs-photo-archive"><p class="cs-archive-label">A FEW MORE MOMENTS TO KEEP</p>${parts.gallery}</div>` : ''}
    <div class="cs-date"><div class="cs-date-orbits" aria-hidden="true"><i></i><i></i><span>✦</span></div><div class="cs-chapter"><span>03</span><p>A DAY IN OUR UNIVERSE</p><span aria-hidden="true">✧</span></div>${parts.date}<p class="cs-coordinate-note">각자의 궤도를 지나<br>하나의 계절로 만나는 날.</p></div>
    ${parts.directions ? `<div class="cs-arrival"><p class="cs-vertical-note" aria-hidden="true">FOLLOW THE LIGHT</p>${parts.directions}</div>` : ''}
    ${parts.accounts || parts.rsvp || parts.guestbook ? `<div class="cs-warm-wishes">${parts.accounts}${parts.rsvp}${parts.guestbook}</div>` : ''}
    <div class="cs-finale"><div class="cs-final-orbit" aria-hidden="true">${orbit}</div><p class="cs-finale-title">Of all the stars,<br><em>I found you.</em></p>${parts.ending}<div class="cs-colophon"><span>OUR LITTLE UNIVERSE</span><span aria-hidden="true">✦</span><span>WITH LOVE, ALWAYS</span></div></div>`;
}

/** One memory-only scene selection, preserved across option/route remounts. */
export function createConstellationSignature() {
  let selected = 0, container = null;
  const roots = new Set();

  function render(root) {
    const scene = SCENES[selected], photo = PHOTOS[scene.photo];
    root.dataset.scene = String(selected);
    root.dataset.glow = scene.glow;
    root.querySelectorAll('button[data-constellation-scene]').forEach(button => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.constellationScene) === selected));
    });
    const image = root.querySelector('[data-constellation-scene-photo]');
    if (image) {
      image.setAttribute('src', photo.src); image.setAttribute('alt', photo.alt);
      image.setAttribute('width', scene.photo === 0 ? '1024' : '1536');
      image.setAttribute('height', scene.photo === 0 ? '1536' : '1024');
    }
    for (const [name, value] of Object.entries({ coordinate: scene.coordinate, english: scene.english, counter: `0${selected + 1} / 03`, 'scene-label': scene.label, 'scene-title': root.dataset.showStory === 'true' ? scene.title : scene.photoTitle, 'scene-line': root.dataset.showStory === 'true' ? scene.line : '' })) {
      const target = root.querySelector(`[data-constellation-${name}]`);
      if (target && target.textContent !== value) target.textContent = value;
    }
  }

  function select(event) {
    const button = event.target?.closest?.('button[data-constellation-scene]');
    if (!button || button.disabled || !container?.contains(button) || !/^[0-2]$/.test(button.dataset.constellationScene || '')) return;
    const root = button.closest('[data-constellation-scenes]');
    if (!roots.has(root)) return;
    const next = Number(button.dataset.constellationScene);
    if (next === selected) return;
    selected = next;
    for (const target of roots) render(target);
  }

  function dispose() {
    container?.removeEventListener('click', select);
    roots.clear(); container = null;
  }

  function mount(nextContainer) {
    dispose();
    if (!nextContainer) return;
    container = nextContainer;
    const candidates = [...container.querySelectorAll('[data-constellation-scenes]')];
    if (container.matches?.('[data-constellation-scenes]')) candidates.unshift(container);
    for (const root of candidates) { roots.add(root); render(root); }
    if (roots.size) container.addEventListener('click', select);
  }

  return { mount, dispose };
}
