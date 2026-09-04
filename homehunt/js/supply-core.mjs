const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

const NEWLYWED_COUNT_FIELDS = [
  'NWWDS_HSHLDCO', 'nwwdsHshldco', 'newlywedUnits', 'newlywedHouseholds',
];
const FIRST_HOME_COUNT_FIELDS = [
  'LFE_FRST_HSHLDCO', 'lfeFrstHshldco', 'firstHomeUnits',
];
const MULTI_CHILD_COUNT_FIELDS = [
  'MNYCH_HSHLDCO', 'mnychHshldco', 'multiChildUnits',
];
const ELDERLY_PARENT_COUNT_FIELDS = [
  'OLD_PARNTS_SUPORT_HSHLDCO', 'oldParntsSuportHshldco', 'elderlyParentUnits',
];
const INSTITUTION_COUNT_FIELDS = [
  'INSTT_RECOMEND_HSHLDCO', 'insttRecomendHshldco', 'institutionUnits',
];
const SPECIAL_TOTAL_FIELDS = [
  'SPSPLY_HSHLDCO', 'spsplyHshldco', 'specialSupplyUnits',
];
const GENERAL_TOTAL_FIELDS = [
  'SUPLY_HSHLDCO', 'suplyHshldco', 'generalSupplyUnits',
];

function text(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function firstValue(object, names, fallback = '') {
  if (!object || typeof object !== 'object') return fallback;
  for (const name of names) {
    if (object[name] !== undefined && object[name] !== null && text(object[name]) !== '') return object[name];
  }
  return fallback;
}

function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = text(value).replace(/,/g, '').replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeInteger(value) {
  const parsed = finiteNumber(value);
  return parsed === null || parsed < 0 ? null : Math.trunc(parsed);
}

function positiveNumber(value) {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function hasAnyField(object, fields) {
  return Boolean(object && fields.some((field) => Object.prototype.hasOwnProperty.call(object, field)
    && object[field] !== undefined
    && object[field] !== null
    && text(object[field]) !== ''));
}

function sumExplicitField(rows, fields) {
  const relevant = rows.filter((row) => hasAnyField(row, fields));
  if (!relevant.length) return null;
  return relevant.reduce((sum, row) => sum + (nonNegativeInteger(firstValue(row, fields, 0)) || 0), 0);
}

export function normalizeSupplyDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const normalized = text(value);
  if (!normalized) return '';
  const compact = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  const separated = normalized.match(/^(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})(?:일)?$/);
  const match = compact || separated;
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function kstDateKey(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('now must be a valid date');
  return new Date(date.getTime() + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
}

function addSchedule(schedules, kind, label, startValue, endValue = startValue, extras = {}) {
  const startDate = normalizeSupplyDate(startValue);
  const endDate = normalizeSupplyDate(endValue) || startDate;
  if (!startDate && !endDate) return;
  schedules.push({
    kind,
    label,
    startDate: startDate || endDate,
    endDate: endDate || startDate,
    ...extras,
  });
}

function applicationSchedules(detail, specialEvidence) {
  const schedules = [];
  const specialStart = firstValue(detail, ['SPSPLY_RCEPT_BGNDE', 'spsplyRceptBgnde']);
  const specialEnd = firstValue(detail, ['SPSPLY_RCEPT_ENDDE', 'spsplyRceptEndde'], specialStart);
  addSchedule(schedules, 'application', '특별공급', specialStart, specialEnd, {
    audience: 'special-supply',
    requiresCheck: specialEvidence.newlywedSupplyAvailable !== true,
  });

  const generalStart = firstValue(detail, ['SUBSCRPT_RCEPT_BGNDE', 'subscrptRceptBgnde']);
  const generalEnd = firstValue(detail, ['SUBSCRPT_RCEPT_ENDDE', 'subscrptRceptEndde'], generalStart);
  addSchedule(schedules, 'application', '일반공급', generalStart, generalEnd, { audience: 'general' });

  addSchedule(schedules, 'application', '1순위 · 해당지역', firstValue(detail, ['GNRL_RNK1_CRSPAREA_RCPTDE', 'gnrlRnk1CrspareaRcptde']), undefined, { audience: 'general-rank-1-local' });
  addSchedule(schedules, 'application', '1순위 · 기타지역', firstValue(detail, ['GNRL_RNK1_ETC_AREA_RCPTDE', 'gnrlRnk1EtcAreaRcptde']), undefined, { audience: 'general-rank-1-other' });
  addSchedule(schedules, 'application', '2순위 · 해당지역', firstValue(detail, ['GNRL_RNK2_CRSPAREA_RCPTDE', 'gnrlRnk2CrspareaRcptde']), undefined, { audience: 'general-rank-2-local' });
  addSchedule(schedules, 'application', '2순위 · 기타지역', firstValue(detail, ['GNRL_RNK2_ETC_AREA_RCPTDE', 'gnrlRnk2EtcAreaRcptde']), undefined, { audience: 'general-rank-2-other' });
  addSchedule(schedules, 'announcement', '당첨자 발표', firstValue(detail, ['PRZWNER_PRESNATN_DE', 'przwnerPresnatnDe']));
  addSchedule(
    schedules,
    'contract',
    '계약',
    firstValue(detail, ['CNTRCT_CNCLS_BGNDE', 'cntrctCnclsBgnde']),
    firstValue(detail, ['CNTRCT_CNCLS_ENDDE', 'cntrctCnclsEndde']),
  );

  const seen = new Set();
  return schedules.filter((schedule) => {
    const key = `${schedule.kind}|${schedule.label}|${schedule.startDate}|${schedule.endDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function regionFromAddress(address, areaName = '') {
  // The actual supply address is more specific than the subscription-area
  // label. Only fall back to the latter when the address has no province.
  const normalizedAddress = text(address);
  const addressHasSeoul = /(^|\s)서울(?:특별시|시)?(?:\s|$)/.test(normalizedAddress);
  const addressHasGyeonggi = /(^|\s)경기(?:도)?(?:\s|$)/.test(normalizedAddress);
  const source = addressHasSeoul || addressHasGyeonggi ? normalizedAddress : `${normalizedAddress} ${text(areaName)}`;
  let regionKey = 'other';
  let sidoCode = '';
  let sido = '';
  if (/(^|\s)서울(?:특별시)?(?:\s|$)/.test(source)) {
    regionKey = 'seoul';
    sidoCode = '11';
    sido = '서울특별시';
  } else if (/(^|\s)경기(?:도)?(?:\s|$)/.test(source)) {
    regionKey = 'gyeonggi';
    sidoCode = '41';
    sido = '경기도';
  }
  const provinceRemoved = normalizedAddress
    .replace(/^(서울특별시|서울시|서울|경기도|경기)\s*/, '')
    .trim();
  const tokens = provinceRemoved.split(/\s+/).filter(Boolean);
  let district = '';
  if (tokens[0] && /(?:시|군|구)$/.test(tokens[0])) {
    district = tokens[0];
    if (/시$/.test(tokens[0]) && tokens[1] && /구$/.test(tokens[1])) district += ` ${tokens[1]}`;
  }
  return {
    regionKey,
    sidoCode,
    sido,
    district,
    address: normalizedAddress,
    lat: null,
    lng: null,
    coordinateAccuracy: 'none',
  };
}

function classifyProgram(detail) {
  // Deliberately excludes HOUSE_NM/title: marketing copy must not create an
  // eligibility classification. Only provider-owned category fields count.
  const officialCategory = [
    firstValue(detail, ['HOUSE_SECD_NM', 'houseSecdNm']),
    firstValue(detail, ['HOUSE_DTL_SECD_NM', 'houseDtlSecdNm']),
    firstValue(detail, ['RENT_SECD_NM', 'rentSecdNm']),
    firstValue(detail, ['PBLANC_KND_NM', 'pblancKndNm']),
  ].map(text).filter(Boolean).join(' ');
  if (/신혼희망타운/.test(officialCategory)) return 'newlywed-town';
  if (/공공분양|국민주택/.test(officialCategory)) return 'public-sale';
  if (/민영주택|민간분양/.test(officialCategory)) return 'private-sale';
  if (/공공임대|행복주택/.test(officialCategory)) return 'public-rent';
  if (/민간임대/.test(officialCategory)) return 'private-rent';
  return 'other';
}

function tenureForProgram(program) {
  if (program.endsWith('-rent')) return 'rent';
  if (program.endsWith('-sale') || program === 'newlywed-town') return 'sale';
  return 'unknown';
}

function normalizeHome(model, specialRows) {
  const modelNo = text(firstValue(model, ['MODEL_NO', 'modelNo']));
  const houseType = text(firstValue(model, ['HOUSE_TY', 'houseTy']));
  const matchingSpecial = specialRows.filter((row) => {
    const rowModelNo = text(firstValue(row, ['MODEL_NO', 'modelNo']));
    const rowHouseType = text(firstValue(row, ['HOUSE_TY', 'houseTy']));
    return (modelNo && rowModelNo === modelNo) || (!modelNo && houseType && rowHouseType === houseType);
  });
  const countRows = matchingSpecial.length ? matchingSpecial : [model];
  const price = positiveNumber(firstValue(model, ['LTTOT_TOP_AMOUNT', 'lttotTopAmount', 'maxPriceManWon']));
  return {
    modelNo,
    houseType,
    areaM2: positiveNumber(firstValue(model, ['SUPLY_AR', 'suplyAr', 'areaM2'])),
    generalUnits: nonNegativeInteger(firstValue(model, GENERAL_TOTAL_FIELDS)),
    specialUnits: nonNegativeInteger(firstValue(model, SPECIAL_TOTAL_FIELDS)),
    maxPriceManWon: price,
    specialSupply: {
      newlywedUnits: sumExplicitField(countRows, NEWLYWED_COUNT_FIELDS),
      firstHomeUnits: sumExplicitField(countRows, FIRST_HOME_COUNT_FIELDS),
      multiChildUnits: sumExplicitField(countRows, MULTI_CHILD_COUNT_FIELDS),
      elderlyParentUnits: sumExplicitField(countRows, ELDERLY_PARENT_COUNT_FIELDS),
      institutionUnits: sumExplicitField(countRows, INSTITUTION_COUNT_FIELDS),
    },
  };
}

function uniqueStrings(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function normalizeJoinedInput(detailOrJoined, models, options) {
  if (detailOrJoined && typeof detailOrJoined === 'object' && detailOrJoined.detail) {
    return {
      detail: detailOrJoined.detail,
      models: Array.isArray(detailOrJoined.models) ? detailOrJoined.models : [],
      specialSupply: Array.isArray(detailOrJoined.specialSupply)
        ? detailOrJoined.specialSupply
        : Array.isArray(detailOrJoined.specialRows) ? detailOrJoined.specialRows : [],
      options: models && !Array.isArray(models) ? models : options,
    };
  }
  return {
    detail: detailOrJoined || {},
    models: Array.isArray(models) ? models : [],
    specialSupply: Array.isArray(options?.specialSupply) ? options.specialSupply : [],
    options: options || {},
  };
}

export function normalizeApplyHomeNotice(detailOrJoined = {}, models = [], options = {}) {
  const joined = normalizeJoinedInput(detailOrJoined, models, options);
  const detail = joined.detail || {};
  const modelRows = joined.models;
  const specialRows = joined.specialSupply;
  const countRows = specialRows.length ? specialRows : modelRows;
  const houseManageNo = text(firstValue(detail, ['HOUSE_MANAGE_NO', 'houseManageNo']));
  const announcementNo = text(firstValue(detail, ['PBLANC_NO', 'pblancNo']));
  if (!houseManageNo && !announcementNo) throw new TypeError('ApplyHome notice requires HOUSE_MANAGE_NO or PBLANC_NO');
  const idSuffix = [houseManageNo, announcementNo].filter(Boolean).join(':');
  const title = text(firstValue(detail, ['HOUSE_NM', 'houseNm', 'title']));
  const address = text(firstValue(detail, ['HSSPLY_ADRES', 'hssplyAdres', 'address']));
  const areaName = text(firstValue(detail, ['SUBSCRPT_AREA_CODE_NM', 'subscrptAreaCodeNm']));
  const program = classifyProgram(detail);
  const homes = modelRows.map((model) => normalizeHome(model, specialRows));
  const newlywedFieldPresent = countRows.some((row) => hasAnyField(row, NEWLYWED_COUNT_FIELDS));
  const newlywedUnits = sumExplicitField(countRows, NEWLYWED_COUNT_FIELDS);
  const officialProgramTargetsNewlyweds = program === 'newlywed-town';
  const newlywedSupplyAvailable = newlywedFieldPresent ? newlywedUnits > 0 : officialProgramTargetsNewlyweds ? true : null;
  const hasSpecialDates = Boolean(normalizeSupplyDate(firstValue(detail, ['SPSPLY_RCEPT_BGNDE', 'spsplyRceptBgnde']))
    || normalizeSupplyDate(firstValue(detail, ['SPSPLY_RCEPT_ENDDE', 'spsplyRceptEndde'])));
  const specialEvidence = {
    newlywedSupplyAvailable,
    newlywedUnits,
    requiresCheck: newlywedSupplyAvailable === null && hasSpecialDates,
  };
  const targetGroups = [];
  if (newlywedSupplyAvailable === true) targetGroups.push('신혼부부');
  if ((sumExplicitField(countRows, FIRST_HOME_COUNT_FIELDS) || 0) > 0) targetGroups.push('생애최초');
  if ((sumExplicitField(countRows, MULTI_CHILD_COUNT_FIELDS) || 0) > 0) targetGroups.push('다자녀');
  if ((sumExplicitField(countRows, ELDERLY_PARENT_COUNT_FIELDS) || 0) > 0) targetGroups.push('노부모부양');
  const schedules = applicationSchedules(detail, specialEvidence);
  const applicationDates = schedules.filter((schedule) => schedule.kind === 'application');
  const maxPrices = homes.map((home) => home.maxPriceManWon).filter((value) => Number.isFinite(value));
  const totalUnits = nonNegativeInteger(firstValue(detail, ['TOT_SUPLY_HSHLDCO', 'totSuplyHshldco', 'totalUnits']));
  const sourceUrl = text(firstValue(detail, ['PBLANC_URL', 'pblancUrl', 'HMPG_ADRES', 'hmpgAdres', 'sourceUrl']));
  const normalized = {
    id: `applyhome:${idSuffix}`,
    source: 'applyhome',
    sourceLabel: '청약홈',
    sourceNoticeId: idSuffix,
    title,
    sourceUrl,
    announcementDate: normalizeSupplyDate(firstValue(detail, ['RCRIT_PBLANC_DE', 'rcritPblancDe', 'announcementDate'])),
    program,
    tenure: tenureForProgram(program),
    locations: [regionFromAddress(address, areaName)],
    schedules,
    applicationStartDate: applicationDates.map((item) => item.startDate).filter(Boolean).sort()[0] || '',
    applicationEndDate: applicationDates.map((item) => item.endDate).filter(Boolean).sort().at(-1) || '',
    targetGroups: uniqueStrings(targetGroups),
    specialSupply: {
      newlywedUnits,
      firstHomeUnits: sumExplicitField(countRows, FIRST_HOME_COUNT_FIELDS),
      multiChildUnits: sumExplicitField(countRows, MULTI_CHILD_COUNT_FIELDS),
      elderlyParentUnits: sumExplicitField(countRows, ELDERLY_PARENT_COUNT_FIELDS),
      institutionUnits: sumExplicitField(countRows, INSTITUTION_COUNT_FIELDS),
      totalUnits: sumExplicitField(countRows, SPECIAL_TOTAL_FIELDS),
    },
    newlywedSupplyAvailable,
    eligibilityRequiresCheck: specialEvidence.requiresCheck || newlywedSupplyAvailable === true,
    totalUnits,
    homes,
    minAreaM2: homes.map((home) => home.areaM2).filter((value) => Number.isFinite(value)).sort((a, b) => a - b)[0] ?? null,
    maxAreaM2: homes.map((home) => home.areaM2).filter((value) => Number.isFinite(value)).sort((a, b) => b - a)[0] ?? null,
    maxPriceManWon: maxPrices.length ? Math.max(...maxPrices) : null,
    moveInPlanned: text(firstValue(detail, ['MVN_PREARNGE_YM', 'mvnPrearngeYm'])),
    developer: text(firstValue(detail, ['BSNS_MBY_NM', 'bsnsMbyNm'])),
    builder: text(firstValue(detail, ['CNSTRCT_ENTRPS_NM', 'cnstrctEntrpsNm'])),
    contact: text(firstValue(detail, ['MDHS_TELNO', 'mdhsTelno'])),
    fetchedAt: text(joined.options?.fetchedAt || firstValue(detail, ['fetchedAt'])),
  };
  return Object.freeze(normalized);
}

export function normalizeSupplyNotice(value = {}) {
  const id = text(value.id);
  if (!id) throw new TypeError('Supply notice requires a stable id');
  const locations = Array.isArray(value.locations) ? value.locations.map((location) => ({
    regionKey: text(location.regionKey || (location.sidoCode === '11' ? 'seoul' : location.sidoCode === '41' ? 'gyeonggi' : 'other')),
    sidoCode: text(location.sidoCode),
    sido: text(location.sido),
    district: text(location.district),
    address: text(location.address),
    lat: finiteNumber(location.lat),
    lng: finiteNumber(location.lng),
    coordinateAccuracy: text(location.coordinateAccuracy || 'none'),
  })) : [];
  const schedules = Array.isArray(value.schedules) ? value.schedules.map((schedule) => ({
    ...schedule,
    kind: text(schedule.kind),
    label: text(schedule.label),
    startDate: normalizeSupplyDate(schedule.startDate),
    endDate: normalizeSupplyDate(schedule.endDate || schedule.startDate),
  })).filter((schedule) => schedule.startDate || schedule.endDate) : [];
  return {
    ...value,
    id,
    title: text(value.title),
    source: text(value.source),
    sourceLabel: text(value.sourceLabel),
    sourceUrl: text(value.sourceUrl),
    announcementDate: normalizeSupplyDate(value.announcementDate),
    program: text(value.program || 'other'),
    tenure: text(value.tenure || 'unknown'),
    locations,
    schedules,
    targetGroups: uniqueStrings(Array.isArray(value.targetGroups) ? value.targetGroups : []),
    totalUnits: nonNegativeInteger(value.totalUnits),
    minAreaM2: positiveNumber(value.minAreaM2),
    maxAreaM2: positiveNumber(value.maxAreaM2),
    maxPriceManWon: positiveNumber(value.maxPriceManWon),
  };
}

function applicationWindows(notice) {
  const schedules = Array.isArray(notice?.schedules) ? notice.schedules : [];
  const application = schedules.filter((schedule) => schedule.kind === 'application')
    .map((schedule) => ({
      startDate: normalizeSupplyDate(schedule.startDate),
      endDate: normalizeSupplyDate(schedule.endDate || schedule.startDate),
    }))
    .filter((schedule) => schedule.startDate || schedule.endDate);
  if (application.length) return application;
  const startDate = normalizeSupplyDate(notice?.applicationStartDate);
  const endDate = normalizeSupplyDate(notice?.applicationEndDate || notice?.applicationStartDate);
  return startDate || endDate ? [{ startDate: startDate || endDate, endDate: endDate || startDate }] : [];
}

export function supplyStatusAtKst(notice, now = new Date()) {
  const today = kstDateKey(now);
  const windows = applicationWindows(notice);
  if (!windows.length) {
    const explicit = text(notice?.status).toLowerCase();
    if (explicit === 'closed' || explicit === 'cancelled') return 'closed';
    return 'unknown';
  }
  if (windows.some(({ startDate, endDate }) => startDate <= today && today <= endDate)) return 'open';
  if (windows.some(({ startDate }) => startDate > today)) return 'upcoming';
  return 'closed';
}

export const noticeStatusAtKst = supplyStatusAtKst;

function richness(notice) {
  return [notice.title, notice.sourceUrl, notice.announcementDate, notice.totalUnits, notice.maxPriceManWon]
    .filter((value) => value !== '' && value !== null && value !== undefined).length
    + (notice.homes?.length || 0) * 2
    + (notice.schedules?.length || 0)
    + (notice.locations?.length || 0);
}

function mergeUniqueBy(items, keyOf) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyOf(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeNotices(left, right) {
  const primary = richness(right) > richness(left) ? right : left;
  const secondary = primary === left ? right : left;
  return {
    ...secondary,
    ...primary,
    locations: mergeUniqueBy([...(primary.locations || []), ...(secondary.locations || [])], (item) => `${item.address}|${item.sidoCode}|${item.district}`),
    schedules: mergeUniqueBy([...(primary.schedules || []), ...(secondary.schedules || [])], (item) => `${item.kind}|${item.label}|${item.startDate}|${item.endDate}`),
    targetGroups: uniqueStrings([...(primary.targetGroups || []), ...(secondary.targetGroups || [])]),
    homes: mergeUniqueBy([...(primary.homes || []), ...(secondary.homes || [])], (item) => `${item.modelNo}|${item.houseType}|${item.areaM2}`),
  };
}

export function dedupeSupplyNotices(notices = []) {
  const byId = new Map();
  for (const value of Array.isArray(notices) ? notices : []) {
    let notice;
    try { notice = normalizeSupplyNotice(value); } catch (_) { continue; }
    byId.set(notice.id, byId.has(notice.id) ? mergeNotices(byId.get(notice.id), notice) : notice);
  }
  return [...byId.values()];
}

function normalizedList(value) {
  if (value === undefined || value === null || value === '') return [];
  return (Array.isArray(value) ? value : [value]).map((item) => text(item).toLowerCase()).filter(Boolean);
}

function noticeRegionTokens(notice) {
  return (notice.locations || []).flatMap((location) => [
    location.regionKey,
    location.sidoCode,
    location.sido,
    location.district,
    location.address,
  ]).map((value) => text(value).toLowerCase()).filter(Boolean);
}

function regionMatches(notice, requested) {
  if (!requested.length) return true;
  const tokens = noticeRegionTokens(notice);
  return requested.some((region) => tokens.some((token) => {
    if (region === '서울' || region === '서울특별시' || region === '11') return token === 'seoul' || token === '11' || token.includes('서울');
    if (region === '경기' || region === '경기도' || region === '41') return token === 'gyeonggi' || token === '41' || token.includes('경기');
    return token === region || token.includes(region);
  }));
}

function priceMatches(notice, preferences) {
  const maximum = positiveNumber(preferences.maxPriceManWon);
  if (maximum === null) return true;
  const price = positiveNumber(notice.maxPriceManWon);
  return price === null ? preferences.includeUnknownPrice === true : price <= maximum;
}

function areaMatches(notice, preferences) {
  const minimum = positiveNumber(preferences.minAreaM2);
  const maximum = positiveNumber(preferences.maxAreaM2);
  if (minimum === null && maximum === null) return true;
  const homes = (notice.homes || []).map((home) => positiveNumber(home.areaM2)).filter((value) => value !== null);
  if (!homes.length) {
    const low = positiveNumber(notice.minAreaM2);
    const high = positiveNumber(notice.maxAreaM2);
    if (low !== null) homes.push(low);
    if (high !== null && high !== low) homes.push(high);
  }
  if (!homes.length) return preferences.includeUnknownArea === true;
  return homes.some((area) => (minimum === null || area >= minimum) && (maximum === null || area <= maximum));
}

function supplyUnitsMatch(notice, preferences) {
  const minimum = positiveNumber(preferences.minSupplyUnits);
  if (minimum === null) return true;
  const units = positiveNumber(notice.totalUnits);
  return units === null ? preferences.includeUnknownUnits === true : units >= minimum;
}

export function matchesSupplyAlertPreferences(noticeValue, preferences = {}, now = new Date()) {
  let notice;
  try { notice = normalizeSupplyNotice(noticeValue); } catch (_) { return false; }
  const regions = normalizedList(preferences.regions);
  if (!regionMatches(notice, regions)) return false;
  const districts = normalizedList(preferences.districts);
  if (districts.length && !regionMatches(notice, districts)) return false;
  const statuses = normalizedList(preferences.statuses);
  if (statuses.length && !statuses.includes(supplyStatusAtKst(notice, now))) return false;
  const programs = normalizedList(preferences.programs);
  if (programs.length && !programs.includes(text(notice.program).toLowerCase())) return false;
  const tenures = normalizedList(preferences.tenures);
  if (tenures.length && !tenures.includes(text(notice.tenure).toLowerCase())) return false;
  const sources = normalizedList(preferences.sources);
  if (sources.length && !sources.includes(text(notice.source).toLowerCase())) return false;
  if (preferences.newlywedOnly === true && notice.newlywedSupplyAvailable !== true && notice.program !== 'newlywed-town') return false;
  if (!statuses.length && preferences.excludeClosed !== false && supplyStatusAtKst(notice, now) === 'closed') return false;
  if (!priceMatches(notice, preferences) || !areaMatches(notice, preferences) || !supplyUnitsMatch(notice, preferences)) return false;
  const query = text(preferences.query).toLowerCase();
  if (query) {
    const haystack = [notice.title, notice.sourceLabel, notice.program, ...noticeRegionTokens(notice), ...(notice.targetGroups || [])]
      .map((value) => text(value).toLowerCase()).join(' ');
    if (!query.split(/\s+/).every((token) => haystack.includes(token))) return false;
  }
  return true;
}

export const matchesAlertPreferences = matchesSupplyAlertPreferences;

export function filterSupplyNotices(notices = [], preferences = {}, now = new Date()) {
  const favoriteIds = new Set(normalizedList(preferences.favoriteIds));
  const unreadIds = new Set(normalizedList(preferences.unreadIds));
  return dedupeSupplyNotices(notices).filter((notice) => {
    if (!matchesSupplyAlertPreferences(notice, { ...preferences, statuses: preferences.statuses || [] }, now)) return false;
    if (preferences.favoritesOnly && !favoriteIds.has(notice.id.toLowerCase())) return false;
    if (preferences.unreadOnly && !unreadIds.has(notice.id.toLowerCase())) return false;
    return true;
  });
}

function nextApplicationDate(notice, today, preferEnd = false) {
  const windows = applicationWindows(notice);
  const active = windows.filter(({ startDate, endDate }) => startDate <= today && today <= endDate);
  if (active.length) return (preferEnd ? active.map((item) => item.endDate) : active.map((item) => item.startDate)).sort()[0];
  const future = windows.filter(({ startDate }) => startDate > today).map((item) => item.startDate).sort();
  return future[0] || '9999-12-31';
}

export function sortSupplyNotices(notices = [], sort = 'soon', now = new Date()) {
  const today = kstDateKey(now);
  const statusRank = { open: 0, upcoming: 1, unknown: 2, closed: 3 };
  const values = dedupeSupplyNotices(notices);
  const compareText = (a, b) => String(a).localeCompare(String(b), 'ko-KR');
  return values.sort((a, b) => {
    if (sort === 'newest') {
      const date = (b.announcementDate || '').localeCompare(a.announcementDate || '');
      if (date) return date;
    } else if (sort === 'units') {
      const units = (b.totalUnits ?? -1) - (a.totalUnits ?? -1);
      if (units) return units;
    } else if (sort === 'price') {
      const left = a.maxPriceManWon ?? Number.POSITIVE_INFINITY;
      const right = b.maxPriceManWon ?? Number.POSITIVE_INFINITY;
      if (left !== right) return left - right;
    } else {
      const status = (statusRank[supplyStatusAtKst(a, now)] ?? 9) - (statusRank[supplyStatusAtKst(b, now)] ?? 9);
      if (status) return status;
      const date = compareText(nextApplicationDate(a, today, sort === 'deadline'), nextApplicationDate(b, today, sort === 'deadline'));
      if (date) return date;
    }
    return compareText(a.title, b.title) || compareText(a.id, b.id);
  });
}

function dateKeyDistance(from, to) {
  if (!from || !to) return Number.POSITIVE_INFINITY;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (24 * 60 * 60 * 1000));
}

export function summarizeSupplyNotices(notices = [], now = new Date()) {
  const today = kstDateKey(now);
  const values = dedupeSupplyNotices(notices);
  const summary = {
    total: values.length,
    open: 0,
    upcoming: 0,
    closed: 0,
    unknown: 0,
    newlywed: 0,
    newlywedTown: 0,
    publicSale: 0,
    openingWithin7Days: 0,
    closingWithin7Days: 0,
    regions: { seoul: 0, gyeonggi: 0, other: 0 },
  };
  values.forEach((notice) => {
    const status = supplyStatusAtKst(notice, now);
    summary[status] += 1;
    if (notice.newlywedSupplyAvailable === true || notice.program === 'newlywed-town') summary.newlywed += 1;
    if (notice.program === 'newlywed-town') summary.newlywedTown += 1;
    if (notice.program === 'public-sale') summary.publicSale += 1;
    const regions = new Set((notice.locations || []).map((location) => {
      if (location.regionKey === 'seoul' || location.sidoCode === '11') return 'seoul';
      if (location.regionKey === 'gyeonggi' || location.sidoCode === '41') return 'gyeonggi';
      return 'other';
    }));
    if (!regions.size) regions.add('other');
    regions.forEach((region) => { summary.regions[region] += 1; });
    const windows = applicationWindows(notice);
    if (status === 'upcoming' && windows.some(({ startDate }) => {
      const days = dateKeyDistance(today, startDate);
      return days >= 0 && days <= 7;
    })) summary.openingWithin7Days += 1;
    if (status === 'open' && windows.some(({ endDate }) => {
      const days = dateKeyDistance(today, endDate);
      return days >= 0 && days <= 7;
    })) summary.closingWithin7Days += 1;
  });
  return summary;
}

function idSet(values) {
  if (values instanceof Set) return new Set([...values].map((value) => text(value)));
  if (values instanceof Map) return new Set([...values.keys()].map((value) => text(value)));
  if (Array.isArray(values)) return new Set(values.map((value) => typeof value === 'object' ? text(value.id) : text(value)).filter(Boolean));
  if (values && typeof values === 'object') return new Set(Object.keys(values).map(text).filter(Boolean));
  return new Set();
}

export function diffNewSupplyNotices(current = [], previous, options = {}) {
  if ((previous === undefined || previous === null) && options.initialRunIsBaseline !== false) return [];
  const previousIds = idSet(previous || []);
  const now = options.now || new Date();
  return dedupeSupplyNotices(current).filter((notice) => {
    if (previousIds.has(notice.id)) return false;
    if (options.includeClosed !== true && supplyStatusAtKst(notice, now) === 'closed') return false;
    return true;
  });
}

export const diffSupplyNotices = diffNewSupplyNotices;

export function unreadSupplyNotices(notices = [], seen = {}, options = {}) {
  const seenIds = idSet(seen);
  const now = options.now || new Date();
  return dedupeSupplyNotices(notices).filter((notice) => {
    if (seenIds.has(notice.id)) return false;
    if (options.includeClosed !== true && supplyStatusAtKst(notice, now) === 'closed') return false;
    return true;
  });
}

export function selectSupplyAlerts({
  current = [], previous = null, seen = {}, preferences = {}, now = new Date(), initialRunIsBaseline = true,
} = {}) {
  const seenIds = idSet(seen);
  return diffNewSupplyNotices(current, previous, { now, initialRunIsBaseline })
    .filter((notice) => !seenIds.has(notice.id))
    .filter((notice) => matchesSupplyAlertPreferences(notice, preferences, now));
}
