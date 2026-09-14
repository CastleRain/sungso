import { PHOTOS } from './catalog.mjs?v=20260914-mobile-preview';

const photograph = (index, thumbnail, attributes = '') => `<img src="${PHOTOS[index].src}" alt="${PHOTOS[index].alt}" width="${index === 0 ? 900 : 1200}" height="${index === 0 ? 1350 : 800}" decoding="async" ${thumbnail ? 'loading="lazy"' : ''} ${attributes}>`;
const names = '<span>성우</span><i>&</i><span>소희</span>';
const plane = '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="m9 21 13 3 14-14 5 1-9 17 7 8-3 3-9-5-12 7-3-1 6-13-9-3Z" fill="currentColor"/></svg>';
const rootAttributes = (id, thumbnail) => `class="cover paper-experience experience-${id}${thumbnail ? ' experience-thumbnail is-active' : ''}"${thumbnail ? '' : ` data-experience="${id}"`}${id === 'camera' ? ' data-shot="0"' : ''}`;
const status = (thumbnail, text) => thumbnail ? '' : `<p class="paper-experience-hint" data-experience-status aria-live="polite" aria-atomic="true">${text}</p>`;
const seal = thumbnail => thumbnail
  ? '<span class="envelope-seal" aria-hidden="true"><span class="seal-monogram">S&S</span></span>'
  : '<button class="envelope-seal" type="button" data-experience-action="open" aria-label="봉인을 눌러 초대장 열기" aria-pressed="false" data-idle-label="열기" data-active-label="다시 닫기"><span class="seal-monogram" aria-hidden="true">S&S</span><span data-experience-label>열기</span></button>';

/** Paper objects are CSS illustrations; preview actions are owned by experiences.mjs. */
export function paperCover(templateId, thumbnail = false) {
  if (templateId === 'envelope') return `<div ${rootAttributes(templateId, thumbnail)}>
    <p class="paper-kicker">SEALED WITH LOVE</p>
    <h2 class="envelope-title">A letter<br><em>for you.</em></h2>
    <p class="paper-subtitle">아끼는 마음을, 한 통의 초대에 담아.</p>
    <div class="envelope-stage">
      <div class="envelope-object" aria-hidden="true">
        <div class="envelope-back"></div>
        <div class="envelope-letter"><span>YOU ARE CORDIALLY INVITED</span>${photograph(0, thumbnail)}<p>성우 & 소희</p></div>
        <div class="envelope-front"></div><div class="envelope-flap"></div>
        <span class="envelope-address">To. our dearest</span>
      </div>
      ${seal(thumbnail)}
    </div>
    ${status(thumbnail, '봉인을 눌러, 우리의 초대를 열어보세요.')}
    <p class="couple-names paper-names">${names}</p><p class="paper-date">18 MAY 2030</p>
  </div>`;

  if (templateId === 'camera') return `<div ${rootAttributes(templateId, thumbnail)}>
    <p class="paper-kicker">THE MOMENT WE SAY YES</p>
    <h2 class="camera-title">One more<br><em>memory.</em><span aria-hidden="true">✳</span></h2>
    <p class="paper-subtitle">우리의 오늘을, 한 장씩 꺼내요.</p>
    <div class="camera-stage">
      <div class="instant-camera">
        <div class="camera-top"><span>S & S</span><span>INSTANT LOVE</span></div>
        <div class="camera-flash-window" aria-hidden="true"></div><div class="camera-lens" aria-hidden="true"><span></span></div>
        <span class="camera-detail" aria-hidden="true">05<br>18</span>
        ${thumbnail ? '<span class="camera-shutter" aria-hidden="true"><span>●</span></span>' : '<button class="camera-shutter" type="button" data-experience-action="shutter" aria-label="셔터를 눌러 예시 사진 꺼내기" aria-pressed="false" data-idle-label="찰칵" data-active-label="다음 사진"><span aria-hidden="true">●</span><span data-experience-label>찰칵</span></button>'}
        <div class="camera-print-slot" aria-hidden="true"></div>
      </div>
      <div class="camera-waiting" aria-hidden="true"><span>↟</span><p>셔터 한 번,<br>기억 한 장.</p><small>PRESS TO MAKE A MEMORY</small></div>
      <div class="instant-print"><div class="instant-print-image">${PHOTOS.map((_, index) => photograph(index, thumbnail, `data-camera-photo="${index}"${index === 0 ? '' : ' hidden'}`)).join('')}</div><p>our happiest little moment <span aria-hidden="true">♡</span></p><span class="instant-print-date">2030. 05. 18 · SUNGWOO & SOHEE</span></div>
    </div>
    ${status(thumbnail, '카메라의 셔터를 눌러보세요. 사진 3장을 꺼낼 수 있어요.')}
    <p class="couple-names paper-names">${names}</p><p class="paper-date">EVERY PICTURE, EVERY DAY, WITH YOU.</p>
  </div>`;

  if (templateId === 'ticket') return `<div ${rootAttributes(templateId, thumbnail)}>
    <p class="paper-kicker">SUNGWOO & SOHEE AIRLINES</p>
    <h2 class="ticket-title">A journey<br><em>called us.</em></h2>
    <p class="paper-subtitle">이제, 같은 방향으로 떠납니다.</p>
    <div class="boarding-stage">
      <div class="boarding-pass">
        <div class="boarding-main"><div class="boarding-header"><span>BOARDING PASS</span>${plane}</div>
          <div class="boarding-route"><div><small>FROM</small><strong>ME</strong><span>서로 다른 우리</span></div><span class="boarding-route-line" aria-hidden="true">${plane}</span><div><small>TO</small><strong>US</strong><span>함께할 모든 날</span></div></div>
          <p class="boarding-passengers"><small>PASSENGERS</small>성우 <span>&</span> 소희</p>
          <dl class="boarding-details"><div><dt>DEPARTURE</dt><dd>18 MAY 2030</dd></div><div><dt>DESTINATION</dt><dd>FOREVER</dd></div><div><dt>FLIGHT</dt><dd>SS 0518</dd></div><div><dt>SEAT</dt><dd>TOGETHER</dd></div></dl>
          <div class="boarding-stamp" aria-hidden="true"><span>OFFICIALLY</span><strong>MARRIED</strong><span>18 · MAY · 2030</span></div>
        </div>
        <div class="boarding-stub"><span class="boarding-barcode" aria-hidden="true"></span>${thumbnail ? '<span class="boarding-confirm" aria-hidden="true">BOARDING COMPLETE<br><b>WELCOME ABOARD ↗</b></span>' : '<button class="boarding-confirm" type="button" data-experience-action="stamp" aria-label="탑승권에 결혼 도장 찍기" aria-pressed="false" data-idle-label="탑승 확인 ↗" data-active-label="한 번 더 ↺"><small>YOUR INVITATION TO FOREVER</small><span data-experience-label>탑승 확인 ↗</span></button>'}</div>
      </div>
    </div>
    ${status(thumbnail, '탑승권을 눌러, 우리 여행의 시작을 확인해 주세요.')}
    <div class="ticket-footer"><span>ONE WAY</span><span>NO EXPIRATION</span><span>WITH LOVE</span></div>
  </div>`;
  return null;
}
