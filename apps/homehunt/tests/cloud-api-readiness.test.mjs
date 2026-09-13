import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudApiReadiness } from '../js/cloud-api-readiness.mjs';

const ok = () => new Response('{"ok":true}');
test('simultaneous requests share a public wake probe and reuse it while active', async () => {
  const calls = []; const states = []; let time = 0; let release;
  const gate = createCloudApiReadiness({ url: 'https://example.onrender.com/healthz', now: () => time,
    onState: state => states.push(state), fetchImpl: (url, options) => {
      calls.push({ url, options }); return new Promise(resolve => { release = resolve; });
    } });
  const a = gate.ensure(); const b = gate.ensure();
  assert.equal(calls.length, 1); release(ok()); await Promise.all([a, b]);
  assert.equal(calls[0].options.credentials, 'omit'); assert.equal(calls[0].options.headers, undefined);
  assert.equal(calls[0].options.redirect, 'error');
  time = 590000; gate.touch(); time = 1100000; await gate.ensure(); assert.equal(calls.length, 1);
  time = 1200000; const next = gate.ensure(); assert.equal(calls.length, 2); release(ok()); await next;
  assert.deepEqual(states, ['waking', 'ready', 'waking', 'ready']);
});

test('cancelling one caller preserves the shared probe for another caller', async () => {
  let release; const gate = createCloudApiReadiness({ url: 'https://example.onrender.com/healthz',
    fetchImpl: () => new Promise(resolve => { release = resolve; }) });
  const cancel = new AbortController(); const a = gate.ensure(cancel.signal); const b = gate.ensure();
  cancel.abort(); await assert.rejects(a, { name: 'AbortError' }); release(ok()); await b;
});

test('failed readiness is never cached and does not automatically retry', async () => {
  let calls = 0; const states = [];
  const gate = createCloudApiReadiness({ url: 'https://example.onrender.com/healthz', onState: s => states.push(s),
    fetchImpl: async () => { calls += 1; return calls === 1 ? new Response('loading', { status: 503 }) : ok(); } });
  await assert.rejects(gate.ensure()); assert.equal(calls, 1);
  await gate.ensure(); assert.equal(calls, 2);
  assert.deepEqual(states, ['waking', 'unavailable', 'waking', 'ready']);
});

test('reset aborts old work without allowing its late completion to ready a new session', async () => {
  const states = []; let release; const gate = createCloudApiReadiness({ url: 'https://example.onrender.com/healthz',
    onState: state => states.push(state), fetchImpl: () => new Promise(resolve => { release = resolve; }) });
  const old = gate.ensure(); gate.reset(); release(ok());
  await assert.rejects(old, { name: 'AbortError' }); assert.deepEqual(states, ['waking', 'idle']);
});

test('readiness has a finite timeout and an already cancelled caller never wakes the server', async () => {
  let calls = 0; const gate = createCloudApiReadiness({ url: 'https://example.onrender.com/healthz', timeoutMs: 5,
    fetchImpl: (_url, { signal }) => { calls += 1; return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }); } });
  await assert.rejects(gate.ensure(), { name: 'AbortError' }); assert.equal(calls, 1);
  await assert.rejects(gate.ensure(AbortSignal.abort()), { name: 'AbortError' }); assert.equal(calls, 1);
});
