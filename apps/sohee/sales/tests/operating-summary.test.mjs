import test from 'node:test';
import assert from 'node:assert/strict';
import {initialSelection, analyzeSelection} from '../src/analysis.mjs';
import {operatingSummary} from '../src/operating-summary.mjs';

// Synthetic figures deliberately include a fully offset sale and refund-only day.
function fixture() {
  const day = (date, amount, record_day, source = 'toss', partial_day = false) => ({
    date, month: date.slice(0, 7), amount, record_day, source, partial_day,
    payment_count: record_day ? 1 : 0, weekday: (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7,
  });
  const menu = (date, hour, quantity = 1, amount = 1000) => ({date, hour, quantity, amount});
  return {
    start: '2026-04-01', end: '2026-04-07',
    daily: [day('2026-04-01', 90000, true), day('2026-04-02', 0, true),
      day('2026-04-03', 0, false), day('2026-04-04', -10000, false),
      day('2026-04-06', 30000, true, 'payhere'), day('2026-04-07', 50000, true, 'toss', true)],
    menu_toss: [menu('2026-04-01', 14), menu('2026-04-01', 9), menu('2026-04-01', 12),
      menu('2026-04-03', 9, 0, 0), menu('2026-04-04', 10, -1, -10000)],
  };
}

test('operating evidence separates complete, partial, unrecorded and missing dates with matching average basis', () => {
  const data = fixture(), before = JSON.stringify(data), selection = initialSelection(data);
  const result = operatingSummary(data, selection);
  assert.equal(result.selectedDays, 7);
  assert.deepEqual(result.completeRecordedDates, ['2026-04-01', '2026-04-02', '2026-04-06']);
  assert.equal(result.completeRecordedDays, 3);
  assert.equal(result.recordedDays, 4);
  assert.deepEqual(result.zeroRecordDates, ['2026-04-03', '2026-04-04']);
  assert.equal(result.zeroRecordDays, 2);
  assert.deepEqual(result.partialDates, ['2026-04-07']);
  assert.deepEqual(result.missingDates, ['2026-04-05']);
  assert.equal(result.completeRecordedAmount, 120000);
  assert.equal(result.dailyAverage, 40000);
  assert.equal(result.excludedPartialDays, 0);
  assert.equal(result.rows.find(row => row.date === '2026-04-04').amount, -10000);
  assert.equal(result.rows.find(row => row.date === '2026-04-05').amount, null);
  assert.equal(analyzeSelection(data, selection).perRecordDay, 40000);
  assert.equal(JSON.stringify(data), before);
});

test('excluding partial days changes inclusion only, never the complete-recorded average', () => {
  const data = fixture(), selection = {...initialSelection(data), includePartial: false};
  const result = operatingSummary(data, selection);
  assert.equal(result.partialDays, 1);
  assert.equal(result.excludedPartialDays, 1);
  assert.equal(result.rows.at(-1).included, false);
  assert.equal(result.dailyAverage, 40000);
  // Preserve the existing metric, whose numerator includes refund-only days.
  assert.equal(analyzeSelection(data, selection).perRecordDay, 110000 / 3);
});

test('partial-only, missing-only and refund-only selections do not invent an average or working day', () => {
  const data = fixture(), base = {...initialSelection(data), mode: 'multiple'};
  for (const date of ['2026-04-07', '2026-04-05', '2026-04-04']) {
    const result = operatingSummary(data, {...base, dates: [date]});
    assert.equal(result.completeRecordedDays, 0);
    assert.equal(result.completeRecordedAmount, 0);
    assert.equal(result.dailyAverage, null);
  }
  assert.equal(operatingSummary(data, {...base, dates: ['2026-04-07'], includePartial: false}).excludedPartialDays, 1);
  const offset = operatingSummary(data, {...base, dates: ['2026-04-02']});
  assert.equal(offset.completeRecordedDays, 1);
  assert.equal(offset.dailyAverage, 0);
});

test('observed hours retain only selected Toss complete menu hour evidence and do not infer attendance', () => {
  const data = fixture();
  // Even unexpected detail rows must not turn historical or partial days into time evidence.
  data.menu_toss.push({date: '2026-04-06', hour: 8, quantity: 1, amount: 1000},
    {date: '2026-04-07', hour: 18, quantity: 1, amount: 1000});
  const result = operatingSummary(data, initialSelection(data));
  const hours = date => result.rows.find(row => row.date === date).observedHours;
  assert.deepEqual(hours('2026-04-01'), {firstHour: 9, lastHour: 14});
  assert.equal(hours('2026-04-02'), null);
  assert.equal(hours('2026-04-03'), null);
  assert.deepEqual(hours('2026-04-04'), {firstHour: 10, lastHour: 10});
  assert.equal(hours('2026-04-05'), null);
  assert.equal(hours('2026-04-06'), null);
  assert.equal(hours('2026-04-07'), null);
});

test('nonconsecutive selection stays sparse, sorted and deduplicated without filling intervening workdays', () => {
  const data = fixture();
  const result = operatingSummary(data, {...initialSelection(data), mode: 'multiple',
    dates: ['2026-04-06', '2026-04-01', '2026-04-06']});
  assert.equal(result.selectedDays, 2);
  assert.deepEqual(result.rows.map(row => row.date), ['2026-04-01', '2026-04-06']);
  assert.equal(result.completeRecordedDays, 2);
  assert.equal(result.dailyAverage, 60000);
  assert.equal(result.zeroRecordDays, 0);
  assert.equal(result.partialDays, 0);
  assert.equal(result.missingDays, 0);
  const empty = operatingSummary(data, {...initialSelection(data), mode: 'multiple', dates: []});
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.dailyAverage, null);
});

test('weekday averages use the same complete payment-record basis including net-zero days and excluding refund-only days', () => {
  const data = fixture();
  data.end = '2026-04-22';
  const day = (date, amount, record_day, partial_day = false) => ({date, amount, record_day,
    partial_day, month: '2026-04', weekday: 2, source: 'toss', payment_count: 0});
  data.daily.push(day('2026-04-08', 0, true), day('2026-04-15', -10000, false),
    day('2026-04-22', 50000, true, true));
  const result = operatingSummary(data, initialSelection(data));
  assert.equal(result.weekday.length, 7);
  assert.deepEqual(result.weekday[2], {weekday: 2, amount: 90000, recordDays: 2, perRecordDay: 45000});
  assert.deepEqual(result.weekday[3], {weekday: 3, amount: 0, recordDays: 1, perRecordDay: 0});
  assert.deepEqual(result.weekday[0], {weekday: 0, amount: 30000, recordDays: 1, perRecordDay: 30000});
  assert.deepEqual(result.weekday[5], {weekday: 5, amount: 0, recordDays: 0, perRecordDay: null});
  assert.equal(result.weekday.reduce((sum, row) => sum + row.amount, 0), result.completeRecordedAmount);
  assert.equal(result.weekday.reduce((sum, row) => sum + row.recordDays, 0), result.completeRecordedDays);
  assert.equal(result.dailyAverage, result.completeRecordedAmount / result.completeRecordedDays);
  const onlyWednesdays = operatingSummary(data, {...initialSelection(data), mode: 'multiple',
    dates: ['2026-04-01', '2026-04-08', '2026-04-15', '2026-04-22']});
  assert.equal(onlyWednesdays.dailyAverage, onlyWednesdays.weekday[2].perRecordDay);
  assert.deepEqual(operatingSummary(data, {...initialSelection(data), includePartial: false}).weekday, result.weekday);
});
