import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVisitBenchmark,
  selectCurrentActualReference,
  selectVisitActualBaseline,
} from '../js/visit-benchmark-core.mjs';

function record(id, month, day, amountManWon, areaM2 = 84.95, dealType = '매매') {
  return { id, month, day, amountManWon, areaM2, dealType };
}

test('visit baseline prefers three preceding months without using later deals', () => {
  const records = [
    record('before-1', '2026-01', 10, 60000),
    record('before-2', '2026-02', 10, 62000),
    record('before-3', '2026-03', 10, 64000),
    record('after', '2026-04', 20, 90000),
  ];
  const baseline = selectVisitActualBaseline(records, '2026-04-01', {
    areaM2: 84.95,
    dealType: '매매',
  });
  assert.equal(baseline.method, 'preceding-window');
  assert.equal(baseline.sampleSize, 3);
  assert.equal(baseline.medianManWon, 62000);
  assert.equal(baseline.averageManWon, 62000);
  assert.equal(baseline.recordIds.includes('after'), false);
});

test('sparse preceding sample explicitly widens to plus/minus 90 days', () => {
  const records = [
    record('before', '2026-03', 20, 60000),
    record('after-1', '2026-04', 10, 65000),
    record('after-2', '2026-05', 1, 70000),
    record('too-late', '2026-08', 1, 99999),
  ];
  const baseline = selectVisitActualBaseline(records, '2026-04-01');
  assert.equal(baseline.method, 'symmetric-window-fallback');
  assert.deepEqual(baseline.recordIds, ['before', 'after-1', 'after-2']);
  assert.equal(baseline.medianManWon, 65000);
  assert.equal(baseline.averageManWon, 65000);
  assert.deepEqual(baseline.rangeManWon, { min: 60000, max: 70000 });
});

test('visit references expose and compare the actual arithmetic average', () => {
  const records = [
    record('before-1', '2026-01', 10, 50000),
    record('before-2', '2026-02', 10, 50000),
    record('before-3', '2026-03', 10, 80000),
    record('after-1', '2026-05', 10, 60000),
    record('after-2', '2026-06', 10, 60000),
    record('after-3', '2026-07', 10, 90000),
  ];
  const benchmark = buildVisitBenchmark(records, {
    visitDate: '2026-04-01', areaM2: 84.95, dealType: '매매', askingPrice: 60000,
  });
  assert.equal(benchmark.visitActualBaseline.averageManWon, 60000);
  assert.equal(benchmark.currentActualReference.averageManWon, 70000);
  assert.equal(benchmark.marketChange.amountManWon, 10000);
  assert.equal(benchmark.marketChangeBasis, 'currentActualReference.averageManWon - visitActualBaseline.averageManWon');
});

test('exact-area and deal-type filters prevent unlike homes from entering the benchmark', () => {
  const records = [
    record('exact', '2026-01', 1, 60000),
    record('different-area', '2026-01', 2, 30000, 59.9),
    record('rent', '2026-01', 3, 35000, 84.95, '전세'),
  ];
  const baseline = selectVisitActualBaseline(records, '2026-02-01', {
    areaM2: 84.95,
    dealType: '매매',
    minSamples: 1,
  });
  assert.deepEqual(baseline.recordIds, ['exact']);
});

test('current reference uses latest three-month window, then latest-N fallback when sparse', () => {
  const dense = [
    record('old', '2025-01', 1, 30000),
    record('a', '2026-04', 1, 70000),
    record('b', '2026-05', 1, 72000),
    record('c', '2026-06', 1, 74000),
  ];
  const denseReference = selectCurrentActualReference(dense);
  assert.equal(denseReference.method, 'latest-month-window');
  assert.equal(denseReference.medianManWon, 72000);
  assert.equal(denseReference.sparse, false);
  assert.equal(denseReference.confidence, 'standard');

  const sparse = [
    record('a', '2025-01', 1, 50000),
    record('b', '2025-06', 1, 60000),
    record('c', '2026-06', 1, 70000),
  ];
  const sparseReference = selectCurrentActualReference(sparse);
  assert.equal(sparseReference.method, 'latest-n-fallback');
  assert.equal(sparseReference.medianManWon, 60000);
  assert.equal(sparseReference.sparse, true);
  assert.equal(sparseReference.confidence, 'low');
});

test('sparse current fallback never mixes pre-visit deals with one post-visit deal', () => {
  const records = [
    record('before-1', '2026-01', 10, 50000),
    record('before-2', '2026-02', 10, 60000),
    record('before-3', '2026-03', 10, 70000),
    record('after-only', '2026-09', 10, 90000),
  ];
  const current = selectCurrentActualReference(records, {
    visitDate: '2026-04-01',
  });

  assert.equal(current.method, 'latest-n-fallback');
  assert.deepEqual(current.recordIds, ['after-only']);
  assert.equal(current.medianManWon, 90000);
  assert.equal(current.sampleSize, 1);
  assert.equal(current.sparse, true);
  assert.equal(current.confidence, 'low');
  assert.equal(current.reason, 'insufficient-latest-window-samples');
  assert.equal(current.postVisitOnly, true);
  assert.equal(current.afterDate, '2026-04-01');
});

test('visit benchmark uses only post-visit current evidence and marks a one-deal change low confidence', () => {
  const records = [
    record('before-1', '2026-01', 10, 50000),
    record('before-2', '2026-02', 10, 60000),
    record('before-3', '2026-03', 10, 70000),
    record('after-only', '2026-09', 10, 90000),
  ];
  const benchmark = buildVisitBenchmark(records, {
    visitDate: '2026-04-01',
    askingPrice: 65000,
    areaM2: 84.95,
    dealType: '매매',
  });

  assert.deepEqual(benchmark.currentActualReference.recordIds, ['after-only']);
  assert.equal(benchmark.currentActualReference.sparse, true);
  assert.equal(benchmark.currentActualReference.confidence, 'low');
  assert.equal(benchmark.marketChange.available, true);
  assert.equal(benchmark.marketChange.amountManWon, 30000);
  assert.equal(benchmark.marketChange.percent, 50);
  assert.equal(benchmark.marketChange.sparse, true);
  assert.equal(benchmark.marketChange.confidence, 'low');
  assert.equal(benchmark.marketChange.currentSampleSize, 1);
});

test('visit benchmark reports no current reference when every transaction is on or before the visit', () => {
  const records = [
    record('before-1', '2026-01', 10, 50000),
    record('before-2', '2026-02', 10, 60000),
    record('same-day', '2026-04', 1, 70000),
  ];
  const benchmark = buildVisitBenchmark(records, {
    visitDate: '2026-04-01',
    askingPrice: 65000,
    areaM2: 84.95,
    dealType: '매매',
  });

  assert.equal(benchmark.currentActualReference.available, false);
  assert.equal(benchmark.currentActualReference.method, 'no-post-visit-transactions');
  assert.deepEqual(benchmark.currentActualReference.recordIds, []);
  assert.equal(benchmark.currentActualReference.sparse, true);
  assert.equal(benchmark.currentActualReference.confidence, 'none');
  assert.equal(benchmark.hasPostVisitEvidence, false);
  assert.equal(benchmark.marketChange.available, false);
  assert.equal(benchmark.marketChange.reason, 'no-post-visit-transaction');
});

test('three-month current window means the latest three calendar months', () => {
  const records = [
    record('march', '2026-03', 31, 10000),
    record('april', '2026-04', 1, 70000),
    record('may', '2026-05', 1, 72000),
    record('june', '2026-06', 30, 74000),
  ];
  const current = selectCurrentActualReference(records);
  assert.equal(current.method, 'latest-month-window');
  assert.deepEqual(current.recordIds, ['april', 'may', 'june']);
});

test('market change never uses the saved asking price', () => {
  const records = [
    record('v1', '2025-12', 1, 58000),
    record('v2', '2026-01', 1, 60000),
    record('v3', '2026-02', 1, 62000),
    record('n1', '2026-07', 1, 70000),
    record('n2', '2026-08', 1, 72000),
    record('n3', '2026-09', 1, 74000),
  ];
  const benchmark = buildVisitBenchmark(records, {
    visitDate: '2026-02-15',
    askingPrice: 100000,
    areaM2: 84.95,
    dealType: '매매',
  });

  assert.equal(benchmark.visitActualBaseline.medianManWon, 60000);
  assert.equal(benchmark.currentActualReference.medianManWon, 72000);
  assert.equal(benchmark.marketChange.amountManWon, 12000);
  assert.equal(benchmark.marketChange.percent, 20);
  assert.equal(benchmark.askingVsVisitMarket.amountManWon, 40000);
  assert.equal(benchmark.askingPriceExcludedFromMarketChange, true);
});

test('cancelled and malformed records are excluded', () => {
  const records = [
    { ...record('valid', '2026-01', 1, 60000), cancelDate: '' },
    { ...record('cancelled', '2026-01', 2, 10000), cancelDate: '2026-01-03' },
    record('bad-date', 'not-a-month', 1, 1),
  ];
  const result = selectVisitActualBaseline(records, '2026-02-01', { minSamples: 1 });
  assert.deepEqual(result.recordIds, ['valid']);
});

test('does not label an old dataset as post-visit market change', () => {
  const records = [
    record('a', '2026-01', 1, 50000),
    record('b', '2026-02', 1, 51000),
    record('c', '2026-03', 1, 52000),
  ];
  const result = buildVisitBenchmark(records, {
    visitDate: '2026-04-01', askingPrice: 53000, areaM2: 84.95, dealType: '매매',
  });
  assert.equal(result.hasPostVisitEvidence, false);
  assert.equal(result.marketChange.available, false);
  assert.equal(result.marketChange.reason, 'no-post-visit-transaction');
});
