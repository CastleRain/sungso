import { normalizeDestinations } from './commute-balance-core.mjs';
import { haversineKm, isGeoPoint } from './transport-core.mjs';

// Approximate positions cannot support metre-level ordering. Within each 5 km
// reference-distance band, visit every legal locality before its next address.
const REFERENCE_DISTANCE_BAND_KM = 5;

function text(value) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
}

function positive(value) {
  if (value === null || value === undefined || typeof value === 'boolean' || text(value) === '') return 0;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function identity(candidate) {
  return [candidate.catalogId || candidate.id || '', candidate.address || '', candidate.name || ''].map(text).join('|');
}

/** Only complete Seoul/Gyeonggi administrative prefixes may match a station. */
function regionKey(value) {
  const parts = text(value).split(' ');
  if (/^서울(?:특별시|시)?$/.test(parts[0]) && /구$/.test(parts[1] || '')) return `서울특별시 ${parts[1]}`;
  if (/^경기(?:도)?$/.test(parts[0]) && /(?:시|군)$/.test(parts[1] || '')) {
    return ['경기도', parts[1], /구$/.test(parts[2] || '') ? parts[2] : ''].filter(Boolean).join(' ');
  }
  return '';
}

function localityName(value) {
  const normalized = text(value);
  return /^[가-힣][가-힣\d]*(?:동|가|읍|면)$/.test(normalized) ? normalized : '';
}

function addressLocalities(address) {
  return [...new Set(text(address).split(/[\s(),]+/).flatMap(token => {
    const locality = token.match(/^([가-힣][가-힣\d]*?(?:동|가|읍|면))(?=\d|$)/)?.[1];
    return locality && localityName(locality) ? [locality] : [];
  }))];
}

function candidateLocality(candidate) {
  const declared = localityName(candidate.dong);
  if (declared) return declared;
  // Catalogue addresses normally contain a legal dong. A road name or an
  // apartment name alone is not evidence that a station belongs to that dong.
  return addressLocalities(candidate.address)[0] || '';
}

function stationLocalityReferences(stations) {
  const groups = new Map();
  for (const station of Array.isArray(stations) ? stations : []) {
    if (station?.coordinateRole !== 'official-station-reference' || !isGeoPoint(station)) continue;
    const region = regionKey(station.address);
    if (!region) continue;
    for (const locality of addressLocalities(station.address)) {
      const key = `${region}|${locality}`;
      if (!groups.has(key)) groups.set(key, []);
      const group = groups.get(key);
      if (!group.some(point => Number(point.lat) === Number(station.lat) && Number(point.lng) === Number(station.lng))) group.push(station);
    }
  }
  const references = new Map();
  for (const [key, stationsInLocality] of groups) {
    // Use an actual official station nearest the group's other stations, not
    // an invented centroid, the closest station name, or apartment coordinates.
    const ordered = [...stationsInLocality].sort((a, b) => {
      const sum = point => stationsInLocality.reduce((total, station) => total + haversineKm(point, station), 0);
      return sum(a) - sum(b) || text(a.id || a.name).localeCompare(text(b.id || b.name));
    });
    references.set(key, ordered[0]);
  }
  return references;
}

/**
 * Bounded geocoding priority, never a commute verdict or exact distance claim.
 * 1. Rank by company-weighted distance to existing exact coordinates, a station
 *    explicitly addressed in the same region/legal dong, or a district point.
 * 2. In each 5 km reference band, alternate legal dongs/roads so one cheap dong
 *    cannot take all forty slots. Inside a locality, known housing size/year
 *    and stable identity break ties; incoming price order is never consulted.
 * Returned candidates are the original objects. Reference station positions
 * remain internal and MUST NOT populate candidate.lat/lng/locationReference.
 * Limited geocoding still cannot guarantee the closest apartment in a locality.
 */
export function orderLocationVerificationQueue(candidates = [], destinations = [], { stations = [] } = {}) {
  const targets = normalizeDestinations(destinations).filter(isGeoPoint);
  const totalWeight = targets.reduce((sum, destination) => sum + Math.max(0, destination.weight), 0);
  const stationReferences = stationLocalityReferences(stations);
  const distance = point => isGeoPoint(point) && totalWeight > 0
    ? targets.reduce((sum, destination) => sum + haversineKm(point, destination) * Math.max(0, destination.weight), 0) / totalWeight : Infinity;
  const exact = [];
  const bands = new Map();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const namedRegion = regionKey(candidate.regionName);
    const addressedRegion = regionKey(candidate.address);
    const region = namedRegion || addressedRegion;
    const locality = candidateLocality(candidate);
    const id = identity(candidate);
    if (isGeoPoint(candidate) && candidate.locationPrecision !== 'district') {
      exact.push({ candidate, distance: distance(candidate), id });
      continue;
    }
    const addressedLocalities = addressLocalities(candidate.address);
    const consistentAddress = !(namedRegion && addressedRegion && namedRegion !== addressedRegion)
      && (!addressedLocalities.length || addressedLocalities.includes(locality));
    const reference = (consistentAddress && stationReferences.get(`${region}|${locality}`)) || candidate.locationReference;
    const weightedDistance = distance(reference);
    const band = Number.isFinite(weightedDistance) ? Math.floor(weightedDistance / REFERENCE_DISTANCE_BAND_KM) : Infinity;
    // A road-only record can still contribute address diversity, but it never
    // matches a station by road name or borrows a dong from the station name.
    const road = text(candidate.address).split(' ').find(part => /(?:로|길)$/.test(part)) || '';
    const localityKey = `${text(candidate.regionCode) || region || 'unknown-region'}|${locality || road || text(candidate.address) || id}`;
    if (!bands.has(band)) bands.set(band, new Map());
    const groups = bands.get(band);
    if (!groups.has(localityKey)) groups.set(localityKey, { key: localityKey, distance: weightedDistance, entries: [] });
    const group = groups.get(localityKey);
    group.distance = Math.min(group.distance, weightedDistance);
    group.entries.push({ candidate, id });
  }
  // Already located candidates consume no slots in enrichExactCandidates.
  exact.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  const result = exact.map(entry => entry.candidate);
  for (const [, localities] of [...bands].sort(([a], [b]) => a - b)) {
    const groups = [...localities.values()].sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key, 'ko'));
    groups.forEach(group => group.entries.sort((a, b) => positive(b.candidate.households) - positive(a.candidate.households)
      || positive(b.candidate.builtYear) - positive(a.candidate.builtYear) || a.id.localeCompare(b.id, 'ko')));
    const longest = Math.max(...groups.map(group => group.entries.length));
    for (let index = 0; index < longest; index += 1) {
      for (const group of groups) if (group.entries[index]) result.push(group.entries[index].candidate);
    }
  }
  return result;
}
