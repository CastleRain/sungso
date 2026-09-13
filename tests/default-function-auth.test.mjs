import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { protectMemberEndpoint } = require('../services/firebase-default/member-endpoint.cjs');

function fixture() {
  const calls = [], reads = [], verifications = [];
  const members = new Map([
    ['site_members/first', { active: true, role: 'sungwoo' }],
    ['site_members/second', { active: true, role: 'sohee' }],
  ]);
  const tokens = new Map(['first', 'second', 'other'].map(uid => [uid, { uid, email: 'fixture@example.test',
    email_verified: true, firebase: { sign_in_provider: 'google.com' } }]));
  const handler = protectMemberEndpoint(async (_req, res) => { calls.push('provider/cache/limit'); return res.status(200).json({ ok: true }); }, {
    auth: { async verifyIdToken(token, revoked) { verifications.push(revoked); if (!tokens.has(token)) throw new Error('not returned to the client'); return tokens.get(token); } },
    db: { doc(path) { return { async get() { reads.push(path); return { data: () => members.get(path) }; } }; } },
  });
  async function request({ token, origin = 'https://castlerain.github.io', method = 'GET' } = {}) {
    const res = { headers: {}, statusCode: 0, body: null, set(k, v) { this.headers[k] = v; },
      status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
    await handler({ method, headers: { origin, ...(token ? { authorization: `Bearer ${token}` } : {}) } }, res);
    return res;
  }
  return { request, calls, reads, verifications, tokens, members };
}

test('legacy Functions endpoints reject anonymous, invalid and nonmembers before provider/cache writes', async () => {
  const f = fixture();
  for (const [token, status] of [[undefined, 401], ['invalid', 401], ['other', 403]]) {
    const res = await f.request({ token });
    assert.equal(res.statusCode, status);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
  }
  assert.deepEqual(f.calls, []);
  assert.ok(f.verifications.every(Boolean));
});

test('both registered Google members are admitted and deactivation takes effect on the next request', async () => {
  const f = fixture();
  assert.equal((await f.request({ token: 'first' })).statusCode, 200);
  assert.equal((await f.request({ token: 'second' })).statusCode, 200);
  f.members.set('site_members/first', { active: false, role: 'sungwoo' });
  assert.equal((await f.request({ token: 'first' })).statusCode, 403);
  assert.equal(f.calls.length, 2);
});

test('spoofed role, unverified email and password provider never authorize a legacy endpoint', async () => {
  for (const change of [{ email_verified: false }, { firebase: { sign_in_provider: 'password' } }, { uid: '../first' }]) {
    const f = fixture();
    f.tokens.set('first', { ...f.tokens.get('first'), ...change });
    assert.equal((await f.request({ token: 'first' })).statusCode, 403);
    assert.equal(f.reads.length, 0);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  f.members.set('site_members/first', { active: true, role: 'administrator' });
  assert.equal((await f.request({ token: 'first' })).statusCode, 403);
});

test('preflight permits Authorization only for approved origins without authentication or provider requests', async () => {
  const f = fixture();
  const allowed = await f.request({ method: 'OPTIONS' });
  assert.equal(allowed.statusCode, 204);
  assert.match(allowed.headers['Access-Control-Allow-Headers'], /Authorization/);
  assert.equal((await f.request({ method: 'OPTIONS', origin: 'https://castlerain.github.io.attacker.test' })).statusCode, 403);
  assert.equal(f.verifications.length, 0);
  assert.equal(f.calls.length, 0);
});
