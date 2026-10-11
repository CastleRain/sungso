import test from 'node:test';
import assert from 'node:assert/strict';
import { createVersionStore as createAccountVersionStore, SHARED_RECORD_KEYS, V2_CONDITIONS_KEY, V2_UI_KEY, RECORD_OWNER_KEY, LEGACY_PERSONAL_OWNER_KEY, accountStorageKey, getLocalRecordAccess } from '../../../shared/homehunt/homehunt-version-store.mjs';
import { createCloudSession } from '../js/cloud-session.js';
import { mountCloudPanel } from '../js/cloud-panel.js';
import { normalizeCloudSnapshot } from '../../../shared/homehunt/cloud-snapshot-core.mjs';

function memory(values = {}) {
  const data = new Map(Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]));
  return { getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key), data };
}
const record = (id, memo = '') => ({ id, name: `집 ${id}`, memo, areaM2: 59, askingPrice: 60000 });
// These legacy behavior fixtures explicitly confirm synthetic ownership first.
function createVersionStore(options) {
  const store = createAccountVersionStore({ ...options, accountUid: 'test-owner' });
  if (store.getAccess().canClaimLegacy) store.claimLegacy();
  return store;
}

test('V2 defaults are independent and reading does not migrate V1 filters', () => {
  const key = 'homehunt_recommendation_filters_v1';
  const storage = memory({ [key]: { minAreaM2: 84, targetPriceManWon: 90000, workplaces: [] } });
  const raw = storage.getItem(key); const store = createVersionStore({ storage, eventTarget: null });
  assert.equal(store.getConditions().minAreaM2, 59);
  assert.equal(store.getConditions().comfortPriceManWon, 60000);
  assert.equal(store.getConditions().maxPriceManWon, 70000);
  assert.equal(store.getConditions().minHouseholds, null);
  store.saveConditions({ maxPriceManWon: 68000, minAreaM2: 70 });
  assert.equal(storage.getItem(key), raw);
  assert.ok(storage.getItem(accountStorageKey(V2_CONDITIONS_KEY, 'test-owner')));
});

test('V1 conditions are imported only by explicit action and source remains byte-identical', () => {
  const key = 'homehunt_recommendation_filters_v1';
  const storage = memory({ [key]: { targetPriceManWon: 60000, maxOverBudgetPct: 10, minAreaM2: 84, minHouseholds: 500 } });
  const raw = storage.getItem(key); const store = createVersionStore({ storage, eventTarget: null });
  const imported = store.importV1Conditions();
  assert.equal(imported.comfortPriceManWon, 60000); assert.equal(imported.maxPriceManWon, 66000);
  assert.equal(imported.minAreaM2, 84); assert.equal(imported.minHouseholds, 500);
  assert.equal(storage.getItem(key), raw);
});

test('V2 mutations share existing V1 keys without changing unrelated fields', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('v1')], [SHARED_RECORD_KEYS.supplyFavorites]: ['s1'] });
  const store = createVersionStore({ storage, eventTarget: null });
  store.addFavorite({ id: 'f1', name: '관심' });
  assert.deepEqual(store.getShared().visits, [record('v1'),].map(item => ({ ...item, needsLocationResolution: true })));
  assert.deepEqual(store.getShared().supplyFavorites, ['s1']);
  assert.equal(JSON.parse(storage.getItem(SHARED_RECORD_KEYS.shortlist))[0].id, 'f1');
});

test('stale whole-array writes preserve another tab addition and deletion', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('a'), record('b')] });
  const a = createVersionStore({ storage, eventTarget: null }), b = createVersionStore({ storage, eventTarget: null });
  const oldA = a.getShared().visits; b.saveVisit(record('c')); b.deleteVisit('b');
  a.saveSharedField('visits', [record('d'), ...oldA]);
  assert.deepEqual(a.getShared().visits.map(item => item.id).sort(), ['a', 'c', 'd']);
});

test('concurrent edits to the same record fail without deleting the latest data', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('a')] });
  const a = createVersionStore({ storage, eventTarget: null }), b = createVersionStore({ storage, eventTarget: null });
  a.getShared(); b.saveVisit(record('a', '새 메모'));
  assert.throws(() => a.saveVisit(record('a', '오래된 편집')), error => error.code === 'VERSION_STORE_CONFLICT');
  assert.equal(b.getShared().visits[0].memo, '새 메모');
});

test('an editor may retain an expected record even after subscription refreshes', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('a')] });
  const a = createVersionStore({ storage, eventTarget: null }), b = createVersionStore({ storage, eventTarget: null });
  const expectedRecord = a.getShared().visits[0]; b.saveVisit(record('a', '다른 화면'));
  a.getShared();
  assert.throws(() => a.saveVisit(record('a', '편집창'), { expectedRecord }), error => error.code === 'VERSION_STORE_CONFLICT');
});

test('provider routes and derived ranking never reach shared writes', () => {
  const storage = memory(); const store = createVersionStore({ storage, eventTarget: null });
  store.addFavorite({ id: 'f1', name: '관심', provider: 'kakao', lat: 37, lng: 127,
    commute: { durationMinutes: 30 }, routes: [{ provider: 'tmap', durationMinutes: 20 }], score: 90 });
  const item = store.getShared().shortlist[0];
  assert.equal(item.name, '관심');
  for (const key of ['provider', 'commute', 'routes', 'score', 'lat', 'lng']) assert.equal(key in item, false);
  assert.equal(item.needsLocationResolution, true);
});

test('personal manual and official coordinates survive; provider-derived coordinates do not', () => {
  const storage = memory(); const store = createVersionStore({ storage, eventTarget: null });
  store.saveVisit({ ...record('a'), lat: 37, lng: 127, coordinateSource: 'manual' });
  assert.equal(store.getShared().visits[0].lat, 37);
  store.saveVisit({ ...record('b'), lat: 37, lng: 127, coordinateSource: 'manual', provider: 'naver' });
  assert.equal(store.getShared().visits.find(value => value.id === 'b').lat, undefined);
});

test('parking merges per apartment and ignores official observations', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.parkingObservations]: { a: { sourceType: 'field', spacesPerHousehold: 1, observedAt: '2026-10-01' } } });
  const a = createVersionStore({ storage, eventTarget: null }), b = createVersionStore({ storage, eventTarget: null });
  const older = a.getShared().parkingObservations;
  b.saveSharedField('parkingObservations', { ...older, b: { sourceType: 'field', spacesPerHousehold: 1.2 } });
  a.saveSharedField('parkingObservations', { ...older, c: { sourceType: 'field', spacesPerHousehold: 0 }, z: { sourceType: 'official', spacesPerHousehold: 4 } });
  assert.deepEqual(Object.keys(a.getShared().parkingObservations).sort(), ['a', 'b', 'c']);
});

test('same-window and external storage subscriptions refresh but do not overwrite pending baselines', () => {
  const storage = memory(); const events = new EventTarget();
  const a = createVersionStore({ storage, eventTarget: events }), b = createVersionStore({ storage, eventTarget: events });
  let notified = 0; const unsubscribe = a.subscribe(() => notified++, { emitCurrent: false });
  b.addFavorite({ id: 'f', name: '관심' }); assert.equal(notified, 1);
  const event = new Event('storage'); Object.defineProperty(event, 'key', { value: SHARED_RECORD_KEYS.visits }); events.dispatchEvent(event);
  assert.equal(notified, 2); unsubscribe(); a.dispose(); b.dispose();
});

test('cloud backup merge preserves remote V1 filters, revision and comparison while using shared records', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('a')], 'homehunt_recommendation_filters_v1': { minAreaM2: 84, workplaces: [] } });
  const store = createVersionStore({ storage, eventTarget: null });
  store.saveConditions({ minAreaM2: 59, maxPriceManWon: 70000 });
  const remote = { revision: 7, updatedAt: '2026-10-01', snapshot: {
    recommendationFilters: { minAreaM2: 99, targetPriceManWon: 95000, workplaces: [] }, compareIds: ['a'], visits: [record('a')],
  } };
  const merged = store.mergeBackupSnapshot(remote);
  assert.equal(merged.revision, 7); assert.equal(merged.updatedAt, '2026-10-01');
  assert.equal(merged.snapshot.recommendationFilters.minAreaM2, 99);
  assert.equal(merged.snapshot.recommendationFilters.targetPriceManWon, 95000);
  assert.deepEqual(merged.snapshot.compareIds, ['a']);
  assert.equal(store.getBackupSnapshot().recommendationFilters.minAreaM2, 84);
  assert.equal(store.getBackupSnapshot(remote.snapshot).recommendationFilters.minAreaM2, 99);
});

test('explicit backup restore writes shared records while both versions conditions stay unchanged', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('local')],
    homehunt_recommendation_filters_v1: { minAreaM2: 84, workplaces: [] },
    [V2_CONDITIONS_KEY]: { minAreaM2: 59, maxPriceManWon: 70000 } });
  const store = createVersionStore({ storage, eventTarget: null });
  store.applyBackupSnapshot({ recommendationFilters: { minAreaM2: 120, workplaces: [] }, visits: [record('remote')], shortlist: [{ id: 'f', name: '관심' }] });
  assert.deepEqual(store.getShared().visits.map(item => item.id), ['remote']);
  assert.equal(store.getShared().shortlist[0].id, 'f');
  assert.equal(JSON.parse(storage.getItem('homehunt_recommendation_filters_v1')).minAreaM2, 84);
  assert.equal(store.getConditions().minAreaM2, 59);
});

test('failed multi-field backup restore rolls back already written record keys', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('old')], [SHARED_RECORD_KEYS.shortlist]: [{ id: 'old-f', name: '이전' }] });
  const originalWrite = storage.setItem; let shouldFail = true;
  storage.setItem = (key, value) => {
    if (key === SHARED_RECORD_KEYS.shortlist && shouldFail) { shouldFail = false; throw new Error('quota'); }
    originalWrite(key, value);
  };
  const store = createVersionStore({ storage, eventTarget: null });
  assert.throws(() => store.applyBackupSnapshot({ visits: [record('new')] }), error => error.code === 'VERSION_STORE_UNAVAILABLE');
  assert.equal(store.getShared().visits[0].id, 'old');
  assert.equal(store.getShared().shortlist[0].id, 'old-f');
});

test('damaged JSON reads safely without mutation and blocked storage fails explicitly', () => {
  const storage = memory(); storage.setItem(SHARED_RECORD_KEYS.visits, '{bad');
  const store = createVersionStore({ storage, eventTarget: null });
  assert.deepEqual(store.getShared().visits, []); assert.equal(storage.getItem(SHARED_RECORD_KEYS.visits), '{bad');
  const unavailable = createVersionStore({ storage: null, eventTarget: null });
  assert.throws(() => unavailable.saveConditions({}), error => error.code === 'VERSION_STORE_UNAVAILABLE');
});

test('V2 UI does not persist provider data or overwrite the V1 screen key', () => {
  const storage = memory({ homehunt_view_v1: 'market' }); const store = createVersionStore({ storage, eventTarget: null });
  store.saveUI({ view: 'research', compareIds: ['a', 'b'], routes: [{ provider: 'kakao' }] });
  assert.equal(JSON.parse(storage.getItem('homehunt_view_v1')), 'market');
  assert.equal('routes' in JSON.parse(storage.getItem(accountStorageKey(V2_UI_KEY, 'test-owner'))), false);
});

test('backup previews never mutate records, either versions conditions, or revision', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('local')], homehunt_recommendation_filters_v1: { minAreaM2: 84 } });
  const store = createVersionStore({ storage, eventTarget: null });
  const before = [...storage.data];
  const remote = { revision: 12, snapshot: { recommendationFilters: { minAreaM2: 99 }, visits: [record('remote')] } };
  const raw = JSON.stringify(remote);
  const preview = store.mergeBackupSnapshot(remote);
  assert.equal(preview.revision, 12); assert.equal(JSON.stringify(remote), raw); assert.deepEqual([...storage.data], before);
});

test('restore rejects a shared-record change during a remote read before writing any field', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('a')] });
  const store = createVersionStore({ storage, eventTarget: null });
  const expectedFingerprint = store.getSharedFingerprint();
  storage.setItem(SHARED_RECORD_KEYS.visits, JSON.stringify([record('a', '다른 탭 수정')]));
  assert.throws(() => store.applyBackupSnapshot({ visits: [record('remote')] }, { expectedFingerprint }), error => error.code === 'VERSION_STORE_CONFLICT');
  assert.equal(store.getShared().visits[0].memo, '다른 탭 수정');
});

test('reserved shared fields and malformed restore cannot mutate browser records', () => {
  const storage = memory({ [SHARED_RECORD_KEYS.visits]: [record('a')] });
  const store = createVersionStore({ storage, eventTarget: null }); const before = [...storage.data];
  assert.throws(() => store.saveSharedField('__proto__', []), error => error.code === 'VERSION_STORE_INVALID');
  assert.throws(() => store.applyBackupSnapshot({ visits: [{ id: '__proto__' }] }));
  assert.deepEqual([...storage.data], before);
});

function authFixture() {
  let observer; let account = { uid: 'uid-a', emailVerified: true, getIdToken: async () => 'synthetic' };
  const reads = [], writes = [];
  const sdk = {
    getApps: () => [], initializeApp: config => ({ options: config }), getAuth: () => ({}),
    browserLocalPersistence: {}, setPersistence: async () => {}, getFirestore: () => ({}),
    onAuthStateChanged: (_, callback) => { observer = callback; callback(account); return () => {}; },
    doc: (_db, collection, uid) => ({ path: `${collection}/${uid}` }),
    getDocFromServer: async ref => { reads.push(ref.path); return { exists: () => false }; },
    runTransaction: async (_db, callback) => callback({ get: async () => ({ exists: () => false }), set: ref => writes.push(ref.path) }),
  };
  return { sdk, reads, writes, switch: uid => { account = { ...account, uid }; observer(account); } };
}

test('account change in saveSnapshot init microtask never writes old records into the new UID', async () => {
  const fixture = authFixture();
  const session = createCloudSession({ firebaseConfig: { apiKey: 'public', projectId: 'test', authDomain: 'test.test' }, loadSdk: async () => fixture.sdk });
  await session.init();
  const pending = session.saveSnapshot({ visits: [record('a')] }, 0);
  fixture.switch('uid-b');
  await assert.rejects(pending, error => error.code === 'CLOUD_SESSION_CHANGED');
  assert.deepEqual(fixture.writes, []);
});

test('loadSnapshot and explicit expected UID reject an account switch before the first DB read', async () => {
  const fixture = authFixture();
  const session = createCloudSession({ firebaseConfig: { apiKey: 'public', projectId: 'test', authDomain: 'test.test' }, loadSdk: async () => fixture.sdk });
  await session.init(); const pending = session.loadSnapshot(); fixture.switch('uid-b');
  await assert.rejects(pending, error => error.code === 'CLOUD_SESSION_CHANGED');
  await assert.rejects(session.saveSnapshot({ visits: [record('a')] }, 0, { expectedUid: 'uid-a' }), error => error.code === 'CLOUD_SESSION_CHANGED');
  assert.deepEqual(fixture.reads, []); assert.deepEqual(fixture.writes, []);
});

test('API snapshot path also rejects init-time account changes without a network mutation', async () => {
  const fixture = authFixture(); let calls = 0;
  const session = createCloudSession({ firebaseConfig: { apiKey: 'public', projectId: 'test', authDomain: 'test.test' },
    apiBaseUrl: 'https://example.test/api', snapshotTransport: 'api', loadSdk: async () => fixture.sdk,
    fetchImpl: async () => { calls++; return new Response('{}'); } });
  await session.init(); const pending = session.saveSnapshot({ visits: [record('a')] }, 0, { expectedUid: 'uid-a' }); fixture.switch('uid-b');
  await assert.rejects(pending, error => error.code === 'CLOUD_SESSION_CHANGED'); assert.equal(calls, 0);
});

class PanelElement extends EventTarget {
  constructor(tag, ownerDocument) { super(); this.tagName = tag; this.ownerDocument = ownerDocument; this.children = []; this.dataset = {}; this.classList = { add() {} }; this.ownText = ''; }
  set textContent(value) { this.ownText = value; this.children = []; }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.ownText = ''; this.children = nodes; }
  setAttribute() {}
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
}
function accountPanel({ storage = memory(), remote = null, local = { visits: [record('local')] }, load, failApply = false } = {}) {
  const document = { createElement: tag => new PanelElement(tag, document) }; const root = document.createElement('section');
  let listener; let state = { configured: true, transport: 'firestore', status: 'signed-out', user: null }; let writes = 0, applied = 0;
  let localValue = normalizeCloudSnapshot(local);
  const session = { getState: () => state, init: async () => state,
    subscribe: callback => { listener = callback; callback(state); return () => {}; },
    signIn: async () => { state = { ...state, status: 'signed-in', user: { uid: 'uid-a' } }; listener(state); },
    loadSnapshot: async () => load ? load() : { snapshot: remote == null ? null : normalizeCloudSnapshot(remote), revision: remote ? 3 : 0 },
    saveSnapshot: async (value, expected, options) => { assert.equal(options.expectedUid, 'uid-a'); writes++; return { snapshot: value, revision: expected + 1 }; } };
  mountCloudPanel({ root, session, storage, captureSnapshot: () => localValue,
    applySnapshot: value => { if (failApply) throw new Error('blocked'); applied++; localValue = value; } });
  return { root, storage, setLocal: value => { localValue = normalizeCloudSnapshot(value); },
    click: async action => { root.descendants().find(item => item.dataset.cloudAction === action).dispatchEvent(new Event('click')); await new Promise(resolve => setImmediate(resolve)); },
    get writes() { return writes; }, get applied() { return applied; } };
}

test('Ver1 blocks uploading a different UID owned local record and leaves both sides untouched', async () => {
  const storage = memory(); storage.setItem('homehunt_shared_records_owner_uid_v1', 'uid-b');
  const panel = accountPanel({ storage }); await panel.click('login'); await panel.click('save');
  assert.equal(panel.writes, 0); assert.equal(panel.applied, 0);
  assert.match(panel.root.textContent, /다른 계정의 기록/);
});

test('Ver1 will not replace an existing remote backup from an empty device', async () => {
  const panel = accountPanel({ local: {}, remote: { visits: [record('remote')] } });
  await panel.click('login'); await panel.click('save'); await panel.click('replace');
  assert.equal(panel.writes, 0); assert.match(panel.root.textContent, /기록이 비어/);
});

test('unbound device must restore conflicting remote records before upload, then owns the requested UID', async () => {
  const panel = accountPanel({ remote: { visits: [record('remote')] } });
  await panel.click('login'); await panel.click('save'); assert.equal(panel.writes, 0);
  assert.match(panel.root.textContent, /계정이 아직 확인되지/);
  await panel.click('load'); assert.equal(panel.applied, 1);
  assert.equal(panel.storage.getItem('homehunt_shared_records_owner_uid_v1'), 'uid-a');
});

test('first explicit successful backup binds UID without changing other local keys', async () => {
  const storage = memory(); storage.setItem('homehunt_view_v1', 'market');
  const panel = accountPanel({ storage }); await panel.click('login'); await panel.click('save');
  assert.equal(panel.writes, 1); assert.equal(storage.getItem('homehunt_shared_records_owner_uid_v1'), 'uid-a');
  assert.equal(storage.getItem('homehunt_view_v1'), 'market');
});

test('Ver1 restore refuses a local edit during remote load and failed apply restores previous ownership', async () => {
  let release;
  const panel = accountPanel({ load: () => new Promise(resolve => { release = resolve; }) });
  await panel.click('login'); const operation = panel.click('load'); await Promise.resolve();
  panel.setLocal({ visits: [record('local', '편집됨')] }); release({ snapshot: normalizeCloudSnapshot({ visits: [record('remote')] }), revision: 3 }); await operation;
  assert.equal(panel.applied, 0); assert.match(panel.root.textContent, /기기 기록이 변경/);
  const storage = memory(); storage.setItem('homehunt_shared_records_owner_uid_v1', 'uid-b');
  const failure = accountPanel({ storage, remote: { visits: [record('remote')] }, failApply: true });
  await failure.click('login'); await failure.click('load');
  assert.equal(storage.getItem('homehunt_shared_records_owner_uid_v1'), 'uid-b');
});
