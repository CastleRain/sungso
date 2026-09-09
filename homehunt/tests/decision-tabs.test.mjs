import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDecisionWorkspace } from '../js/controllers/decision-workspace.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
class MiniNode {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toLowerCase(); this.ownerDocument = ownerDocument;
    this.children = []; this.attributes = new Map(); this.dataset = {}; this.listeners = new Map();
    this.hidden = false; this.scrollTop = 0; this.tabIndex = this.tagName === 'button' ? 0 : -1; this._text = '';
  }
  get textContent() { return this._text + this.children.map(child => child.textContent || '').join(''); }
  set textContent(value) { this._text = String(value); this.replaceChildren(); }
  append(...children) { for (const child of children) { this.children.push(child); child.parentElement = this; } }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = []; this.append(...children);
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
    if (name === 'hidden') this.hidden = true;
    if (name === 'tabindex') this.tabIndex = Number(value);
    if (name.startsWith('data-')) this.dataset[dataKey(name)] = String(value);
  }
  getAttribute(name) {
    if (name.startsWith('data-')) return this.dataset[dataKey(name)] ?? null;
    if (name === 'hidden') return this.hidden ? '' : null;
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  addEventListener(type, listener) {
    const group = this.listeners.get(type) || []; group.push(listener); this.listeners.set(type, group);
  }
  focus() { this.ownerDocument.activeElement = this; }
  scrollTo(options) { this.scrollTop = options.top || 0; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  matchesSimple(selector) {
    const tag = selector.match(/^[a-z][\w-]*/i)?.[0];
    if (tag && this.tagName !== tag.toLowerCase()) return false;
    const id = selector.match(/#([\w-]+)/)?.[1];
    if (id && this.id !== id) return false;
    for (const [, className] of selector.matchAll(/\.([\w-]+)/g)) {
      if (!(this.className || '').split(/\s+/).includes(className)) return false;
    }
    for (const [, name, doubleValue, singleValue, bareValue] of selector.matchAll(/\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g)) {
      const expected = doubleValue ?? singleValue ?? bareValue;
      if (!this.hasAttribute(name) || expected !== undefined && this.getAttribute(name) !== expected) return false;
    }
    return true;
  }
  matches(selector) {
    const parts = selector.trim().split(/\s+/);
    if (!this.matchesSimple(parts.pop())) return false;
    let ancestor = this.parentElement;
    while (parts.length) {
      const target = parts.pop();
      while (ancestor && !ancestor.matchesSimple(target)) ancestor = ancestor.parentElement;
      if (!ancestor) return false;
      ancestor = ancestor.parentElement;
    }
    return true;
  }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(value => value.trim());
    const output = [];
    const visit = parent => parent.children.forEach(child => {
      if (selectors.some(value => child.matches(value))) output.push(child);
      visit(child);
    });
    visit(this); return output;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  fire(type, details = {}) {
    const event = { type, target: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...details };
    for (let node = this; node; node = node.parentElement) {
      for (const callback of node.listeners.get(type) || []) callback(event);
      if (event.stopped) break;
    }
    return event;
  }
}

function parsePanel(document) {
  const source = html.match(/<aside\b[^>]*id="recommendationResultPanel"[^>]*>[^]*?<\/aside>/)?.[0];
  assert.ok(source, 'Actual result panel markup must exist');
  const stack = [document];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const token of source.matchAll(/<!--[\s\S]*?-->|<\/?([a-z][\w-]*)\b([^>]*?)>/gi)) {
    if (!token[1]) continue;
    if (token[0].startsWith('</')) { stack.pop(); continue; }
    const node = document.createElement(token[1]);
    for (const [, name, doubleValue, singleValue, bareValue] of token[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      node.setAttribute(name, doubleValue ?? singleValue ?? bareValue ?? '');
    }
    stack.at(-1).append(node);
    if (!voidTags.has(node.tagName) && !token[0].endsWith('/>')) stack.push(node);
  }
  return document.querySelector('#recommendationResultPanel');
}

function setup(t) {
  const previous = { document: globalThis.document, window: globalThis.window, localStorage: globalThis.localStorage };
  const document = new MiniNode('document'); document.ownerDocument = document;
  document.createElement = tag => new MiniNode(tag, document);
  const panel = parsePanel(document);
  for (const id of ['decisionDetailModal', 'decisionCompareModal']) {
    const modal = document.createElement('div'); modal.id = id; modal.hidden = true; document.append(modal);
  }
  globalThis.document = document;
  globalThis.window = new MiniNode('window', document);
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  t.after(() => { Object.assign(globalThis, previous); });
  const state = { results: [{ catalogId: 'one', regionCode: '41135', regionName: '경기도 성남시 분당구',
    name: '공식 테스트 단지', bestArea: { averagePriceManWon: 60000 } }],
  shortlist: [], visits: [], notices: [], destinations: [], supplyLoaded: true, meta: { resultCount: 1 }, verifiedCount: 0 };
  let shown = 0;
  const controller = createDecisionWorkspace({ state: () => state, showResults: () => { shown += 1; },
    filters() {}, view() {}, toast() {}, destination() {}, selectRegion() {}, close() {}, actionableNotice: () => false });
  const tab = value => document.querySelector(`button[data-decision-tab="${value}"]`);
  const contents = { today: document.querySelector('#decisionToday'), candidates: document.querySelector('#decisionCandidates'),
    regions: document.querySelector('#decisionRegions') };
  return { document, panel, state, controller, tab, contents, get shown() { return shown; } };
}

function assertSelected(h, selected) {
  assert.equal(h.panel.dataset.decisionTab, selected);
  for (const value of ['today', 'candidates', 'regions']) {
    assert.ok(h.contents[value], `${value} has a real tabpanel`);
    assert.equal(h.contents[value].hidden, value !== selected, `${value} content visibility`);
    assert.equal(h.tab(value).getAttribute('aria-selected'), String(value === selected));
    assert.equal(h.tab(value).tabIndex, value === selected ? 0 : -1);
  }
}

test('all three workspace tabs own distinct complete panels and clicks switch visible content', t => {
  const h = setup(t);
  assertSelected(h, 'today');
  for (const value of ['candidates', 'regions', 'today']) {
    h.tab(value).fire('click');
    assertSelected(h, value);
  }
  assert.equal(h.panel.getAttribute('aria-selected'), null, 'The surrounding aside must never be treated as a tab');
});

test('price continuity and facility progress are inside the price tab rather than hiding other tab content', t => {
  const h = setup(t);
  const price = h.contents.candidates;
  assert.ok(price, 'Price view needs a complete tabpanel wrapper');
  assert.equal(price.getAttribute('role'), 'tabpanel');
  assert.equal(h.tab('candidates').getAttribute('aria-controls'), price.id);
  for (const id of ['recommendationSearchContinuity', 'recommendationOfficialProgress', 'recommendationPriceCoverage',
    'commuteVerificationGate', 'locationDiscovery', 'recommendationResults', 'recommendationEmpty']) {
    assert.ok(price.contains(h.document.querySelector(`#${id}`)), `${id} must hide with the price tab`);
  }
  h.tab('regions').fire('click');
  assert.equal(price.hidden, true);
  assert.equal(h.contents.regions.hidden, false);
});

test('arrow, Home and End navigation focuses the actual button and does not bubble into a second switch', t => {
  const h = setup(t);
  const operations = [['today', 'ArrowRight', 'candidates'], ['candidates', 'ArrowRight', 'regions'],
    ['regions', 'ArrowRight', 'today'], ['today', 'ArrowLeft', 'regions'],
    ['regions', 'Home', 'today'], ['today', 'End', 'regions']];
  for (const [from, key, expected] of operations) {
    h.tab(from).focus();
    const event = h.tab(from).fire('keydown', { key });
    assert.equal(event.defaultPrevented, true);
    assertSelected(h, expected);
    assert.equal(h.document.activeElement, h.tab(expected));
  }
});

test('facility updates, recommendation updates and menu events preserve the chosen tab and scroll', t => {
  const h = setup(t);
  h.tab('regions').fire('click');
  h.panel.scrollTop = 245;
  h.state.results.push({ catalogId: 'two', regionCode: '41465', regionName: '경기도 용인시 수지구',
    name: '다음 단지', bestArea: { averagePriceManWon: 58000 } });
  h.controller.render();
  assertSelected(h, 'regions');
  assert.equal(h.panel.scrollTop, 245);
  h.document.fire('homehunt:viewchange', { detail: { view: 'recommend' } });
  assertSelected(h, 'regions');
  assert.equal(h.panel.scrollTop, 245);
});

test('switching tabs resets the old scroll once, but reselecting the current tab does not jump', t => {
  const h = setup(t);
  h.panel.scrollTop = 620;
  h.tab('regions').fire('click');
  assert.equal(h.panel.scrollTop, 0);
  h.panel.scrollTop = 120;
  h.tab('regions').fire('click');
  assert.equal(h.panel.scrollTop, 120);
  h.controller.setTab('candidates');
  assertSelected(h, 'candidates');
  assert.equal(h.panel.scrollTop, 0);
});
