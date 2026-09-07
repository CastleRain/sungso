import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudCommuteService } from '../server/commute-service.mjs';
import { createFirestoreProviderQuota } from '../server/provider-quota.mjs';
import { createMemoryFirestore } from './helpers/firestore-memory.mjs';

const epoch = Date.parse('2026-09-08T01:00:00Z');
const origin = { lat: 37.3, lng: 127.1 };
const destination = { lat: 37.4, lng: 127.2 };
const body = { origin, destination, modes: ['transit'], departureTime: '08:00' };
const env = { KAKAO_REST_API_KEY: 'not-a-real-kakao-key', TMAP_APP_KEY: 'not-a-real-tmap-key',
  NAVER_MAPS_CLIENT_ID: 'not-a-real-id', NAVER_MAPS_CLIENT_SECRET: 'not-a-real-secret' };
const tmap = { metaData: { requestParameters: { reqDttm: '20260908100000' }, plan: { itineraries: [
  { totalTime: 2400, totalWalkTime: 360, totalDistance: 12000, totalWalkDistance: 450, transferCount: 1, pathType: 1 },
] } } };
const kakao = { status: 'OK', routes: [{ properties: { totalTime: 2700, totalDistance: 14000, transfers: 2, type: 'BUS_AND_SUBWAY' },
  steps: [{ properties: { type: 'WALKING', time: 600 } }, { properties: { type: 'SUBWAY', time: 1800 } }, { properties: { type: 'BUS', time: 300 } }] }] };
const car = { code: 0, route: { traoptimal: [{ summary: { duration: 1800000, distance: 10000 } }] } };
const json = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const batchBody = (count = 2, destinations = 2) => ({
  origins: Array.from({ length: count }, (_, i) => ({ id: `house-${i}`, lat: 37.3 + i * .01, lng: 127.1 })),
  destinations: Array.from({ length: destinations }, (_, i) => ({ id: `company-${i}`, lat: 37.4 + i * .01, lng: 127.2,
    modes: ['transit'], maxMinutes: 60, departureTime: '08:00' })),
  maxTransitCalls: 30,
});
function setup(options = {}) {
  const db = options.db || createMemoryFirestore();
  const requests = [];
  const service = createCloudCommuteService({ db, env, now: () => epoch,
    fetchImpl: async (url, init) => { requests.push({ url, init }); return json(url.includes('openapi.sk.com') ? tmap : url.includes('ntruss.com') ? car : kakao); },
    ...options });
  return { service, db, requests };
}

test('cloud configuration and quota contain public state but never credentials', async () => {
  const { service } = setup();
  const config = service.configuration();
  assert.equal(config.transitProvider, 'kakao');
  assert.equal(config.transitConfigured, true);
  assert.equal(config.carConfigured, true);
  assert.equal(config.cache.car, 'live-only/current-view');
  assert.equal(config.cache.tmap, 'firestore-8-hours');
  const quota = await service.quota();
  assert.equal(quota.kakao.remaining, 1000);
  assert.equal(quota.tmap.remaining, 10);
  assert.doesNotMatch(JSON.stringify([config, quota]), /not-a-real|apiKey|clientSecret/);
});

test('Kakao repeated single calls are live and counted twice without a Firestore route record', async () => {
  const { service, requests, db } = setup();
  const first = await service.single(body);
  const second = await service.single({ ...body, departureTime: '09:00' });
  assert.equal(first.routes[0].durationMinutes, 45);
  assert.equal(first.actualTransitCalls, 1);
  assert.equal(second.actualTransitCalls, 1);
  assert.equal(requests.length, 2);
  assert.equal((await service.quota()).kakao.used, 2);
  assert.ok([...db.documents.keys()].every(key => key.startsWith('homehunt_provider_usage/')));
  assert.doesNotMatch(JSON.stringify([...db.documents.values()]), /duration|walking|transfers|37\.3/);
});

test('TMAP pair reuses Firestore after a new server instance without another quota charge', async () => {
  const { service, db, requests } = setup({ env: { ...env, TMAP_DAILY_LIMIT: '1' } });
  const first = await service.single({ ...body, transitProvider: 'tmap' });
  assert.equal(first.routes[0].cacheHit, false);
  assert.equal(first.actualTransitCalls, 1);
  assert.equal(requests.length, 1);
  const restarted = setup({ db, env: { ...env, TMAP_DAILY_LIMIT: '1' } });
  const second = await restarted.service.single({ ...body, transitProvider: 'tmap', companyWeights: [90, 10] });
  assert.equal(second.routes[0].cacheHit, true);
  assert.equal(second.actualTransitCalls, 0);
  assert.equal(restarted.requests.length, 0);
  assert.equal((await restarted.service.quota()).tmap.used, 1);
});

test('an expired TMAP entry causes a new request instead of reusing its old duration', async () => {
  let now = epoch;
  const setupResult = setup({ now: () => now });
  await setupResult.service.single({ ...body, transitProvider: 'tmap' });
  now += 8 * 60 * 60 * 1000;
  const result = await setupResult.service.single({ ...body, transitProvider: 'tmap' });
  assert.equal(result.actualTransitCalls, 1);
  assert.equal(result.routes[0].cacheHit, false);
  assert.equal(setupResult.requests.length, 2);
});

test('NAVER car results are not cached or charged against transit usage', async () => {
  const { service, db, requests } = setup();
  await service.single({ ...body, modes: ['car'] });
  const result = await service.single({ ...body, modes: ['car'] });
  assert.equal(result.routes[0].durationMinutes, 30);
  assert.equal(result.actualTransitCalls, 0);
  assert.equal(requests.length, 2);
  assert.equal(db.documents.size, 0);
});

test('batch returns the local API matrix shape with precise call accounting', async () => {
  const { service, requests } = setup();
  const result = await service.batch(batchBody());
  assert.equal(result.items.length, 4);
  assert.equal(result.items[0].originId, 'house-0');
  assert.equal(result.items[0].destinationId, 'company-0');
  assert.equal(result.items[0].routes[0].verified, true);
  assert.equal(result.requestedPairCount, 4);
  assert.equal(result.uniquePairCount, 4);
  assert.equal(result.requiredTransitCalls, 4);
  assert.equal(result.actualTransitCalls, 4);
  assert.equal(result.quota.kakao.used, 4);
  assert.equal(requests.length, 4);
});

test('same route under different destination IDs/modes is charged once within a batch', async () => {
  const { service, requests } = setup();
  const input = batchBody(1, 2);
  input.destinations[1] = { ...input.destinations[0], id: 'company-alias', departureTime: '17:00', modes: ['car', 'transit'] };
  const result = await service.batch(input);
  assert.equal(result.items.length, 2);
  assert.equal(result.requiredTransitCalls, 1);
  assert.equal(result.actualTransitCalls, 1);
  assert.equal(requests.length, 2); // one transit and one car
  assert.equal(result.items[1].routes.length, 2);
  assert.equal(result.items[1].departureTime, '17:00');
  const again = await service.batch(input);
  assert.equal(again.actualTransitCalls, 1);
  assert.equal(requests.length, 4);
});

test('overlapping single requests share only an in-progress result and limit concurrent fetches to two', async () => {
  let active = 0, maximum = 0, calls = 0;
  const { service } = setup({ fetchImpl: async () => {
    calls++; active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return json(kakao);
  } });
  const requests = Array.from({ length: 6 }, (_, index) => ({ ...body,
    origin: { ...origin, lat: origin.lat + Math.floor(index / 2) * .01 } }));
  const results = await Promise.all(requests.map(input => service.single(input)));
  assert.equal(calls, 3);
  assert.equal(maximum, 2);
  assert.equal(results.reduce((total, value) => total + value.actualTransitCalls, 0), 3);
  assert.equal((await service.quota()).kakao.used, 3);
  await service.single(body);
  assert.equal(calls, 4);
});

test('exact duplicate pairs retain every origin/destination ID in the response', async () => {
  const { service } = setup();
  const input = batchBody(2, 1);
  input.origins[1] = { ...input.origins[0], id: 'other-home-same-building' };
  const result = await service.batch(input);
  assert.equal(result.requestedPairCount, 2);
  assert.equal(result.uniquePairCount, 1);
  assert.equal(result.deduplicatedPairCount, 1);
  assert.equal(result.actualTransitCalls, 1);
  assert.equal(result.items[1].originId, 'other-home-same-building');
});

test('TMAP batch preflight counts only cache misses and allows an all-hit zero-call batch', async () => {
  const { service, requests } = setup();
  const input = { ...batchBody(1, 2), transitProvider: 'tmap' };
  await service.batch(input);
  const result = await service.batch({ ...input, maxTransitCalls: 0 });
  assert.equal(result.requiredTransitCalls, 0);
  assert.equal(result.actualTransitCalls, 0);
  assert.equal(requests.length, 2);
  assert.ok(result.items.every(item => item.routes[0].cacheHit));
});

test('whole-batch preflight checks client and remaining daily caps before any upstream call', async () => {
  const first = setup();
  await assert.rejects(first.service.batch({ ...batchBody(2, 2), maxTransitCalls: 3 }), { code: 'TRANSIT_PREFLIGHT_LIMIT', status: 429 });
  assert.equal(first.requests.length, 0);
  const second = setup({ env: { ...env, KAKAO_DAILY_LIMIT: '3' } });
  await assert.rejects(second.service.batch(batchBody(2, 2)), { code: 'KAKAO_DAILY_LIMIT', status: 429 });
  assert.equal(second.requests.length, 0);
  assert.equal((await second.service.quota()).kakao.used, 0);
});

test('provider failures stop queued work without charging unstarted pairs', async () => {
  let calls = 0;
  const { service } = setup({ fetchImpl: async () => { calls++; return json({ errorType: 'NotAuthorizedError' }, 403); } });
  const result = await service.batch(batchBody(5, 3));
  assert.ok(calls <= 2);
  assert.equal(result.actualTransitCalls, calls);
  assert.ok(result.abortedPairCount >= 13);
  assert.equal(result.quota.kakao.used, calls);
  assert.ok(result.items.some(item => item.routes[0].reasonCode === 'BATCH_ABORTED'));
  assert.equal(service.configuration().diagnostics.transit.kakao.state, 'error');
});

test('authoritative no-route answers do not stop unrelated pairs', async () => {
  let calls = 0;
  const { service } = setup({ fetchImpl: async () => { calls++; return json({ status: 'OK', routes: [] }); } });
  const result = await service.batch(batchBody());
  assert.equal(calls, 4);
  assert.equal(result.actualTransitCalls, 4);
  assert.equal(result.abortedPairCount, 0);
});

test('invalid batch dimensions and unconfigured provider overrides perform no fetch', async () => {
  const { service, requests } = setup({ env: { KAKAO_REST_API_KEY: env.KAKAO_REST_API_KEY } });
  for (const [input, code] of [
    [batchBody(11, 1), 'INVALID_ORIGINS'], [batchBody(1, 9), 'INVALID_DESTINATIONS'],
    [{ ...batchBody(), maxTransitCalls: 31 }, 'INVALID_MAX_TRANSIT_CALLS'],
    [{ ...batchBody(), maxTransitCalls: -1 }, 'INVALID_MAX_TRANSIT_CALLS'],
    [{ ...batchBody(), transitProvider: 'tmap' }, 'TRANSIT_NOT_CONFIGURED'],
  ]) await assert.rejects(service.batch(input), { code });
  await assert.rejects(service.single({ ...body, origin: { lat: false, lng: 127 } }), { code: 'INVALID_COORDINATES' });
  await assert.rejects(service.single({ ...body, departureTime: '25:00' }), { code: 'INVALID_DEPARTURE_TIME' });
  await assert.rejects(service.single({ ...body, transitProvider: 'other' }), { code: 'INVALID_TRANSIT_PROVIDER' });
  assert.equal(requests.length, 0);
});

test('atomic reservation remains safe when another server consumes quota after preflight', async () => {
  const db = createMemoryFirestore();
  const competing = createFirestoreProviderQuota({ db, now: () => epoch, limits: { kakao: 1 } });
  const run = db.runTransaction.bind(db);
  let raced = false;
  db.runTransaction = async action => {
    if (!raced) { raced = true; await competing.reserve('kakao'); }
    return run(action);
  };
  const { service, requests } = setup({ db, env: { ...env, KAKAO_DAILY_LIMIT: '1' } });
  const result = await service.batch(batchBody(1, 1));
  assert.equal(requests.length, 0);
  assert.equal(result.actualTransitCalls, 0);
  assert.equal(result.items[0].routes[0].reasonCode, 'DAILY_LIMIT');
  assert.equal(result.quota.kakao.used, 1);
});

test('bounded batch timeout aborts active requests and leaves the remaining queue uncalled', async () => {
  let calls = 0, aborted = 0;
  const { service } = setup({ batchTimeoutMs: 30, requestTimeoutMs: 1000,
    fetchImpl: async (_url, init) => {
      calls++;
      return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => { aborted++; reject(new Error('aborted')); }, { once: true });
      });
    },
  });
  const started = Date.now();
  const result = await service.batch(batchBody(5, 3));
  assert.ok(Date.now() - started < 1000);
  assert.equal(calls, 2);
  assert.equal(aborted, 2);
  assert.equal(result.actualTransitCalls, 2);
  assert.equal(result.abortedPairCount, 15);
  assert.equal(result.quota, null);
});
