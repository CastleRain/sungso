// tab-cards.js — 카드 그리드 + 필터/정렬

import { RESORTS, getBestPrice, sortByPrice, getFeaturedImage } from './resorts-data.js';

let onDetailOpen = null;
let currentSort = 'water_pool_4n';
let maxPrice = 3500;
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

function ratingStars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function renderCard(resort, sortKey, rank) {
  const price = getBestPrice(resort, sortKey);
  const isPriceBest = rank === 1 && price != null;

  const heroImg = getFeaturedImage(resort);
  const imgHtml = heroImg
    ? `<img src="${heroImg}" alt="${resort.name_ko}" loading="lazy"
         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">`
      + `<div class="card-image-placeholder" style="display:none;">🏝️</div>`
    : `<div class="card-image-placeholder">🏝️</div>`;

  const rankBadge = isPriceBest
    ? `<div class="card-rank-badge">💰 최저가</div>` : '';

  return `
<div class="resort-card" data-id="${resort.id}" onclick="window._cardClick('${resort.id}')">
  <div class="card-image">
    ${imgHtml}
    <div class="card-transfer-badge">${getTransferLabel(resort)}</div>
    ${resort.has_hammock ? '<div class="card-hammock-badge">🛏️ 해먹</div>' : ''}
    ${rankBadge}
  </div>
  <div class="card-body">
    <div class="card-name-ko">${resort.name_ko}</div>
    <div class="card-name-en">${resort.name_en}</div>
    <div class="card-atoll">📍 ${resort.atoll}</div>
    <div class="card-ratings">
      <div class="card-rating-item">
        <div class="card-rating-label">라군</div>
        <div class="card-rating-stars">${ratingStars(resort.ratings.lagoon)}</div>
      </div>
      <div class="card-rating-item">
        <div class="card-rating-label">수중</div>
        <div class="card-rating-stars">${ratingStars(resort.ratings.underwater)}</div>
      </div>
      <div class="card-rating-item">
        <div class="card-rating-label">프라이빗</div>
        <div class="card-rating-stars">${ratingStars(resort.ratings.privacy)}</div>
      </div>
      <div class="card-rating-item">
        <div class="card-rating-label">다이닝</div>
        <div class="card-rating-stars">${ratingStars(resort.ratings.dining)}</div>
      </div>
    </div>
    <div class="card-price-row">
      <span class="card-price-label">${SORT_LABELS[sortKey]}</span>
      <span>
        ${price != null
          ? `<span class="card-price-value${isPriceBest ? ' price-best' : ''}">$${price.toLocaleString()}</span> <span class="card-price-unit">/인</span>`
          : '<span class="price-na">해당 없음</span>'}
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
    // 해먹 필터
    if (hammockVal && !r.has_hammock) return false;
    // 아톨 필터
    if (atollVal && !r.atoll.includes(atollVal)) return false;
    // 이동수단 필터
    if (transferVal === 'seaplane' && r.transfer_type !== 'seaplane') return false;
    if (transferVal === 'speedboat' && r.transfer_type !== 'speedboat') return false;
    // 최대 가격 필터 — 어떤 여행사든 현재 정렬 기준 가격이 maxPrice 이하면 통과
    if (maxPrice < 3500) {
      const best = getBestPrice(r, currentSort);
      if (best != null && best > maxPrice) return false;
    }
    return true;
  });
}

function updateFilterSummary(sorted) {
  const summaryEl = document.getElementById('filterSummary');
  if (!summaryEl) return;

  if (sorted.length === 0) {
    summaryEl.textContent = '조건에 맞는 리조트가 없습니다';
    summaryEl.style.display = 'block';
    return;
  }

  const prices = sorted.map(r => getBestPrice(r, currentSort)).filter(p => p != null);
  if (prices.length === 0) { summaryEl.style.display = 'none'; return; }

  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const cheapest = sorted.find(r => getBestPrice(r, currentSort) === minP);

  summaryEl.innerHTML = `<span class="summary-count">${sorted.length}개 리조트</span>
    · 가격 범위: <b>$${minP.toLocaleString()}</b> ~ <b>$${maxP.toLocaleString()}</b> /인
    · 최저가: <b>${cheapest?.name_ko}</b> ($${minP.toLocaleString()})`;
  summaryEl.style.display = 'block';
}

function renderGrid() {
  const grid = document.getElementById('cardsGrid');
  if (!grid) return;

  applyFilters();
  const sorted = sortByPrice(filteredResorts, currentSort);

  if (sorted.length === 0) {
    grid.innerHTML = `<div class="no-results">
      <div class="no-results-icon">🔍</div>
      <div>조건에 맞는 리조트가 없습니다</div>
      <button onclick="document.getElementById('priceReset').click(); document.getElementById('filterTransfer').value=''; document.getElementById('filterAtoll').value=''; document.getElementById('filterHammock').checked=false; window._renderCards();" style="margin-top:12px;padding:8px 16px;border:1px solid var(--border);border-radius:8px;background:white;cursor:pointer;">필터 초기화</button>
    </div>`;
    updateFilterSummary([]);
    return;
  }

  grid.innerHTML = sorted.map((r, i) => renderCard(r, currentSort, i + 1)).join('');
  updateFilterSummary(sorted);
}

export function initCards(detailOpenFn) {
  onDetailOpen = detailOpenFn;

  window._cardClick = (id) => { if (onDetailOpen) onDetailOpen(id); };
  window._renderCards = renderGrid;

  // 정렬 버튼
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = btn.dataset.sort;
      // 가격 표시 갱신
      const disp = document.getElementById('priceDisplay');
      if (disp) updatePriceDisplay();
      renderGrid();
    });
  });

  // 이동수단·아톨·해먹 필터
  ['filterTransfer', 'filterAtoll', 'filterHammock'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderGrid);
  });

  // 최대 가격 슬라이더
  const slider = document.getElementById('filterMaxPrice');
  const resetBtn = document.getElementById('priceReset');

  function updatePriceDisplay() {
    const disp = document.getElementById('priceDisplay');
    if (!disp || !slider) return;
    const v = parseInt(slider.value);
    maxPrice = v;
    disp.textContent = v >= 3500 ? '제한 없음' : `$${v.toLocaleString()} 이하`;
    disp.classList.toggle('price-active', v < 3500);
  }

  slider?.addEventListener('input', () => { updatePriceDisplay(); renderGrid(); });

  resetBtn?.addEventListener('click', () => {
    if (slider) { slider.value = 3500; }
    maxPrice = 3500;
    updatePriceDisplay();
    renderGrid();
  });

  renderGrid();
}
