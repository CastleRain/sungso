import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createJourneyMap, journeyMapData, journeyMapFrame, loadJourneyMapSdk } from '../js/map.mjs';
import { normalizePhotoMetadata, photoExifBytes, readJourneyPhotoMetadata, prepareJourneyPhoto } from '../js/photo.mjs';

test('map keeps separate tracks, splits invalid points and filters people without mutating source', () => {
  const point = (n, time = n * 1000) => ({ lat: 37 + n / 100, lng: 127, time });
  const day = { records: [{ id: 'one', person: 'sungwoo', position: { lat: 37, lng: 127 } }, { id: 'two', person: 'sohee', position: null }], tracks: [
    { id: 'a', person: 'sungwoo', points: [point(0), point(1), { lat: NaN, lng: 127 }, point(2), point(3)] },
    { id: 'b', person: 'sohee', points: [point(4), point(5)] },
  ] };
  const original = structuredClone(day), data = journeyMapData(day, 'sungwoo');
  assert.equal(data.records.length, 1); assert.equal(data.segments.length, 2);
  assert.deepEqual(data.segments.map(s => s.points.length), [2, 2]);
  assert.deepEqual(day, original);
});

test('playback follows timestamps and leaves the unrecorded interval unconnected', () => {
  const segments = [
    { person: 'sungwoo', points: [{ lat: 37, lng: 127, time: 1000 }, { lat: 37.1, lng: 127.1, time: 2000 }] },
    { person: 'sungwoo', points: [{ lat: 38, lng: 128, time: 5000 }, { lat: 38.1, lng: 128.1, time: 6000 }] },
  ];
  const moving = journeyMapFrame(segments, 1500);
  assert.equal(moving.paths[0].length, 2); assert.equal(moving.paths[1].length, 0);
  assert.equal(moving.heads.get('sungwoo').lat, 37.05);
  const gap = journeyMapFrame(segments, 3000);
  assert.equal(gap.heads.get('sungwoo').state, 'gap'); assert.equal(gap.heads.get('sungwoo').recordedAt, 2000);
  assert.equal(gap.heads.get('sungwoo').lat, 37.1); assert.deepEqual(gap.paths.map(p => p.length), [2, 0]);
  const finished = journeyMapFrame(segments, 6000);
  assert.equal(finished.heads.get('sungwoo').state, 'finished'); assert.equal(finished.heads.get('sungwoo').lat, 38.1);
  const waiting = journeyMapFrame([{ person: 'sohee', points: [{ lat: 37, lng: 127, time: 1000 }, { lat: 37, lng: 127, time: 2000 }] }], 1500);
  assert.equal(waiting.heads.get('sohee').state, 'recorded'); assert.equal(waiting.heads.get('sohee').lat, 37);
});

test('map playback pauses, seeks, resumes and changes speed without changing route data or camera', async t => {
  const keys = ['document', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'navermap_authFailure', 'performance'];
  const originals = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  t.after(() => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const element = () => ({ style: {}, dataset: {}, children: [], clientWidth: 400, clientHeight: 300, setAttribute() {}, replaceChildren(...children) { this.children = children; } });
  globalThis.document = { createElement: element, addEventListener() {}, removeEventListener() {} };
  globalThis.ResizeObserver = undefined; globalThis.navermap_authFailure = undefined;
  let now = 0, nextFrame = 0, mapInstance; const callbacks = new Map(), markers = [], lines = [], labels = [];
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  globalThis.requestAnimationFrame = callback => { callbacks.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = id => callbacks.delete(id);
  const tick = value => { now = value; const next = [...callbacks.values()]; callbacks.clear(); next.forEach(callback => callback(now)); };
  const api = {
    LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } },
    Point: class {}, Size: class {}, SymbolPath: { CIRCLE: 3 }, LatLngBounds: class { extend() {} },
    Map: class {
      constructor() { mapInstance = this; this.center = { lat: 37, lng: 127 }; this.zoom = 15; this.fits = 0; }
      getCenter() { return this.center; } getZoom() { return this.zoom; } setSize() { this.zoom = 9; }
      setCenter(value) { this.center = value; } setZoom(value) { this.zoom = value; } fitBounds() { this.fits++; } setOptions() {} destroy() {}
    },
    Polyline: class { constructor(options) { this.options = options; this.path = options.path; lines.push(this); } setMap(value) { this.map = value; } setPath(value) { this.path = value; } setOptions(value) { Object.assign(this.options, value); } },
    Marker: class { constructor(options) { Object.assign(this, options); markers.push(this); } setMap(value) { this.map = value; } setPosition(value) { this.position = value; } setIcon(value) { this.icon = value; } setTitle(value) { this.title = value; } },
    InfoWindow: class { constructor(options) { this.options = options; this.opens = 0; labels.push(this); } open(map, anchor) { this.opens++; assert.ok(anchor instanceof api.LatLng); } close() {} setPosition(value) { this.position = value; } setContent(value) { this.content = value; } },
    Event: { addListener() { return {}; }, removeListener() {} },
  };
  const start = Date.parse('2026-10-18T10:00:00+09:00'), point = (minute, lat) => ({ lat, lng: 127, time: start + minute * 60000 });
  const day = { date: '2026-10-18', records: [], tracks: [{ id: 'a', person: 'sungwoo', points: [point(0, 37), point(1, 37.01)] }, { id: 'b', person: 'sungwoo', points: [point(3, 38), point(4, 38.01)] }] };
  const original = structuredClone(day), host = element(), adapter = createJourneyMap({ element: host, sdkLoader: () => api });
  adapter.render(day); assert.equal(await adapter.ready, true); const updates = []; let completed = 0;
  assert.equal(adapter.getPlayback().duration, 60); assert.equal(adapter.getPlayback().time, start);
  assert.equal(adapter.getPlayback().startTime, start); assert.equal(adapter.getPlayback().endTime, start + 240000);
  assert.equal(adapter.play({ onProgress: value => updates.push(value), onComplete: () => completed++ }), true);
  assert.equal(updates[0].time, start); assert.equal(updates[0].playing, true);
  tick(15000); assert.equal(adapter.getPlayback().progress, .25);
  const paused = adapter.pause(); tick(30000); assert.equal(adapter.getPlayback().progress, paused.progress); assert.equal(callbacks.size, 0);
  const sought = adapter.seek(.5); assert.equal(sought.time, start + 120000); assert.equal(sought.positions[0].state, 'gap');
  assert.equal(markers.at(-1).position.lat, 37.01); assert.equal(markers.at(-1).icon.path, api.SymbolPath.CIRCLE);
  assert.match(markers.at(-1).title, /기록 공백/);
  adapter.play(); tick(37500); assert.equal(adapter.getPlayback().progress, .625);
  assert.equal(labels.length, 1); assert.equal(labels[0].opens, 1); assert.ok(labels[0].position instanceof api.LatLng);
  adapter.setSpeed(2); tick(45000); assert.equal(adapter.getPlayback().progress, .875);
  adapter.seek(.1); tick(48000); assert.ok(Math.abs(adapter.getPlayback().progress - .2) < 1e-8);
  adapter.stop(); assert.equal(adapter.getPlayback().progress, 0); assert.equal(adapter.getPlayback().playing, false);
  adapter.play({ speed: 4, from: .9 }); tick(49500); assert.equal(adapter.getPlayback().progress, 1); assert.equal(adapter.getPlayback().playing, false); assert.equal(completed, 1);
  assert.equal(adapter.getPlayback().positions[0].state, 'finished');
  const center = { lat: 37.5, lng: 127.5 }; mapInstance.center = center; mapInstance.zoom = 17;
  host.children[0].clientWidth = 800; host.children[0].clientHeight = 500; adapter.resize();
  assert.equal(mapInstance.center, center); assert.equal(mapInstance.zoom, 17);
  const fits = mapInstance.fits; adapter.render(day); assert.equal(mapInstance.fits, fits); assert.equal(mapInstance.center, center);
  assert.deepEqual(day, original);
  const lineCount = lines.length;
  adapter.render({ ...day, tracks: [{ id: 'only-a', person: 'sungwoo', points: [point(0, 37)] }, { id: 'only-b', person: 'sungwoo', points: [point(2, 38)] }] });
  assert.equal(adapter.getPlayback().available, true); assert.equal(adapter.getPlayback().startTime, start); assert.equal(adapter.getPlayback().endTime, start + 120000);
  assert.equal(adapter.play({ from: .5 }), true); assert.equal(adapter.getPlayback().time, start + 60000);
  assert.equal(adapter.getPlayback().positions[0].state, 'gap'); assert.equal(lines.length, lineCount);
  adapter.render({ ...day, tracks: [{ id: 'one-point', person: 'sungwoo', points: [point(2, 38)] }] });
  assert.equal(adapter.getPlayback().startTime, adapter.getPlayback().endTime); assert.equal(adapter.getPlayback().available, false); assert.equal(adapter.play(), false);
  adapter.destroy(); assert.equal(callbacks.size, 0); assert.equal(adapter.getPlayback().startTime, null);
});

test('NAVER loader waits past synchronous callback until namespace assignment and cleans up failures', async t => {
  const keys = ['document', 'naver', '__journeyNaverSdkReady', 'setTimeout', 'clearTimeout'];
  const originals = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  t.after(() => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const scripts = [], timers = new Map(); let timerId = 0;
  globalThis.document = { createElement: () => ({ remove() { this.removed = true; } }), head: { append: script => scripts.push(script) } };
  globalThis.setTimeout = callback => { timers.set(++timerId, callback); return timerId; };
  globalThis.clearTimeout = id => timers.delete(id);
  delete globalThis.naver;
  const failed = loadJourneyMapSdk(); scripts[0].onerror();
  await assert.rejects(failed, /불러오지 못/);
  assert.equal(globalThis.__journeyNaverSdkReady, undefined); assert.equal(timers.size, 0); assert.equal(scripts[0].removed, true);
  const timedOut = loadJourneyMapSdk(); [...timers.values()][0]();
  await assert.rejects(timedOut, /지연/);
  assert.equal(globalThis.__journeyNaverSdkReady, undefined); assert.equal(timers.size, 0); assert.equal(scripts[1].removed, true);
  const pending = loadJourneyMapSdk(); let resolved = false; void pending.then(() => { resolved = true; });
  scripts[2].onload?.(); await Promise.resolve();
  assert.equal(resolved, false); assert.equal(loadJourneyMapSdk(), pending); assert.match(scripts[2].src, /callback=__journeyNaverSdkReady/);
  // The no-submodule SDK invokes callback inside En.boot, then assigns naver.maps
  // later in the same script stack. Checking the namespace in callback is premature.
  globalThis.__journeyNaverSdkReady();
  assert.equal(globalThis.naver, undefined); assert.equal(resolved, false);
  globalThis.naver = { maps: { Map: class {} } };
  assert.equal(await pending, globalThis.naver.maps); assert.equal(resolved, true);
  assert.equal(globalThis.__journeyNaverSdkReady, undefined); assert.equal(timers.size, 0);
});

test('failed map SDK cannot turn a successful record save/render into an exception', async t => {
  const keys = ['document', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'navermap_authFailure'];
  const originals = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  t.after(() => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const element = () => ({ style: {}, dataset: {}, children: [], clientWidth: 400, clientHeight: 300, setAttribute() {}, replaceChildren(...children) { this.children = children; } });
  globalThis.document = { createElement: element, addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {}; globalThis.ResizeObserver = undefined;
  // Even an unrelated preexisting provider callback must not break our fallback.
  globalThis.navermap_authFailure = () => { throw Error('prior SDK callback failed'); };
  const day = { records: [{ id: 'saved-memory', person: 'together', title: '저장한 기억', position: { lat: 37.5, lng: 127 } }], tracks: [{ id: 'route', person: 'sungwoo', points: [{ lat: 37.5, lng: 127, time: 1000 }, { lat: 37.51, lng: 127.01, time: 2000 }] }] };
  function sdk({ authDuringConstruction = false, failMarker = false } = {}) {
    const calls = { sdk: 0, cleanup: 0 };
    const api = {
      LatLng: class { constructor() { calls.sdk++; } },
      Size: class {}, LatLngBounds: class { extend() {} },
      Map: class {
        constructor() { calls.sdk++; if (authDuringConstruction) globalThis.navermap_authFailure(); }
        getCenter() { calls.sdk++; return {}; } setSize() { calls.sdk++; } setCenter() { calls.sdk++; }
        setZoom() { calls.sdk++; } fitBounds() { calls.sdk++; } setOptions() { calls.sdk++; }
        destroy() { calls.cleanup++; throw Error('corrupt SDK destroy'); }
      },
      Polyline: class { constructor() { calls.sdk++; } setMap() { calls.cleanup++; } setPath() { calls.sdk++; } },
      Marker: class { constructor() { calls.sdk++; if (failMarker) throw Error('boxToIcon null'); } setMap() { calls.cleanup++; } },
      Event: { addListener() { calls.sdk++; return {}; }, removeListener() { calls.cleanup++; } },
    };
    return { api, calls };
  }
  const loading = sdk({ authDuringConstruction: true }), loadingHost = element(), loadingStatus = [];
  const rejected = createJourneyMap({ element: loadingHost, sdkLoader: () => loading.api, onStatus: state => loadingStatus.push(state) });
  rejected.render(day);
  assert.equal(await rejected.ready, false);
  assert.equal(loadingStatus.at(-1).ready, false);
  assert.match(loadingHost.children[1].textContent, /좌표로 입력/);
  const afterAuth = loading.calls.sdk;
  assert.doesNotThrow(() => { rejected.render(day); rejected.stop(); rejected.resize(); rejected.setPicking(true); rejected.destroy(); });
  assert.equal(rejected.play(), false); assert.equal(loading.calls.sdk, afterAuth);

  const live = sdk(), liveHost = element(), liveStatus = [];
  const map = createJourneyMap({ element: liveHost, sdkLoader: () => live.api, onStatus: state => liveStatus.push(state) });
  map.render(day); assert.equal(await map.ready, true);
  live.api.LatLng = null; // NAVER auth failure can leave formerly loaded constructors unusable.
  assert.doesNotThrow(() => globalThis.navermap_authFailure());
  const sdkAfterFailure = live.calls.sdk;
  assert.doesNotThrow(() => { map.stop(); map.render(day); map.resize(); map.setPicking(true); });
  assert.equal(map.play(), false); assert.equal(live.calls.sdk, sdkAfterFailure); assert.equal(liveStatus.at(-1).ready, false);
  assert.doesNotThrow(() => map.destroy());

  const corrupt = sdk({ failMarker: true }), corruptHost = element();
  const broken = createJourneyMap({ element: corruptHost, sdkLoader: () => corrupt.api });
  broken.render(day); assert.equal(await broken.ready, false);
  assert.match(corruptHost.children[1].textContent, /지도를 표시하지 못/);
  assert.doesNotThrow(() => { broken.render(day); broken.stop(); broken.destroy(); });
});

test('photo metadata retains explicit timezone and valid zero coordinates', () => {
  const value = normalizePhotoMetadata({ DateTimeOriginal: '2026:09:12 11:30:00', OffsetTimeOriginal: '+09:00', latitude: 0, longitude: 0 });
  assert.equal(value.date, '2026-09-12'); assert.equal(value.time, Date.parse('2026-09-12T11:30:00+09:00'));
  assert.deepEqual(value.position, { lat: 0, lng: 0 }); assert.equal(value.timePrecision, 'exact');
});

test('unknown photo timezone preserves date without inventing an exact timestamp', () => {
  const value = normalizePhotoMetadata({ DateTimeOriginal: '2020:08:15 12:34:56' });
  assert.equal(value.date, '2020-08-15'); assert.equal(value.time, null); assert.equal(value.timePrecision, 'day'); assert.equal(value.position, null);
  assert.ok(value.warnings.some(x => x.includes('시간대')));
});

test('invalid dates and coordinates remain missing, GPS time is explicitly UTC', () => {
  const invalid = normalizePhotoMetadata({ DateTimeOriginal: '2026:99:50 11:00:00', latitude: 99, longitude: NaN });
  assert.equal(invalid.date, ''); assert.equal(invalid.position, null);
  const gps = normalizePhotoMetadata({ GPSDateStamp: '2026:10:17', GPSTimeStamp: [23, 30, 0] });
  assert.equal(gps.date, '2026-10-18'); assert.equal(gps.time, Date.parse('2026-10-17T23:30:00Z'));
});

test('real EXIF parser distinguishes synthetic GPS photo from GPS-less photo', async () => {
  const gpsBytes = await readFile(new URL('./fixtures/gps-photo.jpg', import.meta.url));
  const emptyBytes = await readFile(new URL('./fixtures/no-gps-photo.jpg', import.meta.url));
  const gps = await readJourneyPhotoMetadata(new File([gpsBytes], 'gps.jpg', { type: 'image/jpeg' }));
  const empty = await readJourneyPhotoMetadata(new File([emptyBytes], 'empty.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
  assert.deepEqual(gps.position, { lat: 37.5, lng: 127 }); assert.equal(gps.date, '2026-09-12');
  assert.equal(empty.position, null); assert.equal(empty.time, null); assert.equal(empty.date, '');
});

test('WebP metadata reader honors chunk padding and rejects truncation', () => {
  const bytes = new Uint8Array(36), view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('RIFF')); view.setUint32(4, 28, true); bytes.set(new TextEncoder().encode('WEBP'), 8);
  bytes.set(new TextEncoder().encode('JUNK'), 12); view.setUint32(16, 1, true); bytes[20] = 7;
  bytes.set(new TextEncoder().encode('EXIF'), 22); view.setUint32(26, 6, true); bytes.set([73, 73, 42, 0, 8, 0], 30);
  assert.deepEqual([...photoExifBytes(bytes)], [73, 73, 42, 0, 8, 0]);
  assert.throws(() => photoExifBytes(bytes.slice(0, 34)), /잘렸/);
});

test('unsupported and oversized photos are rejected before browser image decoding', async () => {
  await assert.rejects(() => prepareJourneyPhoto({ type: 'image/heic', size: 100 }), /JPG/);
  await assert.rejects(() => prepareJourneyPhoto({ type: 'image/jpeg', size: 21 * 1024 * 1024 }), /20MB/);
});
