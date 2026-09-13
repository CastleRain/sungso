function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function boundedInteger(value, minimum, maximum) {
  const parsed = optionalNumber(value);
  return parsed === null ? null : Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function enumValue(value, allowed, fallback = 'unknown') {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

export function calculateGeneralSubscriptionScore(person = {}) {
  const noHomeYears = optionalNumber(person.noHomeYears);
  const dependents = boundedInteger(person.dependents, 0, 20);
  const accountMonths = boundedInteger(person.accountMonths, 0, 1_200);
  const complete = noHomeYears !== null && dependents !== null && accountMonths !== null;
  if (!complete) {
    return {
      complete: false,
      total: null,
      maximum: 84,
      noHomePoints: noHomeYears === null ? null : Math.min(32, (Math.min(15, Math.floor(noHomeYears)) * 2) + 2),
      dependentPoints: dependents === null ? null : Math.min(35, 5 + (dependents * 5)),
      accountPoints: accountMonths === null ? null : accountMonths < 6 ? 1 : accountMonths < 12 ? 2 : Math.min(17, Math.floor(accountMonths / 12) + 2),
    };
  }
  const noHomePoints = Math.min(32, (Math.min(15, Math.floor(noHomeYears)) * 2) + 2);
  const dependentPoints = Math.min(35, 5 + (dependents * 5));
  const accountPoints = accountMonths < 6 ? 1 : accountMonths < 12 ? 2 : Math.min(17, Math.floor(accountMonths / 12) + 2);
  return {
    complete: true,
    total: noHomePoints + dependentPoints + accountPoints,
    maximum: 84,
    noHomePoints,
    dependentPoints,
    accountPoints,
  };
}

function normalizePerson(value, fallbackName) {
  return {
    name: String(value?.name || fallbackName).trim().slice(0, 20) || fallbackName,
    noHomeYears: optionalNumber(value?.noHomeYears),
    dependents: boundedInteger(value?.dependents, 0, 20),
    accountMonths: boundedInteger(value?.accountMonths, 0, 1_200),
    paymentCount: boundedInteger(value?.paymentCount, 0, 1_200),
  };
}

export function normalizeSubscriptionProfile(value = {}) {
  return {
    relationshipStatus: enumValue(value.relationshipStatus, ['unknown', 'planning', 'engaged', 'married', 'other']),
    marriageYears: optionalNumber(value.marriageYears),
    homelessStatus: enumValue(value.homelessStatus, ['unknown', 'yes', 'no']),
    specialSupplyUsed: enumValue(value.specialSupplyUsed, ['unknown', 'yes', 'no']),
    incomeStatus: enumValue(value.incomeStatus, ['unknown', 'within', 'over']),
    assetStatus: enumValue(value.assetStatus, ['unknown', 'within', 'over']),
    childrenCount: boundedInteger(value.childrenCount, 0, 20) ?? 0,
    newbornStatus: enumValue(value.newbornStatus, ['unknown', 'yes', 'no']),
    people: {
      seongwoo: normalizePerson(value.people?.seongwoo, '성우'),
      sohee: normalizePerson(value.people?.sohee, '소희'),
    },
    updatedAt: String(value.updatedAt || ''),
  };
}

export function assessNewlywedReadiness(profileValue = {}) {
  const profile = normalizeSubscriptionProfile(profileValue);
  const blockers = [];
  const checks = [];
  const strengths = [];

  if (profile.homelessStatus === 'no') blockers.push('세대의 주택·분양권 보유 여부 때문에 무주택 요건을 먼저 확인해야 해요.');
  else if (profile.homelessStatus === 'unknown') checks.push('두 사람과 세대원의 주택·분양권 보유 여부');
  else strengths.push('무주택세대 조건을 입력상 충족');

  if (profile.specialSupplyUsed === 'yes') blockers.push('과거 특별공급 당첨 이력이 있어 재신청 가능 여부를 공고문에서 확인해야 해요.');
  else if (profile.specialSupplyUsed === 'unknown') checks.push('과거 특별공급 당첨 이력');
  else strengths.push('특별공급 당첨 이력 없음');

  if (profile.relationshipStatus === 'other') blockers.push('현재 입력한 혼인 상태는 일반적인 신혼부부 공급 범위와 맞지 않아요.');
  else if (profile.relationshipStatus === 'unknown') checks.push('혼인신고일 또는 예비신혼 인정 여부');
  else if (profile.relationshipStatus === 'planning' || profile.relationshipStatus === 'engaged') checks.push('해당 공고가 예비신혼부부를 인정하는지');
  else if (profile.marriageYears === null) checks.push('모집공고일 기준 혼인기간');
  else if (profile.marriageYears > 7) blockers.push('입력한 혼인기간이 7년을 넘어 일반적인 신혼부부 특별공급 기준을 확인해야 해요.');
  else strengths.push(`혼인기간 ${profile.marriageYears}년 입력`);

  if (profile.incomeStatus === 'over') blockers.push('입력상 소득 기준 초과 가능성이 있어 공고별 공급 구간을 확인해야 해요.');
  else if (profile.incomeStatus === 'unknown') checks.push('공고 기준 가구원수별 월평균소득 비율');
  else strengths.push('소득 기준을 최근 자료로 확인함');

  if (profile.assetStatus === 'over') blockers.push('입력상 자산 기준 초과 가능성이 있어 공고별 기준을 확인해야 해요.');
  else if (profile.assetStatus === 'unknown') checks.push('부동산·자동차·금융자산 등 공고별 자산 기준');
  else strengths.push('자산 기준을 최근 자료로 확인함');

  const people = Object.values(profile.people);
  if (!people.some((person) => Number(person.accountMonths) >= 6)) checks.push('신청자 청약통장 가입기간');
  if (!people.some((person) => Number(person.paymentCount) >= 6)) checks.push('신청자 청약통장 납입횟수');
  if (profile.childrenCount > 0) strengths.push(`자녀 ${profile.childrenCount}명 입력`);
  if (profile.newbornStatus === 'yes') strengths.push('신생아 우선·특별공급 검토 대상');
  checks.push('모집공고일 기준 해당 지역 거주기간과 우선공급 지역');

  const scores = Object.fromEntries(Object.entries(profile.people).map(([key, person]) => [key, calculateGeneralSubscriptionScore(person)]));
  const ranked = Object.entries(scores).filter(([, score]) => score.complete).sort((a, b) => b[1].total - a[1].total);
  return {
    profile,
    scores,
    suggestedApplicant: ranked[0]?.[0] || null,
    tone: blockers.length ? 'warning' : checks.length ? 'check' : 'ready',
    label: blockers.length ? '우선 자격 확인' : checks.length ? '추가 확인 필요' : '공고별 신청 검토 가능',
    blockers,
    checks: [...new Set(checks)],
    strengths: [...new Set(strengths)],
    probabilityAvailable: false,
    probabilityReason: '단지·주택형별 모집세대, 신청자 수, 우선공급 순위와 동점 추첨 자료가 모두 있어야 하므로 현재 입력만으로 당첨 확률을 계산하지 않습니다.',
  };
}
