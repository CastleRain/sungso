export const OFFICIAL_PARKING_SOURCE = Object.freeze({
  name: '국토교통부 공동주택 기본·상세 정보',
  url: 'https://www.data.go.kr/data/15058453/openapi.do',
  // K-apt V4 reports above/below-ground capacity separately; joining its basic
  // household count requires the same K-apt complex code. Catalog IDs in this
  // app are REB identifiers and must never be assumed to be K-apt codes.
  requiredMatch: 'same-kapt-complex-code',
});

function nonNegative(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && (!value.trim() || !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value.trim()))) return null;
  const number = Number(typeof value === 'string' ? value.replaceAll(',', '').trim() : value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function count(value, { positive = false } = {}) {
  const number = nonNegative(value);
  return Number.isSafeInteger(number) && (!positive || number > 0) ? number : null;
}

function dateLabel(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const day = value.slice(0, 10);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) return null;
  return value;
}

function sourceLink(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    // A public evidence link never needs a service key or a signed query.
    url.search = '';
    url.hash = '';
    return url.href;
  } catch (_) { return null; }
}

/** Normalize explicitly sourced facts only. Missing parking is never zero.
 * `field` is a personal observation, including a directly entered ratio.
 * `official` requires a source link and a caller-confirmed complex match; this
 * function does not fetch data, match apartment names, or certify a provider.
 * The ratio is unrounded so display rounding cannot change a filter boundary.
 */
export function normalizeParkingEvidence(input = {}, { households: fallbackHouseholds } = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const sourceType = ['field', 'official'].includes(raw.sourceType) ? raw.sourceType : 'unknown';
  const totalSpaces = count(raw.totalSpaces);
  const households = count(Object.hasOwn(raw, 'households') ? raw.households : fallbackHouseholds, { positive: true });
  const directRatio = nonNegative(raw.spacesPerHousehold);
  const calculatedRatio = totalSpaces !== null && households !== null ? totalSpaces / households : null;
  const sourceUrl = sourceLink(raw.sourceUrl);
  const observedAt = dateLabel(raw.observedAt);
  const limitations = [];
  let spacesPerHousehold = directRatio ?? calculatedRatio;
  if (sourceType === 'unknown') {
    spacesPerHousehold = null;
    limitations.push('주차 근거가 아직 없습니다.');
  }
  if (sourceType === 'official' && (!sourceUrl || raw.complexMatchConfirmed !== true)) {
    spacesPerHousehold = null;
    limitations.push('공식 자료의 출처와 동일 단지 연결을 확인해야 합니다.');
  }
  if (spacesPerHousehold === null && sourceType !== 'unknown') limitations.push('세대당 주차대수 미확인');
  if (!observedAt) limitations.push('확인일 미기록');
  if (directRatio !== null && calculatedRatio !== null && Math.abs(directRatio - calculatedRatio) > .02) {
    limitations.push('입력 비율과 총 주차대수·세대수 계산값이 다릅니다.');
  }
  limitations.push('등록 가능한 차량 수·주차 요금·야간 혼잡도는 별도 확인');
  return {
    sourceType,
    status: spacesPerHousehold === null ? 'unknown' : directRatio !== null ? 'provided' : 'calculated',
    spacesPerHousehold, totalSpaces, households,
    ratioBasis: spacesPerHousehold === null ? null : directRatio !== null ? 'provided' : 'total-divided-by-households',
    observedAt,
    sourceName: String(raw.sourceName || (sourceType === 'field' ? '현장 확인' : sourceType === 'official' ? '공식 자료' : '주차 정보 미확인')),
    sourceUrl, note: String(raw.note || ''),
    complexMatchConfirmed: sourceType === 'official' && raw.complexMatchConfirmed === true,
    limitations,
  };
}

/** Canonical adapter for joined K-apt rows. Raw field mapping belongs to the
 * provider adapter; both components and its basic-household row must explicitly
 * identify the same complex before their numbers can be combined.
 */
export function normalizeOfficialParkingEvidence(input = {}, { expectedComplexId } = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const complexId = String(raw.complexId || '').trim();
  const matched = Boolean(complexId && expectedComplexId && complexId === String(expectedComplexId)
    && complexId === String(raw.householdComplexId || '') && raw.active !== false);
  const above = count(raw.aboveGroundSpaces);
  const below = count(raw.belowGroundSpaces);
  const totalSpaces = above !== null && below !== null ? above + below : null;
  return normalizeParkingEvidence({
    sourceType: 'official', totalSpaces, households: raw.households,
    observedAt: raw.observedAt, sourceName: raw.sourceName || OFFICIAL_PARKING_SOURCE.name,
    sourceUrl: raw.sourceUrl || OFFICIAL_PARKING_SOURCE.url,
    complexMatchConfirmed: matched, note: raw.note,
  });
}
