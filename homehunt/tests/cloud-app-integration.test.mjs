import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeCloudSnapshot, CloudSnapshotError } from '../js/cloud-snapshot-core.mjs';
import { effectiveRecommendationDestinations } from '../js/personalized-context-core.mjs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
const actualFunction = name => {
  const match = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, name); return match[0];
};
const safe = value => normalizeCloudSnapshot(JSON.parse(JSON.stringify(value)));

function configFor(hostname, api) {
  const context = vm.createContext({ window: { location: { hostname } } });
  const declaration = /const CLOUD_API_BASE_URL = (['"])[^'"\r\n]*\1;/;
  assert.match(config, declaration, 'The active endpoint declaration can be explicitly replaced by a fixture');
  const source = (api === undefined ? config : config.replace(declaration, () => `const CLOUD_API_BASE_URL = ${JSON.stringify(api)};`))
    .replaceAll('export ', '');
  return vm.runInContext(`${source}\nAPP_CONFIG`, context);
}

test('Pages enables private Firebase storage while undeployed search endpoints remain disabled', () => {
  const value = configFor('castlerain.github.io', '');
  assert.equal(value.cloudStorageEnabled, true);
  assert.equal(value.firebaseConfig.projectId, 'sungso-358cb');
  assert.equal(value.isLocalRuntime, false);
  assert.equal(value.cloudApiBaseUrl, '');
  assert.equal(value.localMarketEnabled, false);
  assert.equal(value.apartmentHistoryEnabled, false);
  for (const field of ['recommendationUrl', 'commuteUrl', 'commuteBatchUrl', 'commuteQuotaUrl', 'placeSearchUrl', 'localMarketHealthUrl', 'officialComplexUrl']) assert.equal(value[field], '');
});

test('localhost keeps working independently of Firebase authentication and remote API configuration', () => {
  const value = configFor('localhost', 'https://deployed.example.test/api');
  assert.equal(value.isLocalRuntime, true);
  assert.equal(value.localMarketEnabled, true);
  assert.equal(value.recommendationUrl, 'http://127.0.0.1:8787/api/recommendations');
  assert.equal(value.localMarketConfigUrl, 'http://127.0.0.1:8787/api/config');
  assert.equal(value.officialComplexUrl, 'http://127.0.0.1:8787/api/kapt/complex');
});

test('a deployed cloud API activates all search endpoints without exposing the key configuration endpoint', () => {
  const value = configFor('castlerain.github.io', 'https://deployed.example.test/api');
  for (const field of ['recommendationUrl', 'commuteUrl', 'commuteBatchUrl', 'commuteQuotaUrl', 'placeSearchUrl', 'localMarketHealthUrl', 'apartmentHistoryUrl', 'officialComplexUrl']) assert.ok(value[field].startsWith('https://deployed.example.test/api/'));
  assert.equal(value.localMarketConfigUrl, '');
  assert.equal(value.apartmentHistoryEnabled, true);
  assert.equal(value.supplyFeedUrl, './data/home-supply.json');
});

test('the shipped Pages configuration uses the verified Render API while localhost keeps its independent server', () => {
  const value = configFor('castlerain.github.io');
  const base = 'https://sungso-homehunt-api.onrender.com/api';
  assert.equal(value.cloudApiBaseUrl, base);
  assert.equal(value.localMarketEnabled, true);
  assert.equal(value.apartmentHistoryEnabled, true);
  for (const [field, route] of Object.entries({ recommendationUrl: '/recommendations', commuteUrl: '/commute',
    commuteBatchUrl: '/commute/batch', commuteQuotaUrl: '/commute/quota', placeSearchUrl: '/place-search',
    localMarketHealthUrl: '/health', apartmentHistoryUrl: '/apartment-history', officialComplexUrl: '/kapt/complex' })) {
    assert.equal(value[field], `${base}${route}`);
  }
  assert.equal(value.localMarketConfigUrl, '');
  assert.equal(value.supplyFeedUrl, './data/home-supply.json');
  assert.equal(value.cloudStorageEnabled, true);
  for (const hostname of ['localhost', '127.0.0.1']) {
    const local = configFor(hostname);
    assert.equal(local.isLocalRuntime, true);
    assert.equal(local.apartmentHistoryUrl, 'http://127.0.0.1:8787/api/apartment-history');
    assert.equal(local.officialComplexUrl, 'http://127.0.0.1:8787/api/kapt/complex');
    assert.equal(local.localMarketConfigUrl, 'http://127.0.0.1:8787/api/config');
  }
});

test('the actual app fetch boundary forwards only matching cloud API URLs to the token helper', async () => {
  const calls = [];
  const sandbox = { URL, APP_CONFIG: { cloudApiBaseUrl: 'https://api.example.test/api' },
    window: { location: { href: 'https://castlerain.github.io/sungso/homehunt/' } },
    cloudSession: { apiFetch: async url => { calls.push(['authenticated', url]); } },
    nativeFetch: async url => { calls.push(['plain', String(url)]); },
  };
  const source = app.match(/const fetch = \(input, options\) => \{[^]*?\n\};/)[0];
  vm.createContext(sandbox); vm.runInContext(`${source}\nthis.testFetch = fetch;`, sandbox);
  await sandbox.testFetch('https://api.example.test/api/commute/quota');
  await sandbox.testFetch(new URL('https://api.example.test/api/apartment-history?months=12'));
  await sandbox.testFetch('./data/home-supply.json');
  await sandbox.testFetch('https://firestore.googleapis.com/v1/projects/test');
  await sandbox.testFetch('https://api.example.test/api-other');
  assert.deepEqual(calls.map(item => item[0]), ['authenticated', 'authenticated', 'plain', 'plain', 'plain']);
});

function restoreHarness({ failAt = '' } = {}) {
  const keys = ['homehunt_visits_v1', 'homehunt_shortlist_v1', 'homehunt_compare_ids_v1',
    'homehunt_recommendation_filters_v1', 'homehunt_supply_favorites_v1', 'homehunt_parking_observations_v1'];
  const saved = new Map(keys.map(key => [key, JSON.stringify({ previous: key })]));
  let failed = false; let cancellations = 0; let renders = 0;
  const state = { visits: [{ id: 'previous' }], shortlist: [],
    recommendationResults: [{ routesByDestination: { provider: 'kakao' }, score: 99 }],
    recommendationGeocodeToken: 4, commuteAttempts: new Map([['old', 1]]),
    recommendationRunning: true, recommendationMapReady: false, visitBenchmarks: new Map([['old', {}]]) };
  const nodes = new Map();
  const storage = {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => { if (key === failAt && !failed) { failed = true; throw new Error('quota'); } saved.set(key, value); },
    removeItem: key => saved.delete(key),
  };
  const write = key => value => storage.setItem(key, JSON.stringify(value));
  const sandbox = {
    normalizeCloudSnapshot: safe, CloudSnapshotError, state, localStorage: storage,
    saveVisits: write(keys[0]), saveShortlist: write(keys[1]), saveCompareIds: write(keys[2]),
    saveRecommendationFilters: write(keys[3]), saveSupplyFavorites: write(keys[4]),
    cancelRecommendation: async () => { cancellations += 1; state.recommendationRunning = false; },
    recommendationMapRefreshToken: 1, companyGeocodeToken: 1, companyPickerSearchToken: 1, companyPickerClickToken: 1,
    locationRankingCache: {}, recommendationMap: { clearCandidateMarkers() {} },
    $: selector => { if (!nodes.has(selector)) nodes.set(selector, { value: selector === '#recommendBudgetSource' ? 'manual' : '' }); return nodes.get(selector); },
    restoreRecommendationForm: () => { state.workplaces = JSON.parse(saved.get(keys[3])).workplaces; },
    readRecommendationForm: () => ({ destinations: state.workplaces }), lastRecommendationDestinations: [],
    updateTargetPriceConnection() {}, wecostTargetPriceService: { refresh: async () => {} },
    renderAllVisits: () => { renders += 1; }, renderSupplyUnreadBadge() {}, renderSupply() {}, renderRecommendationResults() {},
    decisionWorkspace: { render() {} }, setRecommendationStatus() {}, refreshRecommendationMapLayers: async () => {},
  };
  vm.createContext(sandbox); vm.runInContext(actualFunction('applyCloudSnapshot'), sandbox);
  return { saved, state, sandbox, get cancellations() { return cancellations; }, get renders() { return renders; } };
}

const incoming = () => ({ visits: [{ id: 'new-visit', name: '내 기록', address: '주소', memo: '메모' }],
  recommendationFilters: { targetPriceManWon: 60000, budgetSource: 'manual', workplaces: [{
    id: 'company-a', label: '회사 A', address: '저장한 회사 주소', weightPercent: 40, weightSource: 'explicit-percent',
    lat: 37.4, lng: 127.1, source: 'naver', required: false, individualMaxMinutes: 60,
  }] }, shortlist: [{ id: 'favorite-a', catalogId: 'favorite-a', name: '관심 단지', routes: [{ provider: 'kakao', durationMinutes: 30 }] }],
  parkingObservations: { 'favorite-a': { sourceType: 'field', spacesPerHousehold: 1.2 } },
});

test('explicit cloud restore cancels old work, clears route results and retains unresolved company inputs', async () => {
  const h = restoreHarness();
  await h.sandbox.applyCloudSnapshot(incoming());
  assert.equal(h.cancellations, 1); assert.equal(h.renders, 1);
  assert.equal(h.state.visits[0].id, 'new-visit');
  assert.equal(h.state.recommendationResults.length, 0);
  assert.equal(h.state.commuteAttempts.size, 0); assert.equal(h.state.visitBenchmarks.size, 0);
  assert.equal(h.state.recommendationGeocodeToken, 5);
  assert.equal(h.state.workplaces[0].label, '회사 A');
  assert.equal(h.state.workplaces[0].weightPercent, 40);
  assert.equal(h.state.workplaces[0].required, false);
  assert.equal(h.state.workplaces[0].needsLocationResolution, true);
  assert.ok(!('lat' in h.state.workplaces[0]));
  assert.ok(!JSON.stringify([...h.saved.values()]).includes('kakao'));
  const targets = effectiveRecommendationDestinations(h.state.workplaces, { lat: 37.5, lng: 127 });
  assert.equal(targets[0].id, 'company-a', 'missing coordinates do not silently switch to default Gangnam');
  assert.equal(targets[0].hasCoordinates, false);
});

test('failed local storage restore rolls back prior values and does not clear the current UI', async () => {
  const h = restoreHarness({ failAt: 'homehunt_shortlist_v1' }); const previous = new Map(h.saved);
  await assert.rejects(h.sandbox.applyCloudSnapshot(incoming()), error => /복원하지 못했습니다/.test(error.message));
  assert.deepEqual(h.saved, previous);
  assert.equal(h.state.visits[0].id, 'previous');
  assert.equal(h.state.recommendationResults.length, 1);
  assert.equal(h.cancellations, 0); assert.equal(h.renders, 0);
});

test('the Pages search action explains missing online API before changing existing local candidates', async () => {
  const statuses = []; const state = { recommendationRunning: false, recommendationResults: [{ id: 'old-record' }] };
  const sandbox = { state, APP_CONFIG: { isLocalRuntime: false, localMarketEnabled: false, cloudApiBaseUrl: '' },
    setView() {}, $: () => ({ scrollIntoView() {} }), setRecommendationStatus: (...args) => statuses.push(args) };
  vm.createContext(sandbox); vm.runInContext(actualFunction('runRecommendation'), sandbox);
  await sandbox.runRecommendation();
  assert.equal(state.recommendationResults.length, 1);
  assert.match(statuses[0][1], /온라인 검색 서버/);
  assert.match(statuses[0][2], /Firebase 저장·복원/);
});
