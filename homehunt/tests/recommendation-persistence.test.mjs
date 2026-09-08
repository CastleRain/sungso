import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeHomehuntPersistence, sanitizePersistedRecommendationCandidate,
} from '../js/recommendation-persistence-core.mjs';
import {
  loadShortlist, saveShortlist, loadVisits, saveVisits, downloadJson,
  loadRecommendationFilters, saveRecommendationFilters,
  loadImportedMarket, saveImportedMarket, loadComplexHistory, saveComplexHistory,
} from '../js/storage.js';

const route = (provider = 'kakao-transit') => ({
  mode: provider.includes('naver') ? 'car' : 'transit', provider, verified: true,
  durationMinutes: 43, walkingMinutes: 5, transferCount: 1,
  queriedAt: '2026-09-07T01:00:00Z', landingUrl: `https://example.invalid/${provider}`,
});
const personal = () => ({
  catalogId: 'public-house', name: '공식 단지', address: '공식 주소', lat: 37.5, lng: 127,
  locationPrecision: 'complex', mapCoordinateSource: 'naver-geocoding',
  bestArea: { areaM2: 84, count: 3, averagePriceManWon: 70000 },
  parkingEvidence: { sourceType: 'field', spacesPerHousehold: 1.2, observedAt: '2026-09-06' },
  locationRecommendation: { score: 42, dimensions: { station: { score: 8 } } },
  memo: '카카오라는 단어가 있는 개인 메모도 보존', status: '관심', savedAt: '2026-09-07',
});
function candidate(provider = 'kakao-transit') {
  const routesByDestination = { office: [route(provider)] };
  const commuteBalance = { decision: 'matched', weightedMeanMinutes: 43,
    evaluations: [{ best: route(provider), routes: [route(provider)] }] };
  return { ...personal(), routesByDestination, commuteBalance,
    commuteProvider: provider, commuteVerification: { stage: 'final', provider, verifiedAt: '2026-09-07T01:00:00Z' },
    destinationFingerprint: 'input-context',
    personalizedRecommendation: { score: 82, referenceScore: 39, commuteBalance },
    score: 82, totalScore: 82,
  };
}
const derivedKeys = ['commuteBalance', 'commuteVerification', 'commuteProvider', 'destinationFingerprint',
  'personalizedRecommendation', 'score', 'totalScore'];
function expectNoCombinedResult(value) {
  for (const key of derivedKeys) assert.equal(key in value, false, `${key} must be recomputed from allowed evidence`);
}
function install(t, key, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; });
}
function storageFixture(t) {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  install(t, 'localStorage', storage);
  return { values, storage };
}
function idbFixture(t) {
  const records = new Map();
  const db = {
    objectStoreNames: { contains: () => true }, close() {},
    transaction() {
      const tx = {};
      const complete = () => queueMicrotask(() => tx.oncomplete?.());
      tx.objectStore = () => ({
        put(value, key) { records.set(key, structuredClone(value)); complete(); },
        get(key) {
          const request = {};
          queueMicrotask(() => { request.result = structuredClone(records.get(key)); request.onsuccess?.(); complete(); });
          return request;
        },
      });
      return tx;
    },
  };
  const indexedDB = { open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess?.(); }); return request; } };
  install(t, 'window', { indexedDB });
  install(t, 'indexedDB', indexedDB);
  return records;
}

test('Kakao candidates lose route evidence and all derived totals without mutating current live data', () => {
  const current = candidate();
  const before = structuredClone(current);
  const safe = sanitizePersistedRecommendationCandidate(current);
  assert.deepEqual(safe, personal());
  expectNoCombinedResult(safe);
  assert.equal('routesByDestination' in safe, false);
  assert.deepEqual(current, before);
  assert.notEqual(safe, current);
  safe.parkingEvidence.spacesPerHousehold = 2;
  assert.equal(current.parkingEvidence.spacesPerHousehold, 1.2);
});

test('TMAP and NAVER final evidence and their independent derived rankings are unchanged', () => {
  for (const provider of ['tmap-transit', 'naver-directions']) {
    const current = candidate(provider);
    assert.deepEqual(sanitizePersistedRecommendationCandidate(current), current);
  }
});

test('a Kakao screening result is removed without erasing a later independent TMAP final result', () => {
  const current = candidate('tmap-transit');
  current.commuteScreening = { provider: 'kakao', routesByDestination: { office: [route()] }, balance: { score: 91 } };
  assert.deepEqual(sanitizePersistedRecommendationCandidate(current), candidate('tmap-transit'));
});

test('mixed matrices keep attributed non-Kakao alternatives and remove the combined verdict and score', () => {
  const current = candidate();
  current.routesByDestination.office.push(route('naver-directions'), route('tmap-transit'));
  const safe = sanitizePersistedRecommendationCandidate(current);
  assert.deepEqual(safe.routesByDestination.office, [route('naver-directions'), route('tmap-transit')]);
  expectNoCombinedResult(safe);
  assert.deepEqual(sanitizePersistedRecommendationCandidate(safe), safe, 'Migration must be idempotent');
  assert.equal(current.routesByDestination.office.length, 3);
});

test('legacy provider metadata identifies untagged Kakao routes and remaining derived-only scores', () => {
  const current = candidate();
  delete current.routesByDestination.office[0].provider;
  delete current.routesByDestination.office[0].landingUrl;
  assert.equal('routesByDestination' in sanitizePersistedRecommendationCandidate(current), false);
  const derivedOnly = { ...personal(), commuteProvider: 'kakao', score: 70, totalScore: 70, weightedMeanMinutes: 32 };
  assert.deepEqual(sanitizePersistedRecommendationCandidate(derivedOnly), personal());
});

test('legacy Kakao transport flags become absent, preserving verified prices and independent provider flags', () => {
  const flags = { transportVerified: true, transportStatus: 'matched', priceVerified: true };
  const safe = sanitizePersistedRecommendationCandidate({ ...candidate(), ...flags });
  assert.deepEqual(safe, { ...personal(), priceVerified: true });
  assert.equal(Object.hasOwn(safe, 'transportVerified'), false, 'Unknown must not be persisted as a negative verdict');
  assert.equal(Object.hasOwn(safe, 'transportStatus'), false);
  assert.deepEqual(sanitizeHomehuntPersistence({ provider: 'kakao', ...flags }), { priceVerified: true });
  for (const provider of ['tmap-transit', 'naver-directions']) {
    const independent = { ...candidate(provider), ...flags };
    assert.deepEqual(sanitizePersistedRecommendationCandidate(independent), independent);
  }
  assert.deepEqual(sanitizeHomehuntPersistence({ provider: 'kakao', dailyLimit: 1000, preferSubway: true }),
    { provider: 'kakao', dailyLimit: 1000, preferSubway: true }, 'A provider preference is an input, not route evidence');
});

test('a mixed legacy best/routes wrapper cannot keep its Kakao fastest-route summary', () => {
  const current = { ...personal(), commute: { best: route(), routes: [route(), route('naver-directions')], withinLimit: true } };
  const safe = sanitizePersistedRecommendationCandidate(current);
  assert.deepEqual(safe.commute, [route('naver-directions')]);
  assert.equal(safe.commute.best, undefined);
});

test('provider provenance nested only in a computed ranking is enough to discard that derived data', () => {
  const current = { ...personal(), personalizedRecommendation: { score: 80,
    commuteBalance: { evaluations: [{ best: route() }] } }, score: 80 };
  assert.deepEqual(sanitizePersistedRecommendationCandidate(current), personal());
});

test('JSON envelopes remove nested route evidence while preserving prices, personal profiles and official coordinates', () => {
  const profile = { targetPriceManWon: 70000, maxOverBudgetPct: 10, destinations: [
    { id: 'office', label: '직접 입력 회사', lat: 37.5, lng: 127, weightPercent: 10, required: false },
  ], source: 'kakao-postcode', customNote: 'Kakao 메모', score: 2 };
  const input = { version: 2, visits: [candidate()], candidates: [candidate('tmap-transit')],
    recommendationFilters: profile, market: { total: 3, score: 2, records: [{ amountManWon: 70000 }] } };
  const safe = sanitizeHomehuntPersistence(input);
  assert.deepEqual(safe.visits, [personal()]);
  assert.deepEqual(safe.candidates, input.candidates);
  assert.deepEqual(safe.recommendationFilters, profile);
  assert.deepEqual(safe.market, input.market);
  assert.deepEqual(sanitizeHomehuntPersistence([route(), route('naver-directions')]), [route('naver-directions')]);
  assert.equal(sanitizeHomehuntPersistence(route()), null);
});

test('saving a shortlist sanitizes disk data while keeping the current in-memory candidate available', t => {
  const { values } = storageFixture(t);
  const current = [candidate(), candidate('tmap-transit')];
  saveShortlist(current);
  const written = JSON.parse(values.get('homehunt_shortlist_v1'));
  assert.deepEqual(written, [personal(), candidate('tmap-transit')]);
  assert.deepEqual(loadShortlist(), written);
  assert.equal(current[0].routesByDestination.office[0].provider, 'kakao-transit');
});

test('loading old shortlist and visits migrates persisted Kakao evidence and keeps personal records', t => {
  const { values } = storageFixture(t);
  for (const [key, read] of [['homehunt_shortlist_v1', loadShortlist], ['homehunt_visits_v1', loadVisits]]) {
    values.set(key, JSON.stringify([candidate()]));
    assert.deepEqual(read(), [personal()]);
    assert.deepEqual(JSON.parse(values.get(key)), [personal()]);
  }
});

test('a failed migration write never makes loading return the prohibited old route evidence', t => {
  const { values, storage } = storageFixture(t);
  values.set('homehunt_shortlist_v1', JSON.stringify([candidate()]));
  storage.setItem = () => { throw new Error('storage unavailable'); };
  assert.deepEqual(loadShortlist(), [personal()]);
});

test('imported visits and exported backups both pass the same persistence boundary', async t => {
  const { values } = storageFixture(t);
  let exported;
  install(t, 'URL', { createObjectURL(blob) { exported = blob; return 'blob:fixture'; }, revokeObjectURL() {} });
  install(t, 'document', { body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) });
  const backup = { version: 2, visits: [candidate()], compareIds: ['public-house'] };
  saveVisits(backup.visits);
  assert.deepEqual(JSON.parse(values.get('homehunt_visits_v1')), [personal()]);
  downloadJson('fixture.json', backup);
  assert.deepEqual(JSON.parse(await exported.text()), { version: 2, visits: [personal()], compareIds: ['public-house'] });
  assert.ok(backup.visits[0].personalizedRecommendation.score > 0);
});

test('budget and company settings remain unchanged through the common localStorage boundary', t => {
  storageFixture(t);
  const filters = { targetPriceManWon: 70000, maxPriceManWon: 77000, maxOverBudgetPct: 10,
    destinations: [{ id: 'office', label: '직접 입력', lat: 37.5, lng: 127, weightPercent: 10, required: false }],
    minParkingRatio: 1, requireParking: true, preferSubway: true };
  saveRecommendationFilters(filters);
  assert.deepEqual(loadRecommendationFilters(), filters);
});

test('IndexedDB imported-price and history caches sanitize writes and migrate legacy reads', async t => {
  const records = idbFixture(t);
  const summary = { version: 1, records: [{ amountManWon: 70000 }], candidates: [candidate()] };
  await saveImportedMarket(summary);
  assert.deepEqual(records.get('imported-summary').candidates, [personal()]);
  records.set('imported-summary', structuredClone(summary));
  assert.deepEqual((await loadImportedMarket()).candidates, [personal()]);
  assert.deepEqual(records.get('imported-summary').candidates, [personal()]);
  const identity = { months: 1, endMonth: '2026-08' };
  const payload = { months: 1, endMonth: '2026-08', rangeStart: '2026-08', rangeEnd: '2026-08',
    includesCurrentMonth: false, partial: false, records: summary.records, candidate: candidate() };
  await saveComplexHistory('11650', '공식 단지', payload, identity);
  const historyKey = [...records.keys()].find(key => key.startsWith('complex:'));
  assert.deepEqual(records.get(historyKey).candidate, personal());
  records.get(historyKey).candidate = candidate();
  assert.deepEqual((await loadComplexHistory('11650', '공식 단지', identity)).candidate, personal());
  assert.deepEqual(records.get(historyKey).candidate, personal());
  assert.deepEqual(records.get(historyKey).records, summary.records);
});
