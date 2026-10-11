import { APP_CONFIG } from '../../homehunt/js/config.js';
import { createCloudSession } from '../../homehunt/js/cloud-session.js?v=4.19.0&records=3';
import { createWecostTargetPriceService, WECOST_TARGET_PRICE_URL } from '../../homehunt/js/wecost-target-price-service.mjs';
import { normalizeRecommendationFilters } from '../../../shared/homehunt/recommendation-core.mjs';
import { normalizeDestinations } from '../../../shared/homehunt/commute-balance-core.mjs';
import { normalizeOfficialComplexInfo } from '../../homehunt/js/official-complex-client.mjs';
import { loadNaverMaps } from '../../homehunt/js/naver-map.js';

const PUBLIC_ROOT = new URL('../../homehunt/data/', import.meta.url);
const MODEL_ROOT = new URL('../data/', import.meta.url);
const TERMINAL = new Set(['complete', 'error', 'cancelled']);
const abortError = () => new DOMException('조회가 취소됐습니다.', 'AbortError');
function assertActive(signal) { if (signal?.aborted) throw abortError(); }
function safeFailure(code, status) {
  const messages = { CLOUD_LOGIN_REQUIRED: '온라인 검색과 백업은 먼저 로그인해주세요.',
    ACCOUNT_CHANGED: '계정이 변경돼 이전 조회를 중단했습니다.',
    CLOUD_SESSION_CHANGED: '계정이 변경돼 이전 조회를 중단했습니다.',
    CLOUD_SNAPSHOT_CONFLICT: '다른 화면에서 백업이 변경됐습니다. 최신 기록을 확인한 뒤 다시 저장해주세요.',
    AUTHORIZATION_REQUIRED: '이 계정의 검색 권한을 확인해주세요.',
    TRANSIT_QUOTA_EXCEEDED: '오늘의 대중교통 조회 한도가 부족합니다.',
    PLACE_SEARCH_NOT_CONFIGURED: '장소 검색용 서버 연결을 확인해주세요.',
    LOCAL_KEY_REQUIRED: '로컬 검색 서버의 국토부 키를 확인해주세요.',
    RECORD_OWNER_MISMATCH: '이 기기에 다른 계정의 기록이 있습니다. 원래 계정으로 로그인해 주세요. 자동 병합하지 않습니다.',
    LOCAL_RECORDS_CHANGED: '조회 중 다른 화면에서 기록이 변경됐습니다. 최신 기록을 확인하고 다시 시도해주세요.',
    EMPTY_BACKUP_BLOCKED: '이 기기의 빈 기록으로 기존 백업을 덮지 않았습니다. 먼저 기록을 복원해주세요.',
    BACKUP_RESTORE_FIRST: '기존 계정 백업과 이 기기의 기록이 다릅니다. 먼저 백업을 확인하고 복원해주세요.' };
  const error = new Error(messages[code] || (status === 401 ? messages.CLOUD_LOGIN_REQUIRED
    : status === 429 ? '호출 한도에 도달했습니다. 잠시 후 다시 시도해주세요.'
      : '조회 연결을 확인하지 못했습니다. 저장된 자료와 연결 상태를 확인해주세요.'));
  error.code = code || 'SERVICE_UNAVAILABLE'; error.status = status;
  return error;
}
export function waitForPoll(milliseconds, signal) {
  assertActive(signal);
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/** A thin adapter over Ver1's server. No key, provider ledger or route cache is copied. */
export function createServices({ config = APP_CONFIG, fetchImpl = globalThis.fetch,
  session = createCloudSession({ apiBaseUrl: config.cloudApiBaseUrl, firebaseConfig: config.firebaseConfig,
    signOutMember: async () => (await import('../../../shared/firebase/site-auth.mjs')).signOutMember() }),
  memberAccess = typeof document === 'undefined' ? null : () => import('../../../shared/firebase/site-auth.mjs'),
  pause = waitForPoll, publicRoot = PUBLIC_ROOT, modelRoot = MODEL_ROOT,
  storage = globalThis.localStorage,
  publishedRoot = 'https://castlerain.github.io/sungso/homehunt/data/' } = {}) {
  const base = config.isLocalRuntime ? 'http://127.0.0.1:8787/api' : config.cloudApiBaseUrl;
  let sessionReady, retired = false;
  const lifetime = new AbortController();
  const live = () => { if (retired) throw safeFailure('ACCOUNT_CHANGED'); };
  const requireMembership = async () => {
    live();
    if (!memberAccess) return null;
    const api = await memberAccess(); live();
    const member = await api.requireMember(); live();
    return { api, member };
  };
  const initSession = () => sessionReady ||= (async () => {
    const membership = await requireMembership();
    const state = await session.init() || session.getState(); live();
    if (membership && (membership.api.getMember()?.uid !== membership.member.uid
      || state.user?.uid !== membership.member.uid)) throw safeFailure('ACCOUNT_CHANGED');
    return state;
  })().catch(error => { sessionReady = null; throw error; });
  const ensureAccount = uid => {
    live();
    if (uid !== session.getState().user?.uid) throw safeFailure('ACCOUNT_CHANGED');
  };
  async function request(path, { signal, ...options } = {}) {
    live();
    signal = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
    assertActive(signal);
    await requireMembership();
    const headers = { Accept: 'application/json', ...options.headers };
    if (options.body) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = config.isLocalRuntime
        ? await fetchImpl(`${base}${path}`, { ...options, headers, signal, cache: 'no-store' })
        : await (async () => { await initSession(); return session.apiFetch(path, { ...options, headers, signal }); })();
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw abortError();
      throw safeFailure(error?.code);
    }
    assertActive(signal);
    const body = await response.json().catch(() => null); assertActive(signal); live();
    if (!response.ok || !body || body.ok === false) throw safeFailure(body?.code, response.status);
    return body;
  }
  async function publicJSON(url) {
    live();
    const response = await fetchImpl(String(url), { credentials: 'omit', cache: 'no-cache', signal: AbortSignal.any([AbortSignal.timeout(12000), lifetime.signal]) });
    live();
    if (!response.ok) throw safeFailure('PUBLIC_DATA_UNAVAILABLE', response.status);
    const value = await response.json(); live();
    if (!value || typeof value !== 'object') throw safeFailure('INVALID_PUBLIC_DATA');
    return value;
  }
  async function loadPublicData() {
    const files = { market: [publicRoot, 'market-summary.json'], supply: [publicRoot, 'home-supply.json'],
      finance: [publicRoot, 'finance-dashboard.json'], housing: [publicRoot, 'housing-indicators.json'],
      manifest: [modelRoot, 'manifest.json'], forecasts: [modelRoot, 'forecasts.json'],
      backtest: [modelRoot, 'backtest.json'], availability: [modelRoot, 'availability.json'] };
    files.updateStatus = [modelRoot, 'update-status.json'];
    files.prices = [modelRoot, 'market-prices.json'];
    const result = { errors: {} };
    await Promise.all(Object.entries(files).map(async ([key, [root, file]]) => {
      try { result[key] = await publicJSON(new URL(file, root)); }
      catch { result[key] = null; result.errors[key] = '자료를 불러오지 못했습니다.'; }
    }));
    // Reconcile newer published official files without triggering a collection job.
    // A page load never consumes provider calls or starts a research/supply harvest.
    if (config.isLocalRuntime) {
      await Promise.all(['supply', 'finance', 'housing'].map(async key => {
        try {
          const feed = await publicJSON(new URL(files[key][1], publishedRoot));
          if (Date.parse(feed.generatedAt || feed.updatedAt || '') > Date.parse(result[key]?.generatedAt || result[key]?.updatedAt || '1970-01-01')) {
            result[key] = feed; delete result.errors[key];
          }
        } catch { /* Preserve local source's actual timestamp/error, never invent 0. */ }
      }));
    }
    return result;
  }
  async function searchCandidates(raw, { signal, onProgress = () => {} } = {}) {
    // Price jobs never receive a company coordinate or personal finance field.
    const normalized = normalizeRecommendationFilters(raw);
    const fields = ['regions', 'minHouseholds', 'householdsOperator', 'maxPriceManWon', 'priceOperator',
      'minAreaM2', 'areaOperator', 'areaBasis', 'maxAgeYears', 'minBuiltYear', 'months'];
    const filters = Object.fromEntries(fields.map(key => [key, normalized[key]]));
    if (Array.isArray(raw.districtCodes) && raw.districtCodes.length) filters.districtCodes = raw.districtCodes;
    let job = await request('/recommendations', { method: 'POST', body: JSON.stringify(filters), signal });
    if (!job.jobId || !/^[a-zA-Z0-9_-]{1,128}$/.test(job.jobId)) throw safeFailure('INVALID_JOB');
    const cancelLocal = () => {
      if (config.isLocalRuntime && !TERMINAL.has(job.status)) request(`/recommendations/${job.jobId}`, { method: 'DELETE' }).catch(() => {});
      // Cloud price jobs are reusable by other tabs; abort only this observer.
    };
    signal?.addEventListener('abort', cancelLocal, { once: true });
    // Completed/total are true month tasks. No made-up percentage timer.
    const started = Date.now();
    try { while (!TERMINAL.has(job.status)) {
      assertActive(signal); onProgress({ ...job, message: '국토부 월 자료를 확인하고 있습니다.' });
      if (Date.now() - started > 15 * 60 * 1000) throw safeFailure('SEARCH_TIMEOUT');
      if (job.advanceRequired === true && !config.isLocalRuntime) {
        job = await request(`/recommendations/${job.jobId}/advance`, { method: 'POST', body: '{}', signal });
      } else {
        await pause(1500, signal);
        job = await request(`/recommendations/${job.jobId}`, { signal });
      }
    } } finally { signal?.removeEventListener('abort', cancelLocal); }
    assertActive(signal); onProgress(job);
    if (job.status !== 'complete') throw safeFailure(job.code || 'SEARCH_INCOMPLETE');
    return { ...job, candidates: job.results || [], pendingCandidates: job.pendingPriceCandidates || [] };
  }
  async function fetchHistory(candidate, { months = 60, signal, onProgress = () => {} } = {}) {
    const params = new URLSearchParams({ lawdCd: String(candidate.regionCode || candidate.lawdCd || ''),
      aptName: String(candidate.name || candidate.aptName || ''), aptSeq: String(candidate.aptSeq || ''),
      dong: String(candidate.dong || ''), months: String(Math.min(60, Math.max(12, Number(months) || 60))) });
    onProgress({ stage: 'loading', message: '같은 단지의 실제 거래를 조회합니다. 완료 건수는 서버 응답 후 확인됩니다.' });
    const result = await request(`/apartment-history?${params}`, { signal });
    onProgress({ stage: 'complete', completed: result.records?.length || 0 });
    return { ...result, transactions: result.records || [] };
  }
  async function getConnectionState({ signal } = {}) {
    if (!config.isLocalRuntime && !session.getState().user) {
      await initSession();
      if (!session.getState().user) {
        const url = new URL('../healthz', `${base}/`);
        const response = await fetchImpl(String(url), { signal, credentials: 'omit', cache: 'no-store' });
        return { ok: response.ok, runtime: 'render', loginRequired: true,
          note: '서버 준비 상태입니다. 공급자 연결은 로그인 후 확인합니다.' };
      }
    }
    return request('/health', { signal });
  }
  async function verifyCommute(candidates, conditions, { signal, onProgress = () => {} } = {}) {
    const destinations = normalizeDestinations(conditions.workplaces || conditions.destinations || [], {
      maxMinutes: conditions.commuteMaxMinutes || 60, modes: conditions.commuteModes || ['transit'] });
    if (!destinations.length || destinations.some(d => !Number.isFinite(d.lat) || !Number.isFinite(d.lng))) {
      throw safeFailure('INVALID_DESTINATIONS');
    }
    if (!candidates.length || candidates.length > 10) throw safeFailure('INVALID_ORIGINS');
    if (candidates.some(c => !Number.isFinite(c.lat) || !Number.isFinite(c.lng))) throw safeFailure('INVALID_COORDINATES');
    const maxTransitCalls = Math.min(30, Math.max(0, Number(conditions.maxTransitCalls ?? 10)));
    onProgress({ stage: 'routes', message: '선택한 집의 실제 경로만 확인합니다.' });
    const result = await request('/commute/batch', { method: 'POST', signal, body: JSON.stringify({
      origins: candidates.map(c => ({ id: String(c.catalogId || c.id), lat: c.lat, lng: c.lng })),
      destinations, maxTransitCalls, earlyExit: true,
      // Defaults to the shared server policy. Never opt into TMAP implicitly.
      ...(conditions.transitProvider ? { transitProvider: conditions.transitProvider } : {}),
    }) });
    onProgress({ stage: 'complete', quota: result.quota }); return result;
  }
  async function geocodeAddress(address) {
    live();
    if (!String(address || '').trim()) return null;
    await loadNaverMaps(config.naverMapClientId);
    live();
    return new Promise((resolve, reject) => {
      const service = globalThis.naver?.maps?.Service;
      if (!service) return reject(safeFailure('MAP_UNAVAILABLE'));
      const timer = setTimeout(() => reject(safeFailure('GEOCODE_TIMEOUT')), 15000);
      service.geocode({ query: String(address) }, (status, response) => {
        clearTimeout(timer);
        if (retired) return reject(safeFailure('ACCOUNT_CHANGED'));
        const item = status === service.Status.OK ? response?.v2?.addresses?.[0] : null;
        const lat = Number(item?.y), lng = Number(item?.x);
        resolve(item && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, address: item.roadAddress || item.jibunAddress } : null);
      });
    });
  }
  async function backupRecords(store) {
    await initSession(); const uid = session.getState().user?.uid;
    if (!uid) throw safeFailure('CLOUD_LOGIN_REQUIRED');
    const before = JSON.stringify(store.getShared());
    const owner = storage?.getItem('homehunt_shared_records_owner_uid_v1');
    if (owner && owner !== uid) throw safeFailure('RECORD_OWNER_MISMATCH');
    const remote = await session.loadSnapshot({ expectedUid: uid }); ensureAccount(uid);
    if (before !== JSON.stringify(store.getShared())) throw safeFailure('LOCAL_RECORDS_CHANGED');
    const shared = store.getShared();
    const recordCount = s => (s?.visits?.length || 0) + (s?.shortlist?.length || 0)
      + (s?.supplyFavorites?.length || 0) + Object.keys(s?.parkingObservations || {}).length;
    if (!recordCount(shared) && recordCount(remote.snapshot)) throw safeFailure('EMPTY_BACKUP_BLOCKED');
    if (!owner && recordCount(remote.snapshot) && ['visits', 'shortlist', 'supplyFavorites', 'parkingObservations']
      .some(key => JSON.stringify(shared[key]) !== JSON.stringify(remote.snapshot[key]))) {
      throw safeFailure('BACKUP_RESTORE_FIRST');
    }
    // Preserve remote Ver1 conditions even when the current device has never opened Ver1.
    const snapshot = store.getBackupSnapshot(remote.snapshot);
    const result = await session.saveSnapshot(snapshot, remote.revision, { expectedUid: uid }); ensureAccount(uid);
    if (before !== JSON.stringify(store.getShared())) {
      return { ...result, localChanged: true,
        note: '백업 조회 당시 내용은 저장됐지만 그 뒤 기기 기록이 변경됐습니다. 최신 기록을 확인하고 다시 백업해주세요.' };
    }
    storage?.setItem('homehunt_shared_records_owner_uid_v1', uid);
    return result;
  }
  async function restoreRecords(store) {
    await initSession(); const uid = session.getState().user?.uid;
    if (!uid) throw safeFailure('CLOUD_LOGIN_REQUIRED');
    const before = JSON.stringify(store.getShared());
    const expectedFingerprint = store.getSharedFingerprint?.();
    // This is an explicit replacement, not an automatic cross-account merge.
    // The UI previews the currently signed-in account and asks to restore it.
    const remote = await session.loadSnapshot({ expectedUid: uid }); ensureAccount(uid);
    if (before !== JSON.stringify(store.getShared())) throw safeFailure('LOCAL_RECORDS_CHANGED');
    if (!remote.snapshot) return { ...remote, empty: true };
    store.applyBackupSnapshot(remote.snapshot, { expectedFingerprint, accountUid: uid, explicitRestore: true });
    storage?.setItem('homehunt_shared_records_owner_uid_v1', uid); return remote;
  }
  // Read one authorized field only. Neither tokens nor the financial document
  // escape this adapter, and an account switch invalidates the response.
  const wecost = createWecostTargetPriceService({ fetchImpl: async (url, options) => {
    if (url !== WECOST_TARGET_PRICE_URL) throw safeFailure('AUTHORIZATION_REQUIRED');
    const membership = await requireMembership();
    if (!membership) return fetchImpl(url, options); // Isolated test transport.
    const [appSdk, authSdk] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')]);
    live();
    const app = appSdk.getApps().find(app => app.name === 'homehunt-private-cloud');
    const user = app && authSdk.getAuth(app).currentUser;
    const current = () => { live(); if (!user || membership.api.getMember()?.uid !== user.uid
      || membership.member.uid !== user.uid || authSdk.getAuth(app).currentUser !== user) throw safeFailure('ACCOUNT_CHANGED'); };
    current(); const token = await user.getIdToken(); current();
    const response = await fetchImpl(url, { ...options,
      signal: AbortSignal.any([options.signal, lifetime.signal]),
      headers: { ...options.headers, Authorization: `Bearer ${token}` } });
    current();
    return { ok: response.ok, status: response.status,
      json: async () => { const value = await response.json(); current(); return value; } };
  } });
  return Object.freeze({ loadCatalog: () => publicJSON(new URL('apartment-catalog-seoul-gyeonggi.json', publicRoot)),
    loadPublicData, searchCandidates, fetchHistory, getConnectionState, verifyCommute, geocodeAddress,
    searchPlaces: (query, { signal } = {}) => request(`/place-search?${new URLSearchParams({ query })}`, { signal }),
    getQuota: () => request('/commute/quota'),
    fetchFacilities: async (candidate, { signal } = {}) => normalizeOfficialComplexInfo(
      await request(`/kapt/complex?${new URLSearchParams({ catalogId: candidate.catalogId })}`, { signal }), candidate.catalogId),
    signIn: async () => { if (memberAccess) { live(); return (await memberAccess()).signInMember(); } await initSession(); return session.signIn(); },
    signOut: async () => { await initSession(); return session.signOut(); },
    getSessionState: () => session.getState(), subscribeSession: listener => { const unsubscribe = session.subscribe(listener); initSession().catch(() => {}); return unsubscribe; },
    backupRecords, restoreRecords, getWecostTarget: () => wecost.refresh(),
    destroy() { if (retired) return; retired = true; lifetime.abort(); wecost.cancel(); session.destroy?.(); },
  });
}

const services = createServices();
export const { loadCatalog, loadPublicData, getConnectionState, searchCandidates, fetchHistory, searchPlaces,
  verifyCommute, getQuota, geocodeAddress, fetchFacilities, signIn, signOut, getSessionState, subscribeSession,
  backupRecords, restoreRecords, getWecostTarget } = services;
export const destroyServices = () => services.destroy();
