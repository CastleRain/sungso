import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PYEONG_TO_M2, parseKoreanMoneyToManWon, parseRecommendationQuery, filterCatalogForRecommendation,
  aggregateRecommendationRecords,
} from '../js/recommendation-core.mjs';

test('사용자 예시를 구조화 조건으로 해석한다', () => {
  const parsed = parseRecommendationQuery('서울 경기에서 500세대가 넘는 집, 역과 걸어서 10~20분, 회사까지 차 혹은 지하철로 1시간 안, 6억 미만, 20평 이상, 20년 안쪽', 2026);
  assert.deepEqual(parsed.filters.regions, ['seoul', 'gyeonggi']);
  assert.equal(parsed.filters.minHouseholds, 500);
  assert.equal(parsed.filters.householdsOperator, 'gt');
  assert.equal(parsed.filters.stationWalkMin, 10);
  assert.equal(parsed.filters.stationWalkMax, 20);
  assert.equal(parsed.filters.commuteMaxMinutes, 60);
  assert.deepEqual(parsed.filters.commuteModes, ['car', 'transit']);
  assert.equal(parsed.filters.maxPriceManWon, 60000);
  assert.equal(parsed.filters.priceOperator, 'lt');
  assert.ok(Math.abs(parsed.filters.minAreaM2 - (20 * PYEONG_TO_M2)) < 0.001);
  assert.equal(parsed.filters.minBuiltYear, 2006);
});

test('자연스러운 연결형 표현인 세대가 넘고도 초과로 읽는다', () => {
  const parsed = parseRecommendationQuery('서울에서 500세대가 넘고 6억 미만인 아파트', 2026);
  assert.equal(parsed.filters.minHouseholds, 500);
  assert.equal(parsed.filters.householdsOperator, 'gt');
});

test('소수 억·숫자 만원·한글 천만원 가격 표현을 같은 금액으로 읽는다', () => {
  const queries = ['9.3억 미만', '9억 3000만원 미만', '9억 3,000만원 미만', '9억 3천만원 미만', '9억 3천 미만', '9억 3천5백만원 이하'];
  const amounts = queries.map((query) => parseRecommendationQuery(query, 2026).filters.maxPriceManWon);
  assert.deepEqual(amounts, [93000, 93000, 93000, 93000, 93000, 93500]);
  const clause = parseRecommendationQuery('9억 3천만원 미만', 2026).clauses.find((item) => item.key === 'price');
  assert.equal(clause.label, '9억 3,000만원 미만');
});

test('기록과 가격 필터도 억·만원 표현을 안전한 만원 단위로 바꾼다', () => {
  assert.equal(parseKoreanMoneyToManWon('9억 3천만원'), 93000);
  assert.equal(parseKoreanMoneyToManWon('9억 3천'), 93000);
  assert.equal(parseKoreanMoneyToManWon('0억 3천5백만원'), 3500);
  assert.equal(parseKoreanMoneyToManWon('9.3억'), 93000);
  assert.equal(parseKoreanMoneyToManWon('93,000만원'), 93000);
  assert.equal(parseKoreanMoneyToManWon('93000'), 93000);
  assert.equal(parseKoreanMoneyToManWon('930,000,000원'), 93000);
  assert.equal(parseKoreanMoneyToManWon('9억abc'), null);
  assert.equal(parseKoreanMoneyToManWon('잘못된 가격'), null);
});

test('세대수 초과와 준공연도 경계를 엄격하게 지킨다', () => {
  const catalog = [
    { catalogId: 'a', regionCode: '11110', households: 500, builtYear: 2006 },
    { catalogId: 'b', regionCode: '11110', households: 501, builtYear: 2006 },
    { catalogId: 'c', regionCode: '41110', households: 900, builtYear: 2005 },
    { catalogId: 'd', regionCode: '28110', households: 900, builtYear: 2020 },
  ];
  const result = filterCatalogForRecommendation(catalog, {
    regions: ['seoul', 'gyeonggi'], minHouseholds: 500, householdsOperator: 'gt', maxAgeYears: 20,
  }, 2026);
  assert.deepEqual(result.map((item) => item.catalogId), ['b']);
});

test('동일 전용면적의 평균 실거래로 예산을 판정하고 6억 정확히는 미만에서 제외한다', () => {
  const apartments = [{ catalogId: 'a', regionCode: '11110', name: '테스트', aliases: [], dong: '가동', builtYear: 2015, households: 800 }];
  const base = { regionCode: '11110', apartmentName: '테스트아파트', dong: '가동', builtYear: 2015, dealType: '매매', aptSeq: 'S1' };
  const records = [
    { ...base, areaM2: 66.1, amountManWon: 59000, month: '2026-06', day: 1 },
    { ...base, areaM2: 66.1, amountManWon: 60000, month: '2026-07', day: 1 },
    { ...base, areaM2: 84.9, amountManWon: 60000, month: '2026-08', day: 1 },
  ];
  const result = aggregateRecommendationRecords(apartments, records, {
    regions: ['seoul'], minAreaM2: 66.0, maxPriceManWon: 60000, priceOperator: 'lt',
  }, 2026);
  assert.equal(result.length, 1);
  assert.equal(result[0].bestArea.areaM2, 66.1);
  assert.equal(result[0].bestArea.averagePriceManWon, 59500);
  assert.equal(result[0].bestArea.medianPriceManWon, 59500);
  assert.equal(result[0].qualifyingAreas.some((area) => area.areaM2 === 84.9), false);
});

test('고가 한 건을 포함한 실제 산술평균이 예산을 넘으면 후보에서 제외한다', () => {
  const apartments = [{ catalogId: 'a', regionCode: '11110', name: '테스트', aliases: [], dong: '가동', builtYear: 2015, households: 800 }];
  const base = { regionCode: '11110', apartmentName: '테스트', dong: '가동', builtYear: 2015, dealType: '매매', aptSeq: 'S1', areaM2: 84.9, month: '2026-06', day: 1 };
  const records = [50000, 50000, 80000].map((amountManWon, index) => ({ ...base, amountManWon, day: index + 1 }));
  const result = aggregateRecommendationRecords(apartments, records, {
    regions: ['seoul'], minAreaM2: 80, maxPriceManWon: 60000, priceOperator: 'lt',
  }, 2026);
  assert.deepEqual(result, []);
});

test('거래 정보가 없거나 이름이 모호한 단지는 합격 처리하지 않는다', () => {
  const apartments = [
    { catalogId: 'a', regionCode: '11110', name: '같은이름', aliases: [], dong: '가동', builtYear: 2014, households: 700 },
    { catalogId: 'b', regionCode: '11110', name: '같은이름', aliases: [], dong: '가동', builtYear: 2018, households: 800 },
    { catalogId: 'c', regionCode: '11110', name: '거래없음', aliases: [], dong: '나다동', builtYear: 2020, households: 900 },
  ];
  const records = [{ regionCode: '11110', apartmentName: '같은이름', dong: '가동', builtYear: 0, dealType: '매매', areaM2: 84.9, amountManWon: 50000, month: '2026-08', day: 1 }];
  assert.deepEqual(aggregateRecommendationRecords(apartments, records, { maxPriceManWon: 60000, minAreaM2: 66 }, 2026), []);
});

test('이름과 준공연도가 같은 단지는 지번으로만 구분하고 지번이 없으면 제외한다', () => {
  const apartments = [
    { catalogId: 'a', regionCode: '11110', name: '한빛', aliases: [], dong: '가동', address: '서울 가동 10-1', builtYear: 2018, households: 700 },
    { catalogId: 'b', regionCode: '11110', name: '한빛', aliases: [], dong: '가동', address: '서울 가동 20', builtYear: 2018, households: 800 },
  ];
  const base = { regionCode: '11110', apartmentName: '한빛', dong: '가동', builtYear: 2018, dealType: '매매', areaM2: 84.9, amountManWon: 50000, month: '2026-08', day: 1 };
  assert.equal(aggregateRecommendationRecords(apartments, [{ ...base, jibun: '20' }], { maxPriceManWon: 60000, minAreaM2: 66 }, 2026)[0].catalogId, 'b');
  assert.deepEqual(aggregateRecommendationRecords(apartments, [base], { maxPriceManWon: 60000, minAreaM2: 66 }, 2026), []);
});

test('공유 별칭보다 거래명과 정확히 같은 공식 단지명을 우선한다', () => {
  const apartments = [
    { catalogId: 'a', regionCode: '11110', name: '푸른마을1단지', aliases: ['푸른마을'], dong: '가동', builtYear: 2018, households: 700 },
    { catalogId: 'b', regionCode: '11110', name: '푸른마을', aliases: [], dong: '가동', builtYear: 2018, households: 800 },
  ];
  const records = [{ regionCode: '11110', apartmentName: '푸른마을', dong: '가동', builtYear: 2018, dealType: '매매', areaM2: 84.9, amountManWon: 50000, month: '2026-08', day: 1 }];
  assert.equal(aggregateRecommendationRecords(apartments, records, { maxPriceManWon: 60000, minAreaM2: 66 }, 2026)[0].catalogId, 'b');
});
