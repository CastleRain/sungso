import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthGate, ApiError } from '../server/auth-gate.mjs';
import { createHomehuntApi } from '../server/http-api.mjs';
import { createApiRateLimit } from '../server/api-rate-limit.mjs';
import { createHouseholdStore } from '../server/household-store.mjs';
import { createRecommendationJobService, RecommendationJobError } from '../server/recommendation-jobs.mjs';
import { CloudSnapshotError } from '../js/cloud-snapshot-core.mjs';
import { CloudCommuteError } from '../server/commute-service.mjs';

function fakeDatabase() {
  const documents = new Map();
  const reads = [];
  let queue = Promise.resolve();
  const snapshot = (path) => ({ exists: documents.has(path), data: () => structuredClone(documents.get(path)) });
  const doc = (path) => ({ path, get: async () => { reads.push(path); return snapshot(path); },
    collection: (name) => ({ doc: (id) => doc(`${path}/${name}/${id}`) }) });
  return {
    documents, reads, doc, collection: (name) => ({ doc: (id) => doc(`${name}/${id}`) }),
    runTransaction(action) {
      const operation = queue.then(async () => {
        const writes = [];
        const result = await action({ get: async (ref) => snapshot(ref.path), set: (ref, value) => writes.push([ref.path, structuredClone(value)]) });
        for (const [path, value] of writes) documents.set(path, value);
        return result;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}

const googleToken = (changes = {}) => ({ uid: 'owner-id', email: 'owner@example.test', email_verified: true,
  firebase: { sign_in_provider: 'google.com' }, ...changes });
const priceFilters = { regions: ['gyeonggi'], minHouseholds: 100, maxPriceManWon: 60000, minAreaM2: 50, months: 1 };

function setup(overrides = {}) {
  const db = fakeDatabase();
  const tokens = new Map([
    ['owner-token', googleToken()],
    ['partner-token', googleToken({ uid: 'partner-id', email: 'partner@example.test' })],
    ['stranger-token', googleToken({ uid: 'stranger-id', email: 'stranger@example.test' })],
  ]);
  db.documents.set('homehunt_members/owner@example.test', { active: true, householdId: 'family-a' });
  db.documents.set('homehunt_members/partner@example.test', { active: true, householdId: 'family-a' });
  db.documents.set('homehunt_members/stranger@example.test', { active: true, householdId: 'family-b' });
  const verifications = [];
  const calls = [];
  let instant = Date.parse('2026-09-08T00:00:00Z');
  let sequence = 0;
  const auth = { verifyIdToken: async (token, checkRevoked) => {
    verifications.push({ token, checkRevoked });
    if (!tokens.has(token)) throw new Error('credential backend error secret-url');
    return structuredClone(tokens.get(token));
  } };
  const jobs = createRecommendationJobService({ db, now: () => instant, idFactory: () => `job-${++sequence}`,
    loadCatalog: async () => ({ apartments: [{ catalogId: 'catalog-1', regionCode: '41135', name: '테스트 단지', dong: '테스트동', households: 500, builtYear: 2005 }] }),
    loadMonth: async (task) => { calls.push(['month', task.lawdCd]); return { ...task, records: [] }; } });
  const dependencies = {
    authenticate: createAuthGate({ auth, db }), jobs,
    household: createHouseholdStore({ db, now: () => new Date(instant) }),
    health: async (context) => { calls.push(['health', context]); return { ok: true }; },
    commute: {
      quota: async () => { calls.push(['quota']); return { ok: true }; },
      single: async () => { calls.push(['single']); return { ok: true }; },
      batch: async () => { calls.push(['batch']); return { ok: true }; },
    },
    history: async () => { calls.push(['history']); return { ok: true }; },
    places: async () => { calls.push(['places']); return { ok: true }; },
    officialComplex: async query => { calls.push(['facility', query]); return { ok: true, provider: 'kapt' }; },
    rateLimit: createApiRateLimit({ db, now: () => instant }),
    ...overrides,
  };
  const handler = createHomehuntApi(dependencies);
  async function request(url, { method = 'GET', token = 'owner-token', origin = 'https://castlerain.github.io', body, headers = {}, rawBody } = {}) {
    const response = { headers: {}, statusCode: null, body: null,
      setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; }, end() { return this; } };
    await handler({ method, url, body, rawBody, headers: {
      ...(origin === null ? {} : { origin }), ...(token === null ? {} : { authorization: `Bearer ${token}` }), ...headers,
    } }, response);
    return response;
  }
  return { db, tokens, verifications, calls, request, dependencies, advanceTime(milliseconds) { instant += milliseconds; } };
}

test('every data/API route requires a verified bearer token before any provider or database write', async () => {
  const env = setup();
  const routes = [
    ['/api/health', 'GET'], ['/api/commute/quota', 'GET'], ['/api/commute', 'POST'], ['/api/commute/batch', 'POST'],
    ['/api/place-search?query=test', 'GET'], ['/api/apartment-history', 'GET'], ['/api/recommendations', 'POST'],
    ['/api/kapt/complex?catalogId=fixture', 'GET'],
    ['/api/recommendations/recent', 'GET'], ['/api/recommendations/known-job', 'GET'], ['/api/recommendations/known-job/advance', 'POST'],
    ['/api/recommendations/known-job/retry', 'POST'],
    ['/api/recommendations/known-job', 'DELETE'], ['/api/household/snapshot', 'GET'], ['/api/household/snapshot', 'PUT'],
  ];
  for (const [path, method] of routes) {
    const response = await env.request(path, { method, token: null, body: {} });
    assert.equal(response.statusCode, 401, path);
    assert.equal(response.body.code, 'AUTH_REQUIRED', path);
    assert.equal(response.headers['cache-control'], 'private, no-store');
  }
  assert.equal(env.verifications.length, 0);
  assert.equal(env.calls.length, 0);
  assert.equal(env.db.documents.size, 3, 'only pre-existing admin membership documents');
});

test('an access code, invalid token, or oversized bearer never authorizes a request', async () => {
  const env = setup();
  for (const token of ['0306', 'not-a-token']) {
    const response = await env.request('/api/health', { token });
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 'AUTH_INVALID');
    assert.ok(!JSON.stringify(response.body).includes('secret-url'));
  }
  const oversize = await env.request('/api/health', { token: 'x'.repeat(8193) });
  assert.equal(oversize.statusCode, 401);
  assert.equal(env.verifications.length, 2);
  assert.ok(env.verifications.every((call) => call.checkRevoked === true));
  assert.equal(env.calls.length, 0);
});

test('email verification and Google provider are both required before membership lookup', async () => {
  for (const changes of [
    { email_verified: false }, { firebase: { sign_in_provider: 'anonymous' } },
    { firebase: { sign_in_provider: 'password' } }, { uid: '' }, { email: 'owner/other@example.test' },
  ]) {
    const env = setup();
    env.tokens.set('bad-user', googleToken(changes));
    const response = await env.request('/api/health', { token: 'bad-user' });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 'MEMBERSHIP_REQUIRED');
    assert.equal(env.db.reads.length, 0);
    assert.equal(env.calls.length, 0);
  }
});

test('membership is reread each request and disabled/unknown accounts are denied', async () => {
  const env = setup();
  env.tokens.set('owner-token', googleToken({ email: ' OWNER@EXAMPLE.TEST ' }));
  assert.equal((await env.request('/api/health')).statusCode, 200);
  env.db.documents.set('homehunt_members/owner@example.test', { active: false, householdId: 'family-a' });
  assert.equal((await env.request('/api/health')).statusCode, 403);
  env.tokens.set('unknown', googleToken({ email: 'unknown@example.test' }));
  assert.equal((await env.request('/api/health', { token: 'unknown' })).statusCode, 403);
  assert.equal(env.calls.length, 1);
  assert.deepEqual(env.calls[0][1], { uid: 'owner-id', householdId: 'family-a' });
});

test('CORS uses exact origins and denies hostile preflight before verifying any token', async () => {
  const env = setup();
  for (const origin of ['https://castlerain.github.io.attacker.test', 'http://castlerain.github.io', 'null', 'http://localhost:9999']) {
    const response = await env.request('/api/health', { origin, method: 'OPTIONS' });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 'ORIGIN_DENIED');
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
  for (const origin of ['https://castlerain.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000']) {
    const response = await env.request('/api/health', { method: 'OPTIONS', origin, token: null });
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers['access-control-allow-origin'], origin);
    assert.match(response.headers['access-control-allow-headers'], /Authorization/);
    assert.equal(response.headers.vary, 'Origin');
  }
  assert.equal(env.verifications.length, 0);
  assert.equal(env.calls.length, 0);
});

test('requests without Origin remain authenticated and cannot bypass access with CORS omission', async () => {
  const env = setup();
  assert.equal((await env.request('/api/health', { origin: null, token: null })).statusCode, 401);
  assert.equal((await env.request('/api/health', { origin: null })).statusCode, 200);
  assert.equal(env.calls.length, 1);
});

test('remote config/key mutation endpoints do not exist', async () => {
  const env = setup();
  for (const path of ['/api/config', '/api/keys', '/api/service-key']) {
    const response = await env.request(path, { method: 'POST', body: { kakaoRestApiKey: 'untrusted-input' } });
    assert.equal(response.statusCode, 404);
  }
  assert.equal(env.calls.length, 0);
  assert.ok(!JSON.stringify([...env.db.documents]).includes('untrusted-input'));
});

test('request body/query identity never overrides authenticated household context for price jobs', async () => {
  const env = setup();
  const created = await env.request('/api/recommendations?householdId=family-b&uid=stranger-id', {
    method: 'POST', body: { ...priceFilters, householdId: 'family-b', uid: 'stranger-id', companyAddress: 'unneeded-private-text' },
  });
  assert.equal(created.statusCode, 202);
  const job = env.db.documents.get(`homehunt_jobs/${created.body.jobId}`);
  assert.equal(job.householdId, 'family-a');
  assert.equal(job.uid, 'owner-id');
  assert.ok(!Object.hasOwn(job.filters, 'householdId'));
  assert.ok(!JSON.stringify(job).includes('unneeded-private-text'));
  const result = await env.request(`/api/recommendations/${created.body.jobId}/advance`, { method: 'POST', token: 'partner-token', body: { householdId: 'family-b' } });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'complete');
});

test('HTTP get/advance/cancel cannot access another household job with a guessed id', async () => {
  const env = setup();
  const created = await env.request('/api/recommendations', { method: 'POST', body: priceFilters });
  const path = `/api/recommendations/${created.body.jobId}`;
  for (const [url, method] of [[path, 'GET'], [`${path}/advance`, 'POST'], [`${path}/retry`, 'POST'], [path, 'DELETE']]) {
    const response = await env.request(url, { method, token: 'stranger-token', body: { householdId: 'family-a', uid: 'owner-id' } });
    assert.equal(response.statusCode, 404);
    assert.equal(response.body.code, 'JOB_NOT_FOUND');
  }
  assert.equal(env.calls.filter((call) => call[0] === 'month').length, 0);
});

test('snapshot CAS uses server context and rejects stale concurrent saves without overwriting', async () => {
  const env = setup();
  const body = { snapshot: { recommendationFilters: { targetPriceManWon: 60000 }, visits: [] }, expectedRevision: 0,
    householdId: 'family-b', uid: 'stranger-id' };
  const saved = await env.request('/api/household/snapshot', { method: 'PUT', body });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.revision, 1);
  const rejected = await env.request('/api/household/snapshot', { method: 'PUT', token: 'partner-token',
    body: { ...body, snapshot: { recommendationFilters: { targetPriceManWon: 70000 } } } });
  assert.equal(rejected.statusCode, 409);
  assert.equal(rejected.body.code, 'CLOUD_SNAPSHOT_CONFLICT');
  assert.equal(rejected.body.currentRevision, 1);
  const restored = await env.request('/api/household/snapshot', { token: 'partner-token' });
  assert.equal(restored.body.snapshot.recommendationFilters.targetPriceManWon, 60000);
  assert.equal(env.db.documents.get('homehunt_households/family-a/snapshots/main').updatedBy, 'owner-id');
  assert.ok(!env.db.documents.has('homehunt_households/family-b/snapshots/main'));
  assert.equal((await env.request('/api/household/snapshot', { token: 'stranger-token' })).body.snapshot, null);
});

test('unknown upstream errors with status/httpStatus cannot expose URLs, credentials, codes or revision fields', async () => {
  for (const detail of [{ status: 429 }, { httpStatus: 403 }, { status: 500, httpStatus: 500 }]) {
    const error = Object.assign(new Error('provider https://api.invalid?key=secret-value'), detail,
      { code: 'secret-value', currentRevision: 81234 });
    const env = setup({ health: async () => { throw error; } });
    const response = await env.request('/api/health');
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.code, 'SERVICE_UNAVAILABLE');
    assert.equal(response.body.currentRevision, undefined);
    assert.ok(!JSON.stringify(response.body).includes('secret-value'));
    assert.ok(!JSON.stringify(response.body).includes('api.invalid'));
  }
});

test('only known application error classes preserve user-facing messages and statuses', async () => {
  for (const error of [
    new ApiError('AUTH_REQUIRED', '로그인이 필요합니다.', 401),
    new RecommendationJobError('JOB_EXPIRED', '검색 결과가 만료되었습니다.', 410),
    new CloudSnapshotError('저장 크기를 줄여주세요.', 'CLOUD_SNAPSHOT_TOO_LARGE', 413),
    new CloudCommuteError('TRANSIT_PREFLIGHT_LIMIT', '호출 상한을 넘었습니다.', 429),
  ]) {
    const env = setup({ health: async () => { throw error; } });
    const response = await env.request('/api/health');
    assert.equal(response.statusCode, error.status);
    assert.equal(response.body.code, error.code);
    assert.equal(response.body.error, error.message);
  }
});

test('rawBody, declared length and oversized JSON strings are rejected before paid work', async () => {
  const env = setup();
  for (const args of [
    { body: {}, headers: { 'content-length': String(33 * 1024) } },
    { body: {}, rawBody: Buffer.alloc(33 * 1024) },
    { body: JSON.stringify({ text: 'x'.repeat(33 * 1024) }) },
    { body: { text: 'x'.repeat(33 * 1024) } },
  ]) {
    const response = await env.request('/api/commute', { method: 'POST', ...args });
    assert.equal(response.statusCode, 413);
    assert.equal(response.body.code, 'BODY_TOO_LARGE');
  }
  assert.equal(env.calls.length, 0);
});

test('malformed JSON and non-object JSON are rejected instead of reaching provider code', async () => {
  const env = setup();
  for (const body of ['{bad', '[]', 'null', 'false', '42', null, false, 0, []]) {
    const response = await env.request('/api/commute', { method: 'POST', body });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, 'INVALID_JSON');
  }
  assert.equal(env.calls.length, 0);
});

test('transactional household rate limit allows only three simultaneous price jobs per minute', async () => {
  const env = setup();
  const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => env.request('/api/recommendations', {
    method: 'POST', token: index % 2 ? 'owner-token' : 'partner-token', body: priceFilters,
  })));
  assert.equal(responses.filter((response) => response.statusCode === 202).length, 3);
  assert.equal(responses.filter((response) => response.statusCode === 429 && response.body.code === 'REQUEST_LIMIT').length, 3);
  const jobs = [...env.db.documents.entries()].filter(([path]) => /^homehunt_jobs\/[^/]+$/.test(path));
  assert.equal(jobs.length, 1, 'identical admitted requests reuse one household price job');
  const rateRows = [...env.db.documents.entries()].filter(([path]) => path.startsWith('homehunt_request_limits/'));
  assert.equal(rateRows.length, 1);
  assert.equal(rateRows[0][1].used, 3);
  env.advanceTime(60000);
  assert.equal((await env.request('/api/recommendations', { method: 'POST', body: priceFilters })).statusCode, 202);
});

test('recent search dispatch uses verified account identity and never starts a price provider request', async () => {
  const env = setup();
  const created = await env.request('/api/recommendations', { method: 'POST', body: priceFilters });
  const mine = await env.request('/api/recommendations/recent?uid=partner-id&householdId=family-b');
  assert.equal(mine.statusCode, 200);
  assert.equal(mine.body.job.jobId, created.body.jobId);
  assert.equal(mine.body.job.advanceRequired, true);
  for (const token of ['partner-token', 'stranger-token']) {
    const other = await env.request('/api/recommendations/recent?uid=owner-id', { token });
    assert.deepEqual(other.body, { ok: true, job: null });
  }
  assert.equal(env.calls.length, 0);
});

test('official facility GET is authenticated, dispatched with catalog identity, and not a client mutation route', async () => {
  const env = setup();
  const result = await env.request('/api/kapt/complex?catalogId=official-fixture');
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.provider, 'kapt');
  assert.deepEqual(env.calls, [['facility', { catalogId: 'official-fixture' }]]);
  assert.equal((await env.request('/api/kapt/complex', { method: 'POST', body: { catalogId: 'official-fixture' } })).statusCode, 404);
  assert.equal(env.calls.length, 1);
  const disabled = setup({ officialComplex: undefined });
  assert.equal((await disabled.request('/api/kapt/complex?catalogId=official-fixture')).body.code, 'KAPT_NOT_CONFIGURED');
});

test('facility reads have their own bounded shared-family quota without starving search or route controls', async () => {
  const env = setup();
  for (let index = 0; index < 900; index++) {
    const result = await env.request('/api/kapt/complex?catalogId=fixture', { token: index % 2 ? 'owner-token' : 'partner-token' });
    assert.equal(result.statusCode, 200, `facility ${index + 1}`);
  }
  assert.equal((await env.request('/api/kapt/complex?catalogId=fixture')).statusCode, 429);
  assert.equal(env.calls.filter(call => call[0] === 'facility').length, 900);
  assert.equal((await env.request('/api/commute/batch', { method: 'POST', body: {} })).statusCode, 200);
  assert.equal((await env.request('/api/recommendations', { method: 'POST', body: priceFilters })).statusCode, 202);
  env.advanceTime(60_000);
  assert.equal((await env.request('/api/kapt/complex?catalogId=fixture')).statusCode, 200);
});
