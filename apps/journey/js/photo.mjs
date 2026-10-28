import { parse } from './vendor/exifr-7.1.3.mjs';

const MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE = 20 * 1024 * 1024;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const kstDay = time => new Date(time + 9 * 3600000).toISOString().slice(0, 10);
function validDay(value) { const time = Date.parse(value + 'T00:00:00Z'); return DAY.test(value) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value; }

// WebP stores the TIFF payload in an EXIF chunk; exifr 7.1.3 reads TIFF directly.
export function photoExifBytes(bytes) {
  const ascii = (at, size) => String.fromCharCode(...bytes.subarray(at, at + size));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || view.getUint32(4, true) + 8 > bytes.length) throw Error('WebP 사진 데이터가 잘렸어요.');
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const length = view.getUint32(offset + 4, true), end = offset + 8 + length;
    if (end > bytes.length) throw Error('WebP 촬영 정보가 잘렸어요.');
    if (ascii(offset, 4) === 'EXIF') {
      const payload = bytes.subarray(offset + 8, end);
      return String.fromCharCode(...payload.subarray(0, 6)) === 'Exif\0\0' ? payload.subarray(6) : payload;
    }
    offset = end + (length % 2);
  }
  return null;
}

/** No filename, modification time, IP, or guessed location is used as capture evidence. */
export function normalizePhotoMetadata(raw = {}) {
  const warnings = [], result = { date: '', time: null, position: null, timePrecision: 'day', warnings };
  const lat = raw.latitude, lng = raw.longitude;
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    result.position = { lat, lng };
  } else if (raw.GPSLatitude !== undefined || raw.GPSLongitude !== undefined || lat !== undefined || lng !== undefined) {
    warnings.push('촬영 위치가 올바르지 않아 장소를 직접 확인해 주세요.');
  }
  const source = raw.DateTimeOriginal || raw.CreateDate;
  const offset = raw.OffsetTimeOriginal || raw.OffsetTimeDigitized;
  if (typeof source === 'string') {
    const clean = source.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T');
    const day = clean.slice(0, 10);
    if (DAY.test(day) && validDay(day)) {
      result.date = day;
      result.originalLocalTime = source;
      const explicit = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(clean);
      const validOffset = typeof offset === 'string' && /^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset);
      const time = explicit || validOffset ? Date.parse(clean + (explicit ? '' : offset)) : NaN;
      if (Number.isFinite(time)) {
        result.time = time; result.date = kstDay(time); result.timePrecision = 'exact';
        if (validOffset) result.offset = offset;
      } else {
        warnings.push('촬영 시간대가 없어 날짜만 채웠어요. 방문 시각은 직접 확인해 주세요.');
      }
    }
  }
  if (result.time === null && raw.GPSDateStamp && raw.GPSTimeStamp) {
    const day = String(raw.GPSDateStamp).replaceAll(':', '-');
    const stamp = Array.isArray(raw.GPSTimeStamp) ? raw.GPSTimeStamp.map(n => String(Math.floor(n)).padStart(2, '0')).join(':') : String(raw.GPSTimeStamp);
    const time = DAY.test(day) && validDay(day) && /^\d{2}:\d{2}:\d{2}$/.test(stamp) ? Date.parse(`${day}T${stamp}Z`) : NaN;
    if (Number.isFinite(time)) {
      result.time = time; result.date = kstDay(time); result.timePrecision = 'exact';
      const index = warnings.findIndex(value => value.startsWith('촬영 시간대'));
      if (index >= 0) warnings.splice(index, 1);
    }
  }
  if (!result.date) warnings.push('사진에 촬영 날짜가 없어 날짜를 직접 입력해 주세요.');
  if (!result.position) warnings.push('사진에 사용할 수 있는 위치가 없어 장소를 직접 지정해 주세요.');
  return result;
}

export async function readJourneyPhotoMetadata(file) {
  try {
    const bytes = photoExifBytes(new Uint8Array(await file.arrayBuffer()));
    const raw = bytes === null ? {} : await parse(bytes, { reviveValues: false }) || {};
    return normalizePhotoMetadata(raw);
  } catch {
    const result = normalizePhotoMetadata();
    result.warnings.unshift('촬영 정보를 읽지 못했어요. 사진은 추가하고 날짜·장소는 직접 입력할 수 있어요.');
    return result;
  }
}

export async function prepareJourneyPhoto(file) {
  if (!MIME.has(file?.type) || !Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE) {
    throw Error('20MB 이하의 JPG·PNG·WebP 사진을 선택해 주세요.');
  }
  const metadata = await readJourneyPhotoMetadata(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    try { await image.decode(); } catch { throw Error('사진을 열지 못했어요. JPG·PNG·WebP 파일인지 확인해 주세요.'); }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60000000) {
      throw Error('사진 크기를 조금 줄여 주세요. 최대 6천만 화소까지 읽을 수 있어요.');
    }
    function encode(maxEdge, limit) {
      const canvas = document.createElement('canvas');
      let scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
      for (let pass = 0; pass < 9; pass++) {
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw Error('이 브라우저에서 사진을 준비하지 못했어요.');
        context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [.86, .76, .66, .56]) {
          const data = canvas.toDataURL('image/jpeg', quality);
          if (data.startsWith('data:image/jpeg;base64,') && data.length <= limit) return { data, width: canvas.width, height: canvas.height };
        }
        scale *= .8;
      }
      throw Error('사진을 저장할 크기로 줄이지 못했어요. 더 작은 사진을 선택해 주세요.');
    }
    const full = encode(1600, 360000), thumb = encode(480, 60000);
    return { id: crypto.randomUUID(), full: full.data, thumb: thumb.data, width: full.width, height: full.height, ...metadata };
  } finally { URL.revokeObjectURL(url); }
}
