import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fetchTmapTransitSummary, sanitizeProviderErrorDetails, CommuteProviderError } from '../scripts/commute-provider.mjs';

const params = { origin: { lat: 37.5, lng: 127.03 }, destination: { lat: 37.6, lng: 127.04 }, appKey: 'fixture-not-a-real-key' };
const unsafe = 'https://example.invalid/?appKey=fixture-not-a-real-key';
function rejectedResponse(code, { category = 'gw', status = 403 } = {}) {
  return { ok: false, status, json: async () => ({ error: { id: String(status), category, code, message: unsafe, debug: { appKey: params.appKey } }, requestUrl: unsafe }) };
}

test('TMAP access, explicit subscription and provider quota failures expose only allowlisted machine evidence', async () => {
  for (const [providerCode, expected] of [
    ['INVALID_API_KEY', 'TMAP_INVALID_API_KEY'], ['API_KEY_EXPIRED', 'TMAP_INVALID_API_KEY'],
    ['ACCESS_DENIED', 'TMAP_ACCESS_DENIED'], ['PERMISSION_DENIED', 'TMAP_ACCESS_DENIED'],
    ['API_NOT_SUBSCRIBED', 'TMAP_SUBSCRIPTION_REQUIRED'], ['SUBSCRIPTION_REQUIRED', 'TMAP_SUBSCRIPTION_REQUIRED'],
    ['QUOTA_EXCEEDED', 'TMAP_PROVIDER_LIMIT'], ['RATE_LIMIT_EXCEEDED', 'TMAP_PROVIDER_LIMIT'],
  ]) {
    await assert.rejects(fetchTmapTransitSummary(params, { fetchImpl: async () => rejectedResponse(providerCode) }), error => {
      assert.equal(error.code, expected);
      assert.equal(error.providerErrorCode, providerCode);
      assert.equal(error.providerErrorCategory, 'gw');
      assert.equal(error.httpStatus, 403);
      for (const serialized of [JSON.stringify(error), error.message, error.stack]) {
        assert.equal(serialized.includes(params.appKey), false);
        assert.equal(serialized.includes(unsafe), false);
      }
      return true;
    });
  }
});

test('a generic 403 or a prose subscription claim never becomes a confirmed missing subscription', async () => {
  for (const code of [undefined, 'UNKNOWN', unsafe, 'INVALID_API_KEY ']) {
    await assert.rejects(fetchTmapTransitSummary(params, { fetchImpl: async () => rejectedResponse(code, { category: unsafe }) }), error => {
      assert.equal(error.code, 'HTTP_ERROR');
      assert.equal(error.providerErrorCode, null);
      assert.equal(error.providerErrorCategory, null);
      assert.equal(JSON.stringify(error).includes(unsafe), false);
      return true;
    });
  }
  await assert.rejects(fetchTmapTransitSummary(params, { fetchImpl: async () => ({
    ok: false, status: 403, json: async () => ({ error: { message: 'Please buy a subscription' } }),
  }) }), { code: 'HTTP_ERROR', providerErrorCode: null });
});

test('TMAP metadata is not inferred from another provider or a HTTP server error', async () => {
  assert.deepEqual(sanitizeProviderErrorDetails('kakao-transit', { code: 'INVALID_API_KEY', category: 'gw' }), {
    providerErrorCode: null, providerErrorCategory: null,
  });
  await assert.rejects(fetchTmapTransitSummary(params, {
    fetchImpl: async () => rejectedResponse('INVALID_API_KEY', { status: 500 }),
  }), { code: 'HTTP_ERROR', httpStatus: 500 });
});

test('the error boundary rechecks metadata so untrusted codes cannot be attached through constructor arguments', () => {
  const error = new CommuteProviderError('safe failure', { provider: 'tmap-transit', providerErrorCode: unsafe, providerErrorCategory: unsafe });
  assert.equal(error.providerErrorCode, null);
  assert.equal(error.providerErrorCategory, null);
  assert.equal(JSON.stringify(error).includes(unsafe), false);
});

test('local server route failures and health diagnostics keep safe TMAP evidence, never raw upstream contents', async () => {
  const source = fs.readFileSync(new URL('../scripts/local-market-server.mjs', import.meta.url), 'utf8');
  const providerDiagnostics = { transit: { tmap: null, kakao: null }, car: null };
  let calls = 0;
  let reservations = 0;
  const sandbox = {
    sanitizeProviderErrorDetails, providerDiagnostics,
    selectedTransitProvider: () => 'tmap', tmapAppKey: params.appKey,
    transitGate: callback => callback(), transitCache: null, TRANSIT_CACHE_TTL_MS: 1000,
    tmapLedger: { reserve: async count => { reservations += count; } },
    fetchTmapTransitSummary: (request, options) => fetchTmapTransitSummary(request, { ...options, fetchImpl: async () => {
      calls += 1;
      return rejectedResponse('INVALID_API_KEY');
    } }),
  };
  vm.createContext(sandbox);
  for (const name of ['recordProviderDiagnostic', 'failedRoute', 'reserveTransitUpstreamCall', 'resolveCommuteRoutes']) {
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
    assert.ok(match, `Actual server function ${name} exists`);
    vm.runInContext(match[0], sandbox);
  }
  const routes = await sandbox.resolveCommuteRoutes({ ...params, modes: ['transit'], transitProvider: 'tmap' });
  assert.equal(calls, 1);
  assert.equal(reservations, 1);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].verified, false);
  assert.equal(routes[0].durationMinutes, null);
  assert.equal(routes[0].reasonCode, 'TMAP_INVALID_API_KEY');
  assert.equal(routes[0].providerErrorCode, 'INVALID_API_KEY');
  assert.equal(routes[0].providerErrorCategory, 'gw');
  assert.equal(providerDiagnostics.transit.tmap.reasonCode, 'TMAP_INVALID_API_KEY');
  assert.equal(providerDiagnostics.transit.tmap.providerErrorCode, 'INVALID_API_KEY');
  const envelope = JSON.stringify({ routes, diagnostics: providerDiagnostics });
  assert.equal(envelope.includes(unsafe), false);
  assert.equal(envelope.includes(params.appKey), false);
  const untrusted = sandbox.failedRoute('tmap-transit', 'transit', { providerErrorCode: unsafe, providerErrorCategory: unsafe });
  assert.equal(untrusted.providerErrorCode, null);
  assert.equal(untrusted.providerErrorCategory, null);
});
