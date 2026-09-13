import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStaticServer } from '../../scripts/dev-site.mjs';

async function preview(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'sungso-site-preview-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const distDir = path.join(root, 'dist');
  await mkdir(path.join(distDir, 'sample'), { recursive: true });
  await writeFile(path.join(root, 'private.json'), '{"private":"fixture"}');
  await writeFile(path.join(distDir, 'index.html'), '<h1>Hub</h1>');
  await writeFile(path.join(distDir, 'sample/index.html'), '<h1>Sample</h1>');
  await writeFile(path.join(distDir, 'sample/main.mjs'), 'export const loaded = true;');
  await writeFile(path.join(distDir, 'sample/견적서.pdf'), 'fixture PDF bytes');
  const server = createStaticServer({ distDir });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('preview serves both root and GitHub Pages prefix without exposing source directories', async t => {
  const base = await preview(t);
  for (const pathname of ['/', '/sungso/', '/sample/', '/sungso/sample/']) {
    const response = await fetch(base + pathname);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<h1>/);
  }
  for (const pathname of ['/private.json', '/services/private.json', '/sungso/archive/', '/sungso/apps/sample/']) {
    assert.equal((await fetch(base + pathname)).status, 404);
  }
});

test('preview redirects folder URLs while preserving query strings and serves module/PDF MIME', async t => {
  const base = await preview(t);
  const redirect = await fetch(`${base}/sungso/sample?tab=house`, { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/sungso/sample/?tab=house');
  const module = await fetch(`${base}/sungso/sample/main.mjs?v=4.4.0`);
  assert.match(module.headers.get('content-type'), /javascript/);
  assert.equal(module.headers.get('cache-control'), 'no-store');
  const pdf = await fetch(`${base}/sungso/sample/${encodeURIComponent('견적서.pdf')}`, { method: 'HEAD' });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(await pdf.text(), '');
});

test('preview rejects writes and malformed or escaping paths', async t => {
  const base = await preview(t);
  assert.equal((await fetch(`${base}/sungso/`, { method: 'POST', body: 'must not be written' })).status, 405);
  assert.equal((await fetch(`${base}/sungso/%zz`)).status, 400);
  assert.equal((await fetch(`${base}/sungso/%2e%2e%2fprivate.json`)).status, 404);
  assert.equal((await fetch(`${base}/sungso/.env`)).status, 404);
});
