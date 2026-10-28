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
  getBoundingClientRect() { return { top: this.top ?? 500, bottom: 1000, width: 350, height: 500 }; }
  scrollTo({ left }) { this.scrollLeft = left; }
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


test('album demo uses the actual next photo and restores selection and thumbnail position', () => {
  const f = fixture(photos(4)), strip = f.node('.album-filmstrip');
  strip.scrollLeft = 84;
  const prior = f.controller.index, restore = f.controller.demoNext();
  assert.equal(f.controller.index, 1); assert.equal(f.node('.album-feature-image').src, '/full-1.webp');
  assert.equal(f.opens.length, 0);
  restore();
  assert.equal(f.controller.index, prior); assert.equal(f.node('.album-feature-image').src, '/full-0.webp');
  assert.equal(strip.scrollLeft, 84); assert.equal(f.opens.length, 0);
  f.flush();
  assert.ok(Number(f.node('.experience-album').style.values.get('--album-reveal')) < 1, 'unengaged album remains scroll responsive');
  f.controller.destroy();
});

test('real photo selection wins over an unfinished demo cleanup', () => {
  const f = fixture(photos(4)), restore = f.controller.demoNext();
  assert.equal(f.controller.index, 1);
  f.click(f.node('.album-next')); assert.equal(f.controller.index, 2);
  restore(); assert.equal(f.controller.index, 2); assert.equal(f.opens.length, 0);
  f.flush(); assert.equal(f.node('.experience-album').style.values.get('--album-reveal'), '1');
  f.controller.destroy();
});

test('demo restoration follows photo identity when data order changes', () => {
  const f = fixture(photos(3)), restore = f.controller.demoNext();
  f.gallery.photos = [photos(3)[1], photos(3)[2], photos(3)[0]]; f.controller.refresh();
  assert.equal(f.controller.index, 0);
  restore(); assert.equal(f.controller.index, 2); assert.equal(f.node('.album-feature-image').src, '/full-0.webp');
  assert.equal(f.opens.length, 0); f.controller.destroy();
});

test('empty and single photo demos never open the viewer or leave invalid selection', () => {
  for (const count of [0, 1]) {
    const f = fixture(photos(count)), prior = f.controller.index;
    const restore = f.controller.demoNext(); restore();
    assert.equal(f.controller.index, prior); assert.equal(f.opens.length, 0); f.controller.destroy();
  }
});

test('cancelling before direct gesture lets the requested next photo win and preserves a settled album', () => {
  const f = fixture(photos(4)); f.click(f.node('.album-next'));
  const restore = f.controller.demoNext(); assert.equal(f.controller.index, 2);
  restore(); f.click(f.node('.album-next')); assert.equal(f.controller.index, 2);
  f.flush(); assert.equal(f.node('.experience-album').style.values.get('--album-reveal'), '1');
  assert.equal(f.opens.length, 0); f.controller.destroy();
});
