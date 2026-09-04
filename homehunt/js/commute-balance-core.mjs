const DEFAULT_MAX_DESTINATIONS = 4;
const DEFAULT_MAX_MINUTES = 60;
const DEFAULT_DAYS_PER_WEEK = 1;
const SUPPORTED_MODES = new Set(['transit', 'car', 'walk', 'bike']);

function finiteNumber(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function text(value) {
  return String(value ?? '').trim();
}

function slug(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function normalizeModes(value) {
  const raw = Array.isArray(value)
    ? value
    : text(value).toLowerCase().split(/[,+/|\s]+/).filter(Boolean);
  const aliases = {
    public: 'transit',
    public_transport: 'transit',
    subway: 'transit',
    bus: 'transit',
    driving: 'car',
    auto: 'car',
    automobile: 'car',
    walking: 'walk',
    bicycle: 'bike',
  };
  const normalized = raw
    .map((item) => aliases[text(item).toLowerCase()] || text(item).toLowerCase())
    .filter((item) => SUPPORTED_MODES.has(item));
  return [...new Set(normalized.length ? normalized : ['transit'])];
}

function normalizeTime(value) {
  const match = text(value).match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function validCoordinate(value, min, max) {
  const number = finiteNumber(value);
  return number !== null && number >= min && number <= max ? number : null;
}

/**
 * Canonicalizes one workplace/destination without inventing a coordinate.
 * `weight` wins when supplied; otherwise days-per-week is the weight.
 */
export function normalizeDestination(destination = {}, index = 0, defaults = {}) {
  const label = text(destination.label || destination.name || destination.companyName)
    || `목적지 ${index + 1}`;
  const address = text(destination.address || destination.companyAddress);
  const lat = validCoordinate(destination.lat ?? destination.latitude, -90, 90);
  const lng = validCoordinate(destination.lng ?? destination.lon ?? destination.longitude, -180, 180);
  const suppliedDays = finiteNumber(destination.daysPerWeek);
  const daysPerWeek = clamp(
    suppliedDays === null ? (finiteNumber(defaults.daysPerWeek) ?? DEFAULT_DAYS_PER_WEEK) : suppliedDays,
    0,
    7,
  );
  const suppliedWeight = finiteNumber(destination.weight);
  const weight = Math.max(0, suppliedWeight === null ? daysPerWeek : suppliedWeight);
  const suppliedMax = finiteNumber(destination.maxMinutes);
  const maxMinutes = clamp(
    suppliedMax === null ? (finiteNumber(defaults.maxMinutes) ?? DEFAULT_MAX_MINUTES) : suppliedMax,
    1,
    360,
  );
  const modes = normalizeModes(destination.modes ?? destination.mode ?? defaults.modes ?? defaults.mode);
  const idSeed = destination.id || `${label}-${address || index + 1}`;

  return {
    id: text(destination.id) || slug(idSeed) || `destination-${index + 1}`,
    label,
    address,
    lat,
    lng,
    hasCoordinates: lat !== null && lng !== null,
    required: destination.required !== false,
    daysPerWeek,
    weight,
    mode: modes.length === 1 ? modes[0] : modes.join('+'),
    modes,
    maxMinutes,
    departureTime: normalizeTime(destination.departureTime ?? defaults.departureTime),
  };
}

/**
 * Accepts 1–4 destinations. Duplicate ids are made deterministic instead of
 * silently overwriting `routesByDestination` entries.
 */
export function normalizeDestinations(destinations = [], options = {}) {
  const source = Array.isArray(destinations) ? destinations : [destinations];
  const maxDestinations = clamp(
    Math.trunc(finiteNumber(options.maxDestinations) ?? DEFAULT_MAX_DESTINATIONS),
    1,
    DEFAULT_MAX_DESTINATIONS,
  );
  const seen = new Map();
  return source.slice(0, maxDestinations).map((item, index) => {
    const normalized = normalizeDestination(item, index, options.defaults || options);
    const duplicateCount = seen.get(normalized.id) || 0;
    seen.set(normalized.id, duplicateCount + 1);
    if (!duplicateCount) return normalized;
    return { ...normalized, id: `${normalized.id}-${duplicateCount + 1}` };
  });
}

function routeArray(routeGroup) {
  if (Array.isArray(routeGroup)) return routeGroup;
  if (!routeGroup || typeof routeGroup !== 'object') return [];
  if (routeGroup.best && typeof routeGroup.best === 'object') {
    return [routeGroup.best, ...(Array.isArray(routeGroup.routes) ? routeGroup.routes : [])];
  }
  if (Array.isArray(routeGroup.routes)) return routeGroup.routes;
  return [routeGroup];
}

function routeForDestination(routesByDestination, destination, index) {
  if (Array.isArray(routesByDestination)) return routesByDestination[index] ?? null;
  if (!routesByDestination || typeof routesByDestination !== 'object') return null;
  return routesByDestination[destination.id]
    ?? routesByDestination[destination.label]
    ?? null;
}

function routeMode(route) {
  return normalizeModes(route?.mode || route?.type || 'transit')[0];
}

function normalizeRoute(route, destination) {
  const durationMinutes = finiteNumber(route?.durationMinutes ?? route?.minutes ?? route?.duration);
  const verified = route?.verified === true && durationMinutes !== null && durationMinutes >= 0;
  const walkingMinutes = finiteNumber(
    route?.walkingMinutes ?? route?.walkMinutes ?? route?.totalWalkMinutes,
  );
  const transferCount = finiteNumber(route?.transferCount ?? route?.transfers);
  return {
    ...(route || {}),
    mode: routeMode(route),
    verified,
    durationMinutes: verified ? durationMinutes : null,
    walkingMinutes: verified && walkingMinutes !== null ? Math.max(0, walkingMinutes) : 0,
    transferCount: verified && transferCount !== null ? Math.max(0, Math.trunc(transferCount)) : 0,
    withinLimit: verified ? durationMinutes <= destination.maxMinutes : false,
  };
}

function bestRoute(routeGroup, destination) {
  const allowed = new Set(destination.modes);
  const normalized = routeArray(routeGroup).map((route) => normalizeRoute(route, destination));
  const eligible = normalized
    .filter((route) => route.verified && allowed.has(route.mode))
    .sort((a, b) => a.durationMinutes - b.durationMinutes);
  return { best: eligible[0] || null, routes: normalized };
}

function weightedAverage(rows, field, weightField = 'weight') {
  const usable = rows.filter((row) => Number.isFinite(row[field]) && row[weightField] > 0);
  const denominator = usable.reduce((sum, row) => sum + row[weightField], 0);
  if (!denominator) return null;
  return usable.reduce((sum, row) => sum + row[field] * row[weightField], 0) / denominator;
}

/**
 * Evaluates all destinations independently. A candidate is `matched` only
 * when every required destination has a verified route inside its own limit.
 * `balanceScore` is a ranking aid, never a replacement for that hard gate.
 */
export function evaluateCommuteBalance(candidate = {}, destinations = [], options = {}) {
  const normalizedDestinations = normalizeDestinations(destinations, options);
  const routesByDestination = candidate.routesByDestination || candidate.commuteByDestination || {};
  const evaluations = normalizedDestinations.map((destination, index) => {
    const selection = bestRoute(routeForDestination(routesByDestination, destination, index), destination);
    const best = selection.best;
    return {
      destination,
      destinationId: destination.id,
      required: destination.required,
      weight: destination.weight,
      verified: Boolean(best),
      withinLimit: Boolean(best?.withinLimit),
      durationMinutes: best?.durationMinutes ?? null,
      ratio: best ? best.durationMinutes / destination.maxMinutes : null,
      walkingMinutes: best?.walkingMinutes ?? null,
      transferCount: best?.transferCount ?? null,
      best,
      routes: selection.routes,
    };
  });

  const required = evaluations.filter((item) => item.required);
  const requiredVerified = required.filter((item) => item.verified);
  const verified = evaluations.filter((item) => item.verified);
  const blocking = required.filter((item) => !item.verified || !item.withinLimit);
  const matched = required.length > 0 && blocking.length === 0;
  const requiredFullyVerified = required.length > 0 && requiredVerified.length === required.length;
  const worstRatio = verified.length ? Math.max(...verified.map((item) => item.ratio)) : null;
  const weightedMeanMinutes = weightedAverage(verified, 'durationMinutes');
  const weightedMeanRatio = weightedAverage(verified, 'ratio');
  const weightedMeanWalkingMinutes = weightedAverage(verified, 'walkingMinutes');
  const weightedMeanTransfers = weightedAverage(verified, 'transferCount');
  const totalWeight = evaluations.reduce((sum, item) => sum + item.weight, 0);
  const verifiedWeight = verified.reduce((sum, item) => sum + item.weight, 0);
  const verifiedWeightShare = totalWeight > 0 ? verifiedWeight / totalWeight : 0;

  // Transparent, deliberately secondary ranking score:
  // 100 - mean-time ratio(45) - worst-destination ratio(25)
  //     - walking(<=10) - transfers(<=10) - missing coverage(<=25).
  const scoreComponents = {
    weightedTimePenalty: weightedMeanRatio === null ? 45 : Math.min(45, weightedMeanRatio * 45),
    worstDestinationPenalty: worstRatio === null ? 25 : Math.min(25, worstRatio * 25),
    walkingPenalty: weightedMeanWalkingMinutes === null
      ? 0
      : Math.min(10, weightedMeanWalkingMinutes * 0.4),
    transferPenalty: weightedMeanTransfers === null
      ? 0
      : Math.min(10, weightedMeanTransfers * 3),
    coveragePenalty: Math.min(25, (1 - verifiedWeightShare) * 25),
  };
  const rawScore = 100 - Object.values(scoreComponents).reduce((sum, value) => sum + value, 0);

  return {
    candidateId: candidate.id ?? null,
    decision: matched ? 'matched' : (requiredFullyVerified ? 'excluded' : 'pending'),
    matched,
    requiredFullyVerified,
    evaluations,
    blockingDestinationIds: blocking.map((item) => item.destinationId),
    verifiedDestinationCount: verified.length,
    requiredDestinationCount: required.length,
    worstRatio: round(worstRatio, 3),
    weightedMeanMinutes: round(weightedMeanMinutes, 1),
    weightedMeanRatio: round(weightedMeanRatio, 3),
    weightedMeanWalkingMinutes: round(weightedMeanWalkingMinutes, 1),
    weightedMeanTransfers: round(weightedMeanTransfers, 2),
    verifiedWeightShare: round(verifiedWeightShare, 3),
    scoreComponents: Object.fromEntries(
      Object.entries(scoreComponents).map(([key, value]) => [key, round(value, 1)]),
    ),
    balanceScore: round(clamp(rawScore, 0, 100), 1),
    balanceScoreFormula: '100 - weightedTimePenalty - worstDestinationPenalty - walkingPenalty - transferPenalty - coveragePenalty',
  };
}

function modesNeedingTransit(destination) {
  return destination.modes.includes('transit');
}

function cachedPairKey(candidate, destination) {
  return `${candidate?.id ?? candidate}|${destination.id}|transit`;
}

/**
 * Counts expected billable transit-provider calls. `cachedPairKeys` may be a
 * Set/array containing `${candidateId}|${destinationId}|transit` entries.
 */
export function expectedTransitProviderCalls(destinations = [], candidatesOrCount = 1, options = {}) {
  const normalized = normalizeDestinations(destinations, options);
  const transitDestinations = normalized.filter(modesNeedingTransit);
  if (!transitDestinations.length) return 0;
  const candidates = Array.isArray(candidatesOrCount)
    ? candidatesOrCount
    : Array.from({ length: Math.max(0, Math.trunc(finiteNumber(candidatesOrCount) ?? 0)) }, (_, index) => ({ id: index }));
  const cached = new Set(options.cachedPairKeys || []);
  return candidates.reduce((count, candidate) => count + transitDestinations.reduce(
    (subtotal, destination) => subtotal + (cached.has(cachedPairKey(candidate, destination)) ? 0 : 1),
    0,
  ), 0);
}

/**
 * Returns the largest candidate batch that fits the remaining daily transit
 * quota. The caller remains responsible for provider terms and cache policy.
 */
export function quotaAwareCandidateCap(destinations = [], remainingDailyQuota = 0, options = {}) {
  const normalized = normalizeDestinations(destinations, options);
  const transitDestinationsPerCandidate = normalized.filter(modesNeedingTransit).length;
  const remaining = Math.max(0, Math.trunc(finiteNumber(remainingDailyQuota) ?? 0));
  const requestedCandidates = options.requestedCandidates === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.trunc(finiteNumber(options.requestedCandidates) ?? 0));
  if (!transitDestinationsPerCandidate) {
    return {
      candidateCap: Number.isFinite(requestedCandidates) ? requestedCandidates : null,
      callsPerCandidate: 0,
      expectedCalls: 0,
      remainingDailyQuota: remaining,
    };
  }
  const quotaCap = Math.floor(remaining / transitDestinationsPerCandidate);
  const candidateCap = Math.min(quotaCap, requestedCandidates);
  return {
    candidateCap,
    callsPerCandidate: transitDestinationsPerCandidate,
    expectedCalls: candidateCap * transitDestinationsPerCandidate,
    remainingDailyQuota: remaining,
  };
}
