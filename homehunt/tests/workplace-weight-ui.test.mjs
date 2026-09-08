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
  const state = { workplaces: structuredClone(workplaces), gangnamAnchor: { lat: 37.5, lng: 127 }, recommendationRunning: false };
  const saves = [];
  const sandbox = {
    $, state, createElement, normalizeDestinations, effectiveRecommendationDestinations, recommendationBudget, destinationLetter, PYEONG_TO_M2,
    decisionWorkspace: null, setCompanyLocationStatus() {},
    updateCompanySearchCapability() {}, renderCompanyPickerSelection() {},
    companyPickerMap: { clearSearchLocation() {} }, ensureCompanyPickerMap: async () => null,
    openModalShell: id => { $(`#${id}`).hidden = false; }, closeCompanyLocationModal() {},
    isGeoPoint: point => Number.isFinite(point?.lat) && Number.isFinite(point?.lng),
    saveGeocodeResult: (query, point) => ({ ...point, required: true }),
    workplaceId: () => 'new-company', showToast() {},
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
    'openCompanyLocationModal', 'applyCompanyPickerLocation', 'restoreRecommendationForm']) vm.runInContext(actualFunction(name), sandbox);
  const inputs = () => $('#workplaceList').all('input');
  const displayedShares = () => $('#workplaceList').all('output').map(node => node.textContent);
  return { $, document, state, sandbox, saves, inputs, displayedShares };
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
  ui.sandbox.applyCompanyPickerLocation();
  assertThreeCompanyContract(ui);
  assert.equal(ui.saves.length, 1);
  assert.equal(JSON.parse(ui.saves[0]).workplaces[0].required, false,
    'The editor choice overrides a stale required:true value returned by the geocode cache fixture');
  assert.equal(ui.state.workplaces[0].memo, 'gwanghwamun 메모');
  await ui.sandbox.openCompanyLocationModal('gwanghwamun');
  assert.equal(ui.$('#companyEnforceTime').checked, false);
  ui.$('#companyEnforceTime').checked = true;
  ui.sandbox.applyCompanyPickerLocation();
  assert.deepEqual(ui.state.workplaces.map(row => row.required), [true, true, true]);
  await ui.sandbox.openCompanyLocationModal('gwanghwamun');
  ui.$('#companyEnforceTime').checked = false;
  ui.sandbox.applyCompanyPickerLocation();
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
