import test from 'node:test';
import assert from 'node:assert/strict';
import { CHOICES, CHOICE_KEYS, PRESETS, DEFAULT_COMPOSITION, DEFAULT_ORDER, ORDER_SECTIONS, OPTIONAL_SECTIONS, normalizeOrder, moveSection, normalizeComposition, readComposition, compositionParams, sameComposition } from '../js/composition.mjs';

test('all mood and scene combinations with distributed motion choices survive URL round trips without data or origin controls', () => {
  let count = 0;
  for (const palette of CHOICES.palette) for (const font of CHOICES.font) for (const cover of CHOICES.cover) for (const opening of CHOICES.opening) for (const intro of CHOICES.intro) for (const date of CHOICES.date) for (const story of CHOICES.story) for (const album of CHOICES.album) {
    const state = { ...DEFAULT_COMPOSITION, motion: CHOICES.motion[count % CHOICES.motion.length].id, palette: palette.id, font: font.id, cover: cover.id, opening: opening.id, intro: intro.id, date: date.id, story: story.id, album: album.id };
    const params = compositionParams({ ...state, mode: 'live', origin: 'https://evil.example', account: '1234' });
    assert.equal(params.get('version'), '1');
    assert.deepEqual(readComposition(params.toString()), state);
    assert.equal(params.size, CHOICE_KEYS.length + 9);
    count++;
  }
  assert.equal(count, ['palette', 'font', 'cover', 'opening', 'intro', 'date', 'story', 'album'].reduce((total, key) => total * CHOICES[key].length, 1));
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
  for (const key of CHOICE_KEYS) assert.equal(sameComposition(DEFAULT_COMPOSITION, { ...DEFAULT_COMPOSITION, [key]: CHOICES[key].find(choice => choice.id !== DEFAULT_COMPOSITION[key]).id }), false);
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
  assert.deepEqual(ORDER_SECTIONS.filter(item => !item.group).map(item => item.id), DEFAULT_ORDER);
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

test('slow and strong settings round trip through shared URLs and the version 1 saved format', () => {
  for (const motionSpeed of [.5, .75, 1, 1.25, 1.5]) for (const motionStrength of [.5, .75, 1, 1.25, 1.5]) {
    const state = normalizeComposition({ motion: 'drift', motionSpeed, motionStrength, spacing: 'airy', divider: 'chapter' });
    assert.deepEqual(readComposition(compositionParams(state)), state);
    assert.deepEqual(normalizeComposition(JSON.parse(JSON.stringify({ version: 1, composition: state }))), state);
    assert.equal(sameComposition(state, { ...state, motionSpeed: motionSpeed === 1 ? .5 : 1 }), false);
  }
  for (const value of [null, true, [], {}, 'NaN', 'Infinity', 'url(x)', '', '1px']) {
    const result = normalizeComposition({ motionSpeed: value, motionStrength: value });
    assert.equal(result.motionSpeed, 1); assert.equal(result.motionStrength, 1);
  }
  assert.equal(normalizeComposition({ motionSpeed: -500 }).motionSpeed, .5);
  assert.equal(normalizeComposition({ motionStrength: 500 }).motionStrength, 1.5);
  assert.equal(normalizeComposition({ motionSpeed: .66 }).motionSpeed, .75);
});

test('all optional scene combinations are explicit, reversible and preserved with order and settings', () => {
  const ids = OPTIONAL_SECTIONS.map(section => section.id);
  for (let mask = 0; mask < 2 ** ids.length; mask++) {
    const extras = ids.filter((_, index) => mask & (1 << index));
    const state = normalizeComposition({ extras, order: [...extras].reverse(), motionSpeed: .5, motionStrength: 1.5 });
    assert.deepEqual(state.order, [...extras].reverse().concat(DEFAULT_ORDER));
    assert.deepEqual(readComposition(compositionParams(state)), state);
    assert.deepEqual(normalizeComposition({ version: 1, composition: state }), state);
    assert.deepEqual(normalizeComposition({ ...state, extras: [] }).order, DEFAULT_ORDER);
    if (extras.length) assert.equal(moveSection(state.order, extras[0], 0, extras)[0], extras[0]);
  }
  assert.deepEqual(normalizeComposition({ order: ids }).order, DEFAULT_ORDER, 'order cannot enable optional content');
  assert.deepEqual(normalizeComposition({ extras: ['__proto__', 'location', '../../admin', {}, ...ids, ...ids] }).extras, ids);
  const legacy = readComposition('?version=1&motion=focus&palette=rose');
  assert.deepEqual(legacy.extras, []); assert.deepEqual(legacy.order, DEFAULT_ORDER);
});

const RESEARCH_DEFAULTS = Object.freeze({
  textSize: 'original', lineSpace: 'original', photoTone: 'original', coverFocus: 'original',
  albumColumns: 'auto', albumRatio: 'auto', ending: 'original', calendarMark: 'original', dayPass: 'boarding',
});

test('research additions keep every legacy V1 default visually unchanged and optional content off', () => {
  const legacy = { palette: 'azure', font: 'editorial', motion: 'breathe', cover: 'aperture', opening: 'flow', intro: 'ribbon', date: 'flip', story: 'line', album: 'contact', arrival: 'unfold', gifting: 'card', wishes: 'envelope', navigation: 'dock', order: [...DEFAULT_ORDER] };
  const loaded = readComposition(new URLSearchParams({ version: '1', ...legacy, order: legacy.order.join(',') }).toString());
  for (const [key, value] of Object.entries(RESEARCH_DEFAULTS)) assert.equal(loaded[key], value, key);
  for (const [key, value] of Object.entries(legacy)) assert.deepEqual(loaded[key], value, key);
  assert.deepEqual(loaded.extras, []); assert.equal(loaded.order.length, 7);
  assert.deepEqual(normalizeComposition({ version: 1, composition: legacy }), loaded);
  const previousExtras = ['guest-guide', 'day-checklist', 'keepsake', 'promises', 'couple-notes', 'thank-you'];
  const extendedLegacy = normalizeComposition({ ...legacy, extras: previousExtras });
  assert.deepEqual(extendedLegacy.extras, previousExtras);
  assert.ok(!extendedLegacy.order.includes('day-pass')); assert.equal(extendedLegacy.order.length, 13);
});

test('every new research choice survives V1 links and envelopes alongside all other chosen settings', () => {
  const allExtras = OPTIONAL_SECTIONS.map(section => section.id);
  const background = normalizeComposition({
    palette: 'lilac', font: 'editorial', textSize: 'large', lineSpace: 'relaxed', photoTone: 'mono', coverFocus: 'lower',
    album: 'masonry', albumColumns: 'two', albumRatio: 'original', ending: 'glass', calendarMark: 'underline',
    guestGuide: 'slider', keepsake: 'qr', dayPass: 'concise', extras: allExtras, order: [...ORDER_SECTIONS].reverse().map(section => section.id),
    motion: 'unveil', motionSpeed: .5, motionStrength: 1.5,
  });
  for (const key of [...Object.keys(RESEARCH_DEFAULTS), 'album', 'guestGuide', 'keepsake']) for (const choice of CHOICES[key]) {
    const state = normalizeComposition({ ...background, [key]: choice.id });
    assert.deepEqual(readComposition(compositionParams(state).toString()), state, key + ':' + choice.id);
    assert.deepEqual(normalizeComposition(JSON.parse(JSON.stringify({ version: 1, composition: state }))), state);
  }
  for (const key of Object.keys(RESEARCH_DEFAULTS)) for (const bad of ['<script>', 'https://outside.example/', '__proto__', {}, ['original'], false]) {
    assert.equal(normalizeComposition({ ...background, [key]: bad })[key], RESEARCH_DEFAULTS[key], key);
  }
});

test('day pass is explicitly optional, retains its format while disabled, and joins seven required plus seven optional sections', () => {
  assert.equal(DEFAULT_ORDER.length, 7); assert.equal(OPTIONAL_SECTIONS.length, 7); assert.equal(ORDER_SECTIONS.length, 14);
  const allExtras = OPTIONAL_SECTIONS.map(section => section.id);
  const full = normalizeComposition({ extras: allExtras, order: ['day-pass', ...ORDER_SECTIONS.map(section => section.id)], dayPass: 'concise' });
  assert.equal(full.order[0], 'day-pass'); assert.equal(full.order.length, 14); assert.equal(new Set(full.order).size, 14);
  for (let position = 0; position < full.order.length; position++) {
    const order = moveSection(full.order, 'day-pass', position, full.extras);
    assert.equal(order[position], 'day-pass'); assert.equal(new Set(order).size, 14);
    assert.deepEqual(readComposition(compositionParams({ ...full, order })), { ...full, order });
  }
  const removed = normalizeComposition({ ...full, extras: allExtras.filter(id => id !== 'day-pass') });
  assert.ok(!removed.order.includes('day-pass')); assert.equal(removed.dayPass, 'concise');
  assert.equal(normalizeComposition({ ...removed, extras: allExtras }).dayPass, 'concise');
  const inactive = readComposition('?version=1&dayPass=concise&order=day-pass,top,closing');
  assert.deepEqual(inactive.extras, []); assert.deepEqual(inactive.order, DEFAULT_ORDER);
});

test('the longest valid combination URL fits the parser without truncating its final order or adding operational values', () => {
  const longestChoices = Object.fromEntries(Object.entries(CHOICES).map(([key, choices]) => [key, [...choices].sort((a, b) => b.id.length - a.id.length)[0].id]));
  const state = normalizeComposition({ ...longestChoices, motionSpeed: 1.25, motionStrength: 1.25, extras: OPTIONAL_SECTIONS.map(section => section.id), order: ORDER_SECTIONS.map(section => section.id).reverse() });
  const query = compositionParams(state).toString(), url = new URL('https://sungso-wedding.vercel.app/lab/studio/?' + query);
  assert.ok(query.length + 1 <= 2048, 'readComposition string cap must hold every valid composition: ' + query.length);
  assert.ok(url.href.length < 2048, 'shared URL stays within a conservative link size');
  assert.deepEqual(readComposition(url.search), state);
  assert.deepEqual(readComposition(url.searchParams), state);
  assert.equal(url.searchParams.get('order'), state.order.join(','));
  assert.equal(url.searchParams.get('version'), '1');
  assert.deepEqual([...url.searchParams.keys()].sort(), [...CHOICE_KEYS, 'version', 'motionSpeed', 'motionStrength', 'textScale', 'lineScale', 'sectionSpace', 'sectionTuning', 'extras', 'order'].sort());
});

test('each recommended combination is already normalized so applying it retains its selected indicator', () => {
  for (const preset of PRESETS) {
    const selected = normalizeComposition(preset.composition);
    assert.equal(sameComposition(selected, preset.composition), true, preset.id);
    assert.deepEqual(readComposition(compositionParams(selected)), preset.composition, preset.id);
  }
  const readable = PRESETS.find(preset => preset.id === 'readable').composition;
  assert.deepEqual(readable.extras, ['guest-guide']); assert.equal(readable.order.at(-1), 'guest-guide');
});
