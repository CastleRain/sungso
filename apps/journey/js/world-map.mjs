const PEOPLE = Object.freeze({ sungwoo: { name: '성우', color: '#3784d9' }, sohee: { name: '소희', color: '#db6c68' }, together: { name: '함께', color: '#8861be' } });
export const JOURNEY_WORLD_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const valid = p => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const wrap = lng => ((lng + 180) % 360 + 360) % 360 - 180;
const delta = (a, b) => wrap(b - a);
const collection = (features = []) => ({ type: 'FeatureCollection', features });
const feature = (geometry, properties = {}) => ({ type: 'Feature', geometry, properties });
const position = p => [p.lng, clamp(p.lat, -85.051129, 85.051129)];
const koreaDate = time => Number.isFinite(time) ? new Date(time + 32400000).toISOString().slice(0, 10) : null;

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
      const flush = () => { if (points.length) { const value = { key: `${index}:${segment.id}:${piece++}`, person: segment.person, points }; value.line = points.length > 1 ? line(value) : null; segments.push(value); positions.push(...points); } points = []; };
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
  if (!day) return { completed: collection(), current: collection(), tails: collection(), records: collection(), heads: collection(), signature: 'empty', camera: [], activeKey: '' };
  const prior = history || priorDays(plan, index), complete = [...prior.lines], current = [], tails = [], dots = [...prior.records], heads = new Map([...prior.heads].map(([k, v]) => [k, { ...v }]));
  const time = Number.isFinite(state.time) ? state.time : null, finished = state.progress === 1, activeKeys = [], camera = [];
  for (const segment of day.segments) {
    const first = segment.points[0], last = segment.points.at(-1);
    if (time === null || time < first.time) continue;
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
  return { completed: collection(complete), current: collection(current), tails: collection(tails), records: collection(dots), heads: collection(headFeatures), signature: `${index}|${complete.map(f => f.properties.id).join(',')}|${visibleRecords.join(',')}`, camera, activeKey: `${index}:${activeKeys.join(',')}` };
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
export function createJourneyMap({ element, onPick = () => {}, onSelect = () => {}, onStatus = () => {}, onCameraChange = () => {}, sdkLoader = loadJourneyWorldSdk, style = JOURNEY_WORLD_STYLE }) {
  if (!element) throw Error('지도를 표시할 영역이 없어요.');
  const document = element.ownerDocument || globalThis.document, host = document.createElement('div'), message = document.createElement('p');
  host.className = 'journey-map-surface'; host.style.cssText = 'position:absolute;inset:0'; message.className = 'journey-map-message'; message.setAttribute('role', 'status'); element.replaceChildren(host, message);
  let map, api, disposed = false, loaded = false, failed = false, picking = false, mode = 'motion', scenes = [], plan = prepareJourneyWorld(), state = {}, historyIndex = -2, history, staticSignature = '', cameraMode = 'follow', cameraKey = '', hasFit = false, completed = false, lastPaint = -Infinity, lastWidth = 0, lastHeight = 0, popup, readyTimer, resolveReady, detailDay, detailOptions;
  const safely = fn => { try { return fn(); } catch { return undefined; } };
  const healthy = () => !disposed && !failed && loaded && !!map;
  function status(text, error = false) { if (disposed) return; message.textContent = text; message.hidden = !text; message.dataset.error = String(error); safely(() => onStatus({ ready: healthy(), error: error ? text : '' })); }
  function cameraChanged(value) { if (cameraMode !== value) { cameraMode = value; safely(() => onCameraChange(value)); } }
  function fail() { if (disposed || failed) return; failed = true; loaded = false; clearTimeout(readyTimer); safely(() => map?.remove()); map = null; host.replaceChildren(); status('지도를 표시하지 못했어요. 기록은 목록에서 확인하고 위치는 좌표로 입력할 수 있어요.', true); resolveReady?.(false); }
  function guard(fn) { if (!healthy()) return false; try { fn(); return true; } catch { fail(); return false; } }
  function setData(id, value) { map.getSource('journey-' + id)?.setData(value); }
  function padding() { const small = element.clientWidth < 600; return { top: small ? 190 : 115, bottom: small ? 220 : 185, left: small ? 28 : 60, right: small ? 28 : 60 }; }
  const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  function fit(positions, { force = false, overview = false } = {}) {
    if (!positions.length || !healthy()) return;
    const center = map.getCenter?.().lng || 0, bounds = journeyWorldBounds(positions, center); if (!bounds) return;
    const screen = element.getBoundingClientRect?.() || { width: element.clientWidth, height: element.clientHeight }, pad = padding();
    // Tiny windows must still leave an actual map viewing area between overlays.
    const available = Math.max(80, screen.height - 60); if (pad.top + pad.bottom > available) { const ratio = available / (pad.top + pad.bottom); pad.top *= ratio; pad.bottom *= ratio; }
    if (!force && hasFit && map.project && positions.every(p => { const xy = map.project([center + delta(wrap(center), p.lng), p.lat]); return xy.x >= pad.left && xy.x <= screen.width - pad.right && xy.y >= pad.top && xy.y <= screen.height - pad.bottom; })) return;
    const current = map.getCenter?.(), distance = current ? Math.abs(delta(current.lng, (bounds[0][0] + bounds[1][0]) / 2)) : 0;
    const duration = reduced() || !hasFit ? 0 : distance > 15 ? 1100 : 700;
    map.fitBounds(bounds, { padding: pad, maxZoom: overview ? 11 : 12, duration, linear: distance <= 15, essential: false }); hasFit = true;
  }
  function refreshMotion(force = false) {
    if (!healthy() || mode !== 'motion') return;
    const now = globalThis.performance?.now?.() || 0;
    if (!force && state.playing && now - lastPaint < 30) return;
    lastPaint = now;
    guard(() => {
      if (historyIndex !== state.index) { historyIndex = state.index; history = priorDays(plan, Math.max(0, state.index ?? 0)); }
      const frame = journeyMotionFrame(plan, state, history);
      if (frame.signature !== staticSignature) { staticSignature = frame.signature; setData('history', frame.completed); setData('memories', frame.records); }
      setData('current', frame.current); setData('tail', frame.tails); setData('heads', frame.heads);
      if (state.progress === 1 && !completed) { completed = true; if (cameraMode !== 'manual') { cameraChanged('all'); fit(plan.positions, { force: true, overview: true }); } }
      if (state.progress < 1 && completed) { completed = false; if (cameraMode === 'all') cameraChanged('follow'); cameraKey = ''; }
      if (cameraMode === 'follow' && frame.activeKey !== cameraKey) { cameraKey = frame.activeKey; fit(frame.camera, { force: !hasFit }); }
      host.dataset.scene = state.scene?.date || ''; host.dataset.routeCount = String(frame.completed.features.length + frame.current.features.length); host.dataset.currentHeads = String(frame.heads.features.filter(f => f.properties.current).length);
    });
  }
  function renderMotion(values, nextState = {}) {
    if (disposed) return false;
    const changed = scenes !== values || mode !== 'motion'; mode = 'motion'; state = nextState; detailDay = null; detailOptions = null; popup?.remove(); popup = null;
    if (changed) { scenes = values || []; plan = prepareJourneyWorld(scenes); historyIndex = -2; staticSignature = ''; cameraKey = ''; completed = false; }
    refreshMotion(changed || !nextState.playing); return healthy();
  }
  function render(day, options = {}) {
    if (disposed) return false;
    detailDay = day; detailOptions = options;
    const filter = r => options.person === 'all' || !options.person || r.person === options.person;
    const scene = { date: day?.date, records: (day?.records || []).filter(filter), segments: (day?.tracks || []).filter(filter) };
    scenes = [scene]; plan = prepareJourneyWorld(scenes); mode = 'day'; state = {}; historyIndex = -2; staticSignature = ''; cameraKey = ''; popup?.remove(); popup = null;
    return guard(() => {
      const value = plan.days[0]; setData('history', collection(value.segments.filter(s => s.line).map(s => s.line))); setData('current', collection()); setData('tail', collection()); setData('heads', collection());
      setData('memories', collection(value.records.map(r => feature({ type: 'Point', coordinates: position(r.position) }, { id: r.id, person: r.person, title: r.title }))));
      fit(value.positions, { force: true });
      const selected = value.records.find(r => r.id === options.selectedId); if (selected) showRecord(selected);
      if (!value.positions.length) status('이날의 장소를 추가하면 지도에 표시돼요.'); else status('');
    });
  }
  function showRecord(record) { if (!api.Popup) return; popup?.remove(); const content = document.createElement('div'); content.className = 'journey-map-label'; content.textContent = `${PEOPLE[record.person]?.name || ''} · ${record.title || '기억한 장소'}`; popup = new api.Popup({ closeButton: true, closeOnClick: true, offset: 12 }).setLngLat(position(record.position)).setDOMContent(content).addTo(map); }
  function fitCurrentScene() { cameraChanged('follow'); cameraKey = ''; hasFit = false; refreshMotion(true); return healthy(); }
  function showAllScenes() { cameraChanged('all'); return guard(() => fit(plan.positions, { force: true, overview: true })); }
  function setPicking(value) { picking = !!value; element.dataset.picking = String(picking); if (map?.getCanvas()) map.getCanvas().style.cursor = picking ? 'crosshair' : ''; return healthy(); }
  function resize() { return guard(() => {
    const w = element.clientWidth, h = element.clientHeight; if (!w || !h || w === lastWidth && h === lastHeight) return;
    lastWidth = w; lastHeight = h; map.resize();
    // Preserve manual exploration, but make a changed aspect ratio fit the
    // same evidence again without changing the sole playback clock.
    if (cameraMode === 'manual') return;
    if (cameraMode === 'all' || mode === 'day') fit(plan.positions, { force: true, overview: cameraMode === 'all' });
    else if (mode === 'motion') fit(journeyMotionFrame(plan, state, historyIndex === state.index ? history : null).camera, { force: true });
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
  function destroy() { if (disposed) return; disposed = true; clearTimeout(readyTimer); observer?.disconnect(); popup?.remove(); popup = null; safely(() => map?.remove()); map = null; api = null; loaded = false; scenes = []; plan = prepareJourneyWorld(); history = null; state = {}; detailDay = null; detailOptions = null; element.replaceChildren(); resolveReady?.(false); }
  return { ready, render, renderMotion, fitCurrentScene, showAllScenes, setPicking, resize, destroy };
}
