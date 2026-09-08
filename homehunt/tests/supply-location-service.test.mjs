import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupplyLocationService } from '../js/supply-location-service.mjs';

const address = '경기도 가상시 예시동 123';
const point = { lat: 37.3, lng: 127.1 };
const notice = extra => ({ id: 'fixture-1', title: '가상 주택 공급', address, ...extra });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('provided coordinates stay paired with their detailed address without geocoding', async () => {
  let calls = 0;
  const service = createSupplyLocationService({ geocode: async () => { calls += 1; return point; } });
  const input = notice({ locations: [{ address, latitude: '37.3', longitude: '127.1' }] });
  const before = JSON.stringify(input);
  const result = await service.resolve(input);
  assert.deepEqual(result.point, point);
  assert.equal(result.address, address);
  assert.equal(result.label, '공고 제공 위치');
  assert.equal(result.approximate, true);
  assert.equal(calls, 0);
  assert.equal(JSON.stringify(input), before);
});

test('region and centroid coordinates are explicitly reference locations', async () => {
  for (const extra of [
    { address: '경기도 가상시', ...point },
    { address, ...point, coordinateAccuracy: 'region-centroid' },
    { address, ...point, locationScope: 'provider-jurisdiction' },
    { address: '', locations: [{ sido: '경기도', district: '가상시', ...point }] },
  ]) {
    const result = await createSupplyLocationService().resolve(notice(extra));
    assert.deepEqual(result.point, point);
    assert.equal(result.label, '공급지역 참고 위치');
    assert.equal(result.approximate, true);
    assert.match(result.reason, /실제 주택이나 사업지의 위치를 뜻하지 않습니다/);
  }
});

test('one detailed official address is geocoded once and marked approximate', async () => {
  const queries = [];
  const service = createSupplyLocationService({ geocode: async query => { queries.push(query); return point; } });
  const result = await service.resolve(notice({ locations: [{ address }, { address }] }));
  assert.deepEqual(queries, [address]);
  assert.deepEqual(result.point, point);
  assert.equal(result.label, '공고 주소 주변 위치');
  assert.equal(result.approximate, true);
  assert.equal(result.query, address);
  assert.match(result.reason, /넓은 사업지/);
});

test('previously geocoded coordinates retain their address-search label without another call', async () => {
  let calls = 0;
  const service = createSupplyLocationService({ geocode: async () => { calls += 1; return point; } });
  const result = await service.resolve(notice({ ...point, mapCoordinateSource: 'naver-geocode-local' }));
  assert.equal(result.label, '공고 주소 주변 위치');
  assert.equal(result.approximate, true);
  assert.equal(calls, 0);
});

test('region or title alone is never geocoded but can form an external map query', async () => {
  let calls = 0;
  const service = createSupplyLocationService({ geocode: async () => { calls += 1; return point; } });
  for (const input of [
    notice({ address: '경기도 가상시' }),
    notice({ address: '', regionName: '경기도' }),
    notice({ address: '', locations: [{ sido: '서울특별시', district: '가상구' }] }),
    notice({ address: '', title: '예시동 가상주택' }),
  ]) {
    const result = await service.resolve(input);
    assert.equal(result.point, null);
    assert.ok(result.query.includes(input.title));
    assert.match(result.reason, /상세 주소가 없어/);
  }
  assert.equal(calls, 0);
});

test('different detailed supply addresses never choose the first coordinate or geocode', async () => {
  let calls = 0;
  const service = createSupplyLocationService({ geocode: async () => { calls += 1; return point; } });
  const result = await service.resolve(notice({ ...point, locations: [
    { address, ...point },
    { address: '경기도 가상시 다른동 234', lat: 37.4, lng: 127.2 },
  ] }));
  assert.equal(result.point, null);
  assert.match(result.reason, /^여러 공급지역/);
  assert.match(result.address, /예시동 123.*다른동 234/);
  assert.equal(calls, 0);
});

test('a detailed location never borrows a regional or unpaired coordinate', async () => {
  const queries = [];
  const resolvedPoint = { lat: 37.5, lng: 127.3 };
  const service = createSupplyLocationService({ geocode: async query => { queries.push(query); return resolvedPoint; } });
  const result = await service.resolve(notice({ address: '', ...point, locations: [
    { address: '경기도 가상시', ...point }, { address },
  ] }));
  assert.deepEqual(queries, [address]);
  assert.deepEqual(result.point, resolvedPoint);
  assert.equal(result.address, address);
});

test('invalid, empty and coercible nonnumeric coordinates never become a location', async () => {
  for (const invalid of [
    { lat: null, lng: null }, { lat: '', lng: ' ' }, { lat: true, lng: false },
    { lat: [], lng: {} }, { lat: Infinity, lng: 127 }, { lat: 91, lng: 127 }, { lat: 37, lng: -181 },
  ]) {
    const result = await createSupplyLocationService().resolve(notice({ address: '', ...invalid }));
    assert.equal(result.point, null);
  }
});

test('in-flight requests share work, successes remain cached even with explicit retry', async () => {
  const gate = deferred();
  let calls = 0;
  const service = createSupplyLocationService({ geocode: () => { calls += 1; return gate.promise; } });
  const first = service.resolve(notice());
  const second = service.resolve(notice(), { retry: true });
  assert.equal(first, second);
  gate.resolve(point);
  const result = await first;
  assert.equal(await service.resolve(notice()), result);
  assert.equal(await service.resolve(notice(), { retry: true }), result);
  assert.equal(calls, 1);
});

test('failed geocoding is reused until a manual retry and raw errors are never displayed', async () => {
  let calls = 0;
  const service = createSupplyLocationService({ geocode: async () => {
    calls += 1;
    if (calls === 1) throw new Error('secret upstream response');
    return point;
  } });
  const failed = await service.resolve(notice());
  assert.equal(failed.point, null);
  assert.doesNotMatch(JSON.stringify(failed), /secret|upstream/);
  assert.equal(await service.resolve(notice()), failed);
  assert.equal(calls, 1);
  assert.deepEqual((await service.resolve(notice(), { retry: true })).point, point);
  assert.equal(calls, 2);
});

test('notice identity, address and location updates each invalidate the matching memory entry', async () => {
  const queries = [];
  const service = createSupplyLocationService({ geocode: async query => { queries.push(query); return point; } });
  await service.resolve(notice());
  await service.resolve(notice({ id: 'fixture-2' }));
  await service.resolve(notice({ address: '경기도 가상시 다른동 1' }));
  const moved = await service.resolve(notice({ locations: [{ address, lat: 38, lng: 128 }] }));
  assert.deepEqual(queries, [address, address, '경기도 가상시 다른동 1']);
  assert.deepEqual(moved.point, { lat: 38, lng: 128 });
});

test('address detail tokens support roads, villages and broad project sites', async () => {
  const queries = [];
  const service = createSupplyLocationService({ geocode: async query => { queries.push(query); return point; } });
  for (const suffix of ['예시로 12', '예시로123번길 1', '예시읍 일원', '예시면 예시리 10', '예시동 A블록 일원']) {
    const fullAddress = `경기도 가상시 ${suffix}`;
    const result = await service.resolve(notice({ address: fullAddress }));
    assert.deepEqual(result.point, point);
    assert.equal(result.approximate, true);
  }
  assert.equal(queries.length, 5);
});

test('missing geocoder, empty results and invalid returned points have safe readable states', async () => {
  for (const geocode of [undefined, async () => null, async () => ({ lat: true, lng: 127 }), async () => ({ lat: 999, lng: 127 })]) {
    const result = await createSupplyLocationService({ geocode }).resolve(notice());
    assert.equal(result.point, null);
    assert.equal(result.address, address);
    assert.equal(result.query, address);
    assert.ok(result.reason.length > 10);
  }
});

test('unmatched project address retries only its contiguous legal area and labels the coarse position', async () => {
  const projectAddress = '경기도 김포시 고촌읍 신곡리 김포신곡6지구 도시개발사업구역 A3BL';
  const area = '경기도 김포시 고촌읍 신곡리';
  const queries = [];
  const service = createSupplyLocationService({ geocode: async query => {
    queries.push(query);
    return query === area ? point : null;
  } });
  const input = notice({ address: projectAddress });
  const result = await service.resolve(input);
  assert.deepEqual(queries, [projectAddress, area]);
  assert.deepEqual(result.point, point);
  assert.equal(result.label, '공급지역 참고 위치');
  assert.equal(result.address, area);
  assert.equal(result.query, projectAddress);
  assert.equal(result.approximate, true);
  assert.match(result.reason, /경기도 김포시 고촌읍 신곡리/);
  assert.match(result.reason, /실제 단지 위치는 미확인/);
  assert.equal(await service.resolve(input, { retry: true }), result);
  assert.equal(queries.length, 2);
});

test('failed area fallback is capped at two lookups and reused until explicit retry', async () => {
  const queries = [];
  const service = createSupplyLocationService({ geocode: async query => { queries.push(query); return null; } });
  const result = await service.resolve(notice());
  assert.deepEqual(queries, [address, '경기도 가상시 예시동']);
  assert.equal(result.point, null);
  assert.equal(await service.resolve(notice()), result);
  assert.equal(queries.length, 2);
  await service.resolve(notice(), { retry: true });
  assert.equal(queries.length, 4);
});

test('address errors and malformed responses never trigger an area lookup', async () => {
  for (const response of [new Error('private failure'), undefined, { lat: true, lng: 127 }, { lat: 999, lng: 127 }]) {
    const queries = [];
    const service = createSupplyLocationService({ geocode: async query => {
      queries.push(query);
      if (response instanceof Error) throw response;
      return response;
    } });
    const result = await service.resolve(notice());
    assert.equal(result.point, null);
    assert.deepEqual(queries, [address]);
    assert.doesNotMatch(result.reason, /private/);
  }
});

test('legal area fallback is absent for roads or projects without a local administrative prefix', async () => {
  for (const fullAddress of [
    '경기도 가상시 예시로 123',
    '경기도 가상시 예시지구 도시개발사업구역 A3BL',
    '경기도 가상시 예시사업지 예시동 123',
    '경기도 가상시 예시동',
    '경기도 가상시 101동 A블록',
  ]) {
    const queries = [];
    const service = createSupplyLocationService({ geocode: async query => { queries.push(query); return null; } });
    const result = await service.resolve(notice({ address: fullAddress }));
    assert.equal(result.point, null);
    assert.ok(queries.length <= 1);
    if (queries.length) assert.equal(queries[0], fullAddress);
  }
});

test('a hanging address lookup times out without fallback and late results cannot replace it', async () => {
  const gate = deferred();
  const queries = [];
  const service = createSupplyLocationService({ timeoutMs: 5, geocode: query => { queries.push(query); return gate.promise; } });
  const result = await service.resolve(notice());
  assert.equal(result.point, null);
  assert.match(result.reason, /대기 시간이 초과/);
  assert.deepEqual(queries, [address]);
  gate.resolve(point);
  await Promise.resolve();
  assert.equal(await service.resolve(notice()), result);
});

test('the one area fallback also has a bounded timeout and never starts another lookup', async () => {
  const queries = [];
  const service = createSupplyLocationService({ timeoutMs: 5, geocode: query => {
    queries.push(query);
    return queries.length === 1 ? Promise.resolve(null) : new Promise(() => {});
  } });
  const result = await service.resolve(notice());
  assert.equal(result.point, null);
  assert.match(result.reason, /대기 시간이 초과/);
  assert.deepEqual(queries, [address, '경기도 가상시 예시동']);
});
