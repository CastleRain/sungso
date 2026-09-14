import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PHOTO_CHARS, emptyProfile, emptyVenue, validateProfile, normalizeProfile, validateVenue, validatePhoto, validateProfileChange, profilePhotoIds, completeProfileSnapshot } from '../js/profile-core.mjs';

const id = index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const photo = () => ({ dataUrl: 'data:image/jpeg;base64,/9j/2Q==', width: 1600, height: 1067 });
const profile = (patch = {}) => ({ coverId: null, galleryIds: [], venue: emptyVenue(), ...patch });

test('missing shared content remains an empty unsaved profile with independent defaults', () => {
  const first = normalizeProfile(null), second = emptyProfile();
  assert.equal(first.revision, 0);
  assert.equal(first.coverId, null);
  assert.equal(first.mapImageId, null);
  assert.deepEqual(first.galleryIds, []);
  first.venue.name = 'draft'; first.galleryIds.push(id(1));
  assert.deepEqual(second.venue, emptyVenue());
  assert.deepEqual(second.galleryIds, []);
  assert.equal(second.updatedBy, null);
  assert.deepEqual(completeProfileSnapshot(second, { [id(2)]: photo() }), { profile: second, photos: {}, ready: true });
});

test('twenty gallery photos and a separate cover are accepted while duplicate and invalid IDs are rejected', () => {
  const value = profile({ coverId: id(21), galleryIds: Array.from({ length: 20 }, (_, index) => id(index + 1)) });
  assert.equal(profilePhotoIds(validateProfile(value)).length, 21);
  value.coverId = value.galleryIds[0];
  assert.equal(profilePhotoIds(validateProfile(value)).length, 20);
  for (const patch of [{ galleryIds: [id(1), id(1)] }, { galleryIds: Array.from({ length: 21 }, (_, i) => id(i)) }, { coverId: 'main' }, { coverId: '../private' }, { galleryIds: ['__proto__'] }, { galleryIds: [null] }, { schemaVersion: 2 }]) {
    assert.throws(() => validateProfile(profile(patch)), { code: 'profile-invalid' });
  }
});

test('venue strings are bounded plain text and map links cannot execute code or carry credentials', () => {
  const venue = { ...emptyVenue(), name: '  웨딩홀  ', hall: ' 가든홀 ', address: '<b>주소</b>', mapUrl: 'https://map.naver.com/p/search/wedding', transport: '첫 줄\n둘째 줄' };
  assert.deepEqual(validateVenue(venue), { ...venue, name: '웨딩홀', hall: '가든홀' });
  for (const patch of [{ hall: '장소 이름 없음' }, { name: 'x'.repeat(81) }, { name: 'hall', extra: 'data' }, { name: 'hall', transport: 'x'.repeat(1001) }]) assert.throws(() => validateVenue({ ...emptyVenue(), ...patch }));
  for (const mapUrl of ['javascript:alert(1)', 'data:text/html,hello', 'http://example.test', 'https://user:secret@example.test/', 'https://example.test/with space', 'https://example.test\\path', 'https://example.test/\npath']) {
    assert.throws(() => validateVenue({ ...emptyVenue(), name: 'hall', mapUrl }), { code: 'profile-invalid' });
  }
  assert.throws(() => validateVenue({ ...emptyVenue(), name: 'hall\u0000' }));
});

test('photo validation only admits bounded JPEG or WebP base64 and actual positive dimensions', () => {
  assert.deepEqual(validatePhoto(photo()), photo());
  assert.equal(validatePhoto({ ...photo(), dataUrl: 'data:image/webp;base64,UklGRg==' }).width, 1600);
  for (const patch of [
    { dataUrl: 'javascript:alert(1)' }, { dataUrl: 'data:image/svg+xml;base64,AAAA' }, { dataUrl: 'data:image/png;base64,AAAA' },
    { dataUrl: 'data:image/jpeg;base64,A===' }, { dataUrl: 'data:image/jpeg;base64,A' }, { dataUrl: 'data:image/jpeg;base64,AA AA' },
    { dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(MAX_PHOTO_CHARS) }, { width: 0 }, { width: 4097 }, { height: 1.5 }, { height: NaN }, { src: 'https://example.test/photo' },
  ]) assert.throws(() => validatePhoto({ ...photo(), ...patch }), { code: 'profile-invalid' });
});

test('saved profile schema failures do not masquerade as an empty profile or reset its revision', () => {
  const raw = { ...profile({ coverId: id(1) }), schemaVersion: 1, revision: 3, updatedBy: 'member-uid', updatedAt: { toDate: () => new Date('2027-01-02T00:00:00Z') } };
  const normalized = normalizeProfile(raw);
  assert.equal(normalized.revision, 3);
  assert.equal(normalized.updatedAt, '2027-01-02T00:00:00.000Z');
  for (const patch of [{ schemaVersion: 2 }, { revision: 0 }, { revision: 2.5 }, { updatedBy: null }, { unrelated: 'data' }]) assert.throws(() => normalizeProfile({ ...raw, ...patch }));
  assert.equal(raw.updatedAt.toDate().toISOString(), normalized.updatedAt);
});

test('change validation rejects orphan uploads and missing or invalid revision without mutating a draft', () => {
  const raw = { expectedRevision: 3, profile: profile({ coverId: id(1), galleryIds: [id(1)] }), newPhotos: { [id(1)]: photo() } };
  const before = structuredClone(raw);
  const value = validateProfileChange(raw);
  assert.deepEqual(raw, before);
  value.profile.galleryIds.push(id(2));
  assert.deepEqual(raw.profile.galleryIds, [id(1)]);
  for (const patch of [{ expectedRevision: null }, { expectedRevision: -1 }, { expectedRevision: 0.5 }, { newPhotos: { [id(2)]: photo() } }, { newPhotos: [] }, { deleteAll: true }]) assert.throws(() => validateProfileChange({ ...raw, ...patch }));
});

test('a complete snapshot exposes only referenced photos and missing or corrupt media never becomes ready', () => {
  const settings = { ...emptyProfile(), coverId: id(1), galleryIds: [id(2), id(1)] };
  assert.throws(() => completeProfileSnapshot(settings, { [id(1)]: photo() }), { code: 'profile-media-missing' });
  assert.throws(() => completeProfileSnapshot(settings, { [id(1)]: photo(), [id(2)]: { ...photo(), dataUrl: 'https://example.test' } }), { code: 'profile-invalid' });
  const ready = completeProfileSnapshot(settings, { [id(1)]: photo(), [id(2)]: photo(), [id(3)]: photo() });
  assert.equal(ready.ready, true);
  assert.deepEqual(Object.keys(ready.photos).sort(), [id(1), id(2)]);
});

test('legacy profiles normalize optional map fields without changing saved content or revision', () => {
  const venue = { name: '기존 홀', hall: '3층', address: '기존 주소', mapUrl: 'https://example.test/old-map', transport: '', parking: '' };
  const raw = { ...profile({ venue }), schemaVersion: 1, revision: 9, updatedBy: 'member-uid', updatedAt: '2027-01-01T00:00:00Z' };
  const before = structuredClone(raw), normalized = normalizeProfile(raw);
  assert.equal(normalized.mapImageId, null);
  assert.deepEqual(normalized.venue, { ...venue, naverUrl: '', kakaoUrl: '' });
  assert.equal(normalized.revision, 9);
  assert.deepEqual(raw, before);
  assert.deepEqual(validateProfile(normalized).venue, normalized.venue);
  const { hall: _hall, ...incomplete } = venue;
  assert.throws(() => validateVenue(incomplete));
});

test('a separate map and twenty gallery photos plus a cover share immutable media validation', () => {
  const galleryIds = Array.from({ length: 20 }, (_, index) => id(index + 1));
  const value = profile({ coverId: id(21), galleryIds, mapImageId: id(22) });
  const newPhotos = Object.fromEntries(profilePhotoIds(value).map(key => [key, photo()]));
  assert.equal(Object.keys(validateProfileChange({ expectedRevision: 0, profile: value, newPhotos }).newPhotos).length, 22);
  assert.deepEqual(profilePhotoIds(value), [id(21), ...galleryIds, id(22)]);
  assert.equal(profilePhotoIds({ ...value, mapImageId: id(1) }).length, 21);
  const { [id(22)]: _map, ...missingMap } = newPhotos;
  assert.throws(() => completeProfileSnapshot(value, missingMap), { code: 'profile-media-missing' });
  assert.equal(completeProfileSnapshot(value, newPhotos).photos[id(22)].dataUrl, photo().dataUrl);
  for (const mapImageId of ['', '../map', 1, {}, undefined]) assert.throws(() => validateProfile(profile({ mapImageId })), { code: 'profile-invalid' });
});

test('both optional provider links use the existing strict HTTPS and venue name constraints', () => {
  const values = { ...emptyVenue(), name: '웨딩홀', naverUrl: 'https://naver.me/fixture', kakaoUrl: 'https://map.kakao.com/?itemId=1&map_type=TYPE_MAP' };
  assert.deepEqual(validateVenue(values), values);
  for (const key of ['naverUrl', 'kakaoUrl']) {
    for (const invalid of ['http://example.test', 'javascript:alert(1)', 'https://user:pass@example.test', 'https://example.test/with space', 'https://example.test\\path', 'https://example.test/\npath', 'x'.repeat(1001), null, undefined]) {
      assert.throws(() => validateVenue({ ...values, [key]: invalid }), { code: 'profile-invalid' });
    }
    assert.throws(() => validateVenue({ ...emptyVenue(), [key]: 'https://example.test/map' }));
  }
});
