import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makePlanningState, cashAfterWedding } from '../apps/wecost/js/planning-core.mjs';
import { weddingBudgetSummary, isBudgetIncluded, validateWeddingBudget } from '../apps/wecost/js/wedding-budget-core.mjs';
import { categoryLabel, weddingCategory } from '../apps/wecost/js/wedding-core.mjs';
const require = createRequire(new URL('../apps/sohee/sales/package.json', import.meta.url));
const { JSDOM } = require('jsdom');

function setup({ unknown = false } = {}) {
  const w = new JSDOM('<body><div data-private-root><button data-wedding-budget="">예산 범위</button></div></body>').window;
  const raw = {
    settings: { weddingDate: '2027-03-06', weddingBudget: { excludedIds: [], incomes: [] } },
    savings: { soheeCurrent: 20000000 },
    items: [{ id: 'venue', name: '예식장', cat: '🏰웨딩홀', planned: 10000000, deposit: 1000000, actual: 2000000 }],
    loans: [], adjustments: [{ name: '이사', amount: 500000, sign: '-' }],
  };
  const state = { ...raw, ...makePlanningState(raw, unknown ? {} : { funds: { cashKrw: 2000000, usdBalance: 0, usdCostKrw: 0 } }, new Date(2026, 10, 1)) };
  let writes = 0;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  const context = vm.createContext({ document: w.document, window: w, structuredClone,
    weddingBudgetSummary, isBudgetIncluded, validateWeddingBudget, cashAfterWedding, categoryLabel, weddingCategory,
    registerPrivateCleanup: () => {}, planningHistory: async () => [], planningOperationId: () => 'preview-only',
    mountWeddingCalendar: () => null, savePlanning: async () => { writes++; },
  });
  for (const file of ['planning-ui.mjs', 'wedding-budget-ui.mjs']) {
    const source = readFileSync(new URL(`../apps/wecost/js/${file}`, import.meta.url), 'utf8')
      .replace(/^import\s[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
    vm.runInContext(source, context);
  }
  context.initPlanningUI(() => {});
  context.registerWeddingBudget(() => state);
  const q = selector => w.document.querySelector(selector);
  q('[data-wedding-budget]').click();
  return { w, q, state, writes: () => writes };
}

test('budget dialog previews the same house funding gap and exclusions without writing', () => {
  const e = setup(), original = structuredClone(e.state.settings);
  assert.equal(e.state.netCash, 14500000);
  assert.match(e.q('#budget-preview').textContent, /추가로 모을 돈500만원/);
  assert.match(e.q('#budget-preview').textContent, /집 예상 현금 1,450만원/);
  e.q('[data-budget-id="venue"]').click();
  assert.match(e.q('#budget-preview').textContent, /추가로 모을 돈0원/);
  assert.match(e.q('#budget-preview').textContent, /집 예상 현금 1,950만원/);
  assert.deepEqual(e.state.settings, original);
  assert.equal(e.writes(), 0);
});

test('budget preview keeps missing wallet or included FX unknown', () => {
  const e = setup({ unknown: true });
  assert.match(e.q('#budget-preview').textContent, /추가로 모을 돈—/);
  assert.match(e.q('#budget-preview').textContent, /집 예상 현금 —/);
  const fx = setup();
  fx.state.displayItems[0].fxPending = true;
  fx.q('[data-budget-id="venue"]').dispatchEvent(new fx.w.Event('change', { bubbles: true }));
  assert.match(fx.q('#budget-preview').textContent, /추가로 모을 돈—/);
  assert.match(fx.q('#budget-preview').textContent, /집 예상 현금 —/);
  assert.equal(e.writes() + fx.writes(), 0);
});
