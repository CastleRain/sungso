const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const month = value => typeof value === 'string' && /^\d{4}(0[1-9]|1[0-2])$/.test(value);
const count = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 120 ? value : null;
const months = value => [...new Set((Array.isArray(value) ? value : []).filter(month))].sort();

/** Official price coverage only. Unknown input never becomes complete coverage. */
export function normalizePriceCoverage(value) {
  const input = object(value) ? value : {};
  const completed = count(input.completedMonthCount), total = count(input.totalMonthCount);
  const missingMonths = months(input.missingMonths), staleMonths = months(input.staleMonths);
  const malformedMonths = ['missingMonths', 'staleMonths'].some(key => own(input, key)
    && (!Array.isArray(input[key]) || input[key].some(value => !month(value))));
  const validCounts = completed !== null && total !== null && total > 0 && completed <= total;
  let status = ['complete', 'partial', 'stale', 'missing'].includes(input.status) ? input.status : 'missing';
  if (!validCounts || malformedMonths) status = 'missing';
  else if (staleMonths.length) status = 'stale';
  else if (status === 'complete' && (completed < total || missingMonths.length)) status = 'partial';
  const stamp = typeof input.sourceUpdatedAt === 'string' ? input.sourceUpdatedAt : '';
  const parsed = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(stamp) ? new Date(stamp) : null;
  const sourceUpdatedAt = parsed && Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === stamp.slice(0, 10) ? parsed.toISOString() : '';
  return { status, completedMonthCount: validCounts ? completed : 0, totalMonthCount: total ?? 0,
    missingMonths, staleMonths, sourceUpdatedAt };
}

/** The label qualifies the mean; it does not claim that missing months passed. */
export function priceCoverageLabel(candidate = {}) {
  const coverage = normalizePriceCoverage(candidate?.priceCoverage);
  const { status, completedMonthCount: completed, totalMonthCount: total } = coverage;
  const period = total ? `${completed}/${total}개월 확인` : '조회 범위 미확인';
  const labels = values => values.map(value => `${value.slice(0, 4)}.${value.slice(4)}`).join(', ');
  if (status === 'complete' && candidate.priceProvisional !== true) return `가격 자료 ${period}`;
  if (status === 'missing') return `잠정 가격 · ${period}`;
  const details = [status === 'stale' ? '이전 자료 포함' : '',
    coverage.missingMonths.length ? `누락 ${labels(coverage.missingMonths)}` : '',
    coverage.staleMonths.length ? `갱신 대기 ${labels(coverage.staleMonths)}` : ''].filter(Boolean);
  return ['잠정 가격', period, ...details].join(' · ');
}

const LIVE_FIELDS = [
  'lat', 'lng', 'locationPrecision', 'mapCoordinateSource', 'locationReference',
  'coordinateSource', 'coordinateType', 'locationSource', 'geocodeProvider',
  'routesByDestination', 'commuteByDestination', 'commute', 'commuteScreening',
  'commuteBalance', 'commuteVerification', 'commuteProvider', 'destinationFingerprint',
  'parkingEvidence',
];
const DERIVED_FIELDS = [
  'personalizedRecommendation', 'locationRecommendation', 'recommendationScore',
  'totalScore', 'score', 'referenceScore', 'rank', 'recommendationRank',
  'commuteDecision', 'commuteStatus', 'commuteVerified', 'transportVerified', 'transportStatus',
];
const id = candidate => ['string', 'number'].includes(typeof candidate?.catalogId)
  ? String(candidate.catalogId).trim() : '';

/**
 * In-memory only. `next` is the whole newly aggregated result, not a delta.
 * Absent IDs have left the price result and must not be silently kept. Preserve
 * route facts for unchanged houses, then let the caller rerank against new prices.
 */
export function mergeRetriedPriceResults(previous = [], next = []) {
  const prior = new Map((Array.isArray(previous) ? previous : []).filter(object).map(item => [id(item), item]));
  const seen = new Set();
  return (Array.isArray(next) ? next : []).filter(item => object(item) && id(item) && !seen.has(id(item)) && seen.add(id(item)))
    .map(item => {
      const before = prior.get(id(item));
      const sameHouse = before && !['address', 'aptSeq'].some(key => before[key] && item[key] && before[key] !== item[key]);
      const retained = sameHouse ? Object.fromEntries(LIVE_FIELDS.filter(key => own(before, key))
        .map(key => [key, before[key]])) : {};
      const result = structuredClone({ ...retained, ...item });
      for (const key of DERIVED_FIELDS) delete result[key];
      if (own(item, 'priceCoverage')) {
        result.priceCoverage = normalizePriceCoverage(item.priceCoverage);
        result.priceProvisional = item.priceProvisional === true || result.priceCoverage.status !== 'complete';
      }
      return result;
    });
}
