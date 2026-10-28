import test from 'node:test';
import assert from 'node:assert/strict';
import { createJourneyMap, journeySceneData, journeySceneFrame } from '../js/map.mjs';

const date = '2025-04-27', start = Date.parse(`${date}T10:00:00+09:00`);
const point = (minute, lat = 37.5, lng = 127) => ({ lat, lng, time: start + minute * 60000 });
const scene = (extra = {}) => ({ id: 'scene-a', date, person: 'sungwoo', title: '공원', time: null, endTime: null, position: { lat: 37.5, lng: 127 }, recordIds: ['record-a'], trackIds: [], records: [], segments: [], ...extra });
const textOf = element => [element.textContent || '', ...(element.children || []).map(textOf)].join(' ');

function fixture(t, { reject = false } = {}) {
  const keys = ['document', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'navermap_authFailure'];
  const originals = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  let adapter;
  t.after(() => { adapter?.destroy(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const element = () => ({ style: {}, dataset: {}, children: [], clientWidth: 600, clientHeight: 500, setAttribute() {}, replaceChildren(...values) { this.children = values; }, append(...values) { this.children.push(...values); } });
  globalThis.document = { createElement: element, addEventListener() {}, removeEventListener() {} };
  globalThis.ResizeObserver = undefined; globalThis.navermap_authFailure = undefined;
  const callbacks = new Map(), markers = [], lines = [], labels = [], listeners = [], instances = [];
  let frame = 0;
  globalThis.requestAnimationFrame = callback => { callbacks.set(++frame, callback); return frame; };
  globalThis.cancelAnimationFrame = id => callbacks.delete(id);
  const api = {
    LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } },
    Point: class {}, Size: class { constructor(width, height) { this.width = width; this.height = height; } }, SymbolPath: { CIRCLE: 3 },
    LatLngBounds: class {
      constructor() { this.south = Infinity; this.north = -Infinity; this.west = Infinity; this.east = -Infinity; }
      extend(p) { this.south = Math.min(this.south, p.lat); this.north = Math.max(this.north, p.lat); this.west = Math.min(this.west, p.lng); this.east = Math.max(this.east, p.lng); }
      hasLatLng(p) { return p.lat >= this.south - .1 && p.lat <= this.north + .1 && p.lng >= this.west - .1 && p.lng <= this.east + .1; }
    },
    Map: class {
      constructor() { this.center = new api.LatLng(37.5, 127); this.zoom = 12; this.fits = 0; this.bounds = new api.LatLngBounds(); instances.push(this); }
      getCenter() { return this.center; } getZoom() { return this.zoom; } getBounds() { return this.bounds; }
      setSize(size) { this.size = size; this.zoom = 3; }
      setCenter(value) { this.center = value; this.bounds = new api.LatLngBounds(); this.bounds.extend(value); }
      setZoom(value) { this.zoom = value; }
      fitBounds(bounds) { this.bounds = bounds; this.fits++; this.center = new api.LatLng((bounds.north + bounds.south) / 2, (bounds.east + bounds.west) / 2); }
      setOptions(options) { this.options = options; } destroy() { this.destroyed = true; }
    },
    Polyline: class { constructor(options) { Object.assign(this, options); this.options = options; lines.push(this); } setMap(value) { this.map = value; } setPath(value) { this.path = value; } setOptions(value) { Object.assign(this.options, value); } },
    Marker: class { constructor(options) { Object.assign(this, options); markers.push(this); } setMap(value) { this.map = value; } setPosition(value) { this.position = value; } setIcon(value) { this.icon = value; } setTitle(value) { this.title = value; } },
    InfoWindow: class {
      constructor(options) { this.options = options; this.opens = 0; this.visible = false; labels.push(this); }
      open(map, anchor) { assert.ok(anchor instanceof api.LatLng); this.visible = true; this.opens++; this.position = anchor; }
      close() { this.visible = false; } setPosition(value) { this.position = value; } setContent(value) { this.options.content = value; }
    },
    Event: { addListener(target, type, callback) { const value = { target, type, callback }; listeners.push(value); return value; }, removeListener(value) { value.removed = true; } },
  };
  const host = element(), selections = [], statuses = [];
  adapter = createJourneyMap({ element: host, onSelect: (...args) => selections.push(args), onStatus: status => statuses.push(status), sdkLoader: () => reject ? Promise.reject(Error('offline')) : api });
  return { api, host, adapter, markers, lines, labels, listeners, selections, statuses, instances, callbacks };
}

test('place-only scenes are static evidence without invented timestamps or routes', () => {
  const source = scene({ person: 'together' }), before = structuredClone(source);
  const state = journeySceneFrame(source, .5);
  assert.equal(state.time, null); assert.equal(state.paths.length, 0);
  assert.equal(state.heads.size, 1); assert.deepEqual(state.heads.get('together'), { lat: 37.5, lng: 127, time: null, recordedAt: null, state: 'recorded', current: true });
  assert.deepEqual(source, before);
});

test('scene geometry discards other dates and splits invalid or reversed points', () => {
  const source = scene({ segments: [{ id: 'track', person: 'sungwoo', points: [point(0), point(1, 37.51), point(0, 37.52), { lat: NaN, lng: 127, time: start }, point(2), { ...point(3), time: start + 86400000 }] }] });
  const before = structuredClone(source), data = journeySceneData(source);
  assert.deepEqual(data.segments.map(value => value.points.length), [2, 1, 1]);
  assert.equal(data.end, start + 120000);
  assert.ok(data.segments.every(value => value.points.every(p => p.time < start + 86400000)));
  assert.deepEqual(source, before);
});

test('gaps and a finished partner are historical points rather than simultaneous current positions', () => {
  const source = scene({ segments: [
    { id: 'a', person: 'sungwoo', points: [point(0), point(1, 37.51)] },
    { id: 'b', person: 'sungwoo', points: [point(4, 38), point(5, 38.01)] },
    { id: 'c', person: 'sohee', points: [point(2, 36), point(3, 36.01)] },
  ] });
  const middle = journeySceneFrame(source, .5);
  assert.equal(middle.heads.get('sungwoo').current, false); assert.equal(middle.heads.get('sungwoo').state, 'gap');
  assert.equal(middle.heads.get('sohee').current, true); assert.ok(Math.abs(middle.heads.get('sohee').lat - 36.005) < 1e-9);
  const later = journeySceneFrame(source, .9);
  assert.equal(later.heads.get('sungwoo').current, true); assert.equal(later.heads.get('sohee').current, false);
  assert.deepEqual(later.paths.map(value => value.length), [2, 2, 2]);
  assert.equal(later.paths[1][0].lat, 38);
});

test('merged scenes share the full real-time window and reveal record points only when reached', () => {
  const source = scene({ person: 'multiple', people: ['sungwoo', 'sohee'], time: start - 60000, startTime: start - 60000, endTime: start + 5 * 60000, records: [
    { id: 'early', person: 'sungwoo', title: '출발 전', time: start - 60000, position: { lat: 37.49, lng: 127 } },
    { id: 'later', person: 'sohee', title: '책방', time: start + 2 * 60000, position: { lat: 37.51, lng: 127.1 } },
  ], segments: [{ id: 'path', person: 'sungwoo', points: [point(0), point(5, 37.6)] }] });
  const initial = journeySceneFrame(source, 0);
  assert.equal(initial.time, start - 60000); assert.deepEqual(initial.reached.map(record => record.id), ['early']);
  assert.equal(initial.heads.get('sungwoo').lat, 37.49); assert.equal(initial.heads.get('sungwoo').current, true); assert.equal(initial.heads.has('sohee'), false);
  const reached = journeySceneFrame(source, .5);
  assert.equal(reached.time, start + 2 * 60000); assert.equal(reached.heads.get('sohee').current, true); assert.equal(reached.heads.get('sohee').lat, 37.51);
  assert.equal(reached.heads.get('sungwoo').current, true); assert.equal(reached.heads.has('together'), false);
  const after = journeySceneFrame(source, .75);
  assert.equal(after.heads.get('sohee').current, false); assert.equal(after.heads.get('sohee').lat, 37.51);
  assert.equal(after.heads.get('sungwoo').current, true); assert.equal(after.paths.length, 1);
  assert.deepEqual(journeySceneFrame(source, .25).reached.map(record => record.id), ['early']);
});

test('simultaneous point-only people retain both original positions without a connecting route', () => {
  const source = scene({ person: 'multiple', time: start, endTime: start, records: [
    { id: 'sungwoo', person: 'sungwoo', title: '성우 장소', time: start, position: { lat: 37.5, lng: 127 } },
    { id: 'sohee', person: 'sohee', title: '소희 장소', time: start, position: { lat: 35.1, lng: 129 } },
  ] });
  const frame = journeySceneFrame(source, .5);
  assert.equal(frame.time, start); assert.equal(frame.paths.length, 0);
  assert.deepEqual([...frame.heads.keys()], ['sungwoo', 'sohee']);
  assert.equal(frame.heads.get('sungwoo').lat, 37.5); assert.equal(frame.heads.get('sohee').lat, 35.1);
  assert.ok([...frame.heads.values()].every(head => head.current));
});

test('timed markers reverse cleanly on seek and merged history retains original people colors', async t => {
  const f = fixture(t), source = scene({ person: 'multiple', time: start, endTime: start + 2 * 60000, records: [
    { id: 'later', person: 'sohee', title: '책방', time: start + 60000, position: { lat: 37.52, lng: 127.1 } },
  ], segments: [{ id: 'path', person: 'sungwoo', points: [point(0), point(2, 37.6)] }] });
  f.adapter.renderScene(source, { progress: .25 }); await f.adapter.ready;
  const photoDot = f.markers.find(marker => marker.title.includes('책방'));
  assert.equal(photoDot.map, null);
  f.adapter.renderScene(source, { progress: .75 });
  assert.ok(photoDot.map); assert.equal(photoDot.icon.fillOpacity, .22);
  assert.equal(f.labels.filter(label => label.visible).length, 1);
  f.adapter.renderScene(source, { progress: .25 }); assert.equal(photoDot.map, null);
  assert.equal(f.markers.filter(marker => marker.map && marker.title.includes('소희')).length, 0);
  const past = scene({ id: 'past', date: '2024-01-01', person: 'multiple', members: [
    { person: 'sungwoo', position: { lat: 37, lng: 127 } }, { person: 'sohee', position: { lat: 35, lng: 129 } },
  ] });
  f.adapter.renderScene(scene({ id: 'new' }), { history: [past] });
  const history = f.markers.filter(marker => marker.map && marker.title.includes('2024-01-01'));
  assert.equal(history.length, 2); assert.equal(new Set(history.map(marker => marker.icon.fillColor)).size, 2);
  assert.ok(history.every(marker => !marker.title.includes('함께')));
});

test('external scene frames reuse overlays, show only current labels and never start a clock', async t => {
  const f = fixture(t), source = scene({ time: start, endTime: start + 60000, segments: [{ id: 'a', person: 'sungwoo', points: [point(0), point(1, 37.51)] }] });
  const history = [scene({ id: 'old', date: '2024-01-01', person: 'sohee', title: '지난 장소', position: { lat: 37.4, lng: 126.9 } }), scene({ id: 'future', date: '2026-01-01', position: { lat: 38, lng: 128 } })];
  f.adapter.renderScene(source, { progress: .25, history }); assert.equal(await f.adapter.ready, true);
  assert.equal(f.callbacks.size, 0); assert.equal(f.adapter.getPlayback().available, false);
  assert.equal(f.markers.filter(value => value.map).length, 2); assert.equal(f.labels.length, 1);
  assert.match(textOf(f.labels[0].options.content), /공원.*2025\.04\.27.*성우/);
  assert.doesNotMatch(textOf(f.labels[0].options.content), /사진|GPS|원본|경로 기록점/);
  const counts = [f.markers.length, f.labels.length, f.lines.length], fits = f.instances[0].fits;
  f.adapter.renderScene(source, { progress: .75, history });
  assert.deepEqual([f.markers.length, f.labels.length, f.lines.length], counts); assert.equal(f.labels[0].opens, 1);
  assert.equal(f.markers.at(-1).position.lat, 37.5075); assert.equal(f.instances[0].fits, fits); assert.equal(f.callbacks.size, 0);
  const select = f.listeners.find(value => value.target === f.markers.at(-1) && value.type === 'click'); select.callback();
  assert.deepEqual(f.selections[0], ['record-a', { sceneId: 'scene-a' }]);
  f.adapter.setPicking(true); select.callback(); assert.equal(f.selections.length, 1);
  f.adapter.setPicking(false);
  f.adapter.renderScene(null);
  assert.ok(f.markers.every(value => !value.map)); assert.ok(f.labels.every(value => !value.visible));
});

test('date transitions replace current people and never connect earlier places', async t => {
  const f = fixture(t), first = scene(), second = scene({ id: 'scene-b', date: '2025-08-01', person: 'sohee', title: '바다', position: { lat: 35.1, lng: 129 } });
  f.adapter.renderScene(first); await f.adapter.ready;
  const oldMarker = f.markers.at(-1);
  f.adapter.renderScene(second, { progress: .4, history: [first] });
  assert.equal(oldMarker.map, null); assert.equal(f.lines.length, 0);
  const current = f.markers.filter(value => value.map && value.icon.fillOpacity === 1);
  assert.equal(current.length, 1); assert.match(current[0].title, /소희.*바다/); assert.equal(current[0].position.lat, 35.1);
  assert.equal(f.labels.filter(value => value.visible).length, 1);
});

test('regional camera stays stable, full-period fit is retained and resize uses outer dimensions', async t => {
  const f = fixture(t), first = scene({ segments: [{ id: 'a', person: 'sungwoo', points: [point(0), point(1, 37.51)] }] });
  f.adapter.renderScene(first); await f.adapter.ready;
  const map = f.instances[0], fitted = map.fits;
  const nearby = scene({ id: 'nearby', date: '2025-05-01', position: { lat: 37.52, lng: 127.02 } });
  f.adapter.renderScene(nearby, { history: [first] }); assert.equal(map.fits, fitted);
  const far = scene({ id: 'far', date: '2025-08-01', position: { lat: 35.1, lng: 129 } });
  f.adapter.showAllScenes([first, nearby, far]); assert.equal(map.fits, fitted + 1);
  const center = map.center, zoom = map.zoom;
  f.adapter.renderScene(far, { history: [first, nearby] }); assert.equal(map.fits, fitted + 1); assert.equal(map.center, center);
  f.host.clientWidth = 1000; f.host.clientHeight = 700; f.adapter.resize();
  assert.equal(map.size.width, 1000); assert.equal(map.size.height, 700); assert.equal(map.center, center); assert.equal(map.zoom, zoom);
  f.adapter.fitCurrentScene(); assert.equal(map.center.lat, 35.1); assert.equal(map.zoom, 14);
});

test('switching from a playing day cancels the daily clock and an unavailable SDK remains safe', async t => {
  const f = fixture(t), source = scene({ segments: [{ id: 'a', person: 'sungwoo', points: [point(0), point(1, 37.51)] }] });
  f.adapter.render({ date, records: [], tracks: source.segments }); await f.adapter.ready;
  assert.equal(f.adapter.play(), true); assert.equal(f.callbacks.size, 1);
  f.adapter.renderScene(source, { progress: .2 }); assert.equal(f.callbacks.size, 0); assert.equal(f.adapter.getPlayback().playing, false);
  globalThis.navermap_authFailure();
  assert.doesNotThrow(() => { f.adapter.renderScene(source, { progress: .7 }); f.adapter.showAllScenes([source]); f.adapter.fitCurrentScene(); f.adapter.resize(); f.adapter.setPicking(true); });
  assert.equal(f.statuses.at(-1).ready, false);
});

test('scene selected before an SDK rejection remains a harmless fallback', async t => {
  const f = fixture(t, { reject: true });
  f.adapter.renderScene(scene()); assert.equal(await f.adapter.ready, false);
  assert.equal(f.adapter.renderScene(scene({ id: 'b' })), false); assert.equal(f.callbacks.size, 0);
});
