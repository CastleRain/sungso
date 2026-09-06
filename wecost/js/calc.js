import { calculateFinancialState } from '../../shared/financial-calc.mjs';

export { calcLoanMonthly } from '../../shared/financial-calc.mjs';

// Preserve WeCost's existing mutating interface; the shared engine is pure.
export function computeAll(st, options) {
  Object.assign(st, calculateFinancialState(st, options));
}
