import { JOURNEY_PEOPLE, validDate, validateDay } from './core.mjs';
import { journeyDistance, prepareJourneyScene } from './playback-core.mjs?v=3.0.0';

const validPosition = value => value && Number.isFinite(value.lat) && Number.isFinite(value.lng) && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180;
const position = value => validPosition(value) ? { lat: value.lat, lng: value.lng } : null;
const unique = values => [...new Set(values)];
const clamp = value => Math.max(0, Math.min(1, value));
export const wrapJourneyLongitude = value => ((value + 180) % 360 + 360) % 360 - 180;
export const interpolateJourneyLongitude = (from, to, progress) => wrapJourneyLongitude(from + wrapJourneyLongitude(to - from) * progress);

/** Smallest longitude arc, including paths crossing the international date line. */
export function journeyMotionBounds(points) {
  let south = Infinity, north = -Infinity;
  const longitudeSet = new Set();
  for (const value of points) {
    if (!validPosition(value)) continue;
    south = Math.min(south, value.lat); north = Math.max(north, value.lat);
    longitudeSet.add(wrapJourneyLongitude(value.lng));
  }
  if (!longitudeSet.size) return null;
  const longitudes = [...longitudeSet].sort((a, b) => a - b);
  let gap = -1, afterGap = 0;
  for (let index = 0; index < longitudes.length; index++) {
    const next = index + 1 < longitudes.length ? longitudes[index + 1] : longitudes[0] + 360;
    if (next - longitudes[index] > gap) { gap = next - longitudes[index]; afterGap = (index + 1) % longitudes.length; }
  }
  const west = longitudes[afterGap], east = west + (360 - gap);
  return { south, north, west, east };
}

/** One daily container retains every selected person's source record and track. */
export function selectJourneyMotionScenes(daySummaries, { person = 'all', from, to } = {}) {
  if (person !== 'all' && !JOURNEY_PEOPLE.includes(person)) throw Error('이동한 사람을 확인해주세요.');
  if (from !== undefined && !validDate(from) || to !== undefined && !validDate(to) || from && to && from > to) throw Error('조회할 기간을 확인해주세요.');
  const latest = new Map();
  for (const day of daySummaries || []) {
    if (!validDate(day?.date) || from && day.date < from || to && day.date > to) continue;
    if (!latest.has(day.date) || (day.revision ?? 0) >= (latest.get(day.date).revision ?? 0)) latest.set(day.date, day);
  }
  const scenes = [];
  for (const day of [...latest.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    const byId = new Map();
    for (const candidate of day.candidates || []) {
      if (candidate?.date !== day.date || typeof candidate.id !== 'string' || !JOURNEY_PEOPLE.includes(candidate.person) || person !== 'all' && candidate.person !== person) continue;
      if (!Array.isArray(candidate.recordIds) || !Array.isArray(candidate.trackIds) || !candidate.recordIds.every(id => typeof id === 'string') || !candidate.trackIds.every(id => typeof id === 'string')) continue;
      if (candidate.time !== null && !Number.isFinite(candidate.time) || candidate.endTime !== null && !Number.isFinite(candidate.endTime)) continue;
      byId.set(candidate.id, {
        id: candidate.id, date: day.date, revision: day.revision ?? candidate.revision,
        person: candidate.person, title: candidate.title || '이날의 기록',
        time: candidate.time, endTime: candidate.endTime, position: position(candidate.position), endPosition: position(candidate.endPosition),
        moving: candidate.moving === true, recordIds: unique(candidate.recordIds), trackIds: unique(candidate.trackIds),
      });
    }
    const members = [...byId.values()].sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || a.id.localeCompare(b.id));
    if (!members.length) continue;
    const people = JOURNEY_PEOPLE.filter(value => members.some(member => member.person === value));
    const times = members.flatMap(member => [member.time, member.endTime]).filter(Number.isFinite);
    const trackIds = unique(members.flatMap(member => member.trackIds));
    const last = members.filter(member => Number.isFinite(member.endTime)).sort((a, b) => b.endTime - a.endTime)[0] || members.at(-1);
    scenes.push({ id: `${day.date}:motion:${person}`, date: day.date, revision: day.revision,
      motion: true, person: people.length === 1 ? people[0] : 'multiple', people, members,
      title: trackIds.length ? '이날의 이동' : '이날의 기억',
      time: times.length ? Math.min(...times) : null, endTime: times.length ? Math.max(...times) : null,
      position: members.find(member => member.position)?.position || null, endPosition: last.endPosition || last.position,
      recordIds: unique(members.flatMap(member => member.recordIds)), trackIds, moving: members.some(member => member.moving),
    });
  }
  return scenes;
}

function simplifyAtTolerance(points, tolerance) {
  const keep = new Set([0, points.length - 1]), stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop(), a = points[first], b = points[last];
    let maximum = tolerance, at = -1;
    for (let index = first + 1; index < last; index++) {
      const ratio = b.time > a.time ? clamp((points[index].time - a.time) / (b.time - a.time)) : (index - first) / (last - first);
      const expected = { lat: a.lat + (b.lat - a.lat) * ratio, lng: interpolateJourneyLongitude(a.lng, b.lng, ratio) };
      const error = journeyDistance(points[index], expected);
      if (error > maximum) { maximum = error; at = index; }
    }
    if (at !== -1) { keep.add(at); stack.push([first, at], [at, last]); }
  }
  return [...keep].sort((a, b) => a - b).map(index => ({ ...points[index] }));
}

export function simplifyJourneyMotionPoints(points, maxPoints = 512) {
  const copy = points.map(point => ({ lat: point.lat, lng: point.lng, time: point.time }));
  if (copy.length <= Math.max(2, maxPoints)) return copy;
  let tolerance = 25, result = simplifyAtTolerance(copy, tolerance);
  while (result.length > Math.max(2, maxPoints)) { tolerance *= 2; result = simplifyAtTolerance(copy, tolerance); }
  return result;
}

/** One shared clock: simultaneous people do not double the screen-time budget. */
export function buildJourneyMotionSpans(segments, records = []) {
  const times = records.map(record => record.time).filter(Number.isFinite), events = new Map();
  for (const segment of segments) {
    for (const point of segment.points) if (Number.isFinite(point.time)) times.push(point.time);
    for (let index = 1; index < segment.points.length; index++) {
      const a = segment.points[index - 1], b = segment.points[index];
      if (b.time <= a.time || journeyDistance(a, b) <= .1) continue;
      events.set(a.time, (events.get(a.time) || 0) + 1); events.set(b.time, (events.get(b.time) || 0) - 1);
    }
  }
  if (!times.length) return [{ start: null, end: null, kind: 'memory', weight: 60000 }];
  const start = Math.min(...times), end = Math.max(...times);
  if (start === end) return [{ start, end, kind: 'memory', weight: 60000 }];
  const boundaries = unique([start, end, ...events.keys()]).sort((a, b) => a - b), spans = [];
  let active = 0;
  for (let index = 0; index < boundaries.length - 1; index++) {
    const a = boundaries[index], b = boundaries[index + 1]; active += events.get(a) || 0;
    const kind = active > 0 ? 'moving' : 'gap', previous = spans.at(-1);
    if (previous?.kind === kind && previous.end === a) previous.end = b;
    else spans.push({ start: a, end: b, kind });
  }
  return spans.map(span => ({ ...span, weight: span.kind === 'moving' ? Math.max(1000, span.end - span.start) : Math.min(60000, span.end - span.start) }));
}

export function prepareJourneyMotionScene(candidate, input) {
  // Keep the existing revision and per-member ownership validation contract.
  const day = validateDay(input), prepared = prepareJourneyScene(candidate, day, { simplifyPoints: simplifyJourneyMotionPoints }), selected = new Set(candidate.trackIds);
  const tracks = day.tracks.filter(track => selected.has(track.id));
  const segments = prepared.segments;
  // Timing comes from original samples, before geometric simplification.
  const motionSpans = buildJourneyMotionSpans(tracks, prepared.records);
  const bounds = journeyMotionBounds([...segments.flatMap(segment => segment.points), ...prepared.records.map(record => record.position)]);
  return { ...prepared, motion: true, segments, motionSpans, motionWeight: motionSpans.reduce((sum, span) => sum + span.weight, 0), bounds };
}
