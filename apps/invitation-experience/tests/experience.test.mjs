import test from 'node:test';
import assert from 'node:assert/strict';
import { entranceProgress, recipientIndex, mountExperience } from '../js/experience.mjs';

class Element extends EventTarget {
  constructor(tag, className = '', id = '') {
    super(); this.tagName = tag; this.className = className; this.id = id; this.dataset = {}; this.attributes = new Map(); this.children = []; this.hidden = false;
    this.style = { values: new Map(), setProperty(name, value) { this.values.set(name, value); } };
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.className.split(' '), ...names])].filter(Boolean).join(' '); },
      remove: (...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); },
      contains: name => this.className.split(' ').includes(name),
      toggle: (name, on) => on ? this.classList.add(name) : this.classList.remove(name),
    };
    this.rect = { top: 500, bottom: 900, height: 400, width: 390 };
  }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
  replaceChildren(...nodes) { for (const node of this.children) node.parentElement = null; this.children = []; this.append(...nodes); }
  before(...nodes) {
    if (!this.parentElement) return;
    const parent = this.parentElement, offset = parent.children.indexOf(this);
    for (const node of nodes) { node.remove(); node.parentElement = parent; }
    parent.children.splice(offset, 0, ...nodes);
  }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  matches(selector) {
    if (selector === 'dialog[open]') return this.tagName === 'dialog' && this.open;
    if (selector === 'main > section[id]') return this.tagName === 'section' && this.id && this.parentElement?.tagName === 'main';
    if (selector === '[data-account-side][aria-selected="true"]') return this.dataset.accountSide && this.getAttribute('aria-selected') === 'true';
    if (selector.startsWith('[data-')) return Object.hasOwn(this.dataset, selector.slice(6, -1).replace(/-([a-z])/g, (_, x) => x.toUpperCase()));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    return this.tagName === selector;
  }
  querySelectorAll(selector) {
    const space = selector.indexOf(' ');
    if (space > 0 && !selector.includes(' > ')) {
      const head = selector.slice(0, space), rest = selector.slice(space + 1);
      return this.querySelectorAll(head).flatMap(node => node.querySelectorAll(rest));
    }
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() { return this.rect; }
  focus() { this.focused = true; }
  scrollIntoView(options) { this.scrollOptions = options; }
  animate() {
    const animation = { cancelled: false, finished: new Promise(() => {}), cancel() { this.cancelled = true; } };
    (this.animations ||= []).push(animation); return animation;
  }
}

function fixture({ enabled = true, variant = 'f' } = {}) {
  const doc = new Element('document'); doc.body = new Element('body'); doc.documentElement = new Element('html'); doc.documentElement.scrollHeight = 5000; doc.append(doc.body);
  doc.createElement = tag => new Element(tag); doc.getElementById = id => doc.querySelector(`#${id}`); doc.hidden = false;
  const main = new Element('main'), accounts = new Element('section', '', 'accounts'); doc.body.append(main); main.append(accounts);
  const sideTabs = new Element('div', 'account-tabs');
  const groom = new Element('button'), bride = new Element('button'); groom.dataset.accountSide = 'groom'; bride.dataset.accountSide = 'bride'; groom.setAttribute('aria-selected', true); bride.setAttribute('aria-selected', false); sideTabs.append(groom, bride);
  const accountPanel = new Element('div', '', 'account-panel'); accounts.append(sideTabs, accountPanel);
  const accountRows = roles => roles.map(role => { const row = new Element('div', 'account-row'), owner = new Element('p', 'account-owner'), label = new Element('small'); label.textContent = role; owner.append(label); row.append(owner); return row; });
  accountPanel.append(...accountRows(['신랑', '아버지', '어머니']));
  const travel = new Element('div'), subway = new Element('button'), car = new Element('button'), subwayPanel = new Element('div', '', 'arrival-subway-panel'), carPanel = new Element('div', '', 'arrival-car-panel');
  subway.dataset.arrivalTab = 'subway'; car.dataset.arrivalTab = 'car'; subway.setAttribute('aria-controls', subwayPanel.id); car.setAttribute('aria-controls', carPanel.id); carPanel.hidden = true; subway.setAttribute('aria-selected', true); car.setAttribute('aria-selected', false); subway.tabIndex = 0; car.tabIndex = -1;
  travel.append(subway, car, subwayPanel, carPanel); main.append(travel);
  const hero = new Element('section', 'hero'), date = new Element('div', 'date-scene'), arrival = new Element('div', 'arrival-card'), journey = new Element('div', 'journey'), dock = new Element('nav', 'experience-dock'), dialog = new Element('dialog');
  hero.rect = { top: -200, bottom: 644, height: 844, width: 390 }; main.append(hero, date, arrival, journey); doc.body.append(dock, dialog);
  const frames = new Map(), observers = []; let serial = 0;
  const win = new EventTarget(); win.innerHeight = 844; win.scrollY = 200;
  win.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; }; win.cancelAnimationFrame = id => frames.delete(id);
  win.MutationObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe(target) { this.target = target; } disconnect() { this.disconnected = true; } };
  const controller = mountExperience({ doc, win, enabled, variant });
  const fire = (node, type, properties = {}) => { const event = new Event(type, { cancelable: true }); Object.entries(properties).forEach(([key, value]) => Object.defineProperty(event, key, { value })); node.dispatchEvent(event); return event; };
  const flush = () => { const next = [...frames.values()]; frames.clear(); next.forEach(fn => fn()); };
  const picker = () => doc.querySelector('.recipient-picker');
  return { doc, win, frames, flush, fire, controller, picker, observers, accountPanel, accountRows, sideTabs, groom, bride, subway, car, subwayPanel, carPanel, hero, date, arrival, journey, dialog };
}

test('scene entry is finite and clamped, recipient selection handles empty lists and out of bounds', () => {
  assert.equal(entranceProgress(1000, 400, 844), 0);
  assert.equal(entranceProgress(-100, 400, 844), 1);
  assert.ok(entranceProgress(650, 400, 844) > 0 && entranceProgress(650, 400, 844) < 1);
  assert.equal(entranceProgress(NaN, 400, 844), 0);
  assert.equal(recipientIndex(1, 0), -1);
  assert.equal(recipientIndex(-10, 3), 0);
  assert.equal(recipientIndex(8, 3), 2);
  assert.equal(recipientIndex('1', 3), 1);
});

test('transport tabs expose exactly the chosen panel and support arrow, home and end keys', () => {
  const f = fixture();
  f.fire(f.car, 'click'); assert.equal(f.subwayPanel.hidden, true); assert.equal(f.carPanel.hidden, false); assert.equal(f.car.tabIndex, 0); assert.equal(f.subway.tabIndex, -1);
  const arrow = f.fire(f.car, 'keydown', { key: 'ArrowRight' }); assert.equal(arrow.defaultPrevented, true); assert.equal(f.subwayPanel.hidden, false); assert.equal(f.carPanel.hidden, true); assert.equal(f.subway.focused, true);
  f.fire(f.subway, 'keydown', { key: 'End' }); assert.equal(f.car.getAttribute('aria-selected'), 'true');
  f.fire(f.car, 'keydown', { key: 'Home' }); assert.equal(f.subway.getAttribute('aria-selected'), 'true');
  f.controller.destroy();
});

test('recipient picker exposes one full account and preserves keyboard parity after the family changes', () => {
  const f = fixture();
  assert.deepEqual(f.picker().children.map(node => node.textContent), ['신랑', '아버지', '어머니']);
  assert.deepEqual(f.accountPanel.children.map(row => row.hidden), [false, true, true]);
  f.fire(f.picker().children[0], 'keydown', { key: 'ArrowLeft' });
  assert.deepEqual(f.accountPanel.children.map(row => row.hidden), [true, true, false]);
  assert.equal(f.picker().children[2].focused, true); assert.equal(f.picker().children[2].tabIndex, 0); assert.equal(f.picker().children[0].tabIndex, -1);
  f.fire(f.picker().children[2], 'keydown', { key: 'Home' }); assert.equal(f.accountPanel.children[0].hidden, false);
  f.groom.setAttribute('aria-selected', false); f.bride.setAttribute('aria-selected', true); f.accountPanel.replaceChildren(...f.accountRows(['신부', '어머니']));
  f.observers[0].callback([{ target: f.accountPanel }]);
  assert.equal(f.sideTabs.style.values.get('--side-shift'), '100%');
  assert.deepEqual(f.picker().children.map(node => node.textContent), ['신부', '어머니']);
  assert.deepEqual(f.accountPanel.children.map(row => row.hidden), [false, true]);
  assert.equal(f.picker().children[0].getAttribute('aria-controls'), 'recipient-panel-bride-0');
  assert.equal(f.accountPanel.children[0].getAttribute('aria-labelledby'), 'recipient-bride-0');
  f.fire(f.picker().children[0], 'keydown', { key: 'End' }); assert.equal(f.accountPanel.children[1].hidden, false);
  f.controller.destroy();
});

test('empty account update removes stale recipients and later content can be selected', () => {
  const f = fixture(); f.accountPanel.replaceChildren(); f.observers[0].callback([{ target: f.accountPanel }]);
  assert.equal(f.picker().children.length, 0);
  f.accountPanel.append(...f.accountRows(['신랑'])); f.observers[0].callback([{ target: f.accountPanel }]);
  assert.equal(f.picker().children.length, 1); assert.equal(f.accountPanel.children[0].hidden, false);
  f.fire(f.picker().children[0], 'keydown', { key: 'ArrowRight' }); assert.equal(f.accountPanel.children[0].hidden, false);
  f.controller.destroy();
});

test('scroll schedules one frame only, suspends while hidden or modal, and resumes without an idle loop', () => {
  const f = fixture(); assert.equal(f.frames.size, 1); f.win.dispatchEvent(new Event('scroll')); assert.equal(f.frames.size, 1); f.flush(); assert.equal(f.frames.size, 0);
  f.win.dispatchEvent(new Event('scroll')); f.doc.hidden = true; f.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(f.frames.size, 0); f.win.dispatchEvent(new Event('scroll')); assert.equal(f.frames.size, 0);
  f.doc.hidden = false; f.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(f.frames.size, 1); f.dialog.open = true; f.doc.dispatchEvent(new Event('lab:dialog-change')); assert.equal(f.frames.size, 0);
  f.win.dispatchEvent(new Event('scroll')); assert.equal(f.frames.size, 0); f.dialog.open = false; f.doc.dispatchEvent(new Event('lab:dialog-change')); assert.equal(f.frames.size, 1); f.flush(); assert.equal(f.frames.size, 0);
  f.controller.destroy(); f.win.dispatchEvent(new Event('scroll')); assert.equal(f.frames.size, 0);
});

test('effects off makes each scene final, cancels active feedback and leaves account controls usable', () => {
  const f = fixture(); f.fire(f.picker().children[1], 'click'); const animation = f.accountPanel.children[1].animations[0];
  f.controller.setEnabled(false); assert.equal(animation.cancelled, true);
  assert.equal(f.hero.style.values.get('--cover'), '0'); assert.equal(f.date.style.values.get('--scene'), '1'); assert.equal(f.arrival.style.values.get('--arrival'), '1'); assert.equal(f.journey.style.values.get('--journey'), '1');
  f.fire(f.picker().children[2], 'click'); assert.equal(f.accountPanel.children[2].hidden, false); assert.equal(f.accountPanel.children[2].animations, undefined);
  f.flush(); assert.equal(f.frames.size, 0); assert.equal(f.date.style.values.get('--scene'), '1');
  f.controller.destroy();
});

test('existing feedback animations are cancelled when a tab hides or a modal opens', () => {
  const f = fixture(); f.fire(f.picker().children[1], 'click'); const first = f.accountPanel.children[1].animations[0];
  f.doc.hidden = true; f.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(first.cancelled, true);
  f.doc.hidden = false; f.doc.dispatchEvent(new Event('visibilitychange')); f.fire(f.picker().children[2], 'click'); const second = f.accountPanel.children[2].animations[0];
  f.dialog.open = true; f.doc.dispatchEvent(new Event('lab:dialog-change')); assert.equal(second.cancelled, true);
  f.controller.destroy();
});

test('destroy disconnects observers, restores all account rows and removes generated wrappers', () => {
  const f = fixture(); f.fire(f.picker().children[2], 'click'); f.controller.destroy();
  assert.equal(f.observers[0].disconnected, true); assert.equal(f.picker(), null); assert.equal(f.doc.querySelector('.account-panel-frame'), null);
  assert.deepEqual(f.accountPanel.children.map(row => row.hidden), [false, false, false]); assert.equal(f.frames.size, 0);
  f.win.dispatchEvent(new Event('scroll')); f.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(f.frames.size, 0);
});
