import { JourneyError, fail } from './store.mjs';
export const JOURNEY_PATH = '/api/journey/v1';
export const isJourneyRoute = pathname => pathname === JOURNEY_PATH || pathname.startsWith(JOURNEY_PATH + '/');

export function createJourneyApi({ store, authenticate, now = Date.now }) {
  const rates = new Map();
  function rate(uid) {
    const time = now();
    for (const [id, value] of rates) if (time - value.at > 600000) rates.delete(id);
    if (rates.size > 100 && !rates.has(uid)) fail('SERVER_BUSY', '잠시 후 다시 시도해 주세요.', 503);
    const entry = rates.get(uid) || { at: time, count: 0 }; entry.count++; rates.set(uid, entry);
    if (entry.count > 600) fail('RATE_LIMIT', '요청이 많아요. 잠시 후 이어서 추가해 주세요.', 429);
  }
  function body(req, max = 650 * 1024) {
    if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] || ''))) fail('INVALID_BODY', '요청 형식을 확인해 주세요.', 415);
    const raw = req.rawBody ?? req.body;
    const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : typeof raw === 'string' ? raw : JSON.stringify(raw || {});
    if (Buffer.byteLength(text) > max) fail('BODY_TOO_LARGE', '한 번에 저장할 기록이 너무 많아요. 기간이나 사진 크기를 줄여 주세요.', 413);
    try { return JSON.parse(text); } catch { fail('INVALID_BODY', '요청 자료를 확인해 주세요.'); }
  }
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();
    try {
      const member = await authenticate(req); rate(member.uid);
      const url = new URL(req.url, 'http://journey.invalid'), suffix = url.pathname.slice(JOURNEY_PATH.length);
      if (req.method === 'GET' && suffix === '/months') return res.status(200).json({ ok: true, ...await store.month(url.searchParams.get('month')) });
      const day = /^\/days\/(\d{4}-\d{2}-\d{2})(\/import)?$/.exec(suffix);
      if (day) {
        if (!day[2] && req.method === 'GET') return res.status(200).json({ ok: true, day: await store.day(day[1]) });
        if (!day[2] && req.method === 'PUT') return res.status(200).json({ ok: true, ...await store.save(day[1], body(req), member.uid) });
        if (day[2] && req.method === 'POST') return res.status(200).json({ ok: true, ...await store.import(day[1], body(req), member.uid) });
        return res.status(405).json({ ok: false, error: '지원하지 않는 요청입니다.' });
      }
      if (req.method === 'POST' && suffix === '/photos') return res.status(200).json({ ok: true, ...await store.upload(body(req, 440000), member.uid) });
      const photo = /^\/photos\/([a-f0-9-]{36})$/i.exec(suffix);
      if (req.method === 'GET' && photo) {
        const bytes = await store.photo(photo[1], url.searchParams.get('size') || 'thumb');
        res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Content-Length', bytes.length); return res.status(200).end(bytes);
      }
      return res.status(404).json({ ok: false, code: 'NOT_FOUND', error: '요청한 기록을 찾지 못했어요.' });
    } catch (error) {
      const known = error instanceof JourneyError || ['AUTH_REQUIRED', 'AUTH_INVALID', 'MEMBERSHIP_REQUIRED', 'MEMBERSHIP_UNAVAILABLE'].includes(error.code);
      return res.status(known ? error.status : 503).json({ ok: false, code: known ? error.code : 'JOURNEY_UNAVAILABLE', error: known ? error.message : '기록에 연결하지 못했어요. 입력은 유지되니 잠시 후 다시 시도해 주세요.' });
    }
  };
}
