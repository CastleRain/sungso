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
    const flush = () => { if (points.length >= 2) segments.push({ id: track.id, person: track.person, points, manual: track.source === 'manual' || track.kind === 'manual' }); points = []; };
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
  const paths = [], heads = new Map();
  for (const segment of segments) {
    const points = segment.points.filter(p => Number.isFinite(p.time));
    const path = [];
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (point.time <= time) path.push(point);
      else {
        const previous = points[i - 1];
        if (previous && previous.time <= time && point.time > previous.time) {
          const progress = (time - previous.time) / (point.time - previous.time);
          const position = { lat: previous.lat + (point.lat - previous.lat) * progress, lng: previous.lng + (point.lng - previous.lng) * progress, time };
          path.push(position); heads.set(segment.person, position);
        }
        break;
      }
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
    const ready = () => finish(globalThis.naver?.maps?.Map ? null : Error('네이버 지도 연결을 확인해 주세요.'));
    globalThis[callbackName] = ready;
    timer = setTimeout(() => finish(Error('지도 연결이 지연되고 있어요.')), 15000);
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(NAVER_CLIENT_ID)}&callback=${callbackName}`;
    script.async = true;
    // script.onload fires before the SDK's internal resources are ready.
    // Only its documented callback may release map/marker construction.
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
  let polylines = [], markers = [], listeners = [], frame = 0, activePlayback = null, heads = [], info;
  const authFailureBefore = globalThis.navermap_authFailure;
  const safely = action => { try { return action(); } catch { return undefined; } };
  const healthy = () => !disposed && !failed && !!map && !!maps;
  function status(text, error = false) { if (disposed) return; message.textContent = text; message.hidden = !text; message.dataset.error = String(error); safely(() => onStatus({ ready: healthy() && !error, error: error ? text : '' })); }
  function clearFrame() { safely(() => cancelAnimationFrame(frame)); frame = 0; activePlayback = null; }
  function removeOverlays(api = maps, tolerateFailure = false) {
    const oldItems = [...polylines, ...markers, ...heads], oldListeners = listeners, oldInfo = info;
    info = null; polylines = []; markers = []; heads = []; listeners = [];
    const cleanup = action => tolerateFailure ? safely(action) : action();
    for (const item of oldItems) cleanup(() => item.setMap(null));
    for (const listener of oldListeners) cleanup(() => api?.Event?.removeListener(listener));
    if (oldInfo) cleanup(() => oldInfo.close());
  }
  function failMap(text = '지도를 표시하지 못했어요. 기록은 목록에서 보고 장소는 좌표로 입력할 수 있어요.') {
    if (disposed || failed) return;
    // Invalidate first: SDK auth callbacks can fire inside a constructor or cleanup.
    failed = true; generation++; clearFrame();
    const oldMap = map, oldApi = maps; map = null; maps = null;
    removeOverlays(oldApi, true); safely(() => oldMap?.destroy()); host.replaceChildren();
    status(text, true);
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
  function resize() { return guard(() => { const center = map.getCenter(); map.setSize(new maps.Size(host.clientWidth, host.clientHeight)); map.setCenter(center); }); }
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
      polylines.push(new maps.Polyline({ map, path: segment.points.map(p => new maps.LatLng(p.lat, p.lng)), strokeColor: (PEOPLE[segment.person] || PEOPLE.together).color, strokeWeight: 4, strokeOpacity: .85, strokeStyle: segment.manual ? 'shortdash' : 'solid', clickable: false }));
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
    fit();
    });
  }
  function stop(restore = true) {
    clearFrame();
    return guard(() => {
      const oldHeads = heads; heads = []; for (const marker of oldHeads) marker.setMap(null);
      if (restore) for (const [index, segment] of data.segments.entries()) polylines[index]?.setPath(segment.points.map(p => new maps.LatLng(p.lat, p.lng)));
    });
  }
  function render(day, options = {}) { if (disposed) return false; generation++; stop(false); currentDay = day; currentOptions = options; data = journeyMapData(day, options.person || 'all'); return paint(); }
  function setPicking(value) { picking = !!value; element.dataset.picking = String(picking); return guard(() => map.setOptions({ draggable: true, cursor: picking ? 'crosshair' : 'auto' })); }
  function play({ duration = 20, onProgress = () => {}, onComplete = () => {} } = {}) {
    if (!healthy() || !stop()) return false;
    const times = data.segments.flatMap(s => s.points.map(p => p.time).filter(Number.isFinite));
    if (times.length < 2) return false;
    const start = times.reduce((a, b) => Math.min(a, b), Infinity), end = times.reduce((a, b) => Math.max(a, b), -Infinity); if (end <= start) return false;
    const run = generation, begin = performance.now(); let painted = 0;
    activePlayback = { run };
    const loop = now => {
      if (!healthy() || !activePlayback || run !== generation) return;
      const progress = Math.min(1, (now - begin) / (Math.max(1, duration) * 1000));
      const paintedFrame = guard(() => { if (now - painted > 60 || progress === 1) {
        painted = now;
        const time = start + (end - start) * progress, state = journeyMapFrame(data.segments, time);
        for (const [index, path] of state.paths.entries()) polylines[index]?.setPath(path.map(p => new maps.LatLng(p.lat, p.lng)));
        for (const marker of heads) marker.setMap(null); heads = [];
        for (const [person, position] of state.heads) heads.push(new maps.Marker({ map, position: new maps.LatLng(position.lat, position.lng), title: `${(PEOPLE[person] || PEOPLE.together).name} 이동 중`, clickable: false, zIndex: 100 }));
        safely(() => onProgress({ progress, time }));
      } });
      if (!paintedFrame) { safely(() => onComplete()); return; }
      if (progress < 1) frame = requestAnimationFrame(loop);
      else { stop(); safely(() => onComplete()); }
    };
    frame = requestAnimationFrame(loop); return true;
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; observer?.observe(element);
  const visibility = () => { if (document.hidden) stop(); }; document.addEventListener('visibilitychange', visibility);
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
    if (globalThis.navermap_authFailure === authFailure) globalThis.navermap_authFailure = authFailureBefore;
  }
  return { ready, render, setPicking, resize, play, stop, destroy };
}
