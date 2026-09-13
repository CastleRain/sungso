import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForecastChartSeries } from '../js/market-chart-series.mjs';

const observed = (month, averageTotal, averageP33 = averageTotal / 20) => ({ month, averageTotal, averageP33 });
const point = (month, value) => ({ month, point: value, lower: value * .9, upper: value * 1.1 });

test('total display uses actual mean amounts and scales all forecast bounds only', () => {
  const result = buildForecastChartSeries([observed('2026-07', 93500, 4500)], { eligible: true, points: [point('2026-08', 5000)] }, { areaM2: 66 });
  assert.equal(result.unit, 'total');
  assert.deepEqual(result.months, ['2026-07', '2026-08']);
  assert.deepEqual(result.actualValues, [93500, null]);
  assert.deepEqual(result.predictedValues, [93500, 100000]);
  assert.deepEqual(result.lowerValues, [93500, 90000]);
  assert.deepEqual(result.upperValues, [93500, 110000]);
});

test('overlapping provisional actual months and predictions share sorted positions', () => {
  const series = [observed('2026-09', 97000), observed('2026-07', 93000), observed('2026-08', 95000)];
  const forecast = { eligible: true, points: [point('2026-10', 4900), point('2026-08', 4700), point('2026-09', 4800)] };
  const before = JSON.stringify({ series, forecast });
  const result = buildForecastChartSeries(series, forecast, { areaM2: 66 });
  assert.deepEqual(result.months, ['2026-07', '2026-08', '2026-09', '2026-10']);
  assert.deepEqual(result.actualValues, [93000, 95000, 97000, null]);
  assert.deepEqual(result.predictedValues, [93000, 94000, 96000, 98000]);
  assert.equal(JSON.stringify({ series, forecast }), before);
});

test('a gap before the forecast cannot borrow the last or future actual as bridge', () => {
  const result = buildForecastChartSeries([observed('2026-06', 90000), observed('2026-09', 99000)], { eligible: true, points: [point('2026-08', 4700)] }, { areaM2: 66 });
  assert.deepEqual(result.months, ['2026-06', '2026-08', '2026-09']);
  assert.deepEqual(result.predictedValues, [null, 94000, null]);
});

test('display window is 18 calendar months even when observations are sparse', () => {
  const result = buildForecastChartSeries([observed('2024-01', 100), observed('2025-03', 200), observed('2025-04', 300), observed('2026-09', 400)], { eligible: false }, {});
  assert.deepEqual(result.months, ['2025-04', '2026-09']);
  assert.deepEqual(result.actualValues, [15, 20]);
  assert.deepEqual(result.predictedValues, [null, null]);
});

test('unknown area preserves p33 units and missing values never become zero', () => {
  for (const areaM2 of [undefined, null, '', 0, -1, Infinity, 'invalid']) {
    const result = buildForecastChartSeries([{ month: '2026-07', averageTotal: 100000, averageP33: undefined }], { eligible: true, points: [{ month: '2026-08', point: undefined, lower: null, upper: '' }] }, { areaM2 });
    assert.equal(result.unit, 'p33');
    assert.deepEqual(result.actualValues, [null, null]);
    assert.deepEqual(result.predictedValues, [null, null]);
    assert.deepEqual(result.lowerValues, [null, null]);
    assert.deepEqual(result.upperValues, [null, null]);
  }
});

test('undefined and ineligible payloads have no invented forecast or bridge', () => {
  assert.deepEqual(buildForecastChartSeries(undefined, undefined), { months: [], actualValues: [], predictedValues: [], lowerValues: [], upperValues: [], unit: 'p33' });
  const result = buildForecastChartSeries([observed('2026-07', 100000)], { eligible: false, points: [point('2026-08', 5000)] }, { areaM2: 66 });
  assert.deepEqual(result.months, ['2026-07']);
  assert.deepEqual(result.predictedValues, [null]);
});

test('invalid months are excluded and duplicate corrections occupy one month', () => {
  const result = buildForecastChartSeries([null, { month: '2026-00' }, { month: '2026-13' }, { monthIndex: 123 }, observed('2026-07', 90000), observed('2026-07', 95000)], { eligible: true, points: [point('2026-08', 4000), point('2026-08', 5000), point('invalid', 7000)] }, { areaM2: 66 });
  assert.deepEqual(result.months, ['2026-07', '2026-08']);
  assert.deepEqual(result.actualValues, [95000, null]);
  assert.deepEqual(result.predictedValues, [95000, 100000]);
});

test('regional chart never derives a total from mixed areas or falls back to a median', () => {
  const result = buildForecastChartSeries([{ month: '2026-07', medianTotal: 90000, medianP33: 4000 }], { eligible: true, points: [point('2026-08', 5000)] });
  assert.equal(result.unit, 'p33');
  assert.deepEqual(result.actualValues, [null, null]);
  assert.deepEqual(result.predictedValues, [null, 5000]);
});
