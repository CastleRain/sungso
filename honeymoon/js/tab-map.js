// tab-map.js — SVG 지도 핀 클릭 + Leaflet 지연 로드

import { RESORTS, getResortById } from './resorts-data.js';

let onDetailOpen = null;
let leafletMap = null;
let leafletInitialized = false;

// SVG 핀 패널 업데이트
function showMapInfo(resort) {
  const panel = document.getElementById('mapInfoPanel');
  if (!panel) return;

  const agencyNames = { realmaldives: '리얼몰디브', honeymoonresort: '허니문리조트' };
  const agIds = Object.keys(resort.agencies);
  const agBadges = agIds.map(id => {
    const cls = id === 'realmaldives' ? 'pill-coral' : 'pill-blue';
    return `<span class="meta-pill ${cls}" style="font-size:11px;">${agencyNames[id]}</span>`;
  }).join(' ');

  const priceKeys = ['water_pool_4n', 'mix_4n', 'water_4n', 'beach_4n'];
  const priceLabels = { water_pool_4n: '워터풀 4박', mix_4n: '믹스 4박', water_4n: '워터 4박', beach_4n: '비치 4박' };
  let bestPrice = null;
  let bestLabel = '';
  for (const key of priceKeys) {
    for (const ag of Object.values(resort.agencies)) {
      const disc = ag[key + '_disc'];
      const base = ag[key];
      const price = disc ?? base;
      if (price != null && (bestPrice === null || price < bestPrice)) {
        bestPrice = price;
        bestLabel = priceLabels[key];
      }
    }
  }

  const ratingStars = (n) => '★'.repeat(n) + '<span style="opacity:.3">★</span>'.repeat(5 - n);

  panel.innerHTML = `
<div class="map-info-header">
  <div class="map-info-name">${resort.name_ko}</div>
  <div class="map-info-sub">${resort.name_en}</div>
  <div style="margin-top:6px;">${agBadges}</div>
</div>
<div class="map-info-stats">
  <div class="map-stat">
    <span class="map-stat-label">${resort.transfer_type === 'seaplane' ? '✈️ 수상비행기' : '🚤 스피드보트'}</span>
    <span class="map-stat-val">${resort.transfer_minutes}분 · ${resort.distance_km}km</span>
  </div>
  <div class="map-stat">
    <span class="map-stat-label">📍 아톨</span>
    <span class="map-stat-val">${resort.atoll}</span>
  </div>
  ${bestPrice ? `<div class="map-stat">
    <span class="map-stat-label">💰 최저 (${bestLabel})</span>
    <span class="map-stat-val" style="color:var(--teal);font-weight:700;">$${bestPrice.toLocaleString()}<small>/인</small></span>
  </div>` : ''}
</div>
<div class="map-info-ratings">
  <div class="map-rating-row"><span>라군뷰</span><span style="color:#f59e0b">${ratingStars(resort.ratings.lagoon)}</span></div>
  <div class="map-rating-row"><span>수중</span><span style="color:#f59e0b">${ratingStars(resort.ratings.underwater)}</span></div>
  <div class="map-rating-row"><span>프라이빗</span><span style="color:#f59e0b">${ratingStars(resort.ratings.privacy)}</span></div>
  <div class="map-rating-row"><span>다이닝</span><span style="color:#f59e0b">${ratingStars(resort.ratings.dining)}</span></div>
</div>
${resort.has_hammock ? '<div class="map-info-hammock">🛏️ 해먹 빌라 있음</div>' : ''}
<button class="map-detail-btn" onclick="window._mapDetailClick('${resort.id}')">상세 보기 →</button>`;
}

// Leaflet 지도 초기화 (처음 한 번만)
function initLeaflet() {
  if (leafletInitialized) return;
  leafletInitialized = true;

  const mapEl = document.getElementById('leafletMap');
  if (!mapEl || typeof L === 'undefined') {
    console.warn('Leaflet not loaded yet');
    return;
  }

  leafletMap = L.map('leafletMap').setView([4.0, 73.0], 6);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(leafletMap);

  for (const resort of RESORTS) {
    const { lat, lon } = resort.coords;
    const color = resort.svg_pin?.color || '#0ea5e9';

    const icon = L.divIcon({
      className: '',
      html: `<div style="background:${color};width:28px;height:28px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700;cursor:pointer;">${resort.name_ko[0]}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const marker = L.marker([lat, lon], { icon }).addTo(leafletMap);
    marker.bindPopup(`
<div style="min-width:160px;">
  <b>${resort.name_ko}</b><br>
  <small>${resort.name_en}</small><br>
  <hr style="margin:4px 0">
  ${resort.transfer_type === 'seaplane' ? '✈️' : '🚤'} ${resort.transfer_minutes}분 · ${resort.distance_km}km<br>
  📍 ${resort.atoll}
  <br><a href="#" onclick="window._mapDetailClick('${resort.id}');return false;" style="color:#0ea5e9;">상세 보기 →</a>
</div>`);
  }

  // 인터내셔널 공항(말레) 표시
  const airportIcon = L.divIcon({
    className: '',
    html: `<div style="background:#64748b;padding:2px 6px;border-radius:4px;font-size:10px;color:#fff;white-space:nowrap;">✈ 말레 공항</div>`,
    iconAnchor: [20, 10],
  });
  L.marker([4.19, 73.53], { icon: airportIcon }).addTo(leafletMap);

  // 지도 컨테이너 표시
  mapEl.parentElement?.classList.add('leaflet-active');
  setTimeout(() => leafletMap.invalidateSize(), 100);
}

export function initMap(detailOpenFn) {
  if (detailOpenFn) onDetailOpen = detailOpenFn;

  window._mapDetailClick = (id) => {
    if (onDetailOpen) onDetailOpen(id);
  };

  // SVG 핀 클릭 이벤트
  document.querySelectorAll('.map-pin').forEach(pin => {
    pin.addEventListener('click', () => {
      const resortId = pin.dataset.resort;
      const resort = getResortById(resortId);
      if (!resort) return;

      // 모든 핀 일반 상태로
      document.querySelectorAll('.map-pin').forEach(p => p.classList.remove('active'));
      pin.classList.add('active');

      showMapInfo(resort);
    });
  });

  // Leaflet 토글 버튼
  const leafletToggle = document.getElementById('leafletToggle');
  const leafletWrap = document.getElementById('leafletMapWrap');

  if (leafletToggle && leafletWrap) {
    leafletToggle.addEventListener('click', () => {
      const isOpen = leafletWrap.style.display === 'block';
      leafletWrap.style.display = isOpen ? 'none' : 'block';
      leafletToggle.textContent = isOpen ? '🗺️ 인터랙티브 지도 열기 (OpenStreetMap)' : '지도 접기 ▲';
      if (!isOpen) {
        initLeaflet();
        setTimeout(() => leafletMap?.invalidateSize(), 200);
      }
    });
  }

  // 기본 선택: 첫 번째 리조트
  const firstPin = document.querySelector('.map-pin');
  firstPin?.click();
}
