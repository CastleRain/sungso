import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUD_SNAPSHOT_MAX_BYTES, CLOUD_SNAPSHOT_LIST_LIMIT, CloudSnapshotError,
  cloudSnapshotByteLength, normalizeCloudSnapshot,
} from '../js/cloud-snapshot-core.mjs';
import { createCandidateReviewBookmark, compareBookmarkConditions } from '../js/candidate-review-core.mjs';

const route = { provider: 'kakao', durationMinutes: 36, walkingMinutes: 6, transfers: 1 };
const workplace = overrides => ({
  id: 'work-a', label: '회사 A', name: '회사 A', address: '사용자가 선택한 주소',
  lat: 37.4, lng: 127.1, daysPerWeek: 5, weightPercent: 40, weightSource: 'explicit-percent',
  required: true, individualMaxMinutes: 60, maxMinutes: 60, modes: ['transit'],
  departureTime: '08:00', ...overrides,
});
const visit = overrides => ({
  id: 'visit-a', name: '직접 본 집', address: '개인 방문 주소', visitDate: '2026-09-08',
  askingPrice: 60000, areaM2: 59.9, dealType: '매매', walkMinutes: 9,
  visitedBy: ['성우', '소희'], tags: ['남향'], memo: '퇴근 후 주차 확인', ...overrides,
});
const invalid = code => error => error instanceof CloudSnapshotError && error.status >= 400
  && (!code || error.code === code);

test('cloud schema keeps personal housing inputs without carrying live provider results', () => {
  const input = {
    schemaVersion: 1,
    recommendationFilters: {
      regions: ['gyeonggi'], targetPriceManWon: 60000, manualTargetPriceManWon: 70000,
      budgetSource: 'wecost', maxOverBudgetPct: 10, minHouseholds: 159, householdsOperator: 'gt',
      maxAgeYears: 30, minAreaM2: 51.2, preferSubway: true, excludeFar: true, requireParking: true,
      minParkingRatio: 1, months: 3, workplaces: [workplace()],
      destinations: [workplace({ id: 'computed-route-target' })],
      maxPriceManWon: 66000, minBuiltYear: 1996, financialSnapshot: { cash: 12345 },
    },
    visits: [visit({ commute: route, routes: [route], personalizedRecommendation: { score: 90 } })],
    shortlist: [{ catalogId: 'reb-1', name: '관심 단지', regionCode: '41465', dong: '보정동',
      lat: 37.3, lng: 127.1, bestArea: { amountManWon: 59000 }, routesByDestination: { a: [route] },
      score: 90, commuteStatus: 'matched', weightedMeanMinutes: 36 }],
    compareIds: ['visit-a', 'missing'], supplyFavorites: ['notice-a'],
    parkingObservations: { 'reb-1': { sourceType: 'field', spacesPerHousehold: 1.2, observedAt: '2026-09-08' } },
    apiKey: 'never-persist-test-placeholder', uid: 'someone-else', householdId: 'someone-else',
    wecost: { income: 12345 }, routes: [route], recommendationResults: [route],
  };
  const before = structuredClone(input);
  const safe = normalizeCloudSnapshot(input);
  assert.deepEqual(input, before);
  assert.equal(safe.recommendationFilters.targetPriceManWon, 60000);
  assert.equal(safe.recommendationFilters.manualTargetPriceManWon, 70000);
  assert.equal(safe.recommendationFilters.budgetSource, 'wecost');
  assert.equal(safe.recommendationFilters.workplaces[0].weightPercent, 40);
  assert.equal(safe.recommendationFilters.workplaces[0].address, '사용자가 선택한 주소');
  assert.equal(safe.visits[0].walkMinutes, 9);
  assert.equal(safe.visits[0].memo, '퇴근 후 주차 확인');
  assert.deepEqual(safe.compareIds, ['visit-a']);
  assert.equal(safe.shortlist[0].catalogId, 'reb-1');
  assert.equal(safe.parkingObservations['reb-1'].spacesPerHousehold, 1.2);
  for (const forbidden of ['kakao', 'routes', 'commuteStatus', 'score', 'amountManWon', 'bestArea',
    'financialSnapshot', 'income', 'apiKey', 'householdId', 'maxPriceManWon', 'minBuiltYear']) {
    assert.ok(!JSON.stringify(safe).includes(`"${forbidden}"`), forbidden);
  }
  assert.deepEqual(normalizeCloudSnapshot(safe), safe, 'normalization is stable across browser/server boundaries');
});

test('all route providers and their nested/unknown fields are excluded', () => {
  const records = ['kakao', 'naver', 'tmap'].map((provider, index) => ({
    id: `house-${index}`, catalogId: `house-${index}`, name: '관심',
    routes: [{ ...route, provider }], commuteScreening: { provider, balance: { score: 22 } },
    provider, commuteVerification: { provider, stage: 'final' },
    commuteBalance: { score: 22 }, commuteDecision: 'matched',
    wrapper: { another: { routes: [route] } }, payload: JSON.stringify(route),
  }));
  const safe = normalizeCloudSnapshot({ shortlist: records });
  assert.deepEqual(safe.shortlist.map(item => Object.keys(item)), records.map(() => ['id', 'catalogId', 'name', 'needsLocationResolution']));
});

function reviewedHouse() {
  const destinations = [workplace()];
  const snapshot = { filters: {
    regions: ['gyeonggi'], targetPriceManWon: 60000, maxPriceManWon: 66000,
    manualTargetPriceManWon: 70000, maxOverBudgetPct: 10, budgetSource: 'wecost',
    minHouseholds: 500, householdsOperator: 'gt', minAreaM2: 51.2, areaOperator: 'gte',
    maxAgeYears: 30, commuteModes: ['transit'], commuteDepartureTime: '08:00',
    commuteMaxMinutes: 60, requireParking: true, minParkingRatio: 1, workplaces: destinations,
  }, destinations };
  const area = { areaM2: 59.9, averagePriceManWon: 59000, count: 6,
    latestMonth: '2026-08', latestDay: 12, aptSeq: '11111-111' };
  const bookmark = createCandidateReviewBookmark({ catalogId: 'reviewed-1', name: '검토한 단지',
    address: '테스트 주택 주소', households: 600, builtYear: 2015, priceVerified: true,
    bestArea: area, areas: [area], qualifyingAreas: [area], actualDealCount: 6,
  }, snapshot, { now: '2026-09-08T01:00:00.000Z' });
  return { bookmark, snapshot };
}

test('explicit review bookmarks preserve official prices and same-condition identity through cloud round trips', () => {
  const { bookmark, snapshot } = reviewedHouse();
  const safe = normalizeCloudSnapshot({ shortlist: [bookmark] });
  const restored = normalizeCloudSnapshot(JSON.parse(JSON.stringify(safe))).shortlist[0];
  assert.deepEqual(restored.bestArea, bookmark.bestArea);
  assert.deepEqual(restored.areas, bookmark.areas);
  assert.equal(restored.households, 600);
  assert.equal(restored.builtYear, 2015);
  assert.equal(restored.priceVerified, true);
  assert.deepEqual(restored.review, bookmark.review);
  assert.equal(compareBookmarkConditions(restored, snapshot), 'same');
  snapshot.destinations[0].required = false;
  assert.equal(compareBookmarkConditions(restored, snapshot), 'changed');
  assert.deepEqual(normalizeCloudSnapshot(safe), safe);
});

test('review cloud whitelist removes routes and pass flags even when hidden in a canonical conditions string', () => {
  const { bookmark } = reviewedHouse();
  bookmark.routesByDestination = { a: [route] };
  bookmark.commutePassed = true;
  bookmark.personalizedRecommendation = { totalScore: 90 };
  bookmark.bestArea.routes = [route];
  bookmark.bestArea.commutePassed = true;
  bookmark.review.commutePassed = true;
  bookmark.review.conditionSummary = '카카오 통근 36분 통과';
  const prefix = 'review-conditions-v1:';
  const parsed = JSON.parse(bookmark.review.conditionSignature.slice(prefix.length));
  parsed.routes = [route];
  parsed.filters.commutePassed = true;
  parsed.filters.routes = [route];
  for (const destination of [...parsed.destinations, ...parsed.workplaces]) {
    destination.coordinateSource = 'manual'; destination.provider = 'kakao';
    destination.lat = 37.912345; destination.lng = 127.912345;
    destination.durationMinutes = 36; destination.commutePassed = true;
  }
  bookmark.review.conditionSignature = prefix + JSON.stringify(parsed);
  const safe = normalizeCloudSnapshot({ shortlist: [bookmark] }).shortlist[0];
  assert.doesNotMatch(JSON.stringify(safe), /commutePassed|routes|durationMinutes|totalScore|37\.912345|127\.912345|카카오 통근/);
  assert.equal(safe.bestArea.averagePriceManWon, 59000);
  assert.equal(safe.review.source, 'user-selection');
});

test('malformed review metadata is rejected and unknown conditions stay unknown', () => {
  const { bookmark } = reviewedHouse();
  for (const conditionSignature of ['not-conditions', 'review-conditions-v1:{',
    'review-conditions-v1:{"filters":[],"workplaces":[],"destinations":[]}']) {
    assert.throws(() => normalizeCloudSnapshot({ shortlist: [{ ...bookmark,
      review: { ...bookmark.review, conditionSignature } }] }), invalid());
  }
  const empty = { ...bookmark, review: { ...bookmark.review, conditionSignature: '', conditionSummary: 'untrusted claim' } };
  const restored = normalizeCloudSnapshot({ shortlist: [empty] }).shortlist[0];
  assert.equal(restored.review.conditionSummary, '저장 당시 조건 없음');
  assert.equal(compareBookmarkConditions(restored, reviewedHouse().snapshot), 'unknown');
  assert.throws(() => normalizeCloudSnapshot({ shortlist: [{ ...bookmark,
    bestArea: { ...bookmark.bestArea, averagePriceManWon: -1 } }] }), invalid());
});

test('legacy and provider coordinates are removed, preserving unresolved company inputs', () => {
  const safe = normalizeCloudSnapshot({ recommendationFilters: { workplaces: [
    workplace(), workplace({ id: 'work-b', source: 'NAVER Geocoding', coordinateSource: 'manual' }),
    workplace({ id: 'work-c', coordinateSource: 'naver' }),
  ] } });
  assert.equal(safe.recommendationFilters.workplaces.length, 3);
  for (const item of safe.recommendationFilters.workplaces) {
    assert.ok(!('lat' in item)); assert.ok(!('lng' in item));
    assert.equal(item.needsLocationResolution, true);
    assert.equal(item.label, '회사 A');
    assert.equal(item.weightPercent, 40);
    assert.equal(item.individualMaxMinutes, 60);
  }
});

test('explicit manual/user/official coordinates are the only reusable coordinates', () => {
  for (const coordinateSource of ['manual', 'user-provided', 'official']) {
    const safe = normalizeCloudSnapshot({ recommendationFilters: { workplaces: [workplace({ coordinateSource })] },
      visits: [visit({ coordinateSource, lat: 37.3, lng: 127.1 })] });
    assert.equal(safe.recommendationFilters.workplaces[0].coordinateSource, coordinateSource);
    assert.equal(safe.recommendationFilters.workplaces[0].lat, 37.4);
    assert.equal(safe.visits[0].lat, 37.3);
    assert.ok(!('needsLocationResolution' in safe.visits[0]));
  }
});

test('invalid coordinates become unresolved and never inherit hasCoordinates from payload', () => {
  const safe = normalizeCloudSnapshot({ recommendationFilters: { workplaces: [workplace({
    coordinateSource: 'manual', lat: 100, hasCoordinates: true,
  })] } });
  assert.equal(safe.recommendationFilters.workplaces[0].needsLocationResolution, true);
  assert.ok(!('hasCoordinates' in safe.recommendationFilters.workplaces[0]));
});

test('zero weight and soft time limits retain their meaning on a round trip', () => {
  const safe = normalizeCloudSnapshot({ recommendationFilters: { workplaces: [
    workplace({ weightPercent: 0, required: false, individualMaxMinutes: 90, daysPerWeek: 0 }),
  ] } });
  const company = safe.recommendationFilters.workplaces[0];
  assert.equal(company.weightPercent, 0);
  assert.equal(company.required, false);
  assert.equal(company.daysPerWeek, 0);
  assert.equal(company.individualMaxMinutes, 90);
});

test('parking persists personal facts only without provider/raw/official assertions', () => {
  const safe = normalizeCloudSnapshot({ parkingObservations: {
    personal: { sourceType: 'field', spacesPerHousehold: 0, observedAt: '2026-09-08', note: '주차 불가 확인', sourceUrl: 'https://example.test/?key=secret', routes: [route] },
    official: { sourceType: 'official', spacesPerHousehold: 2, complexMatchConfirmed: true },
    unknown: { sourceType: 'unknown', spacesPerHousehold: 3 },
  } });
  assert.deepEqual(Object.keys(safe.parkingObservations), ['personal']);
  assert.equal(safe.parkingObservations.personal.spacesPerHousehold, 0);
  assert.equal(safe.parkingObservations.personal.sourceName, '사용자 확인');
  assert.ok(!('sourceUrl' in safe.parkingObservations.personal));
  assert.ok(!('routes' in safe.parkingObservations.personal));
});

test('memo is bounded plain text, with no object coercion or executable interpretation', () => {
  const literal = '<img src=x onerror=alert(1)> & "quoted"';
  const safe = normalizeCloudSnapshot({ visits: [visit({ memo: literal })] });
  assert.equal(safe.visits[0].memo, literal);
  assert.throws(() => normalizeCloudSnapshot({ visits: [visit({ memo: { routes: [route] } })] }), invalid());
  assert.throws(() => normalizeCloudSnapshot({ visits: [visit({ memo: 'x'.repeat(4001) })] }), invalid());
  assert.throws(() => normalizeCloudSnapshot({ visits: [visit({ memo: 'control\u0000char' })] }), invalid());
});

test('prototype keys and objects never become cloud fields or parking identifiers', () => {
  const raw = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"routes":[]},"visits":[]}');
  const safe = normalizeCloudSnapshot(raw);
  assert.ok(!Object.hasOwn(safe, '__proto__'));
  assert.equal({}.polluted, undefined);
  assert.throws(() => normalizeCloudSnapshot({ parkingObservations: JSON.parse('{"__proto__":{"sourceType":"field"}}') }), invalid());
  assert.throws(() => normalizeCloudSnapshot({ visits: [Object.create({ id: 'inherited', memo: 'hidden' })] }), invalid());
});

test('unsupported versions, nonobjects, malformed lists and duplicate record IDs are rejected', () => {
  for (const input of [null, [], 'hello', 7]) assert.throws(() => normalizeCloudSnapshot(input), invalid());
  assert.throws(() => normalizeCloudSnapshot({ schemaVersion: 2 }), invalid('UNSUPPORTED_CLOUD_SNAPSHOT'));
  assert.throws(() => normalizeCloudSnapshot({ visits: {} }), invalid());
  assert.throws(() => normalizeCloudSnapshot({ visits: [visit(), visit()] }), invalid());
  assert.throws(() => normalizeCloudSnapshot({ recommendationFilters: { workplaces: [workplace(), workplace()] } }), invalid());
});

test('invalid numbers, enum values and dates fail instead of silently changing user conditions', () => {
  for (const value of [-1, Infinity, NaN, '60000', true, {}]) {
    assert.throws(() => normalizeCloudSnapshot({ recommendationFilters: { targetPriceManWon: value } }), invalid());
  }
  assert.throws(() => normalizeCloudSnapshot({ recommendationFilters: { requireParking: 'false' } }), invalid());
  assert.throws(() => normalizeCloudSnapshot({ recommendationFilters: { budgetSource: 'external' } }), invalid());
  assert.throws(() => normalizeCloudSnapshot({ recommendationFilters: { commuteModes: ['rocket'] } }), invalid());
  assert.throws(() => normalizeCloudSnapshot({ visits: [visit({ visitDate: '2026-02-30' })] }), invalid());
  assert.throws(() => normalizeCloudSnapshot({ recommendationFilters: { commuteDepartureTime: '25:10' } }), invalid());
});

test('user values beyond slider ranges remain intact within JSON safe-number limits', () => {
  const input = { minHouseholds: 10001, maxAgeYears: 100, minAreaM2: 1000, targetPriceManWon: 300000,
    manualTargetPriceManWon: 300000, maxOverBudgetPct: 0 };
  const safe = normalizeCloudSnapshot({ recommendationFilters: input });
  for (const [key, value] of Object.entries(input)) assert.equal(safe.recommendationFilters[key], value);
});

test('each primary list has a 1000-item bound and compare list retains at most three real visits', () => {
  const candidates = Array.from({ length: CLOUD_SNAPSHOT_LIST_LIMIT }, (_, index) => ({ id: `id-${index}` }));
  assert.equal(normalizeCloudSnapshot({ shortlist: candidates }).shortlist.length, 1000);
  for (const key of ['shortlist', 'visits', 'supplyFavorites']) {
    assert.throws(() => normalizeCloudSnapshot({ [key]: [...candidates, { id: 'extra' }] }), invalid());
  }
  assert.throws(() => normalizeCloudSnapshot({ recommendationFilters: { workplaces: [...candidates, { id: 'extra' }] } }), invalid());
  assert.throws(() => normalizeCloudSnapshot({ compareIds: ['a', 'b', 'c', 'd'] }), invalid());
  assert.throws(() => normalizeCloudSnapshot({ parkingObservations: Object.fromEntries([...candidates, { id: 'extra' }].map(item => [item.id, { sourceType: 'field' }])) }), invalid());
});

test('size is bounded in UTF-8 bytes before and after normalization', () => {
  assert.equal(cloudSnapshotByteLength({ value: '가' }) - cloudSnapshotByteLength({ value: 'a' }), 2);
  assert.throws(() => normalizeCloudSnapshot({ unknown: 'x'.repeat(CLOUD_SNAPSHOT_MAX_BYTES) }), invalid('CLOUD_SNAPSHOT_TOO_LARGE'));
  const visits = Array.from({ length: 1000 }, (_, index) => visit({ id: `v-${index}`, memo: '가'.repeat(200) }));
  assert.throws(() => normalizeCloudSnapshot({ visits }), invalid('CLOUD_SNAPSHOT_TOO_LARGE'));
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => normalizeCloudSnapshot(cyclic), invalid());
});
