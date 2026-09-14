import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, PHOTOS, getTemplate } from '../js/catalog.mjs';
import { defaultSelection, normalizeSelection, normalizeDocument, parseRoute } from '../js/core.mjs';
import { cover, invitation } from '../js/templates.mjs';
import { createImmersiveExperiences } from '../js/immersive-experiences.mjs';

const ids = ['paper-theater', 'memory-house', 'ribbon'];
const optional = ['story', 'gallery', 'directions', 'accounts', 'rsvp', 'guestbook'];
const dataKey = name => name.replace(/-([a-z])/g, (_, character) => character.toUpperCase());

// Minimal DOM/event harness: rendering geometry and 3D clipping belong to browser QA.
class Element {
  constructor(tag = 'div', attributes = {}) {
    Object.assign(this, { tagName: tag, attributes: {}, dataset: {}, children: [], parentElement: null, listeners: new Map(), hidden: false, ownText: '' });
    for (const [name, value] of Object.entries(attributes)) this.setAttribute(name, value);
  }
  append(child) { this.children.push(child); child.parentElement = this; }
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
    const [, tag, name, value] = selector.match(/^(\w+)?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/) || [];
    return Boolean(tag || name) && (!tag || this.tagName === tag) && (!name || (this.hasAttribute(name) && (value === undefined || this.getAttribute(name) === value)));
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) this.dataset[dataKey(name.slice(5))] = String(value);
    if (name === 'hidden') this.hidden = true;
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.ownText = value; this.children = []; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  click(target) { for (const listener of this.listeners.get('click') || []) listener({ target }); }
}

function parse(html) {
  const host = new Element('main'), stack = [host];
  const voids = new Set(['img', 'br', 'hr', 'input', 'meta', 'link']);
  for (const match of html.matchAll(/<\/?([\w-]+)([^>]*)>|([^<]+)/g)) {
    if (match[3]) { stack.at(-1).ownText += match[3]; continue; }
    const [raw, tag, rest] = match;
    if (raw.startsWith('</')) {
      assert.equal(stack.at(-1).tagName, tag, `balanced ${tag} markup`);
      stack.pop(); continue;
    }
    const attributes = Object.fromEntries([...rest.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [name, value ?? '']));
    const node = new Element(tag, attributes); stack.at(-1).append(node);
    if (!voids.has(tag) && !raw.endsWith('/>')) stack.push(node);
  }
  assert.equal(stack.length, 1, 'all rendered elements close');
  return host;
}

const render = (id, overrides = {}) => {
  const selection = defaultSelection(id);
  return parse(invitation({ ...selection, ...overrides, sections: { ...selection.sections, ...overrides.sections } }));
};
const roots = host => host.querySelectorAll('[data-immersive-root]');
const storyRoot = host => roots(host).find(root => root.querySelector('[data-immersive-choice]'));
const buttons = root => root.querySelectorAll('[data-immersive-choice]');
const panels = root => root.querySelectorAll('[data-immersive-panel]');

test('new registered invitations retain routes and selections while rendering distinct complete stories', () => {
  const oldCount = TEMPLATES.filter(template => !ids.includes(template.id)).length;
  assert.ok(oldCount >= 20, 'the earlier twenty designs remain registered');
  const compositions = new Set();
  for (const id of ids) {
    assert.equal(TEMPLATES.filter(template => template.id === id).length, 1);
    const selection = defaultSelection(id);
    assert.equal(selection.templateId, id);
    assert.equal(selection.sections.story, true);
    assert.deepEqual(normalizeSelection(selection), selection);
    assert.equal(parseRoute(`#preview/${id}`).templateId, id);
    const document = normalizeDocument({ favorites: { sungwoo: [id], sohee: [] }, selection, selectionRevision: 3 });
    assert.deepEqual(document.favorites.sungwoo, [id]);
    assert.equal(document.selection.templateId, id);
    const host = render(id); compositions.add(host.querySelector('article').getAttribute('class'));
    for (const key of ['cover', 'greeting', 'date', ...optional]) {
      assert.equal(host.querySelectorAll(`[data-section="${key}"]`).length, 1, `${id}: ${key} appears once`);
    }
    const date = host.querySelector('[data-section="date"]');
    assert.match(date.textContent, /2030년 5월 18일/);
    assert.match(date.textContent, /토요일 오후 2시/);
    assert.match(date.textContent, /우리의 웨딩홀 · 가든홀/);
    assert.equal(date.closest('[aria-hidden="true"]'), null);
    assert.equal(date.closest('[hidden]'), null);
    assert.equal(host.querySelectorAll('footer').length, 1);
    assert.equal(host.querySelectorAll('form,input,textarea,iframe,script').length, 0);
    assert.ok(host.querySelectorAll('button').every(button => !button.closest('[aria-hidden="true"]')), 'controls stay outside decorative artwork');
  }
  assert.equal(compositions.size, 3);
});

test('optional modules can be removed without losing the ceremony and gallery controls keep their real layout', () => {
  for (const id of ids) {
    for (const key of optional) {
      const host = render(id, { sections: { [key]: false } });
      assert.equal(host.querySelectorAll(`[data-section="${key}"]`).length, 0, `${id}: ${key} is omitted`);
      assert.equal(host.querySelectorAll('[data-section="date"]').length, 1);
    }
    for (const galleryLayout of ['grid', 'slide', 'filmstrip']) {
      const host = render(id, { galleryLayout });
      const gallery = host.querySelector('[data-section="gallery"]');
      assert.ok(gallery.children.some(node => node.getAttribute('class')?.includes(`gallery-${galleryLayout}`)));
      assert.equal(gallery.querySelectorAll('button[data-action="photo"]').length, PHOTOS.length);
    }
  }
});

test('catalog thumbnails are passive, use only existing example photos, and never expose local notes', () => {
  const allowedPhotos = new Set(PHOTOS.map(photo => photo.src));
  for (const id of ids) {
    const thumbnail = parse(cover(id, true));
    assert.equal(thumbnail.querySelectorAll('button').length, 0);
    for (const image of thumbnail.querySelectorAll('img')) {
      assert.ok(allowedPhotos.has(image.getAttribute('src')));
      assert.ok(image.getAttribute('alt'));
      assert.ok(Number(image.getAttribute('width')) > 0 && Number(image.getAttribute('height')) > 0);
    }
    const host = render(id, { note: '<script>PRIVATE_LOCAL_NOTE</script>' });
    assert.doesNotMatch(host.textContent, /PRIVATE_LOCAL_NOTE/);
    assert.equal(host.querySelectorAll('script').length, 0);
  }
});

test('each story choice reveals exactly its panel and pressed choice while leaving unfolding under scroll control', () => {
  for (const id of ids) {
    const host = render(id), controller = createImmersiveExperiences();
    controller.mount(host);
    const root = storyRoot(host), choices = buttons(root), contents = panels(root);
    assert.equal(choices.length, 3);
    assert.equal(root.dataset.choice, choices[0].dataset.immersiveChoice);
    assert.deepEqual(contents.map(panel => panel.hidden), [false, true, true]);
    for (const selected of [2, 1, 0]) {
      host.click(choices[selected]);
      assert.equal(root.dataset.choice, choices[selected].dataset.immersiveChoice);
      assert.equal(root.dataset.unfolded, 'off', 'choosing a story must not pin its artwork open and prevent reverse scrolling');
      assert.deepEqual(choices.map(button => button.getAttribute('aria-pressed')), choices.map((_, index) => String(index === selected)));
      assert.deepEqual(contents.map(panel => panel.hidden), choices.map((_, index) => index !== selected));
    }
    controller.dispose();
  }
});

test('story choices preserve an explicit unfolded state and remain reversible after handing control back to scrolling', () => {
  const host = render('ribbon'), controller = createImmersiveExperiences();
  controller.mount(host);
  const root = storyRoot(host), toggle = root.querySelector('[data-immersive-toggle]');
  const choices = buttons(root);
  host.click(toggle);
  host.click(choices[1]);
  assert.equal(root.dataset.unfolded, 'on');
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(root.dataset.choice, 'daily');
  host.click(toggle);
  host.click(choices[2]);
  assert.equal(root.dataset.unfolded, 'off');
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  assert.equal(root.dataset.choice, 'tomorrow');
  assert.deepEqual(panels(root).map(panel => panel.hidden), [true, true, false]);
  controller.dispose();
});

test('unfold buttons can hand control back to scrolling without changing a different scene', () => {
  for (const id of ids) {
    const host = render(id), controller = createImmersiveExperiences();
    controller.mount(host);
    const root = roots(host)[0], button = root.querySelector('[data-immersive-toggle]');
    const story = storyRoot(host), initialChoice = story.dataset.choice;
    const idleLabel = button.dataset.idleLabel;
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    host.click(button.querySelector('span'));
    assert.equal(root.dataset.unfolded, 'on');
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.equal(button.querySelector('span').textContent, '스크롤에 맡기기');
    assert.equal(story.dataset.unfolded, 'off');
    host.click(button.querySelector('span'));
    assert.equal(root.dataset.unfolded, 'off');
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.equal(button.querySelector('span').textContent, idleLabel);
    assert.equal(story.dataset.choice, initialChoice);
    controller.dispose();
  }
});

test('palette rerenders and temporary section hiding retain cosmetic state without changing the saved selection', () => {
  for (const id of ids) {
    const selection = defaultSelection(id), before = JSON.stringify(selection);
    const host = parse(invitation(selection)), controller = createImmersiveExperiences();
    controller.mount(host);
    const originalStory = storyRoot(host), selected = buttons(originalStory)[2].dataset.immersiveChoice;
    host.click(buttons(originalStory)[2]);
    host.click(roots(host)[0].querySelector('[data-immersive-toggle]'));
    const withoutStory = render(id, { sections: { story: false } }); controller.mount(withoutStory);
    assert.equal(host.listeners.get('click').size, 0);
    const next = render(id, { paletteId: getTemplate(id).palettes[1].id }); controller.mount(next);
    const restored = storyRoot(next);
    assert.equal(restored.dataset.choice, selected);
    assert.equal(restored.dataset.unfolded, 'off');
    assert.equal(roots(next)[0].dataset.unfolded, 'on');
    assert.deepEqual(panels(restored).map(panel => panel.hidden), [true, true, false]);
    assert.equal(withoutStory.listeners.get('click').size, 0);
    assert.equal(next.listeners.get('click').size, 1);
    assert.equal(JSON.stringify(selection), before);
    controller.dispose();
  }
});

test('disposing or replacing the host removes click handlers and ignores events from a detached invitation', () => {
  const controller = createImmersiveExperiences(), previous = render('memory-house');
  controller.mount(previous);
  const stale = [...previous.listeners.get('click')][0];
  const oldButton = buttons(storyRoot(previous))[2];
  const next = render('memory-house'); controller.mount(next); controller.mount(next);
  assert.equal(previous.listeners.get('click').size, 0);
  assert.equal(next.listeners.get('click').size, 1);
  stale({ target: oldButton });
  assert.equal(storyRoot(next).dataset.choice, 'living');
  controller.dispose(); controller.dispose();
  assert.equal(next.listeners.get('click').size, 0);
  next.click(buttons(storyRoot(next))[2]); stale({ target: buttons(storyRoot(next))[1] });
  assert.equal(storyRoot(next).dataset.choice, 'living');
  controller.mount(null);
});

test('a fresh controller starts from the invitation defaults while roots retain independent choices', () => {
  const host = render('ribbon'), first = createImmersiveExperiences();
  first.mount(host);
  host.click(buttons(storyRoot(host))[2]);
  assert.equal(storyRoot(host).dataset.choice, 'tomorrow');
  first.dispose();
  const second = createImmersiveExperiences(); second.mount(host);
  assert.equal(storyRoot(host).dataset.choice, 'first');
  assert.equal(storyRoot(host).dataset.unfolded, 'off');
  assert.equal(roots(host)[0].dataset.unfolded, 'off');
  second.dispose();
});
