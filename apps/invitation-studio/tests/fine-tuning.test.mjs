import test from 'node:test';
import assert from 'node:assert/strict';
import { FINE_SECTION_IDS, FINE_SECTION_LIMIT, FINE_TUNING_FIELDS, FINE_TUNING_DEFAULTS, FINE_TUNING_RANGES, SECTION_TUNING_MAX_LENGTH, normalizeFineTuning, normalizeSectionTuning, readSectionTuning, setSectionTuning } from '../js/fine-tuning.mjs';
import { CHOICES, ORDER_SECTIONS, OPTIONAL_SECTIONS, compositionParams, normalizeComposition, readComposition, sameComposition } from '../js/composition.mjs';
import { exportSelection, parseImport } from '../js/saved-library.mjs';

test('numeric settings clamp, round by .05 including midpoint values and reject non-numeric input', () => {
  for (const field of FINE_TUNING_FIELDS) {
    const range = FINE_TUNING_RANGES[field];
    for (const invalid of [undefined, null, false, true, [], {}, NaN, Infinity, -Infinity, '', ' ', 'NaN', '1e2', '0x1', '1px', 'calc(1)', 'var(--x)', '1;display:none']) assert.equal(normalizeFineTuning(invalid, range), 1, `${field}: ${String(invalid)}`);
    assert.equal(normalizeFineTuning(-100, range), range.min); assert.equal(normalizeFineTuning(100, range), range.max);
    assert.equal(normalizeFineTuning(' 1.05 ', range), 1.05); assert.equal(normalizeFineTuning(1.025, range), 1.05);
    assert.equal(normalizeFineTuning(.925, range), .95); assert.equal(normalizeFineTuning(1.024, range), 1);
    for (let tick = Math.round(range.min * 20); tick <= Math.round(range.max * 20); tick++) assert.equal(normalizeFineTuning(tick / 20, range), tick / 20);
  }
  assert.throws(() => normalizeFineTuning(1, { min: 1, max: 0, step: .05 }), RangeError);
  assert.throws(() => normalizeFineTuning(1, { min: .9, max: 1.4, step: 0 }), RangeError);
});

test('section settings are canonical, sorted and bounded to the allowlisted 21 destinations', () => {
  const input = FINE_SECTION_IDS.toReversed().map(id => `${id}:1.2:1.4:0.7`).join(';');
  const normalized = normalizeSectionTuning(input), rows = readSectionTuning(normalized);
  assert.equal(FINE_SECTION_LIMIT, 21); assert.equal(Object.keys(rows).length, 21);
  assert.deepEqual(Object.keys(rows), FINE_SECTION_IDS);
  for (const values of Object.values(rows)) assert.deepEqual(values, { textScale: 1.2, lineScale: 1.4, sectionSpace: .7 });
  assert.equal(normalizeSectionTuning(normalized), normalized);
  assert.ok(normalized.length < SECTION_TUNING_MAX_LENGTH);
  assert.equal(normalizeSectionTuning('closing:9:.2:1.12;top:1:1:1;closing:1.125:1.4:.7'), 'top:1:1:1;closing:1.15:1.4:0.7');
});

test('explicit 100% local values survive independently of absent inherited settings', () => {
  assert.equal(normalizeSectionTuning(''), ''); assert.deepEqual(readSectionTuning(''), {});
  const enabled = setSectionTuning('', 'invitation', {});
  assert.equal(enabled, 'invitation:1:1:1'); assert.deepEqual(readSectionTuning(enabled).invitation, FINE_TUNING_DEFAULTS);
  assert.equal(normalizeSectionTuning(enabled), enabled);
  assert.equal(setSectionTuning(enabled, 'invitation', null), '');
});

test('partial adjustments preserve other local values and do not mutate patch objects', () => {
  const patch = Object.freeze({ lineScale: 1.25, ignored: 'display:none' });
  let value = setSectionTuning('', 'gallery', { textScale: 1.1, sectionSpace: .8 });
  value = setSectionTuning(value, 'gallery', patch);
  assert.deepEqual(readSectionTuning(value).gallery, { textScale: 1.1, lineScale: 1.25, sectionSpace: .8 });
  value = setSectionTuning(value, 'top', { textScale: .95 });
  assert.equal(value.startsWith('top:'), true);
  const after = setSectionTuning(value, 'gallery', null);
  assert.deepEqual(readSectionTuning(after), { top: { textScale: .95, lineScale: 1, sectionSpace: 1 } });
  assert.deepEqual(patch, { lineScale: 1.25, ignored: 'display:none' });
});

test('unknown IDs, malformed rows, objects and overlong input cannot introduce selectors or CSS', () => {
  for (const value of [null, undefined, true, 1, {}, [], 'x'.repeat(SECTION_TUNING_MAX_LENGTH + 1)]) assert.equal(normalizeSectionTuning(value), '');
  const input = 'top:1.1:1.2:.8;__proto__:1:1:1;constructor:1:1:1;body:1:1:1;#top:1:1:1;gallery:1:1;closing:1:1:1:extra;accounts:url(x):1:1;location:1e2:1:1;guestbook::1:1;top:bad:1:1';
  assert.equal(normalizeSectionTuning(input), 'top:1.1:1.2:0.8');
  const values = readSectionTuning(input); assert.equal(Object.getPrototypeOf(values), Object.prototype); assert.deepEqual(Object.keys(values), ['top']);
  assert.equal(setSectionTuning(input, '__proto__', { textScale: 1.2 }), 'top:1.1:1.2:0.8');
  assert.equal(setSectionTuning(input, 'top', []), 'top:1.1:1.2:0.8');
  const inherited = Object.create({ textScale: 1.2 }); inherited.lineScale = 1.1;
  assert.equal(setSectionTuning('', 'top', inherited), 'top:1:1.1:1');
});

test('all per-scene overrides still fit the existing 2048 character share URL budget', () => {
  const longestChoices = Object.fromEntries(Object.entries(CHOICES).map(([key, choices]) => [key, [...choices].sort((a, b) => b.id.length - a.id.length)[0].id]));
  const composition = normalizeComposition({ ...longestChoices, textScale: 1.15, motionSpeed: 1.25, motionStrength: 1.25, extras: OPTIONAL_SECTIONS.map(section => section.id), order: ORDER_SECTIONS.map(section => section.id).reverse() });
  const params = compositionParams(composition);
  params.set('lineScale', '1.35'); params.set('sectionSpace', '1.35');
  params.set('sectionTuning', normalizeSectionTuning(FINE_SECTION_IDS.map(id => `${id}:1.15:1.35:1.35`).join(';')));
  const query = params.toString(), url = new URL(`https://sungso-wedding.vercel.app/lab/studio/?${query}`);
  assert.ok(query.length + 1 <= 2048, `Complete query must fit parser cap (${query.length})`);
  assert.ok(url.href.length <= 2048, `Complete share URL must fit budget (${url.href.length})`);
  assert.deepEqual(Object.keys(readSectionTuning(url.searchParams.get('sectionTuning'))), FINE_SECTION_IDS);
  const parsed = readComposition(url.search);
  assert.equal(parsed.lineScale, 1.35); assert.equal(parsed.sectionSpace, 1.35);
  assert.equal(parsed.sectionTuning, params.get('sectionTuning'));
  assert.deepEqual(parsed.order, composition.order);
  assert.deepEqual(parseImport(JSON.stringify(exportSelection(parsed))).composition, parsed);
});

test('old links inherit global defaults and local changes remain part of combination equality', () => {
  const old = readComposition('?version=1&font=letter');
  assert.equal(old.lineScale, 1); assert.equal(old.sectionSpace, 1); assert.equal(old.sectionTuning, '');
  const updated = normalizeComposition({ ...old, sectionTuning: 'gallery:1:1:1', lineScale: 1.2, sectionSpace: .8 });
  assert.equal(sameComposition(old, updated), false);
  assert.equal(sameComposition(updated, readComposition(compositionParams(updated))), true);
  assert.equal(readSectionTuning(updated.sectionTuning).gallery.textScale, 1, 'local checkbox at100% survives normalization');
  const hostile = normalizeComposition({ lineScale: 'calc(1)', sectionSpace: {}, sectionTuning: 'body:1:1:1' });
  assert.equal(hostile.lineScale, 1); assert.equal(hostile.sectionSpace, 1); assert.equal(hostile.sectionTuning, '');
});
