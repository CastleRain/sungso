import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarketAreaOverview } from '../js/market-area-overview.mjs';
import { buildMarketSummary, getSeries, normalizeTransaction } from '../js/market-core.mjs';

const raw = (id, changes = {}) => ({
  id, apartmentName: '검증 단지', aptSeq: '41171-test', regionCode: '41171', dong: '안양동',
  dealType: '매매', month: '2026-01', day: 15, areaM2: 84.7, amountManWon: 100000,
  ...changes,
});

test('selected-period mean weights every contract and stays distinct from the latest-month mean', () => {
  const records = [
    raw('a', { amountManWon: 10000 }), raw('b', { amountManWon: 10000 }), raw('c', { amountManWon: 40000 }),
    raw('d', { month: '2026-02', day: 28, amountManWon: 90000 }),
  ].map(normalizeTransaction);
  const [overview] = buildMarketAreaOverview(records);
  assert.equal(overview.areaKey, '84.7');
  assert.equal(overview.count, 4);
  assert.equal(overview.averageManWon, 37500);
  assert.notEqual(overview.averageManWon, (20000 + 90000) / 2);
  assert.equal(overview.minManWon, 10000);
  assert.equal(overview.maxManWon, 90000);
  assert.equal(overview.latestMonth, '2026-02');
  assert.equal(overview.latestMonthCount, 1);
  assert.equal(overview.latestMonthAverageManWon, 90000);
  assert.equal(overview.latestContractDate, '2026-02-28');
  assert.equal(overview.averageBasis, 'selected-period');
});

test('all nearby areas follow exactly the history detail rounding instead of broad size bands', () => {
  const records = [
    raw('a', { areaM2: 84.66 }), raw('b', { areaM2: 84.74 }),
    raw('c', { areaM2: 84.75 }), raw('d', { areaM2: 84.94 }),
    raw('e', { areaM2: 59.91 }),
  ];
  const groups = buildMarketAreaOverview(records);
  assert.deepEqual(groups.map((group) => [group.areaM2, group.count]), [[59.9, 1], [84.7, 2], [84.8, 1], [84.9, 1]]);
  groups.forEach((group) => {
    const detailRecords = records.filter((record) => Math.round(Number(record.areaM2) * 10) / 10 === group.areaM2);
    assert.equal(group.count, detailRecords.length);
    assert.equal(group.averageManWon, detailRecords.reduce((sum, record) => sum + record.amountManWon, 0) / detailRecords.length);
  });
  const expectedP33 = (100000 * 3.3 / 84.66 + 100000 * 3.3 / 84.74) / 2;
  assert.equal(groups.find((group) => group.areaM2 === 84.7).averageP33, expectedP33);
});

test('jeonse uses normalized deposit price and mixed transaction types cannot share an average', () => {
  const records = [
    raw('sale', { amountManWon: 100000 }),
    raw('jeonse-a', { dealType: '전세', amountManWon: 0, depositManWon: 50000 }),
    raw('jeonse-b', { dealType: '전세', amountManWon: 0, depositManWon: 70000 }),
    raw('rent', { dealType: '월세', amountManWon: 0, depositManWon: 10000, monthlyRentManWon: 100 }),
  ].map(normalizeTransaction);
  const groups = buildMarketAreaOverview(records);
  assert.equal(groups.length, 3);
  assert.equal(groups.find((group) => group.dealType === '매매').averageManWon, 100000);
  assert.equal(groups.find((group) => group.dealType === '전세').averageManWon, 60000);
  assert.equal(groups.find((group) => group.dealType === '전세').count, 2);
  assert.equal(groups.find((group) => group.dealType === '월세').averageManWon, 10000);
});

test('duplicate ids use the same latest-row rule as detail market summaries', () => {
  const records = [raw('a'), raw('a', { amountManWon: 130000 }), raw('b', { amountManWon: 130000 })];
  const [overview] = buildMarketAreaOverview(records);
  const detail = getSeries(buildMarketSummary(records), '41171', '매매', 'all')[0];
  assert.equal(overview.count, 2);
  assert.equal(overview.averageManWon, 130000);
  assert.equal(overview.count, detail.count);
  assert.equal(overview.averageManWon, detail.averageTotal);
  assert.equal(overview.averageP33, detail.averageP33);
});

test('cancelled contracts, malformed records and impossible calendar dates cannot affect a price', () => {
  const invalid = [
    null, undefined, false, 'bad', [], {},
    raw('cancelled', { cancelled: true }), raw('released', { cdealType: 'O' }),
    raw('korean-cancelled', { '해제사유발생일': '2026-02-01' }),
    raw('zero', { amountManWon: 0 }), raw('negative', { amountManWon: -10000 }),
    raw('area', { areaM2: 0 }), raw('bad-month', { month: '2026-13' }),
    raw('bad-date', { month: '2026-02', day: 30 }), raw('bad-day', { day: -1 }),
    raw('fractional-day', { day: 1.5 }),
  ];
  assert.deepEqual(buildMarketAreaOverview(invalid), []);
  const [overview] = buildMarketAreaOverview([...invalid, raw('valid', { amountManWon: 77777 })]);
  assert.equal(overview.count, 1);
  assert.equal(overview.averageManWon, 77777);
});

test('an unknown contract day keeps its monthly price without fabricating a latest exact date', () => {
  const [overview] = buildMarketAreaOverview([
    raw('dated', { month: '2026-02', day: 28 }), raw('undated', { month: '2026-02', day: 0 }),
    raw('old', { month: '2026-01', day: 31 }),
  ]);
  assert.equal(overview.count, 3);
  assert.equal(overview.latestMonth, '2026-02');
  assert.equal(overview.latestMonthCount, 2);
  assert.equal(overview.latestContractDate, null);
  const [leapYear] = buildMarketAreaOverview([raw('leap', { month: '2024-02', day: 29 })]);
  assert.equal(leapYear.latestContractDate, '2024-02-29');
});

test('the caller-selected range and deal type define both total and latest-month aggregates', () => {
  const records = [
    raw('old', { month: '2023-01', amountManWon: 10000 }),
    raw('a', { month: '2025-10', amountManWon: 60000 }),
    raw('b', { month: '2026-08', amountManWon: 90000 }),
    raw('jeonse', { month: '2026-08', dealType: '전세', amountManWon: 0, depositManWon: 50000 }),
  ].map(normalizeTransaction);
  const filtered = records.filter((record) => record.dealType === '매매' && record.month >= '2025-10' && record.month <= '2026-09');
  const [overview] = buildMarketAreaOverview(filtered);
  assert.equal(overview.count, 2);
  assert.equal(overview.averageManWon, 75000);
  assert.equal(overview.latestMonth, '2026-08');
  assert.equal(overview.latestMonthAverageManWon, 90000);
});

test('overview calculation is pure and absent input does not create placeholder prices', () => {
  const records = Object.freeze([Object.freeze(raw('b', { areaM2: 101.2 })), Object.freeze(raw('a', { areaM2: 59.9 }))]);
  const before = JSON.stringify(records);
  assert.deepEqual(buildMarketAreaOverview(records).map((group) => group.areaM2), [59.9, 101.2]);
  assert.equal(JSON.stringify(records), before);
  assert.deepEqual(buildMarketAreaOverview(), []);
  assert.deepEqual(buildMarketAreaOverview(null), []);
});
