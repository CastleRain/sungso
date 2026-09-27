import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHomeConfig, validateHomeConfig } from '../../../shared/home/home-core.mjs';
import { getBrowsableApps, getHomeShortcuts, paginateApps, withHomeShortcuts } from '../js/view-core.mjs';

test('local life starters can be found without changing the shared six-app configuration', () => {
  const config = normalizeHomeConfig();
  const before = structuredClone(config);
  const all = getBrowsableApps(config);
  assert.equal(all.length, 10);
  assert.equal(all.filter(app => app.local).length, 3);
  assert.equal(getBrowsableApps(config, { query: '장보기' })[0].id, 'table');
  assert.equal(getBrowsableApps(config, { query: '사진첩' })[0].id, 'footprints');
  assert.equal(getBrowsableApps(config, { query: '하객' })[0].id, 'wedding');
  assert.equal(getBrowsableApps(config, { query: '하객', groupId: 'daily' }).length, 0);
  assert.deepEqual(config, before);
  assert.equal(validateHomeConfig(config).apps.length, 6);
  assert.equal(getHomeShortcuts(config).length, 4);
  assert.throws(() => withHomeShortcuts(config, ['table']));
  const sohee = getBrowsableApps(config, {query: '양정커피'})[0];
  assert.equal(sohee.href, './sohee/workspace/');
  assert.equal(sohee.pinnable, false);
  assert.throws(() => withHomeShortcuts(config, ['sohee']));
});

test('the ten-app mobile library keeps the last four apps reachable on page two', () => {
  const apps = getBrowsableApps(normalizeHomeConfig());
  const first = paginateApps(apps, { page: 1, pageSize: 6 });
  const second = paginateApps(apps, { page: 2, pageSize: 6 });
  assert.equal(first.pageCount, 2);
  assert.equal(second.items.length, 4);
  assert.equal(new Set([...first.items, ...second.items].map(app => app.id)).size, 10);
});
