import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyApartmentCatalogIntent,
  decideCompanySearchNextStep,
  companySearchStepMessage,
} from '../js/company-search-core.mjs';

test('generic company query does not fall through to apartments when place key is missing', () => {
  const step = decideCompanySearchNextStep({
    query: 'KT',
    placeStatus: 'not-configured',
    addressStatus: 'ok',
  });

  assert.equal(step.kind, 'place-search-key-required');
  assert.equal(step.shouldSearchApartmentCatalog, false);
  assert.match(companySearchStepMessage(step), /NAVER Developers/);
});

test('provider results always win without loading the apartment catalog', () => {
  const step = decideCompanySearchNextStep({
    query: 'KT',
    placeStatus: 'ok',
    addressStatus: 'ok',
    placeResultsCount: 3,
    addressResultsCount: 1,
  });

  assert.deepEqual(step, {
    kind: 'provider-results',
    shouldSearchApartmentCatalog: false,
    resultCount: 4,
  });
});

test('company-location search never falls through to apartments by default', () => {
  for (const query of ['푸르지오', '아이파크', '분당 래미안', '헬리오시티 1단지', '잠실 주공아파트']) {
    const intent = classifyApartmentCatalogIntent(query);
    assert.equal(intent.eligible, true, query);
    const step = decideCompanySearchNextStep({ query, placeStatus: 'not-configured' });
    assert.equal(step.kind, 'place-search-key-required', query);
    assert.equal(step.shouldSearchApartmentCatalog, false, query);
  }
});

test('apartment fallback remains an explicit opt-in for non-company search surfaces', () => {
  const step = decideCompanySearchNextStep({
    query: '아이파크',
    placeStatus: 'not-configured',
    allowApartmentCatalog: true,
  });
  assert.equal(step.kind, 'apartment-catalog');
  assert.equal(step.shouldSearchApartmentCatalog, true);
});

test('brand-bearing commercial POIs are not mislabeled as apartments', () => {
  for (const query of ['푸르지오시티3차', '아이파크몰', '롯데캐슬호텔', 'KT 광화문빌딩']) {
    const intent = classifyApartmentCatalogIntent(query);
    assert.equal(intent.eligible, false, query);
    const step = decideCompanySearchNextStep({ query, placeStatus: 'not-configured' });
    assert.equal(step.kind, 'place-search-key-required', query);
    assert.equal(step.shouldSearchApartmentCatalog, false, query);
  }
});

test('generic empty-provider outcomes distinguish no match from provider failures', () => {
  assert.equal(decideCompanySearchNextStep({
    query: 'KT', placeStatus: 'ok', addressStatus: 'ok',
  }).kind, 'no-results');
  assert.equal(decideCompanySearchNextStep({
    query: 'KT', placeStatus: 'error', addressStatus: 'ok',
  }).kind, 'place-search-error');
  assert.equal(decideCompanySearchNextStep({
    query: 'KT', placeStatus: 'error', addressStatus: 'error',
  }).kind, 'provider-error');
});

test('normalization accepts width/case variants and malformed counts safely', () => {
  assert.equal(classifyApartmentCatalogIntent('　Ｅ편한세상　').eligible, true);
  assert.equal(classifyApartmentCatalogIntent(null).eligible, false);
  const step = decideCompanySearchNextStep({
    query: 'KT',
    placeStatus: 'ok',
    placeResultsCount: -2,
    addressResultsCount: 'not-a-number',
  });
  assert.equal(step.kind, 'no-results');
  assert.equal(step.resultCount, 0);
});
