import assert from 'node:assert/strict';
import test from 'node:test';
import { theme as stars, sceneProgress, constellationPose, mountTheme as mountStars } from '../themes/d.mjs';
import { theme as table, tableProgress, tablePhotoPose, mountTheme as mountTable } from '../themes/e.mjs';

function element(top = 0, height = 480) {
  const node = new EventTarget();
  const values = new Map(), classes = new Set();
  Object.assign(node, {
    top, height, dataset: {},
    style: {
      setProperty: (key, value) => values.set(key, value),
      removeProperty: key => values.delete(key),
      getPropertyValue: key => values.get(key) || '',
    },
    classList: {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
    },
    getBoundingClientRect: () => ({ top: node.top, height: node.height, width: 390 }),
    contains: value => value === node || node.children?.includes(value),
    querySelectorAll: () => node.children || [],
    values,
  });
  return node;
}

function environment({ reduced = false, width = 390, count = 6 } = {}) {
  const body = element(), hero = element(0, 844), story = element(950), storyEntry = element(1180), gallery = element(1700), grid = element(1900);
  grid.children = Array.from({ length: count }, () => element());
  const doc = new EventTarget(), win = new EventTarget(), media = new EventTarget();
  const frames = new Map(), observers = [];
  let sequence = 0;
  Object.assign(media, { matches: reduced });
  Object.assign(doc, {
    body, hidden: false, modal: false,
    querySelector: selector => ({ '.hero': hero, '#our-story': story, '.story-entry': storyEntry, '#gallery': gallery, '#gallery-grid': grid }[selector] || (selector === 'dialog[open]' && doc.modal ? {} : null)),
  });
  Object.assign(win, {
    innerWidth: width, innerHeight: 844,
    matchMedia: () => media,
    requestAnimationFrame: callback => { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
      observe(target, options) { this.target = target; this.options = options; }
      disconnect() { this.disconnected = true; }
    },
  });
  function tick() {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(0));
  }
  return { doc, win, media, body, hero, story, storyEntry, gallery, grid, frames, observers, tick };
}

test('D and E provide distinct, decorative, self-contained visual material', () => {
  assert.notEqual(stars.name, table.name);
  assert.match(stars.storyDecor, /d-story-thread/);
  assert.match(table.storyDecor, /e-cup-line/);
  for (const theme of [stars, table]) {
    for (const field of ['heroDecor', 'storyDecor', 'galleryDecor']) {
      assert.match(theme[field], /aria-hidden="true"/);
      assert.doesNotMatch(theme[field], /<(?:button|a|script|iframe)\b|https?:\/\//i);
    }
  }
});

test('story progress settles at the viewport and is safe for invalid geometry', () => {
  for (const progress of [sceneProgress, tableProgress]) {
    assert.equal(progress(1200, 844), 0);
    assert.equal(progress(0, 844), 1);
    assert.equal(progress(-10000, 844), 1);
    assert.equal(progress(10, 0), 1);
    assert.equal(progress(Number.NaN, 844), 1);
    const samples = [900, 750, 600, 450, 300, 150].map(top => progress(top, 844));
    assert.ok(samples.every((value, i) => i === 0 || value >= samples[i - 1]));
  }
});

test('gallery motion settles to identity and keeps small/one-photo layouts stable', () => {
  for (const [pose, identity] of [
    [constellationPose, { x: 0, y: 0, rotation: 0 }],
    [tablePhotoPose, { x: 0, y: 0, rotation: 0, scale: 1 }],
  ]) {
    for (let i = 0; i < 20; i++) {
      const settled = pose(i, 20, 1);
      for (const key of Object.keys(identity)) assert.ok(Math.abs(settled[key] - identity[key]) < .0001);
      assert.deepEqual(pose(i, 20, 0, true), identity);
      assert.deepEqual(pose(0, 1, 0), identity);
      const entry = pose(i, 20, 0);
      assert.ok(Math.abs(entry.rotation) <= 6);
      assert.ok(Math.abs(entry.x) <= 14);
    }
  }
});

for (const [name, mount, prefix] of [['D', mountStars, 'd'], ['E', mountTable, 'e']]) {
  test(`${name}: coalesces scroll work, settles photos, and never hides them again`, () => {
    const env = environment();
    const controller = mount(env);
    assert.equal(env.frames.size, 1);
    env.win.dispatchEvent(new Event('scroll'));
    env.win.dispatchEvent(new Event('scroll'));
    assert.equal(env.frames.size, 1);
    env.tick();
    assert.ok(env.body.classList.contains(`theme-${prefix}-motion`));
    const first = env.grid.children[0];
    assert.notEqual(first.style.getPropertyValue(`--${prefix}-photo-rotation`), '0.00deg');
    env.gallery.top = 0; env.grid.top = 0;
    env.win.dispatchEvent(new Event('scroll'));
    env.tick();
    assert.equal(Number.parseFloat(first.style.getPropertyValue(`--${prefix}-photo-rotation`)), 0);
    env.gallery.top = 1700; env.grid.top = 1900;
    env.win.dispatchEvent(new Event('scroll'));
    env.tick();
    assert.equal(Number.parseFloat(first.style.getPropertyValue(`--${prefix}-photo-rotation`)), 0);
    controller.destroy();
  });

  test(`${name}: drawing progress follows visible artwork instead of an earlier heading`, () => {
    const env = environment();
    env.story.top = 300;
    env.storyEntry.top = 760;
    env.gallery.top = 300;
    env.grid.top = 760;
    const controller = mount(env);
    env.tick();
    const before = Number(env.story.style.getPropertyValue(`--${prefix}-story-progress`));
    assert.ok(before >= 0 && before < .2);
    assert.notEqual(Number.parseFloat(env.grid.children[0].style.getPropertyValue(`--${prefix}-photo-rotation`)), 0);
    env.storyEntry.top = 300; env.grid.top = 300;
    env.win.dispatchEvent(new Event('scroll'));
    env.tick();
    assert.ok(Number(env.story.style.getPropertyValue(`--${prefix}-story-progress`)) > .98);
    controller.destroy();
  });

  test(`${name}: off/reduced motion removes transformations and cancels queued work`, () => {
    const env = environment();
    const controller = mount(env);
    env.tick();
    controller.setEnabled(false);
    assert.equal(env.frames.size, 0);
    assert.equal(env.grid.children[0].values.size, 0);
    assert.equal(env.hero.values.size, 0);
    assert.ok(!env.body.classList.contains(`theme-${prefix}-motion`));
    env.win.dispatchEvent(new Event('scroll'));
    assert.equal(env.frames.size, 0);
    controller.setEnabled(true);
    assert.equal(env.frames.size, 1);
    env.media.matches = true;
    env.media.dispatchEvent(new Event('change'));
    assert.equal(env.frames.size, 0);
    assert.ok(!env.body.classList.contains(`theme-${prefix}-motion`));
    controller.destroy();
  });

  test(`${name}: initial reduced motion never queues animation`, () => {
    const env = environment({ reduced: true });
    const controller = mount(env);
    assert.equal(env.frames.size, 0);
    assert.equal(env.grid.children[0].values.size, 0);
    env.media.matches = false;
    env.media.dispatchEvent(new Event('change'));
    assert.equal(env.frames.size, 1);
    controller.destroy();
  });

  test(`${name}: hidden tabs and open dialogs suspend work and resume on close`, () => {
    const env = environment();
    const controller = mount(env);
    env.doc.hidden = true;
    env.doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(env.frames.size, 0);
    env.win.dispatchEvent(new Event('scroll'));
    assert.equal(env.frames.size, 0);
    env.doc.hidden = false;
    env.doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(env.frames.size, 1);
    env.doc.modal = true;
    env.observers.find(observer => observer.target === env.body).callback();
    assert.equal(env.frames.size, 0);
    env.win.dispatchEvent(new Event('scroll'));
    assert.equal(env.frames.size, 0);
    env.doc.modal = false;
    env.doc.dispatchEvent(new Event('close'));
    assert.equal(env.frames.size, 1);
    controller.destroy();
  });

  test(`${name}: refresh includes new photos; destroy removes every listener/observer`, () => {
    const env = environment({ count: 1 });
    const controller = mount(env);
    env.tick();
    const photo = element();
    env.grid.children.push(photo);
    env.observers.find(observer => observer.target === env.grid).callback();
    env.tick();
    assert.ok(photo.values.size > 0);
    controller.destroy();
    controller.destroy();
    assert.equal(photo.values.size, 0);
    assert.equal(env.frames.size, 0);
    assert.ok(env.observers.every(observer => observer.disconnected));
    env.win.dispatchEvent(new Event('scroll'));
    env.win.dispatchEvent(new Event('resize'));
    env.doc.dispatchEvent(new Event('close'));
    env.media.dispatchEvent(new Event('change'));
    controller.refresh();
    controller.setEnabled(true);
    assert.equal(env.frames.size, 0);
  });
}
