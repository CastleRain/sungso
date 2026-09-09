import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRenderServer } from '../render/node-server.mjs';
import { readRenderConfiguration } from '../render/config.mjs';
import { createConfiguredHomehuntApi } from '../server/create-api.mjs';
import { createMemoryFirestore } from './helpers/firestore-memory.mjs';

const origin = 'https://castlerain.github.io';
const credential = { type: 'service_account', project_id: 'test-project',
  client_email: 'server@test-project.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nSYNTHETIC-ONLY\n-----END PRIVATE KEY-----' };
const environment = () => ({ FIREBASE_PROJECT_ID: 'test-project', FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(credential),
  HOMEHUNT_PROVIDER_CONFIG: JSON.stringify({ MOLIT_SERVICE_KEY: 'synthetic-provider-only', TRANSIT_PROVIDER: 'kakao' }) });

async function running(t, api, limits = {}) {
  const server = createRenderServer({ api, ...limits });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, request: (path, options = {}) => fetch(base + path, { ...options,
    headers: { Origin: origin, ...(options.headers || {}) } }) };
}

function configured() {
  const db = createMemoryFirestore();
  db.doc = path => { const [collection, id] = path.split('/'); return db.collection(collection).doc(id); };
  db.documents.set('homehunt_members/owner@example.test', { active: true, householdId: 'test-home' });
  const authCalls = [];
  const auth = { verifyIdToken: async (token, revoked) => {
    authCalls.push([token, revoked]);
    if (!['member-token', 'nonmember-token'].includes(token)) throw new Error('synthetic-secret-failure');
    return { uid: token, email: token === 'member-token' ? 'owner@example.test' : 'other@example.test',
      email_verified: true, firebase: { sign_in_provider: 'google.com' } };
  } };
  let catalogs = 0;
  const api = createConfiguredHomehuntApi({ db, auth,
    env: { MOLIT_SERVICE_KEY: 'synthetic-provider-only', KAKAO_REST_API_KEY: 'synthetic-kakao-only', TRANSIT_PROVIDER: 'kakao' },
    loadCatalog: async () => { catalogs++; return { apartments: [] }; }, runtime: 'render', keySource: 'server-environment' });
  return { api, db, authCalls, catalogs: () => catalogs };
}

test('Render environment accepts only server credentials and explicitly allowed provider settings', () => {
  const env = environment();
  env.PORT = '12000';
  env.HOMEHUNT_PROVIDER_CONFIG = JSON.stringify({ DATA_GO_KR_SERVICE_KEY: 'synthetic-public-api',
    KAKAO_DAILY_LIMIT: 1000, untrustedEndpoint: 'https://never-used.invalid', householdId: 'injected' });
  const config = readRenderConfiguration(env);
  assert.equal(config.port, 12000);
  assert.equal(config.projectId, 'test-project');
  assert.equal(config.providers.MOLIT_SERVICE_KEY, 'synthetic-public-api');
  assert.equal(config.providers.KAKAO_DAILY_LIMIT, 1000);
  assert.equal(config.providers.untrustedEndpoint, undefined);
  assert.equal(config.providers.householdId, undefined);
  assert.deepEqual(config.serviceAccount, credential);
});

test('malformed secret JSON, project mismatch and invalid PORT fail without exposing the supplied secret', () => {
  for (const patch of [
    { FIREBASE_SERVICE_ACCOUNT_JSON: '{SYNTHETIC-PRIVATE-VALUE' },
    { HOMEHUNT_PROVIDER_CONFIG: '{SYNTHETIC-PRIVATE-VALUE' },
    { FIREBASE_PROJECT_ID: 'different-project' },
    { FIREBASE_SERVICE_ACCOUNT_JSON: '[]' }, { HOMEHUNT_PROVIDER_CONFIG: '[]' },
    { PORT: 'not-a-port' }, { PORT: '0' }, { PORT: '65536' },
  ]) assert.throws(() => readRenderConfiguration({ ...environment(), ...patch }), error => {
    assert.doesNotMatch(error.message, /SYNTHETIC|PRIVATE KEY|different-project/); return true;
  });
});

test('public healthz and preflight wake the process without touching authentication, DB, catalog or quota', async t => {
  const fixture = configured();
  const { request } = await running(t, fixture.api);
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    const response = await request('/healthz', { method });
    assert.equal(response.status, method === 'OPTIONS' ? 204 : 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(await response.text(), method === 'GET' ? '{"ok":true}' : '');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(fixture.authCalls.length, 0);
  assert.equal(fixture.db.calls.reads, 0);
  assert.equal(fixture.db.calls.writes, 0);
  assert.equal(fixture.catalogs(), 0);
  assert.equal((await request('/healthz', { headers: { Origin: 'https://other.invalid' } })).status, 403);
  assert.equal((await request('/healthz', { method: 'POST' })).status, 404);
});

test('the Node adapter preserves member authorization and private API CORS', async t => {
  const fixture = configured();
  const { request } = await running(t, fixture.api);
  const routes = ['/api/health', '/api/commute/quota', '/api/kapt/complex?catalogId=test',
    '/api/place-search?query=test', '/api/apartment-history?lawdCd=41135&aptName=test'];
  for (const route of routes) assert.equal((await request(route)).status, 401, route);
  assert.equal(fixture.catalogs(), 0);
  assert.equal((await request('/api/health', { headers: { Authorization: 'Bearer nonmember-token' } })).status, 403);
  const allowed = await request('/api/health', { headers: { Authorization: 'Bearer member-token' } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
  const data = await allowed.json();
  assert.equal(data.runtime, 'render');
  assert.equal(data.version, '2.10.1');
  assert.equal(data.keySource, 'server-environment');
  assert.equal(data.keyConfigured, true);
  assert.doesNotMatch(JSON.stringify(data), /synthetic-provider|synthetic-kakao|owner@example/);
  assert.ok(fixture.authCalls.every(([, revoked]) => revoked === true));
  const foreign = await request('/api/health', { headers: { Authorization: 'Bearer member-token', Origin: 'https://other.invalid' } });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
  assert.equal((await request('/api/commute', { method: 'OPTIONS' })).status, 204);
});

test('Node JSON parsing retains recommendation rate limits and rejects malformed or oversized bodies', async t => {
  const fixture = configured();
  const { request } = await running(t, fixture.api);
  const options = { method: 'POST', headers: { Authorization: 'Bearer member-token', 'Content-Type': 'application/json' } };
  assert.equal((await request('/api/recommendations', { ...options, body: '{private-invalid' })).status, 400);
  assert.equal((await request('/api/recommendations', { ...options, body: JSON.stringify({ padding: 'x'.repeat(33 * 1024) }) })).status, 413);
  assert.equal((await request('/api/recommendations', { ...options, body: JSON.stringify({ padding: 'x'.repeat(751 * 1024) }) })).status, 413);
  for (let index = 0; index < 3; index++) {
    const response = await request('/api/recommendations', { ...options, body: '{}' });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).status, 'complete');
  }
  assert.equal((await request('/api/recommendations', { ...options, body: '{}' })).status, 429);
});

test('bounded concurrent searches do not block healthz and excess work gets a retry response', async t => {
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  let calls = 0;
  const { request } = await running(t, async (_req, res) => {
    if (++calls === 2) entered();
    await gate; res.status(200).json({ ok: true });
  }, { maxActiveRequests: 2, maxQueuedRequests: 0 });
  t.after(() => release());
  const first = request('/api/commute', { method: 'POST' });
  const second = request('/api/commute/batch', { method: 'POST' });
  await started;
  const busy = await request('/api/recommendations/three/advance', { method: 'POST' });
  assert.equal(busy.status, 503);
  assert.equal(busy.headers.get('retry-after'), '2');
  assert.equal(busy.headers.get('access-control-allow-origin'), origin);
  assert.equal((await busy.json()).code, 'SERVER_BUSY');
  assert.equal((await request('/healthz')).status, 200);
  release();
  assert.equal((await first).status, 200); assert.equal((await second).status, 200);
  assert.equal(calls, 2);
});

test('only one large price operation runs at once while a small API request can still finish', async t => {
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const calls = [];
  const { request } = await running(t, async (req, res) => {
    calls.push(req.url);
    if (req.url.includes('advance')) { entered(); await gate; }
    res.status(200).json({ ok: true });
  }, { maxQueuedRequests: 0 });
  t.after(() => release());
  const price = request('/api/recommendations/one/advance', { method: 'POST' });
  await started;
  assert.equal((await request('/api/apartment-history')).status, 503);
  assert.equal((await request('/api/commute/quota')).status, 200);
  assert.equal(calls.length, 2);
  release();
  assert.equal((await price).status, 200);
});

test('unexpected hosting exceptions cannot expose credentials in the response', async t => {
  const { request } = await running(t, async () => { throw new Error('SYNTHETIC-PRIVATE-VALUE'); });
  const result = await request('/api/health');
  assert.equal(result.status, 503);
  assert.doesNotMatch(await result.text(), /SYNTHETIC-PRIVATE-VALUE/);
});

test('a queued price job resumes after the active job while a smaller request is not starved', async t => {
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const calls = [];
  const { request } = await running(t, async (req, res) => {
    calls.push(req.url);
    if (req.url.endsWith('/first')) { entered(); await gate; }
    res.status(200).json({ ok: true });
  });
  t.after(() => release());
  const first = request('/api/recommendations/first');
  await started;
  const second = request('/api/recommendations/second');
  assert.equal((await request('/api/commute/quota')).status, 200);
  assert.deepEqual(calls, ['/api/recommendations/first', '/api/commute/quota']);
  release();
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
  assert.equal(calls.at(-1), '/api/recommendations/second');
});

test('Render blueprint explicitly selects free Node hosting and server-managed secret inputs', async () => {
  const blueprint = await readFile(new URL('../../render.yaml', import.meta.url), 'utf8');
  assert.match(blueprint, /plan: free/);
  assert.match(blueprint, /healthCheckPath: \/healthz/);
  assert.match(blueprint, /FIREBASE_SERVICE_ACCOUNT_JSON\s+sync: false/);
  assert.match(blueprint, /HOMEHUNT_PROVIDER_CONFIG\s+sync: false/);
  assert.doesNotMatch(blueprint, /disk:|cron|private_key:|BEGIN PRIVATE KEY/);
  const legacy = await readFile(new URL('../cloud/index.mjs', import.meta.url), 'utf8');
  assert.match(legacy, /createConfiguredHomehuntApi/);
  assert.match(legacy, /defineSecret\('HOMEHUNT_PROVIDER_CONFIG'\)/);
  assert.match(legacy, /maxInstances: 2, concurrency: 1/);
});
