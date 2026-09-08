import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTmapTransitSummary, normalizeKakaoPublicTransit, normalizeNaverDirections5,
  buildTmapTransitSummaryRequest, fetchTmapTransitSummary, fetchKakaoPublicTransit, fetchNaverDirections5,
  TMAP_TRANSIT_DEFAULT_COUNT, TMAP_TRANSIT_CACHE_OPTION, TmapDailyLedger, KakaoDailyLedger, MemoryTtlCache,
  createCommuteCacheKey,
} from '../scripts/commute-provider.mjs';

const origin = { lat: 37.5, lng: 127.03 };
const destination = { lat: 37.4, lng: 127.1 };
const params = { origin, destination, appKey: 'fixture-only', restApiKey: 'fixture-only', clientId: 'fixture-only', clientSecret: 'fixture-only' };
const tmap = itineraries => ({ metaData: { plan: { itineraries } } });
const kakao = routes => ({ status: 'OK', routes });
const step = (type, time, distance) => ({ properties: { type, time, distance } });
const response = payload => ({ ok: true, status: 200, json: async () => payload });

test('TMAP summary preserves provider alternatives and composition without inventing mode durations or counts', () => {
  const payload = tmap([
    { totalTime: 1800, totalWalkTime: 0, transferCount: 0, pathType: 1 },
    { totalTime: 1500, pathType: 2 },
    { totalTime: 1700, pathType: 3 },
  ]);
  const before = structuredClone(payload);
  const result = normalizeTmapTransitSummary(payload);
  assert.equal(result.durationMinutes, 30); // Legacy representative remains provider's first.
  assert.deepEqual(result.routes.map(route => route.transitComposition), ['subway', 'bus', 'mixed']);
  assert.deepEqual(result.routes.map(route => route.durationMinutes), [30, 25, 29]);
  assert.equal(result.walkingMinutes, 0);
  assert.equal(result.walkMinutes, result.walkingMinutes);
  assert.equal(result.transferCount, 0);
  for (const route of result.routes) {
    for (const key of ['busMinutes', 'subwayMinutes', 'busLegCount', 'subwayLegCount']) assert.equal(route[key], null, key);
    assert.equal(Object.hasOwn(route, 'routes'), false);
  }
  assert.equal(result.routes[1].walkingMinutes, null);
  assert.equal(result.routes[1].transferCount, null);
  assert.deepEqual(payload, before);
});

test('invalid duration alternatives are discarded without turning empty, null or boolean values into zero-minute routes', () => {
  const result = normalizeTmapTransitSummary(tmap([
    { totalTime: null }, { totalTime: '' }, { totalTime: false },
    { totalTime: 600, pathType: 5, totalWalkTime: '', transferCount: false },
  ]));
  assert.equal(result.routeCount, 4);
  assert.equal(result.validRouteCount, 1);
  assert.equal(result.routeIndex, 3);
  assert.equal(result.transitComposition, 'unknown');
  assert.equal(result.walkingMinutes, null);
  assert.equal(result.transferCount, null);
  assert.throws(() => normalizeTmapTransitSummary(tmap([{ totalTime: null }])), { code: 'INVALID_RESPONSE' });
});

test('TMAP actual legs sum seconds before rounding and preserve exact ride counts', () => {
  const result = normalizeTmapTransitSummary(tmap([{ totalTime: 900, legs: [
    { mode: 'WALK', sectionTime: 20, distance: 25 },
    { mode: 'BUS', sectionTime: 61 },
    { mode: 'BUS', sectionTime: 61 },
    { mode: 'SUBWAY', sectionTime: 600 },
    { mode: 'WALK', sectionTime: 40, distance: 50 },
  ] }]));
  assert.equal(result.walkingMinutes, 1);
  assert.equal(result.walkDistanceMeters, 75);
  assert.equal(result.busSeconds, 122);
  assert.equal(result.busMinutes, 3);
  assert.equal(result.subwayMinutes, 10);
  assert.equal(result.busLegCount, 2);
  assert.equal(result.subwayLegCount, 1);
  assert.equal(result.transitComposition, 'mixed');
});

test('Kakao preserves fastest and subway alternatives with complete steps proving zero bus legs', () => {
  const result = normalizeKakaoPublicTransit(kakao([
    { properties: { totalTime: 1800, transfers: 0, type: 'SUBWAY' }, steps: [step('WALKING', 120, 150), step('SUBWAY', 1500)] },
    { properties: { totalTime: 1500, transfers: 1, type: 'BUS_AND_SUBWAY' }, steps: [step('walking', 60, 80), step('BUS', 600), step('SUBWAY', 840)] },
  ]));
  assert.equal(result.routeIndex, 1);
  assert.equal(result.busMinutes, 10);
  assert.equal(result.subwayMinutes, 14);
  assert.equal(result.routes[1].busMinutes, 0);
  assert.equal(result.routes[1].busLegCount, 0);
  assert.equal(result.routes[1].subwayLegCount, 1);
  assert.equal(result.routes[1].transitComposition, 'subway');
  assert.equal(result.routes[1].walkingMinutes, 2);
});

test('missing or incomplete Kakao steps remain unknown, while explicit route composition remains usable', () => {
  for (const steps of [undefined, [], [step('BUS', undefined), step('WALKING', 60)], [step('BUS', 300), step('OTHER', 30)]]) {
    const result = normalizeKakaoPublicTransit(kakao([{ properties: { totalTime: 900, type: 'BUS' }, steps }]));
    assert.equal(result.busMinutes, null);
    assert.equal(result.transitComposition, 'bus');
    assert.equal(result.transferCount, null);
    if (!steps?.length || steps.some(row => row.properties.type === 'OTHER')) {
      assert.equal(result.walkingMinutes, null);
      assert.equal(result.busLegCount, null);
    } else {
      assert.equal(result.walkingMinutes, 1);
      assert.equal(result.busLegCount, 1);
    }
  }
});

test('Kakao bus-only and subway-only steps do not prove zero walking or explain the remaining total time', () => {
  const result = normalizeKakaoPublicTransit(kakao([
    { properties: { totalTime: 3180, transfers: 0, type: 'BUS' }, steps: [step('BUS', 1860, 12000)] },
    { properties: { totalTime: 3300, transfers: 1, type: 'SUBWAY' }, steps: [step('SUBWAY', 2400, 20000)] },
  ]));
  assert.equal(result.durationMinutes, 53);
  assert.equal(result.busMinutes, 31);
  assert.equal(result.transferCount, 0, 'Explicit zero transfers remains an observed fact');
  for (const route of result.routes) {
    for (const key of ['walkingMinutes', 'walkMinutes', 'walkSeconds', 'walkDistanceMeters']) assert.equal(route[key], null, key);
    assert.equal(route.walkingTimeSource, 'unavailable');
  }
});

test('Kakao walking evidence distinguishes explicit zero, missing time and summed reported steps', () => {
  const cases = [
    { walks: [step('WALKING', 0, 0)], seconds: 0, distance: 0, source: 'reported-walking-steps' },
    { walks: [step('WALKING', undefined, 150)], seconds: null, distance: 150, source: 'unavailable' },
    { walks: [step('WALKING', 30, 25), step('walking', 31, 35)], seconds: 61, distance: 60, source: 'reported-walking-steps' },
    { walks: [step('WALKING', 30, 25), step('WALKING', null, 35)], seconds: null, distance: 60, source: 'unavailable' },
  ];
  for (const item of cases) {
    const result = normalizeKakaoPublicTransit(kakao([{ properties: { totalTime: 2000, type: 'BUS' }, steps: [step('BUS', 1800), ...item.walks] }]));
    assert.equal(result.walkSeconds, item.seconds);
    assert.equal(result.walkingMinutes, item.seconds === null ? null : Math.ceil(item.seconds / 60));
    assert.equal(result.walkMinutes, result.walkingMinutes);
    assert.equal(result.walkDistanceMeters, item.distance);
    assert.equal(result.walkingTimeSource, item.source);
  }
});

test('NAVER retains driving alternatives and truthful fallback option, with no fabricated transit burdens', () => {
  const result = normalizeNaverDirections5({ code: 0, route: {
    traoptimal: [{ summary: { duration: null } }],
    trafast: [{ summary: { duration: 600001 } }, { summary: { duration: 900000 } }],
  } });
  assert.equal(result.routeOption, 'trafast');
  assert.deepEqual(result.routes.map(route => route.durationMinutes), [11, 15]);
  for (const key of ['walkingMinutes', 'transferCount', 'busMinutes', 'subwayMinutes', 'busLegCount', 'subwayLegCount']) assert.equal(result[key], null, key);
  assert.equal(result.transitComposition, 'unknown');
});

test('TMAP default three alternatives uses one HTTP and one reservation, with a distinct canonical cache key', async () => {
  assert.equal(TMAP_TRANSIT_DEFAULT_COUNT, 3);
  assert.equal(TMAP_TRANSIT_CACHE_OPTION, 'summary:count=3');
  assert.equal(JSON.parse(buildTmapTransitSummaryRequest(params).init.body).count, 3);
  const cache = new MemoryTtlCache();
  const counts = [];
  let reservations = 0;
  const options = { cache, beforeRequest: async () => { reservations += 1; }, fetchImpl: async (_, init) => {
    counts.push(JSON.parse(init.body).count);
    return response(tmap([{ totalTime: 600 }]));
  } };
  const legacyKey = createCommuteCacheKey({ provider: 'tmap-transit', origin, destination, option: 'summary' });
  cache.set(legacyKey, { staleSingleRoute: true });
  const first = await fetchTmapTransitSummary(params, options);
  assert.equal((await fetchTmapTransitSummary({ ...params, count: '03' }, options)), first);
  const newKey = createCommuteCacheKey({ provider: 'tmap-transit', origin, destination, option: TMAP_TRANSIT_CACHE_OPTION });
  assert.equal(cache.get(newKey), first);
  await fetchTmapTransitSummary({ ...params, count: 1 }, options);
  assert.deepEqual(counts, [3, 1]);
  assert.equal(reservations, 2);
});

for (const [name, fetchRoute, payload] of [
  ['TMAP', fetchTmapTransitSummary, tmap([{ totalTime: 600 }])],
  ['Kakao', fetchKakaoPublicTransit, kakao([{ properties: { totalTime: 600 } }])],
  ['NAVER', fetchNaverDirections5, { code: 0, route: { traoptimal: [{ summary: { duration: 600000 } }] } }],
]) {
  test(`${name} deadline includes stalled JSON body and never caches its late result`, { timeout: 1000 }, async () => {
    const cache = new MemoryTtlCache();
    let releaseBody;
    let signal;
    const stalledBody = new Promise(resolve => { releaseBody = resolve; });
    await assert.rejects(fetchRoute(params, { cache, timeoutMs: 20, fetchImpl: async (_, init) => {
      signal = init.signal;
      return { ok: true, status: 200, json: () => stalledBody };
    } }), { code: 'TIMEOUT' });
    assert.equal(signal.aborted, true);
    assert.equal(cache.size, 0);
    releaseBody(payload);
    await Promise.resolve();
    let retryCalls = 0;
    const result = await fetchRoute(params, { cache, fetchImpl: async () => { retryCalls += 1; return response(payload); } });
    assert.equal(retryCalls, 1);
    assert.equal(result.status, 'verified');
    assert.equal(cache.size, name === 'Kakao' ? 0 : 1);
  });
}

test('zero daily limits block an upstream request before fetch while reserve(0) stays read-only', async () => {
  for (const Ledger of [TmapDailyLedger, KakaoDailyLedger]) {
    let writes = 0;
    const ledger = new Ledger({ limit: 0, filePath: 'fixture-only-quota.json', fsImpl: {
      readFile: async () => { throw Object.assign(new Error('fixture absent'), { code: 'ENOENT' }); },
      mkdir: async () => { writes += 1; }, writeFile: async () => { writes += 1; }, rename: async () => { writes += 1; },
    } });
    assert.equal((await ledger.reserve(0)).remaining, 0);
    let fetchCalls = 0;
    await assert.rejects(fetchTmapTransitSummary(params, { beforeRequest: () => ledger.reserve(1), fetchImpl: async () => { fetchCalls += 1; return response(tmap([])); } }), { code: 'DAILY_LIMIT' });
    assert.equal(fetchCalls, 0);
    assert.equal(writes, 0);
  }
});
