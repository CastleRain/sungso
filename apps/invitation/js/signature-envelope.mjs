import { PHOTOS } from './catalog.mjs?v=20260914-scroll-editions';
import { escapeHtml } from './core.mjs?v=20260914-scroll-editions';

const postmark = `<svg viewBox="0 0 148 82" fill="none" aria-hidden="true"><circle cx="45" cy="41" r="31"/><circle cx="45" cy="41" r="27"/><path d="M71 27c17-9 24 9 41 0s24 9 36 0M74 36c14-9 21 9 38 0s24 9 36 0M74 45c14-9 21 9 38 0s24 9 36 0M71 54c17-9 24 9 41 0s24 9 36 0"/><text x="45" y="29">WITH LOVE</text><text x="45" y="44" class="env-postmark-day">18 MAY</text><text x="45" y="58">2030</text></svg>`;
const letterIds = ['beginning', 'ordinary', 'promise'];
const storyLetters = [
  {
    id: letterIds[0], number: '01', english: 'The beginning', title: '안부가 기다려지던 날', to: '처음의 우리에게,',
    paragraphs: ['대단한 일은 없었어도, 너에게 들려주고 싶은 이야기는 늘 있었어. 오늘 본 하늘, 맛있었던 점심, 집으로 돌아오는 길의 작은 일들.', '하루의 끝에 안부를 묻는 일이 자연스러워질 즈음 알게 되었어. 너와 나누는 평범한 이야기가 내 하루에서 가장 기다려지는 시간이라는 걸.'],
    closing: '작은 안부에서 시작된 마음.',
  },
  {
    id: letterIds[1], number: '02', english: 'The everyday', title: '별일 없어 더 좋은 하루', to: '오늘의 우리에게,',
    paragraphs: ['서두르지 않는 주말, 익숙한 길을 조금 돌아 걷는 산책. 무엇을 할지보다 누구와 함께인지가 더 소중해졌어.', '마음이 지친 날에는 답을 찾기보다 곁에 앉아주고, 기쁜 일이 생기면 누구보다 먼저 웃어주는 사람. 그렇게 우리는 서로에게 편히 돌아갈 자리가 되었어.'],
    closing: '오래도록 좋아하고 싶은 우리의 일상.',
  },
  {
    id: letterIds[2], number: '03', english: 'The promise', title: '앞으로도, 같은 편에서', to: '내일의 우리에게,',
    paragraphs: ['앞으로의 모든 날을 미리 알 수는 없겠지. 다만 계절이 바뀌어도 서로의 마음을 묻는 일을 잊지 않으려 해.', '좋은 날에는 함께 기뻐하고 어려운 날에는 손을 조금 더 꼭 잡으며, 매일의 작은 약속을 지키는 두 사람이 되자. 우리의 다음 이야기를 이제 함께 써 내려가려 해.'],
    closing: '언제나 같은 편이 되어줄게.',
  },
];

function letters() {
  return `<section class="env-correspondence" data-section="story" aria-labelledby="env-story-title">
    <div class="env-section-index"><span>THE CORRESPONDENCE</span><span>THREE LETTERS</span></div>
    <p class="env-script">A little of our story</p>
    <h2 id="env-story-title">우리라는 이름의 편지</h2>
    <p class="env-story-intro">처음의 설렘에서 오늘의 약속까지.<br>접힌 편지 세 장에 우리의 마음을 담았어요.</p>
    <div class="env-folded-letters">${storyLetters.map((letter, index) => `<details class="env-folded-letter" data-envelope-letter="${letter.id}"${index === 0 ? ' open' : ''}>
      <summary><span class="env-letter-number" aria-hidden="true">${letter.number}</span><span class="env-letter-subject"><span>${letter.english}</span><strong>${letter.title}</strong></span><span class="env-letter-toggle" aria-hidden="true"></span></summary>
      <div class="env-letter-content"><p class="env-letter-to">${letter.to}</p>${letter.paragraphs.map(paragraph => `<p>${paragraph}</p>`).join('')}<p class="env-letter-closing">${letter.closing}</p><p class="env-letter-signature">성우 & 소희</p></div>
    </details>`).join('')}</div>
    <p class="env-reading-hint">편지의 제목을 누르면 펼치거나 접을 수 있어요.</p>
    <small class="sample-caption">디자인을 살펴보기 위한 예시 이야기입니다.</small>
  </section>`;
}

const inset = (part, kind, number, title) => part ? `<div class="env-insert env-insert-${kind}"><div class="env-insert-label" aria-hidden="true"><span>${number}</span><span>${title}</span><span>↗</span></div>${part}</div>` : '';

/** Complete paper-ateliers preview. Optional sections are supplied by the caller. */
export function renderSignatureEnvelope(selection, parts) {
  // Selection is deliberately not copied into HTML; the shared renderer owns palette
  // validation, gallery layout, example markup and the original opening experience.
  void selection;
  return `<div class="env-postal-header" aria-hidden="true"><span>THE WEDDING POST</span><span>VOL. 01 — MAY 2030</span></div>
    <div class="env-cover-sheet">${parts.cover || ''}<div class="env-cover-colophon" aria-hidden="true"><span>A PERSONAL INVITATION</span><span>WITH LOVE, S & S</span></div></div>
    <div class="env-greeting-sheet">
      <div class="env-address-block"><div><span>DELIVER TO</span><p>우리의 소중한 당신께</p></div><div class="env-postage" aria-hidden="true"><span>THE WEDDING</span><strong>S<span>&</span>S</strong><span>LOVE · 0518</span></div></div>
      <div class="env-letter-heading" aria-hidden="true"><span>Dear, our beloved</span><span>01 / INVITATION</span></div>
      ${parts.greeting || ''}
      <div class="env-greeting-postmark" aria-hidden="true">${postmark}</div>
    </div>
    ${parts.story ? letters() : ''}
    <div class="env-date-sheet"><p class="env-date-annotation" aria-hidden="true">ONE DAY, A LIFETIME.</p><div class="env-date-frame">${parts.date || ''}</div><p class="env-date-footnote">당신과 함께 기억하고 싶은 날</p></div>
    ${parts.gallery ? `<div class="env-photographs"><div class="env-section-index"><span>FROM OUR COLLECTION</span><span>PLATES 01—03</span></div><p class="env-script">Moments to keep</p>${parts.gallery}<p class="env-photo-caption"><span aria-hidden="true">S & S — PRIVATE ALBUM</span><span>오래 간직할, 지금의 우리.</span></p></div>` : ''}
    <div class="env-enclosures${parts.directions || parts.accounts || parts.rsvp || parts.guestbook ? '' : ' env-enclosures-empty'}">
      ${inset(parts.directions, 'directions', 'I', 'THE PLACE')}
      ${inset(parts.accounts, 'accounts', 'II', 'A KIND THOUGHT')}
      ${inset(parts.rsvp, 'rsvp', 'III', 'YOUR REPLY')}
      ${inset(parts.guestbook, 'guestbook', 'IV', 'A NOTE TO US')}
    </div>
    <div class="env-last-page"><figure class="env-last-photograph"><img src="${escapeHtml(PHOTOS[1].src)}" alt="${escapeHtml(PHOTOS[1].alt)}" width="1536" height="1024" loading="lazy" decoding="async"><figcaption>Every ordinary day, with you.</figcaption></figure>${parts.ending || ''}<div class="env-postscript"><span>P.S. 당신의 자리도 남겨둘게요.</span><span aria-hidden="true">${postmark}</span></div><p class="env-print-colophon">SEALED WITH LOVE · SUNGWOO & SOHEE<br><span>가상의 사진·날짜·장소를 사용한 디자인 예시</span></p></div>`;
}

/** Native details supply keyboard behavior; only their open state survives rerenders. */
export function createEnvelopeSignature() {
  const openLetters = new Map();
  let mountedRoot = null;
  let mountedLetters = [];
  let onToggle = null;
  return {
    mount(root) {
      this.dispose();
      if (!root) return;
      mountedRoot = root;
      mountedLetters = [...root.querySelectorAll('details[data-envelope-letter]')].filter(letter => letterIds.includes(letter.dataset.envelopeLetter));
      for (const letter of mountedLetters) {
        const id = letter.dataset.envelopeLetter;
        if (openLetters.has(id)) letter.open = openLetters.get(id);
        else openLetters.set(id, letter.open);
      }
      const listener = event => {
        const letter = event.target;
        if (onToggle !== listener || mountedRoot !== root || !root.contains(letter) || !mountedLetters.includes(letter)) return;
        openLetters.set(letter.dataset.envelopeLetter, letter.open);
      };
      onToggle = listener;
      root.addEventListener('toggle', onToggle, true);
    },
    dispose() {
      // Native details changes `open` synchronously but dispatches `toggle` later.
      // Keep the original nodes: the caller may already have replaced root.innerHTML.
      for (const letter of mountedLetters) openLetters.set(letter.dataset.envelopeLetter, letter.open);
      mountedRoot?.removeEventListener('toggle', onToggle, true);
      mountedRoot = null;
      mountedLetters = [];
      onToggle = null;
    },
  };
}
