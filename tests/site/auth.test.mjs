import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { memberFromClaims, safeReturnPath, createAuthEpoch } from '../../shared/firebase/auth-core.mjs';
import { loadRegistry } from '../../scripts/build-site.mjs';

const claims = { email_verified: true, firebase: { sign_in_provider: 'google.com' } };
test('only active verified Google members with known roles resolve to a display identity', () => {
  for (const role of ['sungwoo', 'sohee']) assert.equal(memberFromClaims({ uid: 'test' }, claims, { active: true, role }).role, role);
  for (const record of [null, {}, { active: false, role: 'sungwoo' }, { active: true, role: 'admin' }]) assert.equal(memberFromClaims({ uid: 'test' }, claims, record), null);
  for (const token of [{}, { ...claims, email_verified: false }, { ...claims, firebase: { sign_in_provider: 'password' } }]) assert.equal(memberFromClaims({ uid: 'test' }, token, { active: true, role: 'sungwoo' }), null);
  assert.equal(memberFromClaims(null, claims, { active: true, role: 'sohee' }), null);
});
test('return links stay in the same site including query and hash, rejecting credential and encoded escapes', () => {
  const origin = 'https://example.test';
  assert.equal(safeReturnPath('/sungso/invitation/#preview/envelope', origin), '/sungso/invitation/#preview/envelope');
  assert.equal(safeReturnPath('/sungso/wecost/?tab=wedding', origin), '/sungso/wecost/?tab=wedding');
  for (const value of ['https://evil.test/sungso/', '//evil.test/sungso/', '/sungso-other/', '/sungso/../../outside', '/outside', '/sungso/%2f%2fevil', '/sungso/%5coutside', 'javascript:alert(1)', 'https://name:password@example.test/sungso/', '/sungso/\\outside']) assert.equal(safeReturnPath(value, origin), null, value);
});
test('auth epoch rejects stale asynchronous identity results', () => {
  const gate = createAuthEpoch(), first = gate.next(); assert.equal(gate.valid(first), true);
  const second = gate.next(); assert.equal(gate.valid(first), false); assert.equal(gate.valid(second), true);
});
test('every entry defers all application scripts until the common auth bootstrap', async () => {
  for (const { id: app } of (await loadRegistry()).apps) {
    const html = await readFile(new URL(`../../apps/${app}/index.html`, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /sungso_pin_auth/);
    assert.match(html, /data-private-root[^>]*hidden/);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.some(([, attrs]) => attrs.includes('firebase/boot.mjs')), app);
    for (const [, attrs, content] of scripts) {
      if (attrs.includes('firebase/boot.mjs')) continue;
      assert.match(attrs, /type="application\/x-sungso-script"/, app);
      assert.equal(content.trim(), '', `${app}: inline personal code must not execute`);
    }
  }
});
