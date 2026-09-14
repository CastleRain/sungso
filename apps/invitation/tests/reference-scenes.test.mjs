import test from 'node:test';
import assert from 'node:assert/strict';
import { createReferenceScenes } from '../js/reference-scenes.mjs';
import { createReferenceFlow } from '../js/reference-flow.mjs';
import { referenceSceneMotion, collectReferenceScenes } from '../js/reference-scenes-core.mjs';

// This harness supplies geometry and browser events; visual clipping/sticky layout stay in browser QA.
class Events {
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, extra = {}) {
    for (const listener of [...(this.listeners.get(type) || [])]) listener({ type, target: this, ...extra });
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

function inlineStyle() {
  let original = null;
  const values = new Map();
  const style = {
    setProperty(name, value) { values.set(name, String(value)); original = undefined; },
    getPropertyValue(name) { return values.get(name) || ''; },
    getPropertyPriority() { return ''; },
    removeProperty(name) { values.delete(name); original = undefined; },
    reset(value) {
      values.clear(); original = value;
      for (const declaration of (value || '').split(';')) {
        const split = declaration.indexOf(':');
        if (split > 0) values.set(declaration.slice(0, split).trim(), declaration.slice(split + 1).trim());
      }
    },
    get text() { return original !== undefined ? original : [...values].map(([name, value]) => `${name}: ${value};`).join(' ') || null; },
  };
  return new Proxy(style, {
    get(target, key) { return key in target ? target[key] : target.getPropertyValue(key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)); },
    set(target, key, value) { target.setProperty(key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`), value); return true; },
  });
}

const dataKey = key => key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
class Element extends Events {
  constructor(tag = 'div', className = '', height = 0) {
    super(); Object.assign(this, { tagName: tag, className, naturalHeight: height, children: [], parentElement: null, dataset: {}, attributes: new Map(), inert: false, disabled: false, textContent: '', clientWidth: 390, rootConnected: false, style: inlineStyle() });
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: name => { if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim(); },
      remove: name => { this.className = this.className.split(/\s+/).filter(item => item !== name).join(' '); },
    };
  }
  get isConnected() { return this.rootConnected || Boolean(this.parentElement?.isConnected); }
  get offsetHeight() {
    if (this.classList.contains('story-controls')) return 42;
    if (this.classList.contains('ref-scene')) return Math.max(this.naturalHeight, parseFloat(this.closest('main').style.getPropertyValue('--reference-screen-height')) || 0);
    return this.naturalHeight;
  }
  append(...children) { for (const child of children) { child.remove(); this.children.push(child); child.parentElement = this; } }
  insertBefore(child, sibling) { child.remove(); this.children.splice(this.children.indexOf(sibling), 0, child); child.parentElement = this; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  contains(target) { return this === target || this.children.some(child => child.contains(target)); }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.getAttribute('id') === selector.slice(1);
    const [, tag, attribute, value] = selector.match(/^(\w+)?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/) || [];
    return Boolean(tag || attribute) && (!tag || this.tagName === tag) && (!attribute || (this.getAttribute(attribute) !== null && (value === undefined || this.getAttribute(attribute) === value)));
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelectorAll(selector) {
    if (selector.includes(' > ')) {
      const [parent, child] = selector.split(' > ');
      const roots = parent === ':scope' ? [this] : this.querySelectorAll(parent);
      return roots.flatMap(root => root.children.filter(node => node.matches(child)));
    }
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  setAttribute(name, value) {
    if (name === 'style') this.style.reset(value);
    else if (name === 'class') this.className = value;
    else if (name.startsWith('data-')) this.dataset[dataKey(name.slice(5))] = String(value);
    else this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    if (name === 'style') return this.style.text;
    if (name === 'class') return this.className;
    if (name.startsWith('data-')) return this.dataset[dataKey(name.slice(5))] ?? null;
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  removeAttribute(name) {
    if (name === 'style') this.style.reset(null);
    else if (name.startsWith('data-')) delete this.dataset[dataKey(name.slice(5))];
    else this.attributes.delete(name);
  }
  set innerHTML(markup) {
    this.children = [];
    const stack = [this];
    for (const token of markup.matchAll(/<\/?([\w-]+)([^>]*)>/g)) {
      if (token[0].startsWith('</')) { stack.pop(); continue; }
      const child = new Element(token[1]);
      for (const attribute of token[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) child.setAttribute(attribute[1], attribute[2] || '');
      stack.at(-1).append(child); stack.push(child);
    }
  }
  getBoundingClientRect() {
    let top = this.documentTop;
    if (top === undefined) {
      const parent = this.parentElement;
      top = parent ? parent.getBoundingClientRect().top + window.scrollY : 0;
      if (parent?.classList.contains('invitation')) top += parent.children.slice(0, parent.children.indexOf(this)).reduce((height, node) => height + node.naturalHeight, 0);
    }
    return { top: top - window.scrollY, bottom: top - window.scrollY + this.offsetHeight, height: this.offsetHeight, width: this.clientWidth };
  }
  focus() { if (!this.disabled && !this.inert) document.activeElement = this; }
}

function browserHarness() {
  const win = new Events(), media = new Events(), visualViewport = new Events();
  Object.assign(win, { innerHeight: 900, scrollY: 0, visualViewport });
  visualViewport.height = 900; media.matches = false;
  win.scrollTo = ({ top }) => { win.scrollY = top; win.emit('scroll'); };
  const pendingFrames = new Map(), observers = [], intersections = []; let nextFrame = 0, resolveFonts;
  const doc = { activeElement: null, createElement: tag => new Element(tag), fonts: { ready: new Promise(resolve => { resolveFonts = resolve; }) } };
  const globals = {
    window: win, document: doc, matchMedia: () => media,
    requestAnimationFrame: callback => { pendingFrames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => pendingFrames.delete(id),
    getComputedStyle: node => ({ top: '0px', display: node.classList.contains('mobile-preview-actions') ? 'none' : 'block', paddingTop: '0px', paddingBottom: '0px' }),
    IntersectionObserver: class {
      nodes = new Set();
      constructor(callback) { this.callback = callback; intersections.push(this); }
      observe(node) { this.nodes.add(node); }
      unobserve(node) { this.nodes.delete(node); }
      disconnect() { this.nodes.clear(); }
      enter(node) { this.callback([{target:node,isIntersecting:true,intersectionRatio:1}]); }
    },
    ResizeObserver: class {
      nodes = new Set();
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(node) { this.nodes.add(node); }
      disconnect() { this.nodes.clear(); }
      fire() { if (this.nodes.size) this.callback(); }
    },
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const main = new Element('main'); main.rootConnected = true;
  const toolbar = new Element('section', 'preview-device-toolbar', 50);
  const layout = new Element('div', 'preview-layout'); layout.documentTop = 420;
  const stage = new Element('div', 'preview-stage');
  const canvas = new Element(); canvas.setAttribute('id', 'preview-canvas');
  const article = new Element('article', 'invitation');
  const pages = [new Element('div', 'cover', 640), new Element('section', 'greeting-page', 1450), new Element('section', 'gallery-page', 1050)];
  pages[1].dataset.section = 'greeting'; pages[2].dataset.section = 'gallery';
  pages[1].setAttribute('style', '--reader-choice: rose;');
  pages[2].setAttribute('aria-hidden', 'false');
  const experience = new Element('button'); experience.textContent = '선택한 이야기'; pages[1].append(experience);
  const statusbar = new Element('div', 'device-statusbar'), homebar = new Element('div', 'device-homebar');
  article.append(...pages); canvas.append(article); stage.append(statusbar, canvas, homebar); layout.append(stage);
  main.append(toolbar, layout, new Element('div', 'mobile-preview-actions'));
  return {
    main, article, pages, experience, canvas, win, media, observers, intersections, pendingFrames, resolveFonts,
    flush() {
      let rounds = 0;
      while (pendingFrames.size) {
        assert.ok(rounds++ < 20, 'animation scheduling should settle');
        const callbacks = [...pendingFrames.values()]; pendingFrames.clear(); callbacks.forEach(callback => callback());
      }
    },
    restore() { for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } },
  };
}

test('the three clean treatments reverse deterministically and settle without shifting the readable page', () => {
  const ids = ['guest-porto', 'guest-seoul', 'guest-jeju'];
  const frames = ids.map(id => referenceSceneMotion(id, { current: false, transition: .6, progress: .4, panY: 0, height: 640 }));
  assert.equal(new Set(frames.map(frame => JSON.stringify(frame))).size, 3);
  for (const id of ids) for (const t of [0, .15, .5, .9, 1, .9, .5, .15, 0]) {
    const input = { current: true, transition: t, progress: .7, panY: -410, height: 343 };
    assert.deepEqual(referenceSceneMotion(id, input), referenceSceneMotion(id, input));
    assert.ok(Object.values(referenceSceneMotion(id, input)).every(value => !/NaN|Infinity/.test(value)));
  }
  for (const id of ids) {
    const current = referenceSceneMotion(id, { current: true, transition: 0, progress: .7, panY: -410, height: 343 });
    assert.equal(current['--ref-scene-y'], '-410px');
    assert.equal(current['--ref-scene-scale'], '1');
    assert.equal(current['--ref-scene-opacity'], '1');
    const incoming = referenceSceneMotion(id, { current: false, transition: 1, progress: 0, panY: 0, height: 343 });
    assert.equal(incoming['--ref-scene-y'], '0px');
    assert.equal(incoming['--ref-scene-scale'], '1');
    assert.equal(incoming['--ref-scene-opacity'], '1');
    assert.ok(Object.values(referenceSceneMotion(id, { current: true, transition: NaN, progress: Infinity, panY: NaN, height: 0 })).every(value => !/NaN|Infinity/.test(value)));
  }
});

test('paused transitions keep the entire stage covered, including the halfway frame', () => {
  const viewport = 574, outgoingHeight = 1250, panY = viewport - outgoingHeight;
  for (const transition of [0, .1, .25, .49, .5, .51, .75, .9, 1]) {
    for (const id of ['guest-porto', 'guest-seoul']) {
      const outgoing = referenceSceneMotion(id, { current: true, transition, progress: 1, panY, height: viewport });
      assert.equal(outgoing['--ref-scene-opacity'], '1', `${id} keeps its background at ${transition}`);
      assert.equal(outgoing['--ref-scene-scale'], '1');
      assert.equal(parseFloat(outgoing['--ref-scene-y']) + outgoingHeight, viewport);
      const incoming = referenceSceneMotion(id, { current: false, transition, progress: 0, panY: 0, height: viewport });
      assert.ok(Number(incoming['--ref-scene-opacity']) >= 0);
      assert.ok(Number(incoming['--ref-scene-opacity']) <= 1);
    }
    const outgoing = referenceSceneMotion('guest-jeju', { current: true, transition, progress: 1, panY, height: viewport });
    const incoming = referenceSceneMotion('guest-jeju', { current: false, transition, progress: 0, panY: 0, height: viewport });
    assert.equal(outgoing['--ref-scene-opacity'], '1');
    assert.equal(incoming['--ref-scene-opacity'], '1');
    assert.ok(Math.abs(parseFloat(outgoing['--ref-scene-y']) + outgoingHeight - parseFloat(incoming['--ref-scene-y'])) < 1e-6, 'opaque page edges meet');
    assert.ok(parseFloat(outgoing['--ref-scene-y']) <= 0);
    assert.ok(parseFloat(incoming['--ref-scene-y']) + viewport >= viewport);
  }
});

test('calendar and closing groups split into independent scenes without replacing their content or nested controls', () => {
  const article = new Element('article'), cover = new Element('section', 'cover');
  const date = new Element('section', 'rg-date'), poster = new Element(), calendar = new Element();
  const ending = new Element('footer', 'rg-ending'), photo = new Element(), copy = new Element();
  const profile = new Element('section'); profile.dataset.referenceSceneGroup = '';
  const editor = new Element('form'), introduction = new Element('section');
  date.append(poster, calendar); ending.append(photo, copy); profile.append(editor, introduction); article.append(cover, date, profile, ending);
  const result = collectReferenceScenes(article);
  assert.deepEqual(result.nodes, [cover, poster, calendar, editor, introduction, photo, copy]);
  assert.deepEqual(result.groups, [date, profile, ending]);
  assert.equal(calendar.parentElement, date); assert.equal(editor.parentElement, profile);
  assert.deepEqual(article.children, [cover, date, profile, ending]);
});

test('a tall scene exposes its last content before changing and reversing returns to the same reading position', t => {
  const view = browserHarness(), controller = createReferenceScenes();
  t.after(() => { controller.dispose(); view.restore(); });
  assert.equal(controller.mount(view.main, { templateId: 'guest-seoul' }), true);
  const controls = view.main.querySelector('.ref-scene-controls');
  controls.emit('click', { target: controls.querySelector('[data-reference-step="1"]') });
  const start = view.win.scrollY, viewport = numberStyle(view.main, '--reference-screen-height');
  const pan = view.pages[1].offsetHeight - viewport;
  view.win.scrollTo({ top: start + viewport * .32 + pan }); view.flush();
  assert.equal(controller.capture().key, 'guest-seoul-greeting');
  assert.equal(controller.capture().readOffset, pan);
  assert.equal(view.pages[1].style.getPropertyValue('--ref-scene-opacity'), '1');
  assert.equal(view.pages[2].style.visibility, 'hidden');
  const original = controller.capture();
  view.win.scrollTo({ top: view.win.scrollY + viewport * .65 * .7 }); view.flush();
  assert.equal(view.pages[2].inert, false);
  view.win.scrollTo({ top: original.y }); view.flush();
  assert.deepEqual(controller.capture(), original);
  assert.equal(view.pages[1].inert, false);
});

function numberStyle(node, property) { return Number.parseFloat(node.style.getPropertyValue(property)); }

test('resize, profile expansion and palette remount retain the same page and read pixels', t => {
  const view = browserHarness(), controller = createReferenceScenes();
  t.after(() => { controller.dispose(); view.restore(); });
  controller.mount(view.main, { templateId: 'salon-polaroid' });
  const controls = view.main.querySelector('.ref-scene-controls');
  controls.emit('click', { target: controls.querySelector('[data-reference-step="1"]') });
  view.win.scrollTo({ top: view.win.scrollY + numberStyle(view.main, '--reference-screen-height') * .32 + 450 }); view.flush();
  const before = controller.capture();
  assert.ok(Math.abs(before.readOffset - 450) < 1e-6);
  view.pages[1].naturalHeight += 700;
  view.observers.at(-1).fire(); view.flush();
  assert.ok(Math.abs(controller.capture().readOffset - 450) < 1e-6);
  view.canvas.clientWidth = 300; view.win.innerHeight = 640; view.win.visualViewport.height = 640;
  view.win.emit('resize'); view.flush();
  assert.ok(Math.abs(controller.capture().readOffset - 450) < 1e-6);
  const restore = controller.capture();
  controller.mount(view.main, { templateId: 'salon-polaroid', restore }); view.flush();
  assert.equal(controller.capture().key, before.key);
  assert.ok(Math.abs(controller.capture().readOffset - 450) < 1e-6);
  assert.equal(view.article.children[1].children[0], view.experience);
});

test('keyboard focus settles a transition and pans a low control fully into its scene', t => {
  const view = browserHarness(), controller = createReferenceScenes();
  t.after(() => { controller.dispose(); view.restore(); });
  controller.mount(view.main, { templateId: 'guest-porto' });
  const controls = view.main.querySelector('.ref-scene-controls');
  controls.emit('click', { target: controls.querySelector('[data-reference-step="1"]') });
  const start = view.win.scrollY, viewport = numberStyle(view.main, '--reference-screen-height'), pan = view.pages[1].offsetHeight - viewport;
  view.win.scrollTo({ top: start + viewport * .32 + pan + viewport * .65 * .25 }); view.flush();
  const page = view.pages[1], top = page.offsetHeight - 60;
  page.getBoundingClientRect = () => ({ top: -controller.capture().readOffset, bottom: page.offsetHeight - controller.capture().readOffset });
  view.experience.getBoundingClientRect = () => ({ top: page.getBoundingClientRect().top + top, bottom: page.getBoundingClientRect().top + top + 44 });
  view.article.emit('focusin', { target: view.experience });
  assert.equal(controller.capture().phase, 'read');
  assert.equal(controller.capture().key, 'guest-porto-greeting');
  assert.ok(top >= controller.capture().readOffset);
  assert.ok(top + 44 <= controller.capture().readOffset + viewport);
  assert.equal(page.style.getPropertyValue('--ref-scene-scale'), '1');
});

test('reference flow draws its intro once, then keeps the completed cover while pages reverse and motion toggles', t => {
  const view = browserHarness(), flow = createReferenceFlow();
  t.after(() => { flow.dispose(); view.restore(); });
  view.pages.forEach((page, index) => { page.dataset.referenceReveal = ''; page.dataset.referenceKey = `guest-jeju-${['cover','greeting','gallery'][index]}`; });
  view.pages[0].dataset.referenceIntro = '';
  const trigger = new Element('span'); trigger.dataset.referenceIntroTrigger = ''; view.pages[0].append(trigger);
  assert.equal(flow.mount(view.main, { templateId: 'guest-jeju' }), true); view.flush();
  assert.equal(view.main.dataset.referenceScenes, 'on');
  view.intersections.find(observer => observer.nodes.has(trigger)).enter(trigger);
  assert.equal(view.pages[0].classList.contains('ref-intro-play'), true);
  assert.equal(view.win.scrollY, 0, 'starting or completing an intro never scrolls the document automatically');
  const controls = view.main.querySelector('.ref-scene-controls');
  controls.emit('click', { target: controls.querySelector('[data-reference-step="1"]') }); view.flush();
  assert.equal(view.pages[0].classList.contains('ref-intro-seen'), true);
  controls.emit('click', { target: controls.querySelector('[data-reference-step="-1"]') }); view.flush();
  assert.equal(view.pages[0].classList.contains('ref-intro-seen'), true);
  view.media.matches = true; view.media.emit('change'); view.flush();
  assert.equal(view.main.dataset.referenceScenes, undefined);
  assert.equal(view.main.dataset.referenceMotion, 'reduced');
  assert.ok(view.pages.every(page => !page.inert && page.style.visibility !== 'hidden'));
  view.media.matches = false; view.media.emit('change'); view.flush();
  assert.equal(view.main.dataset.referenceScenes, 'on');
  assert.equal(view.pages[0].classList.contains('ref-intro-seen'), true);
});

test('a route mounting at the prior catalog scroll does not consume an unseen intro or restore that old position', async t => {
  const view = browserHarness(), controller = createReferenceScenes();
  t.after(() => { controller.dispose(); view.restore(); });
  const states = [];
  view.win.scrollY = 1600;
  controller.mount(view.main, { templateId: 'guest-porto', onFrame: frame => states.push(frame) });
  assert.equal(states.length, 0);
  view.resolveFonts(); await Promise.resolve();
  view.win.scrollTo({ top: 0 }); view.flush();
  assert.equal(view.win.scrollY, 0);
  assert.ok(states.every(frame => !frame.coverPassed));
});

test('disposing a scene view restores original DOM and releases stale observers, events and pending frames', async t => {
  const view = browserHarness(), controller = createReferenceScenes();
  t.after(() => { controller.dispose(); view.restore(); });
  const originals = view.pages.map(node => ({ style: node.getAttribute('style'), hidden: node.getAttribute('aria-hidden'), inert: node.inert }));
  controller.mount(view.main, { templateId: 'guest-jeju' });
  const oldObserver = view.observers.at(-1);
  view.win.emit('resize');
  controller.dispose();
  assert.equal(controller.active, false); assert.equal(controller.capture(), null);
  assert.deepEqual(view.pages.map(node => ({ style: node.getAttribute('style'), hidden: node.getAttribute('aria-hidden'), inert: node.inert })), originals);
  assert.equal(view.main.querySelector('.ref-scene-controls'), null);
  assert.equal(view.main.querySelector('.ref-scene-guide'), null);
  assert.equal(view.pendingFrames.size, 0);
  assert.equal(view.win.listenerCount + view.win.visualViewport.listenerCount + view.article.listenerCount, 0);
  assert.ok(view.observers.every(observer => observer.nodes.size === 0));
  controller.mount(view.main, { templateId: 'guest-porto' });
  oldObserver.callback();
  assert.equal(view.pendingFrames.size, 0, 'retired resize delivery cannot schedule work for a newer view');
  controller.dispose(); view.resolveFonts(); await Promise.resolve();
  assert.equal(view.pendingFrames.size, 0);
});
