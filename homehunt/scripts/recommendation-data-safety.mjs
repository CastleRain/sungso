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

export function completeRecommendationScope(candidates, records, failures) {
  const incompleteDistrictCodes = [...new Set(
    (failures || [])
      .map((item) => String(item?.lawdCd || '').trim())
      .filter((code) => /^\d{5}$/.test(code)),
  )].sort();
  const incomplete = new Set(incompleteDistrictCodes);
  const sourceCandidates = Array.isArray(candidates) ? candidates : [];
  const sourceRecords = Array.isArray(records) ? records : [];
  const completeCandidates = sourceCandidates.filter((item) => !incomplete.has(String(item?.regionCode || '')));
  const completeRecords = sourceRecords.filter((item) => !incomplete.has(String(item?.regionCode || '')));

  return {
    candidates: completeCandidates,
    records: completeRecords,
    incompleteDistrictCodes,
    excludedCandidateCount: sourceCandidates.length - completeCandidates.length,
    excludedRecordCount: sourceRecords.length - completeRecords.length,
  };
}
