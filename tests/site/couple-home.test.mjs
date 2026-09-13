import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_REGISTRY, normalizeHomeConfig, validateHomeConfig, moveApp, moveGroup, koreanToday, isDateOnly, dateDifference, upcomingEvents, featuredEvents, noteText, canDeleteNote } from '../../shared/home/home-core.mjs';
import { createHomeStore, HomeConflictError } from '../../shared/home/home-store.mjs';

const member = { uid: 'member-a', role: 'sungwoo', name: '성우' };
function fixture() {
  let stored = null, afterRead = () => {}, current = true;
  const writes = [], subscriptions = [], stamp = { serverTimestamp: true };
  const sdk = {
    doc: (_db, collection, id) => `${collection}/${id}`,
    collection: (_db, name) => name,
    query: (ref, ...constraints) => ({ ref, constraints }), orderBy: (...args) => ({ order: args }), limit: value => ({ limit: value }),
    serverTimestamp: () => stamp,
    onSnapshot(ref, success, error) { const subscription = { ref, success, error, stopped: false }; subscriptions.push(subscription); return () => { subscription.stopped = true; }; },
    async runTransaction(_db, callback) {
      const pending = [];
      const result = await callback({
        async get(ref) { assert.equal(ref, 'site_home/shared'); const read = stored && structuredClone(stored); afterRead(); return { exists: () => read !== null, data: () => read }; },
        set(ref, value) { pending.push({ ref, value }); },
      });
      for (const change of pending) { writes.push(change); stored = change.value; }
      return result;
    },
    async addDoc(ref, value) { writes.push({ ref, value }); return { id: 'new-note' }; },
    async deleteDoc(ref) { writes.push({ deleted: ref }); },
  };
  const store = createHomeStore({ db: {}, sdk, member, isCurrent: () => current });
  return { sdk, store, writes, subscriptions, setStored(value) { stored = value; }, setAfterRead(fn) { afterRead = fn; }, switchAccount() { current = false; }, getStored: () => stored };
}

test('shared config supplements new registry apps without dropping personal order, groups or visibility', () => {
  const config = normalizeHomeConfig({ revision: 8, groups: [{ id: 'travel', name: '다음 여행' }], apps: [{ id: 'honeymoon', groupId: 'daily', hidden: true }, { id: 'wecost', groupId: 'wedding', hidden: false }] });
  assert.equal(config.revision, 8); assert.equal(config.groups[0].name, '다음 여행');
  assert.deepEqual(config.apps.slice(0, 2), [{ id: 'honeymoon', groupId: 'daily', hidden: true }, { id: 'wecost', groupId: 'wedding', hidden: false }]);
  assert.equal(config.apps.length, 6); assert.equal(config.groups.length, 3);
});
test('unknown URLs and duplicate IDs never become home links or config values', () => {
  const config = normalizeHomeConfig({ groups: [{ id: 'script', name: 'unknown' }], apps: [{ id: 'javascript:alert(1)', href: 'https://outside.example' }, { id: 'dates', groupId: 'script', href: 'https://outside.example' }, { id: 'dates' }] });
  assert.equal(config.apps.length, 6); assert.equal(config.apps[0].groupId, 'daily');
  assert.equal(config.apps.filter(app => app.id === 'dates').length, 1);
  assert.ok(APP_REGISTRY.every(app => /^\.\/[a-z]+\/$/.test(app.href)));
  assert.ok(config.apps.every(app => Object.keys(app).join(',') === 'id,groupId,hidden'));
});
test('all apps can remain hidden and be restored without data recreation', () => {
  const config = normalizeHomeConfig(); config.apps.forEach(app => { app.hidden = true; });
  assert.equal(validateHomeConfig(config).apps.filter(app => !app.hidden).length, 0);
  config.apps[0].hidden = false; assert.equal(validateHomeConfig(config).apps.filter(app => !app.hidden).length, 1);
});
test('moving apps changes only the draft, preserves hidden state and appends to a target group', () => {
  const config = normalizeHomeConfig(); config.apps[0].hidden = true;
  const reordered = moveApp(config, 'dates', 'daily', 1);
  assert.equal(reordered.apps.filter(app => app.groupId === 'daily')[0].id, 'homehunt');
  assert.equal(config.apps[0].id, 'dates');
  const moved = moveApp(reordered, 'dates', 'travel');
  assert.equal(moved.apps.at(-1).id, 'dates'); assert.equal(moved.apps.at(-1).hidden, true); assert.equal(moved.apps.at(-1).groupId, 'travel');
  assert.deepEqual(moveApp(config, 'dates', 'invalid'), config);
});
test('group reorder is bounded and cancel can discard the draft without mutating saved values', () => {
  const config = normalizeHomeConfig(), draft = moveGroup(config, 'travel', -1);
  draft.groups[1].name = '여행 모음';
  assert.deepEqual(config.groups.map(group => group.id), ['daily', 'wedding', 'travel']);
  assert.deepEqual(moveGroup(config, 'daily', -1), config);
  assert.deepEqual(draft.groups.map(group => group.id), ['daily', 'travel', 'wedding']);
});
test('empty or long group names and incomplete/duplicate app configuration are rejected before save', () => {
  for (const invalid of ['', ' ', '가'.repeat(31)]) { const config = normalizeHomeConfig(); config.groups[0].name = invalid; assert.throws(() => validateHomeConfig(config), /그룹 이름/); }
  const config = normalizeHomeConfig(); config.apps[0].id = config.apps[1].id; assert.throws(() => validateHomeConfig(config), /홈 앱 구성/);
});
test('Korean date boundary is independent of device timezone and DST', () => {
  assert.equal(koreanToday(new Date('2030-02-03T14:59:59Z')), '2030-02-03');
  assert.equal(koreanToday(new Date('2030-02-03T15:00:00Z')), '2030-02-04');
  assert.equal(dateDifference('2030-03-11', '2030-03-10'), 1);
  assert.equal(isDateOnly('2030-02-30'), false); assert.equal(isDateOnly('not-a-date'), false);
});
test('only three upcoming events include today with stable tie ordering and leave source data unchanged', () => {
  const events = [{ id: 'z', date: '2030-02-02' }, { id: 'b', date: '2030-02-04' }, { id: 'a', date: '2030-02-04' }, { id: 'c', date: '2030-02-05' }, { id: 'd', date: '2030-02-06' }, { id: 'bad', date: '2030-02-30' }];
  const copy = structuredClone(events); assert.deepEqual(upcomingEvents(events, '2030-02-04').map(event => event.id), ['a', 'b', 'c']); assert.deepEqual(events, copy);
});
test('dates features use saved wedding only and never invent or seed an event', () => {
  assert.deepEqual(featuredEvents([]), []);
  const wedding = { id: 'saved', title: '결혼식', date: '2030-04-05', emoji: '💒' };
  assert.deepEqual(featuredEvents([wedding]), [wedding]);
  const pinned = { id: 'pin', date: '2030-02-01', pinned: true };
  assert.deepEqual(featuredEvents([wedding, pinned], '2030-01-01'), [pinned]);
  assert.equal(wedding.date, '2030-04-05');
});
test('note text accepts plain markup as text and enforces trimmed 1..500 character boundary', () => {
  assert.equal(noteText(' <img onerror=alert(1)> '), '<img onerror=alert(1)>');
  assert.equal(noteText('가'.repeat(500)).length, 500); assert.throws(() => noteText('가'.repeat(501))); assert.throws(() => noteText('  '));
  assert.equal(canDeleteNote({ authorUid: member.uid }, member), true); assert.equal(canDeleteNote({ authorUid: 'other' }, member), false); assert.equal(canDeleteNote({ authorUid: member.uid }, null), false);
});
test('store refuses construction without a member and reads cause no automatic writes', () => {
  assert.throws(() => createHomeStore({ db: {}, sdk: {}, member: null }), /로그인/);
  const f = fixture(); f.store.watchHome(() => {}); f.store.watchEvents(() => {}); f.store.watchNotes(() => {});
  assert.equal(f.writes.length, 0); assert.equal(f.getStored(), null);
});
test('first explicit home apply writes revision one with authenticated author and server timestamp', async () => {
  const f = fixture(); const result = await f.store.saveHome(normalizeHomeConfig(), 0);
  assert.equal(result.revision, 1); assert.equal(f.writes.length, 1); assert.equal(f.writes[0].value.updatedBy, member.uid); assert.deepEqual(f.writes[0].value.updatedAt, { serverTimestamp: true });
});
test('two editors of the same revision allow only the first transaction and keep the losing draft', async () => {
  const f = fixture(); const first = normalizeHomeConfig(), second = normalizeHomeConfig();
  first.groups[0].name = '첫 편집'; second.groups[0].name = '내 초안';
  await f.store.saveHome(first, 0);
  await assert.rejects(f.store.saveHome(second, 0), error => error instanceof HomeConflictError && error.latest.revision === 1);
  assert.equal(f.writes.length, 1); assert.equal(second.groups[0].name, '내 초안'); assert.equal(f.getStored().groups[0].name, '첫 편집');
});
test('fresh editor can apply to latest revision without replacing unrelated event/note documents', async () => {
  const f = fixture(); const current = normalizeHomeConfig({ revision: 5 }); f.setStored(current); current.apps[1].hidden = true;
  const result = await f.store.saveHome(current, 5); assert.equal(result.revision, 6); assert.deepEqual(f.writes.map(write => write.ref), ['site_home/shared']);
});
test('account switch while transaction awaits read prevents any pending write', async () => {
  const f = fixture(); f.setAfterRead(() => f.switchAccount());
  await assert.rejects(f.store.saveHome(normalizeHomeConfig(), 0), /로그인 상태/); assert.equal(f.writes.length, 0);
});
test('new notes always use signed-in UID, reject invalid content, and refuse another author deletion', async () => {
  const f = fixture(); await f.store.addNote('안녕');
  assert.deepEqual(f.writes[0], { ref: 'home_notes', value: { text: '안녕', authorUid: member.uid, createdAt: { serverTimestamp: true } } });
  await assert.rejects(f.store.addNote('x'.repeat(501))); await assert.rejects(f.store.deleteNote({ id: 'other', authorUid: 'member-b' }), /내가 쓴/);
  await f.store.deleteNote({ id: 'own', authorUid: member.uid }); assert.deepEqual(f.writes.at(-1), { deleted: 'home_notes/own' }); assert.equal(f.writes.length, 2);
});
test('recent notes show three plus a sentinel and more expands the live window without a 99-note ceiling', () => {
  const f = fixture(); let received;
  f.store.watchNotes(value => { received = value; });
  const docs = Array.from({ length: 4 }, (_, index) => ({ id: `${index}`, data: () => ({ text: `${index}` }) }));
  f.subscriptions[0].success({ docs }); assert.equal(received.notes.length, 3); assert.equal(received.hasMore, true);
  assert.equal(f.subscriptions[0].ref.constraints.at(-1).limit, 4);
  f.store.watchNotes(() => {}, () => {}, 105); assert.equal(f.subscriptions[1].ref.constraints.at(-1).limit, 106);
});
test('superseded note window cannot overwrite later page results and cleanup blocks late callbacks', () => {
  const f = fixture(); let count = 0;
  const stop = f.store.watchNotes(() => { count++; }); stop();
  f.subscriptions[0].success({ docs: [] }); assert.equal(count, 0);
  f.store.watchHome(() => { count++; }); f.store.close();
  f.subscriptions[1].success({ exists: () => false }); assert.equal(count, 0); assert.ok(f.subscriptions.every(subscription => subscription.stopped));
  assert.throws(() => f.store.watchEvents(() => {}), /로그인 상태/);
});
test('logout and account switch block note writes and server subscription callbacks', async () => {
  const f = fixture(); let count = 0; f.store.watchEvents(() => { count++; }); f.switchAccount();
  f.subscriptions[0].success({ docs: [] }); assert.equal(count, 0); await assert.rejects(f.store.addNote('늦은 저장'), /로그인 상태/); assert.equal(f.writes.length, 0);
});
