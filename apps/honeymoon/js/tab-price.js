// tab-price.js — 가격 비교 테이블

import { RESORTS, getBestPrice } from './resorts-data.js';

const PRICE_KEYS = [
  { key: 'water_pool_4n', label: '🏊 워터풀 4박', short: '워터풀', icon: '🏊' },
  { key: 'mix_4n',        label: '🔀 믹스 4박',   short: '믹스',   icon: '🔀' },
  { key: 'water_4n',      label: '🌊 워터 4박',   short: '워터',   icon: '🌊' },
  { key: 'beach_4n',      label: '🏖️ 비치 4박',   short: '비치',   icon: '🏖️' },
];

const AGENCY_NAMES = { realmaldives: '리얼몰디브', honeymoonresort: '허니문리조트', tourmin: '투어민' };

let sortKey = 'water_pool_4n';
let sortDir = 'asc';
let coupleMode = false;
let onDetailOpen = null;
let selectedResortId = null;

window._priceSortBy = (key) => {
  sortKey = key;
  sortDir = 'asc';
  renderTable();
};

window._priceResortClick = (id) => {
  selectedResortId = id;
  document.querySelectorAll('.resort-row').forEach(r => r.classList.remove('selected'));
  document.querySelector(`.resort-row[data-resort-id="${id}"]`)?.classList.add('selected');
  if (onDetailOpen) onDetailOpen(id);
};

function getAllPricesForKey(resort, key) {
  const results = [];
  for (const [agId, ag] of Object.entries(resort.agencies)) {
    const disc = ag[key + '_disc'];
    const base = ag[key];
    if (base == null) continue;
    results.push({
      agId,
      agName: AGENCY_NAMES[agId] || agId,
      base,
      disc: disc ?? null,
      final: disc ?? base,
    });
  }
  return results;
}

function findBestInColumn(key) {
  let best = Infinity;
  for (const r of RESORTS) {
    for (const p of getAllPricesForKey(r, key)) {
      if (p.final < best) best = p.final;
    }
  }
  return best === Infinity ? null : best;
}

function findMaxInColumn(key) {
  let max = 0;
  for (const r of RESORTS) {
    for (const p of getAllPricesForKey(r, key)) {
      if (p.final > max) max = p.final;
    }
  }
  return max || null;
}

function renderSummaryCards(bests, mul, suffix) {
  const cards = PRICE_KEYS.map(({ key, short, icon }) => {
    const b = bests[key];
    if (!b) return '';
    const resort = RESORTS.find(r => getAllPricesForKey(r, key).some(p => p.final === b));
    const isActive = key === sortKey;
    return `<div class="price-summary-card${isActive ? ' active' : ''}" onclick="window._priceSortBy('${key}')">
      <div class="psc-icon">${icon}</div>
      <div class="psc-label">${short}</div>
      <div class="psc-price">${window._fmtUSD ? window._fmtUSD(b * mul) : '$' + (b * mul).toLocaleString()}</div>
      <div class="psc-suffix">${suffix} · 최저가</div>
      <div class="psc-resort">${resort?.name_ko || ''}</div>
    </div>`;
  }).join('');
  return `<div class="price-summary-row">${cards}</div>`;
}

function renderTable() {
  const wrap = document.getElementById('priceTableWrap');
  if (!wrap) return;

  const bests = {};
  const maxPrices = {};
  for (const { key } of PRICE_KEYS) {
    bests[key] = findBestInColumn(key);
    maxPrices[key] = findMaxInColumn(key);
  }

  const sorted = [...RESORTS].sort((a, b) => {
    const pa = getBestPrice(a, sortKey);
    const pb = getBestPrice(b, sortKey);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return sortDir === 'asc' ? pa - pb : pb - pa;
  });

  // 정렬 기준 컬럼의 순위 맵 (가격 있는 리조트만)
  let rankCounter = 0;
  const rankMap = {};
  sorted.forEach(r => {
    if (getBestPrice(r, sortKey) != null) rankMap[r.id] = ++rankCounter;
  });

  const mul = coupleMode ? 2 : 1;
  const suffix = coupleMode ? '/2인' : '/인';

  const headerCols = PRICE_KEYS.map(({ key, label }) => {
    const active = key === sortKey;
    const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th class="th-price${active ? ' sorted' : ''}" data-key="${key}">${label}${arrow}</th>`;
  }).join('');

  const rows = sorted.map(resort => {
    const tierBadge = {
      '최상': '<span class="tier-dot tier-best-dot"></span>',
      '중간': '<span class="tier-dot tier-mid-dot"></span>',
      '단순': '<span class="tier-dot tier-simple-dot"></span>',
    }[resort.honeymoon_tier] || '';

    const transferIcon = resort.transfer_type === 'seaplane' ? '✈' : '🚤';
    const rank = rankMap[resort.id];
    const rankBadge = rank <= 3
      ? `<span class="price-rank-pill rank-${rank}">#${rank}</span>` : '';

    const priceCols = PRICE_KEYS.map(({ key }) => {
      const prices = getAllPricesForKey(resort, key);
      if (prices.length === 0) return `<td class="td-price na">—</td>`;

      const resortBest = Math.min(...prices.map(p => p.final));
      const colBest = bests[key];
      const colMax = maxPrices[key];
      const barPct = (colBest && colMax && colMax > colBest)
        ? Math.round((1 - (resortBest - colBest) / (colMax - colBest)) * 100)
        : 100;
      const barClass = resortBest === colBest ? 'bar-best'
        : barPct >= 70 ? 'bar-good' : barPct >= 45 ? 'bar-mid' : 'bar-low';

      const isColBest = resortBest === colBest;

      const fmt = window._fmtUSD || (v => '$' + v.toLocaleString());
      const cells = prices.map(p => {
        const finalAmt = p.final * mul;
        const isBest = p.final === colBest;
        const discHtml = p.disc != null
          ? `<span class="orig">${fmt(p.base * mul)}</span> ` : '';
        return `<div class="price-cell-row">
          ${prices.length > 1 ? `<span class="ag-label">${p.agName}</span>` : ''}
          ${discHtml}<span class="${isBest ? 'best-price' : ''}">${fmt(finalAmt)}</span>
          ${isBest ? '<span class="best-badge">최저</span>' : ''}
        </div>`;
      }).join('');

      return `<td class="td-price${isColBest ? ' col-best' : ''}">
        ${cells}
        <div class="price-bar-wrap"><div class="price-bar-fill ${barClass}" style="width:${barPct}%"></div></div>
      </td>`;
    }).join('');

    const mealPlans = Object.values(resort.agencies)
      .map(ag => ag.meal_plan_name?.split('(')[0]?.trim() || ag.meal_plan)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join('<br>');

    return `
<tr class="resort-row${selectedResortId === resort.id ? ' selected' : ''}" data-resort-id="${resort.id}" onclick="window._priceResortClick('${resort.id}')">
  <td class="td-resort">
    <div class="resort-name-wrap">
      ${rankBadge}${tierBadge}<strong class="resort-name-link">${resort.name_ko}</strong>
    </div>
    <div class="resort-sub">${transferIcon} ${resort.transfer_minutes}분 · ${resort.atoll}</div>
    ${resort.has_hammock ? '<div class="hammock-note">🛏️ 해먹</div>' : ''}
  </td>
  <td class="td-plan"><div style="font-size:11px;color:var(--text-muted);">${mealPlans}</div></td>
  ${priceCols}
</tr>`;
  }).join('');

  const currLabel = (window._krwMode && window._fxRate) ? 'KRW' : 'USD';
  wrap.innerHTML = `
${renderSummaryCards(bests, mul, suffix)}
<div class="table-meta">
  💡 <b>${coupleMode ? '2인 합산' : '1인'} ${currLabel}</b> · 할인 후 기준 · <span class="best-badge">최저</span> = 해당 항목 최저가 · 헤더·카드 클릭 시 정렬
  <span class="tier-legend">
    <span class="tier-dot tier-best-dot"></span>최상
    <span class="tier-dot tier-mid-dot"></span>중간
    <span class="tier-dot tier-simple-dot"></span>기본
  </span>
</div>
<div class="table-scroll-wrap">
<table class="compare-table">
  <thead>
    <tr>
      <th class="th-resort" data-key="_name">리조트</th>
      <th class="th-plan" data-key="_plan">식사</th>
      ${headerCols}
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</div>`;

  wrap.querySelectorAll('th[data-key]').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.key;
      if (k.startsWith('_')) return;
      if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = k; sortDir = 'asc'; }
      renderTable();
    });
  });
}

export function initPrice(detailOpenFn) {
  onDetailOpen = detailOpenFn;
  window._renderPriceTable = renderTable;
  renderTable();

  const toggle = document.getElementById('coupleToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      coupleMode = !coupleMode;
      document.getElementById('coupleSwitch')?.classList.toggle('on', coupleMode);
      renderTable();
    });
  }
}
