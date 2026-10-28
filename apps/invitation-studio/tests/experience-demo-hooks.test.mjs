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
  const writeButton = new Element('button', '', 'guestbook-write'), composer = new Element('dialog', '', 'guestbook-composer');
  composer.draft = '작성 중인 축하 메시지'; doc.body.append(writeButton, composer);
  const controller = mountExperience({ doc, win, enabled, variant, includeGallery: false });
  const fire = (node, type, properties = {}) => { const event = new Event(type, { cancelable: true }); Object.entries(properties).forEach(([key, value]) => Object.defineProperty(event, key, { value })); node.dispatchEvent(event); return event; };
  const flush = () => { const next = [...frames.values()]; frames.clear(); next.forEach(fn => fn()); };
  const picker = () => doc.querySelector('.recipient-picker');
  return { doc, win, frames, flush, fire, controller, picker, observers, accountPanel, accountRows, sideTabs, groom, bride, subway, car, subwayPanel, carPanel, hero, date, arrival, journey, dialog, writeButton, composer };
}


test('arrival demo switches existing panels once and restores without firing click or external actions', () => {
  const f = fixture(); let clicked = 0;
  f.subway.addEventListener('click', () => clicked++); f.car.addEventListener('click', () => clicked++);
  const restore = f.controller.demoInteraction('arrival');
  assert.equal(f.carPanel.hidden, false); assert.equal(f.subwayPanel.hidden, true); assert.equal(clicked, 0);
  restore(); assert.equal(f.carPanel.hidden, true); assert.equal(f.subwayPanel.hidden, false); assert.equal(clicked, 0);
  assert.equal(f.subway.focused, undefined); assert.equal(f.car.focused, undefined); f.controller.destroy();
});

test('recipient demo restores the selected recipient but never overrides another explicit selection or family', () => {
  const f = fixture(); f.fire(f.picker().children[1], 'click');
  const restore = f.controller.demoInteraction('gifting');
  assert.equal(f.accountPanel.children[2].hidden, false);
  restore(); assert.equal(f.accountPanel.children[1].hidden, false);
  const restoreNext = f.controller.demoInteraction('gifting');
  f.fire(f.picker().children[0], 'click'); restoreNext(); assert.equal(f.accountPanel.children[0].hidden, false);
  const restoreFamily = f.controller.demoInteraction('gifting');
  f.groom.setAttribute('aria-selected', false); f.bride.setAttribute('aria-selected', true);
  f.accountPanel.replaceChildren(...f.accountRows(['신부', '어머니'])); f.observers[0].callback([{ target: f.accountPanel }]);
  f.fire(f.picker().children[1], 'click'); restoreFamily(); assert.equal(f.accountPanel.children[1].hidden, false);
  assert.equal(f.picker().children[1].textContent, '어머니'); f.controller.destroy();
});

test('recipient and letter demos never synthesize copy, submit, dialog or focus actions', () => {
  const f = fixture(); let clicks = 0, submits = 0;
  f.writeButton.addEventListener('click', () => clicks++); f.composer.addEventListener('submit', () => submits++);
  f.accountPanel.children.forEach(row => row.addEventListener('click', () => clicks++));
  const restoreAccount = f.controller.demoInteraction('gifting'); restoreAccount();
  const restoreLetter = f.controller.demoInteraction('wishes');
  assert.equal(f.writeButton.classList.contains('is-opening'), true);
  assert.equal(f.composer.open, undefined); assert.equal(f.composer.draft, '작성 중인 축하 메시지');
  assert.equal(clicks, 0); assert.equal(submits, 0); assert.equal(f.writeButton.focused, undefined);
  restoreLetter(); assert.equal(f.writeButton.classList.contains('is-opening'), false);
  assert.equal(f.composer.draft, '작성 중인 축하 메시지'); f.controller.destroy();
});

test('letter cleanup preserves an existing opening and a composer the user subsequently opened', () => {
  const f = fixture(); f.writeButton.classList.add('is-opening');
  f.controller.demoInteraction('wishes')(); assert.equal(f.writeButton.classList.contains('is-opening'), true);
  f.writeButton.classList.remove('is-opening'); const restore = f.controller.demoInteraction('wishes');
  f.composer.open = true; restore(); assert.equal(f.writeButton.classList.contains('is-opening'), true);
  assert.equal(f.composer.open, true); assert.equal(f.composer.draft, '작성 중인 축하 메시지'); f.controller.destroy();
});

test('unknown demo kinds do not change transport, accounts or letters', () => {
  const f = fixture();
  for (const key of ['copy', 'submit', 'external-map', null, {}]) f.controller.demoInteraction(key)();
  assert.equal(f.carPanel.hidden, true); assert.equal(f.accountPanel.children[0].hidden, false);
  assert.equal(f.writeButton.classList.contains('is-opening'), false); assert.equal(f.composer.open, undefined);
  f.controller.destroy();
});
