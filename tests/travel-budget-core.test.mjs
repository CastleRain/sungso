import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAVEL_CATEGORY, isTravelItem, deriveBudgetDraft, normalizeBudgetDraft, calculateTravelBudget, buildBudgetUpdate, buildTravelLedgerUpdate, buildBudgetAudit, sameBudgetValue } from '../shared/finance/travel-budget-core.mjs';

const item = (extra = {}) => ({ id: 'synthetic-travel', name: '가상 여행 비용', cat: TRAVEL_CATEGORY, planned: 7000000, deposit: 250000, actual: 500000, balance: 6250000, balanceDue: '2027-01-10', memo: '', ...extra });
const row = (id, amount, currency = 'KRW') => ({ id, name: id, amount, currency, note: '' });
const draft = (extra = {}) => ({ linkedItemId: 'synthetic-travel', baselineTotal: 7000000, availableCash: null, fxRate: null, rows: [row('항공', 7000000)], note: '', ...extra });

test('conservative memo parsing excludes parenthesised possibilities and preserves the original memo', () => {
  const ledger = item({ planned: 6500000, memo: '아나네아400 디즈니크루즈150 항공100 (방콕간다면80추가)' });
  const before = structuredClone(ledger);
  const plan = deriveBudgetDraft(ledger);
  assert.deepEqual(plan.rows.map(row => [row.name, row.amount]), [['몰디브 리조트', 4000000], ['디즈니 크루즈', 1500000], ['항공', 1000000]]);
  assert.equal(plan.note, ledger.memo);
  assert.equal(plan.baselineTotal, ledger.planned);
  assert.equal(plan.availableCash, null);
  assert.deepEqual(ledger, before);
});

test('unrecognised or nonmatching memo totals remain one existing budget instead of guessed details', () => {
  for (const memo of ['항공100 크루즈100', '항공100 새후보600', '항공100 크루즈600 조건부', '총 700만원']) {
    const plan = deriveBudgetDraft(item({ memo }));
    assert.deepEqual(plan.rows, [row('existing-budget', 7000000)].map(row => ({ ...row, name: '기존 신혼여행 예산' })));
    assert.equal(plan.note, memo);
  }
  assert.equal(isTravelItem(item()), true);
  assert.equal(isTravelItem({ cat: '식대' }), false);
});

test('USD rounds per line, paid combines deposit and actual, cash excludes money already paid', () => {
  const plan = draft({ rows: [row('항공', 3000000), row('추가비', 150.55, 'USD')], fxRate: 1325.5, availableCash: 1000000 });
  const result = calculateTravelBudget(plan, item());
  assert.equal(result.total, 3199554);
  assert.equal(result.paid, 750000);
  assert.equal(result.remaining, 2449554);
  assert.equal(result.additionalNeeded, 1449554);
  assert.equal(result.delta, -3800446);
  assert.equal(result.unsyncedDelta, result.delta);
  assert.equal(result.paymentProgress, 750000 / 3199554);
  assert.equal(result.incomplete, false);
  assert.equal(calculateTravelBudget(draft({ rows: [row('비용', 0)] }), item()).remaining, 0);
  assert.equal(calculateTravelBudget(draft({ rows: [row('비용', 0)], availableCash: 0 }), item()).additionalNeeded, 0);
});

test('unknown amounts, zero prices and missing FX are distinct; incomplete totals cannot overwrite WeCost', () => {
  const plan = draft({ rows: [row('미정', null), row('무료', 0), row('달러견적', 100, 'USD'), row('확인금액', 500000)] });
  const result = calculateTravelBudget(plan, item());
  assert.equal(result.total, 500000);
  assert.equal(result.missingCount, 1);
  assert.equal(result.missingRateCount, 1);
  assert.equal(result.incomplete, true);
  assert.deepEqual(result.rowTotals, [null, 0, null, 500000]);
  assert.equal(result.additionalNeeded, null);
  assert.throws(() => buildBudgetUpdate(item(), null, plan, { item: item(), plan: null }), /환율/);
  assert.throws(() => buildBudgetUpdate(item(), null, { ...plan, fxRate: 1400 }, { item: item(), plan: null }), /예상 금액/);
});

test('saved detailed plan and comparison baseline survive a separate ledger change', () => {
  const saved = draft({ rows: [row('금액', 6000000)], baselineTotal: 8000000 });
  const derived = deriveBudgetDraft(item(), saved, { rate: 1400 });
  assert.deepEqual(derived, saved, 'Reading a newer FX record must not silently reprice an existing plan');
  const result = calculateTravelBudget(derived, item());
  assert.equal(result.mismatch, true);
  assert.equal(result.unsyncedDelta, -1000000);
  assert.equal(result.delta, -2000000);
  const update = buildBudgetUpdate(item(), saved, { ...saved, baselineTotal: 10 }, { item: item(), plan: saved });
  assert.equal(update.plan.baselineTotal, 8000000);
});

test('first explicit connection captures baseline from current ledger and patches only total and balance', () => {
  const ledger = item({ extension: { retained: true }, memo: '원래 메모' });
  const plan = draft({ baselineTotal: 1, rows: [row('확인금액', 6500000), row('포함 비용', 0)] });
  const before = structuredClone({ ledger, plan });
  const update = buildBudgetUpdate(ledger, null, plan, { item: ledger, plan: null });
  assert.deepEqual(update.itemPatch, { planned: 6500000, balance: 5750000 });
  assert.equal(update.plan.baselineTotal, 7000000);
  assert.deepEqual({ ledger, plan }, before);
});

test('concurrent ledger/plan changes and wrong links reject stale editors', () => {
  const ledger = item(), plan = draft();
  assert.throws(() => buildBudgetUpdate({ ...ledger, deposit: 300000 }, null, plan, { item: ledger, plan: null }), /바뀌었어요/);
  assert.throws(() => buildBudgetUpdate(ledger, { ...plan, note: '다른 편집' }, plan, { item: ledger, plan }), /바뀌었어요/);
  assert.throws(() => buildBudgetUpdate(ledger, null, { ...plan, linkedItemId: 'different' }, { item: ledger, plan: null }), /연결/);
  assert.throws(() => buildBudgetUpdate(ledger, null, plan), /편집 전/);
  assert.equal(sameBudgetValue({ updatedAt: { seconds: 50, nanoseconds: 1, toJSON() { return 'timestamp'; } } }, { updatedAt: { seconds: 50, nanoseconds: 1 } }), true);
});

test('WeCost edits recompute balance, preserve unspecified fields and include payment changes in audit', () => {
  const ledger = item(), plan = draft();
  const patch = buildTravelLedgerUpdate(ledger, { deposit: 500000, actual: 1000000, balance: 0 }, ledger);
  assert.deepEqual(patch, { deposit: 500000, actual: 1000000, balance: 5500000 });
  const after = { ...ledger, ...patch };
  const audit = buildBudgetAudit(ledger, plan, after, plan, '소희');
  assert.equal(audit.type, 'ledger');
  assert.equal(audit.before.paid, 750000);
  assert.equal(audit.after.paid, 1500000);
  assert.equal(audit.delta, 0);
  assert.equal(audit.actor, '소희');
  assert.deepEqual(audit.after.plan.rows, plan.rows);
  assert.equal(buildBudgetAudit(ledger, plan, ledger, plan), null);
  assert.throws(() => buildTravelLedgerUpdate(ledger, { cat: '다른 분류' }, ledger), /분류/);
  assert.throws(() => buildTravelLedgerUpdate(ledger, { updatedAt: 'fake' }, ledger), /변경할 수 없는/);
  assert.throws(() => buildTravelLedgerUpdate(ledger, { balanceDue: '2027-02-30' }, ledger), /날짜/);
  assert.equal(buildTravelLedgerUpdate(ledger, { balanceDue: null }, ledger).balanceDue, null);
  assert.equal(buildTravelLedgerUpdate(ledger, { balanceDue: '' }, ledger).balanceDue, '');
});

test('invalid amounts, duplicates and invalid rates cannot enter a saved budget', () => {
  for (const value of [-1, Infinity, NaN, '100', 1.5]) assert.throws(() => normalizeBudgetDraft(draft({ rows: [row('금액', value)] })), /금액/);
  assert.throws(() => normalizeBudgetDraft(draft({ rows: [row('a', 10), row('a', 20)] })), /중복/);
  assert.throws(() => normalizeBudgetDraft(draft({ fxRate: 0 })), /환율/);
  assert.throws(() => normalizeBudgetDraft(draft({ availableCash: -1 })), /준비금/);
  assert.throws(() => calculateTravelBudget(draft({ fxRate: Number.MAX_SAFE_INTEGER, rows: [row('달러', 100, 'USD')] }), item()), /너무 커요/);
});
