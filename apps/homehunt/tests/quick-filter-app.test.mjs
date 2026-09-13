import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createWecostTargetPriceService, WECOST_TARGET_PRICE_URL } from '../js/wecost-target-price-service.mjs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const actualFunction = name => {
  const match = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Actual app function ${name} exists`);
  return match[0];
};
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const available = (targetPriceWon = 600000000) => ({ status: 'available', connection: 'firebase',
  snapshot: { version: 1, source: 'wecost', targetPriceWon, updatedAt: '2026-09-08T00:00:00.000Z' },
});
const response = (targetPriceWon = 600000000) => ({ ok: true, status: 200,
  json: async () => ({ fields: { targetHousePrice: { integerValue: String(targetPriceWon) } } }),
});

function harness({ source = 'manual', linked = available() } = {}) {
  const calls = { handler: 0, sync: 0, cancel: 0, previewCreated: 0, sharedEvents: 0, search: 0, priceLabels: 0,
    network: [], toast: [], panels: [], focus: [], writes: [] };
  const initial = {
    recommendSeoul: true, recommendGyeonggi: true, recommendHouseholds: '300', recommendHouseholdsOperator: 'gt',
    recommendMaxAge: '25', recommendMaxPriceEok: '5', recommendMaxPriceMan: '5000', recommendBudgetSource: 'manual',
    recommendBudgetOverPct: '10', recommendMinArea: '18', recommendAreaOperator: 'gte',
    recommendCommuteMode: 'transit', recommendCommuteMax: '60', recommendParkingRatio: '1',
    recommendRequireParking: true, recommendPreferSubway: true, recommendExcludeFar: true,
  };
  const controls = new Map();
  for (const [id, initialValue] of Object.entries(initial)) {
    let value = typeof initialValue === 'boolean' ? '' : initialValue;
    let checked = typeof initialValue === 'boolean' ? initialValue : false;
    controls.set(id, {
      type: typeof initialValue === 'boolean' ? 'checkbox' : 'text', attributes: {},
      get value() { return value; }, set value(next) { value = String(next); calls.writes.push([id, value]); },
      get checked() { return checked; }, set checked(next) { checked = next; calls.writes.push([id, checked]); },
      setAttribute(name, next) { this.attributes[name] = String(next); },
      focus() { calls.focus.push(id); }, scrollIntoView() {},
    });
  }
  controls.set('recommendBudgetSourceStatus', { textContent: '' });
  const flow = { preview: async () => response(), shared: async () => response() };
  const fetcher = channel => async (url, options) => {
    calls.network.push({ channel, url, method: options.method });
    assert.equal(url, WECOST_TARGET_PRICE_URL);
    assert.equal(new URL(url).searchParams.get('mask.fieldPaths'), 'targetHousePrice');
    assert.equal(options.method, 'GET');
    return flow[channel](url, options);
  };
  const sharedService = createWecostTargetPriceService({ fetchImpl: fetcher('shared') });
  const sandbox = {
    state: { recommendationResults: [{ catalogId: 'fixture-a' }], commuteAttempts: new Map([['fixture-a', 'checked']]),
      recommendationRunSnapshot: { conditions: 'original' }, manualTargetPriceManWon: 55000,
      recommendationBudgetSource: 'manual', recommendationRunning: false, commuteVerificationRunning: false,
      recommendationLocationBusy: false },
    $: selector => controls.get(selector.slice(1)) || null,
    recommendationQuickApplyPending: false,
    recommendationRunToken: 1,
    recommendationQuickFilters: { close() {} },
    wecostTargetState: sharedService.getState(),
    wecostTargetPriceService: {
      refresh: () => sharedService.refresh(),
      cancel() { calls.cancel += 1; sharedService.cancel(); },
      subscribe(listener) { return sharedService.subscribe(next => { calls.sharedEvents += 1; listener(next); }); },
    },
    createWecostTargetPriceService() {
      calls.previewCreated += 1;
      return createWecostTargetPriceService({ fetchImpl: fetcher('preview') });
    },
    readRecommendationForm: () => ({ destinations: [{ id: 'fixture-company', label: '가상 회사', weight: 100 }] }),
    readRecommendationPriceManWon: () => Number(controls.get('recommendMaxPriceEok').value.replaceAll(',', '')) * 10000
      + Number(controls.get('recommendMaxPriceMan').value.replaceAll(',', '')),
    updateRecommendationPriceLabel() { calls.priceLabels += 1; },
    syncRecommendationRanges() { calls.sync += 1; },
    handleRecommendationCriteriaChanged() { calls.handler += 1; },
    showToast(message) { calls.toast.push(message); },
    setRecommendationPanel(panel) { calls.panels.push(panel); },
    fetch() { calls.search += 1; assert.fail('Quick filter must not fetch price or commute results'); },
    runRecommendation() { calls.search += 1; assert.fail('Quick filter must not execute a search'); },
    window: { addEventListener() {}, requestAnimationFrame: callback => callback() },
    document: { visibilityState: 'visible', addEventListener() {} },
    homeTargetPriceBridge: { subscribe() {} },
  };
  Object.assign(sandbox, {
    currentCompanySearchScope: () => ({ mode: 'all', districtCodes: [] }),
    renderRecommendationContinuity() {}, restoreRecentRecommendation: async () => {},
    loadApartmentCatalog: async () => ({ apartments: [] }),
  });
  vm.createContext(sandbox);
  for (const name of ['getRecommendationQuickValues', 'applyRecommendationQuickValues', 'openRecommendationFullFilter',
    'writeRecommendationPrice', 'updateTargetPriceConnection', 'initializeWecostTargetConnection']) {
    vm.runInContext(actualFunction(name), sandbox);
  }
  sandbox.initializeWecostTargetConnection();
  controls.get('recommendBudgetSource').value = source;
  sandbox.wecostTargetState = linked;
  sandbox.state.recommendationBudgetSource = source;
  if (source === 'wecost') sandbox.writeRecommendationPrice(linked.snapshot?.targetPriceWon / 10000 || 55000);
  calls.writes.length = 0; calls.priceLabels = 0; calls.sharedEvents = 0;
  const values = () => clone(sandbox.getRecommendationQuickValues());
  const apply = (patch, key, options) => sandbox.applyRecommendationQuickValues(patch, key, options);
  return { sandbox, controls, calls, flow, values, apply, sharedService };
}

test('quick-filter no-op retains original controls, result references and checked commute attempts without handlers or APIs', async () => {
  const h = harness();
  const before = h.values();
  const results = h.sandbox.state.recommendationResults;
  const attempts = h.sandbox.state.commuteAttempts;
  await h.apply({ recommendHouseholds: '300', destinations: [], budgetStatus: 'ignored', unknownField: 'ignored' }, 'households');
  assert.deepEqual(h.values(), before);
  assert.strictEqual(h.sandbox.state.recommendationResults, results);
  assert.strictEqual(h.sandbox.state.commuteAttempts, attempts);
  assert.deepEqual(h.calls.writes, []);
  assert.equal(h.calls.handler, 0);
  assert.equal(h.calls.sync, 0);
  assert.equal(h.calls.previewCreated, 0);
  assert.equal(h.calls.search, 0);
  assert.deepEqual(h.calls.network, []);
});

test('one quick-filter apply updates selected controls and invokes the criteria handler exactly once without searching', async () => {
  const h = harness();
  const before = h.values();
  await h.apply({ recommendSeoul: false, recommendGyeonggi: true }, 'region');
  assert.deepEqual(h.values(), { ...before, recommendSeoul: false });
  assert.deepEqual(h.calls.writes, [['recommendSeoul', false]]);
  assert.equal(h.calls.handler, 1);
  assert.equal(h.calls.sync, 1);
  assert.equal(h.calls.search, 0);
  assert.deepEqual(h.calls.network, []);
  assert.equal(h.sandbox.recommendationQuickApplyPending, false);
});

for (const flag of ['recommendationRunning', 'commuteVerificationRunning', 'recommendationLocationBusy']) {
  test(`quick-filter apply can update conditions while ${flag} is active without starting another query`, async () => {
    const h = harness();
    h.sandbox.state[flag] = true;
    await h.apply({ recommendHouseholds: '500' }, 'households');
    assert.equal(h.controls.get('recommendHouseholds').value, '500');
    assert.equal(h.calls.handler, 1);
    assert.equal(h.calls.previewCreated, 0);
    assert.equal(h.calls.search, 0);
  });
}

test('a simultaneous draft apply remains blocked without writing fields', async () => {
  const h = harness();
  h.sandbox.recommendationQuickApplyPending = true;
  const before = h.values();
  await assert.rejects(h.apply({ recommendHouseholds: '500' }, 'households'), /조건을 적용하고/);
  assert.deepEqual(h.values(), before);
  assert.equal(h.calls.handler, 0);
});

test('running status leaves filters, destination editing and cancel available while preventing duplicate search', () => {
  const nodes = new Map();
  const $ = key => {
    if (!nodes.has(key)) nodes.set(key, { disabled: false, hidden: false, dataset: {}, style: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } });
    return nodes.get(key);
  };
  const controls = ['#recommendMaxAge', '#recommendSeoul', '#confirmCompanyLocation', '#recommendBudgetSource'].map($);
  const linkedSlider = $('#recommendMaxPriceRange'); linkedSlider.disabled = true;
  const context = vm.createContext({ $, $$: () => [...controls, linkedSlider] });
  vm.runInContext(actualFunction('setRecommendationStatus'), context);
  context.setRecommendationStatus('running', '조회 중', '조건 수정 가능', { completed: 1, total: 3 });
  assert.equal($('#applyRecommendationFilters').disabled, true);
  assert.equal($('#runRecommendation').disabled, false);
  assert.equal($('#cancelRecommendation').hidden, false);
  assert.ok(controls.every(control => !control.disabled));
  assert.equal(linkedSlider.disabled, true);
  context.setRecommendationStatus('', '조건 변경', '다시 검색');
  assert.equal($('#applyRecommendationFilters').disabled, false);
});

test('manual to WeCost waits for the official single-field read, commits that amount and preserves the previous manual price', async () => {
  const h = harness();
  const wait = deferred(); h.flow.preview = () => wait.promise;
  const before = h.values();
  const pending = h.apply({ recommendBudgetSource: 'wecost', recommendMaxPriceEok: '99', recommendMaxPriceMan: '1' }, 'price');
  await Promise.resolve();
  assert.deepEqual(h.values(), before);
  assert.deepEqual(h.calls.writes, []);
  assert.equal(h.calls.handler, 0);
  assert.equal(h.calls.sharedEvents, 0);
  wait.resolve(response(623450000));
  await pending;
  assert.equal(h.controls.get('recommendBudgetSource').value, 'wecost');
  assert.equal(h.sandbox.readRecommendationPriceManWon(), 62345);
  assert.equal(h.sandbox.state.manualTargetPriceManWon, 55000);
  assert.equal(h.sandbox.wecostTargetState.snapshot.targetPriceWon, 623450000);
  assert.equal(h.calls.handler, 1);
  assert.equal(h.calls.sharedEvents, 0);
  assert.equal(h.calls.cancel, 0);
  assert.equal(h.calls.search, 0);
  assert.deepEqual(h.calls.network.map(call => call.channel), ['preview']);
});

test('already linked but unavailable WeCost refresh uses an isolated reader and applies once without a shared subscription write', async () => {
  const h = harness({ source: 'wecost', linked: { status: 'unavailable', snapshot: null } });
  const wait = deferred(); h.flow.preview = () => wait.promise;
  const before = h.values();
  const pending = h.apply({ recommendBudgetOverPct: '20' }, 'price');
  await Promise.resolve();
  assert.deepEqual(h.values(), before);
  assert.deepEqual(h.calls.writes, []);
  assert.equal(h.calls.sharedEvents, 0);
  wait.resolve(response(610000000)); await pending;
  assert.equal(h.sandbox.readRecommendationPriceManWon(), 61000);
  assert.equal(h.controls.get('recommendBudgetOverPct').value, '20');
  assert.equal(h.calls.handler, 1);
  assert.equal(h.calls.sharedEvents, 0);
  assert.equal(h.calls.search, 0);
});

test('already available linked price reuses the verified value without another Firebase request', async () => {
  const h = harness({ source: 'wecost' });
  await h.apply({ recommendBudgetOverPct: '15', recommendMaxPriceEok: '99' }, 'price');
  assert.equal(h.sandbox.readRecommendationPriceManWon(), 60000);
  assert.equal(h.controls.get('recommendBudgetOverPct').value, '15');
  assert.equal(h.calls.handler, 1);
  assert.equal(h.calls.previewCreated, 0);
  assert.deepEqual(h.calls.network, []);
});

test('failed Firebase read leaves the full original form, linked state and result references unchanged', async () => {
  const h = harness();
  const before = h.values(); const linked = h.sandbox.wecostTargetState;
  const results = h.sandbox.state.recommendationResults;
  h.flow.preview = async () => ({ ok: false, status: 403 });
  await assert.rejects(h.apply({ recommendBudgetSource: 'wecost' }, 'price'), /WeCost 목표가격을 확인하지 못했습니다/);
  assert.deepEqual(h.values(), before);
  assert.strictEqual(h.sandbox.wecostTargetState, linked);
  assert.strictEqual(h.sandbox.state.recommendationResults, results);
  assert.deepEqual(h.calls.writes, []);
  assert.equal(h.calls.handler, 0);
  assert.equal(h.calls.sharedEvents, 0);
  assert.equal(h.sandbox.recommendationQuickApplyPending, false);
});

test('closing the popup while its Firebase request is pending discards the draft and the returned linked amount', async () => {
  const h = harness();
  const wait = deferred(); h.flow.preview = () => wait.promise;
  const before = h.values(); const linked = h.sandbox.wecostTargetState;
  let current = true;
  const pending = h.apply({ recommendBudgetSource: 'wecost' }, 'price', { isCurrent: () => current });
  current = false; wait.resolve(response());
  await assert.rejects(pending, /조건이나 조회 상태가 바뀌었습니다/);
  assert.deepEqual(h.values(), before);
  assert.strictEqual(h.sandbox.wecostTargetState, linked);
  assert.deepEqual(h.calls.writes, []);
  assert.equal(h.calls.handler, 0);
  assert.equal(h.calls.sharedEvents, 0);
  assert.equal(h.sandbox.recommendationQuickApplyPending, false);
});

test('an external condition edit during the awaited read prevents the old popup from writing any fields', async () => {
  const h = harness();
  const wait = deferred(); h.flow.preview = () => wait.promise;
  const pending = h.apply({ recommendBudgetSource: 'wecost' }, 'price');
  h.controls.get('recommendMaxAge').value = '15';
  const edited = h.values(); h.calls.writes.length = 0;
  wait.resolve(response());
  await assert.rejects(pending, /조건이나 조회 상태가 바뀌었습니다/);
  assert.deepEqual(h.values(), edited);
  assert.deepEqual(h.calls.writes, []);
  assert.equal(h.calls.handler, 0);
  assert.equal(h.calls.sharedEvents, 0);
});

test('background verification starting during a budget read does not lock a still-current draft', async () => {
  const h = harness();
  const wait = deferred(); h.flow.preview = () => wait.promise;
  const pending = h.apply({ recommendBudgetSource: 'wecost' }, 'price');
  h.sandbox.state.commuteVerificationRunning = true;
  wait.resolve(response());
  await pending;
  assert.equal(h.controls.get('recommendBudgetSource').value, 'wecost');
  assert.equal(h.calls.handler, 1);
  assert.equal(h.calls.search, 0);
});

test('a newer price search during a budget read keeps its conditions and discards the old draft', async () => {
  const h = harness();
  const wait = deferred(); h.flow.preview = () => wait.promise;
  const before = h.values();
  const pending = h.apply({ recommendBudgetSource: 'wecost' }, 'price');
  h.sandbox.recommendationRunToken += 1;
  wait.resolve(response());
  await assert.rejects(pending, /조건이나 조회 상태가 바뀌었습니다/);
  assert.deepEqual(h.values(), before);
  assert.equal(h.calls.handler, 0);
});

test('linked to manual changes source before cancellation and a late shared response cannot overwrite the entered manual amount', async () => {
  const h = harness({ source: 'wecost' });
  const wait = deferred(); h.flow.shared = () => wait.promise;
  const background = h.sharedService.refresh();
  await Promise.resolve();
  const eventCount = h.calls.sharedEvents;
  h.calls.handler = 0; h.calls.writes.length = 0;
  await h.apply({ recommendBudgetSource: 'manual', recommendMaxPriceEok: '7', recommendMaxPriceMan: '3000' }, 'price');
  assert.equal(h.controls.get('recommendBudgetSource').value, 'manual');
  assert.equal(h.sandbox.readRecommendationPriceManWon(), 73000);
  assert.equal(h.calls.cancel, 1);
  assert.equal(h.calls.handler, 1);
  assert.ok(h.calls.sharedEvents > eventCount, 'Real cancel publishes through the installed app subscription');
  wait.resolve(response(900000000));
  await background;
  await Promise.resolve();
  assert.equal(h.sandbox.readRecommendationPriceManWon(), 73000);
  assert.equal(h.calls.handler, 1);
  assert.equal(h.calls.previewCreated, 0);
  assert.equal(h.calls.search, 0);
});

test('opening the full filter only moves focus and does not apply or run a search', () => {
  const h = harness(); const before = h.values();
  h.sandbox.openRecommendationFullFilter('parking');
  assert.deepEqual(h.calls.panels, ['filters']);
  assert.deepEqual(h.calls.focus, ['recommendParkingRatio']);
  assert.deepEqual(h.values(), before);
  assert.equal(h.calls.handler, 0);
  assert.equal(h.calls.search, 0);
  assert.deepEqual(h.calls.network, []);
});
