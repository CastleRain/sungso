import test from 'node:test';
import assert from 'node:assert/strict';
import { orderEarlyExitDestinations, runEarlyExitCommuteBatch } from '../scripts/commute-early-exit.mjs';
import { evaluateCommuteBalance } from '../js/commute-balance-core.mjs';
import { candidateVerificationStatus, destinationFingerprint, originFingerprint } from '../js/recommendation-verification-core.mjs';

const NOW = Date.parse('2026-09-08T00:00:00Z');
const destination = (id, weightPercent, required = true, extra = {}) => ({ id, weightPercent, required,
  modes: ['transit'], maxMinutes: 60, lat: 37.4, lng: 127.1, ...extra });
const companies = () => [destination('a', 40), destination('c', 10, false), destination('b', 50)];
const route = (minutes = 30, extra = {}) => ({ mode: 'transit', provider: 'kakao-transit', verified: true,
  durationMinutes: minutes, walkingMinutes: 5, transferCount: 1, queriedAt: new Date(NOW).toISOString(), ...extra });
function pairsFor(destinations, homes = ['h1']) {
  return homes.flatMap((originId, index) => destinations.map(target => ({ originId, destinationId: target.id,
    origin: { lat: 37.3 + index * .001, lng: 127 }, destination: { lat: target.lat, lng: target.lng },
    modes: target.modes, identity: `${originId}:${target.id}:${target.modes.join(',')}`, departureTime: '08:00' })));
}
const delay = () => new Promise(resolve => setImmediate(resolve));

test('strict companies are ordered by weight before optional ones, with stable ties', () => {
  const source = [destination('c', 1000, false), destination('a', 40), destination('d', 40), destination('b', 50)];
  assert.deepEqual(orderEarlyExitDestinations(source).map(item => item.id), ['b', 'a', 'd', 'c']);
  assert.deepEqual(source.map(item => item.id), ['c', 'a', 'd', 'b']);
});

test('ten homes failing the first required company use ten pairs instead of thirty', async () => {
  const destinations = companies();
  const pairs = pairsFor(destinations, Array.from({ length: 10 }, (_, index) => `h${index}`));
  const calls = [];
  const result = await runEarlyExitCommuteBatch({ pairs, destinations,
    resolvePair: async pair => { calls.push(pair); return [route(80)]; },
  });
  assert.equal(calls.length, 10);
  assert.ok(calls.every(pair => pair.destinationId === 'b'));
  assert.equal(result.items.length, 10);
  assert.equal(result.skippedPairCount, 20);
  assert.equal(result.earlyExcludedOriginIds.length, 10);
  assert.equal(result.abortedPairCount, 0);
  assert.ok(result.items.every(item => item.routes.every(value => value.verified)));
});

test('partial measured exclusion remains final and fresh without inventing skipped route rows', async () => {
  const destinations = companies();
  const pairs = pairsFor(destinations);
  const result = await runEarlyExitCommuteBatch({ pairs, destinations, resolvePair: async () => [route(80)] });
  const routesByDestination = Object.fromEntries(result.items.map(item => [item.destinationId, item.routes]));
  const candidate = { id: 'h1', ...pairs[0].origin, routesByDestination };
  candidate.commuteBalance = evaluateCommuteBalance(candidate, destinations);
  const fingerprint = destinationFingerprint(destinations);
  candidate.commuteVerification = { stage: 'final', provider: 'kakao', verifiedAt: new Date(NOW).toISOString(),
    originFingerprint: originFingerprint(candidate), destinationFingerprint: fingerprint, transitCacheHours: 8 };
  assert.deepEqual(Object.keys(routesByDestination), ['b']);
  assert.equal(candidate.commuteBalance.measuredExcluded, true);
  assert.equal(candidate.commuteBalance.requiredFullyVerified, false);
  assert.equal(candidate.commuteBalance.weightedMeanMinutes, null);
  assert.equal(candidate.commuteBalance.balanceScore, null);
  const status = candidateVerificationStatus(candidate, { destinationFingerprint: fingerprint, now: NOW + 1000 });
  assert.equal(status.decision, 'excluded');
  assert.equal(status.final, true);
  assert.equal(status.stale, false);
});

test('another valid house still gets every company after one house is excluded', async () => {
  const destinations = companies();
  const calls = [];
  const result = await runEarlyExitCommuteBatch({ pairs: pairsFor(destinations, ['bad', 'good']), destinations,
    resolvePair: async pair => { calls.push(`${pair.originId}:${pair.destinationId}`); return [route(pair.originId === 'bad' ? 80 : pair.destinationId === 'c' ? 90 : 25)]; },
  });
  assert.deepEqual(calls.filter(value => value.startsWith('bad')), ['bad:b']);
  assert.deepEqual(calls.filter(value => value.startsWith('good')), ['good:b', 'good:a', 'good:c']);
  assert.deepEqual(result.earlyExcludedOriginIds, ['bad']);
  assert.equal(result.skippedPairCount, 2);
  assert.equal(result.items.length, 4);
});

test('optional time overruns never exclude a house or skip another optional company', async () => {
  const destinations = [...companies(), destination('d', 5, false)];
  const calls = [];
  const result = await runEarlyExitCommuteBatch({ pairs: pairsFor(destinations), destinations,
    resolvePair: async pair => { calls.push(pair.destinationId); return [route(['c', 'd'].includes(pair.destinationId) ? 150 : 25)]; },
  });
  assert.deepEqual(calls, ['b', 'a', 'c', 'd']);
  assert.equal(result.skippedPairCount, 0);
  assert.deepEqual(result.earlyExcludedOriginIds, []);
});

test('a failed or missing alternative mode prevents early exclusion; a passing alternative also keeps the house', async () => {
  for (const alternatives of [
    [route(80), route(null, { mode: 'car', verified: false, status: 'error', reasonCode: 'NETWORK_ERROR' })],
    [route(80)],
    [route(80), route(25, { mode: 'car' })],
  ]) {
    const destinations = companies().map(item => item.id === 'b' ? { ...item, modes: ['transit', 'car'] } : item);
    const result = await runEarlyExitCommuteBatch({ pairs: pairsFor(destinations), destinations,
      resolvePair: async pair => pair.destinationId === 'b' ? alternatives : [route(25)],
    });
    assert.equal(result.items.length, 3);
    assert.equal(result.skippedPairCount, 0);
    assert.equal(result.earlyExcludedOriginIds.length, 0);
  }
});

test('all requested modes must be conclusive before their common time failure excludes', async () => {
  const destinations = companies().map(item => item.id === 'b' ? { ...item, modes: ['transit', 'car'] } : item);
  const result = await runEarlyExitCommuteBatch({ pairs: pairsFor(destinations), destinations,
    resolvePair: async () => [route(80), route(null, { mode: 'car', verified: false, reasonCode: 'NAVER_NO_ROUTE' })],
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.skippedPairCount, 2);
  assert.deepEqual(result.earlyExcludedOriginIds, ['h1']);
});

test('estimated or stale durations never trigger measured exclusion', async () => {
  for (const status of [{ estimated: true }, { stale: true }, { status: 'error' }]) {
    const destinations = companies();
    const result = await runEarlyExitCommuteBatch({ pairs: pairsFor(destinations), destinations,
      resolvePair: async () => [route(90, status)],
    });
    assert.equal(result.items.length, 3);
    assert.equal(result.skippedPairCount, 0);
  }
});

test('a conclusive absent route excludes, but a provider error preserves uncertainty', async () => {
  for (const [reasonCode, expected] of [['NO_ROUTE', 1], ['NETWORK_ERROR', 3]]) {
    const destinations = companies();
    const result = await runEarlyExitCommuteBatch({ pairs: pairsFor(destinations), destinations,
      resolvePair: async () => [route(null, { verified: false, reasonCode })],
    });
    assert.equal(result.items.length, expected);
    assert.equal(result.skippedPairCount, 3 - expected);
  }
});

test('at most two distinct homes run in parallel and their companies run sequentially', async () => {
  const destinations = companies();
  const activeOrigins = new Set();
  let peak = 0;
  const result = await runEarlyExitCommuteBatch({ pairs: pairsFor(destinations, ['a', 'b', 'c', 'd']), destinations, concurrency: 10,
    resolvePair: async pair => {
      assert.equal(activeOrigins.has(pair.originId), false);
      activeOrigins.add(pair.originId);
      peak = Math.max(peak, activeOrigins.size);
      await delay();
      activeOrigins.delete(pair.originId);
      return [route(20)];
    },
  });
  assert.equal(peak, 2);
  assert.equal(result.items.length, 12);
});

test('same-response duplicate origins reuse completed pair promises without losing IDs', async () => {
  const destinations = companies();
  const pairs = pairsFor(destinations, ['area1', 'area2']).map(pair => ({ ...pair, identity: pair.destinationId }));
  let calls = 0;
  const result = await runEarlyExitCommuteBatch({ pairs, destinations, concurrency: 1,
    resolvePair: async () => { calls += 1; return [route(20)]; },
  });
  assert.equal(calls, 3);
  assert.equal(result.items.length, 6);
  assert.equal(new Set(result.items.map(item => item.originId)).size, 2);
});

test('global provider failure stops pending homes and does not fabricate unqueried rows', async () => {
  const destinations = companies();
  const pairs = pairsFor(destinations, Array.from({ length: 10 }, (_, index) => `h${index}`));
  let aborted = false;
  let calls = 0;
  const result = await runEarlyExitCommuteBatch({ pairs, destinations, isAborted: () => aborted,
    resolvePair: async () => { calls += 1; await delay(); aborted = true; return [route(null, { verified: false, reasonCode: 'HTTP_ERROR' })]; },
  });
  assert.equal(calls, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.abortedPairCount, 28);
  assert.equal(result.skippedPairCount, 0);
  assert.equal(result.earlyExcludedOriginIds.length, 0);
});
