import { createHash } from 'node:crypto';

import {
  LH_NOTICE_TYPE_CODES,
  LH_REGION_CODES,
  LhSupplyProviderError,
  fetchLhSupplyNotices,
} from './lh-supply-provider.mjs';

export const LH_HOME_SUPPLY_TYPE_CODES = Object.freeze([
  LH_NOTICE_TYPE_CODES.sale,
  LH_NOTICE_TYPE_CODES.newlywedTown,
]);

const TYPE_PRESENTATION = Object.freeze({
  '05': { category: 'lh-sale', categoryLabel: 'LH 분양주택', program: 'public-sale' },
  '06': { category: 'lh-rental', categoryLabel: 'LH 임대주택', program: 'public-rent' },
  '39': { category: 'lh-newlywed-town', categoryLabel: 'LH 신혼희망타운', program: 'newlywed-town' },
});

function cleanText(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function regionForCode(code) {
  if (code === LH_REGION_CODES.seoul) {
    return { regionKey: 'seoul', sidoCode: '11', sido: '서울특별시' };
  }
  if (code === LH_REGION_CODES.gyeonggi) {
    return { regionKey: 'gyeonggi', sidoCode: '41', sido: '경기도' };
  }
  return { regionKey: 'other', sidoCode: cleanText(code), sido: '' };
}

function locationForCode(code) {
  return {
    ...regionForCode(code),
    district: '',
    address: '',
    lat: null,
    lng: null,
    coordinateAccuracy: 'none',
    // LH 목록 API의 CNP_CD 필터 일치값이며 실제 공급 주소가 아니다.
    locationScope: 'query-match',
  };
}

function tenureForNotice(typeCode, subcategory) {
  if (typeCode === LH_NOTICE_TYPE_CODES.sale) return 'sale';
  if (typeCode === LH_NOTICE_TYPE_CODES.rental) return 'rent';
  if (/임대|행복주택/.test(subcategory)) return 'rent';
  if (/분양/.test(subcategory)) return 'sale';
  return 'unknown';
}

function statusFromProvider(value) {
  const status = cleanText(value);
  if (/접수마감|공고마감|종료/.test(status)) return 'closed';
  if (/접수중/.test(status)) return 'open';
  if (/취소|중단|철회/.test(status)) return 'cancelled';
  return 'unknown';
}

function uniqueRegionCodes(notice) {
  const values = Array.isArray(notice?.matchedRegionCodes) ? notice.matchedRegionCodes : [];
  const fallback = cleanText(notice?.regionCode);
  return [...new Set([...values, fallback].map(cleanText).filter((code) => (
    code === LH_REGION_CODES.seoul || code === LH_REGION_CODES.gyeonggi
  )))].sort();
}

function materialNotice(notice) {
  return {
    source: notice.source,
    sourceNoticeId: notice.sourceNoticeId,
    idStability: notice.idStability,
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

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function fingerprintLhSupplyNotice(notice) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(materialNotice(notice))))
    .digest('hex');
}

export function normalizeLhNoticeForHomeSupply(value = {}, options = {}) {
  const sourceNoticeId = cleanText(value.sourceNoticeId);
  const id = cleanText(value.id) || (sourceNoticeId ? `lh:${sourceNoticeId}` : '');
  if (!id || !sourceNoticeId) throw new TypeError('LH notice requires a stable source notice id');
  const typeCode = cleanText(value.categoryCode);
  const presentation = TYPE_PRESENTATION[typeCode];
  if (!presentation) throw new RangeError(`Unsupported LH notice type code: ${typeCode || '(empty)'}`);
  const matchedRegionCodes = uniqueRegionCodes(value);
  if (!matchedRegionCodes.length) throw new TypeError('LH notice requires a Seoul or Gyeonggi query match');

  const generatedAt = cleanText(options.generatedAt) || new Date().toISOString();
  const name = cleanText(value.name) || '제목 없는 LH 공고';
  const subcategory = cleanText(value.subcategory);
  const officialNewlywedTown = typeCode === LH_NOTICE_TYPE_CODES.newlywedTown;
  const keywordCandidate = !officialNewlywedTown && cleanText(value.newlywedClassification) === 'keyword-candidate';
  const noticeDate = cleanText(value.noticeDate) || null;
  const closeDate = cleanText(value.closeDate) || null;
  const locations = matchedRegionCodes.map(locationForCode);
  const regionNames = locations.map(({ regionKey }) => regionKey === 'seoul' ? '서울' : '경기');
  const schedule = {
    applyStart: null,
    applyEnd: null,
    specialApplyStart: null,
    specialApplyEnd: null,
    firstPriorityApplyStart: null,
    firstPriorityApplyEnd: null,
    secondPriorityApplyStart: null,
    secondPriorityApplyEnd: null,
    winnerAnnouncementDate: null,
    contractStart: null,
    contractEnd: null,
    noticeOpenDate: noticeDate,
    noticeCloseDate: closeDate,
  };
  const notice = {
    id,
    source: 'lh',
    sourceLabel: '한국토지주택공사 청약플러스',
    sourceNoticeId,
    idStability: cleanText(value.idStability) || 'derived',
    notificationEligible: cleanText(value.idStability) === 'official',
    category: presentation.category,
    categoryLabel: presentation.categoryLabel,
    title: name,
    name,
    address: '',
    supplyLocation: '',
    regionCode: matchedRegionCodes.length === 1 ? matchedRegionCodes[0] : '',
    regionName: regionNames.join('·'),
    region: regionNames.join('·'),
    district: '',
    matchedRegionCodes,
    locations,
    houseManageNo: '',
    noticeNo: '',
    houseTypeCode: '',
    houseTypeName: '',
    houseDetailTypeCode: '',
    houseDetailTypeName: subcategory,
    rentTypeCode: '',
    rentTypeName: tenureForNotice(typeCode, subcategory) === 'rent' ? '임대' : '',
    publisherName: '한국토지주택공사',
    providerStatus: cleanText(value.status),
    status: statusFromProvider(value.status),
    noticeDate,
    announcementDate: noticeDate,
    closeDate,
    moveInExpected: '',
    moveInPlanned: '',
    schedule,
    schedules: noticeDate || closeDate ? [{
      kind: 'notice-window',
      label: 'LH 공고기간',
      startDate: noticeDate || closeDate,
      endDate: closeDate || noticeDate,
    }] : [],
    applicationStartDate: null,
    applicationEndDate: null,
    program: presentation.program,
    tenure: tenureForNotice(typeCode, subcategory),
    totalSupplyUnits: null,
    totalUnits: null,
    newlywedUnits: null,
    newbornUnits: null,
    newlywedSupplyAvailable: officialNewlywedTown ? true : null,
    newlywedClassification: officialNewlywedTown
      ? 'structured-type'
      : keywordCandidate ? 'keyword-candidate' : 'none',
    eligibilityTags: officialNewlywedTown ? ['신혼희망타운'] : [],
    targetGroups: officialNewlywedTown ? ['신혼부부'] : [],
    eligibilityRequiresCheck: officialNewlywedTown,
    specialSupply: {
      newlywedUnits: null,
      newbornUnits: null,
      firstHomeUnits: null,
      youthUnits: null,
      multiChildUnits: null,
      elderlyParentUnits: null,
      institutionRecommendedUnits: null,
      totalUnits: null,
    },
    price: {
      lowestModelTopAmountManWon: null,
      highestModelTopAmountManWon: null,
    },
    models: [],
    homes: [],
    minAreaM2: null,
    maxAreaM2: null,
    maxPriceManWon: null,
    officialUrl: cleanText(value.officialUrl) || 'https://apply.lh.or.kr/',
    sourceUrl: cleanText(value.officialUrl) || 'https://apply.lh.or.kr/',
    homepageUrl: 'https://apply.lh.or.kr/',
    developer: '한국토지주택공사',
    builder: '',
    contact: '',
    subcategory,
    supplyInfoTypeCode: cleanText(value.supplyInfoTypeCode),
    connectionSystemCode: cleanText(value.connectionSystemCode),
    fetchedAt: generatedAt,
    firstSeenAt: generatedAt,
    lastSeenAt: generatedAt,
  };
  notice.fingerprint = fingerprintLhSupplyNotice(notice);
  return notice;
}

function mergeLocations(left, right) {
  const locations = [...left, ...right];
  const seen = new Set();
  return locations.filter((location) => {
    const key = `${location.sidoCode}|${location.regionKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.sidoCode.localeCompare(b.sidoCode));
}

function mergeNotices(existing, incoming) {
  if (!existing) return incoming;
  const matchedRegionCodes = [...new Set([
    ...existing.matchedRegionCodes,
    ...incoming.matchedRegionCodes,
  ])].sort();
  const locations = mergeLocations(existing.locations, incoming.locations);
  const regionNames = locations.map(({ regionKey }) => regionKey === 'seoul' ? '서울' : '경기');
  const merged = {
    ...existing,
    matchedRegionCodes,
    locations,
    regionCode: matchedRegionCodes.length === 1 ? matchedRegionCodes[0] : '',
    regionName: regionNames.join('·'),
    region: regionNames.join('·'),
  };
  merged.fingerprint = fingerprintLhSupplyNotice(merged);
  return merged;
}

function safeSourceError(error, typeCode, regionCode) {
  return {
    source: 'lh',
    typeCode,
    regionCode,
    code: error instanceof LhSupplyProviderError ? error.code : 'UNEXPECTED_ERROR',
    httpStatus: error instanceof LhSupplyProviderError ? error.httpStatus : null,
    message: 'LH 공고 조회에 실패했습니다.',
  };
}

export async function collectLhSupplySource(options = {}) {
  const includeRental = options.includeRental === true;
  const typeCodes = options.typeCodes || (includeRental
    ? [...LH_HOME_SUPPLY_TYPE_CODES, LH_NOTICE_TYPE_CODES.rental]
    : [...LH_HOME_SUPPLY_TYPE_CODES]);
  const regionCodes = options.regionCodes || Object.values(LH_REGION_CODES);
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(now.getTime())) throw new TypeError('now must be a valid date');
  const generatedAt = now.toISOString();
  const fetchNoticesImpl = options.fetchNoticesImpl || fetchLhSupplyNotices;
  if (typeof fetchNoticesImpl !== 'function') throw new TypeError('fetchNoticesImpl must be a function');
  const byId = new Map();
  const queries = [];
  const errors = [];
  let requestCount = 0;

  for (const typeCode of typeCodes) {
    for (const regionCode of regionCodes) {
      try {
        const result = await fetchNoticesImpl({
          serviceKey: options.serviceKey,
          fromDate: options.fromDate,
          toDate: options.toDate,
          typeCodes: [typeCode],
          regionCodes: [regionCode],
          pageSize: options.pageSize,
          maxPagesPerQuery: options.maxPagesPerQuery,
          noticeName: options.noticeName,
          status: options.providerStatus,
          endpoint: options.endpoint,
          timeoutMs: options.timeoutMs,
          fetchImpl: options.fetchImpl,
          now,
          signal: options.signal,
        });
        requestCount += Number(result.requestCount) || 0;
        queries.push(...(result.queries || []).map((query) => ({ ...query, status: 'ok' })));
        for (const value of result.notices || []) {
          const notice = normalizeLhNoticeForHomeSupply(value, { generatedAt });
          byId.set(notice.id, mergeNotices(byId.get(notice.id), notice));
        }
      } catch (error) {
        errors.push(safeSourceError(error, typeCode, regionCode));
        queries.push({ typeCode, regionCode, status: 'error', pages: 0, rawCount: 0, reportedTotal: null });
      }
    }
  }

  const notices = [...byId.values()].sort((a, b) => (
    String(b.noticeDate || '').localeCompare(String(a.noticeDate || ''))
    || a.name.localeCompare(b.name, 'ko')
    || a.id.localeCompare(b.id)
  ));
  const successCount = queries.filter(({ status }) => status === 'ok').length;
  const status = errors.length === 0 ? 'ok' : successCount > 0 ? 'partial' : 'error';

  return {
    source: 'lh',
    label: '한국토지주택공사 청약플러스',
    status,
    generatedAt,
    lastSuccessfulAt: successCount ? generatedAt : null,
    notices,
    coverage: {
      status,
      requestedQueryCount: typeCodes.length * regionCodes.length,
      successfulQueryCount: successCount,
      failedQueryCount: errors.length,
      requestCount,
      typeCodes: [...typeCodes],
      regionCodes: [...regionCodes],
      includeRental,
      queries,
      errors,
    },
  };
}
