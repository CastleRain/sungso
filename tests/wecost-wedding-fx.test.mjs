import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuote, validateQuote, dollarValuation, quoteIsOld, createFxReader, FX_URL } from '../apps/wecost/js/wedding-fx.mjs';

const now = Date.parse('2026-10-31T14:00:00Z');
const payload = { result: 'success', base_code: 'USD', rates: { USD: 1, KRW: 1300.1234 }, time_last_update_unix: Date.parse('2026-10-31T00:00:00Z') / 1000, time_next_update_unix: Date.parse('2026-11-01T00:00:00Z') / 1000 };
const response = data => ({ ok: true, json: async () => data });
test('valuation uses full source precision and leaves acquisition cost untouched', () => {
  const q = parseQuote(payload, now), original = structuredClone(q);
  assert.deepEqual(dollarValuation(123.45, 170000, q), { value: 160500, difference: -9500 });
  assert.deepEqual(q, original); assert.equal(quoteIsOld(q, now), false);
  assert.equal(quoteIsOld(q, q.nextAt + 1), true);
  assert.equal(dollarValuation(0, 0, q).value, 0); assert.equal(dollarValuation(-1, 0, q), null);
  for (const change of [{ base_code: 'EUR' }, { result: 'error' }, { rates: { USD: 1, KRW: '1300' } }, { rates: { USD: 1, KRW: -1 } }, { time_last_update_unix: (now + 600000) / 1000 }, { time_next_update_unix: 0 }]) assert.throws(() => parseQuote({ ...payload, ...change }, now));
});
test('one public request is deduplicated, caches only the quote, and fresh cache skips HTTP', async () => {
  let calls = 0, saved, release;
  const reader = createFxReader({ now: () => now, storage: { getItem: () => null, setItem: (key, value) => { saved = JSON.parse(value); } }, fetcher: async (url, options) => {
    calls++; assert.equal(url, FX_URL); assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer');
    await new Promise(resolve => { release = resolve; }); return response(payload);
  } });
  const a = reader.refresh(), b = reader.refresh(); assert.equal(a, b); assert.equal(calls, 1);
  release(); await a; assert.deepEqual(Object.keys(saved).sort(), ['asOf', 'nextAt', 'rate']);
  await reader.refresh(); assert.equal(calls, 1);
  const cached = createFxReader({ now: () => now, storage: { getItem: () => JSON.stringify(saved) }, fetcher: async () => { throw Error('must not fetch'); } });
  await cached.refresh(); assert.equal(cached.snapshot().quote.rate, payload.rates.KRW); reader.dispose(); cached.dispose();
});
test('failed refresh preserves the original quote date and reports stale data, never a fake zero rate', async () => {
  const q = parseQuote(payload, now), later = q.nextAt + 100000;
  const reader = createFxReader({ now: () => later, storage: { getItem: () => JSON.stringify(q) }, fetcher: async () => { throw Error('network unavailable'); } });
  await reader.refresh(); assert.deepEqual(reader.snapshot().quote, q); assert.match(reader.snapshot().error, /마지막 고시/);
  assert.equal(quoteIsOld(reader.snapshot().quote, later), true);
  const empty = createFxReader({ now: () => now, storage: { getItem: () => '{bad json' }, fetcher: async () => response({}) });
  await empty.refresh(); assert.equal(empty.snapshot().quote, null); assert.match(empty.snapshot().error, /가져오지/);
  reader.dispose(); empty.dispose();
});
test('private cleanup aborts in-flight lookup and suppresses late responses/cache writes', async () => {
  let release, signal, changes = 0, writes = 0;
  const reader = createFxReader({ now: () => now, storage: { getItem: () => null, setItem: () => { writes++; } }, onChange: () => { changes++; }, fetcher: async (_, options) => { signal = options.signal; await new Promise(resolve => { release = resolve; }); return response(payload); } });
  const pending = reader.refresh(); reader.dispose(); assert.equal(signal.aborted, true); release(); await pending;
  assert.equal(reader.snapshot().quote, null); assert.equal(writes, 0); assert.equal(changes, 1);
});
test('future or incoherent cached timestamps are rejected', () => {
  assert.throws(() => validateQuote({ rate: 1300, asOf: now + 600000, nextAt: now + 86400000 }, now));
  assert.throws(() => validateQuote({ rate: 1300, asOf: now, nextAt: now + 3 * 86400000 }, now));
});

test('a synchronous transport failure can be retried after the cooldown', async () => {
  let clock = now, calls = 0;
  const reader = createFxReader({ now: () => clock, fetcher: () => { if (++calls === 1) throw Error('unavailable'); return Promise.resolve(response(payload)); } });
  await reader.refresh(); assert.equal(reader.snapshot().quote, null);
  clock += 61000;
  await reader.refresh(); assert.equal(calls, 2); assert.equal(reader.snapshot().quote.rate, payload.rates.KRW);
  reader.dispose();
});

test('entering a USD screen with a fresh cached quote does not restart rendering', async () => {
  let renders = 0, requests = 0;
  const reader = createFxReader({ now: () => now,
    storage: { getItem: () => JSON.stringify(parseQuote(payload, now)) },
    fetcher: async () => { requests++; return response(payload); },
    onChange() {
      // The finance subscriber renders the wedding tab, which ensures its rate.
      // Bound this probe so the old implementation fails without freezing Node.
      if (++renders < 8) void reader.refresh();
    },
  });
  for (let visit = 0; visit < 5; visit++) await reader.refresh();
  assert.equal(renders, 0, 'unchanged cached data must not notify render subscribers');
  assert.equal(requests, 0);
  reader.dispose();
});

for (const fails of [false, true]) test(`render-time rate checks settle after ${fails ? 'failed' : 'successful'} refresh`, async () => {
  let requests = 0, renders = 0;
  const states = [];
  const reader = createFxReader({ now: () => now,
    fetcher: async () => { requests++; if (fails) throw Error('offline'); return response(payload); },
    onChange(state) {
      states.push(state);
      if (++renders < 8) void reader.refresh();
    },
  });
  await reader.refresh();
  assert.equal(requests, 1);
  assert.equal(renders, 2, 'only loading and settled state should trigger rendering');
  assert.deepEqual(states.map(state => state.loading), [true, false]);
  for (let visit = 0; visit < 5; visit++) await reader.refresh();
  assert.equal(renders, 2, 'fresh data or retry cooldown must remain quiet');
  if (fails) {
    await reader.refresh(true);
    assert.match(reader.snapshot().error, /1분/);
    assert.equal(renders, 3);
    await reader.refresh(true);
    assert.equal(renders, 3, 'the same cooldown message must not loop');
  }
  reader.dispose();
});
