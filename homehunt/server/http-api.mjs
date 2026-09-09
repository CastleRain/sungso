import { ApiError } from './auth-gate.mjs';
import { RecommendationJobError } from './recommendation-jobs.mjs';
import { CloudSnapshotError } from '../js/cloud-snapshot-core.mjs';
import { CloudCommuteError } from './commute-service.mjs';

const DEFAULT_ORIGINS = ['https://castlerain.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
// Upstream and database exceptions often also carry status/httpStatus. Those
// properties never make their message (which can contain credentials) public.
const knownError = error => error instanceof ApiError || error instanceof RecommendationJobError
  || error instanceof CloudSnapshotError || error instanceof CloudCommuteError;

/** Platform-neutral authenticated handler: Firebase Functions and Vercel. */
export function createHomehuntApi({ authenticate, jobs, household, commute, health, history, places, officialComplex, rateLimit = async () => {}, origins = DEFAULT_ORIGINS }) {
  const allowed = new Set(origins);
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    const origin = String(req.headers?.origin || '');
    const send = (status, body) => res.status(status).json(body);
    if (origin && !allowed.has(origin)) return send(403, { ok: false, code: 'ORIGIN_DENIED', error: '허용되지 않은 페이지입니다.' });
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    try {
      const context = await authenticate(req);
      const url = new URL(req.url, 'https://homehunt.invalid');
      const path = url.pathname.replace(/^\/api(?=\/|$)/, '');
      const contentLength = Number(req.headers?.['content-length'] || 0);
      const maxBytes = path === '/household/snapshot' ? 750 * 1024 : 32 * 1024;
      if (contentLength > maxBytes || (req.rawBody && req.rawBody.length > maxBytes)) throw new ApiError('BODY_TOO_LARGE', '요청 자료가 너무 큽니다.', 413);
      let body = req.body === undefined ? {} : req.body;
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        if (Buffer.byteLength(body) > maxBytes) throw new ApiError('BODY_TOO_LARGE', '요청 자료가 너무 큽니다.', 413);
        try { body = JSON.parse(body); } catch { throw new ApiError('INVALID_JSON', '요청 형식을 확인해주세요.'); }
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('INVALID_JSON', '요청 형식을 확인해주세요.');
      // Firebase/Vercel may hand us already-parsed JSON without rawBody or a
      // Content-Length header. Bound that path too before invoking providers.
      let serialized;
      try { serialized = JSON.stringify(body); } catch { throw new ApiError('INVALID_JSON', '요청 형식을 확인해주세요.'); }
      if (typeof serialized !== 'string') throw new ApiError('INVALID_JSON', '요청 형식을 확인해주세요.');
      if (Buffer.byteLength(serialized) > maxBytes) throw new ApiError('BODY_TOO_LARGE', '요청 자료가 너무 큽니다.', 413);
      // An authenticated account is still subject to server-wide cost limits.
      await rateLimit(context, path, req.method);
      if (path === '/health' && req.method === 'GET') return send(200, await health(context));
      if (path === '/household/snapshot' && req.method === 'GET') return send(200, await household.load(context));
      if (path === '/household/snapshot' && req.method === 'PUT') return send(200, await household.save(body.snapshot, body.expectedRevision, context));
      if (path === '/recommendations' && req.method === 'POST') return send(202, await jobs.create(body, context));
      if (path === '/recommendations/recent' && req.method === 'GET') return send(200, await jobs.recent(context));
      const job = /^\/recommendations\/([a-zA-Z0-9_-]{1,128})(\/advance|\/retry)?$/.exec(path);
      if (job) {
        if (!job[2] && req.method === 'GET') return send(200, await jobs.get(job[1], context));
        if (job[2] === '/advance' && req.method === 'POST') return send(200, await jobs.advance(job[1], context));
        if (job[2] === '/retry' && req.method === 'POST') return send(202, await jobs.retry(job[1], context));
        if (!job[2] && req.method === 'DELETE') return send(200, await jobs.cancel(job[1], context));
      }
      if (path === '/commute/quota' && req.method === 'GET') return send(200, await commute.quota());
      if (path === '/commute' && req.method === 'POST') return send(200, await commute.single(body));
      if (path === '/commute/batch' && req.method === 'POST') return send(200, await commute.batch(body));
      if (path === '/apartment-history' && req.method === 'GET') return send(200, await history(Object.fromEntries(url.searchParams)));
      if (path === '/place-search' && req.method === 'GET') return send(200, await places(url.searchParams.get('query')));
      if (path === '/kapt/complex' && req.method === 'GET') {
        if (!officialComplex) throw new ApiError('KAPT_NOT_CONFIGURED', '공식 시설정보 연결이 필요합니다.', 503);
        return send(200, await officialComplex(Object.fromEntries(url.searchParams)));
      }
      return send(404, { ok: false, code: 'NOT_FOUND', error: '지원하지 않는 요청입니다.' });
    } catch (error) {
      // Provider errors can include URLs/credentials. Only our typed errors have
      // user-facing text; raw database/upstream exception messages stay private.
      const trusted = knownError(error);
      const status = trusted ? Math.min(599, Math.max(400, Number(error.status || error.httpStatus))) : 503;
      return send(status, {
        ok: false, code: trusted ? error.code || 'REQUEST_FAILED' : 'SERVICE_UNAVAILABLE',
        error: trusted ? error.message : '서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.',
        ...(error instanceof CloudSnapshotError && error.code === 'CLOUD_SNAPSHOT_CONFLICT'
          && Number.isSafeInteger(error.currentRevision) ? { currentRevision: error.currentRevision } : {}),
      });
    }
  };
}
