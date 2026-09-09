import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRecommendationRecords } from '../js/recommendation-core.mjs';
import { buildRecommendationPriceResult } from '../scripts/recommendation-data-safety.mjs';
import { createCandidateReviewBookmark, mergeLiveReviewCandidates, mergeSavedTransactionActivity } from '../js/candidate-review-core.mjs';
import { normalizeCloudSnapshot } from '../js/cloud-snapshot-core.mjs';

const apartment = { catalogId: 'activity-home', regionCode: '11110', name: '공식테스트단지',
  dong: '가동', builtYear: 2010, households: 500, aliases: [] };
const filters = { regions: ['seoul'], minAreaM2: 66, maxPriceManWon: 60000, priceOperator: 'lte', months: 3 };
const tasks = ['202607', '202608', '202609'].map(dealYmd => ({ lawdCd: '11110', dealYmd, type: 'sale' }));
const sale = (id, extra = {}) => ({ id, regionCode: apartment.regionCode, apartmentName: apartment.name,
  dong: apartment.dong, builtYear: apartment.builtYear, dealType: '매매', month: '2026-08', day: 1,
  areaM2: 84.9, amountManWon: 55000, ...extra });
const analyze = (records, failures = [], staleTasks = [], selectedTasks = tasks) =>
  buildRecommendationPriceResult([apartment], records, failures, selectedTasks, filters, 2026, staleTasks);
const total = activity => activity.monthlyCounts.reduce((sum, row) => sum + row.count, 0);
const rows = activity => activity.monthlyCounts;
const snapshot = { filters, destinations: [] };
const saveTime = '2026-09-10T01:00:00.000Z';

test('whole-complex activity precedes area and price filtering and stays inside the requested months', () => {
  const records = [
    sale('qualified-july', { month: '2026-07' }),
    sale('small-july', { month: '2026-07', areaM2: 39.5, amountManWon: 20000 }),
    sale('expensive-august', { areaM2: 119, amountManWon: 90000 }),
    sale('qualified-september', { month: '2026-09', amountManWon: 58000 }),
    sale('outside-before', { month: '2026-06', amountManWon: 10000 }),
    sale('outside-after', { month: '2026-10', amountManWon: 10000 }),
    sale('other-dong', { dong: '나동' }),
  ];
  const original = structuredClone(records);
  const result = analyze(records).results[0];
  assert.deepEqual(result.transactionActivity, {
    version: 1, scope: 'complex-sale', status: 'complete',
    requestedMonths: ['2026-07', '2026-08', '2026-09'],
    monthlyCounts: [{ month: '2026-07', count: 2 }, { month: '2026-08', count: 1 }, { month: '2026-09', count: 1 }],
    sourceUpdatedAt: null,
  });
  assert.equal(result.actualDealCount, 3, 'legacy count retains the area-qualified scope');
  assert.equal(result.bestArea.count, 2);
  assert.equal(result.bestArea.averagePriceManWon, 56500);
  assert.equal(result.qualifyingAreas.length, 1);
  assert.equal(result.areas.length, 2);
  assert.deepEqual(records, original);
});

test('cancelled, duplicated known IDs and invalid sales do not inflate volume or price evidence', () => {
  const records = [sale('repeated'), sale('repeated'), sale('distinct-a'), sale('distinct-b'), sale(), sale(),
    sale('revoked'), sale('revoked', { cancelled: true }), sale('revoked'),
    sale('cancel-flag', { cdealType: 'O' }), sale('cancel-date', { cdealDay: '2026-08-20' }),
    sale('cancel-korean', { '해제여부': 'O' }),
    sale('negative', { amountManWon: -1 }), sale('zero', { amountManWon: 0 }),
    sale('bad-price', { amountManWon: 'bad' }), sale('bad-area', { areaM2: 0 }),
    sale('bad-month', { month: '2026-13' }), sale('rent', { dealType: '전세' })];
  const result = analyze(records).results[0];
  assert.equal(total(result.transactionActivity), 5);
  assert.equal(result.bestArea.count, 5);
  assert.equal(result.actualDealCount, 5);
  assert.equal(result.bestArea.averagePriceManWon, 55000);
  assert.deepEqual(rows(result.transactionActivity), [
    { month: '2026-07', count: 0 }, { month: '2026-08', count: 5 }, { month: '2026-09', count: 0 },
  ]);
});

test('known transaction IDs are scoped by district and month and cancellation order is irrelevant', () => {
  const records = [sale('same', { month: '2026-07', cancelled: true }), sale('same', { month: '2026-07' }),
    sale('same'), sale('same', { month: '2026-09' }), sale('same', { regionCode: '41135' })];
  const result = analyze(records).results[0];
  assert.deepEqual(rows(result.transactionActivity), [
    { month: '2026-07', count: 0 }, { month: '2026-08', count: 1 }, { month: '2026-09', count: 1 },
  ]);
});

test('confirmed zero-sale months and missing source months remain different through retry', () => {
  const failed = [{ ...tasks[1], kind: 'failed' }];
  const records = [sale('july', { month: '2026-07' }), sale('unusable-failed-month')];
  const initial = analyze(records, failed).results[0];
  assert.equal(initial.transactionActivity.status, 'partial');
  assert.deepEqual(rows(initial.transactionActivity), [{ month: '2026-07', count: 1 }, { month: '2026-09', count: 0 }]);
  assert.equal(initial.priceProvisional, true);
  const restored = analyze(records).results[0];
  assert.equal(restored.transactionActivity.status, 'complete');
  assert.deepEqual(rows(restored.transactionActivity), [
    { month: '2026-07', count: 1 }, { month: '2026-08', count: 1 }, { month: '2026-09', count: 0 },
  ]);
  assert.equal(restored.bestArea.count, 2);
});

test('validated stale months keep their actual counts and original collection date', () => {
  const stamp = '2026-09-01T00:00:00.000Z';
  const failed = [{ ...tasks[1], kind: 'partial' }];
  const prior = [{ ...tasks[1], sourceUpdatedAt: stamp }];
  const result = analyze([sale('july', { month: '2026-07' }), sale('older-copy')], failed, prior).results[0];
  assert.equal(result.transactionActivity.status, 'stale');
  assert.equal(result.transactionActivity.sourceUpdatedAt, stamp);
  assert.deepEqual(rows(result.transactionActivity), [
    { month: '2026-07', count: 1 }, { month: '2026-08', count: 1 }, { month: '2026-09', count: 0 },
  ]);
});

test('pending price candidates retain known activity below the area threshold without inventing missing months', () => {
  const result = analyze([sale('small-july', { month: '2026-07', areaM2: 39.5 })], [{ ...tasks[1] }]);
  assert.equal(result.results.length, 0);
  assert.equal(result.pendingPriceCandidates.length, 1);
  assert.deepEqual(rows(result.pendingPriceCandidates[0].transactionActivity), [
    { month: '2026-07', count: 1 }, { month: '2026-09', count: 0 },
  ]);
  const unavailable = analyze([], tasks).pendingPriceCandidates[0].transactionActivity;
  assert.equal(unavailable.status, 'missing');
  assert.deepEqual(unavailable.monthlyCounts, []);
  assert.deepEqual(unavailable.requestedMonths, ['2026-07', '2026-08', '2026-09']);
});

test('legacy/direct aggregates never infer a whole search interval from only transaction dates', () => {
  const result = aggregateRecommendationRecords([apartment], [sale('observed')], filters, 2026)[0];
  assert.equal(Object.hasOwn(result, 'transactionActivity'), false);
  assert.equal(result.bestArea.count, 1);
  const noTasks = analyze([sale('observed')], [], [], []).results[0];
  assert.equal(Object.hasOwn(noTasks, 'transactionActivity'), false);
  const bookmarked = createCandidateReviewBookmark(result, snapshot, { now: saveTime });
  assert.equal(Object.hasOwn(bookmarked, 'transactionActivity'), false);
  const restored = normalizeCloudSnapshot({ shortlist: [bookmarked] }).shortlist[0];
  assert.equal(Object.hasOwn(restored, 'transactionActivity'), false);
});

test('official activity survives bookmark, live merge, JSON and cloud round trips without scores or route payloads', () => {
  const candidate = analyze([sale('actual')]).results[0];
  const expected = structuredClone(candidate.transactionActivity);
  candidate.transactionActivity.score = 5;
  candidate.transactionActivity.commutePassed = true;
  candidate.transactionActivity.monthlyCounts[1].route = { provider: 'kakao', durationMinutes: 42 };
  const bookmark = createCandidateReviewBookmark(candidate, snapshot, { now: saveTime });
  assert.deepEqual(bookmark.transactionActivity, expected);
  assert.deepEqual(mergeLiveReviewCandidates([bookmark], [])[0].transactionActivity, expected);
  bookmark.transactionActivity.hiddenRoute = { provider: 'kakao', durationMinutes: 42 };
  const safe = normalizeCloudSnapshot({ shortlist: [bookmark] });
  const restored = normalizeCloudSnapshot(JSON.parse(JSON.stringify(safe))).shortlist[0];
  assert.deepEqual(restored.transactionActivity, expected);
  assert.doesNotMatch(JSON.stringify(restored.transactionActivity), /score|commutePassed|hiddenRoute|durationMinutes|kakao/);
});

test('partial activity with absent months survives storage without turning absence into zero', () => {
  const candidate = analyze([sale('july', { month: '2026-07' })], [tasks[1]]).results[0];
  const bookmark = createCandidateReviewBookmark(candidate, snapshot, { now: saveTime });
  const restored = normalizeCloudSnapshot(JSON.parse(JSON.stringify({ shortlist: [bookmark] }))).shortlist[0];
  assert.deepEqual(restored.transactionActivity, candidate.transactionActivity);
  assert.equal(restored.transactionActivity.status, 'partial');
  assert.equal(restored.transactionActivity.monthlyCounts.some(row => row.month === '2026-08'), false);
});

test('explicit activity refresh preserves saved prices and notes and copies no live routes or scores', () => {
  const candidate = analyze([sale('first')]).results[0];
  const saved = createCandidateReviewBookmark(candidate, snapshot, { now: saveTime });
  saved.address = '서울시 가동 1';
  saved.aptSeq = '11110-1';
  saved.memo = '현장에서 주차 확인';
  const fresh = analyze([sale('first'), sale('second')]).results[0];
  fresh.address = saved.address;
  fresh.aptSeq = saved.aptSeq;
  fresh.bestArea.averagePriceManWon = 90000;
  fresh.memo = '새 객체의 다른 메모';
  fresh.routesByDestination = { work: [{ provider: 'kakao', durationMinutes: 42 }] };
  fresh.personalizedRecommendation = { score: 100 };
  fresh.transactionActivity.score = 5;
  const originalSaved = structuredClone(saved), originalFresh = structuredClone(fresh);
  const merged = mergeSavedTransactionActivity([saved], [fresh]);
  assert.equal(total(merged[0].transactionActivity), 2);
  assert.equal(merged[0].bestArea.averagePriceManWon, saved.bestArea.averagePriceManWon);
  assert.equal(merged[0].memo, saved.memo);
  assert.equal(merged[0].savedAt, saved.savedAt);
  assert.deepEqual(merged[0].review, saved.review);
  assert.equal(Object.hasOwn(merged[0], 'routesByDestination'), false);
  assert.equal(Object.hasOwn(merged[0], 'personalizedRecommendation'), false);
  assert.equal(Object.hasOwn(merged[0].transactionActivity, 'score'), false);
  assert.deepEqual(saved, originalSaved);
  assert.deepEqual(fresh, originalFresh);
  merged[0].bestArea.count = 99;
  merged[0].transactionActivity.monthlyCounts[1].count = 99;
  assert.deepEqual(saved, originalSaved);
  assert.deepEqual(fresh, originalFresh);
});

test('activity refresh requires a matching catalog ID without conflicting or ambiguous house identity', () => {
  const saved = { ...analyze([sale('old')]).results[0], address: '서울시 가동 1', aptSeq: '11110-1', memo: '보존' };
  const fresh = { ...analyze([sale('old'), sale('new')]).results[0], address: saved.address, aptSeq: saved.aptSeq };
  for (const candidates of [
    [{ ...fresh, catalogId: 'another-house' }],
    [{ ...fresh, address: '서울시 가동 2' }],
    [{ ...fresh, aptSeq: '11110-2' }],
    [{ ...fresh, transactionActivity: { ...fresh.transactionActivity, scope: 'selected-area-sale' } }],
    [fresh, { ...fresh }],
    [],
  ]) assert.deepEqual(mergeSavedTransactionActivity([saved], candidates), [saved]);
  const legacy = { id: saved.catalogId, memo: 'catalogId 없는 구 기록' };
  assert.deepEqual(mergeSavedTransactionActivity([legacy], [fresh]), [legacy]);
  const mixed = mergeSavedTransactionActivity([saved, { ...saved, catalogId: 'untouched' }], [fresh]);
  assert.equal(total(mixed[0].transactionActivity), 2);
  assert.equal(total(mixed[1].transactionActivity), 1);
});
