import test from 'node:test';
import assert from 'node:assert/strict';
import { createJourneyMap, prepareJourneyWorld, journeyMotionFrame, journeyWorldBounds, unwrapJourneyCoordinates, prepareJourneyFocus, JOURNEY_KOREA_FRAME } from '../js/world-map.mjs';
import { KOREA_FOCUS } from '../js/korea-focus.mjs';

const start = Date.parse('2026-01-10T10:00:00+09:00');
const p = (minute, lat = 37, lng = 127) => ({ time: start + minute * 60000, lat, lng });
const s = (id, person, points) => ({ id, person, points });
const day = (segments, extra = {}) => ({ id: 'day', date: '2026-01-10', records: [], segments, ...extra });
const state = (time, extra = {}) => ({ index: 0, time, progress: .5, ...extra });

test('world coordinates interpolate across the date line in the short direction', () => {
  const plan = prepareJourneyWorld([day([s('flight', 'sungwoo', [p(0, 35, 179), p(10, 36, -179)])])]);
  const frame = journeyMotionFrame(plan, state(start + 300000));
  assert.equal(frame.current.features.length, 1);
  assert.deepEqual(frame.current.features[0].geometry.coordinates, [[179, 35], [180, 35.5]]);
  assert.ok(Math.abs(frame.heads.features[0].geometry.coordinates[0]) === 180);
  const bounds = journeyWorldBounds([p(0, 35, 179), p(10, 36, -179)], 180);
  assert.deepEqual(bounds, [[179, 35], [181, 36]]);
  assert.deepEqual(unwrapJourneyCoordinates([p(0, 35, -179), p(1, 35, 179)]), [[-179, 35], [-181, 35]]);
});

test('no future path is shown and recorded gaps never acquire a connector', () => {
  const plan = prepareJourneyWorld([day([s('a', 'sungwoo', [p(0), p(1, 38)]), s('b', 'sungwoo', [p(5, 40), p(6, 41)])])]);
  const frame = journeyMotionFrame(plan, state(start + 180000));
  assert.equal(frame.completed.features.length, 1); assert.equal(frame.current.features.length, 0); assert.equal(frame.tails.features.length, 0);
  assert.equal(frame.heads.features[0].properties.current, false); assert.equal(frame.heads.features[0].geometry.coordinates[1], 38);
  const later = journeyMotionFrame(plan, state(start + 330000));
  assert.equal(later.completed.features.length, 1); assert.equal(later.current.features.length, 1);
  assert.deepEqual(later.current.features[0].geometry.coordinates[0], [127, 40]);
  assert.equal(later.heads.features[0].properties.current, true);
});

test('bright tail remains visible through a slow dateline leg of an overseas route', () => {
  const plan = prepareJourneyWorld([day([s('flight', 'sungwoo', [p(0, 35.68, 139.76), p(60, 32, 165), p(120, 28, 179), p(180, 27, -179), p(240, 21.31, -157.86)])])]);
  const frame = journeyMotionFrame(plan, state(start + 172 * 60000));
  assert.equal(frame.tails.features.length, 1);
  const coords = frame.tails.features[0].geometry.coordinates;
  assert.ok(coords.at(-1)[0] - coords[0][0] > 3, 'tail extends beyond the tiny current leg while remaining in the reached track');
  assert.deepEqual(coords.at(-1), frame.current.features[0].geometry.coordinates.at(-1));
});

test('all prior daily tracks accumulate while another person is not fabricated as current', () => {
  const first = day([s('a', 'sungwoo', [p(0), p(1, 38)])]);
  const second = day([s('b', 'sohee', [p(0, 35), p(10, 36)].map(point => ({ ...point, time: point.time + 86400000 })))], { date: '2026-01-11' });
  const frame = journeyMotionFrame(prepareJourneyWorld([first, second]), state(start + 86400000 + 300000, { index: 1 }));
  assert.equal(frame.completed.features.length, 1); assert.equal(frame.current.features.length, 1);
  const heads = Object.fromEntries(frame.heads.features.map(f => [f.properties.person, f.properties.current]));
  assert.deepEqual(heads, { sungwoo: false, sohee: true });
  assert.ok(!frame.heads.features.some(f => f.properties.person === 'together'));
});

test('date-only photos are visible evidence with no invented clock or moving route', () => {
  const input = day([], { records: [{ id: 'photo', person: 'together', time: null, title: '우리 기억', position: { lat: 48.85, lng: 2.35 } }] });
  const before = structuredClone(input), frame = journeyMotionFrame(prepareJourneyWorld([input]), state(null));
  assert.equal(frame.records.features.length, 1); assert.equal(frame.completed.features.length, 0); assert.equal(frame.current.features.length, 0);
  assert.equal(frame.heads.features[0].properties.current, false); assert.deepEqual(input, before);
});

test('invalid, reversed and cross-day points split routes instead of connecting them', () => {
  const plan = prepareJourneyWorld([day([s('a', 'sungwoo', [p(0), p(1), { ...p(2), lat: NaN }, p(3), p(2), { ...p(4), time: start + 86400000 }, p(5)])])]);
  assert.deepEqual(plan.days[0].segments.map(value => value.points.length), [2, 1, 1, 1]);
  assert.equal(plan.days[0].segments.filter(value => value.line).length, 1);
});

test('completion shows every independent path but no future photo is exposed early', () => {
  const input = day([s('a', 'sungwoo', [p(0), p(1)]), s('b', 'sohee', [p(2), p(3)])], { records: [{ id: 'late', person: 'sohee', time: start + 240000, position: { lat: 36, lng: 129 } }] });
  const plan = prepareJourneyWorld([input]);
  assert.equal(journeyMotionFrame(plan, state(start)).records.features.length, 0);
  const frame = journeyMotionFrame(plan, state(start + 240000, { progress: 1 }));
  assert.equal(frame.completed.features.length, 2); assert.equal(frame.records.features.length, 1);
  assert.ok(frame.heads.features.every(value => !value.properties.current));
});

test('single-point tracks appear only when reached and remain after the same person moves onward', () => {
  const input = day([s('point', 'sungwoo', [p(5, 37)]), s('route', 'sungwoo', [p(10, 38), p(20, 39)])]), before = structuredClone(input), plan = prepareJourneyWorld([input]);
  const early = journeyMotionFrame(plan, state(start + 4 * 60000));
  assert.equal(early.records.features.length, 0); assert.equal(early.heads.features.length, 0);
  const arrived = journeyMotionFrame(plan, state(start + 5 * 60000));
  assert.equal(arrived.records.features.length, 1); assert.equal(arrived.records.features[0].properties.trackPoint, true);
  assert.notEqual(arrived.signature, early.signature, 'a newly reached single-point track invalidates the static point source');
  const later = journeyMotionFrame(plan, state(start + 15 * 60000));
  assert.deepEqual(later.records.features[0].geometry.coordinates, [127, 37]);
  assert.deepEqual(later.heads.features[0].geometry.coordinates, [127, 38.5]); assert.equal(later.heads.features[0].properties.current, true);
  const complete = journeyMotionFrame(plan, state(start + 20 * 60000, { progress: 1 }));
  assert.equal(complete.records.features.length, 1); assert.equal(complete.completed.features.length, 1); assert.equal(complete.heads.features[0].properties.current, false);
  const rewind = journeyMotionFrame(plan, state(start + 4 * 60000)); assert.equal(rewind.records.features.length, 0);
  assert.deepEqual(input, before);
});

test('past single-point tracks persist across dates without making the other person current', () => {
  const first = day([s('point', 'sungwoo', [p(5, 37)])]);
  const second = day([s('route', 'sohee', [p(0, 35), p(10, 36)].map(point => ({ ...point, time: point.time + 86400000 })))], { date: '2026-01-11' });
  const plan = prepareJourneyWorld([first, second]), frame = journeyMotionFrame(plan, state(start + 86400000 + 5 * 60000, { index: 1 }));
  assert.equal(frame.records.features.length, 1); assert.deepEqual(frame.records.features[0].geometry.coordinates, [127, 37]);
  assert.equal(frame.current.features.length, 1); assert.equal(frame.completed.features.length, 0);
  assert.deepEqual(Object.fromEntries(frame.heads.features.map(f => [f.properties.person, f.properties.current])), { sungwoo: false, sohee: true });
  const end = journeyMotionFrame(plan, state(start + 86400000 + 10 * 60000, { index: 1, progress: 1 }));
  assert.equal(end.records.features.length, 1); assert.equal(end.completed.features.length, 1);
});

function fixture(t, { reject = false, styleLayers = [], focus, focusFault = '' } = {}) {
  const previousObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
  globalThis.ResizeObserver = undefined;
  const element = () => ({ children: [], style: {}, dataset: {}, clientWidth: 900, clientHeight: 700, setAttribute() {}, replaceChildren(...items) { this.children = items; }, getBoundingClientRect() { return { width: this.clientWidth, height: this.clientHeight }; } });
  const document = { createElement: element }, host = element(); host.ownerDocument = document;
  const instances = [], statuses = [], cameras = [], picks = [], selections = [];
  const api = {
    Map: class {
      constructor() { this.listeners = new Map(); this.sources = new Map(); this.layers = structuredClone(styleLayers); this.visibilityChanges = []; this.paintChanges = []; this.controls = []; this.fits = []; this.center = { lng: 127, lat: 37 }; this.canvas = { style: {} }; this.scrollZoom = { disable() {} }; instances.push(this); }
      on(name, handler) { const handlers = this.listeners.get(name) || []; handlers.push(handler); this.listeners.set(name, handlers); }
      fire(name, data) { for (const handler of this.listeners.get(name) || []) handler(data); }
      addControl(control, location) { this.controls.push({ control, location }); }
      addSource(name, source) { if (focusFault === 'source' && name === 'journey-korea-focus') throw Error('focus unavailable'); this.sources.set(name, { data: source.data, writes: 0, setData(value) { this.data = value; this.writes++; } }); }
      addLayer(value) { this.layers.push(value); }
      getStyle() { return { layers: this.layers }; }
      getPaintProperty(id, property) { return id === 'water' && property === 'fill-color' ? '#dde9ef' : this.layers.find(item => item.id === id)?.paint?.[property]; }
      setPaintProperty(id, property, value) { if (focusFault === 'paint' && id === 'journey-korea-focus') throw Error('focus paint unavailable'); const layer = this.layers.find(item => item.id === id); if (!layer) throw Error('unknown layer'); layer.paint = { ...(layer.paint || {}), [property]: value }; this.paintChanges.push({ id, property, value }); }
      removeLayer(id) { this.layers = this.layers.filter(layer => layer.id !== id); }
      setLayoutProperty(id, property, value) { const layer = this.layers.find(item => item.id === id); if (!layer) throw Error('unknown layer'); layer.layout = { ...(layer.layout || {}), [property]: value }; this.visibilityChanges.push({ id, property, value }); }
      getSource(name) { return this.sources.get(name); }
      getCenter() { return this.center; }
      fitBounds(bounds, options) { this.fits.push({ bounds, options }); this.center = { lng: (bounds[0][0] + bounds[1][0]) / 2, lat: (bounds[0][1] + bounds[1][1]) / 2 }; }
      getCanvas() { return this.canvas; }
      resize() { this.resized = (this.resized || 0) + 1; }
      queryRenderedFeatures() { return this.selected ? [this.selected] : []; }
      remove() { this.removed = true; }
    }, NavigationControl: class {}, AttributionControl: class {},
  };
  const adapter = createJourneyMap({ element: host, focus, sdkLoader: () => reject ? Promise.reject(Error('offline')) : api, onStatus: x => statuses.push(x), onCameraChange: x => cameras.push(x), onPick: x => picks.push(x), onSelect: x => selections.push(x) });
  t.after(() => { adapter.destroy(); if (previousObserver) Object.defineProperty(globalThis, 'ResizeObserver', previousObserver); else delete globalThis.ResizeObserver; });
  async function ready() { await Promise.resolve(); await Promise.resolve(); instances[0]?.fire('load'); return adapter.ready; }
  return { host, adapter, instances, statuses, cameras, picks, selections, ready };
}

test('world adapter loads once, reuses completed geometry, seeks backward, and clears on dispose', async t => {
  const f = fixture(t), scenes = [day([s('a', 'sungwoo', [p(0), p(10, 38)])])];
  f.adapter.renderMotion(scenes, state(start + 120000));
  assert.equal(await f.ready(), true); const map = f.instances[0];
  assert.equal(map.controls.length, 2); assert.equal(map.controls[0].location, 'top-right');
  const source = map.getSource('journey-history'), writes = source.writes;
  f.adapter.renderMotion(scenes, state(start + 180000));
  assert.equal(source.writes, writes, 'unchanged historical geometry is not cloned to the SDK every frame');
  f.adapter.renderMotion(scenes, state(start + 600000, { progress: 1 }));
  assert.equal(source.data.features.length, 1); assert.ok(f.cameras.includes('all'));
  f.adapter.renderMotion(scenes, state(start, { progress: 0 }));
  assert.equal(source.data.features.length, 0); assert.ok(f.cameras.includes('follow'));
  f.adapter.destroy(); assert.equal(map.removed, true); assert.deepEqual(f.host.children, []);
});

test('manual camera survives frames until follow is explicitly selected; picking wraps longitude', async t => {
  const f = fixture(t); await f.ready(); const map = f.instances[0], scenes = [day([s('a', 'sungwoo', [p(0), p(10, 38)])])];
  f.adapter.renderMotion(scenes, state(start)); map.fire('movestart', { originalEvent: {} }); const fits = map.fits.length;
  f.adapter.renderMotion(scenes, state(start + 300000)); assert.equal(map.fits.length, fits); assert.equal(f.cameras.at(-1), 'manual');
  f.adapter.fitCurrentScene(); assert.equal(f.cameras.at(-1), 'follow'); assert.ok(map.fits.length > fits);
  f.adapter.setPicking(true); map.fire('click', { lngLat: { lat: 40, lng: 181 } }); assert.deepEqual(f.picks, [{ lat: 40, lng: -179 }]);
  assert.equal(map.canvas.style.cursor, 'crosshair'); f.adapter.setPicking(false); assert.equal(map.canvas.style.cursor, '');
});

test('day detail filters people and location click uses record identity without changing data', async t => {
  const f = fixture(t); await f.ready(); const map = f.instances[0], input = { date: '2026-01-10', records: [{ id: 'one', person: 'sohee', time: null, position: { lat: 48, lng: 2 } }], tracks: [s('a', 'sungwoo', [p(0), p(1)])] }, before = structuredClone(input);
  f.adapter.render(input, { person: 'sohee' }); assert.equal(map.getSource('journey-history').data.features.length, 0); assert.equal(map.getSource('journey-memories').data.features.length, 1);
  map.selected = { properties: { id: 'one' } }; map.fire('click', { point: { x: 1, y: 1 } }); assert.deepEqual(f.selections, ['one']); assert.deepEqual(input, before);
  f.adapter.resize(); const resized = map.resized; f.adapter.resize(); assert.equal(map.resized, resized); f.host.clientWidth = 400; f.adapter.resize(); assert.equal(map.resized, resized + 1);
});

test('aspect-ratio changes refit overview and follow without changing playback or manual camera', async t => {
  const f = fixture(t); await f.ready(); const map = f.instances[0];
  const scenes = [day([s('flight', 'sungwoo', [p(0, 35, 139), p(60, 28, 179), p(120, 21, -158), p(180, 37, -122)])])];
  const final = state(start + 180 * 60000, { progress: 1 });
  f.adapter.renderMotion(scenes, final); const overviewFits = map.fits.length, source = map.getSource('journey-history'), writes = source.writes;
  f.host.clientWidth = 390; f.adapter.resize();
  assert.equal(map.fits.length, overviewFits + 1); assert.equal(source.writes, writes); assert.equal(f.cameras.at(-1), 'all');
  assert.ok(map.fits.at(-1).bounds[1][0] - map.fits.at(-1).bounds[0][0] < 110, 'Pacific bounds stay on the short wrap');
  assert.equal(final.progress, 1); assert.equal(final.time, start + 180 * 60000);
  f.adapter.renderMotion(scenes, state(start + 60000, { progress: .1 })); const followFits = map.fits.length;
  f.host.clientHeight = 500; f.adapter.resize(); assert.equal(map.fits.length, followFits + 1);
  map.fire('movestart', { originalEvent: {} }); const manualFits = map.fits.length;
  f.host.clientWidth = 320; f.adapter.resize(); assert.equal(map.fits.length, manualFits);
  f.adapter.resize(); assert.equal(map.fits.length, manualFits, 'unchanged sizes do not cause a resize loop');
});

test('single-point arrival refreshes the SDK source, is counted separately, and stays in day detail', async t => {
  const f = fixture(t); await f.ready(); const map = f.instances[0], scenes = [day([s('point', 'sungwoo', [p(5, 37)]), s('route', 'sungwoo', [p(10, 38), p(20, 39)])])];
  f.adapter.renderMotion(scenes, state(start)); const source = map.getSource('journey-memories'), writes = source.writes;
  assert.equal(f.host.children[0].dataset.trackPointCount, '0');
  f.adapter.renderMotion(scenes, state(start + 5 * 60000));
  assert.equal(source.writes, writes + 1); assert.equal(source.data.features.length, 1); assert.equal(f.host.children[0].dataset.trackPointCount, '1'); assert.equal(f.host.children[0].dataset.routeCount, '0');
  f.adapter.renderMotion(scenes, state(start + 20 * 60000, { progress: 1 }));
  assert.equal(source.data.features.length, 1); assert.equal(f.host.children[0].dataset.trackPointCount, '1'); assert.equal(f.host.children[0].dataset.routeCount, '1');
  f.adapter.render({ date: scenes[0].date, records: [], tracks: scenes[0].segments }, { person: 'all' });
  assert.equal(source.data.features.length, 1); assert.equal(source.data.features[0].properties.trackPoint, true); assert.equal(f.host.children[0].dataset.trackPointCount, '1'); assert.equal(f.host.children[0].dataset.routeCount, '1'); assert.equal(f.host.children[0].dataset.currentHeads, '0');
});

const koreaBounds = [[JOURNEY_KOREA_FRAME[0].lng, JOURNEY_KOREA_FRAME[0].lat], [JOURNEY_KOREA_FRAME[1].lng, JOURNEY_KOREA_FRAME[1].lat]];
const assertKoreaBounds = bounds => bounds.forEach((corner, i) => corner.forEach((value, j) => assert.ok(Math.abs(value - koreaBounds[i][j]) < 1e-9, 'the complete Korea frame stays unchanged')));

test('fast playback holds the Korea frame across domestic routes and dates through completion', async t => {
  const f = fixture(t); await f.ready(); const map = f.instances[0];
  const scenes = [day([s('seoul-busan', 'sungwoo', [p(0, 37.56, 126.97), p(60, 35.18, 129.08)]), s('jeju', 'sohee', [p(0, 33.45, 126.54), p(60, 33.25, 126.56)])]), day([s('return', 'sungwoo', [p(0, 35.18, 129.08), p(60, 37.56, 126.97)].map(point => ({ ...point, time: point.time + 86400000 })))], { date: '2026-01-11' })];
  f.adapter.renderMotion(scenes, state(start, { mode: 'fast', progress: 0 }));
  assertKoreaBounds(map.fits.at(-1).bounds); assert.equal(map.fits.at(-1).options.maxZoom, 6.3);
  const initial = map.fits.length;
  for (const minute of [10, 20, 40, 60]) f.adapter.renderMotion(scenes, state(start + minute * 60000, { mode: 'fast', progress: minute / 200 }));
  f.adapter.renderMotion(scenes, state(start + 86400000 + 30 * 60000, { index: 1, mode: 'fast', progress: .8 }));
  assert.equal(map.fits.length, initial, 'no track or date change refits domestic fast playback');
  f.adapter.renderMotion(scenes, state(start + 86400000 + 60 * 60000, { index: 1, mode: 'fast', progress: 1 }));
  assertKoreaBounds(map.fits.at(-1).bounds); assert.equal(map.getSource('journey-history').data.features.length, 3);
});

test('fast camera expands only with reached overseas points, includes both people, and returns to Korea', async t => {
  const f = fixture(t); await f.ready(); const map = f.instances[0];
  const scenes = [day([s('out', 'sungwoo', [p(0, 37, 127), p(60, 35, 139), p(120, 30, 151)]), s('back', 'sungwoo', [p(180, 30, 151), p(240, 37, 127)]), s('korea', 'sohee', [p(0, 35, 129), p(240, 36, 128)])])];
  f.adapter.renderMotion(scenes, state(start, { mode: 'fast', progress: 0 })); assertKoreaBounds(map.fits.at(-1).bounds);
  f.adapter.renderMotion(scenes, state(start + 30 * 60000, { mode: 'fast', progress: .1 }));
  const expanded = map.fits.at(-1); assert.ok(expanded.bounds[1][0] > 133); assert.ok(expanded.bounds[1][0] < 139, 'future Japan and far-Pacific endpoints do not drive the camera');
  assert.ok(expanded.bounds[0][0] <= koreaBounds[0][0]); assert.ok(expanded.bounds[1][1] >= koreaBounds[1][1]); assert.equal(expanded.options.maxZoom, 6.3); assert.ok(expanded.options.duration > 0);
  assert.equal(map.getSource('journey-heads').data.features.filter(point => point.properties.current).length, 2);
  f.adapter.renderMotion(scenes, state(start + 120 * 60000, { mode: 'fast', progress: .5 })); assert.ok(map.fits.at(-1).bounds[1][0] >= 151);
  const duringGap = map.fits.length; f.adapter.renderMotion(scenes, state(start + 150 * 60000, { mode: 'fast', progress: .6 })); assert.equal(map.fits.length, duringGap, 'same-day last evidence keeps the regional camera across a gap');
  f.adapter.renderMotion(scenes, state(start + 240 * 60000, { mode: 'fast', progress: .95 })); assertKoreaBounds(map.fits.at(-1).bounds);
  assert.equal(map.getSource('journey-history').data.features.length, 3, 'camera return does not delete historical routes');
});

test('an old overseas photo does not pull a later domestic date away from Korea', async t => {
  const f = fixture(t); await f.ready(); const map = f.instances[0];
  const old = day([], { records: [{ id: 'old-photo', person: 'sohee', time: null, position: { lat: 48.85, lng: 2.35 } }] });
  const current = day([s('domestic', 'sungwoo', [p(0, 37, 127), p(60, 35, 129)].map(point => ({ ...point, time: point.time + 86400000 })))], { date: '2026-01-11' });
  const scenes = [old, current];
  f.adapter.renderMotion(scenes, state(null, { mode: 'fast', progress: .1 })); assert.ok(map.fits.at(-1).bounds[0][0] < 3);
  f.adapter.renderMotion(scenes, state(start + 86400000 + 30 * 60000, { index: 1, mode: 'fast', progress: .7 })); assertKoreaBounds(map.fits.at(-1).bounds);
  const heads = map.getSource('journey-heads').data.features; assert.equal(heads.find(point => point.properties.person === 'sohee').properties.current, false);
  assert.equal(map.getSource('journey-memories').data.features.length, 1, 'the photo remains evidence without controlling the current camera');
});

test('fast follow handles mode changes, resize, manual exploration, and explicit overview', async t => {
  const f = fixture(t); await f.ready(); const map = f.instances[0], scenes = [day([s('local', 'sungwoo', [p(0, 37.56, 126.97), p(30, 37.57, 127.01)])])];
  f.adapter.renderMotion(scenes, state(start + 10 * 60000, { mode: 'fast' })); const initial = map.fits.length;
  f.host.clientWidth = 390; f.adapter.resize(); assert.equal(map.fits.length, initial + 1); assertKoreaBounds(map.fits.at(-1).bounds); assert.equal(map.fits.at(-1).options.padding.top, 130);
  f.host.clientWidth = 320; f.host.clientHeight = 389; f.adapter.resize(); assert.equal(map.fits.length, initial + 2); assertKoreaBounds(map.fits.at(-1).bounds);
  assert.deepEqual(map.fits.at(-1).options.padding, { top: 70, bottom: 190, left: 110, right: 14 }, 'short mobile fast view uses the space beside the date and above the player');
  f.adapter.renderMotion(scenes, state(start + 10 * 60000, { mode: 'slow' })); assert.ok(map.fits.at(-1).bounds[1][0] - map.fits.at(-1).bounds[0][0] < .1);
  assert.equal(map.fits.at(-1).options.padding.left, 28, 'detailed mode keeps its existing map frame');
  f.adapter.renderMotion(scenes, state(start + 10 * 60000, { mode: 'fast' })); assertKoreaBounds(map.fits.at(-1).bounds);
  map.fire('movestart', { originalEvent: {} }); const manual = map.fits.length;
  f.adapter.renderMotion(scenes, state(start + 20 * 60000, { mode: 'fast' })); f.host.clientWidth = 320; f.adapter.resize(); assert.equal(map.fits.length, manual);
  f.adapter.fitCurrentScene(); assert.equal(f.cameras.at(-1), 'follow'); assertKoreaBounds(map.fits.at(-1).bounds);
  f.adapter.showAllScenes(); assert.equal(f.cameras.at(-1), 'all'); assertKoreaBounds(map.fits.at(-1).bounds);
});

test('domestic focus hides all place labels and restores fast or detailed visibility when focus ends', async t => {
  const f = fixture(t, { styleLayers: [
    { id: 'road', 'source-layer': 'transportation' }, { id: 'building', 'source-layer': 'building' }, { id: 'poi-hidden', 'source-layer': 'poi', layout: { visibility: 'none' } },
    { id: 'label_town', 'source-layer': 'place' }, { id: 'label_country_1', 'source-layer': 'place' }, { id: 'label_city', 'source-layer': 'place' }, { id: 'place-originally-hidden', 'source-layer': 'place', layout: { visibility: 'none' } }, { id: 'boundary_2', 'source-layer': 'boundary' }, { id: 'water', 'source-layer': 'water' },
  ] }); await f.ready(); const map = f.instances[0], scenes = [day([s('local', 'sungwoo', [p(0), p(10, 37.01)])])];
  const visibility = id => map.layers.find(layer => layer.id === id).layout?.visibility || 'visible';
  f.adapter.renderMotion(scenes, state(start, { mode: 'fast' })); assert.equal(visibility('road'), 'none'); assert.equal(visibility('building'), 'none'); assert.equal(visibility('label_town'), 'none');
  for (const id of ['label_country_1', 'label_city', 'place-originally-hidden']) assert.equal(visibility(id), 'none');
  for (const id of ['boundary_2', 'water']) assert.equal(visibility(id), 'visible');
  map.fire('movestart', { originalEvent: {} }); assert.equal(visibility('label_city'), 'visible'); assert.equal(visibility('label_country_1'), 'visible'); assert.equal(visibility('label_town'), 'none');
  f.adapter.fitCurrentScene(); assert.equal(visibility('label_city'), 'none');
  const abroad = [day([s('fukuoka', 'sungwoo', [p(0, 33.59, 130.40), p(10, 33.6, 130.41)])])];
  f.adapter.renderMotion(abroad, state(start, { mode: 'fast' })); assert.equal(visibility('label_country_1'), 'visible'); assert.equal(visibility('label_city'), 'visible'); assert.equal(visibility('label_town'), 'none');
  f.adapter.renderMotion(scenes, state(start, { mode: 'fast' })); assert.equal(visibility('label_city'), 'none');
  f.adapter.renderMotion(scenes, state(start, { mode: 'slow' })); assert.equal(visibility('road'), 'visible'); assert.equal(visibility('poi-hidden'), 'none'); assert.equal(visibility('label_city'), 'visible'); assert.equal(visibility('label_town'), 'visible');
  f.adapter.renderMotion(scenes, state(start, { mode: 'fast' })); f.adapter.setPicking(true); assert.equal(visibility('road'), 'visible'); assert.equal(visibility('poi-hidden'), 'none'); assert.equal(visibility('label_city'), 'visible'); assert.equal(visibility('label_town'), 'visible');
  f.adapter.setPicking(false); assert.equal(visibility('road'), 'none'); assert.equal(visibility('label_city'), 'none');
  f.adapter.render({ date: scenes[0].date, tracks: scenes[0].segments, records: [] }); assert.equal(visibility('road'), 'visible'); assert.equal(visibility('poi-hidden'), 'none'); assert.equal(visibility('label_city'), 'visible'); assert.equal(visibility('label_town'), 'visible'); assert.equal(visibility('place-originally-hidden'), 'none');
  assert.ok(!map.visibilityChanges.some(change => change.id.startsWith('journey-')), 'journey evidence layers are never hidden by basemap simplification');
});

test('completed playback refits fast and slow overviews while preserving a manual camera', async t => {
  const f = fixture(t); await f.ready(); const map = f.instances[0], scenes = [day([s('local', 'sungwoo', [p(0, 37.56, 126.97), p(30, 37.57, 127.01)])])];
  const end = state(start + 30 * 60000, { progress: 1, mode: 'fast' });
  f.adapter.renderMotion(scenes, end); assertKoreaBounds(map.fits.at(-1).bounds); assert.equal(f.cameras.at(-1), 'all');
  const initial = map.fits.length;
  f.adapter.renderMotion(scenes, { ...end, mode: 'slow' }); assert.equal(map.fits.length, initial + 1); assert.ok(map.fits.at(-1).bounds[1][0] - map.fits.at(-1).bounds[0][0] < .1);
  f.adapter.renderMotion(scenes, end); assert.equal(map.fits.length, initial + 2); assertKoreaBounds(map.fits.at(-1).bounds);
  map.fire('movestart', { originalEvent: {} }); const manual = map.fits.length;
  f.adapter.renderMotion(scenes, { ...end, mode: 'slow' }); f.adapter.renderMotion(scenes, end); assert.equal(map.fits.length, manual); assert.equal(f.cameras.at(-1), 'manual');
});

test('leaving location picking restores fast follow without overriding an existing manual or all view', async t => {
  const f = fixture(t); await f.ready(); const map = f.instances[0], scenes = [day([s('local', 'sungwoo', [p(0), p(30, 37.01)])])];
  const frame = state(start + 10 * 60000, { mode: 'fast' }); f.adapter.renderMotion(scenes, frame);
  f.adapter.setPicking(true); map.fitBounds([[139, 35], [140, 36]], {}); map.fire('movestart', { originalEvent: {} });
  f.adapter.setPicking(false); assertKoreaBounds(map.fits.at(-1).bounds);
  map.fire('movestart', { originalEvent: {} }); f.adapter.setPicking(true); const manual = map.fits.length;
  f.adapter.setPicking(false); f.adapter.renderMotion(scenes, frame); assert.equal(map.fits.length, manual); assert.equal(f.cameras.at(-1), 'manual');
  f.adapter.showAllScenes(); f.adapter.setPicking(true); const overview = map.fits.length;
  f.adapter.setPicking(false); f.adapter.renderMotion(scenes, frame); assert.equal(map.fits.length, overview); assert.equal(f.cameras.at(-1), 'all');
});

test('SDK failure reports a usable fallback and late initialization cannot revive disposed map', async t => {
  const f = fixture(t, { reject: true }); assert.equal(await f.ready(), false); assert.equal(f.statuses.at(-1).ready, false); assert.ok(f.statuses.at(-1).error);
  const second = fixture(t); second.adapter.destroy(); assert.equal(await second.ready(), false); assert.equal(second.instances.length, 0);
});

test('public focus geometry reveals mainland and islands with a coastal margin, not the rectangular camera frame', () => {
  const focus = prepareJourneyFocus(KOREA_FOCUS);
  for (const point of [{ lat: 37.56, lng: 126.97 }, { lat: 33.45, lng: 126.54 }, { lat: 37.50, lng: 130.87 }]) assert.equal(focus.contains(point), true);
  for (const point of [{ lat: 33.59, lng: 130.40 }, { lat: 35.68, lng: 139.69 }, { lat: 39.91, lng: 116.39 }]) assert.equal(focus.contains(point), false);
  const square = { type: 'Polygon', coordinates: [[[126, 36], [127, 36], [127, 37], [126, 37], [126, 36]]] }, before = structuredClone(square), synthetic = prepareJourneyFocus(square);
  assert.equal(synthetic.contains({ lat: 36.5, lng: 127.1 }), true, 'roughly 9km from the outline stays in focus');
  assert.equal(synthetic.contains({ lat: 36.5, lng: 127.3 }), false, 'roughly 27km away reveals the world');
  assert.equal(synthetic.mask.geometry.type, 'MultiPolygon'); assert.equal(synthetic.mask.geometry.coordinates[0].length, 2); assert.deepEqual(square, before);
  assert.equal(prepareJourneyFocus(null), null);
});

test('focus fills only the basemap exterior, keeps journey evidence on top, and reveals reached Fukuoka despite it being inside the camera rectangle', async t => {
  const f = fixture(t, { styleLayers: [{ id: 'water', type: 'fill' }] }); await f.ready(); const map = f.instances[0];
  f.adapter.renderMotion([], state(null, { mode: 'fast' })); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity'), 1, 'empty initial fast view focuses Korea');
  assert.ok(map.layers.findIndex(layer => layer.id === 'water') < map.layers.findIndex(layer => layer.id === 'journey-korea-focus'));
  assert.ok(map.layers.findIndex(layer => layer.id === 'journey-korea-focus') < map.layers.findIndex(layer => layer.id === 'journey-history'));
  const publicData = structuredClone(map.getSource('journey-korea-focus').data);
  const scenes = [day([s('korea-fukuoka', 'sungwoo', [p(0, 37.56, 126.97), p(30, 33.59, 130.40)]), s('back', 'sungwoo', [p(60, 33.59, 130.40), p(90, 37.56, 126.97)])])];
  f.adapter.renderMotion(scenes, state(start, { mode: 'fast', progress: 0 })); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity'), 1, 'future overseas endpoint does not remove focus');
  f.adapter.renderMotion(scenes, state(start + 30 * 60000, { mode: 'fast', progress: .3 })); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity'), 0);
  assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity-transition').duration, 240); assert.equal(map.getSource('journey-history').data.features.length, 1);
  f.adapter.renderMotion(scenes, state(start + 90 * 60000, { mode: 'fast', progress: .9 })); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity'), 1);
  assert.deepEqual(map.getSource('journey-korea-focus').data, publicData, 'focus source never includes private journey coordinates');
  f.adapter.showAllScenes(); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity'), 0, 'an overview containing overseas evidence reveals the whole map');
});

test('focus follows both people on the current date but ignores an old overseas partner position', async t => {
  const f = fixture(t); await f.ready(); const map = f.instances[0];
  const old = day([], { records: [{ id: 'overseas-photo', person: 'sohee', time: null, position: { lat: 33.59, lng: 130.40 } }] });
  const next = day([s('domestic', 'sungwoo', [p(0, 37.56, 126.97), p(30, 37.57, 127.01)].map(point => ({ ...point, time: point.time + 86400000 })))], { date: '2026-01-11' });
  const scenes = [old, next];
  f.adapter.renderMotion(scenes, state(null, { mode: 'fast', progress: .1 })); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity'), 0);
  f.adapter.renderMotion(scenes, state(start + 86400000 + 10 * 60000, { mode: 'fast', index: 1, progress: .6 })); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity'), 1);
  const both = [day([s('korea', 'sungwoo', [p(0, 37.56, 126.97), p(30, 37.57, 127.01)]), s('fukuoka', 'sohee', [p(0, 33.59, 130.40), p(30, 33.6, 130.41)])])];
  f.adapter.renderMotion(both, state(start + 10 * 60000, { mode: 'fast' })); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity'), 0);
  assert.equal(map.getSource('journey-heads').data.features.filter(point => point.properties.current).length, 2);
});

test('manual exploration clears focus immediately, while slow, picking, detail, and domestic overview remain usable', async t => {
  const f = fixture(t); await f.ready(); const map = f.instances[0], scenes = [day([s('korea', 'sungwoo', [p(0, 37.56, 126.97), p(30, 37.57, 127.01)])])];
  const frame = state(start + 10 * 60000, { mode: 'fast' }); f.adapter.renderMotion(scenes, frame);
  map.fire('movestart', { originalEvent: {} }); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity'), 0); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity-transition').duration, 0);
  f.adapter.fitCurrentScene(); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity'), 1);
  f.adapter.setPicking(true); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity'), 0); f.adapter.setPicking(false); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity'), 1);
  f.adapter.renderMotion(scenes, { ...frame, mode: 'slow' }); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity'), 0);
  f.adapter.renderMotion(scenes, frame); f.adapter.showAllScenes(); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity'), 1);
  f.adapter.render({ date: scenes[0].date, records: [], tracks: scenes[0].segments }); assert.equal(map.getPaintProperty('journey-korea-focus', 'fill-opacity'), 0);
});

test('focus source or paint failure leaves ordinary map playback and picking healthy', async t => {
  for (const focusFault of ['source', 'paint']) {
    const f = fixture(t, { focusFault }); assert.equal(await f.ready(), true); const map = f.instances[0], scenes = [day([s('korea', 'sungwoo', [p(0, 37.56, 126.97), p(30, 37.57, 127.01)])])];
    assert.equal(f.adapter.renderMotion(scenes, state(start + 10 * 60000, { mode: 'fast' })), true);
    assert.equal(map.getSource('journey-heads').data.features.length, 1); assert.equal(map.getSource('journey-current').data.features.length, 1); assert.equal(map.removed, undefined); assert.equal(f.statuses.at(-1).error, '');
    f.adapter.setPicking(true); map.fire('click', { lngLat: { lat: 37, lng: 127 } }); assert.deepEqual(f.picks, [{ lat: 37, lng: 127 }]);
  }
});
