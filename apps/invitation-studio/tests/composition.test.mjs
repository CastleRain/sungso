import test from 'node:test';
import assert from 'node:assert/strict';
import { CHOICES, CHOICE_KEYS, PRESETS, DEFAULT_COMPOSITION, DEFAULT_ORDER, ORDER_SECTIONS, normalizeOrder, moveSection, normalizeComposition, readComposition, compositionParams, sameComposition } from '../js/composition.mjs';

test('all 23328 mood and scene combinations with distributed motion choices survive URL round trips without data or origin controls', () => {
  let count = 0;
  for (const palette of CHOICES.palette) for (const font of CHOICES.font) for (const cover of CHOICES.cover) for (const opening of CHOICES.opening) for (const intro of CHOICES.intro) for (const date of CHOICES.date) for (const story of CHOICES.story) for (const album of CHOICES.album) {
    const state = { ...DEFAULT_COMPOSITION, motion: CHOICES.motion[count % CHOICES.motion.length].id, palette: palette.id, font: font.id, cover: cover.id, opening: opening.id, intro: intro.id, date: date.id, story: story.id, album: album.id };
    const params = compositionParams({ ...state, mode: 'live', origin: 'https://evil.example', account: '1234' });
    assert.equal(params.get('version'), '1');
    assert.deepEqual(readComposition(params.toString()), state);
    assert.equal(params.size, CHOICE_KEYS.length + 2);
    count++;
  }
  assert.equal(count, 23328);
});

test('existing version 1 links, saved choices, and imported files retain their five scenes with original handwriting', () => {
  const oldState = { cover: 'curtain', intro: 'together', date: 'orbit', story: 'line', album: 'contact' };
  const upgraded = { ...DEFAULT_COMPOSITION, ...oldState };
  assert.deepEqual(readComposition('?version=1&cover=curtain&intro=together&date=orbit&story=line&album=contact'), upgraded);
  assert.deepEqual(normalizeComposition(oldState), upgraded);
  assert.deepEqual(normalizeComposition({ version: 1, name: '소희의 조합', composition: oldState }), upgraded);
  assert.deepEqual(readComposition(compositionParams(upgraded)), upgraded);
});

test('old six-choice links and records keep their exact original atmosphere', () => {
  const previous = { cover: 'curtain', opening: 'light', intro: 'together', date: 'orbit', story: 'line', album: 'contact' };
  const expected = { ...DEFAULT_COMPOSITION, ...previous };
  assert.deepEqual(readComposition('?version=1&cover=curtain&opening=light&intro=together&date=orbit&story=line&album=contact'), expected);
  assert.deepEqual(normalizeComposition({ version: 1, composition: previous }), expected);
  assert.equal(expected.palette, 'mist'); assert.equal(expected.font, 'letter');
});

test('color and typography are allowlisted and survive saved and imported envelopes', () => {
  for (const palette of CHOICES.palette) for (const font of CHOICES.font) {
    const state = { ...DEFAULT_COMPOSITION, palette: palette.id, font: font.id };
    const saved = JSON.parse(JSON.stringify({ version: 1, name: '소희의 분위기', composition: state }));
    assert.deepEqual(normalizeComposition(saved), state);
    assert.ok(sameComposition(normalizeComposition(saved), state));
  }
  for (const value of ['url(https://evil.test/font)', '<style>', '../../../', 'inherit', false, {}, []]) {
    assert.deepEqual(normalizeComposition({ palette: value, font: value }), DEFAULT_COMPOSITION);
  }
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
  for (const key of CHOICE_KEYS) assert.equal(sameComposition(DEFAULT_COMPOSITION, { ...DEFAULT_COMPOSITION, [key]: CHOICES[key][1].id }), false);
  assert.equal(sameComposition(DEFAULT_COMPOSITION, { ...DEFAULT_COMPOSITION, order: [...DEFAULT_ORDER].reverse() }), false);
  assert.equal(sameComposition(DEFAULT_COMPOSITION, { ...DEFAULT_COMPOSITION, order: [...DEFAULT_ORDER] }), true);
});

test('old eight-choice links and JSON retain the original scroll motion and section order', () => {
  const previous = { palette: 'azure', font: 'modern', cover: 'curtain', opening: 'light', intro: 'together', date: 'orbit', story: 'line', album: 'contact' };
  const upgraded = { ...DEFAULT_COMPOSITION, ...previous };
  assert.deepEqual(normalizeComposition({ version: 1, composition: previous }), upgraded);
  assert.deepEqual(readComposition(new URLSearchParams({ version: '1', ...previous })), upgraded);
  assert.equal(upgraded.motion, 'signature');
  assert.deepEqual(upgraded.order, ['invitation', 'wedding-day', 'location', 'our-story', 'gallery', 'accounts', 'guestbook']);
});

test('section order accepts only known sections once and never drops required content', () => {
  const dirty = ['gallery', 'gallery', 'top', 'closing', 'accounts', '../../manage', { id: 'guestbook' }, null, false];
  const expected = ['gallery', 'accounts', 'invitation', 'wedding-day', 'location', 'our-story', 'guestbook'];
  assert.deepEqual(normalizeOrder(dirty), expected);
  assert.deepEqual(normalizeOrder('gallery,gallery,top,closing,accounts,../../manage'), expected);
  assert.deepEqual(readComposition('?version=1&order=gallery%2Caccounts&mode=live').order, expected);
  for (const input of [null, undefined, {}, 4, false, ['__proto__', 'constructor'], '<script>', 'https://evil.example/']) assert.deepEqual(normalizeOrder(input), DEFAULT_ORDER);
  assert.equal(new Set(normalizeOrder(Array(500).fill('gallery'))).size, 7);
  const inherited = Object.create({ order: ['gallery'], motion: 'still' });
  assert.deepEqual(normalizeComposition(inherited), DEFAULT_COMPOSITION);
  const result = normalizeComposition({ order: ['gallery'] }); result.order.pop();
  assert.equal(DEFAULT_ORDER.length, 7); assert.equal(normalizeComposition({}).order.length, 7);
});

test('every section order survives links and saved files with independent style and motion choices', () => {
  let count = 0;
  function* permutations(values) {
    if (!values.length) { yield []; return; }
    for (let i = 0; i < values.length; i++) for (const tail of permutations(values.filter((_, index) => index !== i))) yield [values[i], ...tail];
  }
  for (const order of permutations(DEFAULT_ORDER)) {
    const state = { ...DEFAULT_COMPOSITION, order, palette: 'rose', font: 'editorial', motion: CHOICES.motion[count % CHOICES.motion.length].id, opening: 'light' };
    assert.deepEqual(readComposition(compositionParams(state)), state);
    const saved = JSON.parse(JSON.stringify({ version: 1, name: '우리 순서', composition: state }));
    assert.deepEqual(normalizeComposition(saved), state);
    assert.ok(sameComposition(normalizeComposition(saved), state));
    count++;
  }
  assert.equal(count, 5040);
  assert.deepEqual(ORDER_SECTIONS.map(item => item.id), DEFAULT_ORDER);
});

test('moving a section changes only its position, is reversible, and rejects invalid destinations', () => {
  for (const id of DEFAULT_ORDER) for (let index = 0; index < DEFAULT_ORDER.length; index++) {
    const moved = moveSection(DEFAULT_ORDER, id, index);
    assert.equal(moved[index], id);
    assert.deepEqual(moved.filter(item => item !== id), DEFAULT_ORDER.filter(item => item !== id));
    assert.deepEqual(moveSection(moved, id, DEFAULT_ORDER.indexOf(id)), DEFAULT_ORDER);
  }
  for (const position of [-1, 7, 0.5, NaN, '2', null]) assert.deepEqual(moveSection(DEFAULT_ORDER, 'gallery', position), DEFAULT_ORDER);
  assert.deepEqual(moveSection(DEFAULT_ORDER, 'top', 0), DEFAULT_ORDER);
  assert.deepEqual(moveSection(DEFAULT_ORDER, 'closing', 1), DEFAULT_ORDER);
});

test('motion accepts fixed presets only and cannot configure data, scripts, or styles', () => {
  for (const motion of CHOICES.motion) {
    const state = { ...DEFAULT_COMPOSITION, motion: motion.id, order: [...DEFAULT_ORDER].reverse(), palette: 'midnight' };
    assert.deepEqual(normalizeComposition(JSON.parse(JSON.stringify({ version: 1, composition: state }))), state);
  }
  for (const motion of ['url(https://evil.test)', '<script>', 'none', {}, [], false]) assert.deepEqual(normalizeComposition({ motion }), DEFAULT_COMPOSITION);
});

test('all four utility presentations survive saving, sharing and reordering without changing data mode', () => {
  let count = 0;
  for (const arrival of CHOICES.arrival) for (const gifting of CHOICES.gifting) for (const wishes of CHOICES.wishes) for (const navigation of CHOICES.navigation) for (const motion of CHOICES.motion) {
    const state = { ...DEFAULT_COMPOSITION, arrival: arrival.id, gifting: gifting.id, wishes: wishes.id, navigation: navigation.id, motion: motion.id, order: [...DEFAULT_ORDER].reverse() };
    assert.deepEqual(readComposition(compositionParams(state)), state);
    assert.deepEqual(normalizeComposition(JSON.parse(JSON.stringify({ version: 1, rating: 5, note: '좋아하는 조합', composition: state }))), state);
    assert.equal(Object.hasOwn(normalizeComposition({ ...state, mode: 'live', account: '123456', api: 'https://example.test' }), 'mode'), false);
    count++;
  }
  assert.equal(count, 567);
  const previous = { palette: 'azure', font: 'editorial', motion: 'focus', cover: 'aperture', opening: 'flow', intro: 'ribbon', date: 'flip', story: 'line', album: 'contact', order: [...DEFAULT_ORDER] };
  const upgraded = normalizeComposition(previous);
  for (const key of ['arrival', 'gifting', 'wishes', 'navigation']) assert.equal(upgraded[key], DEFAULT_COMPOSITION[key]);
  for (const key of Object.keys(previous)) assert.deepEqual(upgraded[key], previous[key]);
});
