import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { isGeoPoint } from '../js/transport-core.mjs';
import { normalizeDestinations, evaluateCommuteBalance } from '../js/commute-balance-core.mjs';
import { rankPersonalizedCandidates } from '../js/personalized-ranking-core.mjs';
import {
  candidateVerificationStatus, destinationFingerprint, originFingerprint,
  selectedCommuteProvider, recentCommuteAttempt, commuteAttemptKey,
} from '../js/recommendation-verification-core.mjs';

const source = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const actual = name => {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Actual app function ${name} exists`);
  return match[0];
};
const destinations = normalizeDestinations([{ id: 'test-office', label: '가상 회사', lat: 37.5, lng: 127,
  weightPercent: 100, maxMinutes: 60, modes: ['transit'], departureTime: '08:00', preferSubway: true }]);
const house = (id, minutes = null, options = {}) => {
  const result = { catalogId: id, name: `가상 후보 ${id}`, address: '테스트 단지 주소', regionCode: '11650',
    lat: 37.4, lng: 127.01, builtYear: 2015, households: 1000, priceVerified: true,
    bestArea: { areaM2: 59.9, averagePriceManWon: 58000, count: 6 }, ...options };
  if (minutes !== null) {
    const now = new Date().toISOString();
    result.routesByDestination = { 'test-office': [{ provider: 'kakao', mode: 'transit', verified: true,
      durationMinutes: minutes, walkingMinutes: 4, transferCount: 0, transitComposition: 'subway', queriedAt: now }] };
    result.commuteBalance = evaluateCommuteBalance(result, destinations);
    result.commuteVerification = { stage: 'final', provider: 'kakao', verifiedAt: now,
      destinationFingerprint: destinationFingerprint(destinations), originFingerprint: originFingerprint(result) };
  }
  return result;
};
const ids = rows => Array.from(rows || [], row => row.catalogId);

function harness(results = []) {
  const nodes = new Map();
  const $ = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { value: '', hidden: false, textContent: '',
      dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {}, querySelector: child => $(`${selector}/${child}`) });
    return nodes.get(selector);
  };
  $('#recommendationSort').value = 'recommended';
  $('#recommendationCommuteScope').value = 'all';
  const filters = { destinations: structuredClone(destinations), targetPriceManWon: 60000, maxOverBudgetPct: 10,
    commuteMaxMinutes: 60, minParkingRatio: 1, requireParking: true, excludeFar: true };
  const state = { currentView: 'recommend', recommendationMapScope: 'all', recommendationMapMode: 'apartments',
    recommendationResults: results, recommendationShowingShortlist: false, recommendationRegion: '',
    recommendationRunSnapshot: { filters, destinations: filters.destinations }, recommendationMeta: {},
    recommendationRunning: false, recommendationVisibleCount: 50, shortlist: [], visits: [],
    commuteAttempts: new Map(), transportConfig: { transitProviderPreference: 'kakao', providers: { kakaoTransitConfigured: true } },
    supplyFeed: { notices: [] }, recommendationCatalogPreview: [] };
  const layers = { apartments: true, supply: true, visits: true, shortlist: true, workplaces: true };
  const calls = { renders: 0, supply: 0, preview: 0, contexts: 0, routes: 0, saved: 0, layerWrites: 0, fits: [] };
  const shown = { candidates: [], regions: [], context: [], destinations: [] };
  const map = { setCandidateRecords: rows => { shown.candidates = rows; },
    setRegionRecords: rows => { shown.regions = rows; }, setContextRecords: rows => { shown.context = rows; },
    setDestinations: rows => { shown.destinations = rows; }, fitCandidateRecords: (...args) => calls.fits.push(args) };
  const noCall = () => { calls.routes++; throw Error('A view-only toggle must not request data'); };
  const sandbox = { state, $, isGeoPoint, selectedCommuteProvider, recentCommuteAttempt, decisionWorkspace: null,
    destinationFingerprint, candidateVerificationStatus,
    recommendationMapRefreshToken: 0, recommendationMapFitPending: false,
    activeRecommendationDestinations: () => filters.destinations,
    readRecommendationForm: () => filters,
    recommendationCandidateId: candidate => String(candidate.catalogId || candidate.id || ''),
    rankedRecommendationSource: rows => rankPersonalizedCandidates(rows, { ...filters, destinations: filters.destinations }),
    candidateRegionKey: candidate => candidate.regionCode,
    candidateAveragePrice: candidate => candidate.bestArea?.averagePriceManWon ?? Infinity,
    shortlistHas: candidate => state.shortlist.some(row => row.catalogId === candidate.catalogId),
    recommendationLayerState: () => ({ ...layers }),
    activateRecommendationLayer: layer => { layers[layer] = true; calls.layerWrites++; },
    ensureRecommendationMap: async () => map,
    ensureSupplyMapLocations: async () => { calls.supply++; },
    ensureRecommendationCatalogPreview: async () => { calls.preview++; },
    supplyMapRecord: candidate => ({ ...candidate, mapLayer: 'supply' }),
    candidateRegionGroups: () => [{ key: 'test-region', count: 11 }], selectRecommendationRegion() {},
    renderRecommendationResults: () => { calls.renders++; },
    setView: view => { state.currentView = view; }, setRecommendationPanel() {}, showToast() {},
    renderRecommendationMapScope() {}, renderRecommendationMapScopeControl() {}, renderRecommendationMapScopeControls() {},
    saveShortlist: () => { calls.saved++; }, saveRecommendationFilters: () => { calls.saved++; },
    geocodeLocally: noCall, fetch: noCall, fetchCommuteQuota: noCall,
    hhUI: { setLayer() { calls.layerWrites++; }, set() {} },
    window: { matchMedia: () => ({ matches: false }), requestAnimationFrame() {} },
  };
  vm.createContext(sandbox);
  for (const name of ['recommendationVerificationStatus', 'candidateCommuteDecision', 'candidateReviewLiveSource',
    'currentMatchedMapCandidates', 'sortedRecommendationResults', 'filterRecommendationByCommute',
    'recommendationMapCandidates', 'recommendationResultRecords', 'recommendationMapContextRecords',
    'refreshRecommendationMapLayers', 'setRecommendationMapScope']) vm.runInContext(actual(name), sandbox);
  return { state, filters, layers, calls, shown, map, sandbox, $ };
}

test('eleven verified live homes appear without interest saving while pending, excluded and stale routes remain out', () => {
  const matched = Array.from({ length: 11 }, (_, i) => house(`matched-${i}`, 25 + i));
  const stale = house('expired', 25); stale.commuteVerification.stale = true;
  const { sandbox, state } = harness([...matched, house('pending'), house('over-time', 90), stale]);
  const result = sandbox.currentMatchedMapCandidates();
  assert.equal(result.length, 11);
  assert.deepEqual(new Set(ids(result)), new Set(ids(matched)));
  assert.equal(state.shortlist.length, 0);
});

test('saved-only homes need a real current-view attempt to join the verified map source', () => {
  const { sandbox, state, filters } = harness([house('live', 25)]);
  const checked = house('checked-saved', 30), old = house('old-bookmark-verdict', 35, { lat: 37.41 });
  state.shortlist = [checked, old];
  state.commuteAttempts.set(commuteAttemptKey(checked, filters.destinations, 'kakao'), { checkedAt: new Date().toISOString() });
  assert.deepEqual(new Set(ids(sandbox.currentMatchedMapCandidates())), new Set(['live', 'checked-saved']));
});

test('opening the verified map clears regional and shortlist context without writing layer preferences or saved records', async () => {
  const context = harness([house('matched', 30)]);
  const { sandbox, state, layers, calls, $ } = context;
  state.recommendationRegion = 'another-region'; state.recommendationShowingShortlist = true;
  state.recommendationMapMode = 'regions'; layers.apartments = false;
  const before = structuredClone(layers);
  await sandbox.setRecommendationMapScope('matched');
  assert.equal(state.recommendationMapScope, 'matched');
  assert.equal(state.recommendationRegion, '');
  assert.equal(state.recommendationShowingShortlist, false);
  assert.equal(state.recommendationMapMode, 'apartments');
  assert.equal($('#recommendationCommuteScope').value, 'matched');
  assert.deepEqual(layers, before);
  assert.equal(calls.routes, 0); assert.equal(calls.saved, 0); assert.equal(calls.layerWrites, 0);
});

test('verified map ignores the disabled apartment layer, region mode, and every unrelated context pin', async () => {
  const { sandbox, state, layers, calls, shown } = harness([house('matched', 30), house('pending')]);
  state.recommendationMapScope = 'matched'; state.recommendationMapMode = 'regions'; layers.apartments = false;
  state.visits = [{ id: 'visit', lat: 37.2, lng: 127.1 }];
  state.shortlist = [house('saved-unverified')];
  state.supplyFeed.notices = [{ id: 'supply', lat: 37.3, lng: 127.1 }];
  await sandbox.refreshRecommendationMapLayers({ fit: true });
  assert.deepEqual(ids(shown.candidates), ['matched']);
  assert.equal(shown.context.length, 0); assert.equal(shown.regions.length, 0);
  assert.equal(shown.destinations.length, 1);
  assert.equal(calls.supply, 0); assert.equal(calls.preview, 0);
  assert.equal(calls.fits.length, 1);
  assert.ok(calls.fits[0].length === 0 || calls.fits[0][0] == null || calls.fits[0][0].length === 0,
    'Focus fits the current homes without expanding bounds to distant offices');
});

test('an unverified override from another map action cannot leak into the verified map', async () => {
  const { sandbox, state, shown } = harness([house('matched', 30), house('pending')]);
  state.recommendationMapScope = 'matched';
  await sandbox.refreshRecommendationMapLayers({ candidateOverride: [house('unknown-override')] });
  assert.deepEqual(ids(shown.candidates), ['matched']);
});

test('zero current matches produces an empty map and never falls back to favorites or sample apartments', async () => {
  const { sandbox, state, shown, calls } = harness([house('pending')]);
  state.recommendationMapScope = 'matched'; state.shortlist = [house('saved')];
  state.recommendationCatalogPreview = [house('sample')];
  await sandbox.refreshRecommendationMapLayers();
  assert.equal(shown.candidates.length, 0); assert.equal(shown.regions.length, 0); assert.equal(shown.context.length, 0);
  assert.equal(calls.preview, 0); assert.equal(calls.routes, 0);
});

test('returning to all prices activates apartment pins and preserves other layer preferences without another lookup', async () => {
  const { sandbox, state, layers, shown, calls, $ } = harness([house('matched', 30), house('pending')]);
  layers.apartments = false; layers.visits = true; layers.shortlist = false; layers.supply = false;
  state.visits = [{ id: 'visit', lat: 37.2, lng: 127.1 }];
  const before = structuredClone(layers);
  await sandbox.setRecommendationMapScope('matched');
  await sandbox.setRecommendationMapScope('all');
  await sandbox.refreshRecommendationMapLayers();
  assert.equal(state.recommendationMapScope, 'all');
  assert.equal($('#recommendationCommuteScope').value, 'all');
  assert.deepEqual(layers, { ...before, apartments: true });
  assert.deepEqual(new Set(ids(shown.candidates)), new Set(['matched', 'pending']));
  assert.equal(shown.context.length, 1); assert.equal(shown.context[0].mapLayer, 'visits');
  assert.equal(calls.routes, 0); assert.equal(calls.saved, 0); assert.equal(calls.layerWrites, 1);
});

test('the matched map changes default display scope without removing the explicit pending verification pool', () => {
  const { sandbox, state } = harness([house('matched', 30), house('pending')]);
  state.recommendationMapScope = 'matched';
  assert.deepEqual(ids(sandbox.sortedRecommendationResults()), ['matched']);
  assert.deepEqual(ids(sandbox.sortedRecommendationResults({ scope: 'pending' })), ['pending']);
});

test('a changed office invalidates displayed matches immediately without requesting routes or saving a pass', async () => {
  const { sandbox, state, filters, shown, calls } = harness([house('matched', 30)]);
  state.recommendationMapScope = 'matched';
  assert.equal(sandbox.currentMatchedMapCandidates().length, 1);
  filters.destinations = normalizeDestinations([{ ...destinations[0], lat: 37.6 }]);
  await sandbox.refreshRecommendationMapLayers();
  assert.equal(shown.candidates.length, 0);
  assert.equal(calls.routes, 0); assert.equal(calls.saved, 0);
});

test('a late ordinary refresh cannot restore supply or pending pins after verified mode is opened', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let began;
  const started = new Promise(resolve => { began = resolve; });
  const { sandbox, state, shown } = harness([house('matched', 30), house('pending')]);
  sandbox.ensureSupplyMapLocations = async () => { began(); await gate; };
  const old = sandbox.refreshRecommendationMapLayers();
  await started;
  state.recommendationMapScope = 'matched';
  await sandbox.refreshRecommendationMapLayers();
  release();
  await old;
  assert.deepEqual(ids(shown.candidates), ['matched']);
  assert.equal(shown.context.length, 0);
});
