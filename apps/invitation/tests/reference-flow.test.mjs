import test from 'node:test';
import assert from 'node:assert/strict';
import { createReferenceFlow } from '../js/reference-flow.mjs';

class Events {
  listeners = new Map();
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, extra = {}) { [...(this.listeners.get(type) || [])].forEach(fn => fn({ target: this, ...extra })); }
  get count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

class Element extends Events {
  constructor(key, top = 0, height = 800) {
    super();
    this.dataset = key ? { referenceReveal: '', referenceKey: key } : {};
    this.classes = new Set(key ? ['ref-reveal'] : []);
    this.classList = { contains: name => this.classes.has(name), add: name => this.classes.add(name), remove: name => this.classes.delete(name) };
    this.children = []; this.parentElement = null; this.documentTop = top; this.height = height;
    this.rootConnected = false; this.disabled = false; this.textContent = ''; this.scrollLeft = 0; this.offsetLeft = 0;
    const values = new Map();
    this.style = {
      getPropertyValue: name => values.get(name)?.value || '',
      getPropertyPriority: name => values.get(name)?.priority || '',
      setProperty: (name, value, priority = '') => values.set(name, { value, priority }),
      removeProperty: name => values.delete(name),
    };
  }
  get isConnected() { return this.rootConnected || Boolean(this.parentElement?.isConnected); }
  append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  matches(selector) {
    const attribute = selector.match(/^\[data-([a-z-]+)\]$/)?.[1];
    if (attribute) return Object.hasOwn(this.dataset, attribute.replace(/-([a-z])/g, (_, char) => char.toUpperCase()));
    return selector.startsWith('.') && this.classList.contains(selector.slice(1));
  }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) {
    if (selector === '#preview-canvas > .invitation') return this.article || null;
    return this.querySelectorAll(selector)[0] || null;
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  getBoundingClientRect() { return { top: this.documentTop - window.scrollY, bottom: this.documentTop + this.height - window.scrollY, height: this.height }; }
  scrollTo(options) { this.lastScroll = options; this.scrollLeft = options.left; this.emit('scroll'); }
}

function fixture() {
  const win = new Events(), media = new Events();
  Object.assign(win, { innerHeight: 844, scrollY: 0, visualViewport: new Events() });
  win.scrollTo = options => { win.scrollY = options.top; };
  media.matches = false;
  const frames = new Map(), observers = []; let serial = 0;
  const globals = {
    window: win, matchMedia: () => media,
    requestAnimationFrame: callback => { frames.set(++serial, callback); return serial; },
    cancelAnimationFrame: id => frames.delete(id),
    IntersectionObserver: class {
      targets = new Set();
      constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
      observe(node) { this.targets.add(node); }
      unobserve(node) { this.targets.delete(node); }
      disconnect() { this.targets.clear(); }
      enter(...nodes) { this.callback(nodes.map(target => ({ target, isIntersecting: true, intersectionRatio: 1 }))); }
      leave(...nodes) { this.callback(nodes.map(target => ({ target, isIntersecting: false }))); }
    },
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.entries(globals).forEach(([key, value]) => Object.defineProperty(globalThis, key, { value, writable: true, configurable: true }));
  function makeView(keys = ['cover', 'greeting', 'story']) {
    const main = new Element(), article = new Element(null, 100, 5000);
    main.rootConnected = true; main.article = article; main.append(article);
    const nodes = keys.map((key, index) => new Element(key, 100 + index * 1000, 1000));
    article.append(...nodes);
    const button = new Element(); nodes[1]?.append(button);
    return { main, article, nodes, button };
  }
  return {
    ...makeView(), win, media, frames, observers, makeView,
    flush() {
      let rounds = 0;
      while (frames.size) {
        assert.ok(rounds++ < 5, 'flow work should settle without an animation loop');
        const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback());
      }
    },
    restore() { previous.forEach((descriptor, key) => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }); },
  };
}

const visible = node => node.classList.contains('ref-visible');
const complete = node => node.classList.contains('ref-seen');

test('each section appears once; leaving and returning or repainting a palette does not restart it', t => {
  const view = fixture(), flow = createReferenceFlow();
  t.after(() => { flow.dispose(); view.restore(); });
  assert.equal(flow.mount(view.main, { templateId: 'salon-lettering' }), true);
  assert.equal(flow.active, true);
  assert.equal(view.main.dataset.scrollStory, 'flow');
  assert.ok(view.nodes.every(node => !visible(node)));
  const observer = view.observers.at(-1);
  observer.enter(view.nodes[0]);
  assert.equal(visible(view.nodes[0]), true);
  assert.equal(complete(view.nodes[0]), false, 'the first entrance may animate');
  assert.equal(observer.targets.has(view.nodes[0]), false);
  observer.leave(view.nodes[0]); observer.enter(view.nodes[0]);
  assert.equal(visible(view.nodes[0]), true);
  const repaint = view.makeView();
  flow.mount(repaint.main, { templateId: 'salon-lettering' });
  assert.equal(complete(repaint.nodes[0]), true, 'recreated artwork uses its final state');
  assert.equal(visible(repaint.nodes[1]), false);
  assert.equal(view.observers.at(-1).targets.size, 2);
});

test('appearance memory belongs to a template and survives optional section removal and restoration', t => {
  const view = fixture(), flow = createReferenceFlow();
  t.after(() => { flow.dispose(); view.restore(); });
  flow.mount(view.main, { templateId: 'guest-porto' });
  view.observers.at(-1).enter(view.nodes[2]);
  const shortened = view.makeView(['cover', 'greeting']);
  flow.mount(shortened.main, { templateId: 'guest-porto' });
  const restored = view.makeView();
  flow.mount(restored.main, { templateId: 'guest-porto' });
  assert.equal(complete(restored.nodes[2]), true);
  flow.mount(restored.main, { templateId: 'guest-jeju' });
  assert.equal(visible(restored.nodes[2]), false, 'another design still has its own first appearance');
});

test('an intro waits for its actual lettering and survives repaint before its first visible moment', t => {
  const view = fixture(), flow = createReferenceFlow();
  t.after(() => { flow.dispose(); view.restore(); });
  function addIntro(target) {
    const root = target.nodes[0], trigger = new Element();
    root.dataset.referenceIntro = ''; trigger.dataset.referenceIntroTrigger = '';
    root.append(trigger); return { root, trigger };
  }
  const first = addIntro(view);
  flow.mount(view.main, { templateId: 'salon-lettering' });
  view.observers.find(item => item.targets.has(first.root)).enter(first.root);
  const firstObserver = view.observers.find(item => item.targets.has(first.trigger));
  firstObserver.callback([{ target: first.trigger, isIntersecting: true, intersectionRatio: .25 }]);
  assert.equal(visible(first.root), true);
  assert.equal(first.root.classList.contains('ref-intro-play'), false, 'seeing the photograph top must not consume lettering below');
  const repaint = view.makeView(), second = addIntro(repaint);
  flow.mount(repaint.main, { templateId: 'salon-lettering' });
  assert.equal(complete(second.root), true);
  assert.equal(second.root.classList.contains('ref-intro-seen'), false, 'the seen cover and unseen lettering keep separate memory');
  firstObserver.enter(second.trigger);
  assert.equal(second.root.classList.contains('ref-intro-play'), false, 'retired intro observers cannot start a new page');
  view.observers.find(item => item.targets.has(second.trigger)).enter(second.trigger);
  assert.equal(second.root.classList.contains('ref-intro-play'), true);
  const next = view.makeView(), third = addIntro(next);
  flow.mount(next.main, { templateId: 'salon-lettering' });
  assert.equal(third.root.classList.contains('ref-intro-seen'), true, 'once started, a repaint shows the final state');
  assert.equal(third.root.classList.contains('ref-intro-play'), false);
  flow.dispose();
  assert.equal(third.root.classList.contains('ref-intro-seen'), false);
  assert.ok(view.observers.every(item => item.targets.size === 0));
});

test('off, reduced motion and missing observer show the whole document and do not replay when enabled', t => {
  const view = fixture(), flow = createReferenceFlow();
  t.after(() => { flow.dispose(); view.restore(); });
  flow.mount(view.main, { templateId: 'salon-editorial', enabled: false });
  assert.equal(flow.active, true);
  assert.equal(view.main.dataset.referenceMotion, 'off');
  assert.ok(view.nodes.every(complete));
  flow.mount(view.main, { templateId: 'salon-editorial', enabled: true });
  assert.ok(view.nodes.every(complete));
  view.win.scrollY = 1200;
  view.media.matches = true; view.media.emit('change'); view.flush();
  assert.equal(view.main.dataset.referenceMotion, 'reduced');
  assert.equal(view.win.scrollY, 1200);
  assert.ok(view.nodes.every(complete));
  view.media.matches = false; view.media.emit('change'); view.flush();
  assert.equal(view.main.dataset.referenceMotion, 'on');
  assert.ok(view.nodes.every(complete));
  globalThis.IntersectionObserver = undefined;
  const other = view.makeView();
  flow.mount(other.main, { templateId: 'guest-seoul' });
  assert.equal(other.main.dataset.referenceMotion, 'off');
  assert.ok(other.nodes.every(complete));
});

test('keyboard focus immediately reveals its section without changing controls, content or accessibility attributes', t => {
  const view = fixture(), flow = createReferenceFlow();
  t.after(() => { flow.dispose(); view.restore(); });
  view.nodes[1].inert = false; view.nodes[1].ariaHidden = 'false';
  let clicks = 0; view.button.addEventListener('click', () => clicks++);
  const children = [...view.article.children];
  flow.mount(view.main, { templateId: 'salon-polaroid' });
  view.article.emit('focusin', { target: view.button });
  assert.equal(complete(view.nodes[1]), true);
  assert.equal(view.nodes[1].inert, false); assert.equal(view.nodes[1].ariaHidden, 'false');
  assert.deepEqual(view.article.children, children);
  view.button.emit('click'); assert.equal(clicks, 1);
  assert.equal(view.win.scrollY, 0, 'native focus remains responsible for document scrolling');
});

test('capture and restore retain a section offset after earlier content or viewport height changes', t => {
  const view = fixture(), flow = createReferenceFlow();
  t.after(() => { flow.dispose(); view.restore(); });
  flow.mount(view.main, { templateId: 'guest-jeju' }); view.flush();
  view.win.scrollY = 1280;
  const position = flow.capture();
  assert.equal(position.key, 'greeting'); assert.equal(position.offset, -180);
  const repaint = view.makeView(); repaint.nodes.forEach(node => { node.documentTop += 300; });
  flow.mount(repaint.main, { templateId: 'guest-jeju', restore: position });
  flow.refresh(); view.flush();
  assert.equal(view.win.scrollY, 1580);
  assert.equal(flow.capture().offset, -180);
  view.win.innerHeight = 500; view.win.emit('resize'); view.flush();
  assert.equal(repaint.main.style.getPropertyValue('--reference-cover-height'), '600px');
  assert.equal(view.win.scrollY, 1580);
  view.win.innerHeight = 1200; flow.refresh(); view.flush();
  assert.equal(repaint.main.style.getPropertyValue('--reference-cover-height'), '900px');
  assert.equal(flow.capture().key, 'greeting');
  const withoutGreeting = view.makeView(['cover', 'story']);
  flow.mount(withoutGreeting.main, { templateId: 'guest-jeju', restore: position }); view.flush();
  assert.equal(view.win.scrollY, 1100, 'a removed section falls forward to a readable section start');
});

test('dispose restores owned presentation and cancels events, frames and stale intersection callbacks', t => {
  const view = fixture(), flow = createReferenceFlow();
  t.after(() => { flow.dispose(); view.restore(); });
  view.main.dataset.referenceMotion = 'prior'; view.main.dataset.scrollStory = 'prior';
  view.main.style.setProperty('--reference-cover-height', '710px', 'important');
  view.nodes[1].classList.add('ref-visible');
  const before = view.nodes.map(node => [...node.classes]);
  flow.mount(view.main, { templateId: 'salon-lettering' });
  const observer = view.observers.at(-1);
  view.win.emit('resize'); assert.ok(view.frames.size > 0);
  flow.dispose();
  assert.equal(flow.active, false); assert.equal(flow.capture(), null);
  assert.equal(view.main.dataset.referenceMotion, 'prior'); assert.equal(view.main.dataset.scrollStory, 'prior');
  assert.equal(view.main.style.getPropertyValue('--reference-cover-height'), '710px');
  assert.equal(view.main.style.getPropertyPriority('--reference-cover-height'), 'important');
  assert.deepEqual(view.nodes.map(node => [...node.classes]), before);
  assert.equal(view.frames.size, 0); assert.equal(observer.targets.size, 0);
  assert.equal(view.win.count + view.win.visualViewport.count + view.article.count + view.media.count, 0);
  const next = view.makeView(); flow.mount(next.main, { templateId: 'guest-porto' });
  observer.enter(next.nodes[0]);
  assert.equal(visible(next.nodes[0]), false, 'a late observer cannot paint a newer mount');
});

function addGallery(view, id = 'photos') {
  const root = new Element(), row = new Element(), previous = new Element(), next = new Element(), count = new Element();
  root.dataset.referenceGalleryRoot = id; row.dataset.referenceGallery = '';
  previous.dataset.referenceGalleryStep = '-1'; next.dataset.referenceGalleryStep = '1'; count.dataset.referenceGalleryCount = '';
  count.textContent = '1 / 3';
  const photos = Array.from({ length: 3 }, (_, index) => { const node = new Element(); node.offsetLeft = 24 + index * 300; node.dataset.action = 'photo'; return node; });
  row.append(...photos); root.append(row, previous, count, next); view.article.append(root);
  return { root, row, previous, next, count, photos };
}

test('gallery arrows and native horizontal scrolling update the count while photograph actions remain intact', t => {
  const view = fixture(), flow = createReferenceFlow(), gallery = addGallery(view);
  t.after(() => { flow.dispose(); view.restore(); });
  flow.mount(view.main, { templateId: 'guest-porto' }); view.flush();
  assert.equal(gallery.previous.disabled, true); assert.equal(gallery.next.disabled, false);
  gallery.root.emit('click', { target: gallery.next });
  assert.equal(gallery.row.scrollLeft, 300); assert.equal(gallery.row.lastScroll.behavior, 'smooth');
  assert.equal(gallery.count.textContent, '2 / 3');
  gallery.row.scrollLeft = 590; gallery.row.emit('scroll');
  assert.equal(gallery.count.textContent, '3 / 3'); assert.equal(gallery.next.disabled, true);
  gallery.root.emit('click', { target: gallery.photos[0] });
  assert.equal(gallery.row.scrollLeft, 590, 'photo enlargement is left to the app action handler');
  view.media.matches = true; view.media.emit('change'); view.flush();
  gallery.root.emit('click', { target: gallery.previous });
  assert.equal(gallery.row.scrollLeft, 300); assert.equal(gallery.row.lastScroll.behavior, 'instant');
  flow.dispose();
  assert.equal(gallery.row.count + gallery.root.count, 0);
  assert.equal(gallery.count.textContent, '1 / 3');
});

test('gallery selection survives layout rerender and resizing in its own template only', t => {
  const view = fixture(), flow = createReferenceFlow(), gallery = addGallery(view);
  t.after(() => { flow.dispose(); view.restore(); });
  flow.mount(view.main, { templateId: 'guest-seoul' }); view.flush();
  gallery.row.scrollLeft = 600; gallery.row.emit('scroll');
  const repaint = view.makeView(), restored = addGallery(repaint);
  restored.photos.forEach((photo, index) => { photo.offsetLeft = 20 + index * 400; });
  flow.mount(repaint.main, { templateId: 'guest-seoul' }); view.flush();
  assert.equal(restored.row.scrollLeft, 800); assert.equal(restored.count.textContent, '3 / 3');
  restored.photos.forEach((photo, index) => { photo.offsetLeft = 12 + index * 250; });
  view.win.emit('resize'); view.flush();
  assert.equal(restored.row.scrollLeft, 500); assert.equal(restored.count.textContent, '3 / 3');
  flow.mount(repaint.main, { templateId: 'guest-jeju' }); view.flush();
  assert.equal(restored.row.scrollLeft, 0); assert.equal(restored.count.textContent, '1 / 3');
});
