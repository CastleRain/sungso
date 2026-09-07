import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { originFingerprint, selectedCommuteProvider, planCommuteVerification, commuteAttemptKey, recentCommuteAttempt, orderCommuteVerificationCandidates } from '../js/recommendation-verification-core.mjs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const actualFunction = name => {
  const match = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Actual app function ${name} exists`);
  return match[0];
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const json = (payload, ok = true) => ({ ok, json: async () => payload });
const candidate = { catalogId: 'A', lat: 37.5, lng: 127 };
const destinations = [{ id: 'work', lat: 37.4, lng: 127.1, weight: 1, modes: ['transit'], maxMinutes: 60 }];
const filters = { regions: ['11'], maxPriceManWon: 90000, minAreaM2: 60, commuteModes: ['transit'], commuteDepartureTime: '08:00', destinations };

function harness(functions) {
  const nodes = new Map();
  const $ = (selector, parent) => {
    const key = `${parent?.key || ''}/${selector}`;
    if (!nodes.has(key)) nodes.set(key, { key, disabled: false, hidden: false, textContent: '', value: '', isConnected: true,
      replaceChildren() {}, classList: { add() {}, remove() {}, toggle() {} } });
    return nodes.get(key);
  };
  const calls = { fetch: [], toast: [], statuses: [], renders: 0, saves: 0, hides: 0, polls: [] };
  const state = {
    recommendationGeocodeToken: 1, recommendationRunning: false, recommendationJobId: '', recommendationPollTimer: 0,
    recommendationResults: [{ ...candidate }], shortlist: [{ ...candidate, memo: 'saved' }],
    recommendationRunSnapshot: { filters: structuredClone(filters), destinations: structuredClone(destinations) },
    commuteVerificationRunning: false, recommendationCommuteEnriched: false,
    lastCommuteProviderIssues: [], commuteQuota: { remaining: 10 },
    transportConfig: { transitConfigured: true, carConfigured: false, transitProvider: 'tmap', providers: { tmapTransitConfigured: true } },
  };
  const sandbox = {
    state, $, structuredClone, originFingerprint, selectedCommuteProvider, planCommuteVerification, commuteAttemptKey, recentCommuteAttempt, orderCommuteVerificationCandidates, recommendationRunToken: 1, lastRecommendationDestinations: [],
    APP_CONFIG: { recommendationUrl: 'fixture:jobs', commuteBatchUrl: 'fixture:batch', commuteUrl: 'fixture:route', localApiContractVersion: 'fixture' },
    KAKAO_PUBLIC_TRANSIT_DAILY_BUDGET: 1000, MAX_KAKAO_SCREENING_CANDIDATES: 20,
    window: { clearTimeout() {}, setTimeout() { return 1; } },
    readRecommendationForm: () => structuredClone(filters), readRecommendationPriceParts: () => ({ valid: true }),
    updateRecommendationPriceLabel() {}, setRecommendationPanel() {}, recommendationMap: { clearCandidateMarkers() {} },
    isGeoPoint: point => Number.isFinite(point?.lat) && Number.isFinite(point?.lng),
    normalizeDestinations: rows => rows, recommendationCandidateId: row => String(row.catalogId || row.id),
    destinationFingerprint: rows => JSON.stringify(rows), evaluateCommuteBalance: () => ({ decision: 'matched' }),
    expectedTransitProviderCalls: (rows, origins) => rows.length * origins.length,
    commuteProviderIssues: items => items.flatMap(item => item.errors || []),
    commuteProviderIssueMessage: () => 'old provider issue',
    sortedRecommendationResults: () => state.recommendationResults,
    recommendationVerificationStatus: row => ({ final: row.commuteBalance?.decision === 'matched' }),
    balancedProxyCandidates: (rows, limit) => rows.slice(0, limit), candidateScreeningRank: () => [0, 1, 1],
    quotaAwareCandidateCap: (_, budget, { requestedCandidates }) => ({ candidateCap: Math.min(budget, requestedCandidates) }),
    fetchCommuteQuota: async () => ({ provider: 'tmap', remaining: 10 }),
    candidateCommuteDecision: row => row?.commuteBalance?.decision || 'pending',
    renderRecommendationResults: () => { calls.renders += 1; }, saveShortlist: () => { calls.saves += 1; },
    renderRecommendationDecisionBar() {},
    showToast: (...args) => calls.toast.push(args), hideRecommendationMapStatus: () => { calls.hides += 1; },
    setRecommendationStatus: (...args) => calls.statuses.push(args),
    checkLocalMarketConnection: async () => ({ ok: true, keyConfigured: true }),
    saveRecommendationFilters() {}, renderRecommendationChips() {}, recommendationChipLabels: () => [],
    refreshRecommendationMapLayers: async () => {}, enrichRecommendationMapAndCommute: async () => {},
    mapPool: async (items, concurrency, callback) => Promise.all(items.map(callback)),
    pollRecommendationJob: jobId => calls.polls.push(jobId),
    fetch: async (url, options) => {
      calls.fetch.push({ url, options });
      throw new Error('Unexpected fixture fetch');
    },
  };
  vm.createContext(sandbox);
  functions.forEach(name => vm.runInContext(actualFunction(name), sandbox));
  return { state, sandbox, calls, $ };
}

const commuteFunctions = ['recommendationCommutePlan', 'rememberCommuteAttempt', 'requestCommuteMatrix', 'verifyRecommendationCommutes', 'verifyTopRecommendationCommutes', 'verifySingleRecommendationCommute'];

test('top verification cancelled while reading quota sends no route request or stale UI update', async () => {
  const { state, sandbox, calls } = harness(commuteFunctions);
  const quota = deferred();
  sandbox.fetchCommuteQuota = () => quota.promise;
  const pending = sandbox.verifyTopRecommendationCommutes();
  state.recommendationGeocodeToken += 1;
  quota.resolve({ provider: 'tmap', remaining: 10 });
  await pending;
  assert.equal(calls.fetch.length, 0);
  assert.equal(calls.toast.length, 0);
  assert.equal(state.commuteVerificationRunning, false);
});

test('address refinement that starts during quota lookup prevents a partial-pool route batch', async () => {
  const { state, sandbox, calls } = harness(commuteFunctions);
  const quota = deferred();
  sandbox.fetchCommuteQuota = () => quota.promise;
  const pending = sandbox.verifyTopRecommendationCommutes();
  state.recommendationLocationBusy = true;
  quota.resolve({ provider: 'tmap', remaining: 10 });
  await pending;
  assert.equal(calls.fetch.length, 0);
  assert.equal(state.commuteVerificationRunning, false);
});

test('batch planning includes closer coordinates completed while quota lookup was pending', async () => {
  const { state, sandbox } = harness(commuteFunctions);
  state.recommendationResults = [{ ...candidate, catalogId: 'known-far', lat: 37.8 }];
  const quota = deferred();
  sandbox.fetchCommuteQuota = () => quota.promise;
  const checked = [];
  sandbox.verifyRecommendationCommutes = async rows => checked.push(...rows.map(row => row.catalogId));
  const pending = sandbox.verifyTopRecommendationCommutes();
  state.recommendationResults = [...state.recommendationResults,
    { ...candidate, catalogId: 'new-near', lat: 37.401, lng: 127.101 }];
  quota.resolve({ provider: 'tmap', remaining: 1 });
  await pending;
  assert.deepEqual(checked, ['new-near']);
});

test('the actual quota helper cannot publish an old quota after the top verification token changed', async () => {
  const { state, sandbox, calls } = harness([...commuteFunctions, 'fetchCommuteQuota']);
  sandbox.APP_CONFIG.commuteQuotaUrl = 'fixture:quota';
  const quota = deferred();
  sandbox.fetch = (url, options) => { calls.fetch.push({ url, options }); return quota.promise; };
  const pending = sandbox.verifyTopRecommendationCommutes();
  state.recommendationGeocodeToken += 1;
  const currentQuota = { provider: 'tmap', remaining: 2 };
  state.commuteQuota = currentQuota;
  quota.resolve(json({ provider: 'tmap', remaining: 8 }));
  await pending;
  assert.equal(state.commuteQuota, currentQuota);
  assert.equal(calls.fetch.length, 1);
});

test('stale route completion cannot replace current results, saved edits or save the shortlist', async () => {
  const { state, sandbox, calls } = harness(commuteFunctions);
  const response = deferred();
  sandbox.fetch = () => response.promise;
  const pending = sandbox.verifyRecommendationCommutes([candidate], filters, 1, destinations);
  state.recommendationGeocodeToken = 2;
  const currentResults = [{ catalogId: 'B', memo: 'new criteria' }];
  const currentShortlist = [{ ...candidate, memo: 'edited meanwhile' }];
  state.recommendationResults = currentResults;
  state.shortlist = currentShortlist;
  response.resolve(json({ items: [{ originId: 'A', destinationId: 'work', routes: [{ verified: true, durationMinutes: 30 }] }] }));
  assert.equal(await pending, currentResults);
  assert.equal(state.recommendationResults, currentResults);
  assert.equal(state.shortlist, currentShortlist);
  assert.equal(calls.saves, 0);
});

test('a stale matrix response cannot overwrite quota or provider issues from the newer verification', async () => {
  const { state, sandbox } = harness(commuteFunctions);
  const body = deferred();
  sandbox.fetch = async () => ({ ok: true, json: () => body.promise });
  const pending = sandbox.requestCommuteMatrix([candidate], filters, destinations, 1);
  state.recommendationGeocodeToken = 2;
  const currentQuota = { remaining: 7, provider: 'new-provider' };
  const currentIssues = [{ code: 'NEW_ISSUE' }];
  state.commuteQuota = currentQuota;
  state.lastCommuteProviderIssues = currentIssues;
  body.resolve({ quota: { remaining: 9 }, provider: 'old-provider', items: [{ errors: [{ code: 'OLD_ISSUE' }] }] });
  await pending;
  assert.equal(state.commuteQuota, currentQuota);
  assert.equal(state.lastCommuteProviderIssues, currentIssues);
});

for (const mode of ['single', 'top']) {
  test(`${mode} outer await cannot restore returned rows after another completion changed the token`, async () => {
    const { state, sandbox } = harness(commuteFunctions);
    sandbox.fetch = async () => json({ items: [{ originId: 'A', destinationId: 'work', routes: [] }] });
    const verify = sandbox.verifyRecommendationCommutes;
    const currentResults = [{ catalogId: 'B', memo: 'new criteria after route normalization' }];
    sandbox.verifyRecommendationCommutes = (...args) => {
      const pending = verify(...args);
      // Model another already-queued async completion changing criteria between
      // the stateful helper settling and its caller resuming after await.
      pending.then(() => {
        state.recommendationGeocodeToken += 1;
        state.recommendationResults = currentResults;
      });
      return pending;
    };
    if (mode === 'single') await sandbox.verifySingleRecommendationCommute(candidate);
    else await sandbox.verifyTopRecommendationCommutes();
    assert.equal(state.recommendationResults, currentResults);
  });

  test(`${mode} verification suppresses an old request failure after criteria have changed`, async () => {
    const { state, sandbox, calls } = harness(commuteFunctions);
    const started = deferred();
    const route = deferred();
    sandbox.fetch = () => { started.resolve(); return route.promise; };
    const pending = mode === 'single' ? sandbox.verifySingleRecommendationCommute(candidate) : sandbox.verifyTopRecommendationCommutes();
    await started.promise;
    state.recommendationGeocodeToken += 1;
    route.reject(new Error('failure for previous criteria'));
    await pending;
    assert.equal(calls.toast.length, 0);
    assert.equal(calls.renders, 0);
    assert.equal(state.recommendationCommuteEnriched, false);
  });

  test(`${mode} old completion cannot unlock or hide a new verification after criteria change`, async () => {
    const { state, sandbox, calls, $ } = harness(commuteFunctions);
    const requestStarted = deferred();
    const route = deferred();
    sandbox.fetch = () => { requestStarted.resolve(); return route.promise; };
    const trigger = $('#single-trigger');
    const pending = mode === 'single' ? sandbox.verifySingleRecommendationCommute(candidate, trigger) : sandbox.verifyTopRecommendationCommutes();
    await requestStarted.promise;
    state.recommendationGeocodeToken += 1;
    state.commuteVerificationRunning = true;
    $('#verifyTopCommutes').disabled = true;
    $('span', $('#verifyTopCommutes')).textContent = 'new verification running';
    trigger.disabled = true;
    const hideCount = calls.hides;
    route.resolve(json({ items: [{ originId: 'A', destinationId: 'work', routes: [] }] }));
    await pending;
    assert.equal(state.commuteVerificationRunning, true);
    assert.equal($('#verifyTopCommutes').disabled, true);
    assert.equal($('span', $('#verifyTopCommutes')).textContent, 'new verification running');
    assert.equal(trigger.disabled, true);
    assert.equal(calls.hides, hideCount);
  });
}

test('more than four destinations are all covered exactly once within the server origin and pair limits', async () => {
  const { sandbox, calls } = harness(commuteFunctions);
  const origins = Array.from({ length: 12 }, (_, index) => ({ ...candidate, catalogId: `A${index}` }));
  const workplaces = Array.from({ length: 19 }, (_, index) => ({ ...destinations[0], id: `W${index}` }));
  sandbox.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.fetch.push(body);
    return json({ items: body.origins.flatMap(origin => body.destinations.map(destination => ({ originId: origin.id, destinationId: destination.id, routes: [] }))) });
  };
  const items = await sandbox.requestCommuteMatrix(origins, filters, workplaces, 1, { transitProvider: 'kakao' });
  assert.equal(items.length, 12 * 19);
  assert.equal(new Set(items.map(item => `${item.originId}/${item.destinationId}`)).size, 12 * 19);
  for (const body of calls.fetch) {
    assert.ok(body.origins.length <= 10);
    assert.ok(body.destinations.length <= 8);
    assert.ok(body.origins.length * body.destinations.length <= 40);
    assert.equal(body.maxTransitCalls, body.origins.length * body.destinations.length);
    assert.equal(body.transitProvider, 'kakao');
  }
});

test('changing criteria during a many-destination batch prevents sending any later chunk', async () => {
  const { sandbox, state, calls } = harness(commuteFunctions);
  const body = deferred();
  sandbox.fetch = async (url, options) => {
    calls.fetch.push(JSON.parse(options.body));
    return { ok: true, json: () => body.promise };
  };
  const workplaces = Array.from({ length: 17 }, (_, index) => ({ ...destinations[0], id: `W${index}` }));
  const pending = sandbox.requestCommuteMatrix([candidate], filters, workplaces, 1);
  state.recommendationGeocodeToken += 1;
  body.resolve({ items: [] });
  await pending;
  assert.equal(calls.fetch.length, 1);
});

test('starting a new price search invalidates and releases an older commute verification', async () => {
  const { sandbox, state } = harness([...commuteFunctions, 'recommendationJobUrl', 'runRecommendation']);
  const route = deferred();
  const started = deferred();
  sandbox.fetch = async (url) => {
    if (url === 'fixture:batch') { started.resolve(); return route.promise; }
    return json({ jobId: 'new-price-job' });
  };
  const old = sandbox.verifySingleRecommendationCommute(candidate);
  await started.promise;
  assert.equal(state.commuteVerificationRunning, true);
  state.commuteAttempts = new Map([['previous-search-attempt', { checkedAt: new Date().toISOString() }]]);
  await sandbox.runRecommendation();
  route.resolve(json({ items: [] }));
  await old;
  assert.equal(state.commuteVerificationRunning, false);
  assert.equal(state.commuteAttempts.size, 0, 'New price search starts a fresh request-status session without restoring Kakao routes');
  assert.equal(state.recommendationJobId, 'new-price-job');
});

test('initial map enrichment with a new token releases any previous commute verification', async () => {
  const { sandbox, state } = harness([...commuteFunctions, 'enrichRecommendationMapAndCommute']);
  const route = deferred();
  const started = deferred();
  Object.assign(sandbox, {
    REGIONS: [], loadLawDistricts: async () => ({ districts: [] }), loadRailStationData: async () => {},
    ensureRecommendationMap: async () => ({}), refineCandidateLocations: async () => {},
    candidateLocations: { enrichDistrictReferences: async rows => ({ candidates: rows, cancelled: false }) },
  });
  sandbox.fetch = () => { started.resolve(); return route.promise; };
  const old = sandbox.verifySingleRecommendationCommute(candidate);
  await started.promise;
  await sandbox.enrichRecommendationMapAndCommute(filters, destinations);
  route.resolve(json({ items: [] }));
  await old;
  assert.equal(state.commuteVerificationRunning, false);
});

test('the single-route fallback also preserves newer issues when its stale calls complete', async () => {
  const { sandbox, state } = harness(commuteFunctions);
  sandbox.APP_CONFIG.commuteBatchUrl = '';
  const response = deferred();
  sandbox.fetch = () => response.promise;
  const pending = sandbox.requestCommuteMatrix([candidate], filters, destinations, 1);
  state.recommendationGeocodeToken += 1;
  const currentIssues = [{ code: 'NEW_ISSUE' }];
  state.lastCommuteProviderIssues = currentIssues;
  response.resolve(json({ routes: [] }));
  await pending;
  assert.equal(state.lastCommuteProviderIssues, currentIssues);
});

function jobHarness() {
  return harness(['recommendationJobUrl', 'runRecommendation', 'cancelRecommendation']);
}

test('a cancelled late job-creation response is deleted exactly once without polling or touching the new job', async () => {
  const { state, sandbox, calls } = jobHarness();
  const created = deferred();
  const started = deferred();
  sandbox.fetch = async (url, options) => {
    calls.fetch.push({ url, method: options?.method });
    if (options?.method === 'POST') { started.resolve(); return created.promise; }
    return json({});
  };
  const old = sandbox.runRecommendation();
  await started.promise;
  await sandbox.cancelRecommendation(false);
  const currentSnapshot = { filters: { maxPriceManWon: 80000 }, destinations };
  state.recommendationJobId = 'new-job';
  state.recommendationRunning = true;
  state.recommendationRunSnapshot = currentSnapshot;
  const statusCount = calls.statuses.length;
  created.resolve(json({ jobId: 'old/job' }));
  await old;
  assert.deepEqual(calls.fetch.filter(call => call.method === 'DELETE'), [{ url: 'fixture:jobs/old%2Fjob', method: 'DELETE' }]);
  assert.equal(calls.polls.length, 0);
  assert.equal(state.recommendationJobId, 'new-job');
  assert.equal(state.recommendationRunning, true);
  assert.equal(state.recommendationRunSnapshot, currentSnapshot);
  assert.equal(calls.statuses.length, statusCount);
});

for (const failure of ['network', 'HTTP']) {
  test(`a cancelled late ${failure} job-creation error cannot erase the new search state`, async () => {
    const { state, sandbox, calls } = jobHarness();
    const created = deferred();
    const started = deferred();
    sandbox.fetch = (url, options) => {
      if (options?.method === 'POST') { started.resolve(); return created.promise; }
      return Promise.resolve(json({}));
    };
    const old = sandbox.runRecommendation();
    await started.promise;
    await sandbox.cancelRecommendation(false);
    const currentSnapshot = { filters: { maxPriceManWon: 80000 }, destinations };
    state.recommendationJobId = 'new-job';
    state.recommendationRunning = true;
    state.recommendationRunSnapshot = currentSnapshot;
    const statusCount = calls.statuses.length;
    if (failure === 'network') created.reject(new Error('old network failure'));
    else created.resolve(json({ error: 'old HTTP failure' }, false));
    await old;
    assert.equal(state.recommendationRunning, true);
    assert.equal(state.recommendationRunSnapshot, currentSnapshot);
    assert.equal(state.recommendationJobId, 'new-job');
    assert.equal(calls.statuses.length, statusCount);
  });
}

test('cancelling price preflight prevents creating any upstream job after the old health check completes', async () => {
  const { sandbox, state, calls } = jobHarness();
  const health = deferred();
  sandbox.checkLocalMarketConnection = () => health.promise;
  const pending = sandbox.runRecommendation();
  await sandbox.cancelRecommendation(false);
  health.resolve({ ok: true, keyConfigured: true });
  await pending;
  assert.equal(calls.fetch.length, 0);
  assert.equal(state.recommendationRunning, false);
  assert.equal(state.recommendationRunSnapshot, null);
});

test('late errors from an old polled job cannot overwrite the active job status', async () => {
  const { sandbox, state, calls } = harness(['recommendationJobUrl', 'pollRecommendationJob']);
  const response = deferred();
  state.recommendationJobId = 'old-job';
  sandbox.fetch = () => response.promise;
  const pending = sandbox.pollRecommendationJob('old-job');
  state.recommendationJobId = 'new-job';
  state.recommendationRunning = true;
  response.resolve(json({ error: 'old poll failure' }, false));
  await pending;
  assert.equal(state.recommendationRunning, true);
  assert.equal(calls.statuses.length, 0);
});

test('the completed poll distinguishes missing price data from valid partial candidates', async () => {
  for (const results of [[], [{ ...candidate }]]) {
    const { sandbox, state, calls, $ } = harness(['recommendationJobUrl', 'pollRecommendationJob']);
    state.recommendationJobId = 'price-job';
    state.recommendationRunning = true;
    sandbox.fetch = async () => json({ status: 'complete', results, baseCandidateCount: 4199,
      failedRequestCount: 88, partial: true, failureSummary: [{ reason: '국토부 연결 지연·서버 오류', count: 88 }] });
    await sandbox.pollRecommendationJob('price-job');
    const [kind, title, message] = calls.statuses.at(-1);
    assert.equal(state.recommendationRunning, false);
    assert.match(message, /월·시군구 조회 88건/);
    assert.match(message, /불완전한 시군구의 후보는 제외/);
    assert.equal($('small', $('#recommendStepPrice')).textContent, '일부 지역 실거래 확인 미완료');
    if (!results.length) {
      assert.equal(kind, 'error');
      assert.match(title, /후보 판단을 보류/);
      assert.match(message, /조건에 맞는 집이 없다는 뜻은 아닙니다/);
      assert.doesNotMatch(message, /표시된 후보의 가격|통근.*버튼|누락분만/);
    } else {
      assert.equal(kind, 'success');
      assert.match(title, /1개 후보.*재확인/);
      assert.match(message, /표시된 후보의 가격·면적은 실제 거래로 확인/);
      assert.equal(state.recommendationResults, results);
    }
  }
});
