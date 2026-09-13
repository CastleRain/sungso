import { createHash } from 'node:crypto';

export const SH_RSS_URL = 'https://www.i-sh.co.kr/main/lay2/program/S1T294C295/www/rss/rssNoticeWrite.do';

const SH_SOURCE_LABEL = '서울주택도시개발공사';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_RSS_ITEMS = 500;
const OFFICIAL_SH_HOST = 'i-sh.co.kr';

export class ShSupplyProviderError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ShSupplyProviderError';
    this.code = details.code || 'SH_RSS_ERROR';
    this.httpStatus = details.httpStatus ?? null;
    this.details = details;
  }
}

function cleanText(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function decodeXmlEntities(value) {
  return String(value ?? '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const named = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
    };
    const lower = entity.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(named, lower)) return named[lower];
    const codePoint = lower.startsWith('#x')
      ? Number.parseInt(lower.slice(2), 16)
      : Number.parseInt(lower.slice(1), 10);
    if (!Number.isInteger(codePoint)
      || codePoint < 0
      || codePoint > 0x10ffff
      || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return '';
    return String.fromCodePoint(codePoint);
  });
}

function unwrapXmlText(value) {
  return decodeXmlEntities(String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
}

function extractElements(xml, tagName, limit = MAX_RSS_ITEMS) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\/${escaped}\\s*>`, 'gi');
  const values = [];
  let match;
  while ((match = expression.exec(xml)) !== null) {
    values.push(match[1]);
    if (values.length > limit) {
      throw new ShSupplyProviderError('SH RSS item 수가 안전 한도를 초과했습니다.', {
        code: 'SH_RSS_ITEM_LIMIT',
      });
    }
  }
  return values;
}

function extractTag(block, tagName) {
  return unwrapXmlText(extractElements(block, tagName, 1)[0] || '');
}

function plainTextFromHtml(value, maximumLength = 900) {
  const plain = decodeXmlEntities(unwrapXmlText(value)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
  const normalized = cleanText(plain);
  return normalized.length > maximumLength ? `${normalized.slice(0, maximumLength - 1)}…` : normalized;
}

export function parseShRssXml(xmlText) {
  const xml = String(xmlText ?? '').replace(/^\uFEFF/, '');
  if (!xml.trim()) {
    throw new ShSupplyProviderError('SH RSS 응답이 비어 있습니다.', { code: 'SH_RSS_EMPTY' });
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new ShSupplyProviderError('외부 엔터티 선언이 포함된 SH RSS는 처리하지 않습니다.', {
      code: 'SH_RSS_UNSAFE_XML',
    });
  }
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml)) {
    throw new ShSupplyProviderError('SH RSS 형식을 확인할 수 없습니다.', { code: 'SH_RSS_INVALID_XML' });
  }
  const items = extractElements(xml, 'item').map((block) => ({
    title: cleanText(extractTag(block, 'title')),
    link: cleanText(extractTag(block, 'link')),
    content: extractTag(block, 'content:encoded'),
    pubDate: cleanText(extractTag(block, 'pubDate')),
  }));
  return { items };
}

function responseCharset(response, bytes) {
  const contentType = String(response?.headers?.get?.('content-type') || '');
  const headerCharset = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1];
  if (headerCharset) return headerCharset;
  const prefix = new TextDecoder('ascii').decode(bytes.slice(0, 200));
  return prefix.match(/encoding\s*=\s*["']([^"']+)["']/i)?.[1] || 'euc-kr';
}

export function decodeShRssBytes(bytes, charset = 'euc-kr') {
  const normalized = cleanText(charset).toLowerCase();
  const encoding = /^(?:utf-?8)$/.test(normalized) ? 'utf-8' : 'euc-kr';
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(bytes);
  } catch (error) {
    throw new ShSupplyProviderError('SH RSS 문자 인코딩을 해석하지 못했습니다.', {
      code: 'SH_RSS_DECODE_ERROR',
      cause: error,
    });
  }
}

function normalizeOfficialShUrl(value) {
  let url;
  try {
    url = new URL(cleanText(value));
  } catch (_) {
    return null;
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (hostname !== OFFICIAL_SH_HOST || !['http:', 'https:'].includes(url.protocol)) return null;
  if (url.username || url.password) return null;
  url.protocol = 'https:';
  url.hostname = 'www.i-sh.co.kr';
  url.port = '';
  url.hash = '';
  return url;
}

function stableSequenceFromUrl(url) {
  const value = cleanText(url?.searchParams?.get('seq'));
  return /^\d{1,20}$/.test(value) ? value : '';
}

function kstDate(value) {
  const parsed = new Date(cleanText(value));
  if (!Number.isFinite(parsed.getTime())) return null;
  const values = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed).filter(({ type }) => type !== 'literal').map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

function classificationText(item) {
  return cleanText(`${item?.title || ''} ${plainTextFromHtml(item?.content || '', 2_000)}`);
}

export function classifyShRssItem(item = {}) {
  const text = classificationText(item);
  const masked = text.replace(/토지\s*임대부/g, '토지임대부');
  const clearlyNotSale = /(?:장기\s*전세|매입\s*임대|공공\s*임대|국민\s*임대|영구\s*임대|행복\s*주택|임대\s*주택|임대\s*상가|주택\s*임대|토지\s*매물|용지|산업단지|상가|주차장|보상|입찰|공모)/.test(masked)
    && !/토지임대부\s*분양주택/.test(masked);
  if (clearlyNotSale) return { include: false, reason: 'non-sale-topic', classification: 'excluded' };

  const resultOrFollowUp = /(?:당첨자|서류\s*심사|심사\s*대상|접수\s*결과|청약\s*결과|경쟁률|추첨\s*결과|동[·\s/]*호|계약\s*체결|예비\s*입주자)/.test(text);
  if (resultOrFollowUp) return { include: false, reason: 'result-or-follow-up', classification: 'excluded' };

  const saleTopic = /(?:분양\s*주택|주택\s*분양|공공\s*분양|나눔형|선택형|토지임대부\s*분양주택)/.test(text);
  const unambiguousNotice = /입주자\s*모집\s*공고/.test(text) && saleTopic;
  const noticeLike = /(?:모집\s*공고|사전\s*예약|사전\s*청약|공급\s*공고)/.test(text) && saleTopic;
  if (!unambiguousNotice && !noticeLike) {
    return { include: false, reason: saleTopic ? 'sale-information-only' : 'unrelated', classification: 'excluded' };
  }
  return {
    include: true,
    reason: null,
    classification: unambiguousNotice ? 'housing-sale-notice' : 'housing-sale-candidate',
    notificationEligible: unambiguousNotice,
    newlywedKeyword: /(?:신혼\s*희망\s*타운|신혼\s*부부|신혼|미리내집)/.test(text),
  };
}

function shMaterialNotice(notice) {
  return {
    source: notice.source,
    sourceNoticeId: notice.sourceNoticeId,
    category: notice.category,
    name: notice.name,
    program: notice.program,
    tenure: notice.tenure,
    locations: notice.locations,
    providerStatus: notice.providerStatus,
    status: notice.status,
    noticeDate: notice.noticeDate,
    schedules: notice.schedules,
    newlywedClassification: notice.newlywedClassification,
    classification: notice.classification,
    notificationEligible: notice.notificationEligible,
    officialUrl: notice.officialUrl,
    summary: notice.summary,
  };
}

export function fingerprintShSupplyNotice(notice) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(shMaterialNotice(notice))))
    .digest('hex');
}

export function normalizeShRssItem(item = {}, options = {}) {
  const classification = classifyShRssItem(item);
  if (!classification.include) return null;
  const official = normalizeOfficialShUrl(item.link);
  const sourceNoticeId = stableSequenceFromUrl(official);
  if (!official || !sourceNoticeId) return null;
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(now.getTime())) throw new TypeError('now must be a valid date');
  const generatedAt = cleanText(options.generatedAt) || now.toISOString();
  const title = cleanText(item.title) || '제목 없는 SH 주택분양 공고';
  const noticeDate = kstDate(item.pubDate);
  const cancelled = /(?:취소|철회|중단)/.test(title);
  const summary = plainTextFromHtml(item.content);
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
    noticeCloseDate: null,
  };
  const notice = {
    id: `sh:${sourceNoticeId}`,
    source: 'sh',
    sourceLabel: SH_SOURCE_LABEL,
    sourceNoticeId,
    idStability: 'official',
    notificationEligible: classification.notificationEligible && !cancelled,
    classification: classification.classification,
    category: 'sh-housing-sale',
    categoryLabel: 'SH 주택분양',
    title,
    name: title,
    address: '',
    supplyLocation: '',
    regionCode: '11',
    regionName: '서울',
    region: '서울',
    district: '',
    locations: [{
      regionKey: 'seoul',
      sidoCode: '11',
      sido: '서울특별시',
      district: '',
      address: '',
      lat: null,
      lng: null,
      coordinateAccuracy: 'none',
      locationScope: 'provider-jurisdiction',
    }],
    houseManageNo: '',
    noticeNo: sourceNoticeId,
    houseTypeCode: '',
    houseTypeName: '',
    houseDetailTypeCode: '',
    houseDetailTypeName: '',
    rentTypeCode: '',
    rentTypeName: '',
    publisherName: SH_SOURCE_LABEL,
    providerStatus: cancelled ? '취소·중단 공고' : classification.notificationEligible ? '공식 RSS 모집공고' : '분양공고 후보',
    status: cancelled ? 'cancelled' : 'unknown',
    noticeDate,
    announcementDate: noticeDate,
    closeDate: null,
    schedule,
    schedules: noticeDate ? [{
      kind: 'notice-published',
      label: 'SH RSS 게시일',
      startDate: noticeDate,
      endDate: noticeDate,
    }] : [],
    applicationStartDate: null,
    applicationEndDate: null,
    program: 'public-sale',
    tenure: 'sale',
    totalSupplyUnits: null,
    totalUnits: null,
    newlywedUnits: null,
    newbornUnits: null,
    newlywedSupplyAvailable: null,
    newlywedClassification: classification.newlywedKeyword ? 'keyword-candidate' : 'none',
    eligibilityTags: [],
    targetGroups: [],
    eligibilityRequiresCheck: true,
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
    price: { lowestModelTopAmountManWon: null, highestModelTopAmountManWon: null },
    models: [],
    homes: [],
    minAreaM2: null,
    maxAreaM2: null,
    maxPriceManWon: null,
    officialUrl: official.toString(),
    sourceUrl: official.toString(),
    homepageUrl: 'https://www.i-sh.co.kr/app/',
    developer: SH_SOURCE_LABEL,
    builder: '',
    contact: '1600-3456',
    summary,
    fetchedAt: generatedAt,
    firstSeenAt: generatedAt,
    lastSeenAt: generatedAt,
  };
  notice.fingerprint = fingerprintShSupplyNotice(notice);
  return notice;
}

async function responseBytes(response) {
  const declaredLength = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new ShSupplyProviderError('SH RSS 응답 크기가 안전 한도를 초과했습니다.', {
      code: 'SH_RSS_RESPONSE_LIMIT',
    });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) {
    throw new ShSupplyProviderError('SH RSS 응답 크기가 안전 한도를 초과했습니다.', {
      code: 'SH_RSS_RESPONSE_LIMIT',
    });
  }
  return bytes;
}

export async function fetchShSupplyNotices(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener?.('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error('SH RSS timeout')), timeoutMs);
  try {
    const response = await fetchImpl(SH_RSS_URL, {
      method: 'GET',
      headers: { Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8' },
      signal: controller.signal,
    });
    if (!response?.ok) {
      throw new ShSupplyProviderError('SH 공식 RSS가 정상 상태를 반환하지 않았습니다.', {
        code: 'SH_RSS_HTTP_ERROR',
        httpStatus: Number(response?.status) || null,
      });
    }
    const bytes = await responseBytes(response);
    const charset = responseCharset(response, bytes);
    const xml = decodeShRssBytes(bytes, charset);
    const parsed = parseShRssXml(xml);
    return {
      ...parsed,
      requestCount: 1,
      responseBytes: bytes.byteLength,
      charset: /utf/i.test(charset) ? 'utf-8' : 'euc-kr',
    };
  } catch (error) {
    if (error instanceof ShSupplyProviderError) throw error;
    throw new ShSupplyProviderError('SH 공식 RSS 요청에 실패했습니다.', {
      code: controller.signal.aborted ? 'SH_RSS_ABORTED' : 'SH_RSS_NETWORK_ERROR',
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener?.('abort', abortFromCaller);
  }
}

function countReasons(entries) {
  const counts = {};
  for (const entry of entries) counts[entry] = (counts[entry] || 0) + 1;
  return counts;
}

export async function collectShSupplySource(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(now.getTime())) throw new TypeError('now must be a valid date');
  const generatedAt = now.toISOString();
  const fetchNoticesImpl = options.fetchNoticesImpl || fetchShSupplyNotices;
  const result = await fetchNoticesImpl({
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });
  const byId = new Map();
  const excludedReasons = [];
  for (const item of result.items || []) {
    const classification = classifyShRssItem(item);
    const notice = classification.include ? normalizeShRssItem(item, { generatedAt, now }) : null;
    if (!notice) {
      excludedReasons.push(classification.include ? 'invalid-official-link-or-seq' : classification.reason);
      continue;
    }
    byId.set(notice.id, notice);
  }
  const notices = [...byId.values()].sort((a, b) => (
    String(b.noticeDate || '').localeCompare(String(a.noticeDate || ''))
    || a.name.localeCompare(b.name, 'ko')
    || a.id.localeCompare(b.id)
  ));
  const rawItemCount = (result.items || []).length;
  return {
    source: 'sh',
    label: SH_SOURCE_LABEL,
    status: 'ok',
    generatedAt,
    lastSuccessfulAt: generatedAt,
    notices,
    coverage: {
      status: 'ok',
      requestedFeedCount: 1,
      successfulFeedCount: 1,
      failedFeedCount: 0,
      requestCount: Number(result.requestCount) || 1,
      rawItemCount,
      includedNoticeCount: notices.length,
      excludedItemCount: rawItemCount - notices.length,
      excludedReasonCounts: countReasons(excludedReasons),
      charset: cleanText(result.charset) || null,
      responseBytes: Number(result.responseBytes) || null,
      feeds: [{
        url: SH_RSS_URL,
        status: 'ok',
        rawItemCount,
        includedNoticeCount: notices.length,
      }],
      errors: [],
    },
  };
}
