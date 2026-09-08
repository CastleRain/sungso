const candidateKey = candidate => String(candidate?.catalogId || candidate?.id || candidate?.aptSeq || '');
const whole = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** A user-started coordinator. It neither fetches routes itself nor stores route results. */
export function createCommuteAutoRunner({ getContext, runCandidate, onProgress = () => {} } = {}) {
  let state = {
    running: false, stopping: false, maxCalls: 100, actualCalls: 0,
    checked: 0, matched: 0, excluded: 0, pending: 0, reason: '', provider: '', usageUncertain: false,
    callsPerCandidate: 0,
  };
  let stopped = false, idle = Promise.resolve();
  const snapshot = () => ({ ...state, remainingBudget: state.usageUncertain ? null : Math.max(0, state.maxCalls - state.actualCalls) });
  const notify = () => { try { onProgress(snapshot()); } catch { /* A rendering failure must not restart a request. */ } };

  async function pump() {
    let initialKey, initialProvider;
    const attempted = new Set();
    try {
      while (!stopped) {
        let context;
        try { context = await getContext(); }
        catch { state.reason = 'ERROR'; break; }
        if (stopped) break;
        if (context?.contextChanged) { state.reason = 'CONTEXT_CHANGED'; break; }
        const key = typeof context?.key === 'string' ? context.key : '';
        const provider = String(context?.provider || '').toLowerCase();
        const requiredCalls = whole(context?.callsPerCandidate);
        if (requiredCalls === 0) { state.reason = 'UNSUPPORTED_MODE'; break; }
        if (!key || !['kakao', 'tmap'].includes(provider) || !requiredCalls) { state.reason = 'INVALID_CONTEXT'; break; }
        if (initialKey === undefined) { initialKey = key; initialProvider = provider; state.provider = provider; }
        else if (key !== initialKey || provider !== initialProvider) { state.reason = 'CONTEXT_CHANGED'; break; }
        if (context.busy) { state.reason = 'BUSY'; break; }
        state.callsPerCandidate = requiredCalls;
        const candidates = Array.isArray(context.candidates) ? context.candidates : [];
        const candidate = candidates.find(item => candidateKey(item) && !attempted.has(candidateKey(item)));
        if (!candidate) { state.reason = 'COMPLETED'; break; }
        const remaining = state.maxCalls - state.actualCalls;
        if (remaining < requiredCalls) { state.reason = 'BUDGET_LIMIT'; break; }
        const dailyRemaining = whole(context.remainingDailyQuota);
        if (dailyRemaining === null) { state.reason = 'QUOTA_UNKNOWN'; break; }
        if (dailyRemaining < requiredCalls) { state.reason = 'DAILY_LIMIT'; break; }
        if (stopped) break;
        attempted.add(candidateKey(candidate));
        notify();
        if (stopped) break;
        let receipt;
        try {
          receipt = await runCandidate(candidate, { callBudget: Math.min(requiredCalls, remaining, dailyRemaining) });
        } catch { receipt = { actualCalls: null, decision: 'pending', error: true }; }
        state.checked += 1;
        const decision = ['matched', 'excluded'].includes(receipt?.decision) ? receipt.decision : 'pending';
        state[decision] += 1;
        const actualCalls = whole(receipt?.actualCalls);
        if (actualCalls === null) { state.usageUncertain = true; state.reason = 'UNKNOWN_RECEIPT'; }
        else {
          state.actualCalls += actualCalls;
          if (state.actualCalls > state.maxCalls || actualCalls > requiredCalls) state.reason = 'BUDGET_EXCEEDED';
          else if (receipt?.error) state.reason = 'ERROR';
          else if (actualCalls === 0 && decision === 'pending') state.reason = 'NO_PROGRESS';
        }
        notify();
        if (state.reason) break;
      }
    } finally {
      if (stopped && !state.reason) state.reason = 'STOPPED';
      state.running = false; state.stopping = false;
      notify();
    }
  }

  function start({ maxCalls = 100 } = {}) {
    if (state.running) return snapshot();
    const budget = whole(maxCalls);
    if (!budget || budget > 200 || typeof getContext !== 'function' || typeof runCandidate !== 'function') {
      state = { ...state, reason: 'INVALID_BUDGET' }; notify(); return snapshot();
    }
    state = { running: true, stopping: false, maxCalls: budget, actualCalls: 0,
      checked: 0, matched: 0, excluded: 0, pending: 0, reason: '', provider: '', usageUncertain: false, callsPerCandidate: 0 };
    stopped = false;
    idle = Promise.resolve().then(pump);
    notify();
    return snapshot();
  }
  function stop() {
    if (state.running) { stopped = true; state.stopping = true; notify(); }
    return snapshot();
  }
  return { start, stop, snapshot, whenIdle: () => idle };
}
