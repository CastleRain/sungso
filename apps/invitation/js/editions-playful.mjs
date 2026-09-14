import { WEDDING } from './wedding-date.mjs?v=20260915-venue-map';
import { getPhoto, hasVenue, venueName, venueLabel, venueCaption, venueDirections, contentDescription } from './personal-content.mjs?v=20260915-venue-map';
import { countdownMarkup } from './countdown.mjs?v=20260915-venue-map';
import { escapeHtml as e } from './core.mjs?v=20260915-venue-map';

const IDS = ['greenhouse', 'scrapbook', 'festival', 'promenade'];
const photograph = (index, className = '', eager = false) => `<img class="${className}" src="${e(getPhoto(index).src)}" alt="${e(getPhoto(index).alt)}" width="${getPhoto(index).width}" height="${getPhoto(index).height}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
const label = text => `<p class="pe-label">${text}</p>`;
const names = '<span>성우</span><i>&</i><span>소희</span>';
const sample = () => `<p class="pe-sample">${e(contentDescription())} · 이야기는 디자인 예시입니다.</p>`;
const section = (key, className, body) => `<section class="pe-section ${className}" data-section="${key}">${key === 'directions' && hasVenue() ? `${label('WEDDING LOCATION')}<h2>오시는 길</h2>${venueDirections()}` : body}${key === 'date' ? countdownMarkup() : ''}</section>`;
const branch = `<svg viewBox="0 0 160 230" fill="none" aria-hidden="true"><path d="M76 221C89 150 61 85 92 7M83 178 29 139M79 119 127 73M78 78 43 39"/><g fill="currentColor" stroke="none"><ellipse cx="42" cy="145" rx="12" ry="30" transform="rotate(-52 42 145)"/><ellipse cx="107" cy="111" rx="12" ry="30" transform="rotate(42 107 111)"/><ellipse cx="57" cy="64" rx="11" ry="28" transform="rotate(-34 57 64)"/><ellipse cx="98" cy="28" rx="10" ry="25" transform="rotate(22 98 28)"/></g></svg>`;
const blossom = `<svg viewBox="0 0 200 200" fill="none" aria-hidden="true"><path class="pe-flower-stem" d="M100 181V96M100 150c-30 0-39-19-39-19 34-5 39 19 39 19m0-29c29-1 38-22 38-22-30-3-38 22-38 22"/><g class="pe-flower-petals">${[0, 60, 120, 180, 240, 300].map(angle => `<ellipse cx="100" cy="62" rx="19" ry="33" transform="rotate(${angle} 100 90)"/>`).join('')}<circle cx="100" cy="90" r="17"/></g></svg>`;
const controls = (action, choices, current, description) => `<div class="pe-controls" role="group" aria-label="${e(description)}">${choices.map(([value, title]) => `<button type="button" data-playful-action="${action}" data-playful-value="${value}" aria-pressed="${value === current}">${title}</button>`).join('')}</div>`;
const toggle = (action, title, activeTitle) => `<button class="pe-gesture" type="button" data-playful-action="${action}" data-playful-value="toggle" data-playful-idle-label="${e(title)}" data-playful-active-label="${e(activeTitle)}" aria-pressed="false"><span data-playful-button-label>${title}</span><span aria-hidden="true">↗</span></button>`;
const panel = (action, value, current, body, className = '') => `<div class="pe-choice-panel ${className}" data-playful-panel="${action}" data-playful-panel-value="${value}"${value === current ? '' : ' hidden'}>${body}</div>`;
const fixedDate = (title, detail) => `<div class="pe-date-numbers"><span>${WEDDING.yearText}</span><strong>${WEDDING.monthPadded}<span> / </span>${WEDDING.dayPadded}</strong><span>${WEDDING.weekdayEn} · ${WEDDING.time12}</span></div><h2>${title}</h2><p>${WEDDING.koFull}<br>${e(venueLabel())}</p><p class="pe-date-detail">${detail}</p><small class="pe-sample">${e(venueCaption())}</small>`;
const gallery = (parts, className, caption) => `<div class="pe-gallery ${className}">${label(caption)}${parts.gallery}</div>`;
const keepsakeEnd = (className, english, text) => `<footer class="invitation-ending pe-ending ${className}">${label('SUN​GWOO & SOHEE')}<p class="pe-ending-title">${english}</p><p>${text}</p><p class="pe-names">${names}</p><span class="pe-label">${WEDDING.enDate} · WITH YOU</span>${sample()}</footer>`;

/** Covers contain no active controls in catalog thumbnails. */
export function playfulCover(id, thumbnail = false) {
  const classes = `cover pe-cover pe-cover-${id}${thumbnail ? ' pe-thumbnail' : ''}`;
  switch (id) {
    case 'greenhouse': return `<div class="${classes}">${label('THE LITTLE GREENHOUSE')}<h2>Love<br>in <em>bloom.</em></h2><p class="pe-cover-korean">우리의 계절이 피어나는 곳</p><div class="pe-glasshouse"><div class="pe-glasshouse-photo">${photograph(0, '', !thumbnail)}</div><div class="pe-house-lines" aria-hidden="true"></div><span class="pe-leaf pe-leaf-left">${branch}</span><span class="pe-leaf pe-leaf-right">${branch}</span><span class="pe-greenhouse-tag">S & S<br><small>EST. ${WEDDING.yearText}</small></span></div><p class="pe-names">${names}</p><p class="pe-cover-date">${WEDDING.enDate} · ${WEDDING.weekdayEn}</p></div>`;
    case 'scrapbook': return `<div class="${classes}"><div class="pe-scrap-binding" aria-hidden="true"></div>${label('OUR LITTLE COLLECTION · VOL. 01')}<h2>Little things,<br><em>big love.</em></h2><div class="pe-scrap-photo"><span class="pe-tape" aria-hidden="true"></span>${photograph(1, '', !thumbnail)}<p>너와 나, 그리고 수많은 보통날.</p></div><span class="pe-heart-sticker" aria-hidden="true">LOVE<br>YOU!</span><div class="pe-cover-note"><span>TO. 소중한 당신</span><p>우리, 결혼해요.</p><span>성우 & 소희 · ${WEDDING.dotted}</span></div>${thumbnail ? '' : toggle('sticker', '초대장에 하트 붙이기', '하트 떼고 다시 붙이기')}<span class="pe-added-sticker" aria-hidden="true">WITH<br>LOVE ♡</span></div>`;
    case 'festival': return `<div class="${classes}"><div class="pe-fest-masthead"><span>ONE DAY ONLY</span><span>${WEDDING.enDate}</span></div><h2>LOVE<br><em>FEST.</em></h2><p class="pe-fest-lineup">SUN​GWOO × SOHEE</p><div class="pe-fest-stage">${photograph(0, '', !thumbnail)}<span class="pe-fest-rosette" aria-hidden="true">YOU'RE<br>INVITED</span><span class="pe-fest-banner">우리의 가장 다정한 축제</span></div><div class="pe-fest-bottom"><span>WEDDING STAGE<br>${WEDDING.koTime} · ${e(venueName())}</span><strong>${WEDDING.monthDay}</strong></div></div>`;
    case 'promenade': return `<div class="${classes}">${label('A WALK TO REMEMBER')}<h2>너와 나,<br><em>같은 걸음.</em></h2><p class="pe-cover-korean">오래도록 함께 걷고 싶은 길</p><div class="pe-walk-photo">${photograph(1, '', !thumbnail)}<svg viewBox="0 0 320 330" fill="none" aria-hidden="true"><path d="M17 293C119 345 308 289 253 213S66 210 114 120 266 99 298 21"/><circle cx="17" cy="293" r="7"/><circle cx="298" cy="21" r="7"/></svg><span class="pe-walk-note">START HERE<br>YOU + ME</span></div><div class="pe-walk-cover-end"><span class="pe-compass" aria-hidden="true">N<br>↟</span><p>성우 & 소희<br><span>${WEDDING.dotted} · ${WEDDING.time24}</span></p><span aria-hidden="true">01 → ∞</span></div></div>`;
    default: return '';
  }
}

function greenhouse(selection, parts, enabled) {
  const seasons = [['spring', '봄', '처음 돋아난 마음', '햇살을 나누고, 작은 안부에 귀 기울이며. 천천히 자라난 마음이 오늘의 우리를 만들었어요.', 0], ['summer', '여름', '푸르게 자라는 나날', '함께 웃는 시간이 길어지고, 무성한 그늘처럼 서로의 쉼이 되어주던 날들.', 1], ['autumn', '가을', '고마움을 거두는 계절', '차곡차곡 쌓인 다정함을 모아 이제 새로운 계절을 시작하려 해요.', 2]];
  return `${parts.cover || playfulCover('greenhouse')}
    ${section('greeting', 'pe-garden-letter', `${label('A PLACE TO GROW')}<span class="pe-letter-leaf" aria-hidden="true">${branch}</span><h2>둘이 가꾸는<br>작은 정원에 초대합니다.</h2><p>물 한 모금, 햇살 한 줌.<br>작고 다정한 마음이 모이면<br>우리의 하루도 푸르게 자라겠지요.</p><p>서로의 가장 편안한 그늘이 되어<br>오래도록 같은 계절을 살아가겠습니다.</p><p class="pe-names">${names}</p>`)}
    ${enabled('story') ? section('story', 'pe-season-room', `${label('THE SEASONS OF US')}<h2>마음이 자라는 속도</h2>${controls('season', seasons.map(([id, title]) => [id, title]), 'spring', '우리 이야기의 계절 선택')}<div class="pe-season-window" aria-live="polite">${seasons.map(([id, title, heading, text, photo]) => panel('season', id, 'spring', `<figure>${photograph(photo)}<figcaption>OUR ${id.toUpperCase()} · ${title}</figcaption></figure><h3>${heading}</h3><p>${text}</p>`)).join('')}</div><p class="pe-sample">계절을 눌러 사진과 예시 이야기를 살펴보세요.</p>`) : ''}
    ${section('date', 'pe-bloom-date', `${label('THE DAY WE BLOOM')}<div class="pe-flower">${blossom}</div>${toggle('bloom', '작은 꽃 피워보기', '꽃봉오리로 돌아가기')}${fixedDate('우리의 꽃 피는 날', `${WEDDING.monthKo}의 정원에서 기다릴게요.`)}`)}
    ${enabled('gallery') ? gallery(parts, 'pe-herbarium', 'THE HERBARIUM · 우리의 빛을 모아서') : ''}
    ${enabled('directions') ? section('directions', 'pe-garden-arrival', `${label('FIND OUR GREENHOUSE')}<h2>정원으로 오는 길</h2><div class="pe-garden-sign"><span aria-hidden="true">↗</span><div><strong>우리의 웨딩홀</strong><p>가든홀 · ${WEDDING.koTime}</p></div></div><ol class="pe-garden-way"><li><span>01</span><div><h3>예시역 2번 출구</h3><p>출구 앞 작은 광장에서 출발해요.</p></div></li><li><span>02</span><div><h3>나무가 이어지는 길</h3><p>정원길을 따라 도보 약 5분 걸어요.</p></div></li><li><span>03</span><div><h3>유리문 너머, 우리</h3><p>가든홀 입구에서 반갑게 맞이할게요.</p></div></li></ol><div class="pe-practical"><b>자동차로 오시나요?</b><p>예시 주차장 · 하객 2시간 무료 주차</p></div><small class="pe-sample">실제 장소·교통 정보가 아닌 예시 안내입니다.</small>`) : ''}
    ${enabled('accounts') ? `<div class="pe-garden-gratitude">${label('A SEED OF KINDNESS')}${parts.accounts}</div>` : ''}
    ${enabled('rsvp') ? section('rsvp', 'pe-garden-reply', `${label('YOUR PLACE IN OUR GARDEN')}<h2>당신의 자리도<br>따뜻하게 준비할게요.</h2><div class="pe-seed-packet"><span>FOR OUR DEAR GUEST</span><strong>한 자리에 담은<br>고마운 마음</strong><span>가상 게스트 · 하루</span></div>${toggle('reply', '예시 초대 답장 펼치기', '예시 답장 다시 접기')}${panel('reply', 'on', 'off', '<p>그날의 정원에서 만나요.<br>귀한 걸음으로 함께해 주셔서 감사합니다.</p>')}<small class="pe-sample">입력·전송 없이 살펴보는 참석 안내 예시입니다.</small>`) : ''}
    ${enabled('guestbook') ? section('guestbook', 'pe-garden-wishes', `${label('WORDS THAT GROW')}<h2>마음에 심어두고 싶은 말</h2><blockquote>두 사람의 매일이<br>포근한 햇살로 가득하기를.<cite>오래된 친구 · 예시</cite></blockquote><p>한마디 한마디, 소중히 가꾸겠습니다.</p><small class="pe-sample">축하 글을 받거나 저장하지 않는 예시입니다.</small>`) : ''}
    ${keepsakeEnd('pe-garden-ending', 'Let love grow.', '당신과 함께 피어날 그날을 기다립니다.')}`;
}

function scrapbook(selection, parts, enabled) {
  const memories = [['first', '첫 장', '함께 걷던 날', '조금 돌아가는 길도 좋았던 건, 네 이야기를 조금 더 들을 수 있어서였어.', 1], ['ordinary', '보통날', '아무 일도 없던 좋은 날', '대단한 계획 없이 만난 주말. 같은 것을 보고 웃던 그 오후를 오래 기억하고 싶어.', 2], ['next', '다음 장', '우리라는 제목', '다음 장은 비워두었어. 어떤 이야기가 되든, 너와 함께라면 좋겠어.', 0]];
  return `${parts.cover || playfulCover('scrapbook')}
    ${section('greeting', 'pe-scrap-letter', `<span class="pe-scrap-page-number">PAGE 01</span>${label('A NOTE FOR YOU')}<h2>꼭 붙여두고 싶은<br>오늘의 마음.</h2><p>영화표 한 장, 짧은 쪽지,<br>우연히 찍힌 사진 하나.</p><p>작은 순간을 모으다 보니<br>어느새 우리만의 책이 되었습니다.</p><p>가장 소중한 다음 장에<br>당신의 웃음도 담고 싶어요.</p><p class="pe-scrap-sign">성우 그리고 소희 드림 ♡</p>`)}
    ${enabled('story') ? section('story', 'pe-memory-book', `${label('THREE PAGES OF US')}<h2>우리의 기억 수집함</h2>${controls('memory', memories.map(([id, title]) => [id, title]), 'first', '추억장 페이지 선택')}<div class="pe-memory-pages" aria-live="polite">${memories.map(([id, title, heading, text, photo], index) => panel('memory', id, 'first', `<div class="pe-memory-print">${photograph(photo)}<span>MEMORY NO. 0${index + 1}</span></div><div class="pe-memory-caption"><h3>${heading}</h3><p>${text}</p><span aria-hidden="true">${title}에서, 사랑을 담아.</span></div>`)).join('')}</div><p class="pe-sample">우리 이야기를 담는 방식의 예시입니다.</p>`) : ''}
    ${enabled('gallery') ? gallery(parts, 'pe-scrap-album', 'KEEP THESE MOMENTS · 사진을 붙이는 시간') : ''}
    ${section('date', 'pe-scrap-date', `${label('PUT A HEART ON THIS DAY')}<div class="pe-scrap-date-card"><span class="pe-tape" aria-hidden="true"></span>${fixedDate('우리 달력에 그린 하트', '달력 한 칸에, 오래 기억할 약속을 적었어요.')}<span class="pe-date-doodle" aria-hidden="true">♡</span></div>`)}
    ${enabled('directions') ? section('directions', 'pe-scrap-directions', `${label('A LITTLE NOTE: HOW TO GET HERE')}<h2>잊지 않게 적어둘게요.</h2><div class="pe-address-note"><span>약속 장소</span><strong>우리의 웨딩홀 · 가든홀</strong><p>${WEDDING.dotted} ${WEDDING.weekday} · ${WEDDING.koTime}</p></div><div class="pe-scrap-transport"><article><span aria-hidden="true">↗</span><h3>지하철 메모</h3><p>예시역 2번 출구<br>정원길로 도보 약 5분</p></article><article><span aria-hidden="true">P</span><h3>주차 메모</h3><p>예시 주차장 이용<br>하객 2시간 무료</p></article></div><small class="pe-sample">장소와 교통 정보는 실제 안내가 아닌 예시입니다.</small>`) : ''}
    ${enabled('accounts') ? `<div class="pe-scrap-envelope">${label('THANK YOU, ALWAYS')}${parts.accounts}</div>` : ''}
    ${enabled('guestbook') ? section('guestbook', 'pe-scrap-guestbook', `${label('A PAGE FROM OUR FRIENDS')}<h2>책갈피처럼 남은 말</h2><div class="pe-friend-note"><span class="pe-tape" aria-hidden="true"></span><blockquote>너희답게, 즐겁게!<br>매일의 작은 순간도<br>함께 웃으며 모아가길.<cite>소중한 친구 · 예시</cite></blockquote><span aria-hidden="true">HAPPILY EVER AFTER ♡</span></div><small class="pe-sample">방명록의 모습만 보여주며 글을 받지 않아요.</small>`) : ''}
    ${enabled('rsvp') ? section('rsvp', 'pe-scrap-reply', `${label('YOUR LITTLE REPLY')}<h2>답장 한 장의 설렘</h2><p>소중한 당신의 자리를<br>미리 준비하고 싶은 마음이에요.</p>${toggle('reply', '가상 게스트 답장 펼치기', '답장 다시 접기')}${panel('reply', 'on', 'off', '<div class="pe-reply-postcard"><span>FROM. 게스트 하루</span><p>좋은 날 함께할게요.<br>우리, 그날 만나요!</p><strong>WITH LOVE ♡</strong></div>')}<small class="pe-sample">예시 답장만 펼쳐보며 실제 응답은 전송되지 않아요.</small>`) : ''}
    ${keepsakeEnd('pe-scrap-ending', 'To be collected.', '다음 장에서도, 우리 함께 있어요.')}`;
}

function festival(selection, parts, enabled) {
  const stages = [['welcome', '13:30', 'WELCOME', '반가운 인사', '조금 먼저 도착해 서로의 안부를 나누어요. 예식장 입구에서 환영 인사를 준비할게요.'], ['vows', WEDDING.time24, 'MAIN STAGE', '우리의 약속', '성우와 소희, 두 사람이 함께 만드는 첫 무대. 오래도록 서로의 가장 가까운 편이 되겠습니다.'], ['celebrate', '14:30', 'CELEBRATION', '함께 만드는 마지막 장면', '따뜻한 축하와 사진 한 장으로 그날의 기쁨을 나누어요. 소중한 얼굴들을 오래 기억하겠습니다.']];
  return `${parts.cover || playfulCover('festival')}
    ${section('greeting', 'pe-fest-invitation', `${label('THE BEST LINEUP IS ALL OF YOU')}<h2>오늘의 주인공은 우리,<br>가장 멋진 관객은 당신.</h2><p>우리의 웃음과 다정함을 모아<br>딱 하루의 작은 축제를 엽니다.</p><p>잘 아는 얼굴들, 좋아하는 이야기,<br>그리고 함께할 새로운 시작.</p><p>가장 소중한 당신을 초대합니다.</p><div class="pe-fest-artists"><span>SUN​GWOO</span><b>×</b><span>SOHEE</span></div>`)}
    ${section('date', 'pe-fest-program', `${label('THE WEDDING SETLIST')}<h2>ONE DAY.<br><em>ALL OUR LOVE.</em></h2><p class="pe-fest-date">${WEDDING.koLong}<br><strong>${WEDDING.koTime} · ${e(venueLabel())}</strong></p><div class="pe-stage-selector" role="group" aria-label="예시 식순 상세 선택">${stages.map(([id, time, english, title]) => `<button type="button" data-playful-action="stage" data-playful-value="${id}" aria-pressed="${id === 'welcome'}"><time>${time}</time><span>${english}<strong>${title}</strong></span><span aria-hidden="true">↗</span></button>`).join('')}</div><div class="pe-stage-detail" aria-live="polite">${stages.map(([id, time, english, title, text]) => panel('stage', id, 'welcome', `${label(`${time} · ${english}`)}<h3>${title}</h3><p>${text}</p>`)).join('')}</div><small class="pe-sample">예식 시작 외 식순과 시간은 디자인 확인용 예시입니다. ${e(venueCaption())}</small>`)}
    ${enabled('story') ? section('story', 'pe-fest-interview', `${label('BEHIND THE SCENES')}<h2>무대 뒤의 두 사람</h2><article><span>Q. 함께할 미래가 기대되는 이유?</span><p>아주 사소한 일에도 같이 웃을 수 있다는 것.<br>평범한 날이 너와 함께면 좋아져서.</p><strong>성우</strong></article><article><span>Q. 오래 지키고 싶은 약속은?</span><p>좋은 이야기도 속상한 마음도 미루지 않기.<br>서로의 가장 가까운 편으로 있기.</p><strong>소희</strong></article><small class="pe-sample">두 사람을 소개하는 인터뷰의 예시 문구입니다.</small>`) : ''}
    ${enabled('gallery') ? gallery(parts, 'pe-fest-contact-sheet', 'OFF STAGE · 우리의 비하인드 컷') : ''}
    ${enabled('directions') ? section('directions', 'pe-fest-venue', `${label('MEET AT THE GARDEN STAGE')}<h2>축제가 열리는 곳</h2><div class="pe-venue-poster"><strong>GARDEN<br>STAGE</strong><p>우리의 웨딩홀 · 가든홀</p><span>DOORS 13:30 / CEREMONY ${WEDDING.time24}</span></div><dl class="pe-fest-info"><div><dt>BY TRAIN</dt><dd>예시역 2번 출구 · 도보 약 5분</dd></div><div><dt>BY CAR</dt><dd>예시 주차장 · 하객 2시간 무료</dd></div><div><dt>WELCOME</dt><dd>가든홀 입구에서 반갑게 만나요.</dd></div></dl><small class="pe-sample">입장 시각·위치·시설·혜택은 예시 안내입니다.</small>`) : ''}
    ${enabled('rsvp') ? section('rsvp', 'pe-fest-pass', `${label('YOUR SOUVENIR')}<h2>그날의 기분을<br>손목에 담아요.</h2><div class="pe-wristband"><span>LOVE FEST.</span><strong>GUEST<br>하루</strong><span>${WEDDING.yearText}<br>${WEDDING.monthDay}</span><i aria-hidden="true"></i></div>${toggle('pass', '기념 손목띠 펼쳐보기', '기념 손목띠 다시 접기')}${panel('pass', 'on', 'off', '<p class="pe-pass-message">YOUR PLACE IS HERE.<br>당신이 있어 더 멋진 하루가 될 거예요.</p>')}<small class="pe-sample">가상 게스트의 기념품 체험입니다.<br>예약·발권·실제 참석 응답을 하지 않아요.</small>`) : ''}
    ${enabled('accounts') ? `<div class="pe-fest-thanks">${label('POWERED BY YOUR LOVE')}${parts.accounts}</div>` : ''}
    ${enabled('guestbook') ? section('guestbook', 'pe-fest-encore', `${label('ONE MORE CHEER')}<h2>가장 오래 남을 응원</h2><blockquote>두 사람의 앞으로의 날들에도<br>늘 이렇게 큰 웃음이 함께하길!<cite>객석의 친구 · 예시</cite></blockquote><div class="pe-cheer-rule" aria-hidden="true">LOVE · LAUGH · TOGETHER</div><small class="pe-sample">응원 문구는 예시이며 방명록을 저장하지 않아요.</small>`) : ''}
    ${keepsakeEnd('pe-fest-ending', 'See you<br>at LOVE FEST.', '당신과 함께, 잊지 못할 하루를.')}`;
}

function promenade(selection, parts, enabled) {
  const stops = [['start', '01', '처음의 골목', '서로의 하루가 궁금해지던 길.', '처음엔 조금 어색해서 주변 풍경을 자주 이야기했어요. 함께 걷는 동안 우리는 조금씩 서로에게 가까워졌어요.', 1], ['bench', '02', '잠깐 쉬어가는 벤치', '아무 말 없이도 편안한 사이.', '바쁘게 걸어온 날에는 잠시 앉아 쉬어가요. 다정한 위로 한마디, 혹은 말없이 내민 손이면 충분했어요.', 2], ['tomorrow', '03', '내일로 이어지는 길', '같은 속도로, 같은 방향으로.', '먼 곳보다 함께 가는 사람이 중요하다는 걸 배웠어요. 우리라는 이름으로 오래도록 나란히 걸으려 합니다.', 0]];
  return `${parts.cover || playfulCover('promenade')}
    ${section('greeting', 'pe-walk-letter', `${label('WALK WITH US')}<div class="pe-walk-marker" aria-hidden="true">START<br>↟</div><h2>서두르지 않고,<br>나란히 걸으려 합니다.</h2><p>앞서가기보다 보폭을 맞추고<br>때로는 쉬어갈 자리를 찾으며<br>같은 풍경을 바라보겠습니다.</p><p>우리의 새로운 길이 시작되는 날,<br>소중한 당신도 함께 걸어주세요.</p><p class="pe-names">${names}</p>`)}
    ${enabled('story') ? section('story', 'pe-walk-story', `${label('THREE STOPS, ONE STORY')}<h2>우리라는 산책길</h2><div class="pe-route-stops" role="group" aria-label="우리 이야기 산책 지점 선택">${stops.map(([id, number, title]) => `<button type="button" data-playful-action="stop" data-playful-value="${id}" aria-pressed="${id === 'start'}"><span>${number}</span><strong>${title}</strong></button>`).join('')}</div><div class="pe-walk-stop-panels" aria-live="polite">${stops.map(([id, number, title, subtitle, text, photo]) => panel('stop', id, 'start', `<figure>${photograph(photo)}<figcaption>STOP ${number} · ${title}</figcaption></figure><h3>${subtitle}</h3><p>${text}</p>`)).join('')}</div><p class="pe-sample">지점을 눌러 읽어보는 예시 이야기입니다.</p>`) : ''}
    ${section('date', 'pe-walk-destination', `${label('OUR NEXT DESTINATION')}<div class="pe-destination-sign"><span>다음 정거장</span><strong>우리의 결혼식</strong><span aria-hidden="true">→</span></div>${fixedDate('같은 길의 새로운 시작', `${WEDDING.monthKo}의 좋은 날, 이곳에서 만나요.`)}`)}
    ${enabled('directions') ? section('directions', 'pe-walk-directions', `${label('THE LAST FIVE MINUTES')}<h2>당신의 마지막 다섯 걸음</h2><p>우리의 웨딩홀 · 가든홀</p><div class="pe-walk-map" role="img" aria-label="예시역부터 가든홀까지 도보 약 5분의 예시 경로. 실제 지도가 아닙니다."><svg viewBox="0 0 330 290" fill="none" aria-hidden="true"><path class="pe-map-street" d="M0 83H330M0 206H330M65 0V290M246 0V290"/><path class="pe-map-park" d="M111 112h80v66h-80z"/><path class="pe-map-route" d="M65 244V115Q65 83 99 83H246V44"/><circle cx="65" cy="244" r="8"/><circle cx="246" cy="44" r="8"/><text x="83" y="253">예시역 2번 출구</text><text x="178" y="27">우리의 웨딩홀</text><text x="122" y="151">작은 정원</text><text x="13" y="30">N ↑</text></svg><span>ILLUSTRATED SAMPLE ROUTE</span></div><div class="pe-walk-route-notes"><p><strong>01</strong> 예시역 2번 출구에서 출발해요.</p><p><strong>02</strong> 정원길을 따라 도보 약 5분 걸어요.</p><p><strong>03</strong> 가든홀 입구에서 만나요.</p></div><div class="pe-practical"><b>차를 가져오시는 분께</b><p>예시 주차장 · 하객 2시간 무료 주차</p></div><small class="pe-sample">실제 지도·교통 정보가 아닌 디자인 예시입니다.</small>`) : ''}
    ${enabled('gallery') ? gallery(parts, 'pe-walk-views', 'VIEWS ALONG THE WAY · 걸으며 모은 풍경') : ''}
    ${enabled('accounts') ? `<div class="pe-walk-kindness">${label('EVERY KIND STEP COUNTS')}${parts.accounts}</div>` : ''}
    ${enabled('rsvp') ? section('rsvp', 'pe-walk-reply', `${label('A PLACE BESIDE US')}<h2>함께 걷는 사람</h2><p>우리의 시작에 귀한 걸음을 더해주세요.<br>당신의 자리를 기쁘게 준비할게요.</p>${toggle('reply', '가상 동행 카드 펼치기', '동행 카드 다시 접기')}${panel('reply', 'on', 'off', '<div class="pe-walk-companion"><span>WALKING TOGETHER</span><strong>하루 → 우리의 결혼식</strong><p>같이 걷는 길이 더 따뜻해졌어요.</p></div>')}<small class="pe-sample">가상 이름을 사용하며 실제 참석 답변을 받지 않아요.</small>`) : ''}
    ${enabled('guestbook') ? section('guestbook', 'pe-walk-wishes', `${label('GOOD WORDS FOR THE ROAD')}<h2>길 위에서 건네는 말</h2><blockquote>빠른 길보다 즐거운 길로.<br>서로의 손을 놓지 않고<br>오래오래 함께 걸어가길.<cite>소중한 친구 · 예시</cite></blockquote><small class="pe-sample">축하 문구 예시이며 글을 수집·저장하지 않습니다.</small>`) : ''}
    ${keepsakeEnd('pe-walk-ending', 'Side by side,<br>always.', '어느 길에서든, 언제나 함께.')}`;
}

/** The parent owns normalized choices, theme variables, photo modal and data. */
export function playfulBody(selection, parts) {
  const id = selection?.templateId;
  if (!IDS.includes(id)) return '';
  const enabled = key => Boolean(parts[key]) && selection.sections?.[key] !== false;
  const body = { greenhouse, scrapbook, festival, promenade }[id](selection, parts, enabled);
  return `<div class="pe-edition pe-${id}" data-playful-edition="${id}">${body}</div>`;
}

const ACTIONS = Object.freeze({
  greenhouse: { season: ['spring', 'summer', 'autumn'], bloom: ['off', 'on'], reply: ['off', 'on'] },
  scrapbook: { memory: ['first', 'ordinary', 'next'], sticker: ['off', 'on'], reply: ['off', 'on'] },
  festival: { stage: ['welcome', 'vows', 'celebrate'], pass: ['off', 'on'] },
  promenade: { stop: ['start', 'bench', 'tomorrow'], reply: ['off', 'on'] },
});
const TOGGLES = new Set(['bloom', 'reply', 'sticker', 'pass']);

/** Cosmetic state survives option rerenders. No timers, persistence or requests. */
export function createPlayfulEditions() {
  const states = new Map(), mounted = new Map();
  let container = null, listener = null;
  function render(root, id) {
    const state = states.get(id);
    for (const [key, value] of Object.entries(state)) root.dataset[key] = value;
    root.querySelectorAll('[data-playful-panel]').forEach(node => {
      node.hidden = state[node.dataset.playfulPanel] !== node.dataset.playfulPanelValue;
    });
    root.querySelectorAll('button[data-playful-action]').forEach(button => {
      const action = button.dataset.playfulAction, value = button.dataset.playfulValue;
      if (!Object.hasOwn(ACTIONS[id], action)) return;
      const active = state[action] === (TOGGLES.has(action) ? 'on' : value);
      button.setAttribute('aria-pressed', String(active));
      if (TOGGLES.has(action)) {
        const text = active ? button.dataset.playfulActiveLabel : button.dataset.playfulIdleLabel;
        const node = button.querySelector('[data-playful-button-label]');
        if (node && text) node.textContent = text;
      }
    });
  }
  function dispose() {
    if (container && listener) container.removeEventListener('click', listener);
    listener = null; container = null; mounted.clear();
  }
  function mount(nextRoot) {
    dispose();
    if (!nextRoot) return;
    container = nextRoot;
    const roots = [...container.querySelectorAll('[data-playful-edition]')];
    if (container.matches?.('[data-playful-edition]')) roots.unshift(container);
    for (const root of roots) {
      const id = root.dataset.playfulEdition;
      if (!IDS.includes(id)) continue;
      if (!states.has(id)) states.set(id, Object.fromEntries(Object.entries(ACTIONS[id]).map(([action, values]) => [action, values[0]])));
      mounted.set(root, id); render(root, id);
    }
    const onClick = event => {
      if (listener !== onClick || container !== nextRoot) return;
      const button = event.target?.closest?.('button[data-playful-action]') || event.target?.parentElement?.closest?.('button[data-playful-action]');
      if (!button || button.disabled || !container.contains(button)) return;
      const root = button.closest('[data-playful-edition]'), id = mounted.get(root);
      if (!id) return;
      const { playfulAction: action, playfulValue: value } = button.dataset;
      if (!Object.hasOwn(ACTIONS[id], action)) return;
      const state = states.get(id), choices = ACTIONS[id][action];
      if (TOGGLES.has(action) ? value !== 'toggle' : !choices.includes(value)) return;
      state[action] = TOGGLES.has(action) ? (state[action] === 'on' ? 'off' : 'on') : value;
      for (const [target, targetId] of mounted) if (id === targetId) render(target, id);
    };
    listener = onClick;
    container.addEventListener('click', listener);
  }
  return { mount, dispose };
}
