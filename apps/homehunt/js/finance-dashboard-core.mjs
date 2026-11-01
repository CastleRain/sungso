import { financeNumber, safeFinanceSourceUrl, financeDateLabel, financeSeriesState } from '../../../shared/finance/market-rate-evidence.mjs';
export { financeNumber, safeFinanceSourceUrl, financeDateLabel, financeSeriesState };
const FIELDS = ['housePriceManWon', 'principalManWon', 'annualRatePct', 'termYears'];

function payment(principal, rate, months) {
  if (principal === 0) return 0;
  const monthlyRate = rate / 1200;
  // expm1/log1p preserve precision for small but nonzero rates.
  return monthlyRate === 0 ? principal / months
    : principal * monthlyRate / -Math.expm1(-months * Math.log1p(monthlyRate));
}

/** All money is in 만원. Fixed-rate, monthly annuity, no fees, grace period or rate changes. */
export function calculateMortgage(input = {}) {
  const house = financeNumber(input.housePriceManWon), principal = financeNumber(input.principalManWon);
  const rate = financeNumber(input.annualRatePct), years = financeNumber(input.termYears);
  const errors = {};
  if (house === null || house <= 0 || house > 100_000_000) errors.housePriceManWon = '집값을 0보다 크게 입력해주세요.';
  if (principal === null || principal < 0 || principal > 100_000_000) errors.principalManWon = '대출금액을 0 이상으로 입력해주세요.';
  else if (house !== null && house > 0 && principal > house) errors.principalManWon = '대출금액은 집값 이내로 입력해주세요.';
  if (rate === null || rate < 0 || rate > 100) errors.annualRatePct = '연 금리를 0~100%로 입력해주세요.';
  if (years === null || !Number.isInteger(years) || years < 1 || years > 50) errors.termYears = '상환기간을 1~50년의 정수로 입력해주세요.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const months = years * 12, monthlyPaymentManWon = payment(principal, rate, months);
  const totalRepaymentManWon = monthlyPaymentManWon * months;
  return {
    ok: true, errors: {}, months, housePriceManWon: house, principalManWon: principal, annualRatePct: rate, termYears: years,
    ownFundsManWon: house - principal, loanRatioPct: principal / house * 100,
    monthlyPaymentManWon, totalRepaymentManWon, totalInterestManWon: Math.max(0, totalRepaymentManWon - principal),
    sensitivity: [-1, 0, 1].map(delta => {
      const scenarioRate = Math.max(0, Math.min(100, rate + delta));
      const monthly = payment(principal, scenarioRate, months);
      return { delta, annualRatePct: scenarioRate, monthlyPaymentManWon: monthly,
        differenceManWon: monthly - monthlyPaymentManWon, clipped: scenarioRate !== rate + delta };
    }),
  };
}

export function createFinanceCalculatorState() {
  return { housePriceManWon: '', principalManWon: '', annualRatePct: '', termYears: '30', edited: {},
    amountDefaultSource: '', rateDefaultSource: '', defaultPrincipal: false };
}

export function editFinanceCalculator(state, field, value) {
  if (!FIELDS.includes(field)) return state;
  return { ...state, [field]: String(value), edited: { ...state.edited, [field]: true },
    ...(field === 'annualRatePct' ? { rateDefaultSource: '직접 입력한 계산 가정' } : {}),
    ...(field === 'principalManWon' ? { defaultPrincipal: false } : {}),
    ...(field === 'housePriceManWon' ? { amountDefaultSource: '직접 입력한 집값', defaultPrincipal: false } : {}) };
}

export function synchronizeFinanceDefaults(state, context = {}, snapshot = null, options = {}) {
  const next = { ...state, edited: { ...state.edited } };
  const target = financeNumber(context.targetPriceManWon);
  if (!state.edited.housePriceManWon && target !== null && target > 0) {
    next.housePriceManWon = String(target);
    next.amountDefaultSource = context.targetPriceSource === 'wecost' ? 'WeCost에서 연결한 목표가격'
      : typeof context.targetPriceSource === 'string' && context.targetPriceSource ? context.targetPriceSource : '현재 집 찾기 목표가격';
    if (!state.edited.principalManWon) {
      next.principalManWon = String(Math.round(target / 2));
      next.defaultPrincipal = true;
    }
  }
  if (!state.edited.annualRatePct) {
    const rates = snapshot?.series || snapshot?.rates || [];
    const row = Array.isArray(rates) ? rates.find(value => value.id === 'mortgage_new' && value.kind === 'average') : null;
    const evidence = financeSeriesState(row, options);
    next.annualRatePct = evidence.usable ? String(evidence.value) : '';
    next.rateDefaultSource = evidence.usable
      ? `${financeDateLabel(row.observationDate)} 신규 주담대 평균 · 계산 가정` : '적용할 연 금리를 직접 입력해주세요.';
  }
  return next;
}
