import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCommuteBalance,
  expectedTransitProviderCalls,
  normalizeDestinations,
  quotaAwareCandidateCap,
} from '../js/commute-balance-core.mjs';

const destinations = [
  {
    id: 'office-a', label: '성우 회사', address: '서울 A', lat: 37.5, lng: 127.0,
    required: true, daysPerWeek: 5, mode: 'transit', maxMinutes: 60, departureTime: '08:30',
  },
  {
    id: 'office-b', label: '소희 회사', address: '서울 B', lat: 37.4, lng: 127.1,
    required: true, daysPerWeek: 2, mode: 'car+transit', maxMinutes: 50,
  },
];

test('normalizes one to four destinations and preserves commute intent', () => {
  const normalized = normalizeDestinations([...destinations, {}, {}, {}]);
  assert.equal(normalized.length, 4);
  assert.deepEqual(normalized[1].modes, ['car', 'transit']);
  assert.equal(normalized[0].weight, 5);
  assert.equal(normalized[0].departureTime, '08:30');
  assert.equal(normalized[2].required, true);
  assert.equal(normalized[2].hasCoordinates, false);
});

test('matches only when every required destination is verified and inside its own limit', () => {
  const result = evaluateCommuteBalance({
    id: 'apt-1',
    routesByDestination: {
      'office-a': { verified: true, mode: 'transit', durationMinutes: 48, walkingMinutes: 12, transferCount: 1 },
      'office-b': [
        { verified: true, mode: 'car', durationMinutes: 45, walkingMinutes: 0, transferCount: 0 },
        { verified: true, mode: 'transit', durationMinutes: 54, walkingMinutes: 8, transferCount: 2 },
      ],
    },
  }, destinations);

  assert.equal(result.matched, true);
  assert.equal(result.decision, 'matched');
  assert.equal(result.requiredFullyVerified, true);
  assert.equal(result.worstRatio, 0.9);
  assert.equal(result.weightedMeanMinutes, 47.1);
  assert.ok(result.balanceScore >= 0 && result.balanceScore <= 100);
  assert.equal(result.balanceScoreFormula.includes('walkingPenalty'), true);
});

test('a missing required route stays pending and an over-limit verified route is excluded', () => {
  const pending = evaluateCommuteBalance({
    routesByDestination: {
      'office-a': { verified: true, mode: 'transit', durationMinutes: 40 },
    },
  }, destinations);
  assert.equal(pending.decision, 'pending');
  assert.deepEqual(pending.blockingDestinationIds, ['office-b']);

  const excluded = evaluateCommuteBalance({
    routesByDestination: {
      'office-a': { verified: true, mode: 'transit', durationMinutes: 40 },
      'office-b': { verified: true, mode: 'transit', durationMinutes: 51 },
    },
  }, destinations);
  assert.equal(excluded.matched, false);
  assert.equal(excluded.decision, 'excluded');
  assert.deepEqual(excluded.blockingDestinationIds, ['office-b']);
});

test('optional destination does not block the hard match gate', () => {
  const optional = [{ ...destinations[0] }, { ...destinations[1], required: false }];
  const result = evaluateCommuteBalance({
    routesByDestination: {
      'office-a': { verified: true, mode: 'transit', durationMinutes: 55 },
    },
  }, optional);
  assert.equal(result.matched, true);
  assert.equal(result.decision, 'matched');
});

test('transit quota helpers count destination-candidate pairs and cached pairs', () => {
  assert.equal(expectedTransitProviderCalls(destinations, 3), 6);
  assert.equal(expectedTransitProviderCalls(destinations, [{ id: 'a' }, { id: 'b' }], {
    cachedPairKeys: ['a|office-a|transit'],
  }), 3);
  assert.deepEqual(quotaAwareCandidateCap(destinations, 10, { requestedCandidates: 9 }), {
    candidateCap: 5,
    callsPerCandidate: 2,
    expectedCalls: 10,
    remainingDailyQuota: 10,
  });
});
test('car-only destinations cost no transit calls', () => {
  const carOnly = [{ id: 'car', label: '차량 회사', mode: 'car', maxMinutes: 60 }];
  assert.equal(expectedTransitProviderCalls(carOnly, 100), 0);
  assert.deepEqual(quotaAwareCandidateCap(carOnly, 0, { requestedCandidates: 100 }), {
    candidateCap: 100,
    callsPerCandidate: 0,
    expectedCalls: 0,
    remainingDailyQuota: 0,
  });
});
