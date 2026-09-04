import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SEARCH_RESULTS,
  normalizeApartmentSearchText,
  searchApartmentCatalog,
  findRelatedApartments,
} from '../js/apartment-search-core.mjs';

test('normalization folds width, spacing, symbols, generic apartment word, and Raemian typo', () => {
  assert.equal(normalizeApartmentSearchText('  레미안 - 아파트 ＡＢＣ  '), '래미안abc');
  assert.equal(normalizeApartmentSearchText('래미안아-파-트'), '래미안');
  assert.equal(normalizeApartmentSearchText(null), '');
});

test('match tiers keep exact ahead of prefix, contains, all tokens, and fuzzy', () => {
  const catalog = [
    { catalogId: 'fuzzy', name: '래미안퍼스티즈', regionName: '경기도 성남시' },
    { catalogId: 'tokens', name: '래미안 리버파크', regionName: '서울특별시 송파구' },
    { catalogId: 'contains', name: '송파래미안', regionName: '서울특별시 송파구' },
    { catalogId: 'prefix', name: '래미안 원베일리', regionName: '서울특별시 서초구' },
    { catalogId: 'exact', name: '래미안', regionName: '부산광역시 동래구' },
  ];

  assert.deepEqual(
    searchApartmentCatalog(catalog, '레미안').map((item) => [item.catalogId, item.matchTier]),
    [
      ['exact', 'exact'],
      ['fuzzy', 'prefix'],
      ['tokens', 'prefix'],
      ['prefix', 'prefix'],
      ['contains', 'contains'],
    ],
  );

  const tokenResult = searchApartmentCatalog(catalog, '서울 송파 리버파크');
  assert.equal(tokenResult[0].catalogId, 'tokens');
  assert.equal(tokenResult[0].matchTier, 'tokens');

  const fuzzyResult = searchApartmentCatalog(catalog, '래미안퍼스티지');
  assert.equal(fuzzyResult[0].catalogId, 'fuzzy');
  assert.equal(fuzzyResult[0].matchTier, 'fuzzy');
});

test('all five match tiers have absolute precedence', () => {
  const catalog = [
    { catalogId: 'fuzzy', name: '래미안퍼스티즈' },
    { catalogId: 'tokens', name: '퍼스티지 센터', regionName: '래미안동' },
    { catalogId: 'contains', name: '서초 래미안퍼스티지' },
    { catalogId: 'prefix', name: '래미안퍼스티지 1차' },
    { catalogId: 'exact', name: '래미안퍼스티지 아파트' },
  ];
  const results = searchApartmentCatalog(catalog, '레미안 퍼스티지');
  assert.deepEqual(results.map((item) => [item.catalogId, item.matchTier]), [
    ['exact', 'exact'],
    ['prefix', 'prefix'],
    ['contains', 'contains'],
    ['tokens', 'tokens'],
    ['fuzzy', 'fuzzy'],
  ]);
});

test('preferred region only boosts candidates inside the same tier', () => {
  const catalog = [
    { catalogId: 'exact-other', regionCode: '26110', name: '래미안' },
    { catalogId: 'prefix-preferred', regionCode: '11650', name: '래미안 원베일리' },
    { catalogId: 'prefix-other', regionCode: '11710', name: '래미안 리더스원' },
  ];
  const results = searchApartmentCatalog(catalog, '래미안', { preferredRegionCode: '11650' });
  assert.deepEqual(results.map((item) => item.catalogId), [
    'exact-other', 'prefix-preferred', 'prefix-other',
  ]);
});

test('catalog aliases participate in exact matching', () => {
  const results = searchApartmentCatalog([
    { catalogId: 'alias', name: '서울숲 리버뷰', aliases: ['성수 리버뷰 아파트'] },
  ], '성수리버뷰');
  assert.equal(results[0].matchTier, 'exact');
  assert.equal(results[0].matchReason, 'alias-exact');
});

test('fuzzy search is deliberately unavailable for short or unrelated queries', () => {
  const catalog = [{ catalogId: 'one', name: '자이' }, { catalogId: 'two', name: '래미안원베일리' }];
  assert.deepEqual(searchApartmentCatalog(catalog, '자아'), []);
  assert.deepEqual(searchApartmentCatalog(catalog, '완전히다른이름'), []);
});

test('results are stable, deduplicated, non-mutating, and limited by a hard maximum', () => {
  const catalog = [
    { catalogId: 'b', name: '래미안 나' },
    { catalogId: 'a', name: '래미안 가' },
    { catalogId: 'same', name: '래미안 후보' },
    { catalogId: 'same', name: '래미안' },
  ];
  const snapshot = structuredClone(catalog);
  const results = searchApartmentCatalog(catalog, '래미안', { limit: 3 });
  assert.deepEqual(results.map((item) => item.catalogId), ['same', 'b', 'a']);
  assert.deepEqual(catalog, snapshot);

  const many = Array.from({ length: 60 }, (_, index) => ({ catalogId: String(index), name: `래미안 ${index}` }));
  assert.equal(searchApartmentCatalog(many, '래미안', { limit: 999 }).length, MAX_SEARCH_RESULTS);
  assert.deepEqual(searchApartmentCatalog(many, '래미안', { limit: 0 }), []);
});

test('related apartments prefer same district and brand, then district, then brand', () => {
  const selected = {
    catalogId: 'selected', regionCode: '11710', regionName: '서울 송파구', name: '래미안 원베일리',
  };
  const catalog = [
    selected,
    { catalogId: 'brand-only', regionCode: '11650', name: '래미안 퍼스티지' },
    { catalogId: 'region-only', regionCode: '11710', name: '헬리오시티' },
    { catalogId: 'both', regionCode: '11710', name: '래미안 리더스원' },
    { catalogId: 'unrelated', regionCode: '41135', name: '판교 푸르지오' },
  ];
  const related = findRelatedApartments({ ...selected }, catalog, 3);
  assert.deepEqual(related.map((item) => [item.catalogId, item.relationTier]), [
    ['both', 'same-region-brand'],
    ['region-only', 'same-region'],
    ['brand-only', 'same-brand'],
  ]);
});

test('related apartment lookup is stable, deduplicated, and honors limit', () => {
  const selected = { catalogId: 'selected', regionCode: '11110', name: '푸르지오 센터' };
  const catalog = [
    { catalogId: 'first', regionCode: '11110', name: '첫 단지' },
    { catalogId: 'first', regionCode: '11110', name: '첫 단지 복제' },
    { catalogId: 'second', regionCode: '11110', name: '둘째 단지' },
  ];
  assert.deepEqual(
    findRelatedApartments(selected, catalog, 2).map((item) => item.catalogId),
    ['first', 'second'],
  );
  assert.deepEqual(findRelatedApartments(selected, catalog, 0), []);
});
