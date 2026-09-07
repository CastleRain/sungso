const HOUR_MS = 60 * 60 * 1000;
export const DEFAULT_COMMUTE_TRANSIT_CACHE_HOURS = 8;
export const COMMUTE_CAR_CACHE_TTL_MS = 20 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;
export const COMMUTE_VERIFICATION_BATCH_CANDIDATES = 10;
export const COMMUTE_VERIFICATION_BATCH_TRANSIT_CALLS = 30;

/** One selected provider produces the final result; configured keys do not imply a hybrid. */
export function selectedCommuteProvider(config = {}, quota = {}) {
  const preference = String(config.transitProviderPreference || quota.transitProviderPreference || '').toLowerCase();
  if (preference === 'kakao' || preference === 'tmap') return preference;
  if (preference === 'auto') return config.providers?.kakaoTransitConfigured ? 'kakao'
    : config.providers?.tmapTransitConfigured ? 'tmap' : '';
  const selected = normalizedProvider(config.transitProvider || quota.provider || quota.transitProvider);
  return ['kakao', 'tmap'].includes(selected) ? selected : config.providers?.kakaoTransitConfigured ? 'kakao' : '';
}

/** Conservative call bound: Kakao only coalesces in-flight work; TMAP may reuse cache. */
export function planCommuteVerification(candidates = [], destinations = [], options = {}) {
  const callsPerCandidate = normalizeDestinations(destinations).filter(d => d.modes.includes('transit')).length;
  const remaining = Math.max(0, Math.trunc(finiteNumber(options.remainingDailyQuota) ?? 0));
  const callLimit = Math.min(COMMUTE_VERIFICATION_BATCH_TRANSIT_CALLS, remaining);
  const candidateCap = Math.min(COMMUTE_VERIFICATION_BATCH_CANDIDATES, candidates.length,
    callsPerCandidate ? Math.floor(callLimit / callsPerCandidate) : COMMUTE_VERIFICATION_BATCH_CANDIDATES);
  return { candidates: candidates.slice(0, candidateCap), candidateCount: candidateCap, callsPerCandidate,
    maxNewTransitCalls: candidateCap * callsPerCandidate, remainingDailyQuota: remaining };
}

/** Same route request across price/preference edits; Kakao has no departure-time parameter. */
export function commuteAttemptKey(candidate, destinations, provider) {
  const origin = originFingerprint(candidate);
  const normalized = normalizedProvider(provider);
  const routing = routeRequestFingerprint(normalizeDestinations(destinations).map(d => ({ ...d,
    departureTime: normalized === 'kakao' ? '' : d.departureTime })));
  return origin && routing ? `${normalized}|${origin}|${routing}` : '';
}

export function recentCommuteAttempt(candidate, destinations, provider, attempts, options = {}) {
  const key = commuteAttemptKey(candidate, destinations, provider);
  const entry = attempts?.get?.(key);
  if (!entry) return null;
  const checkedAt = timestamp(entry.checkedAt);
  const now = finiteNumber(options.now ?? Date.now());
  const hasCar = normalizeDestinations(destinations).some(d => d.modes.includes('car'));
  const hours = finiteNumber(options.transitCacheHours);
  const ttl = hasCar ? COMMUTE_CAR_CACHE_TTL_MS : (hours > 0 && hours < 24 ? hours : DEFAULT_COMMUTE_TRANSIT_CACHE_HOURS) * HOUR_MS;
  return checkedAt !== null && now !== null && checkedAt <= now + CLOCK_SKEW_MS && now < checkedAt + ttl ? entry : null;
}

/** Query order only: weighted straight-line distance, then known housing features. */
export function orderCommuteVerificationCandidates(candidates = [], destinations = []) {
  const targets = normalizeDestinations(destinations).filter(isGeoPoint);
  const weight = targets.reduce((sum, d) => sum + Math.max(0, d.weight), 0);
  const distance = c => isGeoPoint(c) && weight > 0
    ? targets.reduce((sum, d) => sum + haversineKm(c, d) * Math.max(0, d.weight), 0) / weight : Infinity;
  const facts = c => finiteNumber(c.personalizedRecommendation?.referenceScore) ?? 0;
  return [...candidates].sort((a, b) => distance(a) - distance(b) || facts(b) - facts(a)
    || String(a.catalogId || a.id || '').localeCompare(String(b.catalogId || b.id || '')));
}

function finiteNumber(value) {
  if (value === null || value === undefined || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundedCoordinate(value) {
  const number = finiteNumber(value);
  return number === null ? null : Math.round(number * 1_000_000) / 1_000_000;
}

/** The exact apartment origin used for the provider query, at sub-metre precision. */
export function originFingerprint(origin = {}) {
  const lat = roundedCoordinate(origin.lat ?? origin.latitude);
  const lng = roundedCoordinate(origin.lng ?? origin.lon ?? origin.longitude);
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? `origin-v1:${lat},${lng}` : '';
}

function timestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function evidenceRoutes(value) {
  if (Array.isArray(value)) return value.flatMap(evidenceRoutes);
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.routes)) return [...(value.best ? evidenceRoutes(value.best) : []), ...value.routes.flatMap(evidenceRoutes)];
  if (value.best && typeof value.best === 'object') return evidenceRoutes(value.best);
  return [value];
}

/**
 * Bound persisted route evidence by the same policy as local-market-server:
 * transit defaults to 8 hours (configured below 24), car to 20 minutes.
 * The whole matrix expires with its earliest conclusive route, so changing a
 * preference cannot select an already expired alternative. Cache hits retain
 * provider queriedAt; a newer UI verifiedAt never extends their source age.
 */
export function commuteEvidenceFreshness(candidate = {}, options = {}) {
  const verification = options.verification || candidate.commuteVerification;
  const stale = reason => ({ fresh: false, reason, expiresAt: null });
  if (verification?.stale === true) return stale(verification.staleReason || 'verification-marked-stale');
  const currentOrigin = originFingerprint(candidate);
  if (!currentOrigin || !verification?.originFingerprint) return stale('missing-origin-fingerprint');
  if (verification.originFingerprint !== currentOrigin) return stale('origin-coordinate-changed');
  const currentTime = typeof options.now === 'function' ? options.now() : options.now ?? Date.now();
  const currentMs = currentTime instanceof Date ? currentTime.getTime() : typeof currentTime === 'string' ? Date.parse(currentTime) : finiteNumber(currentTime);
  if (!Number.isFinite(currentMs)) return stale('invalid-verification-clock');
  const observedValue = verification.verifiedAt ?? verification.checkedAt;
  const observedAt = timestamp(observedValue);
  if (observedValue !== undefined && observedAt === null) return stale('invalid-verification-timestamp');
  const rawMatrix = options.routesByDestination || candidate.routesByDestination || candidate.commuteByDestination || {};
  const routes = (Array.isArray(rawMatrix) ? rawMatrix : Object.values(rawMatrix)).flatMap(evidenceRoutes)
    .filter(route => route.verified === true || /(?:^|_)NO_ROUTE$/.test(String(route.reasonCode || '')));
  if (!routes.length) return stale('missing-route-evidence');
  const savedHours = finiteNumber(verification.transitCacheHours);
  const currentHours = finiteNumber(options.transitCacheHours);
  const policyHours = savedHours > 0 && savedHours < 24 ? savedHours : DEFAULT_COMMUTE_TRANSIT_CACHE_HOURS;
  const transitTtl = Math.min(policyHours, currentHours > 0 && currentHours < 24 ? currentHours : policyHours) * HOUR_MS;
  let expiresAt = Infinity;
  for (const route of routes) {
    if (route.stale === true) return stale('route-marked-stale');
    const queriedAt = timestamp(route.queriedAt);
    if (route.queriedAt !== undefined && queriedAt === null) return stale('invalid-route-timestamp');
    const times = [observedAt, queriedAt].filter(value => value !== null);
    if (!times.length) return stale('missing-verification-timestamp');
    if (times.some(value => value > currentMs + CLOCK_SKEW_MS)) return stale('future-verification-timestamp');
    const mode = String(route.mode || route.type || '').toLowerCase();
    const provider = String(route.provider || '').toLowerCase();
    const ttl = ['car', 'driving', 'auto', 'automobile'].includes(mode) || provider.includes('naver-directions') ? COMMUTE_CAR_CACHE_TTL_MS : transitTtl;
    expiresAt = Math.min(expiresAt, Math.min(...times) + ttl);
  }
  return expiresAt <= currentMs ? stale('route-evidence-expired') : { fresh: true, reason: null, expiresAt: new Date(expiresAt).toISOString() };
}

function normalizedProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (provider.includes('tmap')) return 'tmap';
  if (provider.includes('kakao')) return 'kakao';
  if (provider.includes('naver') || provider === 'car') return 'naver';
  return provider || 'unknown';
}

/**
 * Captures every destination field that can change a commute decision or rank.
 * Labels and addresses are deliberately excluded: coordinates are the routing
 * identity, while a harmless rename should not expire a verified result.
 */
export function destinationFingerprint(destinations = [], options = {}) {
  const source = normalizeDestinations(destinations, options);
  const canonical = source.map((destination = {}, index) => {
    const modes = Array.isArray(destination.modes)
      ? destination.modes
      : String(destination.mode || 'transit').split(/[+,/|\s]+/).filter(Boolean);
    return {
      id: String(destination.id || `destination-${index + 1}`),
      lat: roundedCoordinate(destination.lat ?? destination.latitude),
      lng: roundedCoordinate(destination.lng ?? destination.lon ?? destination.longitude),
      required: destination.required !== false,
      modes: [...new Set(modes.map((mode) => String(mode).trim().toLowerCase()).filter(Boolean))].sort(),
      maxMinutes: finiteNumber(destination.maxMinutes),
      departureTime: String(destination.departureTime || ''),
      normalizedWeightPercent: Math.round(destination.normalizedWeightPercent * 1e10) / 1e10,
      preferSubway: destination.preferSubway,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  // v3 requires real routes for positive-weight destinations even when their
  // time limit is soft. Older cached verdicts must be evaluated again.
  return canonical.length ? `destinations-v3:${JSON.stringify(canonical)}` : '';
}

/** Preference edits can reuse routes; only this identity requires a new lookup. */
export function routeRequestFingerprint(destinations = []) {
  const canonical = normalizeDestinations(destinations).map(destination => ({
    id: destination.id,
    lat: roundedCoordinate(destination.lat),
    lng: roundedCoordinate(destination.lng),
    modes: [...destination.modes].sort(),
    departureTime: destination.departureTime || '',
  })).sort((left, right) => left.id.localeCompare(right.id));
  return canonical.length ? `route-requests-v1:${JSON.stringify(canonical)}` : '';
}

/**
 * Converts provider/stage/fingerprint provenance into the only decision the UI
 * may expose as final. A Kakao screening pass remains pending in hybrid mode;
 * a Kakao final lookup is valid when Kakao is the selected sole provider.
 */
export function candidateVerificationStatus(candidate = {}, options = {}) {
  const currentFingerprint = String(options.destinationFingerprint || '');
  const requireTmapFinal = options.requireTmapFinal === true;
  const verification = candidate.commuteVerification && typeof candidate.commuteVerification === 'object'
    ? candidate.commuteVerification
    : null;
  const finalBalance = candidate.commuteBalance && typeof candidate.commuteBalance === 'object'
    ? candidate.commuteBalance
    : null;
  const screening = candidate.commuteScreening && typeof candidate.commuteScreening === 'object'
    ? candidate.commuteScreening
    : null;
  const provider = normalizedProvider(verification?.provider || candidate.commuteProvider);
  const savedFingerprint = String(verification?.destinationFingerprint || '');
  const screeningContextMatches = screening && currentFingerprint && screening.destinationFingerprint === currentFingerprint;
  const screeningFreshness = screening ? commuteEvidenceFreshness(candidate, { ...options,
    verification: screening, routesByDestination: screening.routesByDestination }) : null;
  const screeningCurrent = screeningContextMatches && screeningFreshness?.fresh;
  const screeningDecision = screeningCurrent ? screening.balance?.decision || null : null;

  if (verification?.stage !== 'final' || !finalBalance) {
    if (screening && !screeningCurrent) return {
      decision: 'pending', final: false, stale: true, stage: 'stale', provider: normalizedProvider(screening.provider),
      reason: screening.stale === true ? screening.staleReason || 'verification-marked-stale'
        : !screeningContextMatches ? 'destination-fingerprint-changed' : screeningFreshness.reason,
      screeningDecision: null,
    };
    return {
      decision: 'pending',
      final: false,
      stale: false,
      stage: screening ? 'screening' : 'pending',
      provider: screening ? normalizedProvider(screening.provider) : provider,
      reason: screening ? 'screening-only' : 'not-verified',
      screeningDecision,
    };
  }
  if (verification.stale === true || !currentFingerprint || !savedFingerprint || savedFingerprint !== currentFingerprint) {
    return {
      decision: 'pending',
      final: false,
      stale: true,
      stage: 'stale',
      provider,
      reason: verification.staleReason || 'destination-fingerprint-changed',
      screeningDecision,
    };
  }
  const freshness = commuteEvidenceFreshness(candidate, options);
  if (!freshness.fresh) return {
    decision: 'pending', final: false, stale: true, stage: 'stale', provider,
    reason: freshness.reason, screeningDecision,
  };
  if (requireTmapFinal && provider !== 'tmap') {
    return {
      decision: 'pending',
      final: false,
      stale: false,
      stage: 'screening',
      provider,
      reason: 'tmap-final-required',
      screeningDecision: finalBalance.decision || screeningDecision,
    };
  }
  const decisive = finalBalance.requiredFullyVerified === true || finalBalance.measuredExcluded === true;
  const decision = decisive && ['matched', 'excluded'].includes(finalBalance.decision)
    ? finalBalance.decision
    : 'pending';
  return {
    decision,
    final: decisive && decision !== 'pending',
    stale: false,
    stage: 'final',
    provider,
    reason: decision === 'pending' ? 'incomplete-route-matrix' : null,
    screeningDecision,
  };
}

/** Marks persisted shortlist verdicts stale without deleting their old context. */
export function reconcileShortlistFingerprints(items = [], currentFingerprint = '', options = {}) {
  let changed = false;
  const next = (Array.isArray(items) ? items : []).map((candidate) => {
    const verification = candidate?.commuteVerification;
    if (!candidate?.commuteBalance) return candidate;
    if (!verification || verification.stage !== 'final') {
      changed = true;
      return {
        ...candidate,
        commuteVerification: {
          stage: 'final',
          provider: candidate.commuteProvider || 'unknown',
          destinationFingerprint: '',
          stale: true,
          staleReason: 'missing-destination-fingerprint',
        },
      };
    }
    const contextChanged = !currentFingerprint
      || !verification.destinationFingerprint
      || verification.destinationFingerprint !== currentFingerprint;
    const freshness = commuteEvidenceFreshness(candidate, options);
    const stale = verification.stale === true || contextChanged || !freshness.fresh;
    const staleReason = verification.stale === true ? verification.staleReason || 'verification-marked-stale'
      : contextChanged ? 'destination-fingerprint-changed' : freshness.reason || '';
    if (Boolean(verification.stale) === stale
      && String(verification.staleReason || '') === staleReason) return candidate;
    changed = true;
    return {
      ...candidate,
      commuteVerification: {
        ...verification,
        stale,
        ...(staleReason ? { staleReason } : { staleReason: '' }),
      },
    };
  });
  return { items: next, changed };
}

function monthIndex(value) {
  const match = String(value || '').match(/^(\d{4})-(0[1-9]|1[0-2])/);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

/**
 * Expands a selectable 1/3/5-year history window just enough to include the
 * visit month, capped at the provider's five-year contract.
 */
export function historyWindowForVisit(visitDate, options = {}) {
  const steps = (Array.isArray(options.steps) ? options.steps : [12, 36, 60])
    .map((value) => Math.trunc(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  const maxMonths = Math.max(1, Math.trunc(Number(options.maxMonths) || steps.at(-1) || 60));
  const currentMonths = Math.max(1, Math.min(maxMonths, Math.trunc(Number(options.currentMonths) || steps[0] || 12)));
  const visitIndex = monthIndex(visitDate);
  const endIndex = monthIndex(options.endMonth);
  if (visitIndex === null || endIndex === null || visitIndex > endIndex) {
    return { months: currentMonths, requiredMonths: null, includesVisit: false, capped: false, reason: visitIndex === null ? 'invalid-visit-date' : 'future-visit-date' };
  }
  const requiredMonths = endIndex - visitIndex + 1;
  const requested = Math.max(currentMonths, requiredMonths);
  const stepped = steps.find((months) => months >= requested) || maxMonths;
  const months = Math.min(maxMonths, stepped);
  return {
    months,
    requiredMonths,
    includesVisit: requiredMonths <= months,
    capped: requiredMonths > maxMonths,
    reason: requiredMonths > maxMonths ? 'older-than-history-limit' : null,
  };
}
import { normalizeDestinations } from './commute-balance-core.mjs';
import { haversineKm, isGeoPoint } from './transport-core.mjs';
