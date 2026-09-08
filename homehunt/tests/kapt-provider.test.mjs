import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createKaptProvider, parseKaptResponse, matchKaptComplex, normalizeKaptName, KAPT_ENDPOINTS } from '../scripts/kapt-provider.mjs';

// Fictional public-complex fixtures; no user location or real API credential.
const catalog = { catalogId: 'reb-fixture-1', regionCode: '41135', name: '테스트마을1단지', dong: '테스트동', address: '경기도 성남시 분당구 테스트동 123-4' };
const listed = { kaptCode: 'A10000001', kaptName: '테스트마을1단지아파트', bjdCode: '4113512345', as1: '경기도', as2: '성남시 분당구', as3: '테스트동', as4: '' };
const basic = { kaptCode: listed.kaptCode, kaptName: listed.kaptName, bjdCode: listed.bjdCode, kaptAddr: catalog.address, doroJuso: '경기도 성남시 분당구 테스트로 77', kaptdaCnt: '500', kaptDongCnt: 8, codeHeatNm: '지역난방', kaptUsedate: '20100203', kaptTopFloor: 24, kaptdEcntp: 16, kaptTel: 'must-not-leave-provider', kaptUrl: 'https://private.invalid/?serviceKey=never-output' };
const detail = { kaptCode: listed.kaptCode, kaptName: listed.kaptName, kaptdPcnt: 0, kaptdPcntu: 650, kaptdEcnt: 18, useYn: 'Y', welfareFacility: '놀이터, 주민공동시설', groundElChargerCnt: 0, undergroundElChargerCnt: 10, kaptCcompany: 'must-not-be-cached' };
const response = (body, status = 200) => ({ status, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
const envelope = (part, data) => ({ header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' }, body: part === 'list' ? { items: data, totalCount: data.length, pageNo: 1 } : { item: data } });
function fixtureProvider(options = {}) {
  const calls = [];
  const fetchImpl = async (url, request) => {
    const parsed = new URL(url);
    const part = Object.keys(KAPT_ENDPOINTS).find(key => parsed.origin + parsed.pathname === KAPT_ENDPOINTS[key]);
    calls.push({ part, code: parsed.searchParams.get('kaptCode'), page: parsed.searchParams.get('pageNo') });
    if (options.handler) return options.handler(part, parsed, request, calls.length);
    return response(envelope(part, part === 'list' ? [listed] : part === 'basic' ? basic : detail));
  };
  return { provider: createKaptProvider({ apiKey: 'fixture-only', minRequestGapMs: 0, ...options, fetchImpl }), calls };
}

test('current official List4 and Basis5 JSON methods are used with a server-only key', async () => {
  const { provider, calls } = fixtureProvider();
  const result = await provider.getComplexInfo(catalog);
  assert.deepEqual(calls.map(call => call.part), ['list', 'basic', 'detail']);
  assert.equal(result.status, 'matched');
  assert.equal(result.complexMatchConfirmed, true);
  assert.equal(result.matchMethod, 'legal-area-parcel-name');
  assert.equal(result.households, 500);
  assert.equal(result.buildingCount, 8);
  assert.equal(result.heatingType, '지역난방');
  assert.equal(result.elevatorCount, 18);
  assert.equal(result.passengerElevatorCount, 16);
  assert.equal(result.approvalDate, '2010-02-03');
  assert.equal(result.highestFloor, 24);
  assert.equal(result.parking.aboveGroundSpaces, 0);
  assert.equal(result.parking.totalSpaces, 650);
  assert.equal(result.parking.spacesPerHousehold, 1.3);
  assert.equal(result.parkingEvidence.status, 'calculated');
  assert.equal(result.parkingEvidence.complexMatchConfirmed, true);
  assert.equal(result.groundEvChargers, 0);
  assert.doesNotMatch(JSON.stringify(result), /fixture-only|must-not|serviceKey|private.invalid/);
});

test('absence is not zero and partially missing parking never produces a ratio', async () => {
  const { provider } = fixtureProvider({ handler: part => response(envelope(part, part === 'list' ? [listed] : part === 'basic' ? basic : { ...detail, kaptdPcntu: '' })) });
  const result = await provider.getComplexInfo(catalog);
  assert.equal(result.status, 'partial');
  assert.equal(result.parking.aboveGroundSpaces, 0);
  assert.equal(result.parking.belowGroundSpaces, null);
  assert.equal(result.parking.totalSpaces, null);
  assert.equal(result.parkingEvidence.spacesPerHousehold, null);
});

test('inactive and unconfirmed active flags cannot become parking evidence', async () => {
  for (const useYn of ['N', '', null]) {
    const { provider } = fixtureProvider({ handler: part => response(envelope(part, part === 'list' ? [listed] : part === 'basic' ? basic : { ...detail, useYn })) });
    const result = await provider.getComplexInfo(catalog);
    assert.equal(result.status, 'partial');
    assert.equal(result.parking.totalSpaces, null);
    assert.equal(result.elevatorCount, null);
    assert.equal(result.households, 500);
  }
});

test('unknown and zero household counts never divide parking or fall back to the REB value', async () => {
  for (const value of [null, '', '0', '-1', 'unknown']) {
    const { provider } = fixtureProvider({ handler: part => response(envelope(part, part === 'list' ? [listed] : part === 'basic' ? { ...basic, kaptdaCnt: value } : detail)) });
    const result = await provider.getComplexInfo({ ...catalog, households: 500 });
    assert.equal(result.households, null);
    assert.equal(result.parking.spacesPerHousehold, null);
  }
});

test('exact legal area and parcel are required; REB catalogId is never treated as kaptCode', () => {
  assert.equal(matchKaptComplex(catalog, basic, listed), 'legal-area-parcel-name');
  assert.equal(matchKaptComplex({ ...catalog, address: catalog.address.replace('123-4', '123-5') }, basic, listed), null);
  assert.equal(matchKaptComplex({ ...catalog, dong: '다른동' }, basic, listed), null);
  assert.equal(matchKaptComplex({ ...catalog, bjdCode: '4113599999' }, basic, listed), null);
  assert.equal(matchKaptComplex(catalog, { ...basic, bjdCode: '1113512345' }, listed), null);
  assert.equal(matchKaptComplex(catalog, { ...basic, kaptCode: catalog.catalogId }, listed), null);
  assert.equal(matchKaptComplex({ ...catalog, address: catalog.address.replace('123-4', '산 123-4') }, basic, listed), null);
});

test('road address match still requires identical names, legal area, and kaptCode', () => {
  const roadCatalog = { ...catalog, address: '', roadAddress: basic.doroJuso };
  assert.equal(matchKaptComplex(roadCatalog, basic, listed), 'legal-area-road-address-name');
  assert.equal(matchKaptComplex({ ...roadCatalog, name: '테스트마을2단지' }, basic, listed), null);
  assert.equal(matchKaptComplex({ ...roadCatalog, roadAddress: basic.doroJuso + '-1' }, basic, listed), null);
});

test('name punctuation is normalized while different phases remain separate', async () => {
  assert.equal(normalizeKaptName('테스트 마을(1단지) 아파트'), normalizeKaptName(listed.kaptName));
  const { provider, calls } = fixtureProvider();
  const result = await provider.getComplexInfo({ ...catalog, name: '테스트마을2단지' });
  assert.equal(result.status, 'unmatched');
  assert.deepEqual(calls.map(call => call.part), ['list']);
});

test('catalog aliases only shortlist an identity-verified basic row', async () => {
  const { provider } = fixtureProvider();
  const result = await provider.getComplexInfo({ ...catalog, name: '옛단지이름', aliases: [catalog.name] });
  assert.equal(result.status, 'matched');
});

test('ambiguous same-name same-address registrations never choose the first match', async () => {
  const alternative = { ...listed, kaptCode: 'A10000002' };
  const { provider, calls } = fixtureProvider({ handler: (part, url) => response(envelope(part, part === 'list' ? [listed, alternative] : { ...basic, kaptCode: url.searchParams.get('kaptCode') })) });
  const result = await provider.getComplexInfo(catalog);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.complexMatchConfirmed, false);
  assert.deepEqual(calls.map(call => call.part), ['list', 'basic', 'basic']);
});

test('more than five possible basic rows stop without fan-out', async () => {
  const rows = Array.from({ length: 6 }, (_, index) => ({ ...listed, kaptCode: `A1000000${index}` }));
  const { provider, calls } = fixtureProvider({ handler: part => response(envelope(part, rows)) });
  assert.equal((await provider.getComplexInfo(catalog)).status, 'ambiguous');
  assert.equal(calls.length, 1);
});

test('failed competing basic row prevents claiming a unique identity', async () => {
  const alternative = { ...listed, kaptCode: 'A10000002' };
  const { provider } = fixtureProvider({ handler: (part, url) => url.searchParams.get('kaptCode') === alternative.kaptCode ? response('forbidden-secret-fixture', 403) : response(envelope(part, part === 'list' ? [listed, alternative] : basic)) });
  const result = await provider.getComplexInfo(catalog);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.complexMatchConfirmed, false);
  assert.equal(result.errors[0].code, 'ACCESS_DENIED');
});

test('detail failure preserves verified basic facts without zeroing parking', async () => {
  const { provider } = fixtureProvider({ handler: part => part === 'detail' ? response({ header: { resultCode: '30', resultMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR fixture-secret' } }, 403) : response(envelope(part, part === 'list' ? [listed] : basic)) });
  const result = await provider.getComplexInfo(catalog);
  assert.equal(result.status, 'partial');
  assert.equal(result.households, 500);
  assert.equal(result.heatingType, '지역난방');
  assert.equal(result.parkingEvidence.spacesPerHousehold, null);
  assert.equal(result.errors[0].part, 'detail');
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret|serviceKey/);
});

test('mismatched detail kaptCode cannot contaminate the basic apartment', async () => {
  const { provider } = fixtureProvider({ handler: part => response(envelope(part, part === 'list' ? [listed] : part === 'basic' ? basic : { ...detail, kaptCode: 'A99999999' })) });
  const result = await provider.getComplexInfo(catalog);
  assert.equal(result.status, 'partial');
  assert.equal(result.errors[0].code, 'IDENTITY_MISMATCH');
  assert.equal(result.parking.totalSpaces, null);
});

test('memory and concurrent requests reuse each public provider call', async () => {
  const { provider, calls } = fixtureProvider();
  const results = await Promise.all([provider.getComplexInfo(catalog), provider.getComplexInfo(catalog)]);
  assert.equal(results[0].status, 'matched');
  assert.equal(results[1].status, 'matched');
  assert.equal(calls.length, 3);
  const again = await provider.getComplexInfo(catalog);
  assert.equal(again.cache.hit, true);
  assert.equal(calls.length, 3);
});

test('disk caches survive provider restart, whitelist fields, and refresh detail after one day', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'homehunt-kapt-'));
  let time = Date.parse('2026-09-08T00:00:00Z');
  try {
    const first = fixtureProvider({ cacheDir: directory, now: () => time });
    await first.provider.getComplexInfo(catalog);
    const files = await readdir(directory);
    assert.equal(files.length, 3);
    for (const file of files) assert.doesNotMatch(await readFile(join(directory, file), 'utf8'), /fixture-only|must-not|serviceKey|kaptTel|kaptUrl|kaptCcompany/);
    const second = fixtureProvider({ cacheDir: directory, now: () => time });
    assert.equal((await second.provider.getComplexInfo(catalog)).cache.hit, true);
    assert.equal(second.calls.length, 0);
    time += 86_400_001;
    const refreshed = await second.provider.getComplexInfo(catalog);
    assert.equal(refreshed.cache.hit, false);
    assert.deepEqual(second.calls.map(call => call.part), ['basic', 'detail']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('listing pagination obeys total count and rejects incomplete/repeated data', async () => {
  for (const broken of ['empty', 'duplicate', 'changed-total']) {
    const { provider } = fixtureProvider({ pageSize: 1, handler: (_part, url) => {
      const page = Number(url.searchParams.get('pageNo'));
      return response({ header: { resultCode: '00' }, body: { pageNo: page, totalCount: broken === 'changed-total' && page === 2 ? 3 : 2, items: page === 1 || broken === 'duplicate' ? [listed] : [] } });
    } });
    await assert.rejects(provider.getDistrictList('41135'), error => error.code === 'INCOMPLETE_LIST');
  }
  const { provider } = fixtureProvider({ pageSize: 1, handler: (_part, url) => {
    const page = Number(url.searchParams.get('pageNo'));
    return response({ header: { resultCode: '00' }, body: { pageNo: page, totalCount: 2, items: [{ ...listed, kaptCode: `A1000000${page}` }] } });
  } });
  assert.equal((await provider.getDistrictList('41135')).items.length, 2);
});

test('foreign district listing, missing totals, and invalid payloads are unavailable', async () => {
  for (const payload of [envelope('list', [{ ...listed, bjdCode: '1113512345' }]), { header: { resultCode: '00' }, body: { items: [listed] } }, '<html>an error page</html>']) {
    const { provider } = fixtureProvider({ handler: () => response(payload) });
    assert.equal((await provider.getComplexInfo(catalog)).status, 'unavailable');
  }
});

test('timeout and network errors expose safe codes without URL or key', async () => {
  for (const handler of [async () => { throw new Error('https://upstream.invalid?serviceKey=fixture-only'); }, async () => new Promise(() => {})]) {
    const { provider } = fixtureProvider({ handler, timeoutMs: 5 });
    const result = await provider.getComplexInfo(catalog);
    assert.equal(result.status, 'unavailable');
    assert.ok(['TIMEOUT', 'NETWORK_ERROR'].includes(result.errors[0].code));
    assert.doesNotMatch(JSON.stringify(result), /upstream.invalid|fixture-only|serviceKey/);
  }
});

test('legacy XML gateway responses and errors are parsed without entity expansion', () => {
  const parsed = parseKaptResponse('<response><header><resultCode>00</resultCode></header><body><item><kaptCode>A10000001</kaptCode><kaptName><![CDATA[가상 & 단지]]></kaptName><kaptdaCnt>500</kaptdaCnt></item></body></response>', { part: 'basic' });
  assert.equal(parsed.items[0].kaptName, '가상 & 단지');
  assert.equal(parsed.items[0].kaptdaCnt, '500');
  assert.throws(() => parseKaptResponse('<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR fixture-secret</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>', { part: 'list' }), error => error.code === 'ACCESS_DENIED' && !error.message.includes('fixture-secret'));
  assert.throws(() => parseKaptResponse('<!DOCTYPE x [<!ENTITY test SYSTEM "file:///private">]><response/>', { part: 'list' }), error => error.code === 'INVALID_RESPONSE');
});

test('credential getter supports memory updates and invalid catalogs make no requests', async () => {
  let key = '';
  const { provider, calls } = fixtureProvider({ apiKey: undefined, getApiKey: () => key });
  assert.equal((await provider.getComplexInfo(catalog)).errors[0].code, 'MISSING_CREDENTIAL');
  assert.equal(calls.length, 0);
  key = 'fixture-updated-key';
  assert.equal((await provider.getComplexInfo(catalog)).status, 'matched');
  const before = calls.length;
  for (const invalid of [null, { ...catalog, regionCode: '../file' }, { ...catalog, dong: '' }]) assert.equal((await provider.getComplexInfo(invalid)).status, 'unavailable');
  assert.equal(calls.length, before);
});

async function waitFor(predicate) {
  const deadline = performance.now() + 2000;
  while (!predicate()) {
    if (performance.now() > deadline) assert.fail('Timed out waiting for fixture queue state');
    await new Promise(resolve => setImmediate(resolve));
  }
}

test('provider-wide request queue caps active misses at two and drains in arrival order', async () => {
  let active = 0;
  let peak = 0;
  const started = [];
  const releases = [];
  const provider = createKaptProvider({ apiKey: 'fixture-only', minRequestGapMs: 0, timeoutMs: 2000,
    fetchImpl: async url => {
      active += 1;
      peak = Math.max(peak, active);
      started.push(new URL(url).searchParams.get('sigunguCode'));
      await new Promise(resolve => releases.push(resolve));
      active -= 1;
      return response(envelope('list', []));
    },
  });
  const regions = ['41131', '41133', '41135', '41150', '41170'];
  const pending = regions.map(regionCode => provider.getDistrictList(regionCode));
  await waitFor(() => started.length === 2);
  assert.equal(provider.getStats().activeRequests, 2);
  assert.equal(provider.getStats().queuedRequests, 3);
  for (let index = 0; index < regions.length; index += 1) {
    await waitFor(() => releases[index]);
    releases[index]();
  }
  await Promise.all(pending);
  await waitFor(() => provider.getStats().activeRequests === 0);
  assert.equal(peak, 2);
  assert.deepEqual(started, regions);
  assert.equal(provider.getStats().queuedRequests, 0);
});

test('request start spacing uses monotonic time even with a fixed freshness clock', async () => {
  const starts = [];
  const provider = createKaptProvider({ apiKey: 'fixture-only', minRequestGapMs: 20, now: () => 1788820000000,
    fetchImpl: async () => { starts.push(performance.now()); return response(envelope('list', [])); },
  });
  await Promise.all(['41131', '41133', '41135', '41150'].map(regionCode => provider.getDistrictList(regionCode)));
  assert.equal(starts.length, 4);
  for (let index = 1; index < starts.length; index += 1) assert.ok(starts[index] - starts[index - 1] >= 19, 'starts are spaced by the configured gap');
});

test('a timeout starts on dispatch, releases its slot, and does not time out queued work', async () => {
  let started = 0;
  let aborted = false;
  const provider = createKaptProvider({ apiKey: 'fixture-only', minRequestGapMs: 0, maxConcurrency: 1, timeoutMs: 25,
    fetchImpl: async (_url, options) => {
      started += 1;
      if (started === 1) return new Promise((_, reject) => options.signal.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('fixture aborted'));
      }, { once: true }));
      return response(envelope('list', []));
    },
  });
  const results = await Promise.allSettled([provider.getDistrictList('41131'), provider.getDistrictList('41133')]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[0].reason.code, 'TIMEOUT');
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(aborted, true);
  assert.equal(started, 2);
});

test('quota and network failures release queued work without changing safe error classification', async () => {
  let started = 0;
  const provider = createKaptProvider({ apiKey: 'fixture-only', minRequestGapMs: 0, maxConcurrency: 1,
    fetchImpl: async () => {
      started += 1;
      if (started === 1) return response({ header: { resultCode: '22', resultMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR fixture-secret' } }, 429);
      if (started === 2) throw new Error('fixture-secret-network');
      return response(envelope('list', []));
    },
  });
  const results = await Promise.allSettled(['41131', '41133', '41135'].map(regionCode => provider.getDistrictList(regionCode)));
  assert.equal(results[0].reason.code, 'QUOTA_EXCEEDED');
  assert.equal(results[1].reason.code, 'NETWORK_ERROR');
  assert.equal(results[2].status, 'fulfilled');
  assert.doesNotMatch(JSON.stringify(results), /fixture-secret/);
  assert.equal(started, 3);
});

test('concurrent bulk complexes share one district list and dedupe repeated basic/detail identities', async () => {
  const fixtures = Array.from({ length: 3 }, (_, index) => {
    const kaptCode = `A1000000${index + 1}`;
    const name = `가상단지${index + 1}`;
    const address = `경기도 성남시 분당구 테스트동 ${index + 1}`;
    return { catalog: { ...catalog, catalogId: `bulk-${index + 1}`, name, address },
      listed: { ...listed, kaptCode, kaptName: name },
      basic: { ...basic, kaptCode, kaptName: name, kaptAddr: address },
      detail: { ...detail, kaptCode, kaptName: name } };
  });
  const { provider, calls } = fixtureProvider({ handler: (part, url) => {
    const fixture = fixtures.find(item => item.listed.kaptCode === url.searchParams.get('kaptCode'));
    return response(envelope(part, part === 'list' ? fixtures.map(item => item.listed) : fixture[part]));
  } });
  const inputs = [...fixtures.map(item => item.catalog), fixtures[0].catalog, fixtures[1].catalog];
  const result = await Promise.all(inputs.map(input => provider.getComplexInfo(input)));
  assert.ok(result.every(item => item.status === 'matched'));
  assert.equal(calls.filter(call => call.part === 'list').length, 1);
  assert.equal(calls.filter(call => call.part === 'basic').length, 3);
  assert.equal(calls.filter(call => call.part === 'detail').length, 3);
  const repeated = await Promise.all(inputs.map(input => provider.getComplexInfo(input)));
  assert.ok(repeated.every(item => item.cache.hit));
  assert.equal(calls.length, 7);
  assert.equal(provider.getStats().queuedRequests, 0);
});

test('the configured concurrency cap cannot exceed two and defaults pace starts at 200ms', () => {
  const defaults = createKaptProvider().getStats();
  assert.equal(defaults.maxConcurrency, 2);
  assert.equal(defaults.minRequestGapMs, 200);
  for (const maxConcurrency of [0, 3, 10, -1, NaN, 1.5]) assert.throws(() => createKaptProvider({ maxConcurrency }), RangeError);
  for (const minRequestGapMs of [-1, Infinity, NaN, '200']) assert.throws(() => createKaptProvider({ minRequestGapMs }), RangeError);
});

// Public catalog/list labels for the reported matching cases. Network replies
// remain injected fixtures; these tests never query a live service or user data.
const goldCatalog = { catalogId: '41463100008470', regionCode: '41463', regionName: '경기도 용인시 기흥구',
  name: '금화마을5단지주공그린빌', aliases: ['금화마을주공그린빌'], dong: '상갈동',
  address: '경기도 용인시 기흥구 상갈동 454', households: 681 };
const goldList = { ...listed, kaptCode: 'A44695802', kaptName: '금화마을주공5단지', bjdCode: '4146310300', as2: '용인기흥구', as3: '상갈동' };
const goldBasic = { ...basic, kaptCode: goldList.kaptCode, kaptName: goldList.kaptName, bjdCode: goldList.bjdCode,
  kaptAddr: '경기도 용인기흥구 상갈동 454 금화마을주공5단지', kaptdaCnt: '681' };
function goldProvider({ listRow = goldList, basicRow = goldBasic } = {}) {
  return fixtureProvider({ handler: part => response(envelope(part, part === 'list' ? [listRow] : part === 'basic' ? basicRow : { ...detail, kaptCode: listRow.kaptCode, kaptName: listRow.kaptName })) });
}

test('phase order and the limited Jugong Green-vill brand variant require exact parcel and 681 households', async () => {
  assert.equal(matchKaptComplex(goldCatalog, goldBasic, goldList), 'legal-area-parcel-phase-households-name-variant');
  const { provider, calls } = goldProvider();
  const result = await provider.getComplexInfo(goldCatalog);
  assert.equal(result.status, 'matched');
  assert.equal(result.complexMatchConfirmed, true);
  assert.equal(result.matchMethod, 'legal-area-parcel-phase-households-name-variant');
  assert.equal(result.households, 681);
  assert.equal(result.matchIssue, null);
  assert.equal(result.relatedComplex, null);
  assert.equal(calls.length, 3);
});

test('a nearby or same-name variant is rejected for any household difference or missing count', async () => {
  for (const households of [680, 682, null, 0, '', -1]) {
    const { provider, calls } = goldProvider({ basicRow: { ...goldBasic, kaptdaCnt: households } });
    const result = await provider.getComplexInfo(goldCatalog);
    assert.equal(result.status, 'unmatched');
    assert.equal(result.parkingEvidence, null);
    assert.equal(result.matchIssue, [null, 0, '', -1].includes(households) ? 'insufficient-identity' : 'household-mismatch');
    assert.equal(calls.filter(call => call.part === 'detail').length, 0);
  }
  assert.equal(matchKaptComplex({ ...goldCatalog, households: null }, goldBasic, goldList), null);
});

test('a name variant never bypasses legal area, exact parcel, or K-apt identity', async () => {
  for (const row of [{ ...goldBasic, kaptAddr: goldBasic.kaptAddr.replace('454', '455') },
    { ...goldBasic, kaptAddr: goldBasic.kaptAddr.replace('454', '454-1') },
    { ...goldBasic, bjdCode: '4146319999' }, { ...goldBasic, kaptCode: 'A44695803' }]) {
    assert.equal(matchKaptComplex(goldCatalog, row, goldList), null);
  }
  const { provider } = goldProvider({ basicRow: { ...goldBasic, kaptAddr: goldBasic.kaptAddr.replace('454', '455') } });
  const result = await provider.getComplexInfo(goldCatalog);
  assert.equal(result.matchIssue, 'address-mismatch');
  assert.equal(result.parking.totalSpaces, null);
});

test('Green-vill is not a generic removable brand and a different phase stays separate', async () => {
  for (const name of ['금화마을주공6단지', '금화마을주공15단지', '금화마을주공5차', '금화마을프라자5단지', '금화마을그린빌5단지']) {
    const { provider, calls } = goldProvider({ listRow: { ...goldList, kaptName: name }, basicRow: { ...goldBasic, kaptName: name } });
    assert.equal((await provider.getComplexInfo(goldCatalog)).status, 'unmatched');
    assert.equal(calls.length, 1);
  }
});

test('known city and neighborhood prefixes need the same exact address and household count', async () => {
  const cityCatalog = { ...catalog, regionCode: '41111', regionName: '경기도 수원시 장안구', name: 'SK스카이뷰', aliases: [], dong: '정자동', address: '경기도 수원시 장안구 정자동 945', households: 1000 };
  const cityList = { ...listed, kaptName: '수원SK스카이뷰', as3: '정자동', bjdCode: '4111110100' };
  const cityBasic = { ...basic, kaptName: cityList.kaptName, bjdCode: cityList.bjdCode, kaptAddr: cityCatalog.address, kaptdaCnt: '1000' };
  assert.equal(matchKaptComplex(cityCatalog, cityBasic, cityList), 'legal-area-parcel-phase-households-name-variant');
  for (const changed of [{ ...cityBasic, kaptdaCnt: '999' }, { ...cityBasic, kaptAddr: cityBasic.kaptAddr + '-1' }, { ...cityBasic, kaptName: '화성SK스카이뷰' }]) assert.equal(matchKaptComplex(cityCatalog, changed, cityList), null);
  const localCatalog = { ...cityCatalog, name: '경남아너스빌' };
  const localList = { ...cityList, kaptName: '정자동경남아너스빌' };
  const localBasic = { ...cityBasic, kaptName: localList.kaptName };
  assert.equal(matchKaptComplex(localCatalog, localBasic, localList), 'legal-area-parcel-phase-households-name-variant');
});

test('prefix normalization preserves phase numbers and ambiguous short brands', () => {
  const localCatalog = { ...catalog, regionName: '경기도 성남시 분당구', households: 500 };
  for (const name of ['테스트동테스트마을2단지', '테스트동테스트마을11단지', '테스트동테스트마을1차']) {
    assert.equal(matchKaptComplex(localCatalog, { ...basic, kaptName: name }, { ...listed, kaptName: name }), null);
  }
  assert.equal(matchKaptComplex({ ...localCatalog, name: '현대' }, { ...basic, kaptName: '테스트동현대' }, { ...listed, kaptName: '테스트동현대' }), null);
});

test('road-address variants retain the same phase and household guard as parcel variants', () => {
  const roadCatalog = { ...goldCatalog, address: '', roadAddress: goldBasic.doroJuso };
  assert.equal(matchKaptComplex(roadCatalog, goldBasic, goldList), 'legal-area-road-address-phase-households-name-variant');
  assert.equal(matchKaptComplex({ ...roadCatalog, households: 682 }, goldBasic, goldList), null);
  assert.equal(matchKaptComplex({ ...roadCatalog, roadAddress: goldBasic.doroJuso + '-1' }, goldBasic, goldList), null);
});

test('combined Cheongmyeong phases are related-list evidence only, never phase-one parking', async () => {
  const input = { ...goldCatalog, catalogId: '41463120120870', name: '청명호수신안인스빌1단지', aliases: ['청명호수마을 신안인스빌1단지'], dong: '하갈동', address: '경기도 용인시 기흥구 하갈동 631', households: 829 };
  const row = { ...goldList, kaptCode: 'A44672601', kaptName: '청명호수마을신안인스빌1,2단지', bjdCode: '4146310400', as3: '하갈동' };
  const { provider, calls } = goldProvider({ listRow: row });
  const result = await provider.getComplexInfo(input);
  assert.equal(result.status, 'unmatched');
  assert.equal(result.matchIssue, 'combined-complex');
  assert.equal(result.complexMatchConfirmed, false);
  assert.equal(result.kaptCode, null);
  assert.equal(result.households, null);
  assert.equal(result.parkingEvidence, null);
  assert.equal(result.parking.totalSpaces, null);
  assert.deepEqual(result.relatedComplex, { kaptCode: 'A44672601', name: row.kaptName, scope: 'combined-phases', scopeLabel: '1·2단지 통합 등록', phases: [1, 2], sourceUrl: 'https://www.data.go.kr/data/15057332/openapi.do' });
  assert.equal(calls.length, 1);
  const second = await provider.getComplexInfo({ ...input, name: '청명호수신안인스빌2단지', aliases: ['청명호수마을 신안인스빌2단지'], address: input.address.replace('631', '632'), households: 174 });
  assert.equal(second.parkingEvidence, null);
  assert.equal(second.matchIssue, 'combined-complex');
});

test('combined registration separators never collapse to a single concatenated phase number', async () => {
  for (const name of ['테스트마을1,2단지', '테스트마을1·2단지', '테스트마을1/2단지', '테스트마을1-2단지', '테스트마을1단지2단지']) {
    const row = { ...listed, kaptName: name };
    const { provider } = fixtureProvider({ handler: part => response(envelope(part, part === 'list' ? [row] : { ...basic, kaptName: name })) });
    const result = await provider.getComplexInfo(catalog);
    assert.equal(result.status, 'unmatched');
    assert.equal(result.matchIssue, 'combined-complex');
    assert.deepEqual(result.relatedComplex.phases, [1, 2]);
    assert.equal(matchKaptComplex({ ...catalog, name: '테스트마을12단지' }, { ...basic, kaptName: name }, row), null);
  }
});

test('related combined listing must share locality, remaining name, and include the requested phase', async () => {
  for (const row of [{ ...listed, kaptName: '테스트마을2,3단지' }, { ...listed, kaptName: '다른마을1,2단지' }, { ...listed, kaptName: '테스트마을1,2단지', as3: '다른동' }]) {
    const { provider } = fixtureProvider({ handler: part => response(envelope(part, [row])) });
    const result = await provider.getComplexInfo(catalog);
    assert.equal(result.status, 'unmatched');
    assert.equal(result.relatedComplex, null);
  }
});

test('phase-free aliases cannot hide conflicting canonical phases or combined registrations', () => {
  const expected = { ...catalog, aliases: ['테스트마을'] };
  assert.equal(matchKaptComplex(expected, { ...basic, kaptName: '테스트마을' }, { ...listed, kaptName: '테스트마을' }), null);
  assert.equal(matchKaptComplex({ ...expected, aliases: ['테스트마을2단지'] }, { ...basic, kaptName: '테스트마을2단지' }, { ...listed, kaptName: '테스트마을2단지' }), null);
  assert.equal(matchKaptComplex({ ...expected, aliases: ['테스트마을1,2단지'] }, { ...basic, kaptName: '테스트마을1,2단지' }, { ...listed, kaptName: '테스트마을1,2단지' }), null);
  assert.equal(matchKaptComplex({ ...expected, name: '옛이름', aliases: ['테스트마을1단지', '테스트마을2단지'] }, basic, listed), null);
});

test('multiple equally verified variants stay ambiguous and do not fetch either parking row', async () => {
  const duplicate = { ...goldList, kaptCode: 'A44695803' };
  const { provider, calls } = fixtureProvider({ handler: (part, url) => response(envelope(part, part === 'list' ? [goldList, duplicate] : { ...goldBasic, kaptCode: url.searchParams.get('kaptCode') })) });
  const result = await provider.getComplexInfo(goldCatalog);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.parkingEvidence, null);
  assert.equal(calls.filter(call => call.part === 'detail').length, 0);
});

test('a completed address mismatch retains basic/list expiry instead of becoming a five-minute retry', async () => {
  const start = Date.parse('2026-09-08T00:00:00Z');
  let now = start;
  const { provider, calls } = fixtureProvider({ now: () => now });
  const input = { ...catalog, address: catalog.address.replace('123-4', '999') };
  const first = await provider.getComplexInfo(input);
  assert.equal(first.status, 'unmatched');
  assert.equal(first.matchIssue, 'address-mismatch');
  assert.equal(first.cache.expiresAt, new Date(start + 86400000).toISOString());
  assert.equal(first.cache.hit, false);
  assert.equal(first.parkingEvidence, null);
  now += 300001;
  const repeated = await provider.getComplexInfo(input);
  assert.equal(repeated.cache.hit, true);
  assert.equal(repeated.cache.expiresAt, first.cache.expiresAt);
  assert.deepEqual(calls.map(call => call.part), ['list', 'basic']);
  now = start + 86400000;
  const refreshed = await provider.getComplexInfo(input);
  assert.equal(refreshed.cache.expiresAt, new Date(now + 86400000).toISOString());
  assert.deepEqual(calls.map(call => call.part), ['list', 'basic', 'basic']);
});

test('ambiguous identity results expire with the earliest inspected basic row', async () => {
  const start = Date.parse('2026-09-08T00:00:00Z');
  let now = start;
  const alternative = { ...listed, kaptCode: 'A10000002' };
  const { provider, calls } = fixtureProvider({ now: () => now, handler: (part, url) => {
    now += 1000;
    return response(envelope(part, part === 'list' ? [listed, alternative] : { ...basic, kaptCode: url.searchParams.get('kaptCode') }));
  } });
  const first = await provider.getComplexInfo(catalog);
  assert.equal(first.status, 'ambiguous');
  assert.equal(first.cache.expiresAt, new Date(start + 2000 + 86400000).toISOString());
  assert.equal(first.parkingEvidence, null);
  const again = await provider.getComplexInfo(catalog);
  assert.equal(again.cache.hit, true);
  assert.equal(again.cache.expiresAt, first.cache.expiresAt);
  assert.equal(calls.length, 3);
});

test('list-only absence and candidate-limit ambiguity carry the actual listing expiry', async () => {
  const now = Date.parse('2026-09-08T00:00:00Z');
  for (const capped of [false, true]) {
    const rows = capped ? [listed, { ...listed, kaptCode: 'A10000002' }] : [];
    const { provider, calls } = fixtureProvider({ now: () => now, maxBasicLookups: 1,
      handler: part => response(envelope(part, rows)) });
    const first = await provider.getComplexInfo(catalog);
    assert.equal(first.status, capped ? 'ambiguous' : 'unmatched');
    assert.equal(first.cache.expiresAt, new Date(now + 7 * 86400000).toISOString());
    assert.equal((await provider.getComplexInfo(catalog)).cache.hit, true);
    assert.equal(calls.length, 1);
  }
});

test('a unique match also expires when an older rejected competing basic row expires', async () => {
  const start = Date.parse('2026-09-08T00:00:00Z');
  let now = start;
  const other = { ...listed, kaptCode: 'A10000002' };
  const address = catalog.address.replace('123-4', '999');
  const { provider } = fixtureProvider({ now: () => now, handler: (part, url) => {
    now += 1000;
    const code = url.searchParams.get('kaptCode');
    return response(envelope(part, part === 'list' ? [listed, other] : part === 'basic'
      ? { ...basic, kaptCode: code, kaptAddr: code === other.kaptCode ? address : catalog.address }
      : { ...detail, kaptCode: code }));
  } });
  await provider.getComplexInfo(catalog);
  const second = await provider.getComplexInfo({ ...catalog, address });
  assert.equal(second.status, 'matched');
  assert.equal(second.kaptCode, other.kaptCode);
  assert.equal(second.cache.expiresAt, new Date(start + 2000 + 86400000).toISOString());
});
