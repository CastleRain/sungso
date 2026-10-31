import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as core from '../apps/wecost/js/wedding-funds-core.mjs';
import * as travel from '../shared/finance/travel-budget-core.mjs';
const require = createRequire(new URL('../apps/sohee/sales/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const today = '2026-10-31';
function env() {
  const dom = new JSDOM('<body><div data-private-root><div id="s-total"></div></div></body>');
  const w = dom.window, cleanups = [], writes = [], alerts = [];
  let receive, fail = false, renders = 0;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.alert = text => alerts.push(text);
  const item = { id: 'sample', name: '합성 예식 비용', cat: '웨딩홀', planned: 800000, deposit: 100000, actual: 0 };
  const ledger = { items: [item] };
  const data = { connection: 'live', error: '', funds: { cashKrw: 250000, usdBalance: 300, usdCostKrw: 360000 }, plan: null };
  const c = vm.createContext({ ...core, ...travel, document: w.document, window: w, structuredClone, crypto: { randomUUID: () => 'synthetic-operation' }, localDate: () => today,
    registerPrivateCleanup: fn => cleanups.push(fn), subscribeWeddingFunds: fn => { receive = fn; fn(structuredClone(data)); },
    saveWeddingFinance: async (...args) => { if (fail) throw Error('합성 저장 실패'); writes.push(args); },
  });
  const source = readFileSync(new URL('../apps/wecost/js/wedding-funds-ui.mjs', import.meta.url), 'utf8').replace(/^import\s[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + ';this.api={registerWeddingFinance,handleWeddingFinance,weddingFundsHTML,weddingFundingCard,weddingTravelDetails};', c);
  c.api.registerWeddingFinance(() => ledger, () => { renders++; });
  const open = (action, id = 'sample', row = '') => c.api.handleWeddingFinance({ dataset: { finance: action, id, row } });
  const set = (id, value) => { w.document.getElementById(id).value = value; w.document.getElementById(id).dispatchEvent(new w.Event('input', { bubbles: true })); };
  const submit = async () => { w.document.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await new Promise(resolve => setImmediate(resolve)); };
  return { dom, w, d: w.document, c, data, ledger, writes, alerts, cleanups, open, set, submit, receive, fail: v => { fail = v; } };
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
