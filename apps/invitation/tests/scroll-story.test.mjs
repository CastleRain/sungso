import test from 'node:test';
import assert from 'node:assert/strict';
import { createScrollStory } from '../js/scroll-story.mjs';

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
    if (this.classList.contains('scroll-scene')) return Math.max(this.naturalHeight, parseFloat(this.closest('main').style.getPropertyValue('--story-screen-height')) || 0);
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
  const pendingFrames = new Map(), observers = []; let nextFrame = 0, resolveFonts;
  const doc = { activeElement: null, createElement: tag => new Element(tag), fonts: { ready: new Promise(resolve => { resolveFonts = resolve; }) } };
  const globals = {
    window: win, document: doc, matchMedia: () => media,
    requestAnimationFrame: callback => { pendingFrames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => pendingFrames.delete(id),
    getComputedStyle: node => ({ top: '0px', display: node.classList.contains('mobile-preview-actions') ? 'none' : 'block', paddingTop: '0px', paddingBottom: '0px' }),
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
    main, article, pages, experience, canvas, win, media, observers, pendingFrames, resolveFonts,
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

test('scene enhancement preserves original content and disposal releases scrolling, sizing and motion hooks', async t => {
  const view = browserHarness(), controller = createScrollStory();
  t.after(() => { controller.dispose(); view.restore(); });
  view.pages[2].inert = true;
  const before = view.pages.map(node => ({ style: node.getAttribute('style'), hidden: node.getAttribute('aria-hidden'), inert: node.inert }));
  let selections = 0; view.experience.addEventListener('click', () => selections++);
  assert.equal(controller.mount(view.main, { enabled: true }), true);
  const nav = view.main.querySelector('.story-controls');
  nav.emit('click', { target: nav.querySelector('[data-story-step="1"]') }); view.flush();
  assert.equal(controller.capture().key, 'greeting');
  assert.equal(view.pages[1].inert, false);
  assert.equal(view.pages[0].inert, true);
  view.experience.emit('click');
  assert.equal(selections, 1);
  view.win.emit('resize'); assert.ok(view.pendingFrames.size > 0);
  controller.dispose();
  assert.equal(controller.active, false);
  assert.equal(controller.capture(), null);
  assert.deepEqual(view.article.children, view.pages);
  assert.equal(view.main.querySelector('.story-controls'), null);
  assert.deepEqual(view.pages.map(node => ({ style: node.getAttribute('style'), hidden: node.getAttribute('aria-hidden'), inert: node.inert })), before);
  assert.ok(view.pages.every(node => !node.classList.contains('scroll-scene')));
  assert.equal(view.win.listenerCount + view.win.visualViewport.listenerCount + view.media.listenerCount + nav.listenerCount, 0);
  assert.ok(view.observers.every(observer => observer.nodes.size === 0));
  assert.equal(view.pendingFrames.size, 0);
  view.resolveFonts(); await Promise.resolve();
  view.win.emit('scroll'); view.win.emit('resize'); view.media.emit('change');
  assert.equal(view.pendingFrames.size, 0);
  assert.equal(view.main.querySelector('.story-controls'), null);
  view.experience.emit('click'); assert.equal(selections, 2);
});

test('changing reduced-motion preference restores readable original flow and can resume the same content', t => {
  const view = browserHarness(), controller = createScrollStory();
  t.after(() => { controller.dispose(); view.restore(); });
  view.media.matches = true;
  assert.equal(controller.mount(view.main, { enabled: true }), false);
  assert.equal(view.main.querySelector('.story-controls'), null);
  view.media.matches = false; view.media.emit('change'); view.flush();
  assert.equal(controller.active, true);
  view.media.matches = true; view.media.emit('change'); view.flush();
  assert.equal(controller.active, false);
  assert.equal(view.main.dataset.scrollStory, 'reduced');
  assert.equal(view.main.querySelector('.story-controls'), null);
  assert.ok(view.pages.every(node => !node.inert && node.style.visibility !== 'hidden' && !node.classList.contains('scroll-scene')));
  assert.equal(view.win.listenerCount + view.win.visualViewport.listenerCount, 0);
  view.media.matches = false; view.media.emit('change'); view.flush();
  assert.equal(controller.active, true);
  assert.equal(view.main.dataset.scrollStory, 'on');
  assert.equal(view.main.querySelectorAll('.story-controls').length, 1);
  assert.deepEqual(view.article.children, view.pages);
  assert.equal(view.pages[1].children[0], view.experience);
  controller.dispose();
  view.media.emit('change');
  assert.equal(view.main.querySelector('.story-controls'), null);
});

test('resizing and expanding a scene preserve the reader’s logical place instead of raw scroll pixels', t => {
  const view = browserHarness(), controller = createScrollStory();
  t.after(() => { controller.dispose(); view.restore(); });
  controller.mount(view.main, { enabled: true });
  const nav = view.main.querySelector('.story-controls');
  nav.emit('click', { target: nav.querySelector('[data-story-step="1"]') }); view.flush();
  view.win.scrollTo({ top: view.win.scrollY + 450 }); view.flush();
  const original = controller.capture(), previousY = view.win.scrollY;
  assert.equal(original.key, 'greeting'); assert.equal(original.pinned, true);
  assert.ok(original.fraction > 0 && original.fraction < 1);
  view.canvas.clientWidth = 300; view.win.innerHeight = 700; view.win.visualViewport.height = 700;
  view.win.emit('resize'); view.flush();
  const resized = controller.capture();
  assert.equal(resized.key, original.key);
  assert.ok(Math.abs(resized.fraction - original.fraction) < 1e-9);
  assert.notEqual(view.win.scrollY, previousY);
  view.pages[1].naturalHeight += 400;
  view.observers.at(-1).fire(); view.flush();
  const expanded = controller.capture();
  assert.equal(expanded.key, original.key);
  assert.ok(Math.abs(expanded.fraction - original.fraction) < 1e-9);
});

test('keyboard focus settles outgoing and incoming page turns before measuring and revealing controls', () => {
  for (const templateId of ['envelope', 'scrapbook']) for (const incoming of [false, true]) {
    const view = browserHarness(), controller = createScrollStory();
    try {
      controller.mount(view.main, { enabled: true, templateId });
      const nav = view.main.querySelector('.story-controls');
      nav.emit('click', { target: nav.querySelector('[data-story-step="1"]') }); view.flush();
      const start = view.win.scrollY;
      const viewport = parseFloat(view.main.style.getPropertyValue('--story-screen-height'));
      const pinTop = parseFloat(view.main.style.getPropertyValue('--story-pin-top'));
      const pan = view.pages[1].offsetHeight - viewport;
      view.win.scrollTo({ top: start + viewport * .32 + pan + viewport * .65 * (incoming ? .75 : .25) }); view.flush();
      const page = view.pages[incoming ? 2 : 1];
      const button = incoming ? new Element('button', '', 44) : view.experience;
      if (incoming) page.append(button);
      const controlTop = page.offsetHeight - 80;
      assert.notEqual(parseFloat(page.style.getPropertyValue('--scene-rotate-y')), 0);
      page.getBoundingClientRect = () => {
        const top = pinTop + parseFloat(page.style.getPropertyValue('--scene-y'));
        return { top, bottom: top + page.offsetHeight, width: page.clientWidth, height: page.offsetHeight };
      };
      button.getBoundingClientRect = () => {
        // A real browser returns transformed rectangles during a page turn.
        // Reading that geometry would give an incorrect control offset.
        assert.ok(Math.abs(parseFloat(page.style.getPropertyValue('--scene-rotate-y'))) < 1e-7, `${templateId}: measure after settling`);
        assert.ok(Math.abs(Number(page.style.getPropertyValue('--scene-scale')) - 1) < 1e-7);
        const top = page.getBoundingClientRect().top + controlTop;
        return { top, bottom: top + 44, height: 44, width: 100 };
      };
      button.focus(); view.article.emit('focusin', { target: button }); view.flush();
      assert.equal(document.activeElement, button);
      assert.equal(controller.capture().key, incoming ? 'gallery' : 'greeting');
      const visible = button.getBoundingClientRect();
      assert.ok(visible.top >= pinTop - 1 && visible.bottom <= pinTop + viewport + 1, templateId);
      if (!incoming) assert.ok(Math.abs(parseFloat(page.style.getPropertyValue('--scene-y')) + pan) < 1e-7, 'outgoing reading offset is preserved');
    } finally { controller.dispose(); view.restore(); }
  }
});
