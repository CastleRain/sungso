import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHomeConfig, validateHomeConfig } from '../../../shared/home/home-core.mjs';
import { getBrowsableApps, getHomeShortcuts, paginateApps, withHomeShortcuts } from '../js/view-core.mjs';

test('local life starters can be found without changing the shared six-app configuration', () => {
  const config = normalizeHomeConfig();
  const before = structuredClone(config);
  const all = getBrowsableApps(config);
  assert.equal(all.length, 12);
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
  const journey = getBrowsableApps(config, {query: '타임라인'})[0];
  assert.equal(journey.href, './journey/');
  assert.equal(journey.local, undefined);
  assert.equal(journey.pinnable, false);
  assert.throws(() => withHomeShortcuts(config, ['journey']));
});

test('the twelve-app mobile library keeps both HomeHunt versions and all apps reachable', () => {
  const apps = getBrowsableApps(normalizeHomeConfig());
  const first = paginateApps(apps, { page: 1, pageSize: 6 });
  const second = paginateApps(apps, { page: 2, pageSize: 6 });
  assert.equal(first.pageCount, 2);
  assert.equal(second.items.length, 6);
  assert.equal(new Set([...first.items, ...second.items].map(app => app.id)).size, 12);
  assert.ok(apps.some(app => app.id === 'homehunt' && app.href === './homehunt/'));
  assert.ok(apps.some(app => app.id === 'homehunt-v2' && app.href === './homehunt-v2/'));
});

test('Ver2 is a non-stored entry without changing six-app settings or shortcuts', () => {
  const config = normalizeHomeConfig({ revision: 9 });
  const before = structuredClone(config);
  const v2 = getBrowsableApps(config, { query: 'HomeHunt Ver2', groupId: 'daily' })[0];
  assert.equal(v2?.id, 'homehunt-v2');
  assert.equal(v2?.href, './homehunt-v2/');
  assert.equal(v2?.pinnable, false);
  assert.deepEqual(config, before);
  assert.equal(validateHomeConfig(config).apps.length, 6);
  assert.throws(() => withHomeShortcuts(config, ['homehunt-v2']));
});
