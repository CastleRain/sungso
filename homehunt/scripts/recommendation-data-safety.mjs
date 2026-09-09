import { aggregateRecommendationRecords } from '../js/recommendation-core.mjs';
import { normalizeTransactionActivity } from '../js/transaction-activity-core.mjs';

function normalizedTask(task = {}) {
  return {
    lawdCd: String(task.lawdCd || '').trim(),
    dealYmd: String(task.dealYmd || '').trim(),
    type: String(task.type || 'sale').trim(),
  };
}

function failure(task, kind, message, extra = {}) {
  return {
    ...normalizedTask(task),
    kind,
    message: String(message || '조회 실패'),
    ...extra,
  };
}

export function recommendationMonthFailure(outcome, task) {
  if (!outcome || outcome.status !== 'fulfilled') {
    return failure(task, 'failed', outcome?.reason?.message || '조회 실패');
  }

  const value = outcome.value;
  if (!value || !Array.isArray(value.records)) {
    return failure(task, 'invalid', '국토부 월 응답에 완전한 거래 목록이 없습니다.');
  }

  const expected = normalizedTask(task);
  if (String(value.lawdCd || '') !== expected.lawdCd
    || String(value.dealYmd || '') !== expected.dealYmd
    || String(value.type || '') !== expected.type) {
    return failure(task, 'invalid', '국토부 월 응답의 지역·월·거래유형이 요청과 다릅니다.');
  }

  const missingRequests = Array.isArray(value.missingRequests) ? value.missingRequests : [];
  if (value.partial === true || value.warning || missingRequests.length) {
    const warning = value.warning && typeof value.warning === 'object' ? value.warning : {};
    const firstMissing = missingRequests.find((item) => item && typeof item === 'object') || {};
    return failure(
      task,
      'partial',
      warning.reason || firstMissing.reason || '국토부 월 자료가 일부만 수집되었습니다.',
      { staleCacheUsed: Boolean(warning.staleCacheUsed || firstMissing.staleCacheUsed) },
    );
  }

  return null;
}

export function recommendationMonthEvidence(outcome, task) {
  const monthFailure = recommendationMonthFailure(outcome, task);
  if (!monthFailure) return { status: 'complete', records: outcome.value.records, sourceUpdatedAt: outcome.value.updatedAt || null };
  const value = outcome?.status === 'fulfilled' ? outcome.value : null;
  const expected = normalizedTask(task);
  const validStale = monthFailure.kind === 'partial' && value?.warning?.staleCacheUsed === true
    && value.partial !== true && !(value.missingRequests || []).length
    && Number.isFinite(Date.parse(String(value.updatedAt || '')))
    && value.records.every((record) => String(record?.regionCode || '') === expected.lawdCd
      && String(record?.month || '').replace('-', '') === expected.dealYmd);
  return validStale ? { status: 'stale', records: value.records, sourceUpdatedAt: value.updatedAt }
    : { status: 'missing', records: [], sourceUpdatedAt: null };
}

export function completeRecommendationScope(candidates, records, failures, staleTasks = []) {
  const incompleteDistrictCodes = [...new Set(
    (failures || [])
      .map((item) => String(item?.lawdCd || '').trim())
      .filter((code) => /^\d{5}$/.test(code)),
  )].sort();
  const sourceCandidates = Array.isArray(candidates) ? candidates : [];
  const sourceRecords = Array.isArray(records) ? records : [];
  const staleKeys = new Set(staleTasks.map(recommendationTaskKey));
  const missingMonths = new Set((failures || []).map(recommendationTaskKey).filter((key) => !staleKeys.has(key)));
  // A failed page/month is never used as price evidence, but another validated
  // month in the same district remains useful. Do not discard that district.
  const completeRecords = sourceRecords.filter((item) => !missingMonths.has(recommendationTaskKey({
    lawdCd: item?.regionCode, dealYmd: String(item?.month || '').replace('-', ''), type: 'sale',
  })));

  return {
    candidates: sourceCandidates,
    records: completeRecords,
    incompleteDistrictCodes,
    excludedCandidateCount: 0,
    excludedRecordCount: sourceRecords.length - completeRecords.length,
  };
}

export function recommendationTaskKey(task) {
  const value = normalizedTask(task);
  return `${value.lawdCd}|${value.dealYmd}|${value.type}`;
}

export function buildRecommendationPriceResult(candidates, records, failures, tasks, filters, currentYear, staleTasks = []) {
  const scope = completeRecommendationScope(candidates, records, failures, staleTasks);
  const byDistrict = new Map();
  for (const task of tasks || []) {
    const code = String(task.lawdCd || '');
    if (!/^\d{5}$/.test(code) || !/^\d{4}(0[1-9]|1[0-2])$/.test(String(task.dealYmd || ''))
      || task.type && task.type !== 'sale') continue;
    if (!byDistrict.has(code)) byDistrict.set(code, new Set());
    byDistrict.get(code).add(String(task.dealYmd || ''));
  }
  const coverageFor = (candidate) => {
    const code = String(candidate.regionCode || '');
    const stale = staleTasks.filter((task) => String(task.lawdCd) === code);
    const staleMonths = [...new Set(stale.map((task) => String(task.dealYmd)))].sort();
    const failedMonths = [...new Set((failures || []).filter((task) => String(task.lawdCd) === code)
      .map((task) => String(task.dealYmd)))].sort();
    const missingMonths = failedMonths.filter((month) => !staleMonths.includes(month));
    const totalMonthCount = byDistrict.get(code)?.size || 0;
    return { status: missingMonths.length ? 'partial' : staleMonths.length ? 'stale' : 'complete',
      completedMonthCount: Math.max(0, totalMonthCount - failedMonths.length), totalMonthCount, missingMonths, staleMonths,
      sourceUpdatedAt: stale.map((task) => task.sourceUpdatedAt).filter(Boolean).sort()[0] || null };
  };
  const activityById = new Map();
  const transactionActivityFor = (candidate, monthlyCounts = []) => {
    const coverage = coverageFor(candidate);
    const requested = [...(byDistrict.get(String(candidate.regionCode || '')) || [])].sort();
    if (!requested.length) return null;
    const values = new Map(monthlyCounts.map(row => [row.month, row.count]));
    const toMonth = value => `${value.slice(0, 4)}-${value.slice(4)}`;
    const observed = requested.filter(month => !coverage.missingMonths.includes(month));
    const activity = normalizeTransactionActivity({
      version: 1, scope: 'complex-sale', status: observed.length ? coverage.status : 'missing',
      requestedMonths: requested.map(toMonth),
      monthlyCounts: observed
        .map(month => ({ month: toMonth(month), count: values.get(toMonth(month)) || 0 })),
      sourceUpdatedAt: coverage.sourceUpdatedAt,
    });
    if (activity) activityById.set(String(candidate.catalogId), activity);
    return activity;
  };
  // Raw task evidence should already match its requested month. Bound the
  // aggregation explicitly as well so an unrelated month cannot inflate prices
  // or activity while still appearing to have complete requested-month coverage.
  const boundedRecords = byDistrict.size ? scope.records.filter(record =>
    byDistrict.get(String(record?.regionCode || ''))?.has(String(record?.month || '').replace('-', ''))) : scope.records;
  const results = aggregateRecommendationRecords(scope.candidates, boundedRecords, filters, currentYear,
    { transactionActivityFor }).map((candidate) => {
    const priceCoverage = coverageFor(candidate);
    return { ...candidate, priceCoverage, priceProvisional: priceCoverage.status !== 'complete' };
  });
  const qualifying = new Set(results.map((item) => String(item.catalogId)));
  const incomplete = new Set(scope.incompleteDistrictCodes);
  const pendingPriceCandidates = scope.candidates.filter((candidate) => incomplete.has(String(candidate.regionCode))
    && !qualifying.has(String(candidate.catalogId))).map((candidate) => {
    const transactionActivity = activityById.get(String(candidate.catalogId)) || transactionActivityFor(candidate);
    return {
      ...candidate, priceVerified: false, transportVerified: false, priceCoverage: coverageFor(candidate),
      pricePendingReason: 'PRICE_DATA_INCOMPLETE',
      ...(transactionActivity ? { transactionActivity } : {}),
    };
  });
  return { results, pendingPriceCandidates,
    partialPriceCandidateCount: results.filter((candidate) => candidate.priceProvisional).length,
    pendingPriceCandidateCount: pendingPriceCandidates.length,
    incompleteDistrictCodes: scope.incompleteDistrictCodes,
    excludedIncompleteCandidateCount: scope.excludedCandidateCount,
    excludedIncompleteRecordCount: scope.excludedRecordCount,
    matchedTransactionCount: results.reduce((sum, item) => sum + Number(item.actualDealCount || 0), 0),
    totalResultCount: results.length };
}
