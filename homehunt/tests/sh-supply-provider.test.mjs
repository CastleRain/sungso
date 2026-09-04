import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SH_RSS_URL,
  ShSupplyProviderError,
  classifyShRssItem,
  collectShSupplySource,
  decodeShRssBytes,
  fetchShSupplyNotices,
  normalizeShRssItem,
  parseShRssXml,
} from '../scripts/sh-supply-provider.mjs';

const NOW = new Date('2026-09-04T03:00:00.000Z');

function item(overrides = {}) {
  return {
    title: '고덕강일 공공분양주택 입주자모집공고',
    link: 'http://www.i-sh.co.kr/app/lay2/program/S48T561C562/www/brd/m_244/view.do?multi_itm_seq=1&seq=309749',
    content: '<p>서울 고덕강일지구 분양주택 입주자 모집 공고입니다.</p>',
    pubDate: 'Fri, 04 Sep 2026 10:00:00 +0900',
    ...overrides,
  };
}

function xmlFor(items) {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>${items.map((value) => `<item><title><![CDATA[${value.title}]]></title><link>${value.link.replaceAll('&', '&amp;')}</link><content:encoded><![CDATA[${value.content}]]></content:encoded><pubDate>${value.pubDate}</pubDate></item>`).join('')}</channel></rss>`;
}

function responseFrom(bytes, contentType = 'application/rss+xml; charset=EUC-KR') {
  const body = bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(bytes);
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        if (name.toLowerCase() === 'content-type') return contentType;
        if (name.toLowerCase() === 'content-length') return String(body.byteLength);
        return null;
      },
    },
    async arrayBuffer() {
      return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    },
  };
}

test('EUC-KR bytes를 한글 RSS 텍스트로 복원한다', () => {
  const bytes = Buffer.from('bad0bee7c1d6c5c320c0d4c1d6c0dab8f0c1fdb0f8b0ed', 'hex');
  assert.equal(decodeShRssBytes(bytes, 'EUC-KR'), '분양주택 입주자모집공고');
});

test('DOCTYPE 또는 ENTITY가 든 XML은 처리하지 않는다', () => {
  assert.throws(
    () => parseShRssXml('<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel /></rss>'),
    (error) => error instanceof ShSupplyProviderError && error.code === 'SH_RSS_UNSAFE_XML',
  );
});

test('RSS item 필드와 CDATA·XML entity를 안전하게 파싱한다', () => {
  const parsed = parseShRssXml(xmlFor([item()]));
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].title, item().title);
  assert.match(parsed.items[0].link, /seq=309749/);
  assert.match(parsed.items[0].content, /입주자 모집 공고/);
});

test('주택분양 모집공고만 확정하고 임대·결과·일반 정보는 제외한다', () => {
  assert.equal(classifyShRssItem(item()).classification, 'housing-sale-notice');
  assert.equal(classifyShRssItem(item({ title: '행복주택 예비입주자 모집공고' })).include, false);
  assert.equal(classifyShRssItem(item({ title: '공공분양 청약 접수결과 및 경쟁률' })).include, false);
  assert.equal(classifyShRssItem(item({ title: '공공분양 공급계획 안내', content: '' })).include, false);
  const candidate = classifyShRssItem(item({
    title: '위례 나눔형 사전예약 안내',
    content: '공급 공고를 확인하세요.',
  }));
  assert.equal(candidate.classification, 'housing-sale-candidate');
  assert.equal(candidate.notificationEligible, false);
});

test('SH seq를 stable ID로 쓰고 동일 공식 도메인의 http 링크만 https로 올린다', () => {
  const notice = normalizeShRssItem(item(), { now: NOW });
  assert.equal(notice.id, 'sh:309749');
  assert.equal(notice.sourceNoticeId, '309749');
  assert.equal(notice.idStability, 'official');
  assert.equal(notice.notificationEligible, true);
  assert.equal(notice.officialUrl.startsWith('https://www.i-sh.co.kr/'), true);
  assert.equal(notice.noticeDate, '2026-09-04');
  assert.equal(notice.locations[0].sidoCode, '11');

  const cancelled = normalizeShRssItem(item({
    title: '공공분양주택 입주자 모집공고 취소',
  }), { now: NOW });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.notificationEligible, false);

  assert.equal(normalizeShRssItem(item({ link: 'https://evil.example/notice?seq=309749' }), { now: NOW }), null);
  assert.equal(normalizeShRssItem(item({ link: 'https://www.i-sh.co.kr/notice-without-sequence' }), { now: NOW }), null);
});

test('신혼 키워드는 구조화된 자격으로 확정하지 않는다', () => {
  const notice = normalizeShRssItem(item({
    title: '신혼부부 대상 공공분양주택 입주자모집공고',
  }), { now: NOW });
  assert.equal(notice.newlywedClassification, 'keyword-candidate');
  assert.equal(notice.newlywedSupplyAvailable, null);
  assert.deepEqual(notice.targetGroups, []);
  assert.deepEqual(notice.eligibilityTags, []);
});

test('공식 RSS를 무인증 GET하고 응답 charset으로 디코딩한다', async () => {
  let requestedUrl = '';
  let requestedOptions;
  const result = await fetchShSupplyNotices({
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedOptions = options;
      return responseFrom(xmlFor([item()]), 'application/rss+xml; charset=UTF-8');
    },
  });
  assert.equal(requestedUrl, SH_RSS_URL);
  assert.equal(requestedOptions.method, 'GET');
  assert.equal('authorization' in Object.fromEntries(Object.entries(requestedOptions.headers).map(([key, value]) => [key.toLowerCase(), value])), false);
  assert.equal(result.items.length, 1);
  assert.equal(result.charset, 'utf-8');
});

test('수집 결과에 포함·제외 범위와 공식 공고만 기록한다', async () => {
  const result = await collectShSupplySource({
    now: NOW,
    fetchNoticesImpl: async () => ({
      requestCount: 1,
      charset: 'euc-kr',
      responseBytes: 500,
      items: [
        item(),
        item({ title: '국민임대주택 예비입주자 모집공고', link: 'https://www.i-sh.co.kr/notice?seq=2' }),
        item({ title: '주택분양 공급계획 안내', content: '', link: 'https://www.i-sh.co.kr/notice?seq=3' }),
      ],
    }),
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.notices.length, 1);
  assert.equal(result.coverage.rawItemCount, 3);
  assert.equal(result.coverage.includedNoticeCount, 1);
  assert.equal(result.coverage.excludedItemCount, 2);
  assert.equal(result.coverage.errors.length, 0);
});

test('HTTP 오류는 상태와 비밀 없는 오류 코드로 반환한다', async () => {
  await assert.rejects(
    () => fetchShSupplyNotices({
      fetchImpl: async () => ({ ok: false, status: 503, headers: { get: () => null } }),
    }),
    (error) => error instanceof ShSupplyProviderError
      && error.code === 'SH_RSS_HTTP_ERROR'
      && error.httpStatus === 503,
  );
});
