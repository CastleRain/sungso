import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarketOutlookContext } from '../js/market-outlook-context.mjs';

const monthIndex = (month) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
const raw = (id, changes = {}) => ({
  id, apartmentName: '검증 단지', aptSeq: '41171-test', regionCode: '41171', dong: '안양동',
  dealType: '매매', month: '2026-09', day: 1, areaM2: 84.7, amountManWon: 70000,
  ...changes,
});
const options = (changes = {}) => ({
  dealType: '매매', areaM2: 84.7, rangeStart: '2025-10', rangeEnd: '2026-09',
  loadedRangeStart: '2021-10', loadedRangeEnd: '2026-09', asOfMonthIndex: monthIndex('2026-09'),
  ...changes,
});

test('a one-year display retains five years of validated training observations without mutating input', () => {
  const records = Object.freeze([
    Object.freeze(raw('early', { month: '2021-10', amountManWon: 30000 })),
    Object.freeze(raw('middle', { month: '2023-05', amountManWon: 40000 })),
    Object.freeze(raw('current')),
    Object.freeze(raw('before-loaded', { month: '2021-09' })),
    Object.freeze(raw('future', { month: '2026-10', monthIndex: monthIndex('2026-09') })),
  ]);
  const before = JSON.stringify(records);
  const result = buildMarketOutlookContext(records, options());
  assert.deepEqual(result.records.map((record) => record.id), ['early', 'middle', 'current']);
  assert.deepEqual(result.series.map((row) => [row.month, row.averageTotal, row.count]), [
    ['2021-10', 30000, 1], ['2023-05', 40000, 1], ['2026-09', 70000, 1],
  ]);
  assert.deepEqual(result.trainingRange, { rangeStart: '2021-10', rangeEnd: '2026-09', months: 60 });
  assert.equal(result.series[0].averageP33, 30000 * 3.3 / 84.7);
  assert.equal(JSON.stringify(records), before);
  result.records[0].amountManWon = 1;
  assert.equal(records[0].amountManWon, 30000);
});

test('training clips future coverage and keeps at most sixty calendar months', () => {
  const result = buildMarketOutlookContext([
    raw('too-old', { month: '2020-01' }), raw('boundary', { month: '2021-10' }),
    raw('present'), raw('future', { month: '2026-10' }),
  ], options({ loadedRangeStart: '2020-01', loadedRangeEnd: '2027-02' }));
  assert.deepEqual(result.records.map((record) => record.id), ['boundary', 'present']);
  assert.equal(result.trainingRange.months, 60);
  assert.equal(result.trainingRange.rangeEnd, '2026-09');
});

test('nearby areas and other deal types never enter the selected exact-area reference', () => {
  const result = buildMarketOutlookContext([
    raw('same-a', { areaM2: 84.66, amountManWon: 60000 }),
    raw('same-b', { areaM2: 84.74, amountManWon: 80000 }),
    raw('nearby', { areaM2: 84.75, amountManWon: 300000 }),
    raw('smaller', { areaM2: 59.9, amountManWon: 40000 }),
    raw('jeonse', { dealType: '전세', depositManWon: 50000 }),
    raw('rent', { dealType: '월세', depositManWon: 10000, monthlyRentManWon: 100 }),
  ], options());
  assert.deepEqual(result.records.map((record) => record.id), ['same-a', 'same-b']);
  assert.equal(result.reference.latestAverageManWon, 70000);
  assert.equal(result.reference.recentCount, 2);
  assert.equal(result.series[0].count, 2);
});

test('latest actual month and recent calendar-quarter prices weight contracts, not monthly averages', () => {
  const result = buildMarketOutlookContext([
    raw('old', { month: '2026-06', amountManWon: 1000000 }),
    raw('july-a', { month: '2026-07', amountManWon: 40000 }),
    raw('july-b', { month: '2026-07', amountManWon: 60000 }),
    raw('august', { month: '2026-08', amountManWon: 80000 }),
  ], options());
  assert.deepEqual(result.reference, {
    latestMonth: '2026-08', latestAverageManWon: 80000, latestCount: 1,
    recentStartMonth: '2026-07', recentEndMonth: '2026-09', recentAverageManWon: 60000,
    recentMinManWon: 40000, recentMaxManWon: 80000, recentCount: 3,
    staleMonths: 1, provisional: true, partial: false,
  });
});

test('no trades in the recent calendar window leaves current reference empty instead of extending backwards', () => {
  const result = buildMarketOutlookContext([
    raw('may', { month: '2026-05', amountManWon: 50000 }),
    raw('june', { month: '2026-06', amountManWon: 60000 }),
  ], options({ loadedRangeEnd: '2026-06' }));
  assert.equal(result.trainingRange.rangeEnd, '2026-06');
  assert.equal(result.reference.latestMonth, '2026-06');
  assert.equal(result.reference.latestAverageManWon, 60000);
  assert.equal(result.reference.staleMonths, 3);
  assert.equal(result.reference.provisional, false);
  assert.equal(result.reference.recentStartMonth, '2026-07');
  assert.equal(result.reference.recentEndMonth, '2026-09');
  assert.equal(result.reference.recentCount, 0);
  for (const key of ['recentAverageManWon', 'recentMinManWon', 'recentMaxManWon']) assert.equal(result.reference[key], null);
});

test('calendar-quarter windows cross the year boundary and partial observations stay explicitly partial', () => {
  const result = buildMarketOutlookContext([
    raw('october', { month: '2025-10', amountManWon: 1000000 }),
    raw('november', { month: '2025-11', amountManWon: 50000 }),
    raw('january', { month: '2026-01', amountManWon: 70000 }),
  ], options({ loadedRangeEnd: '2026-01', asOfMonthIndex: monthIndex('2026-01'), partial: true }));
  assert.equal(result.reference.recentStartMonth, '2025-11');
  assert.equal(result.reference.recentEndMonth, '2026-01');
  assert.equal(result.reference.recentAverageManWon, 60000);
  assert.equal(result.reference.recentCount, 2);
  assert.equal(result.reference.partial, true);
  assert.equal(result.reference.provisional, true);
  assert.equal(result.reference.staleMonths, 0);
});

test('absent loaded coverage trusts only the display range and malformed coverage never guesses from records', () => {
  const rows = [raw('old', { month: '2023-01' }), raw('present')];
  const fallback = buildMarketOutlookContext(rows, options({ loadedRangeStart: undefined, loadedRangeEnd: undefined }));
  assert.deepEqual(fallback.records.map((record) => record.id), ['present']);
  assert.deepEqual(fallback.trainingRange, { rangeStart: '2025-10', rangeEnd: '2026-09', months: 12 });
  for (const changes of [
    { loadedRangeStart: undefined }, { loadedRangeStart: null }, { loadedRangeEnd: '2026-13' },
    { loadedRangeStart: '2026-10' }, { loadedRangeStart: '2027-01', loadedRangeEnd: '2027-02' },
    { asOfMonthIndex: NaN }, { asOfMonthIndex: null }, { asOfMonthIndex: 24320.5 },
  ]) {
    const result = buildMarketOutlookContext(rows, options(changes));
    assert.deepEqual(result.records, []);
    assert.deepEqual(result.series, []);
    assert.deepEqual(result.trainingRange, { rangeStart: null, rangeEnd: null, months: 0 });
    assert.equal(result.reference.latestAverageManWon, null);
    assert.equal(result.reference.latestCount, 0);
    assert.equal(result.reference.staleMonths, null);
    assert.equal(result.reference.provisional, false);
  }
});

test('duplicate ids, cancelled trades, and impossible dates cannot inflate reference counts', () => {
  const result = buildMarketOutlookContext([
    raw('duplicate', { amountManWon: 10000 }), raw('duplicate', { amountManWon: 70000 }),
    raw('cancelled', { cancelled: true }), raw('released', { cdealType: 'O' }),
    raw('bad-month', { month: '2026-13' }), raw('bad-day', { month: '2026-02', day: 29 }),
    raw('negative-day', { day: -1 }), raw('fractional-day', { day: 1.5 }),
    raw('invalid-price', { amountManWon: 0 }), raw('invalid-area', { areaM2: 0 }),
    null, [], false, {},
    raw('known-month', { day: 0, amountManWon: 90000 }),
  ], options());
  assert.equal(result.reference.latestCount, 2);
  assert.equal(result.reference.latestAverageManWon, 80000);
  assert.equal(result.series[0].count, 2);
  assert.deepEqual(buildMarketOutlookContext().records, []);
  assert.deepEqual(buildMarketOutlookContext(null, options()).records, []);
});

test('rental references use deposits and missing region metadata does not silently drop contracts', () => {
  const result = buildMarketOutlookContext([
    raw('sale', { amountManWon: 200000 }),
    raw('a', { dealType: '전세', depositManWon: 40000 }),
    raw('b', { dealType: '전세', depositManWon: 60000, regionCode: '' }),
  ], options({ dealType: '전세' }));
  assert.equal(result.reference.latestAverageManWon, 50000);
  assert.equal(result.reference.latestCount, 2);
  assert.equal(result.series.length, 1);
  assert.equal(result.series[0].averageTotal, 50000);
  assert.equal(result.series[0].count, 2);
  assert.equal(result.records.find((record) => record.id === 'b').regionCode, '');
});
