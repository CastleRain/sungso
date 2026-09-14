import test from 'node:test';
import assert from 'node:assert/strict';
import { blankState, validateState, upsertRecord, removeRecord, toggleRecord, addRecipeIngredients, foodCandidates, guestSummary, safeExternalUrl, RECORD_LIMIT } from '../../shared/life/core.mjs';
import { createLifeStore, LifeConflictError, LifeStorageError } from '../../shared/life/local-store.mjs';

const add = (state, kind, record) => upsertRecord(state, kind, record);
function fixtureState() {
  let state = add(blankState(), 'places', { id: 'place-a', name: '동네 식당', category: 'restaurant' });
  state = add(state, 'visits', { id: 'visit-a', placeId: 'place-a', date: '2030-02-03', memo: '합성 방문' });
  return add(state, 'albums', { id: 'album-a', title: '합성 사진첩', url: 'https://photos.example.test/album', visitId: 'visit-a' });
}
function storageFixture() {
  const values = new Map(), writes = [];
  let fail = false;
  return {
    values, writes,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { if (fail) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); values.set(key, value); writes.push({ key, value }); },
    failWrites(value = true) { fail = value; },
  };
}
function locksFixture() {
  let tail = Promise.resolve();
  const calls = [];
  return { calls, request(name, options, callback) { calls.push({ name, options }); const run = tail.then(callback); tail = run.catch(() => {}); return run; } };
}
const options = (storage, locks, extra = {}) => ({ uid: 'synthetic-member-a', isCurrent: () => true, storage, locks, eventTarget: new EventTarget(), ...extra });
function fireStorage(target, storage, key) {
  const event = new Event('storage'); Object.assign(event, { storageArea: storage, key }); target.dispatchEvent(event);
}

test('blank and immutable CRUD preserve all seven collections and plain text', () => {
  const state = blankState(), original = structuredClone(state);
  let next = add(state, 'shopping', { id: 'item-a', name: ' <img src=x> ', quantity: '한 봉', memo: '합성 메모' });
  assert.equal(next.shopping[0].name, '<img src=x>');
  assert.equal(next.shopping[0].quantity, '한 봉');
  assert.equal(next.shopping[0].done, false);
  next = toggleRecord(next, 'shopping', 'item-a');
  assert.equal(next.shopping[0].done, true);
  next = add(next, 'shopping', { id: 'item-a', memo: '수정' });
  assert.equal(next.shopping[0].name, '<img src=x>');
  assert.equal(next.shopping.length, 1);
  assert.equal(removeRecord(next, 'shopping', 'item-a').shopping.length, 0);
  assert.deepEqual(state, original);
  assert.deepEqual(Object.keys(state), ['schemaVersion', 'revision', 'shopping', 'recipes', 'places', 'visits', 'albums', 'guests', 'tasks']);
});

test('record and field limits reject invalid or unknown data instead of silently truncating it', () => {
  const state = blankState();
  assert.throws(() => add(state, 'tasks', { id: 'task-a', title: '가'.repeat(121) }), /120/);
  assert.throws(() => add(state, 'tasks', { id: 'task-a', title: '할 일', extra: 'unknown' }), /형식/);
  assert.throws(() => add(state, 'shopping', { id: 'item-a', name: '품목', done: 'false' }), /체크/);
  assert.throws(() => add(state, 'recipes', { id: 'recipe-a', title: '요리', ingredients: [''] }), /재료/);
  assert.throws(() => add(state, 'recipes', { id: 'recipe-a', title: '요리', ingredients: Array(101).fill('재료') }), /100/);
  const full = { ...state, tasks: Array.from({ length: RECORD_LIMIT }, (_, index) => ({ id: `task-${index}`, title: '합성 할 일', done: false, memo: '' })) };
  assert.throws(() => add(full, 'tasks', { id: 'new-task', title: '추가' }), /500/);
  assert.equal(add(full, 'tasks', { id: 'task-0', title: '수정' }).tasks.length, RECORD_LIMIT);
  const duplicate = { ...state, tasks: [{ id: 'same', title: '하나' }, { id: 'same', title: '둘' }] };
  assert.throws(() => validateState(duplicate), /겹쳐/);
  assert.throws(() => validateState({ schemaVersion: 1, revision: 0 }), /원본/);
  assert.throws(() => validateState({ ...state, schemaVersion: 2 }), /형식/);
});

test('only absolute HTTPS URLs without credentials or control characters can be opened', () => {
  assert.equal(safeExternalUrl('  https://example.test/path?q=한글  '), 'https://example.test/path?q=%ED%95%9C%EA%B8%80');
  assert.equal(safeExternalUrl(''), '');
  for (const url of ['http://example.test', 'javascript:alert(1)', 'data:text/html,hi', '//example.test', 'https://user:pass@example.test', 'https://user@example.test', 'https://exam\nple.test', 'https://example.test/a b']) assert.throws(() => safeExternalUrl(url));
  assert.throws(() => add(blankState(), 'albums', { id: 'album-a', title: '사진첩', url: '' }), /링크/);
});

test('visits require real dates and existing places; albums require existing linked visits', () => {
  const state = add(blankState(), 'places', { id: 'place-a', name: '장소' });
  assert.throws(() => add(state, 'visits', { id: 'visit-a', placeId: 'place-a', date: '2030-02-30' }), /날짜/);
  assert.throws(() => add(state, 'visits', { id: 'visit-a', placeId: 'missing', date: '2030-02-03' }), /장소/);
  assert.throws(() => add(state, 'albums', { id: 'album-a', title: '사진첩', url: 'https://example.test', visitId: 'missing' }), /방문/);
  assert.equal(add(state, 'visits', { id: 'visit-a', placeId: 'place-a', date: '2032-02-29' }).visits[0].date, '2032-02-29');
});

test('deleting a linked place archives it and linked visit deletion preserves photo history', () => {
  const state = fixtureState(), original = structuredClone(state);
  const archived = removeRecord(state, 'places', 'place-a');
  assert.equal(archived.places[0].archived, true);
  assert.equal(archived.visits.length, 1);
  assert.equal(archived.albums.length, 1);
  assert.throws(() => removeRecord(archived, 'visits', 'visit-a'), /연결을 먼저 해제/);
  const detached = add(archived, 'albums', { id: 'album-a', visitId: '' });
  const noVisit = removeRecord(detached, 'visits', 'visit-a');
  assert.equal(noVisit.albums.length, 1);
  assert.equal(removeRecord(noVisit, 'places', 'place-a').places.length, 0);
  assert.deepEqual(state, original);
});

test('recipe ingredient selection creates independent copies and deduplicates only pending copies', () => {
  const state = add(blankState(), 'recipes', { id: 'recipe-a', title: '합성 요리', ingredients: ['두부 한 모', '간장 조금', '두부 한 모'], steps: '재료 준비\n함께 익히기' });
  const selected = addRecipeIngredients(state, 'recipe-a', [0, 1, 0, 2]);
  assert.equal(state.shopping.length, 0);
  assert.equal(selected.shopping.length, 2);
  assert.notEqual(selected.shopping[0].id, selected.shopping[1].id);
  assert.ok(selected.shopping.every(record => record.sourceRecipeId === 'recipe-a' && !record.done));
  assert.equal(addRecipeIngredients(selected, 'recipe-a', [0, 1]).shopping.length, 2);
  const done = toggleRecord(selected, 'shopping', selected.shopping[0].id);
  assert.equal(addRecipeIngredients(done, 'recipe-a', [0]).shopping.length, 3);
  const edited = add(selected, 'recipes', { id: 'recipe-a', ingredients: ['다른 재료'] });
  assert.deepEqual(edited.shopping, selected.shopping);
  assert.deepEqual(removeRecord(edited, 'recipes', 'recipe-a').shopping, selected.shopping);
  assert.throws(() => addRecipeIngredients(state, 'recipe-a', [99]), /재료/);
  assert.throws(() => addRecipeIngredients(state, 'missing', [0]), /레시피/);
});

test('long ingredients fit shopping copies and candidates exclude archived/non-food places', () => {
  const recipe = add(blankState(), 'recipes', { id: 'recipe-a', title: '요리', ingredients: ['가'.repeat(200)] });
  assert.equal(addRecipeIngredients(recipe, 'recipe-a', [0]).shopping[0].name.length, 200);
  let state = blankState();
  for (const [id, category, archived] of [['one', 'restaurant', false], ['two', 'cafe', false], ['three', 'date', false], ['four', 'restaurant', true]]) state = add(state, 'places', { id, name: '합성 장소', category, archived });
  assert.deepEqual(foodCandidates(state).map(record => record.id), ['one', 'two']);
  assert.equal(toggleRecord(state, 'places', 'one').places[0].wish, false);
  assert.throws(() => toggleRecord(state, 'recipes', 'one'), /체크/);
});

test('guest summary counts people, invitation records and sides independently', () => {
  let state = blankState();
  for (const record of [{ id: 'guest-a', name: '합성 하객', side: 'sungwoo', attendance: 'yes', invitation: 'sent', count: 3 }, { id: 'guest-b', name: '합성 하객', side: 'sohee', attendance: 'no', count: 2 }, { id: 'guest-c', name: '합성 하객', side: 'both', count: 1 }]) state = add(state, 'guests', record);
  const summary = guestSummary(state);
  assert.deepEqual([summary.totalRecords, summary.totalPeople, summary.confirmedPeople, summary.pendingPeople, summary.declinedPeople, summary.invitedRecords], [3, 6, 3, 1, 2, 1]);
  assert.equal(summary.bySide.sungwoo.confirmedPeople, 3);
  assert.equal(summary.bySide.sohee.declinedPeople, 2);
  assert.equal(summary.bySide.both.pendingPeople, 1);
  for (const count of [0, 21, 1.5, '2']) assert.throws(() => add(state, 'guests', { id: 'bad', name: '하객', count }), /1~20/);
});

test('empty reads and subscriptions do not seed storage, and read values are isolated', async () => {
  const storage = storageFixture(), store = createLifeStore(options(storage, locksFixture()));
  let emitted = 0; const unsubscribe = store.subscribe(() => emitted++);
  const first = store.read(); first.tasks.push({ id: 'task-a', title: '메모리 초안' });
  assert.equal(store.read().tasks.length, 0);
  assert.equal(storage.writes.length, 0); assert.equal(emitted, 0);
  const next = add(blankState(), 'tasks', { id: 'task-a', title: '명시적 저장' });
  const saved = await store.commit(next, { expectedRevision: 0 });
  assert.equal(saved.revision, 1); assert.equal(next.revision, 0); assert.equal(emitted, 1);
  saved.tasks[0].title = '반환값 변경'; assert.equal(store.read().tasks[0].title, '명시적 저장');
  unsubscribe(); store.dispose();
});

test('Web Locks serializes same-account editors and only the first expected revision wins', async () => {
  const storage = storageFixture(), locks = locksFixture();
  const first = createLifeStore(options(storage, locks)), second = createLifeStore(options(storage, locks));
  const firstDraft = add(first.read(), 'tasks', { id: 'task-a', title: '첫 편집' });
  const secondDraft = add(second.read(), 'tasks', { id: 'task-b', title: '두 번째 초안' });
  const results = await Promise.allSettled([first.commit(firstDraft, { expectedRevision: 0 }), second.commit(secondDraft, { expectedRevision: 0 })]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
  assert.ok(results[1].reason instanceof LifeConflictError);
  assert.equal(results[1].reason.latest.revision, 1);
  assert.equal(secondDraft.tasks[0].title, '두 번째 초안');
  assert.equal(storage.writes.length, 1);
  assert.equal(locks.calls[0].name, locks.calls[1].name);
  assert.deepEqual(locks.calls[0].options, { mode: 'exclusive' });
});

test('different UIDs have separate keys, lock names and records', async () => {
  const storage = storageFixture(), locks = locksFixture();
  const first = createLifeStore(options(storage, locks));
  const second = createLifeStore(options(storage, locks, { uid: 'synthetic-member-b' }));
  await first.commit(add(first.read(), 'tasks', { id: 'same-id', title: 'A 합성 기록' }), { expectedRevision: 0 });
  assert.equal(second.read().tasks.length, 0);
  await second.commit(add(second.read(), 'tasks', { id: 'same-id', title: 'B 합성 기록' }), { expectedRevision: 0 });
  assert.equal(first.read().tasks[0].title, 'A 합성 기록');
  assert.equal(second.read().tasks[0].title, 'B 합성 기록');
  assert.notEqual(storage.writes[0].key, storage.writes[1].key);
  assert.notEqual(locks.calls[0].name, locks.calls[1].name);
});

test('quota failure preserves prior bytes and draft so the same revision can be retried', async () => {
  const storage = storageFixture(), store = createLifeStore(options(storage, locksFixture()));
  const saved = await store.commit(add(store.read(), 'tasks', { id: 'task-a', title: '기존 기록' }), { expectedRevision: 0 });
  const oldBytes = [...storage.values.values()][0], draft = add(saved, 'tasks', { id: 'task-a', title: '수정 초안' });
  storage.failWrites();
  await assert.rejects(store.commit(draft, { expectedRevision: 1 }), error => error instanceof LifeStorageError && error.code === 'write-failed');
  assert.equal([...storage.values.values()][0], oldBytes);
  assert.equal(draft.tasks[0].title, '수정 초안');
  storage.failWrites(false);
  assert.equal((await store.commit(draft, { expectedRevision: 1 })).revision, 2);
});

test('missing Web Locks and corrupt saved data never fall back to unsafe writes or resets', async () => {
  const storage = storageFixture(), unavailable = createLifeStore(options(storage, {}));
  await assert.rejects(unavailable.commit(blankState(), { expectedRevision: 0 }), error => error.code === 'locks-unavailable');
  assert.equal(storage.writes.length, 0);
  const store = createLifeStore(options(storage, locksFixture()));
  await store.commit(blankState(), { expectedRevision: 0 });
  const key = storage.writes[0].key;
  for (const bad of ['{broken', JSON.stringify({ schemaVersion: 2, revision: 1 }), JSON.stringify({ ...blankState(), revision: 1, places: [{ id: 'place-a' }] })]) {
    storage.values.set(key, bad);
    assert.throws(() => store.read(), error => error.code === 'corrupt-data');
    await assert.rejects(store.commit(blankState(), { expectedRevision: 0 }), error => error.code === 'corrupt-data');
    assert.equal(storage.values.get(key), bad);
  }
  assert.equal(storage.writes.length, 1);
});

test('account change before a queued lock is granted prevents writes and later private reads', async () => {
  const storage = storageFixture(); let current = true, callback;
  const locks = { request(_name, _options, fn) { return new Promise((resolve, reject) => { callback = () => Promise.resolve().then(fn).then(resolve, reject); }); } };
  const store = createLifeStore(options(storage, locks, { isCurrent: () => current }));
  const pending = store.commit(add(store.read(), 'tasks', { id: 'task-a', title: '합성 초안' }), { expectedRevision: 0 });
  current = false; callback();
  await assert.rejects(pending, error => error.code === 'account-changed');
  assert.equal(storage.writes.length, 0);
  assert.throws(() => store.read(), error => error.code === 'account-changed');
});

test('storage notifications are scoped, preserve corrupt bytes, and stop after disposal/account change', async () => {
  const storage = storageFixture(), target = new EventTarget(), locks = locksFixture(); let current = true;
  const store = createLifeStore(options(storage, locks, { eventTarget: target, isCurrent: () => current }));
  const notices = []; store.subscribe((value, error) => notices.push({ value, error }));
  await store.commit(blankState(), { expectedRevision: 0 });
  const key = storage.writes[0].key;
  fireStorage(target, storage, 'unrelated-key'); assert.equal(notices.length, 1);
  storage.values.set(key, JSON.stringify({ ...blankState(), revision: 2 }));
  fireStorage(target, storage, key); assert.equal(notices.at(-1).value.revision, 2);
  storage.values.set(key, '{broken'); fireStorage(target, storage, key);
  assert.equal(notices.at(-1).value, null); assert.equal(notices.at(-1).error.code, 'corrupt-data');
  assert.equal(storage.values.get(key), '{broken');
  const count = notices.length; current = false; fireStorage(target, storage, key); assert.equal(notices.length, count);
  current = true; store.dispose(); fireStorage(target, storage, key); assert.equal(notices.length, count);
  assert.throws(() => store.read(), error => error.code === 'account-changed');
  await assert.rejects(store.commit(blankState(), { expectedRevision: 0 }), error => error.code === 'account-changed');
});

test('a state made from another revision cannot be committed under a different expected revision', async () => {
  const storage = storageFixture(), store = createLifeStore(options(storage, locksFixture()));
  await assert.rejects(store.commit({ ...blankState(), revision: 7 }, { expectedRevision: 0 }), error => error.code === 'invalid-revision');
  assert.equal(storage.writes.length, 0);
  assert.throws(() => createLifeStore(options(storage, locksFixture(), { uid: '' })), /회원/);
  assert.throws(() => createLifeStore(options(storage, locksFixture(), { isCurrent: undefined })), /회원/);
});
