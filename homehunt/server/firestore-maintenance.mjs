import { randomUUID } from 'node:crypto';

export const MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const MAINTENANCE_COLLECTION = 'homehunt_maintenance';
export const MAINTENANCE_MAX_READS = 500;
export const MAINTENANCE_MAX_DELETES = 250;
const DAY = 86_400_000;
const HOUR = 3_600_000;
// Explicit server-only collections; no collection-group queries or recursive
// deletion. Personal backups, memberships and household records are excluded.
const TARGETS = Object.freeze([
  { name: 'homehunt_jobs', chunks: true, graceMs: HOUR },
  { name: 'homehunt_request_limits' },
  { name: 'homehunt_kapt_source_cache' },
  { name: 'homehunt_route_cache' },
  { name: 'homehunt_molit_month_cache', chunks: true },
  { name: 'homehunt_provider_usage', quota: true },
]);
const epoch = value => value instanceof Date ? value.getTime() : typeof value?.toMillis === 'function'
  ? value.toMillis() : typeof value === 'number' ? value : NaN;
const kstDay = time => new Date(time + 9 * HOUR).toISOString().slice(0, 10);

function eligible(target, id, value, current) {
  if (!value || !Number.isFinite(epoch(value.expiresAt)) || epoch(value.expiresAt) > current - (target.graceMs || 0)) return false;
  if (epoch(value.lease?.until) > current || Number(value.leaseUntil) > current) return false;
  if (target.quota) {
    // Even a mistaken expiration must not reset today's or yesterday's usage.
    // Require the canonical provider/day identity and retain corrupt ledgers.
    const date = String(value.date || '');
    if (value.schemaVersion !== 1 || !['kakao-transit', 'tmap-transit'].includes(value.provider)
      || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
      || id !== `${value.provider}_${date}` || date >= kstDay(current - DAY)
      || !Number.isSafeInteger(value.used) || value.used < 0) return false;
  }
  return true;
}

/** Spark-compatible cleanup using ordinary bounded reads/deletes, not managed
 * TTL. Startup/periodic callers share one schedule in Firestore across process
 * restarts. This limits maintenance work; it is not a total storage/quota cap.
 */
export function createFirestoreMaintenance({ db, now = Date.now, idFactory = randomUUID,
  intervalMs = MAINTENANCE_INTERVAL_MS, maxReads = MAINTENANCE_MAX_READS,
  maxDeletes = MAINTENANCE_MAX_DELETES } = {}) {
  if (typeof db?.collection !== 'function' || typeof db?.runTransaction !== 'function') throw new TypeError('Firestore is required');
  if (!Number.isSafeInteger(intervalMs) || intervalMs < MAINTENANCE_INTERVAL_MS
    || !Number.isSafeInteger(maxReads) || maxReads < 10 || maxReads > MAINTENANCE_MAX_READS
    || !Number.isSafeInteger(maxDeletes) || maxDeletes < 1 || maxDeletes > MAINTENANCE_MAX_DELETES) throw new RangeError('Invalid maintenance bounds');
  const control = db.collection(MAINTENANCE_COLLECTION).doc('bounded-cleanup-v1');
  let localNextRun = 0, inflight = null;
  async function run() {
    const current = now();
    if (!Number.isFinite(current)) return { ok: false, code: 'MAINTENANCE_CLOCK_INVALID' };
    if (current < localNextRun) return { ok: true, skipped: true };
    const owner = idFactory();
    const stats = { reads: 0, deletes: 0, writes: 0, queries: 0, collections: {} };
    try {
      const claim = await db.runTransaction(async tx => {
        stats.reads++;
        const previous = (await tx.get(control)).data();
        if (epoch(previous?.nextRunAt) > current) return { due: false, next: epoch(previous.nextRunAt) };
        // Commit the next allowed run before deleting anything. A crashed run
        // cannot trigger an unbounded restart loop of cleanup transactions.
        const next = current + intervalMs;
        const cursor = Number.isSafeInteger(previous?.cursor) ? previous.cursor % TARGETS.length : 0;
        tx.set(control, { schemaVersion: 1, owner, nextRunAt: new Date(next),
          startedAt: new Date(current), cursor: (cursor + 1) % TARGETS.length });
        stats.writes++;
        return { due: true, next, cursor };
      }, { maxAttempts: 1 });
      localNextRun = claim.next;
      if (!claim.due) return { ok: true, skipped: true, ...stats };
      const targets = [...TARGETS.slice(claim.cursor), ...TARGETS.slice(0, claim.cursor)];
      for (const target of targets) {
        // Reserve one read for the final shared summary. Limit queries at the
        // server, and retain headroom to reread candidate parents in a txn.
        const limit = Math.min(25, Math.floor((maxReads - stats.reads - 1) / 2));
        if (limit < 1 || stats.deletes >= maxDeletes) break;
        const candidates = await db.collection(target.name)
          .where('expiresAt', '<=', new Date(current - (target.graceMs || 0)))
          .orderBy('expiresAt').limit(limit).get();
        stats.queries++;
        stats.reads += Math.max(1, candidates.docs.length);
        for (const candidate of candidates.docs) {
          if (stats.reads + 2 > maxReads || stats.deletes >= maxDeletes) break;
          if (!eligible(target, candidate.id, candidate.data(), current)) continue;
          const removed = await db.runTransaction(async tx => {
            stats.reads++;
            const latest = await tx.get(candidate.ref);
            if (!latest.exists || !eligible(target, candidate.id, latest.data(), now())) return 0;
            let children = [];
            let complete = true;
            if (target.chunks) {
              const childLimit = Math.min(64, maxReads - stats.reads - 1, maxDeletes - stats.deletes);
              if (childLimit < 1) return 0;
              const chunks = await tx.get(candidate.ref.collection('chunks').limit(childLimit));
              stats.queries++;
              stats.reads += Math.max(1, chunks.docs.length);
              children = chunks.docs;
              complete = children.length < childLimit;
            }
            // A concurrent refresh updates this parent, so transaction conflict
            // prevents deleting its new chunks. An expired job is not resumable.
            for (const child of children) tx.delete(child.ref);
            const deleteParent = complete && children.length < maxDeletes - stats.deletes;
            if (deleteParent) tx.delete(candidate.ref);
            return children.length + Number(deleteParent);
          }, { maxAttempts: 1 });
          stats.deletes += removed;
          stats.collections[target.name] = (stats.collections[target.name] || 0) + removed;
        }
      }
      if (stats.reads < maxReads) await db.runTransaction(async tx => {
        stats.reads++;
        const saved = (await tx.get(control)).data();
        if (saved?.owner !== owner) return;
        tx.set(control, { ...saved, finishedAt: new Date(now()),
          lastRun: { reads: stats.reads, deletes: stats.deletes, queries: stats.queries } });
        stats.writes++;
      }, { maxAttempts: 1 });
      return { ok: true, skipped: false, ...stats };
    } catch {
      // No raw exception text, credentials, doc names or partial source data
      // are returned/logged. Keep the last confirmed daily ledger untouched.
      localNextRun = Math.max(localNextRun, current + 5 * 60_000);
      return { ok: false, code: 'MAINTENANCE_UNAVAILABLE', ...stats };
    }
  }
  return Object.freeze({
    runIfDue() {
      if (inflight) return inflight;
      const operation = run();
      inflight = operation;
      return operation.finally(() => { if (inflight === operation) inflight = null; });
    },
  });
}
