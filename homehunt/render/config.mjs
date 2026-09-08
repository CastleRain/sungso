const PROVIDER_FIELDS = ['MOLIT_SERVICE_KEY', 'DATA_GO_KR_SERVICE_KEY', 'KAKAO_REST_API_KEY', 'TMAP_APP_KEY',
  'TRANSIT_PROVIDER', 'NAVER_MAPS_CLIENT_ID', 'NAVER_MAPS_CLIENT_SECRET',
  'NAVER_LOCAL_SEARCH_CLIENT_ID', 'NAVER_LOCAL_SEARCH_CLIENT_SECRET', 'KAKAO_DAILY_LIMIT', 'TMAP_DAILY_LIMIT'];
function objectJson(value, message) {
  try { const parsed = JSON.parse(value); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed; }
  catch { /* JSON parse errors can contain secret material. */ }
  throw new Error(message);
}
/** Environment-only secrets; never reads repository .env files. */
export function readRenderConfiguration(env = process.env) {
  const serviceAccount = objectJson(env.FIREBASE_SERVICE_ACCOUNT_JSON, 'Firebase 서버 인증 설정이 필요합니다.');
  const projectId = String(env.FIREBASE_PROJECT_ID || serviceAccount.project_id || '');
  if (serviceAccount.type !== 'service_account' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)
    || serviceAccount.project_id !== projectId || typeof serviceAccount.client_email !== 'string'
    || !serviceAccount.client_email.endsWith('.iam.gserviceaccount.com')
    || typeof serviceAccount.private_key !== 'string' || !serviceAccount.private_key.includes('BEGIN PRIVATE KEY')) {
    throw new Error('Firebase 서버 인증 설정을 확인해주세요.');
  }
  const raw = objectJson(env.HOMEHUNT_PROVIDER_CONFIG, 'HomeHunt 공급자 설정이 필요합니다.');
  const providers = {};
  for (const field of PROVIDER_FIELDS) {
    if (raw[field] === undefined) continue;
    if (!['string', 'number'].includes(typeof raw[field])) throw new Error('HomeHunt 공급자 설정을 확인해주세요.');
    providers[field] = raw[field];
  }
  if (!providers.MOLIT_SERVICE_KEY && providers.DATA_GO_KR_SERVICE_KEY) providers.MOLIT_SERVICE_KEY = providers.DATA_GO_KR_SERVICE_KEY;
  const port = env.PORT === undefined ? 10000 : Number(env.PORT);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('서버 포트 설정을 확인해주세요.');
  return { projectId, serviceAccount, providers, port };
}
