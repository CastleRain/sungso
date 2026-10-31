import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGateway } from '../deploy/invitation-connected/gateway.mjs';
test('gateway serves no editor bytes anonymously; requires a verified session and same-origin mutations', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wedding-gate-')); await mkdir(path.join(dir, 'private/lab/studio'), { recursive: true });
  await writeFile(path.join(dir, 'private/lab/studio/index.html'), 'PRIVATE_EDITOR'); await writeFile(path.join(dir, 'private-manifest.json'), '["/lab/studio/index.html"]');
  await writeFile(path.join(dir, 'legacy.html'), 'LEGACY_GUEST'); await writeFile(path.join(dir, 'published.html'), 'PUBLISHED<!--PUBLICATION-->');
  let released = false, memberReads = 0, writes = 0;
  const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const origin = 'http://127.0.0.1:' + server.address().port;
  const gateway = createGateway({ directory: dir, origin, fetcher: async (url, opts) => {
    if (url.endsWith('/session')) { memberReads++; return new Response('{}', { status: opts.headers.Authorization === 'Bearer approved' ? 200 : 403 }); }
    if (url.endsWith('/published')) return Response.json({ ok: true, release: released ? { snapshot: { content: '</script><script>injection</script>' } } : null });
    if (opts.method === 'POST') writes++;
    return Response.json({ ok: true });
  } }); server.on('request', gateway);
  try {
    assert.equal(await (await fetch(origin + '/')).text(), 'LEGACY_GUEST');
    assert.equal((await fetch(origin + '/lab/studio/', { redirect: 'manual' })).status, 401);
    const doc = await fetch(origin + '/lab/studio/', { redirect: 'manual', headers: { Accept: 'text/html' } }); assert.equal(doc.status, 303); assert.ok(doc.headers.get('location').startsWith('/studio-login/'));
    assert.equal((await fetch(origin + '/api/studio/manage')).status, 401);
    const login = (token, site = origin) => fetch(origin + '/api/studio/session', { method: 'POST', headers: { Origin: site, 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    assert.equal((await login('approved', 'https://evil.test')).status, 403); assert.equal((await login('forged')).status, 403);
    const response = await login('approved'), cookie = response.headers.get('set-cookie').split(';')[0]; assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
    assert.equal(await (await fetch(origin + '/lab/studio/', { headers: { Cookie: cookie } })).text(), 'PRIVATE_EDITOR');
    const mutate = site => fetch(origin + '/api/studio/manage', { method: 'POST', headers: { Cookie: cookie, Origin: site, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal((await mutate('https://evil.test')).status, 403); assert.equal(writes, 0); assert.equal((await mutate(origin)).status, 200); assert.equal(writes, 1);
    for (const p of ['/homehunt/','/wecost/','/honeymoon/','/gateway','/lab/private-manifest.json','/lab/%2e%2e%2fgateway.mjs']) assert.equal((await fetch(origin + p, { headers: { Cookie: cookie } })).status, 404);
    released = true; const publicHtml = await (await fetch(origin + '/')).text(); assert.match(publicHtml, /PUBLISHED/); assert.ok(!publicHtml.includes('</script><script>injection'));
    assert.ok(memberReads <= 2, 'module requests coalesce the same short member validation');
  } finally { await new Promise(r => server.close(r)); }
});
test('publication builder is separate from preserved static releases and excludes editor files from public assets', async () => {
  const text = await readFile(new URL('../scripts/build-invitation-connected.mjs', import.meta.url), 'utf8');
  assert.match(text, /private-manifest/); assert.match(text, /mode = 'published'/); assert.match(text, /const comparison = false/);
  assert.match(text, /Use a fresh connected output/); assert.match(text, /legacy\.html/);
});

test('transient upstream saturation is retried without admitting an unverified account', async () => {
  let calls = 0;
  const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  server.on('request', createGateway({ origin, fetcher: async () => new Response('{}', { status: ++calls === 1 ? 503 : 403 }) }));
  try {
    const response = await fetch(origin + '/api/studio/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'not-approved' }) });
    assert.equal(response.status, 403); assert.equal(calls, 2); assert.equal(response.headers.get('set-cookie'), null);
  } finally { await new Promise(r => server.close(r)); }
});
