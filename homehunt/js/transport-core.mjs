const EARTH_RADIUS_KM = 6371.0088;

function radians(value) {
  return Number(value) * Math.PI / 180;
}

function coordinateNumber(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeGeoPoint(point) {
  const lat = coordinateNumber(point?.lat);
  const lng = coordinateNumber(point?.lng);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function isGeoPoint(point) {
  return normalizeGeoPoint(point) !== null;
}

export function haversineKm(origin, destination) {
  const start = normalizeGeoPoint(origin);
  const end = normalizeGeoPoint(destination);
  if (!start || !end) return null;
  const { lat: lat1, lng: lng1 } = start;
  const { lat: lat2, lng: lng2 } = end;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizeCommuteResult(result, maxMinutes) {
  const durationMinutes = Number(result?.durationMinutes);
  const verified = Boolean(result?.verified) && Number.isFinite(durationMinutes);
  return {
    ...(result || {}),
    verified,
    durationMinutes: verified ? durationMinutes : null,
    withinLimit: verified ? durationMinutes < Number(maxMinutes) : false,
  };
}

export function bestCommuteResult(results = [], maxMinutes = 60) {
  const normalized = results.map((result) => normalizeCommuteResult(result, maxMinutes));
  const verified = normalized.filter((result) => result.verified).sort((a, b) => a.durationMinutes - b.durationMinutes);
  return { best: verified[0] || null, routes: normalized, verified: verified.length > 0 };
}

export function commuteDecision(candidate) {
  const best = candidate?.commute?.best;
  if (best?.verified && best.withinLimit) return 'matched';
  if (best?.verified && candidate?.commute?.allRequestedModesChecked !== false) return 'excluded';
  return 'pending';
}

export function filterCommuteCandidates(candidates = [], scope = 'all') {
  if (scope === 'matched') return candidates.filter((candidate) => commuteDecision(candidate) === 'matched');
  if (scope === 'pending') return candidates.filter((candidate) => commuteDecision(candidate) === 'pending');
  return [...candidates];
}

export function commuteRank(candidate) {
  const best = candidate?.commute?.best;
  const decision = commuteDecision(candidate);
  if (decision === 'matched') return [0, Number(best.durationMinutes)];
  const distance = coordinateNumber(candidate?.distanceKm);
  if (decision === 'pending' && distance !== null && distance >= 0) return [1, distance];
  if (decision === 'excluded') return [2, Number(best.durationMinutes)];
  return [3, Number.POSITIVE_INFINITY];
}
