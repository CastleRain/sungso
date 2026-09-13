const BLOCKING_ERRORS = new Set(['ACCESS_DENIED', 'QUOTA', 'QUOTA_EXCEEDED', 'MISSING_CREDENTIAL', 'LOCAL_SERVER_REQUIRED']);
const TRANSIENT_ERRORS = new Set(['NETWORK_ERROR', 'TIMEOUT', 'UPSTREAM_ERROR', 'INVALID_RESPONSE', 'INCOMPLETE_LIST', 'IDENTITY_MISMATCH', 'INVALID_CATALOG']);
const catalogId = candidate => {
  const id = String(candidate?.catalogId ?? '');
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
};

function classify(info) {
  const codes = (Array.isArray(info?.errors) ? info.errors : []).map(error => error?.code);
  const blocking = codes.find(code => BLOCKING_ERRORS.has(code));
  let outcome;
  if (['unmatched', 'ambiguous'].includes(info?.status)) outcome = 'unmatched';
  else if (info?.complexMatchConfirmed === true && ['matched', 'partial'].includes(info.status)) {
    outcome = info.status === 'partial' || !info.parkingEvidence ? 'partial' : 'matched';
  }
  else outcome = 'failed';
  return { outcome, blocking: blocking || null,
    failure: outcome === 'failed' || codes.some(code => TRANSIENT_ERRORS.has(code)) };
}

/**
 * Schedules public K-apt details for every distinct catalog ID in the current set.
 * It owns no storage, destinations, route APIs, or candidate mutations.
 * Pausing drains already-started requests; whenIdle also resolves after that drain.
 */
export function createOfficialComplexQueue({ load, onProgress = () => {}, isFresh = () => true, concurrency = 2 }) {
  if (typeof load !== 'function') throw new TypeError('공식 단지 조회 함수가 필요합니다.');
  const numericConcurrency = Number(concurrency);
  const limit = Number.isFinite(numericConcurrency) && numericConcurrency >= 1 ? Math.floor(numericConcurrency) : 2;
  let selected = new Map();
  const inflight = new Map();
  const waiters = new Set();
  let paused = false;
  let reason = null;
  let consecutiveFailures = 0;
  let scheduled = false;

  function snapshot() {
    const result = { total: selected.size, completed: 0, matched: 0, partial: 0,
      unmatched: 0, failed: 0, pending: 0, running: 0, paused, reason };
    for (const entry of selected.values()) {
      if (entry.phase === 'settled') { result.completed += 1; result[entry.outcome] += 1; }
      else if (entry.phase === 'running') result.running += 1;
    }
    result.pending = result.total - result.completed;
    return result;
  }

  function notify() {
    try { Promise.resolve(onProgress(snapshot())).catch(() => {}); } catch { /* A view failure must not interrupt public data work. */ }
  }

  function idle() {
    return !inflight.size && (paused || ![...selected.values()].some(entry => entry.phase === 'queued'));
  }

  function settleWaiters() {
    if (!idle()) return;
    const state = snapshot();
    for (const resolve of waiters) resolve(state);
    waiters.clear();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      pump();
    });
  }

  function settle(entry, info) {
    inflight.delete(entry.id);
    const result = classify(info);
    entry.phase = 'settled';
    entry.outcome = result.outcome;
    // A removed old request may still fill the client's public cache, but does
    // not change counts or failure streaks for the replacement candidate set.
    if (selected.get(entry.id) === entry) {
      if (result.blocking) { paused = true; reason = result.blocking; }
      if (result.failure) consecutiveFailures += 1;
      else consecutiveFailures = 0;
      if (!result.blocking && !BLOCKING_ERRORS.has(reason) && consecutiveFailures >= 3) { paused = true; reason = 'CONSECUTIVE_FAILURES'; }
    }
    notify();
    schedule();
    settleWaiters();
  }

  function dispatch(entry) {
    entry.phase = 'running';
    inflight.set(entry.id, entry);
    Promise.resolve().then(() => load(entry.candidate, { refresh: entry.refresh === true }))
      .then(info => settle(entry, info), () => settle(entry, { status: 'unavailable', errors: [{ code: 'NETWORK_ERROR' }] }));
  }

  function pump() {
    let dispatched = false;
    if (!paused) {
      for (const entry of selected.values()) {
        if (inflight.size >= limit) break;
        if (entry.phase === 'queued') { dispatch(entry); dispatched = true; }
      }
    }
    if (dispatched) notify();
    settleWaiters();
  }

  function replace(candidates, { revalidate = true } = {}) {
    const next = new Map();
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const id = catalogId(candidate);
      if (!id || next.has(id)) continue;
      const existing = selected.get(id) || inflight.get(id);
      if (existing) {
        // Preserve completed overlap and a running request even if the caller
        // supplies another area of the same apartment complex. Rendering an
        // applied result only synchronizes membership; explicit revalidation
        // may requeue expired entries without resetting fresh or running work.
        if (existing.phase === 'settled' && revalidate) {
          let fresh = false;
          try { fresh = isFresh(candidate) === true; } catch { /* Unknown freshness needs a normal cache-aware reload. */ }
          if (!fresh) { existing.phase = 'queued'; existing.outcome = null; existing.refresh = false; }
        }
        existing.candidate = candidate;
        next.set(id, existing);
      } else next.set(id, { id, candidate, phase: 'queued', outcome: null, refresh: false });
    }
    selected = next;
    notify();
    schedule();
    settleWaiters();
    return snapshot();
  }

  function pause() {
    paused = true;
    reason = reason && reason !== 'USER_PAUSED' ? reason : 'USER_PAUSED';
    notify();
    settleWaiters();
    return snapshot();
  }

  function resume() {
    paused = false;
    reason = null;
    consecutiveFailures = 0;
    notify();
    schedule();
    return snapshot();
  }

  function retry() {
    for (const entry of selected.values()) {
      if (entry.phase === 'settled' && ['failed', 'partial'].includes(entry.outcome)) {
        entry.phase = 'queued';
        entry.outcome = null;
        entry.refresh = true;
      }
    }
    return resume();
  }

  function whenIdle() {
    if (idle()) return Promise.resolve(snapshot());
    return new Promise(resolve => waiters.add(resolve));
  }

  return { replace, pause, resume, retry, snapshot, whenIdle };
}
