import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { formatAreaPair } from '../js/display-format.mjs';
import { normalizeTransaction } from '../js/market-core.mjs';

const source = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
function actualFunction(name) {
  const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} exists in the application`);
  return match[0];
}

const monthIndex = month => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
const range = (months, endMonth = '2026-09') => {
  const start = monthIndex(endMonth) - months + 1;
  return { months, endMonth, rangeEnd: endMonth,
    rangeStart: `${Math.floor(start / 12)}-${String(start % 12 + 1).padStart(2, '0')}`,
    includesCurrentMonth: endMonth === '2026-09' };
};
const trade = (id, changes = {}) => normalizeTransaction({
  id, apartmentName: '검증 단지', regionCode: '41171', dealType: '매매',
  month: '2026-07', day: 1, areaM2: 59.9, amountManWon: 50000, ...changes,
});

function harness(records, { current = '84.7', dealType = '매매', loadedRange = range(60) } = {}) {
  const select = {
    value: current, disabled: true, options: [],
    replaceChildren(...options) {
      this.options = options;
      this.value = options[0]?.value || '';
    },
  };
  const state = { complexRecords: records, complexHistoryMonths: 12,
    complexMeta: { ...range(12), effectiveHistoryMonths: 12, loadedHistoryRange: loadedRange } };
  const sandbox = {
    state, formatAreaPair, seoulCurrentMonth: () => '2026-09',
    monthFromIndexValue: index => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`,
    $: selector => selector === '#complexAreaBand' ? select : { value: dealType },
    createElement: (tag, className, textContent) => ({ tag, className, textContent, value: '' }),
  };
  vm.createContext(sandbox);
  for (const name of ['historyMonthIndex', 'buildHistoryRange', 'historyRangeFromPayload', 'populateComplexAreas']) {
    vm.runInContext(actualFunction(name), sandbox);
  }
  return { select, state, run: () => sandbox.populateComplexAreas() };
}

test('narrowing to one year preserves the selected area from five-year history and labels its zero visible trades', () => {
  const ui = harness([
    trade('old-selected', { month: '2023-06', areaM2: 84.74 }),
    trade('recent-other'), trade('recent-other-2'),
    trade('old-unselected', { month: '2024-04', areaM2: 101.1 }),
  ]);
  const before = JSON.stringify(ui.state);
  ui.run();
  assert.equal(ui.select.value, '84.7');
  assert.deepEqual(ui.select.options.map(option => option.value), ['59.9', '84.7']);
  assert.match(ui.select.options[1].textContent, /선택 기간 0건 · 이전 거래 있음/);
  assert.match(ui.select.options[0].textContent, /2건$/);
  assert.equal(JSON.stringify(ui.state), before, 'Changing options must not rewrite loaded records or metadata');
  ui.run();
  assert.equal(ui.select.value, '84.7', 'Repeated rendering keeps the previous selected area');
});

test('the selected historic area remains available even when no area traded in the display period', () => {
  const ui = harness([trade('old-selected', { month: '2023-06', areaM2: 84.7 })]);
  ui.run();
  assert.equal(ui.select.value, '84.7');
  assert.equal(ui.select.options.length, 1);
  assert.match(ui.select.options[0].textContent, /이전 거래 있음/);
});

test('historic contracts for another deal type cannot preserve the selected area', () => {
  const ui = harness([
    trade('old-rental', { month: '2023-06', areaM2: 84.7, dealType: '전세', depositManWon: 30000 }),
    trade('current-sale'),
  ]);
  ui.run();
  assert.equal(ui.select.value, '59.9');
  assert.deepEqual(ui.select.options.map(option => option.value), ['59.9']);
});

test('outside-coverage, malformed-month and future contracts cannot preserve an unobserved selected area', async t => {
  const cases = [
    ['before loaded coverage', trade('old', { month: '2021-09', areaM2: 84.7 })],
    ['after loaded coverage', trade('future', { month: '2026-10', areaM2: 84.7 })],
    ['future label with misleading historical index', { ...trade('future-index', { month: '2026-10', areaM2: 84.7 }), monthIndex: monthIndex('2023-05') }],
    ['malformed date label', { ...trade('bad-month', { areaM2: 84.7 }), month: '2026-13', monthIndex: monthIndex('2023-05') }],
  ];
  for (const [name, record] of cases) await t.test(name, () => {
    const ui = harness([record, trade('current-other')]);
    ui.run();
    assert.equal(ui.select.value, '59.9');
    assert.deepEqual(ui.select.options.map(option => option.value), ['59.9']);
  });
});

test('an invalid loaded range cannot assert that older records are available', () => {
  const ui = harness([trade('old-selected', { month: '2023-06', areaM2: 84.7 }), trade('current-other')], {
    loadedRange: { ...range(60), rangeStart: '2020-01' },
  });
  ui.run();
  assert.equal(ui.select.value, '59.9');
  assert.deepEqual(ui.select.options.map(option => option.value), ['59.9']);
});

test('normal current-period selection and the empty deal-type message retain their existing behavior', () => {
  const ui = harness([trade('selected', { areaM2: 84.7 }), trade('other')]);
  ui.run();
  assert.equal(ui.select.value, '84.7');
  assert.match(ui.select.options[1].textContent, /1건$/);
  assert.doesNotMatch(ui.select.options[1].textContent, /이전 거래/);
  const empty = harness([trade('sale')], { dealType: '전세' });
  empty.run();
  assert.equal(empty.select.value, '');
  assert.equal(empty.select.options[0].textContent, '전세 거래 없음');
});
