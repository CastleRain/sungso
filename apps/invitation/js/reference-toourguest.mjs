import { weddingLettering } from './wedding-lettering.mjs?v=20260915-venue-map';
import { WEDDING, weddingCalendarCells } from './wedding-date.mjs?v=20260915-venue-map';
import { PHOTOS, getPhoto, hasPersonalPhotos, hasVenue, venueLabel, venueCaption, venueDirections, personalizeCover } from './personal-content.mjs?v=20260915-venue-map';
import { countdownMarkup } from './countdown.mjs?v=20260915-venue-map';
import { escapeHtml as e } from './core.mjs?v=20260915-venue-map';

const designs = new Set(['guest-seoul', 'guest-porto', 'guest-jeju']);
const photo = (index, className = '', eager = false) => `<img class="${className}" src="${e(getPhoto(index).src)}" alt="${e(getPhoto(index).alt)}" width="${getPhoto(index).width}" height="${getPhoto(index).height}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
const reveal = (id, key, className, content, tag = 'div', section = '') => `<${tag} class="${className} ref-reveal" data-reference-reveal data-reference-key="${id}-${key}"${section ? ` data-section="${section}"` : ''}>${content}</${tag}>`;
const heading = (english, title = '', description = '') => `<header class="rg-heading"><h2>${english}</h2>${title ? `<p>${title}</p>` : ''}${description ? `<p class="rg-heading-note">${description}</p>` : ''}</header>`;
const dateLine = () => `<p class="rg-date-line">${WEDDING.koLong} | ${WEDDING.koTime}</p>`;
const venueLine = () => `<p class="rg-venue-line">${e(venueLabel())}</p>`;
const cross = '<span class="rg-cross" aria-hidden="true"></span>';

export function guestCover(id, thumbnail = false) {
  const markup = renderGuestCover(id, thumbnail);
  return markup ? personalizeCover(markup) : markup;
}
function renderGuestCover(id, thumbnail = false) {
  if (!designs.has(id)) return null;
  const type = id.slice(6);
  const lettering = thumbnail ? '' : weddingLettering({ variant: type === 'jeju' ? 'rose' : type === 'porto' ? 'photo' : 'paper' });
  const attributes = `class="cover ref-cover rg-cover rg-cover-${type}${thumbnail ? ' rg-thumbnail' : ''}" data-reference-intro data-reference-key="${id}-cover"`;
  if (type === 'seoul') return `<div ${attributes}>${lettering}
    <div class="rg-film-frame rg-film-first">${photo(2, '', !thumbnail)}<span class="rg-film-side rg-film-time">${WEDDING.weekdayShort} · ${WEDDING.time12}</span><span class="rg-film-side rg-film-number">▲ 13A</span></div>
    <div class="rg-film-frame rg-film-second">${photo(1, '', !thumbnail)}<span class="rg-film-side rg-film-date">${WEDDING.enMonthFirst}</span><span class="rg-film-side rg-film-names">SUNGWOO & SOHEE</span><span class="rg-film-side rg-film-number">▲ 12A</span></div>
    <span class="rg-film-caption">OUR WEDDING DAY</span>
  </div>`;
  if (type === 'porto') return `<div ${attributes}>${lettering}
    ${photo(0, 'rg-porto-photo', !thumbnail)}
    <svg class="rg-porto-heart" viewBox="0 0 400 700" fill="none" aria-hidden="true"><path d="M202 679C169 583-93 326-54 167C-26 52 143 33 201 194C245 33 423 48 455 157C504 325 259 579 202 679Z"/><path d="M195 691C148 576-85 325-45 175C-13 52 154 46 207 190C254 51 421 60 446 165C484 320 251 588 195 691Z"/></svg>
    <div class="rg-porto-title"><h2>We are getting married</h2><p>SUNGWOO <span>|</span> ${WEDDING.dotted} ${WEDDING.weekdayShort} <span>|</span> SOHEE</p></div>
  </div>`;
  return `<div ${attributes}>${lettering}<h2 class="rg-jeju-names"><span>성우</span><i>&</i><span>소희</span></h2><div class="rg-jeju-details">${dateLine()}${venueLine()}</div></div>`;
}

function greeting(id) {
  return reveal(id, 'greeting', 'rg-greeting rg-block', `${cross}<div class="rg-prose"><p>서로의 평범한 하루가<br>가장 소중한 순간이 되었습니다.</p><p>함께 웃고, 서로에게 기대며<br>우리만의 계절을 만들어가려 합니다.</p><p>그 시작에 소중한 당신을 초대합니다.<br>따뜻한 마음으로 함께해 주세요.</p></div><p class="rg-signature">신랑 <b>성우</b> <span>·</span> 신부 <b>소희</b></p>`, 'section', 'greeting');
}

function dateSection(id) {
  const week = ['일', '월', '화', '수', '목', '금', '토'];
  const calendar = `<div class="rg-calendar" aria-label="${WEDDING.year}년 ${WEDDING.month}월 달력, 결혼식은 ${WEDDING.day}일 ${WEDDING.weekday}"><div class="rg-calendar-week">${week.map(day => `<span>${day}</span>`).join('')}</div><div class="rg-calendar-days">${weddingCalendarCells().map(day => day === null ? '<span aria-hidden="true"></span>' : `<span${day === WEDDING.day ? ` class="rg-wedding-day" aria-label="${day}일 결혼식"` : ''}>${day}</span>`).join('')}</div></div>`;
  return `<section class="rg-date" data-section="date">${reveal(id, 'date-poster', 'rg-date-poster', `<p>${WEDDING.monthEn} ${WEDDING.day}</p><p>${WEDDING.yearText}</p>`)}${reveal(id, 'date-calendar', 'rg-block rg-calendar-block', `${heading('WEDDING DAY')}${dateLine()}<p class="rg-english-date">${WEDDING.enLong} | ${WEDDING.time12}</p>${calendar}${countdownMarkup()}<p class="rg-date-notice">성우 <span>♥</span> 소희의 새로운 시작</p><small class="rg-sample">${e(venueCaption())}</small>`)}</section>`;
}

function family(id) {
  return reveal(id, 'family', 'rg-block rg-family', `<div class="rg-family-couple"><p><small>신랑</small><b>성우</b><em>SUNGWOO</em><span>아버지 · 어머니의 아들</span></p><span class="rg-family-divider" aria-hidden="true"></span><p><small>신부</small><b>소희</b><em>SOHEE</em><span>아버지 · 어머니의 딸</span></p></div><details class="rg-contact"><summary>축하 연락처 보기 <span aria-hidden="true">＋</span></summary><p>실제 연락처는 제작할 때 입력해요.<br>이 화면에서는 전화나 문자가 연결되지 않아요.</p></details>`, 'section');
}

function story(id) {
  const about = `${heading('ABOUT US', '저희 커플을 소개합니다', '서로 다른 두 사람이 만나, 하나의 우리로')}<div class="rg-about-cards">${[
    ['성우', 'SUNGWOO', 2, '작은 순간을 오래 기억하는 사람', '함께 걷고, 함께 웃는 하루를 좋아해요.'],
    ['소희', 'SOHEE', 1, '평범한 하루를 특별하게 만드는 사람', '좋아하는 풍경과 마음을 나누고 싶어요.'],
  ].map(([name, english, index, title, text]) => `<article class="rg-about-card"><div class="rg-about-photo">${photo(index)}</div><p>${name} <span>${english}</span></p><b>${title}</b><small>${text}</small></article>`).join('')}</div>`;
  const moments = [
    [2, '처음 마주한 날', '첫 인연', '낯선 두 사람이 서로의 하루를<br>궁금해하기 시작했어요.'],
    [1, '함께 걸어온 계절', '평범하고 특별한 날들', '작은 여행과 평범한 주말이<br>소중한 기억이 되었어요.'],
    [0, '서로에게 건넨 약속', '같은 방향을 바라보며', '어떤 날에도 서로의 곁에<br>머무르기로 했어요.'],
    [2, WEDDING.koDate, '우리의 웨딩데이', '이제 더 많은 날을<br>우리라는 이름으로 함께해요.'],
  ];
  const timeline = `${heading('OUR TIMELINE', '저희 연애의 타임라인입니다', '서로에게 참 소중하고 감사한 존재')}<div class="rg-timeline">${moments.map(([index, when, title, description], i) => reveal(id, `timeline-${i}`, `rg-timeline-row rg-timeline-row-${i}`, `<div class="rg-timeline-photo">${photo(index)}</div><div class="rg-timeline-copy"><span>${when}</span><h3>${title}</h3><p>${description}</p></div>`)).join('')}</div><small class="rg-sample">구성을 살펴보기 위한 예시 이야기입니다.</small>`;
  return `<section class="rg-story" data-section="story">${reveal(id, 'about', 'rg-block rg-about', about)}<div class="rg-block rg-timeline-block">${timeline}</div></section>`;
}

function gallery(id, layout) {
  const galleryLayout = ['grid', 'slide', 'filmstrip'].includes(layout) ? layout : 'grid';
  const paged = galleryLayout !== 'grid';
  const photos = `<div class="rg-gallery rg-gallery-${galleryLayout}"${paged ? ' data-reference-gallery' : ''}>${PHOTOS.map((_, index) => `<button type="button" class="rg-gallery-photo" data-action="photo" data-index="${index}" aria-label="${hasPersonalPhotos() ? '우리' : '예시'} 사진 ${index + 1} 크게 보기">${photo(index)}${galleryLayout === 'filmstrip' ? `<span>0${index + 1} / OUR MEMORIES</span>` : ''}</button>`).join('')}</div>`;
  const controls = `<div class="rg-gallery-controls"><button type="button" data-reference-gallery-step="-1" aria-label="갤러리 이전 사진">←</button><output data-reference-gallery-count aria-live="polite" aria-label="현재 갤러리 사진">1 / ${PHOTOS.length}</output><button type="button" data-reference-gallery-step="1" aria-label="갤러리 다음 사진">→</button></div>`;
  return reveal(id, 'gallery', 'rg-block rg-gallery-block', `${heading('GALLERY', '사진을 누르면 크게 볼 수 있어요')}${paged ? `<div class="rg-gallery-view" data-reference-gallery-root="${id}-gallery">${photos}${controls}</div><p class="rg-gallery-help">사진을 옆으로 넘겨보세요</p>` : photos}`, 'section', 'gallery');
}

function directions(id) {
  if (hasVenue()) return reveal(id, 'directions', 'rg-block rg-directions', `${heading('LOCATION')}${venueDirections()}`, 'section', 'directions');
  const map = `<div class="rg-map" role="img" aria-label="실제 장소가 아닌 예시 약도"><svg viewBox="0 0 340 215" aria-hidden="true"><rect width="340" height="215" fill="var(--soft)"/><path d="M-10 52H350M-10 169H350M67-10V225M249-10V225" stroke="white" stroke-width="22"/><path d="M126-10V225" stroke="white" stroke-width="6"/><rect x="154" y="82" width="67" height="53" rx="3" fill="var(--accent)" opacity=".15"/><circle cx="187" cy="96" r="14" fill="var(--accent)"/><path d="M180 93q7-9 14 0q0 6-7 10q-7-4-7-10" fill="white"/><text x="187" y="145" text-anchor="middle" fill="var(--ink)" font-size="12">우리의 웨딩홀</text><text x="17" y="35" fill="var(--ink)" font-size="11">예시역</text></svg><span>예시 약도</span></div>`;
  return reveal(id, 'directions', 'rg-block rg-directions', `${heading('LOCATION')}<h3>우리의 웨딩홀 · 가든홀</h3><p>예시 장소 · ${WEDDING.weekday} ${WEDDING.koTime}</p>${map}<div class="rg-map-options" aria-label="지도 연결 예시"><span>네이버 지도</span><span>카카오맵</span><span>티맵</span></div><div class="rg-transport"><article><b>대중교통</b><p>예시역 2번 출구에서 도보 5분</p></article><article><b>주차</b><p>예시 주차장 · 하객 2시간 무료</p></article><article><b>안내</b><p>자세한 교통편은 실제 제작할 때 입력해요.</p></article></div><small class="rg-sample">실제 위치 조회나 지도 연결은 하지 않아요.</small>`, 'section', 'directions');
}

function accounts(id) {
  return reveal(id, 'accounts', 'rg-block rg-accounts', `<span class="rg-tiny-heart" aria-hidden="true">♡</span>${heading('WITH LOVE', '마음 전하실 곳')}<p>함께해 주시는 따뜻한 마음에<br>깊이 감사드립니다.</p><div class="rg-account-list">${[['신랑', '성우'], ['신부', '소희']].map(([side, name]) => `<details><summary>${side} 측에게 <span aria-hidden="true">⌄</span></summary><p>${name} · 은행명<br><small>계좌번호는 실제 제작 시 입력해요.</small></p></details>`).join('')}</div>`, 'section', 'accounts');
}

function guestbook(id) {
  return reveal(id, 'guestbook', 'rg-block rg-guestbook', `${heading('MESSAGE', '저희 둘에게 따뜻한 마음을 전해주세요')}<div class="rg-message-list"><blockquote>두 사람의 모든 계절을 응원해요.<br>오래오래 행복하세요!<cite>From. 소중한 친구 · 예시</cite></blockquote><blockquote>함께할 앞으로의 날들이<br>따뜻한 웃음으로 가득하길 바라요.<cite>From. 고마운 사람 · 예시</cite></blockquote></div><p class="rg-sample-action">축하 글 남기기</p><small class="rg-sample">미리보기에서는 글이 저장되지 않아요.</small>`, 'section', 'guestbook');
}

function information(id) {
  return reveal(id, 'information', 'rg-block rg-information', `${heading('INFORMATION', '안내', '함께하실 분들께 미리 전해드려요')}<div class="rg-information-card"><div class="rg-table-art" aria-hidden="true"><span class="rg-fork">♧</span><span class="rg-plate"></span><span class="rg-spoon"></span></div><h3>식사 안내</h3><p>예식 후 준비된 자리에서<br>따뜻한 식사를 함께 나누려 합니다.</p><small>식사 장소와 시간은 실제 제작할 때 입력해요.</small></div>`, 'section');
}

function rsvp(id) {
  return reveal(id, 'rsvp', 'rg-block rg-rsvp', `<span class="rg-tiny-heart" aria-hidden="true">♡</span>${heading('RSVP', '참석 의사', '모든 분들을 소중히 모실 수 있도록')}<div class="rg-rsvp-invitation"><p>신랑 성우 <span>♥</span> 신부 소희</p>${dateLine()}${venueLine()}</div><p class="rg-sample-action">참석 의사 체크하기</p><small class="rg-sample">미리보기에서는 응답을 받지 않아요.</small>`, 'section', 'rsvp');
}

function ending(id) {
  return `<footer class="invitation-ending rg-ending">${reveal(id, 'ending-photo', 'rg-ending-photo', photo(1))}${reveal(id, 'ending-copy', 'rg-ending-copy', `<p>함께여서 더 아름다울<br>우리의 모든 내일.</p><span class="rg-ending-rule" aria-hidden="true"></span><p>우리의 시작에 함께해 주셔서 감사합니다.</p><p class="rg-ending-names">성우 <span>&</span> 소희</p><small>${WEDDING.dotted}</small>`)}</footer>`;
}

export function guestBody(selection, parts) {
  const id = selection.templateId;
  if (!designs.has(id)) return null;
  const sections = selection.sections || {};
  return `${parts.cover || guestCover(id)}${greeting(id)}${reveal(id, 'invitation-photo', 'rg-wide-photo', photo(0), 'figure')}${dateSection(id)}${family(id)}${sections.story ? story(id) : ''}${sections.gallery ? gallery(id, selection.galleryLayout) : ''}${sections.directions ? directions(id) : ''}${sections.accounts ? accounts(id) : ''}${sections.guestbook ? guestbook(id) : ''}${information(id)}${sections.rsvp ? rsvp(id) : ''}${ending(id)}`;
}
