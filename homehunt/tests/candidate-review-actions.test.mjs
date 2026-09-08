import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { isGeoPoint } from '../js/transport-core.mjs';
import { normalizeDestinations } from '../js/commute-balance-core.mjs';
import { commuteAttemptKey, recentCommuteAttempt, selectedCommuteProvider } from '../js/recommendation-verification-core.mjs';

const source = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const destinations = normalizeDestinations([{ id: 'fixture-office', lat: 37.5, lng: 127,
  weightPercent: 100, modes: ['transit'], maxMinutes: 60 }]);
const house = id => ({ catalogId: id, name: `가상 단지 ${id}`, address: '가상 테스트 주소', lat: 37.45, lng: 127.05 });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('a late map lookup cannot pull the user back out of the candidate review page', async () => {
  const ready = deferred();
  const state = { currentView: 'candidates' };
  const unexpected = () => { throw Error('Left the map; late work must not select or open it'); };
  const sandbox = { state, isGeoPoint,
    setView: view => { state.currentView = view; },
    ensureRecommendationMap: () => ready.promise,
    sortedRecommendationResults: unexpected,
    showToast: unexpected,
  };
  vm.createContext(sandbox);
  vm.runInContext(source.match(/async function showRecommendationOnMap\([^]*?\n\}/)[0], sandbox);
  const pending = sandbox.showRecommendationOnMap(house('mapped'));
  assert.equal(state.currentView, 'recommend');
  state.currentView = 'candidates';
  ready.resolve({ focusCandidate: unexpected });
  await pending;
  assert.equal(state.currentView, 'candidates');
});

function harness() {
  const clock = { now: Date.now() };
  const state = { recommendationResults: [], shortlist: [], commuteAttempts: new Map(),
    recommendationGeocodeToken: 1, recommendationRunning: false, commuteVerificationRunning: false,
    recommendationLocationBusy: false, transportConfig: { transitProviderPreference: 'kakao' } };
  const calls = { geocode: [], verified: [], toasts: [] };
  const sandbox = { state, isGeoPoint, selectedCommuteProvider,
    recommendationCandidateId: item => String(item?.catalogId || item?.id || ''),
    activeRecommendationDestinations: () => destinations,
    recentCommuteAttempt: (candidate, targets, provider, attempts) =>
      recentCommuteAttempt(candidate, targets, provider, attempts, { now: clock.now }),
    geocodeLocally: async address => { calls.geocode.push(address); return null; },
    verifySingleRecommendationCommute: async candidate => { calls.verified.push(candidate); },
    showToast: (...args) => calls.toasts.push(args),
  };
  vm.createContext(sandbox);
  for (const name of ['candidateReviewLiveSource', 'verifyReviewedCandidate']) {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
    assert.ok(match, `Actual app function ${name} exists`);
    vm.runInContext(match[0], sandbox);
  }
  const remember = (candidate, { provider = 'kakao', age = 0 } = {}) => state.commuteAttempts.set(
    commuteAttemptKey(candidate, destinations, provider), { checkedAt: new Date(clock.now - age).toISOString() });
  return { state, sandbox, calls, clock, remember };
}

test('saved-only houses join the live review after an attempt in this open view, while old or persisted verdicts do not', () => {
  const { state, sandbox, remember } = harness();
  const live = house('search-result');
  const checked = { ...house('checked-now'), lat: 37.46, commuteVerification: { stage: 'final' } };
  const persisted = { ...house('persisted-verdict'), lat: 37.47, commuteVerification: { stage: 'final' } };
  const expired = { ...house('expired-attempt'), lat: 37.48, commuteVerification: { stage: 'final' } };
  const noEvidence = { ...house('no-verification'), lat: 37.49 };
  state.recommendationResults = [live];
  state.shortlist = [checked, persisted, expired, noEvidence];
  remember(checked);
  remember(expired, { age: 8 * 60 * 60 * 1000 });
  remember(noEvidence);
  assert.deepEqual(Array.from(sandbox.candidateReviewLiveSource(), item => item.catalogId), ['search-result', 'checked-now']);
});

test('live results take precedence over a saved house with the same ID and appear only once', () => {
  const { state, sandbox, remember } = harness();
  const live = { ...house('same-house'), marker: 'current-price' };
  const saved = { ...house('same-house'), marker: 'saved-price', commuteVerification: { stage: 'final' } };
  state.recommendationResults = [live];
  state.shortlist = [saved];
  remember(saved);
  const results = sandbox.candidateReviewLiveSource();
  assert.equal(results.length, 1);
  assert.equal(results[0], live);
});

test('a saved-only attempt cannot appear under a different provider or corrected company coordinates', () => {
  const { state, sandbox, remember } = harness();
  const saved = { ...house('previous-context'), commuteVerification: { stage: 'final' } };
  state.shortlist = [saved];
  remember(saved, { provider: 'tmap' });
  assert.equal(sandbox.candidateReviewLiveSource().length, 0);
  remember(saved);
  sandbox.activeRecommendationDestinations = () => destinations.map(item => ({ ...item, lat: item.lat + .01 }));
  assert.equal(sandbox.candidateReviewLiveSource().length, 0);
});

test('failure to resolve a saved address leaves the bookmark intact and sends no commute request', async () => {
  const { state, sandbox, calls } = harness();
  const saved = { ...house('address-only'), lat: null, lng: null };
  state.shortlist = [saved];
  await sandbox.verifyReviewedCandidate(saved);
  assert.equal(calls.geocode.length, 1);
  assert.equal(calls.verified.length, 0);
  assert.equal(state.shortlist[0], saved);
  assert.match(calls.toasts[0][0], /위치를 확인하지 못했.*통근 호출은 실행하지 않/);
});

for (const change of ['token', 'price-search', 'other-commute']) {
  test(`a saved address resolving after a ${change} change cannot launch a stale commute request`, async () => {
    const { state, sandbox, calls } = harness();
    const saved = { ...house('late-address'), lat: null, lng: null };
    state.shortlist = [saved];
    const point = deferred();
    sandbox.geocodeLocally = () => point.promise;
    const pending = sandbox.verifyReviewedCandidate(saved);
    if (change === 'token') state.recommendationGeocodeToken += 1;
    else if (change === 'price-search') state.recommendationRunning = true;
    else state.commuteVerificationRunning = true;
    point.resolve({ lat: 37.451, lng: 127.051 });
    await pending;
    assert.equal(calls.verified.length, 0);
    assert.equal(state.shortlist[0], saved);
    assert.equal(calls.toasts.length, 0);
  });
}

test('resolved saved-house coordinates are passed to verification and become available in the live review after that attempt', async () => {
  const { state, sandbox, calls, remember } = harness();
  const saved = { ...house('resolved-address'), lat: null, lng: null };
  state.shortlist = [saved];
  sandbox.geocodeLocally = async address => { calls.geocode.push(address); return { lat: 37.451, lng: 127.051 }; };
  sandbox.verifySingleRecommendationCommute = async candidate => {
    calls.verified.push(candidate);
    candidate.commuteVerification = { stage: 'final' };
    remember(candidate);
  };
  await sandbox.verifyReviewedCandidate(saved);
  assert.equal(calls.verified.length, 1);
  const verified = calls.verified[0];
  assert.equal(verified.lat, 37.451);
  assert.equal(verified.lng, 127.051);
  assert.equal(verified.locationPrecision, 'address');
  assert.equal(state.shortlist[0], verified);
  assert.equal(saved.lat, null, 'The original saved object is not modified with provider coordinates');
  assert.equal(sandbox.candidateReviewLiveSource()[0], verified);
});

test('a house whose current result already has coordinates is verified without another geocode', async () => {
  const { state, sandbox, calls } = harness();
  const saved = { ...house('known-location'), lat: null, lng: null };
  const current = house('known-location');
  state.shortlist = [saved];
  state.recommendationResults = [current];
  await sandbox.verifyReviewedCandidate(saved);
  assert.equal(calls.geocode.length, 0);
  assert.equal(calls.verified.length, 1);
  assert.equal(calls.verified[0], current);
});
