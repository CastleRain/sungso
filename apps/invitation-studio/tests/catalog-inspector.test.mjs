import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CHOICE_KEYS, DEFAULT_COMPOSITION, OPTIONAL_SECTIONS, normalizeComposition } from '../js/composition.mjs';
import { sceneEditorTarget, choiceSection } from '../catalog/inspector-model.mjs';

const source = readFileSync(new URL('../catalog/catalog.mjs', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
function between(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Shipped entry point exists: ${start}`);
  return source.slice(from, to);
}
class Element {
  constructor() { this.dataset = {}; this.attributes = new Map(); this.scrollTop = 290; this.textContent = ''; this.focusCalls = []; this.classList = { add() {} }; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key); }
  focus(options) { this.focusCalls.push(options); }
}
function fixture(initial = {}) {
  const child = {}, origin = 'https://sungso-wedding.vercel.app', nodes = new Map(), posts = [], requests = [], callbacks = new Map();
  const tabs = ['style', 'scenes', 'content', 'library'].map(tab => { const node = new Element(); node.dataset.tab = tab; node.setAttribute('aria-controls', `panel-${tab}`); return node; });
  const filters = ['all', 'type', 'photo', 'motion'].map(styleGroup => { const node = new Element(); node.dataset.styleGroup = styleGroup; return node; });
  const $ = selector => { if (!nodes.has(selector)) nodes.set(selector, new Element()); return nodes.get(selector); };
  const context = vm.createContext({
    sceneEditorTarget, choiceSection,
    visibleChoice: (key, composition) => { const optional = OPTIONAL_SECTIONS.find(item => item.key === key); return !optional || composition.extras.includes(optional.id); },
    location: { origin, href: `${origin}/lab/studio/?palette=mist` }, frame: { contentWindow: child },
    window: { addEventListener(type, callback) { callbacks.set(type, callback); }, history: { replaceState() { assert.fail('selection must not write URL/history'); } } },
    document: { body: { dataset: { panel: 'collapsed' } }, querySelectorAll(selector) { if (selector === '[data-style-group]') return filters; if (selector === '.editor-tabs [data-tab]') return tabs; assert.fail(`Unexpected DOM query ${selector}`); }, getElementById(id) { return $(`#${id}`); } },
    $, post: message => posts.push(message), renderInspector() {}, syncChoiceVisibility() {}, syncExpanded() {}, renderDemoTools() {},
    requestPreview: (value, options) => requests.push({ value, options }), renderAudioState() {},
    apply() { assert.fail('selection must not change the composition'); }, updateURL() { assert.fail('selection must not rewrite URL'); },
  });
  vm.runInContext(`const keys=${JSON.stringify(CHOICE_KEYS)}, globalKeys=['palette','font','textSize','lineSpace','photoTone','motion','spacing','divider'],labels={date:'예식 날짜'};
    let composition=${JSON.stringify(normalizeComposition({ ...DEFAULT_COMPOSITION, ...initial }))}, history=[],ready=true,pickerEnabled=true,focusedEditor=false,inspectorSection=null,inspectorMode='design',styleGroup='photo';
    let editorTab='library',openKey=null,activeReviewKey=null,beforeVisible=false,activeRequest=null,demoPhase='idle',motionReady=true,audioEnabled=false,contentEditor=null,guidedSteps=null;
    const tabScroll=new Map();
    ${between('function stopDemo()', '\nfunction apply(')}
    ${between('function setEditorTab(', '\nfunction openInspectorContent(')}
    ${between("window.addEventListener('message', event => {", "\nwindow.addEventListener('popstate'")}`, context);
  return { posts, requests, nodes, filters, tabs, child, origin, context, run: code => vm.runInContext(code, context),
    send(data, overrides = {}) { callbacks.get('message')({ data, origin, source: child, ...overrides }); },
  };
}

test('preview selection opens the corresponding inspector without applying, jumping, focusing or rewriting the composition', () => {
  const f = fixture(), before = f.run('JSON.stringify(composition)');
  f.send({ type: 'invitation-studio:select', section: 'wedding-day', composition: { palette: 'rose' }, mode: 'production', url: '/manage.html' });
  assert.equal(f.run('editorTab'), 'scenes'); assert.equal(f.run('openKey'), 'date'); assert.equal(f.run('inspectorSection'), 'wedding-day'); assert.equal(f.run('focusedEditor'), true);
  assert.equal(f.run('styleGroup'), 'all'); assert.equal(f.filters[0].attributes.get('aria-pressed'), 'true');
  assert.equal(f.nodes.get('#editor-content').scrollTop, 0);
  assert.equal(f.context.document.body.dataset.panel, 'expanded');
  assert.equal(f.requests.length, 0, 'picking a visible scene must not replay or move it');
  assert.equal(f.posts.every(message => message.type === 'invitation-studio:picker'), true);
  assert.equal(f.run('JSON.stringify(composition)'), before); assert.equal(f.run('history.length'), 0);
  assert.equal([...f.nodes.values()].every(node => node.focusCalls.length === 0), true, 'preview click preserves user focus');
});

test('parent select message rejects other origins, other windows, unknown and inactive scene IDs', () => {
  const f = fixture();
  f.send({ type: 'invitation-studio:select', section: 'wedding-day' }, { origin: 'https://attacker.example' });
  f.send({ type: 'invitation-studio:select', section: 'wedding-day' }, { source: {} });
  for (const section of ['__proto__', 'constructor', '#wedding-day', '/manage.html', 'guest-guide', {}, null]) f.send({ type: 'invitation-studio:select', section });
  for (const data of [null, '', false]) f.send(data);
  assert.equal(f.run('openKey'), null); assert.equal(f.posts.length, 0); assert.equal(f.requests.length, 0);
});

test('selection respects picker opt-out and active optional scene mapping', () => {
  const f = fixture({ extras: ['guest-guide'] });
  f.run('pickerEnabled=false'); f.send({ type: 'invitation-studio:select', section: 'guest-guide' });
  assert.equal(f.run('openKey'), null);
  f.run('pickerEnabled=true'); f.send({ type: 'invitation-studio:select', section: 'guest-guide' });
  assert.equal(f.run('openKey'), 'guestGuide'); assert.equal(f.run('inspectorSection'), 'guest-guide');
  assert.equal(f.requests.length, 0);
});

test('direct editor opening uses the same inspector but explicitly requests a preview and keyboard focus', () => {
  const f = fixture();
  f.run("openEditorChoice('font',{focus:true})");
  assert.equal(f.run('editorTab'), 'style'); assert.equal(f.run('openKey'), 'font'); assert.equal(f.run('inspectorSection'), null);
  assert.deepEqual(JSON.parse(JSON.stringify(f.requests.map(request => request.options))), [{ key: 'font' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(f.nodes.get('#inspector-title').focusCalls)), [{ preventScroll: true }]);
});

test('switching inspector detail tabs preserves a pending scene arrival; choosing the preview still cancels it', () => {
  const f = fixture();
  f.run("activeRequest={requestId:12,key:'date',section:'wedding-day'};demoPhase='preparing';openEditorChoice('date',{fromPreview:true,mode:'fine',keepDemo:true})");
  assert.equal(f.run('activeRequest.key'), 'date'); assert.equal(f.run('demoPhase'), 'preparing');
  assert.equal(f.posts.some(message => message.type === 'invitation-studio:demo-stop'), false);
  f.send({ type:'invitation-studio:select', section:'wedding-day' });
  assert.equal(f.run('activeRequest.key'), null);
  assert.equal(f.posts.some(message => message.type === 'invitation-studio:demo-stop'), true);
});

function visibilityFixture({ key, section, composition = {} }) {
  const rows = new Map(['album', 'albumColumns', 'albumRatio', 'guestGuide', 'date', 'intro'].map(key => {
    const heading = new Element(), options = new Element(), row = new Element();
    row.hidden = true; row.classList.toggle = () => {};
    row.querySelector = selector => selector === '.choice-open' ? heading : options;
    return [key, row];
  }));
  const context = vm.createContext({
    choiceRows: rows, sceneEditorTarget,
    visibleChoice: (key, composition) => { const optional = OPTIONAL_SECTIONS.find(item => item.key === key); return !optional || composition.extras.includes(optional.id); },
    renderInspector() {},
  });
  vm.runInContext(`let composition=${JSON.stringify(normalizeComposition(composition))},focusedEditor=true,editorTab='scenes',inspectorMode='design',openKey=${JSON.stringify(key)},inspectorSection=${JSON.stringify(section)},activeReviewKey=${JSON.stringify(key)},guidedSteps=null;
    const globalKeys=[],styleGroups={all:[]},styleGroup='all',detailParents={albumColumns:'album',albumRatio:'album'};
    ${between('function normalizeActiveEditor()', '\nfunction renderOptions(')}`, context);
  return { rows, run: code => vm.runInContext(code, context) };
}

test('undoing an album layout while its detail is open falls back to the visible album editor', () => {
  for (const key of ['albumColumns', 'albumRatio']) {
    const f = visibilityFixture({ key, section: 'gallery', composition: { album: 'masonry' } });
    f.run('syncExpanded()'); assert.equal(f.rows.get(key).hidden, false);
    f.run("composition.album='stack';syncExpanded()");
    assert.equal(f.run('openKey'), 'album'); assert.equal(f.run('inspectorSection'), 'gallery'); assert.equal(f.run('focusedEditor'), true);
    assert.equal(f.rows.get('album').hidden, false); assert.equal(f.rows.get('album').querySelector('.inline-options').hidden, false);
    assert.equal(f.rows.get(key).hidden, true); assert.equal(f.run('activeReviewKey'), 'album');
  }
});

test('removing the actively edited optional scene restores the normal scene list immediately', () => {
  const f = visibilityFixture({ key: 'guestGuide', section: 'guest-guide', composition: { extras: ['guest-guide'] } });
  f.run('syncExpanded()'); assert.equal(f.rows.get('guestGuide').hidden, false); assert.equal(f.rows.get('date').hidden, true);
  f.run('composition.extras=[];syncExpanded()');
  assert.equal(f.run('focusedEditor'), false); assert.equal(f.run('openKey'), null); assert.equal(f.run('inspectorSection'), null);
  assert.equal(f.rows.get('guestGuide').hidden, true); assert.equal(f.rows.get('date').hidden, false); assert.equal(f.rows.get('intro').hidden, false);
});

test('composition changes cannot replace an active content form because of a stale design key', () => {
  const f = visibilityFixture({ key: 'guestGuide', section: 'gallery' });
  f.run("editorTab='content';inspectorMode='content';syncExpanded()");
  assert.equal(f.run('focusedEditor'), true); assert.equal(f.run('inspectorSection'), 'gallery'); assert.equal(f.run('inspectorMode'), 'content');
});
