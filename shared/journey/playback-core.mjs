import { JOURNEY_PEOPLE, validDate, validateDay } from './core.mjs';

export const JOURNEY_PLAYBACK_LIMITS = Object.freeze({ maxScenes: 60, maxPerMonth: 6, nearbyMeters: 150, nearbyMinutes: 90, largeMoveMeters: 10000, segmentPoints: 512 });
const finitePosition = value => value && Number.isFinite(value.lat) && Number.isFinite(value.lng) && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180;
const position = value => finitePosition(value) ? { lat: value.lat, lng: value.lng } : null;
const clone = value => structuredClone(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const order = (a, b) => a.date.localeCompare(b.date) || (a.time ?? Infinity) - (b.time ?? Infinity) || a.id.localeCompare(b.id);

export function journeyDistance(a, b) {
  if (!finitePosition(a) || !finitePosition(b)) return Infinity;
  const radians = Math.PI / 180, latitude = (b.lat - a.lat) * radians, longitude = (b.lng - a.lng) * radians;
  const h = Math.sin(latitude / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(longitude / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(clamp(h, 0, 1)), Math.sqrt(clamp(1 - h, 0, 1)));
}

function bounds(points) {
  const values = points.filter(finitePosition);
  if (!values.length) return null;
  return { south: Math.min(...values.map(p => p.lat)), west: Math.min(...values.map(p => p.lng)), north: Math.max(...values.map(p => p.lat)), east: Math.max(...values.map(p => p.lng)) };
}

function recordCandidate(record, day) {
  return { id: `${day.date}:record:${record.id}`, date: day.date, revision: day.revision, person: record.person, title: record.title, time: record.time, endTime: record.time, position: position(record.position), recordIds: [record.id], trackIds: [] };
}

function excursionBetween(points, firstTime, lastTime, origin) {
  let low = 0, high = points.length;
  while (low < high) { const middle = (low + high) >>> 1; if (points[middle].time < firstTime) low = middle + 1; else high = middle; }
  for (let i = low; i < points.length && points[i].time <= lastTime; i++) if (journeyDistance(origin, points[i]) > JOURNEY_PLAYBACK_LIMITS.nearbyMeters) return true;
  return false;
}

function canGroup(previous, record, evidence) {
  const last = previous.records.at(-1);
  if (!last || journeyDistance(last.position, record.position) > JOURNEY_PLAYBACK_LIMITS.nearbyMeters || journeyDistance(previous.records[0].position, record.position) > JOURNEY_PLAYBACK_LIMITS.nearbyMeters) return false;
  if ((last.edited || record.edited) && last.title !== record.title) return false;
  if (last.time === null || record.time === null) return last.time === null && record.time === null && last.title === record.title;
  return record.time >= last.time && record.time - last.time <= JOURNEY_PLAYBACK_LIMITS.nearbyMinutes * 60000 && !excursionBetween(evidence, last.time, record.time, last.position);
}

/** Read-only public playback projection: no notes, source files, hashes or author IDs. */
export function buildDayCandidates(input) {
  const day = validateDay(input), groups = [];
  for (const person of JOURNEY_PEOPLE) {
    const records = day.records.filter(record => record.person === person).sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || a.id.localeCompare(b.id));
    const evidence = day.tracks.filter(track => track.person === person).flatMap(track => track.points).sort((a, b) => a.time - b.time);
    let active;
    for (const record of records) {
      if (active && canGroup(active, record, evidence)) {
        active.records.push(record); active.candidate.recordIds.push(record.id); active.candidate.endTime = record.time;
        if (record.edited && !active.records.slice(0, -1).some(value => value.edited)) active.candidate.title = record.title;
      } else { active = { records: [record], candidate: recordCandidate(record, day) }; groups.push(active); }
    }
  }
  const candidates = groups.map(group => group.candidate);
  for (const track of day.tracks) {
    const first = track.points[0], last = track.points.at(-1);
    candidates.push({ id: `${day.date}:track:${track.id}`, date: day.date, revision: day.revision, person: track.person, title: day.title || '이날의 이동', time: first.time, endTime: last.time, position: position(first), endPosition: position(last), bounds: bounds(track.points), moving: track.points.some(point => journeyDistance(first, point) > .1), recordIds: [], trackIds: [track.id] });
  }
  candidates.sort(order);
  return { date: day.date, revision: day.revision, candidates };
}

function checkedCandidate(value, day) {
  if (!value || typeof value.id !== 'string' || !validDate(value.date) || value.date !== day.date || !JOURNEY_PEOPLE.includes(value.person)) return null;
  if (!finitePosition(value.position) || !Array.isArray(value.recordIds) || !Array.isArray(value.trackIds)) return null;
  if (value.time !== null && !Number.isFinite(value.time) || value.endTime !== null && !Number.isFinite(value.endTime)) return null;
  return { ...clone(value), revision: day.revision ?? value.revision };
}

function rankMonth(items, mandatory, limit, priorities) {
  const chosen = items.filter(item => mandatory.has(item.id)).slice(0, limit), picked = new Set(chosen.map(item => item.id));
  const index = new Map(items.map((item, i) => [item.id, i]));
  while (chosen.length < Math.min(limit, items.length)) {
    const people = new Set(chosen.map(item => item.person));
    const score = item => [people.has(item.person) ? 0 : 1, priorities.get(item.id) || 0, chosen.length ? Math.min(...chosen.map(value => Math.abs(index.get(value.id) - index.get(item.id)))) : 0];
    const remaining = items.filter(item => !picked.has(item.id));
    remaining.sort((a, b) => { const x = score(a), y = score(b); return y[0] - x[0] || y[1] - x[1] || y[2] - x[2] || order(a, b); });
    if (!remaining.length) break;
    chosen.push(remaining[0]); picked.add(remaining[0].id);
  }
  return chosen;
}

/** Select representative scenes without letting dense recent imports consume the period. */
export function selectJourneyScenes(daySummaries, options = {}) {
  const { person = 'all', from, to } = options;
  if (person !== 'all' && !JOURNEY_PEOPLE.includes(person)) throw Error('이동한 사람을 확인해주세요.');
  if (from !== undefined && !validDate(from) || to !== undefined && !validDate(to) || from && to && from > to) throw Error('조회할 기간을 확인해주세요.');
  const maxScenes = clamp(Math.floor(options.maxScenes || JOURNEY_PLAYBACK_LIMITS.maxScenes), 1, 60);
  const maxPerMonth = clamp(Math.floor(options.maxPerMonth || JOURNEY_PLAYBACK_LIMITS.maxPerMonth), 1, 6);
  const latestDays = new Map();
  for (const day of daySummaries || []) {
    if (!validDate(day?.date) || from && day.date < from || to && day.date > to) continue;
    if (!latestDays.has(day.date) || (day.revision ?? 0) >= (latestDays.get(day.date).revision ?? 0)) latestDays.set(day.date, day);
  }
  const unique = new Map();
  for (const day of latestDays.values()) for (const input of day.candidates || []) {
    const value = checkedCandidate(input, day);
    if (value && (person === 'all' || person === value.person)) unique.set(value.id, value);
  }
  const items = [...unique.values()].sort(order);
  if (!items.length) return [];
  const canKeepLast = maxScenes > 1 && (maxPerMonth > 1 || items[0].date.slice(0, 7) !== items.at(-1).date.slice(0, 7));
  const mandatory = new Set([items[0].id, ...(canKeepLast ? [items.at(-1).id] : [])]);
  const priorities = new Map(), previous = new Map(), months = new Map();
  for (const item of items) {
    const prior = previous.get(item.person), distance = prior ? journeyDistance(prior.endPosition || prior.position, item.position) : 0;
    const box = item.bounds;
    const ownDistance = Math.max(item.endPosition ? journeyDistance(item.position, item.endPosition) : 0, box ? journeyDistance({ lat: box.south, lng: box.west }, { lat: box.north, lng: box.east }) : 0);
    priorities.set(item.id, item.person === 'together' ? 2 : Math.max(distance, ownDistance) >= JOURNEY_PLAYBACK_LIMITS.largeMoveMeters ? 1 : 0);
    previous.set(item.person, item);
    const key = item.date.slice(0, 7); if (!months.has(key)) months.set(key, []); months.get(key).push(item);
  }
  const pools = [...months.values()].map(values => rankMonth(values, mandatory, maxPerMonth, priorities));
  const selected = items.filter(item => mandatory.has(item.id)), selectedIds = new Set(selected.map(item => item.id));
  const counts = new Map(); for (const item of selected) counts.set(item.date.slice(0, 7), (counts.get(item.date.slice(0, 7)) || 0) + 1);
  const monthCount = item => counts.get(item.date.slice(0, 7)) || 0;
  const addSelected = item => { selected.push(item); selectedIds.add(item.id); counts.set(item.date.slice(0, 7), monthCount(item) + 1); };
  // Sparse evidence from either person must survive the global budget too.
  // Prefer an unrepresented month so this does not needlessly reduce coverage.
  for (const owner of JOURNEY_PEOPLE) {
    if (selected.length >= maxScenes || selected.some(item => item.person === owner)) continue;
    const next = items.filter(item => item.person === owner && !selectedIds.has(item.id) && monthCount(item) < maxPerMonth)
      .sort((a, b) => Number(monthCount(a) > 0) - Number(monthCount(b) > 0) || (priorities.get(b.id) || 0) - (priorities.get(a.id) || 0) || order(a, b))[0];
    if (next) addSelected(next);
  }
  // With longer archives than the scene budget, evenly spaced months remain represented.
  let monthIndexes = pools.map((_, i) => i);
  if (pools.length > maxScenes) monthIndexes = [...new Set(Array.from({ length: maxScenes }, (_, i) => Math.round(i * (pools.length - 1) / Math.max(1, maxScenes - 1))))];
  for (let round = 0; round < maxPerMonth && selected.length < maxScenes; round++) {
    for (const monthIndex of monthIndexes) {
      const pool = pools[monthIndex];
      const count = monthCount(pool[0]);
      if (count > round) continue;
      const next = pool.find(item => !selectedIds.has(item.id));
      if (next) addSelected(next);
      if (selected.length >= maxScenes) break;
    }
  }
  return mergeOverlappingScenes(selected.sort(order));
}

/** Keep overlapping evidence on one real clock; do not replay the same hour twice. */
function mergeOverlappingScenes(items) {
  const groups = [];
  for (const item of items) {
    const previous = groups.at(-1), exact = Number.isFinite(item.time) && Number.isFinite(item.endTime);
    if (exact && previous && Number.isFinite(previous.time) && previous.date === item.date && item.time <= previous.endTime) {
      previous.members.push(clone(item));
      previous.endTime = Math.max(previous.endTime, item.endTime);
      previous.recordIds.push(...item.recordIds); previous.trackIds.push(...item.trackIds);
      previous.people = JOURNEY_PEOPLE.filter(person => previous.members.some(member => member.person === person));
      previous.person = previous.people.length === 1 ? previous.people[0] : 'multiple';
      previous.moving ||= item.moving === true;
      const last = previous.members.reduce((latest, member) => member.endTime > latest.endTime ? member : latest);
      previous.endPosition = clone(last.endPosition || last.position);
      const corners = previous.members.flatMap(member => member.bounds ? [{ lat: member.bounds.south, lng: member.bounds.west }, { lat: member.bounds.north, lng: member.bounds.east }] : [member.position, member.endPosition].filter(Boolean));
      previous.bounds = bounds(corners);
    } else groups.push({ ...clone(item), people: [item.person], members: [clone(item)] });
  }
  return groups;
}

// Time-aware error keeps bends AND pauses; geometric-only simplification can erase dwell time.
function simplifyAtTolerance(points, tolerance) {
  if (points.length < 3) return points.slice();
  const keep = new Set([0, points.length - 1]), stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop(), a = points[first], b = points[last];
    let maximum = tolerance, at = -1;
    for (let i = first + 1; i < last; i++) {
      const ratio = b.time > a.time ? clamp((points[i].time - a.time) / (b.time - a.time), 0, 1) : (i - first) / (last - first);
      const estimated = { lat: a.lat + (b.lat - a.lat) * ratio, lng: a.lng + (b.lng - a.lng) * ratio };
      const error = journeyDistance(points[i], estimated);
      if (error > maximum) { maximum = error; at = i; }
    }
    if (at !== -1) { keep.add(at); stack.push([first, at], [at, last]); }
  }
  return [...keep].sort((a, b) => a - b).map(index => points[index]);
}

export function simplifyJourneyPoints(points, maxPoints = JOURNEY_PLAYBACK_LIMITS.segmentPoints) {
  const max = Math.max(2, Math.floor(maxPoints)), original = points.map(point => ({ lat: point.lat, lng: point.lng, time: point.time }));
  if (original.length <= max) return original;
  let tolerance = 25, result = simplifyAtTolerance(original, tolerance);
  while (result.length > max) { tolerance *= 2; result = simplifyAtTolerance(original, tolerance); }
  return result;
}

export function prepareJourneyScene(candidate, input, { simplifyPoints = simplifyJourneyPoints } = {}) {
  const day = validateDay(input);
  const changed = () => { const error = Error('이 날짜의 기록이 바뀌었어요. 기간을 다시 불러와주세요.'); error.code = 'JOURNEY_SCENE_CHANGED'; throw error; };
  if (!candidate || candidate.date !== day.date || Number.isSafeInteger(candidate.revision) && candidate.revision !== day.revision) changed();
  const recordIds = new Set(candidate.recordIds || []), trackIds = new Set(candidate.trackIds || []);
  const members = candidate.members || [candidate], recordOwners = new Map(), trackOwners = new Map();
  for (const member of members) {
    if (member.date !== day.date || !JOURNEY_PEOPLE.includes(member.person) || Number.isSafeInteger(member.revision) && member.revision !== day.revision) changed();
    for (const [ids, owners] of [[member.recordIds || [], recordOwners], [member.trackIds || [], trackOwners]]) for (const id of ids) {
      if (owners.has(id) && owners.get(id) !== member.person) changed();
      owners.set(id, member.person);
    }
  }
  if (recordOwners.size !== recordIds.size || trackOwners.size !== trackIds.size || [...recordIds].some(id => !recordOwners.has(id)) || [...trackIds].some(id => !trackOwners.has(id))) changed();
  const records = day.records.filter(record => recordIds.has(record.id) && record.person === recordOwners.get(record.id)).map(record => ({ id: record.id, title: record.title, person: record.person, position: position(record.position), time: record.time, timePrecision: record.timePrecision, ...(record.photoId ? { photoId: record.photoId } : {}) }));
  const tracks = day.tracks.filter(track => trackIds.has(track.id) && track.person === trackOwners.get(track.id));
  if (records.length !== recordIds.size || tracks.length !== trackIds.size) changed();
  const segments = tracks.map(track => ({ id: track.id, person: track.person, points: simplifyPoints(track.points) }));
  const times = [candidate.time, candidate.endTime, ...segments.flatMap(segment => [segment.points[0]?.time, segment.points.at(-1)?.time])].filter(Number.isFinite);
  const startTime = times.length ? Math.min(...times) : candidate.time ?? null, endTime = times.length ? Math.max(...times) : candidate.endTime ?? startTime;
  const moving = segments.some(segment => segment.points.length > 1 && segment.points.at(-1).time > segment.points[0].time && segment.points.some(point => journeyDistance(segment.points[0], point) > .1));
  return { ...clone(candidate), revision: day.revision, people: JOURNEY_PEOPLE.filter(person => members.some(member => member.person === person)), records, segments, time: startTime, endTime, startTime, moving };
}
