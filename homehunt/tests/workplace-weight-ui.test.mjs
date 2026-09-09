import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeDestinations } from '../js/commute-balance-core.mjs';
import { effectiveRecommendationDestinations, recommendationBudget, destinationLetter } from '../js/personalized-context-core.mjs';
import { PYEONG_TO_M2 } from '../js/recommendation-core.mjs';

const source = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
function actualFunction(name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Actual app function ${name} must exist`);
  return match[0];
}

// Small DOM fixture: node identity, focus and browser input/change events are
// observable; normalization and application handlers come from production.
class MiniNode {
  constructor(tag = 'div', className = '', text = '', document = null) {
    this.tagName = tag.toUpperCase(); this.className = className; this.textContent = text;
    this.children = []; this.attributes = new Map(); this.listeners = new Map();
    this.style = { setProperty() {} }; this.value = ''; this.checked = false;
    this.dataset = {}; this.classList = { toggle() {}, add() {}, remove() {} };
    this.replacements = 0; this.document = document;
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; this.replacements += 1; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type) { for (const listener of this.listeners.get(type) || []) listener({ target: this, currentTarget: this, type }); }
  focus() { this.document.activeElement = this; }
  all(tag) { return this.children.flatMap(child => [...(child.tagName === tag.toUpperCase() ? [child] : []), ...child.all(tag)]); }
}

const legacyCompany = (id = 'A', days = 5) => ({ id, label: `회사 ${id}`, address: `회사 ${id} 주소`,
  lat: 37.5, lng: 127.1, daysPerWeek: days, weight: days, weightSource: 'days-per-week',
  individualMaxMinutes: 75, memo: `${id} 메모` });
const explicitCompany = (id, percent) => ({ ...legacyCompany(id), weightPercent: percent, weightSource: 'explicit-percent' });

function harness(workplaces = []) {
  const document = { activeElement: null };
  const nodes = new Map();
  const createElement = (tag, cls, text) => new MiniNode(tag, cls, text, document);
  const $ = (selector, parent) => {
    if (parent) return parent.all(selector)[0];
    if (!nodes.has(selector)) nodes.set(selector, createElement('div'));
    return nodes.get(selector);
  };
  const form = { recommendCommuteMode: 'transit', recommendCommuteMax: '60', recommendDepartureTime: '08:00',
    recommendMaxAge: '20', recommendQuery: '', recommendHouseholds: '500', recommendHouseholdsOperator: 'gte',
    recommendBudgetOverPct: '10', recommendBudgetSource: 'manual', recommendParkingRatio: '1',
    recommendPriceOperator: 'lte', recommendMinArea: '20', recommendAreaOperator: 'gte',
    recommendStationMin: '0', recommendStationMax: '0', recommendMonths: '3' };
  for (const [id, value] of Object.entries(form)) $(`#${id}`).value = value;
  for (const id of ['recommendSeoul', 'recommendGyeonggi', 'recommendPreferSubway', 'recommendExcludeFar', 'recommendRequireParking']) $(`#${id}`).checked = true;
  $('#confirmCompanyLocation').append(createElement('span'));
  $('#applyCompanyLocation').append(createElement('span'));
  $('#saveCompanyDestinations').append(createElement('span'));
  $('#companyPostcodePanel').hidden = true;
  const state = { workplaces: structuredClone(workplaces), gangnamAnchor: { lat: 37.5, lng: 127 }, recommendationRunning: false };
  const saves = [];
  const geocodes = []; const toasts = []; const pins = [];
  let nextId = 0;
  const sandbox = {
    $, $$: () => [], state, createElement, normalizeDestinations, effectiveRecommendationDestinations, recommendationBudget, destinationLetter, PYEONG_TO_M2,
    decisionWorkspace: null, setCompanyLocationStatus() {},
    updateCompanySearchCapability() {}, renderCompanyPickerSelection() {},
    companyPickerMap: { clearSearchLocation() {}, cancelPinMode() {}, showSearchLocation(...args) { pins.push(args); }, startPinMode(callback) { sandbox.mapClick = callback; }, reverse: async () => '지도 주소' }, ensureCompanyPickerMap: async () => null,
    openModalShell: id => { $(`#${id}`).hidden = false; }, closeModalShell: id => { $(`#${id}`).hidden = true; }, closeCompanyPostcodeSearch() {},
    companyPickerSearchToken: 0, companyPickerClickToken: 0,
    isGeoPoint: point => Number.isFinite(point?.lat) && Number.isFinite(point?.lng),
    saveGeocodeResult: (query, point) => { geocodes.push(query); return { ...point, required: true }; },
    workplaceId: () => `new-company-${++nextId}`, showToast: (...args) => toasts.push(args),
    loadRecommendationFilters: () => null, resetRecommendationForm() {},
    recommendationSentence: () => 'restored criteria', recommendationChipLabels: () => [], renderRecommendationChips() {},
    readRecommendationPriceManWon: () => 60000, writeRecommendationPrice() {}, loadGeocodeResult: () => null,
    updateRecommendationAreaMetric() {}, syncRecommendationRanges() {}, renderRecommendationActiveFilters() {},
    setPickerValue: (id, value) => { $(`#${id}`).value = value; },
    handleRecommendationCriteriaChanged: () => saves.push(JSON.stringify(sandbox.readRecommendationForm())),
  };
  vm.createContext(sandbox);
  for (const name of ['boundedNumber', 'readSelectedCommuteModes', 'companyLocationAddress',
    'companyLocationLabel', 'readRecommendationForm', 'writeRecommendationForm', 'renderWorkplaces',
    'activeCompanyDestinationDraft', 'createCompanyDestinationDraft', 'captureCompanyDestinationDraft',
    'invalidateCompanyDraftLocation', 'companyDestinationDraftError', 'renderCompanyDestinationDrafts',
    'switchCompanyDestinationDraft', 'addCompanyDestinationDraft', 'removeCompanyDestinationDraft',
    'openCompanyLocationModal', 'closeCompanyLocationModal', 'applyCompanyPickerLocation', 'saveCompanyDestinationDrafts',
    'renderCompanyPickerSelection', 'selectCompanyPickerLocation', 'armCompanyPickerMap',
    'searchCompanyLocations', 'restoreRecommendationForm']) vm.runInContext(actualFunction(name), sandbox);
  const inputs = () => $('#workplaceList').all('input');
  const displayedShares = () => $('#workplaceList').all('output').map(node => node.textContent);
  return { $, document, state, sandbox, saves, inputs, displayedShares, geocodes, toasts, pins };
}

test('legacy A becomes an explicit input, then A 10 / B 50 / C 40 stay exact across input events, saving and reload', () => {
  const ui = harness([legacyCompany()]);
  ui.sandbox.renderWorkplaces();
  assert.equal(ui.inputs()[0].value, '100');
  assert.equal(ui.state.workplaces[0].weightSource, 'explicit-percent');
  ui.state.workplaces.push(explicitCompany('B', 50));
  ui.sandbox.renderWorkplaces();
  const a = ui.inputs()[0];
  const b = ui.inputs()[1];
  const priorReplacements = ui.$('#workplaceList').replacements;
  a.focus();
  a.value = '10';
  a.dispatch('input');
  assert.equal(ui.inputs()[0], a, 'Typing must keep the active number input attached');
  assert.equal(ui.inputs()[1], b, 'Other inputs must also keep their identity');
  assert.equal(ui.document.activeElement, a);
  assert.equal(ui.$('#workplaceList').replacements, priorReplacements);
  assert.deepEqual(ui.displayedShares(), ['반영 16.7%', '반영 83.3%']);
  assert.equal(ui.state.workplaces[0].weightPercent, 10);
  assert.equal(ui.state.workplaces[1].weightPercent, 50);
  a.dispatch('change');
  assert.equal(ui.saves.length, 1, 'The later change event must not repeat the same criteria update');
  ui.state.workplaces.push(explicitCompany('C', 0));
  ui.sandbox.renderWorkplaces();
  const c = ui.inputs()[2];
  c.value = '40'; c.dispatch('input');
  assert.deepEqual(ui.inputs().map(input => input.value), ['10', '50', '40']);
  assert.deepEqual(ui.displayedShares(), ['반영 10.0%', '반영 50.0%', '반영 40.0%']);
  const saved = JSON.parse(ui.saves.at(-1));
  assert.deepEqual(saved.workplaces.map(company => company.weightPercent), [10, 50, 40]);
  assert.deepEqual(saved.destinations.map(company => company.normalizedWeightPercent), [10, 50, 40]);
  const restored = harness();
  restored.sandbox.writeRecommendationForm(saved);
  restored.sandbox.renderWorkplaces();
  assert.deepEqual(restored.inputs().map(input => input.value), ['10', '50', '40']);
  assert.deepEqual(restored.displayedShares(), ['반영 10.0%', '반영 50.0%', '반영 40.0%']);
  assert.equal(restored.state.workplaces[0].individualMaxMinutes, 75);
  assert.equal(restored.state.workplaces[0].memo, 'A 메모');
  assert.equal(restored.state.workplaces[0].lat, 37.5);
});

test('mixed legacy and explicit saved rows show their effective shares immediately and do not drift on rerender or reload', () => {
  const ui = harness([legacyCompany(), explicitCompany('B', 50)]);
  ui.sandbox.renderWorkplaces();
  const raw = ui.state.workplaces.map(company => company.weightPercent);
  const expected = normalizeDestinations(ui.state.workplaces).map(company => `반영 ${company.normalizedWeightPercent.toFixed(1)}%`);
  assert.deepEqual(ui.displayedShares(), expected, 'Migrated raw values and displayed effective shares must belong to the same normalization');
  for (let repeat = 0; repeat < 3; repeat += 1) {
    ui.sandbox.renderWorkplaces();
    assert.deepEqual(ui.state.workplaces.map(company => company.weightPercent), raw);
    assert.deepEqual(ui.displayedShares(), expected);
  }
  const restored = harness();
  restored.sandbox.writeRecommendationForm(JSON.parse(JSON.stringify(ui.sandbox.readRecommendationForm())));
  assert.deepEqual(restored.inputs().map(input => input.value), raw.map(String));
  assert.deepEqual(restored.displayedShares(), expected);
});

test('blank, negative and nonfinite edits keep the last valid state, while decimals apply immediately without losing focus', () => {
  const ui = harness([explicitCompany('A', 10), explicitCompany('B', 50)]);
  ui.sandbox.renderWorkplaces();
  const input = ui.inputs()[0];
  assert.equal(input.step, 'any');
  input.focus();
  for (const invalid of ['', '-1', 'Infinity', 'not-a-number']) {
    input.value = invalid; input.dispatch('input');
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.equal(ui.state.workplaces[0].weightPercent, 10);
    assert.equal(ui.saves.length, 0);
  }
  input.value = '12.5'; input.dispatch('input');
  assert.equal(input.getAttribute('aria-invalid'), null);
  assert.equal(ui.state.workplaces[0].weightPercent, 12.5);
  assert.deepEqual(ui.displayedShares(), ['반영 20.0%', '반영 80.0%']);
  assert.equal(ui.inputs()[0], input);
  assert.equal(ui.document.activeElement, input);
  assert.equal(ui.saves.length, 1);
  const summaries = ui.$('#workplaceList').all('small').map(node => node.textContent);
  assert.match(summaries[0], /^반영 20\.0%/);
  assert.match(summaries[1], /^반영 80\.0%/);
});

test('zero input weights remain zero through display and saved filters instead of restoring legacy days', () => {
  const ui = harness([explicitCompany('A', 10), explicitCompany('B', 50)]);
  ui.sandbox.renderWorkplaces();
  for (const input of ui.inputs()) { input.value = '0'; input.dispatch('input'); }
  assert.deepEqual(ui.displayedShares(), ['반영 0.0%', '반영 0.0%']);
  const saved = JSON.parse(ui.saves.at(-1));
  assert.deepEqual(saved.workplaces.map(company => company.weightPercent), [0, 0]);
  assert.deepEqual(saved.destinations.map(company => company.normalizedWeightPercent), [0, 0]);
  const restored = harness();
  restored.sandbox.writeRecommendationForm(saved);
  assert.deepEqual(restored.inputs().map(input => input.value), ['0', '0']);
  assert.deepEqual(restored.displayedShares(), ['반영 0.0%', '반영 0.0%']);
});

function threeCompanies() {
  return [
    { ...explicitCompany('gwanghwamun', 10), label: '광화문', required: true, individualMaxMinutes: 60 },
    { ...explicitCompany('A', 40), required: true, individualMaxMinutes: 75 },
    { ...explicitCompany('B', 50), required: true, individualMaxMinutes: 90 },
  ];
}

function assertThreeCompanyContract(ui) {
  const saved = JSON.parse(JSON.stringify(ui.sandbox.readRecommendationForm()));
  assert.deepEqual(saved.workplaces.map(row => row.id), ['gwanghwamun', 'A', 'B']);
  assert.deepEqual(saved.workplaces.map(row => row.required), [false, true, true]);
  assert.deepEqual(saved.destinations.map(row => row.required), [false, true, true]);
  assert.deepEqual(saved.workplaces.map(row => row.weightPercent), [10, 40, 50]);
  assert.deepEqual(saved.destinations.map(row => row.normalizedWeightPercent), [10, 40, 50]);
  assert.deepEqual(saved.workplaces.map(row => row.individualMaxMinutes), [60, 75, 90]);
  assert.deepEqual(saved.destinations.map(row => row.maxMinutes), [60, 75, 90]);
  return saved;
}

test('the company editor defaults to enforced time for new and legacy companies and restores an explicit false', async () => {
  const rows = threeCompanies();
  rows[0].required = false;
  delete rows[1].required;
  const ui = harness(rows);
  await ui.sandbox.openCompanyLocationModal('gwanghwamun');
  assert.equal(ui.$('#companyEnforceTime').checked, false);
  assert.equal(ui.$('#companyMaxMinutes').value, '60');
  assert.equal(ui.$('#companyWeightPercent').value, '10');
  await ui.sandbox.openCompanyLocationModal('A');
  assert.equal(ui.$('#companyEnforceTime').checked, true, 'A legacy missing value means enforced, not unchecked');
  assert.equal(ui.$('#companyMaxMinutes').value, '75');
  await ui.sandbox.openCompanyLocationModal('B');
  assert.equal(ui.$('#companyEnforceTime').checked, true);
  await ui.sandbox.openCompanyLocationModal();
  assert.equal(ui.$('#companyEnforceTime').checked, true, 'A new company must not inherit the previous unchecked editor value');
  assert.equal(ui.state.workplaces[0].required, false, 'Opening another editor does not mutate the saved setting');
});

test('saving only Gwanghwamun as soft preserves A/B enforcement, 10/40/50 weights and individual time limits', async () => {
  const ui = harness(threeCompanies());
  ui.sandbox.renderWorkplaces();
  await ui.sandbox.openCompanyLocationModal('gwanghwamun');
  assert.equal(ui.$('#companyEnforceTime').checked, true);
  ui.$('#companyEnforceTime').checked = false;
  ui.sandbox.saveCompanyDestinationDrafts();
  assertThreeCompanyContract(ui);
  assert.equal(ui.saves.length, 1);
  assert.equal(JSON.parse(ui.saves[0]).workplaces[0].required, false,
    'The staged editor choice overrides the existing required:true setting');
  assert.equal(ui.state.workplaces[0].memo, 'gwanghwamun 메모');
  await ui.sandbox.openCompanyLocationModal('gwanghwamun');
  assert.equal(ui.$('#companyEnforceTime').checked, false);
  ui.$('#companyEnforceTime').checked = true;
  ui.sandbox.saveCompanyDestinationDrafts();
  assert.deepEqual(ui.state.workplaces.map(row => row.required), [true, true, true]);
  await ui.sandbox.openCompanyLocationModal('gwanghwamun');
  ui.$('#companyEnforceTime').checked = false;
  ui.sandbox.saveCompanyDestinationDrafts();
  assertThreeCompanyContract(ui);
});

test('weight input edits and the actual saved-form restore preserve the soft company independently from its share', async () => {
  const rows = threeCompanies();
  rows[0].required = false;
  const ui = harness();
  ui.sandbox.writeRecommendationForm({ workplaces: rows, commuteModes: ['transit'], commuteMaxMinutes: 60 });
  assertThreeCompanyContract(ui);
  const a = ui.inputs()[1];
  a.value = '42'; a.dispatch('input');
  assert.deepEqual(ui.state.workplaces.map(row => row.required), [false, true, true]);
  a.value = '40'; a.dispatch('input');
  const saved = assertThreeCompanyContract(ui);
  assert.deepEqual(JSON.parse(ui.saves.at(-1)).workplaces.map(row => row.required), [false, true, true]);
  const restored = harness();
  restored.sandbox.loadRecommendationFilters = () => saved;
  restored.sandbox.restoreRecommendationForm();
  assertThreeCompanyContract(restored);
  assert.deepEqual(restored.inputs().map(input => input.value), ['10', '40', '50']);
  assert.deepEqual(restored.displayedShares(), ['반영 10.0%', '반영 40.0%', '반영 50.0%']);
  await restored.sandbox.openCompanyLocationModal('gwanghwamun');
  assert.equal(restored.$('#companyEnforceTime').checked, false);
  await restored.sandbox.openCompanyLocationModal('A');
  assert.equal(restored.$('#companyEnforceTime').checked, true);
  await restored.sandbox.openCompanyLocationModal('B');
  assert.equal(restored.$('#companyEnforceTime').checked, true);
});

test('a single modal stages edits to three companies and cancel discards every edit and removal without writes', async () => {
  const ui = harness(threeCompanies());
  const before = JSON.stringify(ui.state.workplaces);
  await ui.sandbox.openCompanyLocationModal('gwanghwamun');
  ui.$('#companyWeightPercent').value = '15';
  ui.$('#companyEnforceTime').checked = false;
  await ui.sandbox.switchCompanyDestinationDraft('A');
  ui.$('#companyMaxMinutes').value = '80';
  await ui.sandbox.removeCompanyDestinationDraft('B');
  await ui.sandbox.switchCompanyDestinationDraft('gwanghwamun');
  assert.equal(ui.$('#companyWeightPercent').value, '15');
  assert.equal(ui.$('#companyEnforceTime').checked, false);
  assert.equal(JSON.stringify(ui.state.workplaces), before);
  ui.sandbox.closeCompanyLocationModal();
  assert.equal(JSON.stringify(ui.state.workplaces), before);
  assert.equal(ui.saves.length, 0);
  assert.equal(ui.geocodes.length, 0);
  assert.equal(ui.state.companyDestinationDraft, null);
  assert.equal(ui.$('#companyLocationModal').hidden, true);
});

test('two locations can be added in one session and one final save keeps IDs, raw weights and independent modes', async () => {
  const rows = threeCompanies();
  rows[0].modes = ['car']; rows[0].departureTime = '07:20';
  const ui = harness(rows);
  await ui.sandbox.openCompanyLocationModal();
  const firstId = ui.state.activeWorkplaceId;
  ui.sandbox.selectCompanyPickerLocation({ name: '새 회사 하나', roadAddress: '서울 첫째길', lat: 37.51, lng: 127.11 });
  ui.$('#companyWeightPercent').value = '20';
  ui.$('#companyEnforceTime').checked = false;
  ui.sandbox.applyCompanyPickerLocation();
  const secondId = ui.state.activeWorkplaceId;
  assert.notEqual(firstId, secondId);
  assert.equal(ui.$('#companyLocationModal').hidden, false);
  assert.equal(ui.saves.length, 0);
  assert.equal(ui.geocodes.length, 0);
  ui.sandbox.selectCompanyPickerLocation({ name: '새 회사 둘', roadAddress: '성남 둘째길', lat: 37.42, lng: 127.12 });
  ui.$('#companyWeightPercent').value = '30';
  ui.$('#companyMaxMinutes').value = '95';
  ui.sandbox.applyCompanyPickerLocation();
  assert.equal(ui.state.workplaces.length, 3);
  ui.sandbox.saveCompanyDestinationDrafts();
  assert.equal(ui.saves.length, 1, 'Only the final action changes the saved criteria');
  assert.equal(ui.geocodes.length, 2, 'Geocode persistence is deferred until the full draft validates');
  const saved = JSON.parse(ui.saves[0]);
  assert.deepEqual(saved.workplaces.map(row => row.id), ['gwanghwamun', 'A', 'B', firstId, secondId]);
  assert.deepEqual(saved.workplaces.map(row => row.weightPercent), [10, 40, 50, 20, 30]);
  assert.deepEqual(saved.workplaces.map(row => row.required), [true, true, true, false, true]);
  assert.deepEqual(saved.workplaces[0].modes, ['car']);
  assert.equal(saved.workplaces[0].departureTime, '07:20');
  assert.equal(saved.workplaces[4].individualMaxMinutes, 95);
  assert.equal(ui.state.workplaces.length, 5, 'The blank next destination is omitted');
});

test('unchanged restored coordinates may remain unresolved while other fields or companies are edited', async () => {
  const rows = threeCompanies();
  rows[0].lat = null; rows[0].lng = null;
  const ui = harness(rows);
  await ui.sandbox.openCompanyLocationModal('gwanghwamun');
  ui.$('#companyEnforceTime').checked = false;
  await ui.sandbox.switchCompanyDestinationDraft('A');
  ui.$('#companyMaxMinutes').value = '70';
  ui.sandbox.saveCompanyDestinationDrafts();
  assert.equal(ui.saves.length, 1);
  assert.equal(ui.state.workplaces[0].lat, null);
  assert.equal(ui.state.workplaces[0].lng, null);
  assert.equal(ui.state.workplaces[0].required, false);
  assert.equal(ui.state.workplaces[0].weightPercent, 10);
  assert.equal(ui.state.workplaces[1].individualMaxMinutes, 70);
  assert.equal(ui.geocodes.length, 0);
});

test('changed location without a selected result blocks all writes and focuses that draft, preserving the saved location', async () => {
  const ui = harness(threeCompanies());
  const before = JSON.stringify(ui.state.workplaces);
  await ui.sandbox.openCompanyLocationModal('A');
  ui.$('#companyLocationSearch').value = '다른 회사 검색';
  ui.sandbox.invalidateCompanyDraftLocation();
  await ui.sandbox.switchCompanyDestinationDraft('B');
  ui.$('#companyWeightPercent').value = '45';
  ui.sandbox.saveCompanyDestinationDrafts();
  assert.equal(ui.state.activeWorkplaceId, 'A');
  assert.match(ui.toasts.at(-1)[0], /위치를 선택/);
  assert.equal(JSON.stringify(ui.state.workplaces), before);
  assert.equal(ui.saves.length, 0);
  assert.equal(ui.geocodes.length, 0);
  assert.equal(ui.$('#companyLocationModal').hidden, false);
});

test('invalid weight in a non-active draft is validated before any newly selected coordinates are saved', async () => {
  const ui = harness(threeCompanies());
  await ui.sandbox.openCompanyLocationModal('A');
  ui.$('#companyWeightPercent').value = '-4';
  await ui.sandbox.addCompanyDestinationDraft();
  ui.sandbox.selectCompanyPickerLocation({ name: '새 회사', lat: 37.4, lng: 127.1 });
  ui.sandbox.saveCompanyDestinationDrafts();
  assert.equal(ui.state.activeWorkplaceId, 'A');
  assert.equal(ui.saves.length, 0);
  assert.equal(ui.geocodes.length, 0);
  assert.match(ui.toasts.at(-1)[0], /비중/);
});

test('saving an untouched editor closes it without invalidating results or rewriting geocodes', async () => {
  const ui = harness(threeCompanies());
  const before = JSON.stringify(ui.state.workplaces);
  await ui.sandbox.openCompanyLocationModal('A');
  await ui.sandbox.switchCompanyDestinationDraft('B');
  ui.sandbox.saveCompanyDestinationDrafts();
  assert.equal(JSON.stringify(ui.state.workplaces), before);
  assert.equal(ui.saves.length, 0);
  assert.equal(ui.geocodes.length, 0);
  assert.equal(ui.$('#companyLocationModal').hidden, true);
});

test('removing every company stays staged until final save and restores the Gangnam fallback only then', async () => {
  const ui = harness([explicitCompany('A', 100)]);
  await ui.sandbox.openCompanyLocationModal('A');
  await ui.sandbox.removeCompanyDestinationDraft('A');
  assert.equal(ui.state.workplaces.length, 1);
  ui.sandbox.saveCompanyDestinationDrafts();
  assert.equal(ui.state.workplaces.length, 0);
  assert.equal(ui.saves.length, 1);
  assert.match(ui.toasts.at(-1)[0], /강남역 100%/);
});

test('a late reverse-geocode response cannot attach a previous company pin to a different draft or a closed modal', async () => {
  const ui = harness(threeCompanies());
  ui.state.companyPickerMapReady = true;
  await ui.sandbox.openCompanyLocationModal('A');
  ui.sandbox.armCompanyPickerMap();
  let resolve;
  ui.sandbox.companyPickerMap.reverse = () => new Promise(done => { resolve = done; });
  const late = ui.sandbox.mapClick({ lat: 37.1, lng: 127.8 });
  assert.equal(ui.state.companyPickerSelection, null, 'A pending pin must not leave the old location eligible for saving');
  await ui.sandbox.switchCompanyDestinationDraft('B');
  resolve('늦은 A 주소');
  await late;
  assert.equal(ui.state.companyPickerSelection.label, '회사 B');
  assert.equal(ui.state.companyDestinationDraft.items.find(row => row.id === 'A').location, null);
  ui.sandbox.armCompanyPickerMap();
  const afterClose = ui.sandbox.mapClick({ lat: 37.2, lng: 127.9 });
  ui.sandbox.closeCompanyLocationModal();
  resolve('닫은 뒤 주소');
  await afterClose;
  assert.equal(ui.state.companyPickerSelection, null);
  assert.equal(ui.state.companyDestinationDraft, null);
  assert.equal(ui.saves.length, 0);
});

test('place-search responses and map initialization from a previous draft are discarded after switching', async () => {
  const ui = harness(threeCompanies());
  await ui.sandbox.openCompanyLocationModal('A');
  let finishSearch;
  const map = { ...ui.sandbox.companyPickerMap, search: () => new Promise(done => { finishSearch = done; }) };
  ui.sandbox.ensureCompanyPickerMap = async () => map;
  ui.sandbox.fetchCompanyPlaceResults = async () => ({ status: 'ok', items: [] });
  const rendered = [];
  ui.sandbox.mergeCompanyLocationResults = (...items) => items.flat();
  ui.sandbox.renderCompanyLocationSearchResults = results => rendered.push(results);
  const pending = ui.sandbox.searchCompanyLocations();
  await new Promise(resolve => setImmediate(resolve));
  await ui.sandbox.switchCompanyDestinationDraft('B');
  finishSearch([{ name: 'A 검색 결과', lat: 37.1, lng: 127.8 }]);
  await pending;
  assert.equal(rendered.length, 0);
  assert.equal(ui.state.companyPickerSelection.label, '회사 B');
  let ready;
  ui.sandbox.ensureCompanyPickerMap = () => new Promise(done => { ready = done; });
  const previous = ui.sandbox.switchCompanyDestinationDraft('A');
  const finishPrevious = ready;
  const current = ui.sandbox.switchCompanyDestinationDraft('B');
  const finishCurrent = ready;
  const beforePins = ui.pins.length;
  finishPrevious(map); await previous;
  assert.equal(ui.pins.length, beforePins);
  finishCurrent(map); await current;
  assert.equal(ui.pins.length, beforePins + 1);
});

test('external restore during editing is not overwritten by the old draft', async () => {
  const ui = harness(threeCompanies());
  await ui.sandbox.openCompanyLocationModal('A');
  ui.$('#companyWeightPercent').value = '30';
  ui.state.workplaces = [explicitCompany('restored', 100)];
  ui.sandbox.saveCompanyDestinationDrafts();
  assert.equal(ui.state.workplaces[0].id, 'restored');
  assert.equal(ui.saves.length, 0);
  assert.equal(ui.geocodes.length, 0);
  assert.match(ui.toasts.at(-1)[0], /기존 목적지가 변경/);
});

test('replacing a named POI with an address or manual pin drops obsolete place identity while retaining personal preferences', async () => {
  for (const location of [
    { name: '새 도로명 주소', roadAddress: '새 도로명 주소', lat: 37.3, lng: 127.5, source: 'naver-address' },
    { name: '지도에서 선택한 회사 위치', lat: 37.4, lng: 127.6, coordinateSource: 'manual' },
  ]) {
    const original = { ...explicitCompany('A', 100), name: '옛 회사', placeName: '옛 회사', displayName: '옛 이름',
      source: 'naver-developers-local', category: '옛 분류', roadAddress: '옛 주소', jibunAddress: '옛 지번',
      elements: ['옛 법정동'], modes: ['car'], departureTime: '07:20' };
    const ui = harness([original]);
    await ui.sandbox.openCompanyLocationModal('A');
    ui.sandbox.selectCompanyPickerLocation(location);
    ui.sandbox.saveCompanyDestinationDrafts();
    const saved = ui.state.workplaces[0];
    assert.equal(saved.label, location.name);
    assert.equal(saved.placeName, undefined);
    assert.equal(saved.displayName, undefined);
    assert.equal(saved.category, undefined);
    assert.equal(saved.elements, undefined);
    assert.equal(saved.source, location.source);
    assert.equal(saved.address, location.roadAddress || location.name);
    assert.equal(saved.memo, 'A 메모');
    assert.deepEqual(Array.from(saved.modes), ['car']);
    assert.equal(saved.departureTime, '07:20');
    await ui.sandbox.openCompanyLocationModal('A');
    assert.equal(ui.$('#companyPickerSelectionTitle').textContent, location.name);
    ui.$('#companyWeightPercent').value = '90';
    ui.sandbox.saveCompanyDestinationDrafts();
    assert.equal(ui.state.workplaces[0].label, location.name);
  }
});

test('a late postcode script failure cannot clear a different draft or steal focus after closing the editor', async () => {
  const ui = harness(threeCompanies());
  const scheduled = [];
  Object.assign(ui.sandbox, {
    window: { setTimeout(callback) { scheduled.push(callback); } }, document: ui.document, HTMLElement: MiniNode,
    companyPostcodeOpener: null, setCompanyPostcodeBackgroundInert() {},
  });
  vm.runInContext(actualFunction('openCompanyPostcodeSearch'), ui.sandbox);
  const messages = [];
  ui.sandbox.renderCompanyLocationSearchResults = (...args) => messages.push(args);
  await ui.sandbox.openCompanyLocationModal('A');
  let reject;
  ui.sandbox.loadCompanyPostcodeScript = () => new Promise((_, fail) => { reject = fail; });
  const oldSearch = ui.sandbox.openCompanyPostcodeSearch('회사 A');
  await ui.sandbox.switchCompanyDestinationDraft('B', { focus: true });
  reject(new Error('postcode network failure'));
  await oldSearch;
  for (const callback of scheduled.splice(0)) callback();
  assert.equal(messages.length, 0);
  assert.equal(ui.state.companyPickerSelection.label, '회사 B');
  assert.equal(ui.document.activeElement, ui.$('#companyLocationSearch'));
  const closingSearch = ui.sandbox.openCompanyPostcodeSearch('회사 B');
  ui.sandbox.closeCompanyLocationModal();
  reject(new Error('postcode network failure after close'));
  await closingSearch;
  for (const callback of scheduled) callback();
  assert.equal(messages.length, 0);
  assert.equal(ui.state.companyDestinationDraft, null);
});
