import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildInvitation, verifyInvitation, INVITATION_ORIGIN } from '../../scripts/build-invitation-vercel.mjs';
import { PROJECT_ROOT } from '../../scripts/build-site.mjs';
import { createInvitationPreview } from '../../deploy/invitation/preview.mjs';

test('standalone invitation preserves Pages source and publishes only its dependency closure', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sungso-invitation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pagesSource = await readFile(path.join(PROJECT_ROOT, 'apps/invitation-v5/index.html'));
  const result = await buildInvitation({ distDir: path.join(root, 'dist') });
  // Two opt-in scene accent assets join the existing invitation dependency closure.
  assert.ok(result.fileCount <= 277);
  assert.deepEqual(await readFile(path.join(PROJECT_ROOT, 'apps/invitation-v5/index.html')), pagesSource);
  for (const required of ['index.html', 'map.html', 'wedding.ics', 'manage.html', 'accounts.html',
    'assets/audio/wedding-day.mp3', 'assets/fonts/RIDIBatang-Regular.woff2',
    'shared/firebase/site-auth.mjs', 'shared/invitation/album-core.mjs', '404.html']) {
    assert.ok(result.files.includes(required), required);
  }
  for (const unwanted of ['homehunt/index.html', 'wecost/index.html', 'honeymoon/index.html',
    'shared/firebase/boot.mjs', 'responses.html', 'js/rsvp.mjs', 'js/responses.mjs',
    'assets/fonts/InvitationSerif-Regular.woff2']) assert.ok(!result.files.includes(unwanted), unwanted);
  const read = file => readFile(path.join(result.distDir, file), 'utf8');
  const html = await read('index.html');
  assert.match(html, /data-version="5\.6\.0"/);
  assert.ok(html.includes(`property="og:url" content="${INVITATION_ORIGIN}/"`));
  assert.ok(html.includes(`property="og:image" content="${INVITATION_ORIGIN}/assets/photos/date-1440.webp"`));
  assert.ok((await read('wedding.ics')).includes(`URL:${INVITATION_ORIGIN}/\r\n`));
  assert.ok((await read('js/config.mjs')).includes(`canonicalUrl: '${INVITATION_ORIGIN}/'`));
  assert.match(await read('v6/index.html'), /data-version="6\.1\.0"/);
  assert.ok((await read('v6/index.html')).includes(`property="og:url" content="${INVITATION_ORIGIN}/v6/"`));
  assert.ok((await read('v6/wedding.ics')).includes(`URL:${INVITATION_ORIGIN}/v6/\r\n`));
  assert.ok((await read('v6/js/config.mjs')).includes(`canonicalUrl: '${INVITATION_ORIGIN}/v6/'`));
  assert.doesNotMatch(html, /site-auth|auth-boot|data-private-root/);
  for (const file of ['manage.html', 'accounts.html', 'v6/manage.html', 'v6/accounts.html']) {
    const admin = await read(file);
    assert.match(admin, /standalone\/auth-boot\.mjs/);
    assert.match(admin, /data-private-root hidden/);
    assert.match(admin, /type="application\/x-sungso-script"/);
    assert.doesNotMatch(admin, /responses\.html|\/sungso\/|github\.io/);
  }
  const sharedAuth = await read('shared/firebase/site-auth.mjs');
  assert.equal(sharedAuth.replaceAll('\r\n', '\n'), (await readFile(path.join(PROJECT_ROOT, 'shared/firebase/site-auth.mjs'), 'utf8')).replaceAll('\r\n', '\n'));
  assert.ok(!JSON.parse(await read('vercel.json')).rewrites);
  const server = createInvitationPreview(result.distDir);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const local = `http://127.0.0.1:${server.address().port}`;
  for (const pathname of ['/homehunt/', '/homehunt/index.html', '/wecost/', '/honeymoon/', '/sungso/', '/apps/hub/index.html', '/responses.html', '/shared/firebase/boot.mjs']) {
    assert.equal((await fetch(local + pathname)).status, 404, pathname);
  }
  assert.equal((await fetch(local + '/')).status, 200);
  assert.equal((await fetch(local + '/v6/')).status, 200);
  assert.equal((await fetch(local + '/v6/homehunt/')).status, 404);
  const audio = await fetch(local + '/assets/audio/wedding-day.mp3', { headers: { Range: 'bytes=0-1023' } });
  assert.equal(audio.status, 206); assert.equal((await audio.arrayBuffer()).byteLength, 1024);
  await writeFile(path.join(result.distDir, 'index.html'), html.replace('#wedding-day', '/homehunt/'));
  await assert.rejects(verifyInvitation(result.distDir), /Old site navigation|missing local resource/);
});
