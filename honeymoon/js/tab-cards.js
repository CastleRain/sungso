// tab-cards.js — 카드 그리드 + 필터/정렬

import { RESORTS, getBestPrice, sortByPrice } from './resorts-data.js';

let onDetailOpen = null;
let currentSort = 'water_pool_4n';
let filteredResorts = [...RESORTS];

const TIER_CLASS = { '최상': 'tier-best', '중간': 'tier-mid', '단순': 'tier-simple' };
const TIER_LABEL = { '최상': '💗 허니문 최상', '중간': '💛 중간', '단순': '⬜ 기본' };

const SORT_LABELS = {
  water_pool_4n: '워터풀 4박 최저가',
  mix_4n: '비치+워터 믹스',
  water_4n: '워터 4박',
  beach_4n: '비치 4박',
};

function getTransferLabel(r) {
  if (r.transfer_type === 'speedboat') return `🚤 ${r.transfer_minutes}분`;
  return `✈ ${r.transfer_minutes}분`;
}

function renderCard(resort, sortKey) {
  const price = getBestPrice(resort, sortKey);
  const imgHtml = resort.image_urls.length
    ? `<img src="${resort.image_urls[0]}" alt="${resort.name_ko}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
       <div class="card-image-placeholder" style="display:none;">🏝️</div>`
    : `<div class="card-image-placeholder">🏝️</div>`;

  const ratingStars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

  return `
<div class="resort-card" data-id="${resort.id}" onclick="window._cardClick('${resort.id}')">
  <div class="card-image">
    ${imgHtml}
    <div class="card-transfer-badge">${getTransferLabel(resort)}</div>
    ${resort.has_hammock ? '<div class="card-hammock-badge">🛏️ 해먹</div>' : ''}
  </div>
  <div class="card-body">
    <div class="card-name-ko">${resort.name_ko}</div>
    <div class="card-name-en">${resort.name_en}</div>
    <div class="card-atoll">📍 ${resort.atoll}</div>
    <div class="card-ratings">
      <div class="card-rating-item"><div class="card-rating-label">라군</div><div class="card-rating-stars" style="color:#f59e0b">${ratingStars(resort.ratings.lagoon)}</div></div>
      <div class="card-rating-item"><div class="card-rating-label">수중</div><div class="card-rating-stars" style="color:#f59e0b">${ratingStars(resort.ratings.underwater)}</div></div>
      <div class="card-rating-item"><div class="card-rating-label">프라이빗</div><div class="card-rating-stars" style="color:#f59e0b">${ratingStars(resort.ratings.privacy)}</div></div>
      <div class="card-rating-item"><div class="card-rating-label">다이닝</div><div class="card-rating-stars" style="color:#f59e0b">${ratingStars(resort.ratings.dining)}</div></div>
    </div>
    <div class="card-price-row">
      <span class="card-price-label">${SORT_LABELS[sortKey]}</span>
      <span>
        ${price != null
          ? `<span class="card-price-value">$${price.toLocaleString()}</span> <span class="card-price-unit">/인</span>`
          : '<span style="color:var(--text-light);font-size:12px;">해당 없음</span>'}
      </span>
    </div>
    <div class="card-footer">
      <span class="card-tier-badge ${TIER_CLASS[resort.honeymoon_tier] || 'tier-simple'}">${TIER_LABEL[resort.honeymoon_tier]}</span>
      <button class="card-detail-btn" onclick="event.stopPropagation(); window._cardClick('${resort.id}')">상세 보기 →</button>
    </div>
  </div>
</div>`;
}

function applyFilters() {
  const transferVal = document.getElementById('filterTransfer')?.value || '';
  const atollVal = document.getElementById('filterAtoll')?.value || '';
  const hammockVal = document.getElementById('filterHammock')?.checked || false;

  filteredResorts = RESORTS.filter(r => {
    if (hammockVal && !r.has_hammock) return false;
    if (atollVal && !r.atoll.includes(atollVal)) return false;
    if (transferVal) {
      if (transferVal === '40sb' && !(r.transfer_type === 'speedboat' && r.transfer_minutes === 40)) return false;
      else if (transferVal !== '40sb') {
        const mins = parseInt(transferVal);
        if (!isNaN(mins) && r.transfer_minutes !== mins) return false;
      }
    }
    return true;
  });
}

function renderGrid() {
  const grid = document.getElementById('cardsGrid');
  if (!grid) return;

  applyFilters();
  const sorted = sortByPrice(filteredResorts, currentSort);

  if (sorted.length === 0) {
    grid.innerHTML = `<div class="no-results" style="grid-column:1/-1;">
      <div class="no-results-icon">🔍</div>
      <div>조건에 맞는 리조트가 없습니다</div>
    </div>`;
    return;
  }

  grid.innerHTML = sorted.map(r => renderCard(r, currentSort)).join('');
}

export function initCards(detailOpenFn) {
  onDetailOpen = detailOpenFn;

  // 글로벌 카드 클릭 핸들러
  window._cardClick = (id) => {
    if (onDetailOpen) onDetailOpen(id);
  };

  // 정렬 버튼
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = btn.dataset.sort;
      renderGrid();
    });
  });

  // 필터 변경
  ['filterTransfer', 'filterAtoll', 'filterHammock'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderGrid);
  });

  renderGrid();
}
