// Kakao route responses and their derived results belong to the current live
// view only. This module runs at persistence boundaries, never on live UI state.
const ROUTE_FIELDS = new Set(['routesByDestination', 'commuteByDestination', 'commute', 'routes', 'commuteRoutes']);
const DERIVED_FIELDS = new Set([
  'commuteBalance', 'commuteVerification', 'commuteProvider', 'destinationFingerprint',
  'personalizedRecommendation', 'recommendationScore', 'totalScore', 'score', 'balanceScore',
  'commuteDecision', 'commuteStatus', 'commuteVerified', 'commuteCheckedAt',
  'transportVerified', 'transportStatus',
  'weightedMeanMinutes', 'weightedMeanCostMinutes', 'weightedCostMinutes',
  'weightedMeanWalkingMinutes', 'weightedMeanTransfers', 'worstRatio',
]);
const ROUTE_FACTS = new Set([
  'durationMinutes', 'minutes', 'totalTime', 'totalDistance', 'walkingMinutes', 'walkMinutes',
  'transferCount', 'transfers', 'subwayMinutes', 'busMinutes', 'transitComposition',
  'steps', 'legs', 'landingUrl', 'landingURL', 'path',
]);
const DROP = Symbol('current-view-only');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const kakao = value => typeof value === 'string' && /kakao|카카오/i.test(value);
const provider = value => object(value)
  ? value.provider || value.commuteProvider || value.transitProvider
    || (typeof value.source === 'string' ? value.source : '') : '';
const routeLike = value => object(value) && (Object.keys(value).some(key => ROUTE_FACTS.has(key))
  || value.mode && ('verified' in value || 'reasonCode' in value || 'status' in value));

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!object(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
}

function hasKakaoEvidence(value, inheritedProvider = '') {
  if (Array.isArray(value)) return value.some(item => hasKakaoEvidence(item, inheritedProvider));
  if (!object(value)) return false;
  const ownProvider = provider(value);
  const origin = ownProvider || inheritedProvider;
  if (kakao(ownProvider) || routeLike(value) && kakao(origin)) return true;
  return Object.values(value).some(item => item && typeof item === 'object' && hasKakaoEvidence(item, origin));
}

/** Keep independently attributed non-Kakao alternatives; discard mixed summaries. */
function cleanRoutes(value, inheritedProvider = '') {
  if (Array.isArray(value)) return value.map(item => cleanRoutes(item, inheritedProvider)).filter(item => item !== DROP).flat();
  if (!object(value)) return clone(value);
  const origin = provider(value) || inheritedProvider;
  if (!hasKakaoEvidence(value, inheritedProvider)) return clone(value);
  if (Array.isArray(value.routes) || object(value.best)) {
    const alternatives = [...(object(value.best) ? [value.best] : []), ...(value.routes || [])];
    // Converting a mixed wrapper to route alternatives removes its cached
    // fastest/within-limit summary, which could have come from the removed route.
    return cleanRoutes(alternatives, origin);
  }
  if (routeLike(value) || kakao(provider(value))) return DROP;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const safe = cleanRoutes(item, origin);
    if (safe === DROP || Array.isArray(safe) && !safe.length) return [];
    return [[key, safe]];
  }));
}

function sanitizeRecord(value) {
  const routeProvider = value.commuteVerification?.provider || value.commuteProvider || provider(value);
  const hasMainFields = [...ROUTE_FIELDS, 'commuteBalance', 'commuteVerification', 'personalizedRecommendation',
    'commuteDecision', 'commuteStatus', 'commuteVerified', 'commuteCheckedAt', 'transportVerified', 'transportStatus']
    .some(key => value[key] != null);
  const screeningTainted = hasKakaoEvidence(value.commuteScreening);
  const independentFinal = value.commuteVerification?.stage === 'final'
    && /tmap|naver|^car$/i.test(String(routeProvider));
  const mainTainted = (hasMainFields || value.commuteProvider != null) && (kakao(routeProvider)
    || [...ROUTE_FIELDS, 'commuteBalance', 'personalizedRecommendation']
      .some(key => hasKakaoEvidence(value[key], routeProvider))) || screeningTainted && !independentFinal;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'commuteScreening' && screeningTainted) continue;
    if (mainTainted && DERIVED_FIELDS.has(key)) continue;
    if (mainTainted && ['provider', 'source', 'transitProvider'].includes(key) && kakao(item)) continue;
    if (ROUTE_FIELDS.has(key)) {
      const safe = cleanRoutes(item, routeProvider);
      if (safe !== DROP && !(Array.isArray(safe) && !safe.length) && !(object(safe) && !Object.keys(safe).length)) {
        Object.defineProperty(result, key, { value: safe, enumerable: true, configurable: true, writable: true });
      }
      continue;
    }
    const safe = sanitize(item);
    if (safe !== DROP) Object.defineProperty(result, key, { value: safe, enumerable: true, configurable: true, writable: true });
  }
  return result;
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize).filter(item => item !== DROP);
  if (!object(value)) return value;
  // Also protect raw route arrays inside an imported/exported JSON envelope.
  if (routeLike(value) && kakao(provider(value))) return DROP;
  return sanitizeRecord(value);
}

/**
 * Pure, non-mutating sanitizer for a candidate or visit with attached routes.
 * A Kakao-only screening result is independent of a later TMAP final result:
 * remove that screening while preserving the TMAP final evidence and score.
 * Mixed final matrices retain non-Kakao routes but lose all combined verdicts.
 * Price facts, official geometry, personal inputs, and location-only scores are
 * independent evidence and are preserved.
 */
export function sanitizePersistedRecommendationCandidate(candidate) {
  return object(candidate) ? sanitizeRecord(candidate) : candidate;
}

/** Recursively protects JSON exports/imports and storage envelopes as well. */
export function sanitizeHomehuntPersistence(value) {
  const result = sanitize(value);
  return result === DROP ? null : result;
}
