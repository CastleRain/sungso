const APARTMENT_WORDS = Object.freeze([
  '아파트', '공동주택', '주공', '단지',
]);

const APARTMENT_BRANDS = Object.freeze([
  'e편한세상', '중흥s클래스', '호반써밋', '롯데캐슬', '힐스테이트', '한양수자인',
  '래미안', '푸르지오', '아이파크', '센트레빌', '두산위브', '더샵', '아크로',
  '디에이치', '포레나', '우미린', '코오롱하늘채', 'sk뷰', '자이',
]);

// These words strongly suggest that a brand-bearing query is a POI rather than
// a residential complex. An explicit "아파트"/"단지" still wins.
const NON_APARTMENT_PLACE_WORDS = Object.freeze([
  '빌딩', '본사', '지사', '센터', '상가', '시티', '몰', '오피스', '오피스텔',
  '호텔', '마트', '병원', '은행', '학교', '점',
]);

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function normalize(value) {
  return text(value).normalize('NFKC').toLocaleLowerCase('ko-KR').trim();
}

function compact(value) {
  return normalize(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

function tokens(value) {
  return normalize(value).split(/[^\p{L}\p{N}]+/gu).filter(Boolean);
}

function nonNegativeCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

/**
 * Returns whether it is safe to automatically offer the apartment catalog as
 * a secondary source in the company-location picker.
 *
 * The check is deliberately conservative. A generic company/building query
 * such as "KT" must never be silently routed to apartment search just because
 * NAVER Local Search is unavailable.
 */
export function classifyApartmentCatalogIntent(queryValue) {
  const query = normalize(queryValue);
  const compactQuery = compact(query);
  if (!compactQuery) return { eligible: false, reason: 'empty' };

  const hasExplicitHousingWord = APARTMENT_WORDS.some((word) => compactQuery.includes(compact(word)));
  if (hasExplicitHousingWord) return { eligible: true, reason: 'explicit-housing-word' };

  const queryTokens = tokens(query).map(compact);
  const compactBrands = APARTMENT_BRANDS.map(compact);
  const exactBrand = compactBrands.includes(compactQuery)
    || queryTokens.some((token) => compactBrands.includes(token));
  if (!exactBrand) return { eligible: false, reason: 'generic-place-query' };

  const looksLikeNonApartmentPlace = NON_APARTMENT_PLACE_WORDS
    .some((word) => compactQuery.includes(compact(word)));
  if (looksLikeNonApartmentPlace) return { eligible: false, reason: 'non-apartment-place-word' };

  return { eligible: true, reason: 'apartment-brand' };
}

/**
 * Decides the next UI step after NAVER address/local-search providers finish.
 * This function has no DOM/network dependencies so the key-missing contract is
 * covered by unit tests.
 */
export function decideCompanySearchNextStep({
  query,
  placeStatus = 'not-configured',
  addressStatus = 'ok',
  placeResultsCount = 0,
  addressResultsCount = 0,
  allowApartmentCatalog = false,
} = {}) {
  const resultCount = nonNegativeCount(placeResultsCount) + nonNegativeCount(addressResultsCount);
  if (resultCount > 0) {
    return {
      kind: 'provider-results',
      shouldSearchApartmentCatalog: false,
      resultCount,
    };
  }

  const apartmentIntent = classifyApartmentCatalogIntent(query);
  if (allowApartmentCatalog && apartmentIntent.eligible) {
    return {
      kind: 'apartment-catalog',
      shouldSearchApartmentCatalog: true,
      resultCount: 0,
      reason: apartmentIntent.reason,
    };
  }

  if (placeStatus === 'not-configured') {
    return {
      kind: 'place-search-key-required',
      shouldSearchApartmentCatalog: false,
      resultCount: 0,
      reason: apartmentIntent.reason,
    };
  }

  if (placeStatus === 'error' && addressStatus === 'error') {
    return {
      kind: 'provider-error',
      shouldSearchApartmentCatalog: false,
      resultCount: 0,
      reason: 'all-providers-failed',
    };
  }

  if (placeStatus === 'error') {
    return {
      kind: 'place-search-error',
      shouldSearchApartmentCatalog: false,
      resultCount: 0,
      reason: 'place-provider-failed',
    };
  }

  return {
    kind: 'no-results',
    shouldSearchApartmentCatalog: false,
    resultCount: 0,
    reason: 'providers-returned-empty',
  };
}

export function companySearchStepMessage(step, queryValue = '') {
  const query = text(queryValue).trim();
  const queryPrefix = query ? `‘${query}’는 주소 검색 결과가 없어요. ` : '';
  switch (step?.kind) {
    case 'apartment-catalog':
      return '주거 단지로 보여 공식 공동주택 목록을 보조 검색합니다.';
    case 'place-search-key-required':
      return `${queryPrefix}NAVER API HUB 회사·건물명 검색 키를 연결하면 KT 같은 회사·상가·오피스텔을 더 넓게 찾을 수 있습니다. 아파트 후보로 대신 추측하지 않습니다.`;
    case 'provider-error':
      return '장소·주소 검색 연결을 모두 확인하지 못했어요. 잠시 후 다시 시도하거나 지도에서 선택해주세요.';
    case 'place-search-error':
      return '주소 결과가 없고 장소 검색 연결에 문제가 있어요. 잠시 후 다시 시도해주세요.';
    case 'no-results':
      return '네이버 장소·주소 검색에서 일치하는 후보를 찾지 못했어요. 동네나 지점명을 함께 입력해주세요.';
    default:
      return '';
  }
}
