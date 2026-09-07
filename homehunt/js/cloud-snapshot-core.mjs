// Cloud snapshots contain personal inputs and saved house references only.
// Never copy a provider response, route, recommendation result, or financial DB
// document into this schema. Use this same boundary in the browser and server.
export const CLOUD_SNAPSHOT_VERSION = 1;
export const CLOUD_SNAPSHOT_MAX_BYTES = 700 * 1024;
export const CLOUD_SNAPSHOT_LIST_LIMIT = 1000;

export class CloudSnapshotError extends Error {
  constructor(message, code = 'INVALID_CLOUD_SNAPSHOT', status = 400) {
    super(message);
    this.name = 'CloudSnapshotError';
    this.code = code;
    this.status = status;
  }
}

const own = (value, key) => Object.hasOwn(value, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = message => { throw new CloudSnapshotError(message); };
const reservedIds = new Set(['__proto__', 'prototype', 'constructor']);
const SAFE_COORDINATE_SOURCES = new Set(['manual', 'user-provided', 'official']);

function record(value, label) {
  if (!plain(value)) fail(`${label} 형식이 올바르지 않습니다.`);
  return value;
}

function text(value, maximum, label, { required = false } = {}) {
  if (typeof value !== 'string') fail(`${label}은 문자열이어야 합니다.`);
  const result = value.replace(/\r\n?/g, '\n').trim();
  if (result.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)
    || required && !result) fail(`${label} 길이 또는 내용이 올바르지 않습니다.`);
  // Text is intentionally not interpreted as HTML or JSON. Render with
  // textContent / form.value; never with innerHTML or object spreading.
  return result;
}

function id(value, label) {
  const result = text(value, 128, label, { required: true });
  if (reservedIds.has(result)) fail(`${label} 값이 올바르지 않습니다.`);
  return result;
}

function numeric(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
    || integer && !Number.isSafeInteger(value)) fail(`${label} 숫자가 올바르지 않습니다.`);
  return value;
}

function fields(raw, result, specs) {
  for (const [key, spec] of Object.entries(specs)) {
    if (!own(raw, key) || raw[key] == null) continue;
    result[key] = spec(raw[key], key);
  }
  return result;
}

const string = maximum => (value, label) => text(value, maximum, label);
const number = options => (value, label) => numeric(value, label, options);
const boolean = (value, label) => typeof value === 'boolean' ? value : fail(`${label} 값은 참/거짓이어야 합니다.`);
const enumeration = values => (value, label) => values.includes(value) ? value : fail(`${label} 선택값이 올바르지 않습니다.`);
const time = (value, label) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) && typeof value === 'string'
  ? value : fail(`${label} 시각이 올바르지 않습니다.`);

function date(value, label) {
  const result = text(value, 32, label);
  if (!result) return result;
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(result)) fail(`${label} 날짜가 올바르지 않습니다.`);
  const parsed = new Date(result);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result.slice(0, 10)) fail(`${label} 날짜가 올바르지 않습니다.`);
  return result;
}

function list(value, mapper, label, maximum = CLOUD_SNAPSHOT_LIST_LIMIT) {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label}은 ${maximum}개 이하 목록이어야 합니다.`);
  return value.map((item, index) => mapper(item, `${label}[${index}]`));
}

function uniqueRecords(value, mapper, label) {
  const seen = new Set();
  return list(value, mapper, label).map(item => {
    if (seen.has(item.id)) fail(`${label}에 같은 식별자가 두 번 있습니다.`);
    seen.add(item.id);
    return item;
  });
}

function coordinateFields(raw, result) {
  const source = own(raw, 'coordinateSource') ? raw.coordinateSource : '';
  const providerSourced = ['provider', 'source', 'locationSource', 'geocodeProvider'].some(key =>
    own(raw, key) && typeof raw[key] === 'string' && /naver|kakao|tmap|네이버|카카오/i.test(raw[key]));
  if (SAFE_COORDINATE_SOURCES.has(source) && !providerSourced
    && typeof raw.lat === 'number' && Number.isFinite(raw.lat) && raw.lat >= -90 && raw.lat <= 90
    && typeof raw.lng === 'number' && Number.isFinite(raw.lng) && raw.lng >= -180 && raw.lng <= 180) {
    result.lat = raw.lat;
    result.lng = raw.lng;
    result.coordinateSource = source;
  } else {
    result.needsLocationResolution = true;
  }
  return result;
}

function workplace(input, label) {
  const raw = record(input, label);
  const result = { id: id(raw.id, `${label}.id`) };
  fields(raw, result, {
    label: string(200), name: string(200), address: string(500), query: string(200),
    daysPerWeek: number({ max: 7 }), weight: number(), weightPercent: number(),
    weightSource: enumeration(['explicit-percent', 'days-per-week', 'legacy-weight']),
    required: boolean, individualMaxMinutes: number({ min: 1, max: 360 }),
    maxMinutes: number({ min: 1, max: 360 }), departureTime: time,
    preferSubway: boolean, preferSubwaySource: enumeration(['default', 'explicit']),
    modes: (value, key) => [...new Set(list(value, enumeration(['transit', 'car', 'walk', 'bike']), key, 4))],
  });
  return coordinateFields(raw, result);
}

function recommendationFilters(input = {}) {
  const raw = record(input, '추천 조건');
  const result = fields(raw, {}, {
    queryText: string(2000),
    regions: (value, key) => [...new Set(list(value, enumeration(['seoul', 'gyeonggi']), key, 2))],
    minHouseholds: number({ integer: true }), householdsOperator: enumeration(['gt', 'gte']),
    targetPriceManWon: number({ integer: true }), manualTargetPriceManWon: number({ integer: true }),
    maxOverBudgetPct: number({ max: 1000 }), budgetSource: enumeration(['manual', 'wecost']),
    priceOperator: enumeration(['lt', 'lte']), minAreaM2: number(),
    areaOperator: enumeration(['gt', 'gte']), areaBasis: enumeration(['exclusive']),
    maxAgeYears: number({ integer: true }), stationWalkMin: number(), stationWalkMax: number(),
    preferSubway: boolean, excludeFar: boolean, minParkingRatio: number(), requireParking: boolean,
    commuteMaxMinutes: number({ min: 1, max: 360 }), commuteDepartureTime: time,
    commuteModes: (value, key) => [...new Set(list(value, enumeration(['transit', 'car', 'walk', 'bike']), key, 4))],
    months: enumeration([1, 3, 6]),
  });
  // `destinations` also contains the computed default anchor and derived
  // percentages. Save actual workplace inputs only, including unresolved ones.
  result.workplaces = uniqueRecords(own(raw, 'workplaces') ? raw.workplaces : [], workplace, '회사');
  return result;
}

function visit(input, label) {
  const raw = record(input, label);
  const result = fields(raw, { id: id(raw.id, `${label}.id`) }, {
    name: string(200), address: string(500), visitDate: date, updatedAt: date,
    dealType: enumeration(['매매', '전세', '월세']), askingPrice: number(), areaM2: number(),
    floor: number({ min: -20, max: 200, integer: true }), builtYear: number({ min: 1800, max: 2200, integer: true }),
    households: number({ integer: true }), walkMinutes: number({ max: 600 }),
    direction: string(120), status: string(60), pros: string(2000), cons: string(2000), memo: string(4000),
    tags: (value, key) => list(value, string(60), key, 12),
    visitedBy: (value, key) => [...new Set(list(value, enumeration(['성우', '소희']), key, 2))],
  });
  // walkMinutes here is the visit form's personally entered walking estimate;
  // attached API routes and all other provider fields are outside the schema.
  return coordinateFields(raw, result);
}

function favorite(input, label) {
  const raw = record(input, label);
  const result = fields(raw, { id: id(raw.id || raw.catalogId || raw.aptSeq, `${label}.id`) }, {
    catalogId: id, aptSeq: string(128), name: string(200), address: string(500),
    regionCode: string(20), regionName: string(120), dong: string(120),
    status: string(60), savedAt: date, memo: string(4000),
  });
  // A saved selection is a house reference, not a saved price/route verdict.
  // The UI re-fetches official facts and prices after loading it.
  return coordinateFields(raw, result);
}

function parking(input = {}) {
  const raw = record(input, '주차 확인값');
  const keys = Object.keys(raw);
  if (keys.length > CLOUD_SNAPSHOT_LIST_LIMIT) fail('주차 확인값은 1000개 이하여야 합니다.');
  const entries = [];
  for (const key of keys) {
    id(key, '주차 단지 식별자');
    const observation = record(raw[key], '주차 확인값');
    // Official/provider records are fetched again, never promoted to a
    // personal observation by stripping their source attribution.
    if (observation.sourceType !== 'field') continue;
    entries.push([key, fields(observation, { sourceType: 'field', sourceName: '사용자 확인' }, {
      spacesPerHousehold: number(), totalSpaces: number({ integer: true }),
      households: number({ min: 1, integer: true }), observedAt: date, note: string(2000),
    })]);
  }
  return Object.fromEntries(entries);
}

export function cloudSnapshotByteLength(value) {
  try {
    const json = JSON.stringify(value);
    if (typeof json !== 'string') fail('저장할 데이터가 없습니다.');
    return new TextEncoder().encode(json).byteLength;
  } catch (error) {
    if (error instanceof CloudSnapshotError) throw error;
    throw new CloudSnapshotError('저장 데이터는 JSON 형식이어야 합니다.');
  }
}

/** A fresh object with fixed fields only. This never mutates the live view. */
export function normalizeCloudSnapshot(input) {
  const raw = record(input, '클라우드 기록');
  if (cloudSnapshotByteLength(raw) > CLOUD_SNAPSHOT_MAX_BYTES) {
    throw new CloudSnapshotError('클라우드 기록은 700KiB 이하여야 합니다.', 'CLOUD_SNAPSHOT_TOO_LARGE', 413);
  }
  if (own(raw, 'schemaVersion') && raw.schemaVersion !== CLOUD_SNAPSHOT_VERSION) {
    throw new CloudSnapshotError('지원하지 않는 클라우드 기록 버전입니다.', 'UNSUPPORTED_CLOUD_SNAPSHOT', 400);
  }
  const visits = uniqueRecords(raw.visits ?? [], visit, '방문 기록');
  const visitIds = new Set(visits.map(item => item.id));
  const result = {
    schemaVersion: CLOUD_SNAPSHOT_VERSION,
    recommendationFilters: recommendationFilters(raw.recommendationFilters ?? {}),
    visits,
    shortlist: uniqueRecords(raw.shortlist ?? [], favorite, '관심 후보'),
    compareIds: [...new Set(list(raw.compareIds ?? [], id, '비교 후보', 3))].filter(key => visitIds.has(key)),
    supplyFavorites: [...new Set(list(raw.supplyFavorites ?? [], id, '분양 관심'))],
    parkingObservations: parking(raw.parkingObservations ?? {}),
  };
  if (cloudSnapshotByteLength(result) > CLOUD_SNAPSHOT_MAX_BYTES) {
    throw new CloudSnapshotError('클라우드 기록은 700KiB 이하여야 합니다.', 'CLOUD_SNAPSHOT_TOO_LARGE', 413);
  }
  return result;
}
