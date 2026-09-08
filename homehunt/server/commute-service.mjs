import {
  createCommuteCacheKey, fetchTmapTransitSummary, fetchKakaoPublicTransit,
  fetchNaverDirections5, sanitizeProviderErrorDetails, TMAP_TRANSIT_CACHE_OPTION,
} from '../scripts/commute-provider.mjs';
import { normalizeGeoPoint } from '../js/transport-core.mjs';
import { nextWeekdaySearchDateTime } from '../scripts/commute-time.mjs';
import { runEarlyExitCommuteBatch } from '../scripts/commute-early-exit.mjs';
import { createFirestoreRouteCache } from './route-cache.mjs';
import { createFirestoreProviderQuota } from './provider-quota.mjs';

const LIVE_POLICY = 'live-only/current-view';
const CACHE_POLICY = 'firestore-8-hours';
const MAX_TRANSIT_CALLS = 30;

export class CloudCommuteError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'CloudCommuteError';
    this.code = code;
    this.status = this.httpStatus = status;
    this.details = details;
  }
}

const fail = (code, message, status, details) => { throw new CloudCommuteError(code, message, status, details); };
const modesOf = value => Array.isArray(value) ? [...new Set(value.filter(mode => mode === 'transit' || mode === 'car'))] : [];
const pointOf = value => {
  if (!['number', 'string'].includes(typeof value?.lat) || !['number', 'string'].includes(typeof value?.lng)) return null;
  return normalizeGeoPoint(value);
};
const cleanId = value => String(value ?? '').normalize('NFKC').trim();
const validId = value => value.length >= 1 && value.length <= 128 && !/[\u0000-\u001f]/.test(value);
const unconfigured = (provider, mode) => ({ provider, mode, verified: false, status: 'not-configured', durationMinutes: null });
const failedRoute = (provider, mode, error) => ({
  provider, mode, verified: false, status: error?.code === 'DAILY_LIMIT' ? 'quota-exhausted' : 'error',
  reasonCode: error?.code || 'PROVIDER_ERROR', durationMinutes: null,
  httpStatus: Number.isInteger(error?.httpStatus) ? error.httpStatus : null,
  ...sanitizeProviderErrorDetails(provider, { code: error?.providerErrorCode, category: error?.providerErrorCategory }),
});

function concurrencyGate() {
  let active = 0;
  const queue = [];
  return async action => {
    if (active >= 2) await new Promise(resolve => queue.push(resolve));
    else active++;
    try { return await action(); }
    finally { const next = queue.shift(); if (next) next(); else active--; }
  };
}

export function createCloudCommuteService({
  db, env = {}, fetchImpl = globalThis.fetch, now = Date.now,
  requestTimeoutMs = 15000, batchTimeoutMs = 55000,
} = {}) {
  if (typeof fetchImpl !== 'function' || typeof now !== 'function') throw new TypeError('Fetch and a clock are required');
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0 || requestTimeoutMs > 15000
      || !Number.isFinite(batchTimeoutMs) || batchTimeoutMs <= 0 || batchTimeoutMs > 55000) throw new TypeError('Invalid commute timeout');
  const secrets = {
    kakao: String(env.KAKAO_REST_API_KEY || '').trim(), tmap: String(env.TMAP_APP_KEY || '').trim(),
    naverId: String(env.NAVER_MAPS_CLIENT_ID || '').trim(), naverSecret: String(env.NAVER_MAPS_CLIENT_SECRET || '').trim(),
  };
  const limits = {
    kakao: env.KAKAO_DAILY_LIMIT === undefined ? 1000 : Number(env.KAKAO_DAILY_LIMIT),
    tmap: env.TMAP_DAILY_LIMIT === undefined ? 10 : Number(env.TMAP_DAILY_LIMIT),
  };
  const ledger = createFirestoreProviderQuota({ db, now, limits });
  const routeCache = createFirestoreRouteCache({ db, now });
  const preference = ['kakao', 'tmap'].includes(env.TRANSIT_PROVIDER) ? env.TRANSIT_PROVIDER : 'auto';
  const selected = () => preference === 'auto' ? secrets.kakao ? 'kakao' : 'tmap' : preference;
  const carConfigured = Boolean(secrets.naverId && secrets.naverSecret);
  const diagnostics = { transit: { kakao: null, tmap: null }, car: null };
  const inflight = new Map();
  const gate = concurrencyGate();

  function providerFor(value) {
    if (value !== undefined && value !== '' && !['auto', 'kakao', 'tmap'].includes(value)) fail('INVALID_TRANSIT_PROVIDER', '대중교통 공급자를 확인해주세요.');
    const provider = !value || value === 'auto' ? selected() : value;
    if (value && value !== 'auto' && !secrets[provider]) fail('TRANSIT_NOT_CONFIGURED', '선택한 대중교통 공급자가 연결되지 않았습니다.', 503);
    return provider;
  }

  function configuration() {
    const provider = selected();
    return {
      transitConfigured: Boolean(secrets[provider]), carConfigured, transitProvider: provider,
      transitProviderPreference: preference,
      providers: { kakaoTransitConfigured: Boolean(secrets.kakao), tmapTransitConfigured: Boolean(secrets.tmap), naverDirectionsConfigured: carConfigured },
      cache: { transit: provider === 'tmap' ? CACHE_POLICY : LIVE_POLICY, kakao: LIVE_POLICY, tmap: CACHE_POLICY, car: LIVE_POLICY },
      diagnostics: structuredClone(diagnostics),
    };
  }

  async function quota(value) {
    const provider = providerFor(value);
    async function safe(name) {
      try { return { ...await ledger.getUsage(name), available: true }; }
      catch { return { provider: `${name}-transit`, date: null, timeZone: 'Asia/Seoul', limit: limits[name],
        used: null, remaining: 0, resetAt: null, updatedAt: null, available: false, reasonCode: 'QUOTA_LEDGER_ERROR' }; }
    }
    const [tmap, kakao] = await Promise.all([safe('tmap'), safe('kakao')]);
    return { ok: true, provider, transitConfigured: Boolean(secrets[provider]), tmap, kakao,
      transitProvider: provider, transitProviderPreference: preference };
  }

  function context(maximumCalls) {
    const ctx = { maximumCalls, actualTransitCalls: 0, reservedTransitCalls: 0, aborted: false,
      abortCode: 'BATCH_ABORTED', requests: new Map(), queue: Promise.resolve(), controller: new AbortController() };
    ctx.deadline = new Promise((_, reject) => {
      ctx.timer = setTimeout(() => {
        ctx.aborted = true; ctx.abortCode = 'BATCH_TIMEOUT'; ctx.controller.abort();
        reject(new CloudCommuteError('BATCH_TIMEOUT', '통근 조회 시간이 길어 남은 요청을 중단했습니다.', 504));
      }, batchTimeoutMs);
    });
    // Every consumer races this same deadline; suppress the unobserved branch.
    ctx.deadline.catch(() => {});
    return ctx;
  }

  const within = (pending, ctx) => Promise.race([pending, ctx.deadline]);
  function assertActive(ctx) {
    if (ctx.aborted) throw new CloudCommuteError(ctx.abortCode, '남은 통근 요청을 중단했습니다.', 503);
  }
  function record(provider, route, error) {
    const target = provider === 'car' ? diagnostics : diagnostics.transit;
    target[provider] = {
      state: error ? 'error' : route?.verified ? 'verified' : 'reachable', checkedAt: new Date(now()).toISOString(),
      reasonCode: error?.code || route?.reasonCode || null, httpStatus: Number.isInteger(error?.httpStatus) ? error.httpStatus : null,
      ...sanitizeProviderErrorDetails(`${provider}-transit`, { code: error?.providerErrorCode, category: error?.providerErrorCategory }),
    };
  }
  function join(key, loader, ctx) {
    if (ctx.requests.has(key)) return ctx.requests.get(key);
    if (!inflight.has(key)) {
      const pending = Promise.resolve().then(loader).finally(() => { if (inflight.get(key) === pending) inflight.delete(key); });
      inflight.set(key, pending);
    }
    const pending = inflight.get(key);
    // Completed responses are retained only while constructing this one HTTP
    // response. No Kakao/NAVER result survives in a reusable service cache.
    ctx.requests.set(key, pending);
    return pending;
  }
  function requestKey(pair, mode, provider) {
    return createCommuteCacheKey({ provider: mode === 'car' ? 'naver-directions5' : `${provider}-transit`,
      origin: pair.origin, destination: pair.destination, searchDateTime: mode === 'transit' && provider === 'tmap' ? pair.searchDateTime : '',
      option: mode === 'car' ? 'traoptimal' : provider === 'tmap' ? TMAP_TRANSIT_CACHE_OPTION : 'publictraffic' });
  }
  const cacheRequest = pair => ({ provider: 'tmap-transit', mode: 'transit', origin: pair.origin,
    destination: pair.destination, searchDateTime: pair.searchDateTime, option: TMAP_TRANSIT_CACHE_OPTION, count: 3, language: 0 });

  function reserve(provider, ctx) {
    const pending = ctx.queue.then(async () => {
      assertActive(ctx);
      if (ctx.reservedTransitCalls >= ctx.maximumCalls) throw new CloudCommuteError('BATCH_LIMIT', '통근 호출 상한에 도달했습니다.', 429);
      await ledger.reserve(provider, 1);
      ctx.reservedTransitCalls++;
      assertActive(ctx);
    });
    ctx.queue = pending.catch(() => {});
    return pending;
  }

  async function modeRoute(pair, mode, provider, ctx) {
    const providerName = mode === 'car' ? 'naver-directions5' : `${provider}-transit`;
    if (ctx.aborted) return [failedRoute(providerName, mode, { code: ctx.abortCode })];
    if (mode === 'car' ? !carConfigured : !secrets[provider]) return [unconfigured(providerName, mode)];
    const key = requestKey(pair, mode, provider);
    try {
      const result = await join(key, () => gate(async () => {
        assertActive(ctx);
        if (mode === 'transit' && provider === 'tmap') {
          // Check again at execution time: a record can expire after preflight.
          const cached = await routeCache.get(cacheRequest(pair));
          assertActive(ctx);
          if (cached) return { ...cached, cacheHit: true };
        }
        const common = {
          now, timeoutMs: requestTimeoutMs,
          fetchImpl: (url, init) => {
            assertActive(ctx);
            if (mode === 'transit') ctx.actualTransitCalls++;
            const signal = init?.signal ? AbortSignal.any([init.signal, ctx.controller.signal]) : ctx.controller.signal;
            return fetchImpl(url, { ...init, signal });
          },
          beforeRequest: () => reserve(provider, ctx),
        };
        const route = mode === 'car'
          ? await fetchNaverDirections5({ origin: pair.origin, destination: pair.destination, clientId: secrets.naverId, clientSecret: secrets.naverSecret }, common)
          : provider === 'kakao'
            ? await fetchKakaoPublicTransit({ origin: pair.origin, destination: pair.destination, restApiKey: secrets.kakao }, common)
            : await fetchTmapTransitSummary({ origin: pair.origin, destination: pair.destination, appKey: secrets.tmap, searchDateTime: pair.searchDateTime }, common);
        if (ctx.abortCode === 'BATCH_TIMEOUT') throw new CloudCommuteError(ctx.abortCode, '통근 조회가 중단되었습니다.', 503);
        if (mode === 'transit' && provider === 'tmap') {
          // A cache outage must not hide an otherwise valid live route.
          try { await routeCache.set(cacheRequest(pair), route); } catch { /* no cache written */ }
        }
        return { ...route, cacheHit: false };
      }), ctx);
      record(mode === 'car' ? 'car' : provider, result);
      if (!result.verified && !/(?:^|_)NO_ROUTE$/.test(String(result.reasonCode || ''))) ctx.aborted = true;
      return result.routes?.length ? result.routes.map(route => ({ ...route, queriedAt: result.queriedAt, cacheHit: result.cacheHit })) : [result];
    } catch (error) {
      const failure = ctx.abortCode === 'BATCH_TIMEOUT' ? { code: 'BATCH_TIMEOUT' } : error;
      ctx.aborted = true;
      if (failure?.code !== 'BATCH_ABORTED') record(mode === 'car' ? 'car' : provider, null, failure);
      return [failedRoute(providerName, mode, failure)];
    }
  }

  async function resolve(pair, provider, ctx) {
    const routes = [];
    for (const mode of ['transit', 'car'].filter(mode => pair.modes.includes(mode))) routes.push(...await modeRoute(pair, mode, provider, ctx));
    return routes;
  }
  function departure(value) {
    const departureTime = String(value || '08:00');
    const searchDateTime = nextWeekdaySearchDateTime(departureTime, now());
    if (!searchDateTime) fail('INVALID_DEPARTURE_TIME', '출근 출발 시각을 확인해주세요.');
    return { departureTime, searchDateTime };
  }

  async function single(body = {}) {
    const origin = pointOf(body.origin), destination = pointOf(body.destination), modes = modesOf(body.modes);
    if (!origin || !destination) fail('INVALID_COORDINATES', '출발지와 회사 위치 좌표를 확인해주세요.');
    if (!modes.length) fail('INVALID_MODES', '자동차 또는 대중교통을 선택해주세요.');
    const provider = providerFor(body.transitProvider);
    const time = departure(body.departureTime);
    const ctx = context(1);
    try {
      const routes = await within(resolve({ origin, destination, modes, ...time }, provider, ctx), ctx);
      return { ok: true, routes, departureTime: time.departureTime, transitSearchDateTime: time.searchDateTime,
        configured: { transit: Boolean(secrets[provider]), car: carConfigured, transitProvider: provider },
        actualTransitCalls: ctx.actualTransitCalls, cachePolicy: `kakao-${LIVE_POLICY}; tmap-${CACHE_POLICY}; car-${LIVE_POLICY}` };
    } finally { clearTimeout(ctx.timer); }
  }

  async function batch(body = {}) {
    if (!Array.isArray(body.origins) || !body.origins.length || body.origins.length > 10) fail('INVALID_ORIGINS', '출발지는 1~10개까지 입력해주세요.');
    if (!Array.isArray(body.destinations) || !body.destinations.length || body.destinations.length > 8) fail('INVALID_DESTINATIONS', '도착지는 1~8개까지 입력해주세요.');
    const origins = body.origins.map(value => ({ id: cleanId(value?.id), point: pointOf(value) }));
    const destinations = body.destinations.map(value => ({ id: cleanId(value?.id), point: pointOf(value),
      modes: modesOf(value?.modes), maxMinutes: Number(value?.maxMinutes),
      required: value?.required !== false, weightPercent: Number(value?.weightPercent ?? value?.weight ?? 0),
      ...departure(value?.departureTime) }));
    if ([...origins, ...destinations].some(value => !validId(value.id))) fail('INVALID_LOCATION_ID', '각 출발지와 도착지에 ID가 필요합니다.');
    if (new Set(origins.map(value => value.id)).size !== origins.length || new Set(destinations.map(value => value.id)).size !== destinations.length) fail('DUPLICATE_LOCATION_ID', '위치 ID는 중복될 수 없습니다.');
    if ([...origins, ...destinations].some(value => !value.point)) fail('INVALID_COORDINATES', '출발지와 도착지 좌표를 확인해주세요.');
    if (destinations.some(value => !value.modes.length)) fail('INVALID_MODES', '각 도착지의 교통수단을 선택해주세요.');
    if (destinations.some(value => !Number.isFinite(value.maxMinutes) || value.maxMinutes <= 0 || value.maxMinutes > 300)) fail('INVALID_MAX_MINUTES', '최대 통근 시간은 1~300분이어야 합니다.');
    if (body.earlyExit === true && body.destinations.some(value => value?.required !== undefined && typeof value.required !== 'boolean')) fail('INVALID_REQUIRED_FLAG', '회사별 시간 제한 적용 여부를 확인해주세요.');
    if (body.earlyExit === true && destinations.some(value => !Number.isFinite(value.weightPercent) || value.weightPercent < 0)) fail('INVALID_DESTINATION_WEIGHT', '회사별 비중은 0 이상의 숫자여야 합니다.');
    const maxTransitCalls = body.maxTransitCalls === undefined ? 10 : Number(body.maxTransitCalls);
    if (!Number.isInteger(maxTransitCalls) || maxTransitCalls < 0 || maxTransitCalls > MAX_TRANSIT_CALLS) fail('INVALID_MAX_TRANSIT_CALLS', '대중교통 호출 상한은 0~30의 정수여야 합니다.');
    const provider = providerFor(body.transitProvider);
    const pairs = origins.flatMap(origin => destinations.map(destination => {
      const pair = { originId: origin.id, destinationId: destination.id, origin: origin.point, destination: destination.point,
        modes: destination.modes, departureTime: destination.departureTime, searchDateTime: destination.searchDateTime };
      pair.identity = [...pair.modes].sort().map(mode => requestKey(pair, mode, provider)).join(';');
      return pair;
    }));
    const unique = [...new Map(pairs.map(pair => [pair.identity, pair])).values()];
    const ctx = context(maxTransitCalls);
    const resolved = new Map();
    try {
      const transitPairs = new Map(unique.filter(pair => pair.modes.includes('transit')).map(pair => [requestKey(pair, 'transit', provider), pair]));
      let requiredTransitCalls = 0;
      if (secrets[provider]) {
        for (const [key, pair] of transitPairs) {
          if (inflight.has(key)) {
            // Hold the already-pending promise for this response so settling
            // between preflight and execution cannot create an unplanned call.
            ctx.requests.set(key, inflight.get(key));
            continue;
          }
          let cached = null;
          if (provider === 'tmap') {
            try { cached = await within(routeCache.get(cacheRequest(pair)), ctx); }
            catch (error) {
              if (error?.code === 'BATCH_TIMEOUT') throw error;
              fail('ROUTE_CACHE_UNAVAILABLE', '저장된 통근 경로를 확인하지 못했습니다.', 503);
            }
          }
          if (!cached) requiredTransitCalls++;
        }
      }
      let usage;
      try { usage = await within(ledger.getUsage(provider), ctx); }
      catch (error) {
        if (error?.code === 'BATCH_TIMEOUT') throw error;
        fail(`${provider.toUpperCase()}_QUOTA_UNAVAILABLE`, '통근 사용량을 확인하지 못했습니다.', 503, { provider, reasonCode: 'QUOTA_LEDGER_ERROR' });
      }
      const detail = { provider, requiredTransitCalls, maxTransitCalls, maxUpstreamCallsPerBatch: MAX_TRANSIT_CALLS, quota: usage };
      if (requiredTransitCalls > maxTransitCalls) fail('TRANSIT_PREFLIGHT_LIMIT', '이 요청의 통근 호출 상한을 넘었습니다.', 429, detail);
      if (requiredTransitCalls > usage.remaining) fail(`${provider.toUpperCase()}_DAILY_LIMIT`, '오늘 남은 호출량보다 조회할 경로가 많습니다.', 429, detail);
      let cursor = 0;
      async function worker() {
        while (cursor < unique.length) {
          const pair = unique[cursor++];
          resolved.set(pair.identity, await resolve(pair, provider, ctx));
        }
      }
      let earlyResult = null;
      if (body.earlyExit === true) {
        earlyResult = await runEarlyExitCommuteBatch({ pairs, destinations, concurrency: 2,
          isAborted: () => ctx.aborted,
          resolvePair: async pair => {
            try { return await within(resolve(pair, provider, ctx), ctx); }
            catch (error) {
              if (error?.code !== 'BATCH_TIMEOUT') throw error;
              return pair.modes.map(mode => failedRoute(mode === 'car' ? 'naver-directions5' : `${provider}-transit`, mode, { code: 'BATCH_TIMEOUT' }));
            }
          },
        });
      } else {
        try { await within(Promise.all([worker(), worker()]), ctx); }
        catch (error) { if (error?.code !== 'BATCH_TIMEOUT') throw error; }
      }
      const routesFor = pair => resolved.get(pair.identity) || pair.modes.map(mode => failedRoute(mode === 'car' ? 'naver-directions5' : `${provider}-transit`, mode, { code: ctx.abortCode }));
      const items = earlyResult?.items || pairs.map(pair => ({ originId: pair.originId, destinationId: pair.destinationId,
        routes: routesFor(pair), departureTime: pair.departureTime }));
      // Quota is ancillary after a timeout; never wait indefinitely for another
      // database call after the operation deadline has already elapsed.
      let usageAfter = null;
      if (ctx.abortCode !== 'BATCH_TIMEOUT') {
        try { usageAfter = await within(quota(provider), ctx); }
        catch (error) { if (error?.code !== 'BATCH_TIMEOUT') throw error; }
      }
      return { ok: true, items, quota: usageAfter, provider, requestedPairCount: pairs.length,
        uniquePairCount: unique.length, deduplicatedPairCount: pairs.length - unique.length,
        requiredTransitCalls, actualTransitCalls: ctx.actualTransitCalls,
        abortedPairCount: earlyResult?.abortedPairCount ?? unique.filter(pair => routesFor(pair).some(route => ['BATCH_ABORTED', 'BATCH_TIMEOUT'].includes(route.reasonCode))).length,
        ...(earlyResult ? { earlyExit: true, skippedPairCount: earlyResult.skippedPairCount, earlyExcludedOriginIds: earlyResult.earlyExcludedOriginIds } : {}),
        cachePolicy: provider === 'tmap' ? CACHE_POLICY : LIVE_POLICY };
    } finally { clearTimeout(ctx.timer); }
  }
  return Object.freeze({ single, batch, quota, configuration });
}
