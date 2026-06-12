// tab-map.js — 미니맵 (pill ↔ full ↔ hidden 3상태)

import { RESORTS } from './resorts-data.js';

let onDetailOpen = null;
let float, collapseBtn, expandBtn;

// ── 상태 관리 ──────────────────────────────────────────────────────
function setMapState(state) {
  if (!float) return;
  const titleEl = float.querySelector('.minimap-title');
  float.classList.remove('map-pill', 'map-hidden');

  if (state === 'pill') {
    float.classList.add('map-pill');
    if (titleEl) titleEl.textContent = '📍 위치 보기';
    if (collapseBtn) { collapseBtn.textContent = '▾'; collapseBtn.title = '지도 열기'; }
    if (expandBtn) expandBtn.style.display = 'none';
  } else if (state === 'full') {
    if (titleEl) titleEl.textContent = '📍 위치 지도';
    if (collapseBtn) { collapseBtn.textContent = '✕'; collapseBtn.title = '접기'; }
    if (expandBtn) expandBtn.style.display = '';
  } else if (state === 'hidden') {
    float.classList.add('map-hidden');
  }
}

// ── 경로 패널 렌더 ────────────────────────────────────────────────
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

// ── 외부 공개 API ──────────────────────────────────────────────────
// 상세 패널 열릴 때: 미니맵 숨김
window._minimapHide = () => setMapState('hidden');

// 상세 패널 닫힐 때: pill 상태로 복귀
window._minimapShow = () => setMapState('pill');

// 상세 패널 내 "지도에서 보기" 클릭: 상세 닫고 full 지도 + 핀 강조
window._minimapShowWithPin = (resortId) => {
  window.closeCardDetail?.();
  setTimeout(() => {
    setMapState('full');
    document.querySelectorAll('.map-pin').forEach(p => p.classList.remove('active'));
    document.querySelector(`.map-pin[data-resort="${resortId}"]`)?.classList.add('active');
    renderRoutePanel(resortId);
  }, 80);
};

// ── 초기화 ────────────────────────────────────────────────────────
export function initMap(detailOpenFn) {
  if (detailOpenFn) onDetailOpen = detailOpenFn;
  float = document.getElementById('minimapFloat');
  expandBtn = document.getElementById('minimapExpandBtn');
  collapseBtn = document.getElementById('minimapCollapseBtn');

  window._mapDetailClick = (id) => { if (onDetailOpen) onDetailOpen(id); };

  // 기본 상태: pill
  setMapState('pill');
  renderRoutePanel(null);

  // 핀 클릭
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

  // 헤더 클릭: pill ↔ full 토글 (pill 상태에서는 헤더 전체 클릭 가능)
  const header = float?.querySelector('.minimap-header');
  header?.addEventListener('click', (e) => {
    if (!float.classList.contains('map-pill')) return; // full 상태에서는 버튼만
    setMapState('full');
  });
  collapseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isPill = float.classList.contains('map-pill');
    setMapState(isPill ? 'full' : 'pill');
  });

  // 확대 버튼 (full 상태에서만 표시)
  expandBtn?.addEventListener('click', () => {
    float.classList.toggle('expanded');
    expandBtn.textContent = float.classList.contains('expanded') ? '⤡' : '⤢';
  });
}
