import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { mergeRetriedPriceResults } from '../js/price-coverage-core.mjs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const actualFunction = name => {
  const match = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Actual app function ${name} exists`);
  return match[0];
};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
const filters = { regions: ['gyeonggi'], minHouseholds: 100, householdsOperator: 'gte', maxPriceManWon: 60000,
  priceOperator: 'lte', minAreaM2: 50, areaOperator: 'gte', areaBasis: 'exclusive', maxAgeYears: 30, minBuiltYear: 1996,
  months: 3, destinations: [{ id: 'work', weight: 100, modes: ['transit'], lat: 37.4, lng: 127.1 }] };
const housing = id => ({ catalogId: id, address: `${id} 테스트동`, name: `단지 ${id}`, bestArea: { averagePriceManWon: 50000, count: 2 } });
function harness() {
  const nodes = new Map();
  const $ = (selector, parent) => {
    const key = `${parent?.key || ''}/${selector}`;
    if (!nodes.has(key)) nodes.set(key, { key, hidden: false, disabled: false, textContent: '',
      classList: { add() {}, remove() {}, toggle() {} } });
    return nodes.get(key);
  };
  let form = structuredClone(filters);
  const calls = { fetch: [], renders: [], officialRevalidations: [], statuses: [], panels: [], enrichment: [], timers: [], saved: 0 };
  const state = { recommendationJobId: 'job-1', recommendationRunning: false, recommendationRetrying: false,
    commuteVerificationRunning: false, recommendationLocationBusy: false, recommendationGeocodeToken: 1,
    recommendationRunSnapshot: { filters: structuredClone(filters), destinations: structuredClone(filters.destinations) },
    recommendationResults: [{ ...housing('A'), lat: 37.5, lng: 127,
      routesByDestination: { work: [{ provider: 'kakao', verified: true, durationMinutes: 25 }] },
      commuteBalance: { decision: 'matched' }, commuteVerification: { provider: 'kakao', stage: 'final' },
      personalizedRecommendation: { totalScore: 90 } }, housing('B')],
    recommendationMeta: { jobId: 'job-1', status: 'complete', partial: true, retryAvailable: true, failedRequestCount: 1 },
    shortlist: [], commuteAttempts: new Map([['A', { attempted: true }]]), recommendationRegion: '41135',
  };
  const sandbox = { state, $, structuredClone, Date, encodeURIComponent, mergeRetriedPriceResults,
    recommendationRunToken: 1, locationRankingCache: {}, lastRecommendationDestinations: structuredClone(filters.destinations),
    recommendationPriceCoverage: { render() {} }, decisionWorkspace: null,
    APP_CONFIG: { recommendationUrl: 'fixture:jobs', isLocalRuntime: true },
    readRecommendationForm: () => structuredClone(form),
    setRecommendationPanel: value => calls.panels.push(value),
    renderRecommendationResults: (value, options) => { calls.renders.push(value); if (options?.revalidateOfficial) calls.officialRevalidations.push(state.recommendationResults); },
    setRecommendationStatus: (...args) => calls.statuses.push(args), hideRecommendationMapStatus() {},
    enrichRecommendationMapAndCommute: (...args) => calls.enrichment.push(args),
    reconcileCandidateRecommendationContext: candidate => ({ ...candidate, rebased: true }),
    saveRecommendationFilters() { calls.saved += 1; }, saveShortlist() {}, scheduleRecommendationPreview() {}, refreshRecommendationMapLayers() {},
    window: { clearTimeout() {}, setTimeout(callback) { calls.timers.push(callback); return calls.timers.length; } },
    fetch: async (url, options) => { calls.fetch.push({ url, options }); throw new Error('Unexpected request'); },
  };
  vm.createContext(sandbox);
  ['priceSearchSignature', 'recommendationJobUrl', 'retryRecommendationFailures', 'pollRecommendationJob',
    'cancelRecommendation', 'handleRecommendationCriteriaChanged'].forEach(name => vm.runInContext(actualFunction(name), sandbox));
  return { state, sandbox, calls, form: () => form, setForm(value) { form = value; } };
}
function complete(results, changes = {}) {
  return { jobId: 'job-1', status: 'complete', stage: 'complete', results, retryAvailable: false,
    failedRequestCount: 0, partial: false, progress: { completed: 3, total: 3 }, ...changes };
}

test('retry has one POST despite repeated clicks and preserves candidates while its response is pending', async () => {
  const { state, sandbox, calls } = harness();
  const started = deferred();
  const prior = state.recommendationResults;
  sandbox.fetch = async (url, options) => { calls.fetch.push({ url, options });
    return options.method === 'POST' ? started.promise : response(complete([housing('A')])); };
  const pending = sandbox.retryRecommendationFailures();
  await sandbox.retryRecommendationFailures();
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.fetch[0].url, 'fixture:jobs/job-1/retry');
  assert.equal(state.recommendationResults, prior);
  assert.equal(state.recommendationRunning, true);
  started.resolve(response({ status: 'running' }, 202)); await pending; await tick();
  assert.equal(calls.fetch.length, 2);
  assert.equal(calls.enrichment.length, 0, 'retry never invokes commute enrichment');
  assert.equal(state.recommendationRegion, '41135');
  assert.equal(state.commuteAttempts.size, 1);
});

for (const stage of ['POST', 'GET']) {
  test(`${stage} retry failure preserves results, metadata and snapshot`, async () => {
    const { state, sandbox } = harness();
    const before = { results: state.recommendationResults, meta: state.recommendationMeta, snapshot: state.recommendationRunSnapshot };
    sandbox.fetch = async (_url, options) => {
      if (options.method === stage) throw new Error('fixture connection failed');
      return response({ status: 'running' }, 202);
    };
    await sandbox.retryRecommendationFailures(); await tick();
    assert.equal(state.recommendationResults, before.results);
    assert.equal(state.recommendationMeta, before.meta);
    assert.equal(state.recommendationRunSnapshot, before.snapshot);
    assert.equal(state.recommendationRunning, false);
    assert.equal(state.recommendationRetrying, false);
  });
}

test('cancel while retry POST is in flight preserves snapshot and ignores its late completion', async () => {
  const { state, sandbox, calls } = harness();
  const post = deferred();
  const before = state.recommendationResults, snapshot = state.recommendationRunSnapshot;
  sandbox.fetch = async (url, options) => { calls.fetch.push({ url, options });
    return options.method === 'POST' ? post.promise : response({ status: 'cancelled' }); };
  const pending = sandbox.retryRecommendationFailures();
  await sandbox.cancelRecommendation();
  post.resolve(response({ status: 'running' }, 202)); await pending; await tick();
  assert.equal(state.recommendationResults, before);
  assert.equal(state.recommendationRunSnapshot, snapshot);
  assert.equal(state.recommendationRunning, false);
  assert.equal(calls.fetch.filter(call => call.options.method === 'GET').length, 0);
});

test('late poll from a cancelled generation cannot overwrite a new retry using the same job ID', async () => {
  const { state, sandbox, calls } = harness();
  const oldGet = deferred(), newGet = deferred();
  let gets = 0;
  sandbox.fetch = async (url, options) => {
    calls.fetch.push({ url, options });
    if (options.method === 'GET') return (++gets === 1 ? oldGet : newGet).promise;
    return response({ status: 'running' }, 202);
  };
  state.recommendationRetrying = true; state.recommendationRunning = true;
  const oldPoll = sandbox.pollRecommendationJob('job-1');
  await sandbox.cancelRecommendation();
  await sandbox.retryRecommendationFailures(); await tick();
  const before = state.recommendationResults;
  oldGet.resolve(response(complete([]))); await oldPoll;
  assert.equal(state.recommendationRunning, true);
  assert.equal(state.recommendationRetrying, true);
  assert.equal(state.recommendationResults, before);
  newGet.resolve(response(complete([housing('A')]))); await tick();
  assert.equal(state.recommendationResults.length, 1);
});

test('complete retry refreshes prices, preserves live routes, and removes IDs absent from new full result', async () => {
  const { state, sandbox, calls } = harness();
  const routes = structuredClone(state.recommendationResults[0].routesByDestination);
  const next = { ...housing('A'), bestArea: { averagePriceManWon: 58000, count: 3 } };
  sandbox.fetch = async (_url, options) => options.method === 'POST'
    ? response({ status: 'running' }, 202) : response(complete([next, housing('C')]));
  await sandbox.retryRecommendationFailures(); await tick();
  assert.deepEqual(plain(state.recommendationResults.map(row => row.catalogId)), ['A', 'C']);
  assert.equal(state.recommendationResults[0].bestArea.averagePriceManWon, 58000);
  assert.deepEqual(plain(state.recommendationResults[0].routesByDestination), routes);
  assert.equal(state.recommendationResults[0].lat, 37.5);
  assert.equal(state.recommendationResults[0].personalizedRecommendation, undefined);
  assert.equal(calls.enrichment.length, 0);
  assert.equal(calls.officialRevalidations.length, 1, 'A completed explicit price retry revalidates facilities once');
  assert.equal(calls.officialRevalidations[0], state.recommendationResults, 'Facility refresh sees the newly merged candidates');
});

test('a newly completed price search explicitly revalidates expired facility facts', async () => {
  const { state, sandbox, calls } = harness();
  sandbox.fetch = async () => response(complete([housing('C')]));
  await sandbox.pollRecommendationJob('job-1');
  assert.equal(calls.officialRevalidations.length, 1);
  assert.equal(calls.officialRevalidations[0], state.recommendationResults);
});

for (const flag of ['recommendationRunning', 'commuteVerificationRunning', 'recommendationLocationBusy']) {
  test(`retry is blocked while ${flag} owns the current work`, async () => {
    const { state, sandbox, calls } = harness(); state[flag] = true;
    await sandbox.retryRecommendationFailures();
    assert.equal(calls.fetch.length, 0);
  });
}

for (const [field, value] of [['maxPriceManWon', 70000], ['priceOperator', 'lt'], ['areaBasis', 'supply'], ['minBuiltYear', 2001]]) {
  test(`changed ${field} cannot retry an older price job`, async () => {
    const env = harness(); env.setForm({ ...env.form(), [field]: value });
    await env.sandbox.retryRecommendationFailures();
    assert.equal(env.calls.fetch.length, 0);
    assert.deepEqual(env.calls.panels, ['filters']);
    assert.equal(env.state.recommendationResults.length, 2);
  });
}

test('commute-preference edit during a price retry cancels refresh and rebases existing housing without clearing it', () => {
  const env = harness();
  env.sandbox.fetch = async () => response({ status: 'cancelled' });
  env.state.recommendationRunning = true; env.state.recommendationRetrying = true;
  env.setForm({ ...env.form(), preferSubway: false });
  env.sandbox.handleRecommendationCriteriaChanged();
  assert.equal(env.state.recommendationResults.length, 2);
  assert.equal(env.state.recommendationResults[0].rebased, true);
  assert.equal(env.state.recommendationRunSnapshot.filters.preferSubway, false);
  assert.equal(env.state.recommendationRunning, false);
});

test('price edit during a retry clears the old price scope and suppresses its late response', async () => {
  const env = harness(); const post = deferred();
  env.sandbox.fetch = async (_url, options) => options.method === 'POST' ? post.promise : response({ status: 'cancelled' });
  const pending = env.sandbox.retryRecommendationFailures();
  env.setForm({ ...env.form(), maxPriceManWon: 70000 });
  env.sandbox.handleRecommendationCriteriaChanged();
  post.resolve(response({ status: 'running' }, 202)); await pending;
  assert.equal(env.state.recommendationResults.length, 0);
  assert.equal(env.state.recommendationMeta, null);
  assert.equal(env.state.recommendationRunSnapshot, null);
});
