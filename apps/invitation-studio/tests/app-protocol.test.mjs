import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { studioMessage } from '../js/studio-preview.mjs';
import { normalizeComposition, DEFAULT_COMPOSITION, compositionParams, sameComposition } from '../js/composition.mjs';

// Execute the shipped parent/child handshake, not a second implementation of its
// request gates. Explicit boundaries fail if the entry points are moved/removed.
function sourceBetween(file, start, end) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Protocol entry point changed in ${file}`);
  return source.slice(from, to);
}
const requestSource = sourceBetween('../catalog/catalog.mjs', 'function requestPreview(', '\nfunction restoreCurrent()');
const parentSource = sourceBetween('../catalog/catalog.mjs', "window.addEventListener('message', event => {", "\nwindow.addEventListener('popstate'");
const childSource = sourceBetween('../js/app.mjs', "window.addEventListener('message', async event => {", "\nparentMessage({ type: 'invitation-studio:ready'");
const pendingStopSource = sourceBetween('../js/app.mjs', 'function stopPendingDemo()', '\nif (comparison)');

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function fixture() {
  const parentWindow = {}, childWindow = {}, origin = 'https://sungso-wedding.vercel.app';
  const requests = [], responses = [], starts = [], cancels = [], linkWrites = [], readyByFont = new Map();
  const status = { textContent: '', classList: { add() {} } };
  let receiveParent, receiveChild, openDialog = null;
  const parent = vm.createContext({
    normalizeComposition, sameComposition, location: { origin }, frame: { contentWindow: childWindow },
    window: { addEventListener(_type, callback) { receiveParent = callback; } },
    post: message => requests.push(message), $: () => status, renderDemoTools() {}, renderAudioState() {},
  });
  vm.runInContext(`let requestSerial = 0, activeRequest = null, activeReviewKey = null, demoPhase = 'idle';
    let ready = true, motionReady = true, audioEnabled = false, contentEditor = null;
    const labels = { motion: 'scroll', font: 'font', album: 'album' };
    let composition = ${JSON.stringify(DEFAULT_COMPOSITION)};
    ${requestSource}\n${parentSource}`, parent);
  const child = vm.createContext({
    studioMessage, compositionParams, location: { origin }, comparison: true,
    window: { parent: parentWindow, addEventListener(_type, callback) { receiveChild = callback; }, sungsoIntro: { finish() {} } },
    $: () => openDialog, cancelPreviewJump() {}, cancelInitialAnchor() {}, jumpTo() {},
    parentMessage: message => responses.push(message), syncCompositionLinks: value => linkWrites.push(value),
    sceneDemo: { start: request => starts.push(request), cancel: reason => cancels.push(reason) },
    themeController: { composition: normalizeComposition(DEFAULT_COMPOSITION), whenReady: Promise.resolve(),
      setComposition(next) { this.composition = next; this.whenReady = readyByFont.get(next.font) || Promise.resolve(); } },
  });
  vm.runInContext(`let latestApplyId = -1, stoppedDemoId = -1, awaitingApplyId = null, visualOnly = false, contentPreview = null, expanded = {setComposition(){}};
    ${pendingStopSource}\n${childSource}`, child);
  const select = (composition, options = { key: 'motion' }) => {
    parent.selected = composition; parent.options = options;
    vm.runInContext('requestPreview(selected, options)', parent);
  };
  const deliver = message => receiveChild({ data: message, origin, source: parentWindow });
  const acknowledge = message => receiveParent({ data: message, origin, source: childWindow });
  return { requests, responses, starts, cancels, linkWrites, readyByFont, select, deliver, acknowledge,
    stop: () => vm.runInContext('stopDemo()', parent),
    userInput: () => vm.runInContext('stopPendingDemo()', child),
    setOpenDialog: value => { openDialog = value; },
    phase: () => vm.runInContext('demoPhase', parent),
    composition: () => child.themeController.composition,
  };
}

test('one selection starts once and stopping the old request cannot suppress the next selection', async () => {
  const f = fixture();
  f.select({ ...DEFAULT_COMPOSITION, motion: 'breathe' });
  assert.deepEqual(f.requests.map(message => message.type), ['invitation-studio:apply']);
  await f.deliver(f.requests.shift());
  const ack = f.responses.shift(); f.acknowledge(ack); f.acknowledge(ack);
  assert.equal(f.requests.length, 1, 'duplicate ACK must not replay a scene');
  await f.deliver(f.requests.shift());
  assert.equal(f.starts[0].requestId, 1);

  f.select({ ...DEFAULT_COMPOSITION, motion: 'focus' });
  assert.deepEqual(f.requests.map(({ type, requestId }) => [type, requestId]), [
    ['invitation-studio:demo-stop', 1], ['invitation-studio:apply', 2],
  ]);
  await f.deliver(f.requests.shift()); await f.deliver(f.requests.shift());
  f.acknowledge(f.responses.shift()); await f.deliver(f.requests.shift());
  assert.deepEqual(f.starts.map(request => request.requestId), [1, 2]);
});

test('rapid selections ignore both delayed font completion and stale or mismatched acknowledgments', async () => {
  const f = fixture(), first = deferred(), second = deferred();
  f.readyByFont.set('modern', first.promise); f.readyByFont.set('editorial', second.promise);
  f.select({ ...DEFAULT_COMPOSITION, font: 'modern' }, { key: 'font' });
  const oldApply = f.deliver(f.requests.shift());
  f.select({ ...DEFAULT_COMPOSITION, font: 'editorial' }, { key: 'font' });
  await f.deliver(f.requests.shift());
  const newApply = f.deliver(f.requests.shift());
  first.resolve(); await oldApply;
  assert.equal(f.responses.length, 0, 'the obsolete font wait must not acknowledge a newer composition');
  f.acknowledge({ type: 'invitation-studio:applied', requestId: 1, composition: { ...DEFAULT_COMPOSITION, font: 'modern' } });
  f.acknowledge({ type: 'invitation-studio:applied', requestId: 2, composition: DEFAULT_COMPOSITION });
  assert.equal(f.requests.length, 0);
  second.resolve(); await newApply;
  f.acknowledge(f.responses.shift()); await f.deliver(f.requests.shift());
  assert.deepEqual(f.starts.map(request => [request.requestId, request.key]), [[2, 'font']]);
});

test('direct input during layout preparation cancels pending replay but permits a later new choice', async () => {
  const f = fixture(), loading = deferred();
  f.readyByFont.set('modern', loading.promise);
  f.select({ ...DEFAULT_COMPOSITION, font: 'modern' }, { key: 'font' });
  const apply = f.deliver(f.requests.shift());
  f.userInput();
  const cancelled = f.responses.shift();
  assert.equal(cancelled.phase, 'cancelled'); assert.equal(cancelled.key, undefined);
  f.acknowledge(cancelled);
  loading.resolve(); await apply;
  f.acknowledge(f.responses.shift());
  assert.equal(f.requests.length, 0, 'late apply ACK must not restart the cancelled demonstration');
  assert.equal(f.starts.length, 0);
  f.select({ ...DEFAULT_COMPOSITION, motion: 'focus' });
  await f.deliver(f.requests.shift()); await f.deliver(f.requests.shift());
  f.acknowledge(f.responses.shift()); await f.deliver(f.requests.shift());
  assert.deepEqual(f.starts.map(request => request.requestId), [2]);
});

test('explicit stop during preparation survives the late ACK and the child refuses a same-ID replay', async () => {
  const f = fixture(), loading = deferred();
  f.readyByFont.set('modern', loading.promise);
  f.select({ ...DEFAULT_COMPOSITION, font: 'modern' }, { key: 'font' });
  const apply = f.deliver(f.requests.shift());
  f.stop(); await f.deliver(f.requests.shift());
  loading.resolve(); await apply;
  f.acknowledge(f.responses.shift());
  assert.equal(f.requests.length, 0);
  await f.deliver({ type: 'invitation-studio:demo', requestId: 1, key: 'font' });
  assert.equal(f.starts.length, 0);
});

test('a transient before view does not rewrite canonical links and leaves an open draft mounted', async () => {
  const f = fixture();
  const draft = { open: true, message: '아직 작성 중인 축하 편지' }; f.setOpenDialog(draft);
  f.select({ ...DEFAULT_COMPOSITION, font: 'modern' }, { key: 'font', previewOnly: true });
  await f.deliver(f.requests.shift());
  assert.equal(f.composition().font, 'modern');
  assert.equal(f.linkWrites.length, 0);
  assert.deepEqual(draft, { open: true, message: '아직 작성 중인 축하 편지' });
  f.select(DEFAULT_COMPOSITION, { key: 'font' });
  await f.deliver(f.requests.shift()); await f.deliver(f.requests.shift());
  assert.equal(f.linkWrites.length, 1);
  assert.equal(f.linkWrites[0].font, DEFAULT_COMPOSITION.font);
});
