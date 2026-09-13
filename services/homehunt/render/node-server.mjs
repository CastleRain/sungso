import { createServer } from 'node:http';
const MAX_BODY_BYTES = 750 * 1024;
const ALLOWED_ORIGINS = new Set(['https://castlerain.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000']);
const failure = (res, status, code, error) => {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify({ ok: false, code, error }));
};
async function readBody(req) {
  if (Number(req.headers['content-length'] || 0) > MAX_BODY_BYTES) throw new RangeError('BODY_TOO_LARGE');
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    const cleanup = () => { req.off('data', data); req.off('end', end); req.off('error', error); req.off('aborted', error); };
    const error = () => { cleanup(); reject(new Error('BODY_UNAVAILABLE')); };
    const end = () => { cleanup(); resolve(Buffer.concat(chunks)); };
    const data = chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { cleanup(); req.resume(); reject(new RangeError('BODY_TOO_LARGE')); }
      else chunks.push(chunk);
    };
    req.on('data', data); req.on('end', end); req.on('error', error); req.on('aborted', error);
  });
}
/** Node adapter; liveness proves the process is awake, never API access. */
export function createRenderServer({ api, maxActiveRequests = 2, maxQueuedRequests = 8 } = {}) {
  if (typeof api !== 'function') throw new TypeError('An API handler is required');
  if (!Number.isSafeInteger(maxActiveRequests) || maxActiveRequests < 1
    || !Number.isSafeInteger(maxQueuedRequests) || maxQueuedRequests < 0) throw new RangeError('Invalid request limits');
  let active = 0, activeHeavy = 0;
  const waiting = [];
  const available = heavy => active < maxActiveRequests && (!heavy || activeHeavy < 1);
  const reserve = heavy => { active++; if (heavy) activeHeavy++; };
  const acquire = async heavy => {
    if (available(heavy)) { reserve(heavy); return true; }
    if (waiting.length >= maxQueuedRequests) return false;
    await new Promise(resolve => waiting.push({ resolve, heavy }));
    return true;
  };
  const release = heavy => {
    active--; if (heavy) activeHeavy--;
    for (let index = 0; index < waiting.length && active < maxActiveRequests;) {
      const next = waiting[index];
      if (!available(next.heavy)) { index++; continue; }
      waiting.splice(index, 1); reserve(next.heavy); next.resolve();
    }
  };
  const server = createServer(async (req, res) => {
    const origin = String(req.headers.origin || '');
    res.setHeader('Vary', 'Origin');
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      req.resume(); return failure(res, 403, 'ORIGIN_DENIED', '허용되지 않은 페이지입니다.');
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    let pathname;
    try { pathname = new URL(req.url, 'http://homehunt.invalid').pathname; }
    catch { req.resume(); return failure(res, 400, 'INVALID_URL', '요청 주소를 확인해주세요.'); }
    if (pathname === '/healthz' && ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      req.resume();
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' });
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(req.method === 'HEAD' ? undefined : '{"ok":true}');
    }
    if (!(pathname === '/api' || pathname.startsWith('/api/'))) {
      req.resume(); return failure(res, 404, 'NOT_FOUND', '지원하지 않는 요청입니다.');
    }
    let rawBody;
    try { rawBody = await readBody(req); }
    catch (error) {
      req.resume();
      return failure(res, error instanceof RangeError ? 413 : 400,
        error instanceof RangeError ? 'BODY_TOO_LARGE' : 'INVALID_BODY', '요청 자료를 확인해주세요.');
    }
    // A single 512MiB free process must not decompress two large price jobs
    // at once; small facility/commute requests can use the other active slot.
    const heavy = pathname === '/api/apartment-history' || /^\/api\/recommendations(?:\/|$)/.test(pathname);
    if (!await acquire(heavy)) {
      res.setHeader('Retry-After', '2');
      return failure(res, 503, 'SERVER_BUSY', '현재 조회가 많습니다. 잠시 후 다시 시도해주세요.');
    }
    try {
      if (req.aborted || res.destroyed) return;
      req.rawBody = rawBody;
      req.body = rawBody.length ? rawBody : {};
      res.status = status => { res.statusCode = status; return res; };
      res.json = value => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); return res; };
      await api(req, res);
    } catch { failure(res, 503, 'SERVICE_UNAVAILABLE', '서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'); }
    finally { release(heavy); }
  });
  // requestTimeout limits upload receipt, not long-running response work.
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.timeout = 0;
  return server;
}
