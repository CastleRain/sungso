import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../js/intro-boot.js', import.meta.url), 'utf8');

function fixture({ opening = 'ink', disabled = false, reduced = false, hash = '#top', restored = false, broken = false } = {}) {
  const classes = new Set(), animations = [], timers = new Map(), frames = new Map();
  let serial = 0, finished = 0, focusReturned = false;
  const classList = {
    add: (...items) => items.forEach(item => classes.add(item)),
    remove: (...items) => items.forEach(item => classes.delete(item)),
    contains: item => classes.has(item)
  };
  class Node extends EventTarget {
    constructor(tag = 'g') { super(); this.tagName = tag; this.children = []; this.attributes = {}; }
    setAttribute(key, value) { this.attributes[key] = value; }
    append(node) {
      if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(item => item !== node);
      this.children.push(node); node.parentElement = this;
    }
    querySelectorAll() { return this.children.filter(node => node.attributes.class?.includes('opening-line')); }
    animate(keys, timing) {
      if (broken) throw Error('Animation unavailable');
      const animation = { node: this, keys, timing, canceled: false, cancel() { this.canceled = true; } };
      animations.push(animation); return animation;
    }
  }
  const svg = new Node('svg'), phrase = new Node('h1'), skip = new Node('button');
  phrase.append(svg);
  for (let index = 0; index < 19; index++) svg.append(new Node());
  const traces = Array.from({ length: 19 }, () => new Node('path'));
  const seals = Array.from({ length: 19 }, () => new Node('rect'));
  const document = Object.assign(new EventTarget(), {
    documentElement: { classList, dataset: {} }, readyState: 'loading', hidden: false, activeElement: null,
    createElementNS: (_, tag) => new Node(tag),
    querySelector: selector => selector === '#intro-skip' ? skip : selector === '.hero-handwriting' ? svg : { focus() { focusReturned = true; } },
    querySelectorAll: selector => selector.includes('.ink-trace') ? traces : seals
  });
  const media = Object.assign(new EventTarget(), { matches: reduced });
  const window = new EventTarget();
  document.addEventListener('sungso:intro-finished', () => finished++);
  vm.runInNewContext(source, {
    document, window, Event, AbortController, URLSearchParams,
    localStorage: { getItem: () => disabled ? 'off' : null },
    performance: { getEntriesByType: () => [{ type: restored ? 'back_forward' : 'navigate' }] },
    matchMedia: () => media, location: { hash, search: `?opening=${encodeURIComponent(opening)}` },
    addEventListener: window.addEventListener.bind(window),
    setTimeout: (fn, delay) => { const id = ++serial; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { const id = ++serial; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    getComputedStyle: () => ({ getPropertyValue: key => ({ '--ink-end': '2100ms', '--ink-delay': '40ms', '--ink-duration': '190ms' })[key] })
  });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  const parsed = () => { document.readyState = 'interactive'; document.dispatchEvent(new Event('readystatechange')); flush(); };
  const expire = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(({ fn }) => fn()); };
  const fire = (target, type, data = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.entries(data).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
    target.dispatchEvent(event); return event;
  };
  return { document, window, media, classes, animations, timers, frames, parsed, expire, flush, fire, svg, phrase, skip,
    get finished() { return finished; }, get focusReturned() { return focusReturned; } };
}

test('each opening keeps nineteen actual ink masks and releases the cover without its app module', () => {
  for (const opening of ['ink', 'flow', 'bloom', 'light']) {
    const f = fixture({ opening }); f.parsed();
    assert.equal(f.window.sungsoIntro.effect, opening);
    assert.ok(f.classes.has('intro-running'));
    assert.equal(f.animations.filter(animation => 'strokeDashoffset' in animation.keys[0]).length, 19);
    assert.equal(f.svg.children.length, 2);
    assert.deepEqual(f.svg.children.map(group => group.children.length), [5, 14]);
    assert.ok([...f.timers.values()].every(timer => timer.delay <= 4500));
    f.expire();
    assert.ok(f.classes.has('intro-complete'));
    assert.ok(!f.classes.has('intro-locked'));
    assert.ok(f.animations.every(animation => animation.canceled));
    assert.equal(f.finished, 1);
  }
});

test('modes provide distinct line motion, focus bloom and light reveal around the same handwriting', () => {
  const flow = fixture({ opening: 'flow' }); flow.parsed();
  assert.equal(flow.animations.filter(animation => animation.keys[0].transform === 'translateY(420px)').length, 2);
  const bloom = fixture({ opening: 'bloom' }); bloom.parsed();
  assert.equal(bloom.animations.filter(animation => animation.keys[0].filter === 'blur(100px)').length, 2);
  const light = fixture({ opening: 'light' }); light.parsed();
  assert.equal(light.animations.filter(animation => 'clipPath' in animation.keys[0]).length, 1);
  const invalid = fixture({ opening: '<script>evil</script>' }); invalid.parsed();
  assert.equal(invalid.window.sungsoIntro.effect, 'ink');
});

test('repeated live choices cancel old motion and reuse wrappers without reloading or touching music', () => {
  const f = fixture(); f.parsed(); const previous = [...f.animations];
  assert.equal(f.window.sungsoIntro.replay('bloom'), true); f.flush();
  assert.ok(previous.every(animation => animation.canceled));
  assert.equal(f.svg.children.length, 2);
  assert.equal(f.timers.size, 1);
  assert.equal(f.window.sungsoIntro.running, true);
  f.window.sungsoIntro.finish();
  assert.equal(f.window.sungsoIntro.running, false);
  assert.equal(f.timers.size, 0);
  assert.doesNotMatch(source, /location\.reload|querySelector\(['"]audio|\.play\(/);
});

test('deep links and restored pages stay static but retain an explicit replay controller', () => {
  for (const options of [{ hash: '#accounts' }, { restored: true }]) {
    const f = fixture(options); f.parsed();
    assert.equal(f.animations.length, 0); assert.equal(f.timers.size, 0);
    assert.equal(f.window.sungsoIntro.replay('flow'), true); f.flush();
    assert.ok(f.classes.has('intro-running'));
  }
});

test('reduced motion, effects-off and hidden pages never lock on explicit replay', () => {
  for (const options of [{ disabled: true }, { reduced: true }]) {
    const f = fixture(options); f.parsed();
    assert.equal(f.window.sungsoIntro.replay('light'), false);
    assert.equal(f.animations.length, 0); assert.equal(f.timers.size, 0);
    assert.ok(!f.classes.has('intro-locked'));
  }
  const f = fixture(); f.parsed(); f.window.sungsoIntro.finish();
  f.document.hidden = true;
  assert.equal(f.window.sungsoIntro.replay('flow'), false);
  f.document.hidden = false; f.classes.add('motion-off');
  assert.equal(f.window.sungsoIntro.replay('flow'), false);
});

test('skip, Escape, focus outside, hidden tabs and changed motion preference end any opening safely', () => {
  for (const action of ['skip', 'escape', 'outside', 'hidden', 'reduced']) {
    const f = fixture({ opening: 'light' }); f.parsed();
    if (action === 'skip') { f.document.activeElement = { id: 'intro-skip' }; f.fire(f.skip, 'click'); assert.ok(f.focusReturned); }
    if (action === 'escape') f.fire(f.document, 'keydown', { key: 'Escape', target: { closest: () => null } });
    if (action === 'outside') f.fire(f.document, 'focusin', { target: { closest: () => null } });
    if (action === 'hidden') { f.document.hidden = true; f.fire(f.document, 'visibilitychange'); }
    if (action === 'reduced') { f.media.matches = true; f.fire(f.media, 'change'); }
    assert.ok(!f.classes.has('intro-locked')); assert.equal(f.timers.size, 0);
    assert.ok(f.animations.every(animation => animation.canceled));
  }
});

test('slow parsing and animation errors cannot leave a cover locked or revive an expired cycle', () => {
  const delayed = fixture(); delayed.expire(); delayed.parsed();
  assert.equal(delayed.animations.length, 0); assert.ok(!delayed.classes.has('intro-locked'));
  const broken = fixture({ broken: true }); broken.parsed();
  assert.ok(broken.classes.has('intro-complete')); assert.equal(broken.timers.size, 0);
  const stale = fixture(); stale.document.readyState = 'interactive'; stale.fire(stale.document, 'readystatechange');
  const oldFrame = [...stale.frames.values()][0];
  stale.window.sungsoIntro.replay('flow'); oldFrame(); stale.flush();
  assert.equal(stale.window.sungsoIntro.effect, 'flow'); assert.equal(stale.window.sungsoIntro.running, true);
});
