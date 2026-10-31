// Shared, dependency-free data contract. Never reads storage or starts a network request.
export const JOURNEY_LIMITS = Object.freeze({ dayBytes: 600 * 1024, records: 1000, tracks: 1000, points: 12000, imports: 500, title: 160, note: 5000 });
export const JOURNEY_PEOPLE = Object.freeze(['sungwoo', 'sohee', 'together']);
const idPattern = /^[a-zA-Z0-9_-]{1,160}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function fail(message) { const error = new Error(message); error.code = 'JOURNEY_INVALID'; throw error; }
function keys(value, allowed, label) { if (!object(value)) fail(`${label} 형식이 올바르지 않습니다.`); if (Object.keys(value).some(key => !allowed.includes(key))) fail(`${label}에 지원하지 않는 항목이 있습니다.`); }
function text(value, limit, label, fallback = '') { const result = value === undefined ? fallback : value; if (typeof result !== 'string' || result.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) fail(`${label} 길이 또는 형식이 올바르지 않습니다.`); return result; }
function id(value, label) { if (typeof value !== 'string' || !idPattern.test(value)) fail(`${label} ID가 올바르지 않습니다.`); return value; }
export function validDate(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const time = Date.parse(`${value}T00:00:00Z`); return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value; }
export function validMonth(value) { return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && validDate(`${value}-01`); }
export function dateInKorea(time) { if (!Number.isFinite(time) || Math.abs(time) > 8640000000000000 - 32400000) return ''; try { return new Date(time + 32400000).toISOString().slice(0, 10); } catch { return ''; } }
export function koreanDateTime(time) { if (time === null || !Number.isFinite(time)) return ''; return new Date(time + 32400000).toISOString().slice(0, 16); }
export function timeFromKorea(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return null; const time = Date.parse(`${value}+09:00`); return Number.isFinite(time) && koreanDateTime(time) === value.slice(0, 16) ? time : null; }
export function validatePerson(value) { if (!JOURNEY_PEOPLE.includes(value)) fail('이동한 사람을 선택해주세요.'); return value; }
export function validatePosition(value) { if (value === null) return null; keys(value, ['lat', 'lng'], '위치'); if (!Number.isFinite(value.lat) || !Number.isFinite(value.lng) || Math.abs(value.lat) > 90 || Math.abs(value.lng) > 180) fail('위도·경도가 올바르지 않습니다.'); return { lat: value.lat, lng: value.lng }; }
function timestamp(value, label, nullable = true) { if (nullable && value === null) return null; if (!Number.isSafeInteger(value) || !dateInKorea(value) || !validDate(dateInKorea(value))) fail(`${label} 시각이 올바르지 않습니다.`); return value; }
export function validateSource(value) {
  keys(value, ['id', 'hash', 'name', 'person', 'kind', 'importedAt'], '가져오기 정보');
  if (typeof value.hash !== 'string' || !/^[a-f0-9]{64}$/i.test(value.hash)) fail('원본 파일 확인값이 올바르지 않습니다.');
  if (value.kind !== undefined && value.kind !== 'timeline') fail('지원하지 않는 자료 형식입니다.');
  return { id: id(value.id, '원본'), hash: value.hash.toLowerCase(), name: text(value.name, 240, '파일 이름'), person: validatePerson(value.person), kind: 'timeline', importedAt: timestamp(value.importedAt ?? 0, '가져오기', false) };
}
export function validateRecord(value, date) {
  keys(value, ['id', 'person', 'kind', 'title', 'note', 'time', 'position', 'photoId', 'sourceId', 'timePrecision', 'edited'], '기록');
  if (!['visit', 'photo', 'manual'].includes(value.kind)) fail('기록 종류가 올바르지 않습니다.');
  const time = timestamp(value.time ?? null, '기록');
  if (time !== null && dateInKorea(time) !== date) fail('기록 시각과 선택한 날짜가 다릅니다.');
  const timePrecision = value.timePrecision ?? (time === null ? 'day' : 'exact');
  if (!['exact', 'day'].includes(timePrecision) || (time === null) !== (timePrecision === 'day')) fail('기록 시각의 정확도를 확인해주세요.');
  const record = { id: id(value.id, '기록'), person: validatePerson(value.person), kind: value.kind, title: text(value.title, JOURNEY_LIMITS.title, '장소 이름'), note: text(value.note, JOURNEY_LIMITS.note, '메모'), time, position: validatePosition(value.position ?? null), timePrecision };
  if (!record.title.trim()) fail('장소 이름을 입력해주세요.');
  if (value.photoId !== undefined) { if (typeof value.photoId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.photoId)) fail('사진 ID가 올바르지 않습니다.'); record.photoId = value.photoId; }
  if (value.sourceId !== undefined) record.sourceId = id(value.sourceId, '원본');
  if (value.edited !== undefined) { if (typeof value.edited !== 'boolean') fail('수정 상태가 올바르지 않습니다.'); record.edited = value.edited; }
  return record;
}
export function validateTrack(value, date) {
  keys(value, ['id', 'person', 'points', 'sourceId', 'mode'], '이동 경로');
  if (!Array.isArray(value.points) || value.points.length < 1 || value.points.length > JOURNEY_LIMITS.points) fail('이동 경로의 기록점 수가 올바르지 않습니다.');
  let previous = null;
  const points = value.points.map(point => {
    keys(point, ['lat', 'lng', 'time'], '경로 기록점'); const position = validatePosition({ lat: point.lat, lng: point.lng }); const time = timestamp(point.time, '경로', false);
    if (dateInKorea(time) !== date || (previous !== null && time < previous)) fail('경로 시각의 날짜 또는 순서가 올바르지 않습니다.'); previous = time;
    return { ...position, time };
  });
  const result = { id: id(value.id, '경로'), person: validatePerson(value.person), points, sourceId: id(value.sourceId, '원본') };
  if (value.mode !== undefined) result.mode = text(value.mode, 48, '이동 수단');
  return result;
}
export function emptyDay(date) { if (!validDate(date)) fail('날짜가 올바르지 않습니다.'); return { date, title: '', note: '', revision: 0, records: [], tracks: [], imports: [] }; }
export function validateDay(input) {
  keys(input, ['date', 'title', 'note', 'revision', 'records', 'tracks', 'imports'], '하루 기록');
  if (!validDate(input.date)) fail('날짜가 올바르지 않습니다.');
  const revision = input.revision ?? 0; if (!Number.isSafeInteger(revision) || revision < 0) fail('저장 버전이 올바르지 않습니다.');
  for (const [key, limit] of [['records', JOURNEY_LIMITS.records], ['tracks', JOURNEY_LIMITS.tracks], ['imports', JOURNEY_LIMITS.imports]]) if (!Array.isArray(input[key] ?? []) || (input[key]?.length ?? 0) > limit) fail('하루 기록의 저장 한도를 넘었습니다. 날짜를 나누거나 기록을 줄여주세요.');
  const day = { date: input.date, title: text(input.title, JOURNEY_LIMITS.title, '하루 제목'), note: text(input.note, JOURNEY_LIMITS.note, '하루 메모'), revision, records: (input.records ?? []).map(record => validateRecord(record, input.date)), tracks: (input.tracks ?? []).map(track => validateTrack(track, input.date)), imports: (input.imports ?? []).map(validateSource) };
  for (const key of ['records', 'tracks', 'imports']) { const ids = new Set(); for (const entry of day[key]) { if (ids.has(entry.id)) fail('중복된 기록 ID가 있습니다.'); ids.add(entry.id); } }
  const sources = new Map(day.imports.map(source => [source.id, source]));
  for (const record of day.records) if (record.sourceId && !sources.has(record.sourceId) || record.kind === 'visit' && !record.sourceId) fail('기록의 원본 정보가 없습니다.');
  for (const track of day.tracks) if (!sources.has(track.sourceId) || sources.get(track.sourceId).person !== track.person) fail('경로와 원본의 이동한 사람 정보가 일치하지 않습니다.');
  if (day.tracks.reduce((count, track) => count + track.points.length, 0) > JOURNEY_LIMITS.points || new TextEncoder().encode(JSON.stringify(day)).byteLength > JOURNEY_LIMITS.dayBytes) fail('하루 기록의 저장 용량을 넘었습니다. 원본은 변경하지 않았습니다.');
  return day;
}
export function summarizeDay(input) { const day = validateDay(input); return { date: day.date, title: day.title || day.records[0]?.title || '이동 기록', revision: day.revision, recordCount: day.records.length, trackCount: day.tracks.length, photoCount: day.records.filter(record => record.photoId).length, people: JOURNEY_PEOPLE.filter(person => day.records.some(record => record.person === person) || day.tracks.some(track => track.person === person)), importCount: day.imports.length }; }
const pointKey = point => `${point.time}:${point.lat}:${point.lng}`;
const edgeKey = (person, a, b) => `${person}|${pointKey(a)}>${pointKey(b)}`;
export function mergeDayImport(existing, incoming) {
  const day = validateDay(existing); keys(incoming, ['source', 'records', 'tracks'], '추가 자료'); const source = validateSource(incoming.source);
  const parsed = validateDay({ ...emptyDay(day.date), records: incoming.records ?? [], tracks: incoming.tracks ?? [], imports: [source] });
  if (parsed.records.some(record => record.person !== source.person || record.sourceId !== source.id || record.kind !== 'visit' || record.photoId) || parsed.tracks.some(track => track.person !== source.person || track.sourceId !== source.id)) fail('원본과 이동한 사람 정보가 일치하지 않습니다.');
  const previousSource = day.imports.find(entry => entry.id === source.id);
  if (previousSource && (previousSource.hash !== source.hash || previousSource.person !== source.person)) fail('같은 원본 ID에 다른 파일 또는 사람 정보가 있습니다.');
  // A source is committed atomically per day. Re-importing it must not resurrect an
  // imported place that the user deliberately deleted after their first import.
  if (previousSource) return { day, changed: false, unchanged: true, addedRecords: 0, addedTracks: 0, duplicateRecords: parsed.records.length, duplicateEdges: parsed.tracks.reduce((sum, track) => sum + track.points.length - 1, 0) };
  const recordIds = new Set(day.records.map(record => record.id)), trackIds = new Set(day.tracks.map(track => track.id)), edges = new Set(), knownPoints = new Set();
  for (const track of day.tracks) { for (const point of track.points) knownPoints.add(`${track.person}|${pointKey(point)}`); for (let i = 1; i < track.points.length; i++) edges.add(edgeKey(track.person, track.points[i - 1], track.points[i])); }
  let addedRecords = 0, addedTracks = 0, duplicateRecords = 0, duplicateEdges = 0;
  for (const record of parsed.records) { if (recordIds.has(record.id)) { duplicateRecords++; continue; } day.records.push(record); recordIds.add(record.id); addedRecords++; }
  for (const track of parsed.tracks) {
    let run = [], piece = 0;
    if (track.points.length === 1) {
      const key = `${track.person}|${pointKey(track.points[0])}`;
      if (!knownPoints.has(key)) { let trackId = track.id; while (trackIds.has(trackId)) trackId = `${track.id.slice(0, 145)}_point${++piece}`; day.tracks.push({ ...track, id: trackId }); knownPoints.add(key); trackIds.add(trackId); addedTracks++; }
      continue;
    }
    const flush = () => { if (run.length < 2) { run = []; return; } let trackId = track.id; while (trackIds.has(trackId)) trackId = `${track.id.slice(0, 145)}_part${++piece}`; const next = { ...track, id: trackId, points: run }; day.tracks.push(next); trackIds.add(trackId); addedTracks++; run = []; };
    for (let i = 1; i < track.points.length; i++) { const a = track.points[i - 1], b = track.points[i], key = edgeKey(track.person, a, b); if (edges.has(key)) { duplicateEdges++; flush(); continue; } edges.add(key); knownPoints.add(`${track.person}|${pointKey(a)}`); knownPoints.add(`${track.person}|${pointKey(b)}`); if (!run.length) run.push(a); run.push(b); } flush();
  }
  const changed = addedRecords > 0 || addedTracks > 0;
  if (changed && !day.imports.some(entry => entry.id === source.id)) day.imports.push(source);
  day.records.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || a.id.localeCompare(b.id));
  return { day: validateDay(day), changed, unchanged: !changed, addedRecords, addedTracks, duplicateRecords, duplicateEdges };
}
