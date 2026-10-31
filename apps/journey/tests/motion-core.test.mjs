import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDay } from '../../../shared/journey/core.mjs';
import { buildDayCandidates } from '../../../shared/journey/playback-core.mjs';
import { selectJourneyMotionScenes, prepareJourneyMotionScene, buildJourneyMotionSpans, journeyMotionBounds, interpolateJourneyLongitude, simplifyJourneyMotionPoints } from '../../../shared/journey/motion-core.mjs';
import { createJourneyPlayback } from '../js/playback.mjs';
import { handleJourneyPlaybackMessage } from '../js/playback-worker.mjs';

const stamp = (date, hour = 10, minute = 0) => Date.parse(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`);
const source = person => ({ id: 'source-' + person, person, name: 'private.json', hash: 'a'.repeat(64), importedAt: 0 });
const record = (id, extra = {}) => ({ id, person: 'sungwoo', kind: 'manual', title: '기억', note: '비공개', time: null, timePrecision: 'day', position: { lat: 37.5, lng: 127 }, ...extra });
const track = (id, date, start = 10, end = 11, person = 'sungwoo') => ({ id, person, sourceId: 'source-' + person, points: [{ lat: 37.5, lng: 127, time: stamp(date, start) }, { lat: 35.1, lng: 129, time: stamp(date, end) }] });
const day = (date, records = [], tracks = []) => ({ ...emptyDay(date), revision: 1, records, tracks, imports: [...new Set(tracks.map(value => value.person))].map(source) });
const prepare = input => prepareJourneyMotionScene(selectJourneyMotionScenes([buildDayCandidates(input)])[0], input);

test('motion selection retains every track and date beyond representative scene limits', () => {
  const inputs = Array.from({ length: 75 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10);
    return day(date, [record('memory-' + index)], Array.from({ length: 8 }, (_, n) => track(`path-${index}-${n}`, date)));
  });
  const scenes = selectJourneyMotionScenes(inputs.map(buildDayCandidates));
  assert.equal(scenes.length, 75); assert.equal(scenes.reduce((sum, scene) => sum + scene.trackIds.length, 0), 600);
  assert.equal(scenes[0].date, inputs[0].date); assert.equal(scenes.at(-1).date, inputs.at(-1).date);
  for (let index = 0; index < inputs.length; index++) assert.equal(prepareJourneyMotionScene(scenes[index], inputs[index]).segments.length, 8);
});

test('person and range filters preserve original ownership, latest revisions and date-only records', () => {
  const date = '2025-01-01', input = day(date, [record('unknown-place', { position: null }), record('sohee-memory', { person: 'sohee' })], [track('s', date), track('h', date, 10, 11, 'sohee')]);
  const projected = buildDayCandidates(input), filtered = selectJourneyMotionScenes([projected], { person: 'sohee', from: date, to: date });
  assert.deepEqual(filtered[0].trackIds, ['h']); assert.deepEqual(filtered[0].recordIds, ['sohee-memory']);
  assert.deepEqual(prepareJourneyMotionScene(filtered[0], input).people, ['sohee']);
  const all = selectJourneyMotionScenes([projected]); assert.equal(all[0].person, 'multiple'); assert.notEqual(all[0].person, 'together');
  assert.ok(all[0].recordIds.includes('unknown-place'));
  assert.equal(selectJourneyMotionScenes([projected], { from: '2025-01-02' }).length, 0);
  const latest = { ...projected, revision: 2, candidates: projected.candidates.filter(value => value.person === 'sohee') };
  assert.deepEqual(selectJourneyMotionScenes([latest, projected])[0].trackIds, ['h']);
  assert.throws(() => prepareJourneyMotionScene(all[0], { ...input, revision: 2 }), /기록이 바뀌었어요/);
  assert.throws(() => prepareJourneyMotionScene({ ...all[0], members: all[0].members.map(value => ({ ...value, person: 'together' })) }, input), /기록이 바뀌었어요/);
  assert.doesNotMatch(JSON.stringify(all), /private.json|비공개|hash|sourceId/);
});

test('moving intervals share a clock and long stationary or absent periods are compressed', () => {
  const date = '2025-01-01', a = track('a', date, 8, 9), b = track('b', date, 8, 9, 'sohee'), c = track('c', date, 20, 21);
  const spans = buildJourneyMotionSpans([a, b, c]);
  assert.deepEqual(spans.map(span => span.kind), ['moving', 'gap', 'moving']);
  assert.deepEqual(spans.map(span => span.weight), [3600000, 60000, 3600000]);
  assert.equal(spans[1].end - spans[1].start, 11 * 3600000);
  const stationary = { points: [{ lat: 37, lng: 127, time: stamp(date, 0) }, { lat: 37, lng: 127, time: stamp(date, 23) }] };
  assert.equal(buildJourneyMotionSpans([stationary])[0].weight, 60000);
});

test('the all-track controller spends its budget on movement and preserves exact source time on mode changes', () => {
  const date = '2025-01-01', scene = prepare(day(date, [], [track('morning', date, 8, 9), track('evening', date, 20, 21)]));
  const controller = createJourneyPlayback(); controller.load([scene]);
  let state = controller.seek(.25); assert.ok(state.time >= stamp(date, 8, 29) && state.time <= stamp(date, 8, 31));
  assert.equal(state.date, date); assert.ok(state.sceneProgress < .1);
  const before = state; controller.setMode('slow'); controller.setDuration(600); state = controller.getState();
  assert.equal(state.time, before.time); assert.equal(state.progress, .25); assert.equal(state.duration, 600);
  controller.seek(.5); assert.equal(controller.getState().motionKind, 'gap');
  controller.seek(.75); assert.ok(controller.getState().time >= stamp(date, 20, 29));
  controller.seek(1); assert.equal(controller.getState().time, stamp(date, 21)); assert.equal(controller.getState().sceneProgress, 1);
});

test('date-only memories keep null timestamps and bounded short weights, without fabricated motion', () => {
  const memory = prepare(day('2023-01-01', [record('photo')])), moving = prepare(day('2026-01-01', [], [track('path', '2026-01-01')]));
  assert.equal(memory.time, null); assert.equal(memory.motionSpans[0].start, null); assert.equal(memory.moving, false);
  const controller = createJourneyPlayback(); controller.load([memory]); assert.equal(controller.getState().available, false);
  controller.load([memory, moving]); assert.equal(controller.getState().time, null); assert.equal(controller.getState().date, memory.date);
  assert.ok(controller.getState().sceneStarts[1] >= .15 && controller.getState().sceneStarts[1] < .18);
  controller.seekScene(moving.id); assert.equal(controller.getState().date, moving.date); assert.equal(controller.getState().sceneProgress, 0);
});

test('motion seeking is deterministic, chronological and source-anchored after changed durations', () => {
  const inputs = [prepare(day('2025-01-01', [], [track('a', '2025-01-01', 8, 9)])), prepare(day('2025-02-01', [], [track('b', '2025-02-01', 8, 12)]))];
  const controller = createJourneyPlayback(); controller.load(inputs);
  const dates = []; for (let step = 0; step <= 100; step++) dates.push(controller.seek(step / 100).date);
  assert.deepEqual(dates, [...dates].sort());
  controller.seekScene(inputs[1].id); assert.equal(controller.getState().progress, .29);
  const anchor = controller.seek(.6), time = anchor.time;
  const changed = prepare(day('2025-02-01', [], [track('b', '2025-02-01', 7, 12)])); controller.load([inputs[0], changed], { anchor });
  assert.equal(controller.getState().time, time); assert.equal(controller.getState().playing, false);
  const state = controller.getState(); controller.seek(.1); controller.seek(state.progress); assert.equal(controller.getState().time, time);
});

test('international route simplification and bounds use the short date-line crossing', () => {
  assert.equal(interpolateJourneyLongitude(179, -179, .5), -180);
  assert.equal(interpolateJourneyLongitude(-179, 179, .5), -180);
  const bounds = journeyMotionBounds([{ lat: 30, lng: 179 }, { lat: 31, lng: -179 }]);
  assert.equal(bounds.west, 179); assert.equal(bounds.east, 181);
  const date = '2025-01-01', points = Array.from({ length: 1000 }, (_, index) => ({ lat: 30 + index / 999, lng: interpolateJourneyLongitude(179, -179, index / 999), time: stamp(date) + index * 1000 }));
  const original = structuredClone(points), reduced = simplifyJourneyMotionPoints(points, 16);
  assert.ok(reduced.length <= 16); assert.deepEqual(reduced[0], points[0]); assert.deepEqual(reduced.at(-1), points.at(-1));
  assert.ok(reduced.every(point => Math.abs(point.lng) >= 179)); assert.deepEqual(points, original);
});

test('worker supports correlated complete-motion preparation without private metadata', () => {
  const input = day('2025-01-01', [], [track('a', '2025-01-01')]);
  const selection = handleJourneyPlaybackMessage({ type: 'motion-select', requestId: 11, days: [buildDayCandidates(input)] });
  assert.equal(selection.ok, true); assert.equal(selection.result[0].motion, true);
  const prepared = handleJourneyPlaybackMessage({ type: 'motion-prepare', requestId: 12, scene: selection.result[0], day: input });
  assert.equal(prepared.ok, true); assert.equal(prepared.requestId, 12); assert.equal(prepared.result.segments.length, 1);
  assert.doesNotMatch(JSON.stringify(prepared), /private.json|비공개|sourceId|hash/);
});

test('sparse photo days have a modest visible budget beside two months of dense GPS', () => {
  const memories = Array.from({ length: 36 }, (_, index) => prepare(day(`${2023 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}-01`, [record('photo-' + index)])));
  const moving = Array.from({ length: 59 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10);
    return prepare(day(date, [], Array.from({ length: 7 }, (_, n) => track('trip-' + n, date, 8 + n * 2, 9 + n * 2))));
  });
  const controller = createJourneyPlayback(), scenes = [...memories, ...moving]; controller.load(scenes);
  const starts = [...controller.getState().sceneStarts, 1], shares = starts.slice(1).map((value, index) => value - starts[index]);
  assert.equal(scenes.reduce((count, scene) => count + scene.segments.length, 0), 413);
  for (const share of shares.slice(0, 36)) { assert.ok(share * 60 >= .18); assert.ok(share * 300 >= .94); }
  assert.ok(shares.slice(0, 36).reduce((sum, value) => sum + value, 0) < .14, 'dense travel still receives the clear majority of playback');
  for (let index = 0; index < memories.length; index++) {
    const state = controller.seek(starts[index] + shares[index] / 2); assert.equal(state.index, index); assert.equal(state.time, null);
  }
  controller.setMode('slow'); controller.setDuration(300); const state = controller.seek(1);
  assert.equal(state.elapsed, 300); assert.equal(state.duration, 300); assert.equal(state.progress, 1); assert.equal(state.playing, false);
});

test('weighted clocks do not move a later timed memory into an earlier movement', () => {
  const date = '2025-01-01', later = stamp(date, 18), original = day(date, [record('later-photo', { time: later, timePrecision: 'exact' }), record('date-only-photo')], [track('morning', date, 8, 9)]);
  const snapshot = structuredClone(original), scene = prepare(original), controller = createJourneyPlayback(); controller.load([scene]);
  const first = controller.seek(.4); assert.ok(first.time < later); assert.equal(first.date, date);
  assert.equal(scene.records.find(value => value.id === 'later-photo').time, later);
  assert.equal(scene.records.find(value => value.id === 'date-only-photo').time, null);
  assert.equal(controller.seek(1).time, later); assert.deepEqual(original, snapshot);
});

test('weighted daily boundaries remain exact over a long archive and completion keeps the requested duration', () => {
  let clock = 0;
  const callbacks = new Map(); let next = 0;
  const controller = createJourneyPlayback({ now: () => clock, requestFrame: callback => { callbacks.set(++next, callback); return next; }, cancelFrame: id => callbacks.delete(id) });
  const scenes = Array.from({ length: 95 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10);
    return prepare(index % 3 ? day(date, [], [track('route', date, 8, 9 + index % 8)]) : day(date, [record('memory')]));
  });
  controller.load(scenes);
  for (let index = 0; index < scenes.length; index++) { const state = controller.seekScene(scenes[index].id); assert.equal(state.index, index); assert.equal(state.sceneProgress, 0); }
  controller.restart(); controller.setDuration(30); controller.play(); clock = 30000;
  for (const [id, callback] of [...callbacks]) { callbacks.delete(id); callback(clock); }
  const state = controller.getState(); assert.equal(state.progress, 1); assert.equal(state.elapsed, 30); assert.equal(state.scene, scenes.at(-1)); assert.equal(state.playing, false); assert.equal(callbacks.size, 0);
});
