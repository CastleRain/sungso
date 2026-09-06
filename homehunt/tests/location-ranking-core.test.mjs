import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCATION_PROFILES, rankLocationCandidates } from '../js/location-ranking-core.mjs';

// Explicit synthetic coordinates exercise geometry only; these are not a real
// station or apartment dataset and are never persisted into product data.
const anchor = { name: '검증 기준점', lat: 37.5, lng: 127, source: 'test fixture' };
const options = { anchor, currentYear: 2026, maxPriceManWon: 100000 };
const candidate = (catalogId, changes = {}) => ({
  catalogId, name: `단지 ${catalogId}`, address: `검증 주소 ${catalogId}`, regionCode: '41171',
  lat: 37.52, lng: 127, households: 800, builtYear: 2016,
  bestArea: { areaM2: 84.7, averagePriceManWon: 90000, count: 10 },
  priceVerified: true, ...changes,
});

test('close geography outranks a much cheaper far-north candidate in every profile', () => {
  const near = candidate('near');
  const far = candidate('far', { lat: 37.85, bestArea: { areaM2: 84.7, averagePriceManWon: 10000, count: 10 } });
  const stations = [
    { id: 'near-station', name: '검증 근거리역', lat: near.lat, lng: near.lng },
    { id: 'far-station', name: '검증 원거리역', lat: far.lat, lng: far.lng },
  ];
  for (const profile of Object.keys(LOCATION_PROFILES)) {
    const ranked = rankLocationCandidates([far, near], { ...options, profile, stations });
    assert.deepEqual(ranked.map((item) => item.catalogId), ['near', 'far']);
    assert.ok(ranked[0].locationRecommendation.score > ranked[1].locationRecommendation.score);
    assert.equal(Object.values(LOCATION_PROFILES[profile]).reduce((sum, value) => sum + value, 0), 100);
  }
});

test('profiles transparently change the location preference instead of relabeling one ordering', () => {
  const atAnchor = candidate('anchor', { lat: 37.5 });
  const atStation = candidate('station', { lat: 37.58 });
  const stations = [
    { id: 'a', name: '검증 역 A', lat: 37.5145, lng: 127 },
    { id: 'b', name: '검증 역 B', lat: 37.5809, lng: 127 },
  ];
  assert.equal(rankLocationCandidates([atStation, atAnchor], { ...options, stations, profile: 'gangnam' })[0].catalogId, 'anchor');
  assert.equal(rankLocationCandidates([atAnchor, atStation], { ...options, stations, profile: 'station' })[0].catalogId, 'station');
  const [defaulted] = rankLocationCandidates([atAnchor], { ...options, profile: 'invalid' });
  assert.equal(defaulted.locationRecommendation.profile, 'balanced');
});

test('cheaper prices do not overpower regional proximity when only administrative references are known', () => {
  const near = candidate('near', { lat: null, lng: null, locationReference: { lat: 37.68, lng: 127, label: '검증 근거리 지역', precision: 'district' } });
  const far = candidate('far', { lat: null, lng: null, locationReference: { lat: 38.05, lng: 127, label: '검증 원거리 지역', precision: 'district' }, bestArea: { averagePriceManWon: 1000 } });
  for (const profile of Object.keys(LOCATION_PROFILES)) {
    const ranked = rankLocationCandidates([far, near], { ...options, profile });
    assert.equal(ranked[0].catalogId, 'near');
    assert.equal(ranked[0].locationRecommendation.dimensions.budget.score, 5);
    assert.equal(ranked[1].locationRecommendation.dimensions.budget.score, 5);
  }
});

test('candidate scores do not change when a cheap or large outlier enters the result set', () => {
  const a = candidate('a');
  const b = candidate('b', { lat: 37.6, households: 500 });
  const base = rankLocationCandidates([a, b], options);
  const extended = rankLocationCandidates([candidate('outlier', { lat: 38, households: 100000, builtYear: 2026, bestArea: { averagePriceManWon: 1 } }), b, a], options);
  for (const item of base) {
    assert.deepEqual(extended.find((value) => value.catalogId === item.catalogId).locationRecommendation, item.locationRecommendation);
  }
});

test('missing coordinates never become zero distance or a station claim and do not top known locations', () => {
  const unknown = candidate('unknown', { lat: null, lng: '', households: 1500, builtYear: 2026, bestArea: { averagePriceManWon: 1 } });
  const known = candidate('known', { lat: 37.86 });
  const [first, second] = rankLocationCandidates([unknown, known], { ...options, stations: [{ id: 's', name: '검증 역', ...anchor }] });
  assert.equal(first.catalogId, 'known');
  const result = second.locationRecommendation;
  assert.equal(result.coordinatePrecision, 'unknown');
  assert.equal(result.anchorDistanceKm, null);
  assert.equal(result.approximateAnchorDistanceKm, null);
  assert.equal(result.nearestStation, null);
  assert.equal(result.rankingEligible, false);
  assert.equal(result.dimensions.anchor.score, 0);
  assert.equal(result.dimensions.station.score, 0);
  assert.equal(result.coveragePct, 25);
  for (const coordinates of [{ lat: 0, lng: 0 }, { lat: false, lng: true }, { lat: Infinity, lng: 127 }, { lat: 91, lng: 127 }]) {
    assert.equal(rankLocationCandidates([candidate('invalid', coordinates)], options)[0].locationRecommendation.coordinatePrecision, 'unknown');
  }
});

test('dong and district references produce only separate approximate anchor distances', () => {
  const stations = [{ id: 's', name: '검증 역', ...anchor }];
  for (const [precision, confidence] of [['dong', .65], ['district', .35]]) {
    const [item] = rankLocationCandidates([candidate(precision, {
      lat: null, lng: null, households: null, builtYear: null, bestArea: {},
      locationReference: { ...anchor, label: '검증 지역 대표점', precision },
    })], { ...options, stations });
    const result = item.locationRecommendation;
    assert.equal(result.coordinatePrecision, precision);
    assert.equal(result.anchorDistanceKm, null);
    assert.equal(result.approximateAnchorDistanceKm, 0);
    assert.equal(result.nearestStation, null);
    assert.equal(result.dimensions.anchor.status, 'approximate');
    assert.equal(result.dimensions.anchor.confidence, confidence);
    assert.ok(Math.abs(result.score - 45 * confidence) < 1e-9);
    assert.equal(result.coveragePct, Math.round(45 * confidence * 10) / 10);
    assert.ok(result.reasons[0].includes('대표점 기준 대략 직선거리'));
    assert.equal(item.lat, null);
  }
});

test('approximate coordinates on the candidate itself cannot masquerade as a precise apartment', () => {
  const [item] = rankLocationCandidates([candidate('approximate', { coordinatePrecision: 'district' })], {
    ...options, stations: [{ id: 's', name: '검증 역', lat: 37.52, lng: 127 }],
  });
  assert.equal(item.locationRecommendation.nearestStation, null);
  assert.equal(item.locationRecommendation.anchorDistanceKm, null);
  assert.equal(item.locationRecommendation.rankingEligible, false);
});

test('the anchor must be explicitly supplied and cannot be an administrative reference point', () => {
  const [noAnchor] = rankLocationCandidates([candidate('a')], { currentYear: 2026 });
  assert.equal(noAnchor.locationRecommendation.anchorDistanceKm, null);
  assert.equal(noAnchor.locationRecommendation.dimensions.anchor.status, 'unknown');
  const [coarseAnchor] = rankLocationCandidates([candidate('a')], { ...options, anchor: { ...anchor, precision: 'district' } });
  assert.equal(coarseAnchor.locationRecommendation.anchorDistanceKm, null);
});

test('nearest station selection is deterministic and exposes only coordinate-based straight distance', () => {
  const stations = [
    { id: 'z', name: '검증 역 Z', lat: 37.521, lng: 127, lines: ['2호선'], source: { name: '공식 테스트 자료', url: 'https://example.test/stations' } },
    { id: 'a', name: '검증 역 A', lat: 37.521, lng: 127, line: '1호선', coordinateType: 'station' },
    { id: 'invalid', name: '검증 잘못된 역', lat: null, lng: null },
    { id: 'closed', name: '검증 닫힌 역', lat: 37.52, lng: 127, operating: false },
    { id: 'coarse', name: '검증 지역 대표점', lat: 37.52, lng: 127, precision: 'dong' },
  ];
  const first = rankLocationCandidates([candidate('a')], { ...options, stations })[0].locationRecommendation;
  const second = rankLocationCandidates([candidate('a')], { ...options, stations: [...stations].reverse() })[0].locationRecommendation;
  assert.deepEqual(first.nearestStation, second.nearestStation);
  assert.equal(first.nearestStation.id, 'a');
  assert.equal(first.nearestStation.distanceKind, 'straight-line');
  assert.equal(first.nearestStation.scope, 'provided-station-catalog');
  assert.deepEqual(first.nearestStation.lines, ['1호선']);
  assert.ok(first.nearestStation.distanceKm > .1 && first.nearestStation.distanceKm < .12);
  assert.ok(first.reasons.some((reason) => reason.includes('역 좌표 직선거리')));
  assert.equal(Object.hasOwn(first.nearestStation, 'walkingMinutes'), false);
  assert.ok(first.unknowns.includes('실제 이동 경로·도보시간 미확인'));
});

test('unknown housing facts and legacy median prices earn no points or invented values', () => {
  const [item] = rankLocationCandidates([candidate('unknown', {
    lat: null, lng: null, households: 0, builtYear: 2027, bestArea: { medianPriceManWon: 1 },
  })], options);
  const result = item.locationRecommendation;
  assert.equal(result.score, null);
  assert.equal(result.coveragePct, 0);
  assert.equal(result.households, null);
  assert.equal(result.ageYears, null);
  assert.equal(result.averagePriceManWon, null);
  assert.equal(result.budgetWithinLimit, null);
  assert.ok(Object.values(result.dimensions).every((value) => value.score === 0 && value.status === 'unknown'));
  const [unverified] = rankLocationCandidates([candidate('unverified', { priceVerified: false })], options);
  assert.equal(unverified.locationRecommendation.dimensions.budget.status, 'unknown');
});

test('the ranking preserves upstream verdicts and distinguishes budget excess from missing data', () => {
  const original = candidate('over', { bestArea: { averagePriceManWon: 110000 }, transportVerified: false, commuteBalance: { decision: 'pending' } });
  const [ranked] = rankLocationCandidates([original], options);
  assert.equal(ranked.locationRecommendation.budgetWithinLimit, false);
  assert.equal(ranked.locationRecommendation.dimensions.budget.score, 0);
  assert.ok(ranked.locationRecommendation.dimensions.budget.label.includes('예산 초과'));
  assert.equal(ranked.priceVerified, true);
  assert.equal(ranked.transportVerified, false);
  assert.deepEqual(ranked.commuteBalance, { decision: 'pending' });
});

test('one complex is counted once even if several area variants are passed', () => {
  const small = candidate('same', { bestArea: { areaM2: 59.9, averagePriceManWon: 70000 } });
  const large = candidate('same', { bestArea: { areaM2: 84.7, averagePriceManWon: 90000 } });
  const sameNameDifferentComplex = candidate('different', { name: small.name, address: small.address });
  const ranked = rankLocationCandidates([large, sameNameDifferentComplex, small], options);
  assert.equal(ranked.length, 2);
  assert.equal(ranked.find((value) => value.catalogId === 'same').bestArea.areaM2, 59.9);
  assert.equal(ranked.find((value) => value.catalogId === 'same').locationRecommendation.duplicateCandidateCount, 2);
  assert.equal(ranked.find((value) => value.catalogId === 'different').locationRecommendation.duplicateCandidateCount, 1);
});

test('ranking is immutable with deterministic ties and sensible empty input', () => {
  const a = Object.freeze(candidate('a'));
  const b = Object.freeze(candidate('b'));
  const input = Object.freeze([b, a]);
  const before = JSON.stringify(input);
  assert.deepEqual(rankLocationCandidates(input, options).map((value) => value.catalogId), ['a', 'b']);
  assert.deepEqual(rankLocationCandidates([a, b], options).map((value) => value.catalogId), ['a', 'b']);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.hasOwn(a, 'locationRecommendation'), false);
  assert.deepEqual(rankLocationCandidates(), []);
  assert.deepEqual(rankLocationCandidates(null), []);
});
