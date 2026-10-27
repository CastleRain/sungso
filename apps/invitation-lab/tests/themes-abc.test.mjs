import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneDriver, entryProgress, threadPath } from '../themes/a.mjs';
import { fanPose } from '../themes/b.mjs';
import { lightPose } from '../themes/c.mjs';

class Events {
  listeners = new Map();
  addEventListener(name, callback) {
    const entries = this.listeners.get(name) || new Set();
    entries.add(callback); this.listeners.set(name, entries);
  }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  fire(name) { for (const callback of this.listeners.get(name) || []) callback(); }
  count() { return [...this.listeners.values()].reduce((sum, list) => sum + list.size, 0); }
}
function environment() {
  const doc = new Events();
  doc.hidden = false;
  let open = false;
  const classes = new Set();
  doc.body = { classList: {
    toggle(name, on) { on ? classes.add(name) : classes.delete(name); },
    remove(name) { classes.delete(name); },
  } };
  doc.querySelector = selector => selector === 'dialog[open]' ? open : null;
  const win = new Events();
  const media = new Events(); media.matches = false;
  win.matchMedia = () => media;
  let id = 0;
  const frames = new Map();
  win.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
  win.cancelAnimationFrame = key => frames.delete(key);
  return { doc, win, media, frames, classes, dialog(value) { open = value; }, flush() {
    const current = [...frames.values()]; frames.clear(); current.forEach(fn => fn());
  } };
}

test('scroll driver coalesces wheel events, idles while hidden, and resumes after a dialog', () => {
  const env = environment();
  let renders = 0, measures = 0, resets = 0;
  const scene = createSceneDriver({ ...env, render: () => renders++, measure: () => measures++, reset: () => resets++, className: 'test-motion' });
  scene.setEnabled(true);
  for (let i = 0; i < 25; i++) env.win.fire('scroll');
  assert.equal(env.frames.size, 1);
  env.flush(); assert.equal(renders, 1);
  env.dialog(true); env.win.fire('scroll'); assert.equal(env.frames.size, 0);
  env.dialog(false); env.doc.fire('close'); env.flush(); assert.equal(renders, 2);
  env.win.fire('scroll'); env.doc.hidden = true; env.doc.fire('visibilitychange');
  assert.equal(env.frames.size, 0);
  env.win.fire('scroll'); assert.equal(env.frames.size, 0);
  env.doc.hidden = false; env.doc.fire('visibilitychange'); env.flush(); assert.equal(renders, 3);
  scene.setEnabled(false); env.win.fire('scroll'); assert.equal(env.frames.size, 0);
  assert.equal(resets, 1); assert.ok(measures >= 3);
  scene.destroy(); assert.equal(env.doc.count() + env.win.count() + env.media.count(), 0);
});

test('reduced motion overrides requested activation and cleanup cancels an outstanding frame', () => {
  const env = environment(); env.media.matches = true;
  let draws = 0, resets = 0;
  const scene = createSceneDriver({ ...env, render: () => draws++, reset: () => resets++, className: 'test-motion' });
  scene.setEnabled(true);
  assert.equal(env.frames.size, 0); assert.equal(resets, 1); assert.equal(env.classes.size, 0);
  env.media.matches = false; env.media.fire('change'); assert.equal(env.frames.size, 1);
  scene.destroy(); env.flush(); assert.equal(draws, 0); assert.equal(env.classes.size, 0);
  scene.setEnabled(true); assert.equal(env.classes.size, 0);
  scene.refresh(); scene.queue(); assert.equal(env.frames.size, 0);
});

test('scene progress finishes before a section reaches the top and remains clamped for direct links', () => {
  for (const height of [568, 800, 844, 932]) {
    assert.equal(entryProgress(height * 2, height), 0);
    assert.equal(entryProgress(-height, height), 1);
    let prior = -1;
    for (let top = height; top >= 0; top -= 8) {
      const current = entryProgress(top, height);
      assert.ok(current >= prior && current <= 1); prior = current;
    }
  }
});

test('photograph fans converge to accessible natural layout for one, seven, or twenty items', () => {
  for (const count of [1, 7, 20]) for (let index = 0; index < count; index++) {
    const box = { x: (index % 3) * 110, y: Math.floor(index / 3) * 140, width: 100, gridWidth: 320 };
    const first = fanPose(index, count, box, 0);
    assert.ok(Math.abs(first.rotation) <= 6);
    assert.ok(Number.isFinite(first.x) && Number.isFinite(first.y));
    const last = fanPose(index, count, box, 1);
    assert.equal(Math.abs(last.x), 0); assert.equal(Math.abs(last.y), 0);
    assert.equal(Math.abs(last.rotation), 0); assert.equal(last.scale, 1);
  }
});

test('light reveal never hides most of a photograph and leaves no illuminated overlay after settling', () => {
  for (let p = 0; p <= 1; p += .05) {
    const pose = lightPose(p);
    assert.ok(pose.inset >= 0 && pose.inset <= 5);
    assert.ok(pose.opacity >= 0 && pose.opacity <= .28);
  }
  const last = lightPose(1);
  assert.equal(last.inset, 0); assert.ok(last.opacity < 1e-10);
});

test('line geometry retains provided section anchors instead of inventing fixed page heights', () => {
  const points = [{x:180,y:812},{x:13,y:870},{x:13,y:1152},{x:347,y:1208}];
  const d = threadPath(points);
  assert.ok(d.startsWith('M 180.0 812.0'));
  assert.ok(d.endsWith('347.0 1208.0'));
  assert.equal(threadPath([]), '');
  assert.equal((d.match(/ C /g) || []).length, points.length - 1);
});
