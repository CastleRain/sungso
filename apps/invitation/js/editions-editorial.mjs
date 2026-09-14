import { PHOTOS } from './catalog.mjs?v=20260914-reference-samples';
import { escapeHtml as e } from './core.mjs?v=20260914-reference-samples';

const IDS = ['magazine', 'film', 'vinyl', 'museum'];
const photo = (index, className = '', eager = false) => `<img class="${className}" src="${e(PHOTOS[index].src)}" alt="${e(PHOTOS[index].alt)}" width="${index === 0 ? 1024 : 1536}" height="${index === 0 ? 1536 : 1024}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
const rule = (left, right = 'SUNGWOO & SOHEE') => `<div class="ed-rule"><span>${left}</span><span>${right}</span></div>`;
const sample = '<p class="ed-sample">가상 커플의 사진·이야기·예식 정보를 사용한 디자인 예시</p>';
const wrap = (part, className, label = '') => part ? `<div class="${className}">${label ? `<p class="ed-label">${label}</p>` : ''}${part}</div>` : '';
const button = (action, value, text, pressed = false) => `<button type="button" data-editorial-action="${action}" data-value="${value}" aria-pressed="${pressed}">${text}</button>`;

const FEATURES = [
  { label: '처음의 우리', headline: '우연을 지나,\n서로의 일상으로.', quote: '별일 없는 날에도\n너에게는 할 말이 생겨.', copy: '처음엔 취향이 궁금했어요. 좋아하는 계절과 자주 듣는 노래, 쉬는 날 걷고 싶은 동네. 작은 이야기를 나누다 보니 어느새 서로의 하루를 가장 먼저 궁금해하는 사람이 되었습니다.', foot: 'FIELD NOTE 01 · THE FIRST HELLO', photo: 0 },
  { label: '오늘의 우리', headline: '우리에게 좋은 날은\n아주 평범한 날.', quote: '같은 길을 걸으면\n다른 풍경이 보여.', copy: '목적지 없는 산책과 함께 고른 저녁 메뉴. 특별한 계획이 없는 날에도 둘이 있으면 충분했어요. 잘 웃고, 천천히 듣고, 서로의 속도에 맞춰 걷는 방법을 배우고 있습니다.', foot: 'FIELD NOTE 02 · AN ORDINARY SUNDAY', photo: 1 },
  { label: '내일의 우리', headline: '다음 계절에도,\n당신의 가장 가까이.', quote: '오래도록, 서로에게\n돌아갈 집이 되어.', copy: '아직 가보지 않은 길을 미리 알 수는 없겠지요. 다만 어려운 날에도 먼저 손을 내밀고 기쁜 일에는 함께 웃으려 합니다. 우리의 새로운 연재를 시작하는 날, 당신을 초대합니다.', foot: 'FIELD NOTE 03 · TO BE CONTINUED', photo: 2 },
];
const TRACKS = {
  A: [
    { title: 'Hello, stranger', subtitle: '처음 안부를 묻던 날', duration: '03:12', line: '수많은 하루 가운데\n너를 만난 작은 우연.', copy: '이름을 부르고 안부를 묻는 것만으로도 마음이 환해지던 날. 우리의 첫 번째 트랙은 작은 인사에서 시작됩니다.', photo: 0 },
    { title: 'A slow Sunday', subtitle: '서두르지 않는 주말', duration: '04:08', line: '발걸음을 맞추면\n어디든 좋은 길이 돼.', copy: '점심을 조금 늦게 먹고, 같은 길을 조금 더 걷는 일. 평범한 하루에 우리만 아는 리듬이 생겼어요.', photo: 1 },
    { title: 'You, my favorite', subtitle: '가장 좋아하는 사람', duration: '03:45', line: '좋아하는 게 많아져.\n그중에서도 늘, 너.', copy: '좋아하는 노래와 풍경이 늘어갈수록 가장 먼저 나누고 싶은 사람은 늘 같았습니다. 오늘도 당신의 이야기를 듣고 싶어요.', photo: 2 },
  ],
  B: [
    { title: 'A place called us', subtitle: '우리라는 집', duration: '04:21', line: '마음 놓고 돌아갈 곳,\n서로가 되기로 했어.', copy: '바쁜 하루 끝에 건네는 다정한 인사. 별다른 말 없이 곁에 머물 수 있는 편안함으로 서로의 집이 되어갑니다.', photo: 2 },
    { title: 'In every season', subtitle: '모든 계절의 약속', duration: '03:58', line: '다른 날씨 속에서도\n우리는 같은 편.', copy: '햇살 좋은 날에도, 조금 흐린 날에도 서로의 마음을 놓치지 않으려 해요. 계절이 바뀌어도 함께하는 마음은 이어집니다.', photo: 0 },
    { title: 'Forever, on repeat', subtitle: '앞으로의 모든 날', duration: '∞', line: '마지막 곡이 끝나도\n우리의 이야기는 계속.', copy: '오늘의 약속이 오래도록 우리의 일상에 흐르길. 소중한 당신과 함께 다음 트랙의 첫 소절을 시작하고 싶어요.', photo: 1 },
  ],
};
const ROOMS = [
  { title: '빛이 머무는 정원', english: 'A STUDY OF LIGHT', note: '같은 햇살 아래 나란히 선 두 사람. 화려한 장식보다 서로에게 향한 시선에 집중한 첫 번째 작품입니다.', material: '01 · GARDEN PORTRAIT · 가상 사진', photo: 0 },
  { title: '함께 걷는 속도', english: 'THE DISTANCE BETWEEN US', note: '작품 속 두 사람은 같은 방향을 향해 걷습니다. 누구도 앞서 가지 않는 보폭에서 오래 함께할 일상의 모양을 상상해 봅니다.', material: '02 · A WALK TOGETHER · 가상 사진', photo: 1 },
  { title: '가장 가까운 풍경', english: 'A PLACE TO RETURN', note: '서로를 바라보는 순간에는 멀리 있는 배경이 희미해집니다. 앞으로의 계절에도 가장 가까이 있고 싶은 마음을 담았습니다.', material: '03 · CLOSE TO YOU · 가상 사진', photo: 2 },
];

/** Standalone covers share no controls with the catalogue card that contains them. */
export function editorialCover(id, thumbnail = false) {
  const compact = thumbnail ? ' ed-cover-compact' : '';
  if (id === 'magazine') return `<div class="cover ed-cover ed-magazine-cover${compact}">${rule('THE WEDDING ISSUE', 'VOL. 01 / MAY 2030')}<h2 class="ed-masthead">US<span>.</span></h2><div class="ed-magazine-cover-image">${photo(0, '', !thumbnail)}<p class="ed-cover-sticker">A LOVE<br>WORTH<br>READING.</p><p class="ed-cover-byline">성우 & 소희<br><span>OUR NEW CHAPTER</span></p></div><div class="ed-magazine-headlines"><strong>평범한 날들을<br>특별하게 만드는 우리.</strong><p>두 사람의 이야기<br>그리고, 새로운 시작<br><span>2030.05.18 · SAT 2PM</span></p></div>${rule('A PERSONAL INVITATION', 'ISSUE 0518')}</div>`;
  if (id === 'film') return `<div class="cover ed-cover ed-film-cover${compact}">${rule('S&S ANALOGUE', 'COLOR NEGATIVE 35MM')}<h2>Some days<br>stay <em>forever.</em></h2><div class="ed-negative-frame">${photo(1, '', !thumbnail)}<span class="ed-frame-mark">01 — THE BEGINNING</span></div><p class="ed-film-title">어떤 날은,<br>오래도록 남습니다.</p><div class="ed-film-cover-footer"><span>성우 & 소희<br>2030.05.18</span><span class="ed-film-counter">01 / ∞</span></div></div>`;
  if (id === 'vinyl') return `<div class="cover ed-cover ed-vinyl-cover${compact}">${rule('S&S RECORDS', 'THE FIRST ALBUM')}<h2>our days,<br><em>on repeat.</em></h2><div class="ed-album-sleeve"><div class="ed-vinyl-record"><div class="ed-vinyl-label">${photo(2, '', !thumbnail)}<span>S & S</span></div></div><span class="ed-album-sticker">LOVE<br>33⅓ RPM</span></div><p class="ed-vinyl-subtitle">너와 나의 날들을 한 장의 음반에.</p>${rule('SUNGWOO × SOHEE', '2030.05.18')}<p class="ed-vinyl-volume">VOL. 01 · OUR WEDDING ALBUM</p></div>`;
  if (id === 'museum') return `<div class="cover ed-cover ed-museum-cover${compact}">${rule('GALLERY S&S', 'A PERSONAL EXHIBITION')}<h2>The art<br>of <em>being us.</em></h2><div class="ed-museum-cover-frame">${photo(0, '', !thumbnail)}<span>COLLECTION No. 01</span></div><div class="ed-museum-cover-label"><p>우리라는 작품</p><span>성우 & 소희의 결혼 기념전<br>2030.05.18 · 오후 2시</span></div></div>`;
  return '';
}

function magazineStory() {
  const first = FEATURES[0];
  return `<section class="ed-magazine-feature" data-section="story" data-editorial-stage="magazine">${rule('02 / THE COVER STORY', 'READ IN THREE CHAPTERS')}<h2>우리라는,<br><em>아주 긴 이야기.</em></h2><div class="ed-feature-tabs" role="group" aria-label="읽을 이야기 선택">${FEATURES.map((item, index) => button('article', index, `<span>0${index + 1}</span>${item.label}`, index === 0)).join('')}</div><div class="ed-feature-layout"><figure>${photo(0, 'ed-changing-photo')}<figcaption data-editorial-field="foot">${first.foot}</figcaption></figure><div class="ed-feature-copy" aria-live="polite" aria-atomic="true"><h3 data-editorial-field="headline">${first.headline}</h3><p data-editorial-field="copy">${first.copy}</p><blockquote data-editorial-field="quote">${first.quote}</blockquote></div></div><p class="ed-sample">챕터를 고르면 사진과 글이 함께 바뀌는 예시 기사입니다.</p></section>`;
}

function filmDarkroom() {
  return `<section class="ed-film-darkroom" data-editorial-stage="film" data-process="0">${rule('THE DARKROOM', 'NEGATIVE → MEMORY')}<h2>한 장을<br><em>기억으로 현상해요.</em></h2><p class="ed-lead">필름을 고르고, 빛을 더해보세요.<br>세 번의 과정이 지나면 색이 선명해집니다.</p><div class="ed-film-contact-sheet" role="group" aria-label="현상할 예시 필름 선택">${PHOTOS.map((_, index) => button('frame', index, `${photo(index)}<span>FRAME 0${index + 1}</span>`, index === 0)).join('')}</div><div class="ed-development-tray">${photo(0, 'ed-changing-photo')}<span class="ed-development-label" data-editorial-field="processLabel">01 / NEGATIVE</span></div><div class="ed-process-meter" aria-label="현상 과정"><span data-film-step="0">필름</span><i></i><span data-film-step="1">빛</span><i></i><span data-film-step="2">기억</span></div><div class="ed-action-row"><button type="button" data-editorial-action="develop" data-value="next" data-editorial-field="developButton">빛으로 현상하기 ↗</button><button type="button" data-editorial-action="reset" data-value="reset">처음으로</button></div><p class="ed-film-status" data-editorial-field="processStatus" aria-live="polite">선택한 필름을 빛에 꺼내볼까요?</p><p class="ed-sample">사진 연출 체험이며 원본 사진은 변경되지 않아요.</p></section>`;
}

function filmStory() {
  return `<section class="ed-film-scenes" data-section="story">${rule('SCENES FROM AN ORDINARY LIFE', 'REEL 01')}<h2>큰 사건 없는,<br>좋은 장면들.</h2>${FEATURES.map((item, index) => `<div class="ed-film-scene"><span class="ed-scene-index">0${index + 1}</span><div><p class="ed-label">${item.label}</p><h3>${item.headline}</h3><p>${item.copy}</p></div></div>`).join('')}<p class="ed-sample">예시 이야기 · 앞으로의 장면은 계속됩니다.</p></section>`;
}

function vinylPlayer() {
  const first = TRACKS.A[0];
  return `<section class="ed-vinyl-player" data-section="story" data-editorial-stage="vinyl" data-side="A">${rule('LINER NOTES', 'TWO SIDES OF OUR STORY')}<h2>한 곡씩,<br>우리의 이야기.</h2><div class="ed-record-player"><div class="ed-vinyl-record" data-editorial-disc><div class="ed-vinyl-label">${photo(first.photo, 'ed-changing-photo')}<span data-editorial-field="sideLabel">SIDE A</span></div></div><div class="ed-tonearm" aria-hidden="true"></div></div><div class="ed-record-controls"><div class="ed-side-switch" role="group" aria-label="음반 앞뒷면 선택">${button('side', 'A', 'SIDE A', true)}${button('side', 'B', 'SIDE B')}</div><button type="button" class="ed-turn-record" data-editorial-action="turn" data-value="turn">음반 한 바퀴 돌리기 ↻</button></div><div class="ed-track-list" role="group" aria-label="읽을 트랙 선택">${TRACKS.A.map((track, index) => button('track', index, `<span>0${index + 1}</span><strong data-track-title="${index}">${track.title}</strong><small data-track-duration="${index}">${track.duration}</small>`, index === 0)).join('')}</div><div class="ed-track-notes" aria-live="polite" aria-atomic="true"><p class="ed-label" data-editorial-field="subtitle">${first.subtitle}</p><h3 data-editorial-field="line">${first.line}</h3><p data-editorial-field="copy">${first.copy}</p></div><p class="ed-sample">제목을 누르면 예시 이야기를 읽을 수 있어요.<br>음원은 재생되지 않습니다.</p></section>`;
}

function museumRooms() {
  const first = ROOMS[0];
  return `<section class="ed-museum-exhibition" data-editorial-stage="museum" data-room="0">${rule('THE PERMANENT COLLECTION', 'THREE ROOMS')}<h2>천천히<br>둘러보아 주세요.</h2><p class="ed-lead">각 전시실에는 하나의 순간이 있습니다.<br>작품을 고르고, 그 옆의 작은 글을 읽어보세요.</p><div class="ed-room-switch" role="group" aria-label="전시실 선택">${ROOMS.map((_, index) => button('room', index, `<span>ROOM</span>0${index + 1}`, index === 0)).join('')}</div><div class="ed-gallery-wall"><button type="button" class="ed-exhibit-art" data-action="photo" data-index="0" aria-label="전시 예시 사진 1 크게 보기">${photo(first.photo, 'ed-changing-photo')}</button><span class="ed-wall-line" aria-hidden="true"></span></div><div class="ed-art-label" aria-live="polite" aria-atomic="true"><p class="ed-label" data-editorial-field="english">${first.english}</p><h3 data-editorial-field="title">${first.title}</h3><span data-editorial-field="material">${first.material}</span><p data-editorial-field="note">${first.note}</p></div></section>`;
}

/** Each edition keeps shared essentials and gallery controls, with its own complete rhythm. */
export function editorialBody(selection, parts) {
  const id = selection?.templateId;
  if (!IDS.includes(id)) return '';
  // Respect both the existing section contract and the already-filtered renderer parts.
  const p = { ...parts };
  for (const key of ['story', 'gallery', 'directions', 'accounts', 'rsvp', 'guestbook']) if (selection.sections?.[key] === false) p[key] = '';
  if (id === 'magazine') return `${p.cover}<div class="ed-magazine-editor">${rule('01 / FROM THE EDITORS', 'A LETTER TO YOU')}<p class="ed-editor-initial" aria-hidden="true">Dear.</p>${p.greeting}<p class="ed-editor-signoff">With love, the two of us.</p></div>${p.story ? magazineStory() : ''}<div class="ed-magazine-date">${rule('THE DATE TO REMEMBER', 'SAVE THIS PAGE')}<p class="ed-date-poster" aria-hidden="true">MAY<br><span>18.</span></p>${p.date}</div>${wrap(p.gallery, 'ed-magazine-gallery', 'THE PHOTO ESSAY / MOMENTS IN BETWEEN')}${wrap(p.directions, 'ed-magazine-insert', 'THE CITY GUIDE')}${wrap(p.accounts, 'ed-magazine-insert ed-magazine-soft', 'A NOTE OF GRATITUDE')}${wrap(p.rsvp, 'ed-magazine-insert', 'READER INVITATION')}${wrap(p.guestbook, 'ed-magazine-insert ed-magazine-soft', 'LETTERS TO THE EDITORS')}<div class="ed-magazine-ending"><p class="ed-end-masthead">US.</p><p class="ed-ending-line">The story goes on.</p>${p.ending}${sample}</div>`;
  if (id === 'film') return `${p.cover}<div class="ed-film-intro">${rule('SCENE 01', 'THE INVITATION')}<span class="ed-film-flare" aria-hidden="true"></span><p class="ed-film-intro-title">Fade in.<br><em>To a life together.</em></p>${p.greeting}</div>${p.story ? filmStory() : ''}<div class="ed-film-screening">${rule('ONE DAY ONLY', 'A LIFETIME TO FOLLOW')}<p class="ed-screening-heading">THE PREMIERE<br><span>2030 — 05 — 18</span></p>${p.date}</div>${p.gallery ? filmDarkroom() + wrap(p.gallery, 'ed-film-archive', 'THE CONTACT PRINTS / YOUR CHOSEN LAYOUT') : ''}${wrap(p.directions, 'ed-film-card', 'LOCATION NOTES')}${wrap(p.accounts, 'ed-film-card ed-film-card-light', 'SPECIAL THANKS')}${wrap(p.rsvp, 'ed-film-card', 'SEAT RESERVATION')}${wrap(p.guestbook, 'ed-film-card ed-film-card-light', 'FROM OUR AUDIENCE')}<div class="ed-film-ending"><p>THIS IS ONLY<br><em>the beginning.</em></p>${p.ending}<div class="ed-film-credits"><span>STARRING</span><strong>SUNGWOO · SOHEE</strong><span>WITH OUR FAVORITE PEOPLE</span><strong>그리고, 소중한 당신</strong></div>${sample}</div>`;
  if (id === 'vinyl') return `${p.cover}<div class="ed-vinyl-invitation">${rule('AN INVITATION TO LISTEN', 'TO OUR LITTLE STORY')}<div class="ed-record-wave" aria-hidden="true">${Array.from({ length: 29 }, (_, index) => `<i style="--bar:${12 + (index * 17 % 43)}px"></i>`).join('')}</div>${p.greeting}</div>${p.story ? vinylPlayer() : ''}<div class="ed-vinyl-release">${rule('RELEASE DAY', 'SATURDAY · 2PM')}<p class="ed-release-stamp">18<br><span>MAY / 2030</span></p>${p.date}<p class="ed-label ed-release-note">성우 & 소희 · 첫 번째 정규앨범 발매일</p></div>${wrap(p.gallery, 'ed-vinyl-booklet', 'ALBUM BOOKLET / PICTURES WE KEEP')}${wrap(p.directions, 'ed-vinyl-info', 'VENUE / LISTENING PARTY')}${wrap(p.accounts, 'ed-vinyl-info ed-vinyl-soft', 'THANK YOU CREDITS')}${wrap(p.rsvp, 'ed-vinyl-info', 'YOU ARE ON THE GUEST LIST')}${wrap(p.guestbook, 'ed-vinyl-info ed-vinyl-soft', 'YOUR LINER NOTES')}<div class="ed-vinyl-ending"><span class="ed-mini-record" aria-hidden="true"></span><p class="ed-ending-line">Forever,<br>on repeat.</p>${p.ending}${rule('S&S RECORDS', 'ALL OUR TOMORROWS')}${sample}</div>`;
  return `${p.cover}<div class="ed-museum-intro">${rule('A NOTE FROM THE CURATORS', 'WELCOME')}<p class="ed-museum-opening">한 사람의 일상에<br>다른 한 사람이 들어와<br><em>새로운 풍경이 됩니다.</em></p>${p.greeting}</div>${p.story ? `<section class="ed-museum-curator" data-section="story">${rule('CURATOR’S NOTES', 'ON LOVE & EVERYDAY LIFE')}<h2>작품이 되기 전의<br>작은 순간들.</h2>${FEATURES.map((item, index) => `<div class="ed-curator-note"><span>0${index + 1}</span><div><h3>${item.label}</h3><p>${item.copy}</p></div></div>`).join('')}<p class="ed-sample">전시 구성을 살펴보기 위한 예시 이야기입니다.</p></section>` : ''}${p.gallery ? museumRooms() + wrap(p.gallery, 'ed-museum-archive', 'THE EXHIBITION CATALOGUE') : ''}<div class="ed-museum-event">${rule('OPENING RECEPTION', 'YOU ARE INVITED')}<div class="ed-museum-ticket"><span>ADMIT</span><strong>YOU<br><i>+ LOVE</i></strong><span>INVITATION No. 0518</span></div>${p.date}</div>${wrap(p.directions, 'ed-museum-visit', 'PLAN YOUR VISIT')}${wrap(p.accounts, 'ed-museum-visit ed-museum-soft', 'WITH OUR GRATITUDE')}${wrap(p.rsvp, 'ed-museum-visit', 'JOIN THE OPENING')}${wrap(p.guestbook, 'ed-museum-visit ed-museum-soft', 'THE VISITOR’S BOOK')}<div class="ed-museum-ending"><p>The collection<br><em>continues.</em></p>${p.ending}${rule('GALLERY S&S', 'THANK YOU FOR BEING HERE')}${sample}</div>`;
}

export function initialEditorialState(id) {
  if (id === 'magazine') return { article: 0 };
  if (id === 'film') return { frame: 0, process: 0 };
  if (id === 'vinyl') return { side: 'A', track: 0, turns: 0 };
  if (id === 'museum') return { room: 0 };
  return null;
}

/** Pure transitions keep transient design experiences out of persisted selections. */
export function transitionEditorialState(id, state, action, value) {
  if (!state || !IDS.includes(id)) return state;
  const index = /^[0-2]$/.test(String(value)) ? Number(value) : null;
  if (id === 'magazine' && action === 'article' && index !== null) return { ...state, article: index };
  if (id === 'film') {
    if (action === 'frame' && index !== null) return { ...state, frame: index };
    if (action === 'develop' && value === 'next') return { ...state, process: Math.min(2, state.process + 1) };
    if (action === 'reset' && value === 'reset') return { ...state, process: 0 };
  }
  if (id === 'vinyl') {
    if (action === 'track' && index !== null) return { ...state, track: index };
    if (action === 'side' && ['A', 'B'].includes(value)) return { ...state, side: value, track: 0 };
    if (action === 'turn' && value === 'turn') return { ...state, turns: Math.min(Number.MAX_SAFE_INTEGER / 360, state.turns + 1) };
  }
  if (id === 'museum' && action === 'room' && index !== null) return { ...state, room: index };
  return state;
}

function setFields(root, values) {
  for (const node of root.querySelectorAll('[data-editorial-field]')) {
    const value = values[node.dataset.editorialField];
    if (value !== undefined && node.textContent !== String(value)) node.textContent = String(value);
  }
}

function renderStage(root, id, state) {
  let index = 0;
  if (id === 'magazine') { const item = FEATURES[state.article]; index = item.photo; setFields(root, item); }
  if (id === 'film') {
    index = state.frame; root.dataset.process = String(state.process);
    setFields(root, { processLabel: ['01 / NEGATIVE', '02 / EXPOSURE', '03 / MEMORY'][state.process], processStatus: ['선택한 필름을 빛에 꺼내볼까요?', '빛이 들어왔어요. 색을 더해 마지막 장면을 만나보세요.', `필름 ${state.frame + 1}의 현상이 끝났어요. 다른 필름도 골라보세요.`][state.process], developButton: ['빛으로 현상하기 ↗', '색으로 기억하기 ↗', '현상 완료 ✓'][state.process] });
    for (const step of root.querySelectorAll('[data-film-step]')) step.dataset.complete = String(Number(step.dataset.filmStep) <= state.process);
  }
  if (id === 'vinyl') {
    const item = TRACKS[state.side][state.track]; index = item.photo;
    root.dataset.side = state.side;
    setFields(root, { ...item, sideLabel: `SIDE ${state.side}` });
    for (const title of root.querySelectorAll('[data-track-title]')) title.textContent = TRACKS[state.side][Number(title.dataset.trackTitle)].title;
    for (const duration of root.querySelectorAll('[data-track-duration]')) duration.textContent = TRACKS[state.side][Number(duration.dataset.trackDuration)].duration;
    root.querySelector('[data-editorial-disc]')?.style.setProperty('--ed-record-angle', `${state.turns * 360}deg`);
  }
  if (id === 'museum') {
    const item = ROOMS[state.room]; index = item.photo; root.dataset.room = String(state.room); setFields(root, item);
    const enlarge = root.querySelector('.ed-exhibit-art');
    if (enlarge) { enlarge.dataset.index = String(index); enlarge.setAttribute('aria-label', `전시 예시 사진 ${index + 1} 크게 보기`); }
  }
  for (const image of root.querySelectorAll('.ed-changing-photo')) {
    image.setAttribute('src', PHOTOS[index].src); image.setAttribute('alt', PHOTOS[index].alt);
    image.setAttribute('width', index === 0 ? '1024' : '1536'); image.setAttribute('height', index === 0 ? '1536' : '1024');
  }
  for (const control of root.querySelectorAll('button[data-editorial-action]')) {
    const action = control.dataset.editorialAction;
    if (Object.hasOwn(state, action) && action !== 'turns') control.setAttribute('aria-pressed', String(String(state[action]) === control.dataset.value));
    if (action === 'develop') control.disabled = state.process === 2;
  }
}

/** One session owns the choices; detaching a view removes every DOM reference/listener. */
export function createEditorialEditions() {
  const states = new Map(IDS.map(id => [id, initialEditorialState(id)]));
  const stages = new Map();
  let container = null;
  function click(event) {
    const control = event.target?.closest?.('button[data-editorial-action]');
    if (!control || control.disabled || !container?.contains(control)) return;
    const stage = control.closest('[data-editorial-stage]'), id = stages.get(stage);
    if (!id) return;
    const next = transitionEditorialState(id, states.get(id), control.dataset.editorialAction, control.dataset.value);
    if (next === states.get(id)) return;
    states.set(id, next);
    for (const [root, currentId] of stages) if (id === currentId) renderStage(root, id, next);
  }
  function dispose() { container?.removeEventListener('click', click); stages.clear(); container = null; }
  function mount(root) {
    dispose();
    if (!root) return;
    container = root;
    const candidates = [...root.querySelectorAll('[data-editorial-stage]')];
    if (root.matches?.('[data-editorial-stage]')) candidates.unshift(root);
    for (const stage of candidates) { const id = stage.dataset.editorialStage; if (IDS.includes(id)) { stages.set(stage, id); renderStage(stage, id, states.get(id)); } }
    if (stages.size) container.addEventListener('click', click);
  }
  return { mount, dispose };
}
