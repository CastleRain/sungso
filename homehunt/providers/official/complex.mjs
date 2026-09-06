import { evidenceField, positiveNumber } from '../evidence.mjs';

export const OFFICIAL_CATALOG_SOURCE = Object.freeze({
  name: '한국부동산원 공동주택 단지정보',
  url: 'https://www.data.go.kr/data/15106861/fileData.do',
  publishedDate: '2025-09-18',
});

/** Adapt only official catalog identities; personal visit values stay personal. */
export function officialComplexEvidence(candidate = {}, { catalogMeta, fetchedAt } = {}) {
  const source = catalogMeta?.source || OFFICIAL_CATALOG_SOURCE;
  const catalogVerified = Boolean(candidate.catalogId);
  const base = {
    sourceKind: 'official-catalog', sourceLabel: source.name,
    sourceUrl: source.url, observedAt: source.publishedDate,
    fetchedAt: fetchedAt || catalogMeta?.fetchedAt,
    derivation: 'official-record', freshness: 'dated-snapshot',
    decisionStatus: 'reference',
    reason: catalogVerified ? '공식 목록에서 제공하지 않는 항목' : '공식 단지 식별이 필요해요',
  };
  const value = (field) => catalogVerified ? positiveNumber(candidate[field]) : null;
  return [
    evidenceField('households', '세대수', value('households'), { ...base, unit: '세대', format: 'number' }),
    evidenceField('builtYear', '준공연도', value('builtYear'), { ...base, unit: '년', format: 'year' }),
    evidenceField('buildings', '동수', value('buildings'), { ...base, unit: '동', format: 'number' }),
    evidenceField('parking', '주차·관리·난방', null, { sourceKind: 'k-apt', sourceLabel: 'K-apt 공동주택관리정보', sourceUrl: 'https://www.k-apt.go.kr/', reason: '단지 식별·상세 API 연결 필요', note: 'K-apt에서 직접 확인할 수 있어요.' }),
    evidenceField('stationWalk', '역 출입구까지 도보', null, { sourceKind: 'walking-route', sourceLabel: '실제 보행 경로', reason: '출입구 기준 보행 경로 미확인' }),
    evidenceField('futureSupply', '입주 물량·교통 계획', null, { sourceKind: 'official-planning', sourceLabel: '공식 계획 원문', reason: '단지 주변의 공식 계획 자료 미연결' }),
  ];
}

export function officialTradeEvidence(candidate = {}, options = {}) {
  const area = candidate.bestArea || {};
  const verified = candidate.priceVerified === true && positiveNumber(area.count) && positiveNumber(area.averagePriceManWon);
  const month = /^\d{4}-\d{2}$/.test(String(area.latestMonth || '')) ? area.latestMonth : '';
  const day = Math.min(31, Math.max(1, Number(area.latestDay) || 1));
  const observedAt = month ? `${month}-${String(day).padStart(2, '0')}` : null;
  const base = {
    sourceKind: 'molit-trade', sourceLabel: '국토교통부 실거래', sourceUrl: 'https://rt.molit.go.kr/',
    observedAt, fetchedAt: options.fetchedAt || candidate.fetchedAt,
    freshness: candidate.stale || candidate.dataStatus === 'stale' ? 'stale' : 'dated-contracts',
    decisionStatus: 'reference', format: 'price',
    reason: '같은 전용면적의 실거래 조회가 필요해요',
  };
  return [
    evidenceField('tradeMean', '같은 면적 평균 실거래', verified ? area.averagePriceManWon : null, {
      ...base, derivation: 'arithmetic-mean',
      note: verified ? `전용 ${Number(area.areaM2).toLocaleString('ko-KR')}㎡ · ${Number(area.count).toLocaleString('ko-KR')}건 산술평균 · 현재 매물 가격을 뜻하지 않아요.` : '',
    }),
    evidenceField('latestTrade', '같은 면적 최근 계약', verified ? positiveNumber(area.latestPriceManWon) : null, { ...base, derivation: 'latest-contract' }),
  ];
}
