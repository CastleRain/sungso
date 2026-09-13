/** Only the user's WeCost target price crosses this same-origin browser bridge. */
export const HOME_TARGET_PRICE_STORAGE_KEY = 'sungso_home_target_price_v1';
export const HOME_TARGET_PRICE_EVENT = 'sungso:home-target-price-changed';

function browserStorage() {
  try { return globalThis.localStorage || null; } catch (_) { return null; }
}

function unavailable(reason) {
  return Object.freeze({ status: 'unavailable', reason, snapshot: null });
}

/** Drop all unrelated fields. Amounts are positive, safe integer KRW (원). */
export function validateHomeTargetPriceSnapshot(value) {
  if (!value || value.version !== 1 || value.source !== 'wecost'
      || typeof value.targetPriceWon !== 'number' || !Number.isSafeInteger(value.targetPriceWon)
      || value.targetPriceWon <= 0 || typeof value.updatedAt !== 'string') return null;
  const timestamp = Date.parse(value.updatedAt);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value.updatedAt) return null;
  return Object.freeze({ version: 1, source: 'wecost', targetPriceWon: value.targetPriceWon, updatedAt: value.updatedAt });
}

/**
 * No network, Firebase access or other financial data. `updatedAt` is the time
 * this browser observed/successfully saved WeCost's price, not its edit history.
 * Reading/subscribing never edits either app's target or search filters.
 */
export function createHomeTargetPriceBridge({ storage = browserStorage(), eventTarget = globalThis.window || null, now = () => new Date() } = {}) {
  const listeners = new Set();
  let listening = false;
  let lastSignature = null;
  let unavailableReason = 'wecost-not-opened';

  function read() {
    if (!storage) return unavailable('storage-unavailable');
    let raw;
    try { raw = storage.getItem(HOME_TARGET_PRICE_STORAGE_KEY); }
    catch (_) { return unavailable('storage-unavailable'); }
    if (!raw) return unavailable(unavailableReason);
    let snapshot;
    try { snapshot = validateHomeTargetPriceSnapshot(JSON.parse(raw)); }
    catch (_) { return unavailable('invalid-snapshot'); }
    return snapshot ? Object.freeze({ status: 'available', reason: null, snapshot }) : unavailable('invalid-snapshot');
  }

  function emit() {
    const state = read();
    const signature = JSON.stringify(state);
    if (signature === lastSignature) return;
    lastSignature = signature;
    for (const listener of listeners) {
      try { listener(state); } catch (_) { /* A consumer cannot interrupt a WeCost save. */ }
    }
  }

  function onStorage(event) {
    if (event.key !== HOME_TARGET_PRICE_STORAGE_KEY && event.key !== null) return;
    if (event.storageArea && event.storageArea !== storage) return;
    // Read storage itself: a delayed event's newValue may already be outdated.
    unavailableReason = 'wecost-not-opened';
    emit();
  }

  function broadcast() {
    emit();
    if (eventTarget?.dispatchEvent && typeof globalThis.Event === 'function') {
      try { eventTarget.dispatchEvent(new Event(HOME_TARGET_PRICE_EVENT)); } catch (_) { /* Storage event remains available across tabs. */ }
    }
  }

  function clear(reason = 'target-not-set') {
    unavailableReason = reason === 'wecost-unavailable' ? reason : 'target-not-set';
    try { storage?.removeItem(HOME_TARGET_PRICE_STORAGE_KEY); }
    catch (_) { return unavailable('storage-unavailable'); }
    broadcast();
    return read();
  }

  function publish(targetPriceWon) {
    let updatedAt;
    try { updatedAt = new Date(now()).toISOString(); } catch (_) { return unavailable('invalid-timestamp'); }
    const snapshot = validateHomeTargetPriceSnapshot({ version: 1, source: 'wecost', targetPriceWon, updatedAt });
    // A loaded setting that no longer has a usable target must not leave a
    // previous target looking like the current WeCost value.
    if (!snapshot) return clear('target-not-set');
    if (!storage) return unavailable('storage-unavailable');
    try { storage.setItem(HOME_TARGET_PRICE_STORAGE_KEY, JSON.stringify(snapshot)); }
    catch (_) {
      // Quota errors may still permit removing the older value.
      try { storage.removeItem(HOME_TARGET_PRICE_STORAGE_KEY); } catch (_) { /* Storage may be blocked entirely. */ }
      broadcast();
      return unavailable('storage-unavailable');
    }
    unavailableReason = 'wecost-not-opened';
    broadcast();
    return read();
  }

  function subscribe(listener, { emitCurrent = true } = {}) {
    if (typeof listener !== 'function') throw new TypeError('A target-price listener is required.');
    listeners.add(listener);
    if (!listening && eventTarget?.addEventListener) {
      eventTarget.addEventListener('storage', onStorage);
      eventTarget.addEventListener(HOME_TARGET_PRICE_EVENT, emit);
      listening = true;
    }
    if (emitCurrent) listener(read());
    return () => {
      listeners.delete(listener);
      if (!listeners.size && listening) {
        eventTarget.removeEventListener('storage', onStorage);
        eventTarget.removeEventListener(HOME_TARGET_PRICE_EVENT, emit);
        listening = false;
        lastSignature = null;
      }
    };
  }

  return Object.freeze({ read, subscribe, publish, clear });
}

export const homeTargetPriceBridge = createHomeTargetPriceBridge();
