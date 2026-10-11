import { normalizeCloudSnapshot } from './cloud-snapshot-core.mjs';

export const VERSION_STORE_EVENT = 'homehunt:shared-records-changed';
export const SHARED_RECORD_KEYS = Object.freeze({
  visits: 'homehunt_visits_v1',
  shortlist: 'homehunt_shortlist_v1',
  supplyFavorites: 'homehunt_supply_favorites_v1',
  parkingObservations: 'homehunt_parking_observations_v1',
});
export const V2_CONDITIONS_KEY = 'homehunt_v2_conditions_v1';
export const V2_UI_KEY = 'homehunt_v2_ui_v1';
export const RECORD_OWNER_KEY = 'homehunt_shared_records_owner_uid_v1';
export const LEGACY_PERSONAL_OWNER_KEY = 'homehunt_legacy_personal_owner_uid_v1';
export const LEGACY_PERSONAL_KEYS = Object.freeze([
  ...Object.values(SHARED_RECORD_KEYS), 'homehunt_recommendation_filters_v1',
  'homehunt_compare_ids_v1', 'homehunt_supply_preferences_v1', 'homehunt_supply_seen_v1',
  'homehunt_subscription_profile_v1', 'homehunt_recent_complexes_v1', V2_CONDITIONS_KEY, V2_UI_KEY,
]);
export function accountStorageKey(key, uid) {
  if (typeof uid !== 'string' || !uid.trim() || uid.length > 128) throw new TypeError('계정 식별자가 필요합니다.');
  return `${key}_uid_${encodeURIComponent(uid)}`;
}
/** Metadata only. Never return another account's records or company inputs. */
export function getLocalRecordAccess({ storage = browserStorage(), uid } = {}) {
  const accountUid = typeof uid === 'string' && uid.trim() ? uid : null;
  if (!accountUid) return { status: 'signed-out', locked: true, reason: '로그인한 회원만 이 기기의 개인 기록을 볼 수 있습니다.', accountUid: null, ownerUid: null, canClaimLegacy: false };
  try {
    if (!storage) throw new Error('unavailable');
    const ownerUid = storage.getItem(RECORD_OWNER_KEY) || null;
    if (ownerUid && ownerUid !== accountUid) return { status: 'owner-mismatch', locked: true, reason: '이 기기에는 다른 계정의 기록이 남아 있습니다. 원래 계정으로 돌아가거나 현재 계정의 백업을 명시적으로 복원해주세요.', accountUid, ownerUid, canClaimLegacy: false };
    const hasLegacy = !ownerUid && LEGACY_PERSONAL_KEYS.some(key => {
      const raw = storage.getItem(key);
      return raw != null && !['', 'null', '{}', '[]'].includes(raw.trim());
    });
    if (hasLegacy) return { status: 'legacy-unverified', locked: true, reason: '기존 기록의 계정을 아직 확인하지 못했습니다. 본인의 기록인지 확인하거나 현재 계정 백업을 복원해주세요.', accountUid, ownerUid: null, canClaimLegacy: true };
    return { status: 'allowed', locked: false, reason: '', accountUid, ownerUid, canClaimLegacy: false };
  } catch (_) { return { status: 'storage-unavailable', locked: true, reason: '브라우저 저장 공간을 확인하지 못했습니다.', accountUid, ownerUid: null, canClaimLegacy: false }; }
}
export function claimLocalLegacyRecords({ storage = browserStorage(), uid } = {}) {
  const access = getLocalRecordAccess({ storage, uid });
  if (!access.canClaimLegacy) throw new VersionStoreError('소유자가 확인되지 않은 본인 기록만 명시적으로 확인할 수 있습니다.', 'VERSION_STORE_ACCESS_DENIED');
  const previous = storage.getItem(LEGACY_PERSONAL_OWNER_KEY);
  try { storage.setItem(LEGACY_PERSONAL_OWNER_KEY, uid); storage.setItem(RECORD_OWNER_KEY, uid); }
  catch (error) { if (previous == null) storage.removeItem(LEGACY_PERSONAL_OWNER_KEY); else storage.setItem(LEGACY_PERSONAL_OWNER_KEY, previous); throw error; }
  return getLocalRecordAccess({ storage, uid });
}
const V1_CONDITIONS_KEY = 'homehunt_recommendation_filters_v1';
const V1_COMPARE_KEY = 'homehunt_compare_ids_v1';
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const object = value => value != null && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const browserStorage = () => { try { return globalThis.localStorage || null; } catch (_) { return null; } };

export class VersionStoreError extends Error {
  constructor(message, code = 'VERSION_STORE_INVALID') { super(message); this.name = 'VersionStoreError'; this.code = code; }
}

function conflict() { throw new VersionStoreError('다른 화면에서 이 기록을 변경했습니다. 최신 기록을 확인한 뒤 다시 저장해주세요.', 'VERSION_STORE_CONFLICT'); }
function safeId(value) { return typeof value === 'string' && value.trim() && value.length <= 128 && !RESERVED.has(value) ? value.trim() : ''; }
function safeNumber(value, fallback, minimum = 0) { return typeof value === 'number' && Number.isFinite(value) && value >= minimum ? value : fallback; }
function readJSON(storage, key, fallback) {
  try { const raw = storage?.getItem(key); return raw === null || raw === undefined ? clone(fallback) : JSON.parse(raw); }
  catch (_) { return clone(fallback); }
}

function sanitizeField(field, input, { tolerant = false } = {}) {
  if (!Object.hasOwn(SHARED_RECORD_KEYS, field)) throw new VersionStoreError('지원하지 않는 공유 기록입니다.');
  if (field === 'parkingObservations') {
    if (!object(input)) { if (tolerant) return {}; throw new VersionStoreError('주차 기록 형식을 확인해주세요.'); }
    const result = {};
    for (const [id, entry] of Object.entries(input)) {
      if (!safeId(id)) { if (tolerant) continue; throw new VersionStoreError('단지 식별자를 확인해주세요.'); }
      try { Object.assign(result, normalizeCloudSnapshot({ parkingObservations: { [id]: entry } }).parkingObservations); }
      catch (error) { if (!tolerant) throw error; }
    }
    return result;
  }
  if (!Array.isArray(input)) { if (tolerant) return []; throw new VersionStoreError('기록은 목록이어야 합니다.'); }
  if (input.length > 1000) throw new VersionStoreError('공유 기록은 1000개 이하여야 합니다.');
  const result = []; const ids = new Set();
  for (const entry of input) {
    try {
      const cleaned = normalizeCloudSnapshot({ [field]: [entry] })[field][0];
      const id = field === 'supplyFavorites' ? cleaned : cleaned.id;
      if (!ids.has(id)) { result.push(cleaned); ids.add(id); }
    } catch (error) { if (!tolerant) throw error; }
  }
  return result;
}

/** Explicit input fields only: never store a provider response or route verdict. */
export function normalizeV2Conditions(input = {}) {
  const raw = object(input) ? input : {};
  const workplaces = [];
  for (const entry of Array.isArray(raw.workplaces) ? raw.workplaces : []) {
    try {
      const clean = normalizeCloudSnapshot({ recommendationFilters: { workplaces: [entry] } }).recommendationFilters.workplaces[0];
      workplaces.push(clean);
    } catch (_) { /* Invalid destinations are not promoted into a condition. */ }
  }
  return {
    comfortPriceManWon: safeNumber(raw.comfortPriceManWon, 60000, 1),
    maxPriceManWon: safeNumber(raw.maxPriceManWon, 70000, 1),
    minAreaM2: safeNumber(raw.minAreaM2, 59, 1),
    minHouseholds: raw.minHouseholds == null ? null : Math.trunc(safeNumber(raw.minHouseholds, 0)),
    maxAgeYears: raw.maxAgeYears == null ? null : Math.trunc(safeNumber(raw.maxAgeYears, 0)),
    regions: Array.isArray(raw.regions) && raw.regions.some(value => ['seoul', 'gyeonggi'].includes(value))
      ? [...new Set(raw.regions.filter(value => ['seoul', 'gyeonggi'].includes(value)))] : ['seoul', 'gyeonggi'],
    workplaces,
    dealType: ['매매', '전세', '월세'].includes(raw.dealType) ? raw.dealType : '매매',
    months: [1, 3, 6].includes(raw.months) ? raw.months : 6,
    focusRegions: Array.isArray(raw.focusRegions) ? [...new Set(raw.focusRegions.filter(value => typeof value === 'string' && value.length <= 120))].slice(0, 20) : [],
  };
}

function normalizeUI(input) {
  const raw = object(input) ? input : {};
  return {
    view: typeof raw.view === 'string' && raw.view.length < 80 ? raw.view : 'board',
    compareIds: [...new Set((Array.isArray(raw.compareIds) ? raw.compareIds : []).map(safeId).filter(Boolean))].slice(0, 3),
    sort: typeof raw.sort === 'string' && raw.sort.length < 80 ? raw.sort : 'price',
    selectedId: safeId(raw.selectedId),
  };
}

/**
 * Version 2 uses V1 record keys and its own conditions/UI keys. No reads migrate
 * or overwrite V1 values. Whole-array saves merge only changes since the caller's
 * last read; simultaneous edits to the same record require an explicit retry.
 */
export function createVersionStore({ storage = browserStorage(), eventTarget = globalThis.window || null, accountUid = null } = {}) {
  const uid = () => typeof accountUid === 'function' ? accountUid() : accountUid;
  const getAccess = () => getLocalRecordAccess({ storage, uid: disposed ? null : uid() });
  const assertAccess = () => { const access = getAccess(); if (access.locked) throw new VersionStoreError(access.reason, access.status === 'storage-unavailable' ? 'VERSION_STORE_UNAVAILABLE' : 'VERSION_STORE_ACCESS_DENIED'); return access; };
  const bindFirstWrite = () => { const access = assertAccess(); if (!access.ownerUid) storage.setItem(RECORD_OWNER_KEY, access.accountUid); };
  const baseline = new Map(); const listeners = new Set(); let disposed = false;
  const readField = field => sanitizeField(field, readJSON(storage, SHARED_RECORD_KEYS[field], field === 'parkingObservations' ? {} : []), { tolerant: true });
  const shared = (remember = false) => Object.fromEntries(Object.keys(SHARED_RECORD_KEYS).map(field => {
    const value = getAccess().locked ? field === 'parkingObservations' ? {} : [] : readField(field); if (remember) baseline.set(field, clone(value)); return [field, value];
  }));
  shared(true);
  const emit = () => {
    const value = { shared: shared(), conditions: getConditions(), ui: getUI(), access: getAccess() };
    for (const listener of listeners) { try { listener(value); } catch (_) { /* One consumer cannot interrupt another. */ } }
  };
  const broadcast = () => {
    try { if (eventTarget?.dispatchEvent && typeof Event === 'function') { eventTarget.dispatchEvent(new Event(VERSION_STORE_EVENT)); return; } }
    catch (_) { /* Native storage events still refresh other tabs. */ }
    emit();
  };
  const onStorage = event => {
    if (event.storageArea && event.storageArea !== storage) return;
    if (event.key === null || [RECORD_OWNER_KEY, LEGACY_PERSONAL_OWNER_KEY, ...LEGACY_PERSONAL_KEYS].includes(event.key) || String(event.key).startsWith(`${V2_CONDITIONS_KEY}_uid_`) || String(event.key).startsWith(`${V2_UI_KEY}_uid_`)) emit();
  };
  eventTarget?.addEventListener?.('storage', onStorage);
  eventTarget?.addEventListener?.(VERSION_STORE_EVENT, emit);

  function write(key, value) {
    if (!storage) throw new VersionStoreError('브라우저 저장 공간을 사용할 수 없습니다.', 'VERSION_STORE_UNAVAILABLE');
    try { storage.setItem(key, JSON.stringify(value)); }
    catch (_) { throw new VersionStoreError('브라우저 저장 공간에 기록을 저장하지 못했습니다.', 'VERSION_STORE_UNAVAILABLE'); }
  }
  function saveSharedField(field, input) {
    assertAccess();
    const incoming = sanitizeField(field, input);
    const latest = readField(field);
    const before = baseline.get(field) ?? latest;
    const dictionary = value => field === 'parkingObservations' ? new Map(Object.entries(value))
      : new Map(value.map(item => [field === 'supplyFavorites' ? item : item.id, item]));
    const oldMap = dictionary(before), nextMap = dictionary(incoming), latestMap = dictionary(latest);
    for (const id of new Set([...oldMap.keys(), ...nextMap.keys()])) {
      const oldValue = oldMap.get(id), nextValue = nextMap.get(id);
      if (equal(oldValue, nextValue)) continue;
      const currentValue = latestMap.get(id);
      if (!equal(currentValue, oldValue) && !equal(currentValue, nextValue)) conflict();
      if (nextMap.has(id)) latestMap.set(id, nextValue); else latestMap.delete(id);
    }
    const result = field === 'parkingObservations' ? Object.fromEntries(latestMap)
      : [...nextMap.keys(), ...latestMap.keys()].filter((id, index, ids) => ids.indexOf(id) === index && latestMap.has(id)).map(id => latestMap.get(id));
    // Reject a change that landed after the read instead of overwriting it.
    if (!equal(readField(field), latest)) conflict();
    bindFirstWrite(); write(SHARED_RECORD_KEYS[field], result); baseline.set(field, clone(result)); broadcast(); return clone(result);
  }
  function assertExpected(field, id, options) {
    if (!object(options) || !Object.hasOwn(options, 'expectedRecord')) return;
    const current = readField(field).find(item => item.id === id) || null;
    const expected = options.expectedRecord == null ? null : sanitizeField(field, [options.expectedRecord])[0];
    if (!equal(current, expected)) conflict();
  }
  function upsert(field, item, options) {
    assertAccess();
    const clean = sanitizeField(field, [item])[0]; const id = clean.id;
    assertExpected(field, id, options);
    const current = clone(baseline.get(field) || []);
    return saveSharedField(field, [clean, ...current.filter(entry => entry.id !== id)]);
  }
  function remove(field, id, options) {
    assertAccess();
    id = safeId(id); if (!id) throw new VersionStoreError('기록 식별자를 확인해주세요.');
    assertExpected(field, id, options);
    return saveSharedField(field, (baseline.get(field) || []).filter(entry => entry.id !== id));
  }
  function getConditions() { return normalizeV2Conditions(getAccess().locked ? {} : readJSON(storage, accountStorageKey(V2_CONDITIONS_KEY, uid()), {})); }
  function saveConditions(input) { assertAccess(); const result = normalizeV2Conditions(input); write(accountStorageKey(V2_CONDITIONS_KEY, uid()), result); broadcast(); return clone(result); }
  function getUI() { return normalizeUI(getAccess().locked ? {} : readJSON(storage, accountStorageKey(V2_UI_KEY, uid()), {})); }
  function saveUI(input) { assertAccess(); const result = normalizeUI(input); write(accountStorageKey(V2_UI_KEY, uid()), result); broadcast(); return clone(result); }
  function assertLegacyOwnership() {
    const access = assertAccess();
    const legacyOwner = storage.getItem(LEGACY_PERSONAL_OWNER_KEY) || access.ownerUid;
    if (legacyOwner !== access.accountUid) throw new VersionStoreError('이전 조건의 소유자를 확인하지 못했습니다. 원래 계정에서 명시적으로 가져와주세요.', 'VERSION_STORE_ACCESS_DENIED');
  }
  function importLegacyV2Conditions() { assertLegacyOwnership(); return saveConditions(readJSON(storage, V2_CONDITIONS_KEY, {})); }
  function importV1Conditions() {
    assertAccess();
    const scoped = readJSON(storage, accountStorageKey(V1_CONDITIONS_KEY, uid()), null);
    if (!scoped) assertLegacyOwnership();
    const v1 = scoped || readJSON(storage, V1_CONDITIONS_KEY, {});
    const comfort = safeNumber(v1.targetPriceManWon, safeNumber(v1.maxPriceManWon, 60000, 1), 1);
    return saveConditions({ ...v1, comfortPriceManWon: comfort,
      maxPriceManWon: safeNumber(v1.maxPriceManWon, Math.round(comfort * (1 + safeNumber(v1.maxOverBudgetPct, 0) / 100)), 1),
      minAreaM2: safeNumber(v1.minAreaM2, 59, 1), minHouseholds: v1.minHouseholds ?? null, maxAgeYears: v1.maxAgeYears ?? null });
  }
  function getBackupSnapshot(remoteSnapshot = null) {
    assertAccess();
    const remote = remoteSnapshot == null ? null : normalizeCloudSnapshot(remoteSnapshot);
    return normalizeCloudSnapshot({ ...shared(),
      recommendationFilters: remote?.recommendationFilters ?? readJSON(storage, accountStorageKey(V1_CONDITIONS_KEY, uid()), (storage.getItem(LEGACY_PERSONAL_OWNER_KEY) || storage.getItem(RECORD_OWNER_KEY)) === uid() ? readJSON(storage, V1_CONDITIONS_KEY, {}) : {}),
      compareIds: remote?.compareIds ?? readJSON(storage, accountStorageKey(V1_COMPARE_KEY, uid()), (storage.getItem(LEGACY_PERSONAL_OWNER_KEY) || storage.getItem(RECORD_OWNER_KEY)) === uid() ? readJSON(storage, V1_COMPARE_KEY, []) : []) });
  }
  function mergeBackupSnapshot(remote) {
    assertAccess();
    // The caller loads the latest snapshot for the SAME authenticated UID and
    // passes its revision to the existing cloud transaction. Never use V2 filters
    // as the existing V1 backup's recommendationFilters.
    const envelope = object(remote) && Object.hasOwn(remote, 'snapshot') ? remote : null;
    const raw = envelope ? envelope.snapshot : remote;
    const previous = raw == null ? getBackupSnapshot() : normalizeCloudSnapshot(raw);
    const merged = normalizeCloudSnapshot({ ...previous, ...shared() });
    return envelope ? { ...envelope, snapshot: merged } : merged;
  }
  const getSharedFingerprint = () => {
    if (getAccess().status === 'signed-out') throw new VersionStoreError('로그인한 계정에서만 기록 변경 여부를 확인할 수 있습니다.', 'VERSION_STORE_ACCESS_DENIED');
    // The raw material stays in this closure even while UI reads are locked.
    const raw = JSON.stringify([storage?.getItem(RECORD_OWNER_KEY), ...Object.values(SHARED_RECORD_KEYS).map(key => storage?.getItem(key))]);
    let first = 2166136261, second = 5381;
    for (let i = 0; i < raw.length; i++) { first = Math.imul(first ^ raw.charCodeAt(i), 16777619); second = Math.imul(second, 33) ^ raw.charCodeAt(i); }
    return `${first >>> 0}:${second >>> 0}`;
  };
  function applyBackupSnapshot(remote, { expectedFingerprint, explicitRestore = false, accountUid: requestedUid } = {}) {
    if (explicitRestore) {
      if (!uid() || requestedUid !== uid()) throw new VersionStoreError('복원할 로그인 계정을 다시 확인해주세요.', 'VERSION_STORE_ACCESS_DENIED');
    } else assertAccess();
    const raw = object(remote) && Object.hasOwn(remote, 'snapshot') ? remote.snapshot : remote;
    const snapshot = normalizeCloudSnapshot(raw);
    if (expectedFingerprint !== undefined && expectedFingerprint !== getSharedFingerprint()) conflict();
    const original = new Map(); const written = new Map();
    const previousOwner = storage?.getItem(RECORD_OWNER_KEY);
    const previousLegacyOwner = storage?.getItem(LEGACY_PERSONAL_OWNER_KEY);
    // Preserve original bytes locally before any explicit cross-owner replacement.
    if (explicitRestore && previousOwner !== uid()) {
      const recoveryKey = `homehunt_record_recovery_v1_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const preserved = Object.fromEntries(LEGACY_PERSONAL_KEYS.map(key => [key, storage?.getItem(key) ?? null]));
      write(recoveryKey, { ownerUid: previousOwner || null, recordedAt: new Date().toISOString(), values: preserved });
    }
    try {
      if (explicitRestore) {
        if (!previousLegacyOwner) storage.setItem(LEGACY_PERSONAL_OWNER_KEY, previousOwner || '__unverified__');
        // Owner changes before values so another account's tab locks first.
        storage.setItem(RECORD_OWNER_KEY, uid());
      }
      for (const [field, key] of Object.entries(SHARED_RECORD_KEYS)) {
        original.set(key, storage?.getItem(key) ?? null);
        const value = snapshot[field]; write(key, value); written.set(key, JSON.stringify(value));
      }
    } catch (error) {
      // Do not roll back a key another tab changed after our own write.
      for (const [key, value] of original) {
        try {
          if (storage.getItem(key) !== written.get(key)) continue;
          if (value === null) storage.removeItem(key); else storage.setItem(key, value);
        } catch (_) { /* Caller receives explicit failure even if storage is blocked. */ }
      }
      try { if (previousOwner == null) storage.removeItem(RECORD_OWNER_KEY); else storage.setItem(RECORD_OWNER_KEY, previousOwner); if (previousLegacyOwner == null) storage.removeItem(LEGACY_PERSONAL_OWNER_KEY); else storage.setItem(LEGACY_PERSONAL_OWNER_KEY, previousLegacyOwner); } catch (_) { /* Keep the original failure explicit. */ }
      shared(true); broadcast(); throw error;
    }
    const result = shared(true); broadcast(); return result;
  }
  function subscribe(listener, { emitCurrent = true } = {}) {
    if (disposed || typeof listener !== 'function') throw new TypeError('활성 기록 구독 함수를 전달해주세요.');
    listeners.add(listener); if (emitCurrent) listener({ shared: shared(), conditions: getConditions(), ui: getUI(), access: getAccess() });
    return () => listeners.delete(listener);
  }
  function dispose() {
    disposed = true; listeners.clear();
    eventTarget?.removeEventListener?.('storage', onStorage); eventTarget?.removeEventListener?.(VERSION_STORE_EVENT, emit);
  }
  return Object.freeze({ getShared: () => shared(true), saveSharedField,
    addFavorite: (item, options) => upsert('shortlist', item, options), removeFavorite: (id, options) => remove('shortlist', id, options),
    saveVisit: (item, options) => upsert('visits', item, options), deleteVisit: (id, options) => remove('visits', id, options),
    getConditions, saveConditions, getUI, saveUI, importV1Conditions, importLegacyV2Conditions, getBackupSnapshot, mergeBackupSnapshot, applyBackupSnapshot, getSharedFingerprint,
    getAccess, refreshAccess: () => { shared(true); emit(); return getAccess(); }, claimLegacy: () => { const result = claimLocalLegacyRecords({ storage, uid: uid() }); shared(true); broadcast(); return result; }, subscribe, dispose });
}
