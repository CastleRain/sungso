import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecommendationQuickFilters, recommendationQuickFilterPatch } from '../js/controllers/recommendation-quick-filters.js';

const values = () => ({
  recommendSeoul: true, recommendGyeonggi: true,
  recommendHouseholds: '500', recommendHouseholdsOperator: 'gt', recommendMaxAge: '20',
  recommendMinArea: '20', recommendAreaOperator: 'gte',
  recommendMaxPriceEok: '6', recommendMaxPriceMan: '0', recommendBudgetSource: 'wecost', recommendBudgetOverPct: '10',
  recommendParkingRatio: '1', recommendRequireParking: true, recommendPreferSubway: true, recommendExcludeFar: true,
  destinations: [{ id: 'a', label: '테스트 회사 A', weightPercent: 10, maxMinutes: 90, enforceMaxMinutes: false }, { id: 'b', label: '테스트 회사 B', weightPercent: 90, maxMinutes: 60, enforceMaxMinutes: true }],
});

class MiniNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.style = { setProperty: (name, value) => { this.style[name] = value; } };
    this.listeners = new Map();
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.checked = false;
    this.isConnected = true;
  }
  append(...children) { for (const child of children) { this.children.push(child); child.parentElement = this; } }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  addEventListener(type, listener) { const group = this.listeners.get(type) || []; group.push(listener); this.listeners.set(type, group); }
  focus() { this.ownerDocument.activeElement = this; }
  contains(target) { return target === this || this.children.some(child => child.contains(target)); }
  getBoundingClientRect() { return { left: 100, width: 1000 }; }
  matches(selector) {
    if (selector.startsWith('.')) return (this.className || '').split(' ').includes(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector === 'input:not([type="range"])') return this.tagName === 'input' && this.type !== 'range';
    const data = selector.match(/^\[data-rqf-(\w+)\]$/);
    if (data) return `rqf${data[1][0].toUpperCase()}${data[1].slice(1)}` in this.dataset;
    const filter = selector.match(/^\[data-quick-filter="(\w+)"\]$/);
    if (filter) return this.dataset.quickFilter === filter[1];
    return this.tagName === selector;
  }
  querySelectorAll(selector) {
    const options = selector.split(',').map(value => value.trim());
    const nodes = [];
    const visit = target => { for (const child of target.children) { if (options.some(option => child.matches(option))) nodes.push(child); visit(child); } };
    visit(this);
    return nodes;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
}

function setup(t, overrides = {}) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const document = new MiniNode('document');
  document.ownerDocument = document;
  document.createElement = tag => new MiniNode(tag, document);
  const toolbar = document.createElement('div');
  toolbar.className = 'recommendation-map-toolbar';
  const anchor = document.createElement('button');
  toolbar.append(anchor);
  document.append(toolbar);
  globalThis.document = document;
  globalThis.window = new MiniNode('window', document);
  t.after(() => { globalThis.document = previousDocument; globalThis.window = previousWindow; });
  const source = values();
  const calls = [];
  const full = [];
  const controller = createRecommendationQuickFilters({ getValues: () => source, applyValues: async (patch, key) => calls.push({ patch, key }), openFull: key => full.push(key), ...overrides });
  const root = () => document.querySelector('#recommendationQuickFilter');
  const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
  const find = predicate => descendants(root()).find(predicate);
  const field = id => find(node => node.dataset.rqfField === id);
  const range = id => find(node => node.dataset.rqfRange === id);
  const action = name => find(node => node.dataset.rqfAction === name);
  function fire(type, target, extra = {}) {
    const event = { target, preventDefault() { this.defaultPrevented = true; }, ...extra };
    let node = target;
    while (node) { for (const listener of node.listeners.get(type) || []) listener(event); node = node.parentElement; }
    return event;
  }
  function set(id, value) { const control = field(id); if (control.type === 'checkbox') control.checked = value; else control.value = value; fire('input', control); }
  return { source, calls, full, controller, document, toolbar, anchor, root, find, field, range, action, fire, set };
}

test('quick-filter patches are limited to the active group and numeric no-ops are ignored', () => {
  const source = values();
  assert.deepEqual(recommendationQuickFilterPatch('households', source, { ...source, recommendHouseholds: '0500', recommendMaxAge: '80' }), {});
  assert.deepEqual(recommendationQuickFilterPatch('households', source, { ...source, recommendHouseholds: '2500', recommendMaxAge: '80' }), { recommendHouseholds: '2500' });
});

test('large direct inputs stay valid beyond the compact slider ranges', () => {
  const source = values();
  source.recommendBudgetSource = 'manual';
  for (const [key, field, value] of [['households', 'recommendHouseholds', '4000'], ['age', 'recommendMaxAge', '75'], ['area', 'recommendMinArea', '110'], ['price', 'recommendMaxPriceEok', '45']]) {
    assert.equal(recommendationQuickFilterPatch(key, source, { ...source, [field]: value })[field], value);
  }
});

test('invalid drafts are rejected before any write', () => {
  const source = values();
  for (const [key, changes] of [
    ['region', { recommendSeoul: false, recommendGyeonggi: false }],
    ['households', { recommendHouseholds: '' }], ['households', { recommendHouseholds: '20.5' }],
    ['age', { recommendMaxAge: '-1' }], ['area', { recommendMinArea: 'Infinity' }],
    ['price', { recommendBudgetSource: 'manual', recommendMaxPriceEok: '0', recommendMaxPriceMan: '0' }],
    ['price', { recommendBudgetOverPct: '101' }], ['parking', { recommendParkingRatio: '0' }],
  ]) assert.throws(() => recommendationQuickFilterPatch(key, source, { ...source, ...changes }));
});

test('draft typing, slider synchronization, and cancel never mutate the existing form', t => {
  const h = setup(t);
  h.controller.open('households', h.anchor);
  h.set('recommendHouseholds', '4000');
  assert.equal(h.range('recommendHouseholds').value, '1000');
  assert.equal(h.field('recommendHouseholds').value, '4000');
  assert.equal(h.field('recommendHouseholds').max, undefined);
  assert.equal(h.source.recommendHouseholds, '500');
  h.fire('click', h.action('close'));
  assert.equal(h.controller.isOpen(), false);
  assert.equal(h.calls.length, 0);
  assert.equal(h.document.activeElement, h.anchor);
  h.controller.open('households', h.anchor);
  assert.equal(h.field('recommendHouseholds').value, '500');
});

test('explicit apply submits one changed group then closes; unchanged apply calls nothing', async t => {
  const h = setup(t);
  h.controller.open('age', h.anchor);
  h.fire('click', h.action('apply'));
  assert.equal(h.calls.length, 0);
  assert.equal(h.controller.isOpen(), false);
  h.controller.open('age', h.anchor);
  h.set('recommendMaxAge', '70');
  h.fire('click', h.action('apply'));
  await Promise.resolve();
  assert.deepEqual(h.calls, [{ key: 'age', patch: { recommendMaxAge: '70' } }]);
  assert.equal(h.controller.isOpen(), false);
});

test('invalid region, async failure, and busy state retain the dialog and never report success', async t => {
  let busy = false;
  let calls = 0;
  const h = setup(t, { getBusy: () => busy, applyValues: async () => { calls += 1; throw new Error('연동 오류'); } });
  h.controller.open('region', h.anchor);
  h.set('recommendSeoul', false);
  h.set('recommendGyeonggi', false);
  h.fire('click', h.action('apply'));
  assert.equal(calls, 0);
  assert.match(h.root().querySelector('.rqf-error').textContent, /한 지역/);
  h.set('recommendGyeonggi', true);
  busy = true;
  h.fire('click', h.action('apply'));
  assert.equal(calls, 0);
  assert.equal(h.action('apply').disabled, true);
  busy = false;
  h.fire('click', h.action('apply'));
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(h.controller.isOpen(), true);
  assert.equal(h.root().querySelector('.rqf-error').textContent, '연동 오류');
});

test('price presets deliberately choose manual and preserve unbounded input; WeCost stays read-only', async t => {
  const h = setup(t);
  h.controller.open('price', h.anchor);
  assert.equal(h.field('recommendMaxPriceEok').readOnly, true);
  assert.equal(h.range('recommendMaxPriceEok').disabled, true);
  h.fire('click', h.find(node => node.dataset.rqfAction === 'preset' && node.dataset.rqfValue === '7'));
  assert.equal(h.field('recommendMaxPriceEok').readOnly, false);
  h.set('recommendMaxPriceEok', '32');
  h.set('recommendMaxPriceMan', '1500');
  assert.equal(h.range('recommendMaxPriceEok').value, '20');
  assert.equal(h.field('recommendMaxPriceEok').value, '32');
  assert.equal(h.field('recommendMaxPriceMan').value, '1500');
  h.fire('click', h.action('apply'));
  await Promise.resolve();
  assert.deepEqual(h.calls[0], { key: 'price', patch: { recommendBudgetSource: 'manual', recommendMaxPriceEok: '32', recommendMaxPriceMan: '1500' } });
});

test('price range replaces both money segments instead of adding to old amounts', t => {
  const h = setup(t);
  h.source.recommendBudgetSource = 'manual';
  h.source.recommendMaxPriceMan = '7000';
  h.controller.open('price', h.anchor);
  const slider = h.range('recommendMaxPriceEok');
  slider.value = '7.1';
  h.fire('input', slider);
  assert.equal(h.field('recommendMaxPriceEok').value, '7');
  assert.equal(h.field('recommendMaxPriceMan').value, '1000');
});

test('returning to WeCost restores its verified amount and keeps manual edits for manual mode', t => {
  const h = setup(t);
  h.controller.open('price', h.anchor);
  h.fire('click', h.find(node => node.dataset.rqfAction === 'preset' && node.dataset.rqfValue === '7'));
  h.fire('click', h.find(node => node.dataset.rqfSource === 'wecost'));
  assert.equal(h.field('recommendMaxPriceEok').value, '6');
  assert.equal(h.field('recommendMaxPriceEok').readOnly, true);
  h.fire('click', h.find(node => node.dataset.rqfSource === 'manual'));
  assert.equal(h.field('recommendMaxPriceEok').value, '7');
  assert.equal(h.field('recommendMaxPriceEok').readOnly, false);
});

test('WeCost can be selected from empty manual inputs; only the official fetch decides the amount', async t => {
  const h = setup(t);
  h.source.recommendBudgetSource = 'manual';
  h.source.recommendMaxPriceEok = '';
  h.source.recommendMaxPriceMan = '';
  h.controller.open('price', h.anchor);
  h.fire('click', h.find(node => node.dataset.rqfSource === 'wecost'));
  assert.equal(h.field('recommendMaxPriceEok').value, '');
  assert.equal(h.field('recommendMaxPriceEok').placeholder, '적용 시 가져옴');
  assert.match(h.root().querySelector('.rqf-source-hint').textContent, /최신 목표가격/);
  h.fire('click', h.action('apply'));
  await Promise.resolve();
  assert.deepEqual(h.calls, [{ key: 'price', patch: { recommendBudgetSource: 'wecost' } }]);
});

test('linked price drafts never submit displayed money as a user-authored price', () => {
  const source = values();
  assert.deepEqual(recommendationQuickFilterPatch('price', source, { ...source, recommendMaxPriceEok: '99', recommendMaxPriceMan: '1500', recommendBudgetOverPct: '20' }), { recommendBudgetOverPct: '20' });
});

test('company labels render as text, normalized shares remain read-only, full edit discards draft', t => {
  const h = setup(t);
  h.source.destinations[0].label = '<img src=x onerror=alert(1)>';
  h.source.destinations[0].weightPercent = 1;
  h.source.destinations[1].weightPercent = 9;
  h.controller.open('commute', h.anchor);
  const list = h.root().querySelector('.rqf-destinations');
  assert.equal(list.children[0].children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(list.children[0].children[1].textContent, '10% · 90분 초과 허용');
  assert.equal(list.children[1].children[1].textContent, '90% · 60분 이내');
  h.set('recommendPreferSubway', false);
  h.fire('click', h.action('full'));
  assert.deepEqual(h.full, ['commute']);
  assert.equal(h.source.recommendPreferSubway, true);
  assert.equal(h.calls.length, 0);
  assert.equal(h.controller.isOpen(), false);
});

test('normalized company contracts preserve optional-time semantics and normalized weight', t => {
  const h = setup(t);
  h.source.destinations = [{ label: '회사', required: false, normalizedWeightPercent: 40, weightPercent: 100, maxMinutes: 80 }, { label: '다른 회사', required: true, normalizedWeightPercent: 60, weightPercent: 100, maxMinutes: 60 }];
  h.controller.open('commute', h.anchor);
  const rows = h.root().querySelector('.rqf-destinations').children;
  assert.equal(rows[0].children[1].textContent, '40% · 80분 초과 허용');
  assert.equal(rows[1].children[1].textContent, '60% · 60분 이내');
});

test('apply returns focus to the replacement toolbar trigger after the app rerenders it', async t => {
  let h;
  let replacement;
  h = setup(t, { applyValues: async () => {
    h.anchor.isConnected = false;
    replacement = h.document.createElement('button');
    replacement.dataset.quickFilter = 'age';
    h.toolbar.append(replacement);
  } });
  h.controller.open('age', h.anchor);
  h.set('recommendMaxAge', '29');
  h.fire('click', h.action('apply'));
  await Promise.resolve();
  assert.equal(h.document.activeElement, replacement);
  assert.equal(replacement.getAttribute('aria-expanded'), 'false');
});

test('Escape, outside pointer, and page navigation discard drafts', t => {
  const h = setup(t);
  for (const type of ['keydown', 'pointerdown', 'homehunt:viewchange']) {
    h.controller.open('age', h.anchor);
    h.set('recommendMaxAge', '29');
    h.fire(type, h.document, { key: 'Escape' });
    assert.equal(h.controller.isOpen(), false);
    assert.equal(h.calls.length, 0);
  }
});

test('refresh follows a rerendered trigger and unlocks apply once a background lookup ends', t => {
  let busy = true;
  const h = setup(t, { getBusy: () => busy });
  h.controller.open('age', h.anchor);
  assert.equal(h.action('apply').disabled, true);
  const replacement = h.document.createElement('button');
  replacement.dataset.quickFilter = 'age';
  h.toolbar.append(replacement);
  busy = false;
  h.controller.refresh();
  assert.equal(h.action('apply').disabled, false);
  assert.equal(replacement.getAttribute('aria-expanded'), 'true');
  h.controller.close();
  assert.equal(h.document.activeElement, replacement);
});

test('keyboard Tab stays inside the open dialog and Escape returns focus', t => {
  const h = setup(t);
  h.controller.open('age', h.anchor);
  const first = h.action('close');
  const last = h.action('apply');
  first.focus();
  assert.equal(h.fire('keydown', first, { key: 'Tab', shiftKey: true }).defaultPrevented, true);
  assert.equal(h.document.activeElement, last);
  assert.equal(h.fire('keydown', last, { key: 'Tab', shiftKey: false }).defaultPrevented, true);
  assert.equal(h.document.activeElement, first);
  h.fire('keydown', first, { key: 'Escape' });
  assert.equal(h.document.activeElement, h.anchor);
});

test('switching anchors discards old drafts and keeps one mounted dialog', t => {
  const h = setup(t);
  const secondAnchor = h.document.createElement('button');
  h.toolbar.append(secondAnchor);
  h.controller.open('age', h.anchor);
  h.set('recommendMaxAge', '29');
  h.controller.open('area', secondAnchor);
  assert.equal(h.anchor.getAttribute('aria-expanded'), 'false');
  assert.equal(secondAnchor.getAttribute('aria-expanded'), 'true');
  assert.equal(h.document.querySelectorAll('#recommendationQuickFilter').length, 1);
  assert.equal(h.source.recommendMaxAge, '20');
  assert.equal(h.calls.length, 0);
});

test('stale async completion cannot close a newly opened filter', async t => {
  let resolve;
  let lifecycle;
  const h = setup(t, { applyValues: (_patch, _key, context) => { lifecycle = context; return new Promise(done => { resolve = done; }); } });
  h.controller.open('age', h.anchor);
  h.set('recommendMaxAge', '29');
  h.fire('click', h.action('apply'));
  assert.equal(lifecycle.isCurrent(), true);
  h.controller.close();
  assert.equal(lifecycle.isCurrent(), false);
  h.controller.open('parking', h.anchor);
  resolve(true);
  await Promise.resolve();
  assert.equal(h.controller.isOpen(), true);
  assert.equal(h.root().dataset.filter, 'parking');
});
