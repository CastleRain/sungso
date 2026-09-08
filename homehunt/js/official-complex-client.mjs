import { normalizeOfficialParkingEvidence } from './parking-evidence-core.mjs?v=4.9.0';

const DAY = 86400000;
const RETRY_DELAY = 300000;
const SOURCE = 'https://www.data.go.kr/data/15058453/openapi.do';
const STATUSES = ['matched', 'partial', 'unmatched', 'ambiguous', 'unavailable'];
const MATCH_ISSUES = ['combined-complex', 'household-mismatch', 'address-mismatch', 'name-mismatch', 'insufficient-identity'];
const ERROR_CODES = ['MISSING_CREDENTIAL', 'ACCESS_DENIED', 'QUOTA_EXCEEDED', 'TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE', 'UPSTREAM_ERROR', 'INCOMPLETE_LIST', 'IDENTITY_MISMATCH', 'INVALID_CATALOG', 'LOCAL_SERVER_REQUIRED'];
const text = value => typeof value === 'string' ? value.slice(0, 1000) : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;

function unavailable(catalogId, code) {
  return { schemaVersion: 1, provider: 'kapt', catalogId, status: 'unavailable', complexMatchConfirmed: false,
    sourceName: '국토교통부 K-apt 공동주택 기본·상세 정보', sourceUrl: SOURCE,
    parking: {}, parkingEvidence: null, errors: [{ code }], cache: { hit: false, expiresAt: null } };
}

export function normalizeOfficialComplexInfo(raw, catalogId) {
  if (raw?.provider !== 'kapt' || raw.schemaVersion !== 1 || String(raw.catalogId) !== String(catalogId)
    || !STATUSES.includes(raw.status)) return unavailable(catalogId, 'IDENTITY_MISMATCH');
  const matched = ['matched', 'partial'].includes(raw.status) && raw.complexMatchConfirmed === true
    && /^[A-Za-z0-9]{4,30}$/.test(raw.kaptCode || '');
  const info = { ...unavailable(catalogId, 'UPSTREAM_ERROR'), status: raw.status, complexMatchConfirmed: matched,
    matchIssue: !matched && MATCH_ISSUES.includes(raw.matchIssue) ? raw.matchIssue : null,
    relatedComplex: null,
    kaptCode: matched ? raw.kaptCode : null, matchMethod: matched ? text(raw.matchMethod) : null,
    observedAt: date(raw.observedAt), cache: { hit: raw.cache?.hit === true, expiresAt: date(raw.cache?.expiresAt) },
    errors: (Array.isArray(raw.errors) ? raw.errors : []).map(error => ({
      code: ERROR_CODES.includes(error?.code) ? error.code : 'UPSTREAM_ERROR',
      part: ['list', 'basic', 'detail'].includes(error?.part) ? error.part : null,
    })),
  };
  const related = raw.relatedComplex;
  const phases = Array.isArray(related?.phases) ? [...new Set(related.phases.filter(n => Number.isSafeInteger(n) && n > 0 && n < 100))].sort((a, b) => a - b) : [];
  if (!matched && info.matchIssue === 'combined-complex' && related?.scope === 'combined-phases'
    && /^[A-Za-z0-9]{4,30}$/.test(related.kaptCode || '') && phases.length >= 2 && phases.length <= 8 && text(related.name)) {
    info.relatedComplex = { kaptCode: related.kaptCode, name: text(related.name), scope: 'combined-phases', phases,
      scopeLabel: `${phases.join('·')}단지 통합 등록`, sourceUrl: 'https://www.data.go.kr/data/15057332/openapi.do' };
  }
  for (const key of ['name', 'address', 'roadAddress', 'heatingType', 'approvalDate', 'welfareFacilities']) info[key] = matched ? text(raw[key]) : null;
  for (const key of ['households', 'buildingCount', 'elevatorCount', 'passengerElevatorCount', 'highestFloor', 'groundEvChargers', 'undergroundEvChargers']) info[key] = matched ? count(raw[key]) : null;
  const above = matched ? count(raw.parking?.aboveGroundSpaces) : null;
  const below = matched ? count(raw.parking?.belowGroundSpaces) : null;
  // Recompute capacity and ratio from the two verified counts, not display text.
  const evidence = matched ? normalizeOfficialParkingEvidence({ complexId: info.kaptCode, householdComplexId: info.kaptCode,
    aboveGroundSpaces: above, belowGroundSpaces: below, households: info.households,
    observedAt: info.observedAt, sourceUrl: SOURCE, sourceName: info.sourceName,
  }, { expectedComplexId: info.kaptCode }) : null;
  info.parking = { aboveGroundSpaces: above, belowGroundSpaces: below,
    totalSpaces: evidence?.totalSpaces ?? null, spacesPerHousehold: evidence?.spacesPerHousehold ?? null };
  info.parkingEvidence = evidence;
  return info;
}

/** Public complex facts only: no localStorage, destinations or route evidence. */
export function createOfficialComplexClient({ url, fetchImpl = globalThis.fetch, now = Date.now, onApplied = () => {} } = {}) {
  const entries = new Map();
  const inflight = new Map();
  function isFresh(candidate) {
    const entry = entries.get(String(candidate?.catalogId || ''));
    return Boolean(entry && entry.retryAt > now());
  }
  function decorate(candidate) {
    const entry = entries.get(String(candidate.catalogId || ''));
    if (!entry) return candidate;
    if (entry.expiresAt <= now()) {
      const { officialComplexInfo, parkingEvidence, ...rest } = candidate;
      return { ...rest, ...(parkingEvidence?.sourceType === 'field' ? { parkingEvidence } : {}) };
    }
    const info = entry.info;
    return { ...candidate, officialComplexInfo: info,
      parkingEvidence: candidate.parkingEvidence?.sourceType === 'field' ? candidate.parkingEvidence : info.parkingEvidence || undefined };
  }
  async function load(candidate, { refresh = false } = {}) {
    const id = String(candidate?.catalogId || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return unavailable(id, 'INVALID_CATALOG');
    const existing = entries.get(id);
    if (existing?.retryAt > now() && (!refresh || existing.info.status === 'matched' && !existing.info.errors.length)) return existing.info;
    if (inflight.has(id)) return inflight.get(id);
    const request = (async () => {
      let info;
      if (!url) info = unavailable(id, 'LOCAL_SERVER_REQUIRED');
      else {
        try {
          const endpoint = new URL(url);
          endpoint.searchParams.set('catalogId', id);
          const response = await fetchImpl(endpoint.href, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
          info = response.ok ? normalizeOfficialComplexInfo(await response.json(), id) : unavailable(id, 'UPSTREAM_ERROR');
        } catch (error) { info = unavailable(id, error?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR'); }
      }
      const receivedAt = now();
      let expiry = Date.parse(info.cache?.expiresAt);
      if (info.status !== 'unavailable' && Number.isFinite(expiry) && expiry <= receivedAt) {
        // A slow or clock-skewed response must not extend expired facts, nor
        // become an immediately expired entry that triggers another request.
        info = unavailable(id, 'INVALID_RESPONSE');
        expiry = NaN;
      }
      const failed = info.status === 'unavailable';
      const terminal = ['unmatched', 'ambiguous'].includes(info.status) && !info.errors.length;
      // An older server may omit negative-match metadata. A completed public
      // identity check is not a network failure: retain it for one day, while
      // real failures receive only a short retry cooldown and no facility facts.
      const expiresAt = failed ? receivedAt + RETRY_DELAY : Number.isFinite(expiry)
        ? Math.min(expiry, receivedAt + DAY) : receivedAt + (terminal ? DAY : RETRY_DELAY);
      // Partial facts can remain valid while a failed detail call is eligible
      // for an explicit retry sooner. Retrying never extends their evidence TTL.
      const retryAt = failed || info.errors.length ? Math.min(expiresAt, receivedAt + RETRY_DELAY) : expiresAt;
      info = { ...info, cache: { ...info.cache, expiresAt: new Date(expiresAt).toISOString() } };
      entries.set(id, { info, expiresAt, retryAt });
      try { Promise.resolve(onApplied(info, candidate)).catch(() => {}); } catch { /* A render failure cannot invalidate a completed public lookup. */ }
      return info;
    })();
    inflight.set(id, request);
    try { return await request; } finally { inflight.delete(id); }
  }
  return { load, decorate, isFresh };
}
