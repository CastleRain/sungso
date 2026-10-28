import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { INVITATION_ORIGIN, INVITATION_DIST } from './build-invitation-vercel.mjs';
import { PROJECT_ROOT } from './build-site.mjs';

// Read-only production probes. Never create a message, upload a photo, or edit an account.
const api = 'https://sungso-homehunt-api.onrender.com';
const report = { checkedAt: new Date().toISOString(), origin: INVITATION_ORIGIN, assets: [], missingPaths: [], api: [], pagesPreserved: [] };
async function get(url, options = {}) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(45000), ...options });
  return response;
}
const manifest = JSON.parse(await readFile(path.join(PROJECT_ROOT, '.local/invitation-vercel-manifest.json'), 'utf8'));
const hash = data => createHash('sha256').update(data).digest('hex');
const candidates = manifest.files.filter(file => !['.nojekyll', 'vercel.json'].includes(file));
for (let offset = 0; offset < candidates.length; offset += 5) {
  await Promise.all(candidates.slice(offset, offset + 5).map(async file => {
    const audio = file.endsWith('.mp3');
    const response = await get(`${INVITATION_ORIGIN}/${file}`, audio ? { headers: { Range: 'bytes=0-1023' } } : {});
    assert.equal(response.status, audio ? 206 : 200, file);
    const bytes = Buffer.from(await response.arrayBuffer());
    const local = await readFile(path.join(INVITATION_DIST, file));
    assert.equal(hash(bytes), hash(audio ? local.subarray(0, 1024) : local), file);
    report.assets.push({ file, status: response.status, matches: true, contentType: response.headers.get('content-type') });
  }));
}
for (const pathname of ['/homehunt/', '/homehunt/index.html', '/wecost/', '/wecost/index.html', '/honeymoon/',
  '/homehunt-v2/', '/travel/', '/sohee/', '/sungso/', '/invitation-v3/', '/invitation-v4/',
  '/apps/hub/index.html', '/services/homehunt/render/node-server.mjs', '/config/apps.json', '/.env.local',
  '/.git/config', '/.vercel/project.json', '/shared/firebase/boot.mjs', '/responses.html',
  '/v6/homehunt/', '/v6/wecost/', '/v6/honeymoon/', '/v6/responses.html',
  ...(manifest.lab ? ['/lab/v6-1/homehunt/', '/lab/v6-1/wecost/', '/lab/v6-1/honeymoon/',
    '/lab/v6-1/manage.html', '/lab/v6-1/accounts.html', '/lab/v6-1/scripts/build.mjs',
    '/lab/v6-1/src/index.template.html', '/lab/v6-1/tests/demo-data.test.mjs', '/lab/v6-1/z/'] : []),
  ...(manifest.experience ? ['/lab/experience/homehunt/', '/lab/experience/wecost/', '/lab/experience/honeymoon/',
    '/lab/experience/manage.html', '/lab/experience/accounts.html', '/lab/experience/scripts/build.mjs',
    '/lab/experience/src/index.template.html', '/lab/experience/tests/', '/lab/experience/z/'] : []),
  ...(manifest.studio ? ['/lab/studio/homehunt/', '/lab/studio/wecost/', '/lab/studio/honeymoon/',
    '/lab/studio/manage.html', '/lab/studio/accounts.html', '/lab/studio/scripts/build.mjs',
    '/lab/studio/src/index.template.html', '/lab/studio/tests/', '/lab/studio/z/'] : [])]) {
  const response = await get(INVITATION_ORIGIN + pathname);
  assert.equal(response.status, 404, pathname);
  report.missingPaths.push({ path: pathname, status: response.status });
}
const root = await get(INVITATION_ORIGIN + '/');
assert.equal(root.status, 200);
const rootHtml = await root.text();
assert.match(rootHtml, /data-version="5\.6\.0"/);
assert.ok(rootHtml.includes(`property="og:url" content="${INVITATION_ORIGIN}/"`));
const edition = await get(INVITATION_ORIGIN + '/v6/');
assert.equal(edition.status, 200);
const editionHtml = await edition.text();
assert.match(editionHtml, /data-version="6\.1\.0"/);
assert.ok(editionHtml.includes(`property="og:url" content="${INVITATION_ORIGIN}/v6/"`));
report.editions = { root: '5.6.0', v6: '6.1.0' };
for (const key of ['lab', 'experience', 'studio'].filter(key => manifest[key])) {
  const collection = manifest[key];
  report[key] = [];
  const catalog = await get(`${INVITATION_ORIGIN}/${collection.path}/`);
  assert.equal(catalog.status, 200, 'comparison catalog');
  assert.match(await catalog.text(), /noindex,nofollow/);
  for (const id of collection.variants) {
    const url = `${INVITATION_ORIGIN}/${collection.path}/${id}/`;
    const response = await get(url);
    assert.equal(response.status, 200, `study ${id}`);
    const html = await response.text();
    assert.ok(html.includes(`data-variant="${key === 'studio' ? 'f' : id}"`));
    assert.ok(html.includes('data-mode="demo"'));
    assert.ok(html.includes(`property="og:url" content="${url}"`));
    assert.match(html, /connect-src 'self'/);
    const event = await get(url + 'wedding.ics');
    assert.equal(event.status, 200);
    assert.ok((await event.text()).includes(`URL:${url}`));
    report[key].push({id, url, status: 200, mode: 'demo', calendarUrlMatches: true, networkRestricted: true});
  }
}
const privateRoutes = ['/api/invitation/v3/album/manage', '/api/invitation/v5/accounts/manage'];
for (const route of ['/api/invitation/v3/guestbook', '/api/invitation/v3/album', '/api/invitation/v5/accounts', ...privateRoutes]) {
  const response = await get(api + route, { headers: { Origin: INVITATION_ORIGIN } });
  assert.equal(response.status, privateRoutes.includes(route) ? 401 : 200, route);
  assert.equal(response.headers.get('access-control-allow-origin'), INVITATION_ORIGIN, route);
  report.api.push({ path: route, status: response.status, origin: INVITATION_ORIGIN });
  const preflight = await get(api + route, { method: 'OPTIONS', headers: {
    Origin: INVITATION_ORIGIN, 'Access-Control-Request-Method': privateRoutes.includes(route) ? 'PUT' : 'GET',
    'Access-Control-Request-Headers': 'Content-Type' + (privateRoutes.includes(route) ? ', Authorization' : ''),
  } });
  assert.equal(preflight.status, 204, route);
  assert.equal(preflight.headers.get('access-control-allow-origin'), INVITATION_ORIGIN, route);
}
for (const [origin, route] of [
  [INVITATION_ORIGIN, '/api/health'], [INVITATION_ORIGIN, '/api/quota'], [INVITATION_ORIGIN, '/api/apartment-history'],
  [INVITATION_ORIGIN, '/api/invitation/v5/rsvp'], [INVITATION_ORIGIN, '/api/invitation/v5/accounts/other'],
  ['https://random-preview.vercel.app', '/api/invitation/v3/album'],
  ['https://sungso-wedding.vercel.app.evil.example', '/api/invitation/v5/accounts'],
]) {
  for (const method of ['GET', 'OPTIONS']) {
    const response = await get(api + route, { method, headers: { Origin: origin } });
    assert.equal(response.status, 403, route);
    assert.equal(response.headers.get('access-control-allow-origin'), null, route);
    report.api.push({ path: route, status: response.status, origin, method });
  }
}
const oldOrigin = 'https://castlerain.github.io';
const legacy = await get(api + '/api/invitation/v3/album', { headers: { Origin: oldOrigin } });
assert.equal(legacy.status, 200); assert.equal(legacy.headers.get('access-control-allow-origin'), oldOrigin);
for (const file of ['index.html', 'css/typography.css', 'js/config.mjs', 'wedding.ics']) {
  const response = await get(`${oldOrigin}/sungso/invitation-v5/${file}`);
  assert.equal(response.status, 200, `Pages ${file}`);
  const local = await readFile(path.join(PROJECT_ROOT, 'apps/invitation-v5', file), 'utf8');
  const remote = await response.text();
  // Pages rewrites module import locations, so compare its build for JavaScript.
  const expected = file.endsWith('.mjs') ? await readFile(path.join(PROJECT_ROOT, 'dist/invitation-v5', file), 'utf8') : local;
  assert.equal(remote.replaceAll('\r\n', '\n'), expected.replaceAll('\r\n', '\n'), `Pages unchanged ${file}`);
  report.pagesPreserved.push(file);
}
report.assets.sort((a, b) => a.file.localeCompare(b.file));
const reportDirectory = manifest.studio ? 'docs/invitation-studio' : manifest.experience ? 'docs/invitation-experience' : manifest.lab ? 'docs/invitation-lab' : 'docs/invitation-v6-review';
await mkdir(path.join(PROJECT_ROOT, reportDirectory), { recursive: true });
await writeFile(path.join(PROJECT_ROOT, reportDirectory, 'live-check.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: 'passed', assets: report.assets.length, missingPaths: report.missingPaths.length,
  apiChecks: report.api.length, preservedPagesFiles: report.pagesPreserved.length, labVariants: report.lab?.length || 0,
  experienceVariants: report.experience?.length || 0, studioVariants: report.studio?.length || 0, productionWrites: 0 }));
