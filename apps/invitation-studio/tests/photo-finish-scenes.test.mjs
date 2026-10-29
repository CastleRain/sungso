import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { albumLayout, endingProgress, photoFinishChoices, PHOTO_FINISH_CHOICES, mountPhotoFinishScenes } from '../js/photo-finish-scenes.mjs';
import { contentChoices, mountContentScenes } from '../js/content-scenes.mjs';

class Element extends EventTarget {
  constructor(tag, className = '') {
    super(); this.tagName = tag; this.className = className; this.children = []; this.dataset = {}; this.attributes = new Map(); this.hidden = false; this.id = ''; this.top = 700;
    this.style = { values: new Map(), setProperty(key, value) { this.values.set(key, String(value)); }, getPropertyValue(key) { return this.values.get(key) || ''; }, removeProperty(key) { this.values.delete(key); } };
    this.classList = { contains: value => this.className.split(' ').includes(value), add: value => this.className = [...new Set([...this.className.split(' '), value])].join(' '), remove: value => this.className = this.className.split(' ').filter(x => x !== value).join(' '), toggle: (value, force) => force ? this.classList.add(value) : this.classList.remove(value) };
  }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
  insertBefore(node, before) { node.remove(); node.parentElement = this; const i = this.children.indexOf(before); this.children.splice(i < 0 ? this.children.length : i, 0, node); }
  remove() { if (this.parentElement) { const list = this.parentElement.children; list.splice(list.indexOf(this), 1); this.parentElement = null; } }
  setAttribute(key, value) { this.attributes.set(key, String(value)); if (key === 'id') this.id = value; }
  getAttribute(key) { return key === 'id' ? this.id : this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); if (key === 'id') this.id = ''; }
  matches(selector) { if (selector === 'dialog[open]') return this.tagName === 'dialog' && this.open; if (selector.startsWith('#')) return this.id === selector.slice(1); if (selector.startsWith('.')) return this.classList.contains(selector.slice(1)); return this.tagName === selector; }
  querySelectorAll(selector) { return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  getBoundingClientRect() { return { top: this.top, width: 390, height: 500, bottom: this.top + 500 }; }
}
function fixture({ reduced = false, noClosing = false, noPhotos = false, previous = false } = {}) {
  const doc = new Element('document'), win = new EventTarget(), media = new EventTarget(), frames = new Map(); let frameId = 0;
  doc.hidden = false; doc.body = new Element('body'); doc.append(doc.body); doc.getElementById = id => doc.querySelector('#' + id);
  doc.createElement = tag => { assert.ok(!['audio', 'video', 'script', 'iframe', 'form'].includes(tag), 'never recreates a stateful document element'); return new Element(tag); };
  doc.createElementNS = (_ns, tag) => new Element(tag);
  const closing = new Element('footer', 'section closing-section'), inner = new Element('div', 'section-inner'), share = new Element('button'), draft = new Element('textarea'), audio = new Element('audio');
  share.id = 'share-invitation'; draft.value = '작성 중인 축하 메시지'; audio.currentTime = 127; audio.paused = true;
  inner.append(share); closing.append(inner); doc.body.append(draft, audio);
  if (!noClosing) doc.body.append(closing);
  const hero = new Element('div', 'hero-photo'), heroImage = new Element('img'); heroImage.setAttribute('src', '/v6/assets/photos/forest-960.webp'); heroImage.setAttribute('width', '960'); heroImage.setAttribute('height', '1439'); hero.append(heroImage); doc.body.append(hero);
  const story = new Element('section'); story.id = 'our-story'; const grid = new Element('div'); grid.id = 'gallery-grid';
  const buttons = Array.from({ length: 6 }, (_, index) => { const node = new Element('button', 'gallery-photo'); node.dataset.photoIndex = String(index); const image = new Element('img'); image.setAttribute('width', index % 2 ? 1600 : 960); image.setAttribute('height', index % 2 ? 900 : 1440); node.append(image); return node; });
  grid.append(...buttons); doc.body.append(story, grid);
  const dialog = new Element('dialog'); doc.body.append(dialog);
  const gallery = { photos: noPhotos ? [] : [{ id: 'a', src: '/a.webp', width: 900, height: 1200 }, { id: 'b', src: '/b.webp', width: 1600, height: 900 }] };
  if (previous) {
    closing.id = 'closing'; closing.dataset.photoAvailable = 'prior'; closing.style.setProperty('--ending-progress', '.8');
    doc.body.dataset.ending = 'prior'; doc.body.dataset.albumShape = 'prior'; doc.body.style.setProperty('--studio-album-columns', '4'); doc.body.classList.add('photo-finish-motion');
  }
  media.matches = reduced; win.matchMedia = () => media; win.innerHeight = 844;
  win.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; }; win.cancelAnimationFrame = id => frames.delete(id);
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  const fire = (target, type, values = {}) => { const event = new Event(type); Object.entries(values).forEach(([key, value]) => Object.defineProperty(event, key, { value })); target.dispatchEvent(event); };
  return { doc, win, media, frames, flush, fire, closing, inner, share, draft, audio, heroImage, grid, buttons, gallery, dialog };
}

test('old compositions remain unchanged while automatic masonry uses two original-ratio columns', () => {
  assert.deepEqual(photoFinishChoices(null), { albumColumns: 'auto', albumRatio: 'auto', ending: 'original', calendarMark: 'original' });
  for (const input of [undefined, {}, { album: 'grid' }, { album: 'stack' }]) assert.deepEqual(albumLayout(input), { columns: 3, ratio: 'portrait' });
  assert.deepEqual(albumLayout({ album: 'masonry' }), { columns: 2, ratio: 'original' });
  assert.deepEqual(albumLayout({ album: 'masonry', albumColumns: 'three', albumRatio: 'square' }), { columns: 3, ratio: 'square' });
  assert.deepEqual(albumLayout({ album: 'grid', albumColumns: 'two', albumRatio: 'original' }), { columns: 2, ratio: 'original' });
  assert.deepEqual(photoFinishChoices({ ending: '<script>', albumColumns: ['two'], albumRatio: {}, calendarMark: 'constructor' }), photoFinishChoices());
  assert.equal(contentChoices({ album: 'masonry' }).album, 'masonry');
});

test('all saved layout choices preserve the same sharing controls, draft, audio and thumbnail order', () => {
  const f = fixture(), controller = mountPhotoFinishScenes(f), originalChildren = [...f.inner.children];
  const figure = f.closing.querySelector('figure'), image = figure.querySelector('img');
  assert.equal(figure.hidden, true); assert.equal(image.src, undefined, 'old/default ending adds no image request');
  assert.equal(f.closing.id, 'closing');
  let clicks = 0; f.share.addEventListener('click', () => clicks++);
  for (const albumColumns of PHOTO_FINISH_CHOICES.albumColumns) for (const albumRatio of PHOTO_FINISH_CHOICES.albumRatio) for (const ending of PHOTO_FINISH_CHOICES.ending) for (const calendarMark of PHOTO_FINISH_CHOICES.calendarMark) {
    controller.setComposition({ album: 'masonry', albumColumns, albumRatio, ending, calendarMark });
    assert.equal(f.closing.querySelector('figure'), figure); assert.equal(figure.querySelector('img'), image);
    assert.deepEqual(f.inner.children, originalChildren); assert.deepEqual(f.grid.children, f.buttons);
    assert.equal(f.draft.value, '작성 중인 축하 메시지'); assert.equal(f.audio.currentTime, 127); assert.equal(f.audio.paused, true);
    assert.equal(figure.hidden, ending === 'original'); assert.equal(f.doc.body.dataset.calendarMark, calendarMark);
  }
  f.fire(f.share, 'click'); assert.equal(clicks, 1);
  assert.equal(image.getAttribute('data-invitation-photo'), ''); assert.equal(figure.getAttribute('aria-hidden'), 'true');
  controller.destroy();
  assert.deepEqual(f.inner.children, originalChildren); assert.deepEqual(f.grid.children, f.buttons); assert.equal(f.closing.querySelector('figure'), null); assert.equal(f.closing.id, '');
});

test('masonry uses existing grid nodes, preserves prior selected album and does not trigger viewer clicks', () => {
  const f = fixture(), album = { index: 5, enabled: true, mounts: 0, refresh() {}, setEnabled(value) { this.enabled = value; }, destroy() {}, demoNext() { throw new Error('masonry must not advance hidden carousel'); } };
  const content = mountContentScenes({ ...f, composition: { album: 'masonry' }, albumFactory: () => { album.mounts++; return album; } });
  assert.equal(f.grid.hidden, false); assert.equal(album.enabled, false); assert.deepEqual(f.grid.children, f.buttons);
  let clicks = 0; f.buttons.forEach(button => button.addEventListener('click', () => clicks++));
  const restore = content.demoInteraction();
  assert.equal(f.buttons[1].classList.contains('studio-demo-photo'), true); assert.equal(clicks, 0); assert.equal(f.dialog.open, undefined);
  restore(); assert.equal(f.buttons[1].classList.contains('studio-demo-photo'), false);
  for (const presentation of ['contact', 'grid', 'masonry', 'stack']) content.setComposition({ album: presentation });
  assert.equal(album.index, 5); assert.equal(album.mounts, 1); assert.deepEqual(f.grid.children, f.buttons); content.destroy();
});

test('ending reuses the last approved album photo, refreshes live data, and degrades on image failure', () => {
  const f = fixture(), controller = mountPhotoFinishScenes({ ...f, composition: { ending: 'glass' } }), figure = f.closing.querySelector('figure'), image = figure.querySelector('img');
  assert.equal(image.src, '/b.webp'); assert.equal(image.width, 1600); assert.equal(image.height, 900); assert.equal(f.closing.dataset.photoAvailable, 'true');
  f.fire(image, 'error'); assert.equal(figure.hidden, true); assert.equal(f.closing.dataset.photoAvailable, 'false');
  controller.setComposition({ ending: 'letter' }); assert.equal(figure.hidden, true, 'failed image stays out of layout');
  f.gallery.photos.push({ id: 'c', src: '/c.webp', width: 1000, height: 1500 }); f.fire(f.doc, 'lab:layout-changed');
  assert.equal(image.src, '/c.webp'); assert.equal(image.height, 1500); assert.equal(figure.hidden, false); assert.equal(f.closing.dataset.photoAvailable, 'true');
  controller.setComposition({ ending: 'original' }); f.gallery.photos.push({ id: 'd', src: '/d.webp' }); controller.refresh(); assert.equal(image.src, '/c.webp', 'hidden original does not fetch new closing images'); controller.destroy();
  const noPhotos = fixture({ noPhotos: true }), fallback = mountPhotoFinishScenes({ ...noPhotos, composition: { ending: 'letter' } });
  assert.equal(noPhotos.closing.querySelector('img').src, '/v6/assets/photos/forest-960.webp'); fallback.destroy();
});

test('small entry motion stops after frames, survives reverse scrolling, and respects focus, hidden tabs and dialogs', () => {
  const f = fixture(), controller = mountPhotoFinishScenes({ ...f, composition: { ending: 'glass' } });
  assert.equal(f.frames.size, 1); f.flush(); const partial = Number(f.closing.style.getPropertyValue('--ending-progress')); assert.ok(partial > 0 && partial < 1); assert.equal(f.frames.size, 0);
  f.closing.top = 350; f.fire(f.win, 'scroll'); f.flush(); const later = Number(f.closing.style.getPropertyValue('--ending-progress')); assert.ok(later > partial);
  f.closing.top = 700; f.fire(f.win, 'scroll'); f.flush(); assert.equal(Number(f.closing.style.getPropertyValue('--ending-progress')), later);
  f.fire(f.win, 'scroll'); f.doc.hidden = true; f.fire(f.doc, 'visibilitychange'); assert.equal(f.frames.size, 0); f.fire(f.win, 'scroll'); assert.equal(f.frames.size, 0);
  f.doc.hidden = false; f.dialog.open = true; f.fire(f.doc, 'lab:dialog-change'); assert.equal(f.frames.size, 0);
  f.dialog.open = false; f.fire(f.doc, 'lab:dialog-change'); assert.equal(f.frames.size, 1);
  f.fire(f.doc, 'focusin', { target: f.share }); assert.equal(f.closing.style.getPropertyValue('--ending-progress'), '1'); controller.destroy();
});

test('effects-off and reduced motion settle a static result and cannot be bypassed by replay', () => {
  const f = fixture(), controller = mountPhotoFinishScenes({ ...f, composition: { ending: 'letter' } });
  controller.setEnabled(false); assert.equal(f.frames.size, 0); assert.equal(f.closing.style.getPropertyValue('--ending-progress'), '1'); assert.equal(f.doc.body.classList.contains('photo-finish-motion'), false);
  controller.prepareDemo('ending'); assert.equal(f.frames.size, 0); assert.equal(f.closing.style.getPropertyValue('--ending-progress'), '1');
  controller.setEnabled(true); assert.equal(f.frames.size, 1); f.media.matches = true; f.fire(f.media, 'change'); assert.equal(f.frames.size, 0); assert.equal(f.closing.style.getPropertyValue('--ending-progress'), '1');
  controller.setComposition({ ending: 'glass' }); assert.equal(f.frames.size, 0); assert.equal(f.closing.querySelector('figure').hidden, false); controller.destroy();
});

test('only ending replay resets entry and cleanup removes pending frames without disturbing prior styles', () => {
  const f = fixture({ previous: true }), controller = mountPhotoFinishScenes({ ...f, composition: { ending: 'glass' } });
  f.closing.top = 100; f.flush(); assert.equal(f.closing.style.getPropertyValue('--ending-progress'), '1');
  f.closing.top = 700; controller.prepareDemo('album'); f.flush(); assert.equal(f.closing.style.getPropertyValue('--ending-progress'), '1');
  const finish = controller.prepareDemo('ending'); f.flush(); assert.ok(Number(f.closing.style.getPropertyValue('--ending-progress')) < 1); finish(); assert.equal(f.closing.style.getPropertyValue('--ending-progress'), '1');
  f.fire(f.win, 'scroll'); controller.destroy(); controller.destroy();
  assert.equal(f.frames.size, 0); assert.equal(f.doc.body.dataset.ending, 'prior'); assert.equal(f.doc.body.dataset.albumShape, 'prior'); assert.equal(f.doc.body.style.getPropertyValue('--studio-album-columns'), '4'); assert.equal(f.doc.body.classList.contains('photo-finish-motion'), true);
  assert.equal(f.closing.id, 'closing'); assert.equal(f.closing.style.getPropertyValue('--ending-progress'), '.8'); assert.equal(f.closing.dataset.photoAvailable, 'prior');
  controller.setComposition({ ending: 'letter' }); controller.refresh(); f.fire(f.win, 'scroll'); assert.equal(f.frames.size, 0); assert.equal(f.doc.body.dataset.ending, 'prior');
});

test('missing closing content is safe, while album and calendar settings still apply', () => {
  const f = fixture({ noClosing: true }), controller = mountPhotoFinishScenes({ ...f, composition: { ending: 'glass', album: 'masonry', calendarMark: 'underline' } });
  assert.equal(f.frames.size, 0); assert.equal(f.doc.body.dataset.albumShape, 'original'); assert.equal(f.doc.body.dataset.calendarMark, 'underline'); assert.equal(f.doc.body.style.getPropertyValue('--studio-album-columns'), '2');
  controller.refresh(); controller.setEnabled(false); controller.destroy();
});

test('progress bounds and CSS maintain native scrolling, original proportions and reduced-motion fallback', async () => {
  assert.equal(endingProgress(1000, 844), 0); assert.equal(endingProgress(-100, 844), 1); assert.equal(endingProgress(NaN, 844), 1); assert.equal(endingProgress(400, 0), 1);
  const css = await readFile(new URL('../css/photo-finish-scenes.css', import.meta.url), 'utf8');
  assert.match(css, /column-count:var\(--studio-album-columns,3\)/); assert.match(css, /break-inside:avoid/); assert.match(css, /height:auto;aspect-ratio:auto;object-fit:contain/);
  assert.match(css, /touch-action:pan-y pinch-zoom/); assert.doesNotMatch(css, /scroll-snap|scroll-behavior|overflow-y:\s*hidden/); assert.match(css, /prefers-reduced-motion:reduce/);
});

