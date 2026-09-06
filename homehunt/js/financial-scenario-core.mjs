import { calcLoanMonthly } from '../../shared/financial-calc.mjs';

export const FINANCIAL_SCENARIO_STORAGE_KEY = 'homehunt_financial_scenarios_v1';
export const FUNDING_STATUS_LABELS = Object.freeze({ safe: '안정', caution: '주의', over: '한도 초과', insufficient: '정보 부족' });
const MONEY_KEYS = ['priceWon', 'availableCashWon', 'additionalCostsWon', 'cashReserveWon', 'existingMonthlyWon', 'monthlyPaymentLimitWon'];

const validNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Monetary price identity is an integer KRW amount, even for a repeating mean. */
export function normalizeFundingPriceWon(value) {
  if (!validNumber(value)) return null;
  const rounded = Math.round(value);
  return Number.isSafeInteger(rounded) ? rounded : null;
}

export function fundingReferencePriceWon(candidate = {}) {
  return validNumber(candidate.priceManWon) ? normalizeFundingPriceWon(candidate.priceManWon * 10_000) : null;
}

/** One provenance decision is shared by the dialog, comparison, and saved plans. */
export function fundingPriceBasis(candidate = {}, input = {}) {
  const priceWon = normalizeFundingPriceWon(input.priceWon);
  const referencePriceWon = fundingReferencePriceWon(candidate);
  const sale = ['sale', '매매'].includes(candidate.dealType || 'sale');
  const hasPrice = priceWon != null && priceWon > 0;
  const isReference = hasPrice && sale && referencePriceWon != null && priceWon === referencePriceWon;
  const provenance = !hasPrice ? 'missing' : isReference ? 'reference' : 'manual';
  return Object.freeze({
    priceWon, referencePriceWon, provenance,
    label: !hasPrice ? sale ? '가격 입력 필요' : '매매 가격 입력 필요'
      : isReference ? candidate.priceSource || '자료 없음'
      : sale ? '사용자 입력 호가' : '사용자 입력 매매 호가',
    observedAt: isReference ? candidate.priceObservedAt || '' : '',
  });
}

/** Search-compatible 억/만원 inputs, retaining KRW precision for monthly payments. */
export function parseScenarioMoney(value) {
  if (typeof value === 'number') return validNumber(value) && Number.isSafeInteger(Math.round(value * 10_000)) ? Math.round(value * 10_000) : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.normalize('NFKC').replace(/[\s,]/g, '');
  const explicitWon = raw.match(/^(\d+(?:\.\d+)?)원$/);
  if (explicitWon) {
    const amount = Math.round(Number(explicitWon[1]));
    return Number.isSafeInteger(amount) ? amount : null;
  }
  const text = raw.replace(/원$/, '').replace(/만$/, '');
  const match = text.match(/^(?:(\d+(?:\.\d+)?)억)?(?:(\d+(?:\.\d+)?)천)?(?:(\d+(?:\.\d+)?)백)?(?:(\d+(?:\.\d+)?)십)?(\d+(?:\.\d+)?)?$/);
  if (!match || !match.slice(1).some((part) => part != null)) return null;
  const parts = match.slice(1).map((part) => Number(part || 0));
  const amount = Math.round(parts[0] * 100_000_000 + parts[1] * 10_000_000 + parts[2] * 1_000_000 + parts[3] * 100_000 + parts[4] * 10_000);
  return Number.isSafeInteger(amount) ? amount : null;
}

export function calculateFundingScenario(input = {}) {
  input = { ...input, priceWon: normalizeFundingPriceWon(input.priceWon) };
  const missing = [];
  for (const key of ['priceWon', 'availableCashWon']) if (!validNumber(input[key])) missing.push(key);
  if (validNumber(input.priceWon) && input.priceWon <= 0) missing.push('priceWon');
  for (const key of ['additionalCostsWon', 'cashReserveWon', 'monthlyPaymentLimitWon']) {
    if (input[key] != null && !validNumber(input[key])) missing.push(key);
  }
  const includeExisting = input.includeExisting !== false;
  if (includeExisting && !validNumber(input.existingMonthlyWon)) missing.push('existingMonthlyWon');
  const costs = validNumber(input.additionalCostsWon) ? input.additionalCostsWon : 0;
  const reserve = validNumber(input.cashReserveWon) ? input.cashReserveWon : 0;
  const hasCapital = validNumber(input.priceWon) && input.priceWon > 0 && validNumber(input.availableCashWon);
  const usableCash = hasCapital ? Math.max(0, input.availableCashWon - reserve) : null;
  const requiredLoanWon = hasCapital ? Math.max(0, input.priceWon + costs - usableCash) : null;
  const remainingCashWon = hasCapital ? input.availableCashWon - (input.priceWon + costs - requiredLoanWon) : null;
  const cashReserveShortfallWon = hasCapital ? Math.max(0, reserve - input.availableCashWon) : null;
  const hasLoan = requiredLoanWon > 0;
  if (hasLoan) {
    if (!validNumber(input.rate) || input.rate > 100) missing.push('rate');
    if (!Number.isInteger(input.term) || input.term < 1 || input.term > 100) missing.push('term');
    if (!Number.isInteger(input.grace) || input.grace < 0 || input.grace >= input.term) missing.push('grace');
    if (!['원리금', '원금', '만기'].includes(input.repaymentType)) missing.push('repaymentType');
    if (!['fixed', 'variable'].includes(input.rateType)) missing.push('rateType');
  }
  let canCalculate = hasCapital && missing.length === 0;
  let monthlyWon = canCalculate ? hasLoan ? calcLoanMonthly({ amount: requiredLoanWon, rate: input.rate, term: input.term, grace: input.grace, type: input.repaymentType }) : 0 : null;
  if (monthlyWon != null && !Number.isFinite(monthlyWon)) {
    canCalculate = false;
    monthlyWon = null;
    missing.push('rate');
  }
  const totalMonthlyWon = monthlyWon == null ? null : monthlyWon + (includeExisting ? input.existingMonthlyWon : 0);
  const limit = validNumber(input.monthlyPaymentLimitWon) && input.monthlyPaymentLimitWon > 0 ? input.monthlyPaymentLimitWon : null;
  const limitRatio = totalMonthlyWon != null && limit ? totalMonthlyWon / limit : null;
  const costsComplete = input.costsComplete === true && validNumber(input.additionalCostsWon);
  const assumptionsComplete = canCalculate && costsComplete && includeExisting && limit !== null;
  const status = limitRatio > 1 ? 'over' : !assumptionsComplete ? 'insufficient' : cashReserveShortfallWon > 0 ? 'caution' : limitRatio <= 0.8 ? 'safe' : 'caution';
  return Object.freeze({
    requiredLoanWon, remainingCashWon, cashReserveShortfallWon, monthlyWon, totalMonthlyWon, limitRatio, status,
    missing: [...new Set(missing)], costsIncludedWon: costs,
    costsComplete, includeExisting,
    graceMonthlyWon: canCalculate && hasLoan && input.grace > 0 ? requiredLoanWon * input.rate / 100 / 12 : null,
    balloonPrincipalWon: canCalculate && hasLoan && input.repaymentType === '만기' ? requiredLoanWon : 0,
    regulatoryStatus: '확인 필요',
    basis: '사용자 입력 조건의 상환 계산',
  });
}

/** Do not persist source Firebase documents, auth state, household IDs or addresses. */
function normalizeSavedScenario(value) {
  if (!value || typeof value !== 'object' || !value.candidate || !value.input) return null;
  const id = String(value.candidate.id || '').slice(0, 180);
  if (!id) return null;
  const input = {};
  for (const key of MONEY_KEYS) input[key] = validNumber(value.input[key]) ? value.input[key] : null;
  input.priceWon = normalizeFundingPriceWon(input.priceWon);
  for (const key of ['rate', 'term', 'grace']) input[key] = validNumber(value.input[key]) ? value.input[key] : null;
  input.repaymentType = ['원리금', '원금', '만기'].includes(value.input.repaymentType) ? value.input.repaymentType : '원리금';
  input.rateType = ['fixed', 'variable'].includes(value.input.rateType) ? value.input.rateType : null;
  input.includeExisting = value.input.includeExisting !== false;
  input.costsComplete = value.input.costsComplete === true;
  return {
    version: 1,
    candidate: {
      id, name: String(value.candidate.name || '선택한 집').slice(0, 120),
      priceManWon: fundingReferencePriceWon(value.candidate) == null ? null : fundingReferencePriceWon(value.candidate) / 10_000,
      priceSource: String(value.candidate.priceSource || '자료 없음').slice(0, 80),
      priceObservedAt: String(value.candidate.priceObservedAt || '').slice(0, 50),
      dealType: String(value.candidate.dealType || 'sale').slice(0, 30),
    },
    input,
    costInputs: Array.isArray(value.costInputs) ? Array.from({ length: 5 }, (_, index) => validNumber(value.costInputs[index]) ? value.costInputs[index] : null) : [],
    savedAt: Number.isFinite(Date.parse(value.savedAt)) ? value.savedAt : null,
  };
}

export function loadFinancialScenarios(storage) {
  try {
    const rows = JSON.parse(storage.getItem(FINANCIAL_SCENARIO_STORAGE_KEY) || '[]');
    return Array.isArray(rows) ? rows.map(normalizeSavedScenario).filter(Boolean).slice(0, 3) : [];
  } catch { return []; }
}

export function saveFinancialScenario(storage, value, now = new Date()) {
  const normalized = normalizeSavedScenario({ ...value, savedAt: now.toISOString() });
  if (!normalized) return { ok: false, reason: 'invalid-scenario' };
  try {
    const current = loadFinancialScenarios(storage).filter((item) => item.candidate.id !== normalized.candidate.id);
    // Explicit save order defines A/B/C; retain only the three latest choices.
    const items = [normalized, ...current].slice(0, 3);
    storage.setItem(FINANCIAL_SCENARIO_STORAGE_KEY, JSON.stringify(items));
    return { ok: true, items };
  } catch { return { ok: false, reason: 'storage-unavailable' }; }
}

export function removeFinancialScenario(storage, candidateId) {
  try {
    const items = loadFinancialScenarios(storage).filter((item) => item.candidate.id !== candidateId);
    storage.setItem(FINANCIAL_SCENARIO_STORAGE_KEY, JSON.stringify(items));
    return { ok: true, items };
  } catch { return { ok: false, reason: 'storage-unavailable' }; }
}
