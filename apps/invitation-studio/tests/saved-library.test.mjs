import test from 'node:test';
import assert from 'node:assert/strict';
import { CHOICES, DEFAULT_COMPOSITION, DEFAULT_ORDER, OPTIONAL_SECTIONS, ORDER_SECTIONS, normalizeComposition, compositionParams, readComposition } from '../js/composition.mjs';
import { parseLibrary, selectSaved, updateSaved, exportSelection, parseImport, LIBRARY_BYTES, LIBRARY_LIMIT } from '../js/saved-library.mjs';
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

test('40 complete research combinations round trip through storage, collection export and individual V1 files', () => {
  const extras = OPTIONAL_SECTIONS.map(section => section.id), order = ORDER_SECTIONS.map(section => section.id).reverse();
  const items = Array.from({ length: LIBRARY_LIMIT }, (_, index) => ({
    id: 'research-' + index, name: ('조합 ' + index + ' ').padEnd(32, '가'), note: ('비교한 느낌 ' + index + ' ').padEnd(240, '나'),
    rating: index % 6, createdAt: 100 + index, updatedAt: 200 + index,
    composition: normalizeComposition({
      ...Object.fromEntries(Object.entries(CHOICES).map(([key, choices]) => [key, choices[index % choices.length].id])),
      extras: index % 2 ? extras : ['day-pass', 'keepsake'], order,
      motionSpeed: [.5, .75, 1, 1.25, 1.5][index % 5], motionStrength: [1.5, 1.25, 1, .75, .5][index % 5],
    }),
  }));
  const storage = JSON.stringify(items);
  assert.ok(storage.length < LIBRARY_BYTES); assert.deepEqual(parseLibrary(storage), items);
  const exportFile = JSON.stringify({ version: 1, kind: 'sungso-studio-library', items });
  assert.ok(exportFile.length < LIBRARY_BYTES);
  const imported = parseImport(exportFile); assert.equal(imported.kind, 'library'); assert.deepEqual(imported.items, items);
  for (const item of items) {
    const single = parseImport(JSON.stringify(exportSelection(item.composition, item)));
    assert.equal(single.kind, 'selection'); assert.equal(single.version, 1); assert.deepEqual(single.composition, item.composition);
    assert.equal(single.name, item.name); assert.equal(single.rating, item.rating); assert.equal(single.note, item.note);
    assert.deepEqual(readComposition(compositionParams(single.composition).toString()), item.composition);
  }
  const edited = updateSaved(imported.items, items[0].id, { name: '나중에 고른 조합', note: '흑백 사진도 다시 보기', rating: 5 }, 500);
  assert.deepEqual(edited[0].composition, items[0].composition); assert.equal(items[0].rating, 0);
});

test('legacy V1 library files gain inert research defaults without enabling the day pass or changing old section order', () => {
  const old = { cover: 'curtain', opening: 'light', intro: 'together', date: 'orbit', story: 'line', album: 'contact', palette: 'azure', font: 'letter' };
  const saved = [{ id: 'old', name: '처음 고른 조합', rating: 4, note: '기존의 느낌 유지', createdAt: 1, updatedAt: 2, composition: old }];
  const expected = normalizeComposition(old), loaded = parseLibrary(JSON.stringify(saved));
  assert.deepEqual(loaded[0].composition, expected); assert.equal(loaded[0].name, saved[0].name); assert.equal(loaded[0].note, saved[0].note); assert.equal(loaded[0].rating, 4);
  assert.deepEqual(expected.order, DEFAULT_ORDER); assert.deepEqual(expected.extras, []);
  for (const key of ['textSize', 'lineSpace', 'photoTone', 'coverFocus', 'ending', 'calendarMark']) assert.equal(expected[key], 'original');
  assert.equal(expected.albumColumns, 'auto'); assert.equal(expected.albumRatio, 'auto'); assert.equal(expected.dayPass, 'boarding');
  assert.deepEqual(parseImport(JSON.stringify({ version: 1, composition: old })).composition, expected);
  assert.deepEqual(parseImport(JSON.stringify({ version: 1, kind: 'sungso-studio-library', items: saved })).items, loaded);
  assert.equal(saved[0].composition.dayPass, undefined, 'reading an old file never mutates its source');
});
