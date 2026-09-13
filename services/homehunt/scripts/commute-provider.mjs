import { promises as fs } from 'node:fs';
import path from 'node:path';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const MAX_MEMORY_CACHE_TTL_MS = (24 * HOUR_MS) - 1;
export const TMAP_TRANSIT_SUMMARY_ENDPOINT = 'https://apis.openapi.sk.com/transit/routes/sub';
// The summary API accepts count 1..10 in one HTTP request:
// https://transit.tmapmobility.com/docs/routes/sub
export const TMAP_TRANSIT_DEFAULT_COUNT = 3;
export const TMAP_TRANSIT_CACHE_OPTION = `summary:count=${TMAP_TRANSIT_DEFAULT_COUNT}`;
export const KAKAO_PUBLIC_TRANSIT_ENDPOINT = 'https://dapi.kakao.com/v2/routing/publictraffic';
export const NAVER_DIRECTIONS5_ENDPOINT = 'https://maps.apigw.ntruss.com/map-direction/v1/driving';
export const TRANSIT_PROVIDER_VALUES = Object.freeze(['auto', 'kakao', 'tmap']);
export const KST_TIME_ZONE = 'Asia/Seoul';

const NAVER_ROUTE_OPTIONS = new Set([
  'trafast',
  'tracomfort',
  'traoptimal',
  'traavoidtoll',
  'traavoidcaronly',
]);

export class CommuteProviderError extends Error {
  constructor(message, { provider, code = 'PROVIDER_ERROR', httpStatus = null, providerErrorCode = null, providerErrorCategory = null, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'CommuteProviderError';
    this.provider = provider || 'unknown';
    this.code = code;
    this.httpStatus = httpStatus;
    const safeDetails = sanitizeProviderErrorDetails(provider, { code: providerErrorCode, category: providerErrorCategory });
    this.providerErrorCode = safeDetails.providerErrorCode;
    this.providerErrorCategory = safeDetails.providerErrorCategory;
  }
}

function finiteNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be a finite number`);
  return parsed;
}

function normalizePoint(point, label) {
  if (!point || typeof point !== 'object') throw new TypeError(`${label} must be an object`);
  const lat = finiteNumber(point.lat ?? point.latitude ?? point.y, `${label}.lat`);
  const lng = finiteNumber(point.lng ?? point.longitude ?? point.x, `${label}.lng`);
  if (lat < -90 || lat > 90) throw new RangeError(`${label}.lat is out of range`);
  if (lng < -180 || lng > 180) throw new RangeError(`${label}.lng is out of range`);
  return { lat, lng };
}

function requiredKey(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CommuteProviderError(`${label} is required`, {
      provider: 'configuration',
      code: 'MISSING_CREDENTIAL',
    });
  }
  return value.trim();
}

function asNonNegativeNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function countOrNull(value) {
  const number = asNonNegativeNumber(value);
  return Number.isSafeInteger(number) ? number : null;
}

function minutesOrNull(seconds) {
  return seconds === null ? null : Math.ceil(seconds / 60);
}

function transitLegMetrics(legs, { mode, time, distance, requireWalkingStep = false }) {
  const rows = Array.isArray(legs) ? legs : [];
  const typed = rows.map(leg => ({ mode: String(mode(leg) || '').toUpperCase().replace(/^WALKING$/, 'WALK'),
    seconds: asNonNegativeNumber(time(leg)), distance: asNonNegativeNumber(distance(leg)) }));
  const completeTypes = typed.length > 0 && typed.every(leg => ['WALK', 'BUS', 'SUBWAY'].includes(leg.mode));
  const sum = (type, field) => {
    if (!completeTypes) return null;
    const matching = typed.filter(leg => leg.mode === type);
    // An omitted walking stage is not an explicit zero. Kakao does not
    // guarantee that its returned steps include every access/egress walk.
    if (requireWalkingStep && type === 'WALK' && !matching.length) return null;
    return matching.every(leg => leg[field] !== null) ? matching.reduce((total, leg) => total + leg[field], 0) : null;
  };
  const busLegCount = completeTypes ? typed.filter(leg => leg.mode === 'BUS').length : null;
  const subwayLegCount = completeTypes ? typed.filter(leg => leg.mode === 'SUBWAY').length : null;
  const busSeconds = sum('BUS', 'seconds');
  const subwaySeconds = sum('SUBWAY', 'seconds');
  return {
    walkSeconds: sum('WALK', 'seconds'), walkDistanceMeters: sum('WALK', 'distance'),
    busMinutes: minutesOrNull(busSeconds), subwayMinutes: minutesOrNull(subwaySeconds),
    busSeconds, subwaySeconds, busLegCount, subwayLegCount,
    transitComposition: !completeTypes ? 'unknown' : busLegCount && subwayLegCount ? 'mixed' : busLegCount ? 'bus' : subwayLegCount ? 'subway' : 'unknown',
  };
}

function unknownTransitMetrics() {
  return { walkingMinutes: null, walkMinutes: null, transferCount: null,
    busMinutes: null, subwayMinutes: null, busSeconds: null, subwaySeconds: null,
    busLegCount: null, subwayLegCount: null, transitComposition: 'unknown' };
}

function compactCoordinate(value) {
  return Number(value).toFixed(7).replace(/\.?0+$/, '');
}

function currentTime(now) {
  return typeof now === 'function' ? Number(now()) : Number(now ?? Date.now());
}

function queriedAt(now) {
  const timestamp = currentTime(now);
  return new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString();
}

// Retain only exact machine codes, never arbitrary messages, URLs or response
// bodies. A 403 by itself does not prove that a paid subscription is missing.
const TMAP_ERROR_CODES = Object.freeze({
  INVALID_API_KEY: 'TMAP_INVALID_API_KEY',
  API_KEY_EXPIRED: 'TMAP_INVALID_API_KEY',
  UNAUTHORIZED: 'TMAP_ACCESS_DENIED',
  FORBIDDEN: 'TMAP_ACCESS_DENIED',
  ACCESS_DENIED: 'TMAP_ACCESS_DENIED',
  PERMISSION_DENIED: 'TMAP_ACCESS_DENIED',
  API_NOT_SUBSCRIBED: 'TMAP_SUBSCRIPTION_REQUIRED',
  SUBSCRIPTION_REQUIRED: 'TMAP_SUBSCRIPTION_REQUIRED',
  QUOTA_EXCEEDED: 'TMAP_PROVIDER_LIMIT',
  RATE_LIMIT_EXCEEDED: 'TMAP_PROVIDER_LIMIT',
});

export function sanitizeProviderErrorDetails(provider, details = {}) {
  if (provider !== 'tmap-transit') return { providerErrorCode: null, providerErrorCategory: null };
  return {
    providerErrorCode: typeof details?.code === 'string' && Object.hasOwn(TMAP_ERROR_CODES, details.code) ? details.code : null,
    providerErrorCategory: details?.category === 'gw' ? 'gw' : null,
  };
}

function safeHttpErrorCode(provider, httpStatus, payload) {
  if (provider === 'tmap-transit') {
    const { providerErrorCode } = sanitizeProviderErrorDetails(provider, payload?.error);
    if ([401, 403, 429].includes(httpStatus) && providerErrorCode) return TMAP_ERROR_CODES[providerErrorCode];
    return 'HTTP_ERROR';
  }
  if (provider !== 'kakao-transit' || httpStatus !== 403 || !payload || typeof payload !== 'object') {
    return 'HTTP_ERROR';
  }
  const errorType = String(payload.errorType || '').trim();
  const message = String(payload.message || '');
  return errorType === 'NotAuthorizedError' && message.includes('OPEN_MAP_AND_LOCAL')
    ? 'KAKAO_MAP_SERVICE_DISABLED'
    : 'HTTP_ERROR';
}

function boundedTtl(ttlMs) {
  const parsed = Number(ttlMs);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, MAX_MEMORY_CACHE_TTL_MS);
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new RangeError(`${label} must be a non-negative integer`);
  return parsed;
}

export function kstDateKey(now = Date.now) {
  const timestamp = currentTime(now);
  const date = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function nextKstMidnightIso(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const nextMidnightUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1) - (9 * HOUR_MS);
  return new Date(nextMidnightUtc).toISOString();
}

export class DailyUsageLedger {
  constructor({
    filePath,
    limit = 10,
    provider = 'transit',
    providerLabel = 'Transit provider',
    now = Date.now,
    fsImpl = fs,
  } = {}) {
    if (typeof filePath !== 'string' || !filePath.trim()) throw new TypeError('filePath is required');
    if (typeof now !== 'function') throw new TypeError('now must be a function');
    this.filePath = path.resolve(filePath);
    this.limit = positiveInteger(limit, 'limit');
    this.provider = String(provider || 'transit');
    this.providerLabel = String(providerLabel || 'Transit provider');
    this.now = now;
    this.fs = fsImpl;
    this.queue = Promise.resolve();
  }

  async readEnvelope() {
    try {
      const raw = await this.fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.schemaVersion !== 1 || typeof parsed.days !== 'object' || Array.isArray(parsed.days)) {
        throw new Error('invalid ledger schema');
      }
      return parsed;
    } catch (error) {
      if (error?.code === 'ENOENT') return { schemaVersion: 1, timeZone: KST_TIME_ZONE, days: {} };
      throw new CommuteProviderError(`${this.providerLabel} quota ledger could not be read`, {
        provider: this.provider,
        code: 'QUOTA_LEDGER_ERROR',
        cause: error,
      });
    }
  }

  snapshotFrom(envelope) {
    const date = kstDateKey(this.now);
    const entry = envelope.days?.[date];
    const used = Number.isInteger(entry?.used) && entry.used >= 0 ? entry.used : 0;
    return {
      provider: this.provider,
      date,
      timeZone: KST_TIME_ZONE,
      limit: this.limit,
      used,
      remaining: Math.max(0, this.limit - used),
      resetAt: nextKstMidnightIso(date),
      updatedAt: typeof entry?.updatedAt === 'string' ? entry.updatedAt : null,
    };
  }

  withLock(action) {
    const pending = this.queue.then(action, action);
    this.queue = pending.catch(() => {});
    return pending;
  }

  snapshot() {
    return this.withLock(async () => this.snapshotFrom(await this.readEnvelope()));
  }

  reserve(count = 1) {
    return this.withLock(async () => {
      const amount = positiveInteger(count, 'count');
      const envelope = await this.readEnvelope();
      const current = this.snapshotFrom(envelope);
      if (amount > current.remaining) {
        throw new CommuteProviderError(`${this.providerLabel} daily upstream call limit reached`, {
          provider: this.provider,
          code: 'DAILY_LIMIT',
        });
      }
      if (!amount) return current;

      const updatedAt = queriedAt(this.now);
      const keptDays = Object.fromEntries(
        Object.entries(envelope.days || {})
          .filter(([day]) => /^\d{4}-\d{2}-\d{2}$/.test(day))
          .sort(([left], [right]) => right.localeCompare(left))
          .slice(0, 30),
      );
      keptDays[current.date] = { used: current.used + amount, updatedAt };
      const nextEnvelope = { schemaVersion: 1, timeZone: KST_TIME_ZONE, days: keptDays };
      try {
        await this.fs.mkdir(path.dirname(this.filePath), { recursive: true });
        const temporary = `${this.filePath}.${process.pid}.tmp`;
        await this.fs.writeFile(temporary, JSON.stringify(nextEnvelope), { encoding: 'utf8', mode: 0o600 });
        await this.fs.rename(temporary, this.filePath);
      } catch (error) {
        throw new CommuteProviderError(`${this.providerLabel} quota ledger could not be written`, {
          provider: this.provider,
          code: 'QUOTA_LEDGER_ERROR',
          cause: error,
        });
      }
      return this.snapshotFrom(nextEnvelope);
    });
  }
}

export class TmapDailyLedger extends DailyUsageLedger {
  constructor(options = {}) {
    super({ ...options, limit: options.limit ?? 10, provider: 'tmap-transit', providerLabel: 'TMAP' });
  }
}

export class KakaoDailyLedger extends DailyUsageLedger {
  constructor(options = {}) {
    super({ ...options, limit: options.limit ?? 1_000, provider: 'kakao-transit', providerLabel: 'Kakao' });
  }
}

export class MemoryTtlCache {
  constructor({ ttlMs = MAX_MEMORY_CACHE_TTL_MS, now = Date.now } = {}) {
    if (typeof now !== 'function') throw new TypeError('now must be a function');
    this.ttlMs = boundedTtl(ttlMs);
    this.now = now;
    this.entries = new Map();
    this.inflight = new Map();
    this.inflightGeneration = 0;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, { ttlMs = this.ttlMs } = {}) {
    const effectiveTtl = boundedTtl(ttlMs);
    if (!effectiveTtl) {
      this.entries.delete(key);
      return value;
    }
    this.entries.set(key, { value, expiresAt: this.now() + effectiveTtl });
    return value;
  }

  delete(key) {
    this.inflight.delete(key);
    return this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
    this.clearInflight();
  }

  clearInflight() {
    this.inflightGeneration += 1;
    this.inflight.clear();
  }

  get size() {
    for (const key of this.entries.keys()) this.get(key);
    return this.entries.size;
  }

  hasOrPending(key) {
    return this.get(key) !== undefined || this.inflight.has(key);
  }

  hasPending(key) { return this.inflight.has(key); }

  // Live-only providers may join an ongoing request but may never read or
  // write a completed response cache. Settling removes the shared promise.
  getOrJoin(key, loader) {
    if (typeof loader !== 'function') throw new TypeError('loader must be a function');
    if (this.inflight.has(key)) return this.inflight.get(key);
    const pending = Promise.resolve().then(loader).finally(() => {
      if (this.inflight.get(key) === pending) this.inflight.delete(key);
    });
    this.inflight.set(key, pending);
    return pending;
  }

  async getOrLoad(key, loader, { ttlMs = this.ttlMs } = {}) {
    if (typeof loader !== 'function') throw new TypeError('loader must be a function');
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    if (this.inflight.has(key)) return this.inflight.get(key);

    const generation = this.inflightGeneration;
    const pending = Promise.resolve()
      .then(loader)
      .then((value) => generation === this.inflightGeneration ? this.set(key, value, { ttlMs }) : value)
      .finally(() => { if (this.inflight.get(key) === pending) this.inflight.delete(key); });
    this.inflight.set(key, pending);
    return pending;
  }
}

export function createCommuteCacheKey({ provider, origin, destination, searchDateTime = '', option = '' }) {
  const start = normalizePoint(origin, 'origin');
  const goal = normalizePoint(destination, 'destination');
  return [
    String(provider || 'unknown'),
    compactCoordinate(start.lng),
    compactCoordinate(start.lat),
    compactCoordinate(goal.lng),
    compactCoordinate(goal.lat),
    // Kakao publictraffic has no departure-time input. A UI date/time or label
    // change cannot change this provider request or consume another call.
    String(provider === 'kakao-transit' ? 'now' : searchDateTime || 'now'),
    String(option || ''),
  ].join('|');
}

export function buildTmapTransitSummaryRequest({
  origin,
  destination,
  appKey,
  searchDateTime,
  count = TMAP_TRANSIT_DEFAULT_COUNT,
  language = 0,
  endpoint = TMAP_TRANSIT_SUMMARY_ENDPOINT,
}) {
  const start = normalizePoint(origin, 'origin');
  const goal = normalizePoint(destination, 'destination');
  const credential = requiredKey(appKey, 'TMAP appKey');
  const resultCount = Number(count);
  if (!Number.isInteger(resultCount) || resultCount < 1 || resultCount > 10) {
    throw new RangeError('count must be an integer from 1 to 10');
  }
  if (searchDateTime !== undefined && !/^\d{12}$/.test(String(searchDateTime))) {
    throw new TypeError('searchDateTime must use yyyyMMddHHmm');
  }

  const body = {
    startX: compactCoordinate(start.lng),
    startY: compactCoordinate(start.lat),
    endX: compactCoordinate(goal.lng),
    endY: compactCoordinate(goal.lat),
    count: resultCount,
    lang: Number(language),
    format: 'json',
  };
  if (searchDateTime !== undefined) body.searchDttm = String(searchDateTime);

  return {
    url: String(endpoint),
    init: {
      method: 'POST',
      headers: {
        accept: 'application/json',
        appKey: credential,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  };
}

function unavailableResult(provider, mode, reasonCode) {
  return {
    provider,
    mode,
    verified: false,
    status: 'unavailable',
    reasonCode,
    durationMinutes: null,
    distanceMeters: null,
    ...unknownTransitMetrics(),
    routes: [],
  };
}

export function normalizeTmapTransitSummary(payload) {
  const metadata = payload?.metaData ?? payload?.metadata;
  const plan = metadata?.plan ?? metadata?.Plan;
  const itineraries = Array.isArray(plan?.itineraries) ? plan.itineraries : [];
  if (!itineraries.length) {
    const providerCode = plan?.error?.id ?? plan?.error?.code ?? payload?.error?.id ?? payload?.error?.code;
    return unavailableResult('tmap-transit', 'transit', providerCode ? `TMAP_${providerCode}` : 'NO_ROUTE');
  }

  const routes = itineraries.flatMap((route, routeIndex) => {
    const durationSeconds = asNonNegativeNumber(route?.totalTime);
    if (durationSeconds === null) return [];
    const legs = transitLegMetrics(route.legs, { mode: leg => leg?.mode, time: leg => leg?.sectionTime, distance: leg => leg?.distance });
    const walkSeconds = asNonNegativeNumber(route.totalWalkTime) ?? legs.walkSeconds;
    const pathType = countOrNull(route.pathType);
    return [{
      provider: 'tmap-transit', mode: 'transit', verified: true, status: 'verified', routeIndex,
      durationMinutes: Math.ceil(durationSeconds / 60), durationSeconds,
      distanceMeters: asNonNegativeNumber(route.totalDistance), ...legs,
      walkingMinutes: minutesOrNull(walkSeconds), walkMinutes: minutesOrNull(walkSeconds), walkSeconds,
      walkDistanceMeters: asNonNegativeNumber(route.totalWalkDistance) ?? legs.walkDistanceMeters,
      transferCount: countOrNull(route.transferCount), fareWon: asNonNegativeNumber(route?.fare?.regular?.totalFare),
      pathType, transitComposition: legs.transitComposition !== 'unknown' ? legs.transitComposition : ({ 1: 'subway', 2: 'bus', 3: 'mixed' }[pathType] || 'unknown'),
      requestedAt: metadata?.requestParameters?.reqDttm ?? null,
    }];
  });
  if (!routes.length) {
    throw new CommuteProviderError('TMAP response did not include a valid totalTime', {
      provider: 'tmap-transit',
      code: 'INVALID_RESPONSE',
    });
  }
  return { ...routes[0], routeCount: itineraries.length, validRouteCount: routes.length, routes };
}

export function buildKakaoPublicTransitRequest({
  origin,
  destination,
  restApiKey,
  endpoint = KAKAO_PUBLIC_TRANSIT_ENDPOINT,
}) {
  const start = normalizePoint(origin, 'origin');
  const goal = normalizePoint(destination, 'destination');
  const credential = requiredKey(restApiKey, 'Kakao REST API key');
  const url = new URL(endpoint);
  url.searchParams.set('start_x', compactCoordinate(start.lng));
  url.searchParams.set('start_y', compactCoordinate(start.lat));
  url.searchParams.set('end_x', compactCoordinate(goal.lng));
  url.searchParams.set('end_y', compactCoordinate(goal.lat));
  url.searchParams.set('input_coord', 'WGS84');
  url.searchParams.set('output_coord', 'WGS84');

  return {
    url: url.toString(),
    init: {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `KakaoAK ${credential}`,
      },
    },
  };
}

export function normalizeKakaoPublicTransit(payload) {
  const status = String(payload?.status || '').trim().toUpperCase();
  if (status !== 'OK') {
    return unavailableResult('kakao-transit', 'transit', status ? `KAKAO_${status}` : 'INVALID_RESPONSE');
  }

  const routes = Array.isArray(payload?.routes) ? payload.routes : [];
  const validRoutes = routes
    .map((route, index) => ({ route, index, durationSeconds: asNonNegativeNumber(route?.properties?.totalTime) }))
    .filter((entry) => entry.durationSeconds !== null)
    .sort((left, right) => left.durationSeconds - right.durationSeconds || left.index - right.index);
  if (!validRoutes.length) return unavailableResult('kakao-transit', 'transit', 'NO_ROUTE');

  const normalized = validRoutes.map(({ route, index, durationSeconds }) => {
    const properties = route.properties || {};
    const legs = transitLegMetrics(route.steps, { mode: step => step?.properties?.type, time: step => step?.properties?.time, distance: step => step?.properties?.distance, requireWalkingStep: true });
    const walkSeconds = legs.walkSeconds;
    const fare = properties.fare || {};
    return {
      provider: 'kakao-transit',
      mode: 'transit',
      verified: true,
      status: 'verified',
      routeIndex: index,
      durationMinutes: Math.ceil(durationSeconds / 60),
      durationSeconds,
      distanceMeters: asNonNegativeNumber(properties.totalDistance),
      ...legs,
      walkingMinutes: minutesOrNull(walkSeconds), walkMinutes: minutesOrNull(walkSeconds),
      walkSeconds,
      walkingTimeSource: walkSeconds === null ? 'unavailable' : 'reported-walking-steps',
      transferCount: countOrNull(properties.transfers),
      fareWon: asNonNegativeNumber(fare.value),
      fareMinWon: asNonNegativeNumber(fare.min),
      fareMaxWon: asNonNegativeNumber(fare.max),
      routeType: typeof properties.type === 'string' ? properties.type : null,
      transitComposition: legs.transitComposition !== 'unknown' ? legs.transitComposition
        : ({ BUS: 'bus', SUBWAY: 'subway', BUS_AND_SUBWAY: 'mixed' }[String(properties.type || '').toUpperCase()] || 'unknown'),
      landingUrl: typeof payload?.properties?.landingURL === 'string' ? payload.properties.landingURL : null,
      timeBasis: 'provider-default-no-departure-parameter',
    };
  });
  return { ...normalized[0], routeCount: routes.length, validRouteCount: normalized.length, routes: normalized };
}

export function buildNaverDirections5Request({
  origin,
  destination,
  clientId,
  clientSecret,
  option = 'traoptimal',
  endpoint = NAVER_DIRECTIONS5_ENDPOINT,
}) {
  const start = normalizePoint(origin, 'origin');
  const goal = normalizePoint(destination, 'destination');
  const id = requiredKey(clientId, 'NAVER Client ID');
  const secret = requiredKey(clientSecret, 'NAVER Client Secret');
  if (!NAVER_ROUTE_OPTIONS.has(option)) throw new RangeError(`Unsupported NAVER route option: ${option}`);

  const url = new URL(endpoint);
  url.searchParams.set('start', `${compactCoordinate(start.lng)},${compactCoordinate(start.lat)}`);
  url.searchParams.set('goal', `${compactCoordinate(goal.lng)},${compactCoordinate(goal.lat)}`);
  url.searchParams.set('option', option);

  return {
    url: url.toString(),
    init: {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-ncp-apigw-api-key-id': id,
        'x-ncp-apigw-api-key': secret,
      },
    },
  };
}

export function normalizeNaverDirections5(payload, { option = 'traoptimal' } = {}) {
  const responseCode = Number(payload?.code);
  if (responseCode !== 0) {
    return unavailableResult(
      'naver-directions5',
      'car',
      Number.isFinite(responseCode) ? `NAVER_${responseCode}` : 'INVALID_RESPONSE',
    );
  }

  const options = [option, ...Object.keys(payload?.route || {}).filter(key => key !== option && NAVER_ROUTE_OPTIONS.has(key)).sort()];
  const routes = options.flatMap(routeOption => (Array.isArray(payload?.route?.[routeOption]) ? payload.route[routeOption] : []).flatMap((route, routeIndex) => {
    const summary = route?.summary;
    const durationMilliseconds = asNonNegativeNumber(summary?.duration);
    return durationMilliseconds === null ? [] : [{
      provider: 'naver-directions5', mode: 'car', verified: true, status: 'verified', routeOption, routeIndex,
      durationMinutes: Math.ceil(durationMilliseconds / MINUTE_MS), durationMilliseconds,
      distanceMeters: asNonNegativeNumber(summary.distance), ...unknownTransitMetrics(),
      departureAt: summary.departureTime ?? payload.currentDateTime ?? null,
      tollFareWon: asNonNegativeNumber(summary.tollFare), taxiFareWon: asNonNegativeNumber(summary.taxiFare), fuelPriceWon: asNonNegativeNumber(summary.fuelPrice),
    }];
  }));
  if (!routes.length) {
    throw new CommuteProviderError('NAVER response did not include a valid route duration', {
      provider: 'naver-directions5',
      code: 'INVALID_RESPONSE',
    });
  }

  return { ...routes[0], routeCount: routes.length, validRouteCount: routes.length, routes };
}

async function requestJson(request, { fetchImpl, provider, timeoutMs = 15000 }) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const externalSignal = request.init?.signal;
  const externalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', externalAbort, { once: true });
  if (externalSignal?.aborted) controller.abort();
  let rejectAbort;
  const aborted = new Promise((_, reject) => {
    rejectAbort = () => reject(new CommuteProviderError(`${provider} request aborted`, { provider, code: timedOut ? 'TIMEOUT' : 'ABORTED' }));
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
    if (controller.signal.aborted) rejectAbort();
  });
  const operation = async () => {
    let response;
    try {
      response = await fetchImpl(request.url, { ...request.init, signal: controller.signal });
    } catch (cause) {
      throw new CommuteProviderError(`${provider} request failed`, { provider, code: cause?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR', cause });
    }
    if (!response || typeof response.json !== 'function') {
      throw new CommuteProviderError(`${provider} returned an invalid HTTP response`, { provider, code: 'INVALID_HTTP_RESPONSE' });
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch (cause) {
      // Error bodies are optional; their contents never enter a client error.
      if (response.ok) throw new CommuteProviderError(`${provider} returned invalid JSON`, { provider, code: 'INVALID_JSON', cause });
    }
    if (!response.ok) {
      const httpStatus = Number(response.status) || null;
      throw new CommuteProviderError(`${provider} returned HTTP ${httpStatus}`, {
        provider, code: safeHttpErrorCode(provider, httpStatus, payload), httpStatus,
        ...sanitizeProviderErrorDetails(provider, payload?.error),
      });
    }
    return payload;
  };
  try {
    // The same deadline covers headers and JSON body parsing, including a body
    // reader that fails to cooperate with abort. Never cache its late result.
    if (controller.signal.aborted) return await aborted;
    return await Promise.race([aborted, operation()]);
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener('abort', rejectAbort);
    externalSignal?.removeEventListener('abort', externalAbort);
  }
}

export async function fetchTmapTransitSummary(params, {
  fetchImpl = globalThis.fetch,
  cache = null,
  cacheTtlMs = MAX_MEMORY_CACHE_TTL_MS,
  now = Date.now,
  beforeRequest,
  requestGate = action => action(),
  timeoutMs = 15000,
} = {}) {
  const request = buildTmapTransitSummaryRequest(params);
  const cacheKey = createCommuteCacheKey({
    provider: 'tmap-transit',
    origin: params.origin,
    destination: params.destination,
    searchDateTime: params.searchDateTime,
    option: `summary:count=${Number(params.count ?? TMAP_TRANSIT_DEFAULT_COUNT)}`,
  });
  const load = () => requestGate(async () => {
    if (typeof beforeRequest === 'function') await beforeRequest();
    return {
      ...normalizeTmapTransitSummary(await requestJson(request, { fetchImpl, provider: 'tmap-transit', timeoutMs })),
      queriedAt: queriedAt(now),
    };
  });
  return cache?.getOrLoad
    ? cache.getOrLoad(cacheKey, load, { ttlMs: cacheTtlMs })
    : load();
}

export async function fetchKakaoPublicTransit(params, {
  fetchImpl = globalThis.fetch,
  cache = null,
  now = Date.now,
  beforeRequest,
  requestGate = action => action(),
  timeoutMs = 15000,
} = {}) {
  const request = buildKakaoPublicTransitRequest(params);
  const cacheKey = createCommuteCacheKey({
    provider: 'kakao-transit',
    origin: params.origin,
    destination: params.destination,
    option: 'publictraffic',
  });
  const load = () => requestGate(async () => {
    if (typeof beforeRequest === 'function') await beforeRequest();
    return {
      ...normalizeKakaoPublicTransit(await requestJson(request, { fetchImpl, provider: 'kakao-transit', timeoutMs })),
      queriedAt: queriedAt(now),
    };
  });
  // Kakao Local route data is for the current display only, not later reuse:
  // https://devtalk.kakao.com/t/local-api/151263
  return cache?.getOrJoin
    ? cache.getOrJoin(cacheKey, load)
    : load();
}

export async function fetchNaverDirections5(params, {
  fetchImpl = globalThis.fetch,
  cache = null,
  cacheTtlMs = MAX_MEMORY_CACHE_TTL_MS,
  now = Date.now,
  timeoutMs = 15000,
} = {}) {
  const option = params.option || 'traoptimal';
  const request = buildNaverDirections5Request({ ...params, option });
  const cacheKey = createCommuteCacheKey({
    provider: 'naver-directions5',
    origin: params.origin,
    destination: params.destination,
    option,
  });
  const load = async () => ({
    ...normalizeNaverDirections5(
      await requestJson(request, { fetchImpl, provider: 'naver-directions5', timeoutMs }),
      { option },
    ),
    queriedAt: queriedAt(now),
  });
  return cache?.getOrLoad
    ? cache.getOrLoad(cacheKey, load, { ttlMs: cacheTtlMs })
    : load();
}
