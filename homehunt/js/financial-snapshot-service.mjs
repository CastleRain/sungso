import { FINANCIAL_CALC_VERSION } from '../../shared/financial-calc.mjs';

export const WECOST_HOUSE_URL = '../wecost/?tab=house';
const disconnected = (reason = 'authentication-required') => Object.freeze({
  status: 'connection-required', reason, snapshot: null,
  label: 'WeCost 연결 필요',
  message: '로그인과 두 사람의 재무 읽기 권한이 준비되면 연결할 수 있어요. 지금은 WeCost에서 확인하거나 시나리오에 직접 입력해 주세요.',
});

function nonnegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** A strict minimum-field view. Drop extra fields even from an authorized source. */
export function validateFinancialSnapshot(value) {
  if (!value || value.version !== FINANCIAL_CALC_VERSION || value.source !== 'wecost') return null;
  if (!['availableCashWon', 'existingMonthlyWon', 'monthlyPaymentLimitWon'].every((key) => nonnegative(value[key]))) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.calculationDate || '') || !value.synchronizedAt || !Number.isFinite(Date.parse(value.synchronizedAt))) return null;
  const date = new Date(`${value.calculationDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.calculationDate) return null;
  return Object.freeze({
    version: value.version, source: 'wecost',
    availableCashWon: value.availableCashWon,
    existingMonthlyWon: value.existingMonthlyWon,
    monthlyPaymentLimitWon: value.monthlyPaymentLimitWon,
    calculationDate: value.calculationDate,
    synchronizedAt: value.synchronizedAt,
  });
}

/**
 * No Firebase SDK, public collection fallback, financial localStorage, or writes.
 * A future adapter must enforce membership on the server; the client gate alone
 * is not authorization. Its read receives only the verified household context.
 */
export function createFinancialSnapshotService({ getAuthorization, readAuthorizedSnapshot } = {}) {
  let state = disconnected();
  let generation = 0;
  const listeners = new Set();
  const publish = (next) => {
    state = Object.freeze(next);
    listeners.forEach((listener) => listener(state));
    return state;
  };
  return Object.freeze({
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    async refresh() {
      const request = ++generation;
      // Clear older numbers immediately; failed refreshes never retain stale money.
      if (typeof getAuthorization !== 'function' || typeof readAuthorizedSnapshot !== 'function') return publish(disconnected());
      publish({ status: 'loading', snapshot: null, label: '재무 권한 확인 중' });
      try {
        const auth = await getAuthorization();
        if (request !== generation) return state;
        if (!auth?.userId || !auth?.householdId || auth.canReadFinancialSnapshot !== true) return publish(disconnected('permission-required'));
        const raw = await readAuthorizedSnapshot({ userId: auth.userId, householdId: auth.householdId });
        if (request !== generation) return state;
        const currentAuth = await getAuthorization();
        if (request !== generation) return state;
        if (currentAuth?.userId !== auth.userId || currentAuth?.householdId !== auth.householdId || currentAuth?.canReadFinancialSnapshot !== true) return publish(disconnected('permission-changed'));
        const snapshot = validateFinancialSnapshot(raw);
        return snapshot ? publish({ status: 'connected', label: 'WeCost 읽기 전용', snapshot }) : publish(disconnected('invalid-snapshot'));
      } catch {
        if (request !== generation) return state;
        return publish(disconnected('sync-failed'));
      }
    },
    clear() { generation += 1; return publish(disconnected()); },
  });
}

// Authentication and household rules are not deployed, so intentionally no adapter.
export const financialSnapshotService = createFinancialSnapshotService();
