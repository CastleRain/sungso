import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoryTrack, getStoryFrame, storyDistanceAt } from '../js/scroll-story-core.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);

test('scrolling backwards reproduces the earlier frame without playback history', () => {
  const track = buildStoryTrack([600, 1300, 700], 600);
  const distances = [0, 125, 300, 550, 800, 1400, track.distance];
  const forward = distances.map(distance => getStoryFrame(track, distance));
  const backward = [...distances].reverse().map(distance => getStoryFrame(track, distance)).reverse();
  assert.deepEqual(backward, forward);
  const first = track.segments[0];
  near(getStoryFrame(track, first.hold + first.transition * 0.25).transition, 0.15625);
  near(getStoryFrame(track, first.hold + first.transition * 0.5).transition, 0.5);
  near(getStoryFrame(track, first.hold + first.transition * 0.75).transition, 0.84375);
});

test('a tall page holds, reveals its entire lower content, then changes scenes', () => {
  const track = buildStoryTrack([1800, 500], 600);
  const page = track.segments[0];
  assert.equal(page.pan, 1200);
  assert.equal(getStoryFrame(track, page.hold / 2).panY, 0);
  assert.equal(getStoryFrame(track, page.hold).panY, 0);
  assert.equal(getStoryFrame(track, page.hold + 600).panY, -600);
  const bottom = getStoryFrame(track, page.hold + page.pan);
  assert.equal(bottom.panY, -1200);
  assert.equal(bottom.transition, 0);
  assert.equal(bottom.sceneProgress, 1);
  assert.equal(1800 + bottom.panY, track.viewportHeight);
  const leaving = getStoryFrame(track, page.hold + page.pan + page.transition / 2);
  assert.equal(leaving.panY, -1200);
  near(leaving.transition, 0.5);
});

test('scene boundaries advance once and the last page has no outgoing transition', () => {
  const track = buildStoryTrack([600, 1000], 600);
  const [first, last] = track.segments;
  const boundary = getStoryFrame(track, first.end);
  assert.equal(boundary.index, 1);
  assert.equal(boundary.local, 0);
  assert.equal(boundary.panY, 0);
  assert.equal(last.transition, 0);
  const end = getStoryFrame(track, track.distance);
  assert.equal(end.index, 1);
  assert.equal(end.nextIndex, null);
  assert.equal(end.panY, -400);
  assert.equal(end.sceneProgress, 1);
  assert.equal(end.progress, 1);
  assert.equal(end.transition, 0);
  assert.deepEqual(getStoryFrame(track, Infinity), end);
  assert.deepEqual(getStoryFrame(track, -Infinity), getStoryFrame(track, 0));
});

test('a single short scene remains readable without an invented next scene', () => {
  const track = buildStoryTrack([300], 600);
  assert.equal(track.distance, 192);
  for (const distance of [0, 96, 192, 1000]) {
    const frame = getStoryFrame(track, distance);
    assert.equal(frame.index, 0);
    assert.equal(frame.nextIndex, null);
    assert.equal(frame.panY, 0);
    assert.equal(frame.transition, 0);
  }
});

test('empty and invalid measurements produce finite, safely bounded positions', () => {
  for (const heights of [[], null, undefined, {}]) {
    const track = buildStoryTrack(heights, 0);
    assert.equal(track.distance, 0);
    assert.equal(track.viewportHeight, 1);
    assert.deepEqual(getStoryFrame(track, Infinity), { index: -1, nextIndex: null, local: 0, panY: 0, transition: 0, sceneProgress: 0, progress: 0 });
    assert.equal(storyDistanceAt(track, 10, 0.5), 0);
  }
  assert.equal(getStoryFrame(null, 0).index, -1);
  const track = buildStoryTrack([NaN, Infinity, -40, undefined, Number.MAX_VALUE], NaN);
  assert.equal(track.segments[0].height, 1);
  assert.equal(track.segments[1].height, 1);
  assert.equal(track.segments[2].height, 0);
  assert.ok(Number.isFinite(track.distance));
  for (const segment of track.segments) assert.ok(Object.values(segment).every(Number.isFinite));
  assert.deepEqual(getStoryFrame(track, NaN), getStoryFrame(track, 0));
});

test('restoring a logical segment and fraction adapts to new layout measurements', () => {
  const before = buildStoryTrack([600, 1800, 400], 600);
  const after = buildStoryTrack([390, 1900, 500], 390);
  const original = getStoryFrame(before, storyDistanceAt(before, 1, 0.6));
  const fraction = original.local / before.segments[original.index].duration;
  const restored = getStoryFrame(after, storyDistanceAt(after, original.index, fraction));
  assert.equal(restored.index, 1);
  near(restored.local / after.segments[1].duration, 0.6);
  assert.equal(storyDistanceAt(before, 1), before.segments[1].start);
  assert.equal(storyDistanceAt(before, -3, -1), 0);
  assert.equal(storyDistanceAt(before, Infinity, Infinity), before.distance);
  assert.equal(storyDistanceAt(before, NaN, NaN), 0);
});

test('a longer fixed scene unfolds through its full hold and reverses before its page transition', () => {
  const track = buildStoryTrack([600, 600], 600, [2.5]);
  const first = track.segments[0];
  assert.equal(first.hold, 1500);
  assert.equal(first.pan, 0);
  const positions = [0, 375, 750, 1125, 1500];
  const forward = positions.map(distance => getStoryFrame(track, distance));
  assert.deepEqual(forward.map(frame => frame.sceneProgress), [0, .25, .5, .75, 1]);
  assert.ok(forward.every(frame => frame.index === 0 && frame.panY === 0 && frame.transition === 0));
  assert.deepEqual(positions.toReversed().map(distance => getStoryFrame(track, distance)).toReversed(), forward);
  near(getStoryFrame(track, first.hold + first.transition / 2).transition, .5);
  assert.equal(getStoryFrame(track, first.end).index, 1);
  assert.equal(track.segments[1].hold, 192, 'unspecified reading scenes keep their established timing');
});

test('a longer hold still reveals every pixel of a tall scene before leaving it', () => {
  const track = buildStoryTrack([1800, 600], 600, [3]);
  const first = track.segments[0];
  assert.equal(getStoryFrame(track, 1700).panY, 0);
  const reading = getStoryFrame(track, first.hold + 600);
  assert.equal(reading.panY, -600);
  assert.equal(reading.transition, 0);
  const bottom = getStoryFrame(track, first.hold + first.pan);
  assert.equal(bottom.panY, -1200);
  assert.equal(bottom.sceneProgress, 1);
  assert.equal(bottom.transition, 0);
  near(getStoryFrame(track, first.hold + first.pan + first.transition / 2).transition, .5);
});

test('hold factors reject invalid values and cap excessive or tiny durations', () => {
  const invalid = [undefined, null, NaN, Infinity, -Infinity, -1, 0, '3', {}, []];
  const ordinary = buildStoryTrack([600, 800], 600);
  for (const value of invalid) {
    assert.deepEqual(buildStoryTrack([600, 800], 600, [value]), ordinary);
  }
  for (const value of [null, '3', { 0: 3 }]) {
    assert.deepEqual(buildStoryTrack([600, 800], 600, value), ordinary);
  }
  const bounded = buildStoryTrack([600, 600, 600], 600, [Number.MAX_VALUE, .001, 1.5]);
  assert.deepEqual(bounded.segments.map(segment => segment.hold), [2400, 192, 900]);
  assert.ok(Number.isFinite(bounded.distance));
});

test('resizing a fixed unfolding scene preserves its internal progress when restoring its logical place', () => {
  const before = buildStoryTrack([600, 600, 1200], 600, [2, 3]);
  const after = buildStoryTrack([390, 390, 1000], 390, [2, 3]);
  const original = getStoryFrame(before, before.segments[1].start + before.segments[1].hold * .7);
  const fraction = original.local / before.segments[1].duration;
  const restored = getStoryFrame(after, storyDistanceAt(after, 1, fraction));
  assert.equal(restored.index, 1);
  near(restored.sceneProgress, original.sceneProgress);
  near(restored.sceneProgress, .7);
  assert.equal(restored.panY, 0);
  assert.equal(restored.transition, 0);
});
