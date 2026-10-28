const NAVER_CLIENT_ID = 'jjk1t3dw7m';
const PEOPLE = Object.freeze({ sungwoo: { name: '성우', color: '#3784d9' }, sohee: { name: '소희', color: '#db6c68' }, together: { name: '함께', color: '#8861be' } });
let sdkPromise;
const validPosition = p => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

export function journeyMapData(day, person = 'all') {
  const records = (day?.records || []).filter(r => (person === 'all' || r.person === person) && validPosition(r.position));
  const segments = [];
  for (const track of day?.tracks || []) {
    if (person !== 'all' && track.person !== person) continue;
    let points = [];
    const flush = () => { if (points.length) segments.push({ id: track.id, person: track.person, points, manual: track.source === 'manual' || track.kind === 'manual' }); points = []; };
    for (const point of track.points || []) {
      if (!validPosition(point)) { flush(); continue; }
      if (points.length && Number.isFinite(point.time) && Number.isFinite(points.at(-1).time) && point.time < points.at(-1).time) flush();
      points.push(point);
    }
    flush();
  }
  return { records, segments };
}

/** Clip each recorded segment independently; a missing GPS interval is never bridged. */
export function journeyMapFrame(segments, time) {
  const paths = [], heads = new Map(), finalTimes = new Map();
  for (const segment of segments) for (const point of segment.points) if (Number.isFinite(point.time)) finalTimes.set(segment.person, Math.max(finalTimes.get(segment.person) ?? -Infinity, point.time));
  for (const segment of segments) {
    const points = segment.points.filter(p => Number.isFinite(p.time));
    const path = []; let candidate;
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (point.time <= time) { path.push(point); candidate = { ...point, recordedAt: point.time, state: 'recorded' }; }
      else {
        const previous = points[i - 1];
        if (previous && previous.time <= time && point.time > previous.time) {
          const progress = (time - previous.time) / (point.time - previous.time);
          const position = { lat: previous.lat + (point.lat - previous.lat) * progress, lng: previous.lng + (point.lng - previous.lng) * progress, time };
          path.push(position); candidate = { ...position, recordedAt: previous.time, state: previous.lat === point.lat && previous.lng === point.lng ? 'recorded' : 'moving' };
        }
        break;
      }
    }
    if (candidate) {
      if (time > points.at(-1).time) candidate.state = time >= finalTimes.get(segment.person) ? 'finished' : 'gap';
      if (time >= finalTimes.get(segment.person) && candidate.time === finalTimes.get(segment.person)) candidate.state = 'finished';
      const prior = heads.get(segment.person);
      if (!prior || candidate.time >= prior.time) heads.set(segment.person, candidate);
    }
    paths.push(path);
  }
  return { paths, heads };
}

export function loadJourneyMapSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'), callbackName = '__journeyNaverSdkReady';
    let settled = false, timer;
    const finish = error => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (globalThis[callbackName] === ready) delete globalThis[callbackName];
      script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else resolve(globalThis.naver.maps);
    };
    // With no submodules the SDK calls back before assigning naver.maps in the
    // same script. Resolve after that stack finishes, without a timed delay.
    const ready = () => queueMicrotask(() => finish(globalThis.naver?.maps?.Map ? null : Error('네이버 지도 연결을 확인해 주세요.')));
    globalThis[callbackName] = ready;
    timer = setTimeout(() => finish(Error('지도 연결이 지연되고 있어요.')), 15000);
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(NAVER_CLIENT_ID)}&callback=${callbackName}`;
    script.async = true;
    // Use the SDK's readiness callback, not script download completion.
    script.onerror = () => finish(Error('네이버 지도를 불러오지 못했어요.'));
    document.head.append(script);
  }).catch(error => { sdkPromise = undefined; throw error; });
  return sdkPromise;
}

export function createJourneyMap({ element, onPick = () => {}, onSelect = () => {}, onStatus = () => {}, sdkLoader = loadJourneyMapSdk }) {
  if (!element) throw Error('지도를 표시할 영역이 없어요.');
  const host = document.createElement('div'), message = document.createElement('p');
  host.className = 'journey-map-surface'; host.style.cssText = 'position:absolute;inset:0';
  message.className = 'journey-map-message'; message.setAttribute('role', 'status');
  element.style.position = 'relative'; element.replaceChildren(host, message);
  let disposed = false, failed = false, maps, map, picking = false, currentDay, currentOptions = {}, data = { records: [], segments: [] }, generation = 0;
  let polylines = [], progressLines = [], markers = [], listeners = [], frame = 0, heads = [], info;
  let progress = 0, playing = false, speed = 1, duration = 60, start = null, end = null, anchorTime = 0, anchorProgress = 0, lastPainted = 0;
  let progressHandler = () => {}, completeHandler = () => {}, headStates = new Map(), playbackVisible = false, viewKey = null, hadPositions = false;
  let coordinates = new WeakMap(), lastWidth = 0, lastHeight = 0;
  const authFailureBefore = globalThis.navermap_authFailure;
  const safely = action => { try { return action(); } catch { return undefined; } };
  const healthy = () => !disposed && !failed && !!map && !!maps;
  function status(text, error = false) { if (disposed) return; message.textContent = text; message.hidden = !text; message.dataset.error = String(error); safely(() => onStatus({ ready: healthy() && !error, error: error ? text : '' })); }
  function clearFrame() { safely(() => cancelAnimationFrame(frame)); frame = 0; playing = false; }
  function getPlayback() { return { progress, time: start === null ? null : Math.round(start + (end - start) * progress), startTime: start, endTime: end, playing, speed, duration, available: healthy() && start !== null && end > start, positions: [...headStates].map(([person, value]) => ({ person, state: value.state, recordedAt: value.recordedAt })) }; }
  function notifyPlayback() { const state = getPlayback(); safely(() => progressHandler(state)); return state; }
  function coordinate(point) { let value = coordinates.get(point); if (!value) { value = new maps.LatLng(point.lat, point.lng); coordinates.set(point, value); } return value; }
  function removeOverlays(api = maps, tolerateFailure = false) {
    const oldItems = [...polylines, ...progressLines, ...markers, ...heads.map(value => value.marker)].filter(Boolean), oldHeads = heads, oldListeners = listeners, oldInfo = info;
    info = null; polylines = []; progressLines = []; markers = []; heads = []; listeners = [];
    const cleanup = action => tolerateFailure ? safely(action) : action();
    for (const item of oldItems) cleanup(() => item.setMap(null));
    for (const listener of oldListeners) cleanup(() => api?.Event?.removeListener(listener));
    for (const head of oldHeads) cleanup(() => head.label.close());
    if (oldInfo) cleanup(() => oldInfo.close());
  }
  function failMap(text = '지도를 표시하지 못했어요. 기록은 목록에서 보고 장소는 좌표로 입력할 수 있어요.') {
    if (disposed || failed) return;
    // Invalidate first: SDK auth callbacks can fire inside a constructor or cleanup.
    failed = true; generation++; clearFrame();
    const oldMap = map, oldApi = maps; map = null; maps = null;
    removeOverlays(oldApi, true); safely(() => oldMap?.destroy()); host.replaceChildren();
    status(text, true);
    notifyPlayback();
  }
  function guard(action) {
    if (!healthy()) return false;
    try { action(); return healthy(); } catch { failMap(); return false; }
  }
  const authFailure = () => {
    failMap('네이버 지도 연결을 확인해 주세요. 기록은 목록에서 보고 장소는 좌표로 입력할 수 있어요.');
    if (typeof authFailureBefore === 'function') safely(() => authFailureBefore());
  };
  globalThis.navermap_authFailure = authFailure;
  status('네이버 지도를 불러오고 있어요.');
  function resize() { return guard(() => {
    const width = host.clientWidth, height = host.clientHeight; if (!width || !height || width === lastWidth && height === lastHeight) return;
    const center = map.getCenter(), zoom = map.getZoom?.();
    map.setSize(new maps.Size(width, height)); map.setCenter(center);
    if (Number.isFinite(zoom) && map.getZoom?.() !== zoom) map.setZoom(zoom, false);
    lastWidth = width; lastHeight = height;
  }); }
  function fit() {
    if (!healthy()) return;
    const positions = [...data.records.map(r => r.position), ...data.segments.flatMap(s => s.points)];
    if (!positions.length) { status('이날의 장소를 추가하면 지도에 표시돼요.'); return; }
    status('');
    if (positions.every(p => Math.abs(p.lat - positions[0].lat) < .00001 && Math.abs(p.lng - positions[0].lng) < .00001)) {
      map.setCenter(new maps.LatLng(positions[0].lat, positions[0].lng)); map.setZoom(15); return;
    }
    const bounds = new maps.LatLngBounds(); for (const p of positions) bounds.extend(new maps.LatLng(p.lat, p.lng));
    map.fitBounds(bounds, { top: 55, bottom: 55, left: 55, right: 55 });
  }
  function paint() {
    return guard(() => {
    removeOverlays();
    for (const segment of data.segments) {
      polylines.push(segment.points.length > 1 ? new maps.Polyline({ map, path: segment.points.map(coordinate), strokeColor: (PEOPLE[segment.person] || PEOPLE.together).color, strokeWeight: 4, strokeOpacity: .85, strokeStyle: segment.manual ? 'shortdash' : 'solid', clickable: false }) : null);
      if (segment.points.length === 1) markers.push(new maps.Marker({ map, position: coordinate(segment.points[0]), title: `${(PEOPLE[segment.person] || PEOPLE.together).name} · 경로 기록점`, icon: { path: maps.SymbolPath.CIRCLE, radius: 4, fillColor: (PEOPLE[segment.person] || PEOPLE.together).color, fillOpacity: .8, strokeColor: '#ffffff', strokeWeight: 2 }, clickable: false }));
    }
    for (const record of data.records) {
      const person = PEOPLE[record.person] || PEOPLE.together;
      const marker = new maps.Marker({ map, position: new maps.LatLng(record.position.lat, record.position.lng), title: `${person.name} · ${record.title || '방문 장소'}`, clickable: true });
      const select = () => {
        if (picking || !healthy()) return;
        const selected = guard(() => {
          const content = document.createElement('div'); content.className = 'journey-map-label'; content.textContent = `${person.name} · ${record.title || '방문 장소'}`;
          info?.close(); info = new maps.InfoWindow({ content, borderWidth: 0, anchorSkew: false }); info.open(map, marker);
        });
        if (selected) onSelect(record.id);
      };
      listeners.push(maps.Event.addListener(marker, 'click', select)); markers.push(marker);
      if (record.id === currentOptions.selectedId) {
        const content = document.createElement('div'); content.className = 'journey-map-label'; content.textContent = `${person.name} · ${record.title || '방문 장소'}`;
        info?.close(); info = new maps.InfoWindow({ content, borderWidth: 0 }); info.open(map, marker);
      }
    }
    const key = `${currentDay?.date || ''}:${currentOptions.person || 'all'}`, hasPositions = data.records.length > 0 || data.segments.length > 0;
    if (key !== viewKey || !hadPositions && hasPositions) fit();
    else if (!hasPositions) status('이날의 장소를 추가하면 지도에 표시돼요.');
    viewKey = key; hadPositions = hasPositions;
    });
  }
  function paintPlayback() {
    return guard(() => {
      if (!playbackVisible) { for (const line of polylines) line?.setOptions({ strokeOpacity: .22 }); playbackVisible = true; }
      const state = journeyMapFrame(data.segments, start + (end - start) * progress); headStates = state.heads;
      for (const [index, path] of state.paths.entries()) {
        if (path.length < 2) { progressLines[index]?.setMap(null); progressLines[index] = null; continue; }
        if (progressLines[index]) progressLines[index].setPath(path.map(coordinate));
        else progressLines[index] = new maps.Polyline({ map, path: path.map(coordinate), strokeColor: (PEOPLE[data.segments[index].person] || PEOPLE.together).color, strokeWeight: 5, strokeOpacity: 1, clickable: false, zIndex: 5 });
      }
      for (const head of heads.filter(value => !state.heads.has(value.person))) { head.marker.setMap(null); head.label.close(); }
      heads = heads.filter(value => state.heads.has(value.person));
      for (const [person, position] of state.heads) {
        const owner = PEOPLE[person] || PEOPLE.together, description = position.state === 'gap' ? '기록 공백' : position.state === 'finished' ? '마지막 기록' : position.state === 'recorded' ? '기록 위치' : '이동 중';
        const title = `${owner.name} · ${description}`, icon = { path: maps.SymbolPath.CIRCLE, radius: 9, fillColor: owner.color, fillOpacity: position.state === 'gap' ? .35 : 1, strokeColor: '#ffffff', strokeWeight: 3 };
        const labelContent = () => { const text = document.createElement('span'); text.textContent = title; text.style.cssText = `display:block;background:var(--ss-surface,#fff);color:var(--ss-text,#343b44);border:1px solid ${owner.color};border-radius:10px;padding:2px 7px;font:600 12px/1.5 sans-serif;white-space:nowrap;pointer-events:none`; return text; };
        let head = heads.find(value => value.person === person);
        if (!head) {
          const marker = new maps.Marker({ map, position: coordinate(position), title, icon, clickable: false, zIndex: 100 });
          const label = new maps.InfoWindow({ content: labelContent(), borderWidth: 0, disableAnchor: true, disableAutoPan: true, backgroundColor: 'transparent', pixelOffset: new maps.Point(person === 'sungwoo' ? -55 : person === 'sohee' ? 55 : 0, -12) });
          head = { person, marker, label, state: position.state }; heads.push(head);
          // Coordinate anchors avoid icon size/anchor assumptions for native symbols.
          label.open(map, coordinate(position));
        }
        head.marker.setPosition(coordinate(position));
        if (head.state !== position.state) { head.marker.setIcon(icon); head.marker.setTitle(title); head.label.setContent(labelContent()); head.state = position.state; }
        head.label.setPosition(coordinate(position));
      }
    });
  }
  function syncProgress(now = performance.now()) { if (playing) progress = Math.min(1, anchorProgress + (now - anchorTime) * speed / (duration * 1000)); }
  function stop() { clearFrame(); progress = 0; anchorProgress = 0; if (healthy() && start !== null) paintPlayback(); return notifyPlayback(); }
  function pause() { syncProgress(); clearFrame(); if (healthy() && start !== null) paintPlayback(); return notifyPlayback(); }
  function seek(value) {
    if (!healthy() || start === null || !Number.isFinite(Number(value))) return null;
    progress = Math.max(0, Math.min(1, Number(value))); anchorProgress = progress; anchorTime = performance.now();
    if (progress === 1) clearFrame();
    paintPlayback(); return notifyPlayback();
  }
  function setSpeed(value) {
    if (![.5, 1, 2, 4].includes(Number(value))) return getPlayback();
    syncProgress(); speed = Number(value); anchorProgress = progress; anchorTime = performance.now(); return notifyPlayback();
  }
  function render(day, options = {}) {
    if (disposed) return false; generation++; clearFrame(); progress = 0; anchorProgress = 0; playbackVisible = false; headStates = new Map(); coordinates = new WeakMap();
    currentDay = day; currentOptions = options; data = journeyMapData(day, options.person || 'all');
    const times = data.segments.flatMap(segment => segment.points.map(point => point.time).filter(Number.isFinite));
    start = times.length ? times.reduce((a, b) => Math.min(a, b), Infinity) : null; end = times.length ? times.reduce((a, b) => Math.max(a, b), -Infinity) : null;
    const painted = paint(); notifyPlayback(); return painted;
  }
  function setPicking(value) { picking = !!value; element.dataset.picking = String(picking); return guard(() => map.setOptions({ draggable: true, cursor: picking ? 'crosshair' : 'auto' })); }
  function play(options = {}) {
    if (!getPlayback().available) return false;
    syncProgress(); clearFrame();
    if (typeof options.onProgress === 'function') progressHandler = options.onProgress;
    if (typeof options.onComplete === 'function') completeHandler = options.onComplete;
    if (Number.isFinite(options.duration) && options.duration > 0) duration = options.duration;
    if ([.5, 1, 2, 4].includes(Number(options.speed))) speed = Number(options.speed);
    if (Number.isFinite(options.from)) progress = Math.max(0, Math.min(1, options.from)); else if (progress >= 1) progress = 0;
    const run = generation; anchorProgress = progress; anchorTime = performance.now(); lastPainted = -Infinity; playing = true;
    if (!paintPlayback()) return false; notifyPlayback();
    const loop = now => {
      if (!healthy() || !playing || run !== generation) return;
      syncProgress(now);
      if (now - lastPainted >= 40 || progress >= 1) {
        lastPainted = now; if (progress >= 1) playing = false;
        if (!paintPlayback()) return; notifyPlayback();
      }
      if (playing) frame = requestAnimationFrame(loop);
      else { frame = 0; safely(() => completeHandler()); }
    };
    frame = requestAnimationFrame(loop); return true;
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; observer?.observe(element);
  const visibility = () => { if (document.hidden) pause(); }; document.addEventListener('visibilitychange', visibility);
  const ready = Promise.resolve().then(() => sdkLoader()).then(api => {
    if (disposed || failed) return false;
    maps = api;
    const candidate = new api.Map(host, { center: new api.LatLng(37.5665, 126.978), zoom: 12, zoomControl: true, scrollWheel: false });
    if (disposed || failed) { safely(() => candidate.destroy()); return false; }
    map = candidate;
    maps.Event.addListener(map, 'click', event => { if (healthy() && picking) { const position = { lat: event.coord.lat(), lng: event.coord.lng() }; if (validPosition(position)) onPick(position); } });
    render(currentDay, currentOptions); setPicking(picking); return healthy();
  }).catch(() => { failMap(); return false; });
  function destroy() {
    if (disposed) return; clearFrame(); disposed = true; observer?.disconnect(); document.removeEventListener('visibilitychange', visibility);
    const oldMap = map, oldApi = maps; map = null; maps = null;
    removeOverlays(oldApi, true); safely(() => oldMap?.destroy()); element.replaceChildren();
    currentDay = null; data = { records: [], segments: [] }; headStates.clear(); start = null; end = null; progress = 0; coordinates = new WeakMap(); progressHandler = () => {}; completeHandler = () => {};
    if (globalThis.navermap_authFailure === authFailure) globalThis.navermap_authFailure = authFailureBefore;
  }
  return { ready, render, setPicking, resize, play, pause, seek, setSpeed, getPlayback, stop, destroy };
}
