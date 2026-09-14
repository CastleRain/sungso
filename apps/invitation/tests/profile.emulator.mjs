import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { profileAdapter } from '../js/profile-adapter.mjs';
import { firestoreAdapter } from '../js/firestore-adapter.mjs';
import { defaultSelection } from '../js/core.mjs';

const require = createRequire(new URL('../../../services/homehunt/cloud/package.json', import.meta.url));
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const sdk = require('firebase/firestore');
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!endpoint || !/^(localhost|127\.0\.0\.1):\d+$/.test(endpoint)) {
  throw new Error('A localhost Firestore Emulator is required; production is never used.');
}
const [host, port] = endpoint.split(':');
const PROFILE_PATH = 'invitation_settings/shared';
const profileRef = db => sdk.doc(db, PROFILE_PATH);
const photoRef = (db, id) => sdk.doc(db, `${PROFILE_PATH}/photos/${id}`);
const photoId = number => `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const photo = (extra = {}) => ({ dataUrl: 'data:image/jpeg;base64,/9j/2Q==', width: 800, height: 600, ...extra });
const venue = (extra = {}) => ({
  name: '테스트 예식장', hall: '테스트 홀', address: '테스트시 예시로 1',
  mapUrl: 'https://example.test/map', transport: '테스트역에서 도보 5분', parking: '주차 안내 예시', ...extra,
});
const profile = (extra = {}) => ({ coverId: null, galleryIds: [], venue: venue(), ...extra });
const identities = new WeakMap();
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-homehunt',
    firestore: { host, port: Number(port), rules: await readFile(new URL('../../../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => environment?.cleanup());
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async ctx => {
    for (const role of ['sungwoo', 'sohee']) {
      await sdk.setDoc(sdk.doc(ctx.firestore(), 'site_members', `${role}-uid`), { active: true, role });
    }
    await sdk.setDoc(sdk.doc(ctx.firestore(), 'site_members', 'inactive-uid'), { active: false, role: 'sungwoo' });
  });
});

function client(role = 'sungwoo') {
  const uid = `${role}-uid`;
  const db = environment.authenticatedContext(uid, {
    email: `${role}@example.test`, email_verified: true, firebase: { sign_in_provider: 'google.com' },
  }).firestore();
  identities.set(db, { uid, role, name: role === 'sungwoo' ? '성우' : '소희' });
  return db;
}
const adapter = (db, options = {}) => profileAdapter(sdk, db, { member: () => identities.get(db), ...options });
const rawProfile = (db, values = profile(), revision = 1, extra = {}) => ({
  schemaVersion: 1, revision, ...values, updatedAt: sdk.serverTimestamp(), updatedBy: identities.get(db)?.uid || 'outside-uid', ...extra,
});
const rawPhoto = (db, values = photo(), extra = {}) => ({
  ...values, updatedAt: sdk.serverTimestamp(), updatedBy: identities.get(db)?.uid || 'outside-uid', ...extra,
});
const permissionDenied = action => assert.rejects(action, { code: 'permission-denied' });
const read = async (db, id) => (await sdk.getDoc(id ? photoRef(db, id) : profileRef(db))).data();

async function atomicCreate(db, id, values = photo(), parent = profile({ coverId: id }), photoExtra = {}, parentExtra = {}) {
  const batch = sdk.writeBatch(db);
  batch.set(profileRef(db), rawProfile(db, parent, 1, parentExtra));
  batch.set(photoRef(db, id), rawPhoto(db, values, photoExtra));
  return batch.commit();
}

async function firstReady(db, predicate = () => true) {
  const source = adapter(db);
  let stop, timer;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('The profile subscription did not become ready.')), 10000);
      stop = source.subscribe(value => {
        if (!value.ready || !predicate(value)) return;
        clearTimeout(timer);
        resolve(value);
      }, error => { clearTimeout(timer); reject(error); });
    });
  } finally { clearTimeout(timer); stop?.(); }
}

test('reading an absent invitation profile emits ready without creating a document or photo', async () => {
  const db = client();
  const snapshot = await firstReady(db);
  assert.equal(snapshot.profile.revision, 0);
  assert.equal(snapshot.profile.coverId, null);
  assert.deepEqual(snapshot.profile.galleryIds, []);
  assert.deepEqual(snapshot.photos, {});
  assert.equal((await sdk.getDoc(profileRef(db))).exists(), false);
  await environment.withSecurityRulesDisabled(async ctx => {
    assert.equal((await sdk.getDocs(sdk.collection(ctx.firestore(), `${PROFILE_PATH}/photos`))).size, 0);
  });
});

test('both active members can read and explicitly update the same profile and immutable photos', async () => {
  const first = client(), second = client('sohee'), id = photoId(1);
  await adapter(first).transact({ expectedRevision: 0, profile: profile({ coverId: id, galleryIds: [id] }), newPhotos: { [id]: photo() } });
  const snapshot = await firstReady(second, value => value.profile?.revision === 1);
  assert.equal(snapshot.profile.coverId, id);
  assert.deepEqual(snapshot.profile.galleryIds, [id]);
  assert.equal(snapshot.photos[id].dataUrl, photo().dataUrl);
  const originalPhoto = await read(second, id);
  assert.equal(originalPhoto.updatedBy, 'sungwoo-uid');
  assert.ok(originalPhoto.updatedAt instanceof sdk.Timestamp);
  await adapter(second).transact({
    expectedRevision: 1,
    profile: profile({ coverId: id, galleryIds: [id], venue: venue({ parking: '두 번째 회원이 변경한 주차 안내' }) }), newPhotos: {},
  });
  const saved = await read(first);
  assert.equal(saved.revision, 2);
  assert.equal(saved.updatedBy, 'sohee-uid');
  assert.ok(saved.updatedAt instanceof sdk.Timestamp);
  assert.equal(saved.venue.parking, '두 번째 회원이 변경한 주차 안내');
  assert.deepEqual(await read(first, id), originalPhoto);
});

test('replacing photos deletes only removed references and clearing the profile removes the remaining photos', async () => {
  const db = client(), a = photoId(1), b = photoId(2), c = photoId(3), d = photoId(4);
  await adapter(db).transact({
    expectedRevision: 0, profile: profile({ coverId: a, galleryIds: [b, c] }),
    newPhotos: { [a]: photo(), [b]: photo(), [c]: photo() },
  });
  const retained = await read(db, b);
  await adapter(db).transact({
    expectedRevision: 1, profile: profile({ coverId: b, galleryIds: [b, d] }), newPhotos: { [d]: photo({ width: 600, height: 800 }) },
  });
  assert.equal((await read(db)).revision, 2);
  assert.equal(await read(db, a), undefined);
  assert.equal(await read(db, c), undefined);
  assert.deepEqual(await read(db, b), retained);
  assert.equal((await read(db, d)).height, 800);
  await adapter(db).transact({ expectedRevision: 2, profile: profile(), newPhotos: {} });
  assert.equal((await read(db)).revision, 3);
  assert.equal(await read(db, b), undefined);
  assert.equal(await read(db, d), undefined);
});

test('twenty gallery photos plus a separate cover commit together within Firestore rule access limits', async () => {
  const db = client(), ids = Array.from({ length: 21 }, (_, index) => photoId(index + 1));
  const webp = photo({ dataUrl: 'data:image/webp;base64,UklGRg==', width: 4096, height: 1 });
  await adapter(db).transact({
    expectedRevision: 0, profile: profile({ coverId: ids[20], galleryIds: ids.slice(0, 20) }),
    newPhotos: Object.fromEntries(ids.map((id, index) => [id, index === 20 ? webp : photo()])),
  });
  const saved = await read(db);
  assert.equal(saved.revision, 1);
  assert.equal(saved.galleryIds.length, 20);
  assert.equal(saved.coverId, ids[20]);
  for (let index = 0; index < ids.length; index++) {
    assert.equal((await read(db, ids[index])).dataUrl, index === 20 ? webp.dataUrl : photo().dataUrl);
  }
});

test('two edits based on one revision cannot silently overwrite the winning profile or leak losing photos', async () => {
  const first = client(), second = client('sohee'), a = photoId(1), b = photoId(2);
  const results = await Promise.allSettled([
    adapter(first).transact({ expectedRevision: 0, profile: profile({ coverId: a }), newPhotos: { [a]: photo() } }),
    adapter(second).transact({ expectedRevision: 0, profile: profile({ coverId: b }), newPhotos: { [b]: photo() } }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === 'profile-conflict').length, 1);
  const saved = await read(first), winner = saved.coverId, loser = winner === a ? b : a;
  assert.equal(saved.revision, 1);
  assert.ok(await read(first, winner));
  assert.equal(await read(first, loser), undefined);
  await adapter(second).transact({ expectedRevision: 1, profile: profile({ coverId: winner, venue: venue({ hall: '다시 확인한 홀' }) }), newPhotos: {} });
  assert.equal((await read(first)).revision, 2);
});

test('the adapter rejects missing referenced photos and unreferenced uploads without a partial commit', async () => {
  const db = client(), missing = photoId(1), fresh = photoId(2);
  await assert.rejects(adapter(db).transact({
    expectedRevision: 0, profile: profile({ coverId: missing, galleryIds: [fresh] }), newPhotos: { [fresh]: photo() },
  }));
  assert.equal(await read(db), undefined);
  assert.equal(await read(db, fresh), undefined);
  await assert.rejects(adapter(db).transact({ expectedRevision: 0, profile: profile(), newPhotos: { [fresh]: photo() } }));
  assert.equal(await read(db), undefined);
  assert.equal(await read(db, fresh), undefined);
});

test('anonymous, nonmember, inactive, unverified and non-Google clients cannot read or write private profile data', async () => {
  const owner = client(), id = photoId(1);
  await adapter(owner).transact({ expectedRevision: 0, profile: profile({ coverId: id }), newPhotos: { [id]: photo() } });
  const token = { email: 'fixture@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
  const denied = [
    environment.unauthenticatedContext().firestore(),
    environment.authenticatedContext('outside-uid', token).firestore(),
    environment.authenticatedContext('inactive-uid', token).firestore(),
    environment.authenticatedContext('sungwoo-uid', { ...token, email_verified: false }).firestore(),
    environment.authenticatedContext('sungwoo-uid', { ...token, firebase: { sign_in_provider: 'password' } }).firestore(),
  ];
  for (const db of denied) {
    await permissionDenied(sdk.getDoc(profileRef(db)));
    await permissionDenied(sdk.getDoc(photoRef(db, id)));
    await permissionDenied(sdk.setDoc(profileRef(db), rawProfile(db, profile({ coverId: id }), 2)));
    await permissionDenied(sdk.deleteDoc(photoRef(db, id)));
  }
  assert.equal((await read(owner)).revision, 1);
  assert.ok(await read(owner, id));
});

test('server profile validation rejects malformed IDs, duplicates, excess gallery entries and unsafe or oversized venue fields', async () => {
  const db = client(), id = photoId(1);
  const venueLimits = { name: 80, hall: 80, address: 300, mapUrl: 1000, transport: 1000, parking: 1000 };
  const invalid = [
    profile({ coverId: 'not-a-photo-id' }), profile({ coverId: photoId(10).toUpperCase() }),
    profile({ coverId: id.replace('4000', '3000') }),
    profile({ galleryIds: [id, id] }), profile({ galleryIds: Array.from({ length: 21 }, (_, index) => photoId(index + 1)) }),
    profile({ galleryIds: [1] }), profile({ venue: { ...venue(), unexpected: 'not allowed' } }),
    profile({ venue: venue({ name: '' }) }), profile({ venue: venue({ name: 'invalid\u0000name' }) }),
    ...['http://example.test/map', 'javascript:alert(1)', 'data:text/html,hello', 'https://user:pass@example.test/map', 'https://example.test/with space'].map(mapUrl => profile({ venue: venue({ mapUrl }) })),
    ...Object.entries(venueLimits).map(([key, limit]) => profile({ venue: venue({ [key]: 'x'.repeat(limit + 1) }) })),
  ];
  for (const values of invalid) await permissionDenied(sdk.setDoc(profileRef(db), rawProfile(db, values)));
  for (const extra of [
    { schemaVersion: 2 }, { revision: 0 }, { revision: 1.5 }, { updatedBy: 'sohee-uid' },
    { updatedAt: sdk.Timestamp.fromMillis(1) }, { unexpected: true },
  ]) await permissionDenied(sdk.setDoc(profileRef(db), rawProfile(db, profile(), 1, extra)));
  assert.equal(await read(db), undefined);
});

test('server photo validation rejects unsafe payloads, malformed base64, excessive sizes and invalid dimensions atomically', async () => {
  const db = client(), id = photoId(1);
  const invalidPhotos = [
    photo({ dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }),
    photo({ dataUrl: 'data:image/png;base64,aGVsbG8=' }), photo({ dataUrl: 'https://example.test/photo.jpg' }),
    photo({ dataUrl: 'data:image/jpeg;base64,not base64!' }), photo({ dataUrl: 'data:image/jpeg;base64,' }),
    photo({ dataUrl: `data:image/jpeg;base64,${'A'.repeat(360000)}` }),
    photo({ width: 0 }), photo({ height: -1 }), photo({ width: 4097 }), photo({ height: 4097 }),
    photo({ width: 1.5 }), photo({ height: '600' }),
  ];
  for (const values of invalidPhotos) await permissionDenied(atomicCreate(db, id, values));
  for (const extra of [{ updatedBy: 'sohee-uid' }, { updatedAt: sdk.Timestamp.fromMillis(1) }, { unexpected: true }]) {
    await permissionDenied(atomicCreate(db, id, photo(), profile({ coverId: id }), extra));
  }
  assert.equal(await read(db), undefined);
  assert.equal(await read(db, id), undefined);
});

test('photo documents are immutable and cannot be independently created or deleted while referenced', async () => {
  const db = client(), id = photoId(1), unattached = photoId(2);
  await adapter(db).transact({ expectedRevision: 0, profile: profile({ coverId: id }), newPhotos: { [id]: photo() } });
  const original = await read(db, id);
  await permissionDenied(sdk.setDoc(photoRef(db, unattached), rawPhoto(db)));
  await permissionDenied(sdk.setDoc(photoRef(db, id), rawPhoto(db, photo({ width: 1 }))));
  await permissionDenied(sdk.updateDoc(photoRef(db, id), { width: 1, updatedAt: sdk.serverTimestamp() }));
  await permissionDenied(sdk.deleteDoc(photoRef(db, id)));
  await assert.rejects(adapter(db).transact({
    expectedRevision: 1, profile: profile({ coverId: id }), newPhotos: { [id]: photo({ width: 1 }) },
  }));
  assert.deepEqual(await read(db, id), original);
  assert.equal((await read(db)).revision, 1);
  assert.equal(await read(db, unattached), undefined);
});

test('photo writes require the same advanced parent commit and deletion requires removal of every reference', async () => {
  const db = client(), id = photoId(1), unattached = photoId(2);
  await adapter(db).transact({ expectedRevision: 0, profile: profile({ coverId: id, galleryIds: [id] }), newPhotos: { [id]: photo() } });
  const createUnreferenced = sdk.writeBatch(db);
  createUnreferenced.set(profileRef(db), rawProfile(db, profile({ coverId: id }), 2));
  createUnreferenced.set(photoRef(db, unattached), rawPhoto(db));
  await permissionDenied(createUnreferenced.commit());
  for (const remaining of [profile({ coverId: id }), profile({ galleryIds: [id] })]) {
    const deleteReferenced = sdk.writeBatch(db);
    deleteReferenced.set(profileRef(db), rawProfile(db, remaining, 2));
    deleteReferenced.delete(photoRef(db, id));
    await permissionDenied(deleteReferenced.commit());
  }
  const staleRevision = sdk.writeBatch(db);
  staleRevision.set(profileRef(db), rawProfile(db, profile(), 1));
  staleRevision.delete(photoRef(db, id));
  await permissionDenied(staleRevision.commit());
  assert.equal((await read(db)).revision, 1);
  assert.ok(await read(db, id));
  assert.equal(await read(db, unattached), undefined);
});

test('members can only get the exact shared profile and photo paths, without listing or deleting the parent', async () => {
  const db = client(), id = photoId(1);
  await adapter(db).transact({ expectedRevision: 0, profile: profile({ coverId: id }), newPhotos: { [id]: photo() } });
  await permissionDenied(sdk.getDocs(sdk.collection(db, 'invitation_settings')));
  await permissionDenied(sdk.getDocs(sdk.collection(db, `${PROFILE_PATH}/photos`)));
  await permissionDenied(sdk.deleteDoc(profileRef(db)));
  for (const path of ['invitation_settings/other', `invitation_settings/other/photos/${id}`, `${PROFILE_PATH}/unknown/${id}`]) {
    await permissionDenied(sdk.getDoc(sdk.doc(db, path)));
    await permissionDenied(sdk.setDoc(sdk.doc(db, path), rawProfile(db)));
  }
  assert.equal((await read(db)).revision, 1);
  assert.ok(await read(db, id));
});

test('offline profile edits fail before writing and leave the saved document and photos unchanged', async () => {
  const db = client(), a = photoId(1), b = photoId(2);
  await adapter(db).transact({ expectedRevision: 0, profile: profile({ coverId: a }), newPhotos: { [a]: photo() } });
  const beforeProfile = await read(db), beforePhoto = await read(db, a);
  await assert.rejects(adapter(db, { online: () => false }).transact({
    expectedRevision: 1, profile: profile({ coverId: b }), newPhotos: { [b]: photo() },
  }), /인터넷/);
  assert.deepEqual(await read(db), beforeProfile);
  assert.deepEqual(await read(db, a), beforePhoto);
  assert.equal(await read(db, b), undefined);
});

test('profile transactions preserve existing invitation favorites, selected design and unrelated resort picks', async () => {
  const db = client(), partner = client('sohee'), id = photoId(1);
  const picks = firestoreAdapter(sdk, db, { member: () => identities.get(db) });
  const partnerPicks = firestoreAdapter(sdk, partner, { member: () => identities.get(partner) });
  await picks.transact({ type: 'favorite', actor: 'sungwoo', templateId: 'minimal', enabled: true });
  await partnerPicks.transact({ type: 'favorite', actor: 'sohee', templateId: 'garden', enabled: true });
  await picks.transact({ type: 'selection', actor: 'sungwoo', selection: defaultSelection('photo'), expectedRevision: 0 });
  const picksRef = sdk.doc(db, 'couplePicks/invitation_templates'), resortRef = sdk.doc(db, 'couplePicks/main');
  await sdk.setDoc(resortRef, { confirmedResort: 'legacy-fixture' });
  const beforePicks = (await sdk.getDoc(picksRef)).data(), beforeResort = (await sdk.getDoc(resortRef)).data();
  await adapter(partner).transact({ expectedRevision: 0, profile: profile({ coverId: id }), newPhotos: { [id]: photo() } });
  assert.deepEqual((await sdk.getDoc(picksRef)).data(), beforePicks);
  assert.deepEqual((await sdk.getDoc(resortRef)).data(), beforeResort);
  assert.equal((await read(db)).updatedBy, 'sohee-uid');
});
