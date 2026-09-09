import { normalizeDestinations } from './commute-balance-core.mjs';
import { haversineKm } from './transport-core.mjs';

const DEFAULT_DISTRICT_LIMIT = 8;

function text(value) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
}

function administrativeName(value) {
  return text(value).replace(/^서울(?:시|특별시)?(?=\s)/, '서울특별시')
    .replace(/^경기(?:도)?(?=\s)/, '경기도');
}

function point(value) {
  if ([value?.lat, value?.lng].some(coordinate => coordinate === null || coordinate === undefined
      || typeof coordinate === 'boolean' || text(coordinate) === '')) return null;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lng) && lng >= -180 && lng <= 180 && (lat !== 0 || lng !== 0)
    ? { lat, lng } : null;
}

function availableDistricts(districts, candidateCatalog, regions) {
  // Catalogue district codes are the actual MOLIT request units. The law table
  // also contains parent cities and newer subdivisions without catalog rows.
  const input = Array.isArray(candidateCatalog) ? candidateCatalog.map(row => ({
    code: row.regionCode, name: row.regionName,
  })) : Array.isArray(districts) ? districts : [];
  const allowed = new Set(Array.isArray(regions) && regions.length
    ? regions.filter(region => ['seoul', 'gyeonggi'].includes(region)) : ['seoul', 'gyeonggi']);
  const unique = new Map();
  for (const item of input) {
    const code = text(item?.code);
    const name = administrativeName(item?.name || [item?.sido, item?.sigungu || item?.district].filter(Boolean).join(' '));
    const province = code.startsWith('11') ? '서울특별시' : code.startsWith('41') ? '경기도' : '';
    if (!/^(11|41)\d{3}$/.test(code) || !allowed.has(code.startsWith('11') ? 'seoul' : 'gyeonggi')
        || !name.startsWith(`${province} `)) continue;
    if (!unique.has(code)) unique.set(code, { code, name });
    // Conflicting public labels are not sufficient evidence for an address join.
    else if (unique.get(code)?.name !== name) unique.set(code, null);
  }
  return [...unique.values()].filter(Boolean).sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Select a small, explicitly partial geographic search, not an isochrone.
 * Company weights rank each district's closest official station reference.
 * No station is used as an apartment coordinate or actual commute evidence.
 * A low-weight optional destination still contributes its stated weight; its
 * time limit never becomes a radius or a condition for excluding a district.
 * Only district codes and labels leave this helper, never company coordinates
 * or a distance/commute score. Callers keep a separate full-region action.
 */
export function buildCompanySearchScope({ districts = [], candidateCatalog, railStations = [],
  destinations = [], regions = ['seoul', 'gyeonggi'], limit = DEFAULT_DISTRICT_LIMIT } = {}) {
  const available = availableDistricts(districts, candidateCatalog, regions);
  const requestedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0
    ? Math.min(69, Number(limit)) : DEFAULT_DISTRICT_LIMIT;
  const totalDistrictCount = available.length;
  let referencedDistrictCount = 0;
  const all = (reason, explanation) => ({
    mode: 'all', districtCodes: [], districts: [], totalDistrictCount, referencedDistrictCount,
    basis: 'all-regions', reason, explanation,
  });
  if (!available.length) return all('missing-districts', '공식 검색 지역을 확인한 뒤 선택한 전체 지역을 검색합니다.');
  const normalized = normalizeDestinations(destinations);
  const targets = normalized.filter(destination => destination.weight > 0);
  if (!targets.length) return all('missing-destinations', '회사 위치가 없어 선택한 전체 지역을 검색합니다.');
  if (targets.some(destination => !point(destination))) {
    return all('unconfirmed-destinations', '위치를 확인하지 않은 회사가 있어 선택한 전체 지역을 검색합니다.');
  }

  const sortedNames = [...available].sort((a, b) => b.name.length - a.name.length || a.code.localeCompare(b.code));
  const references = new Map();
  const totalWeight = targets.reduce((sum, destination) => sum + destination.weight, 0);
  for (const station of Array.isArray(railStations) ? railStations : []) {
    if (station?.coordinateRole !== 'official-station-reference' || station.operating === false || !point(station)) continue;
    const address = administrativeName(station.address);
    // Require the whole administrative prefix, not a station name, substring,
    // or nearest coordinate. A known child district takes precedence over city.
    const district = sortedNames.find(item => address === item.name || address.startsWith(`${item.name} `));
    if (!district) continue;
    const weightedDistance = targets.reduce((sum, destination) =>
      sum + haversineKm(station, destination) * destination.weight / totalWeight, 0);
    if (!references.has(district.code) || weightedDistance < references.get(district.code)) {
      references.set(district.code, weightedDistance);
    }
  }
  referencedDistrictCount = references.size;
  if (referencedDistrictCount < Math.min(requestedLimit, available.length)) {
    return all('insufficient-station-references', '가까운 지역을 고를 공식 역 위치가 부족해 선택한 전체 지역을 검색합니다.');
  }
  if (available.length <= requestedLimit) {
    return all('already-small-region', '선택한 검색 지역이 적어 전체 지역을 검색합니다.');
  }
  const selected = available.filter(district => references.has(district.code))
    .sort((a, b) => references.get(a.code) - references.get(b.code) || a.code.localeCompare(b.code))
    .slice(0, requestedLimit);
  return {
    mode: 'nearby', districtCodes: selected.map(district => district.code), districts: selected,
    totalDistrictCount, referencedDistrictCount, basis: 'official-station-weighted-distance', reason: '',
    explanation: `회사 비중과 공식 역의 직선거리를 참고해 ${selected.length}개 지역만 먼저 검색합니다. 실제 통근 가능 시간은 경로 확인이 필요하며 나머지 지역도 전체 검색으로 볼 수 있습니다.`,
  };
}
