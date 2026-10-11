import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('loading notice cancels its timer and error handler when the member page is retired', async () => {
  const source = await readFile(new URL('../js/boot-status.js', import.meta.url), 'utf8');
  const handlers = new Map(); const timers = new Map();
  const status = { hidden: false, textContent: '읽는 중' };
  let timer = 0;
  const window = {
    addEventListener: (name, fn) => handlers.set(name, fn),
    removeEventListener: (name, fn) => { if (handlers.get(name) === fn) handlers.delete(name); },
    setTimeout: fn => { timers.set(++timer, fn); return timer; },
    clearTimeout: id => timers.delete(id),
  };
  new vm.Script(source).runInNewContext({ window, document: { getElementById: () => status } });
  assert.equal(timers.size, 1);
  handlers.get('error')({ target: { tagName: 'SCRIPT', type: 'module' } });
  assert.match(status.textContent, /화면 파일/);
  handlers.get('sungso:private-clear')();
  assert.equal(timers.size, 0);
  assert.equal(handlers.has('error'), false);
});

test('the actual private cleanup aborts requests and clears private memory without deleting browser drafts', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const callback = source.match(/registerPrivateCleanup\(\(\) => \{([\s\S]*?)\n\}\);/);
  assert.ok(callback, 'private cleanup remains registered with the common member gate');
  const calls = [];
  const drafts = new Map([['homehunt_visits_v1', 'existing draft'], ['homehunt_v2_conditions_v1', 'existing conditions']]);
  const state = { mapReady: true, chart: { destroy: () => calls.push('chart') },
    map: { map: {}, clearCandidateMarkers: () => calls.push('markers'), clearContextRecords: () => calls.push('contexts'),
      clearCompanyLocation: () => calls.push('companies'), clearSearchLocation: () => calls.push('search-location') },
    volatileDestinations: new Map([['company', { address: 'private destination' }]]), candidates: [{ name: 'private candidate' }],
    pending: [1], shared: { visits: [1] }, conditions: { workplaces: [1] }, history: { records: [1] }, detail: { name: 'private' }, modal: {}, funding: { availableCashWon: 1 } };
  const context = { state, retired: false, searchEpoch: 1, historyEpoch: 2, toastTimer: 1,
    lifetimeEvents: { abort: () => calls.push('events') },
    searchController: { abort: () => calls.push('prices') }, historyController: { abort: () => calls.push('history') }, placeController: { abort: () => calls.push('places') },
    stopStore: () => calls.push('store-subscription'), stopSession: () => calls.push('session-subscription'),
    store: { dispose: () => calls.push('store') }, services: { destroyServices: () => calls.push('services') },
    clearTimeout: () => calls.push('timer'), document: { body: { style: { overflow: 'hidden' } }, querySelectorAll: () => [] },
    window: { naver: { maps: { Event: {} } } }, localStorage: { removeItem: key => drafts.delete(key), clear: () => drafts.clear() } };
  new vm.Script(`(function () {${callback[1]} })()`).runInNewContext(context);
  assert.equal(context.retired, true);
  assert.equal(context.searchEpoch, 2); assert.equal(context.historyEpoch, 3);
  for (const key of ['events', 'prices', 'history', 'places', 'store-subscription', 'session-subscription', 'store', 'services', 'chart', 'timer']) assert.ok(calls.includes(key), key);
  assert.equal(state.volatileDestinations.size, 0); assert.equal(state.candidates.length, 0);
  assert.equal(state.shared.visits.length, 0); assert.equal(state.conditions.workplaces.length, 0);
  assert.equal(state.history, null); assert.equal(state.detail, null); assert.equal(state.modal, null);
  assert.deepEqual(Object.keys(state.funding), []); assert.equal(context.document.body.style.overflow, '');
  assert.equal(drafts.size, 2); assert.equal(drafts.get('homehunt_visits_v1'), 'existing draft');
});
