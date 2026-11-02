import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createGlassQaServer } from './glass-qa-server.mjs';
import { GLASS_QA_ROUTES, lifeFixture } from './glass-qa-fixtures.mjs';

test('glass QA serves all 14 real dist entries and isolates synthetic storage', async t => {
  const server = await createGlassQaServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (body, uid = 'qa-sungwoo') => fetch(origin + '/__qa/data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-QA-UID': uid }, body: JSON.stringify(body) });
  const read = async path => (await (await post({ op: 'read', ref: { kind: 'doc', path } })).json()).data;
  for (const route of GLASS_QA_ROUTES) {
    const response = await fetch(origin + '/sungso/' + route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.match(await response.text(), /\/__qa\/bootstrap\.js/);
  }
  const auth = await (await fetch(origin + '/sungso/shared/firebase/site-auth.mjs')).text();
  assert.doesNotMatch(auth, /https:\/\/www\.gstatic\.com\/firebasejs/);
  assert.match(auth, /\/__qa\/firebase-auth\.mjs/);
  assert.match(await (await fetch(origin + '/__qa/bootstrap.js')).text(), /예시 하객 A/);
  assert.equal(lifeFixture().guests.length, 2);
  assert.equal((await post({ op: 'read', ref: { kind: 'doc', path: 'wecost_settings/main' } }, 'qa-nonmember')).status, 403);
  const manifest = await read('sohee_sales/current');
  const chunk = await read(`sohee_sales_versions/${manifest.version}/chunks/0`);
  assert.equal(createHash('sha256').update(chunk.payload).digest('hex'), manifest.version);
  assert.ok(JSON.parse(chunk.payload).data.monthly.length > 0);
  const change = { op: 'commit', readVersions: { 'wecost_settings/qa-test': 0 }, changes: [{ type: 'set', path: 'wecost_settings/qa-test', value: { title: 'synthetic only' } }] };
  assert.equal((await post(change)).status, 200);
  assert.equal((await read('wecost_settings/qa-test')).title, 'synthetic only');
  assert.equal((await post(change)).status, 409);
  await fetch(origin + '/__qa/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fail-next-write' }) });
  assert.equal((await post({ op: 'write', changes: [] })).status, 503);
  const headers = { Authorization: 'Bearer qa-synthetic-qa-sungwoo' };
  const journey = await (await fetch(origin + '/__qa/api/journey/v1/days/2026-10-18', { headers })).json();
  assert.equal(journey.ok, true);
  assert.ok(journey.day.records.length >= 4);
  assert.equal((await fetch(origin + '/__qa/api/journey/v1/days/2026-10-18')).status, 401);
  assert.equal((await (await fetch(origin + '/api/sohee/status', { headers })).json()).writesEnabled, false);
  assert.equal((await fetch(origin + '/api/provider-real')).status, 403);
  assert.equal((await fetch(origin + '/__qa/api/search', { headers })).status, 503);
  assert.equal((await fetch(origin + '/__qa/control', { method: 'POST', headers: { Origin: 'https://example.invalid' }, body: '{}' })).status, 403);
  const state = await (await fetch(origin + '/__qa/state')).json();
  assert.equal(state.syntheticOnly, true);
  assert.equal(state.counters.productionRequests, 0);
});

test('glass QA baseline serves the preserved original build', { skip: !existsSync(new URL('../../.local/glass-qa/baseline/dist/index.html', import.meta.url)) }, async t => {
  const server = await createGlassQaServer({ baseline: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(origin + '/sungso/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /\/__qa\/bootstrap\.js/);
  assert.equal((await (await fetch(origin + '/__qa/state')).json()).baseline, true);
});
