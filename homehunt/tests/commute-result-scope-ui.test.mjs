import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  evaluateCommuteBalance, expectedTransitProviderCalls, normalizeDestinations, quotaAwareCandidateCap,
} from '../js/commute-balance-core.mjs';
import {
  candidateVerificationStatus, commuteEvidenceFreshness, destinationFingerprint, originFingerprint,
  selectedCommuteProvider, planCommuteVerification, commuteAttemptKey, recentCommuteAttempt, orderCommuteVerificationCandidates,
} from '../js/recommendation-verification-core.mjs';
import { rankPersonalizedCandidates } from '../js/personalized-ranking-core.mjs';
import { orderLocationVerificationQueue } from '../js/personalized-context-core.mjs';
import { parkingForCandidate } from '../js/controllers/personalized-recommendation-ui.js';
import { isGeoPoint } from '../js/transport-core.mjs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const actualFunction = name => {
  const match = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Actual app function ${name} exists`);
  return match[0];
};
const destinations = normalizeDestinations([
  { id: 'a', label: '회사 A', weightPercent: 10, lat: 37.49, lng: 127.01 },
  { id: 'b', label: '회사 B', weightPercent: 50, lat: 37.51, lng: 127.03 },
  { id: 'c', label: '회사 C', weightPercent: 40, lat: 37.53, lng: 127.05 },
].map(destination => ({ ...destination, maxMinutes: 60, departureTime: '08:00', modes: ['transit'], preferSubway: true })));

function priceCandidate(id, offset = 0) {
  return {
    catalogId: id, name: `가격 후보 ${id}`, address: '서울특별시 서초구', regionCode: '11650',
    lat: 37.5 + offset * .00001, lng: 127, coordinateType: 'complex',
    households: 1500, builtYear: 2020, priceVerified: true,
    bestArea: { count: 5, averagePriceManWon: 70000, areaM2: 84 },
  };
}

function measuredRoute(minutes, now) {
  return { mode: 'transit', provider: 'tmap', verified: true, durationMinutes: minutes,
    walkingMinutes: 4, transferCount: 1, transitComposition: 'subway', queriedAt: new Date(now).toISOString() };
}

function withMeasuredRoutes(candidate, times, now) {
  const routesByDestination = Object.fromEntries(destinations.flatMap((destination, index) =>
    times[index] == null ? [] : [[destination.id, [measuredRoute(times[index], now)]]]));
  const result = { ...candidate, routesByDestination };
  result.commuteBalance = evaluateCommuteBalance(result, destinations);
  result.commuteVerification = {
    stage: 'final', provider: 'tmap', stale: false,
    destinationFingerprint: destinationFingerprint(destinations),
    originFingerprint: originFingerprint(result), verifiedAt: new Date(now).toISOString(),
  };
  return result;
}

const appFunctions = [
  'activeRecommendationDestinations', 'recommendationVerificationStatus',
  'candidateCommuteDecision', 'filterRecommendationByCommute', 'rankedRecommendationSource',
  'sortedRecommendationResults', 'renderCommuteVerificationGate', 'renderRecommendationResults',
  'renderRecommendationStatusSummary',
  'recommendationCandidateId', 'commuteProviderIssues', 'commuteProviderIssueMessage',
  'requestCommuteMatrix', 'verifyRecommendationCommutes', 'recommendationCommutePlan', 'rememberCommuteAttempt', 'verifyTopRecommendationCommutes', 'verifySingleRecommendationCommute',
];

/** Run the actual app orchestration and pure ranking; only DOM/map and network are fixtures. */
function harness(candidates = []) {
  const clock = { now: Date.now() };
  class AppDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const nodes = new Map();
  function $(selector, parent) {
    const key = `${parent?.key || ''}/${selector}`;
    if (!nodes.has(key)) nodes.set(key, {
      key, value: '', hidden: false, disabled: false, textContent: '', children: [],
      classList: { add() {}, remove() {}, toggle() {} },
      querySelector(selector) { return $(selector, this); },
      replaceChildren(...children) { this.children = children; },
      setAttribute() {},
    });
    return nodes.get(key);
  }
  $('#recommendationSort').value = 'recommended';
  $('#recommendationCommuteScope').value = 'matched';
  const filters = {
    destinations, commuteMaxMinutes: 60, commuteModes: ['transit'], commuteDepartureTime: '08:00',
    targetPriceManWon: 70000, maxOverBudgetPct: 10, preferSubway: true,
    minParkingRatio: 1, requireParking: true, excludeFar: true,
  };
  const state = {
    recommendationResults: candidates, shortlist: [], workplaces: destinations,
    recommendationShowingShortlist: false, recommendationRegion: '', recommendationVisibleCount: 50,
    recommendationRunSnapshot: { destinations, filters }, recommendationGeocodeToken: 1,
    recommendationRunning: false, commuteVerificationRunning: false,
    recommendationCommuteEnriched: false, recommendationCommuteError: '', lastCommuteProviderIssues: [],
    railStations: [], gangnamAnchor: { name: '강남역', lat: 37.498, lng: 127.028 },
    transportConfig: { transitConfigured: true, carConfigured: false, transitProvider: 'tmap',
      providers: { tmapTransitConfigured: true, kakaoTransitConfigured: false } },
  };
  const calls = { requests: [], toasts: [], cards: [], timers: new Map() };
  let timerSequence = 0;
  const sandbox = {
    state, $, Date: AppDate, locationRankingCache: null, decisionWorkspace: null,
    normalizeDestinations, evaluateCommuteBalance, destinationFingerprint, originFingerprint,
    selectedCommuteProvider, planCommuteVerification, commuteAttemptKey, recentCommuteAttempt, orderCommuteVerificationCandidates,
    expectedTransitProviderCalls, quotaAwareCandidateCap, orderLocationVerificationQueue,
    parkingForCandidate, isGeoPoint,
    // Inject the same clock into imported freshness functions and the app's cache.
    candidateVerificationStatus: (candidate, options) => candidateVerificationStatus(candidate, { ...options, now: clock.now }),
    commuteEvidenceFreshness: (candidate, options) => commuteEvidenceFreshness(candidate, { ...options, now: clock.now }),
    rankPersonalizedCandidates,
    readRecommendationForm: () => filters,
    candidateRegionKey: candidate => candidate.regionCode,
    candidateAveragePrice: candidate => candidate.bestArea?.averagePriceManWon ?? Infinity,
    candidateCommuteRank: candidate => [candidate.commuteBalance?.weightedMeanMinutes ?? Infinity, 0, 0],
    KAKAO_PUBLIC_TRANSIT_DAILY_BUDGET: 1000, MAX_KAKAO_SCREENING_CANDIDATES: 50,
    APP_CONFIG: { commuteBatchUrl: 'fixture:commute-batch' },
    fetchCommuteQuota: async () => ({ provider: state.transportConfig.transitProvider, tmap: { remaining: 10 }, kakao: { remaining: 1000 } }),
    fetch: async (url, options) => {
      assert.equal(url, 'fixture:commute-batch');
      calls.requests.push(JSON.parse(options.body));
      throw new Error('Unexpected fixture request');
    },
    makeRecommendationCard: candidate => { calls.cards.push(candidate); return { candidate }; },
    showToast: (...args) => calls.toasts.push(args), saveShortlist() {},
    hideRecommendationMapStatus() {}, renderRecommendationDecisionBar() {},
    renderRecommendationComposition() {}, renderLocationDiscovery() {}, selectRecommendationRegion() {},
    refreshShortlistCommuteFreshness() {}, setRecommendationPanel() {},
    window: {
      requestAnimationFrame() {},
      setTimeout(callback, delay) { const id = ++timerSequence; calls.timers.set(id, { callback, delay }); return id; },
      clearTimeout(id) { calls.timers.delete(id); },
    },
  };
  vm.createContext(sandbox);
  appFunctions.forEach(name => vm.runInContext(actualFunction(name), sandbox));
  return { state, sandbox, calls, filters, clock, $ };
}

function respondWithRoutes(context, getRoutes) {
  context.sandbox.fetch = async (url, options) => {
    assert.equal(url, 'fixture:commute-batch');
    const body = JSON.parse(options.body);
    context.calls.requests.push(body);
    return { ok: true, json: async () => ({
      items: body.origins.flatMap(origin => body.destinations.map(destination => ({
        originId: origin.id, destinationId: destination.id,
        routes: getRoutes(origin, destination),
      }))),
    }) };
  };
}

test('959 price candidates and three companies produce zero default matches and 959 explicit pending candidates', () => {
  const candidates = Array.from({ length: 959 }, (_, index) => priceCandidate(`P${index}`, index));
  const { sandbox, state, calls, $ } = harness(candidates);
  assert.equal(sandbox.sortedRecommendationResults().length, 0);
  const pending = sandbox.sortedRecommendationResults({ scope: 'pending' });
  assert.equal(pending.length, 959);
  assert.ok(pending.every(candidate => candidate.personalizedRecommendation.score === null));
  assert.equal($('#recommendationCommuteScope').value, 'matched', 'Selecting a verification pool must not change the visible scope');
  sandbox.renderRecommendationResults();
  assert.equal($('#recommendationResultCount').textContent, '0');
  assert.match($('#recommendationResultLabel').textContent, /통근 조건 충족/);
  assert.equal($('#recommendationResults').hidden, true);
  assert.equal(calls.cards.length, 0);
  assert.equal(state.recommendationResults, candidates, 'An empty confirmed view must retain the pending price evidence');
  assert.equal($('#commuteVerificationGate').hidden, false);
  assert.match($('#commuteVerificationTitle').textContent, /실제 통근 충족 0곳.*미확인 959곳/);
  assert.match($('#commuteVerificationCopy').textContent, /가격 후보 959곳.*아직 없습니다/);
  assert.match($('#showPendingCommutes').textContent, /미확인 가격 후보 959곳 따로 보기/);
  $('#recommendationCommuteScope').value = 'pending';
  sandbox.renderRecommendationResults();
  assert.equal($('#recommendationResultCount').textContent, '959');
  assert.match($('#recommendationResultLabel').textContent, /가격 후보.*통근 미확인/);
  assert.equal($('#recommendationResults').children.length, 50, 'The separately opened pending list preserves pagination');
});

test('incomplete price data with zero candidates precedes every commute empty state', () => {
  const { sandbox, state, calls, $ } = harness();
  const meta = { baseCandidateCount: 4199, failedRequestCount: 88, partial: true,
    incompleteDistrictCodes: ['11650'], excludedIncompleteCandidateCount: 4199 };
  vm.runInContext(actualFunction('renderRecommendationDecisionBar'), sandbox);
  for (const scope of ['matched', 'pending', 'all', 'excluded']) {
    $('#recommendationCommuteScope').value = scope;
    sandbox.renderRecommendationResults(meta);
    assert.match($('#recommendationEmptyTitle').textContent, /실거래 자료가 누락.*판단을 보류/);
    assert.match($('#recommendationEmptyMessage').textContent, /월·시군구 조회 88건.*불완전한 시군구의 후보를 제외/);
    assert.match($('#recommendationEmptyMessage').textContent, /조건에 맞는 집이 없다는 뜻은 아닙니다/);
    assert.match($('#recommendationEmptyMessage').textContent, /연결 상태.*다시 찾기/);
    assert.doesNotMatch($('#recommendationEmptyMessage').textContent, /통근 확인 버튼|경로를 조회|모든 후보의 통근 경로가 확인/);
    assert.match($('#recommendationResultSummary').textContent, /월·시군구 조회 미반영 88건/);
    assert.equal($('#commuteVerificationGate').hidden, true);
    assert.equal($('#verifyTopCommutes').disabled, true);
    assert.equal($('#decisionCandidateDetail').textContent, '가격 자료 확인 미완료');
    assert.equal($('#decisionVerifiedDetail').textContent, '가격 후보 확보 후 통근 확인');
  }
  state.recommendationCommuteEnriched = true;
  sandbox.renderRecommendationResults();
  assert.match($('#recommendationEmptyTitle').textContent, /판단을 보류/);
  assert.equal(calls.requests.length, 0);
});

test('complete searches with zero price candidates explain the actual price or base filter stage', () => {
  const { sandbox, calls, $ } = harness();
  for (const baseCandidateCount of [0, 4199]) {
    sandbox.renderRecommendationResults({ baseCandidateCount, failedRequestCount: 0 });
    assert.match($('#recommendationEmptyTitle').textContent, baseCandidateCount ? /면적·가격/ : /지역·세대수·연식/);
    assert.match($('#recommendationEmptyMessage').textContent, baseCandidateCount ? /조회기간에.*면적·가격/ : /가격 조회 전 기본조건/);
    assert.doesNotMatch($('#recommendationEmptyMessage').textContent, /통근 확인 버튼|경로를 조회|자료가 불완전/);
    assert.equal($('#commuteVerificationGate').hidden, true);
  }
  assert.equal(calls.requests.length, 0);
});

test('partial price results keep valid candidates available and preserve shortlist-specific empty guidance', () => {
  const { sandbox, state, $ } = harness([priceCandidate('complete-district')]);
  sandbox.renderRecommendationResults({ baseCandidateCount: 4199, failedRequestCount: 88, partial: true });
  assert.equal($('#recommendationEmptyTitle').textContent, '아직 정밀 통근을 실행하지 않았어요');
  assert.equal($('#commuteVerificationGate').hidden, false);
  assert.match($('#recommendationStatusMessage').textContent, /월·시군구 가격 조회 88건/);
  $('#recommendationCommuteScope').value = 'pending';
  sandbox.renderRecommendationResults();
  assert.equal($('#recommendationResults').children.length, 1);
  state.recommendationShowingShortlist = true;
  sandbox.renderRecommendationResults();
  assert.equal($('#recommendationEmptyTitle').textContent, '저장한 관심 후보가 없어요');
  assert.match($('#recommendationEmptyMessage').textContent, /관심 후보 저장/);
});

test('a new running search hides previous price failure metadata from the empty result view', () => {
  const { sandbox, state, calls, $ } = harness();
  state.recommendationMeta = { baseCandidateCount: 4199, failedRequestCount: 88, partial: true };
  state.recommendationRunning = true;
  sandbox.renderRecommendationResults();
  assert.equal($('#recommendationEmptyTitle').textContent, '가격 자료를 확인하고 있어요');
  assert.match($('#recommendationEmptyMessage').textContent, /조회 중/);
  assert.doesNotMatch($('#recommendationEmptyMessage').textContent, /88|정밀 통근/);
  assert.doesNotMatch($('#recommendationResultSummary').textContent, /88|4,199/);
  assert.match($('#recommendationResultSummary').textContent, /검색이 끝나면/);
  assert.equal(calls.requests.length, 0);
});

test('every required destination must meet its own limit, including a low-weight company at the boundary', () => {
  const context = harness();
  const { state, sandbox, clock, $ } = context;
  const lowWeightOver = withMeasuredRoutes(priceCandidate('low-weight-over'), [61, 20, 20], clock.now);
  assert.ok(lowWeightOver.commuteBalance.weightedMeanMinutes < 60, 'The weighted average alone would incorrectly pass this candidate');
  state.recommendationResults = [
    lowWeightOver,
    withMeasuredRoutes(priceCandidate('all-within'), [40, 40, 40], clock.now),
    withMeasuredRoutes(priceCandidate('exact-limit'), [60, 60, 60], clock.now),
    withMeasuredRoutes(priceCandidate('missing-company'), [20, null, 20], clock.now),
  ];
  assert.deepEqual(Array.from(sandbox.sortedRecommendationResults(), candidate => candidate.catalogId).sort(), ['all-within', 'exact-limit']);
  assert.deepEqual(Array.from(sandbox.sortedRecommendationResults({ scope: 'pending' }), candidate => candidate.catalogId), ['missing-company']);
  assert.deepEqual(Array.from(sandbox.sortedRecommendationResults({ scope: 'excluded' }), candidate => candidate.catalogId), ['low-weight-over']);
  sandbox.renderRecommendationResults();
  assert.equal($('#recommendationResultCount').textContent, '2');
  assert.match($('#commuteVerificationTitle').textContent, /실제 통근 충족 2곳.*미확인 1곳/);
});

test('estimated journey minutes never become an actual confirmed match', () => {
  const { sandbox, state, clock } = harness();
  const candidate = withMeasuredRoutes(priceCandidate('estimated'), [10, 10, 10], clock.now);
  candidate.routesByDestination.a[0].estimated = true;
  candidate.commuteBalance = evaluateCommuteBalance(candidate, destinations);
  state.recommendationResults = [candidate];
  assert.equal(sandbox.sortedRecommendationResults().length, 0);
  assert.equal(sandbox.sortedRecommendationResults({ scope: 'pending' }).length, 1);
});

test('the confirmed app list favors the 90-percent offices while allowing the 10-percent office over its target', () => {
  const { sandbox, state, filters, clock, $ } = harness();
  const offices = normalizeDestinations(destinations.map((destination, index) => ({ ...destination, required: index !== 0 })));
  filters.destinations = offices;
  state.workplaces = offices;
  state.recommendationRunSnapshot.destinations = offices;
  state.recommendationResults = [
    ['near-main-offices', [90, 20, 20]],
    ['near-minor-office', [10, 60, 60]],
  ].map(([id, times]) => {
    const candidate = withMeasuredRoutes(priceCandidate(id), times, clock.now);
    candidate.commuteBalance = evaluateCommuteBalance(candidate, offices);
    candidate.commuteVerification.destinationFingerprint = destinationFingerprint(offices);
    return candidate;
  });
  const results = sandbox.sortedRecommendationResults();
  assert.deepEqual(Array.from(results, candidate => candidate.catalogId), ['near-main-offices', 'near-minor-office']);
  assert.equal(results[0].personalizedRecommendation.weightedMeanMinutes, 27);
  assert.equal(results[0].personalizedRecommendation.decision, 'matched');
  assert.equal(results[0].personalizedRecommendation.commuteBalance.evaluations[0].withinLimit, false);
  sandbox.renderRecommendationResults();
  assert.equal($('#recommendationResultCount').textContent, '2');
  assert.match($('#commuteVerificationCopy').textContent, /초과 허용 회사는 비중만큼/);
});

test('top verification queries the pending pool even while the visible confirmed list is empty', async () => {
  const context = harness(Array.from({ length: 959 }, (_, index) => priceCandidate(`P${index}`, index)));
  const { sandbox, calls, clock, $ } = context;
  respondWithRoutes(context, () => [measuredRoute(35, clock.now)]);
  assert.equal(sandbox.sortedRecommendationResults().length, 0);
  await sandbox.verifyTopRecommendationCommutes();
  assert.equal(calls.requests.length, 2);
  assert.equal(calls.requests[0].origins.length, 1);
  assert.deepEqual(calls.requests[0].destinations.map(destination => destination.id), ['a', 'b', 'c']);
  assert.equal(calls.requests.reduce((sum, body) => sum + body.maxTransitCalls, 0), 9);
  assert.equal(sandbox.sortedRecommendationResults().length, 3);
  assert.equal(sandbox.sortedRecommendationResults({ scope: 'pending' }).length, 956);
  assert.equal($('#recommendationCommuteScope').value, 'matched');
  assert.equal($('#recommendationResultCount').textContent, '3');
});

test('a completed query with no conclusive routes keeps the confirmed scope empty instead of switching to all', async () => {
  const context = harness([priceCandidate('P1'), priceCandidate('P2')]);
  respondWithRoutes(context, () => []);
  await context.sandbox.verifyTopRecommendationCommutes();
  assert.equal(context.$('#recommendationCommuteScope').value, 'matched');
  assert.equal(context.sandbox.sortedRecommendationResults().length, 0);
  assert.equal(context.sandbox.sortedRecommendationResults({ scope: 'pending' }).length, 2);
  assert.equal(context.$('#recommendationResultCount').textContent, '0');
});

test('HTTP provider failure persists through rerenders without making pending candidates default matches', async () => {
  const context = harness([priceCandidate('P1'), priceCandidate('P2')]);
  const { sandbox, state, calls, $ } = context;
  sandbox.fetch = async (url, options) => {
    assert.equal(url, 'fixture:commute-batch');
    calls.requests.push(JSON.parse(options.body));
    return { ok: false, json: async () => ({ error: 'TMAP HTTP 403 · 권한 확인 필요' }) };
  };
  await sandbox.verifyTopRecommendationCommutes();
  for (let render = 0; render < 2; render++) sandbox.renderRecommendationResults();
  assert.match(state.recommendationCommuteError, /HTTP 403/);
  assert.equal($('#commuteVerificationError').hidden, false);
  assert.match($('#commuteVerificationError').textContent, /HTTP 403/);
  assert.match($('#commuteVerificationError').textContent, /통근 충족으로 판정하지/);
  assert.equal($('#recommendationCommuteScope').value, 'matched');
  assert.equal($('#recommendationResultCount').textContent, '0');
  assert.equal(sandbox.sortedRecommendationResults({ scope: 'pending' }).length, 2);
  assert.equal(state.commuteVerificationRunning, false);
  assert.equal($('#verifyTopCommutes').disabled, false);
});

test('provider errors inside a successful batch remain visible and do not mean a measured zero-minute route', async () => {
  const context = harness([priceCandidate('P1')]);
  respondWithRoutes(context, () => [{ mode: 'transit', provider: 'tmap', verified: false,
    status: 'error', reasonCode: 'HTTP_403', httpStatus: 403, durationMinutes: null }]);
  await context.sandbox.verifyTopRecommendationCommutes();
  assert.ok(context.state.recommendationCommuteError.length > 0);
  assert.equal(context.state.lastCommuteProviderIssues[0].httpStatus, 403);
  assert.equal(context.$('#commuteVerificationError').hidden, false);
  assert.equal(context.$('#recommendationCommuteScope').value, 'matched');
  assert.equal(context.sandbox.sortedRecommendationResults().length, 0);
  const pending = context.sandbox.sortedRecommendationResults({ scope: 'pending' });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].personalizedRecommendation.score, null);
  assert.equal(pending[0].personalizedRecommendation.dimensions.commute.status, 'unknown');
  assert.equal(pending[0].personalizedRecommendation.dimensions.commute.value, null);
});

test('a failed first Kakao company matrix stops the remaining selected-provider batch', async () => {
  const context = harness(Array.from({ length: 75 }, (_, index) => priceCandidate(`P${index}`, index)));
  context.state.transportConfig.providers.kakaoTransitConfigured = true;
  context.state.transportConfig.transitProvider = 'kakao';
  context.state.transportConfig.transitProviderPreference = 'auto';
  respondWithRoutes(context, () => [{ mode: 'transit', provider: 'kakao', verified: false,
    status: 'error', reasonCode: 'KAKAO_MAP_SERVICE_DISABLED', httpStatus: 403 }]);
  await context.sandbox.verifyTopRecommendationCommutes();
  assert.equal(context.calls.requests.length, 1, 'The pilot failure must stop the remaining nine candidates');
  assert.equal(context.calls.requests[0].origins.length, 1);
  assert.equal(context.calls.requests[0].destinations.length, 3);
  assert.equal(context.calls.requests[0].maxTransitCalls, 3);
  assert.equal(context.calls.requests[0].transitProvider, 'kakao');
  assert.match(context.state.recommendationCommuteError, /카카오맵.*설정/);
  assert.equal(context.$('#commuteVerificationError').hidden, false);
  assert.equal(context.$('#recommendationCommuteScope').value, 'matched');
  assert.equal(context.sandbox.sortedRecommendationResults().length, 0);
  assert.equal(context.sandbox.sortedRecommendationResults({ scope: 'pending' }).length, 75);
});

test('the gate retains a timestamped provider diagnostic after reload but ignores undated diagnostics', () => {
  const { state, sandbox, clock, $ } = harness([priceCandidate('P1')]);
  state.transportConfig.transitProvider = 'kakao';
  state.transportConfig.diagnostics = { transit: {
    kakao: { state: 'error', checkedAt: new Date(clock.now).toISOString(), reasonCode: 'KAKAO_MAP_SERVICE_DISABLED' },
    tmap: { state: 'error', checkedAt: 'invalid-date', reasonCode: 'HTTP_403' },
  } };
  sandbox.renderRecommendationResults();
  sandbox.renderRecommendationResults();
  assert.equal(state.recommendationCommuteError, '', 'This fixture models a reload before another verification request');
  assert.equal($('#commuteVerificationError').hidden, false);
  assert.match($('#commuteVerificationError').textContent, /KAKAO 최근 조회 실패/);
  assert.match($('#commuteVerificationError').textContent, /카카오맵.*설정/);
  assert.doesNotMatch($('#commuteVerificationError').textContent, /Invalid Date/);
  assert.equal($('#recommendationResultCount').textContent, '0');
  state.transportConfig.diagnostics.transit.kakao.checkedAt = '';
  sandbox.renderRecommendationResults();
  assert.equal($('#commuteVerificationError').hidden, true, 'An undated status must not be presented as a recent observed failure');
});

test('the gate hides without required destinations or price candidates and hides the pending action when none remain', () => {
  const { sandbox, $ } = harness();
  sandbox.renderCommuteVerificationGate({ rawCount: 959, matchedCount: 0, pendingCount: 959, required: false });
  assert.equal($('#commuteVerificationGate').hidden, true);
  sandbox.renderCommuteVerificationGate({ rawCount: 0, matchedCount: 0, pendingCount: 0, required: true });
  assert.equal($('#commuteVerificationGate').hidden, true);
  sandbox.renderCommuteVerificationGate({ rawCount: 2, matchedCount: 2, pendingCount: 0, required: true });
  assert.equal($('#commuteVerificationGate').hidden, false);
  assert.equal($('#showPendingCommutes').hidden, true);
  assert.match($('#commuteVerificationCopy').textContent, /초과 허용 회사는 비중만큼 통근 부담/);
});

test('the actual ranking cache expires with route evidence even when candidates and preferences are unchanged', () => {
  const { state, sandbox, clock } = harness();
  state.recommendationResults = [withMeasuredRoutes(priceCandidate('recent'), [30, 30, 30], clock.now)];
  const first = sandbox.rankedRecommendationSource(state.recommendationResults);
  assert.equal(first[0].personalizedRecommendation.decision, 'matched');
  assert.equal(sandbox.rankedRecommendationSource(state.recommendationResults), first, 'Fresh evidence can reuse the ranking');
  clock.now += 8 * 60 * 60 * 1000;
  const expired = sandbox.rankedRecommendationSource(state.recommendationResults);
  assert.notEqual(expired, first, 'ISO source expiry must invalidate the cached ranking at its deadline');
  assert.equal(expired[0].personalizedRecommendation.decision, 'pending');
  assert.equal(expired[0].personalizedRecommendation.score, null);
  assert.equal(sandbox.sortedRecommendationResults().length, 0);
  assert.equal(sandbox.sortedRecommendationResults({ scope: 'pending' }).length, 1);
});

test('the scheduled freshness callback updates an already open confirmed list without a user edit', () => {
  const { state, sandbox, calls, clock, $ } = harness();
  state.recommendationResults = [withMeasuredRoutes(priceCandidate('expiring'), [30, 30, 30], clock.now)];
  sandbox.renderRecommendationResults();
  assert.equal($('#recommendationResultCount').textContent, '1');
  assert.equal(calls.timers.size, 1);
  const timer = calls.timers.get(state.recommendationFreshnessTimer);
  assert.ok(timer.delay >= 8 * 60 * 60 * 1000 && timer.delay <= 8 * 60 * 60 * 1000 + 1);
  clock.now += timer.delay;
  timer.callback();
  assert.equal($('#recommendationResultCount').textContent, '0');
  assert.equal($('#recommendationCommuteScope').value, 'matched');
  assert.match($('#commuteVerificationTitle').textContent, /실제 통근 충족 0곳.*미확인 1곳/);
  assert.equal(sandbox.sortedRecommendationResults({ scope: 'pending' })[0].personalizedRecommendation.score, null);
});


for (const preference of ['auto', 'kakao']) {
  test(`${preference} with both keys confirms Kakao alone and advances through disjoint ten-candidate batches`, async () => {
    const context = harness(Array.from({ length: 35 }, (_, i) => priceCandidate(`next-${i}`, i)));
    context.state.transportConfig = { ...context.state.transportConfig, transitProvider: 'kakao', transitProviderPreference: preference,
      providers: { kakaoTransitConfigured: true, tmapTransitConfigured: true } };
    respondWithRoutes(context, () => [{ ...measuredRoute(35, context.clock.now), provider: 'kakao', timeBasis: 'provider-default-no-departure-parameter' }]);
    await context.sandbox.verifyTopRecommendationCommutes();
    const first = context.calls.requests.flatMap(body => body.origins.map(origin => origin.id));
    assert.equal(first.length, 10);
    assert.equal(new Set(first).size, 10);
    assert.equal(context.calls.requests.reduce((sum, body) => sum + body.maxTransitCalls, 0), 30);
    assert.ok(context.calls.requests.every(body => body.transitProvider === 'kakao'));
    assert.equal(context.sandbox.sortedRecommendationResults().length, 10, 'Kakao alone is final even with a configured TMAP key');
    assert.ok(context.state.recommendationResults.filter(c => c.commuteVerification).every(c => c.commuteVerification.stage === 'final'));
    assert.ok([...context.state.commuteAttempts.values()].every(entry => Object.keys(entry).join(',') === 'checkedAt'), 'No route results or derived scores enter the retry ledger');
    const previousRequests = context.calls.requests.length;
    await context.sandbox.verifyTopRecommendationCommutes();
    const second = context.calls.requests.slice(previousRequests).flatMap(body => body.origins.map(origin => origin.id));
    assert.equal(second.length, 10);
    assert.equal(new Set([...first, ...second]).size, 20);
    assert.equal(context.sandbox.sortedRecommendationResults().length, 20);
  });
}

test('failed candidates are skipped by next-batch actions while manual recheck remains available', async () => {
  const context = harness(Array.from({ length: 15 }, (_, i) => priceCandidate(`retry-${i}`, i)));
  context.state.transportConfig.transitProvider = 'kakao';
  context.state.transportConfig.transitProviderPreference = 'kakao';
  respondWithRoutes(context, () => [{ mode: 'transit', provider: 'kakao', verified: false, status: 'error', reasonCode: 'HTTP_ERROR', httpStatus: 403 }]);
  await context.sandbox.verifyTopRecommendationCommutes();
  assert.equal(context.calls.requests.length, 1);
  const firstId = context.calls.requests[0].origins[0].id;
  await context.sandbox.verifyTopRecommendationCommutes();
  assert.equal(context.calls.requests.length, 2);
  assert.notEqual(context.calls.requests[1].origins[0].id, firstId);
  await context.sandbox.verifySingleRecommendationCommute(context.state.recommendationResults.find(c => c.catalogId === firstId));
  assert.equal(context.calls.requests.length, 3);
  assert.equal(context.calls.requests[2].origins[0].id, firstId);
  assert.match(context.state.recommendationCommuteError, /확인/);
  assert.equal(context.sandbox.sortedRecommendationResults().length, 0);
});

test('server-aborted unstarted origins stay eligible and are not recorded as failed attempts', async () => {
  const context = harness(Array.from({ length: 20 }, (_, i) => priceCandidate(`abort-${i}`, i)));
  context.state.transportConfig.transitProvider = 'kakao';
  let failedId;
  respondWithRoutes(context, origin => {
    if (context.calls.requests.length === 1) return [{ ...measuredRoute(30, context.clock.now), provider: 'kakao' }];
    failedId ||= origin.id;
    return [{ mode: 'transit', provider: 'kakao', verified: false, status: 'error', reasonCode: origin.id === failedId ? 'HTTP_ERROR' : 'BATCH_ABORTED' }];
  });
  await context.sandbox.verifyTopRecommendationCommutes();
  assert.equal(context.calls.requests.length, 2);
  assert.equal(context.state.commuteAttempts.size, 2, 'Only the successful pilot and actual failed origin were attempted');
  const plan = context.sandbox.recommendationCommutePlan(context.state.recommendationResults, destinations, { provider: 'kakao', kakao: { remaining: 995 } });
  assert.equal(plan.eligibleCount, 18);
  assert.ok(plan.candidates.every(candidate => candidate.catalogId !== failedId));
});

test('button execution reduces to complete matrices when the selected quota is nearly exhausted', async () => {
  const context = harness(Array.from({ length: 15 }, (_, i) => priceCandidate(`quota-${i}`, i)));
  context.state.transportConfig.transitProvider = 'kakao';
  context.sandbox.fetchCommuteQuota = async () => ({ provider: 'kakao', kakao: { remaining: 5 } });
  respondWithRoutes(context, () => [{ ...measuredRoute(30, context.clock.now), provider: 'kakao' }]);
  await context.sandbox.verifyTopRecommendationCommutes();
  assert.equal(context.calls.requests.length, 1);
  assert.equal(context.calls.requests[0].origins.length, 1);
  assert.equal(context.calls.requests[0].destinations.length, 3);
  assert.equal(context.calls.requests[0].maxTransitCalls, 3);
  context.sandbox.fetchCommuteQuota = async () => ({ provider: 'kakao', kakao: { remaining: 2 } });
  await context.sandbox.verifyTopRecommendationCommutes();
  assert.equal(context.calls.requests.length, 1);
});


test('the actual next-batch button shows its complete-matrix plan and current-view policy', () => {
  const context = harness(Array.from({ length: 15 }, (_, i) => priceCandidate(`button-${i}`, i)));
  context.state.transportConfig.transitProvider = 'kakao';
  context.state.commuteQuota = { provider: 'kakao', kakao: { remaining: 5 } };
  vm.runInContext(actualFunction('renderRecommendationDecisionBar'), context.sandbox);
  context.sandbox.renderRecommendationDecisionBar();
  const button = context.$('#verifyTopCommutes');
  assert.match(context.$('span', button).textContent, /다음 1곳.*최대 신규 3회/);
  assert.equal(button.disabled, false);
  assert.match(context.$('#commuteVerificationPlan').textContent, /가격 검색은 경로 호출 0회/);
  assert.match(context.$('#commuteVerificationPlan').textContent, /출발시각은 반영되지 않/);
  assert.doesNotMatch(context.$('#commuteVerificationPlan').textContent, /캐시.*재사용/);
  assert.match(context.$('#decisionTransitProvider').textContent, /Kakao 단독/);
  context.state.commuteQuota.kakao.remaining = 2;
  context.sandbox.renderRecommendationDecisionBar();
  assert.equal(button.disabled, true);
  assert.match(context.$('span', button).textContent, /남은 호출량/);
  assert.equal(context.calls.requests.length, 0);
});

test('location refinement blocks the real batch action and its visible button until the pool is ready', async () => {
  const context = harness([priceCandidate('known-far')]);
  context.state.commuteQuota = { provider: 'kakao', kakao: { remaining: 1000 } };
  context.state.transportConfig.transitProvider = 'kakao';
  context.state.recommendationLocationBusy = true;
  let quotaReads = 0;
  context.sandbox.fetchCommuteQuota = async () => { quotaReads += 1; return context.state.commuteQuota; };
  vm.runInContext(actualFunction('renderRecommendationDecisionBar'), context.sandbox);
  context.sandbox.renderRecommendationDecisionBar();
  const button = context.$('#verifyTopCommutes');
  assert.equal(button.disabled, true);
  assert.match(context.$('span', button).textContent, /위치 확인 중/);
  await context.sandbox.verifyTopRecommendationCommutes();
  assert.equal(quotaReads, 0);
  assert.equal(context.calls.requests.length, 0);
  context.state.recommendationLocationBusy = false;
  context.sandbox.renderRecommendationDecisionBar();
  assert.equal(button.disabled, false);
});

test('the settled map summary distinguishes nine measured matches, one exclusion and untouched price candidates', () => {
  const context = harness();
  context.state.recommendationResults = [
    ...Array.from({ length: 9 }, (_, i) => withMeasuredRoutes(priceCandidate(`matched-${i}`), [30, 35, 40], context.clock.now)),
    withMeasuredRoutes(priceCandidate('excluded'), [70, 35, 40], context.clock.now),
    ...Array.from({ length: 1061 }, (_, i) => priceCandidate(`pending-${i}`, i)),
  ];
  vm.runInContext(actualFunction('hideRecommendationMapStatus'), context.sandbox);
  context.sandbox.hideRecommendationMapStatus();
  assert.match(context.$('#recommendationStatusTitle').textContent, /가격 조건 1,071곳.*실제 통근 충족 9곳.*시간 조건 제외 1곳.*미확인 1,061곳/);
  assert.match(context.$('#recommendationStatusMessage').textContent, /조회한 실제 경로/);
  assert.match(context.$('#recommendationStatusMessage').textContent, /미확인 1,061곳은 통근 충족으로 판정하지/);
  assert.doesNotMatch(context.$('#recommendationStatusTitle').textContent, /실제 통근은 확인 전/);
  assert.doesNotMatch(context.$('#recommendationStatusMessage').textContent, /면적만 확인/);
  context.state.recommendationRunning = true;
  context.$('#recommendationStatusTitle').textContent = '새 가격 검색 진행 중';
  context.sandbox.hideRecommendationMapStatus();
  assert.equal(context.$('#recommendationStatusTitle').textContent, '새 가격 검색 진행 중');
  assert.equal(context.calls.requests.length, 0);
});

test('the visible verification plan shows only the selected provider quota and handles a real zero', () => {
  const context = harness([priceCandidate('budget')]);
  context.state.transportConfig.transitProvider = 'kakao';
  context.state.commuteQuota = { provider: 'kakao', kakao: { remaining: 968, limit: 1000, available: true }, tmap: { remaining: 9, limit: 10 } };
  vm.runInContext(actualFunction('renderRecommendationDecisionBar'), context.sandbox);
  context.sandbox.renderRecommendationDecisionBar();
  assert.match(context.$('#commuteVerificationPlan').textContent, /Kakao 오늘 남은 968\/1,000회 \(로컬 기준\)/);
  context.state.commuteQuota.kakao.remaining = 0;
  context.sandbox.renderRecommendationDecisionBar();
  assert.match(context.$('#commuteVerificationPlan').textContent, /Kakao 오늘 남은 0\/1,000회/);
  context.state.commuteQuota.kakao.remaining = null;
  context.sandbox.renderRecommendationDecisionBar();
  assert.match(context.$('#commuteVerificationPlan').textContent, /Kakao 오늘 사용량 확인 필요/);
  assert.doesNotMatch(context.$('#commuteVerificationPlan').textContent, /남은 0|남은 9/);
  assert.equal(context.calls.requests.length, 0);
});
