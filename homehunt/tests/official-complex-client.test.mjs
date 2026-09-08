import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficialComplexClient, normalizeOfficialComplexInfo } from '../js/official-complex-client.mjs';
import { officialComplexMatchNote } from '../js/official-complex-match-note.mjs';
import { rankPersonalizedCandidates } from '../js/personalized-ranking-core.mjs';

const T0 = Date.parse('2026-09-08T00:00:00.000Z');
const candidate = { catalogId: 'reb-fixture-1', id: 'price-fixture-1', name: '가상아파트', amountManWon: 59000 };
function dto(extra = {}) {
  return { schemaVersion: 1, provider: 'kapt', catalogId: candidate.catalogId, status: 'matched',
    kaptCode: 'A10000001', complexMatchConfirmed: true, matchMethod: 'legal-area-parcel-name',
    name: '가상아파트', address: '경기도 가상시 예시동 10', roadAddress: '경기도 가상시 예시로 10',
    observedAt: new Date(T0).toISOString(), households: 500, buildingCount: 8, heatingType: '지역난방',
    elevatorCount: 18, passengerElevatorCount: 16, highestFloor: 24, approvalDate: '2010-02-03',
    welfareFacilities: '놀이터', groundEvChargers: 0, undergroundEvChargers: 10,
    parking: { aboveGroundSpaces: 0, belowGroundSpaces: 650, totalSpaces: 650, spacesPerHousehold: 1.3 },
    parkingEvidence: { sourceType: 'official', spacesPerHousehold: 1.3 },
    cache: { hit: false, expiresAt: new Date(T0 + 3600000).toISOString() }, errors: [], ...extra };
}
const response = raw => ({ ok: true, status: 200, json: async () => raw });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('official DTO whitelists public facts and recomputes parking from counts', () => {
  const result = normalizeOfficialComplexInfo(dto({
    apiKey: 'must-not-leave', destinations: [{ address: 'must-not-leave' }], commuteVerification: { route: 'must-not-leave' },
    sourceUrl: 'https://upstream.invalid/?serviceKey=must-not-leave', sourceName: 'must-not-leave',
    parking: { aboveGroundSpaces: 0, belowGroundSpaces: 650, totalSpaces: 999999, spacesPerHousehold: 99 },
    parkingEvidence: { spacesPerHousehold: 99, sourceUrl: 'https://upstream.invalid/' },
  }), candidate.catalogId);
  assert.equal(result.status, 'matched');
  assert.equal(result.households, 500);
  assert.equal(result.parking.aboveGroundSpaces, 0);
  assert.equal(result.parking.totalSpaces, 650);
  assert.equal(result.parking.spacesPerHousehold, 1.3);
  assert.equal(result.parkingEvidence.spacesPerHousehold, 1.3);
  assert.equal(result.sourceUrl, 'https://www.data.go.kr/data/15058453/openapi.do');
  assert.doesNotMatch(JSON.stringify(result), /must-not-leave|upstream.invalid|serviceKey|destinations|commuteVerification/);
});

test('identity mismatches and unconfirmed codes never produce official evidence', () => {
  for (const input of [dto({ catalogId: 'another-id' }), dto({ provider: 'other' }), dto({ schemaVersion: 99 }), dto({ status: 'invented' })]) {
    const result = normalizeOfficialComplexInfo(input, candidate.catalogId);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.errors[0].code, 'IDENTITY_MISMATCH');
    assert.equal(result.parkingEvidence, null);
  }
  for (const input of [dto({ kaptCode: 'bad/key' }), dto({ complexMatchConfirmed: false }), dto({ status: 'ambiguous' }), dto({ status: 'unmatched' })]) {
    const result = normalizeOfficialComplexInfo(input, candidate.catalogId);
    assert.equal(result.complexMatchConfirmed, false);
    assert.equal(result.kaptCode, null);
    assert.equal(result.households, null);
    assert.equal(result.parkingEvidence, null);
  }
});

test('combined-complex diagnostics keep only a public identity explanation, never combined facility values', () => {
  const result = normalizeOfficialComplexInfo(dto({ status: 'unmatched', complexMatchConfirmed: false,
    matchIssue: 'combined-complex',
    relatedComplex: { kaptCode: 'A10000009', name: '가상그린빌1,2단지', scope: 'combined-phases', phases: [2, 1, 2],
      sourceUrl: 'https://upstream.invalid/?serviceKey=must-not-leave', scopeLabel: 'must-not-leave',
      households: 999999, parking: { totalSpaces: 999999, spacesPerHousehold: 99 }, elevatorCount: 999999,
      parkingEvidence: { sourceType: 'official', status: 'calculated', spacesPerHousehold: 99 },
    },
  }), candidate.catalogId);
  assert.equal(result.matchIssue, 'combined-complex');
  assert.deepEqual(result.relatedComplex, { kaptCode: 'A10000009', name: '가상그린빌1,2단지', scope: 'combined-phases',
    phases: [1, 2], scopeLabel: '1·2단지 통합 등록', sourceUrl: 'https://www.data.go.kr/data/15057332/openapi.do' });
  for (const field of ['households', 'buildingCount', 'heatingType', 'elevatorCount']) assert.equal(result[field], null);
  assert.equal(result.kaptCode, null);
  assert.equal(result.parkingEvidence, null);
  assert.ok(Object.values(result.parking).every(value => value === null));
  assert.match(officialComplexMatchNote(result), /여러 단지가 합쳐진 공식 자료.*주차·승강기로 사용하지 않았/);
  assert.doesNotMatch(JSON.stringify(result), /must-not-leave|upstream.invalid|999999/);
});

test('related-complex metadata requires bounded phases, a safe code and explicit combined scope', () => {
  const related = { kaptCode: 'A10000009', name: '가상그린빌1,2단지', scope: 'combined-phases', phases: [1, 2] };
  const unmatched = extra => dto({ status: 'unmatched', complexMatchConfirmed: false, matchIssue: 'combined-complex', ...extra });
  for (const input of [
    unmatched({ relatedComplex: { ...related, kaptCode: '../private' } }),
    unmatched({ relatedComplex: { ...related, scope: 'exact-phase' } }),
    unmatched({ relatedComplex: { ...related, phases: [1, 1] } }),
    unmatched({ relatedComplex: { ...related, phases: [0, '2', -1] } }),
    unmatched({ relatedComplex: { ...related, phases: [1, 2, 3, 4, 5, 6, 7, 8, 9] } }),
    unmatched({ relatedComplex: { ...related, name: null } }),
    unmatched({ matchIssue: 'household-mismatch', relatedComplex: related }),
    dto({ relatedComplex: related, matchIssue: 'combined-complex' }),
  ]) assert.equal(normalizeOfficialComplexInfo(input, candidate.catalogId).relatedComplex, null);
  const filtered = normalizeOfficialComplexInfo(unmatched({ relatedComplex: { ...related, phases: [2, 1, -1, 0, '3', 100] } }), candidate.catalogId);
  assert.deepEqual(filtered.relatedComplex.phases, [1, 2]);
});

test('only known match issues become explanations and confirmed records do not carry mismatch claims', () => {
  for (const matchIssue of ['combined-complex', 'household-mismatch', 'address-mismatch', 'name-mismatch', 'insufficient-identity']) {
    const info = normalizeOfficialComplexInfo(dto({ status: 'unmatched', complexMatchConfirmed: false, matchIssue }), candidate.catalogId);
    assert.equal(info.matchIssue, matchIssue);
    assert.ok(officialComplexMatchNote(info).length > 0);
  }
  const unknown = normalizeOfficialComplexInfo(dto({ status: 'unmatched', complexMatchConfirmed: false, matchIssue: 'must-not-leave' }), candidate.catalogId);
  assert.equal(unknown.matchIssue, null);
  assert.match(officialComplexMatchNote(unknown), /시설|없다는 뜻은 아닙니다/);
  assert.doesNotMatch(officialComplexMatchNote(unknown), /must-not-leave/);
  const matched = normalizeOfficialComplexInfo(dto({ matchIssue: 'address-mismatch' }), candidate.catalogId);
  assert.equal(matched.matchIssue, null);
  assert.equal(officialComplexMatchNote(matched), '');
});

test('replacing previous official parking with a combined mismatch removes parking points while retaining price and routes', async () => {
  let raw = dto();
  let now = T0;
  const client = createOfficialComplexClient({ url: 'http://localhost:8787/api/official-complex', now: () => now,
    fetchImpl: async () => response(raw) });
  const route = { fixture: true };
  const input = { ...candidate, households: 500, builtYear: 2010, bestArea: { averagePriceManWon: 59000, count: 8 }, commuteVerification: route };
  await client.load(input);
  const previous = client.decorate(input);
  const ranking = record => rankPersonalizedCandidates([record], { targetPriceManWon: 60000, currentYear: 2026, minParkingRatio: 1 })[0].personalizedRecommendation;
  assert.equal(ranking(previous).dimensions.parking.score, 10);
  raw = dto({ status: 'unmatched', complexMatchConfirmed: false, matchIssue: 'combined-complex',
    cache: { expiresAt: new Date(T0 + 7200000).toISOString() },
    relatedComplex: { kaptCode: 'A10000009', name: '가상그린빌1,2단지', scope: 'combined-phases', phases: [1, 2] } });
  now += 3600001;
  await client.load(previous);
  const decorated = client.decorate(previous);
  assert.equal(decorated.parkingEvidence, undefined);
  assert.equal(decorated.bestArea, input.bestArea);
  assert.equal(decorated.commuteVerification, route);
  const score = ranking(decorated).dimensions.parking;
  assert.equal(score.status, 'unknown'); assert.equal(score.value, null); assert.equal(score.score, 0);
  assert.equal(decorated.officialComplexInfo.relatedComplex.name, '가상그린빌1,2단지');
});

test('missing parking is unknown while valid zero capacity is retained', () => {
  for (const value of [null, undefined, '', '650', -1, Infinity, NaN]) {
    const result = normalizeOfficialComplexInfo(dto({ parking: { aboveGroundSpaces: 0, belowGroundSpaces: value } }), candidate.catalogId);
    assert.equal(result.parking.aboveGroundSpaces, 0);
    assert.equal(result.parking.belowGroundSpaces, null);
    assert.equal(result.parking.totalSpaces, null);
    assert.equal(result.parkingEvidence.spacesPerHousehold, null);
  }
  const zero = normalizeOfficialComplexInfo(dto({ parking: { aboveGroundSpaces: 0, belowGroundSpaces: 0 } }), candidate.catalogId);
  assert.equal(zero.parking.totalSpaces, 0);
  assert.equal(zero.parking.spacesPerHousehold, 0);
  assert.equal(zero.groundEvChargers, 0);
});

test('missing or zero households never divide public parking totals', () => {
  for (const households of [null, undefined, 0, '500', -1]) {
    const result = normalizeOfficialComplexInfo(dto({ households }), candidate.catalogId);
    assert.equal(result.parking.totalSpaces, 650);
    assert.equal(result.parking.spacesPerHousehold, null);
  }
});

test('malformed optional errors are normalized without exceptions or upstream text', () => {
  const result = normalizeOfficialComplexInfo(dto({ errors: [null, {}, 'bad', { code: 'secret-provider-message', message: 'must-not-leave', part: 'destinations' }, { code: 'TIMEOUT', part: 'detail' }] }), candidate.catalogId);
  assert.equal(result.errors.at(-1).code, 'TIMEOUT');
  assert.equal(result.errors.at(-1).part, 'detail');
  assert.doesNotMatch(JSON.stringify(result.errors), /must-not-leave|secret-provider-message|destinations/);
});

test('requests contain only catalogId, preserving candidate prices and current routes', async () => {
  const requests = [];
  const route = { provider: 'fixture-provider', routes: [{ minutes: 45 }] };
  const input = { ...candidate, lat: 37.5, lng: 127, destinations: [{ address: 'fictional-private-office' }], commuteVerification: route };
  const client = createOfficialComplexClient({ url: 'http://localhost:8787/api/official-complex', now: () => T0,
    fetchImpl: async (url, options) => { requests.push({ url, options }); return response(dto()); } });
  assert.equal(client.decorate(input), input);
  await client.load(input);
  const endpoint = new URL(requests[0].url);
  assert.deepEqual([...endpoint.searchParams], [['catalogId', candidate.catalogId]]);
  assert.equal(requests[0].options.body, undefined);
  assert.equal(requests[0].options.cache, 'no-store');
  assert.ok(requests[0].options.signal instanceof AbortSignal);
  const decorated = client.decorate(input);
  assert.equal(decorated.commuteVerification, route);
  assert.equal(decorated.destinations, input.destinations);
  assert.equal(decorated.amountManWon, input.amountManWon);
  assert.equal(decorated.parkingEvidence.spacesPerHousehold, 1.3);
  assert.equal(input.parkingEvidence, undefined);
  assert.doesNotMatch(JSON.stringify(requests), /fictional-private-office|minutes|destinations|lat|lng/);
});

test('personally confirmed parking remains authoritative while public facts remain visible', async () => {
  const personal = { sourceType: 'field', spacesPerHousehold: 1.1, observedAt: new Date(T0).toISOString(), note: '현장 확인' };
  const input = { ...candidate, parkingEvidence: personal };
  const client = createOfficialComplexClient({ url: 'http://localhost:8787/api/official-complex', now: () => T0, fetchImpl: async () => response(dto()) });
  await client.load(input);
  const decorated = client.decorate(input);
  assert.equal(decorated.parkingEvidence, personal);
  assert.equal(decorated.officialComplexInfo.parkingEvidence.spacesPerHousehold, 1.3);
});

test('concurrent loads share one fetch and fresh memory reuses without requests', async () => {
  const gate = deferred();
  let calls = 0;
  let applied = 0;
  const client = createOfficialComplexClient({ url: 'http://localhost:8787/api/official-complex', now: () => T0,
    fetchImpl: async () => { calls += 1; await gate.promise; return response(dto()); }, onApplied: () => { applied += 1; } });
  const first = client.load(candidate);
  const second = client.load(candidate);
  assert.equal(calls, 1);
  gate.resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, b);
  assert.equal(applied, 1);
  assert.equal(await client.load(candidate), a);
  assert.equal(calls, 1);
});

test('public detail TTL expires and triggers a fresh request without changing original candidate', async () => {
  let now = T0;
  let calls = 0;
  const client = createOfficialComplexClient({ url: 'http://localhost:8787/api/official-complex', now: () => now,
    fetchImpl: async () => { calls += 1; return response(dto({ cache: { expiresAt: new Date(now + 1000).toISOString() } })); } });
  await client.load(candidate);
  assert.equal(client.decorate(candidate).officialComplexInfo.status, 'matched');
  now += 1001;
  assert.deepEqual(client.decorate(candidate), candidate);
  await client.load(candidate);
  assert.equal(calls, 2);
});

test('decorating previously decorated data clears expired public facts while retaining personal observations', async () => {
  let now = T0;
  const client = createOfficialComplexClient({ url: 'http://localhost:8787/api/official-complex', now: () => now, fetchImpl: async () => response(dto({ cache: { expiresAt: new Date(T0 + 1000).toISOString() } })) });
  await client.load(candidate);
  const decorated = client.decorate(candidate);
  now += 1001;
  const expired = client.decorate(decorated);
  assert.equal(expired.officialComplexInfo, undefined);
  assert.equal(expired.parkingEvidence, undefined);
  const personal = { sourceType: 'field', spacesPerHousehold: 1.2 };
  const retained = client.decorate({ ...decorated, parkingEvidence: personal });
  assert.equal(retained.parkingEvidence, personal);
  assert.equal(retained.officialComplexInfo, undefined);
});

test('client caps excessive upstream cache expiry to one day', async () => {
  let now = T0;
  let calls = 0;
  const client = createOfficialComplexClient({ url: 'http://localhost:8787/api/official-complex', now: () => now,
    fetchImpl: async () => { calls += 1; return response(dto({ cache: { expiresAt: new Date(T0 + 20 * 86400000).toISOString() } })); } });
  const loaded = await client.load(candidate);
  assert.equal(loaded.cache.expiresAt, new Date(T0 + 86400000).toISOString());
  assert.equal(client.decorate(candidate).officialComplexInfo.cache.expiresAt, loaded.cache.expiresAt);
  now += 86400001;
  await client.load(candidate);
  assert.equal(calls, 2);
});

test('queue freshness checks share effective expiry and do not fetch or decorate candidates', async () => {
  let now = T0;
  let calls = 0;
  const client = createOfficialComplexClient({ url: 'http://localhost:8787/api/official-complex', now: () => now,
    fetchImpl: async () => { calls += 1; return response(dto({ cache: { expiresAt: new Date(T0 + 1000).toISOString() } })); } });
  assert.equal(client.isFresh(candidate), false);
  assert.equal(client.isFresh(null), false);
  assert.equal(client.isFresh({ catalogId: 'another-id' }), false);
  const info = await client.load(candidate);
  assert.equal(client.isFresh(candidate), true);
  assert.equal(client.isFresh({ ...candidate, id: 'another-area-of-this-complex' }), true);
  assert.equal(candidate.officialComplexInfo, undefined);
  assert.equal(info.cache.expiresAt, new Date(T0 + 1000).toISOString());
  now += 1000;
  assert.equal(client.isFresh(candidate), false);
  assert.equal(client.decorate(candidate).officialComplexInfo, undefined);
  assert.equal(calls, 1);
});

test('unavailable and unmatched results expose their real cooldown expiry to the queue', async () => {
  let now = T0;
  const unavailable = createOfficialComplexClient({ url: 'http://localhost:8787/api/official-complex', now: () => now,
    fetchImpl: async () => { throw new Error('fixture-network'); } });
  const failedInfo = await unavailable.load(candidate);
  assert.equal(failedInfo.cache.expiresAt, new Date(T0 + 300000).toISOString());
  assert.equal(unavailable.isFresh(candidate), true);
  now = T0 + 300000;
  assert.equal(unavailable.isFresh(candidate), false);
  now = T0;
  const unmatched = createOfficialComplexClient({ url: 'http://localhost:8787/api/official-complex', now: () => now,
    fetchImpl: async () => response(dto({ status: 'unmatched', complexMatchConfirmed: false, cache: { expiresAt: new Date(T0 + 7 * 86400000).toISOString() } })) });
  const missing = await unmatched.load(candidate);
  assert.equal(missing.cache.expiresAt, new Date(T0 + 86400000).toISOString());
  assert.equal(unmatched.isFresh(candidate), true);
  now += 86400000;
  assert.equal(unmatched.isFresh(candidate), false);
});

test('partial provider failure can be retried explicitly before public basic data expire', async () => {
  let calls = 0;
  const client = createOfficialComplexClient({ url: 'http://localhost:8787/api/official-complex', now: () => T0,
    fetchImpl: async () => { calls += 1; return response(calls === 1 ? dto({ status: 'partial', parking: {}, errors: [{ part: 'detail', code: 'ACCESS_DENIED' }] }) : dto()); } });
  assert.equal((await client.load(candidate)).status, 'partial');
  assert.equal((await client.load(candidate, { refresh: true })).status, 'matched');
  assert.equal(calls, 2);
});

test('unavailable responses use a short retry cache and explicit refresh retries sooner', async () => {
  let now = T0;
  let calls = 0;
  const client = createOfficialComplexClient({ url: 'http://localhost:8787/api/official-complex', now: () => now,
    fetchImpl: async () => { calls += 1; throw new Error('upstream-secret-fixture'); } });
  assert.equal((await client.load(candidate)).status, 'unavailable');
  await client.load(candidate);
  assert.equal(calls, 1);
  await client.load(candidate, { refresh: true });
  assert.equal(calls, 2);
  now += 300001;
  await client.load(candidate);
  assert.equal(calls, 3);
});

test('invalid catalog IDs and missing local endpoint make no requests', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return response(dto()); };
  const client = createOfficialComplexClient({ url: 'http://localhost:8787/api/official-complex', fetchImpl, now: () => T0 });
  for (const input of [{}, { catalogId: '../private' }, { catalogId: 'a'.repeat(65) }, { catalogId: 'id&lat=37' }]) {
    assert.equal((await client.load(input)).errors[0].code, 'INVALID_CATALOG');
  }
  const noServer = createOfficialComplexClient({ fetchImpl, now: () => T0 });
  assert.equal((await noServer.load(candidate)).errors[0].code, 'LOCAL_SERVER_REQUIRED');
  assert.equal(calls, 0);
});

test('HTTP failures, invalid DTOs, network and timeouts do not leak response bodies', async () => {
  const cases = [
    { fetchImpl: async () => ({ ok: false, status: 403, json: () => { throw new Error('must-not-read'); } }), code: 'UPSTREAM_ERROR' },
    { fetchImpl: async () => response(dto({ catalogId: 'wrong' })), code: 'IDENTITY_MISMATCH' },
    { fetchImpl: async () => { throw new Error('must-not-leave'); }, code: 'NETWORK_ERROR' },
    { fetchImpl: async () => { const error = new Error('must-not-leave'); error.name = 'TimeoutError'; throw error; }, code: 'TIMEOUT' },
  ];
  for (const item of cases) {
    const client = createOfficialComplexClient({ url: 'http://localhost:8787/api/official-complex', fetchImpl: item.fetchImpl, now: () => T0 });
    const result = await client.load(candidate);
    assert.equal(result.errors[0].code, item.code);
    assert.doesNotMatch(JSON.stringify(result), /must-not/);
    assert.equal(client.decorate(candidate).parkingEvidence, undefined);
  }
});
