import test from 'node:test';
import assert from 'node:assert/strict';
import { setupGallery } from '../js/gallery.mjs';

// A small DOM surface, not a reimplementation of the gallery. The production
// setupGallery + ui modules own rendering, routing and event handling below.
class Element extends EventTarget {
  constructor(tag, id = '') {
    super(); this.tagName = tag.toUpperCase(); this.id = id; this.children = [];
    this.parentElement = null; this.dataset = {}; this.attributes = new Map();
    this.className = ''; this.style = {}; this.hidden = false; this.disabled = false;
    this.open = false; this.textContent = ''; this.srcWrites = [];
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); },
      contains: name => this.className.split(' ').includes(name),
      toggle: (name, value) => { if (value ?? !this.classList.contains(name)) this.classList.add(name); else this.classList.remove(name); },
    };
  }
  set src(value) { this._src = value; this.srcWrites.push(value); }
  get src() { return this._src || ''; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  replaceChildren(...children) { for (const child of this.children) child.parentElement = null; this.children = []; this.append(...children); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector === '[data-photo-index]') return this.dataset.photoIndex !== undefined;
    const photoIndex = selector.match(/^\[data-photo-index="(\d+)"\]$/);
    if (photoIndex) return String(this.dataset.photoIndex) === photoIndex[1];
    if (selector === 'dialog[open]') return this.tagName === 'DIALOG' && this.open;
    return this.tagName.toLowerCase() === selector;
  }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  getBoundingClientRect() { return { left: 24, top: 200, width: 300, height: 450, right: 324, bottom: 650 }; }
  showModal() { this.open = true; }
  close() { if (this.open) { this.open = false; this.dispatchEvent(new Event('close')); } }
  get isConnected() { return Boolean(this.parentElement); }
  focus() { document.activeElement = this; }
}

function fixture(t, photos) {
  const document = new Element('document'); document.documentElement = new Element('html');
  document.body = new Element('body'); document.append(document.documentElement); document.documentElement.append(document.body);
  document.createElement = tag => new Element(tag); document.getElementById = id => document.querySelector(`#${id}`);
  const nodes = {};
  function add(id, tag = 'div', parent = document.body) { const node = new Element(tag, id); nodes[id] = node; parent.append(node); return node; }
  add('gallery-grid'); add('album-count', 'span'); add('album-open', 'button');
  const album = add('album-dialog', 'dialog'); add('album-full-grid', 'div', album);
  const dialog = add('photo-dialog', 'dialog'); const stage = add('photo-stage', 'div', dialog); stage.className = 'photo-stage';
  add('photo-full', 'img', stage); add('photo-error', 'div', stage).hidden = true;
  for (const id of ['photo-prev', 'photo-next', 'photo-retry']) add(id, 'button', dialog);
  add('photo-counter', 'span', dialog); add('photo-save', 'a', dialog);
  const location = { pathname: '/lab/v6-1/d/', search: '', hash: '#top' };
  const history = { state: null, pushState(state, unused, route) { this.state = state; location.hash = route; }, replaceState(state, unused, route) { this.state = state; location.hash = route; } };
  const globals = { document, window: {}, location, history, innerWidth: 390, innerHeight: 844 };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => { for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  function fire(node, type, fields = {}) { const event = new Event(type, { cancelable: true }); for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value }); node.dispatchEvent(event); return event; }
  function click(node) {
    if (node.disabled) return;
    fire(node, 'click'); fire(document, 'click', { target: node });
  }
  const gallery = setupGallery({ photos, motion: () => false });
  return { gallery, document, nodes, location, click, fire, thumbnails: () => nodes['gallery-grid'].querySelectorAll('button'), fullThumbnails: () => nodes['album-full-grid'].querySelectorAll('button') };
}

const photos = count => Array.from({ length: count }, (_, index) => ({
  id: `photo-${index + 1}`, src: `/photos/photo-${index + 1}.webp`, thumb: `/photos/thumb-${index + 1}.webp`,
  alt: `사진 ${index + 1}`, width: 1440, height: 2160,
}));

test('empty album exposes a useful empty state and cannot open a nonexistent photo', t => {
  const f = fixture(t, []);
  assert.equal(f.thumbnails().length, 0); assert.equal(f.fullThumbnails().length, 0);
  assert.equal(f.nodes['album-count'].textContent, 0); assert.equal(f.nodes['album-open'].disabled, true);
  assert.equal(f.nodes['gallery-grid'].querySelector('p').textContent, '사진을 준비하고 있어요.');
  f.gallery.openPhoto(0); f.click(f.nodes['album-open']);
  assert.equal(f.nodes['photo-dialog'].open, false); assert.equal(f.nodes['album-dialog'].open, false);
  assert.equal(f.nodes['photo-full'].src, '');
});

test('one photo is reachable, its download matches, and previous/next are disabled', t => {
  const f = fixture(t, photos(1)); f.click(f.thumbnails()[0]);
  assert.equal(f.nodes['photo-dialog'].open, true); assert.equal(f.nodes['photo-full'].src, '/photos/photo-1.webp');
  assert.equal(f.nodes['photo-counter'].textContent, '1 / 1'); assert.equal(f.nodes['photo-save'].download, 'sungso-photo-1.webp');
  assert.equal(f.nodes['photo-prev'].disabled, true); assert.equal(f.nodes['photo-next'].disabled, true);
  f.fire(f.nodes['photo-dialog'], 'keydown', { key: 'ArrowRight' });
  assert.equal(f.nodes['photo-counter'].textContent, '1 / 1');
});

test('twenty photos render six previews, all twenty in the album, and wrap in both directions', t => {
  const f = fixture(t, photos(20));
  assert.equal(f.thumbnails().length, 6); assert.equal(f.fullThumbnails().length, 20);
  f.click(f.nodes['album-open']); assert.equal(f.nodes['album-dialog'].open, true);
  f.click(f.fullThumbnails()[19]); assert.equal(f.nodes['photo-counter'].textContent, '20 / 20');
  assert.equal(f.location.hash, '#photo/20');
  f.click(f.nodes['photo-next']); assert.equal(f.nodes['photo-counter'].textContent, '1 / 20');
  assert.equal(f.nodes['photo-full'].src, '/photos/photo-1.webp'); assert.equal(f.location.hash, '#photo/1');
  f.click(f.nodes['photo-prev']); assert.equal(f.nodes['photo-counter'].textContent, '20 / 20');
  f.fire(f.nodes['photo-dialog'], 'keydown', { key: 'ArrowLeft' });
  assert.equal(f.nodes['photo-counter'].textContent, '19 / 20');
});

test('vertical touch scrolling does not change the image; a deliberate horizontal swipe does', t => {
  const f = fixture(t, photos(3)); f.gallery.openPhoto(0);
  const stage = f.nodes['photo-stage'];
  f.fire(stage, 'touchstart', { touches: [{ clientX: 200, clientY: 200 }] });
  f.fire(stage, 'touchend', { changedTouches: [{ clientX: 120, clientY: 420 }] });
  assert.equal(f.nodes['photo-counter'].textContent, '1 / 3');
  f.fire(stage, 'touchstart', { touches: [{ clientX: 240, clientY: 200 }] });
  f.fire(stage, 'touchend', { changedTouches: [{ clientX: 80, clientY: 210 }] });
  assert.equal(f.nodes['photo-counter'].textContent, '2 / 3');
});

test('a failed full image displays retry and requests the same current photo again', t => {
  const f = fixture(t, photos(2)); f.gallery.openPhoto(1);
  const image = f.nodes['photo-full']; f.fire(image, 'error');
  assert.equal(image.hidden, true); assert.equal(f.nodes['photo-error'].hidden, false);
  f.click(f.nodes['photo-retry']);
  assert.deepEqual(image.srcWrites.slice(-2), ['', '/photos/photo-2.webp']);
  assert.equal(image.hidden, false); assert.equal(f.nodes['photo-error'].hidden, true);
  assert.equal(f.nodes['photo-counter'].textContent, '2 / 2');
  f.fire(image, 'load'); assert.equal(image.hidden, false);
  f.click(f.nodes['photo-prev']); assert.equal(image.src, '/photos/photo-1.webp');
});

test('thumbnail failure remains an actionable entry to the original full-size image', t => {
  const f = fixture(t, photos(1)), button = f.thumbnails()[0], thumbnail = button.querySelector('img');
  f.fire(thumbnail, 'error'); assert.equal(button.classList.contains('image-unavailable'), true);
  assert.match(thumbnail.alt, /불러오지 못/);
  f.click(thumbnail); assert.equal(f.nodes['photo-dialog'].open, true);
  assert.equal(f.nodes['photo-full'].src, '/photos/photo-1.webp');
});

test('render replacement preserves the selected photo ID and refreshes open image, counter and download', t => {
  const original = photos(20), f = fixture(t, original); f.gallery.openPhoto(12);
  const current = { ...original[12], src: '/photos/replaced-13.jpg', alt: '새로 교체한 사진' };
  f.gallery.render([current, original[0], original[1]]);
  assert.equal(f.nodes['photo-dialog'].open, true);
  assert.equal(f.nodes['photo-full'].src, '/photos/replaced-13.jpg');
  assert.equal(f.nodes['photo-full'].alt, '새로 교체한 사진');
  assert.equal(f.nodes['photo-counter'].textContent, '1 / 3');
  assert.equal(f.nodes['photo-save'].href, '/photos/replaced-13.jpg');
  assert.equal(f.location.hash, '#photo/1');
  f.click(f.nodes['photo-next']); assert.equal(f.nodes['photo-full'].src, original[0].src);
});

test('removing the selected photo chooses a valid remaining image without stale content', t => {
  const original = photos(3), f = fixture(t, original); f.gallery.openPhoto(2);
  f.gallery.render([original[0]]);
  assert.equal(f.nodes['photo-full'].src, original[0].src);
  assert.equal(f.nodes['photo-counter'].textContent, '1 / 1');
  assert.equal(f.nodes['photo-next'].disabled, true); assert.equal(f.nodes['photo-prev'].disabled, true);
});

test('empty replacement closes both viewers and a later new album replaces rather than appends', t => {
  const f = fixture(t, photos(20)), oldButton = f.thumbnails()[0];
  f.click(f.nodes['album-open']); f.click(f.fullThumbnails()[19]); f.gallery.render([]);
  assert.equal(f.nodes['photo-dialog'].open, false); assert.equal(f.nodes['album-dialog'].open, false);
  assert.equal(f.thumbnails().length, 0); assert.equal(f.nodes['album-open'].disabled, true);
  assert.equal(oldButton.isConnected, false);
  f.gallery.render(photos(3)); assert.equal(f.thumbnails().length, 3); assert.equal(f.fullThumbnails().length, 3);
  assert.equal(f.nodes['gallery-grid'].querySelector('p'), null); assert.equal(f.nodes['album-open'].disabled, false);
  f.click(f.thumbnails()[2]); assert.equal(f.nodes['photo-counter'].textContent, '3 / 3');
});
