import { promises as fs } from 'node:fs';
import path from 'node:path';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const MAX_MEMORY_CACHE_TTL_MS = (24 * HOUR_MS) - 1;
export const TMAP_TRANSIT_SUMMARY_ENDPOINT = 'https://apis.openapi.sk.com/transit/routes/sub';
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
  constructor(message, { provider, code = 'PROVIDER_ERROR', httpStatus = null, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'CommuteProviderError';
    this.provider = provider || 'unknown';
    this.code = code;
    this.httpStatus = httpStatus;
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
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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
    this.inflight.clear();
  }

  get size() {
    for (const key of this.entries.keys()) this.get(key);
    return this.entries.size;
  }

  hasOrPending(key) {
    return this.get(key) !== undefined || this.inflight.has(key);
  }

  async getOrLoad(key, loader, { ttlMs = this.ttlMs } = {}) {
    if (typeof loader !== 'function') throw new TypeError('loader must be a function');
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    if (this.inflight.has(key)) return this.inflight.get(key);

    const pending = Promise.resolve()
      .then(loader)
      .then((value) => this.set(key, value, { ttlMs }))
      .finally(() => this.inflight.delete(key));
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
    String(searchDateTime || 'now'),
    String(option || ''),
  ].join('|');
}

export function buildTmapTransitSummaryRequest({
  origin,
  destination,
  appKey,
  searchDateTime,
  count = 1,
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

  const route = itineraries[0];
  const durationSeconds = asNonNegativeNumber(route?.totalTime);
  if (durationSeconds === null) {
    throw new CommuteProviderError('TMAP response did not include a valid totalTime', {
      provider: 'tmap-transit',
      code: 'INVALID_RESPONSE',
    });
  }
  const walkSeconds = asNonNegativeNumber(route.totalWalkTime);
  const transferCount = asNonNegativeNumber(route.transferCount);
  const fareWon = asNonNegativeNumber(route?.fare?.regular?.totalFare);

  return {
    provider: 'tmap-transit',
    mode: 'transit',
    verified: true,
    status: 'verified',
    durationMinutes: Math.ceil(durationSeconds / 60),
    durationSeconds,
    distanceMeters: asNonNegativeNumber(route.totalDistance),
    walkMinutes: walkSeconds === null ? null : Math.ceil(walkSeconds / 60),
    walkSeconds,
    transferCount,
    fareWon,
    pathType: asNonNegativeNumber(route.pathType),
    routeCount: itineraries.length,
    requestedAt: metadata?.requestParameters?.reqDttm ?? null,
  };
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

  const best = validRoutes[0].route;
  const properties = best.properties || {};
  const walkingSteps = (Array.isArray(best.steps) ? best.steps : [])
    .map((step) => step?.properties)
    .filter((step) => String(step?.type || '').toUpperCase() === 'WALKING');
  const walkSeconds = walkingSteps.reduce((sum, step) => sum + (asNonNegativeNumber(step?.time) ?? 0), 0);
  const walkDistanceMeters = walkingSteps.reduce((sum, step) => sum + (asNonNegativeNumber(step?.distance) ?? 0), 0);
  const fare = properties.fare || {};

  return {
    provider: 'kakao-transit',
    mode: 'transit',
    verified: true,
    status: 'verified',
    durationMinutes: Math.ceil(validRoutes[0].durationSeconds / 60),
    durationSeconds: validRoutes[0].durationSeconds,
    distanceMeters: asNonNegativeNumber(properties.totalDistance),
    walkMinutes: Math.ceil(walkSeconds / 60),
    walkSeconds,
    walkDistanceMeters,
    transferCount: asNonNegativeNumber(properties.transfers),
    fareWon: asNonNegativeNumber(fare.value),
    fareMinWon: asNonNegativeNumber(fare.min),
    fareMaxWon: asNonNegativeNumber(fare.max),
    routeType: typeof properties.type === 'string' ? properties.type : null,
    routeCount: routes.length,
    landingUrl: typeof payload?.properties?.landingURL === 'string' ? payload.properties.landingURL : null,
    timeBasis: 'provider-default-no-departure-parameter',
  };
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

  const requestedRoutes = payload?.route?.[option];
  const fallbackRoutes = requestedRoutes || Object.values(payload?.route || {}).find(Array.isArray);
  const summary = Array.isArray(fallbackRoutes) ? fallbackRoutes[0]?.summary : null;
  const durationMilliseconds = asNonNegativeNumber(summary?.duration);
  if (durationMilliseconds === null) {
    throw new CommuteProviderError('NAVER response did not include a valid route duration', {
      provider: 'naver-directions5',
      code: 'INVALID_RESPONSE',
    });
  }

  return {
    provider: 'naver-directions5',
    mode: 'car',
    verified: true,
    status: 'verified',
    routeOption: option,
    durationMinutes: Math.ceil(durationMilliseconds / MINUTE_MS),
    durationMilliseconds,
    distanceMeters: asNonNegativeNumber(summary.distance),
    departureAt: summary.departureTime ?? payload.currentDateTime ?? null,
    tollFareWon: asNonNegativeNumber(summary.tollFare),
    taxiFareWon: asNonNegativeNumber(summary.taxiFare),
    fuelPriceWon: asNonNegativeNumber(summary.fuelPrice),
  };
}

async function requestJson(request, { fetchImpl, provider, timeoutMs = 15000 }) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    response = await fetchImpl(request.url, { ...request.init, signal: request.init?.signal || controller.signal });
  } catch (cause) {
    throw new CommuteProviderError(`${provider} request failed`, {
      provider,
      code: cause?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      cause,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response || typeof response.json !== 'function') {
    throw new CommuteProviderError(`${provider} returned an invalid HTTP response`, {
      provider,
      code: 'INVALID_HTTP_RESPONSE',
    });
  }
  if (!response.ok) {
    throw new CommuteProviderError(`${provider} returned HTTP ${response.status}`, {
      provider,
      code: 'HTTP_ERROR',
      httpStatus: Number(response.status) || null,
    });
  }
  try {
    return await response.json();
  } catch (cause) {
    throw new CommuteProviderError(`${provider} returned invalid JSON`, {
      provider,
      code: 'INVALID_JSON',
      cause,
    });
  }
}

export async function fetchTmapTransitSummary(params, {
  fetchImpl = globalThis.fetch,
  cache = null,
  cacheTtlMs = MAX_MEMORY_CACHE_TTL_MS,
  now = Date.now,
  beforeRequest,
} = {}) {
  const request = buildTmapTransitSummaryRequest(params);
  const cacheKey = createCommuteCacheKey({
    provider: 'tmap-transit',
    origin: params.origin,
    destination: params.destination,
    searchDateTime: params.searchDateTime,
    option: 'summary',
  });
  const load = async () => {
    if (typeof beforeRequest === 'function') await beforeRequest();
    return {
      ...normalizeTmapTransitSummary(await requestJson(request, { fetchImpl, provider: 'tmap-transit' })),
      queriedAt: queriedAt(now),
    };
  };
  return cache?.getOrLoad
    ? cache.getOrLoad(cacheKey, load, { ttlMs: cacheTtlMs })
    : load();
}

export async function fetchKakaoPublicTransit(params, {
  fetchImpl = globalThis.fetch,
  cache = null,
  cacheTtlMs = MAX_MEMORY_CACHE_TTL_MS,
  now = Date.now,
  beforeRequest,
} = {}) {
  const request = buildKakaoPublicTransitRequest(params);
  const cacheKey = createCommuteCacheKey({
    provider: 'kakao-transit',
    origin: params.origin,
    destination: params.destination,
    option: 'publictraffic',
  });
  const load = async () => {
    if (typeof beforeRequest === 'function') await beforeRequest();
    return {
      ...normalizeKakaoPublicTransit(await requestJson(request, { fetchImpl, provider: 'kakao-transit' })),
      queriedAt: queriedAt(now),
    };
  };
  return cache?.getOrLoad
    ? cache.getOrLoad(cacheKey, load, { ttlMs: cacheTtlMs })
    : load();
}

export async function fetchNaverDirections5(params, {
  fetchImpl = globalThis.fetch,
  cache = null,
  cacheTtlMs = MAX_MEMORY_CACHE_TTL_MS,
  now = Date.now,
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
      await requestJson(request, { fetchImpl, provider: 'naver-directions5' }),
      { option },
    ),
    queriedAt: queriedAt(now),
  });
  return cache?.getOrLoad
    ? cache.getOrLoad(cacheKey, load, { ttlMs: cacheTtlMs })
    : load();
}
