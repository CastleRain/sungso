export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_RESULTS = 50;
export const DEFAULT_RELATED_LIMIT = 8;

const MATCH_TIER = Object.freeze({
  exact: 0,
  prefix: 1,
  contains: 2,
  tokens: 3,
  fuzzy: 4,
});

const KNOWN_BRANDS = [
  'e편한세상', '중흥s클래스', '호반써밋', '롯데캐슬', '힐스테이트', '한양수자인',
  '래미안', '푸르지오', '아이파크', '센트레빌', '두산위브', '더샵', '아크로',
  '디에이치', '포레나', '우미린', '코오롱하늘채', 'sk뷰', '자이',
].map((brand) => normalizeApartmentSearchText(brand))
  .sort((left, right) => right.length - left.length);

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function applyQueryAliases(value) {
  return value.replace(/레미안/gu, '래미안');
}

/**
 * Produces the compact comparison form used by apartment search.
 * It intentionally drops the generic word "아파트" so that users do not
 * have to know whether it is included in the official complex name.
 */
export function normalizeApartmentSearchText(value) {
  const normalized = applyQueryAliases(text(value).normalize('NFKC').toLocaleLowerCase('ko-KR'));
  return normalized.replace(/[^\p{L}\p{N}]+/gu, '').replace(/아파트/gu, '');
}

function searchTokens(value) {
  const normalized = applyQueryAliases(text(value).normalize('NFKC').toLocaleLowerCase('ko-KR'));
  return [...new Set(normalized
    .split(/[^\p{L}\p{N}]+/gu)
    .map(normalizeApartmentSearchText)
    .filter(Boolean))];
}

function candidateName(candidate) {
  return text(candidate?.name ?? candidate?.apartmentName ?? candidate?.aptName
    ?? candidate?.aptNm ?? candidate?.['단지명'] ?? candidate?.['아파트']).trim();
}

function candidateAliases(candidate) {
  const aliases = candidate?.aliases;
  if (Array.isArray(aliases)) return aliases.map(text).map((value) => value.trim()).filter(Boolean);
  return text(aliases).trim() ? [text(aliases).trim()] : [];
}

function candidateRegionCode(candidate) {
  return text(candidate?.regionCode ?? candidate?.lawdCd ?? candidate?.lawdCode
    ?? candidate?.districtCode ?? candidate?.sigunguCode).trim();
}

function candidateRegionName(candidate) {
  return text(candidate?.regionName ?? candidate?.districtName ?? candidate?.sigunguName
    ?? candidate?.sigungu ?? candidate?.region ?? candidate?.['시군구']).trim();
}

function candidateDong(candidate) {
  return text(candidate?.dong ?? candidate?.legalDong ?? candidate?.bjdong ?? candidate?.['법정동']).trim();
}

function candidateAddress(candidate) {
  return text(candidate?.address ?? candidate?.roadAddress ?? candidate?.jibunAddress
    ?? candidate?.roadName ?? candidate?.['도로명']).trim();
}

function normalizedUnique(values) {
  return [...new Set(values.map(normalizeApartmentSearchText).filter(Boolean))];
}

function identityOf(candidate) {
  const catalogId = text(candidate?.catalogId).trim();
  if (catalogId) return `catalog:${catalogId}`;

  const officialId = text(candidate?.aptSeq ?? candidate?.apartmentId ?? candidate?.complexId).trim();
  const region = candidateRegionCode(candidate) || normalizeApartmentSearchText(candidateRegionName(candidate));
  if (officialId) return `official:${region}:${officialId}`;

  return [
    'fallback',
    region,
    normalizeApartmentSearchText(candidateName(candidate)),
    normalizeApartmentSearchText(candidateDong(candidate)),
    normalizeApartmentSearchText(candidateAddress(candidate)),
  ].join(':');
}

function boundedLimit(rawLimit, fallback) {
  if (rawLimit === undefined || rawLimit === null || rawLimit === '') return fallback;
  const limit = Math.trunc(Number(rawLimit));
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(limit, MAX_SEARCH_RESULTS);
}

function maxFuzzyDistance(length) {
  if (length < 4) return 0;
  return length >= 9 ? 2 : 1;
}

function sharesBigram(left, right) {
  if (left.length < 2 || right.length < 2) return false;
  const grams = new Set();
  for (let index = 0; index < left.length - 1; index += 1) grams.add(left.slice(index, index + 2));
  for (let index = 0; index < right.length - 1; index += 1) {
    if (grams.has(right.slice(index, index + 2))) return true;
  }
  return false;
}

// Bounded Levenshtein avoids filling a full matrix for clearly unrelated names.
function editDistanceWithin(left, right, maximum) {
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1;
  if (left === right) return 0;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1]
        + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        substitution,
      );
      rowMinimum = Math.min(rowMinimum, current[rightIndex]);
    }
    if (rowMinimum > maximum) return maximum + 1;
    previous = current;
  }
  return previous[right.length];
}

function fuzzyMatch(query, rawNameValues) {
  const maximum = maxFuzzyDistance(query.length);
  if (!maximum) return null;

  const variants = [];
  rawNameValues.forEach((value) => {
    const compact = normalizeApartmentSearchText(value);
    if (compact) variants.push(compact);
    searchTokens(value).filter((token) => token.length >= 4).forEach((token) => variants.push(token));
  });

  let best = null;
  [...new Set(variants)].forEach((variant) => {
    const allowed = Math.min(maximum, maxFuzzyDistance(Math.max(query.length, variant.length)));
    if (!allowed || Math.abs(query.length - variant.length) > allowed || !sharesBigram(query, variant)) return;
    const distance = editDistanceWithin(query, variant, allowed);
    if (distance > allowed || distance / Math.max(query.length, variant.length) > 0.2) return;
    if (!best || distance < best.distance || (distance === best.distance && variant.length < best.variant.length)) {
      best = { distance, variant };
    }
  });
  return best;
}

function evaluateCandidate(candidate, query, tokens) {
  const name = candidateName(candidate);
  if (!name) return null;
  const rawNames = [name, ...candidateAliases(candidate)];
  const names = normalizedUnique(rawNames);
  if (!names.length) return null;

  const exactIndex = names.findIndex((value) => value === query);
  if (exactIndex >= 0) {
    return { tier: 'exact', reason: exactIndex ? 'alias-exact' : 'name-exact', quality: 0 };
  }

  const prefixMatches = names
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value.startsWith(query));
  if (prefixMatches.length) {
    const best = prefixMatches.sort((left, right) => left.value.length - right.value.length || left.index - right.index)[0];
    return { tier: 'prefix', reason: best.index ? 'alias-prefix' : 'name-prefix', quality: best.value.length - query.length };
  }

  const containsMatches = names
    .map((value, index) => ({ value, index, position: value.indexOf(query) }))
    .filter(({ position }) => position >= 0);
  if (containsMatches.length) {
    const best = containsMatches.sort((left, right) => left.position - right.position
      || left.value.length - right.value.length || left.index - right.index)[0];
    return {
      tier: 'contains',
      reason: best.index ? 'alias-contains' : 'name-contains',
      quality: best.position * 100 + best.value.length - query.length,
    };
  }

  const searchableParts = normalizedUnique([
    ...rawNames,
    candidateRegionName(candidate),
    candidateDong(candidate),
    candidateAddress(candidate),
  ]);
  if (tokens.length && tokens.every((token) => searchableParts.some((part) => part.includes(token)))) {
    return { tier: 'tokens', reason: 'all-tokens', quality: 0 };
  }

  const fuzzy = fuzzyMatch(query, rawNames);
  if (fuzzy) return { tier: 'fuzzy', reason: `edit-distance-${fuzzy.distance}`, quality: fuzzy.distance };
  return null;
}

function resultScore(match, preferredRegion) {
  const base = (5 - MATCH_TIER[match.tier]) * 1000;
  return base + (preferredRegion ? 100 : 0) - Math.min(match.quality || 0, 99);
}

/**
 * Searches a nationwide apartment catalog without requiring a region first.
 * Exact/prefix/contains precedence is absolute; preferredRegionCode only
 * changes ordering among candidates in the same match tier.
 */
export function searchApartmentCatalog(catalog, queryValue, options = {}) {
  if (!Array.isArray(catalog)) return [];
  const query = normalizeApartmentSearchText(queryValue);
  if (!query) return [];

  const tokens = searchTokens(queryValue);
  const preferredRegionCode = text(options?.preferredRegionCode ?? options?.regionCode).trim();
  const limit = boundedLimit(options?.limit ?? options?.maxResults, DEFAULT_SEARCH_LIMIT);
  if (!limit) return [];

  const ranked = [];
  catalog.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return;
    const match = evaluateCandidate(candidate, query, tokens);
    if (!match) return;
    const preferredRegion = Boolean(preferredRegionCode)
      && candidateRegionCode(candidate) === preferredRegionCode;
    ranked.push({ candidate, index, match, preferredRegion });
  });

  ranked.sort((left, right) => MATCH_TIER[left.match.tier] - MATCH_TIER[right.match.tier]
    || Number(right.preferredRegion) - Number(left.preferredRegion)
    || left.match.quality - right.match.quality
    || left.index - right.index);

  const seen = new Set();
  const results = [];
  for (const rankedItem of ranked) {
    const identity = identityOf(rankedItem.candidate);
    if (seen.has(identity)) continue;
    seen.add(identity);
    results.push({
      ...rankedItem.candidate,
      matchTier: rankedItem.match.tier,
      matchReason: rankedItem.match.reason,
      score: resultScore(rankedItem.match, rankedItem.preferredRegion),
      index: rankedItem.index,
    });
    if (results.length >= limit) break;
  }
  return results;
}

function apartmentBrand(candidate) {
  const names = normalizedUnique([candidateName(candidate), ...candidateAliases(candidate)]);
  for (const brand of KNOWN_BRANDS) {
    if (names.some((name) => name.includes(brand))) return brand;
  }
  return '';
}

function sameRegion(left, right) {
  const leftCode = candidateRegionCode(left);
  const rightCode = candidateRegionCode(right);
  if (leftCode && rightCode) return leftCode === rightCode;
  const leftName = normalizeApartmentSearchText(candidateRegionName(left));
  const rightName = normalizeApartmentSearchText(candidateRegionName(right));
  return Boolean(leftName && rightName && leftName === rightName);
}

/**
 * Returns alternatives sharing the selected complex's district and/or brand.
 * Candidates sharing both are followed by same-district and then same-brand
 * candidates. Input order is retained inside each relation tier.
 */
export function findRelatedApartments(selected, catalog, limitValue = DEFAULT_RELATED_LIMIT) {
  if (!selected || typeof selected !== 'object' || !Array.isArray(catalog)) return [];
  const limit = boundedLimit(limitValue, DEFAULT_RELATED_LIMIT);
  if (!limit) return [];

  const selectedIdentity = identityOf(selected);
  const selectedBrand = apartmentBrand(selected);
  const ranked = [];

  catalog.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || !candidateName(candidate)) return;
    if (identityOf(candidate) === selectedIdentity) return;
    const regionMatch = sameRegion(selected, candidate);
    const brandMatch = Boolean(selectedBrand && apartmentBrand(candidate) === selectedBrand);
    if (!regionMatch && !brandMatch) return;

    const relationTier = regionMatch && brandMatch
      ? 'same-region-brand'
      : regionMatch ? 'same-region' : 'same-brand';
    const tier = relationTier === 'same-region-brand' ? 0 : relationTier === 'same-region' ? 1 : 2;
    ranked.push({ candidate, index, relationTier, tier });
  });

  ranked.sort((left, right) => left.tier - right.tier || left.index - right.index);
  const seen = new Set();
  const results = [];
  for (const rankedItem of ranked) {
    const identity = identityOf(rankedItem.candidate);
    if (seen.has(identity)) continue;
    seen.add(identity);
    results.push({
      ...rankedItem.candidate,
      relationTier: rankedItem.relationTier,
      relationReason: rankedItem.relationTier,
      score: (3 - rankedItem.tier) * 1000,
      index: rankedItem.index,
    });
    if (results.length >= limit) break;
  }
  return results;
}
