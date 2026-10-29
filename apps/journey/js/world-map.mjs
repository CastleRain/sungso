import { KOREA_FOCUS } from './korea-focus.mjs';

const PEOPLE = Object.freeze({ sungwoo: { name: '성우', color: '#3784d9' }, sohee: { name: '소희', color: '#db6c68' }, together: { name: '함께', color: '#8861be' } });
export const JOURNEY_WORLD_STYLE = 'https://tiles.openfreemap.org/styles/positron';
// A visual frame for the mainland and islands, not a country-boundary test.
export const JOURNEY_KOREA_FRAME = Object.freeze([{ lat: 32.8, lng: 124.3 }, { lat: 38.8, lng: 132.1 }].map(Object.freeze));
const valid = p => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const wrap = lng => ((lng + 180) % 360 + 360) % 360 - 180;
const delta = (a, b) => wrap(b - a);
const collection = (features = []) => ({ type: 'FeatureCollection', features });
const feature = (geometry, properties = {}) => ({ type: 'Feature', geometry, properties });
const position = p => [p.lng, clamp(p.lat, -85.051129, 85.051129)];
const koreaDate = time => Number.isFinite(time) ? new Date(time + 32400000).toISOString().slice(0, 10) : null;
const insideKoreaFrame = p => p.lat >= JOURNEY_KOREA_FRAME[0].lat && p.lat <= JOURNEY_KOREA_FRAME[1].lat && p.lng >= JOURNEY_KOREA_FRAME[0].lng && p.lng <= JOURNEY_KOREA_FRAME[1].lng;
const fastHiddenSources = new Set(['transportation', 'transportation_name', 'building', 'aeroway', 'aerodrome_label', 'poi']);
const fastHiddenLayers = new Set(['label_other', 'label_village', 'label_town', 'label_state', 'waterway_line_label']);

/** Generalized public geometry is used only to reveal the overview, not geofencing. */
export function prepareJourneyFocus(input) {
  const geometries = input?.type === 'FeatureCollection' ? input.features.map(f => f.geometry) : [input?.type === 'Feature' ? input.geometry : input];
  const polygons = geometries.flatMap(g => g?.type === 'MultiPolygon' ? g.coordinates : g?.type === 'Polygon' ? [g.coordinates] : []);
  if (!polygons.length || polygons.some(p => !p.length || p.some(r => r.length < 4 || r.some(c => !Array.isArray(c) || !valid({ lng: c[0], lat: c[1] }))))) return null;
  const area = ring => ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
  const orient = (ring, clockwise) => (area(ring) < 0) === clockwise ? ring.map(p => [...p]) : ring.map(p => [...p]).reverse();
  const world = [[-180, -85.051129], [180, -85.051129], [180, 85.051129], [-180, 85.051129], [-180, -85.051129]];
  const mask = feature({ type: 'MultiPolygon', coordinates: [[world, ...polygons.map(p => orient(p[0], true))], ...polygons.flatMap(p => p.slice(1).map(r => [orient(r, false)]))] });
  const inside = (point, ring) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > point.lat) !== (b[1] > point.lat) && point.lng < (b[0] - a[0]) * (point.lat - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  };
  const rings = polygons.flat(), bounds = journeyWorldBounds(rings.flat().map(([lng, lat]) => ({ lng, lat })), 128);
  const contains = (point, marginKm = 15) => {
    if (!valid(point)) return false;
    const x = 111.32 * Math.cos(point.lat * Math.PI / 180), y = 111.32;
    if (point.lng < bounds[0][0] - marginKm / x || point.lng > bounds[1][0] + marginKm / x || point.lat < bounds[0][1] - marginKm / y || point.lat > bounds[1][1] + marginKm / y) return false;
    if (polygons.some(p => inside(point, p[0]) && !p.slice(1).some(r => inside(point, r)))) return true;
    if (marginKm <= 0) return false;
    // At this regional scale, a local kilometre projection gives a deliberately
    // generous coastal margin around the generalized public outline.
    return rings.some(ring => ring.some((a, i) => {
      if (!i) return false;
      const b = ring[i - 1], ax = (a[0] - point.lng) * x, ay = (a[1] - point.lat) * y, bx = (b[0] - point.lng) * x, by = (b[1] - point.lat) * y;
      const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy, t = length ? clamp(-(ax * dx + ay * dy) / length, 0, 1) : 0;
      return Math.hypot(ax + t * dx, ay + t * dy) <= marginKm;
    }));
  };
  return { mask, contains };
}

/** The shortest circular longitude extent, including routes across the date line. */
export function journeyWorldBounds(points, center = 0) {
  const values = points.filter(valid);
  if (!values.length) return null;
  const lngs = [...new Set(values.map(p => ((p.lng % 360) + 360) % 360))].sort((a, b) => a - b);
  let gap = -1, after = 0;
  for (let i = 0; i < lngs.length; i++) {
    const next = i + 1 < lngs.length ? lngs[i + 1] : lngs[0] + 360;
    if (next - lngs[i] > gap) { gap = next - lngs[i]; after = (i + 1) % lngs.length; }
  }
  let west = lngs[after], east = west + (lngs.length === 1 ? 0 : 360 - gap);
  const shift = 360 * Math.round((center - (west + east) / 2) / 360); west += shift; east += shift;
  let south = 90, north = -90;
  for (const p of values) { south = Math.min(south, p.lat); north = Math.max(north, p.lat); }
  return [[west, clamp(south, -85, 85)], [east, clamp(north, -85, 85)]];
}

/** GeoJSON accepts unwrapped longitudes, avoiding an artificial 358-degree leg. */
export function unwrapJourneyCoordinates(points) {
  const output = [];
  for (const p of points) {
    const prior = output.at(-1), lng = prior ? prior[0] + delta(wrap(prior[0]), p.lng) : p.lng;
    output.push([lng, clamp(p.lat, -85.051129, 85.051129)]);
  }
  return output;
}

function line(segment, points = segment.points) {
  return feature({ type: 'LineString', coordinates: unwrapJourneyCoordinates(points) }, { person: segment.person, id: segment.key });
}
function singlePoint(segment) {
  return feature({ type: 'Point', coordinates: position(segment.points[0]) }, { person: segment.person, id: segment.key, trackPoint: true });
}
function interpolate(a, b, time) {
  const ratio = b.time > a.time ? clamp((time - a.time) / (b.time - a.time), 0, 1) : 1;
  return { lat: a.lat + (b.lat - a.lat) * ratio, lng: wrap(a.lng + delta(a.lng, b.lng) * ratio), time };
}
function clipped(points, time) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.time <= time) out.push(p);
    else { if (i && points[i - 1].time < time) out.push(interpolate(points[i - 1], p, time)); break; }
  }
  return out;
}
function tail(points) {
  if (points.length < 2) return points;
  // A clock-sized tail becomes invisible on a slow short leg of an overseas
  // trip. Use the last part of the reached geometry, within this track only.
  const lengths = [], y = lat => Math.log(Math.tan(Math.PI / 4 + clamp(lat, -85, 85) * Math.PI / 360)) * 180 / Math.PI;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(delta(a.lng, b.lng), y(b.lat) - y(a.lat));
    lengths.push(length); total += length;
  }
  let remaining = total * .12;
  if (!remaining) return [];
  for (let i = points.length - 1; i > 0; i--) {
    const length = lengths[i - 1];
    if (length >= remaining && length > 0) {
      const a = points[i - 1], b = points[i], ratio = 1 - remaining / length;
      return [{ lat: a.lat + (b.lat - a.lat) * ratio, lng: wrap(a.lng + delta(a.lng, b.lng) * ratio), time: a.time + (b.time - a.time) * ratio }, ...points.slice(i)];
    }
    remaining -= length;
  }
  return points;
}

/** Compact immutable rendering data; keeps each original track independent. */
export function prepareJourneyWorld(scenes = []) {
  const days = [], positions = [];
  for (const [index, scene] of scenes.entries()) {
    const segments = [], records = [];
    for (const segment of scene?.segments || []) {
      if (!PEOPLE[segment.person]) continue;
      let points = [], piece = 0;
      const flush = () => { if (points.length) { const value = { key: `${index}:${segment.id}:${piece++}`, person: segment.person, points }; value.line = points.length > 1 ? line(value) : null; value.dot = points.length === 1 ? singlePoint(value) : null; segments.push(value); positions.push(...points); } points = []; };
      for (const p of segment.points || []) {
        if (!valid(p) || !Number.isFinite(p.time) || scene.date && koreaDate(p.time) !== scene.date) { flush(); continue; }
        if (points.length && p.time < points.at(-1).time) flush();
        points.push({ lat: p.lat, lng: p.lng, time: p.time });
      }
      flush();
    }
    for (const r of scene?.records || []) {
      if (!PEOPLE[r.person] || !valid(r.position) || r.time !== null && !Number.isFinite(r.time)) continue;
      if (r.time !== null && scene.date && koreaDate(r.time) !== scene.date) continue;
      const item = { id: r.id, person: r.person, title: r.title || '', time: r.time, position: { lat: r.position.lat, lng: r.position.lng } };
      records.push(item); positions.push(item.position);
    }
    // Legacy place-only prepared scenes can expose a location without a record.
    if (!records.length && !segments.length && valid(scene?.position) && PEOPLE[scene.person]) {
      records.push({ id: scene.id, person: scene.person, title: scene.title || '', time: null, position: scene.position }); positions.push(scene.position);
    }
    days.push({ scene, index, segments, records, positions: [...segments.flatMap(s => s.points), ...records.map(r => r.position)] });
  }
  return { days, positions };
}

function priorDays(plan, index) {
  const lines = [], records = [], heads = new Map();
  for (const day of plan.days.slice(0, index)) {
    for (const s of day.segments) {
      if (s.line) lines.push(s.line);
      if (s.dot) records.push(s.dot);
      const p = s.points.at(-1), previous = heads.get(s.person);
      if (!previous || previous.day < day.index || p.time >= (previous.time ?? -Infinity)) heads.set(s.person, { ...p, person: s.person, current: false, day: day.index });
    }
    for (const r of day.records) {
      records.push(feature({ type: 'Point', coordinates: position(r.position) }, { person: r.person, id: r.id, title: r.title }));
      const previous = heads.get(r.person);
      if (!previous || previous.day < day.index || r.time !== null && r.time >= (previous.time ?? -Infinity)) heads.set(r.person, { ...r.position, time: r.time, person: r.person, current: false, day: day.index });
    }
  }
  return { lines, records, heads };
}

/** One frame of evidence. Future tracks and gaps never become connecting lines. */
export function journeyMotionFrame(plan, state = {}, history = null) {
  const index = clamp(Number.isInteger(state.index) ? state.index : -1, -1, plan.days.length - 1), day = plan.days[index];
  if (!day) return { completed: collection(), current: collection(), tails: collection(), records: collection(), heads: collection(), signature: 'empty', camera: [], reachedCamera: [], activeKey: '' };
  const prior = history || priorDays(plan, index), complete = [...prior.lines], current = [], tails = [], dots = [...prior.records], heads = new Map([...prior.heads].map(([k, v]) => [k, { ...v }]));
  const time = Number.isFinite(state.time) ? state.time : null, finished = state.progress === 1, activeKeys = [], camera = [], visibleTrackPoints = [];
  for (const segment of day.segments) {
    const first = segment.points[0], last = segment.points.at(-1);
    if (time === null || time < first.time) continue;
    if (segment.dot) { dots.push(segment.dot); visibleTrackPoints.push(segment.key); }
    const reached = clipped(segment.points, time), head = reached.at(-1), active = time >= first.time && time <= last.time && !finished;
    if (time >= last.time) { if (segment.line) complete.push(segment.line); }
    else if (reached.length > 1) current.push(line(segment, reached));
    if (active) {
      activeKeys.push(segment.key); camera.push(...segment.points);
      const recent = tail(reached); if (recent.length > 1) tails.push(line(segment, recent));
    }
    const previous = heads.get(segment.person);
    if (head && (!previous || previous.day < index || head.time >= (previous.time ?? -Infinity))) heads.set(segment.person, { ...head, person: segment.person, current: active, day: index });
  }
  const visibleRecords = [];
  for (const r of day.records) {
    if (r.time !== null && (time === null || r.time > time)) continue;
    visibleRecords.push(r.id);
    dots.push(feature({ type: 'Point', coordinates: position(r.position) }, { person: r.person, id: r.id, title: r.title }));
    const previous = heads.get(r.person);
    if (!previous || previous.day < index || r.time !== null && r.time > (previous.time ?? -Infinity)) heads.set(r.person, { ...r.position, time: r.time, person: r.person, current: r.time !== null && r.time === time && !finished, day: index });
  }
  const headFeatures = [...heads.values()].map(p => feature({ type: 'Point', coordinates: position(p) }, { person: p.person, current: !!p.current, name: PEOPLE[p.person].name }));
  if (!camera.length) camera.push(...[...heads.values()].filter(p => p.day === index));
  if (!camera.length) camera.push(...day.positions);
  return { completed: collection(complete), current: collection(current), tails: collection(tails), records: collection(dots), heads: collection(headFeatures), signature: `${index}|${complete.map(f => f.properties.id).join(',')}|${visibleRecords.join(',')}|${visibleTrackPoints.join(',')}`, camera, reachedCamera: [...heads.values()].filter(p => p.day === index), activeKey: `${index}:${activeKeys.join(',')}` };
}

let sdkPromise;
export function loadJourneyWorldSdk() {
  if (globalThis.maplibregl?.Map) return Promise.resolve(globalThis.maplibregl);
  if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); let timer, settled = false;
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer); script.onload = script.onerror = null; if (error) { script.remove(); reject(error); } else resolve(globalThis.maplibregl); };
    script.src = new URL('../assets/maplibre/maplibre-gl.js', import.meta.url).href; script.async = true;
    script.onload = () => finish(globalThis.maplibregl?.Map ? null : Error('지도를 불러오지 못했어요.'));
    script.onerror = () => finish(Error('지도 연결을 확인해 주세요.')); timer = setTimeout(() => finish(Error('지도 연결이 지연되고 있어요.')), 15000); document.head.append(script);
  }).catch(error => { sdkPromise = undefined; throw error; });
  return sdkPromise;
}

const color = ['match', ['get', 'person'], 'sungwoo', PEOPLE.sungwoo.color, 'sohee', PEOPLE.sohee.color, PEOPLE.together.color];
const SOURCE_IDS = ['history', 'current', 'tail', 'memories', 'heads'];
export function createJourneyMap({ element, onPick = () => {}, onSelect = () => {}, onStatus = () => {}, onCameraChange = () => {}, sdkLoader = loadJourneyWorldSdk, style = JOURNEY_WORLD_STYLE, focus = KOREA_FOCUS }) {
  if (!element) throw Error('지도를 표시할 영역이 없어요.');
  const document = element.ownerDocument || globalThis.document, host = document.createElement('div'), message = document.createElement('p');
  host.className = 'journey-map-surface'; host.style.cssText = 'position:absolute;inset:0'; message.className = 'journey-map-message'; message.setAttribute('role', 'status'); element.replaceChildren(host, message);
  let map, api, disposed = false, loaded = false, failed = false, picking = false, mode = 'motion', scenes = [], plan = prepareJourneyWorld(), state = {}, historyIndex = -2, history, staticSignature = '', cameraMode = 'follow', cameraKey = '', hasFit = false, completed = false, lastPaint = -Infinity, lastWidth = 0, lastHeight = 0, popup, readyTimer, resolveReady, detailDay, detailOptions;
  let fastView = null, forceFastFit = false;
  const baseVisibility = new Map();
  const safely = fn => { try { return fn(); } catch { return undefined; } };
  const focusGeometry = safely(() => prepareJourneyFocus(focus));
  let focusAvailable = false, focusVisible = false, focusPositions = [], allInFocus = true;
  const healthy = () => !disposed && !failed && loaded && !!map;
  function status(text, error = false) { if (disposed) return; message.textContent = text; message.hidden = !text; message.dataset.error = String(error); safely(() => onStatus({ ready: healthy(), error: error ? text : '' })); }
  function cameraChanged(value) { if (cameraMode !== value) { cameraMode = value; if (value === 'manual') applyFocus(true); safely(() => onCameraChange(value)); } }
  function fail() { if (disposed || failed) return; failed = true; loaded = false; clearTimeout(readyTimer); safely(() => map?.remove()); map = null; host.replaceChildren(); status('지도를 표시하지 못했어요. 기록은 목록에서 확인하고 위치는 좌표로 입력할 수 있어요.', true); resolveReady?.(false); }
  function guard(fn) { if (!healthy()) return false; try { fn(); return true; } catch { fail(); return false; } }
  function setData(id, value) { map.getSource('journey-' + id)?.setData(value); }
  function padding(wide = false) {
    const small = element.clientWidth < 600;
    if (wide && small && element.clientHeight < 500) return { top: 70, bottom: 190, left: 110, right: 14 };
    return wide ? { top: small ? 130 : 85, bottom: small ? 170 : 150, left: small ? 18 : 48, right: small ? 18 : 48 } : { top: small ? 190 : 115, bottom: small ? 220 : 185, left: small ? 28 : 60, right: small ? 28 : 60 };
  }
  const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  function fit(positions, { force = false, overview = false, wide = false, maxZoom, bounds: explicitBounds } = {}) {
    if (!positions.length || !healthy()) return;
    const center = map.getCenter?.().lng || 0, bounds = explicitBounds || journeyWorldBounds(positions, center); if (!bounds) return;
    const screen = element.getBoundingClientRect?.() || { width: element.clientWidth, height: element.clientHeight }, pad = padding(wide);
    // Tiny windows must still leave an actual map viewing area between overlays.
    const available = Math.max(80, screen.height - 60); if (pad.top + pad.bottom > available) { const ratio = available / (pad.top + pad.bottom); pad.top *= ratio; pad.bottom *= ratio; }
    if (!force && hasFit && map.project && positions.every(p => { const xy = map.project([center + delta(wrap(center), p.lng), p.lat]); return xy.x >= pad.left && xy.x <= screen.width - pad.right && xy.y >= pad.top && xy.y <= screen.height - pad.bottom; })) return;
    const current = map.getCenter?.(), distance = current ? Math.abs(delta(current.lng, (bounds[0][0] + bounds[1][0]) / 2)) : 0;
    const duration = reduced() || !hasFit ? 0 : distance > 15 ? 1100 : 700;
    map.fitBounds(bounds, { padding: pad, maxZoom: maxZoom ?? (overview ? 11 : 12), duration, linear: distance <= 15, essential: false }); hasFit = true;
  }
  function fitOverview() {
    const wide = state.mode === 'fast' && mode === 'motion';
    fit(wide ? [...JOURNEY_KOREA_FRAME, ...plan.positions] : plan.positions, { force: true, overview: true, wide, ...(wide ? { maxZoom: 6.3 } : {}) });
  }
  function rememberBaseStyle() {
    for (const layer of map.getStyle?.().layers || []) {
      const simpleHidden = fastHiddenSources.has(layer['source-layer']) || fastHiddenLayers.has(layer.id), place = layer['source-layer'] === 'place';
      if (layer.id.startsWith('journey-') || !simpleHidden && !place) continue;
      const original = layer.layout?.visibility || 'visible'; baseVisibility.set(layer.id, { original, current: original, simpleHidden, place });
    }
  }
  function applyBaseStyle() {
    if (!healthy()) return;
    const simple = mode === 'motion' && state.mode === 'fast' && !picking;
    for (const [id, value] of baseVisibility) {
      const visibility = simple && (value.simpleHidden || focusVisible && value.place) ? 'none' : value.original;
      if (value.current === visibility) continue;
      map.setLayoutProperty(id, 'visibility', visibility); value.current = visibility;
    }
  }
  function disableFocus() {
    focusAvailable = false; focusVisible = false; host.dataset.koreaFocus = 'false';
    safely(() => map.setLayoutProperty('journey-korea-focus', 'visibility', 'none'));
    safely(() => map.removeLayer?.('journey-korea-focus'));
  }
  function installFocus() {
    if (!focusGeometry) return;
    try {
      const water = map.getPaintProperty?.('water', 'fill-color') || globalThis.getComputedStyle?.(element).getPropertyValue('--ss-bg').trim();
      if (!water) return;
      map.addSource('journey-korea-focus', { type: 'geojson', data: focusGeometry.mask, attribution: '<a href="https://www.naturalearthdata.com/">Natural Earth</a>' });
      map.addLayer({ id: 'journey-korea-focus', type: 'fill', source: 'journey-korea-focus', paint: { 'fill-color': water, 'fill-opacity': 0, 'fill-opacity-transition': { duration: reduced() ? 0 : 240, delay: 0 }, 'fill-antialias': true } });
      focusAvailable = true;
    } catch { disableFocus(); }
  }
  function applyFocus(immediate = false) {
    if (!healthy()) return;
    if (focusAvailable) {
      const visible = mode === 'motion' && state.mode === 'fast' && !picking && (cameraMode === 'follow' ? focusPositions.every(p => focusGeometry.contains(p)) : cameraMode === 'all' && allInFocus);
      if (visible !== focusVisible) {
        try {
          map.setPaintProperty('journey-korea-focus', 'fill-opacity-transition', { duration: immediate || reduced() ? 0 : 240, delay: 0 });
          map.setPaintProperty('journey-korea-focus', 'fill-opacity', visible ? 1 : 0);
          focusVisible = visible; host.dataset.koreaFocus = String(visible);
        } catch { disableFocus(); }
      }
    }
    // Place labels are suppressed only after the current focus state is known.
    guard(applyBaseStyle);
  }
  function fitFast(frame, force = false) {
    const reached = frame.reachedCamera || [], outside = reached.some(p => !insideKoreaFrame(p));
    const now = globalThis.performance?.now?.() || 0;
    if (!outside) {
      if (force || !hasFit || fastView?.kind !== 'korea') fit(JOURNEY_KOREA_FRAME, { force: true, wide: true, maxZoom: 6.3 });
      fastView = { kind: 'korea', time: now }; return;
    }
    const positions = [...JOURNEY_KOREA_FRAME, ...reached], center = map.getCenter?.().lng || 128;
    if (!force && fastView?.kind === 'world') {
      const b = fastView.bounds, middle = (b[0][0] + b[1][0]) / 2, insetX = (b[1][0] - b[0][0]) * .04, insetY = (b[1][1] - b[0][1]) * .04;
      const contained = reached.every(p => { const lng = middle + delta(wrap(middle), p.lng); return lng >= b[0][0] + insetX && lng <= b[1][0] - insetX && p.lat >= b[0][1] + insetY && p.lat <= b[1][1] - insetY; });
      if (contained || state.playing && now - fastView.time < 450) return;
    }
    const b = journeyWorldBounds(positions, center), x = Math.max(.6, (b[1][0] - b[0][0]) * .1), y = Math.max(.4, (b[1][1] - b[0][1]) * .08);
    // This empty margin allows gentle expansion without inspecting future points.
    const bounds = [[Math.floor((b[0][0] - x) * 2) / 2, clamp(b[0][1] - y, -85, 85)], [Math.ceil((b[1][0] + x) * 2) / 2, clamp(b[1][1] + y, -85, 85)]];
    fit(positions, { force: true, wide: true, maxZoom: 6.3, bounds }); fastView = { kind: 'world', bounds, time: now };
  }
  function refreshMotion(force = false, refitOverview = false) {
    if (!healthy() || mode !== 'motion') return;
    const now = globalThis.performance?.now?.() || 0;
    if (!force && state.playing && now - lastPaint < 30) return;
    lastPaint = now;
    guard(() => {
      if (historyIndex !== state.index) { historyIndex = state.index; history = priorDays(plan, Math.max(0, state.index ?? 0)); }
      const frame = journeyMotionFrame(plan, state, history);
      focusPositions = frame.reachedCamera;
      if (frame.signature !== staticSignature) { staticSignature = frame.signature; setData('history', frame.completed); setData('memories', frame.records); }
      setData('current', frame.current); setData('tail', frame.tails); setData('heads', frame.heads);
      const justCompleted = state.progress === 1 && !completed;
      if (justCompleted) { completed = true; if (cameraMode !== 'manual') { cameraChanged('all'); fitOverview(); } }
      if (state.progress < 1 && completed) { completed = false; if (cameraMode === 'all') cameraChanged('follow'); cameraKey = ''; fastView = null; }
      if (refitOverview && cameraMode === 'all' && !justCompleted) fitOverview();
      if (cameraMode === 'follow') {
        if (state.mode === 'fast') { fitFast(frame, forceFastFit); forceFastFit = false; }
        else if (frame.activeKey !== cameraKey) { cameraKey = frame.activeKey; fit(frame.camera, { force: !hasFit }); }
      }
      applyFocus();
      host.dataset.scene = state.scene?.date || ''; host.dataset.routeCount = String(frame.completed.features.length + frame.current.features.length); host.dataset.trackPointCount = String(frame.records.features.filter(f => f.properties.trackPoint).length); host.dataset.currentHeads = String(frame.heads.features.filter(f => f.properties.current).length);
    });
  }
  function renderMotion(values, nextState = {}) {
    if (disposed) return false;
    const changed = scenes !== values || mode !== 'motion', modeChanged = state.mode !== nextState.mode;
    forceFastFit = forceFastFit || !changed && nextState.progress < state.progress;
    mode = 'motion'; state = nextState; detailDay = null; detailOptions = null; popup?.remove(); popup = null;
    if (changed) { scenes = values || []; plan = prepareJourneyWorld(scenes); allInFocus = !!focusGeometry && plan.positions.every(p => focusGeometry.contains(p)); historyIndex = -2; staticSignature = ''; cameraKey = ''; completed = false; }
    if (changed || modeChanged) { fastView = null; cameraKey = ''; forceFastFit = true; }
    if (modeChanged && nextState.mode !== 'fast' && cameraMode === 'follow') hasFit = false;
    refreshMotion(changed || modeChanged || !nextState.playing, modeChanged); return healthy();
  }
  function render(day, options = {}) {
    if (disposed) return false;
    detailDay = day; detailOptions = options;
    const filter = r => options.person === 'all' || !options.person || r.person === options.person;
    const scene = { date: day?.date, records: (day?.records || []).filter(filter), segments: (day?.tracks || []).filter(filter) };
    scenes = [scene]; plan = prepareJourneyWorld(scenes); mode = 'day'; state = {}; historyIndex = -2; staticSignature = ''; cameraKey = ''; popup?.remove(); popup = null;
    return guard(() => {
      focusPositions = []; applyFocus(true);
      const value = plan.days[0]; setData('history', collection(value.segments.filter(s => s.line).map(s => s.line))); setData('current', collection()); setData('tail', collection()); setData('heads', collection());
      const trackPoints = value.segments.filter(s => s.dot).map(s => s.dot);
      setData('memories', collection([...trackPoints, ...value.records.map(r => feature({ type: 'Point', coordinates: position(r.position) }, { id: r.id, person: r.person, title: r.title }))]));
      host.dataset.scene = day?.date || ''; host.dataset.routeCount = String(value.segments.filter(s => s.line).length); host.dataset.trackPointCount = String(trackPoints.length); host.dataset.currentHeads = '0';
      fit(value.positions, { force: true });
      const selected = value.records.find(r => r.id === options.selectedId); if (selected) showRecord(selected);
      if (!value.positions.length) status('이날의 장소를 추가하면 지도에 표시돼요.'); else status('');
    });
  }
  function showRecord(record) { if (!api.Popup) return; popup?.remove(); const content = document.createElement('div'); content.className = 'journey-map-label'; content.textContent = `${PEOPLE[record.person]?.name || ''} · ${record.title || '기억한 장소'}`; popup = new api.Popup({ closeButton: true, closeOnClick: true, offset: 12 }).setLngLat(position(record.position)).setDOMContent(content).addTo(map); }
  function fitCurrentScene() { cameraChanged('follow'); cameraKey = ''; fastView = null; forceFastFit = true; if (state.mode !== 'fast') hasFit = false; refreshMotion(true); return healthy(); }
  function showAllScenes() { cameraChanged('all'); return guard(() => { fitOverview(); applyFocus(); }); }
  function setPicking(value) {
    const restoreFollow = picking && !value && mode === 'motion' && state.mode === 'fast' && cameraMode === 'follow';
    picking = !!value; element.dataset.picking = String(picking); if (map?.getCanvas()) map.getCanvas().style.cursor = picking ? 'crosshair' : ''; if (healthy()) applyFocus(true);
    if (restoreFollow) { fastView = null; forceFastFit = true; refreshMotion(true); }
    return healthy();
  }
  function resize() { return guard(() => {
    const w = element.clientWidth, h = element.clientHeight; if (!w || !h || w === lastWidth && h === lastHeight) return;
    lastWidth = w; lastHeight = h; map.resize();
    // Preserve manual exploration, but make a changed aspect ratio fit the
    // same evidence again without changing the sole playback clock.
    if (cameraMode === 'manual') return;
    if (cameraMode === 'all') fitOverview();
    else if (mode === 'day') fit(plan.positions, { force: true });
    else if (mode === 'motion') { const frame = journeyMotionFrame(plan, state, historyIndex === state.index ? history : null); if (state.mode === 'fast') fitFast(frame, true); else fit(frame.camera, { force: true }); }
  }); }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; observer?.observe(element);
  status('세계지도를 불러오고 있어요.');
  const ready = new Promise(resolve => {
    resolveReady = resolve;
    Promise.resolve().then(sdkLoader).then(value => {
      if (disposed) { resolve(false); return; } api = value;
      map = new api.Map({ container: host, style, center: [127.5, 36.5], zoom: 5, attributionControl: false, renderWorldCopies: true, dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0, refreshExpiredTiles: true, locale: { 'NavigationControl.ZoomIn': '지도 확대', 'NavigationControl.ZoomOut': '지도 축소', 'AttributionControl.ToggleAttribution': '지도 출처 보기' } });
      map.addControl(new api.NavigationControl({ showCompass: false }), 'top-right'); map.addControl(new api.AttributionControl({ compact: true }), 'bottom-right');
      map.scrollZoom?.disable();
      const userCamera = event => { if (event?.originalEvent && !picking) cameraChanged('manual'); };
      map.on('movestart', userCamera); map.on('zoomstart', userCamera);
      map.on('click', event => {
        if (!healthy()) return;
        if (picking) { const p = { lat: event.lngLat.lat, lng: wrap(event.lngLat.lng) }; if (valid(p)) onPick(p); return; }
        const selected = map.queryRenderedFeatures?.(event.point, { layers: ['journey-memories'] })?.[0];
        if (selected?.properties?.id) {
          const activeDay = plan.days[mode === 'day' ? 0 : state.index], record = activeDay?.records.find(r => r.id === selected.properties.id);
          if (!record) return;
          if (mode === 'day') showRecord(record);
          onSelect(record.id);
        }
      });
      map.on('error', () => { if (!loaded) fail(); });
      map.on('webglcontextlost', () => fail());
      readyTimer = setTimeout(fail, 20000);
      map.on('load', () => {
        if (disposed || failed) return;
        clearTimeout(readyTimer); loaded = true;
        try {
          rememberBaseStyle();
          installFocus();
          for (const id of SOURCE_IDS) map.addSource('journey-' + id, { type: 'geojson', data: collection() });
          const addLine = (id, source, width, opacity) => map.addLayer({ id: 'journey-' + id, type: 'line', source: 'journey-' + source, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': width, 'line-opacity': opacity } });
          addLine('history', 'history', 2.4, .32); addLine('current', 'current', 3.2, .48); addLine('tail', 'tail', 5.5, .98);
          map.addLayer({ id: 'journey-memories', type: 'circle', source: 'journey-memories', paint: { 'circle-color': color, 'circle-radius': 3.5, 'circle-opacity': .32, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff', 'circle-stroke-opacity': .5 } });
          map.addLayer({ id: 'journey-head-halo', type: 'circle', source: 'journey-heads', filter: ['==', ['get', 'current'], true], paint: { 'circle-color': color, 'circle-radius': 16, 'circle-opacity': .16 } });
          map.addLayer({ id: 'journey-heads', type: 'circle', source: 'journey-heads', paint: { 'circle-color': color, 'circle-radius': ['case', ['get', 'current'], 9, 4], 'circle-opacity': ['case', ['get', 'current'], 1, .25], 'circle-stroke-width': ['case', ['get', 'current'], 3, 1], 'circle-stroke-color': '#ffffff', 'circle-stroke-opacity': ['case', ['get', 'current'], 1, .35] } });
          status(''); setPicking(picking); resize(); if (mode === 'motion') refreshMotion(true); else render(detailDay, detailOptions); resolve(true);
        } catch { fail(); }
      });
    }).catch(fail);
  });
  function destroy() { if (disposed) return; disposed = true; clearTimeout(readyTimer); observer?.disconnect(); popup?.remove(); popup = null; safely(() => map?.remove()); map = null; api = null; loaded = false; scenes = []; plan = prepareJourneyWorld(); history = null; state = {}; fastView = null; focusPositions = []; focusAvailable = false; baseVisibility.clear(); detailDay = null; detailOptions = null; element.replaceChildren(); resolveReady?.(false); }
  return { ready, render, renderMotion, fitCurrentScene, showAllScenes, setPicking, resize, destroy };
}
