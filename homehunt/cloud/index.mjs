import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { createAuthGate, ApiError } from '../server/auth-gate.mjs';
import { createApiRateLimit } from '../server/api-rate-limit.mjs';
import { createHomehuntApi } from '../server/http-api.mjs';
import { createRecommendationJobService } from '../server/recommendation-jobs.mjs';
import { createHouseholdStore } from '../server/household-store.mjs';
import { createCloudCommuteService } from '../server/commute-service.mjs';
import { createCloudKaptService } from '../server/kapt-service.mjs';
import { fetchNaverLocalSearch } from '../scripts/naver-local-search.mjs';
import molit from '../../functions/molit.js';

// One secret contains only explicitly deployed provider configuration. The
// deployment package never includes the repo's .env, .local, or personal data.
const providerSettings = defineSecret('HOMEHUNT_PROVIDER_CONFIG');
initializeApp();
let handler;
function api() {
  if (handler) return handler;
  const db = getFirestore();
  const env = JSON.parse(providerSettings.value());
  const catalogPromise = readFile(path.join(__dirname, 'catalog.json'), 'utf8').then(JSON.parse);
  const loadCatalog = () => catalogPromise;
  // This loader preserves the request identity and AbortSignal. The job safety
  // gate rejects missing identity, partial data and stale monthly fallbacks.
  const loadMonth = request => molit.loadMolitMonthWithFirestoreCache({ ...request, db, serviceKey: env.MOLIT_SERVICE_KEY });
  const commute = createCloudCommuteService({ db, env });
  const kapt = createCloudKaptService({ db, env, loadCatalog });
  handler = createHomehuntApi({
    authenticate: createAuthGate({ auth: getAuth(), db }),
    rateLimit: createApiRateLimit({ db }),
    jobs: createRecommendationJobService({ db, loadCatalog, loadMonth }),
    household: createHouseholdStore({ db }), commute,
    officialComplex: kapt.complex,
    health: async () => {
      const quota = await commute.quota();
      const catalog = await loadCatalog();
      return { ok: true, version: '2.9.0', runtime: 'firebase', keyConfigured: Boolean(env.MOLIT_SERVICE_KEY), keySource: 'secret-manager',
        officialComplex: kapt.configuration(),
        commute: { ...commute.configuration(), kakaoQuota: quota.kakao, tmapQuota: quota.tmap },
        placeSearch: { configured: Boolean(env.NAVER_LOCAL_SEARCH_CLIENT_ID && env.NAVER_LOCAL_SEARCH_CLIENT_SECRET) },
        scope: '서울·경기', catalogCount: catalog.apartments?.length || 0,
        limits: { historyMonthsMax: 60, commuteCandidatesPerSearch: 10, kakaoUpstreamCallsPerBatch: 30 } };
    },
    history: async query => {
      if (!/^(11|41)\d{3}$/.test(String(query.lawdCd)) || String(query.aptName || '').length < 2
        || String(query.aptName || '').length > 60) throw new ApiError('INVALID_HISTORY_QUERY', '서울·경기 단지와 지역을 확인해주세요.');
      // A large history may contain 120 monthly requests. Stop the shared work
      // before the function deadline and return any completed months as partial.
      const signal = AbortSignal.timeout(240000);
      return molit.fetchApartmentHistoryDirect({ ...query, serviceKey: env.MOLIT_SERVICE_KEY,
        months: Math.max(1, Math.min(60, Number(query.months) || 12)),
        includeCurrentMonth: query.includeCurrentMonth !== 'false', concurrency: 4,
        monthLoader: request => loadMonth({ ...request, signal }) });
    },
    places: async raw => {
      const query = String(raw || '').normalize('NFKC').trim();
      if (query.length < 2 || query.length > 100 || /[\x00-\x1f]/.test(query)) throw new ApiError('INVALID_PLACE_QUERY', '검색어는 2~100자로 입력해주세요.');
      if (!env.NAVER_LOCAL_SEARCH_CLIENT_ID || !env.NAVER_LOCAL_SEARCH_CLIENT_SECRET) throw new ApiError('PLACE_SEARCH_NOT_CONFIGURED', '회사명 검색 연결이 필요합니다.', 503);
      const items = await fetchNaverLocalSearch({ query, clientId: env.NAVER_LOCAL_SEARCH_CLIENT_ID, clientSecret: env.NAVER_LOCAL_SEARCH_CLIENT_SECRET });
      return { ok: true, query, items, source: 'naver-developers-local', cachedInMemory: false };
    },
  });
  return handler;
}

export const homehuntApi = onRequest({ region: 'asia-northeast3', timeoutSeconds: 540,
  memory: '512MiB', minInstances: 0, maxInstances: 2, concurrency: 1,
  secrets: [providerSettings], invoker: 'public' }, (req, res) => api()(req, res));
