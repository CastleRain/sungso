import { PHOTOS } from './catalog.mjs?v=20260914-mobile-preview';
import { escapeHtml as e } from './core.mjs?v=20260914-mobile-preview';

const photograph = (index, className, eager = false) => `<img class="${className}" src="${e(PHOTOS[index].src)}" alt="${e(PHOTOS[index].alt)}" width="${index === 0 ? 1024 : 1536}" height="${index === 0 ? 1536 : 1024}" decoding="async" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}>`;
const plane = '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="m5 18 13 3 12-13 5 1-8 15 6 7-3 3-8-5-12 6-3-2 6-12-8-1Z" fill="currentColor"/></svg>';
const chapter = (number, title) => `<p class="ticket-chapter-label"><span>${number}</span>${title}</p>`;
const routeOptions = Object.freeze({
  rail: { name: '지하철', time: '도보 약 5분', start: '예시역', middle: '2번 출구', title: '예시역에서, 가볍게 걸어서', detail: '2번 출구를 나와 정원길을 따라 걸으면 가든홀 입구에 도착해요. 이동 시간은 디자인 확인용 예시입니다.', path: 'M48 159H118Q137 159 137 140V88Q137 67 158 67H278' },
  shuttle: { name: '셔틀', time: '탑승 약 10분', start: '셔틀 정류장', middle: '예시 순환로', title: '함께 타고 오는 작은 여행', detail: '예시역 앞 정류장에서 셔틀을 타고 가든홀까지 이동해요. 출발 간격·탑승 시간은 제작 시 실제 안내로 바꿔요.', path: 'M48 159C87 190 130 195 180 165S245 86 278 67' },
  car: { name: '자가용', time: '주차 후 약 3분', start: '주차장 입구', middle: '정원 산책길', title: '주차장에서, 정원길을 따라', detail: '예시 주차장에 주차한 뒤 정원 쪽 입구를 이용해요. 하객 2시간 무료 주차를 가정한 예시이며 실제 혜택은 아닙니다.', path: 'M48 159V105Q48 86 68 86H213Q232 86 232 67H278' },
});

function arrivals() {
  return `<section class="invite-section ticket-arrivals" data-section="directions">
    ${chapter('04', 'ARRIVAL GUIDE')}
    <h2>Every road<br><em>leads to us.</em></h2><p class="ticket-korean-title">당신의 걸음이 닿을 곳</p>
    <div class="ticket-destination"><span>OUR DESTINATION</span><strong>우리의 웨딩홀</strong><p>가든홀 · 2030년 5월 18일 오후 2시</p></div>
    <div class="ticket-transport-switch" role="group" aria-label="예시 교통수단 선택">${Object.entries(routeOptions).map(([id, route]) => `<button type="button" data-ticket-action="transport" data-ticket-value="${id}" aria-pressed="${id === 'rail'}">${route.name}</button>`).join('')}</div>
    <div class="ticket-route-map" data-ticket-map role="img" aria-label="지하철로 오는 예시 경로. 실제 지도가 아닙니다.">
      <svg viewBox="0 0 340 225" fill="none" aria-hidden="true">
        <path class="ticket-map-river" d="M-15 220C83 188 133 228 185 186S270 108 355 140"/>
        <path class="ticket-map-road" d="M-5 67H346M48-5V225M137-5V225M232-5V225M-5 159H346"/>
        <path class="ticket-map-block" d="M68 86h48v50H68zM155 86h58v50h-58zM250 86h72v43h-72zM68 13h48v34H68zM155 13h58v34h-58z"/>
        <path class="ticket-map-garden" d="M249 17h63v40h-63z"/><path class="ticket-map-tree" d="M258 44v-9m0 0-5 3m5-3 5 3m34 6v-9m0 0-5 3m5-3 5 3"/>
        <path class="ticket-map-route" data-ticket-route-path d="${routeOptions.rail.path}"/>
        <circle class="ticket-map-start" cx="48" cy="159" r="6"/>
        <circle class="ticket-map-end-halo" cx="278" cy="67" r="16"/><circle class="ticket-map-end" cx="278" cy="67" r="7"/>
        <text class="ticket-map-label" x="28" y="187" data-ticket-map-start>예시역</text><text class="ticket-map-label" x="278" y="103" text-anchor="middle">가든홀</text>
        <text class="ticket-map-small" x="14" y="22">N ↑</text><text class="ticket-map-small" x="245" y="211">SAMPLE ROUTE</text>
      </svg>
      <span class="ticket-map-caption">실제 장소가 아닌 예시 약도</span>
    </div>
    <div class="ticket-route-detail" aria-live="polite" aria-atomic="true"><div><span data-ticket-route-mode>지하철</span><strong data-ticket-route-time>도보 약 5분</strong></div><h3 data-ticket-route-title>${routeOptions.rail.title}</h3><p data-ticket-route-detail>${routeOptions.rail.detail}</p></div>
    <p class="ticket-example-note">교통수단을 눌러 안내의 변화를 살펴보세요.<br>실제 길찾기나 위치 조회는 실행하지 않아요.</p>
  </section>`;
}

function reply() {
  return `<section class="invite-section ticket-rsvp" data-section="rsvp">
    ${chapter('05', 'YOUR SAMPLE BOARDING PASS')}
    <h2>A place<br><em>beside us.</em></h2><p class="ticket-korean-title">함께할 자리를 그려보세요</p>
    <p class="ticket-example-note ticket-rsvp-notice">가상 게스트로 살펴보는 RSVP 체험입니다.<br><strong>실제 참석 응답을 수집하거나 저장하지 않아요.</strong></p>
    <div class="ticket-guest"><span>EXAMPLE GUEST</span><strong>게스트 하루</strong><small>입력하지 않는 가상 이름</small></div>
    <fieldset class="ticket-choice"><legend>그날, 함께할까요?</legend><div><button type="button" data-ticket-action="attendance" data-ticket-value="attend" aria-pressed="true">참석할게요</button><button type="button" data-ticket-action="attendance" data-ticket-value="absent" aria-pressed="false">마음으로 함께해요</button></div></fieldset>
    <fieldset class="ticket-choice"><legend>함께 오는 분</legend><div><button type="button" data-ticket-action="company" data-ticket-value="solo" aria-pressed="true">혼자 갈게요</button><button type="button" data-ticket-action="company" data-ticket-value="plus-one" aria-pressed="false">한 명과 함께</button></div></fieldset>
    <p class="ticket-choice-help" data-ticket-choice-help>가상 게스트 1명의 참석 예시를 만들어요.</p>
    <button class="ticket-rsvp-confirm" type="button" data-ticket-action="confirm">예시 확인 티켓 만들기 <span aria-hidden="true">↗</span></button>
    <div class="ticket-confirmation" data-ticket-result hidden>
      <div class="ticket-confirmation-top"><span>PREVIEW ONLY</span>${plane}</div><p class="ticket-confirmation-title">Dear, 하루</p>
      <p class="ticket-confirmation-message" data-ticket-confirmation-message></p>
      <div class="ticket-confirmation-code"><span>SS · 0518</span><span>18 MAY 2030</span><span class="ticket-mini-barcode" aria-hidden="true"></span></div>
      <small>화면에서만 만든 예시예요. 전송·저장되지 않았어요.</small><button type="button" data-ticket-action="reset">다시 체험하기 ↺</button>
    </div>
    <p class="ticket-rsvp-status" data-ticket-rsvp-status role="status" aria-live="polite" aria-atomic="true"></p>
  </section>`;
}

/** Return only the inner markup; the caller owns the article and theme variables. */
export function renderSignatureTicket(selection, parts) {
  const enabled = key => Boolean(parts[key]) && selection.sections?.[key] !== false;
  return `<div class="ticket-document" data-ticket-signature>
    <header class="ticket-masthead"><span>S & S <b>JOURNAL</b></span><span>VOL. 01<br>THE WEDDING EDITION</span></header>
    <section class="ticket-editorial-hero" aria-label="우리라는 여행의 시작">
      <div class="ticket-hero-copy"><p>A PASSPORT TO OUR FOREVER</p><h2>Life is a journey.<br><em>Love is the destination.</em></h2></div>
      <div class="ticket-hero-portrait">${photograph(0, 'ticket-portrait', true)}<div class="ticket-portrait-shade"></div><svg class="ticket-hero-route" viewBox="0 0 360 350" fill="none" aria-hidden="true"><path d="M34 282C18 185 178 174 227 223S169 310 139 216 228 76 316 64"/><circle cx="34" cy="282" r="5"/><circle cx="316" cy="64" r="5"/><path class="ticket-hero-plane" d="m301 53 9 3 9-9 3 1-6 11 4 5-2 2-6-3-8 4-2-1 4-9-6-2Z"/></svg><div class="ticket-portrait-label"><span>ME → US</span><strong>우리라는 목적지</strong><small>WITH SUNGWOO & SOHEE</small></div></div>
      <div class="ticket-edition"><span>ONE WAY TO FOREVER</span><span>18 MAY 2030</span></div>
    </section>
    <div class="ticket-boarding-page">${chapter('01', 'THE INVITATION')}${parts.cover}</div>
    <div class="ticket-letter-page"><span class="ticket-postmark" aria-hidden="true">WITH LOVE<br>18 · MAY<br>2030</span>${parts.greeting}<p class="ticket-letter-signoff">Every day, a new adventure.</p></div>
    ${enabled('story') ? `<div class="ticket-story-page">${parts.story}</div>` : ''}
    <div class="ticket-itinerary-page">${chapter('02', 'THE WEDDING ITINERARY')}<h2 class="ticket-display-title">One beautiful day.<br><em>A lifetime ahead.</em></h2><p class="ticket-page-subtitle">우리의 첫 여정, 그날의 작은 안내</p>
      <div class="ticket-flight-board" role="table" aria-label="예시 예식 여정"><div class="ticket-flight-board-head" role="row"><span role="columnheader">TIME</span><span role="columnheader">DESTINATION</span><span role="columnheader">STATUS</span></div>${[['13:30', '반가운 만남', 'WELCOME'], ['14:00', '우리의 약속', 'TOGETHER'], ['15:00', '이어지는 축하', 'WITH LOVE']].map(([time, destination, status]) => `<div class="ticket-flight-row" role="row"><span role="cell">${time}</span><span role="cell">${destination}</span><span role="cell">${status}</span></div>`).join('')}</div><p class="ticket-example-note">예식 순서와 시간은 모두 디자인 확인용 예시입니다.</p>${parts.date}</div>
    ${enabled('gallery') ? `<div class="ticket-memories-page"><div class="ticket-memory-heading">${chapter('03', 'COLLECT MOMENTS')}<p>Little moments,<br><em>our favorite souvenirs.</em></p></div>${parts.gallery}</div>` : ''}
    ${enabled('directions') ? arrivals() : ''}
    ${enabled('accounts') ? `<div class="ticket-gratitude-page">${parts.accounts}</div>` : ''}
    ${enabled('rsvp') ? reply() : ''}
    ${enabled('guestbook') ? `<div class="ticket-wishes-page">${parts.guestbook}</div>` : ''}
    <div class="ticket-final-page"><figure class="ticket-last-photograph">${photograph(1, 'ticket-last-photo')}<figcaption>THE BEST IS YET TO COME.</figcaption></figure><div class="ticket-final-route" aria-hidden="true"><span>YOU</span><i></i>${plane}<i></i><span>US</span></div>${parts.ending}<div class="ticket-document-end"><span>END OF THIS PAGE.<br>BEGINNING OF OUR STORY.</span><b>S & S</b></div></div>
  </div>`;
}

/** Native buttons provide keyboard support. All state is cosmetic and in memory. */
export function createTicketSignature() {
  let host = null, root = null;
  let transport = 'rail', attendance = 'attend', company = 'solo', confirmed = false;
  const text = (selector, value) => {
    const node = root?.querySelector(selector);
    if (node && node.textContent !== value) node.textContent = value;
  };
  function render() {
    if (!root || root.isConnected === false) return;
    const route = routeOptions[transport];
    root.querySelectorAll('button[data-ticket-action]').forEach(button => {
      const action = button.dataset.ticketAction;
      if (action === 'transport') button.setAttribute('aria-pressed', String(button.dataset.ticketValue === transport));
      if (action === 'attendance') button.setAttribute('aria-pressed', String(button.dataset.ticketValue === attendance));
      if (action === 'company') {
        button.disabled = attendance === 'absent';
        button.setAttribute('aria-pressed', String(attendance === 'attend' && button.dataset.ticketValue === company));
      }
    });
    root.querySelector('[data-ticket-map]')?.setAttribute('aria-label', `${route.name}으로 오는 예시 경로. 실제 지도가 아닙니다.`);
    root.querySelector('[data-ticket-route-path]')?.setAttribute('d', route.path);
    text('[data-ticket-map-start]', route.start);
    text('[data-ticket-route-mode]', route.name);
    text('[data-ticket-route-time]', route.time);
    text('[data-ticket-route-title]', route.title);
    text('[data-ticket-route-detail]', route.detail);
    const summary = attendance === 'absent' ? '마음으로 함께하는 예시를 만들어요. 동행 선택은 필요하지 않아요.' : `가상 게스트 ${company === 'plus-one' ? '2명' : '1명'}의 참석 예시를 만들어요.`;
    text('[data-ticket-choice-help]', summary);
    const result = root.querySelector('[data-ticket-result]');
    if (result) result.hidden = !confirmed;
    const message = attendance === 'absent' ? '하루님의 따뜻한 마음을 담은 예시 티켓이에요.' : `하루님${company === 'plus-one' ? '과 동행 한 분' : ''}의 자리를 그려본 예시 티켓이에요.`;
    text('[data-ticket-confirmation-message]', confirmed ? message : '');
    text('[data-ticket-rsvp-status]', confirmed ? `${message} 실제 응답은 전송하거나 저장하지 않았어요.` : '');
  }
  function click(event) {
    const button = event.target?.closest?.('button[data-ticket-action]') || event.target?.parentElement?.closest?.('button[data-ticket-action]');
    if (!button || button.disabled || !root?.contains(button) || root.isConnected === false) return;
    const { ticketAction: action, ticketValue: value } = button.dataset;
    if (action === 'transport' && Object.hasOwn(routeOptions, value)) transport = value;
    else if (action === 'attendance' && ['attend', 'absent'].includes(value)) {
      attendance = value; confirmed = false;
      if (attendance === 'absent') company = 'solo';
    } else if (action === 'company' && attendance === 'attend' && ['solo', 'plus-one'].includes(value)) {
      company = value; confirmed = false;
    } else if (action === 'confirm' && root.querySelector('[data-ticket-result]')) confirmed = true;
    else if (action === 'reset') { attendance = 'attend'; company = 'solo'; confirmed = false; }
    else return;
    render();
  }
  function dispose() {
    host?.removeEventListener('click', click);
    host = null; root = null;
  }
  function mount(nextHost) {
    dispose();
    if (!nextHost) return;
    host = nextHost;
    root = host.matches?.('[data-ticket-signature]') ? host : host.querySelector('[data-ticket-signature]');
    if (!root) { host = null; return; }
    render();
    host.addEventListener('click', click);
  }
  return { mount, dispose };
}
