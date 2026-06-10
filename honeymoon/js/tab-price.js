// tab-price.js — 가격 비교 테이블

import { RESORTS, getBestPrice } from './resorts-data.js';

const PRICE_KEYS = [
  { key: 'water_pool_4n', label: '워터풀빌라 4박' },
  { key: 'mix_4n',        label: '비치+워터 믹스' },
  { key: 'water_4n',      label: '워터빌라 4박' },
  { key: 'beach_4n',      label: '비치빌라 4박' },
];

const AGENCY_NAMES = { realmaldives: '리얼몰디브', honeymoonresort: '허니문리조트' };

let sortKey = 'water_pool_4n';
let sortDir = 'asc';
let coupleMode = false; // 2인 합산

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
    const prices = getAllPricesForKey(r, key);
    for (const p of prices) {
      if (p.final < best) best = p.final;
    }
  }
  return best === Infinity ? null : best;
}

function renderTable() {
  const wrap = document.getElementById('priceTableWrap');
  if (!wrap) return;

  const bests = {};
  for (const { key } of PRICE_KEYS) bests[key] = findBestInColumn(key);

  // 정렬
  const sorted = [...RESORTS].sort((a, b) => {
    const pa = getBestPrice(a, sortKey);
    const pb = getBestPrice(b, sortKey);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return sortDir === 'asc' ? pa - pb : pb - pa;
  });

  const mul = coupleMode ? 2 : 1;
  const unitNote = coupleMode ? '2인 합산 USD' : '1인 USD';

  const headerCols = PRICE_KEYS.map(({ key, label }) => {
    const active = key === sortKey;
    const indicator = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th class="${active ? 'sorted' : ''}" data-key="${key}">${label}<span class="sort-indicator">${indicator}</span></th>`;
  }).join('');

  const rows = sorted.map(resort => {
    const priceCols = PRICE_KEYS.map(({ key }) => {
      const prices = getAllPricesForKey(resort, key);
      if (prices.length === 0) {
        return `<td class="td-price na">—</td>`;
      }
      // 여러 여행사가 있으면 각각 표시
      const cells = prices.map(p => {
        const finalAmt = p.final * mul;
        const isBest = p.final === bests[key];
        const discHtml = p.disc != null
          ? `<span class="orig">$${(p.base * mul).toLocaleString()}</span>`
          : '';
        const valHtml = isBest
          ? `<span class="price-val">$${finalAmt.toLocaleString()}</span>`
          : `$${finalAmt.toLocaleString()}`;
        const badge = isBest ? '<span class="col-best-badge">최저</span>' : '';
        const agLabel = prices.length > 1 ? `<div style="font-size:10px;color:var(--text-light);">${p.agName}</div>` : '';
        return `<div style="margin-bottom:${prices.length > 1 ? '4px' : '0'}">${agLabel}${discHtml}<span class="${isBest ? 'td-price best' : ''}">${valHtml}${badge}</span></div>`;
      }).join('');
      return `<td class="td-price">${cells}</td>`;
    }).join('');

    const agencyBadges = Object.keys(resort.agencies).map(agId => {
      const cls = agId === 'realmaldives' ? 'pill-coral' : 'pill-blue';
      return `<span class="meta-pill ${cls}" style="font-size:10px;">${AGENCY_NAMES[agId]}</span>`;
    }).join(' ');

    return `
<tr>
  <td class="td-resort-name">
    ${resort.name_ko}
    <small>${resort.name_en}</small>
    <div style="margin-top:4px;">${agencyBadges}</div>
  </td>
  <td class="td-plan">
    ${Object.values(resort.agencies).map(ag => `<div>${ag.meal_plan_name?.split('(')[0] || ag.meal_plan}</div>`).join('')}
  </td>
  ${priceCols}
</tr>`;
  }).join('');

  wrap.innerHTML = `
<div style="margin-bottom:10px; font-size:12px; color:var(--text-muted);">💡 단위: ${unitNote} · 할인 후 가격 기준 · <span style="background:var(--teal-light);color:#085041;padding:2px 6px;border-radius:4px;font-size:11px;">최저</span> 표시 = 해당 항목 최저가</div>
<table class="compare-table">
  <thead>
    <tr>
      <th data-key="_name">리조트</th>
      <th data-key="_plan">식사 플랜</th>
      ${headerCols}
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;

  // 정렬 클릭
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

export function initPrice() {
  renderTable();

  // 2인 합산 토글
  const toggle = document.getElementById('coupleToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      coupleMode = !coupleMode;
      const sw = document.getElementById('coupleSwitch');
      sw?.classList.toggle('on', coupleMode);
      renderTable();
    });
  }
}
