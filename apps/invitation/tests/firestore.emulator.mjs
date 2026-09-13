import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { firestoreAdapter } from '../js/firestore-adapter.mjs';
import { defaultSelection, DOCUMENT_PATH, normalizeDocument } from '../js/core.mjs';

const require = createRequire(new URL('../../../services/homehunt/cloud/package.json', import.meta.url));
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const sdk = require('firebase/firestore');
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!endpoint || !/^(localhost|127\.0\.0\.1):\d+$/.test(endpoint)) throw new Error('A localhost Firestore Emulator is required; production is never used.');
const [host, port] = endpoint.split(':');
let environment;
const ref = db => sdk.doc(db, ...DOCUMENT_PATH.split('/'));
before(async () => { environment = await initializeTestEnvironment({ projectId: 'demo-homehunt', firestore: { host, port: Number(port), rules: await readFile(new URL('../../../firestore.rules', import.meta.url), 'utf8') } }); });
after(async () => environment?.cleanup());
beforeEach(async () => environment.clearFirestore());
const client = () => environment.unauthenticatedContext().firestore();

test('read-only subscription does not create a selection document', async () => {
  const db = client(), adapter = firestoreAdapter(sdk, db);
  let stop;
  await new Promise((resolve, reject) => { stop = adapter.subscribe((raw, connection) => { if (connection === 'live') { assert.equal(raw, null); resolve(); } }, reject); });
  stop(); assert.equal((await sdk.getDoc(ref(db))).exists(), false);
});
test('simultaneous favorites from different people merge without changing the saved selection or legacy picks', async () => {
  const first = client(), second = client();
  await sdk.setDoc(sdk.doc(first, 'couplePicks', 'main'), { confirmedResort: 'legacy-fixture' });
  await firestoreAdapter(sdk, first).transact({ type: 'selection', actor: 'sungwoo', selection: defaultSelection('letter'), expectedRevision: 0 });
  await Promise.all([
    firestoreAdapter(sdk, first).transact({ type: 'favorite', actor: 'sungwoo', templateId: 'minimal', enabled: true }),
    firestoreAdapter(sdk, second).transact({ type: 'favorite', actor: 'sohee', templateId: 'garden', enabled: true }),
  ]);
  const saved = normalizeDocument((await sdk.getDoc(ref(first))).data());
  assert.deepEqual(saved.favorites, { sungwoo: ['minimal'], sohee: ['garden'] });
  assert.equal(saved.selection.templateId, 'letter'); assert.equal(saved.selectionRevision, 1);
  assert.equal((await sdk.getDoc(sdk.doc(first, 'couplePicks', 'main'))).data().confirmedResort, 'legacy-fixture');
});
test('two final choices with the same expected revision cannot silently overwrite one another', async () => {
  const first = client(), second = client();
  const result = await Promise.allSettled([
    firestoreAdapter(sdk, first).transact({ type: 'selection', actor: 'sungwoo', selection: defaultSelection('photo'), expectedRevision: 0 }),
    firestoreAdapter(sdk, second).transact({ type: 'selection', actor: 'sohee', selection: defaultSelection('garden'), expectedRevision: 0 }),
  ]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(result.filter(item => item.status === 'rejected' && item.reason.code === 'selection-conflict').length, 1);
  const saved = (await sdk.getDoc(ref(first))).data(); assert.equal(saved.selectionRevision, 1);
  await firestoreAdapter(sdk, second).transact({ type: 'selection', actor: 'sohee', selection: defaultSelection('sketch'), expectedRevision: 1 });
  assert.equal((await sdk.getDoc(ref(first))).data().selection.templateId, 'sketch');
});
test('offline adapter rejects writes and leaves the remote snapshot unchanged', async () => {
  const db = client();
  await assert.rejects(firestoreAdapter(sdk, db, { online: () => false }).transact({ type: 'favorite', actor: 'sohee', templateId: 'garden', enabled: true }), /인터넷/);
  assert.equal((await sdk.getDoc(ref(db))).exists(), false);
});

test('a special template saves and exports only design settings alongside existing favorites', async () => {
  const db = client(), adapter = firestoreAdapter(sdk, db);
  await adapter.transact({ type: 'favorite', actor: 'sungwoo', templateId: 'minimal', enabled: true });
  await adapter.transact({ type: 'favorite', actor: 'sohee', templateId: 'constellation', enabled: true });
  await adapter.transact({ type: 'selection', actor: 'sohee', expectedRevision: 0, selection: { ...defaultSelection('constellation'), paletteId: 'plum', active: true, stars: [0, 1, 2, 3, 4] } });
  const saved = (await sdk.getDoc(ref(db))).data();
  assert.equal(saved.selection.templateId, 'constellation');
  assert.equal(saved.selection.paletteId, 'plum');
  assert.equal(saved.selectionRevision, 1);
  assert.deepEqual(saved.favorites, { sungwoo: ['minimal'], sohee: ['constellation'] });
  assert.equal('active' in saved.selection, false);
  assert.equal('stars' in saved.selection, false);
});
