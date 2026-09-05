import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NAVER_LOCAL_SEARCH_ENDPOINT,
  NaverLocalSearchError,
  buildNaverLocalSearchRequest,
  fetchNaverLocalSearch,
  normalizeNaverLocalSearch,
  stripNaverMarkup,
} from '../scripts/naver-local-search.mjs';

const TEST_ID = 'not-a-real-developers-id';
const TEST_SECRET = 'not-a-real-developers-secret';

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

test('builds the NAVER Developers local search request without exposing credentials in the URL', () => {
  const request = buildNaverLocalSearchRequest({
    query: '  푸르지오시티3차  ',
    clientId: TEST_ID,
    clientSecret: TEST_SECRET,
  });
  const url = new URL(request.url);
  assert.equal(`${url.origin}${url.pathname}`, NAVER_LOCAL_SEARCH_ENDPOINT);
  assert.equal(url.searchParams.get('query'), '푸르지오시티3차');
  assert.equal(url.searchParams.get('display'), '5');
  assert.equal(url.searchParams.get('start'), '1');
  assert.equal(url.searchParams.get('sort'), 'random');
  assert.equal(url.searchParams.has('format'), false);
  assert.equal(request.init.headers['X-Naver-Client-Id'], TEST_ID);
  assert.equal(request.init.headers['X-Naver-Client-Secret'], TEST_SECRET);
  assert.equal(request.url.includes(TEST_ID), false);
  assert.equal(request.url.includes(TEST_SECRET), false);
});

test('normalizes WGS84 mapx/mapy and removes NAVER title markup', () => {
  assert.deepEqual(normalizeNaverLocalSearch({
    items: [{
      title: '<b>정자동3차 푸르지오</b> 시티 &amp; 상가',
      category: '부동산&gt;오피스텔',
      address: '경기도 성남시 분당구 정자동 135',
      roadAddress: '경기도 성남시 분당구 정자일로 135',
      mapx: '127.1051234',
      mapy: '37.3671234',
    }],
  }), [{
    source: 'naver-developers-local',
    placeName: '정자동3차 푸르지오 시티 & 상가',
    category: '부동산>오피스텔',
    roadAddress: '경기도 성남시 분당구 정자일로 135',
    jibunAddress: '경기도 성남시 분당구 정자동 135',
    lat: 37.3671234,
    lng: 127.1051234,
  }]);
});

test('normalizes fixed-point WGS84 coordinates returned by the NAVER Developers response', () => {
  assert.deepEqual(normalizeNaverLocalSearch({
    items: [{
      title: '<b>KT분당본사타워</b>',
      category: '기업',
      address: '경기도 성남시 분당구 정자동',
      roadAddress: '경기도 성남시 분당구 불정로 90',
      mapx: '1271148922',
      mapy: '373588408',
    }],
  }), [{
    source: 'naver-developers-local',
    placeName: 'KT분당본사타워',
    category: '기업',
    roadAddress: '경기도 성남시 분당구 불정로 90',
    jibunAddress: '경기도 성남시 분당구 정자동',
    lat: 37.3588408,
    lng: 127.1148922,
  }]);
});

test('drops invalid coordinates and duplicate place rows', () => {
  const repeated = {
    title: '같은 곳', address: '서울', mapx: '126.98', mapy: '37.56',
  };
  assert.equal(normalizeNaverLocalSearch({ items: [
    repeated,
    repeated,
    { title: '좌표 오류', mapx: '999', mapy: '37.56' },
  ] }).length, 1);
});

test('rejects invalid queries and missing credential pairs before network access', () => {
  assert.throws(
    () => buildNaverLocalSearchRequest({ query: '가', clientId: TEST_ID, clientSecret: TEST_SECRET }),
    (error) => error instanceof NaverLocalSearchError && error.code === 'INVALID_QUERY',
  );
  assert.throws(
    () => buildNaverLocalSearchRequest({ query: '회사', clientId: '', clientSecret: TEST_SECRET }),
    (error) => error instanceof NaverLocalSearchError && error.code === 'MISSING_CREDENTIAL',
  );
});

test('fetch wrapper maps data and redacts credentials from HTTP errors', async () => {
  const params = { query: '테스트 회사', clientId: TEST_ID, clientSecret: TEST_SECRET };
  const result = await fetchNaverLocalSearch(params, {
    fetchImpl: async (url, init) => {
      assert.equal(url.includes(TEST_SECRET), false);
      assert.equal(init.headers['X-Naver-Client-Id'], TEST_ID);
      assert.equal(init.headers['X-Naver-Client-Secret'], TEST_SECRET);
      return jsonResponse({ items: [{ title: '<b>테스트</b>', mapx: 127, mapy: 37 }] });
    },
  });
  assert.equal(result[0].placeName, '테스트');

  await assert.rejects(
    fetchNaverLocalSearch(params, { fetchImpl: async () => jsonResponse({}, { ok: false, status: 401 }) }),
    (error) => {
      assert.equal(error.code, 'HTTP_ERROR');
      assert.equal(error.message.includes(TEST_ID), false);
      assert.equal(error.message.includes(TEST_SECRET), false);
      return true;
    },
  );
});

test('markup stripping decodes safe common entities', () => {
  assert.equal(stripNaverMarkup('<b>A&amp;B</b>&nbsp;&#x2F;C'), 'A&B /C');
});
