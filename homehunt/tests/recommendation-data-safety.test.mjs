import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregateRecommendationRecords } from '../js/recommendation-core.mjs';
import {
  completeRecommendationScope,
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

test('한 달이라도 실패한 시군구는 성공한 다른 달 자료가 있어도 추천 결과에서 통째로 제외한다', () => {
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
  assert.equal(scope.excludedCandidateCount, 1);
  assert.equal(scope.excludedRecordCount, 1);
  assert.deepEqual(scope.candidates.map((item) => item.catalogId), ['complete']);

  const results = aggregateRecommendationRecords(scope.candidates, scope.records, {
    regions: ['seoul', 'gyeonggi'],
    minAreaM2: 66,
    maxPriceManWon: 60_000,
  }, 2026);
  assert.deepEqual(results.map((item) => item.catalogId), ['complete']);
  assert.equal(results.some((item) => item.catalogId === 'incomplete' && item.priceVerified), false);
});
