import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollPreviewTo, afterPreviewScroll } from '../js/preview-scroll.mjs';

test('section changes scroll only the preview window and respect the section reading margin', () => {
  const calls = [];
  const win = { scrollY: 480, scrollX: 0, innerHeight: 800, getComputedStyle: () => ({ scrollMarginTop: '20px' }), scrollTo: value => calls.push(value) };
  Object.defineProperty(win, 'parent', { get() { throw new Error('Parent must never scroll'); } });
  const target = { getBoundingClientRect: () => ({ top: 700, height: 1200 }), scrollIntoView() { throw new Error('Ancestor scrolling regression'); } };
  scrollPreviewTo(target, { win, behavior: 'smooth' });
  assert.deepEqual(calls, [{ top: 1160, left: 0, behavior: 'smooth' }]);
  scrollPreviewTo({ ...target, getBoundingClientRect: () => ({ top: -480, height: 800 }) }, { win });
  assert.equal(calls[1].top, 0);
  scrollPreviewTo(null, { win });
  assert.equal(calls.length, 2);
});

test('new message centering remains inside the preview viewport', () => {
  let result;
  const win = { scrollY: 3000, scrollX: 0, innerHeight: 800, getComputedStyle: () => ({}), scrollTo: value => { result = value; } };
  scrollPreviewTo({ getBoundingClientRect: () => ({ top: 900, height: 200 }) }, { win, block: 'center' });
  assert.deepEqual(result, { top: 3600, left: 0, behavior: 'instant' });
});

function scrollingHarness() {
  let time = 0, id = 0, callbacks = new Map(), settled = 0;
  const doc = { hidden: false, dialog: false, querySelector: () => doc.dialog ? {} : null };
  const win = { scrollY: 0, performance: { now: () => time }, requestAnimationFrame: fn => { callbacks.set(++id, fn); return id; }, cancelAnimationFrame: key => callbacks.delete(key) };
  const cancel = afterPreviewScroll({ win, doc, onSettled: () => settled++ });
  return { win, doc, cancel, get settled() { return settled; }, get pending() { return callbacks.size; }, step(ms, y = win.scrollY) { time += ms; win.scrollY = y; const jobs = [...callbacks.values()]; callbacks.clear(); jobs.forEach(fn => fn()); } };
}
test('review waits for movement to finish, runs once, and leaves no background frame', () => {
  const h = scrollingHarness();
  h.step(50, 200); h.step(50, 450); h.step(50, 700);
  assert.equal(h.settled, 0);
  h.step(50); assert.equal(h.settled, 0);
  h.step(50); assert.equal(h.settled, 1); assert.equal(h.pending, 0);
});
test('review waiting cancels on a new choice, hidden tab or open dialog and has a duration bound', () => {
  for (const reason of ['cancel', 'hidden', 'dialog']) {
    const h = scrollingHarness(); h.step(50, 100);
    if (reason === 'cancel') h.cancel(); else h.doc[reason] = true;
    h.step(1000); assert.equal(h.settled, 0); assert.equal(h.pending, 0);
  }
  const h = scrollingHarness();
  for (let n = 1; n <= 15; n++) h.step(100, n * 40);
  assert.equal(h.settled, 1); assert.equal(h.pending, 0);
});
