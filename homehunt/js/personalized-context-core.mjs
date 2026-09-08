import { normalizeDestinations, evaluateCommuteBalance } from './commute-balance-core.mjs';
import { destinationFingerprint, routeRequestFingerprint, commuteEvidenceFreshness } from './recommendation-verification-core.mjs';
import { isGeoPoint } from './transport-core.mjs';
export { orderLocationVerificationQueue } from './location-verification-queue.mjs';

export function recommendationBudget(targetPriceManWon, maxOverBudgetPct = 10) {
  const isNumericInput = value => (typeof value === 'number' || typeof value === 'string')
    && (typeof value !== 'string' || value.trim() !== '');
  if (!isNumericInput(targetPriceManWon) || !isNumericInput(maxOverBudgetPct)) return null;
  const target = Number(targetPriceManWon);
  const tolerance = Number(maxOverBudgetPct);
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 100) return null;
  // Multiply the whole percentage first so e.g. 90000 + 15% stays 103500,
  // instead of flooring the binary approximation of 90000 * 1.15 to 103499.
  const ceiling = target * (100 + tolerance) / 100;
  if (!Number.isFinite(ceiling) || ceiling > Number.MAX_SAFE_INTEGER) return null;
  const nearestWhole = Math.round(ceiling);
  const precisionError = Math.min(1e-7, Number.EPSILON * Math.abs(ceiling));
  const maxPriceManWon = Math.floor(Math.abs(ceiling - nearestWhole) <= precisionError ? nearestWhole : ceiling);
  return { targetPriceManWon: target, maxOverBudgetPct: tolerance, maxPriceManWon };
}

export function effectiveRecommendationDestinations(workplaces, anchor, filters = {}) {
  const defaults = { modes: filters.commuteModes || ['transit'], maxMinutes: filters.commuteMaxMinutes || 60,
    departureTime: filters.commuteDepartureTime || '08:00', preferSubway: filters.preferSubway !== false };
  if (workplaces?.length) return normalizeDestinations(workplaces.map(d => ({ ...d,
    modes: defaults.modes, departureTime: defaults.departureTime, preferSubway: defaults.preferSubway, preferSubwaySource: 'explicit',
    maxMinutes: d.individualMaxMinutes ?? defaults.maxMinutes,
  })));
  if (!isGeoPoint(anchor)) return [];
  return normalizeDestinations([{ ...anchor, id: 'default-gangnam', label: '강남역', address: '기본 추천 목적지 · 강남역',
    ...defaults, weightPercent: 100, weightSource: 'explicit-percent', required: true, isDefault: true }]);
}

/** Keep the same observed routes when only preferences change, never across addresses or departures. */
export function reconcileCandidateRecommendationContext(candidate, previousDestinations, destinations, options = {}) {
  const previousFingerprint = destinationFingerprint(previousDestinations);
  const fingerprint = destinationFingerprint(destinations);
  const sameRequest = routeRequestFingerprint(previousDestinations) === routeRequestFingerprint(destinations);
  const freshness = commuteEvidenceFreshness(candidate, options);
  const screeningFreshness = commuteEvidenceFreshness(candidate, { ...options, verification: candidate.commuteScreening, routesByDestination: candidate.commuteScreening?.routesByDestination });
  const reusable = sameRequest && freshness.fresh
    && candidate.commuteVerification?.destinationFingerprint === previousFingerprint;
  const screeningReusable = sameRequest && screeningFreshness.fresh && candidate.commuteScreening?.destinationFingerprint === previousFingerprint;
  const next = { ...candidate };
  delete next.personalizedRecommendation;
  if (reusable && candidate.routesByDestination) {
    next.commuteBalance = evaluateCommuteBalance(candidate, destinations, options);
    next.destinationFingerprint = fingerprint;
    next.commuteVerification = { ...candidate.commuteVerification, destinationFingerprint: fingerprint };
  } else if (candidate.routesByDestination || candidate.commuteBalance || candidate.commuteVerification) {
    delete next.routesByDestination; delete next.commuteBalance; delete next.commute;
    const staleReason = candidate.commuteVerification?.stale === true ? candidate.commuteVerification.staleReason || 'verification-marked-stale'
      : sameRequest && candidate.commuteVerification?.destinationFingerprint === previousFingerprint && !freshness.fresh ? freshness.reason : 'destination-context-changed';
    next.commuteVerification = { ...(candidate.commuteVerification || {}), stale: true, staleReason };
  }
  if (screeningReusable) next.commuteScreening = { ...candidate.commuteScreening, destinationFingerprint: fingerprint,
    balance: evaluateCommuteBalance({ routesByDestination: candidate.commuteScreening.routesByDestination }, destinations, options) };
  else delete next.commuteScreening;
  return next;
}

export function destinationLetter(index) {
  let n = Math.max(0, Math.trunc(index)) + 1;
  let label = '';
  while (n) { n -= 1; label = String.fromCharCode(65 + n % 26) + label; n = Math.floor(n / 26); }
  return label;
}
