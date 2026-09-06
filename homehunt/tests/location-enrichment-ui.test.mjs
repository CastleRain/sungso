import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeDestinations } from '../js/commute-balance-core.mjs';
import { createCandidateLocationService } from '../js/candidate-location-service.mjs';
import { rankLocationCandidates } from '../js/location-ranking-core.mjs';
import { PYEONG_TO_M2 } from '../js/recommendation-core.mjs';

const appSource = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
function actualFunction(name) {
  const match = appSource.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Actual app function ${name} must exist`);
  return match[0];
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const located = (candidate) => ({ ...candidate, lat: 37.5, lng: 127,
  locationPrecision: 'address', mapCoordinateSource: 'address-geocode' });
const validPoint = (candidate) => Number.isFinite(candidate?.lat) && Number.isFinite(candidate?.lng);

function refineHarness(overrides = {}) {
  const state = {
    recommendationGeocodeToken: 1, recommendationLocationBusy: false,
    recommendationShowingShortlist: false, recommendationRegion: '',
    recommendationResults: [{ catalogId: 'search-A' }, { catalogId: 'search-B' }],
    shortlist: [{ catalogId: 'saved-X' }], ...overrides,
  };
  const sandbox = {
    state, $: () => ({ value: 'recommended' }), renderRecommendationResults() {},
    rankedRecommendationSource: (rows) => rows,
    candidateRegionKey: (candidate) => candidate.regionCode,
    recommendationCandidateId: (candidate) => candidate.catalogId,
    addCandidateDestinationDistances: (candidate) => candidate,
    isGeoPoint: validPoint, refreshRecommendationMapLayers: async () => {},
    candidateLocations: { enrichExactCandidates: async (rows) => ({ candidates: rows.map(located), cancelled: false }) },
  };
  vm.createContext(sandbox);
  vm.runInContext(actualFunction('refineCandidateLocations'), sandbox);
  return { state, sandbox };
}

test('switching to saved candidates during address enrichment cannot replace the shortlist with search results', async () => {
  const { state, sandbox } = refineHarness();
  const gate = deferred();
  sandbox.candidateLocations.enrichExactCandidates = async (rows) => {
    const enriched = rows.map(located);
    await gate.promise;
    return { candidates: enriched, cancelled: false };
  };
  const pending = sandbox.refineCandidateLocations();
  state.recommendationShowingShortlist = true;
  gate.resolve();
  await pending;
  assert.deepEqual(state.shortlist, [{ catalogId: 'saved-X' }]);
  assert.ok(state.recommendationResults.every(validPoint));
});

test('address completion preserves saved-candidate removal, additions, notes and fresh route verification', async () => {
  const { state, sandbox } = refineHarness({ recommendationShowingShortlist: true,
    shortlist: [{ catalogId: 'A', memo: 'before' }, { catalogId: 'removed' }] });
  const gate = deferred();
  sandbox.candidateLocations.enrichExactCandidates = async (rows) => {
    const enriched = rows.map(located);
    await gate.promise;
    return { candidates: enriched, cancelled: false };
  };
  const pending = sandbox.refineCandidateLocations();
  const freshVerification = { stage: 'final', provider: 'tmap' };
  state.shortlist = [{ catalogId: 'A', memo: 'edited while loading', commuteVerification: freshVerification }, { catalogId: 'new' }];
  gate.resolve();
  await pending;
  assert.deepEqual(state.shortlist.map((candidate) => candidate.catalogId), ['A', 'new']);
  assert.equal(state.shortlist[0].memo, 'edited while loading');
  assert.deepEqual(state.shortlist[0].commuteVerification, freshVerification);
  assert.equal(state.shortlist[0].lat, 37.5);
  assert.equal(state.shortlist[1].lat, undefined);
});

test('a stale initial address pass cannot touch loading state or supersede the active service request', async () => {
  const { state, sandbox } = refineHarness({ recommendationGeocodeToken: 2, recommendationLocationStatus: 'new search' });
  let calls = 0;
  sandbox.candidateLocations.enrichExactCandidates = async () => { calls += 1; return { candidates: [], cancelled: true }; };
  await sandbox.refineCandidateLocations({ token: 1, initial: true });
  assert.equal(calls, 0);
  assert.equal(state.recommendationLocationBusy, false);
  assert.equal(state.recommendationLocationStatus, 'new search');
});

test('explicit location refinement sends only the selected region and its 20-candidate limit', async () => {
  const rows = [{ catalogId: 'A', regionCode: '11110' }, { catalogId: 'B', regionCode: '41135' }, { catalogId: 'C', regionCode: '41135' }];
  const { state, sandbox } = refineHarness({ recommendationRegion: '41135', recommendationResults: rows });
  let requested;
  sandbox.candidateLocations.enrichExactCandidates = async (candidates, options) => {
    requested = { ids: candidates.map((candidate) => candidate.catalogId), limit: options.limit };
    return { candidates: candidates.map(located), cancelled: false };
  };
  await sandbox.refineCandidateLocations();
  assert.deepEqual(requested, { ids: ['B', 'C'], limit: 20 });
  assert.equal(state.recommendationResults[0].lat, undefined);
  assert.ok(state.recommendationResults.slice(1).every(validPoint));
});

test('an older map refresh cannot restore another region after a layer change, and pending fit is retained', async () => {
  const gate = deferred();
  const started = deferred();
  let supply = true;
  let shown = [];
  let fits = 0;
  const state = { recommendationRunning: false, recommendationMeta: {},
    recommendationResults: [{ catalogId: 'A', regionCode: 'A' }, { catalogId: 'B', regionCode: 'B' }],
    recommendationRegion: 'A', recommendationMapMode: 'apartments', workplaces: [] };
  const map = {
    setCandidateRecords: (rows) => { shown = rows.map((candidate) => candidate.catalogId); },
    setRegionRecords() {}, setContextRecords() {}, setDestinations() {}, fitCandidateRecords() { fits += 1; },
  };
  const sandbox = {
    state, recommendationMapRefreshToken: 0, recommendationMapFitPending: false,
    ensureRecommendationMap: async () => map,
    recommendationLayerState: () => ({ apartments: true, supply, workplaces: true }),
    ensureSupplyMapLocations: () => { started.resolve(); return gate.promise; },
    ensureRecommendationCatalogPreview: async () => {},
    recommendationResultRecords: () => state.recommendationResults.filter((candidate) => candidate.regionCode === state.recommendationRegion),
    recommendationMapCandidates: (rows) => rows, shortlistHas: () => false,
    recommendationMapContextRecords: () => [], normalizeDestinations: (destinations) => destinations,
    candidateRegionGroups: () => [], sortedRecommendationResults: () => [], selectRecommendationRegion() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(actualFunction('refreshRecommendationMapLayers'), sandbox);
  const older = sandbox.refreshRecommendationMapLayers({ fit: true, candidateOverride: [state.recommendationResults[0]] });
  await started.promise;
  state.recommendationRegion = 'B';
  supply = false;
  await sandbox.refreshRecommendationMapLayers({ candidateOverride: [state.recommendationResults[1]] });
  assert.deepEqual(shown, ['B']);
  gate.resolve();
  await older;
  assert.deepEqual(shown, ['B']);
  assert.equal(fits, 1);
});

test('district reference completion preserves newer apartment coordinates, route results and candidate fields', async () => {
  const gate = deferred();
  const started = deferred();
  const state = { recommendationGeocodeToken: 0, recommendationResults: [{ catalogId: 'A', name: 'before' }] };
  const sandbox = {
    state, REGIONS: [], renderRecommendationResults() {},
    loadLawDistricts: async () => ({ districts: [] }), loadRailStationData: async () => {}, ensureRecommendationMap: async () => ({}),
    recommendationCandidateId: (candidate) => candidate.catalogId,
    candidateLocations: { enrichDistrictReferences: async (rows) => {
      const enriched = rows.map((candidate) => ({ ...candidate, locationReference: { lat: 37.5, lng: 127, precision: 'district' } }));
      started.resolve();
      await gate.promise;
      return { candidates: enriched, cancelled: false };
    } },
    refreshRecommendationMapLayers: async () => {}, refineCandidateLocations: async () => {},
    hideRecommendationMapStatus() {}, fetchCommuteQuota() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(actualFunction('enrichRecommendationMapAndCommute'), sandbox);
  const pending = sandbox.enrichRecommendationMapAndCommute({});
  await started.promise;
  state.recommendationResults = [{ catalogId: 'A', name: 'newer', lat: 37.6, lng: 127.1, commuteVerification: { stage: 'final' } }];
  gate.resolve();
  await pending;
  assert.equal(state.recommendationResults[0].name, 'newer');
  assert.equal(state.recommendationResults[0].lat, 37.6);
  assert.equal(state.recommendationResults[0].commuteVerification.stage, 'final');
  assert.equal(state.recommendationResults[0].locationReference.precision, 'district');
});

test('without workplaces, default commute time does not block price search, location enrichment or ranking', async () => {
  const values = {
    recommendCommuteMode: 'transit', recommendCommuteMax: '60', recommendMaxAge: '20',
    recommendDepartureTime: '08:00', recommendQuery: '테스트 검색', recommendHouseholds: '500',
    recommendHouseholdsOperator: 'gte', recommendPriceOperator: 'lte', recommendMinArea: '20',
    recommendAreaOperator: 'gte', recommendStationMin: '0', recommendStationMax: '0', recommendMonths: '3',
    recommendationSort: 'recommended', recommendationCommuteScope: 'matched',
  };
  const nodes = new Map();
  const $ = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { value: values[selector.replace(/^#/, '')] || '',
      checked: ['#recommendSeoul', '#recommendGyeonggi'].includes(selector), textContent: '',
      classList: { add() {}, remove() {}, toggle() {} }, replaceChildren() {} });
    return nodes.get(selector);
  };
  const state = { workplaces: [], recommendationGeocodeToken: 0, recommendationResults: [], shortlist: [],
    recommendationRunning: false, localMarketOutdated: false, railStations: [], gangnamAnchor: null };
  const candidates = [
    { catalogId: 'far', regionCode: '41135', regionName: '테스트 먼 지역', name: '먼 후보', address: '테스트 먼 주소 1' },
    { catalogId: 'near', regionCode: '11110', regionName: '테스트 가까운 지역', name: '가까운 후보', address: '테스트 가까운 주소 1' },
  ].map((candidate) => ({ ...candidate, households: 700, builtYear: 2020,
    bestArea: { areaM2: 84, averagePriceManWon: 50000 } }));
  const calls = [];
  const geocodeCalls = [];
  const statuses = [];
  let savedFilters;
  let rendered = [];
  const sandbox = {
    $, state, recommendationRunToken: 0, locationRankingCache: null,
    APP_CONFIG: { recommendationUrl: 'fixture:recommendations', localApiContractVersion: 'fixture' },
    window: { clearTimeout() {}, setTimeout() { throw Error('Fixture job should complete without polling timer'); } },
    structuredClone, normalizeDestinations, PYEONG_TO_M2, rankLocationCandidates,
    readRecommendationPriceParts: () => ({ valid: true }), readRecommendationPriceManWon: () => 60000,
    updateRecommendationPriceLabel() {}, hideRecommendationMapStatus() {}, setRecommendationPanel() {},
    recommendationMap: { clearCandidateMarkers() {} }, isGeoPoint: validPoint,
    recommendationCandidateId: (candidate) => candidate.catalogId,
    candidateRegionKey: (candidate) => candidate.regionCode,
    addCandidateDestinationDistances: (candidate) => candidate,
    saveRecommendationFilters: (filters) => { savedFilters = structuredClone(filters); },
    renderRecommendationChips() {}, recommendationChipLabels: () => [],
    checkLocalMarketConnection: async () => ({ ok: true, keyConfigured: true }),
    openLocalKeyModal() { throw Error('Connected fixture should not open key setup'); },
    setRecommendationStatus: (...status) => statuses.push(status),
    recommendationJobUrl: (id) => `fixture:recommendations/${id}`,
    fetch: async (url, options = {}) => {
      calls.push({ url, ...options });
      if (url === 'fixture:recommendations' && options.method === 'POST') {
        return { ok: true, json: async () => ({ jobId: 'job-1' }) };
      }
      assert.equal(url, 'fixture:recommendations/job-1', 'No real or route API may run');
      return { ok: true, json: async () => ({ status: 'complete', results: candidates,
        baseCandidateCount: candidates.length, totalResultCount: candidates.length }) };
    },
    renderRecommendationResults: () => { rendered = sandbox.sortedRecommendationResults(); },
    filterRecommendationByCommute() { throw Error('No workplace must not filter candidates by a commute verdict'); },
    REGIONS: [{ code: '11110', center: [37.5, 127] }, { code: '41135', center: [37.2, 127] }],
    loadLawDistricts: async () => ({ districts: [{ code: '11110', name: '테스트 가까운 지역' }, { code: '41135', name: '테스트 먼 지역' }] }),
    loadRailStationData: async () => {
      state.gangnamAnchor = { lat: 37.5, lng: 127 };
      state.railStations = [{ id: 'fixture-station', name: '테스트', lat: 37.501, lng: 127 }];
    },
    ensureRecommendationMap: async () => ({}), refreshRecommendationMapLayers: async () => {}, fetchCommuteQuota() {},
    candidateLocations: createCandidateLocationService({ geocode: async (address) => {
      geocodeCalls.push(address);
      return { lat: address.includes('가까운') ? 37.5 : 37.2, lng: 127 };
    } }),
  };
  vm.createContext(sandbox);
  for (const name of ['boundedNumber', 'readRecommendationForm', 'rankedRecommendationSource',
    'sortedRecommendationResults', 'refineCandidateLocations', 'enrichRecommendationMapAndCommute',
    'pollRecommendationJob', 'runRecommendation']) vm.runInContext(actualFunction(name), sandbox);
  // The app intentionally dispatches these asynchronously; retain the actual
  // functions and observe their promises without modifying the task's behavior.
  const poll = sandbox.pollRecommendationJob;
  const enrich = sandbox.enrichRecommendationMapAndCommute;
  let pollPromise;
  let enrichmentPromise;
  sandbox.pollRecommendationJob = (...args) => (pollPromise = poll(...args));
  sandbox.enrichRecommendationMapAndCommute = (...args) => (enrichmentPromise = enrich(...args));
  await sandbox.runRecommendation();
  await pollPromise;
  await enrichmentPromise;
  assert.equal(calls.length, 2, 'Only fixture price-job creation and completion requests are expected');
  assert.equal(statuses.some(([kind]) => kind === 'error'), false);
  assert.equal(state.recommendationResults.length, 2);
  assert.equal(savedFilters.commuteMaxMinutes, 60, 'Default time need not be manually set to zero');
  assert.equal(savedFilters.destinations.length, 0);
  assert.equal(state.recommendationRunSnapshot.destinations.length, 0);
  assert.equal(state.recommendationRunning, false);
  assert.equal(state.recommendationLocationBusy, false);
  assert.equal(geocodeCalls.length, 2);
  assert.equal(rendered[0].catalogId, 'near');
  assert.equal(rendered.every((candidate) => candidate.locationRecommendation.rankingEligible), true);
  assert.deepEqual(state.workplaces, []);
  for (const [id, value] of Object.entries(values).filter(([id]) => id.startsWith('recommend') && !id.startsWith('recommendation'))) {
    assert.equal($(`#${id}`).value, value, `Search must preserve the ${id} input`);
  }
  const body = JSON.parse(calls[0].body);
  assert.equal('destinations' in body, false);
  assert.equal('companyAddress' in body, false);
  // Even a previously selected scope cannot hide price candidates when there
  // are no destinations to evaluate.
  $('#recommendationCommuteScope').value = 'matched';
  assert.equal(sandbox.sortedRecommendationResults().length, 2);
});
