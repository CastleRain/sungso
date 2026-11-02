import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as core from '../../../shared/life/core.mjs';
import { createLifeStore } from '../../../shared/life/local-store.mjs';
import { definition as table } from '../js/definition.mjs';
import { definition as footprints } from '../../footprints/js/definition.mjs';
import { definition as wedding } from '../../wedding/js/definition.mjs';

const require = createRequire(new URL('../../sohee/sales/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const sourceUrl = new URL('../../../shared/life/ui.mjs', import.meta.url);
// Exercise the real UI with an isolated member and in-memory browser storage.
// No Firebase SDK is loaded and no production browser or account is used.
const source = (await readFile(sourceUrl, 'utf8')).replace(/^import .*;\r?\n/gm, '').replace('export async function mountLifeApp', 'async function mountLifeApp').replaceAll('import.meta.url', JSON.stringify(sourceUrl.href));
const createUI = new Function('requireMember', 'getMember', 'registerPrivateCleanup', 'createLifeStore', 'core', 'window', 'document', 'location', 'history', `const { blankState, upsertRecord, removeRecord, toggleRecord, addRecipeIngredients, foodCandidates, guestSummary, safeExternalUrl } = core;\n${source}\nreturn mountLifeApp;`);
const tick = () => new Promise(resolve => setImmediate(resolve));

async function setup(t, definition, state) {
  const dom = new JSDOM('<html data-ss-suite="' + definition.id + '" data-ss-surface="solid"><body data-app="' + definition.id + '"><main data-private-root hidden><div id="lifeApp"></div></main></body></html>', { url: 'https://example.test/sungso/' + definition.id + '/', pretendToBeVisual: true });
  const win = dom.window, doc = win.document, member = { uid: 'synthetic-glass-member' }, cleanup = [];
  let current = member;
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  win.HTMLElement.prototype.scrollIntoView = function () {};
  const storeOptions = { uid: member.uid, isCurrent: () => current === member, storage: win.localStorage, eventTarget: win, locks: { request: async (_name, _options, callback) => callback() } };
  const seedStore = createLifeStore(storeOptions);
  if (state) await seedStore.commit(state, { expectedRevision: 0 });
  const mount = createUI(async () => member, () => current, callback => cleanup.push(callback), options => createLifeStore({ ...storeOptions, ...options }), core, win, doc, win.location, win.history);
  await mount(definition);
  t.after(() => { cleanup.forEach(callback => callback()); seedStore.dispose(); win.close(); });
  return { win, doc, store: seedStore, logout() { current = null; cleanup.forEach(callback => callback()); } };
}

test('all three empty apps retain tabs, browser-only notice and backup without seeding records', async t => {
  for (const definition of [table, footprints, wedding]) {
    const e = await setup(t, definition);
    assert.equal(e.doc.querySelector('[data-private-root]').hidden, false);
    assert.equal(e.doc.querySelectorAll('.life-tabs [role="tab"]').length, definition.tabs.length);
    assert.match(e.doc.querySelector('.life-storage-note').textContent, /다른 기기나 상대 계정과 자동 공유되지/);
    assert.match(e.doc.querySelector('.life-storage-note button').textContent, /백업/);
    assert.equal(e.win.localStorage.length, 0);
  }
});

test('shopping keeps quantities, completion and editor drafts across visual mode switches', async t => {
  const state = core.upsertRecord(core.blankState(), 'shopping', { id: 'shopping-one', name: '합성 식재료', quantity: '반 봉지', unit: '묶음', category: 'ingredients', memo: '합성 메모' });
  const e = await setup(t, table, state), card = e.doc.querySelector('[data-record-id="shopping-one"]');
  assert.equal(card.dataset.kind, 'shopping');
  assert.equal(card.querySelector('[data-field="quantity"] dd').textContent, '반 봉지');
  card.querySelector('[aria-label="합성 식재료 수정"]').click();
  const input = e.doc.querySelector('#life-field-quantity'); input.value = '두 묶음';
  e.doc.documentElement.dataset.ssSurface = 'glass';
  e.doc.documentElement.dataset.ssSurface = 'solid';
  assert.equal(e.doc.querySelector('#life-field-quantity'), input);
  assert.equal(input.value, '두 묶음');
  e.doc.querySelector('#life-record-form').dispatchEvent(new e.win.Event('submit', { bubbles: true, cancelable: true })); await tick();
  assert.equal(e.store.read().shopping[0].quantity, '두 묶음');
  e.doc.querySelector('.life-record-heading input').click(); await tick();
  assert.equal(e.store.read().shopping[0].done, true);
  assert.equal(e.doc.querySelector('.life-record').classList.contains('is-done'), true);
});

test('place-to-visit action retains the same place ID and album tab remains reachable', async t => {
  let state = core.upsertRecord(core.blankState(), 'places', { id: 'place-one', name: '합성 장소', category: 'cafe', wish: true });
  state = core.upsertRecord(state, 'visits', { id: 'visit-one', placeId: 'place-one', date: '2028-02-29' });
  state = core.upsertRecord(state, 'albums', { id: 'album-one', title: '합성 앨범', visitId: 'visit-one', url: 'https://photos.example.test/album' });
  const e = await setup(t, footprints, state);
  assert.equal(e.doc.querySelector('[data-kind="places"] [data-field="category"] dd').textContent, '카페');
  [...e.doc.querySelectorAll('.life-record-footer button')].find(button => button.textContent === '방문 기록').click();
  assert.equal(e.doc.querySelector('#life-panel').getAttribute('aria-labelledby'), 'life-tab-visits');
  assert.equal(e.doc.querySelector('#life-field-placeId').value, 'place-one');
  e.doc.querySelector('#life-edit-dialog .life-icon-button').click();
  e.doc.querySelector('#life-tab-albums').click();
  assert.match(e.doc.querySelector('[data-kind="albums"] [data-field="visitId"] dd').textContent, /2028-02-29/);
  assert.equal(e.doc.querySelector('.life-record-link').href, 'https://photos.example.test/album');
});

test('wedding exposes the explicit studio route while rejecting unapproved link shapes', async t => {
  let state = core.upsertRecord(core.blankState(), 'guests', { id: 'guest-one', name: '합성 하객', side: 'both', invitation: 'pending', attendance: 'yes', count: 3 });
  state = core.upsertRecord(state, 'tasks', { id: 'task-one', title: '합성 준비' });
  const definition = { ...wedding, links: [...wedding.links, { title: '외부 삽입', href: 'https://example.test/' }, { title: '임의 페이지', href: './unknown.html' }] };
  const e = await setup(t, definition, state);
  assert.equal(e.doc.querySelector('.life-connections a[href="./invitation.html"]').textContent, '우리 청첩장 작업실 ↗');
  assert.equal(e.doc.querySelector('.life-connections a[href="../wecost/"]').href, 'https://example.test/sungso/wecost/');
  assert.equal(e.doc.querySelector('.life-connections a[href="https://example.test/"]'), null);
  assert.equal(e.doc.querySelector('.life-connections a[href="./unknown.html"]'), null);
  assert.equal(e.doc.querySelector('[data-field="invitation"] dd').textContent, '아직 전하기 전');
  assert.equal(e.doc.querySelector('[data-field="attendance"] dd').textContent, '참석해요');
  assert.match(e.doc.querySelector('.life-summary').textContent, /참석 예정3명/);
  e.doc.querySelector('#life-tab-tasks').click();
  assert.ok(e.doc.querySelector('[data-kind="tasks"]'));
  const stored = e.win.localStorage.getItem(e.win.localStorage.key(0));
  e.logout();
  assert.equal(e.doc.querySelector('[data-private-root]').hidden, true);
  assert.equal(e.doc.querySelector('#lifeApp').childElementCount, 0);
  assert.equal(e.win.localStorage.getItem(e.win.localStorage.key(0)), stored);
});
