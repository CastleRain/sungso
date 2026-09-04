import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = path.resolve(TEST_DIR, '../scripts/local-market-server.mjs');
const ORIGIN = { lat: 37.5665, lng: 126.978 };
const DESTINATION = { lat: 37.3947, lng: 127.1112 };

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function waitForStartup(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`server startup timed out\n${output}`)), 15_000);
    const receive = (chunk) => {
      output += chunk.toString();
      if (!output.includes('HomeHunt local market API:')) return;
      clearTimeout(timeout);
      child.off('exit', exited);
      resolve(output);
    };
    const exited = (code) => {
      clearTimeout(timeout);
      reject(new Error(`server exited with ${code}\n${output}`));
    };
    child.stdout.on('data', receive);
    child.stderr.on('data', receive);
    child.once('exit', exited);
  });
}

async function requestJson(baseUrl, pathname, init) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  return { status: response.status, body: await response.json() };
}

async function stopServer(child) {
  child.kill();
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else {
      child.once('exit', resolve);
      setTimeout(resolve, 2_000).unref();
    }
  });
}

test('local commute server exposes v2 quota, compatible single lookup, and deduplicated batch contract', { timeout: 30_000 }, async () => {
  const port = await unusedPort();
  const child = spawn(process.execPath, [SERVER_SCRIPT], {
    cwd: path.resolve(TEST_DIR, '../..'),
    env: {
      ...process.env,
      HOMEHUNT_LOCAL_API_PORT: String(port),
      MOLIT_SERVICE_KEY: '',
      TMAP_APP_KEY: '',
      KAKAO_REST_API_KEY: '',
      NAVER_MAPS_CLIENT_ID: '',
      NAVER_MAPS_CLIENT_SECRET: '',
      NAVER_LOCAL_SEARCH_CLIENT_ID: '',
      NAVER_LOCAL_SEARCH_CLIENT_SECRET: '',
      TRANSIT_PROVIDER: 'auto',
      TMAP_DAILY_LIMIT: '7',
      KAKAO_DAILY_LIMIT: '13',
      TRANSIT_CACHE_HOURS: '8',
      TRANSIT_CONCURRENCY: '2',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForStartup(child);

    const health = await requestJson(baseUrl, '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.version, '2.5.0');
    assert.equal(health.body.supply.configured, false);
    assert.deepEqual(health.body.supply.providers, ['applyhome', 'lh', 'sh']);
    assert.deepEqual(health.body.supply.publicProviders, ['sh']);

    const supply = await requestJson(baseUrl, '/api/supply');
    assert.equal(supply.status, 200);
    assert.equal(Array.isArray(supply.body.notices), true);
    assert.equal(supply.body.local.keyConfigured, false);
    assert.equal(health.body.commute.transitProvider, 'tmap');
    assert.equal(health.body.commute.transitConfigured, false);
    assert.equal(health.body.commute.providers.kakaoTransitConfigured, false);
    assert.equal(health.body.commute.providers.tmapTransitConfigured, false);
    assert.equal(health.body.limits.tmapDailyLimit, 7);
    assert.equal(health.body.limits.kakaoDailyLimit, 13);
    assert.equal(health.body.commute.kakaoQuota.limit, 13);
    assert.equal(health.body.limits.transitCacheHours, 8);
    assert.equal(health.body.limits.transitConcurrency, 2);

    const quota = await requestJson(baseUrl, '/api/commute/quota');
    assert.equal(quota.status, 200);
    assert.equal(quota.body.ok, true);
    assert.equal(quota.body.provider, 'tmap');
    assert.equal(quota.body.transitConfigured, false);
    assert.equal(quota.body.tmap.limit, 7);
    assert.equal(quota.body.kakao.limit, 13);
    assert.equal(Number.isInteger(quota.body.kakao.used), true);
    assert.equal(quota.body.kakao.remaining, Math.max(0, 13 - quota.body.kakao.used));
    assert.equal(Number.isInteger(quota.body.tmap.used), true);
    assert.equal(quota.body.tmap.remaining, Math.max(0, 7 - quota.body.tmap.used));

    const single = await requestJson(baseUrl, '/api/commute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ origin: ORIGIN, destination: DESTINATION, modes: ['transit'], departureTime: '08:00' }),
    });
    assert.equal(single.status, 200);
    assert.equal(single.body.ok, true);
    assert.equal(single.body.routes.length, 1);
    assert.deepEqual(single.body.routes[0], {
      provider: 'tmap-transit',
      mode: 'transit',
      verified: false,
      status: 'not-configured',
      durationMinutes: null,
    });

    const batch = await requestJson(baseUrl, '/api/commute/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origins: [
          { id: 'origin-a', ...ORIGIN },
          { id: 'origin-b', ...ORIGIN },
        ],
        destinations: [{
          id: 'office',
          label: '회사',
          ...DESTINATION,
          modes: ['transit'],
          maxMinutes: 60,
          departureTime: '08:00',
        }],
        maxTransitCalls: 0,
      }),
    });
    assert.equal(batch.status, 200);
    assert.equal(batch.body.ok, true);
    assert.equal(batch.body.provider, 'tmap');
    assert.equal(batch.body.items.length, 2);
    assert.deepEqual(batch.body.items.map(({ originId, destinationId }) => ({ originId, destinationId })), [
      { originId: 'origin-a', destinationId: 'office' },
      { originId: 'origin-b', destinationId: 'office' },
    ]);
    assert.equal(batch.body.items.every((item) => item.departureTime === '08:00'), true);
    assert.equal(batch.body.items.every((item) => item.routes[0].status === 'not-configured'), true);
    assert.equal(batch.body.requestedPairCount, 2);
    assert.equal(batch.body.uniquePairCount, 1);
    assert.equal(batch.body.deduplicatedPairCount, 1);
    assert.equal(batch.body.requiredTransitCalls, 0);
    assert.equal(batch.body.quota.provider, 'tmap');
    assert.equal(batch.body.quota.transitConfigured, false);
    assert.equal(batch.body.quota.tmap.limit, 7);
    assert.equal(batch.body.quota.kakao.limit, 13);

    const tooMany = await requestJson(baseUrl, '/api/commute/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origins: Array.from({ length: 11 }, (_, index) => ({ id: `origin-${index}`, ...ORIGIN })),
        destinations: [{
          id: 'office',
          ...DESTINATION,
          modes: ['transit'],
          maxMinutes: 60,
          departureTime: '08:00',
        }],
      }),
    });
    assert.equal(tooMany.status, 400);
    assert.equal(tooMany.body.code, 'INVALID_ORIGINS');

    const fakeTmapKey = 'fake-tmap-app-key-123456';
    const tmapConfigured = await requestJson(baseUrl, '/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tmapAppKey: fakeTmapKey, transitProvider: 'tmap' }),
    });
    assert.equal(tmapConfigured.status, 200);
    assert.equal(tmapConfigured.body.commute.transitProvider, 'tmap');
    assert.equal(tmapConfigured.body.commute.transitConfigured, true);
    assert.equal(JSON.stringify(tmapConfigured.body).includes(fakeTmapKey), false);

    const blockedBeforeUpstream = await requestJson(baseUrl, '/api/commute/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origins: [{ id: 'origin-a', ...ORIGIN }],
        destinations: [
          {
            id: 'office-transit',
            ...DESTINATION,
            modes: ['transit'],
            maxMinutes: 60,
            departureTime: '08:00',
          },
          {
            id: 'office-car-and-transit',
            ...DESTINATION,
            modes: ['car', 'transit'],
            maxMinutes: 60,
            departureTime: '08:00',
          },
        ],
        maxTransitCalls: 0,
      }),
    });
    assert.equal(blockedBeforeUpstream.status, 429);
    assert.equal(blockedBeforeUpstream.body.code, 'TRANSIT_PREFLIGHT_LIMIT');
    assert.equal(blockedBeforeUpstream.body.requiredTransitCalls, 1);
    assert.equal(JSON.stringify(blockedBeforeUpstream.body).includes(fakeTmapKey), false);
    const quotaAfterPreflight = await requestJson(baseUrl, '/api/commute/quota');
    assert.equal(quotaAfterPreflight.body.tmap.used, quota.body.tmap.used);

    const fakeKey = 'fake-kakao-rest-key-123456';
    const configured = await requestJson(baseUrl, '/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kakaoRestApiKey: fakeKey, transitProvider: 'auto' }),
    });
    assert.equal(configured.status, 200);
    assert.equal(configured.body.commute.transitProvider, 'kakao');
    assert.equal(configured.body.commute.transitConfigured, true);
    assert.equal(JSON.stringify(configured.body).includes(fakeKey), false);

    const kakaoPreflight = await requestJson(baseUrl, '/api/commute/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origins: [{ id: 'origin-a', ...ORIGIN }],
        destinations: [
          { id: 'office-0800', ...DESTINATION, modes: ['transit'], maxMinutes: 60, departureTime: '08:00' },
          { id: 'office-0900', ...DESTINATION, modes: ['transit'], maxMinutes: 60, departureTime: '09:00' },
        ],
        maxTransitCalls: 0,
      }),
    });
    assert.equal(kakaoPreflight.status, 429);
    assert.equal(kakaoPreflight.body.code, 'TRANSIT_PREFLIGHT_LIMIT');
    assert.equal(kakaoPreflight.body.requiredTransitCalls, 1);
    assert.equal(kakaoPreflight.body.quota.limit, 13);
    assert.equal(JSON.stringify(kakaoPreflight.body).includes(fakeKey), false);

    const explicitTmapPreflight = await requestJson(baseUrl, '/api/commute/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origins: [{ id: 'origin-a', ...ORIGIN }],
        destinations: [{ id: 'office', ...DESTINATION, modes: ['transit'], maxMinutes: 60, departureTime: '08:00' }],
        transitProvider: 'tmap',
        maxTransitCalls: 0,
      }),
    });
    assert.equal(explicitTmapPreflight.status, 429);
    assert.equal(explicitTmapPreflight.body.provider, 'tmap');
    assert.equal(explicitTmapPreflight.body.code, 'TRANSIT_PREFLIGHT_LIMIT');

    const kakaoQuota = await requestJson(baseUrl, '/api/commute/quota');
    assert.equal(kakaoQuota.body.provider, 'kakao');
    assert.equal(kakaoQuota.body.transitConfigured, true);
    assert.equal(kakaoQuota.body.kakao.limit, 13);
    assert.equal(JSON.stringify(kakaoQuota.body).includes(fakeKey), false);
  } finally {
    await stopServer(child);
  }
});

test('Kakao local daily limit blocks single and batch requests before an upstream call', { timeout: 30_000 }, async () => {
  const port = await unusedPort();
  const child = spawn(process.execPath, [SERVER_SCRIPT], {
    cwd: path.resolve(TEST_DIR, '../..'),
    env: {
      ...process.env,
      HOMEHUNT_LOCAL_API_PORT: String(port),
      MOLIT_SERVICE_KEY: '',
      TMAP_APP_KEY: '',
      KAKAO_REST_API_KEY: 'fake-kakao-rest-key-123456',
      KAKAO_DAILY_LIMIT: '0',
      NAVER_MAPS_CLIENT_ID: '',
      NAVER_MAPS_CLIENT_SECRET: '',
      NAVER_LOCAL_SEARCH_CLIENT_ID: '',
      NAVER_LOCAL_SEARCH_CLIENT_SECRET: '',
      TRANSIT_PROVIDER: 'kakao',
      TMAP_DAILY_LIMIT: '7',
      TRANSIT_CACHE_HOURS: '8',
      TRANSIT_CONCURRENCY: '2',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForStartup(child);
    const single = await requestJson(baseUrl, '/api/commute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origin: ORIGIN,
        destination: DESTINATION,
        modes: ['transit'],
        departureTime: '08:00',
        transitProvider: 'kakao',
      }),
    });
    assert.equal(single.status, 200);
    assert.equal(single.body.routes[0].provider, 'kakao-transit');
    assert.equal(single.body.routes[0].status, 'quota-exhausted');
    assert.equal(single.body.routes[0].reasonCode, 'DAILY_LIMIT');

    const batch = await requestJson(baseUrl, '/api/commute/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origins: [{ id: 'origin', ...ORIGIN }],
        destinations: [{
          id: 'office',
          ...DESTINATION,
          modes: ['transit'],
          maxMinutes: 60,
          departureTime: '08:00',
        }],
        transitProvider: 'kakao',
        maxTransitCalls: 1,
      }),
    });
    assert.equal(batch.status, 429);
    assert.equal(batch.body.code, 'KAKAO_DAILY_LIMIT');
    assert.equal(batch.body.provider, 'kakao');
    assert.equal(batch.body.requiredTransitCalls, 1);
    assert.equal(batch.body.quota.limit, 0);
    assert.equal(batch.body.quota.used, 0);
    assert.equal(batch.body.quota.remaining, 0);
    assert.equal(JSON.stringify(batch.body).includes('fake-kakao-rest-key-123456'), false);

    const quota = await requestJson(baseUrl, '/api/commute/quota');
    assert.equal(quota.body.kakao.limit, 0);
    assert.equal(quota.body.kakao.used, 0);
    assert.equal(quota.body.kakao.remaining, 0);
  } finally {
    await stopServer(child);
  }
});
