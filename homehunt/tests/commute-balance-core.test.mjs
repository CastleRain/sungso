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

test('preserves every destination without a hidden four-company limit', () => {
  const normalized = normalizeDestinations([...destinations, {}, {}, {}]);
  assert.equal(normalized.length, 5);
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
  assert.equal(pending.weightedMeanMinutes, null, 'a partial route matrix cannot impersonate the full weighted average');
  assert.deepEqual(pending.blockingDestinationIds, ['office-b']);

  const excluded = evaluateCommuteBalance({
    routesByDestination: {
      'office-a': { verified: true, mode: 'transit', durationMinutes: 40 },
      'office-b': [{ verified: true, mode: 'transit', durationMinutes: 51 }, { verified: true, mode: 'car', durationMinutes: 55 }],
    },
  }, destinations);
  assert.equal(excluded.matched, false);
  assert.equal(excluded.decision, 'excluded');
  assert.deepEqual(excluded.blockingDestinationIds, ['office-b']);
});

test('explicit percentage input is preserved and days-based legacy weights refresh after edits', () => {
  const raw = [{ id: 'a', weightPercent: 10 }, { id: 'b', weightPercent: 50 }, { id: 'c', weightPercent: 40 }];
  const normalized = normalizeDestinations(raw);
  assert.deepEqual(normalized.map(item => item.normalizedWeightPercent), [10, 50, 40]);
  assert.deepEqual(normalized.map(item => item.weightSource), ['explicit-percent', 'explicit-percent', 'explicit-percent']);
  const changed = normalizeDestinations([{ ...normalized[0], weightPercent: 20 }, normalized[1], normalized[2]]);
  assert.deepEqual(changed.map(item => item.weightPercent), [20, 50, 40]);
  assert.ok(Math.abs(changed.reduce((sum, item) => sum + item.normalizedWeightPercent, 0) - 100) < 1e-10);
  const old = normalizeDestinations([{ id: 'a', daysPerWeek: 5, weight: 5 }, { id: 'b', daysPerWeek: 1, weight: 1 }]);
  const edited = normalizeDestinations([{ ...old[0], daysPerWeek: 1 }, old[1]]);
  assert.deepEqual(edited.map(item => item.normalizedWeightPercent), [50, 50]);
  assert.equal(edited[0].weightSource, 'days-per-week');
  assert.deepEqual(normalizeDestinations(normalized), normalized);
});

test('unverified alternate means pending when the only measured route exceeds the limit', () => {
  const result = evaluateCommuteBalance({ routesByDestination: { company: [
    { mode: 'transit', verified: true, durationMinutes: 80 },
    { mode: 'car', verified: false, status: 'error', reasonCode: 'TIMEOUT' },
  ] } }, [{ id: 'company', modes: ['transit', 'car'], maxMinutes: 60 }]);
  assert.equal(result.decision, 'pending');
  assert.equal(result.requiredFullyVerified, false);
  assert.deepEqual(result.evaluations[0].unresolvedModes, ['car']);
});

test('route selection trades actual minutes against transfers and honors subway preference', () => {
  const company = [{ id: 'company', modes: ['transit'], maxMinutes: 60 }];
  const routes = { company: [
    { mode: 'transit', verified: true, durationMinutes: 20, walkingMinutes: 2, transferCount: 2, transitComposition: 'subway' },
    { mode: 'transit', verified: true, durationMinutes: 30, walkingMinutes: 2, transferCount: 0, transitComposition: 'subway' },
  ] };
  assert.equal(evaluateCommuteBalance({ routesByDestination: routes }, company).evaluations[0].durationMinutes, 30);
  const alternatives = { company: [
    { mode: 'transit', verified: true, durationMinutes: 25, walkingMinutes: 2, transferCount: 0, transitComposition: 'bus' },
    { mode: 'transit', verified: true, durationMinutes: 28, walkingMinutes: 2, transferCount: 0, transitComposition: 'subway' },
  ] };
  const normalizedCompany = normalizeDestinations(company);
  assert.equal(evaluateCommuteBalance({ routesByDestination: alternatives }, normalizedCompany, { preferSubway: true }).evaluations[0].durationMinutes, 28);
  assert.equal(evaluateCommuteBalance({ routesByDestination: alternatives }, company, { preferSubway: false }).evaluations[0].durationMinutes, 25);
});

test('route uncertainty never becomes zero walking, zero transfers, or a confirmed cost score', () => {
  const result = evaluateCommuteBalance({ routesByDestination: { company: { mode: 'transit', verified: true, durationMinutes: 35 } } }, [{ id: 'company' }]);
  assert.equal(result.decision, 'matched', 'known time can meet the time gate while burden remains unknown');
  assert.equal(result.evaluations[0].walkingMinutes, null);
  assert.equal(result.evaluations[0].transferCount, null);
  assert.equal(result.weightedMeanCostMinutes, null);
  assert.equal(result.balanceScore, null);
  assert.equal(result.costCoverageComplete, false);
});

test('all-zero percentages stay invalid instead of silently becoming equal weights', () => {
  const result = evaluateCommuteBalance({ routesByDestination: { company: { verified: true, mode: 'car', durationMinutes: 20 } } }, [{ id: 'company', mode: 'car', weightPercent: 0 }]);
  assert.equal(result.invalidWeights, true);
  assert.equal(result.decision, 'pending');
  assert.equal(result.balanceScore, null);
});

test('shared workplace labels never reuse one route under another destination identity', () => {
  const result = evaluateCommuteBalance({ routesByDestination: { '같은 회사': { mode: 'car', verified: true, durationMinutes: 10 } } }, [
    { id: 'building-a', label: '같은 회사', mode: 'car' },
    { id: 'building-b', label: '같은 회사', mode: 'car' },
  ]);
  assert.equal(result.decision, 'pending');
  assert.equal(result.verifiedDestinationCount, 0);
});

test('positive-weight soft time limits still require an actual route', () => {
  const optional = [{ ...destinations[0] }, { ...destinations[1], required: false }];
  const result = evaluateCommuteBalance({
    routesByDestination: {
      'office-a': { verified: true, mode: 'transit', durationMinutes: 55 },
    },
  }, optional);
  assert.equal(result.matched, false);
  assert.equal(result.decision, 'pending');
  assert.equal(result.requiredFullyVerified, false);
  assert.equal(result.weightedMeanMinutes, null);
  assert.deepEqual(result.blockingDestinationIds, ['office-b']);
});

const threeOffices = [
  { id: 'bundang', weightPercent: 40, required: true },
  { id: 'pangyo', weightPercent: 50, required: true },
  { id: 'gwanghwamun', weightPercent: 10, required: false },
].map(destination => ({ ...destination, mode: 'transit', maxMinutes: 60 }));
const measured = durationMinutes => ({ mode: 'transit', verified: true, durationMinutes, walkingMinutes: 0, transferCount: 0 });
const threeOfficeRoutes = times => ({ routesByDestination: Object.fromEntries(threeOffices.map((destination, index) => [destination.id, measured(times[index])])) });

test('40/50/10 weights allow a 90-minute soft commute and preserve its full weighted burden', () => {
  const result = evaluateCommuteBalance(threeOfficeRoutes([20, 20, 90]), threeOffices);
  const seoul = evaluateCommuteBalance(threeOfficeRoutes([60, 60, 10]), threeOffices);
  assert.equal(result.decision, 'matched');
  assert.equal(result.requiredFullyVerified, true);
  assert.equal(result.requiredDestinationCount, 2);
  assert.equal(result.routeRequiredDestinationCount, 3);
  assert.equal(result.weightedMeanMinutes, 27);
  assert.equal(result.weightedMeanCostMinutes, 27);
  assert.equal(seoul.weightedMeanMinutes, 55);
  assert.ok(result.balanceScore > seoul.balanceScore);
  assert.equal(result.evaluations[2].withinLimit, false);
  assert.equal(result.evaluations[2].timeLimitRequired, false);
  assert.equal(result.evaluations[2].routeRequired, true);
  assert.equal(result.evaluations[2].decision, 'matched');
  assert.equal(evaluateCommuteBalance(threeOfficeRoutes([61, 20, 90]), threeOffices).decision, 'excluded');
  assert.equal(evaluateCommuteBalance(threeOfficeRoutes([20, 20, 90]), threeOffices.map(destination => ({ ...destination, required: true }))).decision, 'excluded');
});

test('all soft time limits can match, but a missing or definitively absent positive-weight route cannot', () => {
  const soft = threeOffices.map(destination => ({ ...destination, required: false }));
  const complete = threeOfficeRoutes([90, 80, 100]);
  assert.equal(evaluateCommuteBalance(complete, soft).decision, 'matched');
  const missing = structuredClone(complete);
  delete missing.routesByDestination.gwanghwamun;
  assert.equal(evaluateCommuteBalance(missing, soft).decision, 'pending');
  missing.routesByDestination.gwanghwamun = { mode: 'transit', verified: false, reasonCode: 'TMAP_NO_ROUTE' };
  const absent = evaluateCommuteBalance(missing, soft);
  assert.equal(absent.decision, 'excluded');
  assert.equal(absent.measuredExcluded, true);
  assert.equal(absent.weightedMeanMinutes, null);
  assert.deepEqual(absent.blockingDestinationIds, ['gwanghwamun']);
  missing.routesByDestination.gwanghwamun = { mode: 'transit', verified: false, reasonCode: 'TIMEOUT' };
  assert.equal(evaluateCommuteBalance(missing, soft).decision, 'pending');
});

test('zero-weight soft destinations do not affect coverage, burden or the hard time-limit gate', () => {
  const targets = [{ id: 'visited', mode: 'transit', weightPercent: 100 }, { id: 'unused', mode: 'transit', weightPercent: 0, required: false }];
  const missing = { routesByDestination: { visited: measured(30) } };
  const result = evaluateCommuteBalance(missing, targets);
  assert.equal(result.decision, 'matched');
  assert.equal(result.timeCoverageComplete, true);
  assert.equal(result.costCoverageComplete, true);
  assert.equal(result.routeRequiredDestinationCount, 1);
  assert.equal(result.evaluations[1].routeRequired, false);
  for (const unused of [measured(200), { mode: 'transit', verified: false, reasonCode: 'TMAP_NO_ROUTE' }]) {
    const withUnused = evaluateCommuteBalance({ routesByDestination: { ...missing.routesByDestination, unused } }, targets);
    assert.equal(withUnused.decision, result.decision);
    assert.equal(withUnused.weightedMeanCostMinutes, result.weightedMeanCostMinutes);
    assert.equal(withUnused.worstRatio, result.worstRatio);
    assert.equal(withUnused.balanceScore, result.balanceScore);
  }
  assert.equal(evaluateCommuteBalance(missing, targets.map(destination => ({ ...destination, required: true }))).decision, 'pending', 'explicit strict limits still apply at zero weight');
});

test('soft time limits choose the lowest known burden across verified alternatives', () => {
  const alternatives = { routesByDestination: { company: [
    { ...measured(59), walkingMinutes: 20, transferCount: 2 },
    measured(65),
  ] } };
  const soft = [{ id: 'company', required: false, weightPercent: 100, maxMinutes: 60 }];
  const result = evaluateCommuteBalance(alternatives, soft);
  assert.equal(result.decision, 'matched');
  assert.equal(result.weightedMeanMinutes, 65);
  assert.equal(result.weightedMeanCostMinutes, 65);
  assert.equal(evaluateCommuteBalance(alternatives, [{ ...soft[0], required: true }]).weightedMeanMinutes, 59);
  const mixed = { routesByDestination: { company: [measured(90), { mode: 'car', verified: false, reasonCode: 'TIMEOUT' }] } };
  assert.equal(evaluateCommuteBalance(mixed, [{ ...soft[0], modes: ['transit', 'car'] }]).decision, 'matched', 'one verified allowed mode suffices for a soft time limit');
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
