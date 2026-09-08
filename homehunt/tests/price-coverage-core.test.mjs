import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePriceCoverage, priceCoverageLabel, mergeRetriedPriceResults } from '../js/price-coverage-core.mjs';
import { createCandidateReviewBookmark, mergeLiveReviewCandidates } from '../js/candidate-review-core.mjs';
import { normalizeCloudSnapshot } from '../js/cloud-snapshot-core.mjs';
import { decisionPrice } from '../js/decision-core.mjs';
import { officialTradeEvidence } from '../providers/official/complex.mjs';

const coverage = (overrides = {}) => ({ status: 'partial', completedMonthCount: 2, totalMonthCount: 3,
  missingMonths: ['202609'], staleMonths: [], sourceUpdatedAt: '2026-09-08T00:00:00.000Z', ...overrides });
const house = (overrides = {}) => ({ catalogId: 'test-home', name: '테스트 단지', address: '가상 테스트 주소',
  priceVerified: true, priceProvisional: true, priceCoverage: coverage(),
  bestArea: { averagePriceManWon: 59000, areaM2: 59.9, count: 5, latestMonth: '2026-08' }, ...overrides });

test('unknown, false, malformed counts and invalid month lists cannot claim complete price coverage', () => {
  for (const value of [undefined, null, false, true, [], {},
    coverage({ status: 'complete', completedMonthCount: true }),
    coverage({ status: 'complete', completedMonthCount: 4 }),
    coverage({ status: 'complete', completedMonthCount: 3, missingMonths: ['202613'] }),
    coverage({ status: 'complete', completedMonthCount: 3, missingMonths: false })]) {
    assert.equal(normalizePriceCoverage(value).status, 'missing');
  }
});

test('contradictory complete coverage is downgraded when months are missing or stale', () => {
  assert.equal(normalizePriceCoverage(coverage({ status: 'complete' })).status, 'partial');
  assert.equal(normalizePriceCoverage(coverage({ status: 'complete', completedMonthCount: 3 })).status, 'partial');
  assert.equal(normalizePriceCoverage(coverage({ status: 'complete', completedMonthCount: 3,
    missingMonths: [], staleMonths: ['202608'] })).status, 'stale');
  assert.equal(normalizePriceCoverage(coverage({ status: 'complete', completedMonthCount: 3,
    missingMonths: [] })).status, 'complete');
});

test('coverage normalizes only official provenance fields and valid ISO dates', () => {
  const input = coverage({ missingMonths: ['202609', '202608', '202609'], provider: 'kakao',
    routes: [{ durationMinutes: 40 }], sourceUpdatedAt: '2026-02-30T00:00:00.000Z' });
  const before = structuredClone(input), safe = normalizePriceCoverage(input);
  assert.deepEqual(safe.missingMonths, ['202608', '202609']);
  assert.equal(safe.sourceUpdatedAt, '');
  assert.deepEqual(Object.keys(safe), ['status', 'completedMonthCount', 'totalMonthCount', 'missingMonths', 'staleMonths', 'sourceUpdatedAt']);
  assert.deepEqual(input, before);
});

test('labels distinguish incomplete, stale, complete and unknown price periods without inventing amounts', () => {
  assert.match(priceCoverageLabel(house()), /잠정 가격 · 2\/3개월 확인 · 누락 2026\.09/);
  assert.match(priceCoverageLabel(house({ priceCoverage: coverage({ status: 'stale', staleMonths: ['202608'] }) })), /이전 자료 포함.*갱신 대기 2026\.08/);
  assert.match(priceCoverageLabel(house({ priceCoverage: false })), /잠정 가격.*조회 범위 미확인/);
  const complete = house({ priceProvisional: false, priceCoverage: coverage({ status: 'complete', completedMonthCount: 3, missingMonths: [] }) });
  assert.equal(priceCoverageLabel(complete), '가격 자료 3/3개월 확인');
  assert.doesNotMatch(priceCoverageLabel(house()), /5억|59000|통과|확정/);
});

test('retry adopts the new full price result while preserving current routes and geocoded points for remaining IDs', () => {
  const old = house({ lat: 37.3, lng: 127.1, locationPrecision: 'address', mapCoordinateSource: 'address-geocode',
    routesByDestination: { office: [{ provider: 'kakao', durationMinutes: 40 }] },
    commuteBalance: { weightedMeanMinutes: 40 }, commuteVerification: { stage: 'final', originFingerprint: 'same-origin' },
    personalizedRecommendation: { score: 88 }, totalScore: 88, locationRecommendation: { score: 60 }, score: 88 });
  const next = house({ bestArea: { averagePriceManWon: 62000, count: 7 }, priceProvisional: false,
    priceCoverage: coverage({ status: 'complete', completedMonthCount: 3, missingMonths: [] }) });
  const before = structuredClone(old);
  const result = mergeRetriedPriceResults([old, house({ catalogId: 'removed' })], [next, house({ catalogId: 'added' })]);
  assert.deepEqual(result.map(row => row.catalogId), ['test-home', 'added']);
  assert.equal(result[0].bestArea.averagePriceManWon, 62000);
  assert.deepEqual(result[0].routesByDestination, old.routesByDestination);
  assert.deepEqual(result[0].commuteVerification, old.commuteVerification);
  assert.equal(result[0].lat, 37.3);
  assert.equal(result[0].mapCoordinateSource, 'address-geocode');
  assert.equal(result[0].priceProvisional, false);
  for (const key of ['personalizedRecommendation', 'locationRecommendation', 'score', 'totalScore']) assert.ok(!(key in result[0]));
  result[0].routesByDestination.office[0].durationMinutes = 50;
  assert.deepEqual(old, before);
});

test('retry does not inherit old prices absent from a fresh result, and rejects ID duplication or malformed rows', () => {
  const result = mergeRetriedPriceResults([house()], [null, {}, house({ bestArea: undefined }), house()]);
  assert.equal(result.length, 1);
  assert.equal(result[0].bestArea, undefined);
  assert.deepEqual(mergeRetriedPriceResults([house()], []), []);
});

test('retry drops previous route and location evidence if the identified house address was corrected', () => {
  const previous = house({ lat: 37.3, lng: 127.1, routesByDestination: { office: [{ durationMinutes: 40 }] } });
  const result = mergeRetriedPriceResults([previous], [house({ address: '다른 가상 주소' })])[0];
  assert.ok(!('lat' in result));
  assert.ok(!('routesByDestination' in result));
});

test('bookmarks and cloud round trips retain incomplete price coverage while discarding route payloads hidden inside it', () => {
  const candidate = house({ routesByDestination: { office: [{ provider: 'kakao', durationMinutes: 40 }] },
    priceCoverage: { ...coverage(), routes: [{ provider: 'kakao', durationMinutes: 40 }], commutePassed: true } });
  const bookmark = createCandidateReviewBookmark(candidate, null, { now: '2026-09-08T01:00:00.000Z' });
  assert.equal(bookmark.priceCoverage.status, 'partial');
  assert.equal(bookmark.priceProvisional, true);
  const restored = normalizeCloudSnapshot(normalizeCloudSnapshot({ shortlist: [bookmark] })).shortlist[0];
  assert.deepEqual(restored.priceCoverage, normalizePriceCoverage(candidate.priceCoverage));
  assert.equal(restored.bestArea.averagePriceManWon, 59000);
  assert.equal(restored.priceProvisional, true);
  assert.doesNotMatch(JSON.stringify(restored), /routes|durationMinutes|commutePassed/);
  assert.equal(mergeLiveReviewCandidates([restored], [])[0].priceCoverage.status, 'partial');
});

test('false coverage cannot be silently removed by cloud normalization and leave a false full-price assertion', () => {
  const bookmark = createCandidateReviewBookmark(house(), null, { now: '2026-09-08T01:00:00.000Z' });
  const restored = normalizeCloudSnapshot({ shortlist: [{ ...bookmark, priceCoverage: false, priceProvisional: false }] }).shortlist[0];
  assert.equal(restored.priceCoverage.status, 'missing');
  assert.equal(restored.priceProvisional, true);
});

test('decision and official evidence display incomplete averages with a provisional qualifier, preserving actual price facts', () => {
  const candidate = house();
  const decision = decisionPrice('candidate', candidate);
  assert.equal(decision.value, 59000);
  assert.equal(decision.provisional, true);
  assert.match(decision.label, /잠정/);
  assert.match(decision.coverageLabel, /2\/3개월/);
  const evidence = officialTradeEvidence(candidate)[0];
  assert.equal(evidence.value, 59000);
  assert.equal(evidence.tier, 'estimated');
  assert.equal(evidence.decisionStatus, 'provisional');
  assert.match(evidence.note, /누락 2026\.09/);
});

test('full coverage may retain verified trade evidence while unknown coverage cannot', () => {
  const candidate = house({ priceProvisional: false, priceCoverage: coverage({ status: 'complete',
    completedMonthCount: 3, missingMonths: [] }) });
  assert.equal(officialTradeEvidence(candidate)[0].tier, 'verified');
  assert.equal(decisionPrice('candidate', candidate).provisional, false);
  assert.equal(officialTradeEvidence(house({ priceCoverage: undefined, priceProvisional: false }))[0].tier, 'estimated');
});
