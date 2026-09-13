import { createHash } from 'node:crypto';

export const ROUTE_CACHE_COLLECTION = 'homehunt_route_cache';
export const ROUTE_CACHE_SCHEMA_VERSION = 1;
export const DEFAULT_ROUTE_CACHE_TTL_MS = 8 * 60 * 60 * 1000;
export const MAX_ROUTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000 - 1;

// TMAP permits reuse only before 24 hours have elapsed:
// https://transit.tmapmobility.com/terms
// Kakao and NAVER have no completed-result cache in this adapter.
const allowed = request => request?.provider === 'tmap-transit' && (request.mode ?? 'transit') === 'transit';
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = value => numeric(value) && Number.isSafeInteger(value);
const metricFields = [
  'durationMinutes', 'durationSeconds', 'distanceMeters', 'walkingMinutes', 'walkMinutes',
  'walkSeconds', 'walkDistanceMeters', 'busMinutes', 'subwayMinutes', 'busSeconds', 'subwaySeconds', 'fareWon',
];
const countFields = ['routeIndex', 'transferCount', 'busLegCount', 'subwayLegCount', 'pathType'];

function point(value) {
  const read = (raw, max) => {
    if (!['number', 'string'].includes(typeof raw) || String(raw).trim() === '') throw new TypeError('Invalid route coordinate');
    const number = Number(raw);
    if (!Number.isFinite(number) || Math.abs(number) > max) throw new TypeError('Invalid route coordinate');
    return number;
  };
  return [read(value?.lat ?? value?.latitude ?? value?.y, 90), read(value?.lng ?? value?.longitude ?? value?.x, 180)];
}

function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return typeof value === 'string' ? Date.parse(value) : typeof value === 'number' ? value : NaN;
}

export function createRouteCacheKey(request) {
  if (!allowed(request)) return null;
  const version = request.schemaVersion ?? ROUTE_CACHE_SCHEMA_VERSION;
  if (!Number.isSafeInteger(version) || version < 1) throw new TypeError('Invalid route cache schema version');
  const departure = request.searchDateTime ?? request.departureTime ?? '';
  if (typeof departure !== 'string' || departure && !/^\d{12}$/.test(departure)) throw new TypeError('Invalid route departure time');
  const count = Number(request.count ?? request.options?.count ?? 3);
  const language = Number(request.language ?? request.options?.language ?? 0);
  if (!Number.isInteger(count) || count < 1 || count > 10 || !Number.isInteger(language) || language < 0) throw new TypeError('Invalid route options');
  const option = request.option ?? request.options?.routeOption ?? `summary:count=${count}`;
  if (typeof option !== 'string' || option.length > 200) throw new TypeError('Invalid route option');
  // Only provider request inputs are included. Labels, company weights, prices,
  // thresholds and scoring preferences must not fragment the pair cache.
  return createHash('sha256').update(JSON.stringify([
    version, 'tmap-transit', 'transit', point(request.origin), point(request.destination),
    departure || 'now', option, count, language,
  ])).digest('hex');
}

function cleanRoute(route) {
  if (!route || route.provider !== 'tmap-transit' || route.mode !== 'transit'
      || route.status !== 'verified' || route.verified !== true || route.error || route.errorCode || route.reasonCode
      || !numeric(route.durationMinutes) || !numeric(route.durationSeconds)
      || !numeric(route.walkingMinutes) || !integer(route.transferCount)
      || route.durationMinutes !== Math.ceil(route.durationSeconds / 60)
      || route.walkingMinutes > route.durationMinutes) return null;
  const result = { provider: 'tmap-transit', mode: 'transit', status: 'verified', verified: true };
  for (const field of metricFields) {
    if (route[field] != null && !numeric(route[field])) return null;
    if (route[field] !== undefined) result[field] = route[field];
  }
  for (const field of countFields) {
    if (route[field] != null && !integer(route[field])) return null;
    if (route[field] !== undefined) result[field] = route[field];
  }
  if (route.transitComposition !== undefined) {
    if (!['subway', 'bus', 'mixed', 'unknown'].includes(route.transitComposition)) return null;
    result.transitComposition = route.transitComposition;
  }
  if (typeof route.requestedAt === 'string' && /^\d{14}$/.test(route.requestedAt)) result.requestedAt = route.requestedAt;
  return result;
}

function cleanResult(value) {
  const result = cleanRoute(value);
  const fetchedAt = timestamp(value?.queriedAt);
  if (!result || !Number.isFinite(fetchedAt)) return null;
  if (value.routes !== undefined) {
    if (!Array.isArray(value.routes) || !value.routes.length || value.routes.length > 10) return null;
    const routes = value.routes.map(cleanRoute);
    if (routes.some(route => !route)) return null;
    result.routes = routes;
    result.validRouteCount = routes.length;
    result.routeCount = integer(value.routeCount) && value.routeCount >= routes.length ? value.routeCount : routes.length;
  }
  result.queriedAt = new Date(fetchedAt).toISOString();
  return result;
}

/** Admin Firestore only; client security rules must deny this collection. */
export function createFirestoreRouteCache({ db, now = Date.now, ttlMs = DEFAULT_ROUTE_CACHE_TTL_MS } = {}) {
  if (typeof db?.collection !== 'function' || typeof now !== 'function') throw new TypeError('Firestore and a clock are required');
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new RangeError('Route cache TTL must be a positive integer');
  const effectiveTtl = Math.min(ttlMs, MAX_ROUTE_CACHE_TTL_MS);
  const clock = () => {
    const current = now();
    if (!Number.isFinite(current)) throw new TypeError('Invalid route cache clock');
    return current;
  };
  const ref = key => db.collection(ROUTE_CACHE_COLLECTION).doc(key);
  return Object.freeze({
    async get(request) {
      const key = createRouteCacheKey(request);
      if (!key) return null;
      const snapshot = await ref(key).get();
      if (!snapshot.exists) return null;
      const data = snapshot.data();
      const current = clock();
      const fetchedAt = timestamp(data?.fetchedAt);
      const expiresAt = timestamp(data?.expiresAt);
      // Firestore TTL deletion is asynchronous. Enforce freshness on every read,
      // and reject legacy records which claim a lifetime beyond the policy cap.
      if (data?.schemaVersion !== ROUTE_CACHE_SCHEMA_VERSION || data.provider !== 'tmap-transit'
          || !Number.isFinite(fetchedAt) || !Number.isFinite(expiresAt) || fetchedAt > current
          || expiresAt <= current || expiresAt <= fetchedAt || expiresAt - fetchedAt > MAX_ROUTE_CACHE_TTL_MS
          || current - fetchedAt >= effectiveTtl) return null;
      const route = cleanResult(data.route);
      return route && timestamp(route.queriedAt) === fetchedAt ? route : null;
    },
    async set(request, value) {
      const key = createRouteCacheKey(request);
      if (!key) return false;
      const route = cleanResult(value);
      if (!route) return false;
      const current = clock();
      const fetchedAt = timestamp(route.queriedAt);
      const expiresAt = fetchedAt + effectiveTtl;
      if (fetchedAt > current || expiresAt <= current) return false;
      await ref(key).set({
        schemaVersion: ROUTE_CACHE_SCHEMA_VERSION, provider: 'tmap-transit',
        fetchedAt: new Date(fetchedAt), expiresAt: new Date(expiresAt), route,
      });
      return true;
    },
  });
}
