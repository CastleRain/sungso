// Decision views use source-qualified identities; a visit asking price is never a trade.
export const DECISION_KINDS = Object.freeze({ candidate: '관심 후보', visit: '방문 기록', supply: '분양 공고' });
export function decisionKey(kind, record) {
  const id = kind === 'candidate' ? record?.catalogId || record?.id : record?.id;
  return DECISION_KINDS[kind] && id != null ? `${kind}:${id}` : '';
}
export function pruneDecisionKeys(keys, entries, limit = 3) {
  const known = new Set(entries.map(({ kind, record }) => decisionKey(kind, record)));
  return [...new Set(Array.isArray(keys) ? keys : [])].filter((key) => known.has(key)).slice(0, limit);
}
const positive = (v) => v !== null && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
export function decisionPrice(kind, record) {
  if (kind === 'visit') return { value: positive(record.askingPrice), label: `현장 확인 ${record.dealType || '가격'}`, date: record.visitDate || '', source: '개인 방문 기록' };
  if (kind === 'supply') {
    const prices = (record.homes || []).map((h) => positive(h.maxPriceManWon)).filter(Boolean);
    return { value: prices.length ? Math.max(...prices) : positive(record.maxPriceManWon), label: '공식 분양가 · 주택형별 최고', date: record.announcementDate || record.noticeDate || '', source: record.sourceLabel || record.source || '공식 모집공고' };
  }
  return { value: positive(record.bestArea?.averagePriceManWon), label: record.savedAt ? '저장 당시 실거래 평균' : '조회기간 실거래 평균', date: record.bestArea?.latestMonth || '', source: '국토교통부' };
}
export function regionalCoverage(candidates = []) {
  const groups = new Map();
  for (const candidate of candidates) {
    const key = [candidate.regionCode || candidate.regionName || 'unknown', candidate.dong || ''].join(':');
    if (!groups.has(key)) groups.set(key, { key, label: [candidate.regionName, candidate.dong].filter(Boolean).join(' · ') || '지역 미확인', candidates: [], prices: [], mapped: 0, verified: 0 });
    const group = groups.get(key);
    group.candidates.push(candidate);
    const price = decisionPrice('candidate', candidate).value;
    if (price !== null) { group.prices.push(price); group.verified += 1; }
    if (positive(candidate.lat) && positive(candidate.lng) && Number(candidate.lat) <= 90 && Number(candidate.lng) <= 180) group.mapped += 1;
  }
  return [...groups.values()].map((g) => ({ ...g, count: g.candidates.length, unmapped: g.candidates.length - g.mapped,
    minPrice: g.prices.length ? Math.min(...g.prices) : null, maxPrice: g.prices.length ? Math.max(...g.prices) : null,
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
}
export function searchBottleneck({ meta, results = [], destinations = [], verifiedCount = 0 } = {}) {
  if (!meta) return { title: '먼저 탐색 범위를 확인하세요', detail: '가격·면적·규모·연식 조건으로 공식 실거래를 조회하세요. 회사 위치 없이도 강남·역 접근성으로 비교할 수 있습니다.', action: 'filters' };
  if (Number(meta.failedRequestCount) > 0 && !results.length) return { title: '자료 누락으로 판단을 보류했어요', detail: '일부 지역의 월별 실거래가 완전하지 않습니다. 연결 상태 확인 후 재조회하세요.', action: 'connections' };
  if (!results.length && Number(meta.baseCandidateCount) === 0) return { title: '지역·세대수·연식에서 후보가 없어요', detail: '가격 조회 전 기본조건 단계입니다. 지역 범위, 세대수 또는 준공연도 중 하나를 바꿔보세요.', action: 'filters' };
  if (!results.length) return { title: '면적·가격을 확인한 후보가 없어요', detail: '기본조건 단지는 있지만 조회기간에 면적·가격 조건을 함께 통과한 거래가 없습니다. 면적·예산·조회기간을 하나씩 바꿔보세요.', action: 'filters' };
  if (destinations.length && verifiedCount < results.length) return { title: '가격 다음은 실제 통근 확인', detail: `가격 후보 ${results.length}곳 중 ${results.length - verifiedCount}곳은 최종 경로 확인이 남았습니다. 후보를 골라 목적지별 경로를 확인하세요.`, action: 'candidates' };
  return { title: '마음에 드는 후보의 근거를 모으세요', detail: '관심 저장 → 방문 → 같은 면적 실거래 변화 → 자금 계획 순서로 비교해보세요.', action: 'compare' };
}
