import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LH_NOTICE_TYPE_CODES,
  LH_REGION_CODES,
  LH_SUPPLY_NOTICE_ENDPOINT,
  LhSupplyProviderError,
  buildLhSupplyNoticeRequest,
  fetchLhSupplyNotices,
  normalizeLhDate,
  normalizeLhSupplyPayload,
} from '../scripts/lh-supply-provider.mjs';

const TEST_KEY = 'not-a-real-data-go-key%2Bvalue%3D';

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

function legacyPayload(rows, { code = 'Y', at = '20260904123000' } = {}) {
  return [
    { dsSch: [{}] },
    { resHeader: [{ SS_CODE: code, RS_DTTM: at }], dsList: rows },
  ];
}

function notice(overrides = {}) {
  return {
    PAN_SS: '공고중',
    RNUM: '1',
    PAN_NT_ST_DT: '2026.09.04',
    AIS_TP_CD: '10',
    SPL_INF_TP_CD: '050',
    CNP_CD: '11',
    CNP_CD_NM: '서울특별시',
    PAN_ID: 'LH-2026-0001',
    UPP_AIS_TP_CD: '05',
    UPP_AIS_TP_NM: '분양주택',
    AIS_TP_CD_NM: '공공분양',
    CLSG_DT: '2026.09.20',
    PAN_NM: '서울 테스트 공공분양',
    ALL_CNT: '1',
    DTL_URL: 'https://apply.lh.or.kr/LH/index.html?gv_param=PAN_ID:LH-2026-0001,LCC:Y',
    CCR_CNNT_SYS_DS_CD: '02',
    ...overrides,
  };
}

test('uses the documented LH endpoint and exact request parameter names', () => {
  const request = buildLhSupplyNoticeRequest({
    serviceKey: TEST_KEY,
    fromDate: '2026-09-01',
    toDate: '2026.09.30',
    typeCode: '39',
    regionCode: '41',
    page: 2,
    pageSize: 50,
    noticeName: '신혼희망타운',
    status: '공고중',
  });
  const url = new URL(request.url);

  assert.equal(`${url.origin}${url.pathname}`, LH_SUPPLY_NOTICE_ENDPOINT);
  assert.equal(url.searchParams.get('ServiceKey'), 'not-a-real-data-go-key+value=');
  assert.equal(url.searchParams.get('PG_SZ'), '50');
  assert.equal(url.searchParams.get('PAGE'), '2');
  assert.equal(url.searchParams.get('PAN_NM'), '신혼희망타운');
  assert.equal(url.searchParams.get('UPP_AIS_TP_CD'), '39');
  assert.equal(url.searchParams.get('CNP_CD'), '41');
  assert.equal(url.searchParams.get('PAN_SS'), '공고중');
  assert.equal(url.searchParams.get('PAN_NT_ST_DT'), '2026.09.01');
  assert.equal(url.searchParams.get('CLSG_DT'), '2026.09.30');
  assert.deepEqual(request.init, { method: 'GET', headers: { accept: 'application/json' } });
});

test('validates dates and limits collection to sale, rental, newlywed town, Seoul, and Gyeonggi', () => {
  assert.equal(normalizeLhDate('20260904'), '2026-09-04');
  assert.equal(normalizeLhDate('2026.09.04'), '2026-09-04');
  assert.throws(() => normalizeLhDate('2026-02-30'), RangeError);
  assert.throws(() => buildLhSupplyNoticeRequest({
    serviceKey: TEST_KEY,
    fromDate: '2026-09-01',
    toDate: '2026-09-30',
    typeCode: '13',
    regionCode: '11',
  }), RangeError);
  assert.throws(() => buildLhSupplyNoticeRequest({
    serviceKey: TEST_KEY,
    fromDate: '2026-09-01',
    toDate: '2026-09-30',
    typeCode: '05',
    regionCode: '26',
  }), RangeError);
});

test('normalizes the LH legacy array envelope and retains the official raw fields', () => {
  const payload = legacyPayload([notice({ PAN_ID: '', UPP_AIS_TP_CD: '39', UPP_AIS_TP_NM: '신혼희망타운' })]);
  const result = normalizeLhSupplyPayload(payload, {
    requestedTypeCode: '39',
    requestedRegionCode: '11',
  });

  assert.equal(result.responseCode, 'Y');
  assert.equal(result.responseAt, '20260904123000');
  assert.equal(result.totalCount, 1);
  assert.equal(result.notices.length, 1);
  assert.deepEqual(result.notices[0], {
    id: 'lh:LH-2026-0001',
    source: 'lh',
    sourceNoticeId: 'LH-2026-0001',
    idStability: 'official',
    category: 'newlywed-town',
    categoryCode: '39',
    categoryName: '신혼희망타운',
    subcategory: '공공분양',
    subcategoryCode: '10',
    supplyInfoTypeCode: '050',
    name: '서울 테스트 공공분양',
    address: null,
    supplyLocation: null,
    regionCode: '11',
    regionName: '서울특별시',
    matchedRegionCodes: ['11'],
    status: '공고중',
    noticeDate: '2026-09-04',
    closeDate: '2026-09-20',
    applyStart: null,
    applyEnd: null,
    officialUrl: 'https://apply.lh.or.kr/LH/index.html?gv_param=PAN_ID:LH-2026-0001,LCC:Y',
    isNewlywedTown: true,
    isNewlywedRelevant: true,
    newlywedClassification: 'structured-type',
    connectionSystemCode: '02',
    rowNumber: 1,
    totalCount: 1,
    raw: payload[1].dsList[0],
  });
});

test('derived fallback id is stable when provider row order changes', () => {
  const firstRow = notice({ PAN_ID: '', DTL_URL: '', RNUM: '1' });
  const laterRow = { ...firstRow, RNUM: '77' };
  const first = normalizeLhSupplyPayload(legacyPayload([firstRow]), {
    requestedTypeCode: '05', requestedRegionCode: '11',
  }).notices[0];
  const later = normalizeLhSupplyPayload(legacyPayload([laterRow]), {
    requestedTypeCode: '05', requestedRegionCode: '11',
  }).notices[0];

  assert.equal(first.idStability, 'derived');
  assert.equal(first.sourceNoticeId, later.sourceNoticeId);
  assert.equal(first.id, later.id);
});

test('paginates until ALL_CNT is reached and returns stable normalized notices', async () => {
  const calls = [];
  const rows = [
    notice({ PAN_ID: 'A', RNUM: '1', ALL_CNT: '3', PAN_NT_ST_DT: '2026.09.03' }),
    notice({ PAN_ID: 'B', RNUM: '2', ALL_CNT: '3', PAN_NT_ST_DT: '2026.09.04' }),
    notice({ PAN_ID: 'C', RNUM: '3', ALL_CNT: '3', PAN_NT_ST_DT: '2026.09.02' }),
  ];
  const fetchImpl = async (requestUrl) => {
    const url = new URL(requestUrl);
    calls.push(url);
    const page = Number(url.searchParams.get('PAGE'));
    return jsonResponse(legacyPayload(page === 1 ? rows.slice(0, 2) : rows.slice(2)));
  };

  const result = await fetchLhSupplyNotices({
    serviceKey: TEST_KEY,
    fromDate: '2026-09-01',
    toDate: '2026-09-30',
    typeCodes: [LH_NOTICE_TYPE_CODES.sale],
    regionCodes: [LH_REGION_CODES.seoul],
    pageSize: 2,
    fetchImpl,
    now: () => Date.parse('2026-09-04T03:00:00.000Z'),
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((url) => url.searchParams.get('PAGE')), ['1', '2']);
  assert.equal(result.requestCount, 2);
  assert.equal(result.queriedAt, '2026-09-04T03:00:00.000Z');
  assert.deepEqual(result.range, { fromDate: '2026-09-01', toDate: '2026-09-30' });
  assert.deepEqual(result.notices.map((item) => item.sourceNoticeId), ['B', 'A', 'C']);
  assert.deepEqual(result.queries[0], {
    typeCode: '05',
    regionCode: '11',
    pages: 2,
    rawCount: 3,
    reportedTotal: 3,
  });
});

test('continues pagination when ALL_CNT is absent until a short page is returned', async () => {
  const pages = [];
  const fetchImpl = async (requestUrl) => {
    const page = Number(new URL(requestUrl).searchParams.get('PAGE'));
    pages.push(page);
    const row = notice({ PAN_ID: `NO-TOTAL-${page}` });
    delete row.ALL_CNT;
    return jsonResponse(legacyPayload(page < 3 ? [row] : []));
  };

  const result = await fetchLhSupplyNotices({
    serviceKey: TEST_KEY,
    fromDate: '2026-09-01',
    toDate: '2026-09-30',
    typeCodes: ['05'],
    regionCodes: ['11'],
    pageSize: 1,
    fetchImpl,
  });

  assert.deepEqual(pages, [1, 2, 3]);
  assert.equal(result.notices.length, 2);
  assert.equal(result.queries[0].reportedTotal, null);
});

test('defaults to the six supported type-region combinations and filters contradictory rows', async () => {
  const requests = [];
  const fetchImpl = async (requestUrl) => {
    const url = new URL(requestUrl);
    const typeCode = url.searchParams.get('UPP_AIS_TP_CD');
    const regionCode = url.searchParams.get('CNP_CD');
    requests.push(`${typeCode}:${regionCode}`);
    const regionName = regionCode === '11' ? '서울특별시' : '경기도';
    return jsonResponse(legacyPayload([
      notice({
        PAN_ID: `${typeCode}-${regionCode}`,
        UPP_AIS_TP_CD: typeCode,
        CNP_CD: regionCode,
        CNP_CD_NM: regionName,
        ALL_CNT: '2',
      }),
      notice({
        PAN_ID: `wrong-${typeCode}-${regionCode}`,
        UPP_AIS_TP_CD: typeCode,
        CNP_CD: regionCode === '11' ? '41' : '11',
        ALL_CNT: '2',
      }),
    ]));
  };

  const result = await fetchLhSupplyNotices({
    serviceKey: TEST_KEY,
    fromDate: '2026-09-01',
    toDate: '2026-09-30',
    pageSize: 100,
    fetchImpl,
  });

  assert.deepEqual(requests.sort(), ['05:11', '05:41', '06:11', '06:41', '39:11', '39:41']);
  assert.equal(result.notices.length, 6);
  assert.equal(result.notices.some((item) => item.sourceNoticeId.startsWith('wrong-')), false);
});

test('deduplicates a nationwide notice returned by both region queries and records both matches', async () => {
  const fetchImpl = async (requestUrl) => {
    const url = new URL(requestUrl);
    return jsonResponse(legacyPayload([
      notice({
        PAN_ID: 'NATIONWIDE-1',
        UPP_AIS_TP_CD: url.searchParams.get('UPP_AIS_TP_CD'),
        CNP_CD: '',
        CNP_CD_NM: '전국',
      }),
    ]));
  };
  const result = await fetchLhSupplyNotices({
    serviceKey: TEST_KEY,
    fromDate: '2026-09-01',
    toDate: '2026-09-30',
    typeCodes: ['39'],
    fetchImpl,
  });

  assert.equal(result.notices.length, 1);
  assert.deepEqual(result.notices[0].matchedRegionCodes, ['11', '41']);
});

test('returns safe HTTP and provider errors without echoing the service key or request URL', async () => {
  await assert.rejects(
    fetchLhSupplyNotices({
      serviceKey: TEST_KEY,
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      typeCodes: ['05'],
      regionCodes: ['11'],
      fetchImpl: async () => jsonResponse({}, { ok: false, status: 401 }),
    }),
    (error) => {
      assert.equal(error instanceof LhSupplyProviderError, true);
      assert.equal(error.code, 'HTTP_ERROR');
      assert.equal(error.httpStatus, 401);
      assert.equal(JSON.stringify(error).includes(TEST_KEY), false);
      assert.equal(JSON.stringify(error).includes('ServiceKey'), false);
      return true;
    },
  );

  assert.throws(
    () => normalizeLhSupplyPayload(legacyPayload([], { code: 'E' }), {
      requestedTypeCode: '05',
      requestedRegionCode: '11',
    }),
    (error) => error instanceof LhSupplyProviderError && error.code === 'UPSTREAM_ERROR',
  );
});

test('fails closed when pagination exceeds the configured safety limit', async () => {
  await assert.rejects(
    fetchLhSupplyNotices({
      serviceKey: TEST_KEY,
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      typeCodes: ['06'],
      regionCodes: ['41'],
      pageSize: 1,
      maxPagesPerQuery: 1,
      fetchImpl: async () => jsonResponse(legacyPayload([
        notice({ UPP_AIS_TP_CD: '06', CNP_CD: '41', CNP_CD_NM: '경기도', ALL_CNT: '2' }),
      ])),
    }),
    (error) => error instanceof LhSupplyProviderError
      && error.code === 'PAGE_LIMIT'
      && error.query.typeCode === '06'
      && error.query.regionCode === '41',
  );
});
