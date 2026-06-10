// app.js — 탭 라우터 + 공유 상태 + D-Day

import { initCards } from './tab-cards.js';
import { initPrice } from './tab-price.js';
import { initMap } from './tab-map.js';
import { initTournament } from './tab-tournament.js';
import { initPdf } from './tab-pdf.js';
import { RESORTS, getBestPrice } from './resorts-data.js';

// ── D-Day 계산 ─────────────────────────────────────────────────────
function updateDDay() {
  const target = new Date('2027-03-08');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  const el = document.getElementById('ddayBadge');
  if (!el) return;
  if (diff > 0) el.textContent = `D-${diff}`;
  else if (diff === 0) el.textContent = 'D-Day! 🎉';
  else el.textContent = `D+${Math.abs(diff)}`;
}

// ── 탭 전환 ────────────────────────────────────────────────────────
let mapInitialized = false;
let priceInitialized = false;
let tournamentInitialized = false;
let pdfInitialized = false;

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));

  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const content = document.getElementById(`tab-${tabId}`);
  if (btn) btn.classList.add('active');
  if (content) content.classList.add('active');

  // 탭별 지연 초기화 (처음 열릴 때만)
  if (tabId === 'price' && !priceInitialized) {
    initPrice();
    priceInitialized = true;
  }
  if (tabId === 'map' && !mapInitialized) {
    initMap(openDetail);
    mapInitialized = true;
  }
  if (tabId === 'tournament' && !tournamentInitialized) {
    initTournament();
    tournamentInitialized = true;
  }
  if (tabId === 'pdf' && !pdfInitialized) {
    initPdf();
    pdfInitialized = true;
  }
}

// ── 상세 오버레이 ───────────────────────────────────────────────────
export function openDetail(resortId) {
  const resort = RESORTS.find(r => r.id === resortId);
  if (!resort) return;

  const overlay = document.getElementById('detailOverlay');
  const title = document.getElementById('detailOverlayTitle');
  const panel = document.getElementById('detailReportPanel');
  const mapName = document.getElementById('detailMapName');
  const mapSub = document.getElementById('detailMapSub');

  title.textContent = `${resort.name_ko}  ·  ${resort.name_en}`;
  mapName.textContent = resort.name_ko;
  mapSub.textContent = `${resort.atoll} · ${resort.transfer_type === 'seaplane' ? '✈' : '🚤'} ${resort.transfer_minutes}분 · ${resort.distance_km}km`;

  panel.innerHTML = renderResortDetail(resort);
  overlay.classList.add('open');
  panel.scrollTop = 0;

  // 상세 지도 SVG에 핀 강조
  highlightDetailMapPin(resortId);
}

export function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
}

function highlightDetailMapPin(resortId) {
  // 상세 오버레이 내 지도 핀 강조 — detailMap이 <use>이므로 mainSvgMap 핀을 복사한 별도 SVG 사용
  // 현재 구현: 아무 SVG 조작 없이 mapSub에 정보 표시 (충분)
}

// ── 리조트 상세 HTML 렌더링 ────────────────────────────────────────
function stars(n, max = 5) {
  return '★'.repeat(n) + '<span class="empty">' + '★'.repeat(max - n) + '</span>';
}

function renderResortDetail(r) {
  const agencies = r.agencies;
  const agencyIds = Object.keys(agencies);
  const agencyNames = { realmaldives: '리얼몰디브', honeymoonresort: '허니문리조트' };
  const agencyClass = { realmaldives: 'real', honeymoonresort: 'honey' };

  // 미디어 섹션
  const imagesHtml = r.image_urls.length
    ? r.image_urls.map(url =>
        `<div class="media-thumb"><img src="${url}" alt="${r.name_ko}" loading="lazy" onerror="this.parentElement.innerHTML='🏝️'"></div>`
      ).join('')
    : '<div style="color:var(--text-light);font-size:12px;padding:8px 0;">이미지 큐레이션 예정</div>';

  const youtubeHtml = r.youtube_ids.length
    ? `<div class="youtube-grid">${r.youtube_ids.map(id =>
        `<div class="youtube-frame"><iframe src="https://www.youtube-nocookie.com/embed/${id}" allowfullscreen loading="lazy"></iframe></div>`
      ).join('')}</div>`
    : `<div class="youtube-grid">${[1,2,3].map(() =>
        `<div class="youtube-empty">영상 ID 큐레이션 예정<br><small>${r.name_ko} 몰디브 브이로그</small></div>`
      ).join('')}</div>`;

  // 가격 카드
  const priceCardsHtml = agencyIds.map(agId => {
    const ag = agencies[agId];
    const rows = [];
    const key_labels = [
      ['water_pool_4n', '워터풀빌라 4박'],
      ['water_4n', '워터빌라 4박'],
      ['mix_4n', '비치+워터 믹스 4박'],
      ['beach_4n', '비치빌라 4박'],
    ];
    for (const [key, label] of key_labels) {
      if (ag[key] == null) continue;
      const disc = ag[key + '_disc'];
      const base = ag[key];
      const val = disc != null
        ? `<span class="price-original">$${base.toLocaleString()}</span> <span class="price-discount">$${disc.toLocaleString()}</span>`
        : `$${base.toLocaleString()}`;
      rows.push(`<tr><td>${label}</td><td class="price-main">${val}</td></tr>`);
    }
    const promoHtml = ag.promotions?.length
      ? ag.promotions.map(p => `<div class="promo-badge">🎯 ${p}</div>`).join('')
      : '';

    return `
      <div class="price-card">
        <div class="price-card-header ${agencyClass[agId]}">
          <span class="price-agency ${agencyClass[agId]}">${agencyNames[agId]}</span>
          <span class="price-plan">${ag.meal_plan_name || ag.meal_plan}</span>
        </div>
        <table class="price-table">${rows.join('')}</table>
        ${promoHtml}
      </div>`;
  }).join('');

  // 허니문 특전 (첫 번째 agency 기준)
  const hmAg = agencies[agencyIds[0]];
  const hmTierClass = r.honeymoon_tier === '최상' ? 'good' : r.honeymoon_tier === '중간' ? 'ok' : 'weak';

  // PDF 링크
  const pdfLinksHtml = r.pdfs.length
    ? r.pdfs.map(p => `<button class="card-detail-btn" onclick="openPdfFromDetail('${p.file}', '${p.label}')" style="margin-right:6px;margin-bottom:6px;">📄 ${p.label}</button>`).join('')
    : '<span style="color:var(--text-light);font-size:12px;">관련 PDF 없음</span>';

  return `
<section class="resort-section">
  <div class="resort-header">
    <div class="resort-header-left">
      <div class="resort-num">${String(r.num).padStart(2,'0')} / 09</div>
      <div class="resort-name">${r.name_ko}</div>
      <div class="resort-name-en">${r.name_en}</div>
      <div class="resort-meta">
        <span class="meta-pill pill-blue">📍 ${r.atoll}</span>
        <span class="meta-pill pill-teal">${r.transfer_type === 'seaplane' ? '✈️' : '🚤'} ${r.transfer_minutes}분</span>
        <span class="meta-pill pill-gray">🏠 ${r.villas}빌라</span>
        <span class="meta-pill pill-gray">📅 ${r.opened}년 오픈</span>
        ${agencyIds.map(id => `<span class="meta-pill pill-${id === 'realmaldives' ? 'coral' : 'blue'}">${agencyNames[id]}</span>`).join('')}
      </div>
      <div class="resort-tags">
        ${(r.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}
      </div>
    </div>
  </div>

  <!-- 기본 정보 -->
  <div class="block">
    <div class="block-header">📋 기본 정보</div>
    <div class="block-body">
      <p class="resort-desc">${r.description}</p>
      <div class="pros-cons">
        <div class="pros">
          <div class="pros-title">장점</div>
          <ul>${r.pros.map(p => `<li>${p}</li>`).join('')}</ul>
        </div>
        <div class="cons">
          <div class="cons-title">단점</div>
          <ul>${r.cons.map(c => `<li>${c}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="rating-grid">
        <div class="rating-item"><div class="rating-label">라군뷰</div><div class="rating-stars">${stars(r.ratings.lagoon)}</div></div>
        <div class="rating-item"><div class="rating-label">수중환경</div><div class="rating-stars">${stars(r.ratings.underwater)}</div></div>
        <div class="rating-item"><div class="rating-label">프라이빗</div><div class="rating-stars">${stars(r.ratings.privacy)}</div></div>
        <div class="rating-item"><div class="rating-label">다이닝</div><div class="rating-stars">${stars(r.ratings.dining)}</div></div>
      </div>
    </div>
  </div>

  <!-- 가격 비교 -->
  <div class="block">
    <div class="block-header">💰 가격 (1인 기준 USD · 4박)</div>
    <div class="block-body">
      <div class="price-compare ${agencyIds.length > 1 ? 'two-col' : 'one-col'}">
        ${priceCardsHtml}
      </div>
    </div>
  </div>

  <!-- 허니문 특전 -->
  <div class="block">
    <div class="block-header">💍 허니문 특전</div>
    <div class="block-body honeymoon-block">
      <div class="hm-criteria">📋 ${hmAg.certificate_validity || (agencyIds.length > 0 ? agencies[agencyIds[0]].honeymoon_benefits ? '청첩장 필수' : '' : '')}</div>
      <ul class="hm-list">
        ${hmAg.honeymoon_benefits.map(b => `<li><span class="hm-icon">💗</span>${b}</li>`).join('')}
      </ul>
      <div class="hm-comment ${hmTierClass}">💬 ${hmAg.honeymoon_comment}</div>
    </div>
  </div>

  <!-- 이미지 & 유튜브 -->
  <div class="block">
    <div class="block-header">📸 사진 & 영상 후기</div>
    <div class="block-body media-section">
      <div class="media-images">${imagesHtml}</div>
      ${youtubeHtml}
    </div>
  </div>

  <!-- PDF -->
  <div class="block">
    <div class="block-header">📄 관련 PDF</div>
    <div class="block-body">${pdfLinksHtml}</div>
  </div>
</section>`;
}

// PDF 탭으로 이동 + 파일 열기 (상세뷰에서 호출)
window.openPdfFromDetail = function(file, label) {
  closeDetail();
  switchTab('pdf');
  // PDF 탭에 파일 열기 이벤트 전달
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('open-pdf', { detail: { file, label } }));
  }, 100);
};

// ── 초기화 ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateDDay();

  // 탭 버튼 클릭
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 상세 닫기 버튼
  document.getElementById('detailCloseBtn').addEventListener('click', closeDetail);

  // ESC 키로 상세 닫기
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDetail();
  });

  // 카드 탭은 즉시 초기화
  initCards(openDetail);

  // 토너먼트 결과에서 상세 보기 이벤트
  window.addEventListener('open-detail', (e) => {
    openDetail(e.detail.id);
  });
});
