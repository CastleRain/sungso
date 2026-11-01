import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as core from '../apps/wecost/js/fixed-costs-core.mjs';
const require = createRequire(new URL('../apps/sohee/sales/package.json',import.meta.url));
const {JSDOM} = require('jsdom');
const catalog = JSON.parse(readFileSync(new URL('../apps/wecost/assets/fixed-cost-icons/catalog.json',import.meta.url)));
const source = readFileSync(new URL('../apps/wecost/js/tab-fixed-costs.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const tick = () => new Promise(resolve => setImmediate(resolve));
const fixture = (fields = {}) => ({...core.emptyCost(),id:'phone',name:'통신비',category:'communication',amount:55000,day:5,...fields});
async function env(items = []) {
  const dom = new JSDOM('<div data-private-root><div id="tab-fixed"></div></div>',{url:'http://example.test',pretendToBeVisual:true});
  const w = dom.window,cleanup = [],calls = []; let next,fail = false;
  w.HTMLDialogElement.prototype.showModal = function() {this.open = true;};
  w.HTMLDialogElement.prototype.close = function() {this.open = false;};
  const context = vm.createContext({...core,window:w,document:w.document,FormData:w.FormData,crypto:{randomUUID:() => 'fixture-id'},structuredClone,fetch:async () => ({ok:true,json:async () => catalog}),registerPrivateCleanup:fn => cleanup.push(fn),mountWeddingCalendar:() => null,
    fixedCostsStore:{subscribe(fn) {next = fn;fn({items,fromCache:false,pending:false});return () => {};},async save(command,operation) {calls.push({command,operation});if (fail) throw Error('합성 저장 실패');}}});
  vm.runInContext(source + ';registerFixedCostsHandlers();',context); await tick();
  const doc = w.document, click = selector => doc.querySelector(selector).click();
  const input = (name,value) => {const el = doc.querySelector(`[name="${name}"]`);el.value = value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  return {doc,w,calls,click,input,fail:v => fail=v,emit:items => next({items,fromCache:false}),retire:() => cleanup.forEach(fn => fn())};
}
test('owner preview is capped at five, totals use every item and full drawer can find the twelfth item',async () => {
  const e = await env(Array.from({length:12},(_,i) => fixture({id:`id${i}`,name:`통신비 ${i+1}`,amount:10000+i})));
  assert.equal(e.doc.querySelectorAll('#tab-fixed .fc-cost-row').length,5);
  assert.match(e.doc.querySelector('.fc-total').textContent,/120,066원/);
  e.click('[data-fc-list="sungwoo"]'); assert.equal(e.doc.querySelectorAll('#fc-full-list .fc-cost-row').length,12);
  const search = e.doc.querySelector('#fc-list-search'); search.value = '통신비 12';search.dispatchEvent(new e.w.Event('input',{bubbles:true}));
  assert.equal(e.doc.querySelectorAll('#fc-full-list .fc-cost-row').length,1);
  assert.match(e.doc.querySelector('.fc-drawer-head p').textContent,/120,066원/);
});
test('144-icon picker supports search, explicit selection persists after rename/category, draft closes only after discard',async () => {
  const e = await env(); e.click('[data-fc-action="add"]'); e.input('name','넷플릭스'); e.input('amount','55000');
  e.click('[data-fc-action="icons"]'); e.click('[data-fc-icon-mode="all"]');
  assert.equal(e.doc.querySelectorAll('[data-fc-icon]').length,144);
  const search = e.doc.querySelector('#fc-icon-search'); search.value = '헬스'; search.dispatchEvent(new e.w.Event('input',{bubbles:true}));
  e.click('[data-fc-icon="dumbbell"]'); e.input('name','새 이름'); e.input('category','food');
  assert.match(e.doc.querySelector('#fc-selected-icon img').src,/dumbbell.svg$/);
  assert.equal(e.doc.querySelector('[name="amount"]').value,'55,000');
  e.click('[data-fc-action="close"]'); assert.ok(e.doc.querySelector('#fc-discard'));
  e.click('[data-fc-action="keep"]'); assert.ok(e.doc.querySelector('#fc-drawer').open);
  e.click('[data-fc-action="close"]');e.click('[data-fc-action="discard"]'); assert.equal(e.doc.querySelector('#fc-drawer').open,false);assert.equal(e.calls.length,0);
});
test('annual payment preview, failed save/retry and return to filtered list preserve the entry',async () => {
  const e = await env([fixture()]);e.click('[data-fc-list="sungwoo"]');e.click('#fc-full-list [data-fc-edit="phone"]');
  e.input('frequency','yearly');e.input('month','11');e.input('amount','120000');
  assert.match(e.doc.querySelector('#fc-form-preview').textContent,/10,000원/);
  assert.match(e.doc.querySelector('#fc-form-preview').textContent,/120,000원/);
  e.fail(true);e.doc.querySelector('#fc-edit-form').dispatchEvent(new e.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.match(e.doc.querySelector('#fc-form-error').textContent,/입력 내용은 유지/);assert.equal(e.doc.querySelector('[name="amount"]').value,'120000');
  e.fail(false);e.doc.querySelector('#fc-edit-form').dispatchEvent(new e.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.equal(e.calls[0].operation,e.calls[1].operation);assert.ok(e.doc.querySelector('#fc-full-list'));assert.equal(e.calls[1].command.values.frequency,'yearly');
});
test('remote updates preserve local drafts; explicit reload and auth cleanup work',async () => {
  const e = await env([fixture()]);e.click('[data-fc-edit="phone"]');e.input('amount','60000');
  e.emit([fixture({amount:70000})]);assert.equal(e.doc.querySelector('[name="amount"]').value,'60000');
  assert.equal(e.doc.querySelector('#fc-remote').hidden,false);
  e.click('[data-fc-action="reload-item"]');e.click('[data-fc-action="discard"]');assert.equal(e.doc.querySelector('[name="amount"]').value,'70,000');
  e.retire();assert.equal(e.doc.querySelector('#fc-drawer'),null);assert.equal(e.doc.querySelector('#tab-fixed').textContent,'');
});
test('opening a clean form does not create a draft; unknown withdrawal day saves as null instead of zero',async () => {
  const e = await env(); e.click('[data-fc-action="add"]');e.click('[data-fc-action="icons"]');e.click('[data-fc-action="editor"]');e.click('[data-fc-action="close"]');
  assert.equal(e.doc.querySelector('#fc-discard'),null);assert.equal(e.doc.querySelector('#fc-drawer').open,false);
  e.click('[data-fc-action="add"]');e.input('name','날짜 미정');e.input('amount','0');
  e.doc.querySelector('#fc-edit-form').dispatchEvent(new e.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.equal(e.calls.length,1);assert.equal(e.calls[0].command.values.day,null);assert.equal(e.calls[0].command.values.amount,0);
});
test('custom month picker changes the viewed month without saving, supports year navigation and Escape',async () => {
  const e = await env([fixture({startDate:'2027-01-01'})]);
  let picker = e.doc.querySelector('#fc-month-picker'); picker.open = true;
  e.click('[data-fc-year]');
  const value = e.doc.querySelector('[data-fc-month]').dataset.fcMonth;
  e.click('[data-fc-month]');
  assert.match(e.doc.querySelector('#fc-month-picker summary').textContent,new RegExp(value.slice(0,4)+'년 1월'));
  assert.equal(e.calls.length,0); assert.equal(e.doc.querySelector('input[type="month"]'),null);
  picker = e.doc.querySelector('#fc-month-picker'); picker.open = true;
  const month = picker.querySelector('[data-fc-month]');month.focus();
  month.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
  assert.equal(e.doc.activeElement.textContent,'2월');
  e.doc.activeElement.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.equal(picker.open,false);assert.equal(e.doc.activeElement,picker.querySelector('summary'));
});
test('recurring calendar buttons retain day/month on edit and save, Escape closes only the picker',async () => {
  const e = await env();e.click('[data-fc-action="add"]');e.input('name','연간 구독');e.input('amount','120000');e.input('frequency','yearly');
  let picker = e.doc.querySelector('[data-fc-recurring="month"]');picker.open = true;
  e.click('[data-fc-recurring="month"] [data-fc-recurring-value="2"]');
  picker = e.doc.querySelector('[data-fc-recurring="day"]');picker.open = true;
  e.click('[data-fc-recurring="day"] [data-fc-recurring-value="31"]');
  assert.equal(e.doc.querySelector('#fc-day-value').textContent,'31일');assert.equal(e.doc.querySelector('#fc-month-value').textContent,'2월');
  picker.open = true;picker.querySelector('summary').dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.equal(picker.open,false);assert.ok(e.doc.querySelector('#fc-drawer').open);assert.equal(e.doc.querySelector('#fc-discard'),null);
  e.doc.querySelector('#fc-edit-form').dispatchEvent(new e.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.equal(e.calls[0].command.values.day,31);assert.equal(e.calls[0].command.values.month,2);
});
