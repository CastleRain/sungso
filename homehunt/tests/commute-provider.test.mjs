import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  KAKAO_PUBLIC_TRANSIT_ENDPOINT,
  MAX_MEMORY_CACHE_TTL_MS,
  NAVER_DIRECTIONS5_ENDPOINT,
  TMAP_TRANSIT_SUMMARY_ENDPOINT,
  CommuteProviderError,
  KakaoDailyLedger,
  MemoryTtlCache,
  TmapDailyLedger,
  buildKakaoPublicTransitRequest,
  buildNaverDirections5Request,
  buildTmapTransitSummaryRequest,
  createCommuteCacheKey,
  fetchKakaoPublicTransit,
  fetchNaverDirections5,
  fetchTmapTransitSummary,
  kstDateKey,
  normalizeKakaoPublicTransit,
  normalizeNaverDirections5,
  normalizeTmapTransitSummary,
} from '../scripts/commute-provider.mjs';

const ORIGIN = { lat: 37.5665, lng: 126.978 };
const DESTINATION = { lat: 37.3947, lng: 127.1112 };
const TEST_TMAP_KEY = 'not-a-real-tmap-key';
const TEST_KAKAO_KEY = 'not-a-real-kakao-rest-key';
const TEST_NAVER_ID = 'not-a-real-naver-id';
const TEST_NAVER_SECRET = 'not-a-real-naver-secret';

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

function tmapPayload() {
  return {
    metaData: {
      requestParameters: { reqDttm: '20260903173000' },
      plan: {
        itineraries: [
          {
            totalTime: 1_100,
            totalWalkTime: 282,
            totalDistance: 4_343,
            transferCount: 1,
            pathType: 2,
            fare: { regular: { totalFare: 1_400 } },
          },
          { totalTime: 1_300 },
        ],
      },
    },
  };
}

function naverPayload() {
  return {
    code: 0,
    currentDateTime: '2026-09-03T17:30:00+09:00',
    route: {
      traoptimal: [
        {
          summary: {
            duration: 3_600_001,
            distance: 42_345,
            departureTime: '2026-09-03T17:30:00+09:00',
            tollFare: 2_000,
            taxiFare: 41_000,
            fuelPrice: 5_200,
          },
        },
      ],
    },
  };
}

function kakaoPayload() {
  return {
    status: 'OK',
    properties: { landingURL: 'https://map.kakao.com/example' },
    routes: [
      {
        properties: {
          totalTime: 3_000,
          totalDistance: 25_000,
          transfers: 2,
          fare: { value: 1_550, min: 1_450, max: 1_650 },
          type: 'SUBWAY',
        },
        steps: [
          { properties: { type: 'WALKING', time: 180, distance: 210 } },
          { properties: { type: 'SUBWAY', time: 2_400, distance: 23_000 } },
          { properties: { type: 'WALKING', time: 420, distance: 490 } },
        ],
      },
      {
        properties: {
          totalTime: 2_701,
          totalDistance: 21_500,
          transfers: 1,
          fare: { value: 1_500, min: 1_400, max: 1_600 },
          type: 'BUS_AND_SUBWAY',
        },
        steps: [
          { properties: { type: 'WALKING', time: 125, distance: 160 } },
          { properties: { type: 'BUS', time: 900, distance: 8_000 } },
          { properties: { type: 'walking', time: 176, distance: 240 } },
          { properties: { type: 'SUBWAY', time: 1_500, distance: 13_100 } },
        ],
      },
    ],
  };
}

test('builds the documented TMAP transit summary POST without putting the key in the URL or body', () => {
  const request = buildTmapTransitSummaryRequest({
    origin: ORIGIN,
    destination: DESTINATION,
    appKey: TEST_TMAP_KEY,
    searchDateTime: '202609040830',
    count: 3,
  });

  assert.equal(request.url, TMAP_TRANSIT_SUMMARY_ENDPOINT);
  assert.equal(request.init.method, 'POST');
  assert.deepEqual(request.init.headers, {
    accept: 'application/json',
    appKey: TEST_TMAP_KEY,
    'content-type': 'application/json',
  });
  assert.deepEqual(JSON.parse(request.init.body), {
    startX: '126.978',
    startY: '37.5665',
    endX: '127.1112',
    endY: '37.3947',
    count: 3,
    lang: 0,
    format: 'json',
    searchDttm: '202609040830',
  });
  assert.equal(request.url.includes(TEST_TMAP_KEY), false);
  assert.equal(request.init.body.includes(TEST_TMAP_KEY), false);
});

test('validates TMAP count, date-time, and credentials before a request can be sent', () => {
  const base = { origin: ORIGIN, destination: DESTINATION, appKey: TEST_TMAP_KEY };

  assert.throws(() => buildTmapTransitSummaryRequest({ ...base, count: 0 }), RangeError);
  assert.throws(() => buildTmapTransitSummaryRequest({ ...base, count: 11 }), RangeError);
  assert.throws(
    () => buildTmapTransitSummaryRequest({ ...base, searchDateTime: '2026-09-04 08:30' }),
    TypeError,
  );
  assert.throws(
    () => buildTmapTransitSummaryRequest({ ...base, appKey: '' }),
    (error) => error instanceof CommuteProviderError && error.code === 'MISSING_CREDENTIAL',
  );
});

test('normalizes TMAP seconds, walking, transfers, distance, and fare', () => {
  assert.deepEqual(normalizeTmapTransitSummary(tmapPayload()), {
    provider: 'tmap-transit',
    mode: 'transit',
    verified: true,
    status: 'verified',
    durationMinutes: 19,
    durationSeconds: 1_100,
    distanceMeters: 4_343,
    walkMinutes: 5,
    walkSeconds: 282,
    transferCount: 1,
    fareWon: 1_400,
    pathType: 2,
    routeCount: 2,
    requestedAt: '20260903173000',
  });
});

test('returns an explicitly unavailable TMAP result instead of inventing a commute time', () => {
  assert.deepEqual(
    normalizeTmapTransitSummary({ metaData: { plan: { error: { id: '11' } } } }),
    {
      provider: 'tmap-transit',
      mode: 'transit',
      verified: false,
      status: 'unavailable',
      reasonCode: 'TMAP_11',
      durationMinutes: null,
      distanceMeters: null,
    },
  );
});

test('builds Kakao public transit GET with WGS84 coordinates and the REST key only in Authorization', () => {
  const request = buildKakaoPublicTransitRequest({
    origin: ORIGIN,
    destination: DESTINATION,
    restApiKey: TEST_KAKAO_KEY,
  });
  const url = new URL(request.url);

  assert.equal(`${url.origin}${url.pathname}`, KAKAO_PUBLIC_TRANSIT_ENDPOINT);
  assert.equal(url.searchParams.get('start_x'), '126.978');
  assert.equal(url.searchParams.get('start_y'), '37.5665');
  assert.equal(url.searchParams.get('end_x'), '127.1112');
  assert.equal(url.searchParams.get('end_y'), '37.3947');
  assert.equal(url.searchParams.get('input_coord'), 'WGS84');
  assert.equal(url.searchParams.get('output_coord'), 'WGS84');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.headers.Authorization, `KakaoAK ${TEST_KAKAO_KEY}`);
  assert.equal(request.url.includes(TEST_KAKAO_KEY), false);
});

test('selects the fastest Kakao route and normalizes transfer, fare, and summed walking steps', () => {
  assert.deepEqual(normalizeKakaoPublicTransit(kakaoPayload()), {
    provider: 'kakao-transit',
    mode: 'transit',
    verified: true,
    status: 'verified',
    durationMinutes: 46,
    durationSeconds: 2_701,
    distanceMeters: 21_500,
    walkMinutes: 6,
    walkSeconds: 301,
    walkDistanceMeters: 400,
    transferCount: 1,
    fareWon: 1_500,
    fareMinWon: 1_400,
    fareMaxWon: 1_600,
    routeType: 'BUS_AND_SUBWAY',
    routeCount: 2,
    landingUrl: 'https://map.kakao.com/example',
    timeBasis: 'provider-default-no-departure-parameter',
  });
});

test('returns an explicitly unavailable Kakao result when no usable route exists', () => {
  assert.deepEqual(normalizeKakaoPublicTransit({ status: 'NO_ROUTE', routes: [] }), {
    provider: 'kakao-transit',
    mode: 'transit',
    verified: false,
    status: 'unavailable',
    reasonCode: 'KAKAO_NO_ROUTE',
    durationMinutes: null,
    distanceMeters: null,
  });
});

test('builds the documented NAVER Directions 5 GET with server credentials only in headers', () => {
  const request = buildNaverDirections5Request({
    origin: ORIGIN,
    destination: DESTINATION,
    clientId: TEST_NAVER_ID,
    clientSecret: TEST_NAVER_SECRET,
  });
  const url = new URL(request.url);

  assert.equal(`${url.origin}${url.pathname}`, NAVER_DIRECTIONS5_ENDPOINT);
  assert.equal(url.searchParams.get('start'), '126.978,37.5665');
  assert.equal(url.searchParams.get('goal'), '127.1112,37.3947');
  assert.equal(url.searchParams.get('option'), 'traoptimal');
  assert.equal(request.init.method, 'GET');
  assert.deepEqual(request.init.headers, {
    accept: 'application/json',
    'x-ncp-apigw-api-key-id': TEST_NAVER_ID,
    'x-ncp-apigw-api-key': TEST_NAVER_SECRET,
  });
  assert.equal(request.url.includes(TEST_NAVER_ID), false);
  assert.equal(request.url.includes(TEST_NAVER_SECRET), false);
});

test('normalizes NAVER Directions 5 millisecond duration and driving costs', () => {
  assert.deepEqual(normalizeNaverDirections5(naverPayload()), {
    provider: 'naver-directions5',
    mode: 'car',
    verified: true,
    status: 'verified',
    routeOption: 'traoptimal',
    durationMinutes: 61,
    durationMilliseconds: 3_600_001,
    distanceMeters: 42_345,
    departureAt: '2026-09-03T17:30:00+09:00',
    tollFareWon: 2_000,
    taxiFareWon: 41_000,
    fuelPriceWon: 5_200,
  });
});

test('returns an explicitly unavailable NAVER result when the provider reports no route', () => {
  assert.deepEqual(normalizeNaverDirections5({ code: 1, message: 'no route' }), {
    provider: 'naver-directions5',
    mode: 'car',
    verified: false,
    status: 'unavailable',
    reasonCode: 'NAVER_1',
    durationMinutes: null,
    distanceMeters: null,
  });
});

test('memory cache clamps TTL below 24 hours and expires without disk persistence', () => {
  let timestamp = 0;
  const cache = new MemoryTtlCache({
    ttlMs: 48 * 60 * 60_000,
    now: () => timestamp,
  });

  assert.equal(cache.ttlMs, MAX_MEMORY_CACHE_TTL_MS);
  cache.set('commute', { durationMinutes: 42 }, { ttlMs: 24 * 60 * 60_000 });
  timestamp = MAX_MEMORY_CACHE_TTL_MS - 1;
  assert.deepEqual(cache.get('commute'), { durationMinutes: 42 });
  timestamp = MAX_MEMORY_CACHE_TTL_MS;
  assert.equal(cache.get('commute'), undefined);
  assert.equal(cache.size, 0);
});

test('TMAP fetch wrapper reserves only once and deduplicates identical cached requests', async () => {
  let calls = 0;
  let reservations = 0;
  const timestamp = Date.UTC(2026, 8, 3, 8, 30);
  const cache = new MemoryTtlCache({ now: () => timestamp });
  const fetchImpl = async (url, init) => {
    calls += 1;
    assert.equal(url, TMAP_TRANSIT_SUMMARY_ENDPOINT);
    assert.equal(init.headers.appKey, TEST_TMAP_KEY);
    return jsonResponse(tmapPayload());
  };
  const params = {
    origin: ORIGIN,
    destination: DESTINATION,
    appKey: TEST_TMAP_KEY,
    searchDateTime: '202609040830',
  };

  const [first, second] = await Promise.all([
    fetchTmapTransitSummary(params, {
      fetchImpl,
      cache,
      now: () => timestamp,
      beforeRequest: async () => { reservations += 1; },
    }),
    fetchTmapTransitSummary(params, {
      fetchImpl,
      cache,
      now: () => timestamp,
      beforeRequest: async () => { reservations += 1; },
    }),
  ]);

  assert.equal(calls, 1);
  assert.equal(reservations, 1);
  assert.strictEqual(first, second);
  assert.equal(first.durationMinutes, 19);
  assert.equal(first.queriedAt, '2026-09-03T08:30:00.000Z');
});

test('Kakao fetch wrapper caches and deduplicates identical route requests', async () => {
  let calls = 0;
  let reservations = 0;
  const timestamp = Date.UTC(2026, 8, 3, 8, 30);
  const cache = new MemoryTtlCache({ ttlMs: 8 * 60 * 60_000, now: () => timestamp });
  const fetchImpl = async (url, init) => {
    calls += 1;
    assert.equal(new URL(url).pathname, '/v2/routing/publictraffic');
    assert.equal(init.headers.Authorization, `KakaoAK ${TEST_KAKAO_KEY}`);
    return jsonResponse(kakaoPayload());
  };
  const params = {
    origin: ORIGIN,
    destination: DESTINATION,
    restApiKey: TEST_KAKAO_KEY,
  };

  const [first, second] = await Promise.all([
    fetchKakaoPublicTransit(params, {
      fetchImpl,
      cache,
      now: () => timestamp,
      beforeRequest: async () => { reservations += 1; },
    }),
    fetchKakaoPublicTransit(params, {
      fetchImpl,
      cache,
      now: () => timestamp,
      beforeRequest: async () => { reservations += 1; },
    }),
  ]);

  assert.equal(calls, 1);
  assert.equal(reservations, 1);
  assert.strictEqual(first, second);
  assert.equal(first.durationMinutes, 46);
  assert.equal(first.queriedAt, '2026-09-03T08:30:00.000Z');
});

test('Kakao ledger defaults to 1,000 calls, persists counts only, and blocks before overflow', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'homehunt-kakao-ledger-'));
  const filePath = path.join(directory, 'usage.json');
  const timestamp = Date.parse('2026-09-04T01:00:00.000Z');
  try {
    const defaultLedger = new KakaoDailyLedger({ filePath, now: () => timestamp });
    assert.equal((await defaultLedger.snapshot()).limit, 1_000);

    const guardedLedger = new KakaoDailyLedger({ filePath, limit: 2, now: () => timestamp });
    const quota = await guardedLedger.reserve(1);
    assert.equal(quota.provider, 'kakao-transit');
    assert.equal(quota.used, 1);
    assert.equal(quota.remaining, 1);
    await assert.rejects(
      guardedLedger.reserve(2),
      (error) => error instanceof CommuteProviderError
        && error.provider === 'kakao-transit'
        && error.code === 'DAILY_LIMIT',
    );

    const envelope = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(Object.keys(envelope).sort(), ['days', 'schemaVersion', 'timeZone']);
    assert.deepEqual(Object.keys(envelope.days['2026-09-04']).sort(), ['updatedAt', 'used']);
    assert.equal(JSON.stringify(envelope).includes(TEST_KAKAO_KEY), false);
    assert.equal(JSON.stringify(envelope).includes('routes'), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('TMAP ledger persists upstream misses, enforces the limit, and resets on the KST date', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'homehunt-tmap-ledger-'));
  const filePath = path.join(directory, 'usage.json');
  let timestamp = Date.parse('2026-09-03T14:59:59.000Z');
  try {
    assert.equal(kstDateKey(() => timestamp), '2026-09-03');
    const first = new TmapDailyLedger({ filePath, limit: 3, now: () => timestamp });
    assert.deepEqual(
      (({ date, used, limit, remaining }) => ({ date, used, limit, remaining }))(await first.reserve(2)),
      { date: '2026-09-03', used: 2, limit: 3, remaining: 1 },
    );

    const reloaded = new TmapDailyLedger({ filePath, limit: 3, now: () => timestamp });
    assert.equal((await reloaded.snapshot()).used, 2);
    await assert.rejects(
      reloaded.reserve(2),
      (error) => error instanceof CommuteProviderError && error.code === 'DAILY_LIMIT',
    );
    assert.equal((await reloaded.snapshot()).used, 2);

    timestamp = Date.parse('2026-09-03T15:00:00.000Z');
    assert.equal(kstDateKey(() => timestamp), '2026-09-04');
    assert.deepEqual(
      (({ date, used, limit, remaining }) => ({ date, used, limit, remaining }))(await reloaded.snapshot()),
      { date: '2026-09-04', used: 0, limit: 3, remaining: 3 },
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('NAVER fetch wrapper caches by route inputs without exposing either credential in its key', async () => {
  let calls = 0;
  const timestamp = Date.UTC(2026, 8, 3, 8, 30);
  const cache = new MemoryTtlCache({ now: () => timestamp });
  const fetchImpl = async (url, init) => {
    calls += 1;
    assert.equal(init.headers['x-ncp-apigw-api-key-id'], TEST_NAVER_ID);
    assert.equal(init.headers['x-ncp-apigw-api-key'], TEST_NAVER_SECRET);
    return jsonResponse(naverPayload());
  };
  const params = {
    origin: ORIGIN,
    destination: DESTINATION,
    clientId: TEST_NAVER_ID,
    clientSecret: TEST_NAVER_SECRET,
  };

  const first = await fetchNaverDirections5(params, { fetchImpl, cache, now: () => timestamp });
  const second = await fetchNaverDirections5(params, { fetchImpl, cache, now: () => timestamp });
  const cacheKey = createCommuteCacheKey({
    provider: 'naver-directions5',
    origin: ORIGIN,
    destination: DESTINATION,
    option: 'traoptimal',
  });

  assert.equal(calls, 1);
  assert.strictEqual(first, second);
  assert.equal(first.durationMinutes, 61);
  assert.equal(cacheKey.includes(TEST_NAVER_ID), false);
  assert.equal(cacheKey.includes(TEST_NAVER_SECRET), false);
});

test('provider HTTP errors carry status but do not echo credentials', async () => {
  await assert.rejects(
    fetchNaverDirections5(
      {
        origin: ORIGIN,
        destination: DESTINATION,
        clientId: TEST_NAVER_ID,
        clientSecret: TEST_NAVER_SECRET,
      },
      { fetchImpl: async () => jsonResponse({}, { ok: false, status: 401 }) },
    ),
    (error) => {
      assert.equal(error instanceof CommuteProviderError, true);
      assert.equal(error.code, 'HTTP_ERROR');
      assert.equal(error.httpStatus, 401);
      assert.equal(error.message.includes(TEST_NAVER_ID), false);
      assert.equal(error.message.includes(TEST_NAVER_SECRET), false);
      return true;
    },
  );
});

test('maps Kakao disabled map service errors without exposing the provider body or REST key', async () => {
  const providerMessage = `App(test) disabled OPEN_MAP_AND_LOCAL service. ${TEST_KAKAO_KEY}`;
  await assert.rejects(
    fetchKakaoPublicTransit(
      {
        origin: ORIGIN,
        destination: DESTINATION,
        restApiKey: TEST_KAKAO_KEY,
      },
      {
        fetchImpl: async () => jsonResponse(
          { errorType: 'NotAuthorizedError', message: providerMessage },
          { ok: false, status: 403 },
        ),
      },
    ),
    (error) => {
      assert.equal(error instanceof CommuteProviderError, true);
      assert.equal(error.code, 'KAKAO_MAP_SERVICE_DISABLED');
      assert.equal(error.httpStatus, 403);
      assert.equal(error.message.includes(providerMessage), false);
      assert.equal(error.message.includes(TEST_KAKAO_KEY), false);
      assert.equal(JSON.stringify(error).includes(TEST_KAKAO_KEY), false);
      return true;
    },
  );
});

test('keeps unrelated Kakao 403 responses as generic HTTP errors', async () => {
  await assert.rejects(
    fetchKakaoPublicTransit(
      {
        origin: ORIGIN,
        destination: DESTINATION,
        restApiKey: TEST_KAKAO_KEY,
      },
      {
        fetchImpl: async () => jsonResponse(
          { errorType: 'NotAuthorizedError', message: 'Another Kakao product is disabled.' },
          { ok: false, status: 403 },
        ),
      },
    ),
    (error) => {
      assert.equal(error.code, 'HTTP_ERROR');
      assert.equal(error.httpStatus, 403);
      return true;
    },
  );
});
