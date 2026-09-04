import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  fetchApartmentHistoryDirect,
  parseMolitResponse,
  resolveHistoryRange,
} = require('../../functions/molit.js');

test('서울 월 경계에서 12·36·60개월 범위를 같은 기준 월로 계산한다', () => {
  const now = new Date('2026-08-31T15:00:00.000Z'); // 2026-09-01 00:00 KST
  assert.deepEqual(
    [12, 36, 60].map((months) => resolveHistoryRange({ months, now })),
    [
      { months: 12, endMonth: '2026-09', rangeStart: '2025-10', rangeEnd: '2026-09', includesCurrentMonth: true, endIndex: 24320 },
      { months: 36, endMonth: '2026-09', rangeStart: '2023-10', rangeEnd: '2026-09', includesCurrentMonth: true, endIndex: 24320 },
      { months: 60, endMonth: '2026-09', rangeStart: '2021-10', rangeEnd: '2026-09', includesCurrentMonth: true, endIndex: 24320 },
    ],
  );
});

test('실거래 제공 이전이나 미래 기준 월은 거부한다', () => {
  assert.throws(() => resolveHistoryRange({ months: 12, endMonth: '0000-01', now: new Date('2026-09-03T00:00:00Z') }), /Invalid endMonth/);
  assert.throws(() => resolveHistoryRange({ months: 60, endMonth: '2010-11', now: new Date('2026-09-03T00:00:00Z') }), /Invalid endMonth/);
  assert.throws(() => resolveHistoryRange({ months: 12, endMonth: '2026-10', now: new Date('2026-09-03T00:00:00Z') }), /Invalid endMonth/);
});

test('단지 직접 조회는 주입된 월 로더로 매매·임대 범위 전체를 읽고 범위를 반환한다', async () => {
  const calls = [];
  const payload = await fetchApartmentHistoryDirect({
    serviceKey: 'test-service-key',
    lawdCd: '11680',
    aptName: '래미안',
    months: 12,
    endMonth: '2025-01',
    monthLoader: async ({ dealYmd, type }) => {
      calls.push(`${dealYmd}:${type}`);
      return {
        totalCount: dealYmd === '202501' && type === 'sale' ? 1 : 0,
        records: dealYmd === '202501' && type === 'sale' ? [{
          id: 'sale-1', aptSeq: 'A-1', apartmentName: '래미안', dong: '역삼동', builtYear: 2020,
          month: '2025-01', day: 3, areaM2: 84.9, floor: 10,
        }] : [],
      };
    },
  });

  assert.equal(calls.length, 24);
  assert.deepEqual(calls.slice(0, 2), ['202402:sale', '202402:rent']);
  assert.deepEqual(calls.slice(-2), ['202501:sale', '202501:rent']);
  assert.equal(payload.months, 12);
  assert.equal(payload.rangeStart, '2024-02');
  assert.equal(payload.rangeEnd, '2025-01');
  assert.equal(payload.includesCurrentMonth, false);
  assert.equal(payload.records.length, 1);
});

test('공공데이터 게이트웨이 오류를 빈 거래 성공으로 처리하지 않는다', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <OpenAPI_ServiceResponse><cmmMsgHeader>
      <errMsg>SERVICE ERROR</errMsg>
      <returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg>
      <returnReasonCode>22</returnReasonCode>
    </cmmMsgHeader></OpenAPI_ServiceResponse>`;
  assert.throws(
    () => parseMolitResponse(xml, 'sale', '11680'),
    /MOLIT GATEWAY 22.*LIMITED_NUMBER/,
  );
});

test('정상 0건 XML은 유효한 빈 결과로 처리한다', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header>
    <body><items></items><numOfRows>1000</numOfRows><pageNo>1</pageNo><totalCount>0</totalCount></body></response>`;
  assert.deepEqual(parseMolitResponse(xml, 'sale', '11680'), []);
});

test('HTML이나 잘린 응답은 정상 데이터로 캐시하지 않는다', () => {
  assert.throws(
    () => parseMolitResponse('<html><title>Bad Gateway</title></html>', 'sale', '11680'),
    /response format is invalid/,
  );
});
