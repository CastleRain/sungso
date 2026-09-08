import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregateRecommendationRecords } from '../js/recommendation-core.mjs';
import {
  completeRecommendationScope,
  buildRecommendationPriceResult,
  recommendationMonthEvidence,
  recommendationMonthFailure,
} from '../scripts/recommendation-data-safety.mjs';

const TASK = { lawdCd: '11110', dealYmd: '202608', type: 'sale' };

function completeMonth(overrides = {}) {
  return {
    lawdCd: TASK.lawdCd,
    dealYmd: TASK.dealYmd,
    type: TASK.type,
    records: [],
    ...overrides,
  };
}

test('완전한 지역·월 응답만 추천 가격 검증 자료로 인정한다', () => {
  assert.equal(recommendationMonthFailure({ status: 'fulfilled', value: completeMonth() }, TASK), null);

  const stale = recommendationMonthFailure({
    status: 'fulfilled',
    value: completeMonth({ warning: { staleCacheUsed: true, reason: 'upstream unavailable' } }),
  }, TASK);
  assert.equal(stale.kind, 'partial');
  assert.equal(stale.staleCacheUsed, true);

  const partial = recommendationMonthFailure({
    status: 'fulfilled',
    value: completeMonth({ partial: true, missingRequests: [{ reason: 'one page missing' }] }),
  }, TASK);
  assert.equal(partial.kind, 'partial');
  assert.match(partial.message, /one page missing/);

  const mismatched = recommendationMonthFailure({
    status: 'fulfilled',
    value: completeMonth({ lawdCd: '41135' }),
  }, TASK);
  assert.equal(mismatched.kind, 'invalid');

  const rejected = recommendationMonthFailure({ status: 'rejected', reason: new Error('HTTP 503') }, TASK);
  assert.equal(rejected.kind, 'failed');
  assert.equal(rejected.message, 'HTTP 503');
});

test('한 달이 실패해도 같은 시군구의 검증된 다른 달 거래는 조건별 참고 후보로 남긴다', () => {
  const apartments = [
    { catalogId: 'incomplete', regionCode: '11110', name: '불완전단지', aliases: [], dong: '가동', builtYear: 2020, households: 800 },
    { catalogId: 'complete', regionCode: '41135', name: '완전단지', aliases: [], dong: '나동', builtYear: 2020, households: 900 },
  ];
  const records = [
    {
      regionCode: '11110', apartmentName: '불완전단지', dong: '가동', builtYear: 2020,
      dealType: '매매', areaM2: 84.9, amountManWon: 50_000, month: '2026-07', day: 1,
    },
    {
      regionCode: '41135', apartmentName: '완전단지', dong: '나동', builtYear: 2020,
      dealType: '매매', areaM2: 84.9, amountManWon: 55_000, month: '2026-08', day: 1,
    },
  ];
  const scope = completeRecommendationScope(apartments, records, [
    { lawdCd: '11110', dealYmd: '202608', type: 'sale', kind: 'failed', message: 'HTTP 503' },
  ]);

  assert.deepEqual(scope.incompleteDistrictCodes, ['11110']);
  assert.equal(scope.excludedCandidateCount, 0);
  assert.equal(scope.excludedRecordCount, 0);
  assert.deepEqual(scope.candidates.map((item) => item.catalogId), ['incomplete', 'complete']);

  const results = aggregateRecommendationRecords(scope.candidates, scope.records, {
    regions: ['seoul', 'gyeonggi'],
    minAreaM2: 66,
    maxPriceManWon: 60_000,
  }, 2026);
  assert.deepEqual(results.map((item) => item.catalogId), ['incomplete', 'complete']);
  const analyzed = buildRecommendationPriceResult(apartments, records, [{ lawdCd: '11110', dealYmd: '202608', type: 'sale' }],
    ['11110', '41135'].flatMap((lawdCd) => ['202607', '202608'].map((dealYmd) => ({ lawdCd, dealYmd }))),
    { regions: ['seoul', 'gyeonggi'], minAreaM2: 66, maxPriceManWon: 60000 }, 2026);
  assert.equal(analyzed.results[0].priceProvisional, true);
  assert.equal(analyzed.results[0].priceCoverage.completedMonthCount, 1);
  assert.deepEqual(analyzed.results[0].priceCoverage.missingMonths, ['202608']);
  assert.equal(analyzed.results[1].priceProvisional, false);
});


test('only a previously complete matching stale month with original timestamp is reusable', () => {
  const record = { regionCode: TASK.lawdCd, month: '2026-08', amountManWon: 55000 };
  const value = completeMonth({ records: [record], updatedAt: '2026-09-01T00:00:00Z',
    warning: { staleCacheUsed: true } });
  const classify = (overrides = {}) => recommendationMonthEvidence({ status: 'fulfilled', value: { ...value, ...overrides } }, TASK);
  assert.equal(classify().status, 'stale');
  assert.equal(classify().sourceUpdatedAt, '2026-09-01T00:00:00Z');
  for (const override of [{ partial: true }, { missingRequests: [{}] }, { lawdCd: '41135' },
    { updatedAt: '' }, { records: [{ ...record, month: '2026-07' }] }]) {
    assert.equal(classify(override).status, 'missing');
  }
});
