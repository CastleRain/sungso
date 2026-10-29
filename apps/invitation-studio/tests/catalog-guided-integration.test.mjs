import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CHOICE_KEYS, DEFAULT_COMPOSITION, SECTION_IDS, normalizeComposition, sameComposition, readComposition, compositionParams } from '../js/composition.mjs';
import { exportSelection, parseImport } from '../js/saved-library.mjs';

const source = readFileSync(new URL('../catalog/catalog.mjs', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
function between(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Shipped handler exists: ${start}`); return source.slice(first, last);
}
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.events = new Map(); this.attributes = new Map(); this.dataset = {}; this.value = ''; this.textContent = ''; this.scrollTop = 0; this.focusCalls = []; this.clicks = 0; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(type, handler) { this.events.set(type, handler); }
  emit(type) { this.events.get(type)?.(); }
  focus(options) { this.focusCalls.push(options); }
  click() { this.clicks++; }
  getBoundingClientRect() { return { top: this.top || 0 }; }
}

test('shipped Next adapter uses the unified inspector and the last step only opens the save form', () => {
  let adapter; const choices = [], opens = [], posts = [], save = new Element('button');
  const context = vm.createContext({
    mountGuidedSteps: options => { adapter = options; return { refresh() {} }; },
    $: selector => selector === '#go-save' ? save : new Element(),
    labels: {}, contentStepLabels: { family: '가족', photos: '사진' }, globalKeys: ['font'], sectionKeys: {}, detailChildren: {},
    contentEditor: { getActiveSection: () => 'photos' }, post: message => posts.push(message),
    openEditorChoice: (key, options) => choices.push({ key, options }),
    openInspectorContent: (key, options) => { opens.push({ key, options, priorSection: vm.runInContext('inspectorSection', context) }); vm.runInContext("inspectorSection='invitation';editorTab='content'", context); },
  });
  vm.runInContext(`let guidedSteps, editorTab='scenes', openKey='album', inspectorSection='gallery', ready=true; const composition={};
    ${between('guidedSteps = mountGuidedSteps({', "\n$('#editor-jump')")}`, context);
  adapter.onOpen({ key: 'font', tab: 'style' });
  assert.deepEqual(JSON.parse(JSON.stringify(choices)), [{ key: 'font', options: { focus: true } }]);
  assert.equal(posts.length, 0, 'the shared design inspector owns demonstration and focus');
  adapter.onOpen({ key: 'family', tab: 'content' });
  assert.deepEqual(JSON.parse(JSON.stringify(opens)), [{ key: 'family', options: { focus: true }, priorSection: null }]);
  assert.deepEqual(JSON.parse(JSON.stringify(posts)), [{ type: 'invitation-studio:jump', section: 'invitation' }]);
  assert.equal(adapter.readState().key, 'photos', 'content guide reads its actual active form group');
  adapter.onFinish(); assert.equal(save.clicks, 1, 'last step opens the existing form, never saves directly');
});

function textFixture(initial = {}) {
  const nodes = [], previews = [], context = vm.createContext({
    SECTION_IDS, normalizeComposition, sameComposition,
    node: tag => { const node = new Element(tag); nodes.push(node); return node; },
    $: selector => nodes.find(node => `#${node.id}` === selector),
    renderChoices: () => vm.runInContext('renderTextScale()', context), renderDemoTools() {},
    requestPreview: (value, options) => previews.push({ value, options }),
  });
  vm.runInContext(`const keys=${JSON.stringify(CHOICE_KEYS)}, tuningKeys=['motionSpeed','motionStrength'],history=[];
    let composition=normalizeComposition(${JSON.stringify({ ...DEFAULT_COMPOSITION, ...initial })}),beforeVisible=false,lastChange=null,activeReviewKey=null;
    ${between('function comparisonComposition(', '\n\nfunction node(')}
    ${between('function apply(', '\nfunction setEditorTab(')}
    ${between('function renderTextScale(', '\nfunction renderTuning(')}`, context);
  context.container = new Element(); vm.runInContext('mountTextScale(container);renderTextScale()', context);
  return { context, nodes, previews, run: code => vm.runInContext(code, context), slider: nodes.find(node => node.id === 'text-scale'), output: nodes.find(node => node.id === 'text-scale-value') };
}

test('text scaling previews once per commit and compares/restores only the scale', () => {
  const f = textFixture({ textSize: 'large', font: 'modern' });
  assert.equal(f.slider.min, '90'); assert.equal(f.slider.max, '120'); assert.equal(f.slider.step, '5');
  f.slider.value = '110'; f.slider.emit('input'); f.slider.value = '120'; f.slider.emit('input');
  assert.equal(f.output.textContent, '120%'); assert.equal(f.previews.length, 0); assert.equal(f.run('composition.textScale'), 1);
  assert.equal(f.slider.attributes.get('aria-valuetext'), '선택한 크기의 120퍼센트', 'dragging updates the screen reader value before committing');
  f.slider.emit('change');
  assert.equal(f.run('composition.textScale'), 1.2); assert.equal(f.run('composition.textSize'), 'large'); assert.equal(f.run('composition.font'), 'modern');
  assert.equal(f.previews.length, 1); assert.equal(f.previews[0].options.key, 'textSize');
  assert.equal(f.run('lastChange.field'), 'textScale'); assert.equal(f.run('lastChange.key'), 'textSize');
  assert.equal(f.run('comparisonComposition(composition,lastChange).textScale'), 1);
  assert.equal(f.run('comparisonComposition(composition,lastChange).textSize'), 'large');
  f.run('apply(history.pop(),{remember:false})');
  assert.equal(f.run('composition.textScale'), 1); assert.equal(f.output.textContent, '100%');
  assert.equal(f.slider.attributes.get('aria-valuetext'), '선택한 크기의 100퍼센트');
  assert.equal(f.nodes.find(node => node.id === 'text-scale'), f.slider);
});

test('all permitted text scales survive share links and the existing saved file format', () => {
  for (const textScale of [.9, .95, 1, 1.05, 1.1, 1.15, 1.2]) {
    const composition = normalizeComposition({ ...DEFAULT_COMPOSITION, textScale });
    assert.equal(readComposition(compositionParams(composition)).textScale, textScale);
    const record = { id: 'scale-check', name: '우리의 크기', note: '소희가 고른 큰 글씨', rating: 5, createdAt: 1, updatedAt: 1, composition };
    const parsed = parseImport(JSON.stringify(exportSelection(composition, record)));
    assert.equal(parsed.composition.textScale, textScale); assert.equal(parsed.note, record.note); assert.equal(parsed.rating, 5);
  }
});
