import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bandFor, median, average, parseMolitCsv, buildMarketSummary, getSeries, withChanges,
  fitDampedForecast, getRegion, latestRegionComparison, normalizeTransaction,
  excludeIncompleteMonths, finiteSampleQuantile, rollingOriginForecastDiagnostics,
} from '../js/market-core.mjs';

test('area band boundaries do not overlap', () => {
  assert.equal(bandFor(39.99), 'lt40');
  assert.equal(bandFor(40), '40_60');
  assert.equal(bandFor(60), '60_85');
  assert.equal(bandFor(85), '85_102');
  assert.equal(bandFor(102), 'gte102');
});

test('median handles odd and even samples', () => {
  assert.equal(median([3000, 4200, 3000]), 3000);
  assert.equal(median([3000, 5000]), 4000);
});

test('average is the arithmetic mean shown to users', () => {
  assert.equal(average([100, 100, 400]), 200);
});

test('market summary and monthly change use arithmetic averages, not medians', () => {
  const make = (id, month, amountManWon) => ({
    id, dealType: '매매', regionCode: '1', regionName: '테스트', apartmentName: 'A',
    month, day: 1, areaM2: 84, amountManWon,
  });
  const summary = buildMarketSummary([
    make('a', '2026-01', 100), make('b', '2026-01', 100), make('c', '2026-01', 400),
    make('d', '2026-02', 100), make('e', '2026-02', 100), make('f', '2026-02', 700),
  ]);
  const series = withChanges(getSeries(summary, '1', '매매', '60_85'));
  assert.equal(series[0].medianTotal, 100);
  assert.equal(series[0].averageTotal, 200);
  assert.equal(series[1].averageTotal, 300);
  assert.equal(series[1].mom.pct, 50);
});

test('MOLIT CSV parser supports sale and jeonse rows', () => {
  const csv = [
    '다운로드 안내 문구',
    '시군구,법정동,단지명,전용면적(㎡),계약년월,계약일,거래금액(만원),보증금액(만원),월세금액(만원),층,건축년도,도로명,해제사유발생일',
    '서울특별시 송파구,잠실동,테스트단지,84.9,202601,12,"125,000",,,15,2008,올림픽로,',
    '서울특별시 송파구,잠실동,테스트단지,84.9,202602,3,,"68,000",0,8,2008,올림픽로,',
  ].join('\n');
  const records = parseMolitCsv(csv);
  assert.equal(records.length, 2);
  assert.equal(records[0].dealType, '매매');
  assert.equal(records[0].amountManWon, 125000);
  assert.equal(records[1].dealType, '전세');
  assert.equal(records[1].amountManWon, 68000);
});

test('month-over-month change requires exact previous month', () => {
  const records = [
    { id: 'a', dealType: '매매', regionCode: '1', regionName: '테스트', apartmentName: 'A', month: '2026-01', day: 1, areaM2: 84, amountManWon: 100000 },
    { id: 'b', dealType: '매매', regionCode: '1', regionName: '테스트', apartmentName: 'A', month: '2026-03', day: 1, areaM2: 84, amountManWon: 110000 },
  ];
  const summary = buildMarketSummary(records);
  const series = withChanges(getSeries(summary, '1', '매매', '60_85'));
  assert.equal(series.at(-1).mom, null);
});

test('market summary keeps each apartment size band separate', () => {
  const areas = [39.9, 40, 60, 85, 102];
  const records = areas.map((areaM2, index) => ({
    id: `band-${index}`, dealType: '매매', regionCode: '1', regionName: '테스트',
    apartmentName: `A${index}`, month: '2026-01', day: index + 1, areaM2,
    amountManWon: 50000 + index * 1000,
  }));
  const summary = buildMarketSummary(records);
  ['lt40', '40_60', '60_85', '85_102', 'gte102'].forEach((band) => {
    assert.equal(getSeries(summary, '1', '매매', band).length, 1);
  });
});

test('flat series produces a flat damped forecast', () => {
  const series = Array.from({ length: 24 }, (_, index) => ({
    month: `${2024 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`,
    monthIndex: 2024 * 12 + index,
    medianP33: 5000,
    count: 5,
  }));
  const forecast = fitDampedForecast(series, {
    asOfMonthIndex: series.at(-1).monthIndex + 1,
    incompleteMonths: 0,
    backtestMinSamples: 3,
    minConformalOrigins: 3,
    minBaselineSkillPct: 0,
  });
  assert.equal(forecast.eligible, true);
  forecast.points.forEach((point) => assert.ok(Math.abs(point.point - 5000) < 1e-6));
  assert.equal(forecast.backtestMethod, 'rolling-origin-fixed-horizon');
  assert.equal(forecast.backtestHorizonMonths, 6);
  assert.equal(forecast.backtestSamples, 7);
  assert.ok(forecast.backtestMapePct < 1e-9);
  assert.equal(forecast.referenceRangeEmpiricalCoveragePct, 100);
});

test('forecast backtest preserves time order and validates the displayed six-month horizon', () => {
  const firstMonthIndex = 2024 * 12;
  const chronological = Array.from({ length: 24 }, (_, index) => ({
    monthIndex: firstMonthIndex + index + (index >= 18 ? 1 : 0),
    medianP33: 4000 * Math.exp((index + (index >= 18 ? 1 : 0)) * .01),
    count: 5,
  }));
  const shuffled = [...chronological.slice(12), ...chronological.slice(0, 12)];
  const options = {
    phi: 1,
    asOfMonthIndex: chronological.at(-1).monthIndex + 1,
    incompleteMonths: 0,
    backtestMinSamples: 3,
    minBaselineSkillPct: -100,
  };
  const orderedForecast = fitDampedForecast(chronological, options);
  const shuffledForecast = fitDampedForecast(shuffled, options);

  assert.ok(shuffledForecast.backtestSamples >= 3);
  assert.ok(shuffledForecast.backtestMapePct < .1);
  assert.equal(shuffledForecast.backtestMapePct, orderedForecast.backtestMapePct);
  assert.equal(shuffledForecast.referenceRangeEmpiricalCoveragePct, orderedForecast.referenceRangeEmpiricalCoveragePct);
});

test('forecast is withheld when fixed-horizon holdout samples are insufficient', () => {
  const series = Array.from({ length: 14 }, (_, index) => ({
    monthIndex: 2025 * 12 + index,
    medianP33: 5000 + index * 10,
    count: 5,
  }));
  const forecast = fitDampedForecast(series, {
    minObservations: 12,
    minSpanMonths: 12,
    minTransactions: 50,
    asOfMonthIndex: series.at(-1).monthIndex + 1,
    incompleteMonths: 0,
  });

  assert.equal(forecast.eligible, false);
  assert.equal(forecast.backtestSamples, 0);
  assert.equal(forecast.backtestMapePct, null);
  assert.equal(forecast.referenceRangeEmpiricalCoveragePct, null);
  assert.ok(forecast.reasons.some((reason) => reason.includes('6개월 시계열 백테스트 원점')));
});

test('forecast refuses stale transaction history', () => {
  const series = Array.from({ length: 24 }, (_, index) => ({
    monthIndex: 2024 * 12 + index,
    medianP33: 5000 + index,
    count: 5,
  }));
  const forecast = fitDampedForecast(series, { asOfMonthIndex: series.at(-1).monthIndex + 3, incompleteMonths: 0 });
  assert.equal(forecast.eligible, false);
  assert.ok(forecast.reasons.some((reason) => reason.includes('2개월')));
});

test('current and previous incomplete months are excluded from training', () => {
  const current = 2026 * 12 + 8;
  const series = Array.from({ length: 8 }, (_, index) => ({
    monthIndex: current - 5 + index,
    medianP33: 5000 + index * 100,
    count: 5,
  }));
  const complete = excludeIncompleteMonths(series, { asOfMonthIndex: current, incompleteMonths: 2 });
  assert.deepEqual(complete.map((item) => item.monthIndex), [current - 5, current - 4, current - 3, current - 2]);
});

test('forecast ignores future and incomplete-month shocks without temporal leakage', () => {
  const first = 2022 * 12;
  const completeThrough = first + 47;
  const stable = Array.from({ length: 48 }, (_, index) => ({
    monthIndex: first + index,
    medianP33: 4000 * Math.exp(index * .006),
    count: 6,
  }));
  const shocked = stable.concat([
    { monthIndex: completeThrough + 1, medianP33: 50000, count: 100 },
    { monthIndex: completeThrough + 2, medianP33: 100, count: 100 },
    { monthIndex: completeThrough + 12, medianP33: 90000, count: 100 },
  ]);
  const options = { asOfMonthIndex: completeThrough + 2, phi: 1, incompleteMonths: 2 };
  const base = fitDampedForecast(stable, options);
  const withFuture = fitDampedForecast(shocked, options);
  assert.equal(withFuture.excludedIncompleteObservations, 3);
  assert.deepEqual(withFuture.points, base.points);
  withFuture.horizonDiagnostics.forEach((diagnostic) => {
    diagnostic.residuals.forEach((residual) => {
      assert.equal(residual.targetMonthIndex, residual.originMonthIndex + diagnostic.horizonMonths);
      assert.ok(residual.targetMonthIndex <= completeThrough);
    });
  });
});

test('safe forecast loses to the no-change baseline unless MAE improves by five percent', () => {
  const first = 2022 * 12;
  const flat = Array.from({ length: 48 }, (_, index) => ({
    monthIndex: first + index,
    medianP33: 5000,
    count: 6,
  }));
  const forecast = fitDampedForecast(flat, {
    asOfMonthIndex: flat.at(-1).monthIndex,
    incompleteMonths: 0,
  });
  assert.equal(forecast.eligible, false);
  assert.equal(forecast.backtestMase, 1);
  assert.equal(forecast.baselineSkillPct, 0);
  assert.ok(forecast.reasons.some((reason) => reason.includes('무변화 기준')));
});

test('each forecast horizon uses a finite-sample conformal residual range', () => {
  assert.equal(finiteSampleQuantile([1, 2, 3, 4], .8), 4);
  const first = 2021 * 12;
  const series = Array.from({ length: 60 }, (_, index) => ({
    monthIndex: first + index,
    medianP33: 3500 * Math.exp(index * .008 + Math.sin(index) * .006),
    count: 7,
  }));
  const forecast = fitDampedForecast(series, {
    asOfMonthIndex: series.at(-1).monthIndex,
    incompleteMonths: 0,
    phi: 1,
  });
  assert.equal(forecast.eligible, true);
  assert.equal(forecast.intervalKind, 'rolling-origin-conformal-absolute-log-error');
  assert.equal(forecast.points.length, 6);
  forecast.points.forEach((point, index) => {
    const diagnostic = forecast.horizonDiagnostics[index];
    assert.equal(point.intervalCalibrationOrigins, diagnostic.origins);
    assert.ok(point.lower <= point.point);
    assert.ok(point.upper >= point.point);
    assert.ok(Number.isFinite(diagnostic.conformalRadiusLog));
  });
});

test('sparse monthly series is withheld by rolling-origin and conformal gates', () => {
  const first = 2021 * 12;
  const sparse = Array.from({ length: 24 }, (_, index) => ({
    monthIndex: first + index * 2,
    medianP33: 4000 + index * 25,
    count: 5,
  }));
  const forecast = fitDampedForecast(sparse, {
    asOfMonthIndex: sparse.at(-1).monthIndex,
    incompleteMonths: 0,
  });
  assert.equal(forecast.eligible, false);
  assert.ok(forecast.backtestSamples < 18);
  assert.ok(forecast.reasons.some((reason) => reason.includes('백테스트 원점')));
});

test('rolling diagnostics expose horizon-specific residuals', () => {
  const first = 2023 * 12;
  const series = Array.from({ length: 36 }, (_, index) => ({
    monthIndex: first + index,
    medianP33: 4200 + index * 15,
    count: 5,
  }));
  const diagnostics = rollingOriginForecastDiagnostics(series, {
    horizons: [1, 6, 12],
    minTrainingObservations: 12,
  });
  assert.deepEqual(diagnostics.map((item) => item.horizonMonths), [1, 6, 12]);
  assert.ok(diagnostics[0].origins > diagnostics[1].origins);
  assert.ok(diagnostics[1].origins > diagnostics[2].origins);
  diagnostics.forEach((item) => assert.equal(item.residuals.length, item.origins));
});

test('unknown region does not silently fall back to the first region', () => {
  const summary = buildMarketSummary([
    { id: 'a', dealType: '매매', regionCode: '11110', regionName: '서울 종로구', apartmentName: 'A', month: '2026-01', day: 1, areaM2: 84, amountManWon: 100000 },
  ]);
  assert.equal(getRegion(summary, '99999'), null);
});

test('regional comparison uses one common transaction month', () => {
  const records = [
    { id: 'a1', dealType: '매매', regionCode: '1', regionName: 'A', apartmentName: 'A1', month: '2026-05', day: 1, areaM2: 84, amountManWon: 100000 },
    { id: 'a2', dealType: '매매', regionCode: '1', regionName: 'A', apartmentName: 'A1', month: '2026-06', day: 1, areaM2: 84, amountManWon: 110000 },
    { id: 'b1', dealType: '매매', regionCode: '2', regionName: 'B', apartmentName: 'B1', month: '2026-05', day: 1, areaM2: 84, amountManWon: 90000 },
  ];
  const ranking = latestRegionComparison(buildMarketSummary(records), '매매', '60_85');
  assert.deepEqual(new Set(ranking.map((item) => item.month)), new Set(['2026-05']));
});

test('normalization preserves official apartment sequence id', () => {
  const record = normalizeTransaction({
    aptSeq: '11110-123', dealType: '매매', regionCode: '11110', apartmentName: '테스트',
    month: '202601', day: 1, areaM2: 84.97, amountManWon: 100000,
  });
  assert.equal(record.aptSeq, '11110-123');
});

test('fallback transaction key keeps different complexes separate', () => {
  const common = {
    dealType: '매매', regionCode: '11110', regionName: '서울 종로구', apartmentName: '동명이름',
    month: '202601', day: 1, areaM2: 84, amountManWon: 100000, floor: 10,
  };
  const summary = buildMarketSummary([
    { ...common, aptSeq: 'A', dong: '청운동' },
    { ...common, aptSeq: 'B', dong: '신교동' },
  ]);
  assert.equal(summary.regions[0].recentTransactions.length, 2);
});

test('CSV apartment sequence id prevents deduping different complexes', () => {
  const csv = [
    '시군구,법정동,단지명,아파트일련번호,전용면적(㎡),계약년월,계약일,거래금액(만원),층,도로명',
    '서울특별시 종로구,청운동,동명이름,A,84,202601,1,"100,000",10,같은로',
    '서울특별시 종로구,청운동,동명이름,B,84,202601,1,"100,000",10,같은로',
  ].join('\n');
  const records = parseMolitCsv(csv);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => record.aptSeq), ['A', 'B']);
});
