import test from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateReviewConditionSignature, candidateReviewConditionSummary, liveRecommendationSearchKey,
  createCandidateReviewBookmark, compareBookmarkConditions, mergeLiveReviewCandidates, collectReviewCounts,
} from '../js/candidate-review-core.mjs';

const now = '2026-09-08T01:02:03.000Z';
function snapshot() {
  const destinations = [
    { id: 'a', label: '회사 A', address: '테스트 지역 A', lat: 37.500001, lng: 127.000001,
      weightPercent: 10, required: false, maxMinutes: 60, modes: ['transit'], departureTime: '08:00', preferSubway: true },
    { id: 'b', label: '회사 B', address: '테스트 지역 B', lat: 37.600001, lng: 127.100001,
      weightPercent: 90, required: true, maxMinutes: 60, modes: ['transit'], departureTime: '08:00', preferSubway: true },
  ];
  return { filters: {
    regions: ['seoul', 'gyeonggi'], minHouseholds: 500, householdsOperator: 'gt',
    targetPriceManWon: 60000, manualTargetPriceManWon: 70000, maxOverBudgetPct: 10, maxPriceManWon: 66000,
    budgetSource: 'wecost', priceOperator: 'lte', minAreaM2: 51.2, areaOperator: 'gte', areaBasis: 'exclusive',
    maxAgeYears: 30, minBuiltYear: 1996, commuteMaxMinutes: 60, commuteDepartureTime: '08:00',
    commuteModes: ['transit', 'car'], preferSubway: true, requireParking: true, minParkingRatio: 1,
    excludeFar: true, stationWalkMin: 0, stationWalkMax: 15, months: 3,
    workplaces: structuredClone(destinations), destinations: structuredClone(destinations),
  }, destinations };
}

function candidate(id = 'home-a') {
  const area = { areaM2: 59.9, averagePriceManWon: 58500, medianPriceManWon: 58200,
    latestPriceManWon: 59000, latestMonth: '2026-07', latestDay: 12,
    minPriceManWon: 57000, maxPriceManWon: 61000, count: 6, aptSeq: '11111-111' };
  return { catalogId: id, aptSeq: '11111-111', name: '테스트 아파트', address: '테스트 지역 A 1',
    regionCode: '11111', regionName: '테스트 지역', dong: '테스트동', households: 1000,
    builtYear: 2010, priceVerified: true, actualDealCount: 6,
    bestArea: area, areas: [structuredClone(area)], qualifyingAreas: [structuredClone(area)] };
}

function reverseObjects(value) {
  if (Array.isArray(value)) return value.map(reverseObjects);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseObjects(child)]));
}

test('condition equality ignores object key order and unordered selections without mutating inputs', () => {
  const original = snapshot(), before = structuredClone(original);
  const reordered = reverseObjects(original);
  reordered.destinations.reverse();
  reordered.filters.workplaces.reverse();
  reordered.filters.regions.reverse();
  reordered.filters.commuteModes = ['car', 'transit', 'car'];
  assert.equal(candidateReviewConditionSignature(original), candidateReviewConditionSignature(reordered));
  assert.deepEqual(original, before);
});

test('budget, housing, parking, transit and company changes are all recorded as changed user conditions', () => {
  const original = snapshot();
  const bookmark = createCandidateReviewBookmark(candidate(), original, { now });
  const changes = [
    value => value.filters.targetPriceManWon = 65000,
    value => value.filters.manualTargetPriceManWon = 75000,
    value => value.filters.budgetSource = 'manual',
    value => value.filters.maxOverBudgetPct = 20,
    value => value.filters.regions = ['gyeonggi'],
    value => value.filters.minHouseholds = 600,
    value => value.filters.householdsOperator = 'gte',
    value => value.filters.minAreaM2 = 60,
    value => value.filters.areaOperator = 'gt',
    value => value.filters.maxAgeYears = 20,
    value => value.filters.requireParking = false,
    value => value.filters.minParkingRatio = 1.5,
    value => value.filters.excludeFar = false,
    value => value.filters.commuteDepartureTime = '09:00',
    value => value.filters.commuteModes = ['transit'],
    value => value.filters.stationWalkMax = 10,
    value => value.destinations[0].weightPercent = 20,
    value => value.destinations[0].required = true,
    value => value.destinations[0].maxMinutes = 90,
    value => value.destinations[0].preferSubway = false,
    value => value.destinations[0].address = '새로 입력한 주소',
    value => value.filters.workplaces[0].weightPercent = 30,
  ];
  for (const change of changes) {
    const changed = structuredClone(original);
    change(changed);
    assert.equal(compareBookmarkConditions(bookmark, changed), 'changed', change.toString());
  }
  assert.equal(compareBookmarkConditions(bookmark, original), 'same');
});

test('provider coordinates and route response facts never enter persisted condition identity', () => {
  const original = snapshot(), updated = structuredClone(original);
  original.destinations[0].provider = 'kakao';
  updated.destinations[0].provider = 'kakao';
  updated.destinations[0].lat = 37.712345;
  updated.destinations[0].totalTime = 2599;
  updated.destinations[0].commutePassed = true;
  updated.filters.workplaces[0].lng = 127.923456;
  updated.filters.personalizedRecommendation = { totalScore: 77 };
  assert.equal(candidateReviewConditionSignature(original), candidateReviewConditionSignature(updated));
  const serialized = candidateReviewConditionSignature(updated);
  assert.doesNotMatch(serialized, /37\.712345|127\.923456|totalTime|commutePassed|personalizedRecommendation/);
});

test('explicit manual or official coordinates affect conditions, conflicting provider attribution does not persist', () => {
  for (const coordinateSource of ['manual', 'official', 'user-provided']) {
    const original = snapshot();
    original.filters.workplaces[0].coordinateSource = coordinateSource;
    const changed = structuredClone(original);
    changed.filters.workplaces[0].lat += .01;
    assert.notEqual(candidateReviewConditionSignature(original), candidateReviewConditionSignature(changed));
    original.filters.workplaces[0].provider = 'naver';
    changed.filters.workplaces[0].provider = 'naver';
    assert.equal(candidateReviewConditionSignature(original), candidateReviewConditionSignature(changed));
  }
});

test('missing or legacy condition metadata stays unknown rather than manufacturing a commute pass', () => {
  assert.equal(candidateReviewConditionSignature(null), '');
  assert.equal(candidateReviewConditionSignature({ filters: {} }), '');
  assert.equal(compareBookmarkConditions(candidate(), snapshot()), 'unknown');
  const bookmark = createCandidateReviewBookmark(candidate(), snapshot(), { now });
  assert.equal(compareBookmarkConditions(bookmark, null), 'unknown');
  bookmark.review.version = 2;
  assert.equal(compareBookmarkConditions(bookmark, snapshot()), 'unknown');
});

test('bookmark retains official housing and prices but strips all route verdicts including disguised nested fields', () => {
  const source = candidate();
  source.routesByDestination = { a: [{ provider: 'kakao', durationMinutes: 42, verified: true }] };
  source.commuteVerification = { provider: 'kakao', stage: 'final', verifiedAt: now };
  source.commuteBalance = { status: 'matched', weightedMeanMinutes: 30 };
  source.personalizedRecommendation = { totalScore: 95, decision: 'matched' };
  source.commutePassed = true;
  source.confirmed = true;
  source.bestArea.durationMinutes = 42;
  source.areas[0].providerPayload = { totalTime: 2520 };
  source.coordinateSource = 'kakao'; source.lat = 37.912345; source.lng = 127.912345;
  source.review = { commutePassed: true, apiResult: { totalTime: 1 } };
  const before = structuredClone(source);
  const saved = createCandidateReviewBookmark(source, snapshot(), { now });
  assert.equal(saved.catalogId, source.catalogId);
  assert.equal(saved.bestArea.averagePriceManWon, 58500);
  assert.equal(saved.bestArea.count, 6);
  assert.equal(saved.priceVerified, true);
  assert.equal(saved.savedAt, now);
  assert.deepEqual(Object.keys(saved.review).sort(), ['conditionSignature', 'conditionSummary', 'savedAt', 'source', 'version']);
  assert.equal(saved.review.source, 'user-selection');
  assert.doesNotMatch(JSON.stringify(saved), /routesByDestination|commuteVerification|commuteBalance|totalScore|commutePassed|durationMinutes|totalTime|providerPayload|37\.912345|127\.912345/);
  assert.deepEqual(source, before);
});

test('saved-only evidence stays unverified while a current live candidate preserves saved user selection metadata', () => {
  const saved = createCandidateReviewBookmark(candidate('a'), snapshot(), { now });
  const live = { ...candidate('a'), bestArea: { areaM2: 59.9, averagePriceManWon: 59000 },
    routesByDestination: { a: [{ provider: 'kakao', durationMinutes: 30 }] },
    review: { source: 'live-object' }, savedAt: 'incorrect-live-time' };
  const legacy = { ...candidate('b'), routesByDestination: { a: [{ provider: 'tmap', durationMinutes: 15 }] },
    commuteBalance: { status: 'matched' }, totalScore: 95 };
  const originalSaved = structuredClone([saved, legacy]), originalLive = structuredClone([live]);
  const merged = mergeLiveReviewCandidates([saved, legacy], [live, candidate('c')]);
  assert.deepEqual(merged.map(item => item.catalogId), ['a', 'b', 'c']);
  assert.equal(merged[0].bestArea.averagePriceManWon, 59000);
  assert.equal(merged[0].routesByDestination.a[0].durationMinutes, 30);
  assert.deepEqual(merged[0].review, saved.review);
  assert.equal(merged[0].savedAt, now);
  assert.equal('routesByDestination' in merged[1], false);
  assert.equal('totalScore' in merged[1], false);
  merged[0].bestArea.averagePriceManWon = 1;
  merged[0].review.conditionSummary = 'changed by rendering';
  assert.deepEqual([saved, legacy], originalSaved);
  assert.deepEqual([live], originalLive);
});

test('union and review counts deduplicate equivalent IDs and do not conflate pending with excluded', () => {
  const merged = mergeLiveReviewCandidates([candidate(1), candidate('1')], [candidate('1'), candidate(1), candidate(2), {}]);
  assert.equal(merged.length, 2);
  const rows = [candidate(1), candidate('1'), candidate(2), candidate(3), candidate(4), {}];
  const result = collectReviewCounts(rows, item => ({ 1: 'matched', 2: 'excluded', 3: 'pending', 4: 'missing-route' })[item.catalogId]);
  assert.deepEqual(result, { total: 4, matched: 1, excluded: 1, pending: 2 });
  assert.deepEqual(collectReviewCounts(rows), { total: 4, matched: 0, excluded: 0, pending: 4 });
});

test('condition summary is human readable and does not state a cached commute verdict', () => {
  const summary = candidateReviewConditionSummary(snapshot());
  assert.match(summary, /WeCost 목표 6억원 \+10% 허용/);
  assert.match(summary, /500세대 초과/);
  assert.match(summary, /회사 2곳/);
  assert.doesNotMatch(summary, /충족|통과|검증|42분/);
  assert.throws(() => createCandidateReviewBookmark({}, snapshot(), { now }), TypeError);
});

test('live search identity is deterministic but exact provider coordinates always invalidate current-view reuse', () => {
  const original = snapshot(), reversed = reverseObjects(original);
  reversed.destinations.reverse(); reversed.filters.workplaces.reverse(); reversed.filters.regions.reverse();
  assert.equal(liveRecommendationSearchKey(original, 'kakao'), liveRecommendationSearchKey(reversed, 'kakao'));
  const changed = structuredClone(original);
  changed.destinations[0].lat += .0000001;
  assert.notEqual(liveRecommendationSearchKey(original, 'kakao'), liveRecommendationSearchKey(changed, 'kakao'));
  assert.equal(candidateReviewConditionSignature(original), candidateReviewConditionSignature(changed));
  assert.notEqual(liveRecommendationSearchKey(original, 'kakao'), liveRecommendationSearchKey(original, 'tmap'));
  changed.destinations[0].lat = original.destinations[0].lat;
  changed.filters.minBuiltYear += 1;
  assert.notEqual(liveRecommendationSearchKey(original, 'kakao'), liveRecommendationSearchKey(changed, 'kakao'));
  assert.equal(liveRecommendationSearchKey(null, 'kakao'), '');
});
