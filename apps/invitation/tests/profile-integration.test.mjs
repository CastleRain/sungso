import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileEditor, profileErrorMessage } from '../js/profile-editor.mjs';
import { createProfileStore } from '../js/profile-store.mjs';
import { emptyProfile, emptyVenue, ProfileConflict } from '../js/profile-core.mjs';
import { applyPersonalContent, clearPersonalContent, getCoverPhoto, getVenue } from '../js/personal-content.mjs?v=20260915-personal-invitation';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const photo = number => ({ dataUrl: `data:image/jpeg;base64,${Buffer.from(`test-photo-${number}`).toString('base64')}`, width: 800, height: 1200 });
const snapshot = (revision, name = 'Saved venue', number = 1) => ({
  ready: true,
  profile: { ...emptyProfile(), revision, coverId: id(number), galleryIds: [id(number)], venue: { ...emptyVenue(), name }, updatedBy: 'test-member' },
  photos: { [id(number)]: photo(number) },
});

// A small dialog surface exercises the real editor/store event lifecycle. It
// deliberately retains the dialog object after removal from a private root.
function dialogSurface() {
  const listeners = new Map(), nodes = new Map();
  const node = (value = '') => ({
    value, disabled: false, hidden: false, dataset: {}, textContent: '', markup: '', buttons: [],
    set innerHTML(html) {
      this.markup = html;
      this.buttons = [...html.matchAll(/<button\b([^>]*)>/g)].map(([, attributes]) => ({
        disabled: /\bdisabled\b/.test(attributes),
        dataset: { profileAction: attributes.match(/data-profile-action="([^"]*)"/)?.[1], photo: attributes.match(/data-photo="([^"]*)"/)?.[1] },
      }));
    },
    get innerHTML() { return this.markup; },
  });
  const headerClose = node();
  const content = {
    markup: '',
    set innerHTML(value) {
      this.markup = value;
      nodes.clear();
      for (const name of Object.keys(emptyVenue())) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const input = value.match(new RegExp(`name="venue-${escaped}"[^>]*value="([^"]*)"`));
        const textarea = value.match(new RegExp(`name="venue-${escaped}"[^>]*>([^<]*)</textarea>`));
        nodes.set(`[name="venue-${name}"]`, node(input?.[1] || textarea?.[1] || ''));
      }
      for (const key of ['cover', 'gallery', 'count', 'status']) nodes.set(`[data-profile-${key}]`, node());
      for (const action of ['save', 'close', 'reload']) nodes.set(`[data-profile-action="${action}"]`, node());
      nodes.get('[data-profile-action="reload"]').hidden = true;
    },
    get innerHTML() { return this.markup; },
    replaceChildren() { this.markup = ''; nodes.clear(); },
  };
  const dialog = {
    open: false,
    querySelector(selector) { return selector === '.profile-editor-content' ? content : nodes.get(selector) || null; },
    querySelectorAll() { return [...nodes.values()].flatMap(value => [value, ...value.buttons]).concat(headerClose); },
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    async fire(name, event = {}) { await Promise.all([...(listeners.get(name) || [])].map(fn => fn(event))); },
    showModal() { this.open = true; },
    close() { if (!this.open) return; this.open = false; queueMicrotask(() => { void this.fire('close'); }); },
    field(name, value) { const input = this.querySelector(`[name="venue-${name}"]`); if (value !== undefined) input.value = value; return input.value; },
    action(action, photoId) { const target = { dataset: { profileAction: action, photo: photoId }, closest: () => target }; return this.fire('click', { target }); },
    photoButton(action, photoId) { return this.querySelectorAll().find(value => value.dataset.profileAction === action && value.dataset.photo === photoId); },
    upload(kind, files) { const target = { dataset: { profileUpload: kind }, files, value: 'selected', matches: () => true }; return this.fire('change', { target }); },
  };
  return { dialog, content };
}

function setup(t) {
  const { dialog, content } = dialogSurface();
  let publish, fail, state, active = true, saved = 0, transact;
  const changes = [], savedResults = [];
  const store = createProfileStore({
    subscribe(next, error) { publish = next; fail = error; return () => {}; },
    transact(change) { changes.push(structuredClone(change)); return transact(change); },
  });
  store.subscribe(value => { state = value; if (value.data.ready) applyPersonalContent(value.data); });
  const editor = createProfileEditor({ dialog, getState: () => state, save: change => store.save(change), isActive: () => active, onSaved: result => { saved++; savedResults.push(result); } });
  t.after(() => { active = false; store.dispose(); editor.dispose(); clearPersonalContent(); });
  publish(snapshot(1), 'live');
  return {
    dialog, content, store, editor, changes, savedResults,
    publish: (value, connection = 'live') => publish(value, connection), fail: error => fail(error),
    setTransaction(fn) { transact = fn; },
    retire() { active = false; store.dispose(); editor.dispose(); clearPersonalContent(); },
    get state() { return state; }, get saved() { return saved; },
  };
}

test('a ready server snapshot arriving before the save response preserves the open editor draft', async t => {
  const view = setup(t), response = deferred();
  view.setTransaction(() => response.promise);
  view.editor.open(); view.dialog.field('name', 'My edited venue');
  const saving = view.dialog.action('save');
  assert.equal(view.state.saving, true);
  view.publish({ ...snapshot(1), ready: false }, 'loading');
  view.publish(snapshot(2, 'My edited venue', 2));
  assert.equal(view.dialog.open, true);
  assert.equal(view.dialog.field('name'), 'My edited venue');
  assert.equal(getCoverPhoto().src, photo(2).dataUrl);
  response.resolve({ revision: 2 }); await saving; await tick();
  assert.equal(view.dialog.open, false);
  assert.equal(view.saved, 1);
  assert.deepEqual(view.savedResults, [{ revision: 2 }]);
  assert.equal(view.content.innerHTML, '');
  assert.equal(view.changes[0].expectedRevision, 1);
  assert.deepEqual(view.changes[0].newPhotos, {});
});

test('the editor reports unavailable media and blocks cancel controls while saving', async t => {
  const view = setup(t), response = deferred();
  view.publish({ ...snapshot(1), ready: false }, 'loading');
  assert.equal(view.editor.open(), false);
  assert.equal(view.dialog.open, false);
  view.publish(snapshot(1));
  assert.equal(view.editor.open(), true);
  view.setTransaction(() => response.promise);
  const saving = view.dialog.action('save');
  assert.equal(view.editor.isBusy(), true);
  assert.equal(view.dialog.querySelector('[data-profile-action="close"]').disabled, true);
  let cancelled = false;
  await view.dialog.fire('cancel', { preventDefault() { cancelled = true; } });
  await view.dialog.action('close');
  assert.equal(cancelled, true);
  assert.equal(view.dialog.open, true);
  response.resolve({ revision: 2 }); await saving; await tick();
  assert.equal(view.editor.isBusy(), false);
  assert.equal(view.dialog.open, false);
});

test('failed saves retain venue and photos and restore disabled gallery ordering boundaries', async t => {
  const view = setup(t);
  view.setTransaction(async () => { throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }); });
  view.editor.open(); view.dialog.field('name', 'My unsaved venue');
  assert.equal(view.dialog.photoButton('earlier', id(1)).disabled, true);
  assert.equal(view.dialog.photoButton('later', id(1)).disabled, true);
  await view.dialog.action('save');
  assert.equal(view.dialog.open, true);
  assert.equal(view.dialog.field('name'), 'My unsaved venue');
  assert.equal(view.dialog.querySelector('[data-profile-count]').textContent, '1 / 20');
  assert.equal(view.dialog.photoButton('earlier', id(1)).disabled, true);
  assert.equal(view.dialog.photoButton('later', id(1)).disabled, true);
  assert.equal(view.dialog.photoButton('remove-photo', id(1)).disabled, false);
  const message = view.dialog.querySelector('[data-profile-status]').textContent;
  assert.match(message, /권한/);
  assert.match(message, /입력한 내용은 그대로/);
  assert.doesNotMatch(message, /Missing|permission-denied/);
  assert.equal(view.saved, 0);
});

test('SDK error codes and unknown English failures become Korean guidance while validation details remain', () => {
  for (const code of ['permission-denied', 'firestore/unauthenticated', 'unavailable', 'deadline-exceeded', 'resource-exhausted', 'aborted', 'cancelled', 'internal']) {
    const message = profileErrorMessage({ code, message: 'Firebase: Request failed.' });
    assert.match(message, /[가-힣]/);
    assert.doesNotMatch(message, /Firebase|Request failed/);
  }
  assert.equal(profileErrorMessage(new Error('예식장 이름을 먼저 입력해주세요.')), '예식장 이름을 먼저 입력해주세요.');
  assert.match(profileErrorMessage('FirebaseError: Missing or insufficient permissions.'), /다시 시도/);
});

test('a committed save never publishes partial new photos while its server media is still loading', async t => {
  const view = setup(t), response = deferred();
  view.setTransaction(() => response.promise);
  view.editor.open(); view.dialog.field('name', 'New venue');
  const saving = view.dialog.action('save');
  view.publish({ ...snapshot(1), ready: false }, 'loading');
  response.resolve({ revision: 2 }); await saving; await tick();
  assert.equal(view.state.data.ready, false);
  assert.equal(getCoverPhoto().src, photo(1).dataUrl);
  assert.equal(getVenue().name, 'Saved venue');
  view.publish(snapshot(2, 'New venue', 2));
  assert.equal(view.state.data.ready, true);
  assert.equal(getCoverPhoto().src, photo(2).dataUrl);
  assert.equal(getVenue().name, 'New venue');
});

test('a concurrent update keeps the unsaved venue until explicit reload and uses the new revision on retry', async t => {
  const view = setup(t), response = deferred();
  view.setTransaction(() => response.promise);
  view.editor.open(); view.dialog.field('name', 'Unsaved local venue');
  const saving = view.dialog.action('save');
  view.publish(snapshot(2, 'Other device venue', 2));
  response.reject(new ProfileConflict()); await saving;
  assert.equal(view.dialog.open, true);
  assert.equal(view.dialog.field('name'), 'Unsaved local venue');
  assert.equal(view.dialog.querySelector('[data-profile-action="reload"]').hidden, false);
  assert.equal(view.saved, 0);
  await view.dialog.action('reload');
  assert.equal(view.dialog.field('name'), 'Other device venue');
  view.setTransaction(async () => ({ revision: 3 }));
  await view.dialog.action('save'); await tick();
  assert.equal(view.changes[1].expectedRevision, 2);
  assert.equal(view.changes[1].profile.venue.name, 'Other device venue');
});

test('account retirement during saving clears private media and ignores both late response and snapshot', async t => {
  const view = setup(t), response = deferred();
  view.setTransaction(() => response.promise);
  view.editor.open(); view.dialog.field('name', 'Private pending venue');
  const saving = view.dialog.action('save');
  view.retire();
  response.resolve({ revision: 2 }); view.publish(snapshot(2, 'Retired account venue', 2));
  await saving; await tick();
  assert.equal(view.dialog.open, false);
  assert.equal(view.content.innerHTML, '');
  assert.equal(view.saved, 0);
  assert.equal(getCoverPhoto(), null);
  assert.equal(getVenue().name, '');
  let after; view.store.subscribe(value => { after = value; });
  assert.equal(after.connection, 'signed-out');
  assert.deepEqual(after.data.photos, {});
});

test('closing during image preparation releases its URL and cannot append a photo to a reopened editor', async t => {
  const view = setup(t), decoded = deferred(); let revoked = 0;
  const original = Object.fromEntries(['Image', 'document', 'URL'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.Image = class { naturalWidth = 800; naturalHeight = 1200; decode() { return decoded.promise; } };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => photo(2).dataUrl }) };
  globalThis.URL = { createObjectURL: () => 'blob:test-profile', revokeObjectURL: () => { revoked++; } };
  t.after(() => { for (const [key, descriptor] of Object.entries(original)) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; });
  view.editor.open();
  const upload = view.dialog.upload('gallery', [{ type: 'image/jpeg', size: 10 }]);
  view.dialog.close(); await tick(); view.editor.open();
  decoded.resolve(); await upload;
  assert.equal(revoked, 1);
  assert.equal(view.dialog.open, true);
  assert.equal(view.dialog.querySelector('[data-profile-count]').textContent, '1 / 20');
  assert.doesNotMatch(view.dialog.querySelector('[data-profile-gallery]').innerHTML, new RegExp(id(2)));
  assert.equal(view.changes.length, 0);
});
