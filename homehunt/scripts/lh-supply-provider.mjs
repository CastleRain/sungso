export const LH_SUPPLY_NOTICE_ENDPOINT =
  'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1';

export const LH_NOTICE_TYPE_CODES = Object.freeze({
  sale: '05',
  rental: '06',
  newlywedTown: '39',
});

export const LH_REGION_CODES = Object.freeze({
  seoul: '11',
  gyeonggi: '41',
});

const ALLOWED_TYPE_CODES = new Set(Object.values(LH_NOTICE_TYPE_CODES));
const ALLOWED_REGION_CODES = new Set(Object.values(LH_REGION_CODES));
const CATEGORY_BY_CODE = Object.freeze({
  '05': 'sale',
  '06': 'rental',
  '39': 'newlywed-town',
});

export class LhSupplyProviderError extends Error {
  constructor(message, {
    code = 'LH_PROVIDER_ERROR',
    httpStatus = null,
    query = null,
  } = {}) {
    super(message);
    this.name = 'LhSupplyProviderError';
    this.provider = 'lh';
    this.code = code;
    this.httpStatus = httpStatus;
    this.query = query;
  }

  toJSON() {
    return {
      name: this.name,
      provider: this.provider,
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      query: this.query,
    };
  }
}

function requiredCredential(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    throw new LhSupplyProviderError('LH 공공데이터 서비스 키가 필요합니다.', {
      code: 'MISSING_CREDENTIAL',
    });
  }

  // 공공데이터포털은 인코딩/디코딩 키를 모두 보여준다. URLSearchParams가
  // 정확히 한 번 인코딩하도록, 이미 인코딩된 키는 먼저 한 번만 푼다.
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function positiveInteger(value, label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new RangeError(`${label} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

function normalizeCodeList(values, allowed, label, defaults) {
  const source = values === undefined ? defaults : values;
  if (!Array.isArray(source) || !source.length) throw new TypeError(`${label} must be a non-empty array`);
  const normalized = [...new Set(source.map((value) => String(value || '').trim()))];
  const invalid = normalized.find((value) => !allowed.has(value));
  if (invalid) throw new RangeError(`Unsupported ${label}: ${invalid}`);
  return normalized;
}

function isRealDate(year, month, day) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year
    && value.getUTCMonth() === month - 1
    && value.getUTCDate() === day;
}

export function normalizeLhDate(value, label = 'date') {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const match = /^(\d{4})[-./]?(\d{2})[-./]?(\d{2})$/.exec(String(value || '').trim());
  if (!match) throw new TypeError(`${label} must use YYYY-MM-DD, YYYY.MM.DD, or YYYYMMDD`);
  const [year, month, day] = match.slice(1).map(Number);
  if (!isRealDate(year, month, day)) throw new RangeError(`${label} is not a valid calendar date`);
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function providerDate(value) {
  return normalizeLhDate(value).replaceAll('-', '.');
}

function safeText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function optionalText(value) {
  const text = safeText(value);
  return text || null;
}

function optionalInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function outputDate(value) {
  if (value === null || value === undefined || value === '') return null;
  try {
    return normalizeLhDate(value);
  } catch {
    return null;
  }
}

function safeOfficialUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function noticeIdFromUrl(value) {
  try {
    const url = new URL(value);
    const parameters = url.searchParams.get('gv_param') || '';
    return /(?:^|,)PAN_ID:([^,]+)/i.exec(parameters)?.[1] || null;
  } catch {
    return null;
  }
}

function stableDerivedId(parts) {
  const value = parts.map((part) => safeText(part).normalize('NFKC').toLowerCase()).join('\u0000');
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `derived-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function queryMetadata(typeCode, regionCode, page) {
  return { typeCode, regionCode, page };
}

export function buildLhSupplyNoticeRequest({
  serviceKey,
  fromDate,
  toDate,
  typeCode,
  regionCode,
  page = 1,
  pageSize = 100,
  noticeName,
  status,
  endpoint = LH_SUPPLY_NOTICE_ENDPOINT,
}) {
  const key = requiredCredential(serviceKey);
  const normalizedType = String(typeCode || '').trim();
  const normalizedRegion = String(regionCode || '').trim();
  if (!ALLOWED_TYPE_CODES.has(normalizedType)) {
    throw new RangeError(`Unsupported LH notice type code: ${normalizedType || '(empty)'}`);
  }
  if (!ALLOWED_REGION_CODES.has(normalizedRegion)) {
    throw new RangeError(`Unsupported LH region code: ${normalizedRegion || '(empty)'}`);
  }
  const normalizedFrom = normalizeLhDate(fromDate, 'fromDate');
  const normalizedTo = normalizeLhDate(toDate, 'toDate');
  if (normalizedFrom > normalizedTo) throw new RangeError('fromDate must not be later than toDate');
  const normalizedPage = positiveInteger(page, 'page');
  const normalizedPageSize = positiveInteger(pageSize, 'pageSize', { max: 100 });

  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new TypeError('endpoint must be a valid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError('endpoint must use HTTP or HTTPS');
  }

  url.searchParams.set('ServiceKey', key);
  url.searchParams.set('PG_SZ', String(normalizedPageSize));
  url.searchParams.set('PAGE', String(normalizedPage));
  if (safeText(noticeName)) url.searchParams.set('PAN_NM', safeText(noticeName));
  url.searchParams.set('UPP_AIS_TP_CD', normalizedType);
  url.searchParams.set('CNP_CD', normalizedRegion);
  if (safeText(status)) url.searchParams.set('PAN_SS', safeText(status));
  // 명세의 두 필드는 이름과 달리 조회 범위의 시작일·종료일로 사용된다.
  url.searchParams.set('PAN_NT_ST_DT', providerDate(normalizedFrom));
  url.searchParams.set('CLSG_DT', providerDate(normalizedTo));

  return {
    url: url.toString(),
    init: {
      method: 'GET',
      headers: { accept: 'application/json' },
    },
  };
}

function payloadParts(payload) {
  return Array.isArray(payload) ? payload : [payload];
}

function firstGatewayHeader(payload) {
  const candidates = [
    payload?.response?.header,
    payload?.header,
    ...payloadParts(payload).flatMap((part) => Array.isArray(part?.resHeader) ? part.resHeader : []),
  ];
  return candidates.find((candidate) => candidate && typeof candidate === 'object') || null;
}

function extractRows(payload) {
  return payloadParts(payload).flatMap((part) => {
    if (Array.isArray(part?.dsList)) return part.dsList;
    if (Array.isArray(part?.response?.body?.items?.item)) return part.response.body.items.item;
    if (part?.response?.body?.items?.item && typeof part.response.body.items.item === 'object') {
      return [part.response.body.items.item];
    }
    return [];
  }).filter((row) => row && typeof row === 'object' && !Array.isArray(row));
}

function validateProviderHeader(header, query) {
  if (!header) return;
  const gatewayCode = safeText(header.resultCode);
  if (gatewayCode && gatewayCode !== '00') {
    throw new LhSupplyProviderError('LH 공공데이터 API가 요청을 처리하지 못했습니다.', {
      code: 'UPSTREAM_ERROR',
      query,
    });
  }
  const providerCode = safeText(header.SS_CODE);
  if (providerCode && providerCode.toUpperCase() !== 'Y') {
    throw new LhSupplyProviderError('LH 공고 조회 결과가 정상 상태가 아닙니다.', {
      code: 'UPSTREAM_ERROR',
      query,
    });
  }
}

function normalizeNotice(row, { requestedTypeCode, requestedRegionCode }) {
  const categoryCode = optionalText(row.UPP_AIS_TP_CD) || requestedTypeCode;
  const rawRegionCode = optionalText(row.CNP_CD);
  const regionCode = rawRegionCode || requestedRegionCode;
  const officialUrl = safeOfficialUrl(row.DTL_URL);
  const noticeDate = outputDate(row.PAN_NT_ST_DT);
  const closeDate = outputDate(row.CLSG_DT);
  const name = optionalText(row.PAN_NM) || '제목 없는 LH 공고';
  const officialNoticeId = optionalText(row.PAN_ID) || noticeIdFromUrl(officialUrl);
  // RNUM은 페이지 정렬에 따라 달라지므로 대체 ID에 절대 포함하지 않는다.
  const sourceNoticeId = officialNoticeId || stableDerivedId([
    categoryCode,
    row.CNP_CD || row.CNP_CD_NM,
    noticeDate,
    name,
    officialUrl,
  ]);
  const categoryName = optionalText(row.UPP_AIS_TP_NM);
  const subcategory = optionalText(row.AIS_TP_CD_NM);
  const keywordNewlywed = /신혼|신생아/.test(`${name} ${categoryName || ''} ${subcategory || ''}`);
  const isNewlywedTown = categoryCode === LH_NOTICE_TYPE_CODES.newlywedTown
    || /신혼희망타운/.test(`${name} ${categoryName || ''} ${subcategory || ''}`);

  return {
    id: `lh:${sourceNoticeId}`,
    source: 'lh',
    sourceNoticeId,
    idStability: officialNoticeId ? 'official' : 'derived',
    category: CATEGORY_BY_CODE[categoryCode] || 'other',
    categoryCode,
    categoryName,
    subcategory,
    subcategoryCode: optionalText(row.AIS_TP_CD),
    supplyInfoTypeCode: optionalText(row.SPL_INF_TP_CD),
    name,
    address: null,
    supplyLocation: null,
    regionCode,
    regionName: optionalText(row.CNP_CD_NM),
    matchedRegionCodes: [requestedRegionCode],
    status: optionalText(row.PAN_SS),
    noticeDate,
    closeDate,
    applyStart: null,
    applyEnd: null,
    officialUrl,
    isNewlywedTown,
    isNewlywedRelevant: isNewlywedTown || keywordNewlywed,
    newlywedClassification: isNewlywedTown
      ? 'structured-type'
      : keywordNewlywed ? 'keyword-candidate' : 'none',
    connectionSystemCode: optionalText(row.CCR_CNNT_SYS_DS_CD),
    rowNumber: optionalInteger(row.RNUM),
    totalCount: optionalInteger(row.ALL_CNT),
    raw: { ...row },
  };
}

function matchesQuery(notice, requestedTypeCode, requestedRegionCode) {
  const rawType = optionalText(notice.raw.UPP_AIS_TP_CD);
  if (rawType && rawType !== requestedTypeCode) return false;
  const rawRegion = optionalText(notice.raw.CNP_CD);
  if (rawRegion && ALLOWED_REGION_CODES.has(rawRegion) && rawRegion !== requestedRegionCode) return false;
  if (rawRegion && !ALLOWED_REGION_CODES.has(rawRegion)) return false;

  const regionName = safeText(notice.regionName).replaceAll(' ', '');
  if (!rawRegion && regionName && !/전국/.test(regionName)) {
    if (requestedRegionCode === LH_REGION_CODES.seoul && !/서울/.test(regionName)) return false;
    if (requestedRegionCode === LH_REGION_CODES.gyeonggi && !/경기/.test(regionName)) return false;
  }
  return true;
}

export function normalizeLhSupplyPayload(payload, {
  requestedTypeCode,
  requestedRegionCode,
  page = 1,
} = {}) {
  const typeCode = String(requestedTypeCode || '').trim();
  const regionCode = String(requestedRegionCode || '').trim();
  const query = queryMetadata(typeCode, regionCode, page);
  const header = firstGatewayHeader(payload);
  const rows = extractRows(payload);
  validateProviderHeader(header, query);
  if (!header && !rows.length && payload !== null && payload !== undefined) {
    const hasKnownEnvelope = payloadParts(payload).some((part) => Array.isArray(part?.dsList));
    if (!hasKnownEnvelope) {
      throw new LhSupplyProviderError('LH 공고 응답 형식을 확인할 수 없습니다.', {
        code: 'INVALID_RESPONSE',
        query,
      });
    }
  }

  const allNotices = rows.map((row) => normalizeNotice(row, {
    requestedTypeCode: typeCode,
    requestedRegionCode: regionCode,
  }));
  const notices = allNotices.filter((notice) => matchesQuery(notice, typeCode, regionCode));
  const reportedCounts = rows.map((row) => optionalInteger(row.ALL_CNT)).filter((value) => value !== null);
  const bodyCount = optionalInteger(payload?.response?.body?.totalCount);
  // ALL_CNT가 없는 변형 응답에서는 현재 페이지 길이를 전체 건수로 오인하지
  // 않는다. 호출부가 짧은 페이지나 빈 다음 페이지를 만날 때까지 이어간다.
  const totalCount = bodyCount ?? (reportedCounts.length ? Math.max(...reportedCounts) : null);

  return {
    responseCode: optionalText(header?.SS_CODE ?? header?.resultCode) || null,
    responseAt: optionalText(header?.RS_DTTM) || null,
    totalCount,
    rawCount: rows.length,
    notices,
  };
}

async function requestJson(request, {
  fetchImpl,
  timeoutMs,
  externalSignal,
  query,
}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener?.('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response;
  try {
    response = await fetchImpl(request.url, { ...request.init, signal: controller.signal });
  } catch {
    const code = timedOut ? 'TIMEOUT' : controller.signal.aborted ? 'ABORTED' : 'NETWORK_ERROR';
    throw new LhSupplyProviderError('LH 공고 API에 연결하지 못했습니다.', { code, query });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener?.('abort', onAbort);
  }

  if (!response || typeof response.json !== 'function') {
    throw new LhSupplyProviderError('LH 공고 API 응답 객체가 올바르지 않습니다.', {
      code: 'INVALID_HTTP_RESPONSE',
      query,
    });
  }
  if (!response.ok) {
    throw new LhSupplyProviderError(`LH 공고 API가 HTTP ${Number(response.status) || 0}을 반환했습니다.`, {
      code: 'HTTP_ERROR',
      httpStatus: Number(response.status) || null,
      query,
    });
  }
  try {
    return await response.json();
  } catch {
    throw new LhSupplyProviderError('LH 공고 API가 유효한 JSON을 반환하지 않았습니다.', {
      code: 'INVALID_JSON',
      query,
    });
  }
}

function mergeNotice(existing, incoming) {
  if (!existing) return incoming;
  return {
    ...existing,
    matchedRegionCodes: [...new Set([
      ...existing.matchedRegionCodes,
      ...incoming.matchedRegionCodes,
    ])].sort(),
  };
}

export async function fetchLhSupplyNotices({
  serviceKey,
  fromDate,
  toDate,
  typeCodes,
  regionCodes,
  pageSize = 100,
  maxPagesPerQuery = 100,
  noticeName,
  status,
  endpoint = LH_SUPPLY_NOTICE_ENDPOINT,
  timeoutMs = 15_000,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  signal,
} = {}) {
  // 요청 전에 모든 값을 검증해 일부 쿼리만 수집된 상태를 만들지 않는다.
  const key = requiredCredential(serviceKey);
  const normalizedFrom = normalizeLhDate(fromDate, 'fromDate');
  const normalizedTo = normalizeLhDate(toDate, 'toDate');
  if (normalizedFrom > normalizedTo) throw new RangeError('fromDate must not be later than toDate');
  const normalizedTypes = normalizeCodeList(
    typeCodes,
    ALLOWED_TYPE_CODES,
    'typeCodes',
    Object.values(LH_NOTICE_TYPE_CODES),
  );
  const normalizedRegions = normalizeCodeList(
    regionCodes,
    ALLOWED_REGION_CODES,
    'regionCodes',
    Object.values(LH_REGION_CODES),
  );
  const normalizedPageSize = positiveInteger(pageSize, 'pageSize', { max: 100 });
  const pageLimit = positiveInteger(maxPagesPerQuery, 'maxPagesPerQuery', { max: 10_000 });
  const normalizedTimeout = positiveInteger(timeoutMs, 'timeoutMs', { max: 120_000 });
  const timestamp = typeof now === 'function' ? Number(now()) : Number(now);
  const queriedAt = new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString();
  const noticesById = new Map();
  const queries = [];
  let requestCount = 0;

  for (const typeCode of normalizedTypes) {
    for (const regionCode of normalizedRegions) {
      let page = 1;
      let reportedTotal = null;
      let fetchedRaw = 0;

      while (true) {
        const query = queryMetadata(typeCode, regionCode, page);
        const request = buildLhSupplyNoticeRequest({
          serviceKey: key,
          fromDate: normalizedFrom,
          toDate: normalizedTo,
          typeCode,
          regionCode,
          page,
          pageSize: normalizedPageSize,
          noticeName,
          status,
          endpoint,
        });
        const payload = await requestJson(request, {
          fetchImpl,
          timeoutMs: normalizedTimeout,
          externalSignal: signal,
          query,
        });
        requestCount += 1;
        const normalized = normalizeLhSupplyPayload(payload, {
          requestedTypeCode: typeCode,
          requestedRegionCode: regionCode,
          page,
        });
        reportedTotal = normalized.totalCount;
        fetchedRaw += normalized.rawCount;
        for (const notice of normalized.notices) {
          noticesById.set(notice.id, mergeNotice(noticesById.get(notice.id), notice));
        }

        const reachedReportedTotal = reportedTotal !== null && fetchedRaw >= reportedTotal;
        const exhaustedPage = normalized.rawCount < normalizedPageSize;
        if (!normalized.rawCount || reachedReportedTotal || exhaustedPage) break;
        if (page >= pageLimit) {
          throw new LhSupplyProviderError('LH 공고 페이지 한도 안에서 전체 결과를 수집하지 못했습니다.', {
            code: 'PAGE_LIMIT',
            query,
          });
        }
        page += 1;
      }

      queries.push({
        typeCode,
        regionCode,
        pages: page,
        rawCount: fetchedRaw,
        reportedTotal,
      });
    }
  }

  const notices = [...noticesById.values()].sort((left, right) => (
    (right.noticeDate || '').localeCompare(left.noticeDate || '')
    || (left.closeDate || '').localeCompare(right.closeDate || '')
    || left.name.localeCompare(right.name, 'ko')
  ));

  return {
    provider: 'lh',
    source: '한국토지주택공사 청약플러스',
    endpoint,
    queriedAt,
    range: { fromDate: normalizedFrom, toDate: normalizedTo },
    typeCodes: normalizedTypes,
    regionCodes: normalizedRegions,
    requestCount,
    queries,
    notices,
  };
}
