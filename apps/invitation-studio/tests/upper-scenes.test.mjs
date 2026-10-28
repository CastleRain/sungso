import test from 'node:test';
import assert from 'node:assert/strict';
import { mountUpperScenes, normalizeUpper, upperEntry, upperCover } from '../js/upper-scenes.mjs';

class Element extends EventTarget {
  constructor(tag, className = '') {
    super(); this.tagName = tag; this.className = className; this.children = []; this.dataset = {}; this.attributes = new Map();
    this.style = { values: new Map(), setProperty(key, value) { this.values.set(key, value); }, removeProperty(key) { this.values.delete(key); } };
    this.classList = { add: (...names) => { this.className = [...new Set([...this.className.split(' '), ...names])].filter(Boolean).join(' '); }, remove: (...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); }, contains: name => this.className.split(' ').includes(name), toggle: (name, on) => on ? this.classList.add(name) : this.classList.remove(name) };
    this.rect = { top: 400, bottom: 800, height: 400, width: 390 };
  }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); if (key === 'class') this.className = String(value); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  matches(selector) { return selector === 'dialog[open]' ? this.tagName === 'dialog' && this.open : selector.startsWith('.') ? this.classList.contains(selector.slice(1)) : this.tagName === selector; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() { return this.rect; }
}

function fixture({ enabled = true, reduced = false, composition } = {}) {
  const doc = new Element('document'); doc.body = new Element('body'); doc.documentElement = new Element('html'); doc.hidden = false;
  doc.append(doc.body); doc.createElement = tag => new Element(tag); doc.createElementNS = (_, tag) => new Element(tag);
  const hero = new Element('section', 'hero'), invitation = new Element('section', 'invitation-section'), inner = new Element('div', 'section-inner'), family = new Element('div', 'family-lines'), date = new Element('div', 'date-scene'), face = new Element('div', 'date-face'), detail = new Element('div', 'date-detail'), calendarButton = new Element('button'), dialog = new Element('dialog');
  hero.rect = { top: -150, height: 844, bottom: 694 }; invitation.rect = { top: 450, height: 400, bottom: 850 }; date.rect = { top: 640, height: 550, bottom: 1190 };
  inner.append(family); invitation.append(inner); detail.append(calendarButton); date.append(face, detail); doc.body.append(hero, invitation, date, dialog);
  const frames = new Map(); let serial = 0;
  const media = new EventTarget(); media.matches = reduced;
  const win = new EventTarget(); win.innerHeight = 844; win.requestAnimationFrame = fn => { frames.set(++serial, fn); return serial; }; win.cancelAnimationFrame = id => frames.delete(id); win.matchMedia = () => media;
  const fire = (node, type, extra = {}) => { const event = new Event(type); Object.entries(extra).forEach(([key, value]) => Object.defineProperty(event, key, { value })); node.dispatchEvent(event); };
  const flush = () => { const next = [...frames.values()]; frames.clear(); next.forEach(fn => fn()); };
  const controller = mountUpperScenes({ doc, win, enabled, composition });
  return { doc, win, hero, invitation, date, face, detail, calendarButton, dialog, family, media, frames, fire, flush, controller };
}

test('upper scene progress is finite, monotonic and bounded in the readable viewport', () => {
  assert.equal(upperEntry(1000, 844), 0); assert.equal(upperEntry(-50, 844), 1);
  assert.ok(upperEntry(500, 844) > 0 && upperEntry(500, 844) < 1);
  assert.ok(upperEntry(400, 844) > upperEntry(500, 844));
  assert.equal(upperEntry(NaN, 844), 0); assert.equal(upperEntry(100, 0), 0); assert.equal(upperEntry(100, Infinity), 0);
  assert.equal(upperCover(0, 844), 0); assert.equal(upperCover(-1000, 844), 1);
  assert.ok(upperCover(-200, 844) > 0 && upperCover(-200, 844) < 1);
  assert.equal(upperCover(-200, 0), 0); assert.equal(upperCover(NaN, 844), 0);
});

test('only the three upper scene choices are accepted; missing or hostile values fall back', () => {
  assert.deepEqual(normalizeUpper({ cover: 'aperture', intro: 'ribbon', date: 'flip', mode: 'production' }), { cover: 'aperture', intro: 'ribbon', date: 'flip' });
  assert.deepEqual(normalizeUpper({ cover: 'javascript:alert(1)', intro: ['ribbon'], date: null }), { cover: 'cinema', intro: 'letter', date: 'ticket' });
  assert.deepEqual(normalizeUpper(null), { cover: 'cinema', intro: 'letter', date: 'ticket' });
});

test('scene changes reuse only decorative nodes and leave original family/calendar content intact', () => {
  const f = fixture(); const decorCount = f.doc.querySelectorAll('svg').length;
  assert.equal(f.doc.body.dataset.cover, 'cinema'); assert.equal(f.doc.body.dataset.date, 'ticket');
  const familyChildren = f.family.children.length;
  f.controller.setComposition({ cover: 'curtain', intro: 'together', date: 'orbit' });
  f.flush();
  assert.equal(f.doc.body.dataset.cover, 'curtain'); assert.equal(f.doc.body.dataset.intro, 'together'); assert.equal(f.doc.body.dataset.date, 'orbit');
  assert.equal(f.doc.querySelectorAll('svg').length, decorCount); assert.equal(f.family.children.length, familyChildren);
  assert.equal(f.detail.children.includes(f.calendarButton), true);
  assert.equal(f.doc.querySelector('.upper-curtains').getAttribute('aria-hidden'), 'true');
  assert.equal(f.doc.querySelector('.upper-ribbon').getAttribute('aria-hidden'), 'true');
  f.controller.destroy();
});

test('native scroll schedules one frame only and stops while hidden or in a modal', () => {
  const f = fixture(); assert.equal(f.frames.size, 1); f.fire(f.win, 'scroll'); assert.equal(f.frames.size, 1);
  f.flush(); assert.equal(f.frames.size, 0); assert.ok(Number(f.date.style.values.get('--upper-date')) > 0);
  f.fire(f.win, 'scroll'); f.doc.hidden = true; f.fire(f.doc, 'visibilitychange'); assert.equal(f.frames.size, 0);
  f.fire(f.win, 'scroll'); assert.equal(f.frames.size, 0); f.doc.hidden = false; f.fire(f.doc, 'visibilitychange'); assert.equal(f.frames.size, 1);
  f.dialog.open = true; f.fire(f.doc, 'lab:dialog-change'); assert.equal(f.frames.size, 0); f.fire(f.win, 'scroll'); assert.equal(f.frames.size, 0);
  f.dialog.open = false; f.fire(f.doc, 'lab:dialog-change'); f.flush(); assert.equal(f.frames.size, 0);
  f.controller.destroy();
});

test('handwriting opening locks cover geometry only and is never cancelled by the upper controller', () => {
  const f = fixture(); f.doc.documentElement.classList.add('intro-locked'); f.flush();
  assert.equal(f.hero.style.values.get('--upper-cover'), '0'); assert.equal(f.doc.documentElement.classList.contains('intro-locked'), true);
  f.doc.documentElement.classList.remove('intro-locked'); f.fire(f.doc, 'sungso:intro-finished'); f.flush();
  assert.ok(Number(f.hero.style.values.get('--upper-cover')) > 0); f.controller.destroy();
});

test('keyboard focus settles the calendar permanently so the saved-date action does not move away', () => {
  const f = fixture(); f.flush(); assert.ok(Number(f.date.style.values.get('--upper-date')) < 1);
  f.fire(f.doc, 'focusin', { target: f.calendarButton }); assert.equal(f.date.style.values.get('--upper-date'), '1');
  f.date.rect.top = 800; f.fire(f.win, 'scroll'); f.flush(); assert.equal(f.date.style.values.get('--upper-date'), '1');
  f.controller.destroy();
});

test('effects-off and OS reduced motion expose final text and calendar without a running frame', () => {
  const f = fixture(); f.controller.setEnabled(false); assert.equal(f.frames.size, 0);
  assert.equal(f.invitation.style.values.get('--upper-intro'), '1'); assert.equal(f.date.style.values.get('--upper-date'), '1'); assert.equal(f.hero.style.values.get('--upper-cover'), '0');
  f.controller.setEnabled(true); assert.equal(f.frames.size, 1); f.media.matches = true; f.fire(f.media, 'change'); assert.equal(f.frames.size, 0);
  assert.equal(f.doc.body.classList.contains('upper-scenes-active'), false); assert.equal(f.date.style.values.get('--upper-date'), '1');
  f.media.matches = false; f.fire(f.media, 'change'); assert.equal(f.frames.size, 1); f.controller.destroy();
  const g = fixture({ reduced: true }); assert.equal(g.frames.size, 0); assert.equal(g.date.style.values.get('--upper-date'), '1'); g.controller.destroy();
});

test('destroy removes generated nodes, data, inline geometry and all scheduled listeners', () => {
  const f = fixture(); f.flush(); f.controller.destroy(); f.controller.destroy();
  assert.equal(f.doc.querySelector('.upper-curtains'), null); assert.equal(f.doc.querySelector('.upper-date-orbit'), null);
  assert.equal(f.doc.body.dataset.cover, undefined); assert.equal(f.doc.body.classList.contains('upper-scenes-ready'), false);
  assert.equal(f.hero.style.values.has('--upper-cover'), false); assert.equal(f.date.style.values.has('--upper-date'), false);
  assert.equal(f.detail.children.includes(f.calendarButton), true); assert.equal(f.family.children.length, 0);
  f.fire(f.win, 'scroll'); f.fire(f.win, 'resize'); f.fire(f.doc, 'visibilitychange'); assert.equal(f.frames.size, 0);
});
