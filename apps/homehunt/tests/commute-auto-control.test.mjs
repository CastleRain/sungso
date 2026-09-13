import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommuteAutoControl } from '../js/controllers/commute-auto-control.js';

class Element extends EventTarget {
  constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.children = []; this.attributes = new Map(); this.dataset = {}; this.ownText = '';
    this.className = ''; this.disabled = false; this.hidden = false; this.classList = { add: value => { this.className = `${this.className} ${value}`.trim(); } };
  }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.ownText = ''; this.children = nodes; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  all(tag) { return this.children.flatMap(child => [...(child.tagName === tag.toUpperCase() ? [child] : []), ...child.all(tag)]); }
}
function fixture(t) {
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: tag => new Element(tag) } });
  t.after(() => { if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else delete globalThis.document; });
  const root = new Element('section'), starts = [], stops = [];
  let state = { running: false, maxCalls: 100, actualCalls: 0, checked: 0, matched: 0, excluded: 0, pending: 0, reason: '' };
  const runner = {
    snapshot: () => ({ ...state }),
    start: options => { starts.push(options); state = { ...state, running: true, maxCalls: options.maxCalls }; return { ...state }; },
    stop: () => { stops.push(true); state = { ...state, stopping: true }; return { ...state }; },
  };
  const view = createCommuteAutoControl(root, { runner });
  return { root, runner, view, starts, stops };
}

test('mounting the controls never starts a run and offers only bounded budgets', t => {
  const { root, starts } = fixture(t);
  assert.equal(starts.length, 0);
  const select = root.all('select')[0];
  assert.equal(select.value, '100');
  assert.deepEqual(select.all('option').map(option => option.value), ['30', '100', '200']);
  assert.doesNotMatch(root.textContent, /모두 사용|전체 소진|무제한/);
});

test('only an explicit start click sends the selected limit and locks duplicate starts', t => {
  const { root, starts } = fixture(t);
  const select = root.all('select')[0], start = root.all('button')[0];
  select.value = '30'; start.dispatchEvent(new Event('click')); start.dispatchEvent(new Event('click'));
  assert.deepEqual(starts, [{ maxCalls: 30 }]);
  assert.equal(select.disabled, true); assert.equal(start.disabled, true);
  assert.equal(root.all('button')[1].hidden, false);
});

test('stop acknowledges that the current house may finish without starting another run', t => {
  const { root, view, starts, stops } = fixture(t);
  root.all('button')[0].dispatchEvent(new Event('click'));
  view.render({ running: true, provider: 'kakao', maxCalls: 100, actualCalls: 3, checked: 1, matched: 1, callsPerCandidate: 3 });
  root.all('button')[1].dispatchEvent(new Event('click'));
  assert.equal(stops.length, 1); assert.equal(starts.length, 1);
  assert.equal(root.all('button')[1].disabled, true);
  assert.match(root.textContent, /현재 집 확인 후 중지/);
  view.render({ running: true, stopping: true, maxCalls: 100, callsPerCandidate: 3 });
  assert.match(root.textContent, /최대 3회.*다음 집부터 멈춥/);
});

test('progress reports actual calls separately from checked houses and outcomes', t => {
  const { root, view } = fixture(t);
  view.render({ running: true, provider: 'kakao', maxCalls: 100, actualCalls: 8, checked: 4, matched: 2, excluded: 1, pending: 1 });
  assert.match(root.textContent, /Kakao 실제 신규 8 \/ 100회.*집 4곳 확인 시도.*충족 2곳.*제외 1곳.*미확인 1곳/);
});

test('unknown receipt says usage is unknown and cannot look like a zero-cost result', t => {
  const { root, view } = fixture(t);
  view.render({ running: false, provider: 'kakao', maxCalls: 100, actualCalls: 3, checked: 2, pending: 1, usageUncertain: true, reason: 'UNKNOWN_RECEIPT' });
  assert.match(root.textContent, /추가 사용량 미확인 · 확인된 3회/);
  assert.match(root.textContent, /자동 확인을 멈췄/);
  assert.doesNotMatch(root.textContent, /실제 신규 0/);
});

test('completion, error, condition change, and unsupported mode remain stopped until another click', t => {
  const { root, view, starts } = fixture(t);
  for (const reason of ['COMPLETED', 'ERROR', 'CONTEXT_CHANGED', 'UNSUPPORTED_MODE']) {
    view.render({ running: false, maxCalls: 100, reason });
    assert.equal(root.all('button')[0].disabled, false);
    assert.equal(root.all('button')[1].hidden, true);
    assert.equal(starts.length, 0);
  }
  assert.match(root.textContent, /자동 확인은 대중교통 목적지가 있을 때/);
});

test('arbitrary upstream reason strings are never rendered', t => {
  const { root, view } = fixture(t);
  view.render({ running: false, reason: 'SECRET upstream URL' });
  assert.doesNotMatch(root.textContent, /SECRET/);
});
