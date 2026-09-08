import { isGeoPoint } from './transport-core.mjs';

const clean = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const detailedAddress = address => /[가-힣\d]+(?:동|읍|면|리|로|길)(?=\s|\d|[(),]|$)/u.test(address);
const regionalAccuracy = value => /region|centroid|district|jurisdiction|sido|시군구|대표|지역/i.test(value);
const lookupTimeout = Symbol('supply-address-timeout');

function legalAreaPrefix(address) {
  const parts = [];
  let hasBroadArea = false;
  let hasLocalArea = false;
  for (const part of address.split(' ')) {
    if (!hasLocalArea && /^(?:[가-힣\d]+(?:도|시|군|구)|서울|경기|강원|충북|충남|전북|전남|경북|경남|제주)$/u.test(part)) {
      hasBroadArea = true;
    } else if (hasBroadArea && /^[가-힣]+[가-힣\d]*(?:읍|면|동|리)$/u.test(part)) {
      hasLocalArea = true;
    } else {
      break;
    }
    parts.push(part);
  }
  return hasLocalArea ? parts.join(' ') : '';
}

async function boundedGeocode(geocode, query, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => geocode(query)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(lookupTimeout), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function pointOf(value) {
  const lat = value?.lat ?? value?.latitude ?? value?.y;
  const lng = value?.lng ?? value?.longitude ?? value?.x;
  const numeric = item => typeof item === 'number' || (typeof item === 'string' && item.trim() !== '');
  if (!numeric(lat) || !numeric(lng) || !isGeoPoint({ lat, lng })) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

function locationRow(value = {}) {
  return {
    address: clean(value?.address) || clean(value?.supplyLocation),
    point: pointOf(value),
    region: [value?.regionName, value?.sido, value?.district].map(clean).filter(Boolean).join(' '),
    accuracy: [value?.coordinateAccuracy, value?.locationScope, value?.mapCoordinateSource].map(clean).join(' '),
  };
}

function prepare(notice = {}) {
  const rows = [locationRow(notice), ...(Array.isArray(notice?.locations) ? notice.locations.map(locationRow) : [])];
  const addresses = [...new Set(rows.map(row => row.address).filter(detailedAddress))];
  const region = [...new Set(rows.map(row => row.region).filter(Boolean))].join(' ');
  const title = clean(notice?.title);
  const address = addresses.length ? addresses.join(' / ') : rows.find(row => row.address)?.address || '';
  const query = addresses.length === 1 ? addresses[0] : [region || address, title].filter(Boolean).join(' ');
  const key = JSON.stringify([String(notice?.id ?? ''), title, rows]);
  return { rows, addresses, address, query, key };
}

function result(input, overrides = {}) {
  const value = { point: null, address: input.address, label: '위치 미확인', reason: '', approximate: true, query: input.query, ...overrides };
  if (value.point) Object.freeze(value.point);
  return Object.freeze(value);
}

async function locate(input, geocode, timeoutMs) {
  if (input.addresses.length > 1) {
    return result(input, { reason: '여러 공급지역의 상세 주소가 함께 있어 한 곳으로 표시하지 않습니다. 공고문에서 공급 위치를 확인하세요.' });
  }
  const address = input.addresses[0];
  // A coordinate is usable only with its own address; another row may describe a different site.
  const located = input.rows.find(row => row.point && (address ? row.address === address : true));
  if (located) {
    const regional = !detailedAddress(located.address) || regionalAccuracy(located.accuracy);
    const geocoded = /geocod/i.test(located.accuracy);
    return result(input, {
      point: located.point,
      address: located.address || located.region,
      label: regional ? '공급지역 참고 위치' : geocoded ? '공고 주소 주변 위치' : '공고 제공 위치',
      reason: regional
        ? '공급지역의 참고 좌표이며 실제 주택이나 사업지의 위치를 뜻하지 않습니다.'
        : geocoded ? '공고 주소를 검색한 주변 위치입니다. 실제 공급 구역은 공고문을 확인하세요.'
          : '공고에서 제공한 참고 좌표입니다. 실제 공급 구역은 공고문을 확인하세요.',
    });
  }
  if (!address) {
    return result(input, { reason: '공고에 상세 주소가 없어 위치를 확인할 수 없습니다. 지역과 공고명으로 외부 지도에서 검색할 수 있습니다.' });
  }
  if (typeof geocode !== 'function') {
    return result(input, { reason: '주소 검색을 연결하지 못했습니다. 공고 주소로 외부 지도를 확인하세요.' });
  }
  try {
    const resolved = await boundedGeocode(geocode, address, timeoutMs);
    const point = pointOf(resolved?.point || resolved);
    if (point) {
      return result(input, { point, label: '공고 주소 주변 위치', reason: '공고 주소를 검색한 주변 위치입니다. 넓은 사업지나 여러 필지는 공고문에서 실제 공급 구역을 확인하세요.' });
    }
    // Only a completed no-match permits one coarser lookup; errors and malformed results stop here.
    const area = resolved === null ? legalAreaPrefix(address) : '';
    if (area && area !== address) {
      const fallback = await boundedGeocode(geocode, area, timeoutMs);
      const areaPoint = pointOf(fallback?.point || fallback);
      if (areaPoint) {
        return result(input, {
          point: areaPoint, address: area, label: '공급지역 참고 위치',
          reason: `${area} 범위의 참고 위치입니다. 상세 주소를 찾지 못해 실제 단지 위치는 미확인입니다. 공고문에서 공급 구역을 확인하세요.`,
        });
      }
    }
    return result(input, { reason: '공고 주소에 해당하는 위치를 찾지 못했습니다. 주소를 확인하거나 다시 확인해 주세요.' });
  } catch (error) {
    return result(input, { reason: error === lookupTimeout
      ? '주소 검색 대기 시간이 초과되었습니다. 잠시 후 다시 확인하거나 외부 지도를 이용하세요.'
      : '주소 검색을 완료하지 못했습니다. 잠시 후 다시 확인하거나 외부 지도를 이용하세요.' });
  }
}

export function createSupplyLocationService({ geocode, timeoutMs = 10000 } = {}) {
  const timeout = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000;
  const cache = new Map();
  const inflight = new Map();
  return {
    resolve(notice, { retry = false } = {}) {
      const input = prepare(notice);
      if (inflight.has(input.key)) return inflight.get(input.key);
      const cached = cache.get(input.key);
      if (cached && (cached.point || !retry)) return Promise.resolve(cached);
      const request = locate(input, geocode, timeout).then(value => {
        cache.set(input.key, value);
        return value;
      }).finally(() => inflight.delete(input.key));
      inflight.set(input.key, request);
      return request;
    },
  };
}
