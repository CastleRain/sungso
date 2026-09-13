import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_COMPARE, pricePerP33, pruneCompareIds, buildComparisonHighlights,
} from '../js/comparison-core.mjs';

test('price per 3.3 square meters uses asking price and exclusive area', () => {
  const visit = { askingPrice: 145000, areaM2: 84.9 };
  assert.ok(Math.abs(pricePerP33(visit) - (145000 * 3.3 / 84.9)) < 1e-9);
  assert.deepEqual(visit, { askingPrice: 145000, areaM2: 84.9 });
});

test('price per 3.3 returns null for missing or invalid values', () => {
  assert.equal(pricePerP33({ askingPrice: 0, areaM2: 84 }), null);
  assert.equal(pricePerP33({ askingPrice: 100000, areaM2: 0 }), null);
  assert.equal(pricePerP33({ askingPrice: '', areaM2: 84 }), null);
  assert.equal(pricePerP33({ askingPrice: Number.NaN, areaM2: 84 }), null);
});

test('comparison highlights objective extrema', () => {
  const result = buildComparisonHighlights([
    { id: 'a', dealType: '매매', askingPrice: 100000, areaM2: 84, walkMinutes: 10, builtYear: 2005 },
    { id: 'b', dealType: '매매', askingPrice: 90000, areaM2: 59, walkMinutes: 5, builtYear: 2018 },
    { id: 'c', dealType: '매매', askingPrice: 110000, areaM2: 101, walkMinutes: 15, builtYear: 2010 },
  ]);
  assert.deepEqual(result.price.visitIds, ['b']);
  assert.deepEqual(result.area.visitIds, ['c']);
  assert.deepEqual(result.walk.visitIds, ['b']);
  assert.deepEqual(result.builtYear.visitIds, ['b']);
});

test('numeric strings are accepted', () => {
  const result = buildComparisonHighlights([
    { id: 'a', dealType: '전세', askingPrice: '97000', areaM2: '84.7', walkMinutes: '12', builtYear: '2003' },
    { id: 'b', dealType: '전세', askingPrice: '99000', areaM2: '59.8', walkMinutes: '8', builtYear: '2015' },
  ]);
  assert.equal(result.price.value, 97000);
  assert.equal(result.area.value, 84.7);
  assert.equal(result.walk.value, 8);
  assert.equal(result.builtYear.value, 2015);
});

test('ties highlight every matching visit', () => {
  const result = buildComparisonHighlights([
    { id: 'a', dealType: '매매', askingPrice: 100000, areaM2: 84.9, builtYear: 2018 },
    { id: 'b', dealType: '매매', askingPrice: 110000, areaM2: 84.9, builtYear: 2018 },
  ]);
  assert.deepEqual(result.area.visitIds, ['a', 'b']);
  assert.deepEqual(result.builtYear.visitIds, ['a', 'b']);
});

test('criteria with fewer than two valid values are not highlighted', () => {
  const result = buildComparisonHighlights([
    { id: 'a', dealType: '매매', askingPrice: 100000, areaM2: 84, walkMinutes: 10 },
    { id: 'b', dealType: '매매', askingPrice: 110000, areaM2: 59 },
  ]);
  assert.equal(result.walk, null);
});

test('mixed deal types suppress only price comparisons', () => {
  const result = buildComparisonHighlights([
    { id: 'a', dealType: '매매', askingPrice: 100000, areaM2: 84, walkMinutes: 10, builtYear: 2005 },
    { id: 'b', dealType: '전세', askingPrice: 60000, areaM2: 59, walkMinutes: 5, builtYear: 2018 },
  ]);
  assert.equal(result.price.reason, 'mixed-deal-type');
  assert.equal(result.priceP33.reason, 'mixed-deal-type');
  assert.deepEqual(result.area.visitIds, ['a']);
  assert.deepEqual(result.walk.visitIds, ['b']);
});

test('monthly rent does not pretend its price is directly comparable', () => {
  const result = buildComparisonHighlights([
    { id: 'a', dealType: '월세', askingPrice: 10000, areaM2: 84 },
    { id: 'b', dealType: '월세', askingPrice: 12000, areaM2: 59 },
  ]);
  assert.equal(result.price.reason, 'monthly-rent-not-comparable');
  assert.equal(result.priceP33.reason, 'monthly-rent-not-comparable');
});

test('missing deal type does not participate in price ranking', () => {
  const result = buildComparisonHighlights([
    { id: 'a', dealType: '매매', askingPrice: 100000, areaM2: 84 },
    { id: 'b', askingPrice: 80000, areaM2: 59 },
  ]);
  assert.equal(result.price.reason, 'unsupported-deal-type');
});

test('prune compare ids removes deleted and duplicate ids while preserving order', () => {
  const visits = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  assert.deepEqual(pruneCompareIds(['b', 'gone', 'a', 'b', 'c', 'd'], visits), ['b', 'a', 'c']);
  assert.equal(pruneCompareIds(['a', 'b', 'c', 'd'], visits).length, MAX_COMPARE);
});

test('prune compare ids tolerates corrupted persisted values', () => {
  assert.deepEqual(pruneCompareIds(null, [{ id: 'a' }]), []);
  assert.deepEqual(pruneCompareIds({}, [{ id: 'a' }]), []);
  assert.deepEqual(pruneCompareIds(['a'], null), []);
});

test('prune compare ids normalizes imported numeric ids', () => {
  assert.deepEqual(pruneCompareIds([2, '1'], [{ id: '1' }, { id: 2 }]), ['2', '1']);
});
