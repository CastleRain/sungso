export const PROVIDER_QUOTA_COLLECTION = 'homehunt_provider_usage';
export const PROVIDER_QUOTA_LIMITS = Object.freeze({ 'kakao-transit': 1000, 'tmap-transit': 10 });
const HOUR_MS = 60 * 60 * 1000;
const canonicalProvider = value => ({ kakao: 'kakao-transit', tmap: 'tmap-transit' }[value] || value);

function quotaError(provider, code) {
  const error = new Error(code === 'DAILY_LIMIT' ? 'Daily upstream call limit reached' : 'Provider quota ledger unavailable');
  error.name = 'ProviderQuotaError';
  error.provider = provider;
  error.code = code;
  return error;
}

function nonnegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer`);
  return value;
}

/** A single transaction-backed KST day ledger shared by every server instance. */
export function createFirestoreProviderQuota({ db, now = Date.now, limits = {} } = {}) {
  if (typeof db?.collection !== 'function' || typeof db?.runTransaction !== 'function' || typeof now !== 'function') {
    throw new TypeError('Transactional Firestore and a clock are required');
  }
  const configured = { ...PROVIDER_QUOTA_LIMITS };
  for (const [name, limit] of Object.entries(limits)) {
    const provider = canonicalProvider(name);
    if (!Object.hasOwn(configured, provider)) throw new TypeError('Unsupported quota provider');
    configured[provider] = nonnegativeInteger(limit, 'limit');
  }
  function context(name) {
    const provider = canonicalProvider(name);
    if (!Object.hasOwn(configured, provider)) throw new TypeError('Unsupported quota provider');
    const current = now();
    if (!Number.isFinite(current)) throw new TypeError('Invalid quota clock');
    const date = new Date(current + 9 * HOUR_MS).toISOString().slice(0, 10);
    return { provider, date, current, ref: db.collection(PROVIDER_QUOTA_COLLECTION).doc(`${provider}_${date}`) };
  }
  function snapshot(ctx, document) {
    let used = 0;
    let updatedAt = null;
    if (document.exists) {
      const data = document.data();
      // An unreadable or mismatched ledger must never silently reset the quota.
      if (data?.schemaVersion !== 1 || data.provider !== ctx.provider || data.date !== ctx.date
          || !Number.isSafeInteger(data.used) || data.used < 0 || typeof data.updatedAt !== 'string'
          || !Number.isFinite(Date.parse(data.updatedAt))) throw quotaError(ctx.provider, 'QUOTA_LEDGER_ERROR');
      used = data.used;
      updatedAt = data.updatedAt;
    }
    const limit = configured[ctx.provider];
    return {
      provider: ctx.provider, date: ctx.date, timeZone: 'Asia/Seoul', limit, used,
      remaining: Math.max(0, limit - used),
      resetAt: new Date(Date.parse(`${ctx.date}T00:00:00+09:00`) + 24 * HOUR_MS).toISOString(), updatedAt,
    };
  }
  return Object.freeze({
    async getUsage(name) {
      const ctx = context(name);
      try { return snapshot(ctx, await ctx.ref.get()); }
      catch { throw quotaError(ctx.provider, 'QUOTA_LEDGER_ERROR'); }
    },
    async reserve(name, count = 1) {
      const amount = nonnegativeInteger(count, 'count');
      const ctx = context(name);
      try {
        return await db.runTransaction(async transaction => {
          // Transactions may be retried after KST midnight under contention.
          // Resolve the day within each attempt, never from the initial call.
          const attempt = context(name);
          const usage = snapshot(attempt, await transaction.get(attempt.ref));
          if (amount > usage.remaining) throw quotaError(attempt.provider, 'DAILY_LIMIT');
          if (!amount) return usage;
          const updatedAt = new Date(attempt.current).toISOString();
          const used = usage.used + amount;
          transaction.set(attempt.ref, { schemaVersion: 1, provider: attempt.provider, date: attempt.date, used, updatedAt,
            // Ordinary bounded housekeeping may remove this old daily ledger;
            // current and previous KST days are additionally protected there.
            expiresAt: new Date(Date.parse(`${attempt.date}T00:00:00+09:00`) + 7 * 24 * HOUR_MS) });
          return { ...usage, used, remaining: Math.max(0, usage.limit - used), updatedAt };
        });
      } catch (error) {
        if (error?.code === 'DAILY_LIMIT') throw error;
        throw quotaError(ctx.provider, 'QUOTA_LEDGER_ERROR');
      }
    },
  });
}
