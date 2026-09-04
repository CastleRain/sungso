import { normalizeGeoPoint } from './transport-core.mjs?v=2.1.0';

const VISITS_KEY = 'homehunt_visits_v1';
const COMPARE_IDS_KEY = 'homehunt_compare_ids_v1';
const RECENT_COMPLEXES_KEY = 'homehunt_recent_complexes_v1';
const SHORTLIST_KEY = 'homehunt_shortlist_v1';
const RECOMMENDATION_FILTERS_KEY = 'homehunt_recommendation_filters_v1';
const GEOCODE_CACHE_KEY = 'homehunt_geocode_cache_v1';
const SUPPLY_PREFERENCES_KEY = 'homehunt_supply_preferences_v1';
const SUPPLY_FAVORITES_KEY = 'homehunt_supply_favorites_v1';
const SUPPLY_SEEN_KEY = 'homehunt_supply_seen_v1';
const SUBSCRIPTION_PROFILE_KEY = 'homehunt_subscription_profile_v1';
const DB_NAME = 'homehunt_market_v1';
const DB_STORE = 'datasets';

function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function loadVisits() {
  const value = readJson(VISITS_KEY, null);
  return Array.isArray(value) ? value : null;
}

export function saveVisits(visits) {
  localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
}

export function loadCompareIds() {
  const value = readJson(COMPARE_IDS_KEY, []);
  return Array.isArray(value) ? value : [];
}

export function saveCompareIds(ids) {
  localStorage.setItem(COMPARE_IDS_KEY, JSON.stringify(Array.isArray(ids) ? ids : []));
}

export function clearVisits() {
  localStorage.removeItem(VISITS_KEY);
}

export function loadRecentComplexes() {
  const value = readJson(RECENT_COMPLEXES_KEY, []);
  return Array.isArray(value) ? value.slice(0, 12) : [];
}

export function rememberComplex(complex) {
  const queryKey = String(complex.query || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const targetDong = String(complex.dong || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const existing = loadRecentComplexes().filter((item) => {
    if (item.key === complex.key) return false;
    if (complex.catalogId && item.catalogId === complex.catalogId) return false;
    if (complex.aptSeq && item.aptSeq === complex.aptSeq) return false;
    const itemQueryKey = String(item.query || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
    const itemDong = String(item.dong || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
    const sameResolvedSearch = String(item.regionCode) === String(complex.regionCode)
      && itemQueryKey === queryKey
      && targetDong
      && itemDong === targetDong;
    if (sameResolvedSearch) return false;
    const sameUnresolvedSearch = String(item.regionCode) === String(complex.regionCode)
      && itemQueryKey === queryKey
      && !item.aptSeq && !item.dong;
    return !sameUnresolvedSearch;
  });
  const next = [{ ...complex, searchedAt: new Date().toISOString() }, ...existing].slice(0, 12);
  localStorage.setItem(RECENT_COMPLEXES_KEY, JSON.stringify(next));
  return next;
}

export function loadShortlist() {
  const value = readJson(SHORTLIST_KEY, []);
  return Array.isArray(value) ? value.map(({ commute, distanceKm, ...item }) => item) : [];
}

export function saveShortlist(items) {
  localStorage.setItem(SHORTLIST_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}

export function loadRecommendationFilters() {
  const value = readJson(RECOMMENDATION_FILTERS_KEY, null);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function saveRecommendationFilters(filters) {
  localStorage.setItem(RECOMMENDATION_FILTERS_KEY, JSON.stringify(filters || {}));
}

export function loadSupplyPreferences() {
  const value = readJson(SUPPLY_PREFERENCES_KEY, null);
  const optionalPositive = (input) => Number.isFinite(Number(input)) && Number(input) > 0 ? Number(input) : null;
  return {
    regions: Array.isArray(value?.regions) && value.regions.length
      ? value.regions.filter((region) => ['서울', '경기'].includes(region))
      : ['서울', '경기'],
    newlywedMode: value?.newlywedMode === 'only' ? 'only' : 'highlight',
    maxPriceManWon: Number.isFinite(Number(value?.maxPriceManWon)) && Number(value.maxPriceManWon) > 0
      ? Number(value.maxPriceManWon)
      : null,
    districts: Array.isArray(value?.districts)
      ? [...new Set(value.districts.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 12)
      : [],
    minAreaM2: optionalPositive(value?.minAreaM2),
    maxAreaM2: optionalPositive(value?.maxAreaM2),
    minSupplyUnits: optionalPositive(value?.minSupplyUnits),
    includeUnknownPrice: value?.includeUnknownPrice !== false,
    includeUnknownArea: value?.includeUnknownArea !== false,
    includeUnknownUnits: value?.includeUnknownUnits !== false,
    notifyNew: value?.notifyNew !== false,
    notifyChanged: value?.notifyChanged !== false,
    notifyDeadline: value?.notifyDeadline !== false,
  };
}

export function saveSupplyPreferences(preferences) {
  const optionalPositive = (input) => Number.isFinite(Number(input)) && Number(input) > 0 ? Number(input) : null;
  const value = {
    regions: Array.isArray(preferences?.regions)
      ? preferences.regions.filter((region) => ['서울', '경기'].includes(region))
      : ['서울', '경기'],
    newlywedMode: preferences?.newlywedMode === 'only' ? 'only' : 'highlight',
    maxPriceManWon: Number.isFinite(Number(preferences?.maxPriceManWon)) && Number(preferences.maxPriceManWon) > 0
      ? Number(preferences.maxPriceManWon)
      : null,
    districts: Array.isArray(preferences?.districts)
      ? [...new Set(preferences.districts.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 12)
      : [],
    minAreaM2: optionalPositive(preferences?.minAreaM2),
    maxAreaM2: optionalPositive(preferences?.maxAreaM2),
    minSupplyUnits: optionalPositive(preferences?.minSupplyUnits),
    includeUnknownPrice: preferences?.includeUnknownPrice !== false,
    includeUnknownArea: preferences?.includeUnknownArea !== false,
    includeUnknownUnits: preferences?.includeUnknownUnits !== false,
    notifyNew: preferences?.notifyNew !== false,
    notifyChanged: preferences?.notifyChanged !== false,
    notifyDeadline: preferences?.notifyDeadline !== false,
  };
  localStorage.setItem(SUPPLY_PREFERENCES_KEY, JSON.stringify(value));
  return value;
}

export function loadSubscriptionProfile() {
  const value = readJson(SUBSCRIPTION_PROFILE_KEY, null);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function saveSubscriptionProfile(profile) {
  const value = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
  localStorage.setItem(SUBSCRIPTION_PROFILE_KEY, JSON.stringify(value));
  return value;
}

export function clearSubscriptionProfile() {
  localStorage.removeItem(SUBSCRIPTION_PROFILE_KEY);
}

export function loadSupplyFavorites() {
  const value = readJson(SUPPLY_FAVORITES_KEY, []);
  return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))].slice(0, 500) : [];
}

export function saveSupplyFavorites(ids) {
  const value = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))].slice(0, 500);
  localStorage.setItem(SUPPLY_FAVORITES_KEY, JSON.stringify(value));
  return value;
}

export function loadSupplySeen() {
  const value = readJson(SUPPLY_SEEN_KEY, null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const clean = (items) => [...new Set((Array.isArray(items) ? items : []).map(String).filter(Boolean))].slice(-2000);
  return {
    knownIds: clean(value.knownIds),
    unreadIds: clean(value.unreadIds),
    notifiedIds: clean(value.notifiedIds),
    alertKeys: clean(value.alertKeys),
    initializedAt: String(value.initializedAt || ''),
    acknowledgedAt: String(value.acknowledgedAt || ''),
  };
}

export function saveSupplySeen(value = {}) {
  const clean = (items) => [...new Set((Array.isArray(items) ? items : []).map(String).filter(Boolean))].slice(-2000);
  const next = {
    knownIds: clean(value.knownIds),
    unreadIds: clean(value.unreadIds),
    notifiedIds: clean(value.notifiedIds),
    alertKeys: clean(value.alertKeys),
    initializedAt: String(value.initializedAt || new Date().toISOString()),
    acknowledgedAt: String(value.acknowledgedAt || ''),
  };
  localStorage.setItem(SUPPLY_SEEN_KEY, JSON.stringify(next));
  return next;
}

function normalizeGeocodeKey(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function loadGeocodeResult(query) {
  const key = normalizeGeocodeKey(query);
  if (!key) return null;
  const items = readJson(GEOCODE_CACHE_KEY, []);
  const match = Array.isArray(items) ? items.find((item) => item.key === key) : null;
  const point = normalizeGeoPoint(match);
  if (!point) return null;
  return { name: match.name || query, roadAddress: match.roadAddress || '', jibunAddress: match.jibunAddress || '', ...point };
}

export function saveGeocodeResult(query, result) {
  const key = normalizeGeocodeKey(query);
  const point = normalizeGeoPoint(result);
  if (!key || !point) return null;
  const current = readJson(GEOCODE_CACHE_KEY, []);
  const items = Array.isArray(current) ? current.filter((item) => item.key !== key) : [];
  const value = {
    key,
    name: String(result.name || query),
    roadAddress: String(result.roadAddress || ''),
    jibunAddress: String(result.jibunAddress || ''),
    ...point,
    cachedAt: new Date().toISOString(),
  };
  localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify([value, ...items].slice(0, 400)));
  return value;
}

export function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

export async function saveImportedMarket(summary) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(summary, 'imported-summary');
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function loadImportedMarket() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const request = tx.objectStore(DB_STORE).get('imported-summary');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  } catch (_) {
    return null;
  }
}

export async function clearImportedMarket() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete('imported-summary');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (_) {
    return undefined;
  }
}

function normalizeComplexIdentity(identity = {}) {
  const endMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(identity?.endMonth || ''))
    ? String(identity.endMonth)
    : '';
  return {
    aptSeq: String(identity?.aptSeq || ''),
    dong: String(identity?.dong || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ''),
    months: Math.max(1, Math.trunc(Number(identity?.months) || 12)),
    endMonth,
  };
}

function complexCacheKey(regionCode, query, identity = {}) {
  const normalized = String(query || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const { aptSeq, dong, months, endMonth } = normalizeComplexIdentity(identity);
  return `complex:${String(regionCode)}:${aptSeq}:${dong}:${normalized}:${months}m:${endMonth || 'unanchored'}`;
}

function historyRangeMatches(value, identity) {
  const normalized = normalizeComplexIdentity(identity);
  if (!normalized.endMonth || value?.partial === true) return false;
  const endMatch = normalized.endMonth.match(/^(\d{4})-(\d{2})$/);
  if (!endMatch) return false;
  const endIndex = Number(endMatch[1]) * 12 + Number(endMatch[2]) - 1;
  const startIndex = endIndex - normalized.months + 1;
  const expectedStart = `${Math.floor(startIndex / 12)}-${String((startIndex % 12) + 1).padStart(2, '0')}`;
  return Number(value?.months) === normalized.months
    && value?.endMonth === normalized.endMonth
    && value?.rangeEnd === normalized.endMonth
    && value?.rangeStart === expectedStart
    && typeof value?.includesCurrentMonth === 'boolean';
}

export async function saveComplexHistory(regionCode, query, payload, identity = {}) {
  const normalizedIdentity = normalizeComplexIdentity(identity);
  if (!historyRangeMatches(payload, normalizedIdentity)) {
    throw new Error('Refusing to cache partial or mismatched apartment history');
  }
  const db = await openDb();
  const value = {
    ...payload,
    regionCode: String(regionCode),
    query: String(query),
    aptSeq: String(payload?.aptSeq || ''),
    dong: String(payload?.dong || ''),
    months: normalizedIdentity.months,
    endMonth: normalizedIdentity.endMonth,
    cachedAt: new Date().toISOString(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.put(value, complexCacheKey(regionCode, query, identity));
    const qualifiedIdentity = {
      aptSeq: value.aptSeq,
      dong: value.aptSeq ? '' : value.dong,
      months: normalizedIdentity.months,
      endMonth: normalizedIdentity.endMonth,
    };
    if (value.aptSeq || value.dong) {
      store.put(value, complexCacheKey(regionCode, value.aptName || query, qualifiedIdentity));
    }
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function loadComplexHistory(regionCode, query, identity = {}) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const request = tx.objectStore(DB_STORE).get(complexCacheKey(regionCode, query, identity));
      request.onsuccess = () => {
        const value = request.result || null;
        resolve(historyRangeMatches(value, identity) ? value : null);
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  } catch (_) {
    return null;
  }
}
