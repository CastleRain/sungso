import { formatAreaPair, formatCompactPrice, formatPriceManwon } from './display-format.mjs?v=2.1.0';
import { isGeoPoint, normalizeGeoPoint } from './transport-core.mjs?v=2.1.0';

let sdkPromise = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}

function regionLabel(record) {
  return String(record.label || record.key).replace(/^(서울특별시|경기도)\s*/, '');
}

function regionWorldPixel(lat, lng, zoom) {
  const size = 256 * 2 ** zoom;
  const sine = Math.sin(Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180);
  return { x: (lng + 180) / 360 * size, y: (.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size };
}

function summarizeRegionGroup(records, zoom) {
  const ordered = [...records].sort((a, b) => String(a.key).localeCompare(String(b.key)));
  const lat = ordered.reduce((sum, record) => sum + record.lat, 0) / ordered.length;
  const lng = ordered.reduce((sum, record) => sum + record.lng, 0) / ordered.length;
  return {
    key: ordered.map(record => record.key).join(','), records: ordered,
    count: ordered.reduce((sum, record) => sum + record.count, 0), lat, lng,
    ...regionWorldPixel(lat, lng, zoom),
  };
}

function normalizeStatus(status) {
  return status === '재방문' ? 'revisit' : status === '보류' ? 'hold' : status === '제외' ? 'rejected' : 'interested';
}

function candidateDistanceLabel(record) {
  const raw = record?.weightedDistanceKm ?? record?.distanceKm;
  if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim()) || !Number.isFinite(Number(raw))) return '회사 경로 미확인';
  return `목적지 가중 직선거리 ${Number(raw).toFixed(1)}km · 경로 미확인`;
}

function candidateDecision(record) {
  if (record?.commuteBalance?.decision) return record.commuteBalance.decision;
  const route = record?.commute?.best;
  if (route?.verified && route.withinLimit) return 'matched';
  if (route?.verified && record?.commute?.allRequestedModesChecked !== false) return 'excluded';
  return 'pending';
}

function candidateRouteClass(record) {
  const decision = candidateDecision(record);
  return decision === 'matched' ? 'verified' : decision === 'excluded' ? 'over-limit' : 'estimated';
}

function candidateAveragePrice(record) {
  return Number(record?.bestArea?.averagePriceManWon ?? record?.bestArea?.medianPriceManWon ?? record?.askingPrice ?? 0);
}

function mapRecordId(record, prefix = 'candidate') {
  return String(record?.mapRecordId || `${prefix}:${record?.catalogId || record?.id || ''}`);
}

function contextLayer(record) {
  const value = String(record?.mapLayer || record?.layer || 'apartments');
  return ['apartments', 'supply', 'visits', 'shortlist'].includes(value) ? value : 'apartments';
}

function contextMarkerLabel(record) {
  const layer = contextLayer(record);
  if (layer === 'visits') return `★ ${record.name || '방문 집'}`;
  if (layer === 'shortlist') return `♥ ${record.name || '관심 단지'}`;
  if (layer === 'supply') return `⚑ ${record.name || record.title || '분양 공고'}`;
  return record.name || '공식 단지';
}

function contextMarkerZIndex(record, selected = false) {
  if (selected) return 300;
  const layer = contextLayer(record);
  return layer === 'visits' ? 220 : layer === 'shortlist' ? 210 : layer === 'supply' ? 160 : 40;
}

function contextMarkerContent(record, selected = false, compact = false) {
  const layer = contextLayer(record);
  const label = layer === 'visits' ? '방문 기록' : layer === 'shortlist' ? '관심 후보' : layer === 'supply' ? '분양' : '조건 확인 전';
  const name = record.name || record.title || (layer === 'supply' ? '분양 공고' : '공식 단지');
  const description = `${name} · ${label} · 상세 보기`;
  return `<div class="location-map-pill location-context-marker${compact && layer === 'supply' ? ' is-compact' : ''}${selected ? ' selected' : ''}" data-map-layer="${layer}" data-map-context="${escapeHtml(mapRecordId(record, 'context'))}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="${escapeHtml(description)}" title="${escapeHtml(description)}"><strong class="location-marker-name">${escapeHtml(name)}</strong><small class="location-marker-kind">${escapeHtml(label)}</small></div>`;
}

function marketAction(record, prefix) {
  if (!record?.name && !record?.title) return '';
  const id = escapeHtml(mapRecordId(record, prefix));
  const market = contextLayer(record) === 'supply' ? '' : `<button class="map-info-action" type="button" data-open-market-complex="${id}"><i class="ti ti-chart-line" aria-hidden="true"></i><span>5년 실거래</span></button>`;
  const evidence = `<button class="map-info-action" type="button" data-open-evidence-complex="${id}"><i class="ti ti-file-description" aria-hidden="true"></i><span>상세·근거</span></button>`;
  return `<div class="map-info-actions">${market}${evidence}</div>`;
}

function contextInfoContent(record) {
  const layer = contextLayer(record);
  const layerLabel = layer === 'visits' ? '다녀온 집' : layer === 'shortlist' ? '관심 후보' : layer === 'supply' ? '공식 분양' : '공식 단지 · 가격/면적 조회 전';
  let detail = [record.regionName, record.dong, record.address].filter(Boolean).join(' · ') || '상세 위치 확인';
  if (layer === 'visits') detail = `${formatPriceManwon(record.askingPrice)} · ${formatAreaPair(record.areaM2)}`;
  if (layer === 'shortlist') detail = `${candidatePriceLabel(record)} ${formatPriceManwon(candidateAveragePrice(record))} · ${formatAreaPair(record.bestArea?.areaM2)}`;
  if (layer === 'apartments') detail = [
    Number(record.households) > 0 ? `${Number(record.households).toLocaleString('ko-KR')}세대` : '',
    Number(record.builtYear) > 0 ? `${record.builtYear}년 준공` : '',
    record.regionName || record.address || '',
  ].filter(Boolean).join(' · ') || '공식 공동주택 목록';
  return `<div class="map-info recommendation-map-info"><span class="mi-status">${escapeHtml(layerLabel)}</span><strong>${escapeHtml(record.name || record.title || '이름 없는 위치')}</strong><p>${escapeHtml(detail)}</p>${marketAction(record, 'context')}</div>`;
}

function candidatePriceLabel(record) {
  return Number.isFinite(Number(record?.bestArea?.averagePriceManWon)) ? '평균' : '이전 저장가격';
}

function candidateCommuteLabel(record) {
  const balance = record?.commuteBalance;
  if (balance?.decision === 'matched') {
    return `모든 목적지 충족 · 평균 ${balance.weightedMeanMinutes ?? '—'}분`;
  }
  if (balance?.decision === 'excluded') {
    const worst = (balance.evaluations || []).filter((item) => item.verified).sort((a, b) => Number(b.ratio) - Number(a.ratio))[0];
    return worst ? `${worst.destination?.label || '목적지'} ${worst.durationMinutes}분 · 제한 초과` : '하나 이상 목적지 제한 초과';
  }
  const route = record?.commute?.best;
  return route?.verified
    ? `${route.mode === 'transit' ? '대중교통' : '자동차'} ${route.durationMinutes}분`
    : candidateDistanceLabel(record);
}

export function formatManwon(amount) {
  return formatCompactPrice(amount);
}

export function loadNaverMaps(clientId) {
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const callbackName = '__homehuntNaverSdkReady';
    const timeout = window.setTimeout(() => reject(new Error('NAVER Maps SDK timeout')), 12000);
    window[callbackName] = () => {
      window.clearTimeout(timeout);
      delete window[callbackName];
      if (window.naver?.maps) resolve(window.naver.maps);
      else reject(new Error('NAVER Maps SDK namespace missing'));
    };
    const script = document.createElement('script');
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&submodules=geocoder&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('NAVER Maps SDK load failed'));
    };
    document.head.appendChild(script);
  });

  return sdkPromise;
}

export class HomeMap {
  constructor(clientId) {
    this.clientId = clientId;
    this.map = null;
    this.markers = new Map();
    this.searchMarker = null;
    this.infoWindow = null;
    this.companyMarker = null;
    this.companyMarkers = new Map();
    this.candidateRecords = [];
    this.candidateMarkers = [];
    this.regionRecords = [];
    this.regionMarkers = [];
    this.regionSignature = '';
    this.lastRegionZoom = null;
    this.onRegionSelect = null;
    this.contextRecords = [];
    this.lastContextZoom = null;
    this.contextMarkers = new Map();
    this.clusterEnabled = false;
    this.candidateSignature = '';
    this.lastClusterZoom = null;
    this.onCandidateSelect = null;
    this.onContextSelect = null;
    this.selectedId = null;
    this.pickHandler = null;
    this.onSelect = null;
    this.onReady = null;
    this.onError = null;
  }

  async init(container, options = {}) {
      this.onSelect = options.onSelect || null;
    this.onCandidateSelect = options.onCandidateSelect || null;
    this.onContextSelect = options.onContextSelect || null;
    this.clusterEnabled = Boolean(options.cluster);
    this.onReady = options.onReady || null;
    this.onError = options.onError || null;
    try {
      await loadNaverMaps(this.clientId);
      this.map = new naver.maps.Map(container, {
        center: new naver.maps.LatLng(37.5252, 127.0414),
        zoom: 13,
        minZoom: 7,
        maxZoom: 21,
        zoomControl: true,
        zoomControlOptions: { position: naver.maps.Position.RIGHT_CENTER },
        mapTypeControl: true,
        mapTypeControlOptions: { position: naver.maps.Position.BOTTOM_LEFT },
        logoControlOptions: { position: naver.maps.Position.BOTTOM_LEFT },
        scaleControl: true,
      });
      this.infoWindow = new naver.maps.InfoWindow({
        borderWidth: 0,
        backgroundColor: '#fff',
        anchorColor: '#fff',
        pixelOffset: new naver.maps.Point(0, -9),
      });
      naver.maps.Event.addListener(this.map, 'click', (event) => {
        if (this.pickHandler) this.pickHandler({ lat: event.coord.y, lng: event.coord.x });
        else this.infoWindow?.close();
      });
      naver.maps.Event.addListener(this.map, 'idle', () => {
        const zoom = this.map.getZoom();
        if (this.clusterEnabled && zoom !== this.lastClusterZoom) this.renderCandidateClusters();
        if (zoom !== this.lastRegionZoom) this.renderRegionClusters();
        if (zoom !== this.lastContextZoom) this.setContextRecords(this.contextRecords);
      });
      naver.maps.Event.addListener(this.map, 'zoom_changed', () => {
        if (this.map.getZoom() !== this.lastRegionZoom) this.renderRegionClusters();
      });
      this.renderRegionClusters();
      this.onReady?.(this);
      return this;
    } catch (error) {
      this.onError?.(error);
      throw error;
    }
  }

  setRecords(records) {
    if (!this.map) return;
    const nextIds = new Set(records.map((record) => record.id));
    this.markers.forEach((entry, id) => {
      if (!nextIds.has(id)) {
        entry.marker.setMap(null);
        this.markers.delete(id);
      }
    });

    records.forEach((record) => {
      const point = normalizeGeoPoint(record);
      if (!point) return;
      const position = new naver.maps.LatLng(point.lat, point.lng);
      const markerClass = `map-price-marker ${normalizeStatus(record.status)}${record.id === this.selectedId ? ' selected' : ''}`;
      const content = `<div class="${markerClass}" data-marker-id="${escapeHtml(record.id)}"><span>${escapeHtml(formatManwon(record.askingPrice))}</span></div>`;
      let entry = this.markers.get(record.id);
      if (!entry) {
        const marker = new naver.maps.Marker({
          map: this.map,
          position,
          title: record.name,
          icon: { content, anchor: new naver.maps.Point(0, 0) },
          zIndex: 50,
        });
        naver.maps.Event.addListener(marker, 'click', () => this.select(record.id, this.markers.get(record.id)?.record, true));
        entry = { marker, record };
        this.markers.set(record.id, entry);
      } else {
        entry.record = record;
        entry.marker.setPosition(position);
        entry.marker.setTitle(record.name);
        entry.marker.setIcon({ content, anchor: new naver.maps.Point(0, 0) });
      }
    });
  }

  setContextRecords(records = [], { fit = false } = {}) {
    if (!this.map) return;
    this.lastContextZoom = this.map.getZoom();
    const next = records.filter(isGeoPoint);
    const nextIds = new Set(next.map((record) => mapRecordId(record, 'context')));
    this.contextMarkers.forEach((entry, id) => {
      if (!nextIds.has(id)) {
        entry.marker.setMap(null);
        this.contextMarkers.delete(id);
      }
    });
    next.forEach((record) => {
      const id = mapRecordId(record, 'context');
      const point = normalizeGeoPoint(record);
      const position = new naver.maps.LatLng(point.lat, point.lng);
      const content = contextMarkerContent(record, id === this.selectedId, this.map.getZoom() < 12);
      let entry = this.contextMarkers.get(id);
      if (!entry) {
        const marker = new naver.maps.Marker({
          map: this.map,
          position,
          title: contextMarkerLabel(record),
          icon: { content, anchor: new naver.maps.Point(0, 0) },
          zIndex: contextMarkerZIndex(record, id === this.selectedId),
        });
        naver.maps.Event.addListener(marker, 'click', () => this.selectContext(id, true));
        entry = { marker, record };
        this.contextMarkers.set(id, entry);
      } else {
        entry.record = record;
        entry.marker.setPosition(position);
        entry.marker.setTitle(contextMarkerLabel(record));
        entry.marker.setIcon({ content, anchor: new naver.maps.Point(0, 0) });
        entry.marker.setZIndex(contextMarkerZIndex(record, id === this.selectedId));
        entry.marker.setMap(this.map);
      }
    });
    this.contextRecords = next;
    if (fit) this.fitCandidateRecords(next);
  }

  clearContextRecords() {
    if (this.contextMarkers.has(String(this.selectedId))) this.clearSelection();
    this.contextMarkers.forEach(({ marker }) => marker.setMap(null));
    this.contextMarkers.clear();
    this.contextRecords = [];
  }

  clearSelection() {
    const previousId = this.selectedId;
    this.selectedId = null;
    if (previousId === null || previousId === undefined) return;
    const context = this.contextMarkers.get(String(previousId));
    if (context) {
      context.marker.setIcon({ content: contextMarkerContent(context.record, false, this.map.getZoom() < 12), anchor: new naver.maps.Point(0, 0) });
      context.marker.setZIndex(contextMarkerZIndex(context.record));
    }
    const visit = this.markers.get(previousId);
    if (visit) {
      visit.marker.setIcon({ content: `<div class="map-price-marker ${normalizeStatus(visit.record.status)}" data-marker-id="${escapeHtml(previousId)}"><span>${escapeHtml(formatManwon(visit.record.askingPrice))}</span></div>`, anchor: new naver.maps.Point(0, 0) });
      visit.marker.setZIndex(50);
    }
    const candidate = this.candidateMarkers.find(entry => entry.records.some(record => String(record.catalogId || record.id) === String(previousId)));
    if (candidate) {
      candidate.marker.setZIndex(candidate.records.length > 1 ? 80 : 100);
      if (candidate.records.length === 1) {
        const record = candidate.records[0];
        const price = candidateAveragePrice(record);
        candidate.marker.setIcon({ content: `<div class="recommendation-price-marker ${candidateRouteClass(record)}${record.isShortlisted ? ' shortlisted' : ''}">${record.isShortlisted ? '♥ ' : ''}${escapeHtml(price > 0 ? formatCompactPrice(price) : '가격 확인')}</div>`, anchor: new naver.maps.Point(0, 0) });
      }
    }
    this.infoWindow?.close();
  }

  selectContext(id, openInfo = false) {
    const entry = this.contextMarkers.get(String(id));
    if (!entry) return;
    this.clearSelection();
    this.selectedId = String(id);
    this.contextMarkers.forEach(({ marker, record }, markerId) => {
      marker.setZIndex(contextMarkerZIndex(record, markerId === this.selectedId));
      marker.setIcon({
        content: contextMarkerContent(record, markerId === this.selectedId, this.map.getZoom() < 12),
        anchor: new naver.maps.Point(0, 0),
      });
    });
    if (openInfo) {
      this.infoWindow?.setContent(contextInfoContent(entry.record));
      this.infoWindow?.open(this.map, entry.marker);
    }
    this.onContextSelect?.(entry.record);
  }

  select(id, record = null, openInfo = false) {
    this.clearSelection();
    this.selectedId = id;
    const entry = this.markers.get(id);
    const selected = record || entry?.record;
    this.markers.forEach(({ marker, record: markerRecord }, markerId) => {
      const cls = `map-price-marker ${normalizeStatus(markerRecord.status)}${markerId === id ? ' selected' : ''}`;
      marker.setIcon({
        content: `<div class="${cls}" data-marker-id="${escapeHtml(markerId)}"><span>${escapeHtml(formatManwon(markerRecord.askingPrice))}</span></div>`,
        anchor: new naver.maps.Point(0, 0),
      });
      marker.setZIndex(markerId === id ? 200 : 50);
    });
    if (entry && selected) {
      this.map.morph(entry.marker.getPosition(), Math.max(this.map.getZoom(), 16));
      if (openInfo) {
        this.infoWindow.setContent(`<div class="map-info"><span class="mi-status">${escapeHtml(selected.status)}</span><strong>${escapeHtml(selected.name)}</strong><p>${escapeHtml(formatPriceManwon(selected.askingPrice))} · ${escapeHtml(formatAreaPair(selected.areaM2))} · ${escapeHtml(selected.floor || '—')}층</p>${marketAction({ ...selected, mapLayer: 'visits', mapRecordId: `context:visit:${selected.id}` }, 'context')}</div>`);
        this.infoWindow.open(this.map, entry.marker);
      }
    }
    this.onSelect?.(id);
  }

  focus(id) {
    const entry = this.markers.get(id);
    if (!entry) return;
    this.select(id, entry.record, true);
  }

  moveTo(lat, lng, zoom = 16) {
    if (!this.map) return;
    this.map.morph(new naver.maps.LatLng(Number(lat), Number(lng)), zoom);
  }

  showSearchLocation(lat, lng, title = '검색 위치', zoom = 17) {
    if (!this.map) return;
    const position = new naver.maps.LatLng(Number(lat), Number(lng));
    const content = `<div class="map-search-pin"><span>⌖</span><strong>${escapeHtml(title)}</strong></div>`;
    if (!this.searchMarker) {
      this.searchMarker = new naver.maps.Marker({
        map: this.map,
        position,
        title,
        icon: { content, anchor: new naver.maps.Point(17, 42) },
        zIndex: 300,
      });
    } else {
      this.searchMarker.setPosition(position);
      this.searchMarker.setTitle(title);
      this.searchMarker.setIcon({ content, anchor: new naver.maps.Point(17, 42) });
      this.searchMarker.setMap(this.map);
    }
    this.map.morph(position, zoom);
  }

  clearSearchLocation() {
    this.searchMarker?.setMap(null);
    this.searchMarker = null;
  }

  detachCandidateMarkers() {
    this.candidateMarkers.forEach((entry) => entry.marker.setMap(null));
    this.candidateMarkers = [];
  }

  clearCandidateMarkers() {
    this.clearSelection();
    this.setRegionRecords([]);
    this.detachCandidateMarkers();
    this.candidateRecords = [];
    this.candidateSignature = '';
    this.lastClusterZoom = null;
    this.selectedId = null;
    this.infoWindow?.close();
  }

  setRegionRecords(records = [], onSelect = null) {
    const unique = new Map();
    for (const record of Array.isArray(records) ? records : []) {
      const point = normalizeGeoPoint(record);
      const key = String(record?.key ?? '').trim();
      const count = Number(record?.count);
      if (!point || !key || !Number.isSafeInteger(count) || count <= 0) continue;
      unique.set(key, { ...record, ...point, key, count });
    }
    this.regionRecords = [...unique.values()].sort((a, b) => a.key.localeCompare(b.key));
    const signature = this.regionRecords.map(r => `${r.key}:${r.label}:${r.count}:${r.lat}:${r.lng}`).join('|');
    this.onRegionSelect = onSelect;
    if (signature === this.regionSignature && this.lastRegionZoom === this.map?.getZoom()) return;
    this.regionSignature = signature;
    this.renderRegionClusters();
  }

  regionGroups() {
    if (!this.map || !this.regionRecords.length) return [];
    const zoom = this.map.getZoom();
    const groups = this.regionRecords.map(record => summarizeRegionGroup([record], zoom));
    // Merge overlapping compact marker boxes rather than fixed geographic cells:
    // adjacent districts on opposite cell boundaries must still form one group.
    // World pixels make membership depend on zoom, without moving as the map pans.
    while (groups.length > 1) {
      let nearest = null;
      for (let left = 0; left < groups.length - 1; left += 1) {
        for (let right = left + 1; right < groups.length; right += 1) {
          const dx = Math.abs(groups[left].x - groups[right].x);
          const dy = Math.abs(groups[left].y - groups[right].y);
          if (dx >= 132 || dy >= 44) continue;
          const distance = (dx / 132) ** 2 + (dy / 44) ** 2;
          if (!nearest || distance < nearest.distance) nearest = { left, right, distance };
        }
      }
      if (!nearest) break;
      const { left, right } = nearest;
      groups[left] = summarizeRegionGroup([...groups[left].records, ...groups[right].records], zoom);
      groups.splice(right, 1);
    }
    return groups;
  }

  renderRegionClusters() {
    this.regionMarkers.forEach(marker => marker.setMap(null));
    this.regionMarkers = [];
    if (!this.map) return;
    this.lastRegionZoom = this.map.getZoom();
    for (const group of this.regionGroups()) {
      const largest = [...group.records].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))[0];
      const multiple = group.records.length > 1;
      const label = `${regionLabel(largest)}${multiple ? ` 외 ${group.records.length - 1}지역` : ''}`;
      const description = group.records.map(record => `${regionLabel(record)} ${record.count.toLocaleString('ko-KR')}곳`).join(', ');
      const title = `${description} · 지역 대표 위치${multiple ? ' · 해당 지역 범위로 확대' : ' · 지역 후보 보기'}`;
      const attribute = multiple ? `data-region-group="${escapeHtml(group.key)}"` : `data-region-key="${escapeHtml(group.key)}"`;
      const content = `<div class="location-map-pill location-region-marker" role="button" tabindex="0" ${attribute} aria-label="${escapeHtml(title)}"><strong>${escapeHtml(label)}</strong><b>${group.count.toLocaleString('ko-KR')}</b><small>지역 대표 위치</small></div>`;
      const marker = new naver.maps.Marker({ map: this.map, position: new naver.maps.LatLng(group.lat, group.lng), title, icon: { content, anchor: new naver.maps.Point(66, 22) }, zIndex: 220 });
      naver.maps.Event.addListener(marker, 'click', () => this.focusRegionGroup(group.records.map(record => record.key)));
      this.regionMarkers.push(marker);
    }
  }

  focusRegionGroup(keys) {
    if (!this.map) return false;
    const requested = new Set((Array.isArray(keys) ? keys : String(keys || '').split(',')).map(key => String(key).trim()));
    const records = this.regionRecords.filter(record => requested.has(record.key));
    if (!records.length) return false;
    if (records.length === 1) {
      this.onRegionSelect?.(records[0]);
      return true;
    }
    const bounds = new naver.maps.LatLngBounds();
    records.forEach(record => bounds.extend(new naver.maps.LatLng(record.lat, record.lng)));
    const samePoint = records.every(record => record.lat === records[0].lat && record.lng === records[0].lng);
    if (samePoint) this.moveTo(records[0].lat, records[0].lng, Math.min(21, this.map.getZoom() + 2));
    else this.map.fitBounds(bounds, { top: 70, right: 80, bottom: 70, left: 80 });
    return true;
  }

  setCandidateRecords(records = [], { fit = false } = {}) {
    const next = records.filter(isGeoPoint);
    const signature = next.map((record) => {
      const balance = record.commuteBalance;
      const route = record.commute?.best;
      return `${record.catalogId || record.id}:${record.name}:${record.lat}:${record.lng}:${candidateAveragePrice(record)}:${record.bestArea?.areaM2}:${record.isShortlisted ? 1 : 0}:${record.weightedDistanceKm ?? record.distanceKm}:${balance ? `${balance.decision}:${balance.worstRatio}:${balance.weightedMeanMinutes}` : route?.verified ? `${route.withinLimit}:${route.durationMinutes}` : 'u'}`;
    }).sort().join('|');
    this.candidateRecords = next;
    if (signature !== this.candidateSignature) {
      this.candidateSignature = signature;
      this.renderCandidateClusters();
    }
    if (fit) this.fitCandidateRecords();
  }

  candidateGroups() {
    if (!this.map || !this.candidateRecords.length) return [];
    const zoom = this.map.getZoom();
    if (!this.clusterEnabled) return this.candidateRecords.map((record) => ({ key: String(record.catalogId || record.id), records: [record] }));
    if (zoom >= 16) {
      const exactGroups = new Map();
      this.candidateRecords.forEach((record) => {
        const key = `${Number(record.lat).toFixed(5)}:${Number(record.lng).toFixed(5)}`;
        if (!exactGroups.has(key)) exactGroups.set(key, []);
        exactGroups.get(key).push(record);
      });
      return [...exactGroups.entries()].map(([key, records]) => ({ key, records }));
    }
    const scale = 2 ** (12 - zoom);
    const latCell = .018 * scale;
    const lngCell = .024 * scale;
    const groups = new Map();
    this.candidateRecords.forEach((record) => {
      const key = `${Math.floor(Number(record.lat) / latCell)}:${Math.floor(Number(record.lng) / lngCell)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });
    return [...groups.entries()].map(([key, records]) => ({ key, records }));
  }

  renderCandidateClusters() {
    if (!this.map) return;
    this.detachCandidateMarkers();
    this.candidateSignature = this.candidateRecords.map((record) => {
      const balance = record.commuteBalance;
      const route = record.commute?.best;
      return `${record.catalogId || record.id}:${record.name}:${record.lat}:${record.lng}:${candidateAveragePrice(record)}:${record.bestArea?.areaM2}:${record.isShortlisted ? 1 : 0}:${record.weightedDistanceKm ?? record.distanceKm}:${balance ? `${balance.decision}:${balance.worstRatio}:${balance.weightedMeanMinutes}` : route?.verified ? `${route.withinLimit}:${route.durationMinutes}` : 'u'}`;
    }).sort().join('|');
    this.lastClusterZoom = this.map.getZoom();
    this.candidateGroups().forEach((group) => {
      const { records } = group;
      const lat = records.reduce((sum, record) => sum + Number(record.lat), 0) / records.length;
      const lng = records.reduce((sum, record) => sum + Number(record.lng), 0) / records.length;
      const position = new naver.maps.LatLng(lat, lng);
      const lowest = Math.min(...records.map(candidateAveragePrice).filter((value) => value > 0));
      const record = records[0];
      const route = record.commute?.best || null;
      const routeClass = candidateRouteClass(record);
      const selected = records.some((item) => String(item.catalogId || item.id) === String(this.selectedId));
      const clusterDecisions = new Set(records.map(candidateDecision));
      const clusterDecision = clusterDecisions.size === 1 ? [...clusterDecisions][0] : 'mixed';
      const matchedCount = records.filter((item) => candidateDecision(item) === 'matched').length;
      const pendingCount = records.filter((item) => candidateDecision(item) === 'pending').length;
      const excludedCount = records.filter((item) => candidateDecision(item) === 'excluded').length;
      const clusterLabel = `${records.length}개 후보 · 충족 ${matchedCount}개 · 미확인 ${pendingCount}개 · 초과 ${excludedCount}개 · ${Number.isFinite(lowest) ? `최저 가격 ${formatCompactPrice(lowest)}` : '가격 확인 필요'}`;
      const shortlisted = records.some((item) => item.isShortlisted);
      const content = records.length > 1
        ? `<div class="recommendation-cluster-marker ${clusterDecision}" role="img" aria-label="${escapeHtml(clusterLabel)}" title="${escapeHtml(clusterLabel)}"><strong aria-hidden="true">${records.length}</strong></div>`
        : `<div class="recommendation-price-marker ${routeClass}${shortlisted ? ' shortlisted' : ''}${selected ? ' selected' : ''}">${shortlisted ? '♥ ' : ''}${escapeHtml(Number.isFinite(lowest) ? formatCompactPrice(lowest) : '가격 확인')}</div>`;
      const marker = new naver.maps.Marker({
        map: this.map,
        position,
        title: records.length > 1 ? clusterLabel : record.name,
        icon: { content, anchor: new naver.maps.Point(0, 0) },
        zIndex: records.length > 1 ? 80 : selected ? 180 : 100,
      });
      naver.maps.Event.addListener(marker, 'click', () => {
        if (records.length > 1) {
          if (this.map.getZoom() >= 18) {
            this.clearSelection();
            this.selectedId = String(records[0].catalogId || records[0].id);
            marker.setZIndex(180);
            const names = records.slice(0, 5).map((item) => escapeHtml(item.name)).join(' · ');
            this.infoWindow?.setContent(`<div class="map-info"><span class="mi-status">같은 위치 ${records.length}개 후보</span><strong>${names}</strong><p>목록에서 단지별 가격과 면적을 확인하세요.</p></div>`);
            this.infoWindow?.open(this.map, marker);
            this.onCandidateSelect?.(records[0]);
            return;
          }
          this.map.morph(position, Math.min(18, this.map.getZoom() + 2));
          return;
        }
        const nextId = String(record.catalogId || record.id);
        this.clearSelection();
        this.selectedId = nextId;
        marker.setZIndex(180);
        marker.setIcon({ content: `<div class="recommendation-price-marker ${routeClass}${record.isShortlisted ? ' shortlisted' : ''} selected">${record.isShortlisted ? '♥ ' : ''}${escapeHtml(Number.isFinite(lowest) ? formatCompactPrice(lowest) : '가격 확인')}</div>`, anchor: new naver.maps.Point(0, 0) });
        this.infoWindow?.setContent(`<div class="map-info"><span class="mi-status">${escapeHtml(candidateCommuteLabel(record))}</span><strong>${escapeHtml(record.name)}</strong><p>${escapeHtml(candidatePriceLabel(record))} ${escapeHtml(formatPriceManwon(candidateAveragePrice(record)))} · ${escapeHtml(formatAreaPair(record.bestArea?.areaM2))}</p>${marketAction(record, 'candidate')}</div>`);
        this.infoWindow?.open(this.map, marker);
        this.onCandidateSelect?.(record);
      });
      this.candidateMarkers.push({ marker, records });
    });
  }

  focusCandidate(record) {
    const point = normalizeGeoPoint(record);
    if (!this.map || !point) return false;
    const id = String(record.catalogId || record.id);
    this.clearSelection();
    this.selectedId = id;
    const position = new naver.maps.LatLng(point.lat, point.lng);
    if (typeof this.map.setZoom === 'function') this.map.setZoom(Math.max(16, this.map.getZoom()), false);
    if (typeof this.map.panTo === 'function') this.map.panTo(position);
    else this.map.morph(position, 16);
    this.renderCandidateClusters();
    const entry = this.candidateMarkers.find((item) => item.records.some((candidate) => String(candidate.catalogId || candidate.id) === id));
    if (entry) {
      entry.marker.setZIndex(180);
      this.infoWindow?.setContent(`<div class="map-info"><span class="mi-status">${escapeHtml(candidateCommuteLabel(record))}</span><strong>${escapeHtml(record.name)}</strong><p>${escapeHtml(candidatePriceLabel(record))} ${escapeHtml(formatPriceManwon(candidateAveragePrice(record)))} · ${escapeHtml(formatAreaPair(record.bestArea?.areaM2))}</p>${marketAction(record, 'candidate')}</div>`);
      this.infoWindow?.open(this.map, entry.marker);
    }
    this.onCandidateSelect?.(record);
    return true;
  }

  clearCompanyLocation() {
    this.companyMarker?.setMap(null);
    this.companyMarker = null;
    this.companyMarkers.forEach((marker) => marker.setMap(null));
    this.companyMarkers.clear();
  }

  showCompanyLocation(location, { fit = false } = {}) {
    this.setDestinations(location ? [location] : [], { fit });
  }

  setDestinations(destinations = [], { fit = false } = {}) {
    if (!this.map) return;
    const colors = ['#116a4d', '#3975a8', '#b36b22', '#8b5ea7'];
    const normalized = destinations.map((item, index) => ({ item, index, point: normalizeGeoPoint(item) })).filter((entry) => entry.point);
    const nextIds = new Set(normalized.map(({ item, index }) => String(item.id || `destination-${index + 1}`)));
    this.companyMarkers.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.setMap(null);
        this.companyMarkers.delete(id);
      }
    });
    normalized.forEach(({ item, index, point }) => {
      const id = String(item.id || `destination-${index + 1}`);
      const position = new naver.maps.LatLng(point.lat, point.lng);
      const letter = String.fromCharCode(65 + index);
      const color = colors[index % colors.length];
      const content = `<div class="recommendation-company-marker" style="--company-color:${color}" aria-label="목적지 ${letter}"><span>${letter}</span></div>`;
      let marker = this.companyMarkers.get(id);
      if (!marker) {
        marker = new naver.maps.Marker({ map: this.map, position, title: item.label || item.name || `목적지 ${letter}`, icon: { content, anchor: new naver.maps.Point(0, 0) }, zIndex: 250 + index });
        this.companyMarkers.set(id, marker);
      } else {
        marker.setPosition(position);
        marker.setTitle(item.label || item.name || `목적지 ${letter}`);
        marker.setIcon({ content, anchor: new naver.maps.Point(0, 0) });
        marker.setMap(this.map);
      }
    });
    this.companyMarker = normalized.length === 1 ? this.companyMarkers.get(String(normalized[0].item.id || 'destination-1')) || null : null;
    if (fit) this.fitCandidateRecords(normalized.map((entry) => entry.point));
  }

  fitCandidateRecords(extraPoint = null) {
    if (!this.map) return;
    const points = this.candidateRecords.map(normalizeGeoPoint).filter(Boolean);
    const extraPoints = Array.isArray(extraPoint) ? extraPoint : [extraPoint];
    extraPoints.map(normalizeGeoPoint).filter(Boolean).forEach((point) => points.push(point));
    if (!points.length) return;
    if (points.length === 1) return this.moveTo(points[0].lat, points[0].lng, 14);
    const bounds = new naver.maps.LatLngBounds();
    points.forEach((point) => bounds.extend(new naver.maps.LatLng(Number(point.lat), Number(point.lng))));
    this.map.fitBounds(bounds, { top: 54, right: 36, bottom: 54, left: 36 });
  }

  getCenter() {
    if (!this.map) return null;
    const center = this.map.getCenter();
    return { lat: center.y, lng: center.x };
  }

  startPinMode(handler) {
    this.pickHandler = async (coords) => {
      this.pickHandler = null;
      handler(coords);
    };
  }

  cancelPinMode() {
    this.pickHandler = null;
  }

  resize() {
    const maps = window.naver?.maps;
    if (this.map && maps?.Event) maps.Event.trigger(this.map, 'resize');
  }

  search(query) {
    return new Promise((resolve, reject) => {
      if (!window.naver?.maps?.Service) return reject(new Error('NAVER geocoder unavailable'));
      naver.maps.Service.geocode({ query }, (status, response) => {
        if (status !== naver.maps.Service.Status.OK) return resolve([]);
        const addresses = response?.v2?.addresses || [];
        resolve(addresses.map((item) => ({
          name: item.roadAddress || item.jibunAddress || query,
          roadAddress: item.roadAddress || '',
          jibunAddress: item.jibunAddress || '',
          lat: item.y === '' || item.y === null || item.y === undefined ? null : Number(item.y),
          lng: item.x === '' || item.x === null || item.x === undefined ? null : Number(item.x),
          elements: item.addressElements || [],
        })).filter(isGeoPoint));
      });
    });
  }

  reverse(lat, lng) {
    return new Promise((resolve) => {
      if (!window.naver?.maps?.Service) return resolve('');
      naver.maps.Service.reverseGeocode({
        coords: new naver.maps.LatLng(Number(lat), Number(lng)),
        orders: `${naver.maps.Service.OrderType.ROAD_ADDR},${naver.maps.Service.OrderType.ADDR}`,
      }, (status, response) => {
        if (status !== naver.maps.Service.Status.OK) return resolve('');
        const result = response?.v2?.results?.[0];
        if (!result) return resolve('');
        const region = result.region || {};
        const land = result.land || {};
        const regionText = [region.area1?.name, region.area2?.name, region.area3?.name, region.area4?.name].filter(Boolean).join(' ');
        const roadText = land.name ? `${region.area1?.name || ''} ${region.area2?.name || ''} ${land.name} ${land.number1 || ''}${land.number2 ? `-${land.number2}` : ''}`.trim() : '';
        resolve(roadText || regionText);
      });
    });
  }

  resolveRegion(lat, lng) {
    return new Promise((resolve) => {
      if (!window.naver?.maps?.Service) return resolve(null);
      const legalOrder = naver.maps.Service.OrderType.LEGAL_CODE || 'legalcode';
      naver.maps.Service.reverseGeocode({
        coords: new naver.maps.LatLng(Number(lat), Number(lng)),
        orders: legalOrder,
      }, (status, response) => {
        if (status !== naver.maps.Service.Status.OK) return resolve(null);
        const results = response?.v2?.results || [];
        const result = results.find((item) => item.name === 'legalcode' || item.code?.type === 'L') || results[0];
        const code = String(result?.code?.id || '').slice(0, 5);
        if (!/^\d{5}$/.test(code)) return resolve(null);
        const area1 = result.region?.area1 || {};
        const area2 = result.region?.area2 || {};
        const sido = area1.name || '';
        const district = area2.name || (sido === '세종특별자치시' ? '세종시' : '');
        const shortSido = area1.alias || sido.replace('특별자치시', '').replace('특별시', '').replace('광역시', '').replace('도', '');
        resolve({
          code,
          sido,
          district,
          name: [shortSido, district].filter(Boolean).join(' '),
          center: [Number(lat), Number(lng)],
        });
      });
    });
  }
}
