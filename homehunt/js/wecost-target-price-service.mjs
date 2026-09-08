import { validateHomeTargetPriceSnapshot } from '../../shared/home-target-price.mjs';

// DocumentMask returns only this requested field under the existing Firestore rules.
// https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/get
export const WECOST_TARGET_PRICE_URL = 'https://firestore.googleapis.com/v1/projects/sungso-358cb/databases/(default)/documents/wecost_settings/main?mask.fieldPaths=targetHousePrice';
const DEFAULT_TIMEOUT_MS = 12000;

class TargetPriceReadError extends Error {
  constructor(reason, httpStatus = null) { super(reason); this.reason = reason; this.httpStatus = httpStatus; }
}

const unavailable = (reason, httpStatus = null) => Object.freeze({
  status: 'unavailable', connection: 'firebase', reason, httpStatus, snapshot: null, serverUpdatedAt: null,
});

function readTargetPriceWon(fields) {
  const value = fields?.targetHousePrice;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 1) return null;
  let amount;
  if (keys[0] === 'integerValue' && typeof value.integerValue === 'string' && /^[1-9]\d*$/.test(value.integerValue)) {
    amount = Number(value.integerValue);
  } else if (keys[0] === 'doubleValue' && typeof value.doubleValue === 'number') {
    amount = value.doubleValue;
  }
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function httpFailure(status) {
  if (status === 401 || status === 403) return new TargetPriceReadError('permission-denied', status);
  if (status === 404) return new TargetPriceReadError('target-not-set', status);
  if (status === 429) return new TargetPriceReadError('rate-limited', status);
  return new TargetPriceReadError('firebase-unavailable', Number.isInteger(status) ? status : null);
}

/**
 * A read-only, target-field-only Firebase adapter. No SDK document subscription,
 * local cache fallback, write, automatic retry or full financial snapshot.
 * snapshot.updatedAt is this successful observation; serverUpdatedAt is the
 * document's update time and does not claim to be the target field's edit time.
 */
export function createWecostTargetPriceService({ fetchImpl = globalThis.fetch, now = () => new Date(), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const requestTimeout = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  let state = unavailable('not-requested');
  let generation = 0;
  let inFlight = null;
  const listeners = new Set();
  const publish = next => {
    state = Object.freeze(next);
    for (const listener of listeners) {
      try { listener(state); } catch (_) { /* One UI consumer cannot interrupt others. */ }
    }
    return state;
  };

  async function readDocument(signal) {
    if (typeof fetchImpl !== 'function') throw new TargetPriceReadError('fetch-unavailable');
    const response = await fetchImpl(WECOST_TARGET_PRICE_URL, {
      method: 'GET', cache: 'no-store', credentials: 'omit', signal,
      headers: { Accept: 'application/json' },
    });
    if (!response || typeof response.ok !== 'boolean') throw new TargetPriceReadError('invalid-response');
    if (!response.ok) throw httpFailure(response.status);
    let document;
    try { document = await response.json(); } catch (_) { throw new TargetPriceReadError('invalid-response'); }
    if (!document || typeof document !== 'object' || Array.isArray(document)) throw new TargetPriceReadError('invalid-response');
    const targetPriceWon = readTargetPriceWon(document.fields);
    if (targetPriceWon === null) throw new TargetPriceReadError('target-not-set');
    let updatedAt;
    try { updatedAt = new Date(now()).toISOString(); } catch (_) { throw new TargetPriceReadError('invalid-response'); }
    const snapshot = validateHomeTargetPriceSnapshot({ version: 1, source: 'wecost', targetPriceWon, updatedAt });
    if (!snapshot) throw new TargetPriceReadError('invalid-response');
    const serverUpdatedAt = typeof document.updateTime === 'string' && Number.isFinite(Date.parse(document.updateTime))
      ? document.updateTime : null;
    return Object.freeze({ status: 'available', connection: 'firebase', reason: null, httpStatus: null, snapshot, serverUpdatedAt });
  }

  function refresh() {
    if (inFlight) return inFlight.promise;
    const flight = { generation: ++generation, controller: new AbortController(), abortReason: null, timer: null, promise: null };
    const current = () => flight.generation === generation && inFlight === flight;
    inFlight = flight;
    flight.promise = Promise.resolve().then(async () => {
      if (!current()) return state;
      const aborted = new Promise((_, reject) => {
        flight.controller.signal.addEventListener('abort', () => reject(new TargetPriceReadError(flight.abortReason || 'cancelled')), { once: true });
      });
      flight.timer = setTimeout(() => {
        flight.abortReason = 'timeout';
        flight.controller.abort();
      }, requestTimeout);
      try {
        // Racing the complete body read also handles a stalled json() or a
        // custom fetch that ignores AbortSignal, without accepting it later.
        const result = await Promise.race([readDocument(flight.controller.signal), aborted]);
        return current() ? publish(result) : state;
      } catch (error) {
        if (!current()) return state;
        return publish(error instanceof TargetPriceReadError
          ? unavailable(error.reason, error.httpStatus)
          : unavailable('network-error'));
      }
    }).finally(() => {
      clearTimeout(flight.timer);
      if (inFlight === flight) inFlight = null;
    });
    publish({ status: 'loading', connection: 'firebase', reason: null, httpStatus: null, snapshot: null, serverUpdatedAt: null });
    return flight.promise;
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('A target-price listener is required.');
      listeners.add(listener);
      try { listener(state); } catch (_) { /* Keep refresh independent of rendering. */ }
      return () => listeners.delete(listener);
    },
    refresh,
    cancel() {
      generation += 1;
      const flight = inFlight;
      inFlight = null;
      if (flight) {
        clearTimeout(flight.timer);
        flight.abortReason = 'cancelled';
        flight.controller.abort();
      }
      return publish(unavailable('cancelled'));
    },
  });
}
