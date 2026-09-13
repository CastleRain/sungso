import { randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createKaptProvider, KaptProviderError } from '../scripts/kapt-provider.mjs';
import { ApiError } from './auth-gate.mjs';

export const KAPT_CACHE_COLLECTION = 'homehunt_kapt_source_cache';
const VALID_KEY = /^(?:list-(?:11|41)\d{3}|(?:basic|detail)-[A-Za-z0-9]{4,30})$/;
const MAX_SOURCE_BYTES = 8_000_000;
const MAX_DOCUMENT_BYTES = 800_000;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

// A single complete district list can exceed Firestore's document limit before
// compression. Bound both stored bytes and decompression; provider validation
// still verifies every allowlisted row and its original evidence timestamps.
function unpack(value, validate) {
  if (value?.state !== 'ready' || value.schemaVersion !== 1 || typeof value.payload !== 'string'
    || value.payload.length > MAX_DOCUMENT_BYTES) return null;
  try {
    return validate(JSON.parse(gunzipSync(Buffer.from(value.payload, 'base64'),
      { maxOutputLength: MAX_SOURCE_BYTES }).toString('utf8')));
  } catch { return null; }
}

/** Admin-only shared public-source cache. A transactional lease coalesces cold
 * requests across instances; a crashed owner expires without stale promotion.
 * No authentication identity, company address, or commute result is persisted.
 */
export function createFirestoreKaptCache({ db, now = Date.now, sleep = pause,
  leaseMs = 330_000, waitMs = 40_000, idFactory = randomUUID } = {}) {
  if (typeof db?.collection !== 'function' || typeof db?.runTransaction !== 'function') throw new TypeError('Firestore is required');
  if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0 || !Number.isSafeInteger(waitMs) || waitMs < 0) throw new RangeError('Invalid cache lease');
  const inflight = new Map();
  async function loadShared({ key, load, validate }) {
    if (!VALID_KEY.test(key) || typeof validate !== 'function' || typeof load !== 'function') throw new KaptProviderError('INVALID_CATALOG');
    const ref = db.collection(KAPT_CACHE_COLLECTION).doc(key);
    const owner = idFactory();
    const deadline = performance.now() + waitMs;
    let backoff = 250;
    for (;;) {
      const decision = await db.runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        const entry = unpack(current, validate);
        if (entry) return { entry, hit: true };
        if (current?.retryAt > now()) throw new KaptProviderError('UPSTREAM_ERROR');
        if (current?.state === 'loading' && current.leaseUntil > now()) return null;
        tx.set(ref, { schemaVersion: 1, state: 'loading', owner, leaseUntil: now() + leaseMs,
          expiresAt: new Date(now() + leaseMs) });
        return { owned: true };
      });
      if (decision?.entry) return decision;
      if (decision?.owned) break;
      if (performance.now() >= deadline) throw new KaptProviderError('TIMEOUT');
      await sleep(Math.min(backoff, Math.max(1, deadline - performance.now())));
      backoff = Math.min(backoff * 2, 2000);
    }
    try {
      const entry = validate(await load());
      if (!entry) throw new KaptProviderError('INVALID_RESPONSE');
      const source = JSON.stringify(entry);
      if (Buffer.byteLength(source) > MAX_SOURCE_BYTES) throw new KaptProviderError('INVALID_RESPONSE');
      const payload = gzipSync(source).toString('base64');
      if (payload.length > MAX_DOCUMENT_BYTES) throw new KaptProviderError('INVALID_RESPONSE');
      await db.runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        if (current?.state === 'loading' && current.owner === owner) tx.set(ref, {
          schemaVersion: 1, state: 'ready', payload, expiresAt: new Date(entry.expiresAt),
        });
      });
      return { entry, hit: false };
    } catch (error) {
      // A failed upstream call is not cached as an empty official list. A short
      // shared cooldown prevents other instances immediately repeating it.
      try {
        await db.runTransaction(async tx => {
          const current = (await tx.get(ref)).data();
          if (current?.state === 'loading' && current.owner === owner) tx.set(ref, {
            schemaVersion: 1, state: 'failed', retryAt: now() + 30_000, expiresAt: new Date(now() + 30_000),
          });
        });
      } catch { /* No raw database message may escape the provider boundary. */ }
      throw error;
    }
  }
  return Object.freeze({
    async getOrLoad(request) {
      if (inflight.has(request.key)) return inflight.get(request.key);
      const pending = loadShared(request);
      inflight.set(request.key, pending);
      try { return await pending; }
      finally { if (inflight.get(request.key) === pending) inflight.delete(request.key); }
    },
  });
}

export function createCloudKaptService({ db, loadCatalog, env = {}, fetchImpl = globalThis.fetch,
  now = Date.now, minRequestGapMs = 400, cacheOptions = {} } = {}) {
  const configured = Boolean(env.MOLIT_SERVICE_KEY || env.DATA_GO_KR_SERVICE_KEY);
  const provider = createKaptProvider({ apiKey: env.MOLIT_SERVICE_KEY || env.DATA_GO_KR_SERVICE_KEY,
    fetchImpl, now, persistentCache: createFirestoreKaptCache({ ...cacheOptions, db, now }),
    // Deployment caps instances at two; each instance permits one upstream
    // request at a time. Source leases suppress duplicates across both.
    maxConcurrency: 1, minRequestGapMs });
  let diagnostic = null;
  let catalogIndex;
  const inflight = new Map();
  async function complex(query) {
    const catalogId = String(query?.catalogId || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(catalogId)) throw new ApiError('INVALID_CATALOG_ID', '공식 단지를 선택해주세요.');
    if (!catalogIndex) {
      const catalog = await loadCatalog();
      catalogIndex = new Map((catalog.apartments || []).map(row => [String(row.catalogId), row]));
    }
    const candidate = catalogIndex.get(catalogId);
    if (!candidate) throw new ApiError('CATALOG_NOT_FOUND', '공식 목록에서 단지를 찾지 못했습니다.', 404);
    // Only the server-owned official catalog supplies names, phases, addresses,
    // households and legal-area identities. Client K-apt codes are ignored.
    if (inflight.has(catalogId)) return inflight.get(catalogId);
    const operation = (async () => {
      try {
        const result = await provider.getComplexInfo(candidate);
        diagnostic = { state: result.status, checkedAt: new Date(now()).toISOString(),
          codes: result.errors.map(error => error.code) };
        return { ok: true, ...result };
      } catch {
        diagnostic = { state: 'unavailable', checkedAt: new Date(now()).toISOString(), codes: ['UPSTREAM_ERROR'] };
        throw new ApiError('KAPT_UNAVAILABLE', '공식 단지정보를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.', 502);
      }
    })();
    inflight.set(catalogId, operation);
    try { return await operation; }
    finally { if (inflight.get(catalogId) === operation) inflight.delete(catalogId); }
  }
  return Object.freeze({ complex, configuration: () => ({ configured, provider: 'kapt',
    diagnostic, cache: 'public-list-7-days/detail-1-day', storage: 'firestore-public-source', stats: provider.getStats() }) });
}
