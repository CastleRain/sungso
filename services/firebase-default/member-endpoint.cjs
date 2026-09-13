const { createSiteMemberGate } = require('../homehunt/server/site-members.cjs');

function protectMemberEndpoint(handler, { auth, db }) {
  const authenticate = createSiteMemberGate({ auth, db });
  return async (req, res) => {
    const origin = String(req.headers?.origin || req.get?.('origin') || '');
    const allowed = origin === 'https://castlerain.github.io'
      || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    res.set('Cache-Control', 'private, no-store');
    res.set('Vary', 'Origin');
    if (allowed) res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (origin && !allowed) return res.status(403).json({ code: 'ORIGIN_DENIED', error: 'Origin not allowed' });
    if (req.method === 'OPTIONS') return allowed ? res.status(204).send('') : res.status(403).send('');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    try { await authenticate(req); }
    catch (error) { return res.status(error.status || 503).json({ code: error.code || 'MEMBERSHIP_UNAVAILABLE', error: error.message }); }
    // Authentication occurs before any handler cache/limit/provider operation.
    return handler(req, res);
  };
}

module.exports = { protectMemberEndpoint };
