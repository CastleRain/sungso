import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDay } from '../../../shared/journey/core.mjs';
import { buildDayCandidates, selectJourneyScenes, prepareJourneyScene, simplifyJourneyPoints, journeyDistance } from '../../../shared/journey/playback-core.mjs';
import { createJourneyPlayback } from '../js/playback.mjs';
import { handleJourneyPlaybackMessage } from '../js/playback-worker.mjs';

const stamp = (date, hour = 10, minute = 0) => Date.parse(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`);
const point = (lat = 37.5, lng = 127) => ({ lat, lng });
const record = (id, extra = {}) => ({ id, person: 'sungwoo', kind: 'manual', title: '산책', note: '비공개 메모', time: null, timePrecision: 'day', position: point(), ...extra });
const source = person => ({ id: `source-${person}`, hash: 'a'.repeat(64), name: 'private-source.json', person, importedAt: 0 });
const day = (date, records = [], tracks = []) => ({ ...emptyDay(date), revision: 1, records, tracks, imports: tracks.length ? [...new Set(tracks.map(track => track.person))].map(source) : [] });
const track = (id, date, extra = {}) => ({ id, person: 'sungwoo', sourceId: 'source-sungwoo', points: [{ ...point(), time: stamp(date) }, { ...point(37.6, 127.2), time: stamp(date, 11) }], ...extra });
const summary = (date, records, tracks) => buildDayCandidates(day(date, records, tracks));

test('a day projection groups repeated photos, leaves date-only times null and strips private content', () => {
  const input = day('2024-04-12', Array.from({ length: 20 }, (_, i) => record(`photo-${String(i).padStart(2, '0')}`, { kind: 'photo', photoId: '00000000-0000-4000-8000-000000000000' })));
  const original = structuredClone(input), projected = buildDayCandidates(input);
  assert.equal(projected.candidates.length, 1); assert.equal(projected.candidates[0].recordIds.length, 20);
  assert.equal(projected.candidates[0].time, null); assert.equal(projected.candidates[0].endTime, null);
  assert.doesNotMatch(JSON.stringify(projected), /비공개 메모|photoId|kind|sourceId|source-|hash|updatedBy/);
  assert.deepEqual(input, original);
});

test('grouping respects people, exact 90-minute gaps, out-and-back and explicitly different titles', () => {
  const date = '2024-04-12', timed = (id, hour, location, title = '방문 지점', edited = false) => record(id, { time: stamp(date, hour), timePrecision: 'exact', position: location, title, edited });
  const records = [timed('a', 9, point()), timed('b', 10, point(37.5001)), timed('away', 11, point(37.7)), timed('return', 12, point()), timed('late', 15, point()), timed('named-a', 16, point(), '책방', true), timed('named-b', 17, point(), '카페', true), record('sohee', { person: 'sohee' })];
  const candidates = summary(date, records).candidates;
  assert.equal(candidates.length, 7);
  assert.deepEqual(candidates[0].recordIds, ['a', 'b']);
  assert.ok(candidates.some(value => value.recordIds.length === 1 && value.recordIds[0] === 'return'));
  assert.ok(candidates.some(value => value.title === '책방')); assert.ok(candidates.some(value => value.title === '카페'));
  assert.equal(candidates.filter(value => value.person === 'sohee').length, 1);
});

test('date-only and exact records never borrow an exact time from each other', () => {
  const date = '2024-04-12', candidates = summary(date, [record('date-only'), record('exact', { time: stamp(date), timePrecision: 'exact' })]).candidates;
  assert.equal(candidates.length, 2); assert.equal(candidates.find(value => value.recordIds.includes('date-only')).time, null);
});

test('nearby chains cannot turn a moving sequence into one place and intervening paths preserve a return visit', () => {
  const date = '2024-04-12';
  const chain = summary(date, Array.from({ length: 8 }, (_, i) => record(`chain-${i}`, { time: stamp(date, 10, i), timePrecision: 'exact', position: point(37.5 + i * .0008) })));
  assert.equal(chain.candidates.length, 4);
  assert.ok(chain.candidates.every(candidate => candidate.recordIds.length === 2));
  const records = [record('before', { time: stamp(date, 10), timePrecision: 'exact' }), record('after', { time: stamp(date, 11), timePrecision: 'exact' })];
  const path = track('out-and-back', date, { points: [{ ...point(), time: stamp(date, 10, 10) }, { ...point(37.51), time: stamp(date, 10, 30) }, { ...point(), time: stamp(date, 10, 50) }] });
  const returned = summary(date, records, [path]).candidates;
  assert.equal(returned.filter(candidate => candidate.recordIds.length).length, 2);
  assert.ok(returned.every(candidate => candidate.recordIds.length <= 1));
  const otherPerson = { ...path, person: 'sohee', sourceId: 'source-sohee' };
  assert.equal(summary(date, records, [otherPerson]).candidates.filter(candidate => candidate.recordIds.length).length, 1);
});

test('track-only days remain scenes, keep endpoints and each source boundary independently', () => {
  const date = '2025-02-01', input = day(date, [], [track('morning', date), track('afternoon', date, { points: [{ ...point(35, 129), time: stamp(date, 16) }, { ...point(35.1, 129.2), time: stamp(date, 17) }] })]);
  const original = structuredClone(input), projected = buildDayCandidates(input);
  assert.equal(projected.candidates.length, 2);
  const prepared = projected.candidates.map(candidate => prepareJourneyScene(candidate, input));
  assert.deepEqual(prepared.map(scene => scene.segments.length), [1, 1]);
  assert.equal(prepared[0].endTime, stamp(date, 11)); assert.equal(prepared[1].time, stamp(date, 16));
  assert.equal(prepared[0].moving, true); assert.equal(prepared[0].title, '이날의 이동');
  assert.deepEqual(prepared[0].position, point()); assert.deepEqual(prepared[1].position, point(35, 129));
  assert.deepEqual(input, original);
});

test('location-less memories remain projected but cannot create a fabricated map scene', () => {
  const projected = summary('2025-01-01', [record('missing', { position: null })]);
  assert.equal(projected.candidates.length, 1); assert.deepEqual(selectJourneyScenes([projected]), []);
});

test('three-year selection represents every recorded month despite dense recent months and obeys caps', () => {
  const days = [];
  for (let i = 0; i < 36; i++) {
    const year = 2023 + Math.floor(i / 12), month = String(i % 12 + 1).padStart(2, '0');
    const count = i < 34 ? 2 : 28;
    for (let d = 1; d <= count; d++) {
      const date = `${year}-${month}-${String(d).padStart(2, '0')}`;
      days.push(summary(date, [record(`memory-${i}-${d}`, { person: d % 2 ? 'sungwoo' : 'sohee', position: point(35 + i / 100, 127 + d / 100) })]));
    }
  }
  const original = structuredClone(days), result = selectJourneyScenes(days);
  assert.equal(result.length, 60); assert.equal(new Set(result.map(value => value.date.slice(0, 7))).size, 36);
  assert.equal(result[0].date, '2023-01-01'); assert.equal(result.at(-1).date, '2025-12-28');
  const monthCounts = new Map(); for (const value of result) monthCounts.set(value.date.slice(0, 7), (monthCounts.get(value.date.slice(0, 7)) || 0) + 1);
  assert.ok([...monthCounts.values()].every(value => value <= 6));
  assert.ok(result.filter(value => value.date >= '2025-11').length <= 12);
  assert.deepEqual(days, original); assert.deepEqual(selectJourneyScenes(days.slice().reverse()), result);
});

test('selection keeps period boundaries, together memories and large place changes', () => {
  const days = Array.from({ length: 15 }, (_, i) => {
    const date = `2025-01-${String(i + 1).padStart(2, '0')}`;
    return summary(date, [record(`memory-${i}`, { person: i === 7 ? 'together' : 'sungwoo', position: i === 9 ? point(35.1, 129) : point() })]);
  });
  const result = selectJourneyScenes(days);
  assert.equal(result.length, 6); assert.equal(result[0].date, '2025-01-01'); assert.equal(result.at(-1).date, '2025-01-15');
  assert.ok(result.some(scene => scene.person === 'together')); assert.ok(result.some(scene => scene.date === '2025-01-10'));
  const subset = selectJourneyScenes(days, { from: '2025-01-05', to: '2025-01-12', person: 'sungwoo' });
  assert.ok(subset.every(scene => scene.person === 'sungwoo' && scene.date >= '2025-01-05' && scene.date <= '2025-01-12'));
});

test('sparse people survive a month of dense long moves and the global scene budget', () => {
  const days = Array.from({ length: 12 }, (_, i) => summary(`2025-01-${String(i + 1).padStart(2, '0')}`, [record(`move-${i}`, { position: point(i % 2 ? 35 : 37) })]));
  days.push(summary('2025-01-20', [record('only-sohee', { person: 'sohee' })]));
  days.push(summary('2025-01-21', [record('only-together', { person: 'together' })]));
  days.push(summary('2025-01-31', [record('last')]));
  const selected = selectJourneyScenes(days);
  assert.equal(selected.length, 6);
  assert.deepEqual(new Set(selected.map(scene => scene.person)), new Set(['sungwoo', 'sohee', 'together']));
  assert.equal(selected[0].date, '2025-01-01'); assert.equal(selected.at(-1).date, '2025-01-31');
  const years = Array.from({ length: 84 }, (_, i) => summary(`${2020 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}-01`, [record(`monthly-${i}`)]));
  years.push(summary('2025-12-02', [record('sparse-sohee', { person: 'sohee' }), record('sparse-together', { person: 'together' })]));
  const capped = selectJourneyScenes(years);
  assert.equal(capped.length, 60);
  assert.ok(capped.some(scene => scene.person === 'sohee')); assert.ok(capped.some(scene => scene.person === 'together'));
  assert.equal(capped[0].date, '2020-01-01'); assert.equal(capped.at(-1).date, '2026-12-01');
  const tiny = selectJourneyScenes(days, { maxScenes: 2, maxPerMonth: 2 });
  assert.deepEqual(tiny.map(scene => scene.date), ['2025-01-01', '2025-01-31']);
});

test('overlapping real times share one clock, preserve all selected evidence and never imply together', () => {
  const date = '2025-01-01', input = day(date, [record('midway', { time: stamp(date, 11), timePrecision: 'exact' }), record('date-only')], [
    track('sungwoo-path', date, { points: [{ ...point(), time: stamp(date, 10) }, { ...point(37.7), time: stamp(date, 12) }] }),
    track('sohee-path', date, { person: 'sohee', sourceId: 'source-sohee', points: [{ ...point(37.6), time: stamp(date, 10, 30) }, { ...point(37.7), time: stamp(date, 11, 30) }] })
  ]);
  const original = structuredClone(input), projected = buildDayCandidates(input), selected = selectJourneyScenes([projected]);
  assert.equal(selected.length, 2); assert.equal(selected[0].person, 'multiple');
  assert.deepEqual(selected[0].people, ['sungwoo', 'sohee']); assert.equal(selected[0].members.length, 3);
  assert.deepEqual(new Set(selected[0].trackIds), new Set(['sungwoo-path', 'sohee-path']));
  assert.deepEqual(selected[0].recordIds, ['midway']); assert.equal(selected[1].time, null);
  const prepared = prepareJourneyScene(selected[0], input);
  assert.deepEqual(prepared.segments.map(segment => segment.person), ['sungwoo', 'sohee']);
  assert.equal(prepared.time, stamp(date, 10)); assert.equal(prepared.endTime, stamp(date, 12));
  assert.equal(prepared.records[0].time, stamp(date, 11)); assert.equal(prepared.records[0].person, 'sungwoo');
  assert.deepEqual(input, original);
  const { controller } = clock(); controller.load([prepared]);
  const times = Array.from({ length: 101 }, (_, i) => controller.seek(i / 100).time);
  assert.ok(times.every((value, i) => !i || value >= times[i - 1]));
  assert.equal(times.at(-1), stamp(date, 12));
  const wrongOwner = { ...input, records: input.records.map(value => value.id === 'midway' ? { ...value, person: 'sohee' } : value) };
  assert.throws(() => prepareJourneyScene(selected[0], wrongOwner), { code: 'JOURNEY_SCENE_CHANGED' });
  const solo = selectJourneyScenes([projected], { person: 'sungwoo' });
  assert.ok(solo.every(scene => scene.person === 'sungwoo' && scene.people.length === 1));
});

test('overlap merging respects gaps and dates and retains exact point-only groups', () => {
  const date = '2025-01-01';
  const first = summary(date, [record('sun', { time: stamp(date), timePrecision: 'exact' }), record('so', { person: 'sohee', time: stamp(date), timePrecision: 'exact' }), record('later', { time: stamp(date, 14), timePrecision: 'exact' })]);
  const next = summary('2025-01-02', [record('tomorrow', { time: stamp('2025-01-02'), timePrecision: 'exact' })]);
  const selected = selectJourneyScenes([first, next]);
  assert.equal(selected.length, 3); assert.equal(selected[0].person, 'multiple');
  assert.deepEqual(selected[0].recordIds, ['so', 'sun']);
  assert.equal(selected[1].time, stamp(date, 14)); assert.equal(selected[2].date, '2025-01-02');
});

test('newest day revision replaces old candidates and duplicate page reads do not duplicate scenes', () => {
  const older = summary('2025-01-01', [record('one')]), newer = buildDayCandidates({ ...day('2025-01-01', [record('two')]), revision: 2 });
  const result = selectJourneyScenes([older, newer, older, newer]);
  assert.equal(result.length, 1); assert.equal(result[0].recordIds[0], 'two'); assert.equal(result[0].revision, 2);
});

test('preparation preserves date-only records and refuses changed revisions or changed ownership', () => {
  const input = day('2025-03-01', [record('one')]), candidate = buildDayCandidates(input).candidates[0];
  const prepared = prepareJourneyScene(candidate, input);
  assert.equal(prepared.time, null); assert.equal(prepared.endTime, null); assert.equal(prepared.moving, false);
  assert.doesNotMatch(JSON.stringify(prepared), /비공개 메모|private-source|kind|sourceId/);
  assert.throws(() => prepareJourneyScene(candidate, { ...input, revision: 2 }), { code: 'JOURNEY_SCENE_CHANGED' });
  assert.throws(() => prepareJourneyScene(candidate, { ...input, records: [record('one', { person: 'sohee' })] }), { code: 'JOURNEY_SCENE_CHANGED' });
});

test('time-aware simplification preserves stationary dwell and actual endpoints without mutating points', () => {
  const date = '2025-04-01', start = stamp(date), points = Array.from({ length: 1000 }, (_, i) => ({ lat: i < 800 ? 37.5 : 37.5 + (i - 799) / 1000, lng: 127, time: start + i * 1000 }));
  const original = structuredClone(points), reduced = simplifyJourneyPoints(points, 32);
  assert.ok(reduced.length <= 32); assert.deepEqual(reduced[0], points[0]); assert.deepEqual(reduced.at(-1), points.at(-1));
  assert.ok(reduced.some(point => point.time >= start + 790000 && point.time <= start + 805000));
  assert.ok(reduced.every(point => points.some(original => original.lat === point.lat && original.lng === point.lng && original.time === point.time)));
  assert.deepEqual(points, original); assert.ok(journeyDistance(point(), point(37.6)) > 10000);
});

function clock() {
  let milliseconds = 0, nextId = 0; const queued = new Map(), updates = [];
  const controller = createJourneyPlayback({ now: () => milliseconds, requestFrame: fn => { queued.set(++nextId, fn); return nextId; }, cancelFrame: id => queued.delete(id), onChange: state => updates.push({ ...state }) });
  return { controller, updates, queued, advance(value) { milliseconds += value; const callbacks = [...queued.values()]; queued.clear(); callbacks.forEach(callback => callback(milliseconds)); } };
}
const scene = (id, date, extra = {}) => ({ id, date, person: 'sungwoo', title: id, position: point(), time: null, endTime: null, recordIds: [id], trackIds: [], records: [], segments: [], ...extra });

test('one period clock crosses days and years, finishes at chosen length and resets safely', () => {
  const { controller, advance, queued } = clock();
  controller.load([scene('a', '2023-01-01'), scene('b', '2024-07-02'), scene('c', '2026-09-20')]);
  assert.equal(controller.getState().playing, false); assert.equal(controller.play(), true);
  advance(10000); assert.equal(controller.getState().scene.id, 'a'); assert.equal(controller.getState().sceneProgress, .5);
  advance(20000); assert.equal(controller.getState().scene.id, 'b'); assert.equal(controller.getState().sceneProgress, .5);
  advance(30000); assert.equal(controller.getState().progress, 1); assert.equal(controller.getState().scene.id, 'c'); assert.equal(controller.getState().elapsed, 60); assert.equal(controller.getState().playing, false); assert.equal(queued.size, 0);
  controller.play(); assert.equal(controller.getState().progress, 0); controller.restart(); assert.equal(controller.getState().playing, false);
});

test('fast and slow share scenes, preserve internal progress and retain chosen durations', () => {
  const { controller, advance, queued } = clock();
  controller.load([scene('a', '2024-01-01'), scene('b', '2026-01-01')]); controller.play(); advance(45000);
  const before = controller.getState(); controller.setMode('slow');
  assert.equal(controller.getState().scene, before.scene); assert.equal(controller.getState().sceneProgress, before.sceneProgress); assert.equal(controller.getState().duration, 300); assert.equal(controller.getState().playing, true); assert.equal(queued.size, 1);
  advance(15000); assert.ok(Math.abs(controller.getState().progress - .8) < 1e-10);
  controller.setDuration(600); assert.equal(controller.getState().progress, .8); advance(60000); assert.ok(Math.abs(controller.getState().progress - .9) < 1e-10);
  controller.pause(); advance(60000); assert.ok(Math.abs(controller.getState().progress - .9) < 1e-10);
  controller.setMode('fast'); assert.equal(controller.getState().duration, 60); controller.setDuration(120); controller.setMode('slow'); assert.equal(controller.getState().duration, 600);
  controller.setDuration(60); assert.equal(controller.getState().duration, 600);
});

test('scene selection and stepping pause, seek preserves play, and reload anchors use source references', () => {
  const { controller, advance } = clock(), a = scene('a', '2024-01-01'), b = scene('b', '2025-01-01');
  controller.load([a, b]); controller.play(); controller.seek(.7); assert.equal(controller.getState().playing, true);
  const old = controller.getState(); controller.load([a, scene('b-new', b.date, { recordIds: ['b', 'new-photo'] })], { anchor: old });
  assert.equal(controller.getState().scene.id, 'b-new'); assert.ok(Math.abs(controller.getState().sceneProgress - .4) < 1e-10); assert.equal(controller.getState().playing, false);
  controller.play(); controller.step(-1); assert.equal(controller.getState().scene.id, 'a'); assert.equal(controller.getState().playing, false);
  controller.play(); controller.seekScene('b-new'); advance(5000); assert.equal(controller.getState().progress, .5); assert.equal(controller.getState().playing, false);
  controller.load([a, scene('near', '2025-01-02')], { anchor: old }); assert.equal(controller.getState().scene.id, 'near'); assert.equal(controller.getState().sceneProgress, 0);
});

test('reload retains source anchors through single-person and overlapping-person scene changes', () => {
  for (const reference of ['recordIds', 'trackIds']) {
    const { controller } = clock(), date = '2025-01-01', source = scene('single', date, { recordIds: [], trackIds: [], [reference]: ['original-source'] });
    controller.load([scene('before', '2024-01-01'), source]); controller.seek(.6875); const original = controller.getState();
    const merged = scene('merged', date, { person: 'multiple', people: ['sungwoo', 'sohee'], recordIds: [], trackIds: [], [reference]: ['original-source', 'other-person-source'] });
    const wrongDay = scene('reused-id-other-day', '2024-12-31', { recordIds: [], trackIds: [], [reference]: ['original-source'] });
    controller.load([wrongDay, scene('unrelated-same-day', date), merged], { anchor: original });
    let state = controller.getState(); assert.equal(state.scene.id, 'merged', reference); assert.equal(state.sceneProgress, .375); assert.equal(state.playing, false);
    controller.load([scene('unrelated-same-day', date), { ...source, id: 'split-again' }], { anchor: state });
    state = controller.getState(); assert.equal(state.scene.id, 'split-again', reference); assert.equal(state.sceneProgress, .375); assert.equal(state.playing, false);
    controller.load([wrongDay, scene('nearest-only', date)], { anchor: state });
    assert.equal(controller.getState().scene.id, 'nearest-only'); assert.equal(controller.getState().sceneProgress, 0, 'a reference reused on another day must not preserve source progress');
  }
});

test('every scene boundary seeks exactly despite fractional floating-point progress', () => {
  const { controller } = clock();
  for (let n = 2; n <= 60; n++) {
    controller.load(Array.from({ length: n }, (_, i) => scene(`scene-${i}`, '2025-01-01')));
    for (let i = 0; i < n; i++) {
      controller.seekScene(`scene-${i}`);
      assert.equal(controller.getState().index, i, `${n} scenes, selected ${i}`);
      assert.equal(controller.getState().sceneProgress, 0);
    }
  }
  controller.setMode('toString'); assert.equal(controller.getState().mode, 'fast'); assert.equal(controller.getState().duration, 60);
});

test('a single static memory is not artificial animation; a recorded moving scene is playable', () => {
  const { controller } = clock();
  controller.load([]); assert.equal(controller.play(), false);
  controller.load([scene('a', '2024-01-01')]); assert.equal(controller.getState().available, false); assert.equal(controller.play(), false);
  const date = '2024-01-01', input = day(date, [], [track('t', date)]), moving = prepareJourneyScene(buildDayCandidates(input).candidates[0], input);
  controller.load([moving]); assert.equal(controller.play(), true); controller.seek(.5); assert.equal(controller.getState().time, stamp(date, 10, 30));
});

test('destroy cancels animation and future calls cannot re-expose personal scenes', () => {
  const { controller, updates, advance, queued } = clock();
  controller.load([scene('a', '2024-01-01'), scene('b', '2025-01-01')]); controller.play(); const count = updates.length;
  controller.destroy(); advance(100000); controller.load([scene('private', '2026-01-01')]); controller.seek(.5); controller.setMode('slow');
  assert.equal(controller.play(), false); assert.equal(queued.size, 0); assert.equal(updates.length, count); assert.equal(controller.getState().scene, null); assert.deepEqual(controller.getState().scenes, []);
});

test('worker protocol correlates requests, prepares scenes and returns readable failures without throwing', () => {
  const input = day('2025-01-01', [record('a')]), projected = buildDayCandidates(input);
  const selection = handleJourneyPlaybackMessage({ requestId: 7, type: 'select', days: [projected], options: {} });
  assert.equal(selection.ok, true); assert.equal(selection.requestId, 7); assert.equal(selection.result.length, 1);
  const prepared = handleJourneyPlaybackMessage({ requestId: 8, type: 'prepare', scene: selection.result[0], day: input });
  assert.equal(prepared.ok, true); assert.equal(prepared.result.records.length, 1);
  const failure = handleJourneyPlaybackMessage({ requestId: 9, type: 'prepare', scene: selection.result[0], day: { ...input, revision: 2 } });
  assert.equal(failure.ok, false); assert.equal(failure.code, 'JOURNEY_SCENE_CHANGED'); assert.equal(failure.requestId, 9);
  assert.equal(handleJourneyPlaybackMessage({ requestId: 10, type: 'unknown' }).ok, false);
});
