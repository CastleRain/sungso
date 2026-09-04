import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectLhSupplySource,
  fingerprintLhSupplyNotice,
} from './lh-supply-adapter.mjs';
import {
  collectShSupplySource,
  fingerprintShSupplyNotice,
  SH_RSS_URL,
} from './sh-supply-provider.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const projectDir = path.resolve(scriptDir, '..');
const outputPath = path.join(projectDir, 'data', 'home-supply.json');

export const APPLYHOME_BASE_URL = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1';

export const APPLYHOME_ENDPOINTS = Object.freeze([
  {
    category: 'apt',
    label: 'APT 분양',
    detail: 'getAPTLttotPblancDetail',
    model: 'getAPTLttotPblancMdl',
  },
  {
    category: 'remaining',
    label: '잔여세대',
    detail: 'getRemndrLttotPblancDetail',
    model: 'getRemndrLttotPblancMdl',
  },
  {
    category: 'optional',
    label: '임의공급',
    detail: 'getOPTLttotPblancDetail',
    model: 'getOPTLttotPblancMdl',
  },
]);

const TARGET_REGIONS = Object.freeze(['서울', '경기']);
const DEFAULT_LOOKBACK_DAYS = 730;
const PAGE_SIZE = 100;
const MAX_PAGES = 500;
const MAX_MODEL_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

export class ApplyhomeFetchError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ApplyhomeFetchError';
    this.details = details;
  }
}

export function decodeServiceKey(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  try {
    return decodeURIComponent(trimmed);
  } catch (_) {
    return trimmed;
  }
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function firstText(record, names) {
  for (const name of names) {
    const value = cleanText(record?.[name]);
    if (value) return value;
  }
  return '';
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableNonNegativeInteger(value) {
  const parsed = finiteNumber(value);
  return parsed === null || parsed < 0 ? null : Math.round(parsed);
}

function normalizeDate(value) {
  const text = cleanText(value);
  if (!text) return null;
  const compact = text.match(/\b(20\d{2})[.\/-]?(\d{1,2})[.\/-]?(\d{1,2})\b/);
  if (!compact) return null;
  const [, year, month, day] = compact;
  const normalized = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) return null;
  return normalized;
}

function dateRange(value) {
  const matches = [...cleanText(value).matchAll(/\b(20\d{2})[.\/-]?(\d{1,2})[.\/-]?(\d{1,2})\b/g)]
    .map((match) => normalizeDate(match[0]))
    .filter(Boolean);
  return {
    start: matches[0] || null,
    end: matches.at(-1) || matches[0] || null,
  };
}

function minDate(values) {
  const dates = values.filter(Boolean).sort();
  return dates[0] || null;
}

function maxDate(values) {
  const dates = values.filter(Boolean).sort();
  return dates.at(-1) || null;
}

function seoulDate(now = new Date()) {
  const shifted = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return shifted.toISOString().slice(0, 10);
}

function seoulDateMinusDays(days, now = new Date()) {
  const shifted = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  shifted.setUTCDate(shifted.getUTCDate() - days);
  return shifted.toISOString().slice(0, 10);
}

function normalizeRegionName(value, address = '') {
  const normalizedAddress = cleanText(address);
  if (/^(서울특별시|서울시|서울)(?:\s|$)/.test(normalizedAddress)) return '서울';
  if (/^(경기도|경기)(?:\s|$)/.test(normalizedAddress)) return '경기';
  const text = cleanText(value).replace(/\s/g, '');
  if (text === '서울' || text === '서울특별시' || text.startsWith('서울')) return '서울';
  if (text === '경기' || text === '경기도' || text.startsWith('경기')) return '경기';
  return '';
}

function districtFromAddress(regionName, address) {
  const tokens = cleanText(address).split(' ').filter(Boolean);
  if (!tokens.length) return '';
  const offset = /^(서울|서울특별시|경기|경기도)$/.test(tokens[0]) ? 1 : 0;
  if (regionName === '서울') {
    return tokens.slice(offset).find((token) => /구$/.test(token)) || tokens[offset] || '';
  }
  if (regionName === '경기') {
    const cityOrCounty = tokens.slice(offset).find((token) => /(?:시|군)$/.test(token));
    const borough = tokens.slice(offset).find((token) => /구$/.test(token));
    return [cityOrCounty, borough].filter(Boolean).join(' ') || tokens[offset] || '';
  }
  return '';
}

export function isTargetRegion(record) {
  const address = firstText(record, ['HSSPLY_ADRES', 'HSSPLY_ADDRESS', 'SUPLY_LOCATION']);
  const region = normalizeRegionName(firstText(record, [
    'SUBSCRPT_AREA_CODE_NM',
    'SUBSCRPT_AREA_NM',
    'SIDO_NM',
  ]), address);
  return TARGET_REGIONS.includes(region);
}

function scheduleFromDetail(raw) {
  const specialStart = normalizeDate(firstText(raw, ['SPSPLY_RCEPT_BGNDE', 'SPSPLY_RCEPT_BEGIN_DE']));
  const specialEnd = normalizeDate(firstText(raw, ['SPSPLY_RCEPT_ENDDE', 'SPSPLY_RCEPT_END_DE'])) || specialStart;

  const firstRankRanges = [
    dateRange(raw.GNRL_RNK1_CRSPAREA_RCPTDE_PD),
    dateRange(raw.GNRL_RNK1_ETC_AREA_RCPTDE_PD),
    dateRange(raw.GNRL_RNK1_CRSPAREA_RCPTDE),
    dateRange(raw.GNRL_RNK1_ETC_AREA_RCPTDE),
  ];
  const secondRankRanges = [
    dateRange(raw.GNRL_RNK2_CRSPAREA_RCPTDE_PD),
    dateRange(raw.GNRL_RNK2_ETC_AREA_RCPTDE_PD),
    dateRange(raw.GNRL_RNK2_CRSPAREA_RCPTDE),
    dateRange(raw.GNRL_RNK2_ETC_AREA_RCPTDE),
  ];

  const explicitStart = normalizeDate(firstText(raw, [
    'RCEPT_BGNDE',
    'SUBSCRPT_RCEPT_BGNDE',
    'SUBSCRPT_RCEPT_BEGIN_DE',
  ]));
  const explicitEnd = normalizeDate(firstText(raw, [
    'RCEPT_ENDDE',
    'SUBSCRPT_RCEPT_ENDDE',
    'SUBSCRPT_RCEPT_END_DE',
  ]));
  const firstRankStart = minDate(firstRankRanges.map((range) => range.start));
  const firstRankEnd = maxDate(firstRankRanges.map((range) => range.end));
  const secondRankStart = minDate(secondRankRanges.map((range) => range.start));
  const secondRankEnd = maxDate(secondRankRanges.map((range) => range.end));
  const starts = [explicitStart, specialStart, firstRankStart, secondRankStart];
  const ends = [explicitEnd, specialEnd, firstRankEnd, secondRankEnd];

  return {
    applyStart: minDate(starts),
    applyEnd: maxDate(ends),
    specialApplyStart: specialStart,
    specialApplyEnd: specialEnd,
    firstPriorityApplyStart: firstRankStart,
    firstPriorityApplyEnd: firstRankEnd,
    secondPriorityApplyStart: secondRankStart,
    secondPriorityApplyEnd: secondRankEnd,
    winnerAnnouncementDate: normalizeDate(firstText(raw, ['PRZWNER_PRESNATN_DE', 'PRZWNER_ANNOUNCE_DE'])),
    contractStart: normalizeDate(firstText(raw, ['CNTRCT_CNCLS_BGNDE', 'CNTRCT_BEGIN_DE'])),
    contractEnd: normalizeDate(firstText(raw, ['CNTRCT_CNCLS_ENDDE', 'CNTRCT_END_DE'])),
  };
}

function deriveApplicationStatus(schedule, providerStatus, today) {
  if (/취소|중단|철회/.test(providerStatus)) return 'cancelled';
  if (schedule.applyStart && schedule.applyStart > today) return 'upcoming';
  if (schedule.applyEnd && schedule.applyEnd < today) return 'closed';
  if (schedule.applyStart && schedule.applyEnd
    && schedule.applyStart <= today && schedule.applyEnd >= today) return 'open';
  return 'unknown';
}

export function normalizeApplyhomeModel(raw = {}) {
  const topAmount = finiteNumber(raw.LTTOT_TOP_AMOUNT);
  const houseType = firstText(raw, ['HOUSE_TY', 'HOUSE_TYPE']);
  const exclusiveAreaValue = finiteNumber(houseType.match(/\d+(?:\.\d+)?/)?.[0]);
  const exclusiveArea = exclusiveAreaValue !== null && exclusiveAreaValue > 0 ? exclusiveAreaValue : null;
  const supplyAreaValue = finiteNumber(raw.SUPLY_AR);
  const generalUnits = nullableNonNegativeInteger(raw.SUPLY_HSHLDCO);
  const specialUnits = nullableNonNegativeInteger(raw.SPSPLY_HSHLDCO);
  return {
    modelNo: firstText(raw, ['MODEL_NO']),
    houseType,
    areaM2: exclusiveArea,
    supplyAreaM2: supplyAreaValue !== null && supplyAreaValue > 0 ? supplyAreaValue : null,
    totalUnits: generalUnits === null || specialUnits === null ? null : generalUnits + specialUnits,
    generalUnits,
    specialUnits,
    newlywedUnits: nullableNonNegativeInteger(raw.NWWDS_HSHLDCO),
    newbornUnits: nullableNonNegativeInteger(raw.NWBB_HSHLDCO),
    firstHomeUnits: nullableNonNegativeInteger(raw.LFE_FRST_HSHLDCO),
    youthUnits: nullableNonNegativeInteger(raw.YGMN_HSHLDCO),
    multiChildUnits: nullableNonNegativeInteger(raw.MNYCH_HSHLDCO),
    elderlyParentUnits: nullableNonNegativeInteger(raw.OLD_PARNTS_SUPORT_HSHLDCO),
    institutionRecommendedUnits: nullableNonNegativeInteger(raw.INSTT_RECOMEND_HSHLDCO),
    topAmountManWon: topAmount === null || topAmount <= 0 ? null : topAmount,
  };
}

function scheduleEntries(schedule) {
  const entries = [];
  const push = (kind, label, startDate, endDate = startDate, extras = {}) => {
    if (!startDate && !endDate) return;
    entries.push({ kind, label, startDate: startDate || endDate, endDate: endDate || startDate, ...extras });
  };
  push('application', '특별공급', schedule.specialApplyStart, schedule.specialApplyEnd, { audience: 'special-supply' });
  push('application', '1순위', schedule.firstPriorityApplyStart, schedule.firstPriorityApplyEnd, { audience: 'general-rank-1' });
  push('application', '2순위', schedule.secondPriorityApplyStart, schedule.secondPriorityApplyEnd, { audience: 'general-rank-2' });
  if (!entries.length) push('application', '청약 접수', schedule.applyStart, schedule.applyEnd);
  push('announcement', '당첨자 발표', schedule.winnerAnnouncementDate);
  push('contract', '계약', schedule.contractStart, schedule.contractEnd);
  return entries;
}

function programFromNotice(category, detailName, houseTypeName, rentTypeName) {
  if (/신혼희망타운/.test(detailName)) return 'newlywed-town';
  if (category === 'remaining') return 'remaining-supply';
  if (category === 'optional') return 'optional-supply';
  if (/공공임대|행복주택/.test(`${detailName} ${rentTypeName}`)) return 'public-rent';
  if (/민간임대/.test(`${detailName} ${rentTypeName}`)) return 'private-rent';
  if (/임대/.test(rentTypeName)) return 'apartment-rental';
  if (/공공분양|국민주택/.test(`${detailName} ${houseTypeName}`)) return 'public-sale';
  if (/민영주택|민간분양/.test(`${detailName} ${houseTypeName}`)) return 'private-sale';
  return 'apartment-sale';
}

function sumKnown(models, field, requireEvery = false) {
  const values = models.map((model) => model[field]).filter((value) => Number.isFinite(value));
  if (!values.length || (requireEvery && values.length !== models.length)) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function modelSortKey(model) {
  return `${model.modelNo || ''}\u0000${model.houseType || ''}\u0000${model.supplyAreaM2 ?? ''}`;
}

function compactModels(rawModels) {
  const seen = new Set();
  return rawModels
    .map(normalizeApplyhomeModel)
    .filter((model) => {
      const key = JSON.stringify(model);
      if (seen.has(key)) return false;
      seen.add(key);
      return model.modelNo || model.houseType || model.supplyAreaM2 !== null;
    })
    .sort((a, b) => modelSortKey(a).localeCompare(modelSortKey(b), 'ko'));
}

function materialNotice(notice) {
  if (notice.source === 'lh') {
    return {
      source: notice.source,
      sourceNoticeId: notice.sourceNoticeId,
      idStability: notice.idStability,
      notificationEligible: notice.notificationEligible,
      category: notice.category,
      categoryLabel: notice.categoryLabel,
      name: notice.name,
      program: notice.program,
      tenure: notice.tenure,
      locations: notice.locations,
      providerStatus: notice.providerStatus,
      status: notice.status,
      noticeDate: notice.noticeDate,
      closeDate: notice.closeDate,
      schedule: notice.schedule,
      schedules: notice.schedules,
      targetGroups: notice.targetGroups,
      newlywedSupplyAvailable: notice.newlywedSupplyAvailable,
      officialUrl: notice.officialUrl,
      subcategory: notice.subcategory,
    };
  }
  if (notice.source === 'sh') {
    return {
      source: notice.source,
      sourceNoticeId: notice.sourceNoticeId,
      idStability: notice.idStability,
      notificationEligible: notice.notificationEligible,
      category: notice.category,
      categoryLabel: notice.categoryLabel,
      name: notice.name,
      program: notice.program,
      tenure: notice.tenure,
      locations: notice.locations,
      providerStatus: notice.providerStatus,
      status: notice.status,
      noticeDate: notice.noticeDate,
      closeDate: notice.closeDate,
      schedules: notice.schedules,
      targetGroups: notice.targetGroups,
      newlywedSupplyAvailable: notice.newlywedSupplyAvailable,
      newlywedClassification: notice.newlywedClassification,
      classification: notice.classification,
      officialUrl: notice.officialUrl,
      summary: notice.summary,
    };
  }
  return {
    category: notice.category,
    categoryLabel: notice.categoryLabel,
    name: notice.name,
    supplyLocation: notice.supplyLocation,
    regionCode: notice.regionCode,
    regionName: notice.regionName,
    houseTypeCode: notice.houseTypeCode,
    houseTypeName: notice.houseTypeName,
    houseDetailTypeCode: notice.houseDetailTypeCode,
    houseDetailTypeName: notice.houseDetailTypeName,
    rentTypeCode: notice.rentTypeCode,
    rentTypeName: notice.rentTypeName,
    publisherName: notice.publisherName,
    builder: notice.builder,
    contact: notice.contact,
    providerStatus: notice.providerStatus,
    status: notice.status,
    noticeDate: notice.noticeDate,
    moveInExpected: notice.moveInExpected,
    ...notice.schedule,
    totalSupplyUnits: notice.totalSupplyUnits,
    newlywedUnits: notice.newlywedUnits,
    newbornUnits: notice.newbornUnits,
    eligibilityTags: notice.eligibilityTags,
    price: notice.price,
    models: notice.models,
    officialUrl: notice.officialUrl,
    homepageUrl: notice.homepageUrl,
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function fingerprintNotice(notice) {
  if (notice.source === 'lh') return fingerprintLhSupplyNotice(notice);
  if (notice.source === 'sh') return fingerprintShSupplyNotice(notice);
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(materialNotice(notice))))
    .digest('hex');
}

export function normalizeApplyhomeNotice(raw = {}, endpoint, rawModels = [], options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const today = options.today || seoulDate();
  const models = compactModels(rawModels);
  const houseManageNo = firstText(raw, ['HOUSE_MANAGE_NO', 'HOUSE_MNGE_NO']);
  const noticeNo = firstText(raw, ['PBLANC_NO', 'RCRIT_PBLANC_NO']);
  const supplyLocation = firstText(raw, ['HSSPLY_ADRES', 'HSSPLY_ADDRESS', 'SUPLY_LOCATION']);
  const regionName = normalizeRegionName(firstText(raw, [
    'SUBSCRPT_AREA_CODE_NM',
    'SUBSCRPT_AREA_NM',
    'SIDO_NM',
  ]), supplyLocation);
  const schedule = scheduleFromDetail(raw);
  const providerStatus = firstText(raw, ['PBLANC_STAT_NM', 'RCRIT_PBLANC_STAT_NM', 'PBLANC_STATUS_NM']);
  const modelTotals = {
    all: sumKnown(models, 'totalUnits', true),
    newlywed: sumKnown(models, 'newlywedUnits'),
    newborn: sumKnown(models, 'newbornUnits'),
    firstHome: sumKnown(models, 'firstHomeUnits'),
    youth: sumKnown(models, 'youthUnits'),
    multiChild: sumKnown(models, 'multiChildUnits'),
    elderlyParent: sumKnown(models, 'elderlyParentUnits'),
    institutionRecommended: sumKnown(models, 'institutionRecommendedUnits'),
    special: sumKnown(models, 'specialUnits', true),
  };
  const detailTotalValue = finiteNumber(raw.TOT_SUPLY_HSHLDCO);
  const detailTotal = detailTotalValue === null || detailTotalValue < 0
    ? null
    : Math.round(detailTotalValue);
  const topAmounts = models.map((model) => model.topAmountManWon).filter((value) => value !== null).sort((a, b) => a - b);
  const name = firstText(raw, ['HOUSE_NM', 'HOUSE_NAME', 'HSSPLY_NM']);
  const detailName = firstText(raw, ['HOUSE_DTL_SECD_NM', 'HOUSE_DETAIL_SECD_NM']);
  const houseTypeName = firstText(raw, ['HOUSE_SECD_NM']);
  const rentTypeName = firstText(raw, ['RENT_SECD_NM']);
  const program = programFromNotice(endpoint.category, detailName, houseTypeName, rentTypeName);
  const officialUrl = firstText(raw, ['PBLANC_URL', 'PBLANC_ADRES']);
  const homepageUrl = firstText(raw, ['HMPG_ADRES', 'HOMEPAGE_URL']);
  const district = districtFromAddress(regionName, supplyLocation);
  const newlywedSupplyAvailable = modelTotals.newlywed === null
    ? (program === 'newlywed-town' ? true : null)
    : modelTotals.newlywed > 0;
  const hasSpecialApplication = Boolean(schedule.specialApplyStart || schedule.specialApplyEnd);
  const eligibilityTags = [];
  if (program === 'newlywed-town') eligibilityTags.push('신혼희망타운');
  if (modelTotals.newlywed > 0) eligibilityTags.push('신혼부부 특별공급');
  if (modelTotals.newborn > 0) eligibilityTags.push('신생아 특별공급');
  if (modelTotals.firstHome > 0) eligibilityTags.push('생애최초 특별공급');
  if (modelTotals.youth > 0) eligibilityTags.push('청년 특별공급');

  const notice = {
    id: `applyhome:${endpoint.category}:${houseManageNo || 'unknown'}:${noticeNo || 'unknown'}`,
    source: 'applyhome',
    sourceLabel: '한국부동산원 청약홈',
    sourceNoticeId: [houseManageNo, noticeNo].filter(Boolean).join(':'),
    category: endpoint.category,
    categoryLabel: endpoint.label,
    houseManageNo,
    noticeNo,
    title: name,
    name,
    address: supplyLocation,
    supplyLocation,
    regionCode: firstText(raw, ['SUBSCRPT_AREA_CODE']),
    regionName,
    region: regionName,
    district,
    locations: [{
      regionKey: regionName === '서울' ? 'seoul' : regionName === '경기' ? 'gyeonggi' : 'other',
      sidoCode: regionName === '서울' ? '11' : regionName === '경기' ? '41' : '',
      sido: regionName === '서울' ? '서울특별시' : regionName === '경기' ? '경기도' : '',
      district,
      address: supplyLocation,
      lat: null,
      lng: null,
      coordinateAccuracy: 'none',
    }],
    houseTypeCode: firstText(raw, ['HOUSE_SECD']),
    houseTypeName,
    houseDetailTypeCode: firstText(raw, ['HOUSE_DTL_SECD']),
    houseDetailTypeName: detailName,
    rentTypeCode: firstText(raw, ['RENT_SECD']),
    rentTypeName,
    publisherName: firstText(raw, ['BSNS_MBY_NM', 'PBLANC_MBY_NM']),
    providerStatus,
    status: deriveApplicationStatus(schedule, providerStatus, today),
    noticeDate: normalizeDate(firstText(raw, ['RCRIT_PBLANC_DE', 'PBLANC_DE'])),
    announcementDate: normalizeDate(firstText(raw, ['RCRIT_PBLANC_DE', 'PBLANC_DE'])),
    moveInExpected: firstText(raw, ['MVN_PREARNGE_YM', 'MVN_PREARNGE_DE']),
    schedule,
    schedules: scheduleEntries(schedule),
    applicationStartDate: schedule.applyStart,
    applicationEndDate: schedule.applyEnd,
    program,
    tenure: /rent|임대/.test(`${program} ${rentTypeName}`) ? 'rent' : 'sale',
    totalSupplyUnits: detailTotal ?? modelTotals.all,
    totalUnits: detailTotal ?? modelTotals.all,
    newlywedUnits: modelTotals.newlywed,
    newbornUnits: modelTotals.newborn,
    newlywedSupplyAvailable,
    eligibilityTags,
    targetGroups: [
      newlywedSupplyAvailable === true ? '신혼부부' : '',
      modelTotals.newborn > 0 ? '신생아' : '',
      modelTotals.firstHome > 0 ? '생애최초' : '',
      modelTotals.youth > 0 ? '청년' : '',
      modelTotals.multiChild > 0 ? '다자녀' : '',
      modelTotals.elderlyParent > 0 ? '노부모부양' : '',
    ].filter(Boolean),
    eligibilityRequiresCheck: newlywedSupplyAvailable === true
      || (newlywedSupplyAvailable === null && hasSpecialApplication),
    specialSupply: {
      newlywedUnits: modelTotals.newlywed,
      newbornUnits: modelTotals.newborn,
      firstHomeUnits: modelTotals.firstHome,
      youthUnits: modelTotals.youth,
      multiChildUnits: modelTotals.multiChild,
      elderlyParentUnits: modelTotals.elderlyParent,
      institutionRecommendedUnits: modelTotals.institutionRecommended,
      totalUnits: modelTotals.special,
    },
    price: {
      lowestModelTopAmountManWon: topAmounts[0] ?? null,
      highestModelTopAmountManWon: topAmounts.at(-1) ?? null,
    },
    models,
    homes: models.map((model) => ({
      id: model.modelNo || model.houseType,
      type: model.houseType,
      areaM2: model.areaM2 ?? model.supplyAreaM2,
      supplyAreaM2: model.supplyAreaM2,
      totalUnits: model.totalUnits,
      generalUnits: model.generalUnits,
      specialUnits: model.specialUnits,
      newlywedUnits: model.newlywedUnits,
      newbornUnits: model.newbornUnits,
      firstHomeUnits: model.firstHomeUnits,
      youthUnits: model.youthUnits,
      maxPriceManWon: model.topAmountManWon,
    })),
    minAreaM2: null,
    maxAreaM2: null,
    maxPriceManWon: topAmounts.at(-1) ?? null,
    officialUrl: officialUrl || homepageUrl || 'https://www.applyhome.co.kr/',
    sourceUrl: officialUrl || homepageUrl || 'https://www.applyhome.co.kr/',
    homepageUrl,
    developer: firstText(raw, ['BSNS_MBY_NM', 'PBLANC_MBY_NM']),
    builder: firstText(raw, ['CNSTRCT_ENTRPS_NM']),
    contact: firstText(raw, ['MDHS_TELNO']),
    firstSeenAt: generatedAt,
    lastSeenAt: generatedAt,
    fetchedAt: generatedAt,
  };
  const homeAreas = notice.homes.map((home) => home.areaM2).filter(Number.isFinite).sort((a, b) => a - b);
  notice.minAreaM2 = homeAreas[0] ?? null;
  notice.maxAreaM2 = homeAreas.at(-1) ?? null;
  notice.fingerprint = fingerprintNotice(notice);
  return notice;
}

function buildUrl(endpointName, serviceKey, page, conditions = {}) {
  const url = new URL(`${APPLYHOME_BASE_URL}/${endpointName}`);
  url.searchParams.set('serviceKey', serviceKey);
  url.searchParams.set('page', String(page));
  url.searchParams.set('perPage', String(PAGE_SIZE));
  url.searchParams.set('returnType', 'JSON');
  for (const [field, value] of Object.entries(conditions)) {
    if (value !== null && value !== undefined && value !== '') {
      url.searchParams.set(`cond[${field}::EQ]`, String(value));
    }
  }
  return url;
}

function buildDetailUrl(endpointName, serviceKey, page, noticeDateFrom) {
  const url = buildUrl(endpointName, serviceKey, page);
  url.searchParams.set('cond[RCRIT_PBLANC_DE::GTE]', noticeDateFrom);
  return url;
}

async function fetchJsonWithRetry(url, fetchImpl = fetch) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const bodyText = await response.text();
      if (!response.ok) throw new ApplyhomeFetchError(`HTTP ${response.status}`, { status: response.status });
      let body;
      try {
        body = JSON.parse(bodyText);
      } catch (_) {
        throw new ApplyhomeFetchError('응답이 JSON 형식이 아닙니다.');
      }
      if (!Array.isArray(body?.data)) {
        const providerMessage = cleanText(body?.msg || body?.message || body?.error);
        throw new ApplyhomeFetchError(providerMessage || '응답에 data 배열이 없습니다.', {
          providerCode: body?.code ?? null,
        });
      }
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 700));
      }
    }
  }
  throw lastError;
}

function responseTargetCount(body) {
  const matchCount = finiteNumber(body.matchCount);
  if (matchCount !== null) return Math.max(0, Math.round(matchCount));
  const totalCount = finiteNumber(body.totalCount);
  return totalCount === null ? body.data.length : Math.max(0, Math.round(totalCount));
}

async function fetchAllPages(urlFactory, fetchImpl = fetch) {
  const rows = [];
  let page = 1;
  let targetCount = null;
  while (page <= MAX_PAGES) {
    const body = await fetchJsonWithRetry(urlFactory(page), fetchImpl);
    if (targetCount === null) targetCount = responseTargetCount(body);
    rows.push(...body.data);
    if (rows.length >= targetCount || body.data.length === 0 || body.data.length < PAGE_SIZE) break;
    page += 1;
  }
  if (page > MAX_PAGES) throw new ApplyhomeFetchError(`페이지 제한 ${MAX_PAGES}을 초과했습니다.`);
  if (targetCount !== null && rows.length < targetCount) {
    throw new ApplyhomeFetchError(`부분 응답입니다: ${rows.length}/${targetCount}건`);
  }
  return rows;
}

async function workerPool(tasks, concurrency = MAX_MODEL_CONCURRENCY) {
  const results = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await tasks[index]();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, tasks.length)) }, worker));
  return results;
}

async function fetchEndpoint(endpoint, serviceKey, noticeDateFrom, fetchImpl = fetch, normalizeOptions = {}) {
  const rawDetails = await fetchAllPages(
    (page) => buildDetailUrl(endpoint.detail, serviceKey, page, noticeDateFrom),
    fetchImpl,
  );
  const scopedDetails = rawDetails.filter(isTargetRegion);
  const modelCache = new Map();
  const tasks = scopedDetails.map((detail) => async () => {
    const houseManageNo = firstText(detail, ['HOUSE_MANAGE_NO', 'HOUSE_MNGE_NO']);
    const noticeNo = firstText(detail, ['PBLANC_NO', 'RCRIT_PBLANC_NO']);
    if (!houseManageNo) {
      throw new ApplyhomeFetchError(`${endpoint.detail} 공고에 주택관리번호가 없습니다.`, {
        noticeNo: firstText(detail, ['PBLANC_NO']),
      });
    }
    if (!noticeNo) {
      throw new ApplyhomeFetchError(`${endpoint.detail} 공고에 공고번호가 없습니다.`, {
        houseManageNo,
      });
    }
    const modelCacheKey = `${houseManageNo}\u0000${noticeNo}`;
    if (!modelCache.has(modelCacheKey)) {
      modelCache.set(modelCacheKey, fetchAllPages(
        (page) => buildUrl(endpoint.model, serviceKey, page, {
          HOUSE_MANAGE_NO: houseManageNo,
          PBLANC_NO: noticeNo,
        }),
        fetchImpl,
      ).then((rows) => {
        const mismatched = rows.find((row) => {
          const rowHouseManageNo = firstText(row, ['HOUSE_MANAGE_NO', 'HOUSE_MNGE_NO']);
          const rowNoticeNo = firstText(row, ['PBLANC_NO', 'RCRIT_PBLANC_NO']);
          return rowHouseManageNo !== houseManageNo || (rowNoticeNo && rowNoticeNo !== noticeNo);
        });
        if (mismatched) {
          throw new ApplyhomeFetchError(`${endpoint.model}의 공고 필터가 적용되지 않았습니다.`, {
            expectedHouseManageNo: houseManageNo,
            expectedNoticeNo: noticeNo,
          });
        }
        return rows;
      }));
    }
    return modelCache.get(modelCacheKey);
  });
  const modelsByDetail = await workerPool(tasks);
  return {
    notices: scopedDetails.map((detail, index) => normalizeApplyhomeNotice(
      detail,
      endpoint,
      modelsByDetail[index],
      normalizeOptions,
    )),
    coverage: {
      category: endpoint.category,
      label: endpoint.label,
      detailEndpoint: endpoint.detail,
      modelEndpoint: endpoint.model,
      status: 'ok',
      matchedDetailCount: rawDetails.length,
      scopedNoticeCount: scopedDetails.length,
      modelCount: modelsByDetail.reduce((sum, rows) => sum + rows.length, 0),
      modelRequestCount: modelCache.size,
    },
  };
}

function safeApplyhomeSourceError(error, endpoint = null) {
  return {
    source: 'applyhome',
    category: endpoint?.category || null,
    detailEndpoint: endpoint?.detail || null,
    modelEndpoint: endpoint?.model || null,
    code: error instanceof ApplyhomeFetchError ? 'APPLYHOME_FETCH_ERROR' : 'UNEXPECTED_ERROR',
    httpStatus: error instanceof ApplyhomeFetchError ? error.details?.status ?? null : null,
    message: '청약홈 공고 조회에 실패했습니다.',
  };
}

/**
 * Collects ApplyHome independently so the combined collector can retain a
 * healthy LH slice (and vice versa) when only one upstream is unavailable.
 */
export async function collectApplyhomeSupplySource(options = {}) {
  const serviceKey = decodeServiceKey(options.serviceKey);
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(now.getTime())) throw new TypeError('now must be a valid date');
  const generatedAt = options.generatedAt || now.toISOString();
  const today = options.today || seoulDate(now);
  const noticeDateFrom = options.noticeDateFrom || seoulDateMinusDays(DEFAULT_LOOKBACK_DAYS, now);
  const endpointResults = [];
  const errors = [];

  if (!serviceKey) {
    const missing = new ApplyhomeFetchError('청약홈 API 서비스 키가 없습니다.');
    for (const endpoint of APPLYHOME_ENDPOINTS) {
      const error = safeApplyhomeSourceError(missing, endpoint);
      errors.push(error);
      endpointResults.push({
        category: endpoint.category,
        label: endpoint.label,
        detailEndpoint: endpoint.detail,
        modelEndpoint: endpoint.model,
        status: 'error',
      });
    }
  } else {
    const fetchEndpointImpl = options.fetchEndpointImpl || fetchEndpoint;
    for (const endpoint of APPLYHOME_ENDPOINTS) {
      try {
        endpointResults.push(await fetchEndpointImpl(
          endpoint,
          serviceKey,
          noticeDateFrom,
          options.fetchImpl || fetch,
          { generatedAt, today },
        ));
      } catch (error) {
        errors.push(safeApplyhomeSourceError(error, endpoint));
        endpointResults.push({
          notices: [],
          coverage: {
            category: endpoint.category,
            label: endpoint.label,
            detailEndpoint: endpoint.detail,
            modelEndpoint: endpoint.model,
            status: 'error',
          },
        });
      }
    }
  }

  const coverageEntries = endpointResults.map((result) => result.coverage || result);
  const successCount = coverageEntries.filter(({ status }) => status === 'ok').length;
  const status = errors.length === 0 ? 'ok' : successCount > 0 ? 'partial' : 'error';
  const notices = endpointResults.flatMap((result) => result.notices || []);
  return {
    source: 'applyhome',
    label: '한국부동산원 청약홈',
    status,
    generatedAt,
    lastSuccessfulAt: successCount ? generatedAt : null,
    notices,
    coverage: {
      status,
      requestedEndpointCount: APPLYHOME_ENDPOINTS.length,
      successfulEndpointCount: successCount,
      failedEndpointCount: errors.length,
      endpoints: coverageEntries,
      errors,
    },
  };
}

function validatePrevious(previous) {
  if (!previous || typeof previous !== 'object') throw new Error('기존 home-supply.json 루트가 객체가 아닙니다.');
  if (previous.version !== 1 || !Array.isArray(previous.notices)) {
    throw new Error('기존 home-supply.json 스키마를 확인할 수 없습니다.');
  }
  return previous;
}

async function readPreviousSnapshot(filePath = outputPath) {
  try {
    return validatePrevious(JSON.parse(await readFile(filePath, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function changedFields(before, after) {
  const beforeMaterial = materialNotice(before);
  const afterMaterial = materialNotice(after);
  return Object.keys(afterMaterial).filter((field) => (
    JSON.stringify(canonicalize(beforeMaterial[field])) !== JSON.stringify(canonicalize(afterMaterial[field]))
  ));
}

function noticeChangeSummary(notice, extra = {}) {
  return {
    id: notice.id,
    source: notice.source,
    name: notice.name,
    regionName: notice.regionName,
    category: notice.category,
    noticeDate: notice.noticeDate,
    applyStart: notice.schedule?.applyStart ?? notice.applicationStartDate ?? null,
    applyEnd: notice.schedule?.applyEnd ?? notice.applicationEndDate ?? null,
    eligibilityTags: notice.eligibilityTags || [],
    ...extra,
  };
}

export function buildChangeSet(previous, currentNotices, generatedAt, noticeDateFrom, options = {}) {
  const suppressedSources = new Set(options.suppressedSources || []);
  const comparableSources = new Set(options.comparableSources || []);
  if (!Object.prototype.hasOwnProperty.call(options, 'suppressedSources')
    && !Object.prototype.hasOwnProperty.call(options, 'comparableSources')) {
    const knownSources = new Set([
      ...(previous?.notices || []).map(({ source }) => source),
      ...currentNotices.map(({ source }) => source),
    ].filter(Boolean));
    const legacyBaseline = Boolean(previous?.complete && previous?.baseline?.established);
    for (const source of knownSources) {
      (legacyBaseline ? comparableSources : suppressedSources).add(source);
    }
  }
  const previousById = new Map((previous?.notices || []).map((notice) => [notice.id, notice]));
  const currentById = new Map(currentNotices.map((notice) => [notice.id, notice]));
  const added = [];
  const updated = [];
  const removed = [];
  const expiredFromWindow = [];

  const eligibleForDiff = (notice) => (
    comparableSources.has(notice.source)
    && !suppressedSources.has(notice.source)
    && notice.notificationEligible !== false
    && notice.dataStatus !== 'stale'
  );

  for (const notice of currentNotices) {
    if (!eligibleForDiff(notice)) continue;
    const before = previousById.get(notice.id);
    if (!before) added.push(noticeChangeSummary(notice));
    else if (before.fingerprint !== notice.fingerprint) {
      updated.push(noticeChangeSummary(notice, { changedFields: changedFields(before, notice) }));
    }
  }
  for (const notice of previous?.notices || []) {
    if (!comparableSources.has(notice.source)
      || suppressedSources.has(notice.source)
      || notice.notificationEligible === false) continue;
    if (currentById.has(notice.id)) continue;
    const summary = noticeChangeSummary(notice);
    if (notice.noticeDate && notice.noticeDate < noticeDateFrom) expiredFromWindow.push(summary);
    else removed.push(summary);
  }

  const baselineRun = comparableSources.size === 0 && suppressedSources.size > 0;

  return {
    baselineRun,
    reason: baselineRun
      ? 'first_successful_snapshot'
      : suppressedSources.size
        ? 'compared_established_sources_and_suppressed_new_source_baseline'
        : 'compared_with_previous_successful_snapshot',
    suppressedSources: [...suppressedSources].sort(),
    comparedSources: [...comparableSources].sort(),
    comparedToGeneratedAt: previous?.generatedAt || null,
    generatedAt,
    new: added,
    updated,
    removed,
    expiredFromWindow,
    counts: {
      new: added.length,
      updated: updated.length,
      removed: removed.length,
      expiredFromWindow: expiredFromWindow.length,
    },
  };
}

function dedupeNotices(notices) {
  const byId = new Map();
  for (const notice of notices) {
    const commonValid = Boolean(notice.id && notice.source && notice.name);
    const applyhomeValid = notice.source === 'applyhome'
      && notice.houseManageNo && notice.noticeNo && notice.regionName;
    const lhValid = notice.source === 'lh'
      && notice.sourceNoticeId
      && Array.isArray(notice.locations)
      && notice.locations.some(({ sidoCode }) => sidoCode === '11' || sidoCode === '41');
    const shValid = notice.source === 'sh'
      && notice.sourceNoticeId
      && notice.idStability === 'official'
      && Array.isArray(notice.locations)
      && notice.locations.some(({ sidoCode }) => sidoCode === '11');
    if (!commonValid || (!applyhomeValid && !lhValid && !shValid)) {
      throw new ApplyhomeFetchError('필수 식별 필드가 없는 공고가 포함되어 있습니다.', { id: notice.id });
    }
    if (byId.has(notice.id) && byId.get(notice.id).fingerprint !== notice.fingerprint) {
      throw new ApplyhomeFetchError('같은 공고 ID에 서로 다른 내용이 포함되어 있습니다.', { id: notice.id });
    }
    byId.set(notice.id, notice);
  }
  return [...byId.values()].sort((a, b) => {
    const dateOrder = String(b.noticeDate || '').localeCompare(String(a.noticeDate || ''));
    return dateOrder || a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id);
  });
}

function mergeLocationArrays(left = [], right = []) {
  const byKey = new Map();
  for (const location of [...left, ...right]) {
    const key = `${location?.sidoCode || ''}|${location?.regionKey || ''}|${location?.address || ''}`;
    if (!byKey.has(key)) byKey.set(key, location);
  }
  return [...byKey.values()].sort((a, b) => String(a.sidoCode).localeCompare(String(b.sidoCode)));
}

function mergeLhQueryMatches(previousNotice, currentNotice) {
  if (!previousNotice || currentNotice.source !== 'lh') return currentNotice;
  const matchedRegionCodes = [...new Set([
    ...(previousNotice.matchedRegionCodes || []),
    ...(currentNotice.matchedRegionCodes || []),
  ])].filter((code) => code === '11' || code === '41').sort();
  const locations = mergeLocationArrays(previousNotice.locations, currentNotice.locations);
  const regionNames = locations.map(({ sidoCode }) => sidoCode === '11' ? '서울' : '경기');
  const merged = {
    ...currentNotice,
    matchedRegionCodes,
    locations,
    regionCode: matchedRegionCodes.length === 1 ? matchedRegionCodes[0] : '',
    regionName: [...new Set(regionNames)].join('·'),
    region: [...new Set(regionNames)].join('·'),
  };
  merged.fingerprint = fingerprintNotice(merged);
  return merged;
}

function previousNoticesForSource(previous, source) {
  return (previous?.notices || []).filter((notice) => notice.source === source);
}

function reconcileSourceNotices(previous, sourceResult, generatedAt, noticeDateFrom = null) {
  const prior = previousNoticesForSource(previous, sourceResult.source);
  const previousById = new Map(prior.map((notice) => [notice.id, notice]));
  const hasAnySuccess = Boolean(sourceResult.lastSuccessfulAt);
  if (!hasAnySuccess) {
    return prior.map((notice) => ({
      ...notice,
      dataStatus: 'stale',
      stale: true,
      staleSince: notice.staleSince || generatedAt,
    }));
  }

  const fresh = (sourceResult.notices || []).map((notice) => {
    const before = previousById.get(notice.id);
    const withCompleteQueryMatches = sourceResult.status === 'partial'
      ? mergeLhQueryMatches(before, notice)
      : notice;
    return {
      ...withCompleteQueryMatches,
      firstSeenAt: before?.firstSeenAt || generatedAt,
      lastSeenAt: generatedAt,
      fetchedAt: generatedAt,
      dataStatus: 'fresh',
      stale: false,
      staleSince: null,
      notInLatestFeed: false,
    };
  });

  const freshIds = new Set(fresh.map((notice) => notice.id));
  if (sourceResult.status === 'ok' && sourceResult.source === 'sh') {
    // SH publishes a bounded RSS feed without pagination or an advertised
    // retention window. Absence from the latest feed is not proof that a
    // still-relevant notice was withdrawn, so keep previously observed items
    // until they naturally leave our configured lookback window.
    const historical = prior
      .filter((notice) => !freshIds.has(notice.id))
      .filter((notice) => !noticeDateFrom || !notice.noticeDate || notice.noticeDate >= noticeDateFrom)
      .map((notice) => ({
        ...notice,
        dataStatus: 'historical',
        stale: false,
        staleSince: null,
        notInLatestFeed: true,
      }));
    return [...fresh, ...historical];
  }
  if (sourceResult.status === 'ok') return fresh;
  const retained = prior.filter((notice) => !freshIds.has(notice.id)).map((notice) => ({
    ...notice,
    dataStatus: 'stale',
    stale: true,
    staleSince: notice.staleSince || generatedAt,
  }));
  return [...fresh, ...retained];
}

function previousSourceMetadata(previous, sourceId) {
  return (previous?.sources || []).find(({ id }) => id === sourceId) || null;
}

function previousProviderBaseline(previous, sourceId) {
  const explicit = previous?.baseline?.providers?.[sourceId];
  if (explicit && typeof explicit === 'object') return explicit;
  if (sourceId === 'applyhome'
    && previous?.complete === true
    && previous?.baseline?.established === true
    && !previous?.baseline?.providers) {
    return {
      established: true,
      establishedAt: previous.baseline.establishedAt || previous.generatedAt || null,
      lastSuccessfulAt: previous.lastSuccessfulAt || previous.generatedAt || null,
      migratedFromLegacyBaseline: true,
    };
  }
  return { established: false, establishedAt: null, lastSuccessfulAt: null };
}

function buildProviderBaseline(previous, sourceResult, generatedAt) {
  const prior = previousProviderBaseline(previous, sourceResult.source);
  const newlyEstablished = !prior.established && sourceResult.status === 'ok';
  return {
    established: Boolean(prior.established || newlyEstablished),
    establishedAt: prior.establishedAt || (newlyEstablished ? generatedAt : null),
    lastSuccessfulAt: sourceResult.lastSuccessfulAt
      || prior.lastSuccessfulAt
      || previousSourceMetadata(previous, sourceResult.source)?.lastSuccessfulAt
      || null,
  };
}

function countNoticesByRegion(notices, sidoCode) {
  return notices.filter((notice) => (
    Array.isArray(notice.locations)
    && notice.locations.some((location) => location.sidoCode === sidoCode)
  )).length;
}

function sourceSnapshotEntry(previous, result, reconciledNotices) {
  const previousMetadata = previousSourceMetadata(previous, result.source);
  const staleCount = reconciledNotices.filter(({ stale }) => stale === true).length;
  const historicalCount = reconciledNotices.filter(({ dataStatus }) => dataStatus === 'historical').length;
  return {
    id: result.source,
    label: result.label,
    status: result.status,
    collectionStatus: result.status,
    generatedAt: result.lastSuccessfulAt ? result.generatedAt : previousMetadata?.generatedAt || null,
    lastSuccessfulAt: result.lastSuccessfulAt || previousMetadata?.lastSuccessfulAt || null,
    retainedStaleNoticeCount: staleCount,
    retainedHistoricalNoticeCount: historicalCount,
    ...(result.source === 'applyhome'
      ? { endpoints: result.coverage?.endpoints || [] }
      : result.source === 'lh'
        ? { queries: result.coverage?.queries || [] }
        : { feeds: result.coverage?.feeds || [] }),
    coverage: result.coverage,
  };
}

async function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

export async function collectHomeSupply(options = {}) {
  const lookbackDays = Math.round(Math.max(30, Math.min(
    finiteNumber(options.lookbackDays ?? process.env.HOME_SUPPLY_LOOKBACK_DAYS) || DEFAULT_LOOKBACK_DAYS,
    3650,
  )));
  const now = options.now || new Date();
  const generatedAt = now.toISOString();
  const today = seoulDate(now);
  const noticeDateFrom = seoulDateMinusDays(lookbackDays, now);
  const previous = Object.prototype.hasOwnProperty.call(options, 'previous')
    ? options.previous
    : await readPreviousSnapshot(options.outputPath || outputPath);
  const sharedServiceKey = options.serviceKey ?? process.env.DATA_GO_KR_SERVICE_KEY;
  const applyhomeServiceKey = decodeServiceKey(
    options.applyhomeServiceKey ?? process.env.APPLYHOME_SERVICE_KEY ?? sharedServiceKey,
  );
  const lhServiceKey = decodeServiceKey(
    options.lhServiceKey
      ?? process.env.LH_SUPPLY_SERVICE_KEY
      ?? sharedServiceKey
      ?? process.env.APPLYHOME_SERVICE_KEY,
  );
  const collectApplyhomeSourceImpl = options.collectApplyhomeSourceImpl || collectApplyhomeSupplySource;
  const collectLhSourceImpl = options.collectLhSourceImpl || collectLhSupplySource;
  const collectShSourceImpl = options.collectShSourceImpl || collectShSupplySource;

  const [applyhomeResult, lhResult, shResult] = await Promise.all([
    Promise.resolve().then(() => collectApplyhomeSourceImpl({
      serviceKey: applyhomeServiceKey,
      noticeDateFrom,
      fetchImpl: options.fetchImpl || fetch,
      now,
      generatedAt,
      today,
    })).catch((error) => ({
      source: 'applyhome',
      label: '한국부동산원 청약홈',
      status: 'error',
      generatedAt,
      lastSuccessfulAt: null,
      notices: [],
      coverage: {
        status: 'error',
        requestedEndpointCount: APPLYHOME_ENDPOINTS.length,
        successfulEndpointCount: 0,
        failedEndpointCount: APPLYHOME_ENDPOINTS.length,
        endpoints: APPLYHOME_ENDPOINTS.map((endpoint) => ({
          category: endpoint.category,
          label: endpoint.label,
          detailEndpoint: endpoint.detail,
          modelEndpoint: endpoint.model,
          status: 'error',
        })),
        errors: [safeApplyhomeSourceError(error)],
      },
    })),
    Promise.resolve().then(() => collectLhSourceImpl({
      serviceKey: lhServiceKey,
      fromDate: noticeDateFrom,
      toDate: today,
      includeRental: options.includeLhRental === true,
      fetchImpl: options.fetchImpl || fetch,
      now,
    })).catch((error) => ({
      source: 'lh',
      label: '한국토지주택공사 청약플러스',
      status: 'error',
      generatedAt,
      lastSuccessfulAt: null,
      notices: [],
      coverage: {
        status: 'error',
        requestedQueryCount: 4,
        successfulQueryCount: 0,
        failedQueryCount: 4,
        requestCount: 0,
        typeCodes: ['05', '39'],
        regionCodes: ['11', '41'],
        includeRental: false,
        queries: [],
        errors: [{ source: 'lh', code: 'UNEXPECTED_ERROR', message: 'LH 공고 조회에 실패했습니다.' }],
      },
    })),
    Promise.resolve().then(() => collectShSourceImpl({
      fetchImpl: options.fetchImpl || fetch,
      now,
    })).catch(() => ({
      source: 'sh',
      label: '서울주택도시개발공사',
      status: 'error',
      generatedAt,
      lastSuccessfulAt: null,
      notices: [],
      coverage: {
        status: 'error',
        requestedFeedCount: 1,
        successfulFeedCount: 0,
        failedFeedCount: 1,
        requestCount: 0,
        feeds: [{ url: SH_RSS_URL, status: 'error' }],
        errors: [{ source: 'sh', code: 'UNEXPECTED_ERROR', message: 'SH 공식 RSS 조회에 실패했습니다.' }],
      },
    })),
  ]);
  const sourceResults = [applyhomeResult, lhResult, shResult];
  const successfulSources = sourceResults.filter(({ lastSuccessfulAt }) => Boolean(lastSuccessfulAt));
  if (!successfulSources.length) {
    throw new ApplyhomeFetchError(
      '청약홈·LH·SH 공식 공고를 모두 갱신하지 못했습니다. 기존 저장본은 그대로 보존했습니다.',
      { sourceStatuses: sourceResults.map(({ source, status }) => ({ source, status })) },
    );
  }

  const reconciledBySource = new Map(sourceResults.map((result) => [
    result.source,
    reconcileSourceNotices(previous, result, generatedAt, noticeDateFrom),
  ]));
  const notices = dedupeNotices([...reconciledBySource.values()].flat());
  const providerBaselines = Object.fromEntries(sourceResults.map((result) => [
    result.source,
    buildProviderBaseline(previous, result, generatedAt),
  ]));
  const suppressedSources = sourceResults
    .filter((result) => result.lastSuccessfulAt && !previousProviderBaseline(previous, result.source).established)
    .map(({ source }) => source);
  const comparableSources = sourceResults
    .filter((result) => result.lastSuccessfulAt && previousProviderBaseline(previous, result.source).established)
    .map(({ source }) => source);
  const changes = buildChangeSet(previous, notices, generatedAt, noticeDateFrom, {
    suppressedSources,
    comparableSources,
  });
  const complete = sourceResults.every(({ status }) => status === 'ok');
  const sources = sourceResults.map((result) => sourceSnapshotEntry(
    previous,
    result,
    reconciledBySource.get(result.source),
  ));
  const errors = sourceResults.flatMap((result) => result.coverage?.errors || []);
  const staleNoticeCount = notices.filter(({ stale }) => stale === true).length;
  const snapshot = {
    schemaVersion: 1,
    version: 1,
    status: complete ? 'ok' : 'partial',
    complete,
    source: '청약홈·LH·SH 공식 분양정보 통합',
    sourceType: 'official',
    sources,
    generatedAt,
    lastSuccessfulAt: generatedAt,
    lastCompleteAt: complete
      ? generatedAt
      : previous?.lastCompleteAt || (previous?.complete ? previous.generatedAt : null),
    query: {
      noticeDateFrom,
      lookbackDays,
      regions: [...TARGET_REGIONS],
      categories: [
        ...APPLYHOME_ENDPOINTS.map(({ category, label }) => ({ source: 'applyhome', category, label })),
        { source: 'lh', category: 'lh-sale', label: 'LH 분양주택', providerTypeCode: '05' },
        { source: 'lh', category: 'lh-newlywed-town', label: 'LH 신혼희망타운', providerTypeCode: '39' },
        { source: 'sh', category: 'sh-housing-sale', label: 'SH 주택분양 공식 RSS' },
      ],
      exclusions: [{ source: 'lh', providerTypeCode: '06', reason: '임대주택은 분양 목록에서 제외' }],
    },
    coverage: {
      status: complete ? 'complete' : 'partial',
      totalNotices: notices.length,
      freshNoticeCount: notices.length - staleNoticeCount,
      staleNoticeCount,
      byRegion: {
        서울: countNoticesByRegion(notices, '11'),
        경기: countNoticesByRegion(notices, '41'),
      },
      endpoints: applyhomeResult.coverage?.endpoints || [],
      sourceCoverage: Object.fromEntries(sourceResults.map((result) => [result.source, result.coverage])),
      errors,
    },
    baseline: {
      established: Object.values(providerBaselines).every(({ established }) => established),
      establishedAt: Object.values(providerBaselines).every(({ established }) => established)
        ? previous?.baseline?.establishedAt || generatedAt
        : null,
      suppressInitialNotifications: suppressedSources.length > 0,
      providers: providerBaselines,
    },
    changes,
    notices,
  };

  if (options.write !== false) await atomicWriteJson(options.outputPath || outputPath, snapshot);
  return snapshot;
}

async function main() {
  const snapshot = await collectHomeSupply();
  const counts = snapshot.changes.counts;
  process.stdout.write(
    `Saved ${snapshot.notices.length} Seoul/Gyeonggi notices. `
    + `Changes: +${counts.new} ~${counts.updated} -${counts.removed}; `
    + `${snapshot.changes.baselineRun ? 'baseline established' : 'compared with previous snapshot'}.\n`,
  );
}

if (path.resolve(process.argv[1] || '') === path.resolve(scriptPath)) {
  main().catch((error) => {
    const detail = error instanceof ApplyhomeFetchError ? error.message : String(error?.message || error);
    process.stderr.write(`Home supply collection failed; previous data was preserved. ${detail}\n`);
    process.exitCode = 1;
  });
}
