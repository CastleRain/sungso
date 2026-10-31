import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createMemberWork } from '../shared/firebase/member-work.mjs';
import * as core from '../apps/wecost/js/wedding-funds-core.mjs';
import * as travel from '../shared/finance/travel-budget-core.mjs';
import { weddingView, paymentState } from '../apps/wecost/js/wedding-core.mjs';

const today = '2026-10-31';
const item = { id: 'test-trip', cat: travel.TRAVEL_CATEGORY, name: '합성 여행', planned: 900000, deposit: 20000, actual: 100000, memo: '원본 메모', extraField: 'keep' };
const funds = { cashKrw: 200000, usdBalance: 500, usdCostKrw: 600000, revision: 1 };
const plan = { linkedItemId: item.id, baselineTotal: item.planned, availableCash: null, fxRate: 1200, note: '', rows: [
  { id: 'stay', name: '합성 숙소', amount: 500, currency: 'USD', note: '합성 견적' },
  { id: 'flight', name: '합성 항공', amount: 100000, currency: 'KRW', note: '' },
] };
const payments = [{ id: 'stay', deposit: 20000, actual: 0 }, { id: 'flight', deposit: 0, actual: 100000 }];
const original = () => structuredClone({ funds, item, plan: null });
const detailed = () => {
  const before = original(), next = core.buildFundingChange(before, { kind: 'travel', plan, payments }, before, today);
  return { funds: next.funds, plan: next.plan, item: { ...item, ...next.itemPatch } };
};
test('exchange is an asset, missing balances stay unknown, and expense refunds never net off another bill', () => {
  assert.equal(core.fundingSummary([item], null).needed, null);
  assert.deepEqual(core.normalizeFunds(funds), { cashKrw: 200000, usdBalance: 500, usdCostKrw: 600000 });
  const before = original(), next = core.buildFundingChange(before, { kind: 'balances', balances: funds }, before, today);
  assert.equal(next.itemPatch, null);
  const sum = core.fundingSummary([{ planned: 100000, actual: 120000 }, { planned: 200000 }], funds, null, { rate: 1200 });
  assert.equal(sum.remaining, 200000); assert.equal(sum.surplus, 600000);
  assert.throws(() => core.normalizeFunds({ ...funds, usdBalance: 0 }), /함께/);
  assert.throws(() => core.normalizeFunds({ ...funds, usdBalance: 2.001 }), /올바르게/);
});
test('detail migration preserves one parent, original metadata and balances; tracked payments equal the parent', () => {
  const after = detailed();
  assert.equal(after.item.planned, 700000); assert.equal(after.item.actual, 100000); assert.equal(after.item.deposit, 20000);
  assert.equal(after.item.memo, item.memo); assert.equal(after.item.extraField, 'keep');
  const memoEdit = core.buildFundingChange(after, { kind: 'travel', plan: after.plan, payments, ledgerMemo: '명시적으로 정정한 메모' }, after, today);
  assert.equal(memoEdit.itemPatch.memo, '명시적으로 정정한 메모');
  assert.equal(memoEdit.itemPatch.actual, after.item.actual);
  assert.equal(memoEdit.funds.usdBalance, after.funds.usdBalance);
  assert.equal(after.funds.usdBalance, 500); assert.equal(after.funds.cashKrw, funds.cashKrw);
  assert.equal(core.travelBreakdown(after.item, after.plan, after.funds).rows.length, 2);
  assert.match(core.travelBreakdown({ ...after.item, actual: 110000 }, after.plan, after.funds).error, /다른 화면/);
  assert.match(core.travelBreakdown(after.item, { ...after.plan, rows: [after.plan.rows[1]] }, after.funds).error, /지급 내역/);
});
test('USD payment consumes remaining cost basis exactly, refund waits for actual receipt, and cash goal does not count future refund', () => {
  const before = detailed();
  const payment = { kind: 'payment', direction: 'payment', source: 'usd', amount: 500, rowId: 'stay', date: today };
  const next = core.buildFundingChange(before, payment, before, today);
  assert.equal(next.funds.usdBalance, 0); assert.equal(next.funds.usdCostKrw, 0);
  assert.equal(next.funds.cashKrw, funds.cashKrw); assert.equal(next.itemPatch.actual, 700000);
  const paid = { funds: next.funds, plan: before.plan, item: { ...before.item, ...next.itemPatch } };
  assert.equal(core.fundingSummary([paid.item, { planned: 50000 }], paid.funds, paid.plan).remaining, 50000);
  const refund = core.buildFundingChange(paid, { kind: 'payment', direction: 'refund', component: 'deposit', source: 'cash', amount: 20000, rowId: 'stay', date: today }, paid, today);
  assert.equal(refund.funds.cashKrw, 220000); assert.equal(refund.itemPatch.deposit, 0);
  assert.equal(refund.itemPatch.actual, 700000);
  assert.throws(() => core.buildFundingChange(paid, { ...payment, direction: 'refund' }, paid, today), /달러 환불/);
});
test('cash payment changes funds and debt together; credit card uses outside funds and validates date/limits', () => {
  const before = { funds, plan: null, item: { id: 'test-hall', planned: 300000, deposit: 0, actual: 0 } };
  const pay = { kind: 'payment', direction: 'payment', source: 'cash', amount: 50000, date: today };
  const next = core.buildFundingChange(before, pay, before, today);
  assert.equal(next.funds.cashKrw, 150000); assert.equal(next.itemPatch.actual, 50000);
  assert.equal(core.fundingSummary([before.item], before.funds, null, { rate: 1000 }).needed, core.fundingSummary([{ ...before.item, ...next.itemPatch }], next.funds, null, { rate: 1000 }).needed);
  const card = core.buildFundingChange(before, { ...pay, source: 'outside' }, before, today);
  assert.equal(card.funds.cashKrw, funds.cashKrw);
  for (const change of [{ amount: 300000 }, { amount: -1 }, { amount: 0 }, { date: '2026-11-01' }, { date: '2026-02-30' }, { source: '' }]) assert.throws(() => core.buildFundingChange(before, { ...pay, ...change }, before, today));
});
test('rounding consumes all USD cost on last payment, bad rows and concurrent changes reject', () => {
  const before = { funds: { cashKrw: 0, usdBalance: 3, usdCostKrw: 1000 }, plan: null, item: { id: 'test', planned: 5000, actual: 0 } };
  const pay = { kind: 'payment', direction: 'payment', source: 'usd', amount: 1, date: today };
  const a = core.buildFundingChange(before, pay, before, today);
  const second = { ...before, funds: a.funds, item: { ...before.item, ...a.itemPatch } };
  const b = core.buildFundingChange(second, { ...pay, amount: 2 }, second, today);
  assert.equal(b.itemPatch.actual, 1000); assert.equal(b.funds.usdCostKrw, 0);
  assert.throws(() => core.buildFundingChange(second, pay, before, today), /다른 화면/);
  assert.throws(() => core.buildFundingChange(original(), { kind: 'travel', plan, payments: [payments[0], payments[0]] }, original(), today), /지급 기록/);
});
test('detail-aware wedding view keeps a due item visible even when another sub-cost is overpaid', () => {
  const paid = { ...item, planned: 100, actual: 100, deposit: 0, balanceDue: today };
  const readPayment = input => ({ ...paymentState(input), remaining: 20, overpaid: 20, status: 'partial' });
  const view = weddingView([paid], { today, status: 'partial', groupBy: 'category' }, readPayment);
  assert.equal(view.filtered.length, 1); assert.equal(view.soon.length, 1); assert.equal(view.completed.length, 0);
  assert.equal(view.totals.remaining, 20); assert.equal(view.groups[0].totals.remaining, 20);
  assert.equal(weddingView([paid], { today }).totals.remaining, 0, 'existing callers retain the existing calculation');
});

test('current funds and required saving use the same FX rate; missing rates never fall back to acquisition cost', () => {
  const before = structuredClone(funds), costs = [{ planned: 1000000 }];
  assert.equal(core.fundingSummary(costs, funds).available, null);
  assert.equal(core.fundingSummary(costs, funds, null, { rate: NaN }).needed, null);
  const a = core.fundingSummary(costs, funds, null, { rate: 1000 });
  const b = core.fundingSummary(costs, funds, null, { rate: 1400 });
  assert.equal(a.available, 700000); assert.equal(a.needed, 300000);
  assert.equal(b.available, 900000); assert.equal(b.needed, 100000);
  assert.deepEqual(funds, before);
  assert.equal(core.fundingSummary(costs, { cashKrw: 1100000, usdBalance: 0, usdCostKrw: 0 }).surplus, 100000);
});

test('travel rows replace the parent once and participate in category totals, filters and ordering', () => {
  const state = detailed(), other = { id: 'hall', cat: '🏰웨딩홀', name: '합성 홀', planned: 300000, deposit: 0, actual: 0 };
  const before = structuredClone(state), rows = core.travelLedgerItems([state.item, other], state.plan, state.funds);
  assert.equal(rows.length, 3); assert.ok(rows.every(row => row.id !== state.item.id));
  assert.equal(new Set(rows.map(row => row.id)).size, 3);
  assert.equal(rows[0].travelParentId, state.item.id); assert.equal(rows[0].travelRowId, 'stay');
  const view = weddingView(rows, { groupBy: 'category', sort: 'amount', today });
  const group = view.groups.find(g => g.category === travel.TRAVEL_CATEGORY);
  assert.deepEqual(group.items.map(i => i.name), ['합성 숙소', '합성 항공']);
  assert.equal(group.totals.planned, state.item.planned); assert.equal(group.totals.paid, state.item.deposit + state.item.actual);
  assert.equal(weddingView(rows, { status: 'done', today }).filtered[0].travelRowId, 'flight');
  assert.equal(weddingView(rows, { includeTravel: false, today }).filtered.length, 1);
  assert.deepEqual(state, before);
  const inconsistent = core.travelLedgerItems([{ ...state.item, actual: 120000 }], state.plan, state.funds);
  assert.equal(inconsistent.length, 1); assert.equal(inconsistent[0].id, state.item.id);
  assert.match(inconsistent[0].travelDetailError, /다른 화면/);
});

test('the same live rate drives all USD costs, balances, category totals and required savings without rewriting history', () => {
  const state = detailed();
  const change = core.buildFundingChange(state, { kind: 'travel', plan: { ...state.plan, rows: [...state.plan.rows, { id: 'ship', name: '합성 선박', amount: 200, currency: 'USD', note: '카드 결제 예정' }] }, payments: [...state.funds.travel.payments, { id: 'ship', deposit: 0, actual: 0 }] }, state, today);
  const saved = { item: { ...state.item, ...change.itemPatch }, plan: change.plan, funds: change.funds }, before = structuredClone(saved);
  const quote = { rate: 1300 }, rows = core.travelLedgerItems([saved.item], saved.plan, saved.funds, quote);
  assert.deepEqual(rows.map(row => row.planned), [650000, 100000, 260000]);
  assert.deepEqual(rows.map(row => row.balance), [630000, 0, 260000]);
  assert.deepEqual(rows.map(row => row.deposit + row.actual), [20000, 100000, 0]);
  const view = weddingView(rows, { groupBy: 'category', today });
  assert.equal(view.groups[0].totals.planned, 1010000); assert.equal(view.groups[0].totals.remaining, 890000);
  const sum = core.fundingSummary([saved.item], saved.funds, saved.plan, quote);
  assert.equal(sum.remaining, 890000); assert.equal(sum.available, 850000); assert.equal(sum.needed, 40000);
  assert.equal(core.fundingSummary([saved.item], saved.funds, saved.plan, { rate: 1100 }).needed, 0);
  assert.deepEqual(saved, before);
  const paid = core.buildFundingChange(saved, { kind: 'payment', source: 'outside', direction: 'payment', amount: 250000, rowId: 'ship', date: today }, saved, today);
  assert.equal(paid.funds.usdBalance, saved.funds.usdBalance); assert.equal(paid.funds.cashKrw, saved.funds.cashKrw);
  assert.equal(paid.funds.travel.payments.find(row => row.id === 'ship').actual, 250000);
});

test('missing quotes keep an explicitly flagged saved forecast and do not claim a current savings goal', () => {
  const saved = detailed(), cash = { ...saved.funds, usdBalance: 0, usdCostKrw: 0 };
  const rows = core.travelLedgerItems([saved.item], saved.plan, cash);
  assert.equal(rows[0].fxPending, true); assert.equal(rows[0].planned, 600000);
  assert.equal(rows[1].fxPending, false);
  const summary = core.fundingSummary([saved.item], cash, saved.plan);
  assert.equal(summary.available, cash.cashKrw); assert.equal(summary.needed, null); assert.equal(summary.missingRate, true);
});

function storeEnv() {
  const docs = new Map([['wecost_settings/wedding_funds', structuredClone(funds)], ['wecost_items/test-trip', structuredClone(item)]]);
  const callbacks = [], cleanups = [];
  let member = { uid: 'synthetic', name: '성우', role: 'sungwoo' }, fail = false, retire = false, writes = 0;
  const snapshot = ref => ({ id: ref.id, exists: () => docs.has(ref.path), data: () => structuredClone(docs.get(ref.path)), metadata: { fromCache: false, hasPendingWrites: false } });
  const context = vm.createContext({ ...core, ...travel, createMemberWork, db: {}, structuredClone, console, Date, globalThis: {},
    localDate: () => today, getMember: () => member, registerPrivateCleanup: fn => cleanups.push(fn),
    doc: (_, ...parts) => ({ path: parts.join('/'), id: parts.at(-1) }), collection: (_, name) => ({ path: name }), serverTimestamp: () => 'test-time',
    onSnapshot: (ref, _, next) => { callbacks.push(() => next(snapshot(ref))); queueMicrotask(() => next(snapshot(ref))); return () => {}; },
    runTransaction: async (_, fn) => {
      const changes = [];
      const result = await fn({ get: async ref => { assert.equal(changes.length, 0, 'all reads precede writes'); if (retire) member = null; return snapshot(ref); },
        set: (ref, data, options) => changes.push([ref.path, options?.merge ? { ...docs.get(ref.path), ...data } : data]),
        update: (ref, data) => changes.push([ref.path, { ...docs.get(ref.path), ...data }]),
      });
      if (fail) throw Error('commit failure');
      for (const [key, value] of changes) { docs.set(key, structuredClone(value)); writes++; }
      callbacks.forEach(cb => cb()); return result;
    },
  });
  const source = readFileSync(new URL('../apps/wecost/js/wedding-funds-store.mjs', import.meta.url), 'utf8').replace(/^import\s[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + ';this.api={subscribeWeddingFunds,saveWeddingFinance};', context);
  context.api.subscribeWeddingFunds(() => {});
  return { api: context.api, docs, cleanups, get writes() { return writes; }, fail: () => { fail = true; }, retire: () => { retire = true; } };
}
test('store commits parent, plan, funds and immutable audits atomically; retry does not duplicate writes', async () => {
  const e = storeEnv(); await Promise.resolve();
  assert.equal(e.writes, 0);
  const input = { kind: 'travel', plan, payments };
  await e.api.saveWeddingFinance(input, original(), 'operation-test-1');
  assert.equal(e.docs.get('wecost_items/test-trip').planned, 700000);
  assert.equal([...e.docs.keys()].filter(key => key.startsWith('wecost_items/')).length, 1);
  assert.equal(e.docs.get('wecost_settings/wedding_funds_log_operation-test-1').before.item.memo, item.memo);
  assert.ok([...e.docs.keys()].some(key => key.startsWith('itineraries/honeymoon_2027_budget_log_')));
  const count = e.writes;
  await e.api.saveWeddingFinance(input, original(), 'operation-test-1');
  assert.equal(e.writes, count);
  await assert.rejects(e.api.saveWeddingFinance({ ...input, payments: payments.map(p => ({ ...p, actual: 0 })) }, original(), 'operation-test-1'), /같은 저장/);
});
test('failed commit and member change preserve all documents; stale snapshot cannot overwrite another edit', async () => {
  for (const mode of ['fail', 'retire', 'conflict']) {
    const e = storeEnv(); await Promise.resolve();
    if (mode === 'conflict') e.docs.get('wecost_settings/wedding_funds').cashKrw++;
    else e[mode]();
    const before = structuredClone([...e.docs]);
    await assert.rejects(e.api.saveWeddingFinance({ kind: 'travel', plan, payments }, original(), `operation-${mode}`));
    assert.deepEqual([...e.docs], before); assert.equal(e.writes, 0);
  }
});
