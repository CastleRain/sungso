import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTransactionActivity, transactionActivityDimension } from '../js/transaction-activity-core.mjs';

const months = ['2026-06', '2026-07', '2026-08'];
const metadata = (counts = [3, 3, 3], overrides = {}) => ({
  version: 1, scope: 'complex-sale', status: 'complete', requestedMonths: [...months],
  monthlyCounts: months.map((month, index) => ({ month, count: counts[index] })),
  sourceUpdatedAt: '2026-09-01T00:00:00.000Z', ...overrides,
});
const candidate = (counts, overrides = {}) => ({ households: 1000, transactionActivity: metadata(counts), ...overrides });
const dimension = (value, options = {}) => transactionActivityDimension(value, { asOfMonth: '2026-09', ...options });

test('normalization whitelists public scalar counts and does not retain private or scoring fields', () => {
  const input = metadata([1, 2, 3], {
    requestedMonths: ['2026-08', '2026-06', '2026-07'],
    monthlyCounts: [{ month: '2026-08', count: 3, routes: { minutes: 60 } }, { month: '2026-06', count: 1 }, { month: '2026-07', count: 2 }],
    company: { lat: 37 }, score: 5, memo: 'private',
  });
  const result = normalizeTransactionActivity(input);
  assert.deepEqual(result, metadata([1, 2, 3]));
  result.monthlyCounts[0].count = 99;
  result.requestedMonths.reverse();
  assert.equal(input.monthlyCounts[1].count, 1);
  assert.deepEqual(input.requestedMonths, ['2026-08', '2026-06', '2026-07']);
});

test('invalid shape, duplicate/outside months and inaccurate counts are rejected instead of granting completeness', () => {
  for (const value of [
    null, [], {}, metadata([1, 2, 3], { version: 2 }), metadata([1, 2, 3], { scope: 'area-sale' }),
    metadata([1, 2, 3], { status: 'provided' }), metadata([1, 2, 3], { requestedMonths: ['2026-13'] }),
    metadata([1, 2, 3], { requestedMonths: ['2026-06', '2026-06'] }),
    metadata([1, 2, 3], { monthlyCounts: [{ month: '2026-06', count: 1 }, { month: '2026-06', count: 1 }] }),
    metadata([1, 2, 3], { monthlyCounts: [{ month: '2026-05', count: 1 }] }),
    ...[-1, 1.5, Infinity, NaN, '3', true, null].map((count) => metadata([1, 2, 3], { monthlyCounts: [{ month: '2026-06', count }] })),
    metadata([Number.MAX_SAFE_INTEGER, 1, 0]),
    metadata([1, 2, 3], { sourceUpdatedAt: 'not-a-date' }),
    metadata([1, 2, 3], { sourceUpdatedAt: '2026-02-30T00:00:00Z' }),
  ]) assert.equal(normalizeTransactionActivity(value), null);
});

test('normalization bounds both requested count and calendar span at 120 months', () => {
  const longMonths = Array.from({ length: 120 }, (_, index) => `${2016 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`);
  const input = metadata([], { requestedMonths: longMonths, monthlyCounts: longMonths.map((month) => ({ month, count: 0 })) });
  assert.equal(normalizeTransactionActivity(input).requestedMonths.length, 120);
  assert.equal(normalizeTransactionActivity({ ...input, requestedMonths: [...longMonths, '2026-01'] }), null);
  assert.equal(normalizeTransactionActivity(metadata([], { requestedMonths: ['2010-01', '2026-01'], monthlyCounts: [] })), null);
});

test('missing months and gaps downgrade complete data without upgrading explicit partial or stale states', () => {
  const missing = normalizeTransactionActivity(metadata([1, 2, 3], { monthlyCounts: [{ month: '2026-06', count: 1 }] }));
  assert.equal(missing.status, 'partial');
  const gap = normalizeTransactionActivity(metadata([], {
    requestedMonths: ['2026-06', '2026-08'], monthlyCounts: [{ month: '2026-06', count: 1 }, { month: '2026-08', count: 1 }],
  }));
  assert.equal(gap.status, 'partial');
  for (const status of ['partial', 'stale', 'missing']) assert.equal(normalizeTransactionActivity(metadata([1, 2, 3], { status })).status, status);
  assert.equal(normalizeTransactionActivity(metadata([], { requestedMonths: [], monthlyCounts: [] })).status, 'missing');
});

test('larger observed sale volumes increase preference monotonically with a fixed five-point ceiling', () => {
  const scores = [0, 1, 2, 3, 5, 8, 10, 20, 1000].map((count) => dimension(candidate([count, count, count])));
  for (let index = 1; index < scores.length; index++) assert.ok(scores[index].score >= scores[index - 1].score);
  assert.ok(scores.every((item) => item.score >= 0 && item.score <= 5));
  assert.equal(scores.at(-1).score, 5);
  assert.equal(scores.at(-1).knownMaxScore, 5);
  assert.equal(scores.at(-1).status, 'calculated');
});

test('components use the stated logarithmic volume, household-adjusted turnover and monthly consistency formulas', () => {
  const result = dimension(candidate([2, 4, 0]));
  assert.equal(result.value, 2);
  assert.equal(result.monthlyAverage, 2);
  assert.equal(result.monthlyTurnoverRate, .002);
  assert.equal(result.components.volume.score, Math.round(2 * Math.log1p(2) / Math.log1p(10) * 100) / 100);
  assert.equal(result.components.turnover.score, .8);
  assert.equal(result.components.consistency.score, .67);
  assert.equal(result.requestedMonthCount, 3);
  assert.equal(result.activeMonthCount, 2);
  assert.equal(result.totalCount, 6);
  assert.equal(result.score, result.components.volume.score + .8 + .67);
});

test('equal per-household turnover receives equal turnover points across differently sized complexes', () => {
  const small = dimension(candidate([1, 1, 1], { households: 500 }));
  const large = dimension(candidate([2, 2, 2], { households: 1000 }));
  assert.equal(small.components.turnover.score, large.components.turnover.score);
  assert.equal(small.monthlyTurnoverRate, large.monthlyTurnoverRate);
  assert.ok(large.components.volume.score > small.components.volume.score);
});

test('a single observed month uses a three-month denominator for consistency, never full consistency credit', () => {
  const result = dimension(candidate([], { transactionActivity: metadata([], {
    requestedMonths: ['2026-08'], monthlyCounts: [{ month: '2026-08', count: 10 }],
  }) }));
  assert.equal(result.monthlyAverage, 10);
  assert.equal(result.requestedMonthCount, 1);
  assert.equal(result.consistencyDenominator, 3);
  assert.equal(result.components.consistency.score, .33);
  assert.equal(result.score, 4.33);
});

test('fresh complete zero-count months produce a confirmed zero score rather than unknown evidence', () => {
  const result = dimension(candidate([0, 0, 0]));
  assert.equal(result.status, 'calculated');
  assert.equal(result.value, 0);
  assert.equal(result.score, 0);
  assert.equal(result.knownMaxScore, 5);
  assert.equal(result.totalCount, 0);
  assert.equal(result.monthlyAverage, 0);
  assert.deepEqual(result.reasons, []);
});

test('unknown households withhold only two turnover points and never redistribute them', () => {
  for (const households of [null, undefined, 0, -1, true, '', 2.5]) {
    const result = dimension(candidate([10, 10, 10], { households }));
    assert.equal(result.status, 'calculated');
    assert.equal(result.score, 3);
    assert.equal(result.maxScore, 5);
    assert.equal(result.knownMaxScore, 3);
    assert.equal(result.components.turnover.status, 'unknown');
    assert.equal(result.components.turnover.value, null);
    assert.equal(result.components.turnover.score, 0);
    assert.deepEqual(result.reasons, ['households-unknown']);
  }
});

test('partial monthly data preserves known counts while withholding average and all points', () => {
  const result = dimension(candidate([], { transactionActivity: metadata([], {
    monthlyCounts: [{ month: '2026-06', count: 6 }, { month: '2026-08', count: 3 }],
  }) }));
  assert.equal(result.status, 'unknown');
  assert.equal(result.score, 0);
  assert.equal(result.knownMaxScore, 0);
  assert.equal(result.observedCount, 9);
  assert.equal(result.observedMonthCount, 2);
  assert.deepEqual(result.missingMonths, ['2026-07']);
  assert.equal(result.totalCount, null);
  assert.equal(result.monthlyAverage, null);
  assert.ok(result.reasons.includes('partial-coverage'));
  assert.ok(result.reasons.includes('missing-months'));
  assert.ok(result.label.includes('확인 9건'));
  assert.ok(Object.values(result.components).every((item) => item.score === 0 && item.status === 'unknown'));
});

test('old, future and explicitly stale coverage remain unknown while two-month-old complete coverage is usable', () => {
  const at = (endMonth, status = 'complete') => candidate([], { transactionActivity: metadata([], {
    requestedMonths: [endMonth], monthlyCounts: [{ month: endMonth, count: 20 }], status, sourceUpdatedAt: null,
  }) });
  assert.equal(dimension(at('2026-07')).status, 'calculated');
  for (const [input, reason] of [
    [at('2026-06'), 'outdated-period'], [at('2026-10'), 'future-period'],
    [at('2026-08', 'stale'), 'stale-coverage'],
    [candidate([10, 10, 10], { transactionActivity: metadata([10, 10, 10], { sourceUpdatedAt: '2026-10-01T00:00:00Z' }) }), 'future-source-update'],
  ]) {
    const result = dimension(input);
    assert.equal(result.status, 'unknown');
    assert.equal(result.value, null);
    assert.equal(result.score, 0);
    assert.equal(result.knownMaxScore, 0);
    assert.ok(result.observedCount > 0);
    assert.ok(result.reasons.includes(reason));
  }
});

test('legacy area transaction counts or invalid reference months never substitute for activity evidence', () => {
  for (const value of [undefined, null, {}, { bestArea: { count: 1000 }, households: 1000 }]) {
    const result = dimension(value);
    assert.equal(result.status, 'unknown');
    assert.equal(result.score, 0);
    assert.equal(result.value, null);
    assert.equal(result.totalCount, null);
    assert.equal(result.observedCount, 0);
  }
  const invalidMonth = dimension(candidate([10, 10, 10]), { asOfMonth: '2026-13' });
  assert.equal(invalidMonth.score, 0);
  assert.ok(invalidMonth.reasons.includes('invalid-reference-month'));
});

test('custom weight scales all three components while preserving the ceiling and original metadata', () => {
  const activity = metadata([10, 10, 10]);
  Object.freeze(activity.requestedMonths);
  activity.monthlyCounts.forEach(Object.freeze);
  Object.freeze(activity.monthlyCounts);
  Object.freeze(activity);
  const input = Object.freeze({ households: 1000, transactionActivity: activity });
  const before = JSON.stringify(input);
  const result = dimension(input, { maxScore: 10 });
  assert.equal(result.score, 10);
  assert.deepEqual(Object.values(result.components).map((item) => item.maxScore), [4, 4, 2]);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(dimension(input, { maxScore: 10 }), result);
});

test('a current-month query keeps its full calendar denominator and explicitly labels ongoing reporting', () => {
  const input = candidate([], { transactionActivity: metadata([], {
    requestedMonths: ['2026-07', '2026-08', '2026-09'],
    monthlyCounts: [{ month: '2026-07', count: 6 }, { month: '2026-08', count: 6 }, { month: '2026-09', count: 0 }],
    sourceUpdatedAt: null,
  }) });
  const result = dimension(input);
  assert.equal(result.status, 'calculated');
  assert.equal(result.monthlyAverage, 4);
  assert.equal(result.requestedMonthCount, 3);
  assert.equal(result.reportingProvisional, true);
  assert.ok(result.label.includes('2026-07~2026-09'));
  assert.ok(result.label.includes('3개월 12건'));
  assert.ok(result.label.includes('최근월 신고 진행 중'));
  const completedPeriod = dimension(candidate([4, 4, 4]));
  assert.equal(completedPeriod.reportingProvisional, false);
  assert.ok(completedPeriod.label.includes('2026-06~2026-08'));
  assert.ok(!completedPeriod.label.includes('신고 진행 중'));
});
