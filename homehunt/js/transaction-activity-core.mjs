const ACTIVITY_STATUSES = new Set(['complete', 'partial', 'stale', 'missing']);
const MAX_MONTHS = 120;
const round = (value) => Math.round(value * 100) / 100;
const clamp01 = (value) => Math.min(1, Math.max(0, value));

function monthIndex(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  return match && Number(match[1]) > 0 ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

function daysInMonth(year, month) {
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function isoTimestamp(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(0[1-9]|1[0-2])-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/);
  if (!match || Number(match[1]) < 1 || Number(match[3]) < 1
      || Number(match[3]) > daysInMonth(Number(match[1]), Number(match[2]))) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : false;
}

function consecutive(months) {
  return months.length > 0 && monthIndex(months.at(-1)) - monthIndex(months[0]) + 1 === months.length;
}

/** Public, scalar-only monthly counts. No route, personal or derived-score fields survive. */
export function normalizeTransactionActivity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.version !== 1 || value.scope !== 'complex-sale' || !ACTIVITY_STATUSES.has(value.status)
      || !Array.isArray(value.requestedMonths) || !Array.isArray(value.monthlyCounts)
      || value.requestedMonths.length > MAX_MONTHS || value.monthlyCounts.length > MAX_MONTHS) return null;
  if (value.requestedMonths.some((month) => monthIndex(month) === null)) return null;
  const requestedMonths = [...value.requestedMonths].sort();
  const requested = new Set(requestedMonths);
  if (requested.size !== requestedMonths.length
      || requestedMonths.length && monthIndex(requestedMonths.at(-1)) - monthIndex(requestedMonths[0]) + 1 > MAX_MONTHS) return null;
  const seen = new Set();
  const monthlyCounts = [];
  let total = 0;
  for (const row of value.monthlyCounts) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !requested.has(row.month)
        || seen.has(row.month) || !Number.isSafeInteger(row.count) || row.count < 0) return null;
    total += row.count;
    if (!Number.isSafeInteger(total)) return null;
    seen.add(row.month);
    monthlyCounts.push({ month: row.month, count: row.count });
  }
  monthlyCounts.sort((left, right) => left.month.localeCompare(right.month));
  const sourceUpdatedAt = isoTimestamp(value.sourceUpdatedAt);
  if (sourceUpdatedAt === false) return null;
  let status = value.status;
  if (status === 'complete' && !requestedMonths.length) status = 'missing';
  else if (status === 'complete' && (!consecutive(requestedMonths) || monthlyCounts.length !== requestedMonths.length)) status = 'partial';
  return { version: 1, scope: 'complex-sale', status, requestedMonths, monthlyCounts, sourceUpdatedAt };
}

function currentSeoulMonth() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

function householdCount(value) {
  if (value === null || value === undefined || typeof value === 'boolean'
      || typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/**
 * Fixed preference for observed whole-complex sale activity, not a forecast of
 * sale speed or price appreciation. Verified zero and unknown stay distinct.
 * Volume / monthly turnover / consistency receive 2 / 2 / 1 points at maxScore 5.
 * Unknown households withhold the turnover points without reallocating them.
 */
export function transactionActivityDimension(candidate, { asOfMonth = currentSeoulMonth(), maxScore = 5 } = {}) {
  const activity = normalizeTransactionActivity(candidate?.transactionActivity);
  const weight = typeof maxScore === 'number' && Number.isFinite(maxScore) && maxScore >= 0 ? maxScore : 5;
  const asOf = monthIndex(asOfMonth);
  const months = activity?.requestedMonths || [];
  const rows = activity?.monthlyCounts || [];
  const rangeStart = months[0] || null;
  const rangeEnd = months.at(-1) || null;
  const windowEnd = monthIndex(rangeEnd);
  const staleMonths = asOf !== null && windowEnd !== null ? asOf - windowEnd : null;
  const reportingProvisional = asOf !== null && windowEnd === asOf;
  const rowsByMonth = new Set(rows.map((row) => row.month));
  const missingMonths = months.filter((month) => !rowsByMonth.has(month));
  const structuralCoverage = consecutive(months) && !missingMonths.length;
  const coverageComplete = activity?.status === 'complete' && structuralCoverage;
  const households = householdCount(candidate?.households);
  const reasons = [];
  if (!activity) reasons.push(candidate?.transactionActivity == null ? 'missing-metadata' : 'malformed-metadata');
  else {
    if (activity.status !== 'complete') reasons.push(`${activity.status}-coverage`);
    if (!months.length) reasons.push('empty-period');
    else if (!consecutive(months)) reasons.push('non-contiguous-period');
    if (missingMonths.length) reasons.push('missing-months');
  }
  if (asOf === null) reasons.push('invalid-reference-month');
  if (staleMonths !== null && staleMonths < 0) reasons.push('future-period');
  if (staleMonths !== null && staleMonths > 2) reasons.push('outdated-period');
  if (activity?.sourceUpdatedAt && asOf !== null && monthIndex(activity.sourceUpdatedAt.slice(0, 7)) > asOf) reasons.push('future-source-update');
  const scoreable = coverageComplete && reasons.length === 0;
  if (scoreable && households === null) reasons.push('households-unknown');
  const observedCount = rows.reduce((sum, row) => sum + row.count, 0);
  const verifiedCounts = structuralCoverage && ['complete', 'stale'].includes(activity?.status);
  const totalCount = verifiedCounts ? observedCount : null;
  const monthlyAverage = verifiedCounts ? observedCount / months.length : null;
  const activeMonthCount = rows.filter((row) => row.count > 0).length;
  const consistencyDenominator = Math.max(3, months.length);
  const monthlyTurnoverRate = monthlyAverage !== null && households !== null ? monthlyAverage / households : null;
  const component = (value, utility, share, known, label) => ({
    value, score: known ? round(weight * share * clamp01(utility)) : 0,
    maxScore: weight * share, status: known ? 'calculated' : 'unknown', label,
  });
  const components = {
    volume: component(monthlyAverage, monthlyAverage === null ? 0 : Math.log1p(monthlyAverage) / Math.log1p(10), .4, scoreable, '단지 전체 월평균 매매건수'),
    turnover: component(monthlyTurnoverRate, monthlyTurnoverRate === null ? 0 : monthlyTurnoverRate / .005, .4, scoreable && households !== null, '세대수 대비 월평균 매매 회전율'),
    consistency: component(structuralCoverage ? activeMonthCount / consistencyDenominator : null,
      activeMonthCount / consistencyDenominator, .2, scoreable, '매매가 확인된 월의 비율 · 최소 3개월 분모'),
  };
  const knownMaxScore = round(Object.values(components).reduce((sum, item) => sum + (item.status === 'calculated' ? item.maxScore : 0), 0));
  const periodLabel = rangeStart && rangeEnd ? `${rangeStart}~${rangeEnd}` : '조회기간 미확인';
  const quantityLabel = `${months.length}개월 ${observedCount.toLocaleString('ko-KR')}건`;
  const label = scoreable
    ? `단지 전체 매매 ${periodLabel} · ${quantityLabel} · 월평균 ${monthlyAverage.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}건${households === null ? ' · 세대수 보정 미확인' : ''}${reportingProvisional ? ' · 최근월 신고 진행 중' : ''}`
    : activity && rows.length
      ? `단지 전체 매매 확인 ${observedCount.toLocaleString('ko-KR')}건 · ${periodLabel} · ${staleMonths > 2 || activity.status === 'stale' ? '오래된 자료로 ' : ''}점수 보류`
      : '단지 전체 매매 거래량 미확인';
  return {
    value: scoreable ? monthlyAverage : null,
    score: scoreable ? Math.min(weight, round(Object.values(components).reduce((sum, item) => sum + item.score, 0))) : 0,
    maxScore: weight, knownMaxScore, status: scoreable ? 'calculated' : 'unknown', label,
    source: '국토교통부 단지 전체 매매 실거래', sourceUpdatedAt: activity?.sourceUpdatedAt || null,
    activityStatus: activity?.status || 'missing', coverageComplete, reportingProvisional,
    rangeStart, rangeEnd, requestedMonthCount: months.length, observedMonthCount: rows.length,
    missingMonths, observedCount, totalCount, monthlyAverage, activeMonthCount,
    consistencyDenominator, households, monthlyTurnoverRate, staleMonths,
    reasons, components,
    scoreMeaning: '관측된 단지 전체 매매건수·세대수 보정 회전율·월별 꾸준함에 대한 선호점수이며, 미래 매도속도나 가격상승 확률이 아닙니다.',
  };
}
