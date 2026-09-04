import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bestCommuteResult, commuteDecision, commuteRank, filterCommuteCandidates,
  haversineKm, isGeoPoint, normalizeGeoPoint,
} from '../js/transport-core.mjs';

test('computes straight-line distance without presenting it as a route duration', () => {
  const distance = haversineKm({ lat: 37.5665, lng: 126.978 }, { lat: 37.3947, lng: 127.1112 });
  assert.ok(distance > 20 && distance < 25);
});

test('selects the fastest verified route and applies a strict minute limit', () => {
  const commute = bestCommuteResult([
    { mode: 'car', verified: true, durationMinutes: 61 },
    { mode: 'transit', verified: true, durationMinutes: 54 },
    { mode: 'walk', verified: false, durationMinutes: 12 },
  ], 60);
  assert.equal(commute.best.mode, 'transit');
  assert.equal(commute.best.withinLimit, true);
});

test('keeps verified matches, distance estimates, over-limit routes, and unknowns separate', () => {
  assert.deepEqual(commuteRank({ commute: { best: { verified: true, withinLimit: true, durationMinutes: 45 } } }), [0, 45]);
  assert.deepEqual(commuteRank({ distanceKm: 12.3 }), [1, 12.3]);
  assert.deepEqual(commuteRank({ commute: { best: { verified: true, withinLimit: false, durationMinutes: 70 } } }), [2, 70]);
  assert.deepEqual(commuteRank({}), [3, Number.POSITIVE_INFINITY]);
});

test('treats an over-limit partial route as pending until every requested mode is checked', () => {
  const partial = {
    distanceKm: 9.4,
    commute: {
      best: { verified: true, withinLimit: false, durationMinutes: 68 },
      allRequestedModesChecked: false,
    },
  };
  assert.equal(commuteDecision(partial), 'pending');
  assert.deepEqual(commuteRank(partial), [1, 9.4]);
});

test('filters commute matches without treating straight-line distance as verification', () => {
  const candidates = [
    { id: 'match', commute: { best: { verified: true, withinLimit: true, durationMinutes: 43 } } },
    { id: 'unknown', distanceKm: 4.1 },
    { id: 'over', commute: { best: { verified: true, withinLimit: false, durationMinutes: 72 } } },
  ];
  assert.deepEqual(filterCommuteCandidates(candidates, 'matched').map((item) => item.id), ['match']);
  assert.deepEqual(filterCommuteCandidates(candidates, 'pending').map((item) => item.id), ['unknown']);
  assert.equal(filterCommuteCandidates(candidates, 'all').length, 3);
});

test('null and blank coordinates never become a real zero coordinate or distance', () => {
  assert.equal(normalizeGeoPoint({ lat: null, lng: 127 }), null);
  assert.equal(normalizeGeoPoint({ lat: '', lng: '127' }), null);
  assert.equal(isGeoPoint({ lat: 0, lng: 0 }), true);
  assert.equal(haversineKm({ lat: null, lng: null }, { lat: 37.5, lng: 127 }), null);
  assert.deepEqual(commuteRank({ distanceKm: null }), [3, Number.POSITIVE_INFINITY]);
  assert.deepEqual(commuteRank({ distanceKm: '' }), [3, Number.POSITIVE_INFINITY]);
});
