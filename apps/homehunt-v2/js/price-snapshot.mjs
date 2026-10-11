import { filterCatalog, number } from './core.mjs?v=2.0.3';

/** Public prices stay tagged with their observation window; they are not live listings. */
export function snapshotCandidates(catalog, artifact, conditions, now = new Date()) {
  if (!Array.isArray(catalog) || !Array.isArray(artifact?.prices)) return [];
  const validCatalog = new Map(filterCatalog(catalog, conditions, '', 'all', now)
    .filter(c => conditions.regions?.includes(String(c.regionCode).startsWith('11') ? 'seoul' : 'gyeonggi') !== false)
    .map(c => [String(c.catalogId), c]));
  const candidates = new Map();
  for (const fact of artifact.prices) {
    const apartment = validCatalog.get(String(fact.catalogId));
    if (!apartment || !['complete', 'partial'].includes(fact.status)
      || !(number(fact.referencePriceManWon) > 0) || !(number(fact.areaM2) >= conditions.minAreaM2)
      || number(fact.referencePriceManWon) > conditions.maxPriceManWon || !(number(fact.sampleCount) >= 3)
      || !/^\d{4}-\d{2}$/.test(fact.referenceMonth || '')) continue;
    const observed = new Date(fact.referenceMonth + '-01T00:00:00+09:00');
    if (!Number.isFinite(observed.getTime()) || observed > now) continue;
    const id = String(apartment.catalogId);
    const c = candidates.get(id) || { ...apartment, id, areas: [], priceSnapshot: true,
      snapshotAsOfMonth: artifact.asOfMonth, snapshotWindow: artifact.window,
      priceVerified: fact.status === 'complete', priceProvisional: fact.status === 'partial' };
    c.areas.push({ areaM2: Number(fact.areaM2), averagePriceManWon: Number(fact.referencePriceManWon),
      count: Number(fact.sampleCount), latestMonth: fact.referenceMonth,
      missingMonths: fact.missingMonths || [], source: '국토부 보유 공공자료' });
    c.bestArea = [...c.areas].sort((a, b) => a.averagePriceManWon - b.averagePriceManWon)[0];
    c.priceProvisional ||= fact.status === 'partial'; candidates.set(id, c);
  }
  return [...candidates.values()];
}
