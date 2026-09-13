export const MAX_COMPARE = 3;

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function pricePerP33(visit = {}) {
  const price = positiveNumber(visit.askingPrice);
  const area = positiveNumber(visit.areaM2);
  return price && area ? price * 3.3 / area : null;
}

export function pruneCompareIds(rawIds, visits) {
  if (!Array.isArray(rawIds) || !Array.isArray(visits)) return [];
  const available = new Set(visits
    .filter((visit) => visit && visit.id !== undefined && visit.id !== null)
    .map((visit) => String(visit.id)));
  const seen = new Set();
  const result = [];
  rawIds.forEach((rawId) => {
    if (rawId === undefined || rawId === null) return;
    const id = String(rawId);
    if (!available.has(id) || seen.has(id) || result.length >= MAX_COMPARE) return;
    seen.add(id);
    result.push(id);
  });
  return result;
}

function extreme(visits, getter, direction) {
  const values = visits.flatMap((visit) => {
    const value = positiveNumber(getter(visit));
    if (value === null || visit?.id === undefined || visit?.id === null) return [];
    return [{ id: String(visit.id), value }];
  });
  if (values.length < 2) return null;
  const target = direction === 'max'
    ? Math.max(...values.map((item) => item.value))
    : Math.min(...values.map((item) => item.value));
  return {
    value: target,
    visitIds: values.filter((item) => item.value === target).map((item) => item.id),
  };
}

function priceComparisonReason(visits) {
  const rawTypes = visits.map((visit) => String(visit?.dealType || '').trim());
  const types = new Set(rawTypes.filter(Boolean));
  if (types.has('월세')) return 'monthly-rent-not-comparable';
  if (rawTypes.some((type) => !['매매', '전세'].includes(type))) return 'unsupported-deal-type';
  return types.size > 1 ? 'mixed-deal-type' : '';
}

export function buildComparisonHighlights(visits) {
  const safeVisits = Array.isArray(visits) ? visits.filter(Boolean) : [];
  const priceReason = priceComparisonReason(safeVisits);
  return {
    price: priceReason ? { reason: priceReason } : extreme(safeVisits, (visit) => visit.askingPrice, 'min'),
    priceP33: priceReason ? { reason: priceReason } : extreme(safeVisits, pricePerP33, 'min'),
    area: extreme(safeVisits, (visit) => visit.areaM2, 'max'),
    walk: extreme(safeVisits, (visit) => visit.walkMinutes, 'min'),
    builtYear: extreme(safeVisits, (visit) => visit.builtYear, 'max'),
  };
}
