import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recommendationBudget,
  effectiveRecommendationDestinations,
  reconcileCandidateRecommendationContext,
  orderLocationVerificationQueue,
  destinationLetter,
} from '../js/personalized-context-core.mjs';
import { normalizeDestinations, evaluateCommuteBalance } from '../js/commute-balance-core.mjs';
import { destinationFingerprint, routeRequestFingerprint, candidateVerificationStatus, originFingerprint } from '../js/recommendation-verification-core.mjs';
import { rankPersonalizedCandidates } from '../js/personalized-ranking-core.mjs';
import { normalizeParkingEvidence } from '../js/parking-evidence-core.mjs';

const anchor = { name: '강남역', lat: 37.49805, lng: 127.02795 };
const filters = { commuteModes: ['transit'], commuteMaxMinutes: 90, commuteDepartureTime: '08:00', preferSubway: true };
const workplaces = [10, 50, 40].map((weightPercent, index) => ({
  id: `company-${index}`, label: `회사 ${destinationLetter(index)}`, address: `회사 주소 ${index}`,
  lat: 37.5 + index * .01, lng: 127 + index * .01, weightPercent, weightSource: 'explicit-percent',
}));
const destinations = effectiveRecommendationDestinations(workplaces, anchor, filters);
const verifiedAt = new Date(Date.now() - 60000).toISOString();
const route = (durationMinutes, extra = {}) => ({
  mode: 'transit', verified: true, durationMinutes, walkingMinutes: 0, transferCount: 0,
  transitComposition: 'subway', queriedAt: verifiedAt, ...extra,
});
const matrix = (times = [20, 40, 60]) => Object.fromEntries(destinations.map((d, index) => [d.id, route(times[index])]));
const verifiedCandidate = () => {
  const candidate = {
    id: 'home', catalogId: 'home', name: '집', address: '서울특별시 서초구', lat: 37.5, lng: 127,
    households: 1000, builtYear: 2020, priceVerified: true, bestArea: { count: 3, averagePriceManWon: 70000 },
    routesByDestination: matrix(),
    commuteVerification: { stage: 'final', provider: 'tmap', destinationFingerprint: destinationFingerprint(destinations), originFingerprint: originFingerprint({ lat: 37.5, lng: 127 }), verifiedAt, stale: false },
    commuteScreening: { provider: 'kakao', destinationFingerprint: destinationFingerprint(destinations), originFingerprint: originFingerprint({ lat: 37.5, lng: 127 }), verifiedAt, routesByDestination: matrix([25, 45, 65]) },
    personalizedRecommendation: { score: 1, decision: 'matched' },
  };
  candidate.commuteBalance = evaluateCommuteBalance(candidate, destinations);
  candidate.commuteScreening.balance = evaluateCommuteBalance(candidate.commuteScreening, destinations);
  return candidate;
};

test('editing A 10, B 50, C 40 in sequence preserves entered percentages through normalization', () => {
  let saved = workplaces.map(d => ({ ...d, weightPercent: 0 }));
  for (const [index, percent] of [10, 50, 40].entries()) {
    saved = saved.map((d, i) => i === index ? { ...d, weightPercent: percent, weightSource: 'explicit-percent' } : d);
    saved = effectiveRecommendationDestinations(saved, anchor, filters);
    assert.deepEqual(saved.map(d => d.weightPercent), [10, 50, 40].map((value, i) => i <= index ? value : 0));
    assert.ok(Math.abs(saved.reduce((sum, d) => sum + d.normalizedWeightPercent, 0) - 100) < 1e-10);
    assert.deepEqual(normalizeDestinations(saved), saved);
  }
  assert.deepEqual(saved.map(d => d.normalizedWeightPercent), [10, 50, 40]);
});

test('zero total weight remains explicit and cannot confirm a commute recommendation', () => {
  const zero = effectiveRecommendationDestinations(workplaces.map(d => ({ ...d, weightPercent: 0 })), anchor, filters);
  assert.deepEqual(zero.map(d => d.normalizedWeightPercent), [0, 0, 0]);
  const balance = evaluateCommuteBalance(verifiedCandidate(), zero);
  assert.equal(balance.invalidWeights, true);
  assert.equal(balance.decision, 'pending');
  assert.equal(balance.weightedMeanMinutes, null);
});

test('no workplace uses the supplied exact Gangnam anchor at 100 percent; no anchor is not fabricated', () => {
  const fallback = effectiveRecommendationDestinations([], anchor, filters);
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].id, 'default-gangnam');
  assert.equal(fallback[0].label, '강남역');
  assert.equal(fallback[0].lat, anchor.lat);
  assert.equal(fallback[0].lng, anchor.lng);
  assert.equal(fallback[0].weightPercent, 100);
  assert.equal(fallback[0].normalizedWeightPercent, 100);
  assert.equal(fallback[0].required, true);
  assert.deepEqual(effectiveRecommendationDestinations([], null, filters), []);
  assert.deepEqual(effectiveRecommendationDestinations([], { lat: null, lng: null }, filters), []);
  assert.equal(effectiveRecommendationDestinations(workplaces, anchor, filters).length, 3);
});

test('six workplaces, individual time limits, and global preferences survive canonicalization', () => {
  const saved = normalizeDestinations(Array.from({ length: 6 }, (_, index) => ({
    ...workplaces[0], id: `company-${index}`, weightPercent: 10,
  })));
  assert.ok(saved.every(d => d.preferSubwaySource === 'default' && d.preferSubway === false));
  const actual = effectiveRecommendationDestinations(saved.map((d, index) => ({
    ...d, ...(index === 4 ? { individualMaxMinutes: 35 } : {}),
  })), anchor, { ...filters, commuteMaxMinutes: 75, commuteDepartureTime: '07:30' });
  assert.equal(actual.length, 6);
  assert.deepEqual(actual.map(d => d.maxMinutes), [75, 75, 75, 75, 35, 75]);
  assert.ok(actual.every(d => d.preferSubway === true && d.preferSubwaySource === 'explicit'));
  assert.ok(actual.every(d => d.departureTime === '07:30'));
  const disabled = effectiveRecommendationDestinations(saved, anchor, { ...filters, preferSubway: false });
  assert.ok(disabled.every(d => d.preferSubway === false));
});

test('weight-only edits reuse observed routes, recalculate both stages, and retain the query timestamp', () => {
  const previous = verifiedCandidate();
  const before = structuredClone(previous);
  const nextDestinations = effectiveRecommendationDestinations(workplaces.map((d, index) => ({ ...d, weightPercent: [80, 10, 10][index] })), anchor, filters);
  assert.equal(routeRequestFingerprint(destinations), routeRequestFingerprint(nextDestinations));
  assert.notEqual(destinationFingerprint(destinations), destinationFingerprint(nextDestinations));
  const next = reconcileCandidateRecommendationContext(previous, destinations, nextDestinations);
  assert.equal(next.routesByDestination, previous.routesByDestination);
  assert.equal(previous.commuteBalance.weightedMeanMinutes, 46);
  assert.equal(next.commuteBalance.weightedMeanMinutes, 26);
  assert.equal(next.commuteBalance.weightedMeanCostMinutes, 26);
  assert.equal(next.commuteScreening.balance.weightedMeanMinutes, 31);
  assert.equal(next.commuteVerification.verifiedAt, verifiedAt);
  assert.equal(next.commuteScreening.verifiedAt, verifiedAt);
  assert.equal(next.commuteVerification.destinationFingerprint, destinationFingerprint(nextDestinations));
  assert.equal(next.personalizedRecommendation, undefined);
  assert.equal(candidateVerificationStatus(next, { destinationFingerprint: destinationFingerprint(nextDestinations) }).final, true);
  assert.deepEqual(previous, before);
});

test('changing only a destination limit immediately changes its gate using the same measured routes', () => {
  const previous = verifiedCandidate();
  const changed = effectiveRecommendationDestinations(workplaces.map((d, index) => ({ ...d, ...(index === 2 ? { individualMaxMinutes: 50 } : {}) })), anchor, filters);
  const next = reconcileCandidateRecommendationContext(previous, destinations, changed);
  assert.equal(next.routesByDestination, previous.routesByDestination);
  assert.equal(next.commuteBalance.decision, 'excluded');
  assert.deepEqual(next.commuteBalance.blockingDestinationIds, ['company-2']);
  assert.equal(next.commuteVerification.verifiedAt, verifiedAt);
});

test('global subway preference reselects saved alternatives without treating the preference penalty as travel time', () => {
  const noPreference = effectiveRecommendationDestinations(workplaces, anchor, { ...filters, preferSubway: false });
  const previous = verifiedCandidate();
  previous.routesByDestination = Object.fromEntries(destinations.map(d => [d.id, [
    route(30, { transitComposition: 'bus' }), route(35, { transitComposition: 'subway' }),
  ]]));
  previous.commuteVerification.destinationFingerprint = destinationFingerprint(noPreference);
  previous.commuteBalance = evaluateCommuteBalance(previous, noPreference);
  assert.equal(previous.commuteBalance.weightedMeanMinutes, 30);
  const next = reconcileCandidateRecommendationContext(previous, noPreference, destinations);
  assert.equal(next.routesByDestination, previous.routesByDestination);
  assert.equal(next.commuteBalance.weightedMeanMinutes, 35);
  assert.ok(next.commuteBalance.evaluations.every(row => row.best.transitComposition === 'subway'));
  assert.equal(next.commuteVerification.verifiedAt, verifiedAt);
});

test('address coordinates, departure, mode, or destination membership changes invalidate both route stages', () => {
  const variants = [
    workplaces.map((d, index) => index ? d : { ...d, address: '이전한 회사', lat: d.lat + .02 }),
    workplaces.slice(1),
    [...workplaces, { ...workplaces[0], id: 'company-3' }],
  ].map(items => effectiveRecommendationDestinations(items, anchor, filters));
  variants.push(effectiveRecommendationDestinations(workplaces, anchor, { ...filters, commuteDepartureTime: '09:00' }));
  variants.push(effectiveRecommendationDestinations(workplaces, anchor, { ...filters, commuteModes: ['car'] }));
  for (const changed of variants) {
    const previous = verifiedCandidate();
    const next = reconcileCandidateRecommendationContext(previous, destinations, changed);
    assert.equal(next.routesByDestination, undefined);
    assert.equal(next.commuteBalance, undefined);
    assert.equal(next.commuteScreening, undefined);
    assert.equal(next.personalizedRecommendation, undefined);
    assert.equal(next.commuteVerification.stale, true);
    assert.equal(next.commuteVerification.staleReason, 'destination-context-changed');
    assert.ok(previous.routesByDestination);
  }
});

test('renaming an address at the same coordinates reuses routes, but previously stale or foreign routes cannot revive', () => {
  const renamed = effectiveRecommendationDestinations(workplaces.map(d => ({ ...d, label: `${d.label} 수정`, address: `${d.address} 표기 수정` })), anchor, filters);
  const previous = verifiedCandidate();
  const next = reconcileCandidateRecommendationContext(previous, destinations, renamed);
  assert.equal(next.routesByDestination, previous.routesByDestination);
  assert.equal(next.commuteVerification.stale, false);
  for (const verification of [{ ...previous.commuteVerification, stale: true }, { ...previous.commuteVerification, destinationFingerprint: 'old-context' }]) {
    const stale = reconcileCandidateRecommendationContext({ ...previous, commuteVerification: verification }, destinations, renamed);
    assert.equal(stale.routesByDestination, undefined);
    assert.equal(stale.commuteVerification.stale, true);
  }
});

test('preference changes cannot reuse expired or displaced-origin route matrices in either stage', () => {
  const previous = verifiedCandidate();
  const reweighted = effectiveRecommendationDestinations(workplaces.map(d => ({ ...d, weightPercent: 1 })), anchor, filters);
  for (const [candidate, now, reason] of [
    [previous, Date.parse(verifiedAt) + 8 * 60 * 60 * 1000, 'route-evidence-expired'],
    [{ ...previous, lat: 36.99 }, Date.parse(verifiedAt) + 60000, 'origin-coordinate-changed'],
  ]) {
    const next = reconcileCandidateRecommendationContext(candidate, destinations, reweighted, { now });
    assert.equal(next.routesByDestination, undefined);
    assert.equal(next.commuteBalance, undefined);
    assert.equal(next.commuteScreening, undefined);
    assert.equal(next.commuteVerification.stale, true);
    assert.equal(next.commuteVerification.staleReason, reason);
  }
  assert.ok(previous.routesByDestination);
});

test('7억 plus 10 percent produces the inclusive 7.7억 gate and preserves unknown versus zero parking', () => {
  const budget = recommendationBudget(70000, 10);
  assert.deepEqual(budget, { targetPriceManWon: 70000, maxOverBudgetPct: 10, maxPriceManWon: 77000 });
  const at = verifiedCandidate();
  at.bestArea.averagePriceManWon = budget.maxPriceManWon;
  at.parkingEvidence = normalizeParkingEvidence({ sourceType: 'field', spacesPerHousehold: 1, observedAt: '2026-09-06' });
  const rankingOptions = { ...budget, destinations, requireParking: true, minParkingRatio: 1, currentYear: 2026 };
  const rank = candidate => rankPersonalizedCandidates([candidate], rankingOptions)[0].personalizedRecommendation;
  assert.equal(rank(at).decision, 'matched');
  assert.equal(rank(at).dimensions.parking.score, 10);
  const over = { ...at, bestArea: { ...at.bestArea, averagePriceManWon: 77001 } };
  assert.equal(rank(over).decision, 'excluded');
  assert.ok(rank(over).gateReasons.includes('price-over-ceiling'));
  const unknown = { ...at, parkingEvidence: normalizeParkingEvidence() };
  assert.equal(rank(unknown).decision, 'matched');
  assert.equal(rank(unknown).dimensions.parking.value, null);
  const none = { ...at, parkingEvidence: normalizeParkingEvidence({ sourceType: 'field', spacesPerHousehold: 0 }) };
  assert.equal(rank(none).decision, 'excluded');
  const decimalBoundary = { ...at, bestArea: { ...at.bestArea, averagePriceManWon: 103500 } };
  const correctedBudget = recommendationBudget(90000, 15);
  assert.equal(rankPersonalizedCandidates([decimalBoundary], { ...rankingOptions, ...correctedBudget })[0].personalizedRecommendation.decision, 'matched');
  decimalBoundary.bestArea.averagePriceManWon = 103501;
  assert.equal(rankPersonalizedCandidates([decimalBoundary], { ...rankingOptions, ...correctedBudget })[0].personalizedRecommendation.decision, 'excluded');
});

test('budget numbers reject blanks, booleans and nonfinite values without lowering whole-manwon ceilings', () => {
  for (const value of [null, undefined, '', ' ', true, false, [], {}, NaN, Infinity, -Infinity, 0, -1, 'not-a-number']) {
    assert.equal(recommendationBudget(value, 10), null, `invalid target ${String(value)}`);
  }
  for (const value of [null, '', ' ', true, false, [], {}, NaN, Infinity, -Infinity, -1, 101, 'not-a-number']) {
    assert.equal(recommendationBudget(70000, value), null, `invalid tolerance ${String(value)}`);
  }
  assert.equal(recommendationBudget(70000).maxPriceManWon, 77000);
  assert.equal(recommendationBudget('70000', '10').maxPriceManWon, 77000);
  assert.equal(recommendationBudget(70000, 0).maxPriceManWon, 70000);
  assert.equal(recommendationBudget(90000, 15).maxPriceManWon, 103500);
  assert.equal(recommendationBudget(70001, 10).maxPriceManWon, 77001);
  assert.equal(recommendationBudget(Number.MAX_VALUE, 100), null);
});

test('location verification queue follows destination weights without mutating candidates or claiming route times', () => {
  const source = [{ id: 'far-from-main', lat: 37.1, lng: 127 }, { id: 'close-to-main', lat: 37.7, lng: 127 }, { id: 'missing' }];
  const before = structuredClone(source);
  const queue = orderLocationVerificationQueue(source, [{ id: 'a', lat: 37.1, lng: 127, weightPercent: 10 }, { id: 'b', lat: 37.7, lng: 127, weightPercent: 90 }]);
  assert.deepEqual(queue.map(item => item.id), ['close-to-main', 'far-from-main', 'missing']);
  assert.deepEqual(source, before);
  assert.deepEqual(queue[0], source[1]);
  assert.deepEqual([0, 4, 25, 26, 27].map(destinationLetter), ['A', 'E', 'Z', 'AA', 'AB']);
});
