import test from 'node:test';
import assert from 'node:assert/strict';
import { createJourneyMap, prepareJourneyWorld, journeyMotionFrame, journeyWorldBounds, unwrapJourneyCoordinates } from '../js/world-map.mjs';

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

function fixture(t, { reject = false } = {}) {
  const previousObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
  globalThis.ResizeObserver = undefined;
  const element = () => ({ children: [], style: {}, dataset: {}, clientWidth: 900, clientHeight: 700, setAttribute() {}, replaceChildren(...items) { this.children = items; }, getBoundingClientRect() { return { width: this.clientWidth, height: this.clientHeight }; } });
  const document = { createElement: element }, host = element(); host.ownerDocument = document;
  const instances = [], statuses = [], cameras = [], picks = [], selections = [];
  const api = {
    Map: class {
      constructor() { this.listeners = new Map(); this.sources = new Map(); this.layers = []; this.controls = []; this.fits = []; this.center = { lng: 127, lat: 37 }; this.canvas = { style: {} }; this.scrollZoom = { disable() {} }; instances.push(this); }
      on(name, handler) { const handlers = this.listeners.get(name) || []; handlers.push(handler); this.listeners.set(name, handlers); }
      fire(name, data) { for (const handler of this.listeners.get(name) || []) handler(data); }
      addControl(control, location) { this.controls.push({ control, location }); }
      addSource(name, source) { this.sources.set(name, { data: source.data, writes: 0, setData(value) { this.data = value; this.writes++; } }); }
      addLayer(value) { this.layers.push(value); }
      getSource(name) { return this.sources.get(name); }
      getCenter() { return this.center; }
      fitBounds(bounds, options) { this.fits.push({ bounds, options }); this.center = { lng: (bounds[0][0] + bounds[1][0]) / 2, lat: (bounds[0][1] + bounds[1][1]) / 2 }; }
      getCanvas() { return this.canvas; }
      resize() { this.resized = (this.resized || 0) + 1; }
      queryRenderedFeatures() { return this.selected ? [this.selected] : []; }
      remove() { this.removed = true; }
    }, NavigationControl: class {}, AttributionControl: class {},
  };
  const adapter = createJourneyMap({ element: host, sdkLoader: () => reject ? Promise.reject(Error('offline')) : api, onStatus: x => statuses.push(x), onCameraChange: x => cameras.push(x), onPick: x => picks.push(x), onSelect: x => selections.push(x) });
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

test('SDK failure reports a usable fallback and late initialization cannot revive disposed map', async t => {
  const f = fixture(t, { reject: true }); assert.equal(await f.ready(), false); assert.equal(f.statuses.at(-1).ready, false); assert.ok(f.statuses.at(-1).error);
  const second = fixture(t); second.adapter.destroy(); assert.equal(await second.ready(), false); assert.equal(second.instances.length, 0);
});
