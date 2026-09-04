export const NAVER_LOCAL_SEARCH_ENDPOINT = 'https://naverapihub.apigw.ntruss.com/search/v1/local';

export class NaverLocalSearchError extends Error {
  constructor(message, { code = 'PLACE_SEARCH_ERROR', httpStatus = null, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'NaverLocalSearchError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function requiredCredential(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new NaverLocalSearchError(`${label} is required`, { code: 'MISSING_CREDENTIAL' });
  }
  return normalized;
}

function normalizedQuery(value) {
  const query = String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (query.length < 2 || query.length > 100 || /[\u0000-\u001f]/.test(query)) {
    throw new NaverLocalSearchError('Search query must contain 2 to 100 characters', { code: 'INVALID_QUERY' });
  }
  return query;
}

function decodeEntity(entity) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ',
  };
  if (Object.hasOwn(named, entity)) return named[entity];
  const decimal = entity.match(/^#(\d+)$/);
  if (decimal) return String.fromCodePoint(Number(decimal[1]));
  const hexadecimal = entity.match(/^#x([\da-f]+)$/i);
  if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal[1], 16));
  return `&${entity};`;
}

export function stripNaverMarkup(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&([^;\s]{1,12});/g, (_, entity) => decodeEntity(entity))
    .replace(/\s+/g, ' ')
    .trim();
}

function coordinate(value, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed >= minimum && parsed <= maximum) return parsed;

  // NAVER Local Search currently returns WGS84 mapx/mapy as integer strings
  // scaled by 10,000,000, while fixtures and compatible responses can expose
  // ordinary decimal degrees. Accept both without turning small invalid values
  // such as 999 into plausible coordinates.
  if (!Number.isInteger(parsed) || Math.abs(parsed) < 1_000_000) return null;
  const scaled = parsed / 10_000_000;
  return scaled >= minimum && scaled <= maximum ? scaled : null;
}

export function normalizeNaverLocalSearch(payload) {
  const sourceItems = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.result?.items) ? payload.result.items : [];
  const seen = new Set();
  return sourceItems.flatMap((item) => {
    const lat = coordinate(item?.mapy ?? item?.y, -90, 90);
    const lng = coordinate(item?.mapx ?? item?.x, -180, 180);
    if (lat === null || lng === null) return [];
    const placeName = stripNaverMarkup(item?.title || item?.name);
    const roadAddress = stripNaverMarkup(item?.roadAddress);
    const jibunAddress = stripNaverMarkup(item?.address || item?.jibunAddress);
    if (!placeName && !roadAddress && !jibunAddress) return [];
    const key = `${lat.toFixed(7)}|${lng.toFixed(7)}|${placeName}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      source: 'naver-api-hub-local',
      placeName,
      category: stripNaverMarkup(item?.category),
      roadAddress,
      jibunAddress,
      lat,
      lng,
    }];
  }).slice(0, 5);
}

export function buildNaverLocalSearchRequest({
  query,
  clientId,
  clientSecret,
  endpoint = NAVER_LOCAL_SEARCH_ENDPOINT,
}) {
  const id = requiredCredential(clientId, 'NAVER API HUB Client ID');
  const secret = requiredCredential(clientSecret, 'NAVER API HUB Client Secret');
  const url = new URL(endpoint);
  url.searchParams.set('query', normalizedQuery(query));
  url.searchParams.set('display', '5');
  url.searchParams.set('start', '1');
  url.searchParams.set('sort', 'random');
  url.searchParams.set('format', 'json');
  return {
    url: url.toString(),
    init: {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-ncp-apigw-api-key-id': id,
        'x-ncp-apigw-api-key': secret,
      },
    },
  };
}

export async function fetchNaverLocalSearch(params, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const request = buildNaverLocalSearchRequest(params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(request.url, { ...request.init, signal: controller.signal });
  } catch (cause) {
    throw new NaverLocalSearchError('NAVER place search request failed', {
      code: cause?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      cause,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response || typeof response.json !== 'function') {
    throw new NaverLocalSearchError('NAVER place search returned an invalid HTTP response', { code: 'INVALID_HTTP_RESPONSE' });
  }
  if (!response.ok) {
    throw new NaverLocalSearchError(`NAVER place search returned HTTP ${Number(response.status) || 500}`, {
      code: 'HTTP_ERROR',
      httpStatus: Number(response.status) || null,
    });
  }
  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new NaverLocalSearchError('NAVER place search returned invalid JSON', { code: 'INVALID_JSON', cause });
  }
  return normalizeNaverLocalSearch(payload);
}
