import { createHash } from 'node:crypto';
import { ApiError } from './auth-gate.mjs';

export function createApiRateLimit({ db, now = Date.now }) {
  return async (context, path, method) => {
    if (method === 'GET' && ['/health', '/commute/quota', '/household/snapshot'].includes(path)) return;
    const minute = Math.floor(now() / 60000);
    const kind = path === '/recommendations' ? 'create' : path === '/apartment-history' ? 'history'
      : path === '/kapt/complex' && method === 'GET' ? 'facility' : 'other';
    // A normal price result can contain 579 already-cached facilities. Keep
    // their bounded read queue separate from job polling and route controls.
    const limit = kind === 'create' ? 3 : kind === 'history' ? 6 : kind === 'facility' ? 900 : 60;
    const key = createHash('sha256').update(`${context.householdId}|${kind}|${minute}`).digest('hex');
    const ref = db.doc(`homehunt_request_limits/${key}`);
    await db.runTransaction(async tx => {
      const used = (await tx.get(ref)).data()?.used || 0;
      if (!Number.isSafeInteger(used) || used < 0 || used >= limit) throw new ApiError('REQUEST_LIMIT', '잠시 후 다시 시도해주세요.', 429);
      tx.set(ref, { used: used + 1, expiresAt: new Date((minute + 120) * 60000) });
    });
  };
}
