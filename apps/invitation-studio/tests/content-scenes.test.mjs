import test from 'node:test';
import assert from 'node:assert/strict';
import { contentChoices, contentProgress, mountContentScenes } from '../js/content-scenes.mjs';

class Element extends EventTarget {
  constructor(tag, id = '') {
    super(); this.tagName = tag; this.id = id; this.children = []; this.dataset = {}; this.hidden = false; this.className = '';
    this.attributes = new Map(); this.style = { values: new Map(), setProperty(name, value) { this.values.set(name, value); }, removeProperty(name) { this.values.delete(name); } };
    this.classList = { add: name => this.className = [...new Set([...this.className.split(' '), name])].join(' '), remove: name => this.className = this.className.split(' ').filter(x => x !== name).join(' '), contains: name => this.className.split(' ').includes(name), toggle: (name, value) => value ? this.classList.add(name) : this.classList.remove(name) };
  }
  append(...nodes) { nodes.forEach(node => { this.children.push(node); node.parentElement = this; }); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); }
  setAttribute(key, value) { this.attributes.set(key, value); if (key === 'class') this.className = value; }
  getAttribute(key) { return this.attributes.get(key); }
  matches(selector) { return selector.startsWith('#') ? this.id === selector.slice(1) : selector.startsWith('.') ? this.classList.contains(selector.slice(1)) : selector === 'dialog[open]' ? this.tagName === 'dialog' && this.open : this.tagName === selector; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  getBoundingClientRect() { return { top: this.top ?? 500, height: 400 }; }
}
function fixture(composition, { enabled = true, reduced = false } = {}) {
  const doc = new Element('document'); doc.body = new Element('body'); doc.body.className = 'theme-f'; doc.append(doc.body); doc.hidden = false;
  doc.createElementNS = (_namespace, tag) => new Element(tag); doc.getElementById = id => doc.querySelector(`#${id}`);
  const story = new Element('section', 'our-story'), entry = new Element('button'), grid = new Element('div', 'gallery-grid'), dialog = new Element('dialog'); entry.className = 'story-entry'; story.append(entry); doc.body.append(story, grid, dialog);
  const win = new EventTarget(), media = new EventTarget(), frames = new Map(); let frameId = 0;
  win.innerHeight = 844; media.matches = reduced; win.matchMedia = () => media;
  win.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; }; win.cancelAnimationFrame = id => frames.delete(id);
  const album = { enabled: false, mounts: 0, destroyed: false, refreshes: 0, index: 6, setEnabled(value) { this.enabled = value; }, refresh() { this.refreshes++; }, destroy() { this.destroyed = true; grid.hidden = false; } };
  const controller = mountContentScenes({ doc, win, enabled, composition, albumFactory() { album.mounts++; return album; } });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  const fire = (node, type, values = {}) => { const event = new Event(type); Object.entries(values).forEach(([key, value]) => Object.defineProperty(event, key, { value })); node.dispatchEvent(event); };
  return { doc, win, story, entry, grid, dialog, media, frames, controller, album, flush, fire };
}

test('composition only accepts declared story/album IDs, ignoring unrelated or invalid input', () => {
  assert.deepEqual(contentChoices({ story: 'cafe', album: 'contact', mode: 'production' }), { story: 'cafe', album: 'contact' });
  assert.deepEqual(contentChoices({ story: '<script>', album: { toString: () => 'grid' } }), { story: 'chapters', album: 'stack' });
  assert.deepEqual(contentChoices(null), { story: 'chapters', album: 'stack' });
});
test('scroll progress has visible intermediate stages and clamps invalid/small viewport safely', () => {
  assert.equal(contentProgress(1000, 844), 0); assert.equal(contentProgress(-200, 844), 1);
  assert.ok(contentProgress(400, 844) > .1 && contentProgress(400, 844) < .9);
  assert.equal(contentProgress(NaN, 844), 1); assert.equal(contentProgress(400, 0), 1);
});
test('all 18 story/album pairs are independently selectable without remounting or affecting the fixed theme', () => {
  const f = fixture();
  for (const story of ['chapters', 'line', 'fold', 'light', 'constellation', 'cafe']) for (const album of ['stack', 'contact', 'grid']) {
    f.controller.setComposition({ story, album });
    assert.equal(f.doc.body.dataset.story, story); assert.equal(f.doc.body.dataset.album, album);
    assert.equal(f.grid.hidden, album !== 'grid'); assert.equal(f.album.enabled, album !== 'grid');
    assert.equal(f.doc.body.classList.contains('theme-f'), true); assert.equal(f.doc.body.classList.contains('theme-g'), false);
    assert.equal(f.album.index, 6);
  }
  assert.equal(f.album.mounts, 1); assert.equal(f.entry.querySelectorAll('svg').length, 3);
  assert.ok(f.entry.querySelectorAll('svg').every(node => node.getAttribute('aria-hidden') === 'true'));
});
test('one-shot entry progression does not conceal the story again when scrolling backwards or focusing it', () => {
  const f = fixture({ story: 'line', album: 'stack' }); f.flush(); const initial = Number(f.story.style.values.get('--content-progress'));
  f.entry.top = 100; f.fire(f.win, 'scroll'); f.flush(); const completed = Number(f.story.style.values.get('--content-progress')); assert.ok(completed > initial);
  f.entry.top = 800; f.fire(f.win, 'scroll'); f.flush(); assert.equal(Number(f.story.style.values.get('--content-progress')), completed);
  f.fire(f.doc, 'focusin', { target: f.entry }); assert.equal(f.story.style.values.get('--content-progress'), '1');
});
test('hidden tabs and open dialogs cancel pending work and do not run an idle animation loop', () => {
  const f = fixture(); assert.equal(f.frames.size, 1); f.flush(); assert.equal(f.frames.size, 0);
  f.fire(f.win, 'scroll'); assert.equal(f.frames.size, 1); f.doc.hidden = true; f.fire(f.doc, 'visibilitychange'); assert.equal(f.frames.size, 0);
  f.fire(f.win, 'scroll'); assert.equal(f.frames.size, 0); f.doc.hidden = false; f.dialog.open = true; f.fire(f.doc, 'lab:dialog-change'); assert.equal(f.frames.size, 0);
  f.dialog.open = false; f.fire(f.doc, 'lab:dialog-change'); assert.equal(f.frames.size, 1);
});
test('effects-off and system reduced motion leave complete decorative paths and static accessible albums', () => {
  const f = fixture(); f.controller.setEnabled(false); assert.equal(f.frames.size, 0); assert.equal(f.story.style.values.get('--content-progress'), '1'); assert.equal(f.album.enabled, false);
  f.controller.setComposition({ story: 'constellation', album: 'contact' }); assert.equal(f.album.enabled, false);
  f.controller.setEnabled(true); assert.equal(f.album.enabled, true); f.media.matches = true; f.fire(f.media, 'change'); assert.equal(f.album.enabled, false); assert.equal(f.frames.size, 0);
  assert.equal(f.story.style.values.get('--content-progress'), '1');
});
test('destroy restores presentation state and removes every added illustration, listener and scheduled frame', () => {
  const f = fixture(); f.controller.destroy(); assert.equal(f.frames.size, 0); assert.equal(f.album.destroyed, true);
  assert.equal(f.entry.querySelectorAll('svg').length, 0); assert.equal(f.doc.body.dataset.story, undefined); assert.equal(f.doc.body.dataset.album, undefined);
  assert.equal(f.doc.body.classList.contains('theme-f'), true); assert.equal(f.story.style.values.has('--content-progress'), false);
  f.fire(f.win, 'scroll'); f.controller.setComposition({ story: 'cafe', album: 'grid' }); f.controller.refresh(); assert.equal(f.frames.size, 0); assert.equal(f.doc.body.dataset.story, undefined);
});
