import test from 'node:test';
import assert from 'node:assert/strict';
import { CHOICES, PRESETS, DEFAULT_COMPOSITION, normalizeComposition, readComposition, compositionParams, sameComposition } from '../js/composition.mjs';

test('all 1944 assembled scenes survive URL round trips without carrying data or origin controls', () => {
  let count = 0;
  for (const cover of CHOICES.cover) for (const opening of CHOICES.opening) for (const intro of CHOICES.intro) for (const date of CHOICES.date) for (const story of CHOICES.story) for (const album of CHOICES.album) {
    const state = { cover: cover.id, opening: opening.id, intro: intro.id, date: date.id, story: story.id, album: album.id };
    const params = compositionParams({ ...state, mode: 'live', origin: 'https://evil.example', account: '1234' });
    assert.equal(params.get('version'), '1');
    assert.deepEqual(readComposition(params.toString()), state);
    assert.equal(params.size, 7);
    count++;
  }
  assert.equal(count, 1944);
});

test('existing version 1 links, saved choices, and imported files retain their five scenes with original handwriting', () => {
  const oldState = { cover: 'curtain', intro: 'together', date: 'orbit', story: 'line', album: 'contact' };
  const upgraded = { ...oldState, opening: 'ink' };
  assert.deepEqual(readComposition('?version=1&cover=curtain&intro=together&date=orbit&story=line&album=contact'), upgraded);
  assert.deepEqual(normalizeComposition(oldState), upgraded);
  assert.deepEqual(normalizeComposition({ version: 1, name: '소희의 조합', composition: oldState }), upgraded);
  assert.deepEqual(readComposition(compositionParams(upgraded)), upgraded);
});

test('opening choice is allowlisted and survives the exported JSON envelope', () => {
  for (const opening of CHOICES.opening) {
    const state = { ...DEFAULT_COMPOSITION, opening: opening.id };
    const imported = JSON.parse(JSON.stringify({ version: 1, name: '성우의 조합', composition: state }));
    assert.deepEqual(normalizeComposition(imported), state);
  }
  for (const opening of ['../../script.js', '<script>', 'https://example.com/', false, null, [], { id: 'ink' }]) {
    assert.deepEqual(normalizeComposition({ opening }), DEFAULT_COMPOSITION);
  }
});

test('malformed configuration and unsupported schema versions always return a safe full composition', () => {
  for (const input of [null, undefined, [], 3, 'curtain', { version: 2, cover: 'curtain' }, { cover: ['curtain'] }, { cover: '<script>', intro: '../../../' }]) assert.deepEqual(normalizeComposition(input), DEFAULT_COMPOSITION);
  assert.deepEqual(readComposition('?version=7&cover=curtain&mode=live'), DEFAULT_COMPOSITION);
  assert.deepEqual(normalizeComposition({ cover: 'curtain', album: null }), { ...DEFAULT_COMPOSITION, cover: 'curtain' });
  assert.equal(readComposition('?cover=%E0%A4%A&story=constellation').story, 'constellation');
});

test('prototype and nested data never become visual configuration or modify defaults', () => {
  const inherited = Object.create({ cover: 'curtain', story: 'constellation' });
  assert.deepEqual(normalizeComposition(inherited), DEFAULT_COMPOSITION);
  const source = JSON.parse('{"version":1,"composition":{"cover":"aperture","mode":"live","__proto__":{"isAdmin":true}}}');
  const result = normalizeComposition(source); assert.equal(result.cover, 'aperture'); assert.equal(Object.hasOwn(result, 'mode'), false); assert.equal({}.isAdmin, undefined);
  result.cover = 'curtain'; assert.equal(DEFAULT_COMPOSITION.cover, 'cinema');
  assert.deepEqual(normalizeComposition({ version: 1, composition: { story: 'cafe', album: 'contact' } }), { ...DEFAULT_COMPOSITION, story: 'cafe', album: 'contact' });
});

test('named presets are fully selectable and comparison detects an individual change', () => {
  for (const preset of PRESETS) assert.ok(sameComposition(normalizeComposition(preset.composition), preset.composition));
  assert.equal(sameComposition(DEFAULT_COMPOSITION, { ...DEFAULT_COMPOSITION }), true);
  for (const key of Object.keys(DEFAULT_COMPOSITION)) assert.equal(sameComposition(DEFAULT_COMPOSITION, { ...DEFAULT_COMPOSITION, [key]: CHOICES[key][1].id }), false);
});
