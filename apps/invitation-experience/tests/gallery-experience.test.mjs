import test from 'node:test';
import assert from 'node:assert/strict';
import { albumEntry, albumSelection, albumStep, albumSwipe, mountGalleryExperience } from '../js/gallery-experience.mjs';

class Element extends EventTarget {
  constructor(tag, id = '') {
    super(); this.tagName = tag; this.id = id; this.className = ''; this.children = []; this.attributes = new Map(); this.dataset = {}; this.hidden = false; this.disabled = false;
    this.style = { values: new Map(), setProperty(name, value) { this.values.set(name, value); } };
    this.classList = { add: name => this.className += ` ${name}`, remove: name => { this.className = this.className.split(' ').filter(x => x !== name).join(' '); }, contains: name => this.className.split(' ').includes(name), toggle: (name, value) => value ? this.classList.add(name) : this.classList.remove(name) };
  }
  set src(value) { this._src = value; this.attributes.set('src', value); }
  get src() { return this._src; }
  append(...nodes) { nodes.forEach(node => { this.children.push(node); node.parentElement = this; }); }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parentElement = null; }); this.children = []; this.append(...nodes); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector === '[data-album-index]') return this.dataset.albumIndex !== undefined;
    if (selector === 'dialog[open]') return this.tagName === 'dialog' && this.open;
    return this.tagName === selector;
  }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  getBoundingClientRect() { return { top: 500, bottom: 1000, width: 350, height: 500 }; }
  focus() { this.focused = true; }
  animate() { this.animation = { cancelled: false, cancel() { this.cancelled = true; } }; return this.animation; }
}
const photos = count => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, src: `/full-${i}.webp`, thumb: `/thumb-${i}.webp`, alt: `사진 ${i + 1}`, width: 1440, height: 2160 }));
function fixture(initial, { enabled = true, reduced = false } = {}) {
  const doc = new Element('document'); doc.body = new Element('body'); doc.append(doc.body); doc.hidden = false;
  doc.createElement = tag => new Element(tag); doc.getElementById = id => doc.querySelector(`#${id}`);
  const stage = new Element('div', 'gallery-stage'), grid = new Element('div', 'gallery-grid'), dialog = new Element('dialog', 'photo-dialog'), counter = new Element('span', 'photo-counter');
  doc.body.append(stage, dialog); stage.append(grid); dialog.append(counter);
  const win = new EventTarget(), media = new EventTarget(), frames = new Map(); let frameId = 0;
  win.innerHeight = 844; media.matches = reduced; win.matchMedia = () => media;
  win.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId; }; win.cancelAnimationFrame = id => frames.delete(id);
  const opens = [], gallery = { photos: initial, openPhoto(index, trigger) { opens.push({ index, trigger }); } };
  const controller = mountGalleryExperience({ doc, win, gallery, enabled });
  function fire(node, type, properties = {}) { const event = new Event(type, { cancelable: true }); Object.entries(properties).forEach(([key, value]) => Object.defineProperty(event, key, { value })); node.dispatchEvent(event); return event; }
  const node = selector => doc.querySelector(selector);
  const click = target => fire(target, 'click');
  const flush = () => { const next = [...frames.values()]; frames.clear(); next.forEach(fn => fn()); };
  return { doc, win, media, frames, controller, gallery, opens, grid, stage, dialog, counter, node, fire, click, flush };
}

test('album geometry clamps entry and deliberate swipe ignores vertical or small motion', () => {
  assert.equal(albumEntry(1000, 800), 0); assert.equal(albumEntry(-100, 800), 1);
  assert.ok(albumEntry(550, 800) > 0 && albumEntry(550, 800) < 1);
  assert.equal(albumSwipe({ x: 200, y: 100 }, { x: 120, y: 400 }), 0);
  assert.equal(albumSwipe({ x: 200, y: 100 }, { x: 190, y: 101 }), 0);
  assert.equal(albumSwipe({ x: 200, y: 100 }, { x: 120, y: 110 }), 1);
  assert.equal(albumSwipe({ x: 100, y: 100 }, { x: 180, y: 110 }), -1);
});
test('selection survives reorder and clamps after removal, while an empty album has no index', () => {
  assert.equal(albumSelection([], 'p1', 1), -1);
  assert.equal(albumSelection(photos(20).reverse(), 'p19', 19), 0);
  assert.equal(albumSelection(photos(1), 'removed', 19), 0);
  assert.equal(albumStep(0, 20, -1), 19); assert.equal(albumStep(19, 20, 1), 0); assert.equal(albumStep(0, 0, 1), -1);
});
test('empty album exposes the empty message and cannot open a nonexistent photo', () => {
  const f = fixture([]); assert.equal(f.controller.index, -1); assert.equal(f.node('.album-empty').hidden, false); assert.equal(f.node('.album-scene').hidden, true);
  f.click(f.node('.album-feature')); assert.equal(f.opens.length, 0); f.controller.destroy(); assert.equal(f.grid.hidden, false);
});
test('one photo keeps the full image actionable, disables navigation and decorative duplicates', () => {
  const f = fixture(photos(1)); assert.equal(f.node('.album-feature-image').src, '/full-0.webp');
  assert.equal(f.node('.album-position').textContent, '01 / 01'); assert.equal(f.node('.album-next').disabled, true);
  assert.ok(f.doc.querySelectorAll('.album-sheet').every(node => node.hidden));
  f.click(f.node('.album-feature')); assert.equal(f.opens[0].index, 0); assert.equal(f.opens[0].trigger, f.node('.album-feature'));
});
test('twenty photos are all selectable, next wraps, keyboard and full viewer keep selection in sync', () => {
  const f = fixture(photos(20)), strip = f.node('.album-filmstrip'); assert.equal(strip.children.length, 20);
  f.fire(strip, 'click', { target: strip.children[19] }); assert.equal(f.controller.index, 19); assert.equal(f.node('.album-feature-image').src, '/full-19.webp');
  assert.equal(strip.children[19].getAttribute('aria-pressed'), 'true'); f.click(f.node('.album-feature')); assert.equal(f.opens[0].index, 19);
  f.click(f.node('.album-next')); assert.equal(f.controller.index, 0);
  f.fire(f.node('.experience-album'), 'keydown', { key: 'End', target: strip.children[0] }); assert.equal(f.controller.index, 19); assert.equal(strip.children[19].focused, true);
  f.counter.textContent = '8 / 20'; f.fire(f.dialog, 'close'); assert.equal(f.controller.index, 7);
});
test('live render replaces the source without stale selected content and safely empties/refills', () => {
  const f = fixture(photos(3)), strip = f.node('.album-filmstrip'); f.fire(strip, 'click', { target: strip.children[2] });
  f.gallery.photos = [{ ...photos(3)[2], src: '/replacement.webp' }, photos(3)[0]]; f.doc.dispatchEvent(new Event('lab:layout-changed'));
  assert.equal(f.controller.index, 0); assert.equal(f.node('.album-feature-image').src, '/replacement.webp');
  f.gallery.photos = []; f.controller.refresh(); assert.equal(f.controller.index, -1); assert.equal(f.node('.album-empty').hidden, false);
  f.gallery.photos = photos(1); f.controller.refresh(); assert.equal(f.node('.album-empty').hidden, true); assert.equal(f.node('.album-feature-image').src, '/full-0.webp');
});
test('vertical gesture keeps photo while horizontal gesture moves and suppresses accidental enlargement', () => {
  const f = fixture(photos(3)), feature = f.node('.album-feature');
  f.fire(feature, 'pointerdown', { clientX: 200, clientY: 100, pointerId: 1 }); f.fire(feature, 'pointerup', { clientX: 140, clientY: 400, pointerId: 1 }); assert.equal(f.controller.index, 0);
  f.fire(feature, 'pointerdown', { clientX: 200, clientY: 100, pointerId: 1 }); f.fire(feature, 'pointerup', { clientX: 100, clientY: 110, pointerId: 1 }); assert.equal(f.controller.index, 1);
  f.click(feature); assert.equal(f.opens.length, 0); f.click(feature); assert.equal(f.opens.length, 1);
});
test('motion stops for hidden tabs and dialogs, turns into readable static layout, and cleans up', () => {
  const f = fixture(photos(3)); assert.equal(f.frames.size, 1); f.flush(); assert.equal(f.frames.size, 0);
  f.click(f.node('.album-next')); const activeAnimation = f.node('.album-feature-image').animation; assert.equal(activeAnimation.cancelled, false);
  f.win.dispatchEvent(new Event('scroll')); assert.equal(f.frames.size, 1);
  f.dialog.open = true; f.doc.dispatchEvent(new Event('lab:dialog-change')); assert.equal(f.frames.size, 0); assert.equal(activeAnimation.cancelled, true); f.dialog.open = false;
  f.doc.hidden = true; f.doc.dispatchEvent(new Event('visibilitychange')); f.win.dispatchEvent(new Event('scroll')); assert.equal(f.frames.size, 0);
  f.doc.hidden = false; f.dialog.open = true; f.doc.dispatchEvent(new Event('lab:dialog-change')); assert.equal(f.frames.size, 0);
  f.dialog.open = false; f.doc.dispatchEvent(new Event('lab:dialog-change')); assert.equal(f.frames.size, 1);
  f.controller.setEnabled(false); assert.equal(f.frames.size, 0); assert.equal(f.node('.experience-album').style.values.get('--album-reveal'), '1');
  f.controller.setEnabled(true); f.media.matches = true; f.media.dispatchEvent(new Event('change')); assert.equal(f.frames.size, 0);
  f.controller.destroy(); assert.equal(f.node('.experience-album'), null); assert.equal(f.grid.hidden, false); f.win.dispatchEvent(new Event('scroll')); assert.equal(f.frames.size, 0);
});
test('image failure leaves a useful enlarge action and a later successful image recovers', () => {
  const f = fixture(photos(2)); f.fire(f.node('.album-feature-image'), 'error'); assert.equal(f.node('.album-image-error').hidden, false);
  f.click(f.node('.album-feature')); assert.equal(f.opens[0].index, 0);
  f.click(f.node('.album-next')); assert.equal(f.node('.album-image-error').hidden, true); assert.equal(f.node('.album-feature-image').hidden, false);
});
