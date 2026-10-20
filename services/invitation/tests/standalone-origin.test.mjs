import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderServer } from '../../homehunt/render/node-server.mjs';
import { createAccountApi, createAccountStore } from '../server/accounts.mjs';
import { createMemoryFirestore } from '../../../apps/homehunt/tests/helpers/firestore-memory.mjs';
import { createSiteMemberGate } from '../../homehunt/server/site-members.cjs';

const origin = 'https://sungso-wedding.vercel.app';
const publicHandler = (_req, res) => res.status(200).json({ ok: true });
test('exact standalone origin only reaches the invitation route allowlist', async t => {
  const server = createRenderServer({
    api: (_q, r) => r.status(401).json({ ok: false }), guestbook: publicHandler,
    album: publicHandler, accounts: publicHandler, rsvp: publicHandler,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const id = '00000000-0000-4000-8000-000000000001';
  for (const route of ['/api/invitation/v3/guestbook', `/api/invitation/v3/guestbook/${id}`,
    '/api/invitation/v3/album', '/api/invitation/v3/album/manage', '/api/invitation/v3/album/upload',
    '/api/invitation/v3/album/publish', `/api/invitation/v3/album/photos/${id}/full`,
    `/api/invitation/v3/album/manage/photos/${id}/thumb`,
    '/api/invitation/v5/accounts', '/api/invitation/v5/accounts/manage']) {
    for (const method of ['GET', 'OPTIONS']) {
      const response = await fetch(base + route, { method, headers: { Origin: origin } });
      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.equal(response.headers.get('vary'), 'Origin');
    }
  }
  for (const route of ['/healthz', '/api/health', '/api/quota', '/api/apartment-history',
    '/api/invitation/v5/rsvp', '/api/invitation/v5/rsvp/manage',
    '/api/invitation/v3/guestbook/private', '/api/invitation/v5/accounts/extra',
    '/api/invitation/v3/album/other', '/api/invitation/v3/album/../../../health']) {
    for (const method of ['GET', 'OPTIONS']) {
      const response = await fetch(base + route, { method, headers: { Origin: origin } });
      assert.equal(response.status, 403, route);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
    }
  }
  for (const untrusted of ['https://another.vercel.app', 'https://sungso-wedding-preview.vercel.app',
    'https://sungso-wedding.vercel.app.evil.test', 'http://sungso-wedding.vercel.app',
    'https://sungso-wedding.vercel.app:8443', 'null']) {
    const response = await fetch(base + '/api/invitation/v3/album', { headers: { Origin: untrusted } });
    assert.equal(response.status, 403); assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  const legacy = await fetch(base + '/api/health', { headers: { Origin: 'https://castlerain.github.io' } });
  assert.equal(legacy.status, 401);
  assert.equal(legacy.headers.get('access-control-allow-origin'), 'https://castlerain.github.io');
});

test('standalone origin does not bypass either approved Google member check', async t => {
  const db = createMemoryFirestore();
  db.doc = pathname => { const parts = pathname.split('/'), id = parts.pop(); return db.collection(parts.join('/')).doc(id); };
  for (const [uid, role, active] of [['one', 'sungwoo', true], ['two', 'sohee', true], ['disabled', 'sohee', false], ['other', 'visitor', true]]) {
    await db.doc(`site_members/${uid}`).set({ role, active });
  }
  const authenticate = createSiteMemberGate({ db, auth: { async verifyIdToken(uid) {
    if (!['one', 'two', 'disabled', 'other', 'unlisted'].includes(uid)) throw Error();
    return { uid, email: 'fixture@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
  } } });
  const server = createRenderServer({ api: (_q, r) => r.status(401).json({ ok: false }),
    accounts: createAccountApi({ store: createAccountStore({ db }), authenticate }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/invitation/v5/accounts`;
  for (const [token, expected] of [['', 401], ['invalid', 401], ['disabled', 403], ['other', 403], ['unlisted', 403], ['one', 200], ['two', 200]]) {
    const response = await fetch(base + '/manage', { headers: { Origin: origin, ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
    assert.equal(response.status, expected, token);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  const preflight = await fetch(base + '/manage', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
  assert.equal((await fetch(base, { headers: { Origin: origin } })).status, 200);
});
