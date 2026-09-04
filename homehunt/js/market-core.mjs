export const SIZE_BANDS = Object.freeze([
  { id: 'lt40', min: 0, max: 40, label: '40㎡ 미만' },
  { id: '40_60', min: 40, max: 60, label: '40–60㎡' },
  { id: '60_85', min: 60, max: 85, label: '60–85㎡' },
  { id: '85_102', min: 85, max: 102, label: '85–102㎡' },
  { id: 'gte102', min: 102, max: Infinity, label: '102㎡ 이상' },
]);

export function bandFor(areaM2) {
  const area = Number(areaM2);
  return SIZE_BANDS.find((band) => area >= band.min && area < band.max)?.id || null;
}

export function median(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function quantile(values, q) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] === undefined ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

export function average(values) {
  const valid = values.map(Number).filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function averageTotalValue(item) {
  return Number(item?.averageTotal ?? item?.meanTotal ?? item?.medianTotal);
}

function averageP33Value(item) {
  return Number(item?.averageP33 ?? item?.meanP33 ?? item?.medianP33);
}

function monthIndex(month) {
  const [year, mon] = String(month).split('-').map(Number);
  return year * 12 + (mon - 1);
}

function monthFromIndex(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function normalizeMonth(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length >= 6) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
  return '';
}

function cleanNumber(value) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(String(value).replace(/[\s,"]/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function recordKey(record) {
  return [record.dealType, record.regionCode, record.month, record.day, record.aptSeq, record.dong, record.apartmentName, record.areaM2, record.amountManWon, record.floor, record.roadName].join('|');
}

export function normalizeTransaction(raw) {
  const areaM2 = cleanNumber(raw.areaM2 ?? raw.excluUseAr ?? raw['전용면적(㎡)'] ?? raw['전용면적']);
  const saleAmount = cleanNumber(raw.amountManWon ?? raw.dealAmount ?? raw['거래금액(만원)'] ?? raw['거래금액']);
  const deposit = cleanNumber(raw.depositManWon ?? raw.deposit ?? raw['보증금액(만원)'] ?? raw['보증금액']);
  const monthlyRent = cleanNumber(raw.monthlyRentManWon ?? raw.monthlyRent ?? raw['월세금액(만원)'] ?? raw['월세금액']);
  let dealType = raw.dealType || '';
  if (!dealType) dealType = saleAmount > 0 ? '매매' : monthlyRent > 0 ? '월세' : deposit > 0 ? '전세' : '';
  const amountManWon = dealType === '매매' ? saleAmount : deposit;
  const month = normalizeMonth(raw.month ?? raw.dealYmd ?? raw['계약년월']);
  const regionName = normalizeName(raw.regionName ?? raw.district ?? raw['시군구']);
  const regionCode = String(raw.regionCode ?? raw.sggCd ?? raw['지역코드'] ?? '').trim();
  const apartmentName = normalizeName(raw.apartmentName ?? raw.aptNm ?? raw['단지명'] ?? raw['아파트']);
  const cancelled = Boolean(raw.cancelled || raw.cdealType || normalizeName(raw['해제사유발생일']) || normalizeName(raw['해제여부']) === 'O');

  if (!month || !apartmentName || areaM2 <= 0 || amountManWon <= 0 || cancelled || !['매매', '전세', '월세'].includes(dealType)) return null;
  const normalized = {
    id: String(raw.id || ''),
    aptSeq: String(raw.aptSeq ?? raw['아파트일련번호'] ?? ''),
    dealType,
    regionCode,
    regionName,
    dong: normalizeName(raw.dong ?? raw.umdNm ?? raw['법정동']),
    apartmentName,
    month,
    monthIndex: monthIndex(month),
    day: cleanNumber(raw.day ?? raw.dealDay ?? raw['계약일']),
    areaM2,
    sizeBand: bandFor(areaM2),
    amountManWon,
    depositManWon: deposit,
    monthlyRentManWon: monthlyRent,
    priceP33: amountManWon * 3.3 / areaM2,
    floor: cleanNumber(raw.floor ?? raw['층']),
    builtYear: cleanNumber(raw.builtYear ?? raw.buildYear ?? raw['건축년도']),
    roadName: normalizeName(raw.roadName ?? raw.roadNm ?? raw['도로명']),
  };
  normalized.id ||= recordKey(normalized);
  return normalized;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current.trim()); current = '';
    } else current += char;
  }
  values.push(current.trim());
  return values;
}

function normalizeHeader(value) {
  return String(value || '').replace(/^\uFEFF/, '').replace(/[\s_"]/g, '').toLowerCase();
}

function findValue(row, candidates) {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const target = normalizeHeader(candidate);
    const found = keys.find((key) => normalizeHeader(key) === target || normalizeHeader(key).includes(target));
    if (found !== undefined && row[found] !== '') return row[found];
  }
  return '';
}

export function parseMolitCsv(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter((line) => line.trim());
  const headerIndex = lines.findIndex((line) => {
    const normalized = normalizeHeader(line);
    return (normalized.includes('단지명') || normalized.includes('아파트')) && (normalized.includes('계약년월') || normalized.includes('거래금액') || normalized.includes('보증금액'));
  });
  if (headerIndex < 0) throw new Error('국토부 CSV 헤더를 찾지 못했습니다. 원본 CSV 파일인지 확인해주세요.');
  const headers = parseCsvLine(lines[headerIndex]);
  const seen = new Set();
  const records = [];

  for (const [rowIndex, line] of lines.slice(headerIndex + 1).entries()) {
    const values = parseCsvLine(line);
    if (values.every((value) => !value)) continue;
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    const raw = {
      id: `csv-row-${headerIndex + rowIndex + 2}`,
      aptSeq: findValue(row, ['아파트일련번호', '단지일련번호', 'aptSeq']),
      regionName: findValue(row, ['시군구']),
      regionCode: findValue(row, ['지역코드', '시군구코드']),
      dong: findValue(row, ['법정동', '읍면동']),
      apartmentName: findValue(row, ['단지명', '아파트']),
      month: findValue(row, ['계약년월']),
      day: findValue(row, ['계약일']),
      areaM2: findValue(row, ['전용면적(㎡)', '전용면적']),
      amountManWon: findValue(row, ['거래금액(만원)', '거래금액']),
      depositManWon: findValue(row, ['보증금액(만원)', '보증금액']),
      monthlyRentManWon: findValue(row, ['월세금액(만원)', '월세금액']),
      floor: findValue(row, ['층']),
      builtYear: findValue(row, ['건축년도', '건축년']),
      roadName: findValue(row, ['도로명']),
      cancelled: Boolean(findValue(row, ['해제사유발생일', '해제여부'])),
    };
    const record = normalizeTransaction(raw);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    records.push(record);
  }
  return records;
}

function groupBy(records, keyFn) {
  const groups = new Map();
  records.forEach((record) => {
    const key = keyFn(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  return groups;
}

function statForGroup(group, band = 'all') {
  const amounts = group.map((record) => record.amountManWon);
  const p33 = group.map((record) => record.priceP33);
  const averageTotal = average(amounts);
  const averageP33 = average(p33);
  return {
    month: group[0].month,
    monthIndex: group[0].monthIndex,
    dealType: group[0].dealType,
    band,
    count: group.length,
    complexCount: new Set(group.map((record) => record.apartmentName)).size,
    medianTotal: median(amounts),
    meanTotal: averageTotal,
    averageTotal,
    medianP33: median(p33),
    meanP33: averageP33,
    averageP33,
    q1P33: quantile(p33, .25),
    q3P33: quantile(p33, .75),
    quality: group.length >= 20 && new Set(group.map((record) => record.apartmentName)).size >= 5 ? 'high' : group.length >= 5 ? 'medium' : 'low',
  };
}

export function buildMarketSummary(records, meta = {}) {
  const normalized = records.map(normalizeTransaction).filter(Boolean);
  const deduped = [...new Map(normalized.map((record) => [record.id || recordKey(record), record])).values()];
  const regionGroups = groupBy(deduped, (record) => record.regionCode || record.regionName || 'unknown');
  const regions = [];

  regionGroups.forEach((regionRecords, code) => {
    const regionName = regionRecords.find((record) => record.regionName)?.regionName || code;
    const monthly = [];
    const allGroups = groupBy(regionRecords, (record) => `${record.dealType}|${record.month}`);
    allGroups.forEach((group) => monthly.push(statForGroup(group, 'all')));
    const bandGroups = groupBy(regionRecords.filter((record) => record.sizeBand), (record) => `${record.dealType}|${record.month}|${record.sizeBand}`);
    bandGroups.forEach((group) => monthly.push(statForGroup(group, group[0].sizeBand)));
    monthly.sort((a, b) => a.monthIndex - b.monthIndex || a.band.localeCompare(b.band));
    const recentTransactions = [...regionRecords].sort((a, b) => b.monthIndex - a.monthIndex || b.day - a.day).slice(0, 240);
    regions.push({ code, name: regionName, monthly, recentTransactions });
  });

  return {
    version: 1,
    source: meta.source || 'CSV import',
    sourceType: meta.sourceType || 'imported',
    generatedAt: meta.generatedAt || new Date().toISOString(),
    provisionalMonths: meta.provisionalMonths ?? 2,
    regions: regions.sort((a, b) => a.name.localeCompare(b.name, 'ko')),
  };
}

function seededNoise(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function buildDemoMarketSummary(regionCatalog) {
  const records = [];
  const now = new Date();
  const endIndex = now.getFullYear() * 12 + now.getMonth() - 1;
  const baseByRegion = [10400, 9200, 8600, 7200, 9800, 6500, 6100, 8700, 5200, 4100];
  const demoRegions = regionCatalog.slice(0, 10);

  demoRegions.forEach((region, regionIndex) => {
    for (let offset = 39; offset >= 0; offset -= 1) {
      const index = endIndex - offset;
      const month = monthFromIndex(index);
      ['매매', '전세'].forEach((dealType, dealIndex) => {
        const typeRatio = dealType === '전세' ? .54 : 1;
        const seasonal = Math.sin((index % 12) / 12 * Math.PI * 2) * .018;
        const trend = (39 - offset) * (regionIndex % 3 === 0 ? .0032 : .0018);
        [52, 59, 74, 84, 101].forEach((areaM2, areaIndex) => {
          for (let deal = 0; deal < 4; deal += 1) {
            const noise = (seededNoise(regionIndex * 100000 + index * 100 + areaIndex * 10 + deal + dealIndex * 7000) - .5) * .12;
            const priceP33 = baseByRegion[regionIndex] * typeRatio * (1 + seasonal + trend + noise);
            const amount = Math.round(priceP33 * areaM2 / 3.3 / 100) * 100;
            records.push(normalizeTransaction({
              id: `demo-${region.code}-${month}-${dealType}-${areaM2}-${deal}`,
              dealType,
              regionCode: region.code,
              regionName: region.name,
              dong: region.district,
              apartmentName: `${region.district} 예시 ${String.fromCharCode(65 + ((deal + areaIndex) % 4))}단지`,
              month,
              day: 3 + deal * 7,
              areaM2,
              amountManWon: dealType === '매매' ? amount : 0,
              depositManWon: dealType === '전세' ? amount : 0,
              floor: 4 + deal * 3,
              builtYear: 2005 + ((regionIndex + areaIndex) % 15),
            }));
          }
        });
      });
    }
  });
  return buildMarketSummary(records, { source: 'UI 검증용 샘플', sourceType: 'demo', provisionalMonths: 0 });
}

export function validateMarketSummary(summary) {
  return Boolean(summary && Array.isArray(summary.regions) && summary.regions.some((region) => Array.isArray(region.monthly) && region.monthly.length));
}

export function getRegion(summary, regionCode) {
  return summary?.regions?.find((region) => String(region.code) === String(regionCode)) || null;
}

export function getSeries(summary, regionCode, dealType = '매매', band = '60_85') {
  const region = getRegion(summary, regionCode);
  if (!region) return [];
  return region.monthly
    .filter((item) => item.dealType === dealType && item.band === band)
    .map((item) => ({
      ...item,
      averageTotal: averageTotalValue(item),
      averageP33: averageP33Value(item),
    }))
    .sort((a, b) => a.monthIndex - b.monthIndex);
}

export function withChanges(series) {
  const normalized = (series || []).map((item) => ({
    ...item,
    averageTotal: averageTotalValue(item),
    averageP33: averageP33Value(item),
  }));
  const byMonth = new Map(normalized.map((item) => [item.monthIndex, item]));
  return normalized.map((item) => {
    const momBase = byMonth.get(item.monthIndex - 1);
    const yoyBase = byMonth.get(item.monthIndex - 12);
    const change = (base, field) => !base || !base[field] ? null : {
      amount: item[field] - base[field],
      pct: (item[field] / base[field] - 1) * 100,
      lowSample: item.count < 3 || base.count < 3,
    };
    return { ...item, mom: change(momBase, 'averageP33'), yoy: change(yoyBase, 'averageP33') };
  });
}

export function latestRegionComparison(summary, dealType = '매매', band = '60_85') {
  const candidates = (summary?.regions || []).map((region) => ({
    region,
    series: region.monthly.filter((item) => item.dealType === dealType && item.band === band),
  })).filter((item) => item.series.length);
  if (!candidates.length) return [];
  const countsByMonth = new Map();
  candidates.forEach(({ series }) => {
    new Set(series.map((item) => item.monthIndex)).forEach((index) => countsByMonth.set(index, (countsByMonth.get(index) || 0) + 1));
  });
  const commonMonthIndex = [...countsByMonth.entries()]
    .filter(([, count]) => count === candidates.length)
    .map(([index]) => index)
    .sort((a, b) => b - a)[0];
  if (commonMonthIndex === undefined) return [];
  return candidates.map(({ region, series }) => {
    const latest = series.find((item) => item.monthIndex === commonMonthIndex);
    return {
      code: region.code,
      name: region.name,
      ...latest,
      averageTotal: averageTotalValue(latest),
      averageP33: averageP33Value(latest),
    };
  }).sort((a, b) => b.averageP33 - a.averageP33);
}

export function getRecentTransactions(summary, regionCode, dealType = '매매', band = '60_85') {
  const region = getRegion(summary, regionCode);
  if (!region) return [];
  return (region.recentTransactions || []).filter((record) => record.dealType === dealType && (band === 'all' || record.sizeBand === band));
}

function dampedStepCount(phi, step) {
  return Math.abs(1 - phi) < 1e-12 ? step : (1 - phi ** step) / (1 - phi);
}

function currentMonthIndex() {
  const now = new Date();
  return now.getFullYear() * 12 + now.getMonth();
}

function normalizeForecastSeries(series) {
  const byMonth = new Map();
  (series || []).forEach((item) => {
    const index = Number(item?.monthIndex);
    const price = averageP33Value(item);
    const count = Number(item?.count);
    if (!Number.isInteger(index) || !Number.isFinite(price) || price <= 0 || !Number.isFinite(count)) return;
    byMonth.set(index, { ...item, monthIndex: index, averageP33: price, count });
  });
  return [...byMonth.values()].sort((a, b) => a.monthIndex - b.monthIndex);
}

/**
 * Remove months whose public transaction feed is still expected to change.
 * With the product default of two months, a September run trains only through
 * July. Future-dated rows are removed by the same cutoff.
 */
export function excludeIncompleteMonths(series, {
  asOfMonthIndex = currentMonthIndex(),
  incompleteMonths = 2,
} = {}) {
  const safeAsOf = Number.isInteger(Number(asOfMonthIndex)) ? Number(asOfMonthIndex) : currentMonthIndex();
  const lag = Math.max(0, Math.floor(Number(incompleteMonths) || 0));
  const completeThroughMonthIndex = safeAsOf - lag;
  return normalizeForecastSeries(series).filter((item) => item.monthIndex <= completeThroughMonthIndex);
}

/**
 * Split-conformal finite-sample order statistic. Unlike an interpolated
 * percentile, ceil((n + 1) * coverage) preserves the requested marginal
 * coverage guarantee (up to the finite calibration sample available).
 */
export function finiteSampleQuantile(values, coverage = .8) {
  const sorted = (values || []).map(Number).filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const safeCoverage = Math.min(.999999, Math.max(.000001, Number(coverage) || .8));
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((sorted.length + 1) * safeCoverage)));
  return sorted[rank - 1];
}

function fitDampedModel(observations) {
  const lastIndex = observations.at(-1).monthIndex;
  const data = observations.map((item) => ({
    x: item.monthIndex - lastIndex,
    z: Math.log(item.averageP33),
    w: Math.min(item.count, 20),
  }));
  const sw = data.reduce((sum, item) => sum + item.w, 0);
  if (!sw) return null;
  const xbar = data.reduce((sum, item) => sum + item.w * item.x, 0) / sw;
  const zbar = data.reduce((sum, item) => sum + item.w * item.z, 0) / sw;
  const denom = data.reduce((sum, item) => sum + item.w * (item.x - xbar) ** 2, 0);
  if (denom < 1e-12) return null;
  const slope = data.reduce((sum, item) => sum + item.w * (item.x - xbar) * (item.z - zbar), 0) / denom;
  const levelLog = zbar - slope * xbar;
  const residuals = data.map((item) => item.z - (levelLog + slope * item.x));
  const residualMedian = median(residuals) || 0;
  const mad = median(residuals.map((value) => Math.abs(value - residualMedian))) || .03;
  const sigma = Math.max(1.4826 * mad, .015);
  return { lastIndex, slope, levelLog, sigma };
}

function forecastPointFromModel(model, phi, step) {
  const safeStep = Math.max(1, Math.round(step));
  return Math.exp(model.levelLog + model.slope * dampedStepCount(phi, safeStep));
}

function baselineScores(modelMae, naiveMae) {
  if (naiveMae > 1e-9) {
    const mase = modelMae / naiveMae;
    return { mase, skillPct: (1 - mase) * 100 };
  }
  // When both methods are exact there is no demonstrated improvement over the
  // simpler method. A non-zero model error against a zero-error baseline is a
  // decisive loss. Keep all public diagnostics finite and JSON-safe.
  return modelMae <= 1e-9
    ? { mase: 1, skillPct: 0 }
    : { mase: null, skillPct: -100 };
}

function oneHorizonRollingDiagnostics(usable, {
  windowMonths,
  phi,
  horizon,
  minTrainingObservations,
  conformalCoverage,
}) {
  const residuals = [];
  const actualByMonth = new Map(usable.map((item) => [item.monthIndex, item]));

  // Each origin sees only rows at or before that origin. Missing exact target
  // months are skipped instead of silently shortening the displayed horizon.
  for (let originPosition = minTrainingObservations - 1; originPosition < usable.length; originPosition += 1) {
    const origin = usable[originPosition];
    const windowStart = origin.monthIndex - windowMonths + 1;
    const training = usable.slice(0, originPosition + 1).filter((item) => item.monthIndex >= windowStart);
    if (training.length < minTrainingObservations) continue;
    const model = fitDampedModel(training);
    if (!model) continue;
    const actual = actualByMonth.get(model.lastIndex + horizon);
    if (!actual) continue;
    const predicted = forecastPointFromModel(model, phi, horizon);
    const naive = training.at(-1).averageP33;
    residuals.push({
      originMonthIndex: model.lastIndex,
      targetMonthIndex: actual.monthIndex,
      predicted,
      naive,
      actual: actual.averageP33,
      absoluteError: Math.abs(actual.averageP33 - predicted),
      naiveAbsoluteError: Math.abs(actual.averageP33 - naive),
      absolutePercentageErrorPct: Math.abs(actual.averageP33 - predicted) / actual.averageP33 * 100,
      absoluteLogError: Math.abs(Math.log(actual.averageP33 / predicted)),
    });
  }

  const modelMae = average(residuals.map((item) => item.absoluteError));
  const naiveMae = average(residuals.map((item) => item.naiveAbsoluteError));
  const { mase, skillPct } = baselineScores(modelMae ?? 0, naiveMae ?? 0);
  const conformalRadiusLog = finiteSampleQuantile(residuals.map((item) => item.absoluteLogError), conformalCoverage);
  const empiricalCoveragePct = conformalRadiusLog === null || !residuals.length
    ? null
    : residuals.filter((item) => item.absoluteLogError <= conformalRadiusLog + Number.EPSILON).length / residuals.length * 100;
  return {
    backtestMethod: 'rolling-origin-fixed-horizon',
    horizonMonths: horizon,
    origins: residuals.length,
    modelMae,
    naiveMae,
    mase,
    skillPct,
    modelMapePct: average(residuals.map((item) => item.absolutePercentageErrorPct)),
    conformalCoveragePct: conformalCoverage * 100,
    conformalRadiusLog,
    empiricalCoveragePct,
    backtestMinTrainingObservations: minTrainingObservations,
    residuals,
  };
}

/**
 * Horizon-specific rolling-origin diagnostics. The returned residual records
 * expose origin and target months so callers/tests can audit temporal leakage.
 */
export function rollingOriginForecastDiagnostics(series, {
  windowMonths = 36,
  phi = .85,
  horizons = [6],
  minTrainingObservations = 12,
  conformalCoverage = .8,
} = {}) {
  const usable = normalizeForecastSeries(series);
  const safeHorizons = [...new Set((horizons || []).map(Number).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
  return safeHorizons.map((horizon) => oneHorizonRollingDiagnostics(usable, {
    windowMonths,
    phi,
    horizon,
    minTrainingObservations,
    conformalCoverage,
  }));
}

function productMinOrigins(horizon) {
  // Product safety gates agreed for the two supported forecast horizons.
  // Shorter horizons use the stricter six-month calibration requirement.
  return horizon <= 6 ? 18 : 12;
}

function minOriginsForHorizon(horizon, backtestMinSamples, minOriginsByHorizon) {
  const exactOverride = Number(minOriginsByHorizon?.[horizon]);
  if (Number.isFinite(exactOverride) && exactOverride >= 1) return Math.floor(exactOverride);
  const universalOverride = Number(backtestMinSamples);
  if (Number.isFinite(universalOverride) && universalOverride >= 1) return Math.floor(universalOverride);
  return productMinOrigins(horizon);
}

export function fitDampedForecast(series, {
  windowMonths = 36,
  phi = .85,
  horizon = 6,
  minMonthlyCount = 3,
  minObservations = 18,
  minSpanMonths = 24,
  minTransactions = 50,
  maxStaleMonths = 2,
  backtestMinTrainingObservations = 12,
  backtestMinSamples,
  minOriginsByHorizon,
  minConformalOrigins = 8,
  minBaselineSkillPct = 5,
  conformalCoverage = .8,
  incompleteMonths = 2,
  maxBacktestMapePct = 20,
  asOfMonthIndex = currentMonthIndex(),
} = {}) {
  const normalized = normalizeForecastSeries(series);
  const completeSeries = excludeIncompleteMonths(normalized, { asOfMonthIndex, incompleteMonths });
  const latestCompleteObservation = completeSeries.at(-1)?.monthIndex;
  const windowStart = Number.isInteger(latestCompleteObservation) ? latestCompleteObservation - windowMonths + 1 : Infinity;
  const usable = completeSeries
    .filter((item) => item.count >= minMonthlyCount && item.averageP33 > 0)
    .filter((item) => item.monthIndex >= windowStart);
  const transactionCount = usable.reduce((sum, item) => sum + item.count, 0);
  const calendarSpanMonths = usable.length ? usable.at(-1).monthIndex - usable[0].monthIndex + 1 : 0;
  const staleMonths = usable.length ? Math.max(0, asOfMonthIndex - usable.at(-1).monthIndex) : null;
  const horizons = Array.from({ length: Math.max(1, Math.floor(horizon)) }, (_, index) => index + 1);
  const horizonDiagnostics = rollingOriginForecastDiagnostics(usable, {
    windowMonths,
    phi,
    horizons,
    minTrainingObservations: backtestMinTrainingObservations,
    conformalCoverage,
  });
  const finalBacktest = horizonDiagnostics.find((item) => item.horizonMonths === horizon) || horizonDiagnostics.at(-1);
  const requiredBacktestOrigins = minOriginsForHorizon(horizon, backtestMinSamples, minOriginsByHorizon);
  const diagnostics = {
    observations: usable.length,
    transactionCount,
    calendarSpanMonths,
    coveragePct: calendarSpanMonths ? usable.length / calendarSpanMonths * 100 : 0,
    staleMonths,
    minMonthlyCount,
    asOfMonthIndex,
    completeThroughMonthIndex: asOfMonthIndex - Math.max(0, Math.floor(Number(incompleteMonths) || 0)),
    excludedIncompleteObservations: normalized.length - completeSeries.length,
    incompleteMonths: Math.max(0, Math.floor(Number(incompleteMonths) || 0)),
    backtestMethod: 'rolling-origin-fixed-horizon',
    backtestHorizonMonths: horizon,
    backtestSamples: finalBacktest?.origins || 0,
    backtestMapePct: finalBacktest?.modelMapePct ?? null,
    backtestModelMae: finalBacktest?.modelMae ?? null,
    backtestNaiveMae: finalBacktest?.naiveMae ?? null,
    backtestMase: finalBacktest?.mase ?? null,
    baselineSkillPct: finalBacktest?.skillPct ?? null,
    baselineMethod: 'last-observation-carried-forward',
    referenceRangeEmpiricalCoveragePct: finalBacktest?.empiricalCoveragePct ?? null,
    conformalCoveragePct: conformalCoverage * 100,
    backtestMinTrainingObservations,
    backtestMinSamples: requiredBacktestOrigins,
    horizonDiagnostics,
  };
  const reasons = [];
  if (usable.length < minObservations) reasons.push(`유효한 월별 표본이 ${minObservations}개월보다 적어요.`);
  if (usable.length && calendarSpanMonths < minSpanMonths) reasons.push(`관측 기간이 ${minSpanMonths}개월보다 짧아요.`);
  if (transactionCount < minTransactions) reasons.push(`전체 거래 표본이 ${minTransactions}건보다 적어요.`);
  if (usable.length && staleMonths > maxStaleMonths) reasons.push(`마지막 유효 거래월이 ${maxStaleMonths}개월보다 오래됐어요.`);
  if ((finalBacktest?.origins || 0) < requiredBacktestOrigins) reasons.push(`${horizon}개월 시계열 백테스트 원점이 ${requiredBacktestOrigins}회보다 적어요.`);
  const weakInterval = horizonDiagnostics.find((item) => item.origins < minConformalOrigins || item.conformalRadiusLog === null);
  if (weakInterval) reasons.push(`${weakInterval.horizonMonths}개월 불확실성 구간 표본이 ${minConformalOrigins}회보다 적어요.`);
  if (!Number.isFinite(finalBacktest?.skillPct) || finalBacktest.skillPct < minBaselineSkillPct) {
    reasons.push(`무변화 기준보다 백테스트 MAE를 ${minBaselineSkillPct}% 이상 줄이지 못했어요.`);
  }
  if (Number.isFinite(finalBacktest?.modelMapePct) && finalBacktest.modelMapePct > maxBacktestMapePct) {
    reasons.push(`시간순 백테스트 평균 오차가 ${maxBacktestMapePct}%를 넘어요.`);
  }
  if (reasons.length) return { eligible: false, reasons, points: [], ...diagnostics };

  const model = fitDampedModel(usable);
  if (!model) return { eligible: false, reasons: ['시간에 따른 변동을 계산할 수 없어요.'], points: [], ...diagnostics };
  const { lastIndex, slope, sigma } = model;
  const points = [];
  for (let step = 1; step <= horizon; step += 1) {
    const point = forecastPointFromModel(model, phi, step);
    const calibration = horizonDiagnostics.find((item) => item.horizonMonths === step);
    const radius = calibration?.conformalRadiusLog;
    points.push({
      monthIndex: lastIndex + step,
      month: monthFromIndex(lastIndex + step),
      point,
      lower: point * Math.exp(-radius),
      upper: point * Math.exp(radius),
      intervalCalibrationOrigins: calibration.origins,
      intervalCoveragePct: conformalCoverage * 100,
    });
  }
  const monthlyTrendPct = (Math.exp(slope) - 1) * 100;
  const latestMonthIndex = usable.at(-1).monthIndex;
  const recentVolume = usable.filter((item) => item.monthIndex >= latestMonthIndex - 5).reduce((sum, item) => sum + item.count, 0);
  const previousVolume = usable.filter((item) => item.monthIndex >= latestMonthIndex - 11 && item.monthIndex <= latestMonthIndex - 6).reduce((sum, item) => sum + item.count, 0);
  const finalPoint = points.at(-1);
  return {
    eligible: true,
    points,
    monthlyTrendPct,
    slope,
    residualScale: sigma,
    residualVolatilityPct: sigma * 100,
    recentVolume,
    previousVolume,
    volumeChangePct: previousVolume ? (recentVolume / previousVolume - 1) * 100 : null,
    finalRangeWidthPct: finalPoint ? (finalPoint.upper - finalPoint.lower) / finalPoint.point * 100 : null,
    intervalKind: 'rolling-origin-conformal-absolute-log-error',
    ...diagnostics,
  };
}

export function monthLabel(month) {
  const [year, mon] = String(month).split('-');
  return `${String(year).slice(2)}.${mon}`;
}
