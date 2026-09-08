import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createMemoryFirestore } from './helpers/firestore-memory.mjs';
import { createRecommendationJobService } from '../server/recommendation-jobs.mjs';
import { recommendationMonthFailure } from '../scripts/recommendation-data-safety.mjs';
const require = createRequire(import.meta.url);
const { loadMolitMonthWithFirestoreCache, fetchMolitMonthDirect, fetchApartmentHistoryDirect } = require('../../functions/molit.js');
const serviceKey = 'test-only-service-key';
const identity = { lawdCd: '41135', dealYmd: '202609', type: 'sale' };
const xml = `<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items><item>
  <aptNm>검증아파트</aptNm><aptSeq>test-apt</aptSeq><umdNm>검증동</umdNm><sggCd>41135</sggCd>
  <dealYear>2026</dealYear><dealMonth>9</dealMonth><dealDay>1</dealDay><dealAmount>55,000</dealAmount>
  <excluUseAr>59.9</excluUseAr><buildYear>2005</buildYear><floor>7</floor>
  </item></items><numOfRows>1000</numOfRows><pageNo>1</pageNo><totalCount>1</totalCount></body></response>`;
const response = (body = xml) => ({ ok: true, status: 200, text: async () => body });
function mockFetch(t, implementation) {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => { globalThis.fetch = original; });
}

test('actual Firestore month loader preserves request identity for the recommendation safety gate and subsequent cache hits', async t => {
  const db = createMemoryFirestore();
  let calls = 0;
  mockFetch(t, async () => { calls++; return response(); });
  const live = await loadMolitMonthWithFirestoreCache({ db, serviceKey, ...identity });
  assert.equal(recommendationMonthFailure({ status: 'fulfilled', value: live }, identity), null);
  assert.equal(live.records[0].amountManWon, 55000);
  assert.equal(live.source, 'upstream');
  const cached = await loadMolitMonthWithFirestoreCache({ db, serviceKey, ...identity });
  assert.equal(recommendationMonthFailure({ status: 'fulfilled', value: cached }, identity), null);
  assert.equal(cached.source, 'cache');
  assert.equal(calls, 1);
});

test('cloud job aggregates the real signed Firestore month envelope rather than returning zero invalid months', async t => {
  const db = createMemoryFirestore();
  mockFetch(t, async () => response());
  const service = createRecommendationJobService({ db, now: () => Date.parse('2026-09-08T01:00:00Z'),
    loadCatalog: async () => ({ apartments: [{ catalogId: 'test-home', regionCode: '41135', name: '검증아파트',
      dong: '검증동', aliases: [], households: 500, builtYear: 2005 }] }),
    loadMonth: request => loadMolitMonthWithFirestoreCache({ ...request, db, serviceKey }), idFactory: () => 'actual-month-loader-job',
  });
  const user = { householdId: 'test-household', uid: 'test-user' };
  const created = await service.create({ regions: ['gyeonggi'], minHouseholds: 100, maxAgeYears: 30,
    minAreaM2: 50, maxPriceManWon: 60000, months: 1 }, user);
  const result = await service.advance(created.jobId, user);
  assert.equal(result.status, 'complete');
  assert.equal(result.failedRequestCount, 0);
  assert.equal(result.resultCount, 1);
  assert.equal(result.results[0].bestArea.averagePriceManWon, 55000);
});

test('already-aborted month loads perform neither database work nor provider calls', async t => {
  const db = createMemoryFirestore();
  let calls = 0;
  mockFetch(t, async () => { calls++; return response(); });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadMolitMonthWithFirestoreCache({ db, serviceKey, ...identity, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
  assert.equal(db.calls.reads, 0);
  assert.equal(db.calls.writes, 0);
});

test('job timeout signal aborts the active upstream request without retrying or writing a cache', async t => {
  const db = createMemoryFirestore();
  const controller = new AbortController();
  let calls = 0, aborted = 0;
  mockFetch(t, async (_url, { signal }) => {
    calls++;
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => { aborted++; reject(signal.reason); }, { once: true });
      controller.abort();
    });
  });
  await assert.rejects(loadMolitMonthWithFirestoreCache({ db, serviceKey, ...identity, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
  assert.equal(aborted, 1);
  assert.equal(db.calls.writes, 0);
});

test('an upstream response that arrives after cancellation cannot start another page or cache its data', async t => {
  const db = createMemoryFirestore();
  const controller = new AbortController();
  let calls = 0;
  mockFetch(t, async () => {
    calls++;
    return { ok: true, status: 200, text: async () => {
      controller.abort();
      return xml.replace('<totalCount>1</totalCount>', '<totalCount>1001</totalCount>');
    } };
  });
  await assert.rejects(loadMolitMonthWithFirestoreCache({ db, serviceKey, ...identity, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
  assert.equal(db.calls.writes, 0);
});

test('cancellation during retry backoff stops the next network attempt', async t => {
  const db = createMemoryFirestore();
  const controller = new AbortController();
  let calls = 0;
  mockFetch(t, async () => {
    calls++;
    setTimeout(() => controller.abort(), 5);
    return { ok: false, status: 503 };
  });
  await assert.rejects(loadMolitMonthWithFirestoreCache({ db, serviceKey, ...identity, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
  assert.equal(db.calls.writes, 0);
});

test('direct month callers also propagate cancellation instead of continuing pagination/retry', async t => {
  const controller = new AbortController();
  let calls = 0;
  mockFetch(t, async (_url, { signal }) => {
    calls++;
    controller.abort();
    assert.equal(signal.aborted, true);
    return response();
  });
  await assert.rejects(fetchMolitMonthDirect({ serviceKey, ...identity, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('a shared history deadline retains completed months and starts no further monthly network work', async t => {
  const db = createMemoryFirestore();
  const controller = new AbortController();
  let calls = 0;
  mockFetch(t, async url => {
    calls++;
    if (calls === 2) controller.abort();
    const requested = new URL(url).searchParams.get('DEAL_YMD');
    return response(xml.replace('<dealYear>2026</dealYear>', `<dealYear>${requested.slice(0, 4)}</dealYear>`)
      .replace('<dealMonth>9</dealMonth>', `<dealMonth>${requested.slice(4)}</dealMonth>`));
  });
  const result = await fetchApartmentHistoryDirect({ serviceKey, lawdCd: '41135', aptName: '검증아파트', months: 3,
    endMonth: '2025-01', concurrency: 1,
    monthLoader: request => loadMolitMonthWithFirestoreCache({ ...request, db, serviceKey, signal: controller.signal }),
  });
  assert.equal(calls, 2);
  assert.equal(result.partial, true);
  assert.equal(result.records.length, 1);
  assert.equal(result.missingRequests.length, 5);
  assert.equal(db.calls.writes, 1);
});
