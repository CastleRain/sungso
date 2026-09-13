import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../js/ui-shell.js', import.meta.url), 'utf8');
const functions = ['syncVisitRecordAction', 'initShell'].map(name => {
  const match = source.match(new RegExp(`function ${name}\\(\\) \\{[\\s\\S]+?^\\}`, 'm'));
  assert.ok(match, `${name} remains an actual shell function`); return match[0];
}).join('\n');

test('mobile visit action moved outside the private root is removed synchronously on logout and not resurrected on resize', () => {
  let cleanup, resize;
  const topbar = {}, body = { append(element) { element.parentElement = this; } };
  const action = { parentElement: topbar, hidden: false, inert: false, removed: false,
    classList: { toggle() {} }, remove() { this.removed = true; this.parentElement = null; } };
  const globals = {
    $: selector => selector === '#openVisitButton' ? (action.removed ? null : action) : selector === '.hh-topbar-actions' ? topbar : null,
    $$: () => [], registerPrivateCleanup: callback => { cleanup = callback; },
    hhUI: { subscribe() {}, get() { return {}; } },
    initPanelResize() {}, initMobileSheet() {}, initRailHints() {}, updateTopbar() {}, applyShellState() {},
    document: { body, addEventListener() {} }, MutationObserver: class { observe() {} },
    window: { matchMedia: () => ({ matches: true }), addEventListener(name, callback) { if (name === 'resize') resize = callback; } },
  };
  vm.runInNewContext(`${functions}\ninitShell();`, globals);
  assert.equal(action.parentElement, body, 'normal mobile placement is retained');
  cleanup();
  assert.equal(action.hidden, true); assert.equal(action.inert, true); assert.equal(action.removed, true);
  resize(); assert.equal(action.parentElement, null);
});
