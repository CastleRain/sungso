import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeDestinations } from '../js/commute-balance-core.mjs';

const source = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
function actual(name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, name);
  return match[0];
}
const filters = () => ({ regions: ['seoul', 'gyeonggi'], minHouseholds: 300,
  householdsOperator: 'gt', maxPriceManWon: 66000, priceOperator: 'lte', minAreaM2: 59.5,
  areaOperator: 'gte', areaBasis: 'exclusive', minBuiltYear: 2001, maxAgeYears: 25,
  months: 3, districtCodes: ['41135', '41465'], destinations: [] });
const completedJob = (overrides = {}) => ({ jobId: 'prior-price-job', status: 'complete',
  filters: filters(), updatedAt: '2026-09-09T00:00:00.000Z',
  resultCount: 1, results: [{ catalogId: 'public-candidate', bestArea: { averagePriceManWon: 60000 } }],
  progress: { completed: 6, total: 6 }, ...overrides });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const jsonResponse = job => ({ ok: true, json: async () => ({ job }) });

function harness() {
  let uid = 'account-a';
  let form = filters();
  const requests = [];
  const applied = [];
  const state = { recommendationRestoreBusy: false, recommendationRunning: false,
    recommendationMeta: null, recommendationResults: [], recommendationRecentJob: null,
    recommendationRestoreError: '', commuteVerificationRunning: false };
  const nodes = new Map();
  const $ = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { value: selector === '#recommendBudgetSource' ? 'manual' : '',
      classList: { add() {}, remove() {}, toggle() {} } });
    return nodes.get(selector);
  };
  const context = vm.createContext({ state, $, recommendationAppReady: true,
    recommendationRunToken: 1, recommendationRestoreEpoch: 1, recommendationRecentCheckedUid: '',
    APP_CONFIG: { isLocalRuntime: false, cloudApiBaseUrl: 'https://api.example.test/api',
      recommendationUrl: 'https://api.example.test/api/recommendations' },
    cloudSession: { getState: () => ({ user: uid ? { uid } : null }) },
    wecostTargetState: { status: 'available' }, readRecommendationForm: () => structuredClone(form),
    fetch: async (...args) => { const request = deferred(); requests.push({ args, ...request }); return request.promise; },
    applyRecentRecommendation: async job => { applied.push(job); }, renderRecommendationContinuity() {},
    normalizeDestinations, selectedCommuteProvider: () => 'kakao',
    renderRecommendationResults() {}, setRecommendationStatus() {},
    enrichRecommendationMapAndCommute: async () => {}, mergeRetriedPriceResults: (before, after) => after,
    window: { setTimeout: () => { throw new Error('Unexpected automatic advance'); } },
    Date, JSON, structuredClone,
  });
  for (const name of ['priceSearchSignature', 'restoreRecentRecommendation', 'recommendationJobUrl']) vm.runInContext(actual(name), context);
  return { context, state, nodes, $, requests, applied,
    setUid: value => { uid = value; }, setForm: value => { form = value; } };
}

test('price identity includes district membership, ignores list order, and treats absent scope as whole-region', () => {
  const { context } = harness();
  const signature = context.priceSearchSignature;
  assert.equal(signature(filters()), signature({ ...filters(), regions: ['gyeonggi', 'seoul'], districtCodes: ['41465', '41135'] }));
  assert.notEqual(signature(filters()), signature({ ...filters(), districtCodes: ['41135', '41133'] }));
  assert.notEqual(signature(filters()), signature({ ...filters(), districtCodes: [] }));
  assert.equal(signature({ ...filters(), districtCodes: undefined }), signature({ ...filters(), districtCodes: [] }));
});

test('matching account search is restored once without starting a new search', async () => {
  const h = harness();
  const restoring = h.context.restoreRecentRecommendation();
  assert.equal(h.requests.length, 1);
  assert.equal(h.state.recommendationRestoreBusy, true);
  assert.match(h.requests[0].args[0], /\/recommendations\/recent$/);
  h.requests[0].resolve(jsonResponse(completedJob()));
  await restoring;
  assert.equal(h.applied.length, 1);
  assert.equal(h.state.recommendationRecentJob.jobId, 'prior-price-job');
  assert.equal(h.state.recommendationRestoreBusy, false);
  await h.context.restoreRecentRecommendation();
  assert.equal(h.requests.length, 1);
});

test('different saved search remains an explicit choice without applying old filters', async () => {
  const h = harness();
  const restoring = h.context.restoreRecentRecommendation();
  h.requests[0].resolve(jsonResponse(completedJob({ filters: { ...filters(), maxPriceManWon: 70000 } })));
  await restoring;
  assert.equal(h.applied.length, 0);
  assert.equal(h.state.recommendationRecentJob.filters.maxPriceManWon, 70000);
});

test('editing price criteria while recent search loads cannot overwrite the edited form', async () => {
  const h = harness();
  const restoring = h.context.restoreRecentRecommendation();
  h.setForm({ ...filters(), districtCodes: [] });
  h.requests[0].resolve(jsonResponse(completedJob()));
  await restoring;
  assert.equal(h.applied.length, 0);
  assert.equal(h.state.recommendationRecentJob.jobId, 'prior-price-job');
});

test('late former-account response and failure are ignored after account switch', async () => {
  for (const failure of [false, true]) {
    const h = harness();
    const restoring = h.context.restoreRecentRecommendation();
    h.setUid('account-b');
    h.context.recommendationRestoreEpoch += 1;
    h.state.recommendationRestoreBusy = false;
    if (failure) h.requests[0].reject(new Error('old account connection failure'));
    else h.requests[0].resolve(jsonResponse(completedJob()));
    await restoring;
    assert.equal(h.applied.length, 0);
    assert.equal(h.state.recommendationRecentJob, null);
    assert.equal(h.state.recommendationRestoreError, '');
  }
});

test('a newly started search wins over an old recent-search response or failure', async () => {
  for (const failure of [false, true]) {
    const h = harness();
    const restoring = h.context.restoreRecentRecommendation();
    h.context.recommendationRunToken += 1;
    h.state.recommendationRunning = true;
    h.state.recommendationResults = [{ catalogId: 'new-search' }];
    if (failure) h.requests[0].reject(new Error('old recent-search failure'));
    else h.requests[0].resolve(jsonResponse(completedJob()));
    await restoring;
    assert.equal(h.applied.length, 0);
    assert.equal(h.state.recommendationRecentJob, null);
    assert.equal(h.state.recommendationResults[0].catalogId, 'new-search');
    assert.equal(h.state.recommendationRestoreError, '');
  }
});

test('WeCost loading defers restore until its confirmed budget is available', async () => {
  const h = harness();
  h.$('#recommendBudgetSource').value = 'wecost';
  h.context.wecostTargetState = { status: 'loading' };
  await h.context.restoreRecentRecommendation();
  assert.equal(h.requests.length, 0);
  assert.equal(h.context.recommendationRecentCheckedUid, '');
  h.context.wecostTargetState = { status: 'available' };
  const restoring = h.context.restoreRecentRecommendation();
  h.requests[0].resolve(jsonResponse(completedJob()));
  await restoring;
  assert.equal(h.applied.length, 1);
});

test('existing results, ongoing search, local runtime, or logout never request recent cloud results', async () => {
  for (const setup of [h => { h.state.recommendationMeta = completedJob(); },
    h => { h.state.recommendationRunning = true; },
    h => { h.context.APP_CONFIG.isLocalRuntime = true; }, h => h.setUid(null)]) {
    const h = harness(); setup(h);
    await h.context.restoreRecentRecommendation();
    assert.equal(h.requests.length, 0);
  }
});

test('completed restored payload renders directly with original freshness and no advance request', async () => {
  const h = harness();
  const job = completedJob();
  h.state.recommendationJobId = job.jobId;
  h.state.recommendationRunning = false;
  h.state.recommendationRunSnapshot = { filters: filters(), destinations: [] };
  vm.runInContext(actual('pollRecommendationJob'), h.context);
  await h.context.pollRecommendationJob(job.jobId, 1, job);
  assert.equal(h.requests.length, 0);
  assert.equal(h.state.recommendationResults[0].catalogId, 'public-candidate');
  assert.equal(h.state.recommendationMeta, job);
  assert.equal(h.state.recommendationCompletedAt, Date.parse(job.updatedAt));
});

test('restored running job waits for explicit resume instead of spending provider requests', async () => {
  const h = harness();
  const job = completedJob({ status: 'running', progress: { completed: 3, total: 24 } });
  vm.runInContext(actual('applyRecentRecommendation'), h.context);
  await h.context.applyRecentRecommendation(job);
  assert.equal(h.requests.length, 0);
  assert.equal(h.state.recommendationJobId, job.jobId);
  assert.equal(h.state.recommendationMeta.status, 'running');
  assert.equal(h.state.recommendationRunning, false);
});

test('late price poll cannot write results after a new job starts', async () => {
  const h = harness();
  h.state.recommendationJobId = 'prior-price-job';
  vm.runInContext(actual('pollRecommendationJob'), h.context);
  const polling = h.context.pollRecommendationJob('prior-price-job');
  h.context.recommendationRunToken += 1;
  h.state.recommendationJobId = 'new-job';
  h.state.recommendationResults = [{ catalogId: 'new-job-candidate' }];
  h.requests[0].resolve({ ok: true, json: async () => completedJob() });
  await polling;
  assert.equal(h.state.recommendationResults[0].catalogId, 'new-job-candidate');
  assert.equal(h.state.recommendationMeta, null);
});

test('failed WeCost refresh does not clear successful price and live commute results', () => {
  const h = harness();
  h.$('#recommendBudgetSource').value = 'wecost';
  const originalResults = [{ catalogId: 'existing', routesByDestination: { a: { provider: 'kakao' } } }];
  h.state.recommendationResults = originalResults;
  let subscriber;
  let changes = 0;
  h.context.wecostTargetState = { status: 'available', snapshot: { targetPriceWon: 600000000 } };
  Object.assign(h.context, {
    wecostTargetPriceService: { subscribe: callback => { subscriber = callback; }, refresh: async () => {} },
    homeTargetPriceBridge: { subscribe() {} }, updateTargetPriceConnection() {}, updateRecommendationPriceLabel() {},
    handleRecommendationCriteriaChanged: () => { changes += 1; h.state.recommendationResults = []; },
    restoreRecentRecommendation: async () => {},
    document: { addEventListener() {}, visibilityState: 'visible' }, window: { addEventListener() {} },
  });
  vm.runInContext(actual('initializeWecostTargetConnection'), h.context);
  h.context.initializeWecostTargetConnection();
  subscriber({ status: 'loading' });
  subscriber({ status: 'error', error: 'Temporary connection failure' });
  assert.equal(changes, 0);
  assert.equal(h.state.recommendationResults, originalResults);
});

test('completed price search never shows a resume button from its obsolete creation response', () => {
  const h = harness();
  const job = completedJob();
  Object.assign(h.state, { recommendationJobId: job.jobId, recommendationMeta: job,
    recommendationRecentJob: { ...job, status: 'running' }, searchDistrictCatalog: [],
    recommendationRunSnapshot: { filters: filters() } });
  const makeNode = (tag, _className, text = '') => ({ tag, text, children: [],
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    addEventListener() {},
  });
  const root = makeNode('section');
  h.nodes.set('#recommendationSearchContinuity', root);
  h.context.createElement = makeNode;
  vm.runInContext(actual('renderRecommendationContinuity'), h.context);
  h.context.renderRecommendationContinuity();
  const buttons = node => (node && typeof node === 'object')
    ? [...(node.tag === 'button' ? [node.text] : []), ...node.children.flatMap(buttons)] : [];
  assert.ok(!buttons(root).includes('남은 가격 조회 이어하기'));
  assert.ok(buttons(root).includes('최신 가격 다시 조회'));
});
