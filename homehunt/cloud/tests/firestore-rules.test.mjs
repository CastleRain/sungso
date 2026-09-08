import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

// Run only against the explicitly selected demo emulator. Never fall back to
// the configured live project or require a real user's Firebase credential.
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
if (!emulator || !/^(?:127\.0\.0\.1|localhost):\d+$/.test(emulator)) throw new Error('A localhost Firestore emulator is required');
const [host, portText] = emulator.split(':');
let environment;
const ownerUid = 'owner-uid';
const partnerUid = 'partner-uid';
const member = (uid = ownerUid, changes = {}) => environment.authenticatedContext(uid, {
  email: uid === partnerUid ? 'partner@example.test' : 'owner@example.test',
  email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...changes,
}).firestore();
const snapshot = (uid = ownerUid, revision = 1, changes = {}) => ({
  snapshot: { schemaVersion: 1, recommendationFilters: { targetPriceManWon: 60000 }, visits: [],
    shortlist: [], compareIds: [], supplyFavorites: [], parkingObservations: {} },
  revision, updatedAt: '2026-09-08T01:00:00.000Z', updatedBy: uid, ...changes,
});
const reference = (db, uid = ownerUid) => doc(db, 'homehunt_user_snapshots', uid);
const seed = async (path, value) => environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), path), value));

before(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-homehunt', firestore: {
    host, port: Number(portText), rules: await readFile(new URL('../../../firestore.rules', import.meta.url), 'utf8'),
  } });
});
after(async () => { await environment?.cleanup(); });
beforeEach(async () => {
  await environment.clearFirestore();
  await seed('homehunt_members/owner@example.test', { active: true, householdId: 'family-a' });
  await seed('homehunt_members/partner@example.test', { active: true, householdId: 'family-a' });
});

test('unauthenticated users cannot create or read a private snapshot', async () => {
  await seed(`homehunt_user_snapshots/${ownerUid}`, snapshot());
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(reference(db)));
  await assertFails(setDoc(reference(db, 'anonymous-created'), snapshot('anonymous-created')));
});

test('approved verified Google user can create, retrieve, and update their own snapshot', async () => {
  const db = member();
  await assertSucceeds(setDoc(reference(db), snapshot()));
  const saved = await assertSucceeds(getDoc(reference(db)));
  assert.equal(saved.data().revision, 1);
  await assertSucceeds(setDoc(reference(db), snapshot(ownerUid, 2)));
  assert.equal((await getDoc(reference(db))).data().revision, 2);
});

test('uppercase verified Google email maps to its administrator-seeded membership', async () => {
  const db = member(ownerUid, { email: 'OWNER@EXAMPLE.TEST' });
  await assertSucceeds(setDoc(reference(db), snapshot()));
  await assertSucceeds(getDoc(reference(db)));
});

test('even another approved member of the same household cannot access this per-account backup', async () => {
  await seed(`homehunt_user_snapshots/${ownerUid}`, snapshot());
  const db = member(partnerUid);
  await assertFails(getDoc(reference(db)));
  await assertFails(setDoc(reference(db), snapshot(ownerUid, 2)));
  await assertFails(deleteDoc(reference(db)));
  await assertSucceeds(setDoc(reference(db, partnerUid), snapshot(partnerUid)));
});

test('snapshot collection listing and deleting ones own backup are denied', async () => {
  const db = member();
  await setDoc(reference(db), snapshot());
  await assertFails(getDocs(collection(db, 'homehunt_user_snapshots')));
  await assertFails(deleteDoc(reference(db)));
});

test('unverified email, non-Google login, and an unapproved Google account are denied', async () => {
  for (const claims of [
    { email_verified: false }, { firebase: { sign_in_provider: 'password' } },
    { firebase: { sign_in_provider: 'anonymous' } }, { email: 'unknown@example.test' },
  ]) {
    const db = member(ownerUid, claims);
    await assertFails(setDoc(reference(db), snapshot()));
    await assertFails(getDoc(reference(db)));
  }
});

test('deactivating membership immediately denies an existing users reads and writes', async () => {
  await seed(`homehunt_user_snapshots/${ownerUid}`, snapshot());
  await seed('homehunt_members/owner@example.test', { active: false, householdId: 'family-a' });
  const db = member();
  await assertFails(getDoc(reference(db)));
  await assertFails(setDoc(reference(db), snapshot(ownerUid, 2)));
});

test('membership is never readable, writable, or self-provisionable through a client', async () => {
  const db = member();
  const ref = doc(db, 'homehunt_members', 'owner@example.test');
  await assertFails(getDoc(ref));
  await assertFails(setDoc(ref, { active: true, householdId: 'attacker-selected-household' }));
  await assertFails(deleteDoc(ref));
  const newcomer = member('new-uid', { email: 'new@example.test' });
  await assertFails(setDoc(doc(newcomer, 'homehunt_members', 'new@example.test'), { active: true, householdId: 'family-a' }));
});

test('private server caches, quotas, jobs, job chunks, and household records are denied', async () => {
  const db = member();
  for (const path of [
    'homehunt_households/family-a/snapshots/main', 'homehunt_route_cache/route',
    'homehunt_provider_usage/kakao-transit_2026-09-08', 'homehunt_request_limits/limit',
    'homehunt_kapt_source_cache/list-41135',
    'homehunt_jobs/job', 'homehunt_jobs/job/chunks/catalog_0',
    'homehunt_apartment_cache/apt', 'homehunt_molit_month_cache/month',
    'homehunt_molit_month_cache/month/chunks/0000', 'homehunt_api_limits/limit', 'server_api_limits/limit',
  ]) {
    await seed(path, { private: true });
    const ref = doc(db, path);
    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, { private: false }));
  }
});

test('a newly created snapshot must start at revision one and identify the actual owner', async () => {
  const db = member();
  for (const value of [snapshot(ownerUid, 0), snapshot(ownerUid, 2), snapshot(partnerUid, 1)]) {
    await assertFails(setDoc(reference(db), value));
  }
  await assertSucceeds(setDoc(reference(db), snapshot()));
});

test('updates must advance the stored revision by exactly one', async () => {
  await seed(`homehunt_user_snapshots/${ownerUid}`, snapshot());
  const db = member();
  for (const value of [snapshot(ownerUid, 1), snapshot(ownerUid, 3), snapshot(ownerUid, -1), snapshot(partnerUid, 2)]) {
    await assertFails(setDoc(reference(db), value));
  }
  await assertSucceeds(setDoc(reference(db), snapshot(ownerUid, 2)));
});

test('concurrent writes with the same expected revision cannot both overwrite a snapshot', async () => {
  await seed(`homehunt_user_snapshots/${ownerUid}`, snapshot());
  const first = member();
  const second = member();
  const results = await Promise.allSettled([
    setDoc(reference(first), snapshot(ownerUid, 2)),
    setDoc(reference(second), snapshot(ownerUid, 2, { updatedAt: '2026-09-08T02:00:00.000Z' })),
  ]);
  assert.equal(results.filter((value) => value.status === 'fulfilled').length, 1);
  assert.equal(results.filter((value) => value.status === 'rejected' && value.reason.code === 'permission-denied').length, 1);
  assert.equal((await getDoc(reference(first))).data().revision, 2);
});

test('unknown top-level fields, wrong schema, and malformed collections are rejected', async () => {
  const db = member();
  const invalid = [
    snapshot(ownerUid, 1, { apiKey: 'not-allowed' }),
    snapshot(ownerUid, 1, { snapshot: { ...snapshot().snapshot, routes: [] } }),
    snapshot(ownerUid, 1, { snapshot: { ...snapshot().snapshot, schemaVersion: 2 } }),
    snapshot(ownerUid, 1, { snapshot: { ...snapshot().snapshot, visits: 'not-a-list' } }),
    snapshot(ownerUid, 1, { snapshot: { ...snapshot().snapshot, recommendationFilters: [] } }),
    snapshot(ownerUid, 1, { snapshot: { ...snapshot().snapshot, compareIds: ['1', '2', '3', '4'] } }),
    snapshot(ownerUid, 1, { snapshot: { ...snapshot().snapshot, visits: Array.from({ length: 1001 }, () => ({})) } }),
    snapshot(ownerUid, 1, { updatedAt: 'x'.repeat(31) }),
  ];
  for (const value of invalid) await assertFails(setDoc(reference(db), value));
});

test('existing public event, finance, honeymoon, and nested comment collections remain compatible', async () => {
  const db = environment.unauthenticatedContext().firestore();
  for (const path of [
    'events/test', 'wecost_settings/main', 'wecost_savings/test', 'wecost_items/test',
    'wecost_loans/test', 'wecost_adjustments/test', 'honeymoon_fx/test', 'blog_review_prefs/test',
    'resort_note_meta/test', 'resort_images/test', 'couplePicks/test', 'itineraries/test',
    'resort_notes/test/comments/comment',
  ]) {
    const ref = doc(db, path);
    await assertSucceeds(setDoc(ref, { regressionFixture: true }));
    assert.equal((await assertSucceeds(getDoc(ref))).data().regressionFixture, true);
  }
});

test('public blog caches remain readable but cannot be edited by any browser', async () => {
  const db = environment.unauthenticatedContext().firestore();
  for (const path of ['naver_blog_cache/test', 'naver_blog_meta/test']) {
    await seed(path, { fixture: true });
    await assertSucceeds(getDoc(doc(db, path)));
    await assertFails(setDoc(doc(db, path), { fixture: false }));
  }
});

test('unmatched collections remain closed by default', async () => {
  const db = member();
  await assertFails(setDoc(doc(db, 'unlisted_private_collection', 'test'), { anything: true }));
  await assertFails(getDoc(doc(db, 'unlisted_private_collection', 'test')));
});
