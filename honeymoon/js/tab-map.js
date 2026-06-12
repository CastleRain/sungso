// tab-map.js — 미니맵 플로팅 패널 (SVG 핀 + 확장/접기 + 경로 패널)

import { RESORTS } from './resorts-data.js';

let onDetailOpen = null;

function renderRoutePanel(resortId) {
  const panel = document.getElementById('mapRoutePanel');
  if (!panel) return;

  if (!resortId) {
    panel.innerHTML = '<div class="map-route-empty">핀을 클릭하면<br>이동 경로가 표시됩니다</div>';
    return;
  }

  const resort = RESORTS.find(r => r.id === resortId);
  if (!resort) return;

  const isSeaplane = resort.transfer_type === 'seaplane';
  const transferIcon = isSeaplane ? '✈' : '🚤';
  const transferLabel = isSeaplane ? '수상비행기' : '스피드보트';

  panel.innerHTML = `
<div class="map-route-card">
  <div class="route-stop">
    <div class="route-stop-dot airport-dot"></div>
    <div class="route-stop-text">
      <div class="route-stop-label">말레 국제공항</div>
    </div>
  </div>
  <div class="route-connector">
    <div class="route-conn-line"></div>
    <div class="route-conn-badge">
      <span>${transferIcon}</span>
      <span>${transferLabel} · <strong>${resort.transfer_minutes}분</strong></span>
    </div>
  </div>
  <div class="route-stop">
    <div class="route-stop-dot resort-dot"></div>
    <div class="route-stop-text">
      <div class="route-stop-label resort-label">${resort.name_ko}</div>
      <div class="route-stop-sub">${resort.atoll}</div>
    </div>
  </div>
  <button class="map-route-detail-btn" onclick="window._mapDetailClick('${resort.id}')">상세 보기 →</button>
</div>`;
}

export function initMap(detailOpenFn) {
  if (detailOpenFn) onDetailOpen = detailOpenFn;

  window._mapDetailClick = (id) => {
    if (onDetailOpen) onDetailOpen(id);
  };

  renderRoutePanel(null);

  document.querySelectorAll('.map-pin').forEach(pin => {
    pin.addEventListener('click', () => {
      const resortId = pin.dataset.resort;
      if (!resortId) return;
      document.querySelectorAll('.map-pin').forEach(p => p.classList.remove('active'));
      pin.classList.add('active');
      renderRoutePanel(resortId);
      if (onDetailOpen) onDetailOpen(resortId);
    });
  });

  // 확대/축소 버튼
  const float = document.getElementById('minimapFloat');
  const expandBtn = document.getElementById('minimapExpandBtn');
  const collapseBtn = document.getElementById('minimapCollapseBtn');

  expandBtn?.addEventListener('click', () => {
    const isExpanded = float.classList.toggle('expanded');
    expandBtn.textContent = isExpanded ? '⤡' : '⤢';
  });

  collapseBtn?.addEventListener('click', () => {
    const isCollapsed = float.classList.toggle('collapsed');
    collapseBtn.textContent = isCollapsed ? '+' : '−';
  });
}
