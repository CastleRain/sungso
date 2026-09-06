import { haversineKm, normalizeGeoPoint } from './transport-core.mjs';

/** Fixed preference weights, not fitted to the current candidate set. */
export const LOCATION_PROFILES = Object.freeze({
  balanced: Object.freeze({ anchor: 45, station: 30, households: 10, age: 10, budget: 5 }),
  gangnam: Object.freeze({ anchor: 65, station: 15, households: 8, age: 7, budget: 5 }),
  station: Object.freeze({ anchor: 30, station: 50, households: 8, age: 7, budget: 5 }),
});

// Preference breakpoints. These describe no travel-time, price appreciation,
// lending, or purchase-success model. Unknown dimensions retain their weight
// but earn no points; known dimensions are never rescaled to fill that gap.
const ANCHOR_KM = [[0, 1], [5, .92], [10, .75], [15, .55], [20, .35], [30, .1], [40, 0]];
const STATION_KM = [[0, 1], [.3, .95], [.6, .8], [1, .55], [1.5, .25], [2.5, 0]];
const HOUSEHOLDS = [[0, 0], [100, .2], [300, .45], [500, .7], [1000, .9], [1500, 1]];
const AGE_YEARS = [[0, 1], [5, .95], [10, .8], [20, .5], [30, .2], [40, 0]];
const REFERENCE_CONFIDENCE = Object.freeze({ dong: .65, district: .35 });

function finite(value) {
  if (value === null || value === undefined || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value) {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}

function point(value) {
  // The catalog has no zero-is-missing coordinate convention. Reject the
  // common placeholder pair explicitly and never coerce null/blank to zero.
  if ([value?.lat, value?.lng].some((coordinate) => typeof coordinate === 'boolean')) return null;
  const normalized = normalizeGeoPoint(value);
  return normalized && (normalized.lat !== 0 || normalized.lng !== 0) ? normalized : null;
}

function round(value, digits = 2) {
  return Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null;
}

function compareText(left, right) {
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}

function preference(value, stops) {
  if (value <= stops[0][0]) return stops[0][1];
  for (let index = 1; index < stops.length; index += 1) {
    const [high, highScore] = stops[index];
    const [low, lowScore] = stops[index - 1];
    if (value <= high) return lowScore + (highScore - lowScore) * (value - low) / (high - low);
  }
  return stops.at(-1)[1];
}

function distanceLabel(distanceKm) {
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m` : `${distanceKm.toFixed(1)}km`;
}

function sourceMeta(value) {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object'
    ? { name: String(value.name || ''), url: String(value.url || ''), updatedAt: String(value.updatedAt || value.publishedDate || '') }
    : null;
}

function dimension(weight, value, utility, { status = 'provided', confidence = 1, label = '', source = null } = {}) {
  const known = value !== null && Number.isFinite(utility);
  return {
    value, score: known ? round(weight * Math.max(0, Math.min(1, utility)) * confidence, 4) : 0,
    maxScore: weight, status: known ? status : 'unknown', confidence: known ? confidence : 0,
    label, source: sourceMeta(source),
  };
}

function stationKey(station) {
  return String(station.id || station.stationId || `${station.name}|${station.line || ''}|${station.lat}|${station.lng}`);
}

function prepareStations(stations) {
  return (Array.isArray(stations) ? stations : []).flatMap((station) => {
    if (!station || typeof station !== 'object' || !String(station.name || '').trim()
        || ['district', 'dong'].includes(station.precision) || station.operating === false) return [];
    const coordinates = point(station);
    return coordinates ? [{ ...station, ...coordinates, key: stationKey(station) }] : [];
  }).sort((left, right) => compareText(left.key, right.key));
}

function nearestProvidedStation(origin, stations) {
  if (!origin || !stations.length) return null;
  let selected = null;
  for (const station of stations) {
    const distanceKm = haversineKm(origin, station);
    if (!Number.isFinite(distanceKm)) continue;
    if (!selected || distanceKm < selected.distanceKm) selected = { station, distanceKm };
  }
  if (!selected) return null;
  const { station, distanceKm } = selected;
  return {
    id: station.key, name: station.name, lat: station.lat, lng: station.lng,
    lines: Array.isArray(station.lines) ? [...station.lines] : station.line ? [String(station.line)] : [],
    distanceKm: round(distanceKm, 4),
    coordinateType: station.coordinateType === 'entrance' ? 'entrance' : 'station',
    distanceKind: 'straight-line', scope: 'provided-station-catalog',
    source: sourceMeta(station.source), updatedAt: String(station.updatedAt || ''),
  };
}

function candidateIdentity(candidate, index) {
  if (String(candidate.catalogId || '').trim()) return `catalog:${candidate.catalogId}`;
  if (String(candidate.aptSeq || '').trim()) return `apartment:${candidate.regionCode || ''}:${candidate.aptSeq}`;
  if (String(candidate.id || '').trim()) return `id:${candidate.id}`;
  if (String(candidate.name || '').trim() && String(candidate.address || '').trim()) {
    return `address:${candidate.regionCode || ''}:${candidate.dong || ''}:${candidate.address}:${candidate.name}`;
  }
  return `unidentified:${index}`;
}

function describeCandidate(candidate, options, stations, anchorPoint, profile, currentYear, index) {
  const weights = LOCATION_PROFILES[profile];
  const declaredPrecision = candidate.coordinatePrecision || candidate.locationPrecision;
  const exactPoint = ['district', 'dong', 'approximate'].includes(declaredPrecision) ? null : point(candidate);
  const reference = candidate.locationReference;
  const referencePrecision = Object.hasOwn(REFERENCE_CONFIDENCE, reference?.precision || '') ? reference.precision : null;
  const referencePoint = !exactPoint && referencePrecision ? point(reference) : null;
  const coordinatePrecision = exactPoint ? 'exact' : referencePoint ? referencePrecision : 'unknown';
  const locationPoint = exactPoint || referencePoint;
  const confidence = exactPoint ? 1 : referencePoint ? REFERENCE_CONFIDENCE[referencePrecision] : 0;
  const anchorKm = anchorPoint && locationPoint ? haversineKm(locationPoint, anchorPoint) : null;
  const anchorName = String(options.anchor?.name || '기준점');
  const referenceLabel = referencePoint ? String(reference.label || (referencePrecision === 'dong' ? '동 대표점' : '시군구 대표점')) : null;
  const nearestStation = nearestProvidedStation(exactPoint, stations);
  const householdValue = positive(candidate.households);
  const households = Number.isInteger(householdValue) ? householdValue : null;
  const builtYear = finite(candidate.builtYear);
  const ageYears = Number.isInteger(builtYear) && builtYear >= 1900 && Number.isInteger(currentYear)
    && builtYear <= currentYear ? currentYear - builtYear : null;
  const price = candidate.priceVerified === false ? null : positive(candidate.bestArea?.averagePriceManWon);
  const maxPrice = positive(options.maxPriceManWon);
  const budgetRatio = price !== null && maxPrice !== null ? price / maxPrice : null;

  const dimensions = {
    anchor: dimension(weights.anchor, Number.isFinite(anchorKm) ? anchorKm : null,
      Number.isFinite(anchorKm) ? preference(anchorKm, ANCHOR_KM) : null, {
        status: exactPoint ? 'calculated' : 'approximate', confidence,
        label: Number.isFinite(anchorKm)
          ? `${anchorName} ${referencePoint ? `${referenceLabel} 기준 대략 직선거리` : '직선거리'} ${distanceLabel(anchorKm)}`
          : anchorPoint ? '단지·지역 위치 미확인' : '기준점 좌표 미연결',
        source: referencePoint ? reference.source : options.anchor?.source,
      }),
    station: dimension(weights.station, nearestStation?.distanceKm ?? null,
      nearestStation ? preference(nearestStation.distanceKm, STATION_KM) : null, {
        status: 'calculated', label: nearestStation
          ? `역 자료 내 ${nearestStation.name} ${nearestStation.coordinateType === 'entrance' ? '출입구' : '역 좌표'} 직선거리 ${distanceLabel(nearestStation.distanceKm)}`
          : !stations.length ? '역 좌표 자료 미연결' : '단지 좌표 확인 후 역 거리 계산',
        source: nearestStation?.source,
      }),
    households: dimension(weights.households, households, households === null ? null : preference(households, HOUSEHOLDS), {
      label: households === null ? '세대수 미확인' : `${households.toLocaleString('ko-KR')}세대`, source: candidate.source,
    }),
    age: dimension(weights.age, ageYears, ageYears === null ? null : preference(ageYears, AGE_YEARS), {
      label: ageYears === null ? '준공연도 미확인' : `${builtYear}년 준공 · 준공 후 ${ageYears}년`, source: candidate.source,
    }),
    // Price is an upstream filter, not a reward for cheaper distant regions.
    // All observed averages inside the same budget get the same five points.
    budget: dimension(weights.budget, budgetRatio,
      budgetRatio === null ? null : budgetRatio <= 1 ? 1 : 0, {
        label: budgetRatio === null ? '예산·평균 실거래 기준 미확인'
          : `조회기간 평균 실거래가 예산의 ${(budgetRatio * 100).toFixed(1)}%${budgetRatio > 1 ? ' · 예산 초과' : ''}`,
        source: '국토부 실거래 평균 / 입력한 예산',
      }),
  };
  const entries = Object.values(dimensions);
  const known = entries.filter((item) => item.status !== 'unknown');
  const score = known.length ? round(known.reduce((sum, item) => sum + item.score, 0), 2) : null;
  const coveragePct = round(known.reduce((sum, item) => sum + item.maxScore * item.confidence, 0), 1);
  return {
    ...candidate,
    locationRecommendation: {
      version: 1, identity: candidateIdentity(candidate, index), profile,
      score, maxScore: 100, coveragePct, dimensions,
      coordinatePrecision, referenceLabel,
      anchorName, anchorDistanceKm: exactPoint && Number.isFinite(anchorKm) ? round(anchorKm, 4) : null,
      approximateAnchorDistanceKm: referencePoint && Number.isFinite(anchorKm) ? round(anchorKm, 4) : null,
      nearestStation, households, builtYear: ageYears === null ? null : builtYear, ageYears,
      averagePriceManWon: price, budgetWithinLimit: budgetRatio === null ? null : budgetRatio <= 1,
      rankingEligible: Boolean((locationPoint && anchorPoint) || (exactPoint && nearestStation)),
      reasons: known.map((item) => item.label),
      unknowns: [...entries.filter((item) => item.status === 'unknown').map((item) => item.label), '실제 이동 경로·도보시간 미확인'],
      scoreMeaning: '고정 선호 가중치에 따른 입지 참고점수 · 미확인 항목 0점',
      duplicateCandidateCount: 1,
    },
  };
}

function compareCandidates(left, right) {
  const a = left.locationRecommendation;
  const b = right.locationRecommendation;
  return Number(b.rankingEligible) - Number(a.rankingEligible)
    || (b.score ?? -1) - (a.score ?? -1)
    || b.coveragePct - a.coveragePct
    || compareText(a.identity, b.identity)
    || compareText(left.name || '', right.name || '')
    || compareText(left.address || '', right.address || '')
    || (a.averagePriceManWon ?? Infinity) - (b.averagePriceManWon ?? Infinity);
}

/**
 * Returns new, sorted candidate objects with explainable locationRecommendation
 * metadata. Existing price/commute verdicts are untouched; this is not a hard
 * eligibility or affordability check. Provide the verified Gangnam anchor from
 * the station dataset; no coordinate is invented when the anchor is omitted.
 *
 * With missing apartment coordinates, an explicitly sourced `locationReference`
 * ({lat,lng,label,precision:'dong'|'district'}) is used only for approximate anchor
 * distance. It can never supply an apartment pin or a nearest-station claim.
 * Each catalogId/aptSeq occurs once; multiple areas do not inflate complex counts.
 */
export function rankLocationCandidates(candidates = [], options = {}) {
  const profile = Object.hasOwn(LOCATION_PROFILES, options.profile || '') ? options.profile : 'balanced';
  const currentYear = options.currentYear === undefined ? new Date().getUTCFullYear() : finite(options.currentYear);
  const stations = prepareStations(options.stations);
  const anchorPoint = ['district', 'dong', 'approximate'].includes(options.anchor?.precision) ? null : point(options.anchor);
  const enriched = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate))
    .map((candidate, index) => describeCandidate(candidate, options, stations, anchorPoint, profile, currentYear, index))
    .sort(compareCandidates);
  const distinct = new Map();
  for (const candidate of enriched) {
    const id = candidate.locationRecommendation.identity;
    if (distinct.has(id)) distinct.get(id).locationRecommendation.duplicateCandidateCount += 1;
    else distinct.set(id, candidate);
  }
  return [...distinct.values()];
}
