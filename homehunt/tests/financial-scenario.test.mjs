import test from 'node:test';
import assert from 'node:assert/strict';
import { calcLoanMonthly, calculateFinancialState, createFinancialSnapshot, monthsUntil } from '../../shared/financial-calc.mjs';
import { computeAll } from '../../wecost/js/calc.js';
import { calculateFundingScenario, fundingPriceBasis, fundingReferencePriceWon, parseScenarioMoney, FINANCIAL_SCENARIO_STORAGE_KEY, loadFinancialScenarios, saveFinancialScenario, removeFinancialScenario } from '../js/financial-scenario-core.mjs';
import { createFinancialSnapshotService, validateFinancialSnapshot } from '../js/financial-snapshot-service.mjs';

const now = new Date(2026, 8, 6, 12);
const source = () => ({
  settings: { weddingDate: '2027-03-06', monthlyPaymentLimit: 300_000, parentSupportSohee: 10_000_000, parentSupportSunwo: 999_000_000, includeSupportSohee: true },
  savings: { soheeCurrent: 30_000_000, soheeMonthly: 2_000_000, sunwoCurrent: 20_000_000, sunwoMonthly: 1_500_000 },
  items: [{ planned: 12_000_000, deposit: 2_000_000, actual: 1_000_000, balance: 9_000_000 }],
  adjustments: [{ sign: '-', amount: 3_000_000 }, { sign: '+', amount: 1_000_000 }],
  loans: [{ amount: 50_000_000, rate: 0, term: 20, grace: 0, type: '원리금' }, { amount: 100_000_000, rate: 5, term: 10, enabled: false, type: '원금' }],
  _incSohee: true, _incSunwo: false,
});
const complete = (changes = {}) => ({ priceWon: 96_000_000, availableCashWon: 0, additionalCostsWon: 0, costsComplete: true, cashReserveWon: 0, rate: 0, term: 10, grace: 0, rateType: 'fixed', repaymentType: '원리금', includeExisting: true, existingMonthlyWon: 0, monthlyPaymentLimitWon: 1_000_000, ...changes });
function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
}

test('shared cash calculation preserves the WeCost savings, wedding, support, adjustment and active-loan contract', () => {
  const original = source();
  const untouched = structuredClone(original);
  const result = calculateFinancialState(original, { now });
  assert.deepEqual(original, untouched);
  assert.equal(result.monthsLeft, 6);
  assert.equal(result.coupleSavings, 71_000_000);
  assert.equal(result.totalPlanned, 12_000_000);
  assert.equal(result.totalPaid, 3_000_000);
  assert.equal(result.totalBalance, 9_000_000);
  assert.equal(result.availCash, 67_000_000);
  assert.equal(result.houseBudget, 117_000_000);
  assert.equal(result.totalMonthly, 50_000_000 / 240);
  assert.equal(result.status, 'safe');
  computeAll(original, { now });
  for (const [key, expected] of Object.entries(result)) assert.equal(original[key], expected, key);
});

test('wedding months stay at zero after the target; negative available cash retains the existing zero floor', () => {
  assert.equal(monthsUntil('2026-09-01', now), 0);
  assert.equal(monthsUntil('2026-08-30', now), 0);
  assert.equal(monthsUntil('', now), 0);
  assert.equal(calculateFinancialState({ items: [{ planned: 10_000 }] }, { now }).availCash, 0);
});

test('shared repayments distinguish annuity, first-month equal principal, grace and maturity interest', () => {
  assert.equal(calcLoanMonthly({ amount: 120_000_000, rate: 0, term: 10, grace: 0, type: '원리금' }), 1_000_000);
  assert.equal(calcLoanMonthly({ amount: 120_000_000, rate: 0, term: 10, grace: 2, type: '원리금' }), 1_250_000);
  assert.equal(calcLoanMonthly({ amount: 120_000_000, rate: 6, term: 10, grace: 0, type: '원금' }), 1_600_000);
  assert.equal(calcLoanMonthly({ amount: 120_000_000, rate: 6, term: 10, grace: 0, type: '만기' }), 600_000);
  const loan = { amount: 100_000_000, rate: 4, term: 30, grace: 0, type: '원리금' };
  assert.ok(Math.abs(calcLoanMonthly(loan) - 477_415.30) < 0.01);
  assert.equal(calcLoanMonthly({ ...loan, type: 'company' }), calcLoanMonthly(loan));
});

test('snapshot includes only required totals and honors saved support settings without exposing names or raw financial records', () => {
  const original = source();
  delete original._incSohee;
  delete original._incSunwo;
  const snapshot = createFinancialSnapshot(original, { now, synchronizedAt: now.toISOString() });
  assert.equal(snapshot.availableCashWon, 67_000_000);
  assert.deepEqual(Object.keys(snapshot).sort(), ['version', 'source', 'availableCashWon', 'existingMonthlyWon', 'monthlyPaymentLimitWon', 'calculationDate', 'synchronizedAt'].sort());
  assert.deepEqual(validateFinancialSnapshot({ ...snapshot, savings: original.savings, email: 'private' }), snapshot);
  assert.equal(validateFinancialSnapshot({ ...snapshot, availableCashWon: '67000000' }), null);
  assert.equal(validateFinancialSnapshot({ ...snapshot, calculationDate: '2026-02-30' }), null);
  assert.equal(validateFinancialSnapshot({ ...snapshot, synchronizedAt: null }), null);
});

test('scenario money uses the search currency grammar and never turns a blank input into zero', () => {
  for (const value of ['9억 3,000만원', '9.3억', '9억 3천만원', '93,000만원']) assert.equal(parseScenarioMoney(value), 930_000_000);
  assert.equal(parseScenarioMoney('0'), 0);
  assert.equal(parseScenarioMoney(''), null);
  assert.equal(parseScenarioMoney('금액 모름'), null);
  assert.equal(parseScenarioMoney('-10'), null);
  assert.equal(parseScenarioMoney('224.5223만원'), 2_245_223);
  assert.equal(parseScenarioMoney('2,245,223원'), 2_245_223);
  assert.equal(parseScenarioMoney('20.8333'), 208_333);
  assert.equal(parseScenarioMoney('9억3천가짜'), null);
  assert.equal(parseScenarioMoney('9억3천백'), null);
});

test('a candidate price by itself cannot claim affordability or assume a loan rate', () => {
  const result = calculateFundingScenario({ priceWon: 930_000_000 });
  assert.equal(result.status, 'insufficient');
  assert.equal(result.requiredLoanWon, null);
  assert.equal(result.totalMonthlyWon, null);
  assert.ok(result.missing.includes('availableCashWon'));
});

test('an unchanged repeating official mean retains its source after input rounding, calculation, saving and reload', () => {
  const candidate = { id: 'mean-price', name: '오포추자서희스타힐스', priceManWon: 36833.333333333336, priceSource: '국토부 실거래 평균', priceObservedAt: '2026-08-31', dealType: '매매' };
  const priceWon = parseScenarioMoney('36,833.3333');
  assert.equal(priceWon, 368_333_333);
  assert.equal(fundingReferencePriceWon(candidate), priceWon);
  const basis = fundingPriceBasis(candidate, { priceWon });
  assert.equal(basis.label, '국토부 실거래 평균');
  assert.equal(basis.provenance, 'reference');
  assert.equal(basis.observedAt, '2026-08-31');
  assert.equal(calculateFundingScenario(complete({ priceWon: candidate.priceManWon * 10_000 })).requiredLoanWon, priceWon);
  const storage = memoryStorage();
  const saved = saveFinancialScenario(storage, { candidate, input: complete({ priceWon: candidate.priceManWon * 10_000 }) }, now);
  assert.equal(saved.ok, true);
  const restored = loadFinancialScenarios(storage)[0];
  assert.equal(restored.input.priceWon, priceWon);
  assert.equal(restored.candidate.priceManWon, 36833.3333);
  assert.equal(fundingPriceBasis(restored.candidate, restored.input).provenance, 'reference');
  assert.equal(fundingPriceBasis(restored.candidate, { priceWon: priceWon + 1 }).provenance, 'manual');
  assert.equal(fundingPriceBasis(restored.candidate, { priceWon: priceWon + 1 }).observedAt, '');
  assert.equal(fundingPriceBasis({ ...candidate, dealType: '전세' }, { priceWon }).label, '사용자 입력 매매 호가');
});

test('zero-interest repayment, extra costs, retained cash and existing debt are included without double counting cash', () => {
  const result = calculateFundingScenario(complete({ priceWon: 900_000_000, availableCashWon: 300_000_000, additionalCostsWon: 30_000_000, cashReserveWon: 50_000_000, term: 20, existingMonthlyWon: 500_000, monthlyPaymentLimitWon: 4_000_000 }));
  assert.equal(result.requiredLoanWon, 680_000_000);
  assert.equal(result.remainingCashWon, 50_000_000);
  assert.equal(result.monthlyWon, 680_000_000 / 240);
  assert.equal(result.totalMonthlyWon, 680_000_000 / 240 + 500_000);
  assert.equal(result.status, 'caution');
});

test('affordability boundaries are exact and missing costs or excluded existing loans prevent a safe verdict', () => {
  assert.equal(calculateFundingScenario(complete()).status, 'safe');
  assert.equal(calculateFundingScenario(complete({ priceWon: 96_000_001 })).status, 'caution');
  assert.equal(calculateFundingScenario(complete({ priceWon: 120_000_000 })).status, 'caution');
  assert.equal(calculateFundingScenario(complete({ priceWon: 120_000_001 })).status, 'over');
  assert.equal(calculateFundingScenario(complete({ costsComplete: false })).status, 'insufficient');
  assert.equal(calculateFundingScenario(complete({ includeExisting: false })).status, 'insufficient');
  assert.equal(calculateFundingScenario(complete({ monthlyPaymentLimitWon: 0 })).status, 'insufficient');
});

test('grace and maturity risks remain separate from the monthly burden', () => {
  const result = calculateFundingScenario(complete({ priceWon: 120_000_000, rate: 6, grace: 2, repaymentType: '만기' }));
  assert.equal(result.monthlyWon, 600_000);
  assert.equal(result.graceMonthlyWon, 600_000);
  assert.equal(result.balloonPrincipalWon, 120_000_000);
  assert.equal(result.regulatoryStatus, '확인 필요');
});

test('invalid lending inputs never yield a zero payment that appears affordable', () => {
  for (const changes of [{ rate: null }, { rate: -1 }, { term: 0 }, { term: 30.5 }, { grace: 10 }, { grace: -1 }, { repaymentType: 'invalid' }, { rateType: '' }, { cashReserveWon: Number.NaN }]) {
    const result = calculateFundingScenario(complete(changes));
    assert.equal(result.monthlyWon, null, JSON.stringify(changes));
    assert.equal(result.status, 'insufficient');
  }
});

test('a cash-only purchase needs no invented rate or term and preserves unused cash', () => {
  const result = calculateFundingScenario(complete({ priceWon: 96_000_000, availableCashWon: 100_000_000, rate: null, term: null, grace: null }));
  assert.equal(result.monthlyWon, 0);
  assert.equal(result.requiredLoanWon, 0);
  assert.equal(result.remainingCashWon, 4_000_000);
  assert.equal(result.status, 'safe');
});

test('an unfunded cash reserve and unrepresentable interest are never described as stable', () => {
  const reserve = calculateFundingScenario(complete({ availableCashWon: 10_000_000, cashReserveWon: 20_000_000 }));
  assert.equal(reserve.cashReserveShortfallWon, 10_000_000);
  assert.equal(reserve.status, 'caution');
  const tinyRate = calculateFundingScenario(complete({ rate: 1e-200 }));
  assert.equal(tinyRate.monthlyWon, null);
  assert.equal(tinyRate.status, 'insufficient');
});

test('unconfigured or unauthorized snapshot services never read public financial collections', async () => {
  let reads = 0;
  const unconfigured = createFinancialSnapshotService();
  assert.equal((await unconfigured.refresh()).status, 'connection-required');
  const service = createFinancialSnapshotService({ getAuthorization: async () => ({ userId: 'u', householdId: 'h', canReadFinancialSnapshot: false }), readAuthorizedSnapshot: async () => { reads += 1; } });
  assert.equal((await service.refresh()).reason, 'permission-required');
  assert.equal(reads, 0);
});

test('authorized reads sanitize totals and failed synchronization removes previous numbers', async () => {
  let fail = false;
  const snapshot = createFinancialSnapshot(source(), { now, synchronizedAt: now.toISOString() });
  const service = createFinancialSnapshotService({ getAuthorization: async () => ({ userId: 'u', householdId: 'h', canReadFinancialSnapshot: true }), readAuthorizedSnapshot: async (auth) => {
    assert.deepEqual(auth, { userId: 'u', householdId: 'h' });
    if (fail) throw new Error('private backend error');
    return { ...snapshot, privateRawData: source() };
  } });
  assert.equal((await service.refresh()).status, 'connected');
  assert.deepEqual(service.getState().snapshot, snapshot);
  fail = true;
  const next = await service.refresh();
  assert.equal(next.snapshot, null);
  assert.equal(next.reason, 'sync-failed');
  assert.ok(!JSON.stringify(next).includes('private backend error'));
});

test('logout during an in-flight read discards late private values', async () => {
  let finish;
  const service = createFinancialSnapshotService({ getAuthorization: async () => ({ userId: 'u', householdId: 'h', canReadFinancialSnapshot: true }), readAuthorizedSnapshot: () => new Promise((resolve) => { finish = resolve; }) });
  const pending = service.refresh();
  await new Promise((resolve) => setImmediate(resolve));
  service.clear();
  finish(createFinancialSnapshot(source(), { now, synchronizedAt: now.toISOString() }));
  await pending;
  assert.equal(service.getState().snapshot, null);
  assert.equal(service.getState().status, 'connection-required');
});

test('scenarios remain in a separate local key, strip private extra fields and retain the latest three', () => {
  const storage = memoryStorage();
  storage.setItem('wecost_settings', 'untouched');
  for (const id of ['A', 'B', 'C', 'D']) assert.equal(saveFinancialScenario(storage, { candidate: { id, name: id, address: 'private address', priceManWon: 9600, priceSource: '실거래 평균' }, input: complete(), rawWeCost: source(), authToken: 'private' }, now).ok, true);
  assert.deepEqual(loadFinancialScenarios(storage).map((item) => item.candidate.id), ['D', 'C', 'B']);
  const serialized = storage.getItem(FINANCIAL_SCENARIO_STORAGE_KEY);
  assert.ok(!serialized.includes('private'));
  assert.equal(storage.getItem('wecost_settings'), 'untouched');
  assert.equal(removeFinancialScenario(storage, 'C').ok, true);
  assert.deepEqual(loadFinancialScenarios(storage).map((item) => item.candidate.id), ['D', 'B']);
});

test('local-storage denial and damaged data are recoverable without remote fallback', () => {
  const storage = { getItem: () => '{bad', setItem: () => { throw new Error('denied'); } };
  assert.deepEqual(loadFinancialScenarios(storage), []);
  assert.equal(saveFinancialScenario(storage, { candidate: { id: 'A' }, input: complete() }, now).reason, 'storage-unavailable');
  assert.deepEqual(loadFinancialScenarios(null), []);
});
