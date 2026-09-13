import test from 'node:test';
import assert from 'node:assert/strict';
import { PHOTOS } from '../js/catalog.mjs';
import { worldsCover } from '../js/special-worlds.mjs';
import { renderSignatureConstellation, createConstellationSignature } from '../js/signature-constellation.mjs';

const parts = Object.fromEntries(['cover', 'greeting', 'story', 'date', 'gallery', 'directions', 'accounts', 'rsvp', 'guestbook', 'ending'].map(key => [key, `<section data-section="${key}">${key}</section>`]));

test('signature preserves every supplied section and the five-star cover experience', () => {
  const cover = worldsCover('constellation'), html = renderSignatureConstellation({}, { ...parts, cover });
  assert.ok(html.includes(cover));
  assert.equal((html.match(/data-experience-action="star"/g) || []).length, 5);
  assert.equal((html.match(/data-constellation-scene="[0-2]"/g) || []).length, 3);
  assert.match(html, /각자의 궤도를 지나/);
  for (const [key, value] of Object.entries(parts)) if (key !== 'cover') assert.ok(html.includes(value));
  assert.doesNotMatch(html, /<article|<script|<form|<iframe/);
});

test('disabled optional parts omit their complete chapters and their photo controls', () => {
  const optional = ['story', 'gallery', 'directions', 'accounts', 'rsvp', 'guestbook'];
  const html = renderSignatureConstellation({}, { ...parts, ...Object.fromEntries(optional.map(key => [key, ''])) });
  for (const key of optional) assert.ok(!html.includes(`data-section="${key}"`));
  assert.ok(!html.includes('data-constellation-scenes'));
  assert.ok(!html.includes('cs-warm-wishes'));
  for (const key of ['cover', 'greeting', 'date', 'ending']) assert.ok(html.includes(parts[key]));
});

test('story-off keeps the photo experience while excluding additional fictional story copy', () => {
  const html = renderSignatureConstellation({}, { ...parts, story: '' });
  assert.ok(html.includes('data-constellation-scenes'));
  assert.match(html, /data-show-story="false"/);
  assert.ok(html.includes('정원의 두 사람'));
  assert.doesNotMatch(html, /data-constellation-scene-line|우연이 빛나던 날|너라는 작은 빛|data-section="story"/);
});

class Element {
  constructor(tag = 'div', dataset = {}, children = []) {
    Object.assign(this, { tagName: tag.toUpperCase(), dataset, children, parentElement: null, attributes: {}, listeners: new Map(), textContent: '' });
    children.forEach(child => { child.parentElement = this; });
  }
  matches(selector) {
    const [, tag, attr] = selector.match(/^(\w+)?\[data-([\w-]+)\]$/) || [];
    const key = attr?.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return !!key && (!tag || this.tagName === tag.toUpperCase()) && Object.hasOwn(this.dataset, key);
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  click(target) { for (const listener of this.listeners.get('click') || []) listener({ target }); }
}

function fixture() {
  const buttons = [0, 1, 2].map(index => new Element('button', { constellationScene: String(index) }, [new Element('span')]));
  const image = new Element('img', { constellationScenePhoto: '' });
  const title = new Element('h3', { constellationSceneTitle: '' }), line = new Element('p', { constellationSceneLine: '' });
  const root = new Element('section', { constellationScenes: '', showStory: 'true' }, [...buttons, image, title, line]);
  return { container: new Element('main', {}, [root]), root, buttons, image, title, line };
}

test('native scene button activation changes the existing photo, copy, lighting and pressed state together', () => {
  const controller = createConstellationSignature(), view = fixture(); controller.mount(view.container);
  assert.equal(view.image.attributes.src, PHOTOS[0].src);
  const firstTitle = view.title.textContent;
  view.container.click(view.buttons[1].children[0]);
  assert.equal(view.image.attributes.src, PHOTOS[1].src); assert.equal(view.image.attributes.alt, PHOTOS[1].alt);
  assert.equal(view.root.dataset.glow, 'blue'); assert.notEqual(view.title.textContent, firstTitle);
  assert.deepEqual(view.buttons.map(button => button.attributes['aria-pressed']), ['false', 'true', 'false']);
  view.container.click(view.buttons[2]); assert.equal(view.root.dataset.glow, 'rose');
  assert.equal(view.image.attributes.src, PHOTOS[2].src); assert.match(view.line.textContent, /기다려져/);
  controller.dispose();
});

test('option rerender and temporary omission preserve scene choice while removing old listeners', () => {
  const controller = createConstellationSignature(), first = fixture(); controller.mount(first.container);
  first.container.click(first.buttons[2]); controller.mount(new Element());
  assert.equal(first.container.listeners.get('click').size, 0);
  const next = fixture(); controller.mount(next.root);
  assert.equal(next.root.dataset.scene, '2'); assert.equal(next.image.attributes.src, PHOTOS[2].src);
  const storyOff = fixture(); storyOff.root.dataset.showStory = 'false';
  controller.mount(storyOff.container);
  assert.equal(storyOff.root.dataset.scene, '2'); assert.equal(storyOff.title.textContent, '서로를 바라보며');
  assert.equal(storyOff.line.textContent, '');
  controller.mount(next.root);
  first.container.click(first.buttons[0]); assert.equal(next.root.dataset.scene, '2');
  controller.dispose(); controller.dispose();
  assert.equal(next.root.listeners.get('click').size, 0);
  next.root.click(next.buttons[0]); assert.equal(next.root.dataset.scene, '2');
});

test('invalid, disabled and foreign controls do not change a scene; a new controller starts fresh', () => {
  const controller = createConstellationSignature(), view = fixture(); controller.mount(view.container);
  view.buttons[1].disabled = true; view.container.click(view.buttons[1]);
  for (const invalid of ['', '-1', '3', '1.0', ' 1']) { view.buttons[2].dataset.constellationScene = invalid; view.container.click(view.buttons[2]); }
  const foreign = fixture(); view.container.click(foreign.buttons[1]);
  assert.equal(view.root.dataset.scene, '0');
  view.buttons[1].disabled = false; view.container.click(view.buttons[1]); controller.dispose();
  const fresh = createConstellationSignature(); fresh.mount(view.container);
  assert.equal(view.root.dataset.scene, '0'); fresh.dispose();
});
