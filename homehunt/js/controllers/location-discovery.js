import { formatPriceManwon } from '../display-format.mjs';

const el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls || ''; if (text != null) n.textContent = text; return n; };
const validPoint = (p) => p && p.lat != null && p.lng != null && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && Number(p.lat) > 33 && Number(p.lat) < 39 && Number(p.lng) > 124 && Number(p.lng) < 132;
export const candidateRegionKey = (c) => String(c.regionCode || c.regionName || 'unknown');

export function candidateRegionGroups(candidates = []) {
  const groups = new Map();
  for (const c of candidates) {
    const key = candidateRegionKey(c);
    if (!groups.has(key)) groups.set(key, { key, label: c.regionName || '지역 미확인', count: 0, mapped: 0, candidates: [], prices: [], reference: null });
    const g = groups.get(key);
    g.count += 1; g.candidates.push(c);
    if (validPoint(c)) g.mapped += 1;
    if (validPoint(c.locationReference)) g.reference ||= c.locationReference;
    const price = Number(c.bestArea?.averagePriceManWon);
    if (price > 0 && Number.isFinite(price)) g.prices.push(price);
  }
  return [...groups.values()].map(g => ({ ...g, ...(g.reference ? { lat: g.reference.lat, lng: g.reference.lng } : {}), minPrice: g.prices.length ? Math.min(...g.prices) : null }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
}

export function renderLocationDiscovery(root, candidates, { selectedRegion = '', busy = false, status = '', onRegion, onAllRegions }) {
  root.hidden = !candidates.length;
  if (root.hidden) return;
  const groups = candidateRegionGroups(candidates);
  const selected = groups.find(g => g.key === selectedRegion);
  root.querySelector('[data-location-total]').textContent = `${candidates.length.toLocaleString('ko-KR')}곳 · ${groups.length}개 시군구`;
  const select = root.querySelector('#recommendationRegionScope');
  select.replaceChildren(...[{ key: '', label: '전체 지역', count: candidates.length }, ...groups].map(g => {
    const n = el('option', '', `${g.label} · ${g.count.toLocaleString('ko-KR')}곳`); n.value = g.key; return n;
  }));
  select.value = selected?.key || '';
  const chips = groups.slice(0, 3);
  if (selected && !chips.includes(selected)) chips.unshift(selected);
  root.querySelector('[data-location-regions]').replaceChildren(...chips.map(g => {
    const b = el('button', 'location-region-chip', `${g.label.replace(/^(서울특별시|경기도)\s*/, '')} ${g.count}곳`);
    b.type = 'button'; b.setAttribute('aria-pressed', String(selectedRegion === g.key)); b.addEventListener('click', () => onRegion(g.key)); return b;
  }));
  const more = root.querySelector('[data-location-all]');
  more.textContent = `지역 ${groups.length}곳 모두 보기 →`; more.onclick = onAllRegions;
  const exact = candidates.filter(validPoint).length;
  root.querySelector('[data-location-coverage]').textContent = busy ? '위치·역거리 확인 중…' : `단지 위치 ${exact}/${candidates.length}곳 확인 · 더 확인`;
  root.querySelector('[data-location-status]').textContent = status || `단지 좌표 ${exact}/${candidates.length}곳 확인 · 지역 숫자는 주소로 집계`;
  const refine = root.querySelector('#refineCandidateLocations'); refine.disabled = busy;
  refine.textContent = busy ? '위치·역거리 확인 중…' : '이 범위 상위 20곳 위치·역거리 확인';
}

export function createLocationScoreCard(candidate, { detailed = false } = {}) {
  const r = candidate.locationRecommendation;
  const root = el(detailed ? 'section' : 'div', 'location-score-card');
  if (!r) { root.append(el('small', '', '위치 추천 계산 준비 중')); return root; }
  const head = el('div', 'location-score-head');
  head.append(el('strong', '', r.rankingEligible ? `${r.coordinatePrecision === 'exact' ? '입지 추천' : '지역 참고'} ${Math.round(r.score)}점` : '입지 추천 · 위치 확인 전'), el('small', '', `점수 항목 ${Math.round(r.coveragePct || 0)}% 확인`));
  root.append(head);
  const facts = el('div', 'location-score-facts');
  if (r.anchorDistanceKm != null) facts.append(el('span', '', `강남역 직선 ${Number(r.anchorDistanceKm).toFixed(1)}km`));
  else if (r.approximateAnchorDistanceKm != null) facts.append(el('span', '', `강남역 대략 직선 ${Number(r.approximateAnchorDistanceKm).toFixed(1)}km · 지역 대표점`));
  else facts.append(el('span', '', '강남 접근성 미확인'));
  const nearest = r.nearestStation;
  facts.append(el('span', '', nearest ? `${nearest.name}${nearest.name.endsWith('역') ? '' : '역'} 직선 ${Number(nearest.distanceKm).toFixed(2)}km` : '가까운 역 미확인'));
  root.append(facts);
  const labels = { anchor: '강남 접근', station: '역 접근', households: '단지 규모', age: '연식', budget: '예산 충족' };
  const contributions = Object.entries(r.dimensions || {}).filter(([, d]) => d.score > 0).sort((a, b) => b[1].score - a[1].score).slice(0, 3).map(([key, d]) => `${labels[key]} ${Number(d.score).toFixed(1)}점`);
  const reasons = el('p', 'location-reasons', detailed ? (r.reasons || []).join(' · ') : contributions.join(' · '));
  root.append(reasons);
  if (detailed) {
    const list = el('dl', 'location-score-breakdown');
    for (const d of Object.values(r.dimensions || {})) {
      const source = typeof d.source === 'object' ? d.source?.name : d.source;
      const basis = { unknown: '미확인', approximate: '지역 대표점 추정', calculated: '거리 계산', provided: '단지 정보' }[d.status];
      list.append(el('dt', '', d.label || '점수 항목'), el('dd', '', `${Number(d.score || 0).toFixed(1)} / ${d.maxScore}점 · ${d.status === 'unknown' ? '미확인' : source || basis || ''}`));
    }
    root.append(list);
    if (r.unknowns?.length) root.append(el('p', 'location-reasons', `확인 필요: ${r.unknowns.join(' · ')}`));
  }
  root.append(el('small', 'location-score-note', '직선거리 참고 점수 · 실제 도보·강남 통근시간 아님'));
  return root;
}

export function renderDistrictList(root, candidates, onSelect) {
  const groups = candidateRegionGroups(candidates);
  root.replaceChildren(el('h3', '', `어느 지역에 있나요? · ${groups.length}개 시군구`), el('p', '', '주소 기준 조건 후보 수입니다. 지역을 누르면 지도와 후보 목록을 함께 좁힙니다.'));
  for (const g of groups) {
    const b = el('button', 'location-district-row'); b.type = 'button';
    b.append(el('strong', '', g.label), el('b', '', `${g.count}곳`), el('small', '', `단지 좌표 ${g.mapped}곳 확인${g.minPrice ? ` · 평균 실거래 ${formatPriceManwon(g.minPrice)}부터` : ''}`));
    b.addEventListener('click', () => onSelect(g.key)); root.append(b);
  }
}
