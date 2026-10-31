import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as core from '../apps/wecost/js/wedding-funds-core.mjs';
import * as travel from '../shared/finance/travel-budget-core.mjs';
import { dollarValuation, quoteIsOld } from '../apps/wecost/js/wedding-fx.mjs';
const require = createRequire(new URL('../apps/sohee/sales/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const today = '2026-10-31';
function env(quote = { rate: 1200, asOf: Date.parse('2026-10-31T00:00:00Z'), nextAt: Date.parse('2026-11-01T00:00:00Z') }) {
  const dom = new JSDOM('<body><div data-private-root><div id="s-total"></div></div></body>');
  const w = dom.window, cleanups = [], writes = [], alerts = [];
  let receive, fail = false, renders = 0, rateChange, rateDisposed = false;
  const fx = { quote, loading: false, error: '' };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.alert = text => alerts.push(text);
  w.scrollTo = () => {};
  const item = { id: 'sample', name: '합성 예식 비용', cat: '웨딩홀', planned: 800000, deposit: 100000, actual: 0 };
  const ledger = { items: [item] };
  const data = { connection: 'live', error: '', funds: { cashKrw: 250000, usdBalance: 300, usdCostKrw: 360000 }, plan: null };
  const c = vm.createContext({ ...core, ...travel, dollarValuation, quoteIsOld, createFxReader: ({ onChange }) => { rateChange = onChange; return { snapshot: () => fx, dispose() { rateDisposed = true; }, refresh: async () => onChange(fx) }; }, document: w.document, window: w, structuredClone, crypto: { randomUUID: () => 'synthetic-operation' }, localDate: () => today,
    mountWeddingCalendar: () => null,
    registerPrivateCleanup: fn => cleanups.push(fn), subscribeWeddingFunds: fn => { receive = fn; fn(structuredClone(data)); },
    saveWeddingFinance: async (...args) => { if (fail) throw Error('합성 저장 실패'); writes.push(args); },
  });
  const source = readFileSync(new URL('../apps/wecost/js/wedding-funds-ui.mjs', import.meta.url), 'utf8').replace(/^import\s[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + ';this.api={registerWeddingFinance,handleWeddingFinance,weddingFundsHTML,weddingFundingCard,weddingDisplayItems,weddingTravelActions,weddingTravelAdd,weddingForeignAmount,weddingForeignNote,weddingRateHint,weddingFxHTML,weddingForeignRemaining,withWeddingDetails,ensureWeddingFx};', c);
  c.api.registerWeddingFinance(() => ledger, () => { renders++; });
  const open = (action, id = 'sample', row = '') => c.api.handleWeddingFinance({ dataset: { finance: action, id, row } });
  const set = (id, value) => { w.document.getElementById(id).value = value; w.document.getElementById(id).dispatchEvent(new w.Event('input', { bubbles: true })); };
  const submit = async () => { w.document.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await new Promise(resolve => setImmediate(resolve)); };
  return { dom, w, d: w.document, c, data, ledger, writes, alerts, cleanups, open, set, submit, receive, rateChange, rateDisposed: () => rateDisposed, renders: () => renders, fail: v => { fail = v; } };
}
test('fund editor previews balances without writing, retains failed draft and cleans private data', async () => {
  const e = env(); e.open('funds');
  assert.equal(e.d.querySelector('#wf-cash').value, '250000');
  e.set('wf-cash', '300000');
  assert.match(e.d.querySelector('#wf-preview').textContent, /4만원/);
  assert.equal(e.writes.length, 0);
  e.fail(true); await e.submit();
  assert.equal(e.d.querySelector('#wf-dialog').open, true);
  assert.match(e.d.querySelector('#wf-error').textContent, /저장 실패/);
  assert.equal(e.d.querySelector('#wf-cash').value, '300000');
  e.fail(false); await e.submit();
  assert.equal(e.writes[0][0].balances.cashKrw, 300000);
  assert.equal(e.d.querySelector('#wf-dialog').open, false);
  e.cleanups.forEach(fn => fn());
  assert.equal(e.d.querySelector('#wf-dialog'), null);
  e.dom.window.close();
});
test('payments require explicit source, currency change clears amount, and refund does not silently spend USD', async () => {
  const e = env(); e.open('payment'); e.set('wf-payment', '50000'); await e.submit();
  assert.equal(e.writes.length, 0); assert.match(e.d.querySelector('#wf-error').textContent, /자금을 선택/);
  e.d.querySelector('[name=source][value=cash]').click(); e.set('wf-payment', '50000');
  assert.match(e.d.querySelector('#wf-preview').textContent, /원화 20만원/);
  e.d.querySelector('[name=source][value=usd]').click();
  assert.equal(e.d.querySelector('#wf-payment').value, '');
  e.set('wf-payment', '10'); assert.match(e.d.querySelector('#wf-preview').textContent, /12,000원/);
  e.d.querySelector('[name=direction][value=refund]').click();
  assert.equal(e.d.querySelector('[name=source][value=usd]').disabled, true);
  assert.equal(e.d.querySelector('[name=source]:checked'), null);
  e.d.querySelector('[name=source][value=cash]').click(); e.set('wf-payment', '10000'); await e.submit();
  assert.equal(e.writes[0][0].direction, 'refund'); assert.equal(e.writes[0][0].component, 'deposit');
  e.dom.window.close();
});
test('travel form preserves row IDs and payment mapping, adds a row without writing, escapes untrusted names', async () => {
  const e = env();
  e.ledger.items[0] = { ...e.ledger.items[0], cat: travel.TRAVEL_CATEGORY, name: '<img src=x onerror=alert(1)>' };
  e.open('travel');
  assert.equal(e.d.querySelector('[data-key=deposit]').value, '100000');
  e.d.querySelector('[data-add-row]').click();
  assert.equal(e.d.querySelectorAll('[data-row-index]').length, 2); assert.equal(e.writes.length, 0);
  const row = e.d.querySelector('[data-row-index="1"]');
  row.querySelector('[data-key=name]').value = '합성 추가'; row.querySelector('[data-key=amount]').value = '10000';
  await e.submit(); assert.equal(e.writes[0][0].plan.rows.length, 2); assert.equal(e.writes[0][0].payments[0].deposit, 100000);
  e.open('payment'); assert.equal(e.d.querySelector('img'), null); e.dom.window.close();
});

test('reference valuation updates the total and savings goal together without changing the wallet or DB', () => {
  const quote = { rate: 1300, asOf: Date.parse('2026-10-31T00:00:00Z'), nextAt: Date.parse('2026-11-01T00:00:00Z') };
  const e = env(quote), before = structuredClone(e.data), goal = e.c.api.weddingFundingCard(e.ledger.items);
  e.d.querySelector('[data-private-root]').innerHTML = e.c.api.weddingFxHTML() + e.c.api.weddingFundsHTML() + goal;
  const funds = e.d.querySelector('.wf-funds'), label = funds.querySelector('.wf-funds-title'), renders = e.renders();
  assert.match(funds.textContent, /약 39만원/); assert.doesNotMatch(funds.textContent, /환전 원가/);
  assert.match(e.d.querySelector('#wf-fx-panel').textContent, /2026.*10.*31.*09:00.*KST/);
  e.rateChange({ quote: { ...quote, rate: 1100 }, loading: false, error: '최신 조회 실패' });
  assert.match(funds.textContent, /약 33만원/); assert.doesNotMatch(funds.textContent, /환전 원가/);
  assert.match(e.d.querySelector('#wf-fx-panel').textContent, /최신 조회 실패/);
  assert.equal(e.d.querySelector('.wf-funds-title'), label); assert.equal(e.renders(), renders);
  assert.notEqual(e.c.api.weddingFundingCard(e.ledger.items), goal); assert.match(e.d.querySelector('#wf-current-total').textContent, /58만원/); assert.match(e.d.querySelector('#s-funding-gap').textContent, /12만원/); assert.deepEqual(e.data, before); assert.equal(e.writes.length, 0);
  e.open('refresh-fx'); assert.match(funds.textContent, /약 39만원/); assert.equal(e.writes.length, 0);
  e.cleanups.forEach(fn => fn()); assert.equal(e.rateDisposed(), true);
  e.dom.window.close();
});

function addDetailedTrip(e) {
  e.ledger.items[0] = { ...e.ledger.items[0], cat: travel.TRAVEL_CATEGORY, name: '합성 여행', planned: 400000, memo: '기존 전체 메모' };
  e.data.plan = { linkedItemId: 'sample', baselineTotal: 400000, availableCash: null, fxRate: 1200, note: '기존 예산 메모', rows: [
    { id: 'one', name: '합성 숙소', currency: 'KRW', amount: 200000, note: '숙소 메모' },
    { id: 'two', name: '합성 항공', currency: 'KRW', amount: 200000, note: '항공 메모' },
  ] };
  e.data.funds.travel = { linkedItemId: 'sample', payments: [{ id: 'one', deposit: 100000, actual: 0 }, { id: 'two', deposit: 0, actual: 0 }] };
  e.receive(structuredClone(e.data));
}

test('a direct travel-row edit shows one item and preserves every sibling, payment and original memo on save', async () => {
  const e = env(); addDetailedTrip(e);
  const rows = e.c.api.weddingDisplayItems(e.ledger.items);
  assert.equal(rows.length, 2); assert.match(e.c.api.weddingTravelActions(rows[1]), /data-row="two"/);
  e.open('travel-row', 'sample', 'two');
  assert.equal(e.d.querySelectorAll('[data-row-index]').length, 1);
  assert.equal(e.d.querySelector('[data-key=name]').value, '합성 항공');
  e.d.querySelector('[data-key=amount]').value = '300000';
  e.fail(true); await e.submit(); assert.equal(e.writes.length, 0);
  assert.equal(e.d.querySelector('[data-key=amount]').value, '300000');
  e.fail(false); await e.submit();
  const change = e.writes[0][0];
  assert.equal(change.plan.rows[1].amount, 300000);
  assert.deepEqual(travel.normalizeBudgetDraft(change.plan).rows[0], e.data.plan.rows[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(change.payments)), e.data.funds.travel.payments);
  assert.equal(change.plan.note, '기존 예산 메모'); assert.equal(change.ledgerMemo, '기존 전체 메모');
  e.open('payment', 'sample', 'two'); assert.equal(e.d.querySelector('#wf-target').value, 'two');
  e.dom.window.close();
});

test('category add opens one blank travel item and appends it without copying the parent expense', async () => {
  const e = env(); addDetailedTrip(e);
  assert.match(e.c.api.weddingTravelAdd(travel.TRAVEL_CATEGORY), /data-finance="travel-add"/);
  e.open('travel-add');
  assert.equal(e.d.querySelectorAll('[data-row-index]').length, 1); assert.equal(e.writes.length, 0);
  e.d.querySelector('[data-key=name]').value = '합성 이동'; e.d.querySelector('[data-key=amount]').value = '50000';
  await e.submit(); const change = e.writes[0][0];
  assert.equal(change.plan.rows.length, 3); assert.equal(change.payments.length, 3);
  assert.equal(change.plan.rows[2].name, '합성 이동');
  assert.deepEqual(travel.normalizeBudgetDraft(change.plan).rows.slice(0, 2), e.data.plan.rows);
  assert.equal(change.payments[2].actual, 0); assert.equal(change.payments[2].deposit, 0);
  e.dom.window.close();
});

test('no rate shows an unknown current total and savings goal instead of the historical cost', () => {
  const e = env(null);
  e.d.querySelector('[data-private-root]').innerHTML = e.c.api.weddingFundsHTML() + e.c.api.weddingFundingCard(e.ledger.items);
  assert.equal(e.d.querySelector('#wf-current-total strong').textContent, '—');
  assert.equal(e.d.querySelector('#s-funding-gap').textContent, '—');
  assert.match(e.d.querySelector('#wf-usd-current').textContent, /환산 확인 전/);
  assert.doesNotMatch(e.d.querySelector('.wf-funds').textContent, /환전 원가/);
  e.dom.window.close();
});

test('USD prices keep the native amount and booked budget while every visible reference updates in place', () => {
  const e = env(), item = { travelRowId: 'usd-stay', currency: 'USD', nativeAmount: 500, planned: 650000 };
  const before = structuredClone(e.data);
  e.d.querySelector('[data-private-root]').innerHTML = e.c.api.weddingForeignAmount(item) + e.c.api.weddingForeignAmount(item);
  const originals = [...e.d.querySelectorAll('.wed-foreign-amount strong')];
  assert.equal(originals[0].textContent, 'US$500');
  assert.match(e.d.body.textContent, /약 60만원/); assert.doesNotMatch(e.d.body.textContent, /장부 예산/);
  e.rateChange({ quote: { rate: 1300, asOf: Date.parse('2026-10-31T00:00:00Z'), nextAt: Date.parse('2026-11-01T00:00:00Z') }, loading: false, error: '' });
  for (const node of e.d.querySelectorAll('[data-wed-usd-reference]')) {
    assert.match(node.textContent, /약 65만원/); assert.match(node.firstElementChild.title, /650,000원.*KST/);
  }
  assert.equal(e.d.querySelector('.wed-foreign-amount strong'), originals[0]);
  assert.equal(originals[0].textContent, 'US$500'); assert.equal(item.planned, 650000);
  assert.deepEqual(e.data, before); assert.equal(e.writes.length, 0);
  assert.equal(e.c.api.weddingForeignAmount({ ...item, currency: 'KRW' }), '');
  assert.equal(e.c.api.weddingForeignAmount({ ...item, nativeAmount: '<script>' }), '');
  e.rateChange({ quote: null, loading: false, error: 'offline' });
  assert.match(e.d.body.textContent, /원화 환산 조회 실패/); assert.doesNotMatch(e.d.body.textContent, /약 0원/);
  assert.match(e.d.body.textContent, /US\$500/);
  e.dom.window.close();
});

test('USD cost valuation still loads without a registered USD wallet', () => {
  const e = env(); e.data.funds = null;
  e.data.plan = { rows: [{ currency: 'USD', amount: 500 }] }; e.receive(e.data);
  e.d.querySelector('[data-private-root]').innerHTML = e.c.api.weddingForeignAmount({ travelRowId: 'usd-stay', currency: 'USD', nativeAmount: 500, planned: 650000 });
  e.rateChange({ quote: null, loading: true, error: '' });
  assert.match(e.d.body.textContent, /원화 환산 확인 중/);
  e.c.api.ensureWeddingFx(); assert.match(e.d.body.textContent, /약 60만원/);
  assert.equal(e.writes.length, 0); e.dom.window.close();
});

test('a changed quote re-renders forecasts once and an explicit USD edit saves that rate while preserving payments', async () => {
  const e = env(); addDetailedTrip(e);
  e.data.plan.rows[0] = { ...e.data.plan.rows[0], currency: 'USD', amount: 500 };
  e.ledger.items[0].planned = 800000; e.data.plan.baselineTotal = 800000; e.receive(e.data);
  const before = structuredClone(e.data), count = e.renders();
  e.rateChange({ quote: { rate: 1300, asOf: Date.parse('2026-10-31T00:00:00Z'), nextAt: Date.parse('2026-11-01T00:00:00Z') }, loading: false, error: '' });
  assert.equal(e.renders(), count + 1);
  assert.equal(e.c.api.weddingDisplayItems(e.ledger.items)[0].planned, 650000);
  assert.match(e.c.api.weddingFundingCard(e.ledger.items), /11만원/);
  assert.deepEqual(e.data, before); assert.equal(e.writes.length, 0);
  e.open('travel-row', 'sample', 'one');
  assert.equal(e.d.querySelector('#wf-fx').value, '1300'); assert.equal(e.d.querySelector('#wf-fx').readOnly, true);
  assert.match(e.d.querySelector('#wf-preview').textContent, /예정 65만원.*지급 10만원.*잔금 US\$423.08.*55만원/);
  await e.submit(); assert.equal(e.writes[0][0].plan.fxRate, 1300);
  assert.deepEqual(JSON.parse(JSON.stringify(e.writes[0][0].payments)), before.funds.travel.payments);
  e.dom.window.close();
});

test('USD editor accepts dollar-paid totals separately, previews the native remainder, and preserves them on later edits', async () => {
  const e = env(); addDetailedTrip(e);
  e.data.plan.rows[0] = { ...e.data.plan.rows[0], currency: 'USD', amount: 500 };
  e.ledger.items[0].planned = 800000; e.data.plan.baselineTotal = 800000; e.receive(e.data);
  e.open('travel-row', 'sample', 'one');
  const native = e.d.querySelector('[data-key=usdPaid]');
  assert.equal(native.closest('.wf-usd-payment').hidden, false); native.value = '200'; native.dispatchEvent(new e.w.Event('input', { bubbles: true }));
  assert.match(e.d.querySelector('#wf-preview').textContent, /잔금 US\$216.67.*26만원/);
  await e.submit(); const command = e.writes[0][0];
  assert.equal(command.payments[0].usdPaid, 200); assert.equal(command.payments[0].usdPaidKrw, 240000);
  assert.equal(command.payments[0].actual, 240000); assert.equal(command.payments[0].deposit, 100000);
  assert.deepEqual(JSON.parse(JSON.stringify(command.payments[1])), e.data.funds.travel.payments[1]);
  const before = { item: e.ledger.items[0], plan: e.data.plan, funds: e.data.funds }, saved = core.buildFundingChange(before, command, before, today);
  e.ledger.items[0] = { ...before.item, ...saved.itemPatch }; e.data.plan = saved.plan; e.data.funds = saved.funds; e.receive(e.data);
  e.rateChange({ quote: { rate: 1500, asOf: Date.parse('2026-11-01T00:00:00Z') }, loading: false, error: '' });
  const projected = e.c.api.weddingDisplayItems(e.ledger.items)[0];
  assert.equal(projected.balance, 350000); assert.match(e.c.api.weddingForeignRemaining(projected), /US\$233.33/);
  e.open('travel-row', 'sample', 'one'); assert.equal(e.d.querySelector('[data-key=usdPaid]').value, '200'); assert.equal(e.d.querySelector('[data-key=actual]').value, '0');
  await e.submit(); assert.equal(e.writes[1][0].payments[0].usdPaidKrw, 240000);
  assert.equal(e.data.funds.usdBalance, 300); assert.equal(e.data.funds.cashKrw, 250000); e.dom.window.close();
});
