import { sanitizePersistedRecommendationCandidate } from './recommendation-persistence-core.mjs';
import { formatPriceManwon } from './display-format.mjs';
import { normalizePriceCoverage } from './price-coverage-core.mjs?v=4.6.1';
import { normalizeTransactionActivity } from './transaction-activity-core.mjs';

const VERSION = 1;
const PREFIX = 'review-conditions-v1:';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const text = value => typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
const numeric = value => (typeof value === 'number' || typeof value === 'string' && value.trim())
  && Number.isFinite(Number(value)) ? Number(value) : null;
const clone = value => structuredClone(value);

const FILTER_NUMBERS = [
  'minHouseholds', 'targetPriceManWon', 'manualTargetPriceManWon', 'maxOverBudgetPct',
  'maxPriceManWon', 'minAreaM2', 'maxAgeYears', 'stationWalkMin', 'stationWalkMax',
  'minParkingRatio', 'commuteMaxMinutes', 'months',
];
const FILTER_TEXT = ['budgetSource', 'householdsOperator', 'priceOperator', 'areaOperator', 'areaBasis', 'commuteDepartureTime'];
const FILTER_BOOLEAN = ['preferSubway', 'excludeFar', 'requireParking'];
const COMPANY_TEXT = ['id', 'label', 'name', 'address', 'query', 'weightSource', 'departureTime', 'preferSubwaySource'];
const COMPANY_NUMBERS = ['weight', 'weightPercent', 'daysPerWeek', 'individualMaxMinutes', 'maxMinutes'];
const COMPANY_BOOLEAN = ['required', 'preferSubway'];
const SAFE_COORDINATE_SOURCES = new Set(['manual', 'user-provided', 'official']);

function scalars(input, strings, numbers = [], booleans = []) {
  const result = {};
  for (const key of strings) if (typeof input[key] === 'string') result[key] = text(input[key]);
  for (const key of numbers) {
    const value = numeric(input[key]);
    if (value !== null) result[key] = value;
  }
  for (const key of booleans) if (typeof input[key] === 'boolean') result[key] = input[key];
  return result;
}

function selection(input, allowed) {
  return [...new Set((Array.isArray(input) ? input : []).filter(value => allowed.includes(value)))].sort();
}

function safeCoordinates(input) {
  const providerSourced = ['provider', 'source', 'locationSource', 'geocodeProvider'].some(key =>
    typeof input[key] === 'string' && /kakao|naver|tmap|카카오|네이버/i.test(input[key]));
  const lat = numeric(input.lat), lng = numeric(input.lng);
  if (!SAFE_COORDINATE_SOURCES.has(input.coordinateSource) || providerSourced
    || lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return {};
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, coordinateSource: input.coordinateSource };
}

function company(input) {
  if (!record(input)) return null;
  const result = { ...scalars(input, COMPANY_TEXT, COMPANY_NUMBERS, COMPANY_BOOLEAN), ...safeCoordinates(input) };
  if (input.id != null && ['string', 'number'].includes(typeof input.id)) result.id = String(input.id);
  if (Array.isArray(input.modes)) result.modes = selection(input.modes, ['transit', 'car', 'walk', 'bike']);
  else if (typeof input.mode === 'string') result.modes = selection(input.mode.split('+'), ['transit', 'car', 'walk', 'bike']);
  return Object.keys(result).length ? result : null;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!record(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function companies(input) {
  return (Array.isArray(input) ? input : []).map(company).filter(Boolean)
    .sort(canonicalCompare);
}

function canonicalCompare(a, b) {
  const left = canonical(a), right = canonical(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Only the user's search inputs participate; provider metrics and results do not. */
function conditions(snapshot) {
  if (!record(snapshot) || !record(snapshot.filters)) return null;
  const input = snapshot.filters;
  const filters = scalars(input, FILTER_TEXT, FILTER_NUMBERS, FILTER_BOOLEAN);
  if (Array.isArray(input.regions)) filters.regions = selection(input.regions, ['seoul', 'gyeonggi']);
  if (Array.isArray(input.commuteModes)) filters.commuteModes = selection(input.commuteModes, ['transit', 'car', 'walk', 'bike']);
  const workplaces = companies(input.workplaces);
  const destinations = companies(snapshot.destinations ?? input.destinations ?? input.workplaces);
  if (!Object.keys(filters).length && !workplaces.length && !destinations.length) return null;
  return { filters, workplaces, destinations };
}

/**
 * A canonical comparison value, not a route cache key or a claim of freshness.
 * Keeping the canonical inputs avoids hash collisions marking changed conditions
 * as equal. It belongs in private user storage because it includes company inputs.
 */
export function candidateReviewConditionSignature(snapshot) {
  const value = conditions(snapshot);
  return value ? `${PREFIX}${canonical(value)}` : '';
}

/**
 * In-memory request identity only. This includes exact provider coordinates so
 * a corrected location always invalidates live search reuse. Never save it in a
 * bookmark, browser storage, a file, or a cloud snapshot.
 */
export function liveRecommendationSearchKey(snapshot, provider = '') {
  const value = conditions(snapshot);
  if (!value) return '';
  const input = snapshot.filters;
  const exactCompanies = items => (Array.isArray(items) ? items : []).filter(record).map(item => ({
    ...company(item), lat: numeric(item.lat), lng: numeric(item.lng),
  })).sort(canonicalCompare);
  return `live-review-v1:${canonical({
    ...value,
    filters: { ...value.filters, ...scalars(input, [], ['minBuiltYear']) },
    destinations: exactCompanies(snapshot.destinations ?? input.destinations ?? input.workplaces),
    workplaces: exactCompanies(input.workplaces),
    provider: text(provider).toLowerCase(),
  })}`;
}

export function candidateReviewConditionSummary(snapshot) {
  const value = conditions(snapshot);
  if (!value) return '저장 당시 조건 없음';
  const { filters, destinations } = value;
  const parts = [];
  if (filters.regions?.length) parts.push(filters.regions.map(region => region === 'seoul' ? '서울' : '경기').join('·'));
  if (filters.targetPriceManWon > 0) parts.push(`${filters.budgetSource === 'wecost' ? 'WeCost ' : ''}목표 ${formatPriceManwon(filters.targetPriceManWon)}${filters.maxOverBudgetPct > 0 ? ` +${filters.maxOverBudgetPct}% 허용` : ''}`);
  if (filters.minHouseholds != null) parts.push(`${filters.minHouseholds.toLocaleString('ko-KR')}세대 ${filters.householdsOperator === 'gt' ? '초과' : '이상'}`);
  if (filters.minAreaM2 != null) parts.push(`전용 ${Number(filters.minAreaM2.toFixed(1))}㎡ ${filters.areaOperator === 'gt' ? '초과' : '이상'}`);
  if (filters.maxAgeYears != null) parts.push(`${filters.maxAgeYears}년 이내`);
  if (destinations.length === 1 && destinations[0].id === 'default-gangnam') parts.push('강남역 기준');
  else if (destinations.length) parts.push(`회사 ${destinations.length}곳`);
  return parts.join(' · ') || '저장 당시 검색 조건';
}

const HOUSING_TEXT = ['aptSeq', 'name', 'address', 'regionCode', 'regionName', 'dong', 'dealType', 'pricingBasis'];
const HOUSING_NUMBERS = ['households', 'builtYear', 'actualDealCount'];
const AREA_NUMBERS = ['areaM2', 'medianPriceManWon', 'averagePriceManWon', 'latestPriceManWon', 'latestDay', 'minPriceManWon', 'maxPriceManWon', 'count'];

function safeArea(area) {
  return record(area) ? scalars(area, ['aptSeq', 'latestMonth'], AREA_NUMBERS) : null;
}

function candidateId(candidate) {
  const value = candidate?.catalogId ?? candidate?.id ?? candidate?.aptSeq;
  return ['string', 'number'].includes(typeof value) ? String(value).trim() : '';
}

function safeHousing(candidate) {
  const raw = sanitizePersistedRecommendationCandidate(candidate);
  if (!record(raw) || !candidateId(raw)) return null;
  const result = {
    ...scalars(raw, HOUSING_TEXT, HOUSING_NUMBERS, ['priceVerified', 'priceProvisional']),
    catalogId: candidateId(raw), ...safeCoordinates(raw),
  };
  if (typeof raw.id === 'string' || typeof raw.id === 'number') result.id = String(raw.id);
  if (Array.isArray(raw.aliases)) result.aliases = raw.aliases.filter(item => typeof item === 'string').map(text);
  if (record(raw.bestArea)) result.bestArea = safeArea(raw.bestArea);
  if (own(raw, 'transactionActivity')) {
    const activity = normalizeTransactionActivity(raw.transactionActivity);
    if (activity) result.transactionActivity = activity;
  }
  if (own(raw, 'priceCoverage')) {
    result.priceCoverage = normalizePriceCoverage(raw.priceCoverage);
    result.priceProvisional = raw.priceProvisional === true || result.priceCoverage.status !== 'complete';
  }
  for (const key of ['areas', 'qualifyingAreas', 'areaSummaries']) {
    if (Array.isArray(raw[key])) result[key] = raw[key].map(safeArea).filter(Boolean);
  }
  if (Object.keys(safeCoordinates(raw)).length && typeof raw.coordinateType === 'string') result.coordinateType = raw.coordinateType;
  return result;
}

/**
 * Explicit user bookmark, never an automatically persisted commute decision.
 * Rebuild by allowlist after the shared persistence sanitizer so even unlabelled
 * verdicts or route fields hidden inside price summaries cannot be retained.
 */
export function createCandidateReviewBookmark(candidate, snapshot, { now = Date.now() } = {}) {
  const safe = safeHousing(candidate);
  if (!safe) throw new TypeError('저장할 단지 식별자가 없습니다.');
  const savedAt = new Date(typeof now === 'function' ? now() : now).toISOString();
  return {
    ...safe, savedAt, status: '검토',
    review: { version: VERSION, source: 'user-selection', savedAt,
      conditionSignature: candidateReviewConditionSignature(snapshot),
      conditionSummary: candidateReviewConditionSummary(snapshot) },
  };
}

/** Equality refers only to user conditions, never to a persisted route verdict. */
export function compareBookmarkConditions(bookmark, snapshot) {
  const metadata = bookmark?.review;
  const signature = candidateReviewConditionSignature(snapshot);
  if (metadata?.version !== VERSION || metadata.source !== 'user-selection'
    || typeof metadata.conditionSignature !== 'string' || !metadata.conditionSignature.startsWith(PREFIX)
    || !signature) return 'unknown';
  return metadata.conditionSignature === signature ? 'same' : 'changed';
}

/** Update only independently sourced public activity after an explicit refresh.
 * A bookmark's prices, user notes and saved conditions are not refreshed by
 * this merge. Live routes, scores and verdicts from `freshCandidates` never
 * enter saved data. Conflicting or ambiguous identities retain the old facts.
 */
export function mergeSavedTransactionActivity(shortlist = [], freshCandidates = []) {
  const catalogId = candidate => ['string', 'number'].includes(typeof candidate?.catalogId)
    ? String(candidate.catalogId).trim() : '';
  const freshById = new Map();
  for (const candidate of Array.isArray(freshCandidates) ? freshCandidates : []) {
    const key = catalogId(candidate);
    const activity = normalizeTransactionActivity(candidate?.transactionActivity);
    if (!key || !activity) continue;
    if (!freshById.has(key)) freshById.set(key, []);
    freshById.get(key).push({ candidate, activity });
  }
  return (Array.isArray(shortlist) ? shortlist : []).map(saved => {
    const result = clone(saved);
    if (!record(saved) || !catalogId(saved)) return result;
    const matching = (freshById.get(catalogId(saved)) || []).filter(({ candidate }) =>
      !['address', 'aptSeq'].some(key => text(saved[key]) && text(candidate[key])
        && text(saved[key]) !== text(candidate[key])));
    if (matching.length === 1) result.transactionActivity = clone(matching[0].activity);
    return result;
  });
}

/**
 * A fresh union for the live review page: saved order first, then unsaved live
 * candidates. Current live evidence wins, saved metadata survives. Never persist
 * this merged view; persist only createCandidateReviewBookmark's result.
 */
export function mergeLiveReviewCandidates(saved = [], live = []) {
  const merged = new Map();
  for (const candidate of Array.isArray(saved) ? saved : []) {
    const id = candidateId(candidate);
    if (!id || merged.has(id)) continue;
    // Old saved routes must not become live evidence merely by opening this page.
    const safe = safeHousing(candidate);
    if (record(candidate.review)) safe.review = clone(candidate.review);
    for (const key of ['savedAt', 'status', 'memo']) if (typeof candidate[key] === 'string') safe[key] = candidate[key];
    merged.set(id, safe);
  }
  const seenLive = new Set();
  for (const candidate of Array.isArray(live) ? live : []) {
    const id = candidateId(candidate);
    if (!id || seenLive.has(id)) continue;
    seenLive.add(id);
    const savedCandidate = merged.get(id);
    const next = { ...savedCandidate, ...clone(candidate) };
    if (savedCandidate) {
      for (const key of ['review', 'savedAt', 'status', 'memo']) if (own(savedCandidate, key)) next[key] = clone(savedCandidate[key]);
    }
    merged.set(id, next);
  }
  return [...merged.values()];
}

/** Counts only the current view; do not store these provider-derived totals. */
export function collectReviewCounts(candidates = [], decisionFn) {
  const result = { total: 0, matched: 0, excluded: 0, pending: 0 };
  const seen = new Set();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const id = candidateId(candidate);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const decision = typeof decisionFn === 'function' ? decisionFn(candidate) : 'pending';
    result[['matched', 'excluded'].includes(decision) ? decision : 'pending']++;
    result.total++;
  }
  return result;
}
