import test from 'node:test';
import assert from 'node:assert/strict';
import { dateInKorea, emptyDay, validateDay, validateSource, mergeDayImport, summarizeDay, timeFromKorea, JOURNEY_LIMITS } from '../../../shared/journey/core.mjs';
import { importTimeline, parseTimelinePosition, parseTimelineTime } from '../../../shared/journey/import.mjs';

const start = Date.parse('2026-10-18T14:00:00+09:00');
const source = { id: 'timeline_sungwoo_example', hash: 'a'.repeat(64), name: 'example.json', person: 'sungwoo', kind: 'timeline', importedAt: start };
const point = (index, time = start + index * 60000) => ({ lat: 37.5 + index * .001, lng: 127 + index * .001, time });
const track = (id, points, person = 'sungwoo') => ({ id, person, sourceId: source.id, points });
const record = (id = 'visit-a', overrides = {}) => ({ id, person: 'sungwoo', kind: 'visit', title: '공원', note: '', time: start, timePrecision: 'exact', position: { lat: 37.5, lng: 127 }, sourceId: source.id, ...overrides });
const document = { semanticSegments: [{ startTime: '2026-10-18T14:00:00+09:00', endTime: '2026-10-18T14:10:00+09:00', timelinePath: [{ point: 'geo:37.5,127.0', durationMinutesOffsetFromStartTime: 0 }, { point: '37.501°,127.001°', durationMinutesOffsetFromStartTime: '1' }, { point: 'geo:37.502,127.002', time: '2026-10-18T14:02:00+09:00' }] }, { startTime: '2026-10-18T14:10:00+09:00', visit: { topCandidate: { placeLocation: { latLng: 'geo:37.502,127.002' }, name: '가을 공원', placeId: 'public-test-place' } } }] };

test('manual/photo date-only records retain null time and unknown position through validation', () => {
  const day = validateDay({ ...emptyDay('2026-07-12'), title: '여름의 하루', records: [record('manual-a', { kind: 'manual', sourceId: undefined, time: null, timePrecision: 'day', position: null })] });
  assert.equal(day.records[0].time, null); assert.equal(day.records[0].position, null); assert.equal(summarizeDay(day).recordCount, 1);
});
test('strict schema rejects unknown/private fields, unsupported people, mismatched dates and ambiguous times', () => {
  assert.throws(() => validateDay({ ...emptyDay('2026-10-18'), uid: 'private-user' }));
  assert.throws(() => validateDay({ ...emptyDay('2026-10-18'), records: [record('x', { person: 'stranger' })] }));
  assert.throws(() => validateDay({ ...emptyDay('2026-10-17'), records: [record()] }));
  assert.throws(() => validateDay({ ...emptyDay('2026-10-18'), records: [record('x', { time: null, timePrecision: 'exact' })] }));
  assert.throws(() => validateDay({ ...emptyDay('2026-10-18'), tracks: [track('t', [point(1), point(0)])] }));
  assert.throws(() => validateDay({ ...emptyDay('2026-10-18'), records: [record('x', { photoId: '../../secret' })] }));
  assert.throws(() => validateSource({ ...source, hash: 'not-a-file-hash' }));
});
test('duplicate Timeline import is a no-op and cannot overwrite manual edits', () => {
  const original = { ...emptyDay('2026-10-18'), records: [record('a', { title: '직접 고친 장소', note: '사용자 메모', edited: true })], tracks: [track('t', [point(0), point(1), point(2)])], imports: [source], revision: 7 };
  const merged = mergeDayImport(original, { source, records: [record('a')], tracks: [track('same-under-new-id', [point(0), point(1), point(2)])] });
  assert.equal(merged.changed, false); assert.equal(merged.duplicateRecords, 1); assert.equal(merged.duplicateEdges, 2); assert.equal(merged.day.records[0].title, '직접 고친 장소'); assert.equal(merged.day.records[0].note, '사용자 메모'); assert.equal(merged.day.revision, 7); assert.deepEqual(original.tracks[0].points, [point(0), point(1), point(2)]);
});
test('overlapping new exports add only unseen edges, preserve gaps, and distinguish people', () => {
  const previous = { ...emptyDay('2026-10-18'), tracks: [track('old', [point(1), point(2)])], imports: [source] };
  const nextSource = { ...source, id: 'timeline_sungwoo_next', hash: 'b'.repeat(64) };
  const merged = mergeDayImport(previous, { source: nextSource, records: [], tracks: [{ ...track('new', [point(0), point(1), point(2), point(3)]), sourceId: nextSource.id }] });
  assert.equal(merged.addedTracks, 2); assert.equal(merged.duplicateEdges, 1);
  assert.deepEqual(merged.day.tracks.slice(1).map(value => value.points), [[point(0), point(1)], [point(2), point(3)]]);
  const second = { ...source, id: 'timeline_sohee_example', person: 'sohee' };
  const other = mergeDayImport(merged.day, { source: second, records: [], tracks: [{ ...track('sohee', [point(1), point(2)], 'sohee'), sourceId: second.id }] });
  assert.equal(other.addedTracks, 1); assert.deepEqual(summarizeDay(other.day).people, ['sungwoo', 'sohee']);
});
test('duplicate source file cannot introduce forged person or photo entries through import', () => {
  assert.throws(() => mergeDayImport(emptyDay('2026-10-18'), { source, records: [record('x', { person: 'sohee' })], tracks: [] }));
  assert.throws(() => mergeDayImport(emptyDay('2026-10-18'), { source, records: [record('x', { kind: 'manual' })], tracks: [] }));
});
test('modern semantic paths use real timestamps and zero-minute offset without timezone drift', async () => {
  const result = await importTimeline(document, { person: 'sungwoo', name: '타임라인.json' });
  assert.equal(result.days.length, 1); assert.equal(result.days[0].date, '2026-10-18'); assert.equal(result.days[0].tracks[0].points[0].time, start); assert.equal(result.days[0].tracks[0].points[1].time, start + 60000); assert.equal(result.days[0].records[0].title, '가을 공원'); assert.equal(result.source.person, 'sungwoo'); assert.equal(result.stats.points, 3);
  const again = await importTimeline(document, { person: 'sungwoo', name: 'renamed.json' });
  assert.equal(again.source.id, result.source.id); assert.equal(again.days[0].records[0].id, result.days[0].records[0].id);
  assert.equal(mergeDayImport(result.days[0], { source: again.source, records: again.days[0].records, tracks: again.days[0].tracks }).changed, false);
});
test('later exports retain semantic record IDs and overlapping timed edges', async () => {
  const first = await importTimeline(document, { person: 'sungwoo' });
  const expanded = structuredClone(document); expanded.semanticSegments[1].visit.topCandidate.name = '공원 이름 변경'; expanded.semanticSegments[0].timelinePath.push({ point: 'geo:37.503,127.003', time: '2026-10-18T14:03:00+09:00' });
  const next = await importTimeline(expanded, { person: 'sungwoo' });
  assert.notEqual(next.source.id, first.source.id); assert.equal(next.days[0].records[0].id, first.days[0].records[0].id);
  const merged = mergeDayImport(first.days[0], { source: next.source, records: next.days[0].records, tracks: next.days[0].tracks });
  assert.equal(merged.addedRecords, 0); assert.equal(merged.addedTracks, 1); assert.equal(merged.day.tracks.at(-1).points.length, 2); assert.equal(merged.day.records[0].title, '가을 공원');
});
test('invalid coordinates, missing time, midnight and reversed clocks break paths without fake bridges', async () => {
  const values = [
    ['2026-10-18T23:57:00+09:00', 'geo:37.5,127'], ['2026-10-18T23:58:00+09:00', 'geo:37.501,127.001'],
    ['2026-10-19T00:01:00+09:00', 'geo:37.502,127.002'], ['2026-10-19T00:02:00+09:00', 'geo:37.503,127.003'],
    ['2026-10-19T00:03:00+09:00', 'geo:999,127'], ['2026-10-19T00:04:00+09:00', 'geo:37.504,127.004'],
    ['2026-10-19T00:05:00+09:00', 'geo:37.505,127.005'], ['2026-10-19T00:01:00+09:00', 'geo:37.506,127.006'],
    ['2026-10-19T00:02:00+09:00', 'geo:37.507,127.007'], [null, 'geo:37.508,127.008']
  ];
  const result = await importTimeline({ semanticSegments: [{ timelinePath: values.map(([time, point]) => ({ time, point })) }] }, { person: 'sohee' });
  assert.deepEqual(result.days.map(day => day.date), ['2026-10-18', '2026-10-19']); assert.equal(result.days[0].tracks.length, 1); assert.equal(result.days[1].tracks.length, 3);
  assert.ok(result.warnings.some(value => value.includes('자정'))); assert.equal(result.stats.skippedPoints, 2);
});
test('activity endpoints remain explicit places and never become inferred road tracks', async () => {
  const result = await importTimeline({ semanticSegments: [{ startTime: '2026-10-18T14:00:00+09:00', endTime: '2026-10-18T15:00:00+09:00', activity: { start: { latLng: 'geo:37.5,127' }, end: { latLng: 'geo:37.7,127.2' }, topCandidate: { type: 'IN_PASSENGER_VEHICLE' } } }] }, { person: 'sungwoo' });
  assert.equal(result.days[0].tracks.length, 0); assert.deepEqual(result.days[0].records.map(value => value.title), ['이동 출발 지점', '이동 도착 지점']);
});
test('legacy placeVisit and raw GPS formats normalize E7 coordinates and preserve dates', async () => {
  const result = await importTimeline({ timelineObjects: [{ placeVisit: { location: { latitudeE7: 375000000, longitudeE7: 1270000000, name: '카페' }, duration: { startTimestampMs: String(start) } } }, { activitySegment: { simplifiedRawPath: { points: [{ lat: 37.5, lng: 127, timestampMs: String(start) }, { lat: 37.501, lng: 127.001, timestampMs: String(start + 60000) }] } } }] }, { person: 'together' });
  assert.equal(result.days[0].records[0].position.lat, 37.5); assert.equal(result.days[0].tracks.length, 1);
  const raw = await importTimeline({ locations: [{ latitudeE7: 375000000, longitudeE7: 1270000000, timestampMs: String(start) }, { latitudeE7: 375010000, longitudeE7: 1270010000, timestampMs: String(start + 60000) }] }, { person: 'sohee' });
  assert.equal(raw.days[0].tracks[0].points[1].lng, 127.001);
});
test('unrecognized or undated JSON fails with an actionable error and does not invent visits', async () => {
  await assert.rejects(importTimeline('{oops', { person: 'sungwoo' }), /JSON/);
  await assert.rejects(importTimeline({ format: 'journey-studio' }, { person: 'sungwoo' }), /타임라인/);
  await assert.rejects(importTimeline({ records: [] }, { person: 'sungwoo' }), /구조/);
  await assert.rejects(importTimeline({ locations: [{ lat: 37.5, lng: 127 }, { lat: 37.501, lng: 127.001 }] }, { person: 'sungwoo' }), /날짜/);
  assert.equal(parseTimelineTime('2026-10-18T14:00:00'), null); assert.equal(parseTimelinePosition('geo:,127'), null); assert.equal(parseTimelinePosition({ lat: '', lng: 127 }), null);
});
test('Korea date boundaries and impossible calendar dates are checked consistently', () => {
  assert.equal(dateInKorea(Date.parse('2026-10-17T15:00:00Z')), '2026-10-18'); assert.equal(timeFromKorea('2026-10-18T14:00'), start); assert.equal(timeFromKorea('2026-02-30T14:00'), null); assert.throws(() => emptyDay('2026-02-30'));
});
test('day size and point caps reject excess data before a Firestore write', () => {
  assert.throws(() => validateDay({ ...emptyDay('2026-10-18'), records: Array.from({ length: JOURNEY_LIMITS.records + 1 }, (_, index) => record(`x${index}`)) }), /한도/);
  assert.throws(() => validateDay({ ...emptyDay('2026-10-18'), records: Array.from({ length: 130 }, (_, index) => record(`x${index}`, { note: '한'.repeat(5000) })), imports: [source] }), /용량/);
});

test('same imported source remains a no-op after intentional removal or person/location edits', () => {
  const prior = { ...emptyDay('2026-10-18'), revision: 3, imports: [source], records: [record('edited', { person: 'sohee', edited: true, position: { lat: 37.6, lng: 127.1 }, title: '다시 확인한 장소' })] };
  const repeated = mergeDayImport(prior, { source: { ...source, name: 'renamed.json' }, records: [record('deleted'), record('edited')], tracks: [] });
  assert.equal(repeated.changed, false); assert.equal(repeated.day.records.length, 1); assert.equal(repeated.day.records[0].person, 'sohee'); assert.equal(repeated.day.records[0].position.lat, 37.6);
  const next = { ...source, id: 'next-export', hash: 'b'.repeat(64) };
  const overlapping = mergeDayImport(prior, { source: next, records: [{ ...record('edited'), sourceId: next.id }], tracks: [] });
  assert.equal(overlapping.changed, false); assert.equal(overlapping.day.records[0].person, 'sohee'); assert.equal(overlapping.day.records[0].title, '다시 확인한 장소');
});
test('source collisions, missing provenance and mismatched track owner are rejected', () => {
  const prior = { ...emptyDay('2026-10-18'), imports: [source] };
  assert.throws(() => mergeDayImport(prior, { source: { ...source, hash: 'b'.repeat(64) }, records: [], tracks: [] }), /다른 파일/);
  assert.throws(() => mergeDayImport(prior, { source: { ...source, person: 'sohee' }, records: [], tracks: [] }), /다른 파일/);
  assert.throws(() => validateDay({ ...emptyDay('2026-10-18'), records: [record()] }), /원본/);
  assert.throws(() => validateDay({ ...prior, tracks: [track('wrong-person', [point(0), point(1)], 'sohee')] }), /원본/);
});
test('source count cap blocks a genuinely new import but permits duplicate retry without edits', () => {
  const imports = Array.from({ length: JOURNEY_LIMITS.imports }, (_, index) => ({ ...source, id: `source-${index}` }));
  const prior = { ...emptyDay('2026-10-18'), imports };
  assert.equal(mergeDayImport(prior, { source: imports[0], records: [], tracks: [] }).changed, false);
  assert.throws(() => mergeDayImport(prior, { source, records: [record()], tracks: [] }), /한도/);
});
test('sparse explicit Timeline segments stay intact while raw GPS gaps split into single points', async () => {
  const positions = [{ point: 'geo:37.5,127', time: '2026-10-18T10:00:00+09:00' }, { point: 'geo:37.8,127.3', time: '2026-10-18T11:00:00+09:00' }];
  const semantic = await importTimeline({ semanticSegments: [{ timelinePath: positions }] }, { person: 'sungwoo' });
  assert.equal(semantic.days[0].tracks.length, 1); assert.equal(semantic.days[0].tracks[0].points.length, 2);
  const raw = await importTimeline({ locations: positions.map(value => ({ ...parseTimelinePosition(value.point), timestamp: value.time })) }, { person: 'sungwoo' });
  assert.equal(raw.days[0].tracks.length, 2); assert.ok(raw.days[0].tracks.every(value => value.points.length === 1)); assert.equal(raw.stats.points, 2); assert.equal(raw.stats.skippedPoints, 0);
});
test('midnight single samples are retained on each date without a fabricated cross-day bridge', async () => {
  const result = await importTimeline({ semanticSegments: [{ timelinePath: [{ point: 'geo:37.5,127', time: '2026-10-18T23:59:00+09:00' }, { point: 'geo:37.6,127.1', time: '2026-10-19T00:01:00+09:00' }] }] }, { person: 'sungwoo' });
  assert.equal(result.days.length, 2); assert.equal(result.stats.points, 2); assert.ok(result.days.every(value => value.tracks.length === 1 && value.tracks[0].points.length === 1));
});
test('E7 and offset parsing does not turn blank coordinates or blank relative minutes into zero', async () => {
  assert.equal(parseTimelinePosition({ latitudeE7: 'bad', longitudeE7: 1270000000 }), null);
  assert.equal(parseTimelinePosition({ latitudeE7: '', longitudeE7: 1270000000 }), null);
  assert.equal(parseTimelinePosition({ latitudeE7: null, longitudeE7: 1270000000 }), null);
  assert.equal(parseTimelinePosition({ latitudeE7: 910000000, longitudeE7: 1270000000 }), null);
  assert.equal(parseTimelineTime(''), null); assert.equal(parseTimelineTime(1.5), null);
  assert.equal(parseTimelineTime('2026-02-30T14:00:00Z'), null);
  const result = await importTimeline({ semanticSegments: [{ startTime: '2026-10-18T14:00:00+09:00', timelinePath: [{ point: 'geo:37.5,127', durationMinutesOffsetFromStartTime: '' }, { point: 'geo:37.501,127.001', durationMinutesOffsetFromStartTime: '0' }] }] }, { person: 'sungwoo' });
  assert.equal(result.stats.points, 1); assert.equal(result.stats.skippedPoints, 1); assert.equal(result.days[0].tracks[0].points[0].time, start);
});
