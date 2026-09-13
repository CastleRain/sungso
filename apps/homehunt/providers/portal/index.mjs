import { safeHttpsLink } from '../evidence.mjs';

// No fetch implementation is installed. A runtime flag cannot enable collection.
// Provider approval must result in a separately reviewed, bounded API adapter.
export const PORTAL_POLICIES = Object.freeze([
  Object.freeze({ id: 'naver', label: 'NAVER 부동산', homeUrl: 'https://land.naver.com/', hosts: Object.freeze(['land.naver.com', 'new.land.naver.com', 'm.land.naver.com']), enabled: false, status: 'policy-unverified', checkedAt: '2026-09-06', termsUrl: 'https://policy.naver.com/rules/disclaimer.html', robotsUrl: 'https://new.land.naver.com/robots.txt', apiUrl: 'https://developers.naver.com/products/service-api/search/search.md', reason: '부동산 단지·매물 수집 허용 계약을 확인하지 못했어요.', requestsPerMinute: 0, requestsPerDay: 0, cacheHours: null, cooldownSeconds: null }),
  Object.freeze({ id: 'dabang', label: '다방', homeUrl: 'https://www.dabangapp.com/', hosts: Object.freeze(['www.dabangapp.com', 'm.dabangapp.com']), enabled: false, status: 'policy-unverified', checkedAt: '2026-09-06', termsUrl: 'https://static.dabangapp.com/html/useragreement.html', robotsUrl: 'https://www.dabangapp.com/robots.txt', apiUrl: '', reason: '최신 수집·재사용 허용 범위와 공식 API 계약을 확인하지 못했어요.', requestsPerMinute: 0, requestsPerDay: 0, cacheHours: null, cooldownSeconds: null }),
  Object.freeze({ id: 'zigbang', label: '직방', homeUrl: 'https://www.zigbang.com/', hosts: Object.freeze(['www.zigbang.com']), enabled: false, status: 'policy-unverified', checkedAt: '2026-09-06', termsUrl: 'https://www.zigbang.com/event/notice', robotsUrl: 'https://www.zigbang.com/robots.txt', apiUrl: '', reason: '최신 수집·재사용 허용 범위와 공식 API 계약을 확인하지 못했어요.', requestsPerMinute: 0, requestsPerDay: 0, cacheHours: null, cooldownSeconds: null }),
]);

/** Returns links only: opening a candidate never contacts a portal. */
export function portalComplexEvidence(candidate = {}) {
  return PORTAL_POLICIES.map((policy) => {
    const officialDetail = safeHttpsLink(candidate.portalLinks?.[policy.id], policy.hosts);
    return Object.freeze({ ...policy, sourceKind: 'portal-asking', method: 'official-link-only',
      href: officialDetail || policy.homeUrl, linkLabel: officialDetail ? '공식 상세 열기' : '공식 사이트에서 검색',
      scope: '매물·호가', value: null, fetchedAt: null,
      searchHint: [candidate.name, candidate.dong || candidate.regionName].filter(Boolean).join(' '),
    });
  });
}
