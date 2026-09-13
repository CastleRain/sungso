import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMortgage, createFinanceCalculatorState, editFinanceCalculator, financeDateLabel,
  financeNumber, financeSeriesState, safeFinanceSourceUrl, synchronizeFinanceDefaults } from '../js/finance-dashboard-core.mjs';

const now = new Date('2026-09-10T01:00:00.000Z');
const rate = (overrides = {}) => ({ id: 'mortgage_new', kind: 'average', frequency: 'monthly', status: 'ok',
  value: 4.48, unit: '%', observationDate: '2026-07', publishedAt: '2026-08-26',
  checkedAt: '2026-09-09T16:00:00.000Z', sourceUrl: 'https://www.bok.or.kr/portal/', ...overrides });
const inputs = overrides => ({ housePriceManWon: 60000, principalManWon: 30000, annualRatePct: 4, termYears: 30, ...overrides });

test('annuity payment extinguishes the principal with an independent monthly ledger', () => {
  const result = calculateMortgage(inputs());
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.monthlyPaymentManWon - 143.2245886) < 0.00001);
  let balance = 30000, interestTotal = 0;
  for (let month = 0; month < 360; month++) {
    const interest = balance * 0.04 / 12;
    interestTotal += interest;
    balance += interest - result.monthlyPaymentManWon;
  }
  assert.ok(Math.abs(balance) < 1e-7);
  assert.ok(Math.abs(interestTotal - result.totalInterestManWon) < 1e-7);
  assert.equal(result.ownFundsManWon, 30000);
  assert.equal(result.loanRatioPct, 50);
});

test('zero interest and no loan remain valid zero-cost cases', () => {
  const zeroRate = calculateMortgage(inputs({ annualRatePct: 0, termYears: 25 }));
  assert.equal(zeroRate.monthlyPaymentManWon, 100);
  assert.equal(zeroRate.totalInterestManWon, 0);
  const noLoan = calculateMortgage(inputs({ principalManWon: 0 }));
  assert.equal(noLoan.monthlyPaymentManWon, 0);
  assert.equal(noLoan.ownFundsManWon, 60000);
  assert.equal(noLoan.totalInterestManWon, 0);
  assert.ok(noLoan.sensitivity.every(scenario => scenario.monthlyPaymentManWon === 0));
});

test('small nonzero rates are stable and 50-year high-rate values stay finite', () => {
  const small = calculateMortgage(inputs({ annualRatePct: 1e-9, termYears: 25 }));
  assert.ok(Math.abs(small.monthlyPaymentManWon - 100) < 1e-6);
  const high = calculateMortgage(inputs({ annualRatePct: 100, termYears: 50 }));
  assert.ok(Number.isFinite(high.totalInterestManWon));
});

test('empty, nonnumeric, negative, fractional terms and excessive principal are rejected', () => {
  const invalid = [['housePriceManWon', ''], ['housePriceManWon', 0], ['housePriceManWon', NaN],
    ['principalManWon', ''], ['principalManWon', -1], ['principalManWon', 60001],
    ['annualRatePct', null], ['annualRatePct', []], ['annualRatePct', Infinity], ['annualRatePct', -0.1], ['annualRatePct', 101],
    ['termYears', 0], ['termYears', 30.5], ['termYears', 51]];
  for (const [field, value] of invalid) {
    const result = calculateMortgage(inputs({ [field]: value }));
    assert.equal(result.ok, false, `${field}: ${String(value)}`);
    assert.ok(result.errors[field]);
    assert.equal(result.monthlyPaymentManWon, undefined);
  }
  assert.equal(financeNumber(false), null);
  assert.equal(financeNumber('  '), null);
});

test('one-percentage-point scenarios preserve amounts and clamp the rate to zero', () => {
  const result = calculateMortgage(inputs({ annualRatePct: 0.5 }));
  assert.deepEqual(result.sensitivity.map(row => row.annualRatePct), [0, 0.5, 1.5]);
  assert.equal(result.sensitivity[0].clipped, true);
  assert.ok(result.sensitivity[0].differenceManWon < 0);
  assert.equal(result.sensitivity[1].differenceManWon, 0);
  assert.ok(result.sensitivity[2].differenceManWon > 0);
});

test('verified recent monthly values are usable while old checks and observations are stale', () => {
  assert.equal(financeSeriesState(rate(), { now }).usable, true);
  for (const overrides of [{ status: 'stale' }, { checkedAt: '2026-08-31T00:00:00Z' }, { observationDate: '2026-04' }]) {
    const state = financeSeriesState(rate(overrides), { now });
    assert.equal(state.status, 'stale');
    assert.equal(state.usable, false);
    assert.equal(state.value, 4.48, 'Previously verified values remain visible with a stale label');
  }
  assert.equal(financeSeriesState(rate({ kind: 'policy', frequency: 'decision', observationDate: '2025-01-01' }), { now }).usable, true);
});

test('missing publication date stays explicit without discarding a verified rate', () => {
  assert.equal(financeSeriesState(rate({ publishedAt: null }), { now }).usable, true);
  assert.equal(financeDateLabel(null), '미확인');
  assert.equal(financeDateLabel('2026-07'), '2026년 7월');
  assert.equal(financeDateLabel('2026-02-30'), '미확인');
});

test('invalid, future and unsafe rate evidence cannot seed the calculator', () => {
  for (const overrides of [{ value: null }, { value: '' }, { status: 'unavailable' }, { checkedAt: null },
    { observationDate: '2026-02-30' }, { observationDate: '2026-10' }, { publishedAt: '2026-12-01' },
    { checkedAt: '2026-09-11T00:00:00Z' }, { sourceUrl: 'javascript:alert(1)' }]) {
    const state = financeSeriesState(rate(overrides), { now });
    assert.equal(state.usable, false, JSON.stringify(overrides));
    assert.equal(state.value, null);
  }
});

test('source URLs reject credential, protocol and control-character injection', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '//example.com', 'http://example.com',
    'https://user:pass@example.com/', 'https://example.com:444/', 'https://example.com\n.evil.test/']) {
    assert.equal(safeFinanceSourceUrl(url), '');
  }
  assert.equal(safeFinanceSourceUrl('https://www.bok.or.kr/portal/?a=1&b=2'), 'https://www.bok.or.kr/portal/?a=1&b=2');
});

test('only verified mortgage averages seed the rate; missing targets do not fabricate an amount', () => {
  const empty = synchronizeFinanceDefaults(createFinanceCalculatorState(), {}, null, { now });
  assert.equal(empty.housePriceManWon, ''); assert.equal(empty.principalManWon, ''); assert.equal(empty.annualRatePct, '');
  const state = synchronizeFinanceDefaults(empty, { targetPriceManWon: 60000, targetPriceSource: 'wecost' }, { series: [rate()] }, { now });
  assert.equal(state.housePriceManWon, '60000'); assert.equal(state.principalManWon, '30000'); assert.equal(state.annualRatePct, '4.48');
  assert.match(state.amountDefaultSource, /WeCost/); assert.equal(state.defaultPrincipal, true);
  assert.equal(synchronizeFinanceDefaults(state, {}, { series: [rate({ kind: 'product' })] }, { now }).annualRatePct, '');
});

test('explicit field edits including blank input survive navigation, new targets and refresh failure', () => {
  let state = synchronizeFinanceDefaults(createFinanceCalculatorState(), { targetPriceManWon: 60000 }, { series: [rate()] }, { now });
  state = editFinanceCalculator(state, 'housePriceManWon', '70000');
  state = editFinanceCalculator(state, 'principalManWon', '');
  state = editFinanceCalculator(state, 'annualRatePct', '3.5');
  const before = structuredClone(state);
  const after = synchronizeFinanceDefaults(state, { targetPriceManWon: 80000 }, { series: [rate({ status: 'stale' })] }, { now });
  assert.equal(after.housePriceManWon, '70000'); assert.equal(after.principalManWon, ''); assert.equal(after.annualRatePct, '3.5');
  assert.equal(after.defaultPrincipal, false); assert.deepEqual(state, before);
  assert.equal(editFinanceCalculator(state, 'unknown', '7'), state);
});
