import test from 'node:test';
import assert from 'node:assert/strict';
import { HomeMap } from '../js/naver-map.js';

function fixture(t, { cluster = false, zoom = 16 } = {}) {
  const previous = globalThis.naver;
  class Marker {
    constructor(options) { Object.assign(this, options); }
    setMap(map) { this.map = map; }
    setIcon(icon) { this.icon = icon; }
    setTitle(title) { this.title = title; }
    setPosition(position) { this.position = position; }
    setZIndex(zIndex) { this.zIndex = zIndex; }
    getPosition() { return this.position; }
  }
  globalThis.naver = { maps: {
    Marker, Point: class {}, LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } },
    Event: { addListener(target, event, callback) { target[event] = callback; } },
  } };
  t.after(() => {
    if (previous === undefined) delete globalThis.naver;
    else globalThis.naver = previous;
  });
  const map = new HomeMap('test-client');
  map.clusterEnabled = cluster;
  map.map = { zoom, getZoom() { return this.zoom; }, setZoom(value) { this.zoom = value; }, panTo() {}, morph() {} };
  map.infoWindow = { marker: null, content: '', setContent(content) { this.content = content; }, open(_, marker) { this.marker = marker; }, close() { this.marker = null; } };
  const calls = [];
  map.onContextSelect = record => calls.push(`context:${record.id}`);
  map.onCandidateSelect = record => calls.push(`candidate:${record.catalogId}`);
  map.onSelect = id => calls.push(`visit:${id}`);
  const contexts = [
    { id: 'a', name: '검증 단지', mapLayer: 'apartments', mapRecordId: 'context:apartment:a', lat: 37.5, lng: 127 },
    { id: 's', name: '검증 공고', mapLayer: 'supply', mapRecordId: 'context:supply:s', lat: 37.51, lng: 127 },
  ];
  const candidate = { catalogId: 'c', name: '검증 후보', lat: 37.52, lng: 127, isShortlisted: true,
    bestArea: { areaM2: 84, averagePriceManWon: 90000 }, commuteBalance: { decision: 'matched' } };
  const visit = { id: 'v', name: '검증 방문', lat: 37.53, lng: 127, askingPrice: 85000, areaM2: 84, status: '재방문' };
  map.setContextRecords(contexts);
  map.setCandidateRecords([candidate]);
  map.setRecords([visit]);
  return { map, candidate, visit, contexts, calls };
}

const isSelected = marker => /class="[^"]*\bselected\b/.test(marker.icon.content);
const candidateMarker = map => map.candidateMarkers[0].marker;
const contextMarker = (map, index = 0) => [...map.contextMarkers.values()][index].marker;
function selectedMarkers(map) {
  return [...map.markers.values()].map(entry => entry.marker)
    .concat([...map.contextMarkers.values()].map(entry => entry.marker), map.candidateMarkers.map(entry => entry.marker))
    .filter(isSelected);
}

test('context 클릭 → 후보 클릭 → 분양 context 클릭은 이전 강조와 aria-pressed를 해제한다', (t) => {
  const { map, calls } = fixture(t);
  const apartment = contextMarker(map);
  const supply = contextMarker(map, 1);
  const candidate = candidateMarker(map);
  apartment.click();
  assert.equal(selectedMarkers(map).length, 1);
  assert.match(apartment.icon.content, /aria-pressed="true"/);
  candidate.click();
  assert.equal(isSelected(apartment), false);
  assert.match(apartment.icon.content, /aria-pressed="false"/);
  assert.equal(candidate.zIndex, 180);
  assert.equal(map.infoWindow.marker, candidate);
  supply.click();
  assert.equal(selectedMarkers(map).length, 1);
  assert.equal(isSelected(supply), true);
  assert.equal(candidate.zIndex, 100);
  assert.match(candidate.icon.content, /recommendation-price-marker verified shortlisted/);
  assert.match(candidate.icon.content, /♥ 9억/);
  assert.equal(map.infoWindow.marker, supply);
  assert.match(apartment.icon.content, /location-map-pill location-context-marker/);
  assert.match(apartment.icon.content, /data-map-context="context:apartment:a"/);
  assert.match(apartment.icon.content, /조건 확인 전/);
  assert.deepEqual(calls, ['context:a', 'candidate:c', 'context:s']);
});

test('목록 focus와 방문 선택을 양방향으로 전환해도 한 마커만 강조되고 방문 상태는 유지된다', (t) => {
  const { map, candidate, visit, contexts, calls } = fixture(t);
  map.selectContext(contexts[0].mapRecordId, true);
  map.focus(visit.id);
  const visitMarker = map.markers.get(visit.id).marker;
  assert.equal(isSelected(contextMarker(map)), false);
  assert.equal(visitMarker.zIndex, 200);
  map.focusCandidate(candidate);
  assert.equal(visitMarker.zIndex, 50);
  assert.match(visitMarker.icon.content, /map-price-marker revisit"/);
  assert.equal(selectedMarkers(map).length, 1);
  assert.equal(isSelected(candidateMarker(map)), true);
  map.selectContext(contexts[1].mapRecordId, true);
  assert.equal(isSelected(candidateMarker(map)), false);
  assert.equal(candidateMarker(map).zIndex, 100);
  map.select(visit.id, visit, true);
  assert.equal(isSelected(contextMarker(map, 1)), false);
  assert.equal(selectedMarkers(map).length, 1);
  assert.equal(map.infoWindow.marker, visitMarker);
  assert.deepEqual(calls, ['context:a', 'visit:v', 'candidate:c', 'context:s', 'visit:v']);
});

test('context끼리 전환하거나 같은 마커를 다시 선택해도 단일 강조·단일 콜백을 유지한다', (t) => {
  const { map, contexts, calls } = fixture(t);
  map.selectContext(contexts[0].mapRecordId, true);
  map.selectContext(contexts[1].mapRecordId, true);
  map.selectContext(contexts[1].mapRecordId, true);
  assert.equal(selectedMarkers(map).length, 1);
  assert.equal(isSelected(contextMarker(map, 1)), true);
  assert.match(contextMarker(map).icon.content, /aria-pressed="false"/);
  assert.deepEqual(calls, ['context:a', 'context:s', 'context:s']);
});

test('최대 확대의 같은 위치 후보 묶음 선택도 이전 context를 해제하고 이후 높이를 복원한다', (t) => {
  const { map, candidate, contexts, calls } = fixture(t, { cluster: true, zoom: 18 });
  map.setCandidateRecords([candidate, { ...candidate, catalogId: 'c2', name: '검증 후보 2' }]);
  map.selectContext(contexts[0].mapRecordId, true);
  const group = candidateMarker(map);
  group.click();
  assert.equal(map.selectedId, candidate.catalogId);
  assert.equal(isSelected(contextMarker(map)), false);
  assert.equal(group.zIndex, 180);
  map.selectContext(contexts[1].mapRecordId, true);
  assert.equal(group.zIndex, 80);
  assert.match(group.icon.content, /recommendation-cluster-marker/);
  assert.deepEqual(calls, ['context:a', 'candidate:c', 'context:s']);
});

test('검색 초기화와 선택 context 제거는 남은 강조와 열린 정보창도 해제한다', (t) => {
  const { map, contexts } = fixture(t);
  map.selectContext(contexts[0].mapRecordId, true);
  const apartment = contextMarker(map);
  map.clearCandidateMarkers();
  assert.equal(map.selectedId, null);
  assert.equal(isSelected(apartment), false);
  assert.equal(map.infoWindow.marker, null);
  map.selectContext(contexts[1].mapRecordId, true);
  map.clearContextRecords();
  assert.equal(map.selectedId, null);
  assert.equal(map.infoWindow.marker, null);
});

test('찾을 수 없는 context나 좌표 없는 후보를 열어도 현재 선택은 손상되지 않는다', (t) => {
  const { map, contexts, calls } = fixture(t);
  map.selectContext(contexts[0].mapRecordId, true);
  const apartment = contextMarker(map);
  map.selectContext('missing', true);
  map.focus('missing');
  assert.equal(map.focusCandidate({ catalogId: 'missing', lat: null, lng: null }), false);
  assert.equal(map.selectedId, contexts[0].mapRecordId);
  assert.equal(isSelected(apartment), true);
  assert.equal(map.infoWindow.marker, apartment);
  assert.deepEqual(calls, ['context:a']);
});
