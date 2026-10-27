import test from 'node:test';
import assert from 'node:assert/strict';
import { copyText } from '../js/ui.mjs';

function fixture(t, { clipboardFails = false, legacy = false } = {}) {
  const written = [], commands = [], timers = [], focused = [];
  const document = new EventTarget();
  function element(id) {
    const classes = new Set();
    return {
      id, style: {}, value: '', textContent: '', selected: false, open: false,
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
      select() { this.selected = true; },
      focus() { document.activeElement = this; focused.push(id); },
      showModal() { this.open = true; },
      remove() { document.body.children = document.body.children.filter(child => child !== this); },
    };
  }
  const nodes = Object.fromEntries(['copy-dialog', 'copy-value', 'toast', 'previous'].map(id => [id, element(id)]));
  document.documentElement = element('html');
  document.body = { children: [], append(child) { this.children.push(child); } };
  document.activeElement = nodes.previous;
  document.querySelector = selector => nodes[selector.slice(1)] || null;
  document.getElementById = id => nodes[id] || null;
  document.createElement = tag => { assert.equal(tag, 'textarea'); const input = element('legacy-copy'); document.createdInput = input; return input; };
  document.execCommand = command => { commands.push(command); if (legacy instanceof Error) throw legacy; return legacy; };
  const navigator = { clipboard: { async writeText(text) { written.push(text); if (clipboardFails) throw new Error('NotAllowedError'); } } };
  const globals = {
    document, navigator, window: {}, location: { pathname: '/lab/v6-1/a/', search: '', hash: '#accounts' },
    setTimeout(callback, delay) { const timer = { callback, delay, cancelled: false }; timers.push(timer); return timer; },
    clearTimeout(timer) { if (timer) timer.cancelled = true; },
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => { for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  return { document, nodes, written, commands, timers, focused };
}

test('clipboard denial and legacy exception open the manual-copy dialog with exact value selected', async t => {
  const f = fixture(t, { clipboardFails: true, legacy: new Error('copy unavailable') });
  const number = '0000000001';
  assert.equal(await copyText(number, '계좌번호를 복사했어요.'), false);
  assert.deepEqual(f.written, [number]); assert.deepEqual(f.commands, ['copy']);
  assert.equal(f.document.createdInput.selected, true);
  assert.equal(f.document.body.children.length, 0);
  assert.equal(f.nodes['copy-dialog'].open, true);
  assert.equal(f.nodes['copy-value'].value, number); assert.equal(f.nodes['copy-value'].selected, true);
  assert.equal(f.document.activeElement, f.nodes['copy-value']);
  assert.deepEqual(f.focused, ['previous', 'copy-value']);
  assert.equal(f.nodes.toast.classList.contains('visible'), false); assert.equal(f.timers.length, 0);
});

test('successful native clipboard copy reports success and shows only the temporary toast', async t => {
  const f = fixture(t), value = 'https://sungso-wedding.vercel.app/lab/v6-1/a/';
  assert.equal(await copyText(value, '주소를 복사했어요.'), true);
  assert.deepEqual(f.written, [value]); assert.deepEqual(f.commands, []);
  assert.equal(f.document.createdInput, undefined);
  assert.equal(f.nodes['copy-dialog'].open, false);
  assert.equal(f.nodes.toast.textContent, '주소를 복사했어요.'); assert.equal(f.nodes.toast.classList.contains('visible'), true);
  assert.equal(f.timers.length, 1); assert.equal(f.timers[0].delay, 3200);
  f.timers[0].callback(); assert.equal(f.nodes.toast.classList.contains('visible'), false);
});

test('legacy copy returning false is not misreported as successful', async t => {
  const f = fixture(t, { clipboardFails: true, legacy: false });
  const address = '부산광역시 연제구 중앙대로 1125 시티타워';
  assert.equal(await copyText(address, '주소를 복사했어요.'), false);
  assert.deepEqual(f.commands, ['copy']);
  assert.equal(f.nodes['copy-dialog'].open, true);
  assert.equal(f.nodes['copy-value'].value, address); assert.equal(f.nodes['copy-value'].selected, true);
  assert.equal(f.nodes.toast.textContent, ''); assert.equal(f.nodes.toast.classList.contains('visible'), false);
  assert.equal(f.document.body.children.length, 0);
});
