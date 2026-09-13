/** WeCost owns these calculations. All amounts are KRW (원), not 만원. */
export const FINANCIAL_CALC_VERSION = '1.0.0';

export function monthsUntil(dateStr, now = new Date()) {
  if (!dateStr) return 0;
  const today = new Date(now);
  const target = new Date(dateStr);
  if (Number.isNaN(today.getTime()) || Number.isNaN(target.getTime())) return 0;
  return Math.max(0, (target.getFullYear() - today.getFullYear()) * 12 + target.getMonth() - today.getMonth());
}

/** 원금균등은 상환 시작 월, 만기일시는 이자만. 거치 후 상환개월 기준. */
export function calcLoanMonthly(loan) {
  const { amount, rate, term, grace, type } = loan;
  const r = rate / 100 / 12;
  const repayMonths = Math.max(0, (term - (grace || 0)) * 12);
  if (repayMonths === 0) return 0;
  if (type === 'company' || type === '원리금') {
    if (r === 0) return amount / repayMonths;
    return amount * r * Math.pow(1 + r, repayMonths) / (Math.pow(1 + r, repayMonths) - 1);
  }
  if (type === '원금') return amount / repayMonths + amount * r;
  if (type === '만기') return amount * r;
  return 0;
}

/** Pure equivalent of the original WeCost computeAll; caller retains raw data. */
export function calculateFinancialState(st, { now = new Date() } = {}) {
  const savings = st.savings || {};
  const cfg = st.settings || {};
  const monthsLeft = monthsUntil(cfg.weddingDate || '', now);
  const soheeFinal = (savings.soheeCurrent || 0) + (savings.soheeMonthly || 0) * monthsLeft;
  const sunwoFinal = (savings.sunwoCurrent || 0) + (savings.sunwoMonthly || 0) * monthsLeft;
  const coupleSavings = soheeFinal + sunwoFinal;
  const items = st.items || [];
  const totalPlanned = items.reduce((sum, item) => sum + (item.planned || 0), 0);
  const totalPaid = items.reduce((sum, item) => sum + (item.deposit || 0) + (item.actual || 0), 0);
  const totalBalance = items.reduce((sum, item) => sum + (item.balance || 0), 0);
  const supportSohee = st._incSohee ? (cfg.parentSupportSohee || 0) : 0;
  const supportSunwo = st._incSunwo ? (cfg.parentSupportSunwo || 0) : 0;
  const adjustments = (st.adjustments || []).reduce((sum, item) => sum + (item.sign === '+' ? 1 : -1) * (item.amount || 0), 0);
  const availCash = Math.max(0, coupleSavings - totalPlanned + supportSohee + supportSunwo + adjustments);
  const loans = (st.loans || []).filter((loan) => loan.enabled !== false);
  const totalMonthly = loans.reduce((sum, loan) => sum + calcLoanMonthly(loan), 0);
  const houseBudget = availCash + loans.reduce((sum, loan) => sum + (loan.amount || 0), 0);
  const limit = cfg.monthlyPaymentLimit || 0;
  const status = limit === 0 || totalMonthly === 0 ? 'idle'
    : totalMonthly <= limit * 0.8 ? 'safe' : totalMonthly <= limit ? 'caution' : 'over';
  return { monthsLeft, soheeFinal, sunwoFinal, coupleSavings, totalPlanned, totalPaid, totalBalance, availCash, totalMonthly, houseBudget, status };
}

/** Construct only inside the authorized owner's boundary; never publish raw data. */
export function createFinancialSnapshot(st, { now = new Date(), synchronizedAt = null } = {}) {
  const calculated = calculateFinancialState({
    ...st,
    _incSohee: st._incSohee ?? st.settings?.includeSupportSohee ?? false,
    _incSunwo: st._incSunwo ?? st.settings?.includeSupportSunwo ?? false,
  }, { now });
  const date = new Date(now);
  return Object.freeze({
    version: FINANCIAL_CALC_VERSION,
    source: 'wecost',
    availableCashWon: calculated.availCash,
    existingMonthlyWon: calculated.totalMonthly,
    monthlyPaymentLimitWon: st.settings?.monthlyPaymentLimit || 0,
    calculationDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    synchronizedAt,
  });
}
