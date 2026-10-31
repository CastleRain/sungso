/** Portable, local-only content. No credentials, endpoint, HTML, or public-write flag is accepted. */
export const CONTENT_VERSION = 1;
export const CONTENT_MAX_PHOTOS = 20;
export const CONTENT_MAX_BYTES = 10 * 1024 * 1024;
export const CONTENT_FILE_BYTES = CONTENT_MAX_BYTES + 64 * 1024;
export const CONTENT_PHOTO_BYTES = 1024 * 1024;
export const CONTENT_FIELDS = Object.freeze([
  { id: 'groom', label: '신랑 이름', group: 'family', limit: 20, section: 'invitation' },
  { id: 'groomFather', label: '신랑 아버지', group: 'family', limit: 20, section: 'invitation' },
  { id: 'groomMother', label: '신랑 어머니', group: 'family', limit: 20, section: 'invitation' },
  { id: 'bride', label: '신부 이름', group: 'family', limit: 20, section: 'invitation' },
  { id: 'brideFather', label: '신부 아버지', group: 'family', limit: 20, section: 'invitation' },
  { id: 'brideMother', label: '신부 어머니', group: 'family', limit: 20, section: 'invitation' },
  { id: 'invitation', label: '초대 문구', group: 'invitation', limit: 600, section: 'invitation', multiline: true },
  ...Array.from({ length: 3 }, (_, index) => [
    { id: `story${index + 1}Title`, label: `${index + 1}장 제목`, group: `story${index + 1}`, limit: 80, section: 'our-story' },
    { id: `story${index + 1}Body`, label: `${index + 1}장 이야기`, group: `story${index + 1}`, limit: 1200, section: 'our-story', multiline: true },
    { id: `story${index + 1}Quote`, label: `${index + 1}장 한마디`, group: `story${index + 1}`, limit: 240, section: 'our-story', multiline: true },
    { id: `story${index + 1}Note`, label: `${index + 1}장 덧붙임`, group: `story${index + 1}`, limit: 240, section: 'our-story', multiline: true },
  ]).flat(),
  { id: 'closing', label: '마지막 인사', group: 'closing', limit: 300, section: 'closing', multiline: true },
].map(Object.freeze));
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
export function validateRaster(value) {
  if (typeof value !== 'string' || value.length > CONTENT_PHOTO_BYTES) throw new Error('사진 한 장의 저장 크기를 초과했어요. 사진을 다시 추가해 주세요.');
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4) throw new Error('JPG·PNG·WebP 사진만 불러올 수 있어요.');
  let bytes; try { bytes = atob(match[2].slice(0, 32)); } catch { throw new Error('사진 파일을 읽지 못했어요.'); }
  const valid = match[1] === 'jpeg' ? bytes.charCodeAt(0) === 255 && bytes.charCodeAt(1) === 216 && bytes.charCodeAt(2) === 255
    : match[1] === 'png' ? bytes.startsWith('\x89PNG\r\n\x1a\n') : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
  if (!valid) throw new Error('사진 형식과 파일 내용이 맞지 않아요.');
  return value;
}
export function normalizeContentDraft(value = {}) {
  if (!plain(value)) throw new Error('내용 파일의 형식을 확인해 주세요.');
  if (value.version !== undefined && value.version !== CONTENT_VERSION) throw new Error('지원하지 않는 내용 파일 버전이에요.');
  if (value.text !== undefined && !plain(value.text)) throw new Error('문구 형식이 올바르지 않아요.');
  const text = {};
  for (const field of CONTENT_FIELDS) {
    const input = value.text?.[field.id];
    if (input === undefined || input === '') continue;
    if (typeof input !== 'string' || input.length > field.limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input)) throw new Error(`${field.label}은 ${field.limit}자 안으로 적어 주세요.`);
    if (input.trim()) text[field.id] = input.replace(/\r\n?/g, '\n');
  }
  if (value.photos !== undefined && !Array.isArray(value.photos)) throw new Error('사진 목록을 읽지 못했어요.');
  if ((value.photos?.length || 0) > CONTENT_MAX_PHOTOS) throw new Error(`사진은 ${CONTENT_MAX_PHOTOS}장까지 준비할 수 있어요.`);
  const photos = (value.photos || []).map(photo => {
    if (!plain(photo) || !safeId(photo.id) || !photo.id.startsWith('local_') || !Number.isInteger(photo.width) || !Number.isInteger(photo.height) || photo.width < 1 || photo.height < 1 || photo.width > 2048 || photo.height > 2048) throw new Error('사진 정보가 올바르지 않아요.');
    return { id: photo.id, src: validateRaster(photo.src), width: photo.width, height: photo.height };
  });
  if (new Set(photos.map(photo => photo.id)).size !== photos.length) throw new Error('중복된 사진이 있어요.');
  let albumOrder = null;
  if (value.albumOrder !== undefined && value.albumOrder !== null) {
    if (!Array.isArray(value.albumOrder) || value.albumOrder.length > CONTENT_MAX_PHOTOS || !value.albumOrder.every(safeId) || new Set(value.albumOrder).size !== value.albumOrder.length) throw new Error('사진 순서가 올바르지 않아요.');
    albumOrder = [...value.albumOrder];
  }
  const result = { version: CONTENT_VERSION, text, photos, albumOrder };
  if (JSON.stringify(result).length > CONTENT_MAX_BYTES) throw new Error('내용과 사진은 합계 10MB까지 보관할 수 있어요. 사진 수를 줄여 주세요.');
  return result;
}
export function draftDefaults(config = {}) {
  const family = config.family || {}, groom = family.groom || {}, bride = family.bride || {};
  return {
    groom: groom.name || '성우', bride: bride.name || '소희',
    groomFather: groom.parents?.[0] || '아빠', groomMother: groom.parents?.[1] || '엄마',
    brideFather: bride.parents?.[0] || '아빠', brideMother: bride.parents?.[1] || '엄마',
    invitation: '저희 두 사람, 결혼합니다.\n함께해 주실 소중한 분들을 초대해요.',
    closing: '소중한 날, 반가운 얼굴로 만나요.',
    ...Object.fromEntries((config.chapters || []).slice(0, 3).flatMap((chapter, i) => [[`story${i + 1}Title`, chapter.title || ''], [`story${i + 1}Body`, (chapter.lines || []).join('\n')], [`story${i + 1}Quote`, chapter.quote || ''], [`story${i + 1}Note`, chapter.note || '']])),
  };
}
export function resolveDraftPhotos(draft, basePhotos = []) {
  const normalized = normalizeContentDraft(draft);
  const all = new Map(basePhotos.map(photo => [photo.id, { ...photo }]));
  normalized.photos.forEach(photo => all.set(photo.id, { ...photo, thumb: photo.src, alt: '두 사람의 사진' }));
  return (normalized.albumOrder || [...all.keys()]).map(id => all.get(id)).filter(Boolean).slice(0, CONTENT_MAX_PHOTOS);
}
export function exportContentDraft(draft) { return { kind: 'sungso-studio-content', ...normalizeContentDraft(draft) }; }
export function parseContentDraft(text) {
  if (typeof text !== 'string' || text.length > CONTENT_FILE_BYTES) throw new Error('내용 파일은 10MB 이하여야 해요.');
  const data = JSON.parse(text);
  if (data?.kind !== 'sungso-studio-content') throw new Error('스튜디오 내용 파일을 선택해 주세요.');
  return normalizeContentDraft(data);
}

/** IndexedDB keeps media out of localStorage and URLs. Revision checks prevent silent cross-tab loss. */
export function createContentStore(indexedDB = globalThis.indexedDB) {
  let connection;
  function open() {
    if (!indexedDB) return Promise.reject(new Error('이 브라우저에는 내용을 보관할 수 없어요. 내용 파일로 내려받아 주세요.'));
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open('sungso-invitation-studio-content', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('drafts')) request.result.createObjectStore('drafts'); };
      request.onerror = () => { connection = null; reject(request.error); };
      request.onblocked = () => { blocked = true; connection = null; reject(new Error('다른 스튜디오 창을 닫고 다시 저장해 주세요.')); };
      request.onsuccess = () => { if (blocked) { request.result.close(); return; } request.result.onversionchange = () => { request.result.close(); connection = null; }; resolve(request.result); };
    });
    return connection;
  }
  return {
    async read() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const request = db.transaction('drafts', 'readonly').objectStore('drafts').get('current');
        request.onsuccess = () => { try { resolve(request.result ? { revision: Number(request.result.revision) || 0, draft: normalizeContentDraft(request.result.draft) } : { revision: 0, draft: normalizeContentDraft() }); } catch (error) { reject(error); } };
        request.onerror = () => reject(request.error);
      });
    },
    async write(draft, expectedRevision) {
      const normalized = normalizeContentDraft(draft), db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('drafts', 'readwrite'), store = transaction.objectStore('drafts'), read = store.get('current');
        let nextRevision, conflict;
        read.onsuccess = () => {
          const current = Number(read.result?.revision) || 0;
          if (current !== expectedRevision) { conflict = new Error('다른 창에서 내용을 바꿨어요. 현재 초안을 파일로 보관한 뒤 최신 내용을 불러와 주세요.'); conflict.code = 'conflict'; transaction.abort(); return; }
          nextRevision = current + 1; store.put({ revision: nextRevision, draft: normalized }, 'current');
        };
        transaction.oncomplete = () => resolve(nextRevision);
        transaction.onabort = transaction.onerror = () => reject(conflict || transaction.error || new Error('내용을 저장하지 못했어요. 파일로 보관해 주세요.'));
      });
    },
    async close() { if (connection) { const db = await connection.catch(() => null); db?.close(); connection = null; } },
  };
}

export async function prepareDraftPhoto(file, { win = globalThis, doc = globalThis.document } = {}) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 40 * 1024 * 1024 || file.size < 12) throw new Error('40MB 이하의 JPG·PNG·WebP 사진을 선택해 주세요.');
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const valid = file.type === 'image/jpeg' ? header[0] === 255 && header[1] === 216 && header[2] === 255
    : file.type === 'image/png' ? String.fromCharCode(...header.slice(0, 8)) === '\x89PNG\r\n\x1a\n' : String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP';
  if (!valid) throw new Error('사진 형식과 내용이 맞지 않아요. 다른 파일을 선택해 주세요.');
  let image, objectURL;
  try {
    if (typeof win.createImageBitmap === 'function') image = await win.createImageBitmap(file, { imageOrientation: 'from-image' });
    else {
      objectURL = win.URL.createObjectURL(file); image = new win.Image(); image.src = objectURL; await image.decode();
    }
    const width = image.width || image.naturalWidth, height = image.height || image.naturalHeight;
    if (!(width > 0 && height > 0) || width * height > 100_000_000) throw new Error('사진 크기가 너무 커요. 1억 화소 이하 사진을 선택해 주세요.');
    const scale = Math.min(1, 1440 / Math.max(width, height)), canvas = doc.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('사진을 준비하지 못했어요.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let src = canvas.toDataURL('image/jpeg', .82);
    if (src.length > CONTENT_PHOTO_BYTES) src = canvas.toDataURL('image/jpeg', .62);
    validateRaster(src);
    return { id: `local_${win.crypto.randomUUID()}`, src, width: canvas.width, height: canvas.height };
  } finally { image?.close?.(); if (objectURL) win.URL.revokeObjectURL(objectURL); }
}
