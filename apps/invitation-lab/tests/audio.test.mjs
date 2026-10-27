import assert from 'node:assert/strict';
import test from 'node:test';
import { createAudioController, isPlaybackGesture, setupAudio, trackAt } from '../js/audio.mjs';

class Emitter {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type, values = {}) {
    for (const callback of [...(this.listeners.get(type) || [])]) callback({ type, target: this, ...values });
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, values) => sum + values.size, 0); }
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function audioElement() {
  const audio = new Emitter();
  Object.assign(audio, {
    paused: true, readyState: 0, currentTime: 0, error: null, calls: 0, pauseCalls: 0, behaviours: [],
    play() {
      this.calls++;
      const behaviour = this.behaviours.shift();
      if (behaviour) return behaviour();
      this.paused = false;
      this.emit('playing');
      return Promise.resolve();
    },
    pause() {
      this.pauseCalls++;
      const wasPlaying = !this.paused;
      this.paused = true;
      if (wasPlaying) this.emit('pause');
    },
    getAttribute: () => '/v6/assets/audio/wedding-day.mp3',
  });
  return audio;
}
function node() {
  const item = new Emitter(), classes = new Set(), attributes = new Map();
  Object.assign(item, {
    dataset: {}, hidden: false, textContent: '', title: '',
    classList: { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key) },
    setAttribute: (key, value) => attributes.set(key, value),
    getAttribute: key => attributes.get(key),
    querySelector: () => null,
    closest: () => null,
  });
  return item;
}
function environment({ comparison = false, ready = 0, behaviours = [] } = {}) {
  const audio = audioElement(), dock = node(), control = node(), label = node(), status = node(), notice = node(), hero = node();
  audio.readyState = ready;
  audio.behaviours = behaviours;
  notice.hidden = true;
  control.querySelector = () => label;
  control.closest = selector => selector === '[data-audio-toggle]' ? control : null;
  hero.rect = { top: 0, bottom: 844 };
  hero.getBoundingClientRect = () => hero.rect;
  const doc = new Emitter(), win = new Emitter(), timers = new Map(), observers = [], states = [];
  let now = 0, sequence = 0;
  doc.querySelector = selector => ({ '#background-audio': audio, '#sound-dock': dock, '#sound-status': status, '#music-notice': notice, '.hero': hero }[selector] || null);
  doc.querySelectorAll = selector => selector === '[data-audio-toggle]' ? [control] : [];
  Object.assign(win, {
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, time: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
      observe(target) { this.target = target; }
      disconnect() { this.disconnected = true; }
    },
  });
  function advance(ms) {
    const target = now + ms;
    for (;;) {
      const candidate = [...timers].filter(([, timer]) => timer.time <= target).sort((a, b) => a[1].time - b[1].time)[0];
      if (!candidate) break;
      const [id, timer] = candidate;
      timers.delete(id); now = timer.time; timer.callback();
    }
    now = target;
  }
  const music = { src: '/v6/assets/audio/wedding-day.mp3', title: 'Wedding Day', artist: 'NUUM FM', tracks: [{ startsAt: 0, title: 'Ever After, Us' }, { startsAt: 102, title: 'Just Married!' }] };
  return { audio, dock, control, label, status, notice, hero, doc, win, timers, observers, states, comparison, music, onState: phase => states.push(phase), advance };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const notAllowed = () => Promise.reject(Object.assign(new Error('Blocked by policy'), { name: 'NotAllowedError' }));

test('controller preserves a stop while an old play request resolves late', async () => {
  const audio = audioElement(), play = deferred(), states = [];
  audio.behaviours.push(() => play.promise);
  const player = createAudioController(audio, phase => states.push(phase));
  const pending = player.start({ automatic: true });
  assert.equal(player.phase, 'loading');
  player.stop();
  audio.paused = false;
  audio.emit('playing');
  play.resolve();
  await pending;
  assert.equal(audio.paused, true);
  assert.equal(player.phase, 'paused');
  assert.equal(player.desired, false);
  assert.equal(player.pendingGesture, false);
  assert.deepEqual(states, ['loading', 'paused']);
  player.destroy();
});

test('a stale play completion does not cancel a newer explicit play request', async () => {
  const audio = audioElement(), first = deferred(), second = deferred();
  audio.behaviours.push(() => first.promise, () => second.promise);
  const player = createAudioController(audio);
  const one = player.start();
  player.stop();
  const two = player.start();
  const pauseCalls = audio.pauseCalls;
  first.resolve(); await one;
  assert.equal(audio.pauseCalls, pauseCalls);
  second.resolve(); await two;
  assert.equal(player.phase, 'playing');
  player.destroy();
});

test('policy block retries once on gesture, but an explicit stop cancels the retry', async () => {
  const audio = audioElement();
  audio.behaviours.push(notAllowed);
  const player = createAudioController(audio);
  await player.start({ automatic: true });
  assert.equal(player.phase, 'blocked');
  assert.equal(player.pendingGesture, true);
  await player.resumeOnGesture();
  assert.equal(player.phase, 'playing');
  assert.equal(audio.calls, 2);
  player.stop();
  await player.resumeOnGesture();
  assert.equal(audio.calls, 2);
  player.destroy();
  assert.equal(audio.listenerCount, 0);
});

test('network failure is not treated as autoplay permission failure', async () => {
  const audio = audioElement();
  audio.behaviours.push(() => Promise.reject(new Error('Network')));
  const player = createAudioController(audio);
  await player.start();
  assert.equal(player.phase, 'error');
  assert.equal(player.pendingGesture, false);
  await player.resumeOnGesture();
  assert.equal(audio.calls, 1);
  await player.toggle();
  assert.equal(audio.calls, 2);
  assert.equal(player.phase, 'playing');
  player.destroy();
});

test('gesture filter excludes synthetic input, scrolling keys, and the music button', () => {
  for (const type of ['click', 'touchend']) assert.equal(isPlaybackGesture({ type, isTrusted: true }), true);
  for (const key of ['Enter', ' ']) assert.equal(isPlaybackGesture({ type: 'keydown', isTrusted: true, key }), true);
  assert.equal(isPlaybackGesture({ type: 'click', isTrusted: false }), false);
  assert.equal(isPlaybackGesture({ type: 'keydown', isTrusted: true, key: 'ArrowDown' }), false);
  assert.equal(isPlaybackGesture({ type: 'pointermove', isTrusted: true }), false);
  assert.equal(isPlaybackGesture({ type: 'click', isTrusted: true, target: { closest: () => ({}) } }), false);
});

test('standalone startup is automatic, blocked playback waits for a trusted gesture', async () => {
  const env = environment({ behaviours: [notAllowed] });
  const audio = setupAudio(env);
  await flush();
  assert.equal(env.audio.calls, 1);
  assert.equal(env.dock.dataset.state, 'blocked');
  env.doc.emit('click', { isTrusted: false });
  env.doc.emit('keydown', { isTrusted: true, key: 'ArrowDown' });
  assert.equal(env.audio.calls, 1);
  env.doc.emit('touchend', { isTrusted: true });
  await flush();
  assert.equal(env.audio.calls, 2);
  assert.equal(env.dock.dataset.state, 'playing');
  assert.equal(env.control.getAttribute('aria-pressed'), 'true');
  env.control.emit('click', { isTrusted: true });
  env.doc.emit('click', { isTrusted: true, target: env.control });
  env.doc.emit('touchend', { isTrusted: true });
  assert.equal(env.audio.calls, 2);
  assert.equal(env.audio.paused, true);
  audio.destroy();
});

test('comparison permission does not autoplay or retry until selected', async () => {
  const env = environment({ comparison: true, behaviours: [notAllowed] });
  const audio = setupAudio(env);
  assert.equal(env.audio.calls, 0);
  env.doc.emit('click', { isTrusted: true });
  env.control.emit('click', { isTrusted: true });
  assert.equal(env.audio.calls, 0);
  assert.match(env.status.textContent, /이 시안/);
  audio.setAllowed(true);
  await flush();
  assert.equal(env.audio.calls, 1);
  assert.equal(env.dock.dataset.state, 'blocked');
  audio.setAllowed(false);
  env.doc.emit('click', { isTrusted: true });
  assert.equal(env.audio.calls, 1);
  audio.setAllowed(true);
  await flush();
  assert.equal(env.audio.calls, 2);
  assert.equal(env.audio.paused, false);
  audio.destroy();
});

test('manual pause survives comparison deselection/reselection, explicit toggle can restart', async () => {
  const env = environment({ comparison: true });
  const audio = setupAudio(env);
  audio.setAllowed(true); await flush();
  audio.stop();
  audio.setAllowed(false);
  audio.setAllowed(true);
  env.doc.emit('click', { isTrusted: true });
  assert.equal(env.audio.calls, 1);
  assert.equal(env.audio.paused, true);
  await audio.toggle();
  assert.equal(env.audio.calls, 2);
  assert.equal(env.audio.paused, false);
  audio.destroy();
});

test('permission removal cancels an in-flight start without a late audible result', async () => {
  const pending = deferred();
  const env = environment({ comparison: true, behaviours: [() => pending.promise] });
  const audio = setupAudio(env);
  audio.setAllowed(true);
  assert.equal(env.dock.dataset.state, 'loading');
  audio.setAllowed(false);
  env.audio.paused = false;
  pending.resolve(); await flush();
  assert.equal(env.audio.paused, true);
  assert.equal(env.dock.dataset.allowed, 'false');
  assert.equal(env.dock.dataset.state, 'paused');
  audio.destroy();
});

test('ready message is shown once for 2.4 seconds then fades away', () => {
  const env = environment({ comparison: true, ready: 2 });
  const audio = setupAudio(env);
  assert.equal(env.notice.hidden, true);
  audio.setAllowed(true);
  assert.equal(env.notice.hidden, false);
  assert.equal(env.notice.classList.contains('is-visible'), true);
  env.audio.emit('canplay'); env.audio.emit('loadeddata');
  assert.equal(env.timers.size, 1);
  env.advance(2399);
  assert.equal(env.notice.classList.contains('is-visible'), true);
  env.advance(1);
  assert.equal(env.notice.classList.contains('is-visible'), false);
  env.advance(400);
  assert.equal(env.notice.hidden, true);
  env.audio.emit('canplay');
  assert.equal(env.notice.hidden, true);
  audio.destroy();
});

test('track title follows the full playlist and the dock follows the cover', () => {
  const env = environment({ comparison: true });
  const audio = setupAudio(env);
  assert.match(env.control.title, /Ever After, Us/);
  env.audio.currentTime = 103;
  env.audio.emit('timeupdate');
  assert.match(env.control.title, /Just Married!/);
  assert.equal(env.dock.dataset.onCover, 'true');
  env.hero.rect = { top: -800, bottom: 44 };
  env.observers[0].callback();
  assert.equal(env.dock.dataset.onCover, 'false');
  assert.equal(env.audio.volume, .35);
  assert.equal(env.audio.loop, true);
  audio.destroy();
});

test('destroy cleans event listeners, observers and pending notice timers', () => {
  const env = environment({ ready: 2 });
  const audio = setupAudio(env);
  assert.equal(env.notice.hidden, false);
  audio.destroy(); audio.destroy();
  assert.equal(env.audio.listenerCount, 0);
  assert.equal(env.doc.listenerCount, 0);
  assert.equal(env.win.listenerCount, 0);
  assert.equal(env.control.listenerCount, 0);
  assert.equal(env.timers.size, 0);
  assert.equal(env.notice.hidden, true);
  assert.equal(env.audio.paused, true);
  assert.ok(env.observers.every(observer => observer.disconnected));
  audio.setAllowed(true);
  audio.toggle();
  assert.equal(env.audio.calls, 1);
});

test('track lookup handles unsorted track definitions and invalid time', () => {
  const tracks = [{ startsAt: 102, title: 'second' }, { startsAt: 0, title: 'first' }, { startsAt: 192, title: 'third' }];
  assert.equal(trackAt(tracks, 101).title, 'first');
  assert.equal(trackAt(tracks, 102).title, 'second');
  assert.equal(trackAt(tracks, 1346).title, 'third');
  assert.equal(trackAt(tracks, NaN), null);
  assert.equal(trackAt([], 10), null);
});
