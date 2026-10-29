import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CHOICE_KEYS, DEFAULT_COMPOSITION, DEFAULT_ORDER, OPTIONAL_SECTIONS, SECTION_IDS, normalizeComposition, sameComposition } from '../js/composition.mjs';

// Execute the shipped editor handlers with a small event surface. This catches
// accidental apply-on-drag, stale comparisons and missing optional-scene state.
const source = readFileSync(new URL('../catalog/catalog.mjs', import.meta.url), 'utf8');
function between(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first); return source.slice(first, last);
}
class Element {
  constructor(tag, className = '', text = '') { this.tagName = tag; this.className = className; this.textContent = text; this.children = []; this.events = new Map(); this.attributes = new Map(); this.dataset = {}; this.value = ''; this.checked = false; this.disabled = false; }
  append(...children) { this.children.push(...children); children.forEach(child => { child.parent = this; }); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(name, callback) { this.events.set(name, callback); }
  emit(name) { this.events.get(name)?.({ target: this }); }
}
function fixture(initial = {}) {
  const roots = new Map([['extra-sections', new Element('div')], ['extra-status', new Element('p')]]), nodes = [];
  const previews = [], updates = [], state = vm.createContext({
    OPTIONAL_SECTIONS, DEFAULT_ORDER, SECTION_IDS, normalizeComposition, sameComposition,
    node: (tag, className, text) => { const el = new Element(tag, className, text); nodes.push(el); return el; },
    $: selector => roots.get(selector.slice(1)) || nodes.find(node => `#${node.id}` === selector),
    renderChoices: () => updates.push('render'), renderDemoTools() {}, syncExpanded() {},
    requestPreview: (value, options) => previews.push({ value, options }),
  });
  vm.runInContext(`const keys = ${JSON.stringify(CHOICE_KEYS)}, tuningKeys = ['motionSpeed', 'motionStrength'], history = [];
    let composition = normalizeComposition(${JSON.stringify({ ...DEFAULT_COMPOSITION, ...initial })});
    let lastChange = null, activeReviewKey = null, beforeVisible = false, openKey = null, focusedEditor = false;
    ${between('function tuningSummary(', '\nfunction node(')}
    ${between('function apply(', '\nfunction setEditorTab(')}
    ${between('function renderTuning(', '\nfunction makeSample(')}`, state);
  const run = text => vm.runInContext(text, state);
  return { state, previews, updates, nodes, roots, run, get composition() { return run('composition'); }, get change() { return run('lastChange'); } };
}

test('one numeric change compares only that field while keeping the selected effect and current saved composition', () => {
  const f = fixture({ motion: 'focus', motionStrength: 1.5 });
  f.run("apply({ ...composition, motionSpeed: .5 }, { reviewKey: 'motion', changedField: 'motionSpeed' })");
  assert.equal(f.composition.motionSpeed, .5); assert.equal(f.change.field, 'motionSpeed'); assert.equal(f.change.key, 'motion');
  const before = f.run('comparisonComposition(composition, lastChange)');
  assert.equal(before.motionSpeed, 1); assert.equal(before.motionStrength, 1.5); assert.equal(before.motion, 'focus');
  assert.equal(f.composition.motionSpeed, .5); assert.equal(f.updates.length, 1); assert.equal(f.previews.length, 1);
  assert.equal(f.previews[0].options.key, 'motion');
  f.run("apply({ ...composition, motionStrength: .75 }, { reviewKey: 'motion', changedField: 'motionStrength' })");
  assert.equal(f.run('comparisonComposition(composition, lastChange)').motionSpeed, .5);
  assert.equal(f.run('comparisonComposition(composition, lastChange)').motionStrength, 1.5);
  f.run('apply(history.pop(), { remember: false })');
  assert.equal(f.composition.motionSpeed, .5); assert.equal(f.composition.motionStrength, 1.5);
});

test('range dragging changes only the readout; committing applies and demos once without replacing the control', () => {
  const f = fixture({ motion: 'rise' }), container = new Element('div'); f.state.container = container;
  f.run('mountTuning(container); renderTuning()');
  const slider = f.nodes.find(node => node.id === 'motionSpeed'), output = f.nodes.find(node => node.id === 'motionSpeed-value');
  assert.equal(slider.min, '.5'); assert.equal(slider.max, '1.5'); assert.equal(slider.step, '.25');
  slider.value = '.75'; slider.emit('input'); slider.value = '.5'; slider.emit('input');
  assert.equal(output.textContent, '0.50×'); assert.equal(f.composition.motionSpeed, 1); assert.equal(f.previews.length, 0);
  slider.emit('change');
  assert.equal(f.composition.motionSpeed, .5); assert.equal(f.previews.length, 1); assert.equal(f.change.field, 'motionSpeed');
  assert.equal(f.nodes.find(node => node.id === 'motionSpeed'), slider);
});

test('signature and still disable strength without erasing the saved tuning or changing motion preferences', () => {
  const f = fixture({ motion: 'signature', motionSpeed: .5, motionStrength: 1.5 }); f.state.container = new Element('div');
  f.run('mountTuning(container); renderTuning()');
  const strength = f.nodes.find(node => node.id === 'motionStrength');
  assert.equal(strength.disabled, true); assert.equal(strength.value, '1.5');
  f.run("composition = { ...composition, motion: 'still' }; renderTuning()"); assert.equal(strength.disabled, true);
  f.run("composition = { ...composition, motion: 'drift' }; renderTuning()"); assert.equal(strength.disabled, false);
  assert.equal(f.composition.motionSpeed, .5); assert.equal(f.composition.motionStrength, 1.5); assert.equal(f.previews.length, 0);
});

test('optional scene toggles add only the selected scene, keep its format on removal and hide disabled format controls', () => {
  const f = fixture({ promiseStyle: 'paired' }); f.run('mountExtras()');
  assert.equal(f.nodes.filter(node => node.type === 'checkbox').length, OPTIONAL_SECTIONS.length); assert.deepEqual([...f.composition.extras], []);
  const toggle = f.nodes.find(node => node.dataset.extra === 'promises'); toggle.checked = true; toggle.emit('change');
  assert.deepEqual([...f.composition.extras], ['promises']); assert.ok(f.composition.order.includes('promises'));
  assert.equal(f.composition.promiseStyle, 'paired'); assert.equal(f.previews.at(-1).options.key, 'promiseStyle');
  assert.equal(f.run("visibleChoice('promiseStyle', composition)"), true);
  toggle.checked = false; toggle.emit('change');
  assert.deepEqual([...f.composition.extras], []); assert.ok(!f.composition.order.includes('promises'));
  assert.equal(f.composition.promiseStyle, 'paired'); assert.equal(f.run("visibleChoice('promiseStyle', composition)"), false);
  assert.equal(f.run("visibleChoice('album', composition)"), true); assert.equal(f.change, null);
});

test('order shortcuts keep optional scene positions and every required scene exactly once', () => {
  const f = fixture({ extras: ['promises', 'guest-guide'], order: ['invitation', 'promises', 'wedding-day', 'location', 'guest-guide', 'our-story', 'gallery', 'accounts', 'guestbook'] });
  for (const preset of ['guidance', 'photos', 'default']) {
    const next = f.run(`orderForPreset(composition, '${preset}')`);
    assert.equal(next[1], 'promises'); assert.equal(next[4], 'guest-guide'); assert.equal(new Set(next).size, 9);
    assert.deepEqual([...next].filter(id => DEFAULT_ORDER.includes(id)).sort(), [...DEFAULT_ORDER].sort());
  }
  assert.equal(f.run("orderForPreset(composition, 'photos')")[2], 'gallery');
  assert.match(f.run('tuningSummary({ motionSpeed: .5, motionStrength: 1.25 })'), /0\.50×.*1\.25×/);
});

test('the new day-pass toggle preserves its style and remains distinct from legacy optional scenes', () => {
  const f = fixture({ dayPass: 'concise', extras: ['guest-guide'], guestGuide: 'slider' });
  f.run('mountExtras()');
  const toggle = f.nodes.find(node => node.dataset.extra === 'day-pass');
  assert.ok(toggle); toggle.checked = true; toggle.emit('change');
  assert.deepEqual([...f.composition.extras], ['day-pass', 'guest-guide']);
  assert.equal(f.composition.dayPass, 'concise'); assert.equal(f.composition.guestGuide, 'slider');
  assert.equal(f.previews.at(-1).options.key, 'dayPass'); assert.equal(f.run("visibleChoice('dayPass', composition)"), true);
  assert.equal(new Set(f.composition.order).size, DEFAULT_ORDER.length + 2);
  toggle.checked = false; toggle.emit('change');
  assert.deepEqual([...f.composition.extras], ['guest-guide']); assert.equal(f.composition.dayPass, 'concise');
  assert.equal(f.run("visibleChoice('dayPass', composition)"), false);
  assert.equal(f.run("visibleChoice('guestGuide', composition)"), true);
});

test('album details appear only for a compatible arrangement and mood filters do not erase choices', () => {
  const f = fixture({ album: 'stack', albumColumns: 'three', albumRatio: 'square' });
  f.run(`const choiceRows = new Map(keys.map(key => [key, {hidden:false}]));
    const globalKeys = ['palette','font','textSize','lineSpace','photoTone','motion','spacing','divider'];
    const styleGroups = {all:globalKeys, photo:['photoTone']}; let styleGroup = 'all';
    const detailParents = {coverFocus:'cover', calendarMark:'date', albumColumns:'album', albumRatio:'album'};`);
  vm.runInContext(between('function syncChoiceVisibility(', '\nfunction renderOptions('), f.state);
  f.run("openKey = 'album'; syncChoiceVisibility()");
  assert.equal(f.run("choiceRows.get('albumColumns').hidden"), true);
  f.run("composition = {...composition, album:'masonry'}; syncChoiceVisibility()");
  assert.equal(f.run("choiceRows.get('albumColumns').hidden"), false);
  assert.equal(f.run("choiceRows.get('albumRatio').hidden"), false);
  f.run("openKey = 'albumRatio'; syncChoiceVisibility()");
  assert.equal(f.run("choiceRows.get('albumColumns').hidden"), false);
  f.run("openKey = 'date'; styleGroup = 'photo'; syncChoiceVisibility()");
  assert.equal(f.run("choiceRows.get('albumRatio').hidden"), true);
  assert.equal(f.run("choiceRows.get('calendarMark').hidden"), false);
  assert.equal(f.run("choiceRows.get('photoTone').hidden"), false);
  assert.equal(f.run("choiceRows.get('font').hidden"), true);
  assert.equal(f.composition.albumColumns, 'three'); assert.equal(f.composition.albumRatio, 'square');
});
