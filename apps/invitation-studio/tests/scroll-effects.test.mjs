import test from 'node:test';
import assert from 'node:assert/strict';
import { mountScrollEffects, normalizeScrollEffect, scrollEntrance, SCROLL_EFFECTS } from '../js/scroll-effects.mjs';

class Node extends EventTarget {
  constructor() {
    super(); this.dataset = {}; this.classes = new Set(); this.values = new Map(); this.top = 1000; this.children = []; this.animations = [];
    this.classList = { contains: name => this.classes.has(name), add: name => this.classes.add(name), remove: name => this.classes.delete(name), toggle: (name, value) => value ? this.classes.add(name) : this.classes.delete(name) };
    this.style = { getPropertyValue: key => this.values.get(key) || '', setProperty: (key, value) => this.values.set(key, value), removeProperty: key => this.values.delete(key) };
  }
  getBoundingClientRect() { return { top: this.top }; }
  contains(target) { return target === this || this.children.includes(target); }
  animate(frames, options) {
    let resolve, reject;
    const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
    const effect = { frames, options, effect: { pseudoElement: this.noPseudoSupport ? null : options.pseudoElement || null }, cancelled: false, finished, complete: resolve, cancel() { this.cancelled = true; reject(new Error('cancelled')); } };
    this.animations.push(effect); return effect;
  }
}
function fixture(options = {}) {
  const doc = new Node(), win = new Node(), reduced = new Node(), dialog = new Node();
  doc.body = new Node(); doc.documentElement = new Node(); doc.hidden = false; doc.activeElement = null; dialog.open = false; win.innerHeight = 800;
  const makeTarget = top => { const section = new Node(), content = new Node(); section.top = top; content.parentElement = section; return content; };
  const first = makeTarget(640), second = makeTarget(1400), nodes = [first, second];
  first.parentElement.id = 'invitation'; second.parentElement.id = 'gallery';
  doc.querySelectorAll = () => nodes; doc.querySelector = selector => selector === 'dialog[open]' && dialog.open ? dialog : null;
  reduced.matches = options.reduced || false; win.matchMedia = () => reduced;
  let id = 0; const frames = new Map(); win.requestAnimationFrame = callback => { frames.set(++id, callback); return id; }; win.cancelAnimationFrame = key => frames.delete(key);
  const flush = () => { const queued = [...frames.values()]; frames.clear(); queued.forEach(callback => callback()); };
  const fire = (target, type, element) => { const event = new Event(type); if (element) Object.defineProperty(event, 'target', { value: element }); target.dispatchEvent(event); };
  const controller = mountScrollEffects({ doc, win, mode: 'rise', ...options });
  return { doc, win, reduced, dialog, nodes, first, second, frames, flush, fire, controller, makeTarget };
}

test('scroll modes are allowlisted and entrance progress is finite, bounded and monotonic', () => {
  for (const mode of SCROLL_EFFECTS) assert.equal(normalizeScrollEffect(mode), mode);
  for (const value of ['__proto__', {}, 'url', null]) assert.equal(normalizeScrollEffect(value), 'signature');
  assert.equal(scrollEntrance(NaN, 800), 1); assert.equal(scrollEntrance(50, 0), 1);
  const values = [900, 700, 500, 300, 0, -400].map(top => scrollEntrance(top, 800));
  assert.ok(values.every((value, index) => value >= 0 && value <= 1 && (!index || value >= values[index - 1])));
});

test('drift alternates with current section order and settles to the exact original position', () => {
  const f = fixture({ mode: 'drift' }); f.flush();
  assert.ok(parseFloat(f.first.values.get('--global-scroll-x')) < 0);
  assert.equal(f.second.values.get('--global-scroll-x'), '18px');
  f.nodes.reverse(); f.controller.refresh(); f.flush();
  assert.equal(f.second.values.get('--global-scroll-x'), '-18px');
  f.second.parentElement.top = 0; f.fire(f.win, 'scroll'); f.flush();
  assert.equal(f.second.values.get('--global-scroll-x'), '0px');
  assert.equal(f.frames.size, 0); f.controller.destroy();
});

test('breathe uses a bounded zoom-out and unveil only paints a transparent decorative curtain', () => {
  const f = fixture({ mode: 'breathe' }); f.flush();
  assert.equal(f.second.values.get('--global-scroll-breathe'), '1.035');
  assert.ok(Number(f.first.values.get('--global-scroll-breathe')) < 1.035);
  f.controller.setMode('unveil'); f.flush();
  assert.equal(f.second.values.get('--global-scroll-veil'), '0.24');
  assert.equal(f.second.values.get('--global-scroll-wipe'), '0%');
  assert.equal(f.second.values.has('clip-path'), false);
  f.fire(f.doc, 'focusin', f.second);
  assert.equal(f.second.values.get('--global-scroll-veil'), '0');
  assert.equal(f.second.values.get('--global-scroll-wipe'), '100%');
  f.controller.destroy();
});

test('every added mode suspends safely and stops running while disabled, hidden or in a dialog', () => {
  for (const mode of ['drift', 'unveil', 'breathe']) {
    const f = fixture({ mode }); f.flush();
    assert.equal(f.doc.body.classList.contains('global-scroll-active'), true);
    f.doc.hidden = true; f.fire(f.doc, 'visibilitychange');
    assert.equal(f.first.values.get('--global-scroll-opacity'), '1');
    assert.equal(f.first.values.get('--global-scroll-x'), '0px');
    assert.equal(f.first.values.get('--global-scroll-breathe'), '1');
    assert.equal(f.first.values.get('--global-scroll-veil'), '0');
    f.fire(f.win, 'scroll'); assert.equal(f.frames.size, 0);
    f.doc.hidden = false; f.dialog.open = true; f.fire(f.doc, 'lab:dialog-change');
    assert.equal(f.controller.replay('invitation'), false); assert.equal(f.frames.size, 0);
    f.dialog.open = false; f.reduced.matches = true; f.fire(f.reduced, 'change');
    assert.equal(f.doc.body.classList.contains('global-scroll-active'), false);
    f.reduced.matches = false; f.controller.setEnabled(false); f.fire(f.win, 'scroll'); assert.equal(f.frames.size, 0);
    f.controller.destroy();
  }
});

test('added effect previews animate the selected section without clipping any content', () => {
  const f = fixture({ mode: 'drift' }); f.flush();
  assert.equal(f.controller.replay('gallery'), true);
  assert.equal(f.second.animations.at(-1).frames[0].translate, '18px 0');
  f.controller.setMode('breathe'); f.flush(); f.controller.replay('gallery');
  assert.equal(f.second.animations.at(-1).frames[0].scale, 1.035);
  f.controller.setMode('unveil'); f.flush(); f.controller.replay('gallery');
  const content = f.second.animations.at(-2), curtain = f.second.animations.at(-1);
  assert.equal(content.frames.some(frame => 'clipPath' in frame), false);
  assert.equal(curtain.effect.pseudoElement, '::after'); assert.equal(curtain.cancelled, false);
  assert.equal(curtain.frames[1].clipPath, 'inset(0 100% 0 0)');
  f.fire(f.doc, 'pointerdown', f.second);
  assert.equal(content.cancelled, true); assert.equal(curtain.cancelled, true);
  f.controller.destroy();
});

test('unsupported pseudo-element animation is cancelled before it can clip the content', () => {
  const f = fixture({ mode: 'unveil' }); f.flush(); f.first.noPseudoSupport = true;
  assert.equal(f.controller.replay('invitation'), true);
  assert.equal(f.first.animations.at(-1).cancelled, true);
  assert.equal(f.first.animations.at(-2).cancelled, false);
  assert.equal(f.first.animations.at(-2).frames.some(frame => 'clipPath' in frame), false);
  f.controller.destroy();
});

test('scroll schedules one frame and retains fully read sections when moving backwards', () => {
  const f = fixture(); assert.equal(f.frames.size, 1); f.flush();
  const initial = Number(f.first.values.get('--global-scroll-opacity')); assert.ok(initial > .68 && initial < 1);
  f.first.parentElement.top = 100; f.fire(f.win, 'scroll'); f.fire(f.win, 'scroll'); assert.equal(f.frames.size, 1); f.flush();
  assert.equal(f.first.values.get('--global-scroll-opacity'), '1'); assert.equal(f.frames.size, 0);
  f.first.parentElement.top = 1400; f.fire(f.win, 'scroll'); f.flush(); assert.equal(f.first.values.get('--global-scroll-opacity'), '1');
  f.controller.destroy();
});

test('signature and still do not activate global transformations; focus stays subtle', () => {
  const f = fixture({ mode: 'signature' }); assert.equal(f.frames.size, 0); assert.equal(f.doc.body.classList.contains('global-scroll-active'), false);
  f.controller.setMode('focus'); f.flush(); assert.equal(f.doc.body.dataset.scrollEffect, 'focus');
  assert.ok(Number(f.second.values.get('--global-scroll-scale')) >= .98);
  assert.ok(parseFloat(f.second.values.get('--global-scroll-blur')) <= 1.2);
  f.controller.setMode('still'); assert.equal(f.frames.size, 0); assert.equal(f.doc.body.classList.contains('global-scroll-active'), false); assert.equal(f.second.values.get('--global-scroll-opacity'), '1');
  f.controller.destroy();
});

test('effects off, system reduction, dialogs and hidden tabs immediately leave readable content', () => {
  const f = fixture(); f.flush();
  f.doc.hidden = true; f.fire(f.doc, 'visibilitychange'); assert.equal(f.frames.size, 0); assert.equal(f.second.values.get('--global-scroll-opacity'), '1');
  f.doc.hidden = false; f.dialog.open = true; f.fire(f.doc, 'lab:dialog-change'); assert.equal(f.frames.size, 0);
  f.dialog.open = false; f.fire(f.doc, 'lab:dialog-change'); assert.equal(f.frames.size, 1);
  f.reduced.matches = true; f.fire(f.reduced, 'change'); assert.equal(f.frames.size, 0); assert.equal(f.doc.body.classList.contains('global-scroll-active'), false);
  f.reduced.matches = false; f.controller.setEnabled(false); assert.equal(f.second.values.get('--global-scroll-opacity'), '1');
  f.controller.setEnabled(true); f.doc.documentElement.classes.add('motion-off'); f.fire(f.doc, 'lab:motion-change'); assert.equal(f.frames.size, 0); assert.equal(f.doc.body.classList.contains('global-scroll-active'), false);
  f.controller.destroy();
});

test('focusing or touching content settles it and refreshing reordered nodes keeps identity', () => {
  const f = fixture(); f.flush(); f.fire(f.doc, 'focusin', f.second); assert.equal(f.second.values.get('--global-scroll-opacity'), '1');
  f.nodes.reverse(); f.controller.refresh(); f.flush(); assert.equal(f.second.values.get('--global-scroll-opacity'), '1');
  const newNode = f.makeTarget(1200); f.nodes.push(newNode); f.controller.refresh(); f.flush(); assert.equal(newNode.values.get('--global-scroll-opacity'), '0.68');
  f.fire(f.doc, 'pointerdown', newNode); assert.equal(newNode.values.get('--global-scroll-opacity'), '1');
  f.controller.destroy();
});

test('removal and destruction restore only this layer and cancel pending work', () => {
  const f = fixture({ mode: 'signature' });
  const newNode = f.makeTarget(1200); newNode.style.setProperty('--global-scroll-y', '3px'); f.nodes.push(newNode);
  f.controller.refresh(); f.controller.setMode('rise'); f.flush(); assert.notEqual(newNode.values.get('--global-scroll-y'), '3px');
  f.nodes.pop(); f.controller.refresh(); assert.equal(newNode.values.get('--global-scroll-y'), '3px'); assert.equal(newNode.classList.contains('global-scroll-target'), false);
  f.controller.destroy(); assert.equal(f.frames.size, 0); assert.equal(f.doc.body.dataset.scrollEffect, undefined); assert.equal(f.first.values.size, 0);
  f.fire(f.win, 'scroll'); f.controller.setMode('focus'); assert.equal(f.frames.size, 0);
});

test('explicit preview replays only the selected section with the selected global effect', async () => {
  const f = fixture(); f.flush();
  assert.equal(f.controller.replay('invitation'), true);
  const rise = f.first.animations[0]; assert.equal(rise.frames[0].translate, '0 16px'); assert.equal(rise.options.duration, 650); assert.equal(rise.options.fill, 'none');
  assert.equal(f.second.animations.length, 0); assert.equal(f.first.values.get('--global-scroll-opacity'), '1');
  assert.equal(f.controller.replay('invitation'), true); assert.equal(rise.cancelled, true);
  f.controller.setMode('focus'); f.flush(); assert.equal(f.first.animations[1].cancelled, true);
  assert.equal(f.controller.replay('gallery'), true); const focus = f.second.animations[0]; assert.equal(focus.frames[0].scale, .98); assert.equal(focus.frames[1].filter, 'blur(0px)');
  focus.complete(); await Promise.resolve(); assert.equal(focus.cancelled, false);
  f.controller.destroy();
});

test('preview refuses unsafe or disabled targets and stops for user input, dialogs, and hidden tabs', () => {
  const f = fixture(); f.flush();
  for (const id of ['top', '__proto__', {}, null]) assert.equal(f.controller.replay(id), false);
  const latest = () => f.first.animations.at(-1);
  f.controller.replay('invitation'); const focus = latest(); f.fire(f.doc, 'focusin', f.first); assert.equal(focus.cancelled, true);
  f.controller.replay('invitation'); const pointer = latest(); f.fire(f.doc, 'pointerdown', f.first); assert.equal(pointer.cancelled, true);
  f.controller.replay('invitation'); const hidden = latest(); f.doc.hidden = true; f.fire(f.doc, 'visibilitychange'); assert.equal(hidden.cancelled, true); assert.equal(f.controller.replay('invitation'), false);
  f.doc.hidden = false; f.fire(f.doc, 'visibilitychange'); f.controller.replay('invitation'); const dialog = latest(); f.dialog.open = true; f.fire(f.doc, 'lab:dialog-change'); assert.equal(dialog.cancelled, true);
  f.dialog.open = false; f.controller.setEnabled(false); assert.equal(f.controller.replay('invitation'), false);
  f.controller.setEnabled(true); f.controller.setMode('still'); assert.equal(f.controller.replay('invitation'), false);
  f.controller.setMode('signature'); assert.equal(f.controller.replay('invitation'), false);
  f.controller.destroy();
});

test('scroll demo can replay an already read unchanged mode then leave all content readable on cancel', () => {
  for (const mode of SCROLL_EFFECTS) {
    const f = fixture({ mode });
    f.first.parentElement.top = 0; f.second.parentElement.top = 0; f.fire(f.win, 'scroll'); f.flush();
    assert.equal(f.first.values.get('--global-scroll-opacity'), '1');
    f.first.parentElement.top = 640; f.second.parentElement.top = 1400;
    const restore = f.controller.prepareDemo('motion');
    if (!['signature', 'still'].includes(mode)) assert.ok(Number(f.first.values.get('--global-scroll-opacity')) < 1);
    restore(); restore();
    assert.equal(f.first.values.get('--global-scroll-opacity'), '1');
    assert.equal(f.second.values.get('--global-scroll-opacity'), '1');
    assert.equal(f.frames.size, 0);
    f.fire(f.win, 'scroll'); f.flush();
    assert.equal(f.first.values.get('--global-scroll-opacity'), '1');
    assert.equal(f.second.values.get('--global-scroll-wipe'), '100%');
    f.controller.destroy();
  }
});

test('preparing a demo never reenables disabled or reduced scroll effects', () => {
  for (const condition of ['disabled', 'reduced', 'hidden', 'dialog']) {
    const f = fixture({ mode: 'unveil' }); f.flush();
    if (condition === 'disabled') f.controller.setEnabled(false);
    if (condition === 'reduced') f.reduced.matches = true;
    if (condition === 'hidden') f.doc.hidden = true;
    if (condition === 'dialog') f.dialog.open = true;
    const restore = f.controller.prepareDemo('motion');
    assert.equal(f.first.values.get('--global-scroll-opacity'), '1'); assert.equal(f.frames.size, 0);
    restore(); f.controller.destroy();
  }
});
