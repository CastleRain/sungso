import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupplyLocationPanel } from '../js/controllers/supply-location-panel.js';

class Element extends EventTarget {
  constructor(tag) {
    super(); this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null;
    this.dataset = {}; this.attributes = new Map(); this.className = ''; this.ownText = '';
    this.hidden = false;
  }
  get isConnected() { return this.connectedRoot === true || Boolean(this.parentNode?.isConnected); }
  set textContent(value) { this.ownText = String(value); this.children.forEach(child => { child.parentNode = null; }); this.children = []; }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  append(...nodes) {
    for (const node of nodes) {
      node.remove(); node.parentNode = this; this.children.push(node);
    }
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  all(tag) { return this.children.flatMap(child => [...(child.tagName === tag.toUpperCase() ? [child] : []), ...child.all(tag)]); }
  byClass(name) { return this.children.find(child => child.className.split(' ').includes(name)); }
  click() { this.dispatchEvent(new Event('click')); }
}

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const settle = () => new Promise(resolve => setImmediate(resolve));
const notice = id => ({ id, title: `가상 분양 ${id}`, address: `가상 주소 ${id}` });
const located = (id, overrides = {}) => ({ point: { lat: id === 'a' ? 37.4 : 37.5, lng: 127.1 },
  query: `가상 주소 ${id}`, label: `${id} 공고 주소 주변`, approximate: true, ...overrides });

function fixture(t, options = {}) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const body = new Element('body'); body.connectedRoot = true;
  Object.defineProperty(globalThis, 'document', { configurable: true,
    value: { body, createElement: tag => new Element(tag) } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor); else delete globalThis.document;
  });
  const calls = { lookup: [], init: [], shown: [], cleared: 0, resized: 0, opened: [] };
  let pin = null;
  const map = {
    clearSearchLocation() { calls.cleared += 1; pin = null; },
    resize() { calls.resized += 1; },
    showSearchLocation(...args) { calls.shown.push(args); pin = args; },
  };
  const panel = createSupplyLocationPanel({
    resolveLocation: (record, lookupOptions) => {
      calls.lookup.push({ record, options: lookupOptions });
      return options.resolveLocation ? options.resolveLocation(record, lookupOptions) : Promise.resolve(located(record.id));
    },
    createMap: canvas => {
      calls.init.push(canvas);
      return options.createMap ? options.createMap(canvas, map) : map;
    },
    isActive: options.isActive || (() => true),
    onOpenLarge: (...args) => calls.opened.push(args),
  });
  body.append(panel.element);
  const canvas = panel.element.byClass('supply-location-map');
  const status = panel.element.byClass('supply-location-status');
  const note = panel.element.byClass('supply-location-note');
  const [nearby, retry] = panel.element.all('button');
  const [external] = panel.element.all('a');
  return { panel, body, canvas, status, note, nearby, retry, external, calls, map, get pin() { return pin; } };
}

test('the same map host initializes once and survives notice changes and detail reattachment', async t => {
  const context = fixture(t);
  const { panel, body, canvas, calls } = context;
  assert.equal(calls.init.length, 0, 'A map is not initialized before a usable location exists');
  await panel.show(notice('a'));
  assert.equal(panel.element.dataset.state, 'located');
  assert.equal(canvas.hidden, false);
  panel.clear(); panel.element.remove(); body.append(panel.element);
  await panel.show(notice('b'));
  assert.equal(calls.init.length, 1);
  assert.equal(calls.init[0], canvas);
  assert.equal(panel.element.byClass('supply-location-map'), canvas);
  assert.equal(calls.resized, 2);
  assert.deepEqual(calls.shown.map(args => args[2]), ['가상 분양 a', '가상 분양 b']);
  assert.deepEqual(context.pin, [37.5, 127.1, '가상 분양 b', 14]);
});

test('a slow previous notice cannot replace the latest notice pin, status or address link', async t => {
  const a = deferred(), b = deferred();
  const context = fixture(t, { resolveLocation: record => record.id === 'a' ? a.promise : b.promise });
  const showingA = context.panel.show(notice('a'));
  const showingB = context.panel.show(notice('b'));
  b.resolve(located('b')); await showingB;
  a.resolve(located('a')); await showingA;
  assert.equal(context.calls.init.length, 1);
  assert.deepEqual(context.calls.shown, [[37.5, 127.1, '가상 분양 b', 14]]);
  assert.equal(context.status.textContent, 'b 공고 주소 주변');
  assert.equal(context.external.href, `https://map.naver.com/p/search/${encodeURIComponent('가상 주소 b')}`);
  assert.equal(context.panel.element.dataset.state, 'located');
});

test('leaving the supply view and clearing it prevents pending locations from restoring the map', async t => {
  let active = true;
  const pending = deferred();
  const context = fixture(t, { isActive: () => active,
    resolveLocation: record => record.id === 'a' ? Promise.resolve(located('a')) : pending.promise });
  await context.panel.show(notice('a'));
  const showingB = context.panel.show(notice('b'));
  assert.equal(context.pin, null, 'Selecting another notice removes the previous pin immediately');
  active = false; context.panel.clear();
  pending.resolve(located('b')); await showingB;
  assert.equal(context.pin, null);
  assert.equal(context.canvas.hidden, true);
  assert.equal(context.nearby.hidden, true);
  assert.equal(context.calls.shown.length, 1);
  context.nearby.click(); context.retry.click(); await settle();
  assert.equal(context.calls.opened.length, 0);
  assert.equal(context.calls.lookup.length, 2);
  await context.panel.show(notice('c'));
  assert.equal(context.calls.lookup.length, 2, 'Inactive views do not start another lookup');
});

test('an abandoned map initialization cannot show an old pin and is reused on the next active selection', async t => {
  const initializing = deferred();
  let signalInit;
  const started = new Promise(resolve => { signalInit = resolve; });
  const context = fixture(t, { createMap: () => { signalInit(); return initializing.promise; } });
  const showingA = context.panel.show(notice('a'));
  await started;
  context.panel.clear(); context.panel.element.remove();
  initializing.resolve(context.map); await showingA;
  assert.equal(context.calls.shown.length, 0);
  assert.equal(context.canvas.hidden, true);
  context.body.append(context.panel.element);
  await context.panel.show(notice('b'));
  assert.equal(context.calls.init.length, 1);
  assert.deepEqual(context.calls.shown, [[37.5, 127.1, '가상 분양 b', 14]]);
});

test('a missing location clears the old pin and retries only the current notice when requested', async t => {
  const second = notice('b');
  const context = fixture(t, { resolveLocation: (record, options) => Promise.resolve(record.id === 'b' && !options.retry
    ? { point: null, query: record.address, label: '위치 확인 필요', reason: '공고 주소를 다시 확인해주세요.' }
    : located(record.id)) });
  await context.panel.show(notice('a'));
  await context.panel.show(second);
  assert.equal(context.panel.element.dataset.state, 'unavailable');
  assert.equal(context.pin, null);
  assert.equal(context.canvas.hidden, true);
  assert.equal(context.nearby.hidden, true);
  assert.equal(context.retry.hidden, false);
  assert.equal(context.status.textContent, '위치 확인 필요');
  assert.equal(context.note.textContent, '공고 주소를 다시 확인해주세요.');
  assert.equal(context.calls.lookup.length, 2, 'Missing coordinates do not trigger an automatic retry');
  context.retry.click(); await settle();
  assert.equal(context.calls.lookup.length, 3);
  assert.equal(context.calls.lookup[2].record, second);
  assert.equal(context.calls.lookup[2].options.retry, true);
  assert.equal(context.panel.element.dataset.state, 'located');
  assert.equal(context.retry.hidden, true);
  assert.equal(context.calls.init.length, 1);
  assert.deepEqual(context.pin, [37.5, 127.1, second.title, 14]);
});

test('a failed map initialization can be retried successfully without trapping the rejected promise', async t => {
  let attempts = 0;
  const context = fixture(t, { createMap: (canvas, map) => {
    attempts += 1;
    if (attempts === 1) return Promise.reject(new Error('Synthetic SDK initialization failure'));
    return map;
  } });
  await context.panel.show(notice('a'));
  assert.equal(context.panel.element.dataset.state, 'unavailable');
  assert.equal(context.canvas.hidden, true);
  assert.equal(context.retry.hidden, false);
  assert.equal(context.calls.shown.length, 0);
  assert.match(context.status.textContent, /지도를 불러오지 못했/);
  context.retry.click(); await settle();
  assert.equal(attempts, 2);
  assert.equal(context.calls.lookup[1].options.retry, true);
  assert.equal(context.panel.element.dataset.state, 'located');
  assert.equal(context.canvas.hidden, false);
  assert.equal(context.retry.hidden, true);
  assert.deepEqual(context.pin, [37.4, 127.1, '가상 분양 a', 14]);
});

test('opening the larger map passes the currently selected notice, anchor and resolved point', async t => {
  const pending = deferred();
  const current = notice('b');
  const currentLocation = located('b', { approximate: false, label: '공고 제공 위치' });
  const context = fixture(t, { resolveLocation: record => record.id === 'b' ? pending.promise : Promise.resolve(located('a')) });
  await context.panel.show(notice('a'));
  const showingB = context.panel.show(current);
  context.nearby.click();
  assert.equal(context.calls.opened.length, 0, 'The previous location cannot be opened while a new notice is resolving');
  pending.resolve(currentLocation); await showingB;
  assert.equal(context.nearby.hidden, false);
  assert.deepEqual(context.pin, [37.5, 127.1, current.title, 16]);
  context.nearby.click();
  assert.equal(context.calls.opened.length, 1);
  assert.equal(context.calls.opened[0][0], current);
  assert.equal(context.calls.opened[0][1], context.nearby);
  assert.equal(context.calls.opened[0][2], currentLocation);
  assert.deepEqual(context.calls.opened[0][2].point, { lat: 37.5, lng: 127.1 });
});
