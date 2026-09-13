import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchHistoryProgressively, historyRequestPlan, historyElapsedLabel, missingHistoryDetails, isCompleteHistoryPayload } from '../js/history-query-service.mjs';

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test('stale or contradictory missing-month payloads cannot replace a complete cache', () => {
  assert.equal(isCompleteHistoryPayload({ records: [], partial: false, missingRequests: [] }), true);
  assert.equal(isCompleteHistoryPayload({ records: [], partial: true }), false);
  assert.equal(isCompleteHistoryPayload({ records: [], partial: false, stale: true }), false);
  assert.equal(isCompleteHistoryPayload({ records: [], partial: false, missingRequests: [{ dealYmd: '202609' }] }), false);
  assert.equal(isCompleteHistoryPayload({ records: [], missingRequests: 'invalid' }), false);
  assert.equal(isCompleteHistoryPayload({ records: null }), false);
});

test('first uncached long query shows 12 months before the selected range; complete caches make one call', () => {
  assert.deepEqual(historyRequestPlan(60), [12, 60]);
  assert.deepEqual(historyRequestPlan(36), [12, 36]);
  assert.deepEqual(historyRequestPlan(12), [12]);
  assert.deepEqual(historyRequestPlan(60, { hasUsableCache: true }), [60]);
  assert.deepEqual(historyRequestPlan(60, { progressive: false }), [60]);
});

test('preview remains in its actual range and preserves every apartment identity parameter', async () => {
  const events = [];
  const result = await fetchHistoryProgressively({
    url: 'http://localhost/api/apartment-history?aptName=단지&lawdCd=41171&dong=안양동&endMonth=2026-09', months: 60,
    onPhase: ({ months, completedMonths }) => events.push(['phase', months, completedMonths]),
    validatePreview: (payload, months) => payload.months === months && !payload.partial,
    onPreview: (payload) => events.push(['preview', payload.months]),
    fetchImpl: async (url) => {
      assert.equal(url.searchParams.get('lawdCd'), '41171');
      assert.equal(url.searchParams.get('aptName'), '단지');
      assert.equal(url.searchParams.get('dong'), '안양동');
      assert.equal(url.searchParams.get('endMonth'), '2026-09');
      const months = Number(url.searchParams.get('months'));
      return response({ months, partial: false, records: [] });
    },
  });
  assert.deepEqual(events, [['phase', 12, 0], ['preview', 12], ['phase', 60, 12]]);
  assert.equal(result.payload.months, 60);
});

test('partial short response is never announced as completed or published as a complete preview', async () => {
  const completed = [];
  let previewed = false;
  await fetchHistoryProgressively({
    url: 'http://localhost/history', months: 36,
    fetchImpl: async (url) => response({ months: Number(url.searchParams.get('months')), partial: true }),
    validatePreview: (payload) => !payload.partial,
    onPreview: () => { previewed = true; },
    onPhase: ({ completedMonths }) => completed.push(completedMonths),
  });
  assert.equal(previewed, false);
  assert.deepEqual(completed, [0, 0]);
});

test('cancellation after the short response blocks a queued expansion', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(fetchHistoryProgressively({
    url: 'http://localhost/history', months: 60, signal: controller.signal,
    fetchImpl: async () => { calls += 1; return response({ months: 12 }); },
    validatePreview: () => true,
    onPreview: () => controller.abort(),
  }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('late fetch response cannot publish a cancelled query even if transport ignores the signal', async () => {
  const controller = new AbortController();
  let resolveFetch;
  let previews = 0;
  const pending = fetchHistoryProgressively({
    url: 'http://localhost/history', months: 60, signal: controller.signal,
    fetchImpl: () => new Promise((resolve) => { resolveFetch = resolve; }),
    validatePreview: () => true, onPreview: () => { previews += 1; },
  });
  controller.abort();
  resolveFetch(response({ months: 12 }));
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(previews, 0);
});

test('authentication and throttling failures return once without starting the longer request', async () => {
  for (const status of [409, 429, 503]) {
    let calls = 0;
    const result = await fetchHistoryProgressively({
      url: 'http://localhost/history', months: 60,
      fetchImpl: async () => { calls += 1; return response({ error: 'unavailable' }, status); },
    });
    assert.equal(result.response.status, status);
    assert.equal(calls, 1);
  }
});

test('expansion failure keeps the already published short response available to its caller', async () => {
  let preview;
  const result = await fetchHistoryProgressively({
    url: 'http://localhost/history', months: 60,
    validatePreview: () => true,
    onPreview: (payload) => { preview = payload; },
    fetchImpl: async (url) => Number(url.searchParams.get('months')) === 12
      ? response({ months: 12, records: [{ id: 'actual-contract' }] }) : response({}, 502),
  });
  assert.equal(result.response.status, 502);
  assert.equal(preview.months, 12);
  assert.equal(preview.records[0].id, 'actual-contract');
});

test('elapsed time is a duration and missing-month reasons omit raw provider secrets', () => {
  assert.equal(historyElapsedLabel(1000, 66000), '1분 5초 경과');
  assert.equal(historyElapsedLabel(1000, 1000), '0초 경과');
  assert.deepEqual(missingHistoryDetails([
    { dealYmd: '202608', type: 'sale', reason: '429 URL?serviceKey=secret' },
    { dealYmd: '2026-07', type: 'rent', reason: 'request timeout', staleCacheUsed: true },
    { dealYmd: '<bad>', type: '<bad>', reason: 'https://provider.example/key=secret' },
  ]), [
    '2026년 8월 · 매매 · 공급원 요청 한도',
    '2026년 7월 · 전월세 · 응답 시간 초과 · 이전 저장본 사용',
    '월 미확인 · 거래유형 미확인 · 공급원 인증 확인 필요',
  ]);
});
