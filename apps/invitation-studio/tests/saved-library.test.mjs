import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_COMPOSITION } from '../js/composition.mjs';
import { parseLibrary, selectSaved, updateSaved, exportSelection, parseImport, LIBRARY_BYTES } from '../js/saved-library.mjs';
const record = (id, extra = {}) => ({ id, name: `조합 ${id}`, composition: { ...DEFAULT_COMPOSITION }, ...extra });
test('old eight records migrate without write or loss, with independent compositions', () => {
  const source = Array.from({ length: 8 }, (_, i) => record(String(i)));
  const result = parseLibrary(JSON.stringify(source));
  assert.equal(result.length, 8); assert.equal(result[0].rating, 0); assert.equal(result[0].note, '');
  assert.deepEqual(result.map(item => item.composition), source.map(item => item.composition));
  result[0].composition.order.reverse(); assert.notDeepEqual(result[0].composition.order, result[1].composition.order);
});
test('reading never silently truncates an existing larger library', () => {
  assert.equal(parseLibrary(JSON.stringify(Array.from({ length: 41 }, (_, i) => record(String(i))))).length, 41);
  for (const raw of ['{', '{}', JSON.stringify([record('a'), record('a')]), JSON.stringify([record('a'), null]), ' '.repeat(LIBRARY_BYTES + 1)]) assert.throws(() => parseLibrary(raw));
});
test('ratings, notes, and newest or favorite ordering do not mutate source order', () => {
  const input = parseLibrary(JSON.stringify([record('a', { rating: 3, updatedAt: 30 }), record('b', { rating: 5, updatedAt: 10, note: '소희가 좋아한 파랑' }), record('c', { rating: 4, updatedAt: 20 })]));
  assert.deepEqual(selectSaved(input, { sort: 'rating' }).map(i => i.id), ['b', 'c', 'a']);
  assert.deepEqual(selectSaved(input, { favorites: true }).map(i => i.id), ['c', 'b']);
  assert.deepEqual(selectSaved(input, { search: '파랑' }).map(i => i.id), ['b']);
  assert.deepEqual(input.map(i => i.id), ['a', 'b', 'c']);
});
test('metadata update cannot replace a composition or record identity', () => {
  const input = parseLibrary(JSON.stringify([record('a', { createdAt: 5 })]));
  const next = updateSaved(input, 'a', { id: 'evil', rating: 4, note: '마음에 들어요', composition: { palette: 'rose' } }, 20);
  assert.equal(next[0].id, 'a'); assert.equal(next[0].createdAt, 5); assert.equal(next[0].updatedAt, 20); assert.equal(next[0].rating, 4);
  assert.deepEqual(next[0].composition, input[0].composition); assert.equal(input[0].rating, 0);
});
test('single selection and collection exports preserve ratings, notes, choices and order without arbitrary data', () => {
  const single = exportSelection({ ...DEFAULT_COMPOSITION, palette: 'rose', endpoint: 'evil', order: [...DEFAULT_COMPOSITION.order].reverse() }, { name: '소희', rating: 5, note: '이 색감으로', secret: 'no' });
  const imported = parseImport(JSON.stringify(single));
  assert.equal(imported.rating, 5); assert.equal(imported.note, '이 색감으로'); assert.equal(imported.composition.palette, 'rose'); assert.equal(imported.secret, undefined); assert.equal(imported.composition.endpoint, undefined);
  const collection = parseImport(JSON.stringify({ version: 1, kind: 'sungso-studio-library', items: [record('x', single)] }));
  assert.equal(collection.items[0].rating, 5); assert.equal(collection.items[0].note, '이 색감으로');
  assert.throws(() => parseImport(JSON.stringify({ version: 2, composition: DEFAULT_COMPOSITION })));
  assert.throws(() => parseImport(JSON.stringify({ version: 1, composition: { endpoint: 'evil' } })));
});
