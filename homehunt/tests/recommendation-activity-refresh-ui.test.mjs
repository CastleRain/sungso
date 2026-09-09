import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { mergeRetriedPriceResults } from '../js/price-coverage-core.mjs';
import { mergeSavedTransactionActivity } from '../js/candidate-review-core.mjs';
import { normalizeTransactionActivity } from '../js/transaction-activity-core.mjs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const actualFunction = name => {
  const match = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Actual app function ${name} exists`);
  return match[0];
};
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
const activity = (count = 4) => ({ version: 1, scope: 'complex-sale', status: 'complete',
  requestedMonths: ['2026-06', '2026-07', '2026-08'], monthlyCounts: [
    { month: '2026-06', count }, { month: '2026-07', count }, { month: '2026-08', count }],
  sourceUpdatedAt: '2026-09-10T00:00:00.000Z' });
const filters = { regions: ['gyeonggi'], minHouseholds: 100, householdsOperator: 'gte', maxPriceManWon: 60000,
  priceOperator: 'lte', minAreaM2: 50, areaOperator: 'gte', areaBasis: 'exclusive', maxAgeYears: 30, minBuiltYear: 1996,
  months: 3, districtCodes: ['41135', '41465'], budgetSource: 'wecost', companyAddress: 'Private office',
  destinations: [{ id: 'work', weight: 100, modes: ['transit'], lat: 37.4, lng: 127.1 }] };
const house = (id, extras = {}) => ({ catalogId: id, address: `${id} 테스트동`, name: `단지 ${id}`, regionCode: '41135',
  bestArea: { averagePriceManWon: 50000, count: 2 }, ...extras });
const freshHouse = (id, extras = {}) => house(id, { transactionActivity: activity(), ...extras });
const complete = (results, changes = {}) => ({ jobId: 'new-job', status: 'complete', stage: 'complete', results,
  resultCount: results?.length || 0, failedRequestCount: 0, partial: false, progress: { completed: 3, total: 3 },
  updatedAt: '2026-09-10T00:00:00.000Z', ...changes });

function harness({ remote = false } = {}) {
  const nodes = new Map();
  const node = (tag = 'div', className = '', textContent = '') => ({ tag, className, textContent,
    children: [], listeners: {}, hidden: false, disabled: false,
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    classList: { add() {}, remove() {}, toggle() {} } });
  const $ = (selector, parent) => {
    const key = `${parent?.key || ''}/${selector}`;
    if (!nodes.has(key)) nodes.set(key, Object.assign(node(), { key }));
    return nodes.get(key);
  };
  let form = structuredClone(filters);
  const calls = { fetch: [], renders: [], statuses: [], panels: [], enrichment: [], timers: [], savedShortlists: [] };
  const state = { recommendationJobId: 'old-job', recommendationRunning: false, recommendationRetrying: false,
    recommendationActivityRefreshing: false, recommendationActivityRefreshBackup: null,
    commuteVerificationRunning: false, recommendationLocationBusy: false, recommendationGeocodeToken: 1,
    recommendationRunSnapshot: { filters: structuredClone(filters), destinations: structuredClone(filters.destinations) },
    recommendationResults: [house('A', { lat: 37.5, lng: 127,
      routesByDestination: { work: [{ provider: 'kakao', verified: true, durationMinutes: 25 }] },
      commuteBalance: { decision: 'matched' }, commuteVerification: { provider: 'kakao', stage: 'final' },
      personalizedRecommendation: { totalScore: 90 } }), house('B')],
    recommendationMeta: { jobId: 'old-job', status: 'complete', resultCount: 2, filters: structuredClone(filters),
      updatedAt: '2026-09-09T00:00:00.000Z', partial: false, retryAvailable: false, failedRequestCount: 0 },
    recommendationRecentJob: { jobId: 'old-job', status: 'complete' },
    shortlist: [house('A', { status: '검토', memo: 'keep this note', savedAt: '2026-09-01T00:00:00.000Z' })],
    commuteAttempts: new Map([['A', { attempted: true }]]), recommendationRegion: '41135',
    recommendationMapScope: 'matched', searchDistrictCatalog: [{ regionCode: '41135', regionName: '분당구' }],
  };
  const sandbox = { state, $, structuredClone, Date, encodeURIComponent, mergeRetriedPriceResults,
    mergeSavedTransactionActivity, normalizeTransactionActivity, createElement: node,
    recommendationRunToken: 1, locationRankingCache: {}, lastRecommendationDestinations: structuredClone(filters.destinations),
    recommendationPriceCoverage: { render() {} }, decisionWorkspace: null,
    APP_CONFIG: { recommendationUrl: 'fixture:jobs', isLocalRuntime: !remote, localMarketEnabled: true,
      ...(remote ? { cloudApiBaseUrl: 'fixture:cloud' } : {}) },
    cloudSession: { getState: () => ({ status: 'signed-in' }) },
    readRecommendationForm: () => structuredClone(form),
    setRecommendationPanel: value => calls.panels.push(value),
    renderRecommendationResults: (...args) => calls.renders.push(args),
    setRecommendationStatus: (...args) => calls.statuses.push(args), hideRecommendationMapStatus() {},
    enrichRecommendationMapAndCommute: (...args) => calls.enrichment.push(args),
    reconcileCandidateRecommendationContext: candidate => ({ ...candidate, rebased: true }),
    saveRecommendationFilters() {}, saveShortlist: items => calls.savedShortlists.push(structuredClone(items)),
    scheduleRecommendationPreview() {}, refreshRecommendationMapLayers() {},
    window: { clearTimeout() {}, setTimeout(callback) { calls.timers.push(callback); return calls.timers.length; } },
    fetch: async (url, options) => { calls.fetch.push({ url, options }); throw new Error('Unexpected request'); },
  };
  vm.createContext(sandbox);
  ['priceSearchSignature', 'recommendationJobUrl', 'mergeRecommendationActivityRefreshResults',
    'refreshRecommendationActivity', 'pollRecommendationJob', 'cancelRecommendation',
    'handleRecommendationCriteriaChanged', 'renderRecommendationContinuity']
    .forEach(name => vm.runInContext(actualFunction(name), sandbox));
  return { state, sandbox, calls, $, form: () => form, setForm(value) { form = value; } };
}

test('repeated activity clicks create one public-price refresh and keep current results while pending', async () => {
  const env = harness(); const started = deferred();
  const { state, sandbox, calls } = env;
  const before = state.recommendationResults, snapshot = state.recommendationRunSnapshot;
  sandbox.fetch = async (url, options) => { calls.fetch.push({ url, options }); return started.promise; };
  const pending = sandbox.refreshRecommendationActivity();
  await sandbox.refreshRecommendationActivity();
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.fetch[0].url, 'fixture:jobs');
  const body = JSON.parse(calls.fetch[0].options.body);
  assert.equal(body.refresh, true, 'Bypass same-job reuse while reusing the server public month cache');
  assert.equal(body.preserveRecent, true, 'Keep the previous account result until a fully successful refresh replaces it');
  assert.deepEqual(body.districtCodes, filters.districtCodes);
  for (const key of ['destinations', 'companyAddress', 'budgetSource', 'lat', 'lng']) assert.equal(body[key], undefined);
  assert.equal(state.recommendationResults, before);
  assert.equal(state.recommendationRunSnapshot, snapshot);
  started.resolve(response(complete([freshHouse('A')]))); await pending; await tick();
  assert.equal(state.recommendationRunning, false);
  assert.equal(state.recommendationActivityRefreshing, false);
  assert.equal(state.recommendationRegion, '41135');
  assert.equal(state.recommendationMapScope, 'matched');
  assert.equal(state.commuteAttempts.size, 1);
  assert.equal(calls.enrichment.length, 0);
});

test('completion updates public activity and price, preserves live commute, and saves only bookmark activity', async () => {
  const { state, sandbox, calls } = harness();
  const routes = structuredClone(state.recommendationResults[0].routesByDestination);
  const saved = structuredClone(state.shortlist[0]);
  sandbox.fetch = async () => response(complete([freshHouse('A', { bestArea: { averagePriceManWon: 58000, count: 3 } }), freshHouse('C')]));
  await sandbox.refreshRecommendationActivity(); await tick();
  assert.deepEqual(plain(state.recommendationResults.map(row => row.catalogId)), ['A', 'C']);
  assert.equal(state.recommendationResults[0].bestArea.averagePriceManWon, 58000);
  assert.deepEqual(plain(state.recommendationResults[0].transactionActivity), activity());
  assert.deepEqual(plain(state.recommendationResults[0].routesByDestination), routes);
  assert.equal(state.recommendationResults[0].commuteBalance.decision, 'matched');
  assert.equal(state.recommendationResults[0].personalizedRecommendation, undefined);
  assert.deepEqual(plain(state.shortlist[0]), { ...saved, transactionActivity: activity() });
  assert.equal(calls.savedShortlists.length, 1);
  assert.equal(calls.enrichment.length, 0);
  assert.match(calls.statuses.at(-1)[2], /통근은 유지/);
  assert.doesNotMatch(calls.statuses.at(-1)[1], /통근은 확인 전/);
});

for (const stage of ['create', 'poll']) {
  test(`${stage} connection failure restores old job, result, metadata and snapshot`, async () => {
    const { state, sandbox } = harness();
    const before = { results: state.recommendationResults, meta: state.recommendationMeta,
      recent: state.recommendationRecentJob, snapshot: state.recommendationRunSnapshot };
    sandbox.fetch = async (url) => {
      if ((stage === 'create') === (url === 'fixture:jobs')) throw new Error('Fixture unavailable');
      return response({ jobId: 'new-job', status: 'running' }, 202);
    };
    await sandbox.refreshRecommendationActivity(); await tick();
    assert.equal(state.recommendationJobId, 'old-job');
    for (const [key, value] of Object.entries(before)) {
      const stateKey = { results: 'recommendationResults', meta: 'recommendationMeta', recent: 'recommendationRecentJob', snapshot: 'recommendationRunSnapshot' }[key];
      assert.equal(state[stateKey], value);
    }
    assert.equal(state.recommendationActivityRefreshing, false);
    assert.equal(state.recommendationActivityRefreshBackup, null);
    assert.equal(state.recommendationRunning, false);
  });
}

for (const payload of [complete([house('A')]), complete([]), complete([], { pendingPriceCandidates: [house('A')] }),
  { jobId: 'new-job', status: 'complete' },
  complete([null]), complete([freshHouse('A')], { pendingPriceCandidates: {} }),
  { jobId: 'new-job', status: 'cancelled' }, { jobId: 'new-job', status: 'error', error: 'Fixture failed' }]) {
  test(`invalid or stopped activity response preserves priced candidates: ${JSON.stringify(payload)}`, async () => {
    const { state, sandbox } = harness();
    const before = state.recommendationResults, meta = state.recommendationMeta;
    sandbox.fetch = async () => response(payload);
    await sandbox.refreshRecommendationActivity(); await tick();
    assert.equal(state.recommendationResults, before);
    assert.equal(state.recommendationMeta, meta);
    assert.equal(state.recommendationJobId, 'old-job');
    assert.equal(state.recommendationRunning, false);
  });
}

test('failed districts retain old priced candidates as stale while successful districts can remove nonqualifiers', async () => {
  const { state, sandbox, calls } = harness();
  state.recommendationResults.push(house('C', { regionCode: '41465' }));
  sandbox.fetch = async () => response(complete([freshHouse('A')], {
    failedRequestCount: 1, incompleteDistrictCodes: ['41135'], failedRequests: [{ lawdCd: '41135', month: '202608' }],
    pendingPriceCandidates: [freshHouse('B', { transactionActivity: { ...activity(), status: 'partial', monthlyCounts: [] },
      priceCoverage: { status: 'missing', completedMonthCount: 0, totalMonthCount: 3, missingMonths: ['202608'] } })],
  }));
  await sandbox.refreshRecommendationActivity(); await tick();
  assert.deepEqual(plain(state.recommendationResults.map(row => row.catalogId)), ['A', 'B']);
  const retained = state.recommendationResults[1];
  assert.equal(retained.bestArea.averagePriceManWon, 50000);
  assert.equal(retained.priceProvisional, true);
  assert.equal(retained.priceCoverage.status, 'stale');
  assert.equal(retained.priceCoverage.sourceUpdatedAt, '2026-09-09T00:00:00.000Z');
  assert.equal(retained.transactionActivity.status, 'stale');
  assert.equal(state.recommendationMeta.resultCount, 2);
  assert.match(calls.statuses.at(-1)[2], /이전 가격 후보 1곳은 잠정/);
});

test('total month failure without district diagnostics preserves all old priced candidates', async () => {
  const { state, sandbox } = harness();
  sandbox.fetch = async () => response(complete([], { failedRequestCount: 6,
    pendingPriceCandidates: [freshHouse('A', { transactionActivity: { ...activity(), status: 'missing', monthlyCounts: [] } })] }));
  await sandbox.refreshRecommendationActivity(); await tick();
  assert.equal(state.recommendationResults.length, 2);
  assert.ok(state.recommendationResults.every(candidate => candidate.priceProvisional));
  assert.equal(state.recommendationResults[0].commuteBalance.decision, 'matched');
});

test('a fully accounted successful empty result can remove prior candidates without inventing activity facts', async () => {
  const { state, sandbox, calls } = harness();
  sandbox.fetch = async () => response(complete([], { baseCandidateCount: 2, pendingPriceCandidates: [] }));
  await sandbox.refreshRecommendationActivity(); await tick();
  assert.equal(state.recommendationResults.length, 0);
  assert.equal(state.recommendationJobId, 'new-job');
  assert.match(calls.statuses.at(-1)[1], /가격 후보 0곳/);
  assert.equal(calls.savedShortlists.length, 0, 'Existing bookmarks are still present');
});

test('bookmark storage failure does not discard newly displayed public facts or live commute', async () => {
  const { state, sandbox, calls } = harness();
  sandbox.fetch = async () => response(complete([freshHouse('A')]));
  sandbox.saveShortlist = () => { throw new Error('Fixture storage quota'); };
  await sandbox.refreshRecommendationActivity(); await tick();
  assert.equal(state.recommendationResults[0].transactionActivity.monthlyCounts[0].count, 4);
  assert.equal(state.recommendationResults[0].commuteBalance.decision, 'matched');
  assert.equal(state.recommendationJobId, 'new-job');
  assert.equal(state.recommendationRunning, false);
  assert.match(calls.statuses.at(-1)[2], /관심 후보 저장에 실패/);
});

for (const remote of [false, true]) {
  test(`cancelling a pending create keeps prior job and ignores late reply (${remote ? 'cloud' : 'local'})`, async () => {
    const { state, sandbox, calls } = harness({ remote });
    const started = deferred(); const before = state.recommendationResults;
    sandbox.fetch = async (url, options) => { calls.fetch.push({ url, options });
      return options.method === 'DELETE' ? response({}) : started.promise; };
    const pending = sandbox.refreshRecommendationActivity();
    await sandbox.cancelRecommendation();
    assert.equal(state.recommendationJobId, 'old-job');
    assert.equal(state.recommendationActivityRefreshing, false);
    assert.equal(state.recommendationResults, before);
    started.resolve(response(complete([freshHouse('C')]))); await pending; await tick();
    assert.equal(state.recommendationResults, before);
    assert.equal(state.recommendationJobId, 'old-job');
    const deletes = calls.fetch.filter(call => call.options.method === 'DELETE');
    assert.equal(deletes.length, 1);
    assert.equal(deletes[0].url, 'fixture:jobs/new-job');
  });
}

test('cloud activity cancellation deletes only its unpublished job and ignores the in-flight advance', async () => {
  const { state, sandbox, calls } = harness({ remote: true });
  const advancing = deferred(); const before = state.recommendationResults;
  sandbox.fetch = async (url, options) => { calls.fetch.push({ url, options });
    if (url.endsWith('/advance')) return advancing.promise;
    return response({ jobId: 'new-job', status: 'running' }); };
  await sandbox.refreshRecommendationActivity(); await tick();
  await sandbox.cancelRecommendation();
  assert.equal(state.recommendationJobId, 'old-job');
  assert.deepEqual(calls.fetch.filter(call => call.options.method === 'DELETE').map(call => call.url), ['fixture:jobs/new-job']);
  advancing.resolve(response(complete([freshHouse('C')]))); await tick();
  assert.equal(state.recommendationResults, before);
  assert.equal(state.recommendationJobId, 'old-job');
});

test('ordinary shared cloud job cancellation still detaches without DELETE', async () => {
  const { sandbox, calls } = harness({ remote: true });
  await sandbox.cancelRecommendation();
  assert.equal(calls.fetch.length, 0);
});

test('partial cloud activity completion explains that the previous account result remains saved', async () => {
  const { sandbox, calls, state } = harness({ remote: true });
  sandbox.fetch = async () => response(complete([freshHouse('A')], { failedRequestCount: 1 }));
  await sandbox.refreshRecommendationActivity(); await tick();
  assert.equal(state.recommendationResults.length, 2);
  assert.match(calls.statuses.at(-1)[2], /계정에는 이전 검색을 유지하므로 새로고침하면 이전 가격 결과가 열립니다/);
});

test('cancelled poll cannot overwrite a later refresh even if local server returns the same job ID', async () => {
  const { state, sandbox } = harness(); const oldGet = deferred(), newGet = deferred();
  let gets = 0;
  sandbox.fetch = async (_url, options) => options.method === 'GET'
    ? (++gets === 1 ? oldGet : newGet).promise : response({ jobId: 'new-job', status: 'running' }, 202);
  await sandbox.refreshRecommendationActivity();
  await sandbox.cancelRecommendation();
  await sandbox.refreshRecommendationActivity();
  const before = state.recommendationResults;
  oldGet.resolve(response(complete([freshHouse('C')]))); await tick();
  assert.equal(state.recommendationResults, before);
  assert.equal(state.recommendationActivityRefreshing, true);
  newGet.resolve(response(complete([freshHouse('A')]))); await tick();
  assert.equal(state.recommendationResults[0].catalogId, 'A');
  assert.equal(state.recommendationActivityRefreshing, false);
});

for (const priceChanged of [false, true]) {
  test(`${priceChanged ? 'price' : 'commute'} edits cancel activity refresh and suppress its late result`, async () => {
    const env = harness(); const started = deferred();
    env.sandbox.fetch = async (_url, options) => options.method === 'DELETE' ? response({}) : started.promise;
    const pending = env.sandbox.refreshRecommendationActivity();
    env.setForm({ ...env.form(), ...(priceChanged ? { maxPriceManWon: 70000 } : { preferSubway: false }) });
    env.sandbox.handleRecommendationCriteriaChanged();
    started.resolve(response(complete([freshHouse('C')]))); await pending; await tick();
    assert.equal(env.state.recommendationActivityRefreshing, false);
    assert.equal(env.state.recommendationRunning, false);
    if (priceChanged) {
      assert.equal(env.state.recommendationResults.length, 0);
      assert.equal(env.state.recommendationMeta, null);
      assert.equal(env.state.recommendationRunSnapshot, null);
    } else {
      assert.deepEqual(plain(env.state.recommendationResults.map(row => row.catalogId)), ['A', 'B']);
      assert.equal(env.state.recommendationResults[0].rebased, true);
      assert.equal(env.state.recommendationRunSnapshot.filters.preferSubway, false);
    }
  });
}

for (const flag of ['recommendationRunning', 'commuteVerificationRunning', 'commuteAutoRunning',
  'recommendationLocationBusy', 'recommendationRestoreBusy', 'localMarketOutdated']) {
  test(`activity refresh cannot start while ${flag} is set`, async () => {
    const { state, sandbox, calls } = harness(); state[flag] = true;
    await sandbox.refreshRecommendationActivity();
    assert.equal(calls.fetch.length, 0);
    assert.equal(state.recommendationResults.length, 2);
  });
}

test('cloud login and same-price filters are checked before a refresh can create work', async () => {
  const env = harness({ remote: true });
  env.sandbox.cloudSession.getState = () => ({ status: 'signed-out' });
  await env.sandbox.refreshRecommendationActivity();
  assert.equal(env.calls.fetch.length, 0);
  env.sandbox.cloudSession.getState = () => ({ status: 'signed-in' });
  env.setForm({ ...env.form(), districtCodes: ['41465'] });
  await env.sandbox.refreshRecommendationActivity();
  assert.equal(env.calls.fetch.length, 0);
  assert.deepEqual(env.calls.panels, ['filters']);
});

function findButton(root, id) {
  return root.children.flatMap(child => typeof child === 'string' ? [] : [child, ...child.children])
    .find(child => child?.id === id);
}
for (const remote of [false, true]) {
  test(`continuity exposes missing and repeat activity actions with busy state (${remote ? 'cloud' : 'local all-region'})`, () => {
    const { state, sandbox, $ } = harness({ remote });
    state.recommendationMeta.filters.districtCodes = [];
    sandbox.renderRecommendationContinuity();
    const root = $('#recommendationSearchContinuity');
    assert.equal(root.hidden, false);
    let button = findButton(root, 'refreshRecommendationActivity');
    assert.match(button.textContent, /미확인 2곳/);
    assert.equal(button.disabled, false);
    assert.equal(typeof button.listeners.click, 'function');
    state.recommendationResults = [freshHouse('A')];
    sandbox.renderRecommendationContinuity();
    assert.equal(findButton(root, 'refreshRecommendationActivity').textContent, '매매 활발도 다시 확인');
    state.recommendationActivityRefreshing = true; state.recommendationRunning = true;
    sandbox.renderRecommendationContinuity();
    button = findButton(root, 'refreshRecommendationActivity');
    assert.equal(button.textContent, '매매 활발도 보강 중');
    assert.equal(button.disabled, true);
  });
}

test('cloud progress uses advance and explains that previously verified commute remains available', async () => {
  const { sandbox, calls, state } = harness({ remote: true });
  sandbox.fetch = async (url, options) => { calls.fetch.push({ url, options });
    return response({ jobId: 'new-job', status: 'running', progress: { completed: 1, total: 3 } }); };
  await sandbox.refreshRecommendationActivity(); await tick();
  assert.equal(calls.fetch.length, 2);
  assert.equal(calls.fetch[1].url, 'fixture:jobs/new-job/advance');
  assert.equal(calls.fetch[1].options.method, 'POST');
  assert.match(calls.statuses.at(-1)[2], /현재 확인한 통근은 유지/);
  assert.equal(state.recommendationResults[0].commuteBalance.decision, 'matched');
  assert.equal(calls.enrichment.length, 0);
});

for (const nextUid of ['member-B', null]) {
  test(`account change to ${nextUid || 'signed-out'} discards activity backup before cancellation or restoration`, async () => {
    const { sandbox, state, calls } = harness({ remote: true });
    let onAuthChange;
    let currentUid = 'member-A';
    sandbox.cloudSession.getState = () => ({ status: currentUid ? 'signed-in' : 'signed-out', user: currentUid ? { uid: currentUid } : null });
    Object.assign(sandbox, { cloudPanel: null, recommendationRestoreEpoch: 0, recommendationRecentCheckedUid: '',
      captureCloudSnapshot() {}, applyCloudSnapshot() {}, $$: () => [], showToast() {},
      mountCloudPanel(options) { onAuthChange = options.onAuthChange; return {}; },
      synchronizeOfficialComplexAuthentication() {}, checkLocalMarketConnection() {}, restoreRecentRecommendation() {},
      updateLocalConnectionUi() {}, CloudSnapshotError: Error,
    });
    vm.runInContext(actualFunction('initializeCloudConnection'), sandbox);
    sandbox.initializeCloudConnection();
    onAuthChange({ user: { uid: 'member-A' } });
    const started = deferred();
    sandbox.fetch = async (url, options) => { calls.fetch.push({ url, options }); return started.promise; };
    const pending = sandbox.refreshRecommendationActivity();
    assert.equal(state.recommendationActivityRefreshBackup.meta.jobId, 'old-job');
    currentUid = nextUid;
    onAuthChange({ user: nextUid ? { uid: nextUid } : null });
    assert.equal(state.recommendationActivityRefreshBackup, null);
    assert.equal(state.recommendationActivityRefreshing, false);
    assert.equal(state.recommendationRetrying, false);
    assert.equal(state.recommendationJobId, '');
    assert.equal(state.recommendationMeta, null);
    assert.equal(state.recommendationRecentJob, null);
    assert.equal(state.recommendationResults.length, 0);
    started.resolve(response(complete([freshHouse('A')]))); await pending; await tick();
    assert.equal(calls.fetch.filter(call => call.options.method === 'DELETE').length, 0, 'Never cancel the former account job using the new session credentials');
    assert.equal(state.recommendationResults.length, 0, 'The previous account late result stays detached');
    assert.equal(state.recommendationRecentJob, null);
    if (nextUid) {
      state.recommendationJobId = 'member-b-job';
      await sandbox.pollRecommendationJob('member-b-job', sandbox.recommendationRunToken,
        complete([house('member-B')], { jobId: 'member-b-job' }));
      assert.equal(state.recommendationResults[0].catalogId, 'member-B', 'Older account data does not put B restoration into the activity branch');
    }
  });
}
