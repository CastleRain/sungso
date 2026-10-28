import { createHash } from 'node:crypto';
import { emptyDay, validateDay, summarizeDay, mergeDayImport } from '../../shared/journey/core.mjs';
import { buildDayCandidates } from '../../shared/journey/playback-core.mjs';
import { jpegBytes } from '../invitation/server/album.mjs';

export const JOURNEY_ROOT = 'journey_private/shared';
export const PHOTO_LIMIT = 400;
export const PHOTO_BYTES_LIMIT = 160 * 1024 * 1024;
export const DAY_BYTES_LIMIT = 160 * 1024 * 1024;
export const DAY_LIMIT = 10000;
export const PLAYBACK_PAGE_DAYS = 31;
export const PLAYBACK_PAGE_BYTES = 2 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hash = value => createHash('sha256').update(value).digest('hex');
export class JourneyError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function fail(code, message, status) { throw new JourneyError(code, message, status); }
export function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) fail('INVALID_DATE', '기록 날짜를 확인해 주세요.');
  return date;
}
function validMonth(month) {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) fail('INVALID_MONTH', '조회할 월을 확인해 주세요.');
  validDate(month + '-01'); return month;
}
const only = (body, keys) => body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).every(k => keys.includes(k));
function normalizeDay(input) {
  try { return validateDay(input); }
  catch (error) { fail('INVALID_DAY', error.message || '기록 내용을 확인해 주세요.'); }
}
function inventory(raw) {
  if (raw === undefined) return { schema: 1, photos: [], bytes: 0, months: [], latestDate: null, dayCount: 0, dayBytes: 0 };
  if (raw?.schema !== 1 || !Array.isArray(raw.photos) || raw.photos.length > PHOTO_LIMIT || !Number.isSafeInteger(raw.bytes) || raw.bytes < 0
    || !Array.isArray(raw.months) || !Number.isSafeInteger(raw.dayBytes) || raw.dayBytes < 0 || !Number.isSafeInteger(raw.dayCount) || raw.dayCount < 0) throw Error('INVALID_JOURNEY_INVENTORY');
  return structuredClone(raw);
}
function dayState(raw, date) {
  if (!raw) return emptyDay(date);
  if (raw.schema !== 1 || typeof raw.data !== 'string') throw Error('INVALID_DAY_STATE');
  const day = validateDay(JSON.parse(raw.data));
  if (day.date !== date) throw Error('INVALID_DAY_STATE');
  return day;
}
function publicPhoto(value) { return { id: value.id, width: value.width, height: value.height }; }
function assertPhotoReferences(day, assets) {
  const saved = new Set(assets.photos.map(photo => photo.id));
  if (day.records.some(record => record.photoId && !saved.has(record.photoId))) fail('PHOTO_MISSING', '사진 저장이 끝나지 않았어요. 사진을 다시 추가한 뒤 저장해 주세요.', 409);
}

export function createJourneyStore({ db, now = Date.now }) {
  const rootRef = db.doc(JOURNEY_ROOT);
  const dayRef = date => db.doc(`${JOURNEY_ROOT}/days/${validDate(date)}`);
  const monthRef = month => db.doc(`${JOURNEY_ROOT}/months/${validMonth(month)}`);
  async function update(date, uid, apply) {
    const ref = dayRef(date), mref = monthRef(date.slice(0, 7));
    return db.runTransaction(async tx => {
      const [snapshot, months, assets] = await Promise.all([tx.get(ref), tx.get(mref), tx.get(rootRef)]);
      const before = dayState(snapshot.exists ? snapshot.data() : null, date);
      const result = apply(before);
      if (!result.changed) return { ...result, day: before, unchanged: true };
      const day = normalizeDay({ ...result.day, date, revision: before.revision + 1 });
      const ledger = inventory(assets.exists ? assets.data() : undefined);
      assertPhotoReferences(day, ledger);
      ledger.dayBytes += Buffer.byteLength(JSON.stringify(day)) - (snapshot.exists ? Buffer.byteLength(JSON.stringify(before)) : 0);
      ledger.dayCount += snapshot.exists ? 0 : 1;
      if (ledger.dayBytes > DAY_BYTES_LIMIT || ledger.dayCount > DAY_LIMIT) fail('JOURNEY_LIMIT', '기록 보관 한도에 도달했어요. 기존 기록은 그대로 보관됩니다.', 409);
      ledger.months = [...new Set([...ledger.months, date.slice(0, 7)])].sort().reverse();
      ledger.latestDate = !ledger.latestDate || date > ledger.latestDate ? date : ledger.latestDate;
      const updatedAt = now();
      const index = months.exists ? months.data() : { schema: 1, days: {} };
      if (index.schema !== 1 || !index.days || typeof index.days !== 'object') throw Error('INVALID_MONTH_INDEX');
      const summary = { ...summarizeDay(day), updatedAt };
      // A JSON string avoids automatic indexes for every track point. The public
      // contract remains structured; calendar lookup uses the small month index.
      tx.set(ref, { schema: 1, data: JSON.stringify(day), updatedAt, updatedBy: uid });
      tx.set(mref, { schema: 1, days: { ...index.days, [date]: summary }, updatedAt });
      tx.set(rootRef, { ...ledger, updatedAt });
      return { ...result, day, unchanged: false };
    });
  }
  return {
    async month(month) {
      if (month === undefined || month === null) {
        const snapshot = await rootRef.get(), ledger = inventory(snapshot.exists ? snapshot.data() : undefined);
        return { months: ledger.months, latestDate: ledger.latestDate };
      }
      const snapshot = await monthRef(month).get();
      if (!snapshot.exists) return { month, days: [] };
      const data = snapshot.data();
      if (data.schema !== 1 || !data.days || typeof data.days !== 'object') throw Error('INVALID_MONTH_INDEX');
      return { month, days: Object.values(data.days).sort((a, b) => a.date.localeCompare(b.date)) };
    },
    async day(date) {
      const snapshot = await dayRef(date).get();
      return dayState(snapshot.exists ? snapshot.data() : null, date);
    },
    async playback({ from, to, after = null } = {}) {
      validDate(from); validDate(to);
      if (from > to) fail('INVALID_RANGE', '시작 날짜가 마지막 날짜보다 늦어요. 기간을 확인해주세요.');
      if (after !== null) {
        validDate(after);
        if (after < from || after > to) fail('INVALID_CURSOR', '불러오던 기간이 달라졌어요. 기간을 다시 선택해주세요.');
        if (after === to) return { days: [], nextCursor: null };
      }
      // Document IDs are KST dates. The built-in document-name index needs no
      // new composite index and skips absent days without reading calendar gaps.
      let query = db.collection(`${JOURNEY_ROOT}/days`).orderBy('__name__').endAt(to).limit(PLAYBACK_PAGE_DAYS + 1);
      query = after === null ? query.startAt(from) : query.startAfter(after);
      const snapshots = await query.get(), days = [];
      let bytes = Buffer.byteLength('{"ok":true,"days":[],"nextCursor":"0000-00-00"}'), more = false;
      for (const snapshot of snapshots.docs) {
        if (days.length === PLAYBACK_PAGE_DAYS) { more = true; break; }
        const summary = buildDayCandidates(dayState(snapshot.data(), snapshot.id));
        const size = Buffer.byteLength(JSON.stringify(summary)) + (days.length ? 1 : 0);
        if (bytes + size > PLAYBACK_PAGE_BYTES) {
          if (!days.length) fail('PLAYBACK_DAY_TOO_LARGE', '이날의 기록은 날짜 찾기에서 자세히 볼 수 있어요.', 413);
          more = true; break;
        }
        days.push(summary); bytes += size;
      }
      return { days, nextCursor: more ? days.at(-1).date : null };
    },
    async save(date, input, uid) {
      if (!only(input, ['expectedRevision', 'day']) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.day?.date !== date) fail('INVALID_DAY', '최신 날짜 기록을 불러온 뒤 저장해 주세요.');
      const draft = normalizeDay(input.day);
      return update(date, uid, before => {
        // A retried acknowledged payload is harmless even after its revision advanced.
        const changed = JSON.stringify({ ...draft, revision: 0 }) !== JSON.stringify({ ...before, revision: 0 });
        if (!changed) return { day: before, changed: false };
        if (before.revision !== input.expectedRevision) fail('JOURNEY_CONFLICT', '다른 기기에서 이 날짜를 수정했어요. 입력은 유지되니 최신 기록을 확인해 주세요.', 409);
        // Import provenance remains immutable through the ordinary form.
        if (JSON.stringify(draft.imports) !== JSON.stringify(before.imports)) fail('INVALID_IMPORTS', '가져온 원본 정보는 직접 변경할 수 없어요.');
        if (JSON.stringify(draft.tracks) !== JSON.stringify(before.tracks)) fail('INVALID_TRACKS', '가져온 이동 경로는 기록 편집에서 변경할 수 없어요.');
        const nextRecords = new Map(draft.records.map(record => [record.id, record]));
        const priorIds = new Set(before.records.map(record => record.id));
        for (const record of before.records) {
          const next = nextRecords.get(record.id);
          if (!next) fail('DELETE_UNSUPPORTED', '기록 삭제는 아직 지원하지 않아요. 최신 기록을 다시 불러와 주세요.');
          if (next.kind !== record.kind || next.sourceId !== record.sourceId) fail('INVALID_PROVENANCE', '기록의 원본 구분은 변경할 수 없어요.');
        }
        if (draft.records.some(record => !priorIds.has(record.id) && (record.kind === 'visit' || record.sourceId))) fail('INVALID_PROVENANCE', '타임라인 기록은 파일 추가에서 가져와 주세요.');
        return { day: draft, changed };
      });
    },
    async import(date, input, uid) {
      validDate(date);
      if (!only(input, ['source', 'records', 'tracks'])) fail('INVALID_IMPORT', '타임라인 자료를 다시 선택해 주세요.');
      // Validate before entering a transaction. The merge validates the combined day again.
      normalizeDay({ ...emptyDay(date), records: input.records, tracks: input.tracks, imports: [input.source] });
      return update(date, uid, before => {
        try { return mergeDayImport(before, input); }
        catch (error) { fail('INVALID_IMPORT', error.message || '타임라인 자료를 확인해 주세요.'); }
      });
    },
    async upload(input, uid) {
      if (!only(input, ['id', 'full', 'thumb']) || !uuid.test(input.id || '')) fail('INVALID_PHOTO', '사진 정보를 확인해 주세요.');
      let full, thumb;
      try { full = jpegBytes(input.full, 360000); thumb = jpegBytes(input.thumb, 60000); }
      catch { fail('INVALID_PHOTO', '웹용 JPG 사진을 다시 선택해 주세요.'); }
      if (Math.max(thumb.width, thumb.height) > 480 || Math.abs(full.width / full.height - thumb.width / thumb.height) > .02) fail('INVALID_PHOTO', '미리보기 사진 크기를 확인해 주세요.');
      const fullData = full.bytes.toString('base64'), thumbData = thumb.bytes.toString('base64');
      const bytes = Buffer.byteLength(fullData) + Buffer.byteLength(thumbData);
      const fingerprint = hash(Buffer.concat([full.bytes, thumb.bytes]));
      const ref = db.doc(`${JOURNEY_ROOT}/photos/${input.id}`);
      return db.runTransaction(async tx => {
        const snap = await tx.get(rootRef), next = inventory(snap.exists ? snap.data() : undefined);
        const prior = next.photos.find(photo => photo.id === input.id);
        if (prior) {
          if (prior.hash !== fingerprint) fail('PHOTO_CONFLICT', '다른 사진과 번호가 겹쳤어요. 다시 선택해 주세요.', 409);
          return { photo: publicPhoto(prior), unchanged: true };
        }
        if (next.photos.length >= PHOTO_LIMIT || next.bytes + bytes > PHOTO_BYTES_LIMIT) fail('PHOTO_LIMIT', '사진 보관 한도에 도달했어요. 기존 사진은 그대로 보관됩니다.', 409);
        const metadata = { id: input.id, width: full.width, height: full.height, bytes, hash: fingerprint };
        next.photos.push(metadata); next.bytes += bytes; next.updatedAt = now();
        tx.set(ref, { schema: 1, full: fullData, thumb: thumbData, width: full.width, height: full.height, createdAt: now(), createdBy: uid });
        tx.set(rootRef, next);
        return { photo: publicPhoto(metadata), unchanged: false };
      });
    },
    async photo(id, size = 'thumb') {
      if (!uuid.test(id || '') || !['full', 'thumb'].includes(size)) fail('PHOTO_MISSING', '사진을 찾지 못했어요.', 404);
      const snapshot = await db.doc(`${JOURNEY_ROOT}/photos/${id}`).get();
      if (!snapshot.exists) fail('PHOTO_MISSING', '사진을 찾지 못했어요.', 404);
      return Buffer.from(snapshot.data()[size], 'base64');
    },
  };
}
