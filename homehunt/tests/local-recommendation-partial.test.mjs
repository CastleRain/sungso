import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { normalizeRecommendationFilters, filterCatalogForRecommendation } from '../js/recommendation-core.mjs';
import { buildRecommendationPriceResult, recommendationMonthEvidence, recommendationMonthFailure,
  recommendationTaskKey } from '../scripts/recommendation-data-safety.mjs';

const source = readFileSync(new URL('../scripts/local-market-server.mjs', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('async function runPool('), source.indexOf('async function cacheStats('));
const apt = { catalogId: 'test-apartment', regionCode: '41135', name: '공식테스트단지', dong: '검증동',
  aliases: [], households: 500, builtYear: 2020 };
const filters = { regions: ['gyeonggi'], minHouseholds: 100, maxPriceManWon: 60000,
  minAreaM2: 50, maxAgeYears: 30, months: 2 };
function month(lawdCd, dealYmd, amountManWon = 55000) {
  return { lawdCd, dealYmd, type: 'sale', updatedAt: '2026-09-08T00:00:00Z', records: [{
    regionCode: lawdCd, month: `${dealYmd.slice(0, 4)}-${dealYmd.slice(4)}`, day: 1,
    dealType: '매매', apartmentName: apt.name, dong: apt.dong, builtYear: apt.builtYear,
    areaM2: 59.9, amountManWon,
  }] };
}
function harness(loadMolitMonth, apartments = [apt]) {
  const sandbox = { normalizeRecommendationFilters, filterCatalogForRecommendation,
    buildRecommendationPriceResult, recommendationMonthEvidence, recommendationMonthFailure, recommendationTaskKey,
    loadMolitMonth, loadCatalog: async () => ({ apartments }), requestedMonths: () => ['202609', '202608'],
    crypto: { randomUUID: () => 'local-test-job' }, jobs: new Map(),
    RECOMMENDATION_CONCURRENCY: 4, RECOMMENDATION_RETRY_CONCURRENCY: 2, RETRY_PAUSE_MS: 0,
    sleep: async () => {}, Map, Set, Date };
  vm.runInNewContext(code, sandbox);
  return sandbox;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('actual local worker preserves successful months and retries only failed tasks with idempotent merge', async () => {
  const calls = [];
  let recover = false;
  const env = harness(async (lawdCd, dealYmd) => {
    calls.push(dealYmd);
    if (dealYmd === '202608' && !recover) throw new Error('fetch failed');
    return month(lawdCd, dealYmd, dealYmd === '202608' ? 59000 : 50000);
  });
  const job = await env.startRecommendationJob(filters);
  await job.worker;
  const initial = env.publicJob(job);
  assert.equal(initial.resultCount, 1);
  assert.equal(initial.partialPriceCandidateCount, 1);
  assert.equal(initial.results[0].bestArea.count, 1);
  assert.equal(initial.failedRequestCount, 1);
  recover = true;
  env.retryRecommendationJob(job);
  const running = env.publicJob(job);
  assert.equal(running.status, 'running');
  assert.equal(running.resultCount, 1);
  env.retryRecommendationJob(job);
  await job.worker;
  const done = env.publicJob(job);
  assert.equal(done.results[0].bestArea.count, 2);
  assert.equal(done.results[0].bestArea.averagePriceManWon, 54500);
  assert.equal(done.results[0].priceProvisional, false);
  assert.equal(done.completedRequestCount, 2);
  assert.equal(done.retryAvailable, false);
  assert.deepEqual(calls, ['202609', '202608', '202608', '202608']);
  env.retryRecommendationJob(job);
  assert.equal(calls.length, 4);
});

test('actual local worker keeps valid stale official samples dated, but never incomplete pages', async () => {
  let missing = false;
  const env = harness(async (lawdCd, dealYmd) => {
    const value = month(lawdCd, dealYmd, 53000);
    if (dealYmd === '202608') {
      if (missing) throw new Error('refresh unavailable');
      return { ...value, updatedAt: '2026-09-01T00:00:00Z', warning: { staleCacheUsed: true } };
    }
    return value;
  });
  const job = await env.startRecommendationJob(filters); await job.worker;
  const before = plain(env.publicJob(job));
  assert.equal(before.results[0].priceCoverage.status, 'stale');
  assert.equal(before.results[0].priceCoverage.sourceUpdatedAt, '2026-09-01T00:00:00Z');
  assert.equal(before.results[0].bestArea.count, 2);
  assert.equal(before.completedRequestCount, 1);
  assert.equal(before.staleRequestCount, 1);
  missing = true;
  env.retryRecommendationJob(job); await job.worker;
  assert.deepEqual(plain(env.publicJob(job).results), before.results);
  assert.equal(env.publicJob(job).retryAvailable, true);
});

test('actual local worker exposes all unpriced base candidates without zero or invented prices', async () => {
  const env = harness(async () => { throw new Error('HTTP 503'); }, [apt, { ...apt, catalogId: 'other', name: '다른단지' }]);
  const job = await env.startRecommendationJob(filters); await job.worker;
  const result = env.publicJob(job);
  assert.equal(result.status, 'complete');
  assert.equal(result.partial, true);
  assert.equal(result.resultCount, 0);
  assert.equal(result.pendingPriceCandidateCount, 2);
  assert.equal(result.failedRequestCount, 2);
  assert.ok(result.pendingPriceCandidates.every(candidate => candidate.priceVerified === false && candidate.bestArea === undefined));
});
