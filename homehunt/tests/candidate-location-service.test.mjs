import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateLocationCoverage, createCandidateLocationService } from '../js/candidate-location-service.mjs';

const apartment = (id, overrides = {}) => ({ catalogId: String(id), name: `단지 ${id}`,
  regionCode: '11110', regionName: '서울특별시 종로구', address: `서울특별시 종로구 테스트로 ${id}`, ...overrides });
const geo = { lat: 37.57, lng: 126.98 };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test('districts prefer supplied coordinates, support REGIONS centers, and never replace exact coordinates', async () => {
  const rows = [apartment(1), apartment(2, { lat: 37.55, lng: 127.01 })];
  const before = structuredClone(rows);
  const service = createCandidateLocationService({ geocode: () => { throw Error('unexpected query'); } });
  const result = await service.enrichDistrictReferences(rows, { districts: [
    { code: '11110', name: '서울특별시 종로구' },
    { code: '11110', name: '서울 종로구', center: [37.57, 126.98] },
  ] });
  assert.deepEqual(rows, before);
  assert.notEqual(result.candidates, rows);
  assert.notEqual(result.candidates[0], rows[0]);
  assert.equal(result.candidates[0].lat, undefined);
  assert.equal(result.candidates[0].locationReference.precision, 'district');
  assert.equal(result.candidates[0].locationReference.source, 'static');
  assert.equal(result.candidates[1].lat, 37.55);
  assert.notEqual(result.candidates[0].locationReference, result.candidates[1].locationReference);
  assert.deepEqual(result.coverage, { total: 2, exact: 1, district: 1, unlocated: 0, districtCount: 1, resolvedDistricts: 1 });
  assert.equal(result.requests.geocodeCalls, 0);
});

test('993 candidates request only distinct districts and reuse the optional cache', async () => {
  const rows = Array.from({ length: 993 }, (_, i) => apartment(i, i % 2
    ? { regionCode: '41135', regionName: '경기도 성남시 분당구' } : {}));
  const cacheCalls = [];
  const queries = [];
  const result = await createCandidateLocationService({
    loadCached: async (address) => { cacheCalls.push(address); return address.includes('분당구') ? geo : null; },
    geocode: async (address) => { queries.push(address); return geo; },
  }).enrichDistrictReferences(rows);
  assert.deepEqual(queries, ['서울특별시 종로구']);
  assert.equal(cacheCalls.length, 2);
  assert.equal(result.coverage.district, 993);
  assert.equal(result.coverage.exact, 0);
  assert.equal(result.coverage.resolvedDistricts, 2);
  assert.equal(result.requests.cacheHits, 1);
  assert.ok(result.candidates.every((row) => row.lat === undefined));
});

test('same district name across different codes shares one normalized query and names do not merge different codes', async () => {
  const queries = [];
  const result = await createCandidateLocationService({ geocode: async (address) => { queries.push(address); return geo; } })
    .enrichDistrictReferences([apartment(1), apartment(2, { regionCode: 'other', regionName: ' 서울특별시   종로구 ' })]);
  assert.equal(queries.length, 1);
  assert.equal(result.coverage.districtCount, 2);
  assert.equal(result.coverage.resolvedDistricts, 2);
});

test('missing labels, invalid coordinates and failures preserve candidates without invented coordinates', async () => {
  const rows = [apartment(1), apartment(2, { regionCode: '11140', regionName: '서울특별시 중구' }),
    apartment(3, { regionCode: 'unknown', regionName: '' })];
  const result = await createCandidateLocationService({
    loadCached: () => { throw Error('storage unavailable'); },
    geocode: async (address) => {
      if (address.includes('중구')) throw Error('provider failure');
      return { lat: null, lng: '127' };
    },
  }).enrichDistrictReferences(rows);
  assert.deepEqual(result.candidates, rows);
  assert.equal(result.coverage.unlocated, 3);
  assert.equal(result.requests.failed, 2);
  assert.equal(result.cancelled, false);
});

test('existing district references can serve peers but do not become apartment coordinates', async () => {
  const rows = [apartment(1), apartment(2, { locationReference: { ...geo, label: '종로구', precision: 'district' } })];
  const result = await createCandidateLocationService().enrichDistrictReferences(rows);
  assert.equal(result.coverage.district, 2);
  assert.equal(result.requests.geocodeCalls, 0);
  assert.equal(result.candidates[0].lat, undefined);
});

test('district lookup limit bounds requests while supplied locations still resolve', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => apartment(i, { regionCode: String(i), regionName: `지역 ${i}` }));
  const result = await createCandidateLocationService({ geocode: async () => geo }).enrichDistrictReferences(rows, {
    limit: 2, districts: [{ code: '4', name: '지역 4', ...geo }],
  });
  assert.equal(result.requests.geocodeCalls, 2);
  assert.equal(result.coverage.district, 3);
  assert.equal(result.coverage.unlocated, 2);
});

test('explicit address pass defaults to the first 20 missing candidates and leaves the rest unchanged', async () => {
  const rows = [apartment('existing', { ...geo }), ...Array.from({ length: 993 }, (_, i) => apartment(i))];
  const before = structuredClone(rows);
  const queries = [];
  const result = await createCandidateLocationService({ geocode: async (address, options) => {
    queries.push(address);
    assert.equal(options.precision, 'address');
    return geo;
  } }).enrichExactCandidates(rows);
  assert.deepEqual(rows, before);
  assert.equal(queries.length, 20);
  assert.equal(result.coverage.exact, 21);
  assert.equal(result.candidates[20].locationPrecision, 'address');
  assert.equal(result.candidates[21].lat, undefined);
});

test('exact pass deduplicates whitespace-normalized addresses within the selected candidates only', async () => {
  const queries = [];
  const rows = [apartment(1), apartment(2, { address: ' 서울특별시  종로구 테스트로 1 ' }),
    apartment(3, { address: '서울특별시 종로구 테스트로 1' })];
  const result = await createCandidateLocationService({ geocode: async (address) => { queries.push(address); return geo; } })
    .enrichExactCandidates(rows, { limit: 2 });
  assert.deepEqual(queries, ['서울특별시 종로구 테스트로 1']);
  assert.equal(result.coverage.exact, 2);
  assert.equal(result.candidates[2].lat, undefined);
});

test('exact pass reuses cached addresses and refuses district-precision results and name-only fallbacks', async () => {
  const rows = [apartment(1), apartment(2), apartment(3, { address: '' }),
    apartment(4, { address: '서울특별시 종로구' })];
  const queries = [];
  const result = await createCandidateLocationService({
    loadCached: (address) => address.endsWith(' 1') ? geo : { ...geo, precision: 'district' },
    geocode: async (address) => { queries.push(address); return { ...geo, precision: 'district' }; },
  }).enrichExactCandidates(rows);
  assert.equal(result.coverage.exact, 1);
  assert.equal(result.requests.cacheHits, 1);
  assert.deepEqual(queries, [rows[1].address]);
  assert.equal(result.candidates[1].lat, undefined);
});

test('address limit zero makes no calls and explicit very large limits remain bounded at 100', async () => {
  const rows = Array.from({ length: 120 }, (_, i) => apartment(i));
  const service = createCandidateLocationService({ geocode: async () => geo });
  const disabled = await service.enrichExactCandidates(rows, { limit: 0 });
  assert.equal(disabled.requests.geocodeCalls, 0);
  const bounded = await service.enrichExactCandidates(rows, { limit: 9999 });
  assert.equal(bounded.requests.geocodeCalls, 100);
  assert.equal(bounded.coverage.exact, 100);
});

test('injected concurrency cannot exceed two active provider requests', async () => {
  let active = 0;
  let maximum = 0;
  const gates = [];
  const service = createCandidateLocationService({ concurrency: 99, geocode: () => {
    active += 1;
    maximum = Math.max(maximum, active);
    const gate = deferred();
    gates.push(gate);
    return gate.promise.finally(() => { active -= 1; });
  } });
  const pending = service.enrichExactCandidates([apartment(1), apartment(2), apartment(3)]);
  assert.equal(gates.length, 2);
  gates[0].resolve(geo);
  gates[1].resolve(geo);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gates.length, 3);
  gates[2].resolve(geo);
  const result = await pending;
  assert.equal(maximum, 2);
  assert.equal(result.coverage.exact, 3);
});

test('abort prevents queued calls and discards already resolved locations atomically', async () => {
  const signal = new AbortController();
  const gate = deferred();
  let calls = 0;
  const rows = [apartment(1), apartment(2), apartment(3)];
  const service = createCandidateLocationService({ concurrency: 1, geocode: async (_, options) => {
    assert.equal(options.signal, signal.signal);
    calls += 1;
    if (calls === 1) return geo;
    return gate.promise;
  } });
  const pending = service.enrichExactCandidates(rows, { signal: signal.signal });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  signal.abort();
  gate.resolve(geo);
  const result = await pending;
  assert.equal(calls, 2);
  assert.equal(result.cancelled, true);
  assert.deepEqual(result.candidates, rows);
});

test('overlapping district/address passes share two provider slots across the service', async () => {
  const gates = [];
  let active = 0;
  let maximum = 0;
  const service = createCandidateLocationService({ geocode: () => {
    active += 1;
    maximum = Math.max(maximum, active);
    const gate = deferred();
    gates.push(gate);
    return gate.promise.finally(() => { active -= 1; });
  } });
  const district = service.enrichDistrictReferences([apartment(1), apartment(2, { regionCode: '11140', regionName: '서울 중구' })]);
  const exact = service.enrichExactCandidates([apartment(3), apartment(4)]);
  assert.equal(gates.length, 2);
  gates[0].resolve(geo);
  gates[1].resolve(geo);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gates.length, 4);
  gates[2].resolve(geo);
  gates[3].resolve(geo);
  await Promise.all([district, exact]);
  assert.equal(maximum, 2);
});

test('a superseding call prevents stale exact results and isCurrent can stop district work', async () => {
  const gate = deferred();
  const service = createCandidateLocationService({ geocode: (address) => address.endsWith(' 1') ? gate.promise : Promise.resolve(geo) });
  const old = service.enrichExactCandidates([apartment(1)]);
  const fresh = await service.enrichExactCandidates([apartment(2)]);
  gate.resolve(geo);
  const stale = await old;
  assert.equal(fresh.cancelled, false);
  assert.equal(fresh.coverage.exact, 1);
  assert.equal(stale.cancelled, true);
  assert.equal(stale.coverage.exact, 0);
  const unused = await service.enrichDistrictReferences([apartment(3)], { isCurrent: () => false });
  assert.equal(unused.cancelled, true);
  assert.equal(unused.requests.geocodeCalls, 0);
});

test('coverage rejects missing/invalid coordinates and never treats a district marker as exact', () => {
  assert.deepEqual(candidateLocationCoverage([
    apartment(1, { lat: null, lng: null }), apartment(2, { lat: 999, lng: 127 }),
    apartment(3, { ...geo, locationPrecision: 'district', locationReference: { ...geo, precision: 'district' } }),
    apartment(4, { lat: '37.5', lng: '127' }),
  ]), { total: 4, exact: 1, district: 1, unlocated: 2, districtCount: 1, resolvedDistricts: 1 });
  assert.deepEqual(candidateLocationCoverage(null), { total: 0, exact: 0, district: 0, unlocated: 0, districtCount: 0, resolvedDistricts: 0 });
});
