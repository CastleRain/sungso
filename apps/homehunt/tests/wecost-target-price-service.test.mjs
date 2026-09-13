import test from 'node:test';
import assert from 'node:assert/strict';
import { createWecostTargetPriceService, WECOST_TARGET_PRICE_URL } from '../js/wecost-target-price-service.mjs';

const OBSERVED_AT = '2026-09-07T02:00:00.000Z';
const SERVER_UPDATED_AT = '2026-09-06T23:30:00.123456Z';
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const response = (price = { integerValue: '655000001' }, extra = {}) => ({ ok: true, status: 200,
  json: async () => ({ fields: { targetHousePrice: price }, updateTime: SERVER_UPDATED_AT, ...extra }) });
const serviceWith = (fetchImpl, options = {}) => createWecostTargetPriceService({ fetchImpl, now: () => OBSERVED_AT, ...options });

test('reads only the fixed target field with a read-only request and returns exact KRW plus separate observation/document times', async () => {
  const requests = [];
  const service = serviceWith(async (url, options) => {
    requests.push({ url, options });
    return response({ integerValue: '655000001' }, { name: 'unused-document-metadata',
      fields: { targetHousePrice: { integerValue: '655000001' }, unrelatedFinancialField: { stringValue: 'must-not-leave-the-adapter' } } });
  });
  assert.equal(service.getState().status, 'unavailable');
  assert.equal(service.getState().snapshot, null);
  const result = await service.refresh();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, WECOST_TARGET_PRICE_URL);
  const url = new URL(requests[0].url);
  assert.equal(url.origin, 'https://firestore.googleapis.com');
  assert.equal(url.pathname, '/v1/projects/sungso-358cb/databases/(default)/documents/wecost_settings/main');
  assert.deepEqual([...url.searchParams], [['mask.fieldPaths', 'targetHousePrice']]);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.cache, 'no-store');
  assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.body, undefined);
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.ok(requests[0].options.signal instanceof AbortSignal);
  assert.deepEqual(result, { status: 'available', connection: 'firebase', reason: null, httpStatus: null,
    snapshot: { version: 1, source: 'wecost', targetPriceWon: 655000001, updatedAt: OBSERVED_AT }, serverUpdatedAt: SERVER_UPDATED_AT });
  assert.equal(result.snapshot.targetPriceWon / 10000, 65500.0001);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.snapshot), true);
  assert.equal(JSON.stringify(result).includes('must-not-leave'), false);
});

test('coalesces concurrent refresh calls into one promise and request, and emits loading without old money', async () => {
  const gate = deferred();
  let calls = 0;
  const service = serviceWith(async () => { calls += 1; return gate.promise; });
  const states = [];
  service.subscribe(value => states.push(value));
  const first = service.refresh();
  const second = service.refresh();
  assert.equal(first, second);
  assert.equal(service.getState().status, 'loading');
  assert.equal(service.getState().snapshot, null);
  await Promise.resolve();
  assert.equal(calls, 1);
  gate.resolve(response());
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, b);
  assert.deepEqual(states.map(value => value.status), ['unavailable', 'loading', 'available']);
});

test('missing or malformed target values cannot become a default, a string amount or an unsafe rounded integer', async () => {
  const invalid = [undefined, null, {}, { integerValue: '0' }, { integerValue: '-1' }, { integerValue: '01' },
    { integerValue: '1.5' }, { integerValue: ' 600000000 ' }, { integerValue: '9007199254740993' },
    { integerValue: 600000000 }, { stringValue: '600000000' }, { doubleValue: '600000000' },
    { doubleValue: 0 }, { doubleValue: -1 }, { doubleValue: 1.5 }, { doubleValue: NaN }, { doubleValue: Infinity },
    { doubleValue: Number.MAX_SAFE_INTEGER + 1 }, { integerValue: '600000000', doubleValue: 600000000 }];
  for (const value of invalid) {
    const service = serviceWith(async () => response(value));
    // Passing undefined must represent a missing field, not the fixture default.
    if (value === undefined) {
      const missing = serviceWith(async () => ({ ok: true, json: async () => ({ fields: {} }) }));
      assert.equal((await missing.refresh()).snapshot, null);
      continue;
    }
    const result = await service.refresh();
    assert.equal(result.status, 'unavailable');
    assert.equal(result.snapshot, null);
    assert.equal(result.reason, 'target-not-set');
  }
  const validDouble = await serviceWith(async () => response({ doubleValue: 600000000 })).refresh();
  assert.equal(validDouble.snapshot.targetPriceWon, 600000000);
});

test('permission, missing document, quota and server failures clear earlier success without reading or exposing error bodies', async () => {
  for (const [httpStatus, reason] of [[401, 'permission-denied'], [403, 'permission-denied'], [404, 'target-not-set'], [429, 'rate-limited'], [500, 'firebase-unavailable']]) {
    let calls = 0;
    const service = serviceWith(async () => ++calls === 1 ? response() : { ok: false, status: httpStatus,
      json: () => { throw Error('Error bodies are outside the target field contract'); } });
    await service.refresh();
    const failure = service.refresh();
    assert.equal(service.getState().snapshot, null, 'Old money must disappear as soon as refresh starts');
    const result = await failure;
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, reason);
    assert.equal(result.httpStatus, httpStatus);
    assert.equal(result.snapshot, null);
    assert.equal(result.serverUpdatedAt, null);
    assert.equal(calls, 2, 'No retry or local-cache fallback may create hidden reads');
  }
});

test('network failures and invalid responses resolve to unavailable without leaking raw errors', async () => {
  const scenarios = [
    [async () => { throw Error('private diagnostic text'); }, 'network-error'],
    [async () => null, 'invalid-response'],
    [async () => ({ ok: true, json: async () => { throw Error('private response body'); } }), 'invalid-response'],
    [async () => ({ ok: true, json: async () => [] }), 'invalid-response'],
  ];
  for (const [fetchImpl, reason] of scenarios) {
    const result = await serviceWith(fetchImpl).refresh();
    assert.equal(result.reason, reason);
    assert.equal(result.snapshot, null);
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
  const missingFetch = await serviceWith(null).refresh();
  assert.equal(missingFetch.reason, 'fetch-unavailable');
});

test('cancel invalidates the old generation, allows a new request and ignores a late non-abort-aware response', async () => {
  const older = deferred();
  const requests = [];
  const service = serviceWith(async (_url, options) => {
    requests.push(options);
    return requests.length === 1 ? older.promise : response({ integerValue: '800000000' });
  });
  const received = [];
  service.subscribe(value => received.push(value));
  const oldRefresh = service.refresh();
  await Promise.resolve();
  const cancelled = service.cancel();
  assert.equal(cancelled.reason, 'cancelled');
  assert.equal(cancelled.snapshot, null);
  assert.equal(requests[0].signal.aborted, true);
  const newRefresh = service.refresh();
  assert.notEqual(newRefresh, oldRefresh);
  const current = await newRefresh;
  assert.equal(current.snapshot.targetPriceWon, 800000000);
  await oldRefresh;
  older.resolve(response({ integerValue: '400000000' }));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(service.getState().snapshot.targetPriceWon, 800000000);
  assert.deepEqual(received.filter(value => value.snapshot).map(value => value.snapshot.targetPriceWon), [800000000]);
  assert.equal(requests.length, 2);
});

test('timeouts also stop a stalled response body and never restore its late target', async () => {
  const body = deferred();
  let signal;
  const states = [];
  const service = serviceWith(async (_url, options) => {
    signal = options.signal;
    return { ok: true, json: () => body.promise };
  }, { timeoutMs: 5 });
  service.subscribe(value => states.push(value));
  const result = await service.refresh();
  assert.equal(result.reason, 'timeout');
  assert.equal(result.snapshot, null);
  assert.equal(signal.aborted, true);
  body.resolve({ fields: { targetHousePrice: { integerValue: '900000000' } } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(service.getState().reason, 'timeout');
  assert.equal(states.some(value => value.status === 'available'), false);
});

test('subscribers can unsubscribe or throw without interrupting refresh, and pre-start cancellation performs no read', async () => {
  let calls = 0;
  const service = serviceWith(async () => { calls += 1; return response(); });
  const seen = [];
  service.subscribe(() => { throw Error('UI rendering failed'); });
  const stop = service.subscribe(value => seen.push(value.status));
  stop();
  const pending = service.refresh();
  service.cancel();
  await pending;
  assert.equal(calls, 0);
  assert.deepEqual(seen, ['unavailable']);
  assert.equal((await service.refresh()).status, 'available');
  assert.equal(calls, 1);
});
