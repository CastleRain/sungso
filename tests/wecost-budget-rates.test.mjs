import test from 'node:test';
import assert from 'node:assert/strict';
import { weddingBudgetSummary, validateWeddingBudget } from '../apps/wecost/js/wedding-budget-core.mjs';
import { makePlanningState, simulation } from '../apps/wecost/js/planning-core.mjs';
import { fundingSummary, travelLedgerItems } from '../apps/wecost/js/wedding-funds-core.mjs';
import { mortgageEvidence, createLoanRateReader, scenarioWithRate, MARKET_RATES_URL } from '../apps/wecost/js/loan-rates.mjs';
const now = new Date('2026-11-01T03:00:00Z');
const income = (id, amount, itemId = '') => ({ id, name: '예상 수입', amount, itemId, date: '2027-03-06', enabled: true });
const items = [{ id: 'food', planned: 10000000, deposit: 1000000 }, { id: 'dress', planned: 5000000, actual: 2000000 }];
const funds = { cashKrw: 1000000, usdBalance: 0, usdCostKrw: 0 };
test('record-only leaves original prices/payments intact and removes them from budget, wallet gap and house cash once', () => {
  const policy = { excludedIds: ['food'], incomes: [] }, before = structuredClone(items);
  const b = weddingBudgetSummary(items, policy, 1000000);
  assert.equal(b.planned, 5000000); assert.equal(b.paid, 2000000); assert.equal(b.remaining, 3000000);
  assert.equal(b.excludedRemaining, 9000000); assert.equal(b.allPlanned, 15000000); assert.equal(b.needed, 2000000);
  const raw = { settings: { weddingDate: '2027-03-06', weddingBudget: policy }, savings: { soheeCurrent: 20000000 }, items, loans: [{ amount: 200000000, rate: 1, term: 13, grace: 1, type: 'company' }], adjustments: [] };
  const st = { ...raw, ...makePlanningState(raw, { funds, connection: 'live' }, now) };
  assert.equal(st.totalPlanned, b.planned); assert.equal(st.totalBalance, b.remaining);
  assert.equal(st.netCash, 18000000); assert.equal(st.funding.needed, 2000000);
  assert.equal(st.houseBudget, 218000000); assert.equal(simulation(st, { additional: 0 }).houseBudget, 218000000);
  assert.equal(st.displayItems.length, 2); assert.deepEqual(items, before);
});
test('common and linked income offset funding once; excluded/deleted links and disabled income cannot offset again', () => {
  const policy = { excludedIds: ['food'], incomes: [income('gift', 1000000), income('meal', 9000000, 'food'), income('missing', 9000000, 'removed'), { ...income('off', 9000000), enabled: false }] };
  const b = weddingBudgetSummary(items, policy, 1000000);
  assert.equal(b.expectedIncome, 1000000); assert.equal(b.neededBeforeIncome, 2000000); assert.equal(b.needed, 1000000);
  policy.excludedIds = [];
  const f = fundingSummary(items, funds, null, null, policy);
  assert.equal(f.expectedIncome, 10000000); assert.equal(f.needed, 1000000); assert.equal(f.available, 1000000);
  const st = makePlanningState({ items, savings: { soheeCurrent: 20000000 }, settings: { weddingBudget: policy } }, { funds }, now);
  assert.equal(st.netCash, 19000000); // 20m savings - 1m gap; wallet and expected income apply inside the gap once
});
test('surplus is separate from zero needed and unknown wallet never becomes a zero funding gap', () => {
  const policy = { incomes: [{ ...income('gift', 20000000), date: '' }] };
  const b = weddingBudgetSummary(items, policy, 1000000);
  assert.equal(b.needed, 0); assert.equal(b.surplus, 9000000); assert.equal(b.undatedIncome, true);
  assert.equal(weddingBudgetSummary(items, policy).needed, null);
  assert.equal(fundingSummary(items, { ...funds, usdBalance: 100, usdCostKrw: 140000 }, null, null, policy).needed, null);
  const st = makePlanningState({ items, savings: { soheeCurrent: 20000000 }, settings: { weddingBudget: policy } }, { funds }, now);
  assert.equal(st.netCash, 20000000); // wedding surplus is not automatically moved into house cash
});
test('excluding one USD travel row preserves other rows, FX valuation and exact native debt', () => {
  const raw = [{ id: 'trip', cat: '✈️신혼여행', name: '신혼여행', planned: 200000, deposit: 0, actual: 0 }];
  const plan = { linkedItemId: 'trip', baselineTotal: 200000, fxRate: 1000, rows: [{ id: 'hotel', name: '숙소', amount: 100, currency: 'USD', note: '' }, { id: 'cruise', name: '크루즈', amount: 100, currency: 'USD', note: '' }] };
  const f = { ...funds, travel: { linkedItemId: 'trip', payments: [{ id: 'hotel', deposit: 0, actual: 0 }, { id: 'cruise', deposit: 0, actual: 0 }] } };
  const rows = travelLedgerItems(raw, plan, f, { rate: 1400 });
  assert.equal(rows.length, 2);
  const policy = { excludedIds: [rows[0].id], incomes: [] };
  const b = fundingSummary(raw, f, plan, { rate: 1400 }, policy);
  assert.equal(b.planned, 140000); assert.equal(b.remaining, 140000); assert.equal(b.allPlanned, 280000);
  assert.equal(b.excluded[0].nativeRemaining, 100);
});
test('scope validation rejects non-integer money, duplicate income ids and malformed dates', () => {
  assert.throws(() => validateWeddingBudget({ excludedIds: [], incomes: [income('a', 0.1)] }));
  assert.throws(() => validateWeddingBudget({ excludedIds: [], incomes: [income('a', 1), income('a', 1)] }));
  assert.throws(() => validateWeddingBudget({ excludedIds: [], incomes: [{ ...income('a', 1), date: '2027-02-30' }] }));
  assert.throws(() => validateWeddingBudget({ excludedIds: ['a', 'a'], incomes: [] }));
});
const snapshot = () => ({ series: [{ id: 'mortgage_new', kind: 'average', unit: '%', frequency: 'monthly', value: 4.88, status: 'ok', checkedAt: '2026-10-31T06:00:00Z', observationDate: '2026-09', publishedAt: '2026-10-29', sourceUrl: 'https://www.bok.or.kr/portal/' }] });
test('market rate reuses recent monthly evidence, but old/future checks and wrong series are unavailable', () => {
  assert.equal(mortgageEvidence(snapshot(), now).usable, true);
  for (const patch of [{ checkedAt: '2026-10-01' }, { checkedAt: '2026-12-01' }, { observationDate: '2026-01' }, { kind: 'base' }, { unit: 'KRW' }, { value: 200 }]) {
    const s = snapshot(); Object.assign(s.series[0], patch); assert.equal(mortgageEvidence(s, now).usable, false);
  }
  assert.match(MARKET_RATES_URL, /homehunt\/data\/finance-dashboard\.json$/);
});
test('automatic scenarios follow market average while saved manual zero percent and loan terms remain untouched', () => {
  assert.equal(scenarioWithRate({}, { usable: true, value: 4.88 }).terms.rate, 4.88);
  assert.equal(scenarioWithRate({}, { usable: false }).terms.rate, null);
  const manual = { terms: { rate: 0, term: 10, grace: 0, type: '원리금' } };
  assert.equal(scenarioWithRate(manual, { usable: true, value: 4.88 }).terms.rate, 0);
  const automatic = { rateMode: 'market', terms: { rate: 3.5, term: 20, grace: 1, type: '원금' } };
  assert.deepEqual(scenarioWithRate(automatic, { usable: true, value: 4.88 }).terms, { rate: 4.88, term: 20, grace: 1, type: '원금' });
  assert.equal(automatic.terms.rate, 3.5);
});
test('rate fetch failure does not manufacture a quote and late completion after retirement is ignored', async () => {
  const updates = [];
  const reader = createLoanRateReader({ now: () => now, fetchImpl: async () => { throw Error('offline'); }, onChange: s => updates.push(s) });
  await reader.refresh(); assert.equal(reader.get().usable, false); assert.match(reader.get().error, /조회 실패/);
  let resolve;
  const late = createLoanRateReader({ now: () => now, fetchImpl: () => new Promise(r => resolve = r), onChange: s => updates.push(s) });
  const promise = late.refresh(); const n = updates.length; late.stop(); resolve({ ok: true, json: async () => snapshot() }); await promise;
  assert.equal(updates.length, n); assert.equal(late.get().usable, false);
});
