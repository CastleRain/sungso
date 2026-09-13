const DEFAULT_MAX_MINUTES = 60;
const DEFAULT_DAYS_PER_WEEK = 1;
const SUPPORTED_MODES = new Set(['transit', 'car', 'walk', 'bike']);

function finiteNumber(value) {
  if (value === null || value === undefined || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
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
 * Percentages are explicit input; legacy saved derived weights follow days.
 * `required` controls the time limit; positive weight always requires a route.
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
  const suppliedPercent = finiteNumber(destination.weightPercent);
  const usesPercent = suppliedPercent !== null && !['days-per-week', 'legacy-weight'].includes(destination.weightSource);
  const usesLegacyWeight = !usesPercent && suppliedWeight !== null && (suppliedDays === null || destination.weightSource === 'legacy-weight');
  const weightSource = usesPercent ? 'explicit-percent' : usesLegacyWeight ? 'legacy-weight' : 'days-per-week';
  const weight = Math.max(0, usesPercent ? suppliedPercent : usesLegacyWeight ? suppliedWeight : daysPerWeek);
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
    weightPercent: usesPercent ? Math.max(0, suppliedPercent) : null,
    weightSource,
    mode: modes.length === 1 ? modes[0] : modes.join('+'),
    modes,
    maxMinutes,
    departureTime: normalizeTime(destination.departureTime ?? defaults.departureTime),
    preferSubway: typeof destination.preferSubway === 'boolean' && destination.preferSubwaySource !== 'default' ? destination.preferSubway : defaults.preferSubway === true,
    preferSubwaySource: typeof destination.preferSubway === 'boolean' && destination.preferSubwaySource !== 'default' ? 'explicit' : 'default',
  };
}

/**
 * Preserves every destination unless a caller explicitly requests a bound.
 * Duplicate ids are made deterministic instead of
 * silently overwriting `routesByDestination` entries.
 */
export function normalizeDestinations(destinations = [], options = {}) {
  const source = Array.isArray(destinations) ? destinations : [destinations];
  const maxDestinations = finiteNumber(options.maxDestinations);
  const seen = new Set();
  const normalized = (maxDestinations === null ? source : source.slice(0, Math.max(0, Math.trunc(maxDestinations)))).map((item, index) => {
    const normalized = normalizeDestination(item, index, options.defaults || options);
    const baseId = normalized.id;
    for (let suffix = 2; seen.has(normalized.id); suffix++) normalized.id = `${baseId}-${suffix}`;
    seen.add(normalized.id);
    return normalized;
  });
  const total = normalized.reduce((sum, destination) => sum + destination.weight, 0);
  return normalized.map(destination => ({ ...destination,
    weightPercent: destination.weightSource === 'explicit-percent' ? destination.weightPercent : (total ? destination.weight / total * 100 : 0),
    normalizedWeightPercent: total ? destination.weight / total * 100 : 0,
  }));
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
  return routesByDestination[destination.id] ?? null;
}

function routeMode(route) {
  return normalizeModes(route?.mode || route?.type || 'transit')[0];
}

function normalizeRoute(route, destination) {
  const durationMinutes = finiteNumber(route?.durationMinutes ?? route?.minutes);
  const verified = route?.verified === true && route?.stale !== true && route?.estimated !== true
    && !['estimated', 'approximate', 'straight-line', 'error'].includes(route?.status)
    && durationMinutes !== null && durationMinutes >= 0;
  const walkingMinutes = finiteNumber(
    route?.walkingMinutes ?? route?.walkMinutes ?? route?.totalWalkMinutes,
  );
  const transferCount = finiteNumber(route?.transferCount ?? route?.transfers);
  return {
    ...(route || {}),
    mode: routeMode(route),
    verified,
    durationMinutes: verified ? durationMinutes : null,
    walkingMinutes: verified && walkingMinutes !== null && walkingMinutes >= 0 ? walkingMinutes : null,
    transferCount: verified && Number.isInteger(transferCount) && transferCount >= 0 ? transferCount : null,
    withinLimit: verified ? durationMinutes <= destination.maxMinutes : false,
  };
}

/** Generalized minutes are explicit preferences, never a claimed journey time. */
export function commuteRouteCost(route, options = {}) {
  if (route?.verified !== true || !Number.isFinite(route.durationMinutes)) return { costMinutes: null, components: {}, unknowns: ['실제 경로시간'] };
  const coefficient = (key, fallback) => Math.max(0, finiteNumber(options[key]) ?? fallback);
  const components = { travelMinutes: route.durationMinutes };
  const unknowns = [];
  if (route.mode === 'transit') {
    if (route.walkingMinutes === null || route.walkingMinutes === undefined) unknowns.push('도보시간');
    else components.walkingPenalty = route.walkingMinutes * coefficient('walkingPenaltyPerMinute', .5);
    if (route.transferCount === null || route.transferCount === undefined) unknowns.push('환승횟수');
    else components.transferPenalty = route.transferCount * coefficient('transferPenaltyMinutes', 8);
    if (options.preferSubway === true) {
      const busMinutes = finiteNumber(route.busMinutes);
      const busLegCount = finiteNumber(route.busLegCount);
      const pathType = finiteNumber(route.pathType);
      const composition = String(route.transitComposition || '');
      if (busMinutes !== null && busMinutes >= 0) components.busPenalty = busMinutes * coefficient('busPenaltyPerMinute', .25);
      else if (busLegCount !== null && busLegCount >= 0) components.busPenalty = busLegCount * coefficient('busLegPenaltyMinutes', 6);
      else if (pathType === 1 || composition === 'subway') components.busPenalty = 0;
      else if (pathType === 2 || pathType === 3 || ['bus', 'mixed'].includes(composition)) components.busPenalty = coefficient('busPresencePenaltyMinutes', 8);
      else unknowns.push('버스 이용 여부');
    }
  }
  return { costMinutes: unknowns.length ? null : Object.values(components).reduce((sum, value) => sum + value, 0), components, unknowns };
}

function bestRoute(routeGroup, destination, options) {
  const allowed = new Set(destination.modes);
  const normalized = routeArray(routeGroup).flatMap(route => routeArray(route))
    .map((route) => {
      const normalized = normalizeRoute(route, destination);
      return { ...normalized, generalizedCost: commuteRouteCost(normalized, { ...options, preferSubway: destination.preferSubway }) };
    });
  const eligible = normalized
    .filter((route) => route.verified && allowed.has(route.mode));
  const withinLimit = eligible.filter(route => route.withinLimit);
  // A soft time limit must not hide a lower-burden route merely for taking
  // longer. Strict limits still prefer a verified route inside the limit.
  const pool = destination.required && withinLimit.length ? withinLimit : eligible;
  pool.sort((a, b) => (a.generalizedCost.costMinutes ?? Infinity) - (b.generalizedCost.costMinutes ?? Infinity)
    || a.durationMinutes - b.durationMinutes);
  const unresolvedModes = destination.modes.filter(mode => !normalized.some(route => route.mode === mode
    && (route.verified || /(?:^|_)NO_ROUTE$/.test(String(route.reasonCode || '')))));
  const satisfiesDestination = destination.required ? withinLimit.length > 0 : eligible.length > 0;
  return { best: pool[0] || null, routes: normalized, unresolvedModes,
    decision: satisfiesDestination ? 'matched' : unresolvedModes.length ? 'pending' : 'excluded' };
}

function weightedAverage(rows, field, weightField = 'weight') {
  const usable = rows.filter((row) => Number.isFinite(row[field]) && row[weightField] > 0);
  const denominator = usable.reduce((sum, row) => sum + row[weightField], 0);
  if (!denominator) return null;
  return usable.reduce((sum, row) => sum + row[field] * row[weightField], 0) / denominator;
}

/**
 * Evaluates all destinations independently. A candidate is `matched` only
 * when every positive-weight destination has a verified route and every
 * required destination has a verified route inside its own strict time limit.
 * A zero-weight destination with a soft limit does not affect that gate.
 * `balanceScore` is a ranking aid, never a replacement for that hard gate.
 */
export function evaluateCommuteBalance(candidate = {}, destinations = [], options = {}) {
  const normalizedDestinations = normalizeDestinations(destinations, options);
  const routesByDestination = candidate.routesByDestination || candidate.commuteByDestination || {};
  const evaluations = normalizedDestinations.map((destination, index) => {
    const selection = bestRoute(routeForDestination(routesByDestination, destination, index), destination, options);
    const best = selection.best;
    return {
      destination,
      destinationId: destination.id,
      required: destination.required,
      timeLimitRequired: destination.required,
      routeRequired: destination.required || destination.weight > 0,
      weight: destination.weight,
      weightPercent: destination.normalizedWeightPercent,
      decision: selection.decision,
      unresolvedModes: selection.unresolvedModes,
      verified: Boolean(best),
      withinLimit: Boolean(best?.withinLimit),
      durationMinutes: best?.durationMinutes ?? null,
      ratio: best ? best.durationMinutes / destination.maxMinutes : null,
      walkingMinutes: best?.walkingMinutes ?? null,
      transferCount: best?.transferCount ?? null,
      costMinutes: best?.generalizedCost.costMinutes ?? null,
      unknowns: best?.generalizedCost.unknowns || ['실제 경로시간'],
      best,
      routes: selection.routes,
    };
  });

  const required = evaluations.filter((item) => item.required);
  const routeRequired = evaluations.filter((item) => item.routeRequired);
  const verified = routeRequired.filter((item) => item.verified);
  const blocking = routeRequired.filter((item) => item.decision !== 'matched');
  const matched = routeRequired.length > 0 && blocking.length === 0 && evaluations.some(item => item.weight > 0);
  // Keep the persisted-verification contract: this means every participating
  // destination is conclusive, including a provider-confirmed absent route.
  const requiredFullyVerified = routeRequired.length > 0 && routeRequired.every(item => item.decision !== 'pending');
  const measuredExcluded = routeRequired.some(item => item.decision === 'excluded');
  const worstRatio = verified.length ? Math.max(...verified.map((item) => item.ratio)) : null;
  const weightedMeanMinutes = weightedAverage(verified, 'durationMinutes');
  const weightedMeanRatio = weightedAverage(verified, 'ratio');
  const weightedMeanWalkingMinutes = weightedAverage(verified, 'walkingMinutes');
  const weightedMeanTransfers = weightedAverage(verified, 'transferCount');
  const weightedMeanCostMinutes = weightedAverage(verified, 'costMinutes');
  const totalWeight = evaluations.reduce((sum, item) => sum + item.weight, 0);
  const verifiedWeight = verified.reduce((sum, item) => sum + item.weight, 0);
  const verifiedWeightShare = totalWeight > 0 ? verifiedWeight / totalWeight : 0;
  const timeCoverageComplete = totalWeight > 0 && evaluations.filter(item => item.weight > 0).every(item => item.verified);
  const walkingCoverageComplete = timeCoverageComplete && evaluations.filter(item => item.weight > 0).every(item => item.walkingMinutes !== null);
  const transfersCoverageComplete = timeCoverageComplete && evaluations.filter(item => item.weight > 0).every(item => item.transferCount !== null);

  const costCoverageComplete = totalWeight > 0 && evaluations.filter(item => item.weight > 0).every(item => item.costMinutes !== null);
  // The weighted cost is primary; worst-destination time is only a tie-breaker.
  const scoreComponents = {
    weightedTimePenalty: weightedMeanMinutes === null ? null : weightedMeanMinutes,
    worstDestinationPenalty: 0,
    walkingPenalty: weightedMeanWalkingMinutes === null
      ? null
      : weightedMeanWalkingMinutes * .5,
    transferPenalty: weightedMeanTransfers === null
      ? null
      : weightedMeanTransfers * 8,
    coveragePenalty: Math.min(25, (1 - verifiedWeightShare) * 25),
  };
  const rawScore = costCoverageComplete ? 100 - weightedMeanCostMinutes / 120 * 100 : null;

  return {
    candidateId: candidate.id ?? null,
    decision: matched ? 'matched' : (measuredExcluded ? 'excluded' : 'pending'),
    matched,
    requiredFullyVerified,
    measuredExcluded,
    evaluations,
    blockingDestinationIds: blocking.map((item) => item.destinationId),
    verifiedDestinationCount: verified.length,
    requiredDestinationCount: required.length,
    routeRequiredDestinationCount: routeRequired.length,
    worstRatio: round(worstRatio, 3),
    weightedMeanMinutes: timeCoverageComplete ? round(weightedMeanMinutes, 1) : null,
    weightedMeanRatio: timeCoverageComplete ? round(weightedMeanRatio, 3) : null,
    weightedMeanWalkingMinutes: walkingCoverageComplete ? round(weightedMeanWalkingMinutes, 1) : null,
    weightedMeanTransfers: transfersCoverageComplete ? round(weightedMeanTransfers, 2) : null,
    timeCoverageComplete,
    weightedMeanCostMinutes: costCoverageComplete ? round(weightedMeanCostMinutes, 2) : null,
    weightTotal: totalWeight,
    invalidWeights: totalWeight <= 0,
    costCoverageComplete,
    verifiedWeightShare: round(verifiedWeightShare, 3),
    scoreComponents: Object.fromEntries(
      Object.entries(scoreComponents).map(([key, value]) => [key, round(value, 1)]),
    ),
    balanceScore: rawScore === null ? null : round(clamp(rawScore, 0, 100), 1),
    balanceScoreFormula: '가중 실제시간 + walkingPenalty(도보×0.5) + transferPenalty(환승×8) + 버스선호부담의 평균; 120분에서 0점',
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
