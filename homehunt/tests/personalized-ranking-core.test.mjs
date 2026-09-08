import test from 'node:test';
import assert from 'node:assert/strict';
import { rankPersonalizedCandidates, PERSONALIZED_SCORE_WEIGHTS } from '../js/personalized-ranking-core.mjs';

const destinations = [{ id: 'a', label: '회사 A', weightPercent: 10 }, { id: 'b', label: '회사 B', weightPercent: 50 }, { id: 'c', label: '회사 C', weightPercent: 40 }]
  .map(destination => ({ ...destination, lat: 37.5, lng: 127, mode: 'transit', maxMinutes: 90 }));
const route = minutes => ({ mode: 'transit', verified: true, durationMinutes: minutes, walkingMinutes: 0, transferCount: 0, transitComposition: 'subway' });
const candidate = (id, times = [30, 30, 30]) => ({
  catalogId: id, name: id, address: '서울특별시 서초구', lat: 37.5, lng: 127,
  households: 1500, builtYear: 2026, priceVerified: true, bestArea: { count: 10, averagePriceManWon: 100000 },
  parkingEvidence: { status: 'provided', sourceType: 'field', spacesPerHousehold: 1, observedAt: '2026-09-06' },
  routesByDestination: Object.fromEntries(destinations.map((destination, index) => [destination.id, route(times[index])])),
});
const options = { destinations, targetPriceManWon: 100000, maxOverBudgetPct: 20, minParkingRatio: 1,
  currentYear: 2026, stations: [{ id: 'station', name: '공식역', lat: 37.5, lng: 127 }],
  anchor: { name: '강남역', lat: 37.49805, lng: 127.02795 } };

test('10/50/40 preference leads through weighted actual commute, with minimax only secondary', () => {
  const result = rankPersonalizedCandidates([candidate('worse-weighted', [30, 40, 40]), candidate('better-weighted', [70, 25, 25])], options);
  assert.equal(result[0].catalogId, 'better-weighted');
  const ranking = result[0].personalizedRecommendation;
  assert.equal(ranking.decision, 'matched');
  assert.equal(ranking.weightedMeanMinutes, 29.5);
  assert.equal(ranking.weightedCostMinutes, 29.5);
  assert.ok(ranking.worstRatio > result[1].personalizedRecommendation.worstRatio);
  assert.equal(Object.values(PERSONALIZED_SCORE_WEIGHTS).reduce((sum, value) => sum + value, 0), 100);
  assert.equal(ranking.referenceScore, 45);
});

test('pending routes get facility reference points but never a confirmed total or a higher confirmed rank', () => {
  const pending = candidate('pending');
  delete pending.routesByDestination.b;
  const confirmed = candidate('confirmed', [50, 50, 50]);
  confirmed.parkingEvidence = null;
  const results = rankPersonalizedCandidates([pending, confirmed], options);
  assert.equal(results[0].catalogId, 'confirmed');
  const ranking = results[1].personalizedRecommendation;
  assert.equal(ranking.decision, 'pending');
  assert.equal(ranking.confirmed, false);
  assert.equal(ranking.score, null);
  assert.equal(ranking.referenceScore, 45);
  assert.equal(ranking.dimensions.commute.score, 0);
});

test('a measured too-far mandatory destination excludes even when another destination is unknown', () => {
  const house = candidate('far', [95, 30, 30]);
  delete house.routesByDestination.b;
  const result = rankPersonalizedCandidates([house], options)[0].personalizedRecommendation;
  assert.equal(result.decision, 'excluded');
  assert.ok(result.gateReasons.includes('required-destination-over-limit-or-no-route'));
});

test('exact budget ceiling is allowed; exceeding it by one manwon is excluded', () => {
  const at = candidate('at');
  at.bestArea.averagePriceManWon = 120000;
  const over = candidate('over');
  over.bestArea.averagePriceManWon = 120001;
  const results = rankPersonalizedCandidates([over, at], options);
  assert.equal(results[0].catalogId, 'at');
  assert.equal(results[0].personalizedRecommendation.decision, 'matched');
  assert.equal(results[0].personalizedRecommendation.dimensions.budget.score, 0);
  assert.equal(results[1].personalizedRecommendation.decision, 'excluded');
  assert.ok(results[1].personalizedRecommendation.gateReasons.includes('price-over-ceiling'));
});

test('unknown parking stays unknown while an explicit no-parking fact respects requireParking', () => {
  const unknown = candidate('unknown');
  delete unknown.parkingEvidence;
  const unknownResult = rankPersonalizedCandidates([unknown], { ...options, requireParking: true })[0].personalizedRecommendation;
  assert.equal(unknownResult.decision, 'matched');
  assert.equal(unknownResult.dimensions.parking.value, null);
  assert.equal(unknownResult.dimensions.parking.score, 0);
  assert.ok(unknownResult.unknowns.some(value => value.includes('주차')));
  const noParking = candidate('none');
  noParking.parkingEvidence.spacesPerHousehold = 0;
  assert.equal(rankPersonalizedCandidates([noParking], { ...options, requireParking: true })[0].personalizedRecommendation.decision, 'excluded');
  assert.equal(rankPersonalizedCandidates([noParking], { ...options, requireParking: false })[0].personalizedRecommendation.decision, 'matched');
});

test('provider duration without walking/transfer facts cannot confirm a preference score', () => {
  const house = candidate('missing-burden');
  house.routesByDestination.a = { mode: 'transit', verified: true, durationMinutes: 20 };
  const result = rankPersonalizedCandidates([house], options)[0].personalizedRecommendation;
  assert.equal(result.commuteBalance.decision, 'matched');
  assert.equal(result.decision, 'pending');
  assert.equal(result.score, null);
  assert.equal(result.weightedCostMinutes, null);
});

test('missing destinations are not fabricated and an explicitly supplied Gangnam-only fallback receives full weight', () => {
  const house = candidate('fallback');
  assert.equal(rankPersonalizedCandidates([house], { ...options, destinations: [] })[0].personalizedRecommendation.decision, 'pending');
  house.routesByDestination = { gangnam: route(35) };
  const result = rankPersonalizedCandidates([house], { ...options, destinations: [{ id: 'gangnam', label: '강남역', lat: options.anchor.lat, lng: options.anchor.lng, weightPercent: 100 }] })[0].personalizedRecommendation;
  assert.equal(result.decision, 'matched');
  assert.equal(result.destinations[0].normalizedWeightPercent, 100);
  assert.equal(result.weightedMeanMinutes, 35);
});

test('stored stale routes and unverified prices cannot become confirmed', () => {
  const stale = candidate('stale');
  stale.commuteVerification = { stale: true };
  assert.equal(rankPersonalizedCandidates([stale], options)[0].personalizedRecommendation.decision, 'pending');
  const unverifiedPrice = candidate('price');
  unverifiedPrice.priceVerified = false;
  const result = rankPersonalizedCandidates([unverifiedPrice], options)[0].personalizedRecommendation;
  assert.equal(result.decision, 'pending');
  assert.equal(result.dimensions.budget.value, null);
});

test('ranking is deterministic and never edits route fixtures or saved percentages', () => {
  const source = [candidate('b'), candidate('a')];
  const before = structuredClone(source);
  const result = rankPersonalizedCandidates(source, options);
  assert.deepEqual(source, before);
  assert.deepEqual(result.map(item => item.catalogId), ['a', 'b']);
  assert.deepEqual(result[0].personalizedRecommendation.destinations.map(item => item.weightPercent), [10, 50, 40]);
});

test('40/50/10 soft-limit ranking prefers the 27-minute Bundang/Pangyo mean over the 55-minute Seoul mean', () => {
  const targets = destinations.map((destination, index) => ({ ...destination,
    weightPercent: [40, 50, 10][index], maxMinutes: 60, required: index < 2,
  }));
  const homes = [candidate('seoul', [60, 60, 10]), candidate('bundang-pangyo', [20, 20, 90])];
  const before = structuredClone(homes);
  const result = rankPersonalizedCandidates(homes, { ...options, destinations: targets });
  assert.deepEqual(result.map(item => item.catalogId), ['bundang-pangyo', 'seoul']);
  assert.ok(result.every(item => item.personalizedRecommendation.decision === 'matched'));
  assert.equal(result[0].personalizedRecommendation.weightedMeanMinutes, 27);
  assert.equal(result[1].personalizedRecommendation.weightedMeanMinutes, 55);
  assert.ok(result[0].personalizedRecommendation.score > result[1].personalizedRecommendation.score);
  assert.equal(result[0].personalizedRecommendation.destinations[2].required, false);
  assert.equal(result[0].personalizedRecommendation.destinations[2].maxMinutes, 60);
  assert.deepEqual(homes, before);
  const strict = rankPersonalizedCandidates(homes, { ...options, destinations: targets.map(destination => ({ ...destination, required: true })) });
  assert.equal(strict.find(item => item.catalogId === 'bundang-pangyo').personalizedRecommendation.decision, 'excluded');
});

test('positive-weight soft routes need evidence while zero-weight soft routes leave confirmed scores intact', () => {
  const targets = destinations.map(destination => ({ ...destination, required: false }));
  const home = candidate('soft', [90, 90, 90]);
  delete home.routesByDestination.a;
  const missing = rankPersonalizedCandidates([home], { ...options, destinations: targets })[0].personalizedRecommendation;
  assert.equal(missing.decision, 'pending');
  assert.equal(missing.score, null);
  assert.equal(missing.weightedMeanMinutes, null);
  home.routesByDestination.a = { mode: 'transit', verified: false, reasonCode: 'TMAP_NO_ROUTE' };
  const absent = rankPersonalizedCandidates([home], { ...options, destinations: targets })[0].personalizedRecommendation;
  assert.equal(absent.decision, 'excluded');
  assert.equal(absent.score, null);
  assert.ok(absent.gateReasons.includes('destination-no-route'));
  const zero = rankPersonalizedCandidates([home], { ...options, destinations: targets.map((destination, index) => ({ ...destination, weightPercent: index ? 50 : 0 })) })[0].personalizedRecommendation;
  assert.equal(zero.decision, 'matched');
  assert.equal(zero.weightedMeanMinutes, 90);
  assert.ok(!zero.unknowns.some(label => label.startsWith('회사 A:')));
});
