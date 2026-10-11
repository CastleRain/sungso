import test from 'node:test';
import assert from 'node:assert/strict';
import { createVersionStore, getLocalRecordAccess, claimLocalLegacyRecords, accountStorageKey,
  RECORD_OWNER_KEY, LEGACY_PERSONAL_OWNER_KEY, SHARED_RECORD_KEYS, V2_CONDITIONS_KEY, V2_UI_KEY } from '../../../shared/homehunt/homehunt-version-store.mjs';
import { configureHomehuntStorageAccount, loadVisits, clearVisits, loadRecommendationFilters, saveRecommendationFilters,
  loadSubscriptionProfile, saveSubscriptionProfile } from '../js/storage.js';

function memory(values = {}) {
  const data = new Map(Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]));
  const writes = [];
  return { data, writes, getItem: key => data.get(key) ?? null,
    setItem(key, value) { writes.push(key); data.set(key, String(value)); }, removeItem: key => data.delete(key) };
}
const record = id => ({ id, name: `공개 테스트 단지 ${id}`, memo: '합성 기록' });
const denied = error => error.code === 'VERSION_STORE_ACCESS_DENIED';

test('anonymous reads and writes never reveal or alter a known local owner', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('a')] }); storage.setItem(RECORD_OWNER_KEY, 'a');
  const before = [...storage.data];
  const store = createVersionStore({ storage, accountUid: null, eventTarget: null });
  assert.equal(store.getAccess().status, 'signed-out');
  assert.deepEqual(store.getShared().visits, []);
  assert.equal(store.getConditions().workplaces.length, 0);
  assert.throws(() => store.saveVisit(record('b')), denied);
  assert.throws(() => store.getSharedFingerprint(), denied);
  assert.deepEqual([...storage.data], before);
});

test('legacy ownership requires an explicit confirmation without changing original bytes', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('a')], [V2_CONDITIONS_KEY]: { maxPriceManWon: 93000, workplaces: [{ id: 'w-a', name: '합성 회사', address: '합성 주소' }] } });
  const originals = [...storage.data];
  const store = createVersionStore({ storage, accountUid: 'a', eventTarget: null });
  assert.equal(store.getAccess().status, 'legacy-unverified');
  assert.deepEqual(store.getShared().visits, []);
  assert.equal(store.getConditions().maxPriceManWon, 70000);
  assert.throws(() => store.saveConditions({ maxPriceManWon: 60000 }), denied);
  assert.deepEqual([...storage.data], originals);
  store.claimLegacy();
  assert.equal(storage.getItem(RECORD_OWNER_KEY), 'a');
  assert.equal(store.getShared().visits[0].id, 'a');
  assert.equal(store.getConditions().maxPriceManWon, 70000);
  store.importLegacyV2Conditions();
  assert.equal(store.getConditions().maxPriceManWon, 93000);
  for (const [key, value] of originals) assert.equal(storage.getItem(key), value);
});

test('A to B to A locks shared records and keeps each UID conditions untouched', () => {
  const storage = memory(); let active = 'a';
  const store = createVersionStore({ storage, accountUid: () => active, eventTarget: null });
  store.saveVisit(record('a')); store.saveConditions({ maxPriceManWon: 65000 }); store.saveUI({ view: 'records', compareIds: ['a'] });
  const conditionA = storage.getItem(accountStorageKey(V2_CONDITIONS_KEY, 'a'));
  active = 'b';
  assert.equal(store.getAccess().status, 'owner-mismatch');
  assert.deepEqual(store.getShared().visits, []); assert.deepEqual(store.getUI().compareIds, []);
  assert.equal(store.getConditions().maxPriceManWon, 70000);
  assert.throws(() => store.saveVisit(record('b')), denied);
  assert.throws(() => store.saveConditions({ maxPriceManWon: 55000 }), denied);
  active = 'a';
  assert.equal(store.getShared().visits[0].id, 'a');
  assert.equal(store.getConditions().maxPriceManWon, 65000);
  assert.equal(storage.getItem(accountStorageKey(V2_CONDITIONS_KEY, 'a')), conditionA);
});

test('explicit B restore preserves originals and never imports A company conditions', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('a')],
    [V2_CONDITIONS_KEY]: { maxPriceManWon: 99000, workplaces: [{ id: 'wa', name: '합성 회사 A', address: '합성 주소 A' }] },
    homehunt_recommendation_filters_v1: { maxPriceManWon: 88000, workplaces: [{ id: 'wa', name: '합성 회사 A', address: '합성 주소 A' }] } });
  storage.setItem(RECORD_OWNER_KEY, 'a');
  const oldVisits = storage.getItem(SHARED_RECORD_KEYS.visits), oldConditions = storage.getItem(V2_CONDITIONS_KEY);
  const store = createVersionStore({ storage, accountUid: 'b', eventTarget: null });
  const expectedFingerprint = store.getSharedFingerprint();
  assert.ok(!expectedFingerprint.includes('합성 기록'));
  assert.throws(() => store.applyBackupSnapshot({ visits: [record('b')] }), denied);
  store.applyBackupSnapshot({ visits: [record('b')] }, { accountUid: 'b', explicitRestore: true, expectedFingerprint });
  assert.equal(store.getAccess().locked, false); assert.equal(store.getShared().visits[0].id, 'b');
  assert.equal(store.getConditions().workplaces.length, 0);
  assert.throws(() => store.importLegacyV2Conditions(), denied);
  assert.throws(() => store.importV1Conditions(), denied);
  assert.equal(storage.getItem(V2_CONDITIONS_KEY), oldConditions);
  assert.equal(storage.getItem(LEGACY_PERSONAL_OWNER_KEY), 'a');
  const recovery = [...storage.data].filter(([key]) => key.startsWith('homehunt_record_recovery_v1_'));
  assert.equal(recovery.length, 1);
  assert.equal(JSON.parse(recovery[0][1]).values[SHARED_RECORD_KEYS.visits], oldVisits);
  store.saveConditions({ maxPriceManWon: 59000 });
  assert.equal(JSON.parse(storage.getItem(accountStorageKey(V2_CONDITIONS_KEY, 'b'))).maxPriceManWon, 59000);
});

test('locked fingerprints detect changes during a cloud read and restoration owner must match caller', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('a')] }); storage.setItem(RECORD_OWNER_KEY, 'a');
  const store = createVersionStore({ storage, accountUid: 'b', eventTarget: null });
  const expectedFingerprint = store.getSharedFingerprint();
  storage.setItem(SHARED_RECORD_KEYS.visits, JSON.stringify([{ ...record('a'), memo: '다른 탭 합성 변경' }]));
  assert.throws(() => store.applyBackupSnapshot({ visits: [record('b')] }, { accountUid: 'b', explicitRestore: true, expectedFingerprint }), error => error.code === 'VERSION_STORE_CONFLICT');
  assert.throws(() => store.applyBackupSnapshot({ visits: [record('b')] }, { accountUid: 'a', explicitRestore: true }), denied);
  assert.equal(storage.getItem(RECORD_OWNER_KEY), 'a');
});

test('first explicit record write binds owner before value writes and subscription announces locking', () => {
  const storage = memory(); const events = new EventTarget(); let active = 'a'; const states = [];
  const store = createVersionStore({ storage, accountUid: () => active, eventTarget: events });
  store.subscribe(value => states.push(value.access.status));
  store.saveVisit(record('a'));
  assert.equal(storage.writes[0], RECORD_OWNER_KEY);
  active = 'b'; store.refreshAccess(); assert.equal(states.at(-1), 'owner-mismatch');
  assert.deepEqual(store.getShared().visits, []);
  store.dispose(); assert.equal(store.getAccess().status, 'signed-out');
});

test('Ver1 guarded reads and UID writes keep company and subscription originals isolated after B restore', () => {
  const originalStorage = globalThis.localStorage;
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('a')], homehunt_recommendation_filters_v1: { maxPriceManWon: 88000, workplaces: [{ id: 'a', address: '합성 회사 A' }] }, homehunt_subscription_profile_v1: { married: true } });
  globalThis.localStorage = storage; let active = 'a';
  configureHomehuntStorageAccount({ getUid: () => active });
  try {
    claimLocalLegacyRecords({ storage, uid: 'a' });
    const original = storage.getItem('homehunt_recommendation_filters_v1');
    saveRecommendationFilters({ maxPriceManWon: 66000 });
    assert.equal(storage.getItem('homehunt_recommendation_filters_v1'), original);
    assert.equal(loadRecommendationFilters().maxPriceManWon, 66000);
    active = 'b'; assert.equal(loadVisits(), null); assert.equal(loadRecommendationFilters(), null); assert.equal(loadSubscriptionProfile(), null);
    const store = createVersionStore({ storage, accountUid: () => active, eventTarget: null });
    store.applyBackupSnapshot({ visits: [record('b')] }, { explicitRestore: true, accountUid: 'b' });
    assert.equal(loadRecommendationFilters(), null); assert.equal(loadSubscriptionProfile(), null);
    saveRecommendationFilters({ maxPriceManWon: 57000 }); saveSubscriptionProfile({ married: false });
    assert.equal(loadRecommendationFilters().maxPriceManWon, 57000); assert.equal(loadSubscriptionProfile().married, false);
    assert.equal(JSON.parse(storage.getItem('homehunt_subscription_profile_v1')).married, true);
    active = 'a'; assert.equal(loadRecommendationFilters(), null);
    store.applyBackupSnapshot({ visits: [record('a')] }, { explicitRestore: true, accountUid: 'a' });
    assert.equal(loadRecommendationFilters().maxPriceManWon, 66000);
    assert.equal(loadSubscriptionProfile().married, true);
  } finally { configureHomehuntStorageAccount(); globalThis.localStorage = originalStorage; }
});

test('Ver1 direct visit deletion denies a different owner without touching the original', () => {
  const originalStorage = globalThis.localStorage;
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('a')] });
  storage.setItem(RECORD_OWNER_KEY, 'a'); globalThis.localStorage = storage;
  let active = 'b'; configureHomehuntStorageAccount({ getUid: () => active });
  const original = storage.getItem(SHARED_RECORD_KEYS.visits);
  try {
    assert.throws(() => clearVisits(), /다른 계정/);
    assert.equal(storage.getItem(SHARED_RECORD_KEYS.visits), original);
    active = null; assert.throws(() => clearVisits(), /로그인/);
    assert.equal(storage.getItem(SHARED_RECORD_KEYS.visits), original);
    active = 'a'; clearVisits(); assert.equal(storage.getItem(SHARED_RECORD_KEYS.visits), null);
  } finally { configureHomehuntStorageAccount(); globalThis.localStorage = originalStorage; }
});

test('failed explicit cross-owner restore preserves recovery and restores original ownership', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('a')], homehunt_recommendation_filters_v1: { workplaces: [{ id: 'a', address: '합성 회사 A' }] } });
  storage.setItem(RECORD_OWNER_KEY, 'a');
  const original = storage.getItem(SHARED_RECORD_KEYS.visits);
  const originalSet = storage.setItem.bind(storage);
  let failOnce = true;
  storage.setItem = (key, value) => {
    if (key === SHARED_RECORD_KEYS.shortlist && failOnce) { failOnce = false; throw new Error('합성 저장 실패'); }
    return originalSet(key, value);
  };
  const store = createVersionStore({ storage, accountUid: 'b', eventTarget: null });
  assert.throws(() => store.applyBackupSnapshot({ visits: [record('b')] }, { explicitRestore: true, accountUid: 'b' }), error => error.code === 'VERSION_STORE_UNAVAILABLE');
  assert.equal(storage.getItem(RECORD_OWNER_KEY), 'a');
  assert.equal(storage.getItem(LEGACY_PERSONAL_OWNER_KEY), null);
  assert.equal(storage.getItem(SHARED_RECORD_KEYS.visits), original);
  assert.equal(store.getAccess().status, 'owner-mismatch');
  const recovery = [...storage.data].filter(([key]) => key.startsWith('homehunt_record_recovery_v1_'));
  assert.equal(recovery.length, 1);
  assert.equal(JSON.parse(recovery[0][1]).values[SHARED_RECORD_KEYS.visits], original);
});
