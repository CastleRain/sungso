import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneReview, REVIEW_TARGETS } from '../js/scene-review.mjs';

class Node extends EventTarget {
  constructor(tag = 'div', className = '') {
    super(); this.tagName = tag; this.className = className; this.children = []; this.queries = new Map(); this.attributes = new Map(); this.dataset = {}; this.effects = [];
    this.classList = { contains: name => this.className.split(' ').includes(name), add: name => { if (!this.classList.contains(name)) this.className += ` ${name}`; }, remove: name => { this.className = this.className.split(' ').filter(value => value !== name).join(' '); } };
  }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parent = this; this.children.push(node); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  querySelectorAll(selector) { return this.queries.get(selector) || []; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  animate(frames, timing) {
    let resolve, reject;
    const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
    const effect = { frames, timing, cancelled: false, finished, complete: resolve, cancel() { this.cancelled = true; reject(new Error('cancelled')); } };
    this.effects.push(effect); return effect;
  }
}
function fixture({ enabled = true, reduced = false } = {}) {
  const doc = new Node('document'), body = new Node('body'), root = new Node('html'), media = new EventTarget(), win = new EventTarget();
  doc.body = body; doc.documentElement = root; doc.hidden = false; doc.createElement = tag => new Node(tag); body.dataset.album = 'grid'; media.matches = reduced; win.matchMedia = () => media;
  const targets = new Map(), allNodes = [];
  for (const id of new Set(Object.values(REVIEW_TARGETS))) {
    const section = new Node('section'); section.id = id; targets.set(id, section); body.append(section);
    for (const selector of ['.section-title', '.invitation-copy', '.family-person', '.upper-ribbon path', '.date-face', '.date-detail', '.upper-date-orbit', '.story-image', '.story-copy', '.story-chapters button', '.gallery-photo', '.album-feature', '.album-filmstrip']) {
      const node = new Node('div'); section.queries.set(selector, [node]); section.append(node); allNodes.push(node);
    }
  }
  const dialog = new Node('dialog'); dialog.open = false;
  doc.getElementById = id => targets.get(id) || body.children.find(node => node.id === id);
  doc.querySelector = selector => selector === '.hero' ? targets.get('top') : selector === 'dialog[open]' && dialog.open ? dialog : null;
  let timerId = 0; const timers = new Map(); win.setTimeout = fn => { timers.set(++timerId, fn); return timerId; }; win.clearTimeout = id => timers.delete(id);
  const controller = createSceneReview({ doc, win, enabled });
  const notice = doc.getElementById('scene-review-notice');
  const animations = () => [...allNodes, notice, ...[...targets.values()].flatMap(node => node.children)].flatMap(node => node.effects);
  const fire = (node, type) => node.dispatchEvent(new Event(type));
  return { doc, body, root, media, win, targets, dialog, timers, notice, animations, fire, controller };
}

test('review starts hidden, accepts only matching invitation targets, and renders labels as plain text', () => {
  const f = fixture(); assert.equal(f.notice.hidden, true);
  for (const request of [{ key: '__proto__', section: 'invitation' }, { key: 'font', section: 'accounts' }, { key: 'palette', section: 'body' }]) assert.equal(f.controller.show(request), false);
  assert.equal(f.animations().length, 0);
  assert.equal(f.controller.show({ key: 'font', section: 'invitation', label: '<img src=x>' }), true);
  assert.equal(f.notice.hidden, false); assert.equal(f.notice.children[1].textContent, '글씨체 · <img src=x>');
  assert.equal(f.notice.attributes.get('aria-live'), 'polite');
  f.controller.destroy(); assert.equal(f.notice.parent, null);
});

test('rapid selections cancel the previous effects and keep only the latest marker and notice', () => {
  const f = fixture(); const album = f.targets.get('gallery'), date = f.targets.get('wedding-day');
  const albumChildren = album.children.length, dateChildren = date.children.length;
  f.controller.show({ key: 'date', section: 'wedding-day', label: '하루의 궤도' });
  const previous = f.animations(); assert.ok(previous.length > 0); assert.equal(date.children.length, dateChildren + 1);
  f.controller.show({ key: 'album', section: 'gallery', label: '사진첩' });
  assert.ok(previous.every(effect => effect.cancelled)); assert.equal(date.children.length, dateChildren); assert.equal(album.children.length, albumChildren + 1);
  assert.equal(f.timers.size, 1); assert.equal(f.notice.children[1].textContent, '사진첩 · 사진첩');
  [...f.timers.values()][0](); assert.equal(f.notice.hidden, true); assert.equal(album.children.length, albumChildren);
  f.controller.destroy();
});

test('effects off and system reduced motion keep feedback readable without moving text or photographs', () => {
  for (const options of [{ enabled: false }, { reduced: true }]) {
    const f = fixture(options); f.controller.show({ key: 'palette', section: 'invitation', label: '로즈' });
    assert.equal(f.notice.hidden, false); assert.equal(f.animations().length, 0); assert.equal(f.timers.size, 1); f.controller.destroy();
  }
  const f = fixture(); f.root.classList.add('motion-off'); f.controller.show({ key: 'intro', section: 'invitation' }); assert.equal(f.animations().length, 0); f.controller.destroy();
});

test('focus, hidden tabs and dialogs settle animations and never leave a target hidden', () => {
  const f = fixture(); f.controller.show({ key: 'story', section: 'our-story' });
  const before = f.animations(); f.fire(f.doc, 'focusin'); assert.ok(before.every(effect => effect.cancelled)); assert.equal(f.notice.hidden, false);
  f.doc.hidden = true; f.fire(f.doc, 'visibilitychange'); assert.equal(f.notice.hidden, true); assert.equal(f.timers.size, 0);
  assert.equal(f.controller.show({ key: 'font', section: 'invitation' }), false);
  f.doc.hidden = false; f.controller.show({ key: 'date', section: 'wedding-day' }); f.dialog.open = true; f.fire(f.doc, 'lab:dialog-change');
  assert.equal(f.notice.hidden, true); assert.equal(f.targets.get('wedding-day').classList.contains('scene-review-target'), false);
  f.controller.destroy();
});

test('the cover and handwriting remain owned by the opening controller while showing a selection note', () => {
  const f = fixture(); const hero = f.targets.get('top'), original = [...hero.children];
  f.controller.show({ key: 'opening', section: 'top', label: '흐르는 손글씨' });
  assert.deepEqual(hero.children, original); assert.ok(original.every(node => node.effects.length === 0)); assert.equal(f.notice.hidden, false);
  f.controller.destroy(); assert.equal(f.controller.show({ key: 'cover', section: 'top' }), false);
});

test('finished and disabled animations remove only their own effects', async () => {
  const f = fixture(); const invitation = f.targets.get('invitation');
  f.controller.show({ key: 'intro', section: 'invitation' });
  const effects = f.animations(); effects.forEach(effect => effect.complete()); await Promise.resolve();
  assert.ok(effects.every(effect => effect.cancelled)); assert.equal(f.notice.hidden, false);
  f.controller.show({ key: 'font', section: 'invitation' }); const more = f.animations(); f.controller.setEnabled(false); assert.ok(more.every(effect => effect.cancelled));
  assert.equal(invitation.classList.contains('scene-review-target'), true); f.controller.cancel(); assert.equal(invitation.classList.contains('scene-review-target'), false); f.controller.destroy();
});
