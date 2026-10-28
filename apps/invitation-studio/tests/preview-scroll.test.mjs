import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollPreviewTo } from '../js/preview-scroll.mjs';

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
