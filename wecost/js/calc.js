import { monthsBetween } from './utils.js';

// ===== 대출 월 상환액 =====

export function calcLoanMonthly(loan) {
  const { amount, rate, term, grace, type } = loan;
  const r = rate / 100 / 12;
  const repayMonths = Math.max(0, (term - (grace || 0)) * 12);
  if (repayMonths === 0) return 0;

  if (type === 'company') {
    if (r === 0) return amount / repayMonths;
    return amount * r * Math.pow(1 + r, repayMonths) / (Math.pow(1 + r, repayMonths) - 1);
  }
  if (type === '원리금') {
    if (r === 0) return amount / repayMonths;
    return amount * r * Math.pow(1 + r, repayMonths) / (Math.pow(1 + r, repayMonths) - 1);
  }
  if (type === '원금') {
    return (amount / repayMonths) + amount * r;
  }
  if (type === '만기') {
    return amount * r;
  }
  return 0;
}

// ===== 중앙 계산 =====

export function computeAll(st) {
  const s = st.savings || {};
  const weddingDate = st.settings?.weddingDate || '';
  const months = monthsBetween(weddingDate);

  st.monthsLeft  = months;
  st.soheeFinal  = (s.soheeCurrent || 0)  + (s.soheeMonthly || 0)  * months;
  st.sunwoFinal  = (s.sunwoCurrent || 0)  + (s.sunwoMonthly || 0)  * months;
  st.coupleSavings = st.soheeFinal + st.sunwoFinal;

  const items = st.items || [];
  st.totalPlanned = items.reduce((acc, i) => acc + (i.planned || 0), 0);
  st.totalPaid    = items.reduce((acc, i) => acc + (i.deposit || 0) + (i.actual || 0), 0);
  st.totalBalance = items.reduce((acc, i) => acc + (i.balance || 0), 0);

  // 가용 현금
  const cfg    = st.settings || {};
  const supS   = st._incSohee ? (cfg.parentSupportSohee || 0) : 0;
  const supW   = st._incSunwo ? (cfg.parentSupportSunwo || 0) : 0;
  const adjs   = (st.adjustments || []).reduce((acc, a) => {
    return acc + (a.sign === '+' ? 1 : -1) * (a.amount || 0);
  }, 0);
  st.availCash = Math.max(0, st.coupleSavings - st.totalPlanned + supS + supW + adjs);

  // 대출
  const loans = (st.loans || []).filter(l => l.enabled !== false);
  st.totalMonthly = loans.reduce((acc, l) => acc + calcLoanMonthly(l), 0);
  st.houseBudget  = st.availCash + loans.reduce((acc, l) => acc + (l.amount || 0), 0);

  // 감당 상태
  const limit = cfg.monthlyPaymentLimit || 0;
  if (limit === 0 || st.totalMonthly === 0) {
    st.status = 'idle';
  } else if (st.totalMonthly <= limit * 0.8) {
    st.status = 'safe';
  } else if (st.totalMonthly <= limit) {
    st.status = 'caution';
  } else {
    st.status = 'over';
  }
}
