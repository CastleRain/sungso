import test from 'node:test';
import assert from 'node:assert/strict';
import { mountOptionalScenes, guestGuideItems, optionalSceneChoices, OPTIONAL_SECTION_IDS } from '../js/optional-scenes.mjs';

class Element {
  constructor(tag = 'div', id = '') { this.tagName = tag.toUpperCase(); this.id = id; this.children = []; this.dataset = {}; this.hidden = false; this.checked = false; this.listeners = new Map(); this.attributes = {}; this.classes = new Set(); this.classList = { contains: key => this.classes.has(key), toggle: (key, on) => on ? this.classes.add(key) : this.classes.delete(key) }; }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
  remove() { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name, handler) { const set = this.listeners.get(name) || new Set(); set.add(handler); this.listeners.set(name, set); }
  removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler); }
  fire(name, values = {}) { const event = { target: this, type: name, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...values }; for (const handler of this.listeners.get(name) || []) handler(event); return event; }
  querySelectorAll(selector) {
    const key = /^\[data-([\w-]+)\]$/.exec(selector)?.[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    return this.children.flatMap(node => [...(key && Object.hasOwn(node.dataset, key) ? [node] : []), ...node.querySelectorAll(selector)]);
  }
}
const wedding = { groom: '성우', bride: '소희', startsAt: '2027-03-06T15:30:00+09:00', venue: '부산 목화웨딩홀', room: '15층 벨리스홀', address: '부산광역시 연제구 중앙대로 1125 시티타워' };
function fixture(configuration = wedding) {
  const body = new Element('body'), sections = new Map(), doc = new Element('document');
  doc.body = body; doc.append(body); doc.createElement = tag => new Element(tag); doc.getElementById = id => find(body, node => node.id === id);
  doc.querySelector = selector => selector === 'dialog[open]' && doc.dialogOpen ? {} : null;
  for (const id of OPTIONAL_SECTION_IDS) { const section = new Element('section', id); section.hidden = true; sections.set(id, section); body.append(section); }
  const guide = new Element('div', 'guest-guide-items'); sections.get('guest-guide').append(guide);
  const checks = ['date', 'travel', 'message'].map(key => { const node = new Element('input'); node.dataset.dayCheck = key; return node; });
  const status = new Element('span', 'day-checklist-status'), progress = new Element('progress', 'day-checklist-progress');
  sections.get('day-checklist').append(...checks, status, progress);
  const links = OPTIONAL_SECTION_IDS.map(id => { const node = new Element('a'); node.hidden = true; node.dataset.optionalNav = id; body.append(node); return node; });
  const fact = new Element('p'); fact.dataset.keepsakeFact = 'names'; sections.get('keepsake').append(fact);
  const media = new Element(); media.matches = false;
  const win = { matchMedia: () => media, fetch() { assert.fail('optional scenes must not fetch'); }, localStorage: { setItem() { assert.fail('checklist is not stored'); } } };
  const audio = new Element('audio', 'background-audio'); audio.currentTime = 123; body.append(audio);
  const controller = mountOptionalScenes({ doc, win, wedding: configuration, composition: {} });
  return { doc, win, media, body, guide, checks, status, progress, links, sections, controller, fact, audio };
}
function find(node, predicate) { if (predicate(node)) return node; for (const child of node.children) { const found = find(child, predicate); if (found) return found; } return null; }

test('guide omits unknown logistics and renders only bounded explicitly provided information', () => {
  const items = guestGuideItems(wedding);
  assert.deepEqual(items.map(item => item.id), ['venue', 'address', 'subway']);
  assert.match(items[0].answer, /15층 벨리스홀/);
  assert.match(items[2].answer, /연산역 7번 출구/);
  const configured = guestGuideItems({ ...wedding, guestInfo: { parking: '  확인한 주차 안내  ', dining: '', children: false, accessibility: '<img src=x onerror=bad()>', unapproved: 'do not show', shuttle: 'x'.repeat(800) } });
  assert.deepEqual(configured.map(item => item.id), ['venue', 'address', 'subway', 'parking', 'shuttle', 'accessibility']);
  assert.equal(configured.find(item => item.id === 'parking').answer, '확인한 주차 안내');
  assert.equal(configured.find(item => item.id === 'shuttle').answer.length, 600);
  const f = fixture({ ...wedding, guestInfo: { accessibility: '<img src=x onerror=bad()>' } });
  const answer = f.guide.children.at(-1).children[1];
  assert.equal(answer.textContent, '<img src=x onerror=bad()>'); assert.equal(answer.children.length, 0);
  f.controller.destroy();
});

test('optional modules default off, admit only known ids and preserve original choice fallback', () => {
  const f = fixture(); assert.ok([...f.sections.values(), ...f.links].every(node => node.hidden));
  assert.deepEqual(optionalSceneChoices({ guestGuide: 'script', checklist: 'cards', keepsake: null }), { guestGuide: 'folded', checklist: 'list', keepsake: 'ticket' });
  f.controller.setComposition({ extras: ['guest-guide', 'other-app', 'keepsake'], guestGuide: 'cards', keepsake: 'postcard', guestInfo: { parking: 'untrusted URL data' } });
  assert.equal(f.sections.get('guest-guide').hidden, false); assert.equal(f.sections.get('keepsake').hidden, false); assert.equal(f.sections.get('day-checklist').hidden, true);
  assert.equal(f.sections.get('guest-guide').dataset.optionalLayout, 'cards'); assert.equal(f.sections.get('keepsake').dataset.optionalLayout, 'postcard');
  assert.deepEqual(f.links.map(node => node.hidden), [false, true, false]); assert.equal(f.guide.children.length, 3);
  f.controller.destroy();
});

test('layout, visibility, refresh and effects changes retain open details, checked inputs and audio', () => {
  const f = fixture(); const rows = [...f.guide.children]; rows[1].open = true;
  f.checks[0].checked = true; f.checks[0].fire('change');
  assert.equal(f.progress.value, 1); assert.equal(f.status.textContent, '3가지 중 1가지 확인했어요');
  f.controller.setComposition({ extras: OPTIONAL_SECTION_IDS, guestGuide: 'cards', checklist: 'steps', keepsake: 'postcard' });
  f.controller.setComposition({ extras: [] }); f.controller.setEnabled(false); f.controller.refresh();
  f.controller.setComposition({ extras: OPTIONAL_SECTION_IDS, guestGuide: 'folded', checklist: 'list' });
  assert.deepEqual(f.guide.children, rows); assert.equal(rows[1].open, true); assert.equal(f.checks[0].checked, true);
  assert.equal(f.audio.currentTime, 123); assert.equal(f.doc.getElementById('background-audio'), f.audio);
  for (const input of f.checks) { input.checked = true; input.fire('change'); }
  assert.equal(f.progress.value, 3); assert.equal(f.status.textContent, '준비가 되었어요. 그날 만나요!');
  f.checks[1].checked = false; f.checks[1].fire('change'); assert.equal(f.progress.value, 2);
  f.controller.destroy();
});

test('guide cards show every answer, prevent collapsing, and restore the prior folded selection', () => {
  const f = fixture(), rows = [...f.guide.children];
  rows[1].open = true;
  f.controller.setComposition({ extras: ['guest-guide'], guestGuide: 'cards' });
  assert.ok(rows.every(row => row.open));
  for (const row of rows) {
    const summary = row.children[0];
    assert.equal(summary.attributes['aria-disabled'], 'true'); assert.equal(summary.attributes.tabindex, '-1');
    assert.equal(summary.fire('click').defaultPrevented, true);
    assert.equal(summary.fire('keydown', { key: 'Enter' }).defaultPrevented, true);
    assert.equal(summary.fire('keydown', { key: ' ' }).defaultPrevented, true);
    assert.equal(summary.fire('keydown', { key: 'ArrowDown' }).defaultPrevented, false);
    row.open = false; row.fire('toggle'); assert.equal(row.open, true);
  }
  f.controller.setComposition({ extras: [], guestGuide: 'cards' });
  f.controller.setComposition({ extras: ['guest-guide'], guestGuide: 'cards' });
  f.controller.setComposition({ extras: ['guest-guide'], guestGuide: 'folded' });
  assert.deepEqual(rows.map(row => row.open), [false, true, false]);
  for (const row of rows) {
    const summary = row.children[0];
    assert.equal(summary.attributes['aria-disabled'], undefined); assert.equal(summary.attributes.tabindex, undefined);
    assert.equal(summary.fire('click').defaultPrevented, false);
    assert.equal(summary.fire('keydown', { key: 'Enter' }).defaultPrevented, false);
  }
  rows[0].open = true; rows[1].open = false;
  f.controller.setComposition({ extras: ['guest-guide'], guestGuide: 'cards' });
  f.controller.setComposition({ extras: ['guest-guide'], guestGuide: 'folded' });
  assert.deepEqual(rows.map(row => row.open), [true, false, false]);
  f.controller.destroy();
  assert.ok(rows.every(row => [...row.listeners.values(), ...row.children[0].listeners.values()].every(set => set.size === 0)));
});

test('motion preference, dialog and hidden tab disable optional motion without hiding content', () => {
  const f = fixture(); f.controller.setComposition({ extras: OPTIONAL_SECTION_IDS }); assert.ok(f.body.classes.has('optional-effects'));
  f.media.matches = true; f.media.fire('change'); assert.equal(f.body.classes.has('optional-effects'), false);
  assert.ok([...f.sections.values()].every(node => !node.hidden));
  f.media.matches = false; f.media.fire('change'); assert.ok(f.body.classes.has('optional-effects'));
  f.doc.hidden = true; f.doc.fire('visibilitychange'); assert.equal(f.body.classes.has('optional-effects'), false);
  f.doc.hidden = false; f.doc.dialogOpen = true; f.doc.fire('lab:dialog-change'); assert.equal(f.body.classes.has('optional-effects'), false);
  f.doc.dialogOpen = false; f.doc.fire('lab:dialog-change'); assert.ok(f.body.classes.has('optional-effects'));
  f.controller.setEnabled(false); f.controller.refresh(); assert.equal(f.body.classes.has('optional-effects'), false);
  f.controller.destroy();
});

test('teardown removes owned rows and handlers, restores visibility, and ignores late calls', () => {
  const f = fixture(); f.controller.setComposition({ extras: OPTIONAL_SECTION_IDS }); assert.equal(f.fact.textContent, '성우 & 소희');
  f.controller.destroy(); f.controller.destroy(); f.controller.setComposition({ extras: OPTIONAL_SECTION_IDS }); f.controller.refresh(); f.controller.setEnabled(true);
  assert.ok([...f.sections.values(), ...f.links].every(node => node.hidden)); assert.equal(f.guide.children.length, 0);
  for (const node of [...f.checks, f.doc, f.media]) assert.ok([...node.listeners.values()].every(set => set.size === 0));
  assert.equal(f.body.classes.has('optional-effects'), false);
});
