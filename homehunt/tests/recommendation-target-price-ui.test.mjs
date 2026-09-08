import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseRecommendationQuery, parseKoreanMoneyToManWon, PYEONG_TO_M2 } from '../js/recommendation-core.mjs';
import { recommendationBudget, effectiveRecommendationDestinations } from '../js/personalized-context-core.mjs';
import { normalizeDestinations } from '../js/commute-balance-core.mjs';
import { rankPersonalizedCandidates } from '../js/personalized-ranking-core.mjs';
import { formatPriceManwon, formatCompactPrice } from '../js/display-format.mjs';
import { createHomeTargetPriceBridge } from '../../shared/home-target-price.mjs';
import { createWecostTargetPriceService } from '../js/wecost-target-price-service.mjs';

const source = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
function actualFunction(name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Actual app function ${name} must exist`);
  return match[0];
}

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

function availableTarget(targetPriceWon, updatedAt = '2026-09-07T01:00:00.000Z') {
  return { status: 'available', connection: 'firebase', snapshot: { version: 1, targetPriceWon, updatedAt, source: 'wecost' } };
}

function targetService(initialState) {
  let current = initialState;
  const listeners = new Set();
  const requests = [];
  let cancels = 0;
  const emit = next => { current = next; listeners.forEach(listener => listener(next)); };
  const service = {
    getState: () => current,
    subscribe(listener, { emitCurrent = true } = {}) {
      listeners.add(listener);
      if (emitCurrent) listener(current);
      return () => listeners.delete(listener);
    },
    refresh() {
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      requests.push({ resolve, promise });
      emit({ status: 'loading', connection: 'firebase', snapshot: null });
      return promise;
    },
    cancel() { cancels += 1; emit({ status: 'unavailable', connection: 'firebase', reason: 'cancelled', snapshot: null }); },
  };
  return {
    service, requests, emit, get cancels() { return cancels; },
    complete(index, next) {
      // Deliberately allow even a cancelled callback to reach the UI: the UI's
      // manual-source guard must be safe independently of service cancellation.
      emit(next);
      requests[index].resolve(next);
    },
  };
}

function harness({ sourceMode = 'manual', targetPriceWon = 600000000, serviceStatus = 'available' } = {}) {
  let observedAt = Date.parse('2026-09-07T01:00:00.000Z');
  const bridge = createHomeTargetPriceBridge({ storage: memoryStorage(), eventTarget: new EventTarget(), now: () => observedAt++ });
  if (targetPriceWon) bridge.publish(targetPriceWon);
  const serviceMock = targetService(serviceStatus === 'available' ? availableTarget(targetPriceWon) : {
    status: serviceStatus, connection: 'firebase', reason: 'not-requested', snapshot: null,
  });
  const values = {
    recommendCommuteMode: 'transit', recommendCommuteMax: '60', recommendMaxAge: '20', recommendDepartureTime: '08:00',
    recommendQuery: '', recommendHouseholds: '500', recommendHouseholdsOperator: 'gte', recommendMaxPriceEok: '6',
    recommendMaxPriceMan: '0', recommendPriceOperator: 'lte', recommendMinArea: '20', recommendAreaOperator: 'gte',
    recommendStationMin: '0', recommendStationMax: '0', recommendMonths: '3', recommendBudgetSource: sourceMode,
    recommendBudgetOverPct: '10', recommendParkingRatio: '1',
  };
  const nodes = new Map();
  const $ = selector => {
    if (!nodes.has(selector)) {
      const node = new EventTarget();
      const attributes = new Map();
      Object.assign(node, { value: values[selector.slice(1)] ?? '', textContent: '', min: '0', max: '100',
        setAttribute: (name, value) => attributes.set(name, String(value)),
        removeAttribute: name => attributes.delete(name), getAttribute: name => attributes.get(name) ?? null,
        checked: ['#recommendSeoul', '#recommendGyeonggi', '#recommendPreferSubway', '#recommendExcludeFar', '#recommendRequireParking'].includes(selector) });
      nodes.set(selector, node);
    }
    return nodes.get(selector);
  };
  const changes = [];
  const state = { workplaces: [], gangnamAnchor: { lat: 37.5, lng: 127 } };
  const sandbox = {
    $, state, bridge, homeTargetPriceBridge: bridge, wecostTargetPriceService: serviceMock.service,
    wecostTargetState: serviceMock.service.getState(), lastRecommendationDestinations: [],
    window: new EventTarget(), document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    parseRecommendationQuery, parseKoreanMoneyToManWon, PYEONG_TO_M2, formatPriceManwon, formatCompactPrice,
    formatAreaPair: value => `${value}㎡`,
    recommendationBudget, effectiveRecommendationDestinations, normalizeDestinations,
    renderWorkplaces() {}, updateRecommendationAreaMetric() {}, syncRecommendationRanges() {}, renderRecommendationActiveFilters() {},
    updateRangeVisual() {}, loadGeocodeResult: () => null,
    setPickerValue: (id, value) => { $(`#${id}`).value = value; },
    renderRecommendationChips() {}, updateRecommendationPreview: async () => {}, showToast() {},
    handleRecommendationCriteriaChanged: () => {
      // The actual criteria handler schedules a preview, which synchronously
      // refreshes these labels before doing any catalog work.
      sandbox.updateRecommendationPriceLabel();
      changes.push(structuredClone(sandbox.readRecommendationForm()));
    },
  };
  vm.createContext(sandbox);
  for (const name of ['boundedNumber', 'pricePartNumber', 'priceEokNumber', 'readRecommendationPriceParts',
    'readRecommendationPriceManWon', 'writeRecommendationPrice', 'readRecommendationForm', 'writeRecommendationForm',
    'recommendationSentence', 'recommendationChipLabels', 'parseRecommendationInput', 'updateRecommendationPriceLabel', 'updateTargetPriceConnection',
    'initializeWecostTargetConnection', 'selectRecommendationBudgetSource']) {
    vm.runInContext(actualFunction(name), sandbox);
  }
  const binding = actualFunction('bindEvents');
  const bindingStart = binding.indexOf("$('#recommendBudgetSource').addEventListener('change'");
  const bindingEnd = binding.indexOf("$('#parseRecommendation').addEventListener", bindingStart);
  assert.ok(bindingStart >= 0 && bindingEnd > bindingStart, 'Actual budget source and import handlers must exist');
  vm.runInContext(binding.slice(bindingStart, bindingEnd), sandbox);
  return { $, sandbox, bridge, changes, state, serviceMock };
}

test('re-reading the generated sentence never compounds the over-budget ceiling into the target', async () => {
  const { $, sandbox, changes } = harness();
  for (let repeat = 0; repeat < 4; repeat += 1) {
    $('#recommendQuery').value = sandbox.recommendationSentence(sandbox.readRecommendationForm());
    await sandbox.parseRecommendationInput(false);
    const filters = sandbox.readRecommendationForm();
    assert.equal(filters.targetPriceManWon, 60000);
    assert.equal(filters.maxPriceManWon, 66000);
    assert.equal(filters.maxOverBudgetPct, 10);
  }
  assert.equal(changes.length, 4, 'Every natural-language application must enter the normal criteria-change path');
});

test('an explicit natural-language price switches WeCost to manual without changing the bridge or company settings', async () => {
  const { $, sandbox, bridge, changes, state } = harness({ sourceMode: 'wecost' });
  state.workplaces = [{ id: 'company-A', label: '회사 A', lat: 37.6, lng: 127.1,
    modes: ['transit'], weightPercent: 75, weightSource: 'explicit-percent', individualMaxMinutes: 80 }];
  const originalPoint = { lat: state.workplaces[0].lat, lng: state.workplaces[0].lng };
  $('#recommendQuery').value = '경기에서 목표집가격 24억 5,000만원, 700세대 이상';
  await sandbox.parseRecommendationInput(false);
  const filters = sandbox.readRecommendationForm();
  assert.equal(filters.budgetSource, 'manual');
  assert.equal(filters.targetPriceManWon, 245000);
  assert.equal(filters.maxPriceManWon, 269500);
  assert.equal(filters.minHouseholds, 700);
  assert.equal(filters.destinations[0].lat, originalPoint.lat);
  assert.equal(filters.destinations[0].lng, originalPoint.lng);
  assert.equal(state.workplaces[0].weightPercent, 75);
  assert.equal(state.workplaces[0].individualMaxMinutes, 80);
  assert.equal(bridge.read().snapshot.targetPriceWon, 600000000);
  assert.match($('#recommendBudgetSourceStatus').textContent, /직접 입력/);
  assert.equal(changes[0].budgetSource, 'manual');
});

test('a sentence without a price retains the linked target and tolerance, including saved-form round trips', async () => {
  const { $, sandbox } = harness({ sourceMode: 'wecost' });
  $('#recommendBudgetOverPct').value = '20';
  $('#recommendQuery').value = '경기에서 700세대 이상, 전용 25평 이상';
  await sandbox.parseRecommendationInput(false);
  const saved = JSON.parse(JSON.stringify(sandbox.readRecommendationForm()));
  sandbox.writeRecommendationForm(saved);
  const restored = sandbox.readRecommendationForm();
  assert.equal(restored.budgetSource, 'wecost');
  assert.equal(restored.targetPriceManWon, 60000);
  assert.equal(restored.maxPriceManWon, 72000);
  assert.equal(restored.maxOverBudgetPct, 20);
});

test('an unavailable WeCost connection preserves visible input but cannot contribute an old budget or confirmed score', () => {
  const { $, sandbox, bridge } = harness({ sourceMode: 'wecost' });
  sandbox.wecostTargetState = bridge.clear('wecost-unavailable');
  sandbox.updateTargetPriceConnection({ apply: true });
  const filters = sandbox.readRecommendationForm();
  assert.equal($('#recommendMaxPriceEok').value, '6');
  assert.equal(filters.targetPriceManWon, 0);
  assert.equal(filters.maxPriceManWon, 0);
  assert.match($('#recommendBudgetSourceStatus').textContent, /검색과 예산 점수를 계산하지 않습니다/);
  const [candidate] = rankPersonalizedCandidates([{ catalogId: 'fixture', households: 700, builtYear: 2020,
    bestArea: { count: 3, averagePriceManWon: 50000, areaM2: 84 }, priceVerified: true }], filters);
  assert.equal(candidate.personalizedRecommendation.dimensions.budget.status, 'unknown');
  assert.equal(candidate.personalizedRecommendation.dimensions.budget.score, 0);
  assert.equal(candidate.personalizedRecommendation.score, null);
  assert.ok(candidate.personalizedRecommendation.gateReasons.includes('price-evidence-incomplete'));
  $('#recommendBudgetSource').value = 'manual';
  sandbox.updateTargetPriceConnection();
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 60000);
  assert.equal(sandbox.readRecommendationForm().maxPriceManWon, 66000);
});

test('selecting WeCost reads Firebase and converts won into the exact target and over-budget ceiling', async () => {
  const { $, sandbox, serviceMock, changes } = harness({ serviceStatus: 'unavailable' });
  sandbox.initializeWecostTargetConnection();
  assert.equal(serviceMock.requests.length, 0);
  $('#recommendBudgetSource').value = 'wecost';
  $('#recommendBudgetSource').dispatchEvent(new Event('change'));
  assert.equal(serviceMock.requests.length, 1);
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 0, 'Previous manual amount is blocked while Firebase is loading');
  serviceMock.complete(0, availableTarget(825000000));
  await serviceMock.requests[0].promise;
  const filters = sandbox.readRecommendationForm();
  assert.equal(filters.targetPriceManWon, 82500);
  assert.equal(filters.maxPriceManWon, 90750);
  assert.equal($('#recommendMaxPriceEok').value, '8');
  assert.equal($('#recommendMaxPriceMan').value, '2,500');
  assert.match($('#recommendBudgetCeiling').textContent, /9억 750만원/);
  assert.match($('#recommendBudgetSourceStatus').textContent, /Firebase 직접 연결/);
  assert.equal(changes.at(-1).targetPriceManWon, 82500);
  assert.equal(changes.at(-1).maxPriceManWon, 90750);
});

test('switching back to manual cancels refresh and late Firebase callbacks cannot overwrite the manual amount', async () => {
  const { $, sandbox, serviceMock, bridge, changes } = harness({ sourceMode: 'wecost', serviceStatus: 'unavailable' });
  sandbox.initializeWecostTargetConnection();
  $('#recommendBudgetSource').value = 'manual';
  $('#recommendBudgetSource').dispatchEvent(new Event('change'));
  sandbox.writeRecommendationPrice(45000);
  const changeCount = changes.length;
  assert.equal(serviceMock.cancels, 1);
  serviceMock.complete(0, availableTarget(1100000000));
  await serviceMock.requests[0].promise;
  bridge.publish(1500000000);
  assert.equal(sandbox.readRecommendationForm().budgetSource, 'manual');
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 45000);
  assert.equal(sandbox.readRecommendationForm().maxPriceManWon, 49500);
  assert.equal(changes.length, changeCount);
  assert.equal(serviceMock.requests.length, 1, 'Manual mode never refreshes for bridge notifications');
  assert.match($('#recommendBudgetSourceStatus').textContent, /직접 입력/);
});

test('a Firebase error blocks an older displayed amount from both searching and budget scoring', async () => {
  const { $, sandbox, serviceMock } = harness({ sourceMode: 'wecost', serviceStatus: 'unavailable' });
  sandbox.initializeWecostTargetConnection();
  serviceMock.complete(0, availableTarget(825000000));
  await serviceMock.requests[0].promise;
  $('#importWecostTarget').dispatchEvent(new Event('click'));
  assert.equal(serviceMock.requests.length, 2);
  serviceMock.complete(1, { status: 'unavailable', connection: 'firebase', snapshot: null, reason: 'permission-denied' });
  await serviceMock.requests[1].promise;
  const filters = sandbox.readRecommendationForm();
  assert.equal($('#recommendMaxPriceEok').value, '8');
  assert.equal($('#recommendMaxPriceMan').value, '2,500');
  assert.equal(filters.targetPriceManWon, 0);
  assert.equal(filters.maxPriceManWon, 0);
  assert.match($('#recommendPriceReadable').textContent, /검색에 사용하지 않습니다/);
  assert.match($('#recommendBudgetSourceStatus').textContent, /검색과 예산 점수를 계산하지 않습니다/);
  const [candidate] = rankPersonalizedCandidates([{ catalogId: 'fixture', households: 700, builtYear: 2020,
    bestArea: { count: 3, averagePriceManWon: 50000, areaM2: 84 }, priceVerified: true }], filters);
  assert.equal(candidate.personalizedRecommendation.dimensions.budget.status, 'unknown');
  assert.equal(candidate.personalizedRecommendation.dimensions.budget.score, 0);
  assert.equal(candidate.personalizedRecommendation.score, null);
});

test('the local bridge requests a Firebase refresh and never injects its own amount directly', async () => {
  const { sandbox, serviceMock, bridge, changes } = harness({ sourceMode: 'wecost', serviceStatus: 'unavailable' });
  sandbox.initializeWecostTargetConnection();
  serviceMock.complete(0, availableTarget(825000000));
  await serviceMock.requests[0].promise;
  bridge.publish(1999000000);
  assert.equal(serviceMock.requests.length, 2);
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 0);
  assert.equal(changes.some(change => change.targetPriceManWon === 199900), false);
  serviceMock.complete(1, availableTarget(930000000));
  await serviceMock.requests[1].promise;
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 93000);
  assert.equal(sandbox.readRecommendationForm().maxPriceManWon, 102300);
  assert.equal(bridge.read().snapshot.targetPriceWon, 1999000000, 'The signal and the authoritative response deliberately disagree');
  const priorCount = changes.length;
  serviceMock.emit(availableTarget(930000000, '2026-09-07T01:01:00.000Z'));
  assert.equal(changes.length, priorCount, 'An unchanged amount with a fresh timestamp does not invalidate a search');
});

test('the import action saves the WeCost source and refreshes instead of importing a cached bridge amount', () => {
  const { $, sandbox, serviceMock, changes } = harness({ serviceStatus: 'unavailable', targetPriceWon: 1999000000 });
  sandbox.initializeWecostTargetConnection();
  $('#importWecostTarget').dispatchEvent(new Event('click'));
  assert.equal($('#recommendBudgetSource').value, 'wecost');
  assert.equal(serviceMock.requests.length, 1);
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 0);
  assert.equal(changes.length, 1, 'Switching from manual persists the selected source before its refresh settles');
  assert.equal(changes[0].budgetSource, 'wecost');
});

test('the real service loading-to-same-target refresh preserves candidates without rerunning criteria changes', async () => {
  let requestCount = 0;
  let finishReread;
  const pendingReread = new Promise(resolve => { finishReread = resolve; });
  let observedAt = Date.now() - 120000;
  const service = createWecostTargetPriceService({
    now: () => new Date(observedAt++),
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount === 2) await pendingReread;
      return { ok: true, json: async () => ({ fields: { targetHousePrice: { integerValue: '825000000' } } }) };
    },
  });
  const { sandbox, state, $, changes } = harness({ sourceMode: 'wecost' });
  sandbox.wecostTargetPriceService = service;
  sandbox.wecostTargetState = service.getState();
  sandbox.initializeWecostTargetConnection();
  await service.refresh(); // Coalesces with initialization's pending request.
  assert.equal(requestCount, 1);
  assert.equal(changes.length, 1);
  const priorConfirmedAt = service.getState().snapshot.updatedAt;
  const existingCandidates = [{ catalogId: 'existing-verified-candidate' }];
  const existingSnapshot = { filters: sandbox.readRecommendationForm() };
  state.recommendationResults = existingCandidates;
  state.recommendationRunSnapshot = existingSnapshot;

  state.commuteVerificationRunning = true;
  sandbox.window.dispatchEvent(new Event('focus'));
  sandbox.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(service.getState().status, 'available', 'Returning to the tab during commute verification must not start loading');
  assert.equal(requestCount, 1);
  state.commuteVerificationRunning = false;

  const refresh = service.refresh();
  assert.equal(service.getState().status, 'loading');
  assert.equal(changes.length, 1, 'A temporary loading state does not cancel or clear the existing search');
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 0, 'New searches remain blocked until Firebase confirms the amount');
  assert.equal(sandbox.readRecommendationForm().maxPriceManWon, 0);
  assert.match($('#recommendPriceReadable').textContent, /검색에 사용하지 않습니다/);
  finishReread();
  await refresh;
  assert.equal(requestCount, 2);
  assert.notEqual(service.getState().snapshot.updatedAt, priorConfirmedAt);
  assert.equal(changes.length, 1, 'The same settled amount does not rerun the criteria-change path');
  assert.equal(state.recommendationResults, existingCandidates);
  assert.equal(state.recommendationRunSnapshot, existingSnapshot);
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 82500);
  assert.equal(sandbox.readRecommendationForm().maxPriceManWon, 90750);
});

for (const sourceMode of ['manual', 'wecost']) {
  test(`actual initialization automatically reads Firebase only for a restored WeCost source (${sourceMode})`, async () => {
    const { sandbox, bridge, serviceMock } = harness({ sourceMode, serviceStatus: 'unavailable' });
    const init = actualFunction('init');
    const start = init.indexOf('restoreRecommendationForm();');
    const end = init.indexOf('renderAllVisits();', start);
    assert.ok(start >= 0 && end > start, 'The actual restore-to-subscribe initialization section must exist');
    sandbox.restoreRecommendationForm = () => {};
    sandbox.loadRailStationData = async () => { await Promise.resolve(); bridge.publish(1999000000); };
    await vm.runInContext(`(async () => { ${init.slice(start, end)} })()`, sandbox);
    assert.equal(serviceMock.requests.length, sourceMode === 'wecost' ? 1 : 0);
    if (sourceMode === 'wecost') {
      assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 0);
      serviceMock.complete(0, availableTarget(730000000));
      await serviceMock.requests[0].promise;
      assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 73000);
      assert.equal(sandbox.readRecommendationForm().maxPriceManWon, 80300);
    } else {
      assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 60000);
      assert.equal(sandbox.readRecommendationForm().maxPriceManWon, 66000);
    }
  });
}

test('source buttons preserve manual 7억 through WeCost 6억 → manual 7억 → WeCost 6억 and reflect editability', async () => {
  const { $, sandbox, serviceMock, changes } = harness({ serviceStatus: 'unavailable' });
  sandbox.writeRecommendationPrice(70000);
  sandbox.initializeWecostTargetConnection();
  const choose = id => $(id).dispatchEvent(new Event('click'));
  const assertControls = linked => {
    assert.equal($('#importWecostTarget').getAttribute('aria-pressed'), String(linked));
    assert.equal($('#useManualTarget').getAttribute('aria-pressed'), String(!linked));
    assert.equal($('#recommendMaxPriceEok').readOnly, linked);
    assert.equal($('#recommendMaxPriceMan').readOnly, linked);
    assert.equal($('#recommendMaxPriceRange').disabled, linked);
  };
  assertControls(false);
  choose('#importWecostTarget');
  assertControls(true);
  assert.equal(sandbox.readRecommendationForm().manualTargetPriceManWon, 70000);
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 0);
  assert.equal(changes.at(-1).budgetSource, 'wecost', 'source and manual draft are persisted before Firebase settles');
  assert.equal(changes.at(-1).manualTargetPriceManWon, 70000);
  const loadingChip = sandbox.recommendationChipLabels(sandbox.readRecommendationForm()).find(item => item.controlId === 'recommendMaxPriceEok');
  assert.equal(loadingChip.label, 'WeCost 금액 확인 중');
  serviceMock.complete(0, availableTarget(600000000));
  await serviceMock.requests[0].promise;
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 60000);
  assert.equal($('#recommendMaxPriceEok').value, '6');
  assert.match(sandbox.recommendationChipLabels(sandbox.readRecommendationForm()).find(item => item.controlId === 'recommendMaxPriceEok').label, /^WeCost 목표 6억원/);
  choose('#useManualTarget');
  assertControls(false);
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 70000);
  assert.equal($('#recommendMaxPriceEok').value, '7');
  const count = changes.length;
  choose('#useManualTarget');
  assert.equal(changes.length, count, 'reselecting manual does not reset its draft or invalidate the search');
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 70000);
  choose('#importWecostTarget');
  serviceMock.complete(1, availableTarget(600000000));
  await serviceMock.requests[1].promise;
  assertControls(true);
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 60000);
  assert.equal(sandbox.readRecommendationForm().manualTargetPriceManWon, 70000);
  choose('#importWecostTarget');
  assert.equal(serviceMock.requests.length, 3, 'reselecting WeCost explicitly rechecks the authoritative value');
});

test('saved WeCost, manual and loading forms restore the independent manual amount without trusting an old linked target', async () => {
  const original = harness({ serviceStatus: 'unavailable' });
  original.sandbox.writeRecommendationPrice(70000);
  original.sandbox.initializeWecostTargetConnection();
  original.$('#importWecostTarget').dispatchEvent(new Event('click'));
  const loading = JSON.parse(JSON.stringify(original.sandbox.readRecommendationForm()));
  original.serviceMock.complete(0, availableTarget(600000000));
  await original.serviceMock.requests[0].promise;
  const linked = JSON.parse(JSON.stringify(original.sandbox.readRecommendationForm()));
  original.$('#useManualTarget').dispatchEvent(new Event('click'));
  const manual = JSON.parse(JSON.stringify(original.sandbox.readRecommendationForm()));
  for (const saved of [loading, linked, manual]) {
    const restored = harness({ serviceStatus: 'unavailable' });
    restored.sandbox.writeRecommendationForm(saved);
    restored.sandbox.initializeWecostTargetConnection();
    assert.equal(restored.sandbox.readRecommendationForm().budgetSource, saved.budgetSource);
    assert.equal(restored.sandbox.readRecommendationForm().manualTargetPriceManWon, 70000);
    if (saved.budgetSource === 'wecost') {
      assert.equal(restored.sandbox.readRecommendationForm().targetPriceManWon, 0);
      restored.serviceMock.complete(0, availableTarget(600000000));
      await restored.serviceMock.requests[0].promise;
      assert.equal(restored.sandbox.readRecommendationForm().targetPriceManWon, 60000);
      restored.$('#useManualTarget').dispatchEvent(new Event('click'));
    } else assert.equal(restored.serviceMock.requests.length, 0);
    assert.equal(restored.sandbox.readRecommendationForm().targetPriceManWon, 70000);
  }
});

test('a first manual switch starts from the current verified WeCost target and later edits remain independent', () => {
  const { $, sandbox, serviceMock } = harness({ sourceMode: 'wecost' });
  sandbox.updateTargetPriceConnection({ apply: true });
  $('#useManualTarget').dispatchEvent(new Event('click'));
  assert.equal(serviceMock.cancels, 1);
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 60000);
  sandbox.writeRecommendationPrice(72500);
  $('#useManualTarget').dispatchEvent(new Event('click'));
  assert.equal(sandbox.readRecommendationForm().manualTargetPriceManWon, 72500);
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 72500);
  assert.equal($('#recommendMaxPriceEok').value, '7');
  assert.equal($('#recommendMaxPriceMan').value, '2,500');
  assert.equal(serviceMock.cancels, 1);
});

test('a cancelled Firebase request cannot overwrite a later WeCost selection or its preserved manual value', async () => {
  const requests = [];
  const service = createWecostTargetPriceService({ fetchImpl: () => new Promise(resolve => { requests.push(resolve); }) });
  const { $, sandbox, changes } = harness({ serviceStatus: 'unavailable' });
  sandbox.wecostTargetPriceService = service;
  sandbox.wecostTargetState = service.getState();
  sandbox.writeRecommendationPrice(70000);
  sandbox.initializeWecostTargetConnection();
  $('#importWecostTarget').dispatchEvent(new Event('click'));
  const old = service.refresh();
  await Promise.resolve();
  assert.equal(requests.length, 1);
  $('#useManualTarget').dispatchEvent(new Event('click'));
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 70000);
  $('#importWecostTarget').dispatchEvent(new Event('click'));
  const current = service.refresh();
  await Promise.resolve();
  assert.equal(requests.length, 2);
  requests[1]({ ok: true, json: async () => ({ fields: { targetHousePrice: { integerValue: '600000000' } } }) });
  await current;
  requests[0]({ ok: true, json: async () => ({ fields: { targetHousePrice: { integerValue: '1100000000' } } }) });
  await old;
  await Promise.resolve();
  assert.equal(sandbox.readRecommendationForm().targetPriceManWon, 60000);
  assert.equal(sandbox.readRecommendationForm().manualTargetPriceManWon, 70000);
  assert.equal($('#recommendMaxPriceEok').value, '6');
  assert.equal(changes.some(filters => filters.targetPriceManWon === 110000), false);
});
