import { evaluateCommuteBalance } from '../js/commute-balance-core.mjs';

const weightOf = destination => {
  const value = Number(destination.weightPercent ?? destination.weight ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
};

/** Strict company limits first, then importance; input order breaks ties. */
export function orderEarlyExitDestinations(destinations = []) {
  return destinations.map((destination, index) => ({ destination, index })).sort((left, right) =>
    Number(right.destination.required !== false) - Number(left.destination.required !== false)
    || weightOf(right.destination) - weightOf(left.destination) || left.index - right.index)
    .map(item => item.destination);
}

/**
 * Only already measured exclusion can skip later companies. Alternatives for
 * one company are resolved together before the shared evaluator decides.
 * Results and deduplicated promises live only while assembling this response.
 */
export async function runEarlyExitCommuteBatch({ pairs = [], destinations = [], resolvePair,
  isAborted = () => false, concurrency = 2 } = {}) {
  if (typeof resolvePair !== 'function') throw new TypeError('A commute pair resolver is required');
  const ordered = orderEarlyExitDestinations(destinations);
  const order = new Map(ordered.map((destination, index) => [String(destination.id), index]));
  const evaluationDestinations = ordered.map(destination => ({ ...destination,
    ...(destination.point || {}), required: destination.required !== false,
    weightPercent: weightOf(destination), weightSource: 'explicit-percent' }));
  const origins = new Map();
  for (const pair of pairs) {
    if (!origins.has(pair.originId)) origins.set(pair.originId, []);
    origins.get(pair.originId).push(pair);
  }
  const groups = [...origins.values()].map(group => [...group].sort((left, right) =>
    (order.get(String(left.destinationId)) ?? Infinity) - (order.get(String(right.destinationId)) ?? Infinity)));
  const resolvedPairs = new Map();
  const requests = new Map();
  const excludedOrigins = new Set();
  let skippedPairCount = 0;
  let cursor = 0;
  const requestedWorkers = Number(concurrency);
  const workers = Number.isFinite(requestedWorkers) ? Math.max(1, Math.min(2, Math.floor(requestedWorkers))) : 2;
  const keyOf = pair => JSON.stringify([String(pair.originId), String(pair.destinationId)]);

  async function resolve(pair) {
    const identity = pair.identity || keyOf(pair);
    if (!requests.has(identity)) requests.set(identity, Promise.resolve().then(() => resolvePair(pair)));
    return requests.get(identity);
  }

  async function worker() {
    while (cursor < groups.length && !isAborted()) {
      const group = groups[cursor++];
      const routesByDestination = Object.create(null);
      for (let index = 0; index < group.length; index += 1) {
        if (isAborted()) break;
        const pair = group[index];
        const routes = await resolve(pair);
        // No synthetic row for a pair that the provider gate never started.
        if (Array.isArray(routes) && routes.length && routes.every(route => route.reasonCode === 'BATCH_ABORTED')) continue;
        const item = { originId: pair.originId, destinationId: pair.destinationId,
          routes: Array.isArray(routes) ? routes : [], departureTime: pair.departureTime };
        resolvedPairs.set(keyOf(pair), item);
        routesByDestination[String(pair.destinationId)] = item.routes;
        const balance = evaluateCommuteBalance({ id: pair.originId, routesByDestination }, evaluationDestinations);
        if (balance.measuredExcluded === true) {
          excludedOrigins.add(pair.originId);
          skippedPairCount += group.length - index - 1;
          break;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(workers, groups.length) }, () => worker()));
  const items = pairs.map(pair => resolvedPairs.get(keyOf(pair))).filter(Boolean);
  return { items, skippedPairCount,
    earlyExcludedOriginIds: [...origins.keys()].filter(id => excludedOrigins.has(id)),
    abortedPairCount: Math.max(0, pairs.length - items.length - skippedPairCount) };
}
