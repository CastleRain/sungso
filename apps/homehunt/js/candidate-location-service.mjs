const DEFAULT_EXACT_LIMIT = 20;
const MAX_EXACT_LIMIT = 100;
const DEFAULT_DISTRICT_LIMIT = 80;

function text(value) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
}

function key(value) { return text(value).toLowerCase(); }

function number(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function point(value, { allowCenter = false } = {}) {
  const lat = number(value?.lat ?? (allowCenter ? value?.center?.[0] : undefined));
  const lng = number(value?.lng ?? (allowCenter ? value?.center?.[1] : undefined));
  return lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    ? { lat, lng } : null;
}

function exactPoint(candidate) {
  return candidate?.locationPrecision === 'district' ? null : point(candidate);
}

function districtPoint(candidate) {
  return candidate?.locationReference?.precision === 'district' ? point(candidate.locationReference) : null;
}

function candidateDistrictKey(candidate) {
  return text(candidate?.regionCode) ? `code:${text(candidate.regionCode)}`
    : text(candidate?.regionName) ? `name:${key(candidate.regionName)}` : '';
}

function cloneCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : []).map((candidate) => ({
    ...candidate,
    ...(candidate?.locationReference && typeof candidate.locationReference === 'object'
      ? { locationReference: { ...candidate.locationReference } } : {}),
  }));
}

function boundedCount(value, fallback, maximum) {
  const parsed = number(value);
  return parsed === null ? fallback : Math.max(0, Math.min(maximum, Math.trunc(parsed)));
}

/** District coverage is separate from an apartment address usable for routing. */
export function candidateLocationCoverage(candidates = []) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const districts = new Set();
  const resolvedDistricts = new Set();
  let exact = 0;
  let district = 0;
  for (const candidate of rows) {
    const districtKey = candidateDistrictKey(candidate);
    if (districtKey) districts.add(districtKey);
    if (districtPoint(candidate) && districtKey) resolvedDistricts.add(districtKey);
    if (exactPoint(candidate)) exact += 1;
    else if (districtPoint(candidate)) district += 1;
  }
  return { total: rows.length, exact, district, unlocated: rows.length - exact - district,
    districtCount: districts.size, resolvedDistricts: resolvedDistricts.size };
}

/**
 * No transport or storage is created here. `geocode(address, {signal, precision})`
 * and optional `loadCached(address)` are injected by the caller. District queries
 * never populate candidate.lat/lng; only an explicit bounded address pass can.
 * A new call supersedes an older call of the same method. Cancelled/stale calls
 * return their original candidates with `cancelled: true`, never partial writes.
 */
export function createCandidateLocationService({ geocode, loadCached, concurrency = 2 } = {}) {
  const workers = Math.max(1, boundedCount(concurrency, 2, 2));
  let districtVersion = 0;
  let exactVersion = 0;
  let runningGeocodes = 0;
  const waitingGeocodes = [];

  // The cap applies to the service, including overlapping district/address
  // passes and old calls whose injected provider cannot actually be aborted.
  async function withGeocodeSlot(run) {
    if (runningGeocodes < workers) runningGeocodes += 1;
    else await new Promise((resolve) => waitingGeocodes.push(resolve));
    try { return await run(); }
    finally {
      const next = waitingGeocodes.shift();
      if (next) next();
      else runningGeocodes -= 1;
    }
  }

  async function execute(candidates, groups, { signal, isCurrent = () => true, current, precision, limit }) {
    const original = cloneCandidates(candidates);
    const groupsByKey = new Map(groups.map((group) => [group.key, group]));
    const selectedByIndex = new Map(groups.flatMap((group) => (group.indexes || []).map((index) => [index, group])));
    const requests = { geocodeCalls: 0, cacheHits: 0, failed: 0 };
    const active = () => !signal?.aborted && current() && isCurrent();
    const resolvedPoint = (value) => precision === 'address'
      && (value?.precision === 'district' || value?.locationPrecision === 'district') ? null : point(value);
    // Query-level promises avoid duplicate cache reads and provider calls even
    // when two different metadata groups use the same normalized address.
    const queries = new Map();
    const resolve = (address) => {
      const addressKey = key(address);
      if (queries.has(addressKey)) return queries.get(addressKey);
      const pending = (async () => {
        if (!active()) return null;
        if (typeof loadCached === 'function') {
          try {
            const cached = resolvedPoint(await loadCached(address));
            if (!active()) return null;
            if (cached) { requests.cacheHits += 1; return { ...cached, source: 'cache' }; }
          } catch (_) { /* An unavailable cache must not discard candidate data. */ }
        }
        if (!active() || typeof geocode !== 'function' || requests.geocodeCalls >= limit) return null;
        return withGeocodeSlot(async () => {
          if (!active() || requests.geocodeCalls >= limit) return null;
          requests.geocodeCalls += 1;
          try {
            const found = resolvedPoint(await geocode(address, { signal, precision }));
            if (!active()) return null;
            if (found) return { ...found, source: 'geocode' };
          } catch (_) { /* Network/provider failure is an unresolved location. */ }
          if (active()) requests.failed += 1;
          return null;
        });
      })();
      queries.set(addressKey, pending);
      return pending;
    };
    const resolved = new Map();
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(workers, groups.length) }, async () => {
      while (active() && next < groups.length) {
        const group = groups[next++];
        const found = group.point || (group.address ? await resolve(group.address) : null);
        if (active() && found) resolved.set(group.key, found);
      }
    }));
    const cancelled = !active();
    const enriched = cancelled ? original : original.map((candidate, index) => {
      const group = precision === 'district'
        ? groupsByKey.get(candidateDistrictKey(candidate))
        : selectedByIndex.get(index);
      const found = group && resolved.get(group.key);
      if (!found) return candidate;
      if (precision === 'district') return { ...candidate, locationReference: {
        lat: found.lat, lng: found.lng, label: group.label, precision: 'district',
        regionCode: group.regionCode, source: found.source,
      } };
      return { ...candidate, lat: found.lat, lng: found.lng,
        locationPrecision: 'address', mapCoordinateSource: 'address-geocode' };
    });
    return { candidates: enriched, coverage: candidateLocationCoverage(enriched), requests, cancelled };

  }

  async function enrichDistrictReferences(candidates, {
    districts = [], signal, isCurrent, limit = DEFAULT_DISTRICT_LIMIT,
  } = {}) {
    const version = ++districtVersion;
    const rows = cloneCandidates(candidates);
    const supplied = Array.isArray(districts) ? districts : [];
    const groups = new Map();
    for (const candidate of rows) {
      const districtKey = candidateDistrictKey(candidate);
      if (!districtKey || groups.has(districtKey)) continue;
      const code = text(candidate.regionCode);
      const matching = supplied.filter((district) => code
        ? text(district?.code ?? district?.regionCode) === code
        : key(district?.name ?? district?.regionName) === key(candidate.regionName));
      const staticMatch = matching.find((district) => point(district, { allowCenter: true })) || matching[0];
      const label = text(staticMatch?.name || staticMatch?.regionName
        || [staticMatch?.sido, staticMatch?.sigungu || staticMatch?.district].filter(Boolean).join(' ')
        || candidate.regionName);
      const staticPoint = point(staticMatch, { allowCenter: true });
      const existing = rows.find((item) => candidateDistrictKey(item) === districtKey && districtPoint(item));
      const existingPoint = districtPoint(existing);
      groups.set(districtKey, { key: districtKey, label, address: label, regionCode: code,
        point: staticPoint ? { ...staticPoint, source: 'static' }
          : existingPoint ? { ...existingPoint, source: existing.locationReference.source || 'existing' } : null });
    }
    return execute(rows, [...groups.values()], {
      signal, isCurrent, current: () => version === districtVersion,
      precision: 'district', limit: boundedCount(limit, DEFAULT_DISTRICT_LIMIT, DEFAULT_DISTRICT_LIMIT),
    });
  }

  async function enrichExactCandidates(candidates, { limit = DEFAULT_EXACT_LIMIT, signal, isCurrent } = {}) {
    const version = ++exactVersion;
    const rows = cloneCandidates(candidates);
    const count = boundedCount(limit, DEFAULT_EXACT_LIMIT, MAX_EXACT_LIMIT);
    const groups = new Map();
    let selected = 0;
    rows.forEach((candidate, index) => {
      if (exactPoint(candidate) || selected >= count) return;
      // Do not fall back to a district/name-only query and label it exact.
      const address = text(candidate.address);
      if (!address || key(address) === key(candidate.regionName)) return;
      selected += 1;
      const addressKey = key(address);
      if (!groups.has(addressKey)) groups.set(addressKey, { key: addressKey, address, indexes: [] });
      groups.get(addressKey).indexes.push(index);
    });
    return execute(rows, [...groups.values()], {
      signal, isCurrent, current: () => version === exactVersion, precision: 'address', limit: count,
    });
  }

  return { enrichDistrictReferences, enrichExactCandidates };
}
