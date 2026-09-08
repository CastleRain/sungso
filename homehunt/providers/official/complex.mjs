import { evidenceField, positiveNumber } from '../evidence.mjs?v=4.6.1';
import { normalizePriceCoverage, priceCoverageLabel } from '../../js/price-coverage-core.mjs?v=4.6.1';

export const OFFICIAL_CATALOG_SOURCE = Object.freeze({
  name: '한국부동산원 공동주택 단지정보',
  url: 'https://www.data.go.kr/data/15106861/fileData.do',
  publishedDate: '2025-09-18',
});

export const KAPT_COMPLEX_SOURCE = Object.freeze({
  name: '국토교통부 공동주택 기본·상세 정보',
  url: 'https://www.data.go.kr/data/15058453/openapi.do',
});

/** A returned record is usable only for the catalog identity requested by this detail. */
export function matchedOfficialComplexInfo(candidate = {}) {
  const info = candidate.officialComplexInfo;
  return info?.provider === 'kapt' && ['matched', 'partial'].includes(info.status)
    && info.complexMatchConfirmed === true && String(info.kaptCode || '').trim()
    && String(candidate.catalogId || '').trim()
    && String(info.catalogId || '') === String(candidate.catalogId)
    ? info : null;
}

const nonNegative = value => value !== null && value !== undefined && value !== ''
  && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;

function kaptSourceOptions(info) {
  return {
    sourceKind: 'k-apt', sourceLabel: KAPT_COMPLEX_SOURCE.name, sourceUrl: KAPT_COMPLEX_SOURCE.url,
    fetchedAt: info?.observedAt, derivation: 'official-record', freshness: 'current-record',
    decisionStatus: 'reference', reason: info ? '공식 자료에 값이 제공되지 않았어요' : '단지 상세에서 공식 정보 확인이 필요해요',
  };
}

function kaptFields(candidate) {
  const info = matchedOfficialComplexInfo(candidate);
  const parking = info?.parking || {};
  const above = nonNegative(parking.aboveGroundSpaces), below = nonNegative(parking.belowGroundSpaces);
  const total = above !== null && below !== null ? above + below : null;
  const households = positiveNumber(info?.households);
  const ratio = total !== null && households ? total / households : null;
  const base = kaptSourceOptions(info);
  return [
    evidenceField('parking', '공식 주차대수', total, { ...base, unit: '대', format: 'number',
      note: ratio !== null ? `세대당 ${Number(ratio.toFixed(2))}대 · 전체 ${total.toLocaleString('ko-KR')}대 ÷ 공식 ${households.toLocaleString('ko-KR')}세대 (지상 ${above.toLocaleString('ko-KR')}대 · 지하 ${below.toLocaleString('ko-KR')}대)` : '' }),
    evidenceField('heating', '난방 방식', info?.heatingType || null, base),
    evidenceField('elevators', '승강기', nonNegative(info?.elevatorCount), { ...base, unit: '대', format: 'number' }),
  ];
}

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
  const info = matchedOfficialComplexInfo(candidate);
  const kaptBase = kaptSourceOptions(info);
  const households = positiveNumber(info?.households);
  const buildings = positiveNumber(info?.buildingCount);
  const approval = String(info?.approvalDate || '');
  const approvalValid = /^\d{4}-\d{2}-\d{2}$/.test(approval) && Number.isFinite(new Date(approval).getTime())
    && new Date(approval).toISOString().slice(0, 10) === approval;
  const builtYear = approvalValid ? positiveNumber(approval.slice(0, 4)) : null;
  return [
    evidenceField('households', '세대수', households ?? value('households'), { ...(households !== null ? kaptBase : base), unit: '세대', format: 'number' }),
    evidenceField('builtYear', builtYear !== null ? '사용승인연도' : '준공연도', builtYear ?? value('builtYear'), {
      ...(builtYear !== null ? kaptBase : base), unit: '년', format: 'year', note: builtYear !== null ? `공식 사용승인일 ${approval} 기준` : '',
    }),
    evidenceField('buildings', '동수', buildings ?? value('buildings'), { ...(buildings !== null ? kaptBase : base), unit: '동', format: 'number' }),
    ...kaptFields(candidate),
    evidenceField('stationWalk', '역 출입구까지 도보', null, { sourceKind: 'walking-route', sourceLabel: '실제 보행 경로', reason: '출입구 기준 보행 경로 미확인' }),
    evidenceField('futureSupply', '입주 물량·교통 계획', null, { sourceKind: 'official-planning', sourceLabel: '공식 계획 원문', reason: '단지 주변의 공식 계획 자료 미연결' }),
  ];
}

export function officialTradeEvidence(candidate = {}, options = {}) {
  const area = candidate.bestArea || {};
  const coverage = normalizePriceCoverage(candidate.priceCoverage);
  const provisional = candidate.priceProvisional === true || coverage.status !== 'complete';
  const verified = (candidate.priceVerified === true || candidate.priceProvisional === true)
    && positiveNumber(area.count) && positiveNumber(area.averagePriceManWon);
  const month = /^\d{4}-\d{2}$/.test(String(area.latestMonth || '')) ? area.latestMonth : '';
  const day = Math.min(31, Math.max(1, Number(area.latestDay) || 1));
  const observedAt = month ? `${month}-${String(day).padStart(2, '0')}` : null;
  const base = {
    sourceKind: 'molit-trade', sourceLabel: '국토교통부 실거래', sourceUrl: 'https://rt.molit.go.kr/',
    observedAt, fetchedAt: options.fetchedAt || coverage.sourceUpdatedAt || candidate.fetchedAt,
    tier: provisional ? 'estimated' : 'verified',
    freshness: coverage.status === 'stale' || candidate.stale || candidate.dataStatus === 'stale' ? 'stale' : provisional ? 'provisional' : 'dated-contracts',
    decisionStatus: provisional ? 'provisional' : 'reference', format: 'price',
    reason: '같은 전용면적의 실거래 조회가 필요해요',
  };
  return [
    evidenceField('tradeMean', `같은 면적 평균 실거래${provisional ? ' · 잠정' : ''}`, verified ? area.averagePriceManWon : null, {
      ...base, derivation: 'arithmetic-mean',
      note: verified ? `전용 ${Number(area.areaM2).toLocaleString('ko-KR')}㎡ · ${Number(area.count).toLocaleString('ko-KR')}건 산술평균 · ${priceCoverageLabel(candidate)} · 현재 매물 가격을 뜻하지 않아요.` : '',
    }),
    evidenceField('latestTrade', '같은 면적 최근 계약', verified ? positiveNumber(area.latestPriceManWon) : null, { ...base, derivation: 'latest-contract' }),
  ];
}
