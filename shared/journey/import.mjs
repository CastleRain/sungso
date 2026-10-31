import { dateInKorea, emptyDay, mergeDayImport, validateDay, validatePerson, validateSource, validDate } from './core.mjs';

const MAX_FILE_BYTES = 128 * 1024 * 1024;
const MAX_GAP_MS = 30 * 60 * 1000;
export function parseTimelineTime(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-/.test(value) && !validDate(value.slice(0, 10))) return null;
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d{11,16}$/.test(value) ? Number(value) : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? Date.parse(value) : NaN;
  return Number.isSafeInteger(number) && dateInKorea(number) ? number : null;
}
export function parseTimelinePosition(value) {
  if (typeof value === 'string') {
    const parts = value.trim().replace(/^geo:/, '').replaceAll('°', '').split(',');
    if (parts.length !== 2 || parts.some(part => !part.trim())) return null;
    return parseTimelinePosition({ lat: Number(parts[0].trim()), lng: Number(parts[1].trim()) });
  }
  if (!value || typeof value !== 'object') return null;
  if (value.latLng !== undefined || value.LatLng !== undefined) return parseTimelinePosition(value.latLng ?? value.LatLng);
  const e7 = number => (typeof number === 'number' || typeof number === 'string' && /^-?\d+$/.test(number)) && Number.isSafeInteger(Number(number)) ? Number(number) / 1e7 : NaN;
  const lat = value.latitudeE7 !== undefined ? e7(value.latitudeE7) : value.latitude ?? value.lat;
  const lng = value.longitudeE7 !== undefined ? e7(value.longitudeE7) : value.longitude ?? value.lng ?? value.lon;
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
export async function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
const samePoint = (a, b) => a.time === b.time && a.lat === b.lat && a.lng === b.lng;
const cleanName = (value, fallback) => typeof value === 'string' && value.trim() ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 160) : fallback;
const modeName = value => typeof value === 'string' ? value.slice(0, 48) : '';

/** Parse only local, user-selected Google Timeline data; never calls Google or saves anything. */
export async function importTimeline(input, options = {}) {
  const person = validatePerson(options.person);
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  if (typeof text !== 'string' || text.length > MAX_FILE_BYTES) throw new Error('타임라인 파일은 128MB 이하로 선택해주세요.');
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('타임라인 파일은 128MB 이하로 선택해주세요.');
  let document;
  try { document = JSON.parse(text); } catch { throw new Error('JSON 파일을 읽지 못했어요. Google 타임라인 원본을 선택해주세요.'); }
  if (!document || typeof document !== 'object' || document.format === 'journey-studio') throw new Error('Google 타임라인 JSON 파일을 선택해주세요.');
  const hash = options.hash ?? await sha256(bytes);
  const source = validateSource({ id: `timeline_${person}_${hash}`, hash, name: cleanName(options.name, '타임라인.json'), person, kind: 'timeline', importedAt: options.importedAt ?? Date.now() });
  const days = new Map(), warnings = new Set();
  const stats = { days: 0, records: 0, tracks: 0, points: 0, skippedPoints: 0, skippedRecords: 0, unsupportedSegments: 0, duplicateRecords: 0, duplicateEdges: 0 };
  const day = date => { if (!days.has(date)) days.set(date, emptyDay(date)); return days.get(date); };
  const addVisit = async ({ time, position, title, identity = 'visit' }) => {
    if (time === null) { stats.skippedRecords++; warnings.add('날짜를 알 수 없는 장소는 자동 추가하지 않았어요. 사진·직접 입력으로 보완할 수 있어요.'); return; }
    const record = { id: `visit_${person}_${(await sha256(JSON.stringify([person, identity, time, position]))).slice(0, 40)}`, person, kind: 'visit', title: cleanName(title, '방문 지점'), note: '', time, position, sourceId: source.id, timePrecision: 'exact', edited: false };
    day(dateInKorea(time)).records.push(record);
    if (!position) warnings.add('위치를 확인해야 하는 장소가 있어요. 저장 후 직접 지정할 수 있어요.');
  };
  const addPath = async (inputPoints, mode = '', splitRawGaps = false) => {
    if (!Array.isArray(inputPoints)) { warnings.add('읽을 수 없는 경로 구간을 건너뛰었어요.'); return; }
    let run = [];
    const flush = async () => {
      if (run.length >= 1) {
        const date = dateInKorea(run[0].time), id = `track_${person}_${(await sha256(JSON.stringify([person, run]))).slice(0, 40)}`;
        day(date).tracks.push({ id, person, points: run, sourceId: source.id, ...(mode ? { mode: modeName(mode) } : {}) });
      }
      run = [];
    };
    for (const point of inputPoints) {
      const position = point?.position, time = point?.time;
      if (!position || time === null || time === undefined) { stats.skippedPoints++; await flush(); continue; }
      const current = { ...position, time }, previous = run.at(-1);
      if (previous && samePoint(previous, current)) continue;
      if (previous && (time < previous.time || splitRawGaps && time - previous.time > MAX_GAP_MS || dateInKorea(time) !== dateInKorea(previous.time))) { await flush(); warnings.add('자정·원시 GPS의 긴 공백·시각 역전 구간은 나누어 표시해요. 빈 구간을 임의의 선으로 잇지 않아요.'); }
      run.push(current);
    }
    await flush();
  };
  const rawPath = async values => addPath(values.map(point => ({ position: parseTimelinePosition(point.position?.LatLng ?? point.position?.latLng ?? point), time: parseTimelineTime(point.position?.timestamp ?? point.timestamp ?? point.timestampMs) })), '', true);
  const segments = Array.isArray(document.semanticSegments) ? document.semanticSegments : Array.isArray(document) && document.some(segment => segment?.timelinePath || segment?.visit || segment?.activity) ? document : null;
  if (segments) {
    for (const segment of segments) {
      if (!segment || typeof segment !== 'object') { stats.unsupportedSegments++; continue; }
      const start = parseTimelineTime(segment.startTime), end = parseTimelineTime(segment.endTime);
      if (segment.timelinePath) {
        const points = Array.isArray(segment.timelinePath) ? segment.timelinePath.map(point => {
          const offset = point?.durationMinutesOffsetFromStartTime;
          const offsetNumber = (typeof offset === 'number' || typeof offset === 'string' && offset.trim()) ? Number(offset) : NaN;
          const relativeTime = start !== null && Number.isFinite(offsetNumber) && offsetNumber >= 0 ? start + Math.round(offsetNumber * 60000) : null;
          return { position: parseTimelinePosition(point?.point ?? point?.position), time: parseTimelineTime(point?.time) ?? relativeTime };
        }) : null;
        await addPath(points, modeName(segment.activity?.topCandidate?.type));
      }
      if (segment.visit) {
        const candidate = segment.visit.topCandidate ?? segment.visit;
        await addVisit({ time: start, position: parseTimelinePosition(candidate.placeLocation ?? candidate.location), title: candidate.name || ({ HOME: '집', WORK: '직장', UNKNOWN: '방문 지점' })[candidate.semanticType] || '방문 지점', identity: candidate.placeId ? `visit:${candidate.placeId}` : 'visit' });
      }
      if (segment.activity && !segment.timelinePath) {
        const activity = segment.activity;
        for (const [key, time, title] of [['start', start, '이동 출발 지점'], ['end', end, '이동 도착 지점']]) {
          const position = parseTimelinePosition(activity[key]);
          if (position) await addVisit({ time, position, title, identity: `activity:${key}` });
        }
        warnings.add('출발·도착만 있는 이동은 장소로 보관하며 실제 이동 경로로 연결하지 않아요.');
      }
      if (!segment.timelinePath && !segment.visit && !segment.activity) stats.unsupportedSegments++;
    }
    if (![...days.values()].some(value => value.tracks.length) && Array.isArray(document.rawSignals)) {
      await rawPath(document.rawSignals.filter(signal => signal?.position));
      warnings.add('정리된 경로가 없어 원시 GPS 기록을 사용했어요. 위치를 확인해주세요.');
    }
  } else if (Array.isArray(document.timelineObjects)) {
    for (const item of document.timelineObjects) {
      if (item?.placeVisit) {
        const visit = item.placeVisit;
        await addVisit({ time: parseTimelineTime(visit.duration?.startTimestamp ?? visit.duration?.startTimestampMs), position: parseTimelinePosition(visit.location), title: visit.location?.name, identity: visit.location?.placeId ? `visit:${visit.location.placeId}` : 'visit' });
      }
      if (item?.activitySegment) {
        const activity = item.activitySegment, points = activity.simplifiedRawPath?.points ?? activity.waypointPath?.waypoints;
        if (Array.isArray(points)) await addPath(points.map(point => ({ position: parseTimelinePosition(point), time: parseTimelineTime(point.timestamp ?? point.timestampMs) })), modeName(activity.activityType));
        else {
          for (const [location, time, title, identity] of [[activity.startLocation, activity.duration?.startTimestamp ?? activity.duration?.startTimestampMs, '이동 출발 지점', 'activity:start'], [activity.endLocation, activity.duration?.endTimestamp ?? activity.duration?.endTimestampMs, '이동 도착 지점', 'activity:end']]) {
            const position = parseTimelinePosition(location); if (position) await addVisit({ time: parseTimelineTime(time), position, title, identity });
          }
          warnings.add('출발·도착만 있는 이동은 장소로 보관하며 실제 이동 경로로 연결하지 않아요.');
        }
      }
      if (!item?.placeVisit && !item?.activitySegment) stats.unsupportedSegments++;
    }
  } else if (Array.isArray(document.locations)) await rawPath(document.locations);
  else if (Array.isArray(document.rawSignals)) { await rawPath(document.rawSignals.filter(signal => signal?.position)); warnings.add('원시 GPS 기록을 사용했어요. 위치를 확인해주세요.'); }
  else throw new Error('지원하는 Google 타임라인 구조가 없어요. 내보낸 JSON 원본을 확인해주세요.');
  const result = [];
  for (const value of [...days.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    // Duplicate raw source IDs are normalized before strict persisted-day validation.
    const recordMap = new Map(); for (const record of value.records) { if (recordMap.has(record.id)) stats.duplicateRecords++; else recordMap.set(record.id, record); }
    const trackMap = new Map(); for (const track of value.tracks) if (!trackMap.has(track.id)) trackMap.set(track.id, track);
    const merged = mergeDayImport(emptyDay(value.date), { source, records: [...recordMap.values()], tracks: [...trackMap.values()] });
    stats.duplicateEdges += merged.duplicateEdges;
    if (merged.day.records.length || merged.day.tracks.length) result.push(validateDay(merged.day));
  }
  if (stats.skippedPoints) warnings.add(`${stats.skippedPoints.toLocaleString()}개 기록점은 좌표·시각이 없어 제외했어요. 시간을 만들어 넣지는 않았어요.`);
  if (stats.unsupportedSegments) warnings.add(`${stats.unsupportedSegments.toLocaleString()}개 구간은 지원하지 않는 형식이에요.`);
  if (!result.length) throw new Error('날짜를 확인할 수 있는 장소나 이동 경로가 없어요. 원본을 확인하거나 직접 입력해주세요.');
  stats.days = result.length; stats.records = result.reduce((count, value) => count + value.records.length, 0); stats.tracks = result.reduce((count, value) => count + value.tracks.length, 0); stats.points = result.reduce((count, value) => count + value.tracks.reduce((sum, track) => sum + track.points.length, 0), 0);
  return { days: result, source, warnings: [...warnings], stats };
}
