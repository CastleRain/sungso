/**
 * Presentation-only alignment: the forecast model remains in 만원 / 3.3㎡.
 * Observed total prices are the actual arithmetic means, never reconstructed
 * from rounded areas. Missing values stay null so charts cannot imply zero.
 */

function positive(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function monthIndex(value) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value || ''));
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

function monthKey(index) {
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;
}

function rowsByMonth(rows) {
  const output = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    const index = monthIndex(row.month);
    // Month labels own chart identity; caller-supplied indexes cannot reorder
    // labels or make an invalid month valid. A later duplicate is a correction.
    if (index !== null) output.set(index, row);
  }
  return output;
}

/**
 * Align the latest 18 calendar months of actual data with eligible forecasts.
 * Forecasts may overlap recent actual months excluded by the model's quality
 * gate. Each month therefore has one x position shared by all datasets.
 *
 * A bridge exists only at the exact month immediately before the first
 * forecast point, and only if its displayed actual value is known.
 */
export function buildForecastChartSeries(series, forecast, { areaM2 } = {}) {
  const area = positive(areaM2);
  const unit = area === null ? 'p33' : 'total';
  const scale = area === null ? 1 : area / 3.3;
  const actualField = area === null ? 'averageP33' : 'averageTotal';
  const allActual = rowsByMonth(series);
  const lastActualMonth = allActual.size ? Math.max(...allActual.keys()) : null;
  const actual = new Map([...allActual].filter(([index]) => index >= lastActualMonth - 17));
  const predictions = rowsByMonth(forecast?.eligible === true ? forecast.points : []);
  const indexes = [...new Set([...actual.keys(), ...predictions.keys()])].sort((left, right) => left - right);
  const firstForecastMonth = predictions.size ? Math.min(...predictions.keys()) : null;
  const bridgeMonth = firstForecastMonth === null ? null : firstForecastMonth - 1;
  const bridgeValue = bridgeMonth !== null ? positive(actual.get(bridgeMonth)?.[actualField]) : null;
  const scaled = (value) => {
    const number = positive(value);
    const converted = number === null ? null : number * scale;
    return converted !== null && Number.isFinite(converted) ? converted : null;
  };
  const forecastValue = (index, field) => {
    if (index === bridgeMonth && bridgeValue !== null) return bridgeValue;
    return scaled(predictions.get(index)?.[field]);
  };
  return {
    months: indexes.map(monthKey),
    actualValues: indexes.map((index) => positive(actual.get(index)?.[actualField])),
    predictedValues: indexes.map((index) => forecastValue(index, 'point')),
    lowerValues: indexes.map((index) => forecastValue(index, 'lower')),
    upperValues: indexes.map((index) => forecastValue(index, 'upper')),
    unit,
  };
}
