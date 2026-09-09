import test from 'node:test';
import assert from 'node:assert/strict';
import { fitDampedForecast, fitPriceOutlook, finiteSampleQuantile } from '../js/market-core.mjs';

const firstMonth = 2021 * 12;
const observations = (price = () => 5000, length = 60) => Array.from({ length }, (_, index) => ({
  monthIndex: firstMonth + index,
  averageP33: price(index),
  count: 6,
}));
const optionsFor = (series, extra = {}) => ({
  windowMonths: 60,
  asOfMonthIndex: series.at(-1).monthIndex,
  incompleteMonths: 0,
  ...extra,
});
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('a stable market uses the validated no-change model without changing the trend gate', () => {
  const series = observations();
  const options = optionsFor(series);
  const trend = fitDampedForecast(series, options);
  const outlook = fitPriceOutlook(series, options);
  assert.equal(trend.eligible, false);
  assert.equal(outlook.eligible, true);
  assert.equal(outlook.modelKind, 'last-observation-carried-forward');
  assert.deepEqual(outlook.trendRejectedReasons, trend.reasons);
  assert.equal(outlook.baselinePriceP33, 5000);
  assert.equal(outlook.backtestMapePct, 0);
  assert.equal(outlook.backtestModelMae, 0);
  assert.equal(outlook.baselineSkillPct, 0);
  assert.equal(outlook.backtestMase, 1);
  assert.equal(outlook.modelSelectionIsIndependent, false);
  assert.equal(outlook.intervalCoverageIsIndependent, false);
  assert.equal(outlook.trainingEndMonth, '2025-12');
  assert.equal(outlook.trainingEndMonthIndex, series.at(-1).monthIndex);
  assert.equal(outlook.points.at(-1).month, '2026-06');
  for (const point of outlook.points) assert.deepEqual([point.point, point.lower, point.upper], [5000, 5000, 5000]);
});

test('a supported damped trend keeps its existing points and backtest diagnostics', () => {
  const series = observations((index) => 4000 * Math.exp(index * .008));
  const options = optionsFor(series);
  const trend = fitDampedForecast(series, options);
  const outlook = fitPriceOutlook(series, options);
  assert.equal(trend.eligible, true);
  assert.equal(outlook.modelKind, 'damped-trend');
  for (const [key, value] of Object.entries(trend)) assert.deepEqual(outlook[key], value, key);
  assert.deepEqual(outlook.trendRejectedReasons, []);
  assert.equal(outlook.baselinePriceP33, series.at(-1).averageP33);
  assert.equal(outlook.modelSelectionIsIndependent, false);
});

test('the baseline has its own error gate even when the rejected trend exceeds the error limit', () => {
  const series = observations((index) => index < 24 ? 9000 - index * 5500 / 24 : 3500 + (index - 24) * 4);
  const options = optionsFor(series);
  const trend = fitDampedForecast(series, options);
  const outlook = fitPriceOutlook(series, options);
  assert.ok(trend.backtestMapePct > 20);
  assert.equal(trend.eligible, false);
  assert.equal(outlook.eligible, true);
  assert.equal(outlook.modelKind, 'last-observation-carried-forward');
  assert.ok(outlook.backtestMapePct < 10);
  assert.deepEqual(outlook.trendRejectedReasons, trend.reasons);
  assert.equal(outlook.points[0].point, series.at(-1).averageP33);
});

test('each baseline horizon recalculates errors and intervals from actual origin and target values', () => {
  const series = observations((index) => 5000 + 250 * Math.sin(index / 4) + index * 3);
  const options = optionsFor(series);
  const trend = fitDampedForecast(series, options);
  const outlook = fitPriceOutlook(series, options);
  assert.equal(outlook.modelKind, 'last-observation-carried-forward');
  for (const diagnostic of outlook.horizonDiagnostics) {
    const step = diagnostic.horizonMonths;
    const expected = series.slice(11, series.length - step).map((origin) => {
      const target = series[origin.monthIndex - firstMonth + step];
      return {
        origin: origin.monthIndex, target: target.monthIndex,
        predicted: origin.averageP33, actual: target.averageP33,
        error: Math.abs(target.averageP33 - origin.averageP33),
        logError: Math.abs(Math.log(target.averageP33 / origin.averageP33)),
      };
    });
    assert.equal(diagnostic.origins, expected.length);
    diagnostic.residuals.forEach((residual, index) => {
      const row = expected[index];
      assert.equal(residual.originMonthIndex, row.origin);
      assert.equal(residual.targetMonthIndex, row.target);
      assert.equal(residual.predicted, row.predicted);
      assert.equal(residual.actual, row.actual);
      near(residual.absoluteError, row.error);
      near(residual.absoluteLogError, row.logError);
    });
    const radius = finiteSampleQuantile(expected.map((row) => row.logError), .8);
    near(diagnostic.modelMae, mean(expected.map((row) => row.error)));
    near(diagnostic.modelMapePct, mean(expected.map((row) => row.error / row.actual * 100)));
    near(diagnostic.conformalRadiusLog, radius);
    const point = outlook.points[step - 1];
    near(point.lower, series.at(-1).averageP33 * Math.exp(-radius));
    near(point.upper, series.at(-1).averageP33 * Math.exp(radius));
    assert.equal(point.intervalCalibrationOrigins, expected.length);
  }
  assert.notEqual(outlook.horizonDiagnostics.at(-1).conformalRadiusLog, trend.horizonDiagnostics.at(-1).conformalRadiusLog);
  assert.equal(outlook.backtestMapePct, outlook.horizonDiagnostics.at(-1).modelMapePct);
  assert.equal(outlook.backtestModelMae, outlook.horizonDiagnostics.at(-1).modelMae);
  assert.equal(outlook.backtestNaiveMae, outlook.backtestModelMae);
  assert.equal(outlook.backtestMase, 1);
  assert.equal(outlook.intervalCoverageBasis, 'same-rolling-origin-residuals-used-for-calibration');
});

test('fallback still withholds an inaccurate no-change model', () => {
  const series = observations((index) => 4000 * Math.exp(index * .06));
  const options = optionsFor(series, { phi: 0 });
  const trend = fitDampedForecast(series, options);
  const outlook = fitPriceOutlook(series, options);
  assert.equal(trend.eligible, false);
  assert.ok(outlook.backtestMapePct > 20);
  assert.equal(outlook.modelKind, null);
  assert.equal(outlook.eligible, false);
  assert.deepEqual(outlook.points, []);
  assert.ok(outlook.reasons.some((reason) => reason.includes('가격 유지 가정') && reason.includes('20%')));
});

test('the shared quality gates cannot be bypassed by choosing a simpler model', async (t) => {
  const cases = [
    ['too few observed months', observations(() => 5000, 14), {}, '월별 표본'],
    ['three selected years lose two incomplete months', observations(() => 5000, 36), { windowMonths: 36, incompleteMonths: 2 }, '백테스트 원점'],
    ['old observations', observations(), { asOfMonthIndex: firstMonth + 65 }, '마지막 유효'],
    ['insufficient monthly volume', observations().map((row) => ({ ...row, count: 2 })), {}, '월별 표본'],
    ['insufficient total volume', observations(), { minTransactions: 1000 }, '전체 거래 표본'],
    ['too short a calendar span', observations(), { minSpanMonths: 72 }, '관측 기간'],
    ['explicit minimum origin count', observations(), { minOriginsByHorizon: { 6: 50 } }, '백테스트 원점'],
    ['explicit interval calibration size', observations(), { minConformalOrigins: 50 }, '불확실성 구간'],
  ];
  for (const [name, series, extra, reasonPart] of cases) await t.test(name, () => {
    const outlook = fitPriceOutlook(series, optionsFor(series, extra));
    assert.equal(outlook.eligible, false);
    assert.equal(outlook.modelKind, null);
    assert.deepEqual(outlook.points, []);
    assert.ok(outlook.reasons.some((reason) => reason.includes(reasonPart)));
  });
});

test('missing exact target months still prevent interval calibration despite enough six-month origins', () => {
  const series = observations().map((row, index) => ({ ...row, monthIndex: firstMonth + index * 2 }));
  const outlook = fitPriceOutlook(series, optionsFor(series, { windowMonths: 120 }));
  assert.ok(outlook.backtestSamples >= 18);
  assert.equal(outlook.horizonDiagnostics[0].origins, 0);
  assert.equal(outlook.eligible, false);
  assert.ok(outlook.reasons.some((reason) => reason.includes('1개월 불확실성 구간')));
});

test('incomplete and future rows cannot influence model choice, baseline price, calibration or training date', () => {
  const series = observations((index) => 5000 + 250 * Math.sin(index / 4) + index * 3);
  const last = series.at(-1).monthIndex;
  const options = optionsFor(series, { asOfMonthIndex: last + 2, incompleteMonths: 2 });
  const future = [1, 2, 12].map((offset) => ({ monthIndex: last + offset, averageP33: offset * 100000, count: 100 }));
  const baseline = fitPriceOutlook(series, options);
  const shocked = fitPriceOutlook([...series, ...future], options);
  const shuffled = fitPriceOutlook([...series.slice(30), ...future, ...series.slice(0, 30)], options);
  for (const result of [shocked, shuffled]) {
    assert.equal(result.modelKind, baseline.modelKind);
    assert.equal(result.trainingEndMonthIndex, last);
    assert.equal(result.baselinePriceP33, series.at(-1).averageP33);
    assert.deepEqual(result.points, baseline.points);
    assert.deepEqual(result.horizonDiagnostics, baseline.horizonDiagnostics);
    assert.equal(result.excludedIncompleteObservations, 3);
    assert.equal(result.points[0].monthIndex, last + 1);
    assert.equal(result.points.at(-1).monthIndex, last + 6);
  }
});

test('empty evidence retains diagnostics without inventing a baseline or future prices', () => {
  const outlook = fitPriceOutlook([], { asOfMonthIndex: firstMonth + 60 });
  assert.equal(outlook.eligible, false);
  assert.equal(outlook.modelKind, null);
  assert.equal(outlook.trainingEndMonth, null);
  assert.equal(outlook.trainingEndMonthIndex, null);
  assert.equal(outlook.baselinePriceP33, null);
  assert.equal(outlook.backtestSamples, 0);
  assert.equal(outlook.backtestMapePct, null);
  assert.deepEqual(outlook.points, []);
  assert.equal(JSON.parse(JSON.stringify(outlook)).backtestMapePct, null);
});
