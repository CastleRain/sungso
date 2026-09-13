import { PHOTOS, getTemplate } from './catalog.mjs';
import { escapeHtml as e } from './core.mjs';
import { paperCover } from './special-paper.mjs';
import { worldsCover } from './special-worlds.mjs';

export const heart = filled => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/></svg>`;
const botanical = `<svg class="botanical" viewBox="0 0 160 180" fill="none" aria-hidden="true"><path d="M12 168C46 134 101 85 132 12M53 123C35 111 26 95 28 75M83 94C109 100 130 91 150 79M112 51C95 40 92 20 99 4" stroke="currentColor" stroke-width="1.2"/><g fill="currentColor" opacity=".5"><ellipse cx="39" cy="109" rx="7" ry="17" transform="rotate(-34 39 109)"/><ellipse cx="61" cy="116" rx="7" ry="18" transform="rotate(47 61 116)"/><ellipse cx="97" cy="75" rx="7" ry="19" transform="rotate(-29 97 75)"/><ellipse cx="116" cy="59" rx="7" ry="17" transform="rotate(45 116 59)"/><ellipse cx="126" cy="32" rx="6" ry="16" transform="rotate(28 126 32)"/><ellipse cx="111" cy="97" rx="5" ry="13" transform="rotate(74 111 97)"/></g></svg>`;
const image = (index, classes = '', eager = false) => `<img class="${classes}" src="${PHOTOS[index].src}" alt="${PHOTOS[index].alt}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="${index === 0 ? 1024 : 1536}" height="${index === 0 ? 1536 : 1024}">`;
const names = '<span>성우</span><i>&</i><span>소희</span>';

export function cover(templateId, thumbnail = false) {
  const special = paperCover(templateId, thumbnail) || worldsCover(templateId, thumbnail);
  if (special) return special;
  const date = '<p class="cover-date">2030. 05. 18 <span>SATURDAY</span></p>';
  const photograph = image(0, 'cover-photo', !thumbnail);
  switch (templateId) {
    case 'photo': return `<div class="cover cover-photo-style">${photograph}<div class="cover-photo-copy"><p class="small-caps">WE ARE GETTING MARRIED</p><h2>All<br>about<br><em>us.</em></h2><p class="couple-names">${names}</p>${date}</div></div>`;
    case 'garden': return `<div class="cover cover-garden">${botanical}<p class="small-caps">A DAY IN BLOOM</p><div class="garden-portrait">${photograph}</div><h2 class="couple-names">${names}</h2><p class="cover-caption">우리의 가장 아름다운 봄날</p>${date}${botanical}</div>`;
    case 'letter': return `<div class="cover cover-letter"><p class="letter-to">Dear, our beloved</p><div class="letter-photo">${photograph}</div><span class="wax-seal" aria-hidden="true">S & S</span><h2 class="couple-names">${names}</h2><p class="cover-caption">소중한 당신에게 보내는 초대</p>${date}</div>`;
    case 'sketch': return `<div class="cover cover-sketch"><h2>WE'RE<br><em>getting</em><br>MARRIED!</h2><img class="sketch-art" src="./assets/couple-illustration.webp" alt="손을 잡고 걸어가는 커플의 손그림" width="1024" height="1024" ${thumbnail ? 'loading="lazy"' : ''}><p class="couple-names">${names}</p>${date}</div>`;
    case 'cinema': return `<div class="cover cover-cinema">${photograph}<div class="cinema-copy"><p class="small-caps">A FILM BY SUNGWOO & SOHEE</p><h2>Our<br><em>forever</em><br>film.</h2><p class="cinema-korean">우리라는 영화</p><p class="couple-names">${names}</p>${date}<p class="cinema-credit">STARRING SUNGWOO · SOHEE<br>DIRECTED BY LOVE</p></div></div>`;
    default: return `<div class="cover cover-minimal"><p class="small-caps">THE WEDDING OF</p><h2 class="couple-names">${names}</h2><div class="minimal-portrait">${photograph}</div><p class="minimal-script">Quiet promise</p>${date}<span class="cover-rule"></span></div>`;
  }
}
export function themeAttributes(selection) {
  const template = getTemplate(selection.templateId), palette = template.palettes.find(item => item.id === selection.paletteId) || template.palettes[0];
  return `class="invitation theme-${template.id} palette-${palette.id}" style="--paper:${palette.paper};--ink:${palette.ink};--accent:${palette.accent};--soft:${palette.soft}"`;
}
const section = (key, english, title, content) => `<section class="invite-section reveal" data-section="${key}"><p class="section-eyebrow">${english}</p><h2>${title}</h2>${content}</section>`;

export function invitation(selection) {
  const { sections, galleryLayout } = selection;
  const calendar = `<div class="wedding-calendar" aria-label="2030년 5월 달력, 18일 토요일 결혼식"><div class="calendar-week">${['일', '월', '화', '수', '목', '금', '토'].map(day => `<span>${day}</span>`).join('')}</div><div class="calendar-days"><span></span><span></span><span></span>${Array.from({ length: 31 }, (_, index) => `<span${index === 17 ? ' class="wedding-day" aria-label="18일 예시 결혼식"' : ''}>${index + 1}</span>`).join('')}</div></div>`;
  let html = cover(selection.templateId);
  html += section('greeting', 'INVITATION', '같은 계절을 걸어갈 우리', `<div class="invitation-prose"><p>서로의 평범한 하루가<br>가장 소중한 순간이 되었습니다.</p><p>함께 웃고, 서로에게 기대며<br>우리만의 계절을 만들어가려 합니다.</p><p>그 시작에 소중한 당신을 초대합니다.<br>따뜻한 마음으로 함께해 주세요.</p></div><p class="signature">성우 <span>그리고</span> 소희</p>`);
  if (sections.story) html += section('story', 'OUR LITTLE STORY', '함께 쌓아온 순간들', `<div class="story-list"><article><span>01</span><div><h3>처음 마주한 날</h3><p>낯선 두 사람이 서로의 하루를 궁금해하기 시작했어요.</p></div></article><article><span>02</span><div><h3>함께라서 좋은 날들</h3><p>작은 여행과 평범한 주말이 특별한 기억이 되었어요.</p></div></article><article><span>03</span><div><h3>앞으로의 모든 날</h3><p>이제 오래도록 같은 방향을 바라보려 해요.</p></div></article></div><small class="sample-caption">구성을 살펴보기 위한 예시 이야기입니다.</small>`);
  html += section('date', 'SAVE OUR DATE', '2030년 5월 18일', `<p class="wedding-time">토요일 오후 2시</p>${calendar}<p class="venue-name">우리의 웨딩홀 · 가든홀</p><small class="sample-caption">날짜·시간·장소는 모두 예시입니다.</small>`);
  if (sections.gallery) html += section('gallery', 'MOMENTS OF US', '우리의 순간들', `<div class="photo-gallery gallery-${galleryLayout}">${PHOTOS.map((photo, index) => `<button class="gallery-photo" type="button" data-action="photo" data-index="${index}" aria-label="예시 사진 ${index + 1} 크게 보기">${image(index)}${galleryLayout === 'filmstrip' ? `<span>0${index + 1} / OUR MEMORIES</span>` : ''}</button>`).join('')}</div><p class="gallery-help">${galleryLayout === 'grid' ? '사진을 누르면 크게 볼 수 있어요.' : '옆으로 넘기거나 사진을 눌러보세요.'}</p>`);
  if (sections.directions) html += section('directions', 'COME CELEBRATE', '오시는 길', `<p class="venue-name">우리의 웨딩홀</p><p>가든홀 · 오후 2시</p><div class="sample-map" role="img" aria-label="실제 장소가 아닌 예시 약도"><svg viewBox="0 0 340 200" aria-hidden="true"><rect width="340" height="200" fill="var(--soft)"/><path d="M-10 70H350M90-10V210M230-10V210M-10 158H350" stroke="var(--paper)" stroke-width="20"/><rect x="113" y="93" width="92" height="40" rx="7" fill="var(--accent)" opacity=".15"/><circle cx="165" cy="106" r="16" fill="var(--accent)"/><path d="M158 103q7-10 14 0q0 6-7 10q-7-4-7-10" fill="var(--paper)"/><text x="165" y="142" text-anchor="middle" fill="var(--ink)" font-size="11">우리의 웨딩홀</text><text x="42" y="58" fill="var(--ink)" font-size="10">예시역</text></svg><span>예시 약도</span></div><div class="sample-buttons"><span>네이버 지도</span><span>카카오맵</span><span>티맵</span></div><div class="transport-notes"><p><b>대중교통</b> 예시역 2번 출구에서 도보 5분</p><p><b>주차 안내</b> 예시 주차장 · 하객 2시간 무료</p></div><small class="sample-caption">실제 예식장 정보는 제작 페이지에서 입력해요.</small>`);
  if (sections.accounts) html += section('accounts', 'WITH LOVE', '마음 전하실 곳', `<p>함께해 주시는 따뜻한 마음에<br>깊이 감사드립니다.</p><div class="sample-accounts"><details><summary>신랑 측 <span>+</span></summary><p>성우 · 은행명<br><span>계좌번호는 제작 시 입력</span></p></details><details><summary>신부 측 <span>+</span></summary><p>소희 · 은행명<br><span>계좌번호는 제작 시 입력</span></p></details></div>`);
  if (sections.rsvp) html += section('rsvp', 'WILL YOU JOIN US?', '참석 의사 전달', `<p>귀한 걸음을 준비할 수 있도록<br>참석 여부를 알려주세요.</p><div class="rsvp-example"><span>성함</span><span>신랑 측 / 신부 측</span><span>참석 여부 · 동반 인원</span></div><p class="sample-callout">참석 의사 전달하기</p><small class="sample-caption">미리보기에서는 응답을 받지 않아요.</small>`);
  if (sections.guestbook) html += section('guestbook', 'WARM WISHES', '축하의 마음', `<blockquote>두 사람의 모든 계절을 응원해요.<br>오래오래 행복하세요!<cite>소중한 친구 · 예시</cite></blockquote><p class="sample-callout">축하 글 남기기</p><small class="sample-caption">미리보기에서는 글이 저장되지 않아요.</small>`);
  html += `<footer class="invitation-ending reveal"><p class="ending-script">${selection.templateId === 'cinema' ? 'To be continued.' : 'Together, always.'}</p><p>우리의 시작에 함께해 주셔서 감사합니다.</p><p class="couple-names">${names}</p><span class="small-caps">2030 · 05 · 18</span></footer>`;
  return `<article ${themeAttributes(selection)} aria-label="${e(getTemplate(selection.templateId).name)} 전체 미리보기">${html}</article>`;
}
