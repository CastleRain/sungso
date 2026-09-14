import test from 'node:test';
import assert from 'node:assert/strict';
import { WEDDING } from '../js/wedding-date.mjs';
import { PHOTOS } from '../js/catalog.mjs';
import { editorialCover, editorialBody, initialEditorialState, transitionEditorialState, createEditorialEditions } from '../js/editions-editorial.mjs';

const ids = ['magazine', 'film', 'vinyl', 'museum'];
const optional = ['story', 'gallery', 'directions', 'accounts', 'rsvp', 'guestbook'];
const parts = Object.fromEntries(['cover', 'greeting', ...optional, 'date', 'ending'].map(key => [key, `<section data-section="${key}">${key}</section>`]));
const select = id => ({ templateId: id, sections: Object.fromEntries(optional.map(key => [key, true])) });

test('each editorial world has a distinct cover and a complete body with readable essentials', () => {
  const covers = new Set();
  for (const id of ids) {
    const cover = editorialCover(id), body = editorialBody(select(id), { ...parts, cover });
    covers.add(cover);
    assert.ok(cover.includes(WEDDING.yearText));
    assert.match(cover, /성우|SUNGWOO/);
    assert.ok(body.includes(cover));
    for (const key of ['greeting', 'date', 'ending', 'gallery', 'directions', 'accounts', 'rsvp', 'guestbook']) assert.ok(body.includes(parts[key]), `${id}: ${key} remains available`);
    assert.ok(body.includes('data-section="story"'));
    assert.match(body, /가상|예시/);
    assert.doesNotMatch(body, /<form|<audio|<video|<iframe|<input|contenteditable/);
  }
  assert.equal(covers.size, 4);
  assert.equal(editorialCover('minimal'), '');
  assert.equal(editorialBody(select('minimal'), parts), '');
});

test('catalogue covers contain no nested controls or interactive scene state', () => {
  for (const id of ids) {
    const html = editorialCover(id, true);
    assert.match(html, /ed-cover-compact/);
    assert.doesNotMatch(html, /<button|data-editorial-stage|data-editorial-action|fetchpriority/);
    assert.match(html, /loading="lazy"/);
  }
});

test('disabled sections remove complete optional chapters even if stale parts are passed', () => {
  for (const id of ids) {
    const selection = { ...select(id), sections: Object.fromEntries(optional.map(key => [key, false])) };
    for (const supplied of [parts, { ...parts, ...Object.fromEntries(optional.map(key => [key, ''])) }]) {
      const body = editorialBody(selection, supplied);
      for (const key of optional) assert.ok(!body.includes(`data-section="${key}"`), `${id}: disabled ${key}`);
      assert.doesNotMatch(body, /data-editorial-stage/);
      for (const key of ['cover', 'greeting', 'date', 'ending']) assert.ok(body.includes(parts[key]));
    }
  }
});

test('gallery modes retain the shared photo enlargement contract; story and gallery stay independent', () => {
  for (const id of ids) {
    for (const layout of ['grid', 'slide', 'filmstrip']) {
      const gallery = `<section data-section="gallery"><div class="gallery-${layout}"><button data-action="photo" data-index="2">photo</button></div></section>`;
      const body = editorialBody({ ...select(id), galleryLayout: layout, sections: { ...select(id).sections, story: false } }, { ...parts, gallery });
      assert.ok(body.includes(gallery));
      assert.doesNotMatch(body, /data-section="story"/);
      assert.equal(body.includes('data-editorial-stage'), ['film', 'museum'].includes(id));
    }
    const noGallery = editorialBody({ ...select(id), sections: { ...select(id).sections, gallery: false } }, parts);
    assert.doesNotMatch(noGallery, /data-section="gallery"/);
    assert.equal(noGallery.includes('data-editorial-stage'), ['magazine', 'vinyl'].includes(id));
  }
});

test('pure transitions are bounded, immutable and reject unrelated or malformed actions', () => {
  for (const id of ids) {
    const state = initialEditorialState(id), snapshot = { ...state };
    assert.equal(transitionEditorialState(id, state, 'unknown', '1'), state);
    const action = { magazine: 'article', film: 'frame', vinyl: 'track', museum: 'room' }[id];
    for (const value of ['-1', '3', '0.5', ' 1', '', undefined, null, '<script>']) assert.equal(transitionEditorialState(id, state, action, value), state);
    assert.equal(transitionEditorialState(id, state, action, '2')[action], 2);
    assert.deepEqual(state, snapshot);
  }
  assert.equal(initialEditorialState('missing'), null);
  assert.equal(transitionEditorialState('missing', null, 'room', '1'), null);
});

test('film development is finite and resetting development preserves the selected frame', () => {
  let state = initialEditorialState('film');
  state = transitionEditorialState('film', state, 'frame', '2');
  for (let i = 0; i < 4; i++) state = transitionEditorialState('film', state, 'develop', 'next');
  assert.deepEqual(state, { frame: 2, process: 2 });
  state = transitionEditorialState('film', state, 'reset', 'reset');
  assert.deepEqual(state, { frame: 2, process: 0 });
});

test('record sides, stories and finite rotations are independent memory state', () => {
  let state = initialEditorialState('vinyl');
  state = transitionEditorialState('vinyl', state, 'track', '2');
  state = transitionEditorialState('vinyl', state, 'turn', 'turn');
  assert.deepEqual(state, { side: 'A', track: 2, turns: 1 });
  state = transitionEditorialState('vinyl', state, 'side', 'B');
  assert.deepEqual(state, { side: 'B', track: 0, turns: 1 });
  assert.equal(transitionEditorialState('vinyl', state, 'side', 'C'), state);
});

class Element {
  constructor(tag = 'div', dataset = {}, children = [], classes = '') {
    Object.assign(this, { tagName: tag.toUpperCase(), dataset, children, classes, parentElement: null, attributes: {}, listeners: new Map(), textContent: '', disabled: false });
    this.style = { values: {}, setProperty(name, value) { this.values[name] = value; } };
    children.forEach(child => { child.parentElement = this; });
  }
  matches(selector) {
    if (selector.startsWith('.')) return this.classes.split(' ').includes(selector.slice(1));
    const [, tag, attr] = selector.match(/^(\w+)?\[data-([\w-]+)\]$/) || [];
    const key = attr?.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return Boolean(key && (!tag || this.tagName === tag.toUpperCase()) && Object.hasOwn(this.dataset, key));
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

function fixture(id) {
  const primary = { magazine: 'article', film: 'frame', vinyl: 'track', museum: 'room' }[id];
  const buttons = [0, 1, 2].map(index => new Element('button', { editorialAction: primary, value: String(index) }, [new Element('span')]));
  const extra = id === 'film' ? [['develop', 'next'], ['reset', 'reset']] : id === 'vinyl' ? [['side', 'A'], ['side', 'B'], ['turn', 'turn']] : [];
  const extras = extra.map(([action, value]) => new Element('button', { editorialAction: action, value }));
  const image = new Element('img', {}, [], 'ed-changing-photo');
  const fields = ['headline', 'copy', 'quote', 'foot', 'processLabel', 'processStatus', 'sideLabel', 'title', 'note'].map(name => new Element('p', { editorialField: name }));
  const disc = new Element('div', { editorialDisc: '' });
  const enlarge = new Element('button', { action: 'photo', index: '0' }, [], 'ed-exhibit-art');
  const stage = new Element('section', { editorialStage: id }, [...buttons, ...extras, image, ...fields, disc, enlarge]);
  const container = new Element('main', {}, [stage]);
  return { container, stage, buttons, extras, image, fields, disc, enlarge };
}

test('all native selection buttons update photograph, text and pressed state together', () => {
  const controller = createEditorialEditions();
  for (const id of ids) {
    const view = fixture(id); controller.mount(view.container);
    const initial = view.fields.map(field => field.textContent).join('|');
    view.container.click(view.buttons[2].children[0]);
    assert.equal(view.image.attributes.src, PHOTOS[2].src, id);
    assert.deepEqual(view.buttons.map(button => button.attributes['aria-pressed']), ['false', 'false', 'true']);
    if (id !== 'film') assert.notEqual(view.fields.map(field => field.textContent).join('|'), initial);
    if (id === 'museum') {
      assert.equal(view.enlarge.dataset.index, '2');
      assert.equal(view.enlarge.attributes['aria-label'], '전시 예시 사진 3 크게 보기');
    }
  }
  controller.dispose();
});

test('darkroom controls synchronize process states and completion without hiding essentials', () => {
  const controller = createEditorialEditions(), view = fixture('film'); controller.mount(view.container);
  view.container.click(view.buttons[1]);
  view.container.click(view.extras[0]); assert.equal(view.stage.dataset.process, '1');
  view.container.click(view.extras[0]); assert.equal(view.stage.dataset.process, '2');
  assert.equal(view.extras[0].disabled, true);
  assert.match(view.fields.find(item => item.dataset.editorialField === 'processStatus').textContent, /필름 2/);
  view.container.click(view.extras[1]); assert.equal(view.stage.dataset.process, '0');
  assert.equal(view.extras[0].disabled, false);
  assert.equal(view.image.attributes.src, PHOTOS[1].src);
  controller.dispose();
});

test('record side activation changes liner notes and rotation finishes at a finite angle', () => {
  const controller = createEditorialEditions(), view = fixture('vinyl'); controller.mount(view.container);
  view.container.click(view.extras[1]); assert.equal(view.stage.dataset.side, 'B');
  assert.equal(view.image.attributes.src, PHOTOS[2].src);
  assert.equal(view.fields.find(item => item.dataset.editorialField === 'sideLabel').textContent, 'SIDE B');
  view.container.click(view.extras[2]); assert.equal(view.disc.style.values['--ed-record-angle'], '360deg');
  view.container.click(view.extras[2]); assert.equal(view.disc.style.values['--ed-record-angle'], '720deg');
  controller.dispose();
});

test('remount and section omission retain independent choices and remove detached listeners', () => {
  const controller = createEditorialEditions(), first = fixture('magazine'); controller.mount(first.container);
  first.container.click(first.buttons[2]); controller.mount(new Element());
  assert.equal(first.container.listeners.get('click').size, 0);
  const next = fixture('magazine'); controller.mount(next.stage);
  assert.equal(next.buttons[2].attributes['aria-pressed'], 'true');
  first.container.click(first.buttons[0]); assert.equal(next.buttons[2].attributes['aria-pressed'], 'true');
  const foreign = fixture('magazine'); next.stage.click(foreign.buttons[1]);
  assert.equal(next.buttons[2].attributes['aria-pressed'], 'true');
  next.buttons[0].disabled = true; next.stage.click(next.buttons[0]);
  assert.equal(next.buttons[2].attributes['aria-pressed'], 'true');
  controller.dispose(); controller.dispose();
  assert.equal(next.stage.listeners.get('click').size, 0);
  const fresh = createEditorialEditions(); fresh.mount(next.container);
  assert.equal(next.buttons[0].attributes['aria-pressed'], 'true'); fresh.dispose();
});
