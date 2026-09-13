import { evidenceField, positiveNumber, safeHttpsLink } from '../evidence.mjs';

export const SUPPLY_SOURCE_STATES = Object.freeze({
  collected: { label: '정상 수집', tone: 'verified' },
  empty: { label: '정상 0건', tone: 'verified' },
  baseline: { label: '첫 기준선 수집 중', tone: 'unknown' },
  'approval-pending': { label: '승인 대기', tone: 'unknown' },
  'auth-failed': { label: '인증 실패', tone: 'warning' },
  'format-changed': { label: '형식 변경', tone: 'warning' },
  unavailable: { label: '일시 장애', tone: 'warning' },
});

export function supplySourceState(source = {}, payload = {}) {
  const status = String(source.collectionStatus || source.status || '').toLowerCase();
  const failures = Array.isArray(source.coverage?.errors) ? source.coverage.errors : [];
  const codes = [source.code, source.errorCode, ...failures.map((item) => item.code)].filter(Boolean).join(' ').toUpperCase();
  const http = [source.httpStatus, ...failures.map((item) => item.httpStatus)].map(Number);
  const explicitCount = source.count !== null && source.count !== undefined ? Number(source.count) : NaN;
  const count = Number.isFinite(explicitCount) && explicitCount >= 0 ? explicitCount : (payload.notices || []).filter((notice) => notice.source === source.id && notice.dataStatus !== 'stale').length;
  const baseline = payload.baseline?.providers?.[source.id];
  let state;
  let reason = '';
  if (/approval|awaiting_api_access|permission_pending/.test(status) || /ACCESS_NOT_APPROVED|SERVICE_NOT_APPROVED|SERVICE_ACCESS_DENIED/.test(codes)) {
    state = 'approval-pending'; reason = '공공데이터 서비스별 활용신청 승인을 확인하세요.';
  } else if (/auth|unauthoriz|forbidden/.test(status) || /MISSING_CREDENTIAL|INVALID_SERVICE_KEY|UNREGISTERED_KEY|EXPIRED_KEY/.test(codes) || http.some((value) => value === 401 || value === 403)) {
    state = 'auth-failed'; reason = '키의 유효성과 이 서비스의 활용 권한을 확인하세요. HTTP 상태만으로 승인 대기를 단정하지 않아요.';
  } else if (/schema|format|parse/.test(status) || /INVALID_JSON|INVALID_XML|INVALID_SCHEMA|INVALID_RESPONSE|MISSING_IDENTITY|DECODE_ERROR|UNSAFE_XML/.test(codes)) {
    state = 'format-changed'; reason = '공식 응답 형식 또는 필수 필드가 달라져 자료 해석을 보류했어요.';
  } else if (['ok', 'live', 'success'].includes(status) && !failures.length && source.coverage?.status !== 'partial') {
    state = count > 0 ? 'collected' : 'empty';
    reason = count ? `${count.toLocaleString('ko-KR')}개 공고를 확인했어요.` : '정상 응답에서 서울·경기 분양 대상 공고가 0건이에요.';
  } else if (['', 'not_collected', 'pending', 'collecting', 'baseline'].includes(status) && !source.lastSuccessfulAt && !baseline?.established) {
    state = payload.status === 'awaiting_api_access' && ['applyhome', 'lh'].includes(source.id) ? 'approval-pending' : 'baseline';
    reason = state === 'baseline' ? '아직 비교 가능한 첫 정상 수집 기록이 없어요.' : '이 공급원의 API 활용 승인과 최초 연결을 기다려요.';
  } else {
    state = 'unavailable'; reason = '일부 요청이 실패했어요. 보존한 공고는 마지막 성공 시점의 자료입니다.';
  }
  return Object.freeze({ state, ...SUPPLY_SOURCE_STATES[state], reason, count, sourceId: source.id || '',
    sourceLabel: source.label || source.name || source.id || '공식 공급원',
    observedAt: source.lastSuccessfulAt || source.generatedAt || null,
    staleCount: Number(source.retainedStaleNoticeCount) || 0,
    baselineEstablished: Boolean(baseline?.established),
  });
}

const APPLICATIONS = Object.freeze({
  applyhome: { label: '청약홈', href: 'https://www.applyhome.co.kr/', hosts: ['www.applyhome.co.kr', 'applyhome.co.kr'] },
  lh: { label: 'LH 청약플러스', href: 'https://apply.lh.or.kr/', hosts: ['apply.lh.or.kr'] },
  sh: { label: 'SH 인터넷청약', href: 'https://www.i-sh.co.kr/app/', hosts: ['www.i-sh.co.kr', 'i-sh.co.kr'] },
});

export function officialApplicationLink(notice = {}) {
  const provider = APPLICATIONS[String(notice.source || '').toLowerCase()];
  if (!provider) return null;
  // A notice sourceUrl is a recruitment notice, not an application form.
  const explicit = safeHttpsLink(notice.applicationUrl, provider.hosts);
  return Object.freeze({ label: provider.label, href: explicit || provider.href, direct: Boolean(explicit) });
}

export function supplyPriceEvidence(notice = {}, { sameComplex = null, nearbyComparables = [] } = {}) {
  const homePrices = (notice.homes || []).map((home) => positiveNumber(home.maxPriceManWon)).filter(Boolean);
  const maximum = homePrices.length ? Math.max(...homePrices) : positiveNumber(notice.maxPriceManWon);
  const source = { sourceKind: 'official-supply', sourceLabel: notice.sourceLabel || notice.source || '공식 모집공고', sourceUrl: notice.officialUrl || notice.sourceUrl,
    observedAt: notice.announcementDate || notice.noticeDate, fetchedAt: notice.fetchedAt,
    freshness: notice.stale || notice.dataStatus === 'stale' ? 'stale' : 'dated-notice',
    decisionStatus: 'reference', format: 'price' };
  // An adapter caller must supply an exact catalog match, sale tenure and same-area evidence.
  const matching = sameComplex?.priceVerified === true && sameComplex?.matchBasis === 'catalog-and-area'
    && sameComplex?.dealType === '매매' && positiveNumber(sameComplex?.count) && positiveNumber(sameComplex?.areaM2)
    && sameComplex?.sourceKind === 'molit-trade' && sameComplex?.observedAt;
  const nearby = nearbyComparables.filter((item) => item?.sourceKind === 'molit-trade' && item?.dealType === '매매'
    && item?.priceVerified === true && item?.matchBasis === 'nearby-and-area'
    && positiveNumber(item?.areaM2) && positiveNumber(item?.count) && item?.observedAt && positiveNumber(item?.averagePriceManWon));
  return [
    evidenceField('supplyPrice', '공식 분양가 · 주택형별 최고', maximum, { ...source, derivation: 'official-announcement', reason: '분양가 미공개 · 공식 공고문에서 확인', note: '층·타입별 가격과 발코니·유상 옵션·부대비용은 공고 원문에서 확인하세요.' }),
    evidenceField('currentTrade', '같은 단지 현재 실거래', matching ? positiveNumber(sameComplex.averagePriceManWon) : null, { sourceKind: 'molit-trade', sourceLabel: '국토교통부 실거래', sourceUrl: 'https://rt.molit.go.kr/', observedAt: matching ? sameComplex.observedAt : null, fetchedAt: matching ? sameComplex.fetchedAt : null, format: 'price', derivation: 'arithmetic-mean', reason: '같은 단지·전용면적의 입주 후 매매 자료 미연결', note: matching ? `전용 ${sameComplex.areaM2}㎡ · ${sameComplex.count}건 산술평균` : '' }),
    evidenceField('nearbyTrade', '인근 비교 단지 가격', nearby.length ? nearby.map((item) => `${item.name} · 전용 ${item.areaM2}㎡ · ${item.averagePriceManWon.toLocaleString('ko-KR')}만원 (${item.count}건, ${item.observedAt})`).join(' / ') : null, { sourceKind: 'molit-trade', sourceLabel: '국토교통부 실거래 · 인근 별도 단지', sourceUrl: 'https://rt.molit.go.kr/', observedAt: nearby.length ? nearby.map((item) => item.observedAt).sort().at(-1) : null, derivation: 'matched-area-comparables', reason: '거리·전용면적을 맞춘 인근 비교 자료 미연결', note: nearby.length ? '각 단지의 거리·연식·입지 차이를 함께 확인하세요. 분양가와의 차이를 수익으로 단정하지 않아요.' : '' }),
  ];
}

export function supplyApplicationChecklist(notice = {}) {
  const applicationSchedules = (notice.schedules || []).filter((item) => item.kind === 'application');
  const dates = applicationSchedules.map((item) => `${item.label || '접수'} ${item.startDate || '?'}~${item.endDate || item.startDate || '?'}`).join(' · ');
  return [
    { id: 'schedule', label: '내 공급유형의 접수일·마감시간 확인', detail: dates || '구조화된 접수일 없음 · 모집공고 원문 확인' },
    { id: 'eligibility', label: '공고일 기준 자격과 지역 우선 기준 확인', detail: '무주택·혼인·소득·자산·청약통장·중복신청 제한 등 해당 모집공고에 요구된 항목 확인' },
    { id: 'documents', label: '모집공고의 제출 서류·발급 기준일 확인', detail: '세대·가족·소득·자산 등 필요한 증빙의 종류, 발급일과 제출 시점은 공고별로 확인' },
    { id: 'funding', label: '계약금·중도금·잔금과 옵션 비용 확인', detail: '납부 시기와 대출 가능 여부를 공식 안내·금융기관에서 확인' },
    { id: 'apply', label: '공식 신청 화면에서 본인 인증 후 직접 신청', detail: '이 체크는 준비 확인용이며 실제 신청·자격 승인 결과가 아닙니다.' },
  ];
}
