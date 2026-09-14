export const PROFILE_PATH = 'invitation_settings/shared';
export const MAX_GALLERY = 20;
export const MAX_PHOTOS = 21;
export const MAX_PHOTO_CHARS = 360000;
export const MAX_PHOTO_DIMENSION = 4096;
export const MAX_TRANSACTION_PHOTO_CHARS = 8000000;
export const VENUE_LIMITS = Object.freeze({ name: 80, hall: 80, address: 300, mapUrl: 1000, transport: 1000, parking: 1000 });
export const PHOTO_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const fail = (message, code = 'profile-invalid') => Object.assign(new Error(message), { code });
const keysWithin = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
export const emptyVenue = () => Object.fromEntries(Object.keys(VENUE_LIMITS).map(key => [key, '']));
export const emptyProfile = () => ({ schemaVersion: 1, revision: 0, coverId: null, galleryIds: [], venue: emptyVenue(), updatedAt: null, updatedBy: null });

export class ProfileConflict extends Error {
  constructor() { super('다른 기기에서 공통 사진이나 예식장 정보를 바꿨어요. 최신 내용을 확인한 뒤 다시 저장해주세요.'); this.code = 'profile-conflict'; }
}

export function validPhotoId(id) { return typeof id === 'string' && PHOTO_ID_PATTERN.test(id); }
export function validateVenue(value) {
  if (!keysWithin(value, Object.keys(VENUE_LIMITS))) throw fail('예식장 정보를 확인해주세요.');
  const result = {};
  for (const [key, limit] of Object.entries(VENUE_LIMITS)) {
    if (typeof value[key] !== 'string' || value[key].length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value[key])) throw fail('예식장 안내의 길이와 내용을 확인해주세요.');
    result[key] = value[key].trim();
  }
  if (!result.name && Object.values(result).some(Boolean)) throw fail('예식장 이름을 먼저 입력해주세요.');
  if (result.mapUrl) {
    let url;
    try { url = new URL(result.mapUrl); } catch { throw fail('지도 주소는 https로 시작하는 웹 주소를 입력해주세요.'); }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || /[\s\\]/.test(result.mapUrl)) throw fail('지도 주소는 https로 시작하는 웹 주소를 입력해주세요.');
  }
  return result;
}

/** Validate an editor draft, omitting server metadata from the result. */
export function validateProfile(value) {
  if (!keysWithin(value, ['schemaVersion', 'revision', 'coverId', 'galleryIds', 'venue', 'updatedAt', 'updatedBy'])
      || (own(value, 'schemaVersion') && value.schemaVersion !== 1)
      || (value.coverId !== null && !validPhotoId(value.coverId))
      || !Array.isArray(value.galleryIds) || value.galleryIds.length > MAX_GALLERY
      || value.galleryIds.some(id => !validPhotoId(id)) || new Set(value.galleryIds).size !== value.galleryIds.length) throw fail('대표 사진과 갤러리 사진을 확인해주세요.');
  return { schemaVersion: 1, coverId: value.coverId, galleryIds: [...value.galleryIds], venue: validateVenue(value.venue) };
}
const timestamp = value => typeof value === 'string' ? value : value?.toDate?.().toISOString() || null;
export function normalizeProfile(raw) {
  if (raw === null || raw === undefined) return emptyProfile();
  const value = validateProfile(raw);
  if (!Number.isSafeInteger(raw.revision) || raw.revision < 1 || typeof raw.updatedBy !== 'string' || !raw.updatedBy) throw fail('공통 설정의 저장 형식을 확인할 수 없어요.');
  return { ...value, revision: raw.revision, updatedBy: raw.updatedBy, updatedAt: timestamp(raw.updatedAt) };
}
export function profilePhotoIds(profile) { return [...new Set([profile.coverId, ...(profile.galleryIds || [])].filter(Boolean))]; }

export function validatePhoto(value) {
  if (!keysWithin(value, ['dataUrl', 'width', 'height', 'updatedAt', 'updatedBy'])
      || typeof value.dataUrl !== 'string' || value.dataUrl.length > MAX_PHOTO_CHARS
      || !/^data:image\/(?:jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.dataUrl)
      || !Number.isSafeInteger(value.width) || value.width < 1 || value.width > MAX_PHOTO_DIMENSION
      || !Number.isSafeInteger(value.height) || value.height < 1 || value.height > MAX_PHOTO_DIMENSION) throw fail('사진 형식이나 크기를 확인해주세요. JPEG·WebP 웹용 사진만 저장할 수 있어요.');
  const encoded = value.dataUrl.slice(value.dataUrl.indexOf(',') + 1);
  if (encoded.length % 4 !== 0) throw fail('사진 데이터를 읽을 수 없어요. 사진을 다시 선택해주세요.');
  return { dataUrl: value.dataUrl, width: value.width, height: value.height };
}

export function validateProfileChange(change) {
  if (!keysWithin(change, ['expectedRevision', 'profile', 'newPhotos']) || !Number.isSafeInteger(change.expectedRevision) || change.expectedRevision < 0) throw fail('저장 전에 최신 공통 설정을 확인해주세요.');
  const profile = validateProfile(change.profile), ids = new Set(profilePhotoIds(profile));
  const incoming = change.newPhotos ?? {};
  if (!object(incoming) || Object.keys(incoming).length > MAX_PHOTOS) throw fail('한 번에 저장할 사진 수를 확인해주세요.');
  const newPhotos = {};
  for (const [id, photo] of Object.entries(incoming)) {
    if (!validPhotoId(id) || !ids.has(id)) throw fail('선택하지 않은 사진은 저장할 수 없어요.');
    newPhotos[id] = validatePhoto(photo);
  }
  if (Object.values(newPhotos).reduce((size, photo) => size + photo.dataUrl.length, 0) > MAX_TRANSACTION_PHOTO_CHARS) throw fail('사진 용량이 커요. 더 작게 압축하거나 일부씩 저장해주세요.');
  return { expectedRevision: change.expectedRevision, profile, newPhotos };
}

export const emptyProfileSnapshot = () => ({ profile: emptyProfile(), photos: {}, ready: false });

/** A profile is renderable only after all of its immutable photo documents arrive. */
export function completeProfileSnapshot(profile, photos) {
  const selected = {};
  for (const id of profilePhotoIds(profile)) {
    if (!photos[id]) throw fail('선택된 사진을 찾지 못했어요. 다시 연결하거나 사진을 다시 선택해주세요.', 'profile-media-missing');
    selected[id] = validatePhoto(photos[id]);
  }
  return { profile, photos: selected, ready: true };
}
