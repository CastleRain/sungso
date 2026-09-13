import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommuteAutoRunner } from '../js/commute-auto-runner.mjs';

const houses = number => Array.from({ length: number }, (_, index) => ({ catalogId: `synthetic-${index}` }));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(options = {}) {
  const candidates = houses(options.houses ?? 10);
  const context = { key: 'synthetic-context-1', provider: 'kakao', candidates, callsPerCandidate: 3,
    remainingDailyQuota: 1000, busy: false, ...options.context };
  const calls = [], updates = [];
  const runner = createCommuteAutoRunner({ getContext: () => context,
    runCandidate: async (candidate, request) => {
      calls.push({ candidate, ...request });
      const receipt = options.receipt ? await options.receipt(candidate, request, calls.length) : { actualCalls: 3, decision: 'matched' };
      if (Number.isFinite(receipt?.actualCalls)) context.remainingDailyQuota -= receipt.actualCalls;
      return receipt;
    }, onProgress: state => updates.push(state),
  });
  return { runner, calls, context, updates };
}

test('constructing a runner does not start requests or restore a previous run', async () => {
  const { runner, calls } = fixture(); await tick();
  assert.equal(calls.length, 0); assert.equal(runner.snapshot().running, false);
  assert.equal(runner.snapshot().maxCalls, 100);
});

test('900 candidates respect the conservative per-house budget instead of verifying every candidate', async () => {
  const { runner, calls } = fixture({ houses: 900 });
  runner.start(); await runner.whenIdle();
  assert.equal(calls.length, 33);
  assert.ok(calls.every(call => call.callBudget === 3));
  assert.equal(runner.snapshot().actualCalls, 99);
  assert.equal(runner.snapshot().remainingBudget, 1);
  assert.equal(runner.snapshot().matched, 33);
  assert.equal(runner.snapshot().reason, 'BUDGET_LIMIT');
});

test('early exclusion saves calls and lets additional complete houses fit in the same limit', async () => {
  const { runner, calls } = fixture({ receipt: () => ({ actualCalls: 1, decision: 'excluded' }) });
  runner.start({ maxCalls: 5 }); await runner.whenIdle();
  assert.equal(calls.length, 3);
  assert.equal(runner.snapshot().actualCalls, 3);
  assert.equal(runner.snapshot().excluded, 3);
  assert.equal(runner.snapshot().reason, 'BUDGET_LIMIT');
});

test('daily quota blocks a new house unless all its expected calls remain available', async () => {
  const { runner, calls } = fixture({ context: { remainingDailyQuota: 5 } });
  runner.start({ maxCalls: 100 }); await runner.whenIdle();
  assert.equal(calls.length, 1); assert.equal(runner.snapshot().actualCalls, 3);
  assert.equal(runner.snapshot().reason, 'DAILY_LIMIT');
});

test('daily quota unavailable never means unlimited calls', async () => {
  const { runner, calls } = fixture({ context: { remainingDailyQuota: null } });
  runner.start(); await runner.whenIdle();
  assert.equal(calls.length, 0); assert.equal(runner.snapshot().reason, 'QUOTA_UNKNOWN');
});

test('a condition or provider change stops before another candidate', async () => {
  for (const field of ['key', 'provider']) {
    const gate = deferred();
    const { runner, calls, context } = fixture({ receipt: () => gate.promise });
    runner.start(); await tick();
    context[field] = field === 'key' ? 'synthetic-context-2' : 'tmap';
    gate.resolve({ actualCalls: 2, decision: 'excluded' }); await runner.whenIdle();
    assert.equal(calls.length, 1); assert.equal(runner.snapshot().actualCalls, 2);
    assert.equal(runner.snapshot().reason, 'CONTEXT_CHANGED');
  }
});

test('stop lets the inflight house finish, retains its result, and starts no next house', async () => {
  const gate = deferred();
  const { runner, calls } = fixture({ receipt: () => gate.promise });
  runner.start(); await tick();
  assert.equal(calls.length, 1);
  runner.stop(); assert.equal(runner.snapshot().stopping, true);
  gate.resolve({ actualCalls: 3, decision: 'matched' }); await runner.whenIdle();
  assert.equal(calls.length, 1); assert.equal(runner.snapshot().actualCalls, 3);
  assert.equal(runner.snapshot().matched, 1); assert.equal(runner.snapshot().reason, 'STOPPED');
  assert.equal(runner.snapshot().running, false);
});

test('stop during asynchronous context preparation starts no request', async () => {
  const gate = deferred(); let calls = 0;
  const runner = createCommuteAutoRunner({ getContext: () => gate.promise, runCandidate: () => { calls += 1; } });
  runner.start(); await tick(); runner.stop();
  gate.resolve({ key: 'context', provider: 'kakao', candidates: houses(1), callsPerCandidate: 3, remainingDailyQuota: 100, busy: false });
  await runner.whenIdle(); assert.equal(calls, 0); assert.equal(runner.snapshot().reason, 'STOPPED');
});

test('an error receipt preserves actual spending and stops subsequent calls', async () => {
  const { runner, calls } = fixture({ receipt: () => ({ actualCalls: 2, decision: 'pending', error: true }) });
  runner.start(); await runner.whenIdle();
  assert.equal(calls.length, 1); assert.equal(runner.snapshot().actualCalls, 2);
  assert.equal(runner.snapshot().pending, 1); assert.equal(runner.snapshot().reason, 'ERROR');
});

test('missing or invalid receipts stop without pretending the unknown usage was zero', async () => {
  for (const actualCalls of [null, undefined, -1, Infinity, 1.5, false, true, '3']) {
    const { runner, calls } = fixture({ receipt: () => ({ actualCalls, decision: 'pending' }) });
    runner.start(); await runner.whenIdle();
    assert.equal(calls.length, 1); assert.equal(runner.snapshot().reason, 'UNKNOWN_RECEIPT');
    assert.equal(runner.snapshot().usageUncertain, true); assert.equal(runner.snapshot().remainingBudget, null);
  }
});

test('thrown candidate request has an uncertain receipt and stops instead of retrying', async () => {
  const { runner, calls } = fixture({ receipt: () => { throw new Error('synthetic network error'); } });
  runner.start(); await runner.whenIdle();
  assert.equal(calls.length, 1); assert.equal(runner.snapshot().reason, 'UNKNOWN_RECEIPT');
});

test('zero new calls with no result stops a no-progress loop', async () => {
  const { runner, calls } = fixture({ receipt: () => ({ actualCalls: 0, decision: 'pending' }) });
  runner.start(); await runner.whenIdle();
  assert.equal(calls.length, 1); assert.equal(runner.snapshot().reason, 'NO_PROGRESS');
});

test('zero-call confirmed results are accepted once per house without repeat requests', async () => {
  const { runner, calls } = fixture({ houses: 3, receipt: () => ({ actualCalls: 0, decision: 'matched' }) });
  runner.start(); await runner.whenIdle();
  assert.equal(calls.length, 3); assert.equal(new Set(calls.map(call => call.candidate.catalogId)).size, 3);
  assert.equal(runner.snapshot().actualCalls, 0); assert.equal(runner.snapshot().matched, 3);
  assert.equal(runner.snapshot().reason, 'COMPLETED');
});

test('another task being busy prevents an automatic request', async () => {
  const { runner, calls } = fixture({ context: { busy: true } });
  runner.start(); await runner.whenIdle();
  assert.equal(calls.length, 0); assert.equal(runner.snapshot().reason, 'BUSY');
});

test('automobile-only context is explicitly unsupported without route calls', async () => {
  const { runner, calls } = fixture({ context: { callsPerCandidate: 0, provider: 'naver' } });
  runner.start(); await runner.whenIdle();
  assert.equal(calls.length, 0); assert.equal(runner.snapshot().reason, 'UNSUPPORTED_MODE');
});

test('repeated starts while active do not change the budget or duplicate inflight requests', async () => {
  const gate = deferred();
  const { runner, calls } = fixture({ receipt: () => gate.promise });
  runner.start({ maxCalls: 3 }); await tick(); runner.start({ maxCalls: 200 });
  assert.equal(runner.snapshot().maxCalls, 3); assert.equal(calls.length, 1);
  gate.resolve({ actualCalls: 3, decision: 'matched' }); await runner.whenIdle();
  assert.equal(calls.length, 1);
});

test('over-budget receipt records the real consumption and stops instead of masking the excess', async () => {
  const { runner, calls } = fixture({ receipt: () => ({ actualCalls: 4, decision: 'matched' }) });
  runner.start({ maxCalls: 3 }); await runner.whenIdle();
  assert.equal(calls.length, 1); assert.equal(runner.snapshot().actualCalls, 4);
  assert.equal(runner.snapshot().reason, 'BUDGET_EXCEEDED');
});

test('a new run only begins on another explicit start and resets session counters', async () => {
  const { runner, calls } = fixture({ houses: 1 });
  runner.start({ maxCalls: 3 }); await runner.whenIdle();
  await tick(); assert.equal(calls.length, 1);
  runner.start({ maxCalls: 3 }); await runner.whenIdle();
  assert.equal(calls.length, 2); assert.equal(runner.snapshot().actualCalls, 3);
});

test('invalid budgets cannot launch a request', async () => {
  for (const maxCalls of [0, -1, Infinity, 201, 'all']) {
    const { runner, calls } = fixture();
    runner.start({ maxCalls }); await runner.whenIdle();
    assert.equal(calls.length, 0); assert.equal(runner.snapshot().reason, 'INVALID_BUDGET');
  }
});
