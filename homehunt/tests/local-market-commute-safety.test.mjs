import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  CommuteProviderError, KakaoDailyLedger, MemoryTtlCache, TMAP_TRANSIT_CACHE_OPTION,
  createCommuteCacheKey, fetchKakaoPublicTransit, sanitizeProviderErrorDetails,
} from '../scripts/commute-provider.mjs';
import { normalizeGeoPoint } from '../js/transport-core.mjs';
import { nextWeekdaySearchDateTime } from '../scripts/commute-time.mjs';

const source = fs.readFileSync(new URL('../scripts/local-market-server.mjs', import.meta.url), 'utf8');
const NOW = Date.parse('2026-09-07T07:00:00Z');
const ORIGIN = { lat: 37.4, lng: 127 };
const DESTINATION = { lat: 37.55, lng: 127.1 };
const pause = () => new Promise(resolve => setTimeout(resolve, 2));
const response = (ok = true, status = 200) => ({ ok, status, json: async () => ok ? {
  status: 'OK', routes: [{ properties: { totalTime: 1800, transfers: 0, type: 'SUBWAY' }, steps: [
    { properties: { type: 'SUBWAY', time: 1800, distance: 12000 } },
  ] }],
} : { message: 'fixture upstream error with no credentials' } });

function harness({ limit = 1000, concurrency = 2, upstream = async () => { await pause(); return response(); } } = {}) {
  const files = new Map();
  const fsImpl = {
    readFile: async name => { if (!files.has(name)) throw Object.assign(new Error('fixture missing'), { code: 'ENOENT' }); return files.get(name); },
    mkdir: async () => {}, writeFile: async (name, body) => files.set(name, body),
    rename: async (oldName, newName) => { files.set(newName, files.get(oldName)); files.delete(oldName); },
  };
  const ledgerOptions = { filePath: 'fixture-only-kakao-usage.json', now: () => NOW, fsImpl, limit };
  const ledger = new KakaoDailyLedger(ledgerOptions);
  const cache = new MemoryTtlCache({ now: () => NOW });
  let calls = 0;
  const sandbox = {
    CommuteProviderError, normalizeGeoPoint, nextWeekdaySearchDateTime, createCommuteCacheKey,
    sanitizeProviderErrorDetails, TMAP_TRANSIT_CACHE_OPTION,
    KAKAO_UPSTREAM_CALLS_PER_BATCH: 30, TRANSIT_CONCURRENCY: concurrency, TRANSIT_CACHE_TTL_MS: 8 * 3600000,
    kakaoRestApiKey: 'fixture-key-before-change', tmapAppKey: '', naverMapsClientId: '', naverMapsClientSecret: '',
    transitCache: cache, kakaoLedger: ledger, tmapLedger: ledger,
    providerDiagnostics: { transit: { kakao: null, tmap: null }, car: null },
    selectedTransitProvider: () => 'kakao',
    readJsonBody: async req => req.body,
    json: (_, status, body) => ({ status, body }), errorPayload: (code, message, extra = {}) => ({ code, message, ...extra }),
    commuteQuotaSnapshot: async provider => ({ provider, kakao: await ledger.snapshot() }),
    fetchKakaoPublicTransit: (params, options) => fetchKakaoPublicTransit(params, { ...options,
      now: () => NOW, fetchImpl: async (...args) => { calls += 1; return upstream(...args); },
    }),
  };
  vm.createContext(sandbox);
  for (const name of ['createConcurrencyGate', 'requestTransitProvider', 'validPoint', 'normalizedModes',
    'notConfiguredRoute', 'failedRoute', 'recordProviderDiagnostic', 'createTransitBatchContext',
    'reserveTransitUpstreamCall', 'resolveCommuteRoutes', 'pairIdentity', 'preflightBatchTransit',
    'mapWithConcurrency', 'handleCommuteBatch']) {
    const fn = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
    assert.ok(fn, `Actual server function ${name} exists`);
    vm.runInContext(fn[0], sandbox);
  }
  sandbox.transitGate = sandbox.createConcurrencyGate(concurrency);
  return { sandbox, cache, ledger, calls: () => calls,
    restartLedger: () => new KakaoDailyLedger(ledgerOptions),
    batch: body => sandbox.handleCommuteBatch({ body }, {}),
  };
}

function batchBody(originCount = 10, destinationCount = 3) {
  return {
    origins: Array.from({ length: originCount }, (_, index) => ({ id: `home-${index}`, ...ORIGIN, lat: ORIGIN.lat + index * .001 })),
    destinations: Array.from({ length: destinationCount }, (_, index) => ({ id: `office-${index}`, ...DESTINATION,
      lng: DESTINATION.lng + index * .001, modes: ['transit'], maxMinutes: 60, departureTime: '08:00' })),
    transitProvider: 'kakao', maxTransitCalls: 30,
  };
}

test('a client cannot raise the server Kakao batch ceiling beyond 30 new upstream requests', async () => {
  const h = harness();
  const result = await h.batch({ ...batchBody(10, 4), maxTransitCalls: 40 });
  assert.equal(result.status, 429);
  assert.equal(result.body.code, 'TRANSIT_PREFLIGHT_LIMIT');
  assert.equal(result.body.requiredTransitCalls, 40);
  assert.equal(result.body.maxUpstreamCallsPerBatch, 30);
  assert.equal(h.calls(), 0);
  assert.equal((await h.ledger.snapshot()).used, 0);
});

test('ten homes by three offices costs exactly 30 live calls; another completed search costs another 30', async () => {
  const h = harness();
  const body = batchBody();
  const first = await h.batch(body);
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 30);
  assert.equal(first.body.requiredTransitCalls, 30);
  assert.equal(first.body.actualTransitCalls, 30);
  assert.equal(first.body.abortedPairCount, 0);
  assert.equal(first.body.cachePolicy, 'live-only/current-view');
  assert.equal(h.cache.size, 0);
  assert.equal(h.cache.inflight.size, 0);
  const second = await h.batch({ ...body, destinations: body.destinations.map(item => ({ ...item,
    label: 'renamed company', departureTime: '09:00', weightPercent: 10, maxMinutes: 90,
  })) });
  assert.equal(second.body.actualTransitCalls, 30);
  assert.equal(h.calls(), 60);
  assert.equal((await h.ledger.snapshot()).used, 60);
});

test('same-batch duplicate transit requests with different names, times and mode sets consume one call', async () => {
  const h = harness({ concurrency: 1 });
  const body = batchBody(1, 1);
  const office = body.destinations[0];
  body.destinations = [office, { ...office, id: 'same-office', label: 'another name', departureTime: '17:00', modes: ['transit', 'car'] }];
  body.maxTransitCalls = 1;
  const result = await h.batch(body);
  assert.equal(result.status, 200);
  assert.equal(result.body.uniquePairCount, 2);
  assert.equal(result.body.requiredTransitCalls, 1);
  assert.equal(result.body.actualTransitCalls, 1);
  assert.equal(result.body.items.length, 2);
  assert.ok(result.body.items.every(item => item.routes.some(route => route.provider === 'kakao-transit' && route.verified)));
  assert.equal(h.calls(), 1);
});

test('preflight counts pending shared requests at zero but rejects a completed old cache value', async () => {
  let release;
  let started;
  const startedGate = new Promise(resolve => { started = resolve; });
  const releaseGate = new Promise(resolve => { release = resolve; });
  const h = harness({ limit: 1, upstream: async () => { started(); await releaseGate; return response(); } });
  const body = batchBody(1, 1);
  const first = h.batch(body);
  await startedGate;
  const joined = h.batch({ ...body, maxTransitCalls: 0 });
  await pause();
  release();
  const [owner, shared] = await Promise.all([first, joined]);
  assert.equal(owner.body.actualTransitCalls, 1);
  assert.equal(shared.status, 200);
  assert.equal(shared.body.requiredTransitCalls, 0);
  assert.equal(shared.body.actualTransitCalls, 0);
  assert.equal(h.calls(), 1);
  const key = createCommuteCacheKey({ provider: 'kakao-transit', origin: ORIGIN, destination: DESTINATION, option: 'publictraffic' });
  h.cache.set(key, { verified: true, durationMinutes: 1 });
  const completed = await h.batch({ ...body, maxTransitCalls: 0 });
  assert.equal(completed.status, 429);
  assert.equal(completed.body.requiredTransitCalls, 1);
  assert.equal(h.calls(), 1);
});

test('provider failure stops queued batch calls, preserves missing evidence and reports only attempts actually sent', async () => {
  const h = harness({ upstream: async () => { await pause(); return response(false, 403); } });
  const result = await h.batch(batchBody());
  assert.equal(result.status, 200);
  assert.ok(h.calls() >= 1 && h.calls() <= 2, 'only requests already started in the concurrency window may fail');
  assert.equal(result.body.actualTransitCalls, h.calls());
  assert.equal((await h.ledger.snapshot()).used, h.calls());
  assert.equal(result.body.abortedPairCount, 30 - h.calls());
  assert.ok(result.body.items.every(item => item.routes.every(route => route.verified === false && route.durationMinutes === null)));
  assert.equal(h.sandbox.providerDiagnostics.transit.kakao.reasonCode, 'HTTP_ERROR');
  assert.equal(h.cache.size, 0);
});

test('route-specific NO_ROUTE is conclusive evidence and does not abort unrelated valid candidates', async () => {
  const h = harness({ upstream: async () => ({ ok: true, status: 200, json: async () => ({ status: 'OK', routes: [] }) }) });
  const result = await h.batch(batchBody(2, 3));
  assert.equal(result.body.actualTransitCalls, 6);
  assert.equal(result.body.abortedPairCount, 0);
  assert.ok(result.body.items.every(item => item.routes[0].reasonCode === 'NO_ROUTE'));
});

test('concurrent unrelated batches report their own attempts and a replacement key or ledger instance keeps daily usage', async () => {
  const h = harness();
  const firstBody = batchBody(1, 1);
  const secondBody = batchBody(1, 1);
  secondBody.origins[0].lat += .01;
  const results = await Promise.all([h.batch(firstBody), h.batch(secondBody)]);
  assert.deepEqual(results.map(result => result.body.actualTransitCalls), [1, 1]);
  assert.equal((await h.ledger.snapshot()).used, 2);
  h.sandbox.kakaoRestApiKey = 'replacement-fixture-key';
  assert.equal((await h.batch(firstBody)).body.actualTransitCalls, 1);
  assert.equal((await h.restartLedger().snapshot()).used, 3);
  assert.equal(h.calls(), 3);
});

test('daily preflight rejects a complete matrix before spending any of an insufficient remaining budget', async () => {
  const h = harness({ limit: 5 });
  const result = await h.batch(batchBody(2, 3));
  assert.equal(result.status, 429);
  assert.equal(result.body.code, 'KAKAO_DAILY_LIMIT');
  assert.equal(result.body.requiredTransitCalls, 6);
  assert.equal(h.calls(), 0);
  assert.equal((await h.ledger.snapshot()).used, 0);
});
