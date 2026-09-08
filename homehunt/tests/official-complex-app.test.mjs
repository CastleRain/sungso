import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createOfficialComplexClient } from '../js/official-complex-client.mjs';
import { createOfficialComplexQueue } from '../js/official-complex-queue.mjs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const start = app.indexOf('let officialComplexReady =');
const end = app.indexOf('let lastRecommendationDestinations =', start);
assert.ok(start > 0 && end > start);
const candidate = id => ({ catalogId: `c${id}`, name: `단지 ${id}`,
  bestArea: { averagePriceManWon: 55000, areaM2: 84 },
  routesByDestination: { privateOffice: [{ durationMinutes: 37 }] },
  commuteVerification: { stage: 'final' } });

function harness(state, { url = 'http://localhost/api/kapt/complex', ttlMs = 3600000 } = {}) {
  const calls = [], timers = new Map();
  let renders = 0, nextTimer = 0, clock = Date.now();
  const sandbox = {
    state, APP_CONFIG: { officialComplexUrl: url }, locationRankingCache: { previous: true },
    document: { activeElement: null },
    createOfficialComplexClient: options => createOfficialComplexClient({ ...options, now: () => clock }),
    createOfficialComplexQueue, WeakMap,
    $: () => null,
    window: { setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; } },
    renderRecommendationResults: () => { renders++; sandbox.control.sync(); },
    fetch: async input => {
      const endpoint = new URL(input);
      assert.equal(endpoint.pathname, '/api/kapt/complex');
      assert.deepEqual([...endpoint.searchParams.keys()], ['catalogId']);
      const id = endpoint.searchParams.get('catalogId'); calls.push(id);
      return { ok: true, json: async () => ({ schemaVersion: 1, provider: 'kapt', catalogId: id,
        status: 'matched', kaptCode: `KAPT${id}`, complexMatchConfirmed: true,
        observedAt: new Date().toISOString(), households: 500, heatingType: '지역난방', elevatorCount: 10,
        parking: { aboveGroundSpaces: 100, belowGroundSpaces: 500 },
        cache: { expiresAt: new Date(clock + ttlMs).toISOString() } }) };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(app.slice(start, end) + `
    globalThis.control = { ready() { officialComplexReady = true; synchronizeOfficialComplexCandidates(); },
      sync: synchronizeOfficialComplexCandidates, queue: officialComplexQueue, client: officialComplexClient };
  `, sandbox);
  return { ...sandbox.control, calls, timers, sandbox, renders: () => renders, advance: ms => { clock += ms; } };
}

test('startup enriches saved homes first and deduplicates matching visits without altering price or live routes', async () => {
  const saved = candidate(1), other = candidate(2);
  const state = { shortlist: [saved], recommendationResults: [], visits: [{ ...saved }, other, { name: '직접 기록' }] };
  const before = JSON.stringify(state);
  const context = harness(state);
  context.sync();
  assert.equal(context.queue.snapshot().total, 0, 'Initialization must be ready before dispatch');
  context.ready();
  const result = await context.queue.whenIdle();
  assert.equal(result.matched, 2);
  assert.deepEqual(context.calls, ['c1', 'c2']);
  assert.equal(JSON.stringify(state), before);
  const decorated = context.client.decorate(saved);
  assert.equal(decorated.officialComplexInfo.heatingType, '지역난방');
  assert.equal(decorated.officialComplexInfo.elevatorCount, 10);
  assert.equal(decorated.parkingEvidence.spacesPerHousehold, 1.2);
  assert.equal(decorated.routesByDestination, saved.routesByDestination);
  assert.equal(decorated.bestArea, saved.bestArea);
});

test('all 900 new price candidates enrich independently of a selected map region or commute scope', async () => {
  const saved = candidate(1);
  const state = { shortlist: [saved], visits: [], recommendationResults: [],
    recommendationRegion: 'one-region', recommendationMapScope: 'matched', recommendationVisibleCount: 10 };
  const context = harness(state);
  context.ready();
  await context.queue.whenIdle();
  state.recommendationResults = Array.from({ length: 900 }, (_, index) => candidate(index + 1));
  const before = JSON.stringify(state.recommendationResults);
  context.sync();
  assert.equal(state.recommendationResults.length, 900, 'Candidates remain available while metadata loads');
  assert.equal(context.queue.snapshot().total, 900);
  const result = await context.queue.whenIdle();
  assert.equal(result.matched, 900);
  assert.equal(context.calls.length, 900);
  assert.equal(context.timers.size, 1, 'Hundreds of arrivals coalesce into one pending list repaint');
  assert.equal(context.sandbox.locationRankingCache, null);
  assert.equal(JSON.stringify(state.recommendationResults), before);
  context.sync();
  await context.queue.whenIdle();
  assert.equal(context.calls.length, 900, 'Same-condition renders reuse completed public facts');
  for (const callback of context.timers.values()) callback();
  assert.equal(context.renders(), 1);
});

test('an unavailable public-info server pauses metadata only, preserving saved and price candidates', async () => {
  const state = { shortlist: [candidate(1)], visits: [], recommendationResults: [candidate(2), candidate(3)] };
  const before = JSON.stringify(state);
  const context = harness(state, { url: '' });
  context.ready();
  const result = await context.queue.whenIdle();
  assert.equal(result.paused, true);
  assert.equal(result.reason, 'LOCAL_SERVER_REQUIRED');
  assert.equal(context.calls.length, 0);
  assert.equal(JSON.stringify(state), before);
});

test('incoming public facts do not replace a card while personal parking is being edited', async () => {
  const state = { shortlist: [candidate(1)], visits: [], recommendationResults: [] };
  const context = harness(state);
  context.sandbox.document.activeElement = { closest: selector => selector === '.parking-evidence-editor' };
  context.ready();
  await context.queue.whenIdle();
  const first = [...context.timers.values()][0]; context.timers.clear(); first();
  assert.equal(context.renders(), 0);
  assert.equal(context.sandbox.locationRankingCache, null, 'Ranking still invalidates as soon as data arrives');
  context.sandbox.document.activeElement = null;
  const deferred = [...context.timers.values()][0]; context.timers.clear(); deferred();
  assert.equal(context.renders(), 1);
});

test('expired facility facts do not turn completed houses back into pending on repaint, sorting or scope changes', async () => {
  const saved = candidate(1);
  const state = { shortlist: [saved], visits: [], recommendationResults: [candidate(2)] };
  const original = JSON.stringify(state);
  const context = harness(state, { ttlMs: 1000 });
  context.ready();
  await context.queue.whenIdle();
  const completed = context.queue.snapshot();
  context.advance(2000);
  assert.equal(context.client.isFresh(saved), false);
  assert.equal(context.client.decorate(saved).officialComplexInfo, undefined, 'Expired facts are not displayed as current evidence');
  for (let index = 0; index < 20; index++) {
    context.sandbox.renderRecommendationResults();
    context.sync();
    await context.queue.whenIdle();
    const callbacks = [...context.timers.values()]; context.timers.clear();
    callbacks.forEach(callback => callback());
    await context.queue.whenIdle();
    assert.deepEqual(context.queue.snapshot(), completed, 'Completion stays stable, including after arrival-triggered repaint');
  }
  assert.equal(context.calls.length, 2, 'Background view updates make no new facility requests');
  assert.equal(JSON.stringify(state), original, 'Price and live commute evidence stay intact');
  context.sync({ revalidate: true });
  await context.queue.whenIdle();
  assert.equal(context.calls.length, 4, 'Explicit new-search synchronization refreshes expired facts once');
  assert.equal(context.queue.snapshot().pending, 0);
  context.sync({ revalidate: true });
  await context.queue.whenIdle();
  assert.equal(context.calls.length, 4, 'Fresh facts are still reused');
});
