import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_COMPOSITION, normalizeComposition, normalizeTextScale, compositionParams, readComposition, sameComposition } from '../js/composition.mjs';
import { exportSelection, parseImport } from '../js/saved-library.mjs';

test('fine text sizes survive old links, new links and exported selections', () => {
  assert.equal(readComposition('?font=letter').textScale, 1);
  for (const scale of [.9, .95, 1, 1.05, 1.1, 1.15, 1.2]) {
    const state = normalizeComposition({...DEFAULT_COMPOSITION, textScale:scale});
    assert.deepEqual(readComposition(compositionParams(state)), state);
    assert.deepEqual(parseImport(JSON.stringify(exportSelection(state))).composition, state);
    assert.equal(sameComposition(state, DEFAULT_COMPOSITION), scale === 1);
  }
});
test('fine text sizes accept bounded numbers only and never style instructions', () => {
  for (const value of [null, undefined, false, {}, [], 'url(x)', '', Infinity, NaN]) assert.equal(normalizeTextScale(value), 1);
  assert.equal(normalizeTextScale(500), 1.2);
  assert.equal(normalizeTextScale(-1), .9);
  assert.equal(normalizeTextScale('1.124'), 1.1);
  assert.equal(normalizeComposition(Object.create({textScale:1.2})).textScale, 1);
});
