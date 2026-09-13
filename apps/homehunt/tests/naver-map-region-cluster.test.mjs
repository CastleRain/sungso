import test from 'node:test';
import assert from 'node:assert/strict';
import { HomeMap } from '../js/naver-map.js';

function installMapStub(t) {
  const previous = { naver: globalThis.naver, window: globalThis.window };
  class Point { constructor(x, y) { this.x = x; this.y = y; } }
  class LatLng { constructor(lat, lng) { this.lat = lat; this.lng = lng; } }
  class LatLngBounds {
    points = [];
    extend(point) { this.points.push(point); }
  }
  class Marker {
    constructor(options) { this.options = options; this.map = options.map; }
    setMap(map) { this.map = map; }
  }
  class MapStub {
    constructor(container, options) { this.zoom = options.zoom; }
    getZoom() { return this.zoom; }
    fitBounds(bounds, padding) { this.lastFit = { bounds, padding }; }
    morph(point, zoom) { this.lastMorph = { point, zoom }; }
  }
  globalThis.naver = { maps: {
    Point, LatLng, LatLngBounds, Marker, Map: MapStub, InfoWindow: class {},
    Position: {}, Event: { addListener(target, name, callback) {
      target.listeners ||= {};
      target.listeners[name] = callback;
    } },
  } };
  globalThis.window = { naver: globalThis.naver };
  t.after(() => {
    if (previous.naver === undefined) delete globalThis.naver;
    else globalThis.naver = previous.naver;
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
  });
  return MapStub;
}

function region(key, lng, count = 10, changes = {}) {
  return { key, label: `경기도 검증 ${key}`, lat: 37.5, lng, count, ...changes };
}

function makeMap(t, zoom = 12) {
  const MapStub = installMapStub(t);
  const map = new HomeMap('test-client');
  map.map = new MapStub(null, { zoom });
  return map;
}

test('지역 합계는 낮은 줌에서 묶이고 확대하면 분리되며 후보 클러스터와 섞이지 않는다', (t) => {
  const map = makeMap(t);
  map.candidateRecords = [{ catalogId: 'candidate', lat: 37.5, lng: 127 }];
  map.candidateMarkers = [{ marker: { setMap() { assert.fail('candidate layer must remain untouched'); } } }];
  map.setRegionRecords([region('b', 127.04, 30), region('a', 127, 20), region('c', 128, 5)]);
  assert.equal(map.regionGroups().length, 2);
  const merged = map.regionGroups().find(group => group.records.length === 2);
  assert.equal(merged.count, 50);
  assert.equal(merged.key, 'a,b');
  assert.equal(map.regionGroups().reduce((sum, group) => sum + group.count, 0), 55);
  const oldMarkers = [...map.regionMarkers];
  map.map.zoom = 13;
  map.renderRegionClusters();
  assert.equal(map.regionGroups().length, 3);
  assert.equal(map.regionMarkers.length, 3);
  assert.ok(oldMarkers.every(marker => marker.map === null));
  assert.equal(map.candidateRecords.length, 1);
});

test('격자 경계의 가까운 지역도 묶이며 입력 순서와 무관하고 남은 마커는 겹치지 않는다', (t) => {
  const map = makeMap(t);
  const input = [region('a', 126.99999), region('b', 127.00001), region('c', 127.031), region('d', 127.062)];
  map.setRegionRecords(input);
  const first = map.regionGroups();
  assert.ok(first.some(group => group.records.some(record => record.key === 'a') && group.records.some(record => record.key === 'b')));
  map.setRegionRecords([...input].reverse());
  assert.deepEqual(map.regionGroups(), first);
  for (let left = 0; left < first.length; left += 1) {
    for (let right = left + 1; right < first.length; right += 1) {
      assert.ok(Math.abs(first[left].x - first[right].x) >= 132 || Math.abs(first[left].y - first[right].y) >= 44);
    }
  }
});

test('그룹 마커는 큰 지역명과 전체 후보 합계, 모든 지역 설명을 제공한다', (t) => {
  const map = makeMap(t);
  map.setRegionRecords([region('a', 127, 20), region('b', 127.01, 50, { label: '경기도 <큰지역>' })]);
  const { content } = map.regionMarkers[0].options.icon;
  assert.ok(content.includes('data-region-group="a,b"'));
  assert.ok(!content.includes('data-region-key='));
  assert.ok(content.includes('<strong>&lt;큰지역&gt; 외 1지역</strong><b>70</b><small>지역 대표 위치</small>'));
  assert.ok(content.includes('검증 a 20곳, &lt;큰지역&gt; 50곳'));
  assert.ok(content.includes('해당 지역 범위로 확대'));
  assert.ok(!content.includes('<큰지역>'));
});

test('여러 지역 클릭은 정확한 묶음 범위로 확대하고 단일 지역 클릭만 필터를 선택한다', (t) => {
  const map = makeMap(t);
  const selected = [];
  map.setRegionRecords([region('a', 127), region('b', 127.01), region('c', 128)], record => selected.push(record));
  const group = map.regionMarkers.find(marker => marker.options.icon.content.includes('data-region-group'));
  group.listeners.click();
  assert.equal(selected.length, 0);
  assert.deepEqual(map.map.lastFit.bounds.points.map(point => point.lng), [127, 127.01]);
  assert.ok(map.map.lastFit.padding.left > 0);
  const single = map.regionMarkers.find(marker => marker.options.icon.content.includes('data-region-key="c"'));
  single.listeners.click();
  assert.deepEqual(selected.map(record => record.key), ['c']);
  assert.equal(map.focusRegionGroup(' a, b, a '), true);
  assert.equal(selected.length, 1);
  assert.equal(map.focusRegionGroup(['missing']), false);
});

test('같은 좌표의 여러 지역은 개수 합계를 유지하고 최대 줌을 넘기거나 단일 지역으로 오인하지 않는다', (t) => {
  const map = makeMap(t, 20);
  map.setRegionRecords([region('a', 127, 2), region('b', 127, 3)], () => assert.fail('not a single region'));
  assert.equal(map.regionGroups().length, 1);
  assert.equal(map.regionGroups()[0].count, 5);
  assert.equal(map.focusRegionGroup(['a', 'b']), true);
  assert.equal(map.map.lastMorph.zoom, 21);
  assert.equal(map.map.lastFit, undefined);
});

test('지역 입력 검증, 갱신된 선택 콜백, 라벨 갱신과 비우기를 보존한다', (t) => {
  const map = makeMap(t);
  const selected = [];
  const good = region('a', 127);
  map.setRegionRecords([good, good, region('bad', null), region('zero', 127, 0), region('fraction', 127, 1.5)]);
  assert.equal(map.regionRecords.length, 1);
  assert.equal(map.regionGroups()[0].count, 10);
  const originalMarker = map.regionMarkers[0];
  map.setRegionRecords([good], record => selected.push(record.key));
  assert.equal(map.regionMarkers[0], originalMarker);
  originalMarker.listeners.click();
  assert.deepEqual(selected, ['a']);
  map.setRegionRecords([{ ...good, label: '새 이름' }]);
  assert.ok(map.regionMarkers[0].options.icon.content.includes('<strong>새 이름</strong>'));
  const lastMarker = map.regionMarkers[0];
  map.setRegionRecords([]);
  assert.equal(lastMarker.map, null);
  assert.deepEqual(map.regionMarkers, []);
  assert.deepEqual(map.regionGroups(), []);
});

test('지도 준비 전 지역도 보존하고 zoom_changed와 idle에서 후보 클러스터 설정과 무관하게 갱신한다', async (t) => {
  installMapStub(t);
  const map = new HomeMap('test-client');
  map.setRegionRecords([region('a', 127), region('b', 127.015)]);
  assert.equal(map.regionRecords.length, 2);
  assert.equal(map.regionMarkers.length, 0);
  await map.init(null, { cluster: false });
  assert.equal(map.regionMarkers.length, 1);
  map.renderCandidateClusters = () => assert.fail('candidate clusters are disabled');
  map.map.zoom = 15;
  map.map.listeners.zoom_changed();
  assert.equal(map.regionMarkers.length, 2);
  const sameZoomMarkers = [...map.regionMarkers];
  map.map.listeners.idle();
  assert.deepEqual(map.regionMarkers, sameZoomMarkers);
  map.map.zoom = 12;
  map.map.listeners.idle();
  assert.equal(map.regionMarkers.length, 1);
});
