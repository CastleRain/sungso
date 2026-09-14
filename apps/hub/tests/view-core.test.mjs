import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_REGISTRY, normalizeHomeConfig } from '../../../shared/home/home-core.mjs';
import { createHomeStore, HomeConflictError } from '../../../shared/home/home-store.mjs';
import { SHORTCUT_LIMIT, getHomeShortcuts, getLibraryApps, withHomeShortcuts, paginateApps } from '../js/view-core.mjs';

const ids = apps => apps.map(app => app.id);

test('legacy visible apps are summarized to four without rewriting their saved visibility', () => {
  const config = normalizeHomeConfig({ revision: 7 });
  const original = structuredClone(config);
  assert.equal(SHORTCUT_LIMIT, 4);
  assert.deepEqual(ids(getHomeShortcuts(config)), ['dates', 'homehunt', 'wecost', 'invitation']);
  assert.deepEqual(config, original);
  assert.equal(config.apps.filter(app => !app.hidden).length, 6);
});

test('shortcuts follow saved app order independently of group order and skip hidden apps', () => {
  const config = normalizeHomeConfig({
    groups: [{ id: 'wedding', name: '결혼' }],
    apps: [{ id: 'travel', groupId: 'daily', hidden: false }, { id: 'honeymoon', groupId: 'travel', hidden: true }],
  });
  const shortcuts = getHomeShortcuts(config);
  assert.deepEqual(ids(shortcuts), ['travel', 'dates', 'homehunt', 'wecost']);
  assert.equal(shortcuts[0].groupId, 'daily');
  assert.equal(shortcuts[0].groupName, '일상·집 준비');
  assert.equal(shortcuts[0].href, './travel/');
  assert.equal(shortcuts[0].description, '함께 떠나는 다음 여행');
});

test('all six apps remain discoverable even when every home shortcut is hidden', () => {
  const config = withHomeShortcuts(normalizeHomeConfig(), []);
  assert.deepEqual(getHomeShortcuts(config), []);
  assert.deepEqual(ids(getLibraryApps(config)), ids(APP_REGISTRY));
  assert.ok(getLibraryApps(config).every(app => app.hidden));
});

test('library honors custom group order and saved app order within each group', () => {
  const config = normalizeHomeConfig({
    groups: [{ id: 'travel', name: '다음 여행' }, { id: 'wedding', name: '준비' }],
    apps: [{ id: 'honeymoon', groupId: 'travel', hidden: true }, { id: 'invitation', groupId: 'wedding', hidden: false }],
  });
  assert.deepEqual(ids(getLibraryApps(config)), ['honeymoon', 'travel', 'invitation', 'wecost', 'dates', 'homehunt']);
  assert.deepEqual(ids(getLibraryApps(config, { groupId: 'wedding' })), ['invitation', 'wecost']);
  assert.deepEqual(getLibraryApps(config, { groupId: 'unknown' }), []);
});

test('Korean, English, descriptions and custom group names support normalized search with category intersection', () => {
  const config = normalizeHomeConfig({ groups: [{ id: 'daily', name: '둘만의   일상' }] });
  assert.deepEqual(ids(getLibraryApps(config, { query: '  함께    쓰는  ' })), ['wecost']);
  assert.deepEqual(ids(getLibraryApps(config, { query: 'ＷＥＣＯＳＴ' })), ['wecost']);
  assert.deepEqual(ids(getLibraryApps(config, { query: 'homeHUNT' })), ['homehunt']);
  assert.deepEqual(ids(getLibraryApps(config, { query: '리조트와 견적' })), ['honeymoon']);
  assert.deepEqual(ids(getLibraryApps(config, { query: '둘만의 일상' })), ['dates', 'homehunt']);
  assert.deepEqual(ids(getLibraryApps(config, { query: '결혼', groupId: 'wedding' })), ['wecost', 'invitation']);
  assert.deepEqual(getLibraryApps(config, { query: '결혼', groupId: 'travel' }), []);
  assert.equal(getLibraryApps(config, { query: ' \n\t ' }).length, 6);
});

test('normalization prevents stored unknown IDs, URLs or labels from becoming executable app links', () => {
  const raw = {
    apps: [
      { id: 'javascript:alert(1)', href: 'javascript:alert(1)' },
      { id: 'dates', title: '<script>test</script>', href: 'https://outside.example/', groupId: 'unknown' },
      { id: 'dates', groupId: 'wedding' },
    ],
  };
  const original = structuredClone(raw);
  for (const app of [...getHomeShortcuts(raw), ...getLibraryApps(raw)]) {
    const definition = APP_REGISTRY.find(item => item.id === app.id);
    assert.ok(definition);
    assert.equal(app.href, definition.href);
    assert.equal(app.title, definition.title);
  }
  assert.equal(getLibraryApps(raw).length, 6);
  assert.deepEqual(raw, original);
});

test('explicit shortcut selection preserves names, group assignments, revision and remaining app order', () => {
  const config = normalizeHomeConfig({
    revision: 11,
    groups: [{ id: 'travel', name: '우리의 긴 휴가' }, { id: 'daily', name: '일상' }],
    apps: [{ id: 'honeymoon', groupId: 'daily', hidden: true }, { id: 'dates', groupId: 'wedding', hidden: true }],
  });
  const original = structuredClone(config);
  const updated = withHomeShortcuts(config, ['invitation', 'honeymoon', 'travel']);
  assert.deepEqual(ids(updated.apps), ['invitation', 'honeymoon', 'travel', 'dates', 'homehunt', 'wecost']);
  assert.deepEqual(ids(getHomeShortcuts(updated)), ['invitation', 'honeymoon', 'travel']);
  assert.deepEqual(updated.groups, original.groups);
  assert.equal(updated.revision, 11);
  for (const app of updated.apps) {
    assert.equal(app.groupId, original.apps.find(item => item.id === app.id).groupId);
    assert.deepEqual(Object.keys(app).sort(), ['groupId', 'hidden', 'id']);
  }
  assert.deepEqual(Object.keys(updated).sort(), ['apps', 'groups', 'revision']);
  assert.deepEqual(config, original);
  updated.groups[0].name = '변경된 초안';
  updated.apps[0].groupId = 'daily';
  assert.deepEqual(config, original);
});

test('invalid shortcut selections are rejected before changing the original config', () => {
  const config = normalizeHomeConfig();
  const original = structuredClone(config);
  const invalid = [null, 'dates', ['dates', 'dates'], ['missing'], [null], ids(APP_REGISTRY).slice(0, 5)];
  for (const selected of invalid) assert.throws(() => withHomeShortcuts(config, selected), /최대 4개/);
  assert.deepEqual(config, original);
  assert.equal(getHomeShortcuts(withHomeShortcuts(config, ids(APP_REGISTRY).slice(0, 4))).length, 4);
});

test('empty selection can be restored from the library using the same schema', () => {
  const empty = withHomeShortcuts(normalizeHomeConfig({ revision: 3 }), []);
  const restored = withHomeShortcuts(empty, ['travel', 'dates']);
  assert.deepEqual(ids(getHomeShortcuts(restored)), ['travel', 'dates']);
  assert.equal(getLibraryApps(restored).length, 6);
  assert.ok(empty.apps.every(app => app.hidden));
  assert.equal(restored.revision, 3);
});

function transactionFixture(initial) {
  let stored = structuredClone(initial);
  const writes = [];
  const sdk = {
    doc: (_db, collection, id) => `${collection}/${id}`,
    collection: (_db, name) => name,
    serverTimestamp: () => ({ serverTimestamp: true }),
    async runTransaction(_db, callback) {
      const pending = [];
      const result = await callback({
        async get(ref) {
          assert.equal(ref, 'site_home/shared');
          return { exists: () => true, data: () => structuredClone(stored) };
        },
        set(ref, value) { pending.push({ ref, value }); },
      });
      for (const write of pending) { writes.push(write); stored = structuredClone(write.value); }
      return result;
    },
  };
  const store = createHomeStore({ db: {}, sdk, member: { uid: 'test-member' } });
  return { store, writes };
}

test('shortcut apply uses the existing home transaction schema and revision conflict protection', async () => {
  const config = normalizeHomeConfig({ revision: 9, groups: [{ id: 'travel', name: '우리 여행' }] });
  const first = withHomeShortcuts(config, ['travel', 'dates']);
  const second = withHomeShortcuts(config, ['honeymoon']);
  const originalSecond = structuredClone(second);
  const { store, writes } = transactionFixture(config);
  const saved = await store.saveHome(first, config.revision);
  assert.equal(saved.revision, 10);
  assert.deepEqual(ids(getHomeShortcuts(saved)), ['travel', 'dates']);
  assert.equal(writes[0].ref, 'site_home/shared');
  assert.deepEqual(Object.keys(writes[0].value).sort(), ['apps', 'groups', 'revision', 'updatedAt', 'updatedBy']);
  assert.deepEqual(writes[0].value.groups, config.groups);
  assert.deepEqual(writes[0].value.apps, first.apps);
  assert.equal(writes[0].value.updatedBy, 'test-member');
  await assert.rejects(store.saveHome(second, config.revision), error => error instanceof HomeConflictError && error.latest.revision === 10);
  assert.equal(writes.length, 1);
  assert.deepEqual(second, originalSecond);
});

test('31 apps paginate without dropping or duplicating entries and preserve the input list', () => {
  const items = Array.from({ length: 31 }, (_, index) => ({ id: `future-${index}` }));
  const original = structuredClone(items);
  const pages = [1, 2, 3, 4].map(page => paginateApps(items, { page }));
  assert.deepEqual(pages.map(result => result.items.length), [9, 9, 9, 4]);
  assert.ok(pages.every(result => result.pageCount === 4 && result.total === 31));
  assert.deepEqual(pages.flatMap(result => result.items), items);
  assert.equal(paginateApps(items, { page: 100 }).page, 4);
  assert.equal(paginateApps(items, { page: -1 }).page, 1);
  assert.deepEqual(items, original);
});

test('empty results and invalid page sizes stay finite, bounded and navigable', () => {
  assert.deepEqual(paginateApps([], { page: 8 }), { items: [], page: 1, pageCount: 1, total: 0 });
  const items = Array.from({ length: 101 }, (_, id) => ({ id }));
  for (const pageSize of [0, -4, 0.5]) assert.equal(paginateApps(items, { pageSize }).items.length, 1);
  for (const pageSize of [51, 1000]) assert.equal(paginateApps(items, { pageSize }).items.length, 50);
  for (const pageSize of [NaN, Infinity, null, 'bad']) assert.equal(paginateApps(items, { pageSize }).items.length, 9);
  for (const page of [NaN, Infinity, null, 'bad']) assert.equal(paginateApps(items, { page }).page, 1);
  assert.equal(paginateApps(items, { page: 2.9, pageSize: 3.9 }).items[0].id, 3);
});
