export const PYEONG_TO_M2 = 3.305785;

function numeric(value, fallback = 0) {
  const number = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeRecommendationText(value = '') {
  return String(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normalizeApartmentIdentity(value = '') {
  return String(value).normalize('NFKC').toLowerCase()
    .replace(/아파트/g, '')
    .replace(/[\s()[\]{}ㆍ·.,_\-]/g, '');
}

function operatorFromText(value, fallback = 'gte') {
  if (/초과|넘는|넘고|넘게|넘어|보다\s*큰/.test(value)) return 'gt';
  if (/미만|보다\s*작/.test(value)) return 'lt';
  if (/이하|안쪽|이내/.test(value)) return 'lte';
  if (/이상/.test(value)) return 'gte';
  return fallback;
}

function moneyToManWon(eok, tail = '') {
  return Math.round(numeric(eok) * 10000 + numeric(tail));
}

export function parseRecommendationQuery(query, currentYear = new Date().getFullYear()) {
  const text = normalizeRecommendationText(query);
  const filters = {
    regions: [],
    minHouseholds: 0,
    householdsOperator: 'gte',
    maxPriceManWon: 0,
    priceOperator: 'lte',
    minAreaM2: 0,
    areaOperator: 'gte',
    areaBasis: 'exclusive',
    maxAgeYears: 0,
    minBuiltYear: 0,
    stationWalkMin: 0,
    stationWalkMax: 0,
    commuteMaxMinutes: 0,
    commuteModes: [],
  };
  const clauses = [];

  if (/서울/.test(text)) filters.regions.push('seoul');
  if (/경기/.test(text)) filters.regions.push('gyeonggi');
  if (!filters.regions.length && /수도권/.test(text)) filters.regions.push('seoul', 'gyeonggi');
  if (filters.regions.length) clauses.push({ key: 'regions', label: filters.regions.map((item) => item === 'seoul' ? '서울' : '경기').join(' · '), confidence: 'high' });

  const households = text.match(/([\d,]+)\s*세대[^,.]{0,12}?(초과|넘는|넘고|넘게|넘어|이상|이하|미만)/);
  if (households) {
    filters.minHouseholds = numeric(households[1]);
    filters.householdsOperator = operatorFromText(households[2], 'gte');
    clauses.push({ key: 'households', label: `${filters.minHouseholds.toLocaleString('ko-KR')}세대 ${filters.householdsOperator === 'gt' ? '초과' : '이상'}`, confidence: 'high' });
  }

  const money = text.match(/(\d+(?:\.\d+)?)\s*억(?:\s*([\d,]+)\s*만(?:원)?)?/);
  if (money) {
    const moneyTail = text.slice((money.index || 0) + money[0].length, (money.index || 0) + money[0].length + 12);
    const moneyOperator = moneyTail.match(/미만|이하|이내|안쪽|초과|이상/)?.[0] || '';
    filters.maxPriceManWon = moneyToManWon(money[1], money[2]);
    filters.priceOperator = operatorFromText(moneyOperator, 'lte');
    if (!['lt', 'lte'].includes(filters.priceOperator)) filters.priceOperator = 'lte';
    clauses.push({ key: 'price', label: `${money[1]}억원 ${filters.priceOperator === 'lt' ? '미만' : '이하'}`, confidence: 'high' });
  }

  const area = text.match(/(\d+(?:\.\d+)?)\s*평/);
  if (area) {
    const areaTail = text.slice((area.index || 0) + area[0].length, (area.index || 0) + area[0].length + 10);
    const areaOperator = areaTail.match(/이상|초과|이하|미만/)?.[0] || '';
    const pyeong = numeric(area[1]);
    filters.minAreaM2 = pyeong * PYEONG_TO_M2;
    filters.areaOperator = operatorFromText(areaOperator, 'gte');
    filters.areaBasis = /공급/.test(text.slice(Math.max(0, area.index - 8), area.index + area[0].length + 8)) ? 'supply' : 'exclusive';
    clauses.push({
      key: 'area',
      label: `${filters.areaBasis === 'supply' ? '공급' : '전용'} ${pyeong}평 ${filters.areaOperator === 'gt' ? '초과' : '이상'} · ${filters.minAreaM2.toFixed(1)}㎡`,
      confidence: filters.areaBasis === 'exclusive' ? 'medium' : 'low',
      needsConfirmation: filters.areaBasis === 'supply',
    });
  }

  const age = text.match(/(\d+)\s*년\s*(?:안쪽|이내|미만)/);
  if (age) {
    filters.maxAgeYears = numeric(age[1]);
    filters.minBuiltYear = currentYear - filters.maxAgeYears;
    clauses.push({ key: 'age', label: `${filters.maxAgeYears}년 이내 · ${filters.minBuiltYear}년 이후`, confidence: 'medium' });
  }

  const stationRange = text.match(/역[^,.]{0,24}?(\d+)\s*(?:~|～|-|–|—)\s*(\d+)\s*분/)
    || text.match(/(\d+)\s*(?:~|～|-|–|—)\s*(\d+)\s*분[^,.]{0,18}?역/);
  if (stationRange) {
    filters.stationWalkMin = Math.min(numeric(stationRange[1]), numeric(stationRange[2]));
    filters.stationWalkMax = Math.max(numeric(stationRange[1]), numeric(stationRange[2]));
    clauses.push({ key: 'station', label: `역 도보 ${filters.stationWalkMin}–${filters.stationWalkMax}분`, confidence: 'high' });
  } else {
    const stationMax = text.match(/역[^,.]{0,20}?(\d+)\s*분[^,.]{0,8}?(이내|안쪽|미만)/);
    if (stationMax) {
      filters.stationWalkMax = numeric(stationMax[1]);
      clauses.push({ key: 'station', label: `역 도보 ${filters.stationWalkMax}분 ${operatorFromText(stationMax[2], 'lte') === 'lt' ? '미만' : '이내'}`, confidence: 'high' });
    }
  }

  const hour = text.match(/(\d+(?:\.\d+)?)\s*시간[^,.]{0,12}?(안|이내|미만)/);
  const minute = text.match(/(\d+)\s*분[^,.]{0,12}?(안|이내|미만)[^,.]{0,16}?(?:회사|직장|출근)/)
    || text.match(/(?:회사|직장|출근)[^,.]{0,22}?(\d+)\s*분[^,.]{0,8}?(안|이내|미만)/);
  if (hour || minute) {
    filters.commuteMaxMinutes = hour ? Math.round(numeric(hour[1]) * 60) : numeric(minute[1]);
    clauses.push({ key: 'commute', label: `회사 ${filters.commuteMaxMinutes}분 이하`, confidence: 'high' });
  }
  if (/차|자동차|자가용/.test(text)) filters.commuteModes.push('car');
  if (/지하철|대중교통/.test(text)) filters.commuteModes.push('transit');
  filters.commuteModes = [...new Set(filters.commuteModes)];
  if (filters.commuteModes.length) clauses.push({ key: 'commuteModes', label: filters.commuteModes.map((item) => item === 'car' ? '자동차' : '대중교통').join(' 또는 '), confidence: 'high' });

  return { query: String(query || '').trim(), filters, clauses };
}

function regionMatches(code, regions) {
  if (!regions?.length) return /^11|^41/.test(String(code || ''));
  return regions.some((region) => region === 'seoul' ? String(code).startsWith('11') : region === 'gyeonggi' ? String(code).startsWith('41') : false);
}

function compare(value, target, operator) {
  if (!target) return true;
  if (operator === 'gt') return value > target;
  if (operator === 'lt') return value < target;
  if (operator === 'lte') return value <= target;
  return value >= target;
}

export function normalizeRecommendationFilters(value = {}, currentYear = new Date().getFullYear()) {
  const maxAgeYears = Math.max(0, numeric(value.maxAgeYears));
  return {
    regions: Array.isArray(value.regions) && value.regions.length ? [...new Set(value.regions)] : ['seoul', 'gyeonggi'],
    minHouseholds: Math.max(0, Math.trunc(numeric(value.minHouseholds))),
    householdsOperator: value.householdsOperator === 'gt' ? 'gt' : 'gte',
    maxPriceManWon: Math.max(0, numeric(value.maxPriceManWon)),
    priceOperator: value.priceOperator === 'lt' ? 'lt' : 'lte',
    minAreaM2: Math.max(0, numeric(value.minAreaM2)),
    areaOperator: value.areaOperator === 'gt' ? 'gt' : 'gte',
    areaBasis: value.areaBasis === 'supply' ? 'supply' : 'exclusive',
    maxAgeYears,
    minBuiltYear: Math.max(0, Math.trunc(numeric(value.minBuiltYear) || (maxAgeYears ? currentYear - maxAgeYears : 0))),
    stationWalkMin: Math.max(0, numeric(value.stationWalkMin)),
    stationWalkMax: Math.max(0, numeric(value.stationWalkMax)),
    commuteMaxMinutes: Math.max(0, numeric(value.commuteMaxMinutes)),
    commuteModes: Array.isArray(value.commuteModes) ? [...new Set(value.commuteModes.filter((mode) => ['car', 'transit'].includes(mode)))] : [],
    months: Math.max(1, Math.min(6, Math.trunc(numeric(value.months, 3) || 3))),
  };
}

export function filterCatalogForRecommendation(apartments, rawFilters, currentYear = new Date().getFullYear()) {
  const filters = normalizeRecommendationFilters(rawFilters, currentYear);
  return (Array.isArray(apartments) ? apartments : []).filter((apartment) => {
    if (!regionMatches(apartment.regionCode, filters.regions)) return false;
    if (!compare(numeric(apartment.households), filters.minHouseholds, filters.householdsOperator)) return false;
    if (filters.minBuiltYear && numeric(apartment.builtYear) < filters.minBuiltYear) return false;
    return true;
  });
}

export function medianValue(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function averageValue(values) {
  const valid = values.map(Number).filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function catalogKeys(apartment) {
  return [apartment.name, ...(apartment.aliases || [])]
    .map(normalizeApartmentIdentity)
    .filter(Boolean)
    .map((name) => `${String(apartment.regionCode)}|${normalizeApartmentIdentity(apartment.dong)}|${name}`);
}

export function buildCatalogRecommendationIndex(apartments) {
  const byKey = new Map();
  (apartments || []).forEach((apartment) => {
    catalogKeys(apartment).forEach((key) => {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(apartment);
    });
  });
  return byKey;
}

function normalizeJibun(value) {
  const match = String(value || '').normalize('NFKC').trim().match(/(\d+(?:-\d+)?)\s*$/);
  return match ? match[1].replace(/^0+(?=\d)/, '').replace(/-0+(?=\d)/, '-') : '';
}

export function matchTransactionToCatalog(record, index) {
  const recordName = normalizeApartmentIdentity(record.apartmentName);
  const key = `${String(record.regionCode || '')}|${normalizeApartmentIdentity(record.dong)}|${recordName}`;
  const matches = index.get(key) || [];
  if (matches.length <= 1) return matches[0] || null;
  const primaryNameMatches = matches.filter((item) => normalizeApartmentIdentity(item.name) === recordName);
  const candidates = primaryNameMatches.length ? primaryNameMatches : matches;
  if (candidates.length === 1) return candidates[0];
  const recordJibun = normalizeJibun(record.jibun);
  if (recordJibun) {
    const addressMatches = candidates.filter((item) => normalizeJibun(item.address) === recordJibun);
    if (addressMatches.length === 1) return addressMatches[0];
  }
  const builtYear = numeric(record.builtYear);
  const exactYearMatches = candidates.filter((item) => numeric(item.builtYear) === builtYear);
  if (exactYearMatches.length === 1) return exactYearMatches[0];
  const nearbyYearMatches = candidates.filter((item) => Math.abs(numeric(item.builtYear) - builtYear) <= 1);
  return nearbyYearMatches.length === 1 ? nearbyYearMatches[0] : null;
}

export function aggregateRecommendationRecords(apartments, records, rawFilters, currentYear = new Date().getFullYear()) {
  const filters = normalizeRecommendationFilters(rawFilters, currentYear);
  const basicCandidates = filterCatalogForRecommendation(apartments, filters, currentYear);
  const index = buildCatalogRecommendationIndex(basicCandidates);
  const grouped = new Map();

  (records || []).forEach((record) => {
    if (record.dealType !== '매매') return;
    const areaM2 = numeric(record.areaM2);
    if (!compare(areaM2, filters.minAreaM2, filters.areaOperator)) return;
    const apartment = matchTransactionToCatalog(record, index);
    if (!apartment) return;
    const area = (Math.round(areaM2 * 10) / 10).toFixed(1);
    const id = String(apartment.catalogId);
    if (!grouped.has(id)) grouped.set(id, { apartment, areas: new Map(), records: [] });
    const group = grouped.get(id);
    if (!group.areas.has(area)) group.areas.set(area, []);
    group.areas.get(area).push(record);
    group.records.push(record);
  });

  return [...grouped.values()].map(({ apartment, areas, records: matchedRecords }) => {
    const areaStats = [...areas.entries()].map(([area, areaRecords]) => {
      const ordered = [...areaRecords].sort((a, b) => String(b.month).localeCompare(String(a.month)) || numeric(b.day) - numeric(a.day));
      const prices = ordered.map((record) => numeric(record.amountManWon)).filter(Boolean);
      const medianPrice = medianValue(prices);
      const averagePrice = averageValue(prices);
      return {
        areaM2: numeric(area),
        medianPriceManWon: medianPrice,
        averagePriceManWon: averagePrice,
        latestPriceManWon: numeric(ordered[0]?.amountManWon),
        latestMonth: ordered[0]?.month || '',
        latestDay: numeric(ordered[0]?.day),
        minPriceManWon: prices.length ? Math.min(...prices) : 0,
        maxPriceManWon: prices.length ? Math.max(...prices) : 0,
        count: prices.length,
        aptSeq: String(ordered[0]?.aptSeq || ''),
      };
    }).sort((a, b) => a.areaM2 - b.areaM2);
    const qualifyingAreas = areaStats.filter((area) => compare(area.averagePriceManWon, filters.maxPriceManWon, filters.priceOperator));
    if (!qualifyingAreas.length) return null;
    const bestArea = [...qualifyingAreas].sort((a, b) => a.averagePriceManWon - b.averagePriceManWon || b.count - a.count)[0];
    const mostRecent = [...matchedRecords].sort((a, b) => String(b.month).localeCompare(String(a.month)) || numeric(b.day) - numeric(a.day))[0];
    return {
      ...apartment,
      aptSeq: bestArea.aptSeq || String(mostRecent?.aptSeq || ''),
      areas: areaStats,
      qualifyingAreas,
      bestArea,
      actualDealCount: matchedRecords.length,
      priceVerified: true,
      transportVerified: false,
    };
  }).filter(Boolean).sort((a, b) => (
    a.bestArea.averagePriceManWon - b.bestArea.averagePriceManWon
    || b.bestArea.count - a.bestArea.count
    || b.households - a.households
    || b.builtYear - a.builtYear
    || String(a.name).localeCompare(String(b.name), 'ko')
  ));
}
