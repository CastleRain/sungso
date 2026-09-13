import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, orderBy, limit, serverTimestamp, writeBatch } from 'firebase/firestore';
import { TEMPLATES } from '../../../../apps/invitation/js/catalog.mjs';

const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!endpoint || !/^(?:127\.0\.0\.1|localhost):\d+$/.test(endpoint)) throw new Error('A localhost Firestore Emulator is required');
const [host, port] = endpoint.split(':');
let env;
const uid = 'couple-first', partner = 'couple-second';
const client = (id = uid, claims = {}) => env.authenticatedContext(id, {
  email: 'fixture@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...claims,
}).firestore();
const seed = async (path, data) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), path), data));
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-homehunt', firestore: { host, port: Number(port),
  rules: await readFile(new URL('../../../../firestore.rules', import.meta.url), 'utf8') } }); });
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(`site_members/${uid}`, { active: true, role: 'sungwoo', householdId: 'unchanged-household' });
  await seed(`site_members/${partner}`, { active: true, role: 'sohee', householdId: 'unchanged-household' });
});

const home = (author = uid, revision = 1) => ({
  groups: ['daily', 'wedding', 'travel'].map(id => ({ id, name: id })),
  apps: ['dates', 'homehunt', 'wecost', 'invitation', 'travel', 'honeymoon'].map(id => ({ id, groupId: 'daily', hidden: false })),
  revision, updatedBy: author, updatedAt: serverTimestamp(),
});
const invitation = (author = uid) => ({ schemaVersion: 1, updatedBy: author, updatedAt: serverTimestamp() });
const selection = { schemaVersion: 1, templateId: 'minimal', paletteId: 'ivory', galleryLayout: 'grid', sections: {}, note: '' };
const audit = (author = uid, type = 'day') => ({ tripId: 'honeymoon_2027', type, target: 'synthetic',
  actor: author === uid ? '성우' : '소희', actorUid: author, before: {}, after: { fixture: true }, changedAt: serverTimestamp() });

test('membership status is own-get only and cannot be provisioned, enumerated, or escalated by clients', async () => {
  const db = client(), own = doc(db, 'site_members', uid);
  assert.equal((await assertSucceeds(getDoc(own))).data().role, 'sungwoo');
  await assertFails(getDoc(doc(db, 'site_members', partner)));
  await assertFails(getDocs(collection(db, 'site_members')));
  await assertFails(setDoc(own, { active: true, role: 'sohee' }));
  await assertFails(deleteDoc(own));
  await assertFails(setDoc(doc(client('outsider'), 'site_members', 'outsider'), { active: true, role: 'sungwoo' }));
  await seed(`site_members/${uid}`, { active: false, role: 'sungwoo' });
  assert.equal((await assertSucceeds(getDoc(own))).data().active, false);
});

test('anonymous, unregistered, disabled, invalid-role and non-Google users cannot access any personal surface', async () => {
  await seed('events/preserved', { title: 'Fixture', date: '2030-01-01' });
  await seed('site_members/disabled', { active: false, role: 'sungwoo' });
  await seed('site_members/invalid-role', { active: true, role: 'admin' });
  const denied = [env.unauthenticatedContext().firestore(), client('outsider'), client('disabled'), client('invalid-role'),
    client(uid, { email_verified: false }), client(uid, { firebase: { sign_in_provider: 'password' } })];
  for (const db of denied) for (const path of ['events/preserved', 'site_home/shared', 'home_notes/note',
    'private_data/travel_reference', 'private_files/pdf', 'couplePicks/invitation_templates', 'itineraries/honeymoon_2027_budget']) {
    await assertFails(getDoc(doc(db, path)));
    await assertFails(setDoc(doc(db, path), { overwritten: true }));
  }
});

test('shared home supports both members, exact revision conflicts, complete hiding and ordered restore', async () => {
  const first = client(), second = client(partner), path = 'site_home/shared';
  await assertSucceeds(setDoc(doc(first, path), home()));
  const results = await Promise.allSettled([
    setDoc(doc(first, path), { ...home(uid, 2), apps: home().apps.map(app => ({ ...app, hidden: true })) }),
    setDoc(doc(second, path), { ...home(partner, 2), groups: home().groups.reverse() }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  await assertSucceeds(setDoc(doc(second, path), home(partner, 3)));
  assert.equal((await getDoc(doc(first, path))).data().revision, 3);
  await assertFails(deleteDoc(doc(first, path)));
});

test('home rejects spoofed authors/times, injected app URLs, missing or duplicate IDs and skipped revision', async () => {
  const db = client();
  for (const bad of [home(partner), home(uid, 2), { ...home(), updatedAt: new Date(0) },
    { ...home(), apps: home().apps.slice(1) }, { ...home(), apps: [...home().apps.slice(1), home().apps[1]] },
    { ...home(), apps: home().apps.map(app => ({ ...app, url: 'https://attacker.invalid' })) },
    { ...home(), groups: home().groups.map(group => ({ ...group, name: 'x'.repeat(31) })) }]) {
    await assertFails(setDoc(doc(db, 'site_home/shared'), bad));
  }
});

test('notes are readable by both members, bounded plain data, immutable and author-deletable only', async () => {
  const first = client(), second = client(partner);
  const note = { text: '<script>plain text</script>', authorUid: uid, createdAt: serverTimestamp() };
  const ref = doc(first, 'home_notes/first');
  await assertSucceeds(setDoc(ref, note));
  assert.equal((await getDoc(doc(second, 'home_notes/first'))).data().text, note.text);
  await assertSucceeds(getDocs(query(collection(second, 'home_notes'), orderBy('createdAt', 'desc'), limit(3))));
  await assertFails(setDoc(ref, { ...note, text: 'edited' }));
  await assertFails(deleteDoc(doc(second, 'home_notes/first')));
  for (const bad of [{ ...note, authorUid: partner }, { ...note, text: 'x'.repeat(501) }, { ...note, text: '' },
    { ...note, createdAt: new Date(0) }, { ...note, admin: true }]) await assertFails(setDoc(doc(first, 'home_notes/invalid'), bad));
  await assertSucceeds(setDoc(doc(second, 'home_notes/second'), { ...note, authorUid: partner, text: 'x'.repeat(500) }));
  await assertSucceeds(deleteDoc(ref));
});

test('migrated reference and file metadata are readable by members and admin-write only', async () => {
  for (const path of ['private_data/travel_reference', 'private_data/honeymoon_reference', 'private_files/fixture']) {
    await seed(path, { schemaVersion: 1, fixture: true });
    for (const db of [client(), client(partner)]) {
      assert.equal((await assertSucceeds(getDoc(doc(db, path)))).data().fixture, true);
      await assertFails(setDoc(doc(db, path), { fixture: false }));
      await assertFails(deleteDoc(doc(db, path)));
    }
  }
});

test('invitation favorites merge only the authenticated role; the broad match cannot bypass the restriction', async () => {
  const first = client(), second = client(partner), path = 'couplePicks/invitation_templates';
  await assertSucceeds(setDoc(doc(first, path), { ...invitation(), favorites: { sungwoo: ['minimal'] } }, { merge: true }));
  await assertSucceeds(setDoc(doc(second, path), { ...invitation(partner), favorites: { sohee: ['constellation'] } }, { merge: true }));
  assert.deepEqual((await getDoc(doc(first, path))).data().favorites, { sungwoo: ['minimal'], sohee: ['constellation'] });
  await assertFails(setDoc(doc(first, path), { ...invitation(), favorites: { sohee: ['photo'] } }, { merge: true }));
  await assertFails(setDoc(doc(first, path), { ...invitation(), favorites: { sungwoo: ['photo'] } }));
  await assertFails(setDoc(doc(first, path), { ...invitation(partner), favorites: { sungwoo: ['photo'] } }, { merge: true }));
  await assertFails(deleteDoc(doc(first, path)));
  await assertSucceeds(setDoc(doc(first, 'couplePicks/main'), { confirmedResort: 'preserved-fixture' }));
});

test('invitation selection revision and server time cannot be forged or silently overwritten', async () => {
  const db = client(), ref = doc(db, 'couplePicks/invitation_templates');
  await assertSucceeds(setDoc(ref, { ...invitation(), selection, selectionRevision: 1 }));
  await assertFails(setDoc(ref, { ...invitation(), selection: { ...selection, note: 'bad revision' } }, { merge: true }));
  await assertFails(setDoc(ref, { ...invitation(), selectionRevision: 3 }, { merge: true }));
  await assertFails(setDoc(ref, { ...invitation(), selectionRevision: 2, updatedAt: new Date(0) }, { merge: true }));
  await assertSucceeds(setDoc(ref, { ...invitation(), selection: { ...selection, note: 'next' }, selectionRevision: 2 }, { merge: true }));
});

test('all twelve released invitation template IDs remain valid favorite choices for each member', async () => {
  assert.equal(TEMPLATES.length, 12);
  const first = client(), second = client(partner), path = 'couplePicks/invitation_templates';
  const all = TEMPLATES.map(template => template.id);
  await assertSucceeds(setDoc(doc(first, path), { ...invitation(), favorites: { sungwoo: all } }, { merge: true }));
  await assertSucceeds(setDoc(doc(second, path), { ...invitation(partner), favorites: { sohee: all } }, { merge: true }));
  const saved = (await getDoc(doc(first, path))).data();
  assert.deepEqual(saved.favorites.sungwoo, all); assert.deepEqual(saved.favorites.sohee, all);
});

test('trip and budget logs are append-only and bind the actor UID, display name and server time', async () => {
  for (const [prefix, type] of [['honeymoon_2027_log_', 'day'], ['honeymoon_2027_budget_log_', 'budget']]) {
    const db = client(), ref = doc(db, 'itineraries', prefix + 'fixture');
    await assertSucceeds(setDoc(ref, audit(uid, type)));
    await assertFails(setDoc(ref, audit(uid, type)));
    await assertFails(deleteDoc(ref));
    for (const bad of [{ ...audit(uid, type), actorUid: partner }, { ...audit(uid, type), actor: '소희' },
      { ...audit(uid, type), changedAt: new Date(0) }, { ...audit(uid, type), tripId: 'main' }]) {
      await assertFails(setDoc(doc(db, 'itineraries', prefix + 'invalid'), bad));
    }
    await assertSucceeds(setDoc(doc(client(partner), 'itineraries', prefix + 'partner'), audit(partner, type)));
  }
});

test('a rejected audit atomically preserves the existing ledger and budget; a valid batch preserves the current trip', async () => {
  const db = client();
  const item = doc(db, 'wecost_items/trip-item'), plan = doc(db, 'itineraries/honeymoon_2027_budget');
  await seed('wecost_items/trip-item', { cat: '✈️신혼여행', planned: 100, actual: 20, untouched: 'keep' });
  await seed('itineraries/honeymoon_2027_budget', { linkedItemId: 'trip-item', reserve: 30 });
  await seed('itineraries/honeymoon_2027', { preserved: true });
  for (const valid of [false, true]) {
    const batch = writeBatch(db);
    batch.update(item, { planned: 120 }); batch.update(plan, { reserve: 40 });
    batch.set(doc(db, 'itineraries/honeymoon_2027_budget_log_atomic'), { ...audit(uid, 'budget'), actorUid: valid ? uid : partner });
    if (valid) await assertSucceeds(batch.commit()); else await assertFails(batch.commit());
    assert.equal((await getDoc(item)).data().planned, valid ? 120 : 100);
    assert.equal((await getDoc(plan)).data().reserve, valid ? 40 : 30);
    assert.equal((await getDoc(item)).data().untouched, 'keep');
    assert.equal((await getDoc(doc(db, 'itineraries/honeymoon_2027'))).data().preserved, true);
  }
  await seed('itineraries/main', { legacy: true });
  await assertSucceeds(getDoc(doc(db, 'itineraries/main')));
  await assertFails(setDoc(doc(db, 'itineraries/main'), { legacy: false }));
  await assertFails(deleteDoc(doc(db, 'itineraries/main')));
});
