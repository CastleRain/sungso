import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPERIENCE_IDS, initialExperienceState, transitionExperience, createExperiences } from '../js/experiences.mjs';

test('opening interactions can be replayed without changing other template state', () => {
  for (const [id, action] of [['envelope', 'open'], ['ticket', 'stamp'], ['storybook', 'unfold'], ['curtain', 'curtain']]) {
    const start = initialExperienceState(id), other = initialExperienceState('camera');
    const opened = transitionExperience(id, start, action);
    assert.equal(opened.active, true);
    assert.equal(start.active, false);
    assert.equal(other.active, false);
    assert.equal(transitionExperience(id, opened, action).active, false);
    assert.equal(transitionExperience(id, opened, 'shutter'), opened);
  }
  assert.equal(initialExperienceState('unknown'), null);
});

test('camera starts with the first example and cycles through all three photos', () => {
  let state = initialExperienceState('camera');
  assert.equal(state.active, false);
  const shots = [];
  for (let shot = 0; shot < 7; shot++) {
    state = transitionExperience('camera', state, 'shutter');
    shots.push(state.shot);
    assert.equal(state.active, true);
  }
  assert.deepEqual(shots, [0, 1, 2, 0, 1, 2, 0]);
});

test('constellation only completes for five distinct valid stars and supports replay', () => {
  let state = initialExperienceState('constellation');
  for (const star of [-1, 5, 1.5, NaN, undefined, '2']) assert.equal(transitionExperience('constellation', state, 'star', { star }), state);
  for (const star of [4, 2, 0, 3]) {
    const previous = state;
    state = transitionExperience('constellation', state, 'star', { star });
    assert.equal(previous.stars.includes(star), false);
    assert.equal(state.active, false);
    assert.equal(transitionExperience('constellation', state, 'star', { star }), state);
  }
  state = transitionExperience('constellation', state, 'star', { star: 1 });
  assert.equal(state.active, true);
  assert.deepEqual(state.stars, [0, 1, 2, 3, 4]);
  state = transitionExperience('constellation', state, 'constellation');
  assert.deepEqual(state, initialExperienceState('constellation'));
  assert.equal(transitionExperience('constellation', state, 'constellation').active, true);
});

// A small DOM test adapter: it models only native button bubbling, selectors,
// attributes, and lifecycle hooks used here, without adding a browser dependency.
class Element {
  constructor(tag = 'div', dataset = {}, children = []) {
    Object.assign(this, { tagName: tag.toUpperCase(), dataset, children, parentElement: null, attributes: {}, listeners: new Map(), hidden: false, isConnected: true, textContent: '' });
    children.forEach(child => { child.parentElement = this; });
    const names = new Set();
    this.classList = { add: name => names.add(name), remove: name => names.delete(name), contains: name => names.has(name), toggle: (name, enabled) => enabled ? names.add(name) : names.delete(name) };
  }
  matches(selector) {
    const [, tag, attr, value] = selector.match(/^(\w+)?\[data-([\w-]+)(?:="([^"]*)")?\]$/) || [];
    const key = attr?.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return !!key && (!tag || this.tagName === tag.toUpperCase()) && Object.hasOwn(this.dataset, key) && (value === undefined || this.dataset[key] === value);
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  click(target) { for (const listener of this.listeners.get('click') || []) listener({ target }); }
}

function fixture(id, action) {
  const label = new Element('span', { experienceLabel: '' });
  const button = new Element('button', { experienceAction: action, idleLabel: '시작하기', activeLabel: '다시 보기' }, [label]);
  const status = new Element('p', { experienceStatus: '' });
  const photos = [0, 1, 2].map(index => new Element('img', { cameraPhoto: String(index) }));
  const stars = [0, 1, 2, 3, 4].map(index => new Element('button', { experienceAction: 'star', star: String(index) }));
  const lines = [0, 1, 2, 3].map(index => new Element('line', { starLine: String(index) }));
  const root = new Element('section', { experience: id }, [button, status, ...photos, ...stars, ...lines]);
  return { container: new Element('main', {}, [root]), root, button, label, status, photos, stars, lines };
}

function clock() {
  const callbacks = new Map(); let id = 0;
  return { callbacks, setTimer(callback, delay) { assert.equal(delay, 1000); callbacks.set(++id, callback); return id; }, clearTimer(timer) { callbacks.delete(timer); }, flush() { for (const [key, callback] of [...callbacks]) { callbacks.delete(key); callback(); } } };
}

test('mount restores opened state after option rendering and dispose removes listeners', () => {
  const controller = createExperiences(), first = fixture('envelope', 'open');
  first.button.setAttribute('aria-label', '처음의 열기 설명');
  controller.mount(first.container);
  assert.equal(first.button.getAttribute('aria-label'), '시작하기');
  first.container.click(first.label);
  assert.equal(first.root.classList.contains('is-active'), true);
  assert.equal(first.button.getAttribute('aria-pressed'), 'true');
  assert.equal(first.label.textContent, '다시 보기');
  assert.equal(first.button.getAttribute('aria-label'), '다시 보기');
  assert.equal(first.status.getAttribute('aria-live'), 'polite');
  const replacement = fixture('envelope', 'open');
  controller.mount(replacement.container);
  assert.equal(replacement.root.classList.contains('is-active'), true);
  assert.equal(first.container.listeners.get('click').size, 0);
  replacement.container.click(replacement.button);
  assert.equal(replacement.root.classList.contains('is-active'), false);
  assert.equal(replacement.button.getAttribute('aria-label'), '시작하기');
  controller.dispose(); controller.dispose();
  assert.equal(replacement.container.listeners.get('click').size, 0);
  replacement.container.click(replacement.button);
  assert.equal(replacement.root.classList.contains('is-active'), false);
});

test('camera remount clears transient timers while preserving photo choice', () => {
  const timer = clock(), controller = createExperiences({ ...timer, reducedMotion: () => false }), first = fixture('camera', 'shutter');
  controller.mount(first.container);
  first.container.click(first.button); first.container.click(first.button);
  assert.equal(first.root.dataset.shot, '1');
  assert.deepEqual(first.photos.map(photo => photo.hidden), [true, false, true]);
  assert.equal(timer.callbacks.size, 1);
  assert.equal(first.root.classList.contains('is-flashing'), true);
  const staleCallback = [...timer.callbacks.values()][0], replacement = fixture('camera', 'shutter');
  controller.mount(replacement.container);
  assert.equal(timer.callbacks.size, 0);
  assert.equal(first.root.classList.contains('is-flashing'), false);
  assert.equal(replacement.root.dataset.shot, '1');
  replacement.container.click(replacement.button);
  staleCallback();
  assert.equal(replacement.root.classList.contains('is-flashing'), true);
  timer.flush();
  assert.equal(replacement.root.classList.contains('is-flashing'), false);
  replacement.container.click(replacement.button);
  controller.dispose();
  assert.equal(timer.callbacks.size, 0);
});

test('reduced motion still completes actions immediately without flash timers', () => {
  const timer = clock(), controller = createExperiences({ ...timer, reducedMotion: () => true });
  for (const id of EXPERIENCE_IDS) {
    const action = ({ envelope: 'open', camera: 'shutter', ticket: 'stamp', constellation: 'constellation', storybook: 'unfold', curtain: 'curtain' })[id];
    const view = fixture(id, action);
    controller.mount(view.root); view.root.click(view.button);
    assert.equal(view.root.classList.contains('is-active'), true);
    assert.equal(view.root.classList.contains('is-flashing'), false);
    assert.equal(timer.callbacks.size, 0);
  }
  controller.dispose();
});

test('star buttons light only connected segments and reject malformed indices', () => {
  const controller = createExperiences(), view = fixture('constellation', 'constellation');
  controller.mount(view.container);
  view.container.click(view.stars[0]); view.container.click(view.stars[2]);
  assert.equal(view.lines.some(line => line.classList.contains('is-lit')), false);
  view.container.click(view.stars[1]);
  assert.equal(view.lines[0].classList.contains('is-lit'), true);
  assert.equal(view.lines[1].classList.contains('is-lit'), true);
  assert.equal(view.lines[2].classList.contains('is-lit'), false);
  assert.equal(view.stars[1].getAttribute('aria-pressed'), 'true');
  assert.match(view.status.textContent, /3개의 별/);
  view.stars[3].dataset.star = '';
  view.container.click(view.stars[3]);
  assert.match(view.status.textContent, /3개의 별/);
  view.container.click(view.button);
  assert.equal(view.root.classList.contains('is-active'), true);
  view.container.click(view.button);
  assert.equal(view.stars.some(star => star.classList.contains('is-lit')), false);
  assert.equal(view.lines.some(line => line.classList.contains('is-lit')), false);
  controller.dispose();
});

test('unrelated controls, disabled buttons and unknown experiences have no effects', () => {
  const controller = createExperiences(), view = fixture('camera', 'shutter');
  controller.mount(view.container);
  view.button.disabled = true; view.container.click(view.button);
  view.container.click(view.status);
  assert.equal(view.root.classList.contains('is-active'), false);
  const unknown = fixture('other', 'open');
  controller.mount(unknown.container); unknown.container.click(unknown.button);
  assert.equal(unknown.root.classList.contains('is-active'), false);
  const fresh = createExperiences();
  fresh.mount(view.container);
  assert.equal(view.root.classList.contains('is-active'), false);
  controller.dispose(); fresh.dispose();
});
