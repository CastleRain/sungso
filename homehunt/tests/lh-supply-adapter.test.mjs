import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectLhSupplySource,
  fingerprintLhSupplyNotice,
  normalizeLhNoticeForHomeSupply,
} from '../scripts/lh-supply-adapter.mjs';
import { LhSupplyProviderError } from '../scripts/lh-supply-provider.mjs';

function providerNotice(overrides = {}) {
  return {
    id: 'lh:LH-2026-1',
    source: 'lh',
    sourceNoticeId: 'LH-2026-1',
    idStability: 'official',
    category: 'sale',
    categoryCode: '05',
    categoryName: '분양주택',
    subcategory: '공공분양',
    name: '서울 테스트 공공분양',
    regionCode: '11',
    regionName: '서울특별시',
    matchedRegionCodes: ['11'],
    status: '공고중',
    noticeDate: '2026-09-04',
    closeDate: '2026-09-20',
    officialUrl: 'https://apply.lh.or.kr/test/1',
    newlywedClassification: 'none',
    ...overrides,
  };
}

test('LH 분양주택을 가격·면적을 꾸며내지 않는 공통 분양 스키마로 바꾼다', () => {
  const notice = normalizeLhNoticeForHomeSupply(providerNotice(), {
    generatedAt: '2026-09-04T00:00:00.000Z',
  });

  assert.equal(notice.id, 'lh:LH-2026-1');
  assert.equal(notice.source, 'lh');
  assert.equal(notice.sourceLabel, '한국토지주택공사 청약플러스');
  assert.equal(notice.program, 'public-sale');
  assert.equal(notice.tenure, 'sale');
  assert.equal(notice.announcementDate, '2026-09-04');
  assert.equal(notice.applicationStartDate, null);
  assert.equal(notice.applicationEndDate, null);
  assert.equal(notice.schedules[0].kind, 'notice-window');
  assert.equal(notice.schedules.some(({ kind }) => kind === 'application'), false);
  assert.deepEqual(notice.locations[0], {
    regionKey: 'seoul', sidoCode: '11', sido: '서울특별시', district: '', address: '',
    lat: null, lng: null, coordinateAccuracy: 'none', locationScope: 'query-match',
  });
  assert.equal(notice.totalUnits, null);
  assert.equal(notice.maxPriceManWon, null);
  assert.deepEqual(notice.homes, []);
  assert.equal(notice.fingerprint, fingerprintLhSupplyNotice(notice));
});

test('구조화된 39 코드만 신혼희망타운으로 확정하고 제목 키워드는 후보로만 둔다', () => {
  const official = normalizeLhNoticeForHomeSupply(providerNotice({
    categoryCode: '39',
    category: 'newlywed-town',
    categoryName: '신혼희망타운',
    newlywedClassification: 'structured-type',
  }));
  assert.equal(official.program, 'newlywed-town');
  assert.equal(official.newlywedSupplyAvailable, true);
  assert.deepEqual(official.targetGroups, ['신혼부부']);
  assert.equal(official.eligibilityRequiresCheck, true);

  const keyword = normalizeLhNoticeForHomeSupply(providerNotice({
    name: '신혼부부 대상 서울 공공분양',
    newlywedClassification: 'keyword-candidate',
  }));
  assert.equal(keyword.program, 'public-sale');
  assert.equal(keyword.newlywedSupplyAvailable, null);
  assert.deepEqual(keyword.targetGroups, []);
  assert.equal(keyword.newlywedClassification, 'keyword-candidate');
});

test('39의 점유형태는 세부유형 근거가 있을 때만 분양 또는 임대로 정한다', () => {
  const unknown = normalizeLhNoticeForHomeSupply(providerNotice({ categoryCode: '39', subcategory: '' }));
  const sale = normalizeLhNoticeForHomeSupply(providerNotice({ categoryCode: '39', subcategory: '신혼희망타운 공공분양' }));
  const rental = normalizeLhNoticeForHomeSupply(providerNotice({ categoryCode: '39', subcategory: '신혼희망타운 행복주택 임대' }));
  assert.equal(unknown.tenure, 'unknown');
  assert.equal(sale.tenure, 'sale');
  assert.equal(rental.tenure, 'rent');
});

test('기본 수집은 05·39만 요청하고 임대 06은 명시적으로 켤 때만 포함한다', async () => {
  const defaultCalls = [];
  const fetchNoticesImpl = async ({ typeCodes, regionCodes }) => {
    defaultCalls.push(`${typeCodes[0]}:${regionCodes[0]}`);
    return { requestCount: 1, queries: [{ typeCode: typeCodes[0], regionCode: regionCodes[0] }], notices: [] };
  };
  await collectLhSupplySource({
    serviceKey: 'fake', fromDate: '2026-09-01', toDate: '2026-09-30', fetchNoticesImpl,
  });
  assert.deepEqual(defaultCalls.sort(), ['05:11', '05:41', '39:11', '39:41']);

  const rentalCalls = [];
  await collectLhSupplySource({
    serviceKey: 'fake', fromDate: '2026-09-01', toDate: '2026-09-30', includeRental: true,
    fetchNoticesImpl: async ({ typeCodes, regionCodes }) => {
      rentalCalls.push(`${typeCodes[0]}:${regionCodes[0]}`);
      return { requestCount: 1, queries: [], notices: [] };
    },
  });
  assert.equal(rentalCalls.some((value) => value.startsWith('06:')), true);
});

test('서울·경기 양쪽에서 반환된 전국 공고를 하나로 합치고 두 query-match 위치를 보존한다', async () => {
  const result = await collectLhSupplySource({
    serviceKey: 'fake', fromDate: '2026-09-01', toDate: '2026-09-30', typeCodes: ['39'],
    fetchNoticesImpl: async ({ regionCodes }) => ({
      requestCount: 1,
      queries: [{ typeCode: '39', regionCode: regionCodes[0] }],
      notices: [providerNotice({
        id: 'lh:NATIONWIDE', sourceNoticeId: 'NATIONWIDE', categoryCode: '39',
        matchedRegionCodes: [regionCodes[0]], regionCode: regionCodes[0], regionName: '전국',
      })],
    }),
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.notices.length, 1);
  assert.deepEqual(result.notices[0].matchedRegionCodes, ['11', '41']);
  assert.deepEqual(result.notices[0].locations.map(({ sidoCode }) => sidoCode), ['11', '41']);
  assert.equal(result.notices[0].regionName, '서울·경기');
});

test('일부 query 실패는 성공 공고를 유지하고 비밀값 없는 partial coverage로 반환한다', async () => {
  const secret = 'must-not-leak';
  const result = await collectLhSupplySource({
    serviceKey: secret, fromDate: '2026-09-01', toDate: '2026-09-30', typeCodes: ['05'],
    fetchNoticesImpl: async ({ regionCodes }) => {
      if (regionCodes[0] === '41') {
        throw new LhSupplyProviderError(`upstream failed ${secret}`, {
          code: 'HTTP_ERROR', httpStatus: 503,
        });
      }
      return {
        requestCount: 1,
        queries: [{ typeCode: '05', regionCode: '11' }],
        notices: [providerNotice()],
      };
    },
  });

  assert.equal(result.status, 'partial');
  assert.equal(result.notices.length, 1);
  assert.equal(result.coverage.successfulQueryCount, 1);
  assert.equal(result.coverage.failedQueryCount, 1);
  assert.equal(result.coverage.errors[0].httpStatus, 503);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('전체 query 실패도 예외로 성공처럼 만들지 않고 error 상태와 빈 결과를 반환한다', async () => {
  const result = await collectLhSupplySource({
    serviceKey: 'fake', fromDate: '2026-09-01', toDate: '2026-09-30', typeCodes: ['05'],
    fetchNoticesImpl: async () => {
      throw new LhSupplyProviderError('failed', { code: 'NETWORK_ERROR' });
    },
  });

  assert.equal(result.status, 'error');
  assert.deepEqual(result.notices, []);
  assert.equal(result.lastSuccessfulAt, null);
  assert.equal(result.coverage.failedQueryCount, 2);
});
