import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const actualFunction = name => {
  const match = app.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Actual app function ${name} exists`);
  return match[0];
};

function entryHarness(overrides = {}) {
  const state = {
    recommendationResults: [{ catalogId: 'fixture-house', commuteBalance: { decision: 'matched' } }],
    recommendationMeta: { resultCount: 1, failedRequestCount: 0 },
    recommendationRunSnapshot: { filters: { maxPriceManWon: 60000 }, destinations: [] },
    recommendationCompletedAt: Date.now(), recommendationRunning: false,
    commuteVerificationRunning: false, recommendationGeocodeToken: 7,
    recommendationRegion: 'fixture-region', recommendationShowingShortlist: true,
    recommendationMapMode: 'apartments', selectedRecommendationId: 'fixture-house',
    commuteAttempts: new Map([['fixture-attempt', { attempted: true }]]),
    ...overrides,
  };
  const calls = { panels: [], searches: 0, fetches: 0 };
  const listeners = new Map();
  const $ = selector => ({
    addEventListener(type, callback) { listeners.set(`${selector}:${type}`, callback); },
  });
  const sandbox = {
    state, $, setRecommendationPanel: panel => calls.panels.push(panel),
    runRecommendation: () => { calls.searches += 1; },
    fetch: () => { calls.fetches += 1; throw new Error('The search entry must never call an API'); },
  };
  vm.createContext(sandbox);
  vm.runInContext(actualFunction('openRecommendationSearchConditions'), sandbox);
  // Execute the production button bindings, so a direct binding to the search
  // function cannot pass by testing only the safe helper in isolation.
  const bindings = app.match(/  \$\('#runRecommendation'\)\.addEventListener\('click',[\s\S]*?(?=  \$\('#toggleRecommendationFilters'\))/);
  assert.ok(bindings, 'Production top and drawer search button bindings exist');
  vm.runInContext(bindings[0], sandbox);
  return { state, calls, listeners, sandbox };
}

for (const [label, overrides] of [
  ['completed results', {}],
  ['partial results', { recommendationMeta: { resultCount: 1, partial: true, failedRequestCount: 2 } }],
  ['expired price data', { recommendationCompletedAt: Date.now() - 48 * 60 * 60 * 1000 }],
  ['a price search in progress', { recommendationRunning: true }],
  ['commute verification in progress', { commuteVerificationRunning: true }],
  ['an empty first search', { recommendationResults: [], recommendationMeta: null, recommendationRunSnapshot: null }],
]) {
  test(`the map search entry only opens conditions for ${label}`, () => {
    const { state, calls, listeners } = entryHarness(overrides);
    const before = structuredClone(state);
    const results = state.recommendationResults;
    const snapshot = state.recommendationRunSnapshot;
    const attempts = state.commuteAttempts;
    const click = listeners.get('#runRecommendation:click');
    assert.equal(typeof click, 'function');
    // A second accidental click must also remain harmless.
    click({ type: 'click' });
    click({ type: 'click' });
    assert.deepEqual(calls.panels, ['filters', 'filters']);
    assert.equal(calls.searches, 0);
    assert.equal(calls.fetches, 0);
    assert.deepEqual(state, before);
    assert.equal(state.recommendationResults, results);
    assert.equal(state.recommendationRunSnapshot, snapshot);
    assert.equal(state.commuteAttempts, attempts);
  });
}

test('only the explicit apply button inside the condition drawer invokes the search action', () => {
  const { calls, listeners } = entryHarness();
  listeners.get('#runRecommendation:click')({ type: 'click' });
  assert.equal(calls.searches, 0);
  const apply = listeners.get('#applyRecommendationFilters:click');
  assert.equal(typeof apply, 'function');
  apply({ type: 'click' });
  assert.equal(calls.searches, 1);
  assert.deepEqual(calls.panels, ['filters', '']);
  assert.equal(calls.fetches, 0, 'The binding delegates to the search action rather than performing its own request');
});
