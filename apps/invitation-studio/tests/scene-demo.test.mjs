import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneDemo, demoRoute, validDemoRequest } from '../js/scene-demo.mjs';
import { CHOICE_KEYS, DEFAULT_COMPOSITION, SECTION_IDS } from '../js/composition.mjs';

class Events {
  listeners = new Map();
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, detail = {}) { for (const fn of this.listeners.get(type) || []) fn({ type, isTrusted: true, ...detail }); }
}
class Element extends Events {
  constructor(id = '', top = 0, height = 650) { super(); this.id = id; this.top = top; this.height = height; this.hidden = false; this.children = []; this.textContent = ''; this.attributes = new Map(); this.classList = { contains: value => this.classes?.has(value), add: value => { (this.classes ||= new Set()).add(value); }, remove: value => this.classes?.delete(value) }; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  append(...children) { this.children.push(...children); children.forEach(child => { child.parent = this; }); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
  querySelector() { return this.interaction || null; }
}
function fixture({ reduced = false, readiness = Promise.resolve(), staticOff = false } = {}) {
  let time = 0, id = 0, prepared = 0, restored = 0, interacted = 0, interactionRestored = 0, finishCount = 0, replayCount = 0;
  const timers = new Map(), frames = new Map(), states = [], moves = [], doc = new Events(), win = new Events(), media = new Events();
  media.matches = reduced;
  doc.body = new Element('body'); doc.documentElement = new Element('html'); doc.documentElement.scrollHeight = 7200;
  if (staticOff) doc.documentElement.classList.add('motion-off');
  doc.hidden = false; doc.dialog = null;
  doc.createElement = () => new Element();
  doc.querySelector = () => doc.dialog;
  const sections = [...new Set(['top', 'invitation', 'wedding-day', 'location', 'our-story', 'gallery', 'accounts', 'guestbook', ...Object.values(SECTION_IDS)])].map((key, index) => new Element(key, index * 850, 850));
  doc.documentElement.scrollHeight = sections.length * 850;
  sections.forEach(section => {
    section.interaction = new Element('interaction', section.top + 420, 150);
    for (const el of [section, section.interaction]) el.getBoundingClientRect = () => ({ top: el.top - win.scrollY, height: el.height });
  });
  doc.getElementById = key => sections.find(node => node.id === key);
  doc.querySelectorAll = () => sections;
  win.innerHeight = 800; win.scrollY = 0; win.scrollX = 0; win.performance = { now: () => time }; win.matchMedia = () => media;
  win.requestAnimationFrame = fn => { frames.set(++id, fn); return id; }; win.cancelAnimationFrame = key => frames.delete(key);
  win.setTimeout = (fn, delay) => { timers.set(++id, { fn, at: time + delay }); return id; }; win.clearTimeout = key => timers.delete(key);
  win.scrollTo = value => { win.scrollY = value.top; moves.push(value); };
  for (const key of ['localStorage', 'sessionStorage', 'fetch', 'parent', 'location', 'history']) Object.defineProperty(win, key, { get() { throw new Error(`Forbidden demo access ${key}`); } });
  const controller = { composition: DEFAULT_COMPOSITION, whenReady: readiness, refresh() {}, prepareDemo() { prepared++; return () => restored++; }, demoInteraction() { interacted++; return () => interactionRestored++; } };
  const demo = createSceneDemo({ doc, win, controller: () => controller, onState: value => states.push(value), finishOpening: () => finishCount++, replayOpening: () => replayCount++ });
  const step = ms => {
    time += ms;
    const scheduled = [...frames.values()]; frames.clear(); scheduled.forEach(fn => fn(time));
    for (const [key, timer] of [...timers]) if (timer.at <= time) { timers.delete(key); timer.fn(); }
  };
  const complete = () => { for (let n = 0; n < 40; n++) step(100); };
  return { demo, doc, win, media, controller, sections, states, moves, step, complete, get pendingFrames() { return frames.size; }, get pendingTimers() { return timers.size; }, get prepared() { return prepared; }, get restored() { return restored; }, get interacted() { return interacted; }, get interactionRestored() { return interactionRestored; }, get finishCount() { return finishCount; }, get replayCount() { return replayCount; } };
}
const flush = () => Promise.resolve();
test('the optional breath divider demonstrates only the album entrance and cancels on manual input',async()=>{
  const f=fixture();f.controller.composition={...DEFAULT_COMPOSITION,divider:'breath'};
  f.demo.start({requestId:701,key:'divider'});await flush();f.step(16);f.step(100);
  const album=f.doc.getElementById('gallery');
  assert.ok(f.moves[0].top>=album.top-f.win.innerHeight);
  assert.ok(f.moves[0].top<album.top);assert.ok(f.prepared>0);
  f.win.emit('wheel');assert.equal(f.pendingFrames,0);assert.equal(f.interacted,0);assert.equal(f.restored,1);f.demo.destroy();
});

test('all choices have bounded scene routes, with a common motion route and readable appearance positions', () => {
  const geometry = { top: 1000, height: 700, nextTop: 1700, interactionTop: 1400, viewport: 800, maxScroll: 4000 };
  for (const key of CHOICE_KEYS) {
    const route = demoRoute({ ...geometry, key });
    assert.ok(route.start >= 0 && route.end <= 4000, key);
    assert.ok(route.duration === 0 || route.duration >= 2000 && route.duration <= 4000, key);
  }
  assert.deepEqual(demoRoute({ ...geometry, key: 'palette' }), demoRoute({ ...geometry, key: 'font' }));
  assert.equal(demoRoute({ ...geometry, key: 'motion' }).end, 1680);
  assert.equal(demoRoute({ ...geometry, key: 'navigation' }).start, 980);
  assert.equal(demoRoute({ ...geometry, key: 'gifting' }).interactionAt, 1600);
  assert.equal(demoRoute({ key: 'motion', top: 0, height: 600, viewport: 800, maxScroll: 0 }).end, 0);
});

test('demo request accepts only the known keys and safe request identities', () => {
  for (const key of CHOICE_KEYS) assert.equal(validDemoRequest({ key, requestId: 1 }), true);
  for (const request of [null, {}, { key: 'delete', requestId: 1 }, { key: '__proto__', requestId: 1 }, { key: 'motion', requestId: -1 }, { key: 'motion', requestId: '2' }, { key: 'motion', requestId: Infinity }]) assert.equal(validDemoRequest(request), false);
});

test('actual viewport moves once through a scene, then leaves no ongoing animation frame', async () => {
  const h = fixture(); h.demo.start({ key: 'motion', requestId: 1 }); await flush(); h.complete();
  assert.equal(h.states.at(-1).phase, 'complete'); assert.equal(h.pendingFrames, 0);
  assert.ok(h.moves.length > 10); assert.ok(h.moves.every(move => move.behavior === 'instant'));
  assert.equal(h.moves.at(-1).top, 1680); assert.equal(h.prepared, 1); assert.equal(h.restored, 1);
  const count = h.moves.length; h.step(10000); assert.equal(h.moves.length, count); assert.equal(h.pendingTimers, 0);
});

test('all section choices reach their intended scene and only safe visual interactions run', async () => {
  for (const key of CHOICE_KEYS) {
    const h = fixture(); assert.equal(h.demo.start({ key, requestId: 2 }), true); await flush(); h.complete();
    assert.equal(h.states.at(-1).key, key);
    assert.equal(h.states.at(-1).phase, ['palette', 'font', 'spacing', 'divider', 'textSize', 'lineSpace', 'photoTone', 'coverFocus', 'albumColumns', 'albumRatio', 'calendarMark'].includes(key) ? 'static' : 'complete', key);
    assert.equal(h.interacted, ['album', 'arrival', 'gifting', 'wishes', 'guestGuide'].includes(key) ? 1 : 0, key);
    assert.equal(h.interactionRestored, h.interacted, key);
    assert.equal(h.replayCount, key === 'opening' ? 1 : 0, key);
    assert.ok(SECTION_IDS[key]); h.demo.destroy();
  }
});

test('photo and calendar details bring the changed content into view rather than just the section heading', async () => {
  for (const key of ['photoTone', 'albumColumns', 'albumRatio', 'calendarMark']) {
    const h = fixture(); h.demo.start({ key, requestId: 3 }); await flush();
    const target = h.doc.getElementById(SECTION_IDS[key]);
    assert.equal(h.moves.at(-1).top, target.interaction.top - 132, key);
    assert.equal(h.interacted, 0); assert.equal(h.pendingFrames, 0); h.demo.destroy();
  }
});

test('late readiness from a superseded choice cannot restart it', async () => {
  let release;
  const h = fixture({ readiness: new Promise(resolve => { release = resolve; }) });
  h.demo.start({ key: 'story', requestId: 1 });
  h.controller.whenReady = Promise.resolve(); h.demo.start({ key: 'date', requestId: 2 }); await flush(); h.step(20);
  release(); await flush(); h.complete();
  assert.equal(h.states.filter(state => state.phase === 'playing' && state.requestId === 1).length, 0);
  assert.equal(h.states.at(-1).requestId, 2); assert.equal(h.prepared, 1);
});

test('trusted user input cancels waiting and late fonts cannot move the document', async () => {
  let release;
  const h = fixture({ readiness: new Promise(resolve => { release = resolve; }) });
  h.demo.start({ key: 'motion', requestId: 1 }); h.win.emit('wheel'); release(); await flush(); h.complete();
  assert.equal(h.moves.length, 0); assert.equal(h.states.at(-1).phase, 'cancelled'); assert.equal(h.pendingFrames, 0);
  assert.equal(h.states.at(-1).reason, 'user-input');
});

test('capture cancellation restores recipient or photo state before the real gesture proceeds', async () => {
  for (const key of ['album', 'arrival', 'gifting', 'wishes']) {
    const h = fixture(); h.demo.start({ key, requestId: 3 }); await flush();
    h.step(20); h.step(1700); assert.equal(h.interacted, 1);
    h.win.emit('pointerdown'); assert.equal(h.interactionRestored, 1); assert.equal(h.restored, 1);
    const count = h.moves.length; h.complete(); assert.equal(h.moves.length, count); assert.equal(h.states.at(-1).phase, 'cancelled');
  }
});

test('motion reduction and effects-off show a static readable target without replay or interactions', async () => {
  for (const options of [{ reduced: true }, { staticOff: true }]) {
    for (const key of ['motion', 'opening', 'wishes']) {
      const h = fixture(options); h.demo.start({ key, requestId: 4 }); await flush(); h.complete();
      assert.equal(h.states.at(-1).phase, 'static'); assert.equal(h.replayCount, 0); assert.equal(h.interacted, 0); assert.equal(h.pendingFrames, 0);
      assert.equal(h.moves.length, 1); assert.equal(h.moves[0].top, Math.max(0, h.doc.getElementById(SECTION_IDS[key]).top - 20));
    }
  }
});

test('open dialogs are not closed, submitted, focused or changed by a blocked request', async () => {
  const h = fixture(); const draft = { value: '작성 중인 축하글', close() { throw new Error('must not close'); } }; h.doc.dialog = draft;
  h.demo.start({ key: 'wishes', requestId: 5 }); await flush(); h.complete();
  assert.equal(h.doc.dialog, draft); assert.equal(draft.value, '작성 중인 축하글'); assert.equal(h.moves.length, 0); assert.equal(h.finishCount, 0);
  assert.equal(h.states.at(-1).phase, 'blocked'); assert.equal(h.states.at(-1).reason, 'dialog');
});

test('hidden page, dialog and reduced-motion changes stop a running demo immediately', async () => {
  for (const reason of ['hidden', 'dialog', 'motion-reduced', 'motion-off']) {
    const h = fixture(); h.demo.start({ key: 'motion', requestId: 6 }); await flush(); h.step(20); h.step(100);
    if (reason === 'hidden') { h.doc.hidden = true; h.doc.emit('visibilitychange'); }
    if (reason === 'dialog') { h.doc.dialog = {}; h.doc.emit('lab:dialog-change'); }
    if (reason === 'motion-reduced') { h.media.matches = true; h.media.emit('change'); }
    if (reason === 'motion-off') { h.doc.documentElement.classList.add('motion-off'); h.doc.emit('lab:motion-change'); }
    const count = h.moves.length; h.complete(); assert.equal(h.moves.length, count); assert.equal(h.states.at(-1).reason, reason); assert.equal(h.pendingFrames, 0);
  }
});

test('unresolved layout readiness has a bound and keyboard cancellation leaves no timers', async () => {
  const h = fixture({ readiness: new Promise(() => {}) }); h.demo.start({ key: 'intro', requestId: 7 }); h.step(1801); h.step(20);
  assert.equal(h.states.at(-1).phase, 'playing'); h.win.emit('keydown'); h.step(10000);
  assert.equal(h.pendingFrames, 0); assert.equal(h.pendingTimers, 0);
});

test('synthetic events cannot abort a request; destruction removes every listener and status node', async () => {
  const h = fixture(); h.demo.start({ key: 'opening', requestId: 8 }); await flush(); h.step(20);
  h.win.emit('pointerdown', { isTrusted: false }); assert.equal(h.states.at(-1).phase, 'playing');
  h.demo.destroy(); h.complete();
  assert.equal(h.doc.body.children.length, 0); assert.equal(h.pendingFrames, 0); assert.equal(h.pendingTimers, 0);
  assert.equal([...h.win.listeners.values()].reduce((n, set) => n + set.size, 0), 0);
  assert.equal([...h.doc.listeners.values()].reduce((n, set) => n + set.size, 0), 0);
  assert.equal(h.demo.start({ key: 'motion', requestId: 9 }), false);
});

test('a loading visible image waits briefly and a late image cannot restart a cancelled preview', async () => {
  const h = fixture(), image = new Element('photo'); image.complete = false; image.getBoundingClientRect = () => ({ top: 200, bottom: 700 });
  h.sections[5].querySelectorAll = () => [image];
  h.demo.start({ key: 'album', requestId: 10 }); await flush(); h.step(100);
  assert.equal(h.prepared, 0); assert.equal(h.states.at(-1).phase, 'preparing');
  h.win.emit('touchstart'); image.emit('load'); h.complete();
  assert.equal(h.prepared, 0); assert.equal(h.states.at(-1).phase, 'cancelled');
  assert.equal([...image.listeners.values()].reduce((n, set) => n + set.size, 0), 0);

  const bounded = fixture(), slowImage = new Element('slow-photo'); slowImage.complete = false; slowImage.getBoundingClientRect = () => ({ top: 200, bottom: 700 });
  bounded.sections[5].querySelectorAll = () => [slowImage];
  bounded.demo.start({ key: 'album', requestId: 11 }); await flush(); bounded.step(801); bounded.step(20); bounded.complete();
  assert.equal(bounded.states.at(-1).phase, 'complete'); assert.equal(bounded.interacted, 1);
});

test('grid album routes to the actual visible grid rather than the hidden feature', async () => {
  const h = fixture(); h.controller.composition = { ...DEFAULT_COMPOSITION, album: 'grid' };
  const album = h.sections[5]; let requested;
  album.querySelector = selector => { requested = selector; return album.interaction; };
  h.demo.start({ key: 'album', requestId: 12 }); await flush(); h.complete();
  assert.equal(requested, '#gallery-grid'); assert.equal(h.moves.at(-1).top, album.top + 420 - 150);
});

test('an unavailable visual hook stops safely without retaining an animation or form state', async () => {
  const h = fixture(); h.controller.demoInteraction = () => { throw new Error('visual controller unavailable'); };
  h.demo.start({ key: 'gifting', requestId: 13 }); await flush(); h.complete();
  assert.equal(h.states.at(-1).phase, 'blocked'); assert.equal(h.states.at(-1).reason, 'unavailable'); assert.equal(h.pendingFrames, 0); assert.equal(h.restored, 1);
});

test('scroll demo speed changes only travel time, keeping a consistent comparison route and bounded values', () => {
  const geometry = { key: 'motion', top: 1000, height: 700, nextTop: 1700, viewport: 800, maxScroll: 4000 };
  const slow = demoRoute({ ...geometry, speed: .5 }), normal = demoRoute(geometry), fast = demoRoute({ ...geometry, speed: 1.5 });
  assert.equal(slow.duration, 5200); assert.equal(normal.duration, 2600); assert.equal(fast.duration, 2600 / 1.5);
  assert.equal(slow.start, normal.start); assert.equal(slow.end, fast.end); assert.equal(slow.interactionAt, null);
  assert.equal(demoRoute({ ...geometry, speed: -100 }).duration, 5200);
  for (const speed of [undefined, null, '0.5', {}, NaN, Infinity]) assert.equal(demoRoute({ ...geometry, speed }).duration, 2600);
  for (const key of CHOICE_KEYS.filter(key => key !== 'motion')) {
    assert.deepEqual(demoRoute({ ...geometry, key, speed: .5 }), demoRoute({ ...geometry, key, speed: 1.5 }), key);
  }
});

test('the actual common scroll comparison reads the saved speed and completes one 5.2 second slow pass', async () => {
  const h = fixture(); h.controller.composition = { ...DEFAULT_COMPOSITION, motionSpeed: .5, motionStrength: 1.5 };
  h.demo.start({ key: 'motion', requestId: 14 }); await flush(); h.step(20); h.step(2600);
  assert.equal(h.states.at(-1).phase, 'playing'); assert.equal(h.pendingFrames, 1);
  const halfway = h.moves.at(-1).top; assert.ok(halfway > h.moves[0].top && halfway < 1680);
  h.step(2600);
  assert.equal(h.states.at(-1).phase, 'complete'); assert.equal(h.moves.at(-1).top, 1680);
  assert.equal(h.pendingFrames, 0); assert.equal(h.restored, 1); assert.equal(h.interacted, 0);
  const count = h.moves.length; h.step(10000); assert.equal(h.moves.length, count); h.demo.destroy();
});

test('slow comparisons cancel immediately for user input or a hidden tab and cannot resume later', async () => {
  for (const reason of ['user-input', 'hidden', 'motion-reduced']) {
    const h = fixture(); h.controller.composition = { ...DEFAULT_COMPOSITION, motionSpeed: .5 };
    h.demo.start({ key: 'motion', requestId: 15 }); await flush(); h.step(20); h.step(3000);
    assert.equal(h.states.at(-1).phase, 'playing');
    if (reason === 'user-input') h.win.emit('wheel');
    if (reason === 'hidden') { h.doc.hidden = true; h.doc.emit('visibilitychange'); }
    if (reason === 'motion-reduced') { h.media.matches = true; h.media.emit('change'); }
    const count = h.moves.length; h.step(10000);
    assert.equal(h.states.at(-1).phase, 'cancelled'); assert.equal(h.states.at(-1).reason, reason);
    assert.equal(h.pendingFrames, 0); assert.equal(h.moves.length, count); assert.equal(h.restored, 1);
    h.demo.destroy();
  }
});

test('a newer fast comparison replaces a slow pass without an obsolete completion', async () => {
  const h = fixture(); h.controller.composition = { ...DEFAULT_COMPOSITION, motionSpeed: .5 };
  h.demo.start({ key: 'motion', requestId: 16 }); await flush(); h.step(20); h.step(1000);
  h.controller.composition = { ...DEFAULT_COMPOSITION, motionSpeed: 1.5 };
  h.demo.start({ key: 'motion', requestId: 17 }); await flush(); h.step(20); h.step(1800);
  assert.equal(h.states.at(-1).phase, 'complete'); assert.equal(h.states.at(-1).requestId, 17);
  assert.equal(h.states.some(state => state.requestId === 16 && state.phase === 'complete'), false);
  assert.equal(h.restored, 2); assert.equal(h.pendingFrames, 0); h.demo.destroy();
});
