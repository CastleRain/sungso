import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficialComplexQueue } from '../js/official-complex-queue.mjs';

const candidate = (id, extra = {}) => ({ catalogId: String(id), id: `price-${id}`, ...extra });
const matched = () => ({ status: 'matched', complexMatchConfirmed: true, parkingEvidence: { sourceType: 'official', spacesPerHousehold: 1.3 }, errors: [] });
const partial = (code) => ({ status: 'partial', complexMatchConfirmed: true, errors: code ? [{ code }] : [] });
const failed = (code = 'NETWORK_ERROR') => ({ status: 'unavailable', complexMatchConfirmed: false, errors: [{ code }] });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('900 distinct complexes all complete with bounded concurrency and no ten-item cap', async () => {
  let active = 0;
  let peak = 0;
  let calls = 0;
  const completed = new Set();
  const queue = createOfficialComplexQueue({
    load: async (item, options) => {
      assert.equal(options.refresh, false);
      assert.ok(item.catalogId);
      calls += 1;
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return matched();
    },
    onProgress: state => completed.add(state.completed),
  });
  queue.replace(Array.from({ length: 900 }, (_, index) => candidate(index)));
  const result = await queue.whenIdle();
  assert.equal(calls, 900);
  assert.equal(peak, 2);
  assert.equal(result.total, 900);
  assert.equal(result.completed, 900);
  assert.equal(result.matched, 900);
  assert.equal(result.pending, 0);
  assert.equal(result.running, 0);
  assert.equal(result.paused, false);
  assert.equal(completed.size, 901);
});

test('catalog ID deduplicates saved/current/visit and multiple area candidates', async () => {
  const loaded = [];
  const queue = createOfficialComplexQueue({ load: async item => { loaded.push(item); return matched(); } });
  queue.replace([candidate('a'), candidate('a', { id: 'another-area' }), candidate('a', { id: 'visit' }), candidate('b'), { id: 'no-catalog-id' }, { catalogId: '../invalid' }]);
  await queue.whenIdle();
  assert.deepEqual(loaded.map(item => item.catalogId), ['a', 'b']);
  assert.equal(queue.snapshot().total, 2);
});

test('partial, no match, ambiguous, and failed outcomes stay separate; retry skips terminal outcomes', async () => {
  const calls = [];
  const queue = createOfficialComplexQueue({ concurrency: 1, load: async (item, options) => {
    calls.push({ id: item.catalogId, refresh: options.refresh });
    if (options.refresh) return matched();
    return { a: matched(), b: partial(), c: { status: 'unmatched' }, d: { status: 'ambiguous' }, e: failed() }[item.catalogId];
  } });
  queue.replace(['a', 'b', 'c', 'd', 'e'].map(id => candidate(id)));
  let result = await queue.whenIdle();
  assert.deepEqual({ completed: result.completed, matched: result.matched, partial: result.partial, unmatched: result.unmatched, failed: result.failed }, { completed: 5, matched: 1, partial: 1, unmatched: 2, failed: 1 });
  queue.retry();
  result = await queue.whenIdle();
  assert.deepEqual(calls.slice(5), [{ id: 'b', refresh: true }, { id: 'e', refresh: true }]);
  assert.equal(result.matched, 3);
  assert.equal(result.unmatched, 2);
  assert.equal(result.partial, 0);
  assert.equal(result.failed, 0);
});

test('replacement preserves completed overlap and never reloads the same inflight catalog ID', async () => {
  const slow = deferred();
  const calls = [];
  const queue = createOfficialComplexQueue({ concurrency: 1, load: async item => {
    calls.push(item.catalogId);
    return item.catalogId === 'a' ? slow.promise : matched();
  } });
  queue.replace([candidate('a'), candidate('removed')]);
  await tick();
  queue.replace([candidate('a', { id: 'different-area' }), candidate('b')]);
  slow.resolve(matched());
  await queue.whenIdle();
  assert.deepEqual(calls, ['a', 'b']);
  queue.replace([candidate('a'), candidate('c')]);
  const result = await queue.whenIdle();
  assert.deepEqual(calls, ['a', 'b', 'c']);
  assert.equal(result.total, 2);
  assert.equal(result.matched, 2);
});

test('removed late responses cannot become completed rows or block a replacement set', async () => {
  const old = deferred();
  const calls = [];
  const queue = createOfficialComplexQueue({ concurrency: 1, load: async item => {
    calls.push(item.catalogId);
    return item.catalogId === 'old' ? old.promise : matched();
  } });
  queue.replace([candidate('old'), candidate('never-started')]);
  await tick();
  queue.replace([candidate('new')]);
  assert.equal(queue.snapshot().completed, 0);
  assert.equal(queue.snapshot().pending, 1);
  old.resolve(failed('ACCESS_DENIED'));
  const result = await queue.whenIdle();
  assert.deepEqual(calls, ['old', 'new']);
  assert.equal(result.completed, 1);
  assert.equal(result.matched, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.paused, false);
});

test('removed then re-added inflight ID rejoins its existing request', async () => {
  const first = deferred();
  let calls = 0;
  const queue = createOfficialComplexQueue({ load: async () => { calls += 1; return first.promise; } });
  queue.replace([candidate('a')]);
  await tick();
  queue.replace([]);
  queue.replace([candidate('a', { id: 'another-area' })]);
  first.resolve(matched());
  const result = await queue.whenIdle();
  assert.equal(calls, 1);
  assert.equal(result.matched, 1);
});

test('pause stops dispatch, drains the two active requests, and resume processes pending', async () => {
  const active = new Map();
  const calls = [];
  const queue = createOfficialComplexQueue({ load: async item => {
    calls.push(item.catalogId);
    if (calls.length <= 2) { const pending = deferred(); active.set(item.catalogId, pending); return pending.promise; }
    return matched();
  } });
  queue.replace(['a', 'b', 'c', 'd'].map(id => candidate(id)));
  await tick();
  assert.equal(queue.snapshot().running, 2);
  queue.pause();
  active.get('a').resolve(matched());
  active.get('b').resolve(matched());
  let result = await queue.whenIdle();
  assert.deepEqual(calls, ['a', 'b']);
  assert.equal(result.pending, 2);
  assert.equal(result.completed, 2);
  assert.equal(result.reason, 'USER_PAUSED');
  queue.resume();
  result = await queue.whenIdle();
  assert.equal(result.completed, 4);
  assert.equal(result.paused, false);
  assert.deepEqual(calls, ['a', 'b', 'c', 'd']);
});

test('first access, quota, credentials, or local-server failure pauses bulk work', async () => {
  for (const code of ['ACCESS_DENIED', 'QUOTA_EXCEEDED', 'QUOTA', 'MISSING_CREDENTIAL', 'LOCAL_SERVER_REQUIRED']) {
    let calls = 0;
    const queue = createOfficialComplexQueue({ load: async () => { calls += 1; return failed(code); } });
    queue.replace(Array.from({ length: 900 }, (_, id) => candidate(id)));
    const result = await queue.whenIdle();
    assert.equal(calls, 2, code);
    assert.equal(result.paused, true, code);
    assert.equal(result.reason, code);
    assert.equal(result.pending, 898);
    assert.equal(result.failed, 2);
    queue.replace([candidate('new')]);
    assert.equal((await queue.whenIdle()).paused, true);
    assert.equal(calls, 2);
  }
});

test('partial basic facts still pause on blocked detail access instead of firing the remaining 900', async () => {
  let calls = 0;
  const queue = createOfficialComplexQueue({ load: async () => { calls += 1; return partial('ACCESS_DENIED'); } });
  queue.replace(Array.from({ length: 900 }, (_, id) => candidate(id)));
  const result = await queue.whenIdle();
  assert.equal(calls, 2);
  assert.equal(result.partial, 2);
  assert.equal(result.failed, 0);
  assert.equal(result.reason, 'ACCESS_DENIED');
});

test('confirmed basic success with missing parking evidence is partial and remains retryable', async () => {
  const requests = [];
  const queue = createOfficialComplexQueue({ load: async (_item, { refresh }) => {
    requests.push(refresh);
    return refresh ? matched() : { status: 'matched', complexMatchConfirmed: true, parkingEvidence: null, errors: [] };
  } });
  queue.replace([candidate('a')]);
  const first = await queue.whenIdle();
  assert.equal(first.matched, 0);
  assert.equal(first.partial, 1);
  queue.retry();
  assert.equal((await queue.whenIdle()).matched, 1);
  assert.deepEqual(requests, [false, true]);
});

test('a later inflight network failure cannot hide an access-denied pause reason', async () => {
  let calls = 0;
  const queue = createOfficialComplexQueue({ load: async () => {
    calls += 1;
    return failed(calls === 3 ? 'ACCESS_DENIED' : 'NETWORK_ERROR');
  } });
  queue.replace(Array.from({ length: 900 }, (_, id) => candidate(id)));
  const result = await queue.whenIdle();
  assert.equal(calls, 4);
  assert.equal(result.reason, 'ACCESS_DENIED');
});

test('progress reports active requests before the first slow response arrives', async () => {
  const slow = deferred();
  const states = [];
  const queue = createOfficialComplexQueue({ load: () => slow.promise, onProgress: state => states.push(state) });
  queue.replace([candidate('a'), candidate('b')]);
  await tick();
  assert.equal(states.at(-1).running, 2);
  assert.equal(states.at(-1).completed, 0);
  slow.resolve(matched());
  await queue.whenIdle();
});

test('three consecutive network or unexpected failures halt dispatch without hiding pending', async () => {
  for (const throwError of [false, true]) {
    let calls = 0;
    const queue = createOfficialComplexQueue({ load: async () => {
      calls += 1;
      if (throwError) throw new Error('private upstream diagnostics must not escape');
      return failed('NETWORK_ERROR');
    } });
    queue.replace(Array.from({ length: 900 }, (_, id) => candidate(id)));
    const result = await queue.whenIdle();
    assert.ok(calls >= 3 && calls <= 4);
    assert.equal(result.completed, calls);
    assert.equal(result.failed, calls);
    assert.equal(result.pending, 900 - calls);
    assert.equal(result.paused, true);
    assert.equal(result.reason, 'CONSECUTIVE_FAILURES');
    assert.doesNotMatch(JSON.stringify(result), /private|upstream diagnostics/);
  }
});

test('a successful or terminal response resets the consecutive failure streak', async () => {
  let calls = 0;
  const queue = createOfficialComplexQueue({ concurrency: 1, load: async () => {
    calls += 1;
    return calls % 3 === 0 ? { status: 'unmatched' } : failed();
  } });
  queue.replace(Array.from({ length: 12 }, (_, id) => candidate(id)));
  const result = await queue.whenIdle();
  assert.equal(calls, 12);
  assert.equal(result.failed, 8);
  assert.equal(result.unmatched, 4);
  assert.equal(result.paused, false);
});

test('retry refreshes only failed and partial rows while continuing never-started rows normally', async () => {
  let access = false;
  const calls = [];
  const queue = createOfficialComplexQueue({ concurrency: 1, load: async (item, options) => {
    calls.push({ id: item.catalogId, refresh: options.refresh });
    return access ? matched() : failed('MISSING_CREDENTIAL');
  } });
  queue.replace(['a', 'b', 'c'].map(id => candidate(id)));
  await queue.whenIdle();
  access = true;
  queue.retry();
  const result = await queue.whenIdle();
  assert.deepEqual(calls, [{ id: 'a', refresh: false }, { id: 'a', refresh: true }, { id: 'b', refresh: false }, { id: 'c', refresh: false }]);
  assert.equal(result.matched, 3);
  assert.equal(result.pending, 0);
  assert.equal(result.reason, null);
});

test('progress callback failures and returned rejected promises do not interrupt the pump', async () => {
  for (const asyncFailure of [false, true]) {
    const queue = createOfficialComplexQueue({ load: async () => matched(), onProgress: () => {
      if (asyncFailure) return Promise.reject(new Error('view failed'));
      throw new Error('view failed');
    } });
    queue.replace(Array.from({ length: 20 }, (_, id) => candidate(id)));
    assert.equal((await queue.whenIdle()).completed, 20);
  }
});

test('snapshot is detached and multiple idle waiters resolve after the same drain', async () => {
  const pending = deferred();
  const queue = createOfficialComplexQueue({ load: () => pending.promise });
  queue.replace([candidate('a')]);
  const first = queue.whenIdle();
  const second = queue.whenIdle();
  const snapshot = queue.snapshot();
  snapshot.total = 999;
  snapshot.paused = true;
  assert.equal(queue.snapshot().total, 1);
  assert.equal(queue.snapshot().paused, false);
  pending.resolve(matched());
  const results = await Promise.all([first, second]);
  assert.equal(results[0].matched, 1);
  assert.equal(results[1].matched, 1);
});

test('same-condition replacement reloads expired entries and preserves still-fresh public facts', async () => {
  const fresh = new Set();
  const calls = [];
  const queue = createOfficialComplexQueue({ isFresh: item => fresh.has(item.catalogId), load: async (item, options) => {
    calls.push({ id: item.catalogId, refresh: options.refresh });
    fresh.add(item.catalogId);
    return matched();
  } });
  const candidates = ['a', 'b', 'c'].map(id => candidate(id));
  queue.replace(candidates);
  await queue.whenIdle();
  queue.replace(candidates);
  await queue.whenIdle();
  assert.equal(calls.length, 3);
  fresh.delete('b');
  const replacing = queue.replace(candidates);
  assert.equal(replacing.completed, 2);
  assert.equal(replacing.pending, 1);
  assert.equal(replacing.matched, 2);
  const result = await queue.whenIdle();
  assert.deepEqual(calls.slice(3), [{ id: 'b', refresh: false }]);
  assert.equal(result.completed, 3);
  assert.equal(result.matched, 3);
});

test('expiry replacement preserves a pause and waits for resume before loading again', async () => {
  let fresh = true;
  let calls = 0;
  const queue = createOfficialComplexQueue({ isFresh: () => fresh, load: async (_item, options) => {
    assert.equal(options.refresh, false);
    calls += 1;
    return matched();
  } });
  queue.replace([candidate('a')]);
  await queue.whenIdle();
  queue.pause();
  fresh = false;
  queue.replace([candidate('a')]);
  const paused = await queue.whenIdle();
  assert.equal(paused.paused, true);
  assert.equal(paused.reason, 'USER_PAUSED');
  assert.equal(paused.pending, 1);
  assert.equal(paused.completed, 0);
  assert.equal(calls, 1);
  queue.resume();
  assert.equal((await queue.whenIdle()).matched, 1);
  assert.equal(calls, 2);
});

test('freshness checks never duplicate or reset an inflight request', async () => {
  const request = deferred();
  let freshnessChecks = 0;
  let calls = 0;
  const queue = createOfficialComplexQueue({ isFresh: () => { freshnessChecks += 1; return false; }, load: () => { calls += 1; return request.promise; } });
  queue.replace([candidate('a')]);
  await tick();
  queue.replace([candidate('a', { id: 'new-area' })]);
  assert.equal(queue.snapshot().running, 1);
  assert.equal(freshnessChecks, 0);
  request.resolve(matched());
  assert.equal((await queue.whenIdle()).matched, 1);
  assert.equal(calls, 1);
});

test('a throwing freshness check queues only that entry for a safe normal reload', async () => {
  const calls = [];
  const queue = createOfficialComplexQueue({ isFresh: item => {
    if (item.catalogId === 'a') throw new Error('cache inspection failed');
    return true;
  }, load: async (item, options) => { calls.push({ id: item.catalogId, refresh: options.refresh }); return matched(); } });
  queue.replace([candidate('a'), candidate('b')]);
  await queue.whenIdle();
  assert.doesNotThrow(() => queue.replace([candidate('a'), candidate('b')]));
  assert.equal((await queue.whenIdle()).matched, 2);
  assert.deepEqual(calls.slice(2), [{ id: 'a', refresh: false }]);
});
