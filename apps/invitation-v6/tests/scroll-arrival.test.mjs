import test from 'node:test';
import assert from 'node:assert/strict';
import { setupScrollArrival } from '../js/scroll-arrival.mjs';

function harness({ enabled = true, top = 880 } = {}) {
  const events = target => Object.assign(target, {
    listeners: new Map(),
    addEventListener(name, handler) { this.listeners.set(name, handler); },
    emit(name, data) { this.listeners.get(name)?.(data); },
  });
  function element() {
    const classes = new Set(), values = new Map();
    return {
      classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: n => classes.delete(n),
        contains: n => classes.has(n), toggle: (n, on) => on ? classes.add(n) : classes.delete(n) },
      style: { setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key), get: key => values.get(key) },
      parentElement: { closest: () => null }, contains: node => node === child,
      getBoundingClientRect: () => ({ top: top + Number.parseFloat(target.style.get('--arrival-y') || 0), width: 330, height: 240 }),
    };
  }
  const child = {}, target = element(), root = element(), hero = element();
  hero.getBoundingClientRect = () => ({ top: -200, height: 1000 });
  root.classList.add('intro-complete');
  let modal = false, next = 0;
  const frames = new Map();
  const doc = events({ documentElement: root, hidden: false, activeElement: null,
    querySelectorAll: () => [target], querySelector: selector => selector === '.hero' ? hero : modal ? {} : null });
  const win = events({ innerHeight: 1000,
    requestAnimationFrame: fn => { frames.set(++next, fn); return next; },
    cancelAnimationFrame: id => frames.delete(id) });
  const motion = setupScrollArrival({ enabled, doc, win });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  return { target, root, hero, doc, win, motion, child, frames, flush,
    move(value) { top = value; win.emit('scroll'); flush(); }, setModal(value) { modal = value; } };
}

test('scroll advances arrival without feedback drift, then keeps read content visible', () => {
  const h = harness();
  const initial = Number(h.target.style.get('--arrival-opacity'));
  h.move(880);
  assert.ok(Math.abs(Number(h.target.style.get('--arrival-opacity')) - initial) < .001);
  h.move(760);
  assert.ok(Number(h.target.style.get('--arrival-opacity')) > initial);
  assert.equal(h.target.classList.contains('is-visible'), true);
  h.move(610);
  assert.equal(h.target.classList.contains('arrival-pending'), false);
  h.move(1100);
  assert.equal(h.target.classList.contains('arrival-pending'), false);
  assert.equal(h.target.classList.contains('is-visible'), true);
});

test('keyboard navigation immediately exposes a focused action', () => {
  const h = harness({ top: 1500 });
  h.doc.emit('focusin', { target: h.child });
  assert.equal(h.target.classList.contains('arrival-pending'), false);
  assert.equal(h.target.classList.contains('is-visible'), true);
});

test('effects off cancels pending work and leaves content and hero readable', () => {
  const h = harness();
  h.win.emit('scroll');
  h.motion.setEnabled(false);
  assert.equal(h.frames.size, 0);
  assert.equal(h.root.classList.contains('scroll-arrivals'), false);
  assert.equal(h.target.classList.contains('arrival-pending'), false);
  assert.equal(h.target.classList.contains('is-visible'), true);
  assert.equal(h.hero.style.get('--hero-drift'), undefined);
  h.move(1000);
  assert.equal(h.frames.size, 0);
});

test('hidden tabs stop frames; dialogs suspend page measurements until close', () => {
  const h = harness();
  const initial = h.target.style.get('--arrival-opacity');
  h.setModal(true); h.move(600);
  assert.equal(h.target.style.get('--arrival-opacity'), initial);
  h.setModal(false); h.doc.emit('close'); h.flush();
  assert.equal(h.target.classList.contains('arrival-pending'), false);
  h.win.emit('scroll'); h.doc.hidden = true; h.doc.emit('visibilitychange');
  assert.equal(h.frames.size, 0);
});

test('direct deep links settle content above the viewport and disabled initial state does not hide it', () => {
  const h = harness({ top: -300 });
  assert.equal(h.target.classList.contains('arrival-pending'), false);
  const reduced = harness({ enabled: false });
  assert.equal(reduced.root.classList.contains('scroll-arrivals'), false);
  assert.equal(reduced.target.classList.contains('is-visible'), true);
});
