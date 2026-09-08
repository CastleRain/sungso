import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createCloudKaptService, createFirestoreKaptCache, KAPT_CACHE_COLLECTION } from '../server/kapt-service.mjs';
import { KAPT_ENDPOINTS } from '../scripts/kapt-provider.mjs';
import { createMemoryFirestore } from './helpers/firestore-memory.mjs';

const DAY = 86_400_000;
const catalog = { catalogId: 'reb-fixture', name: '가상마을1단지', regionCode: '41135', dong: '가상동',
  address: '경기도 성남시 분당구 가상동 123', households: 500 };
const listed = { kaptCode: 'A10000001', kaptName: '가상마을1단지', bjdCode: '4113512345', as3: '가상동' };
const basic = { ...listed, kaptAddr: catalog.address, kaptdaCnt: '500', codeHeatNm: '지역난방', kaptDongCnt: 8,
  kaptTel: 'PRIVATE-NOT-A-PUBLIC-FACILITY', kaptUrl: 'https://upstream.invalid/?key=SECRET' };
const detail = { kaptCode: listed.kaptCode, kaptName: listed.kaptName, kaptdPcnt: 50, kaptdPcntu: 600,
  kaptdEcnt: 18, useYn: 'Y' };

function fixture(options = {}) {
  const db = options.db || createMemoryFirestore(), calls = [];
  let instant = Date.parse('2026-09-08T00:00:00Z');
  const now = () => instant;
  const fetchImpl = async url => {
    const value = new URL(url);
    const part = Object.entries(KAPT_ENDPOINTS).find(([, endpoint]) => endpoint === value.origin + value.pathname)?.[0];
    calls.push(part);
    if (options.beforeFetch) await options.beforeFetch(part);
    const data = options.data?.(part) ?? (part === 'list' ? [listed] : part === 'basic' ? basic : detail);
    return { status: 200, text: async () => JSON.stringify({ header: { resultCode: '00' },
      body: part === 'list' ? { items: data, totalCount: data.length, pageNo: 1 } : { item: data } }) };
  };
  const newService = extra => createCloudKaptService({ db, env: { MOLIT_SERVICE_KEY: 'FICTIONAL-SECRET' },
    loadCatalog: async () => ({ apartments: options.catalog || [catalog] }),
    fetchImpl, now, minRequestGapMs: 0, cacheOptions: { sleep: () => new Promise(resolve => setTimeout(resolve, 1)) }, ...extra });
  return { db, calls, newService, service: newService(), advance(ms) { instant += ms; }, now };
}
const unpack = doc => JSON.parse(gunzipSync(Buffer.from(doc.payload, 'base64')).toString());

test('cloud facility lookup accepts only server catalog identity and matches parking, heat and elevators', async () => {
  const h = fixture();
  const result = await h.service.complex({ catalogId: catalog.catalogId, address: 'forged', kaptCode: 'forged', households: 1, url: 'https://attacker.invalid' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'matched');
  assert.equal(result.households, 500);
  assert.equal(result.parking.totalSpaces, 650);
  assert.equal(result.heatingType, '지역난방');
  assert.equal(result.elevatorCount, 18);
  assert.deepEqual(h.calls, ['list', 'basic', 'detail']);
  assert.equal(h.service.configuration().diagnostic.state, 'matched');
  assert.equal(h.db.documents.size, 3);
  for (const doc of h.db.documents.values()) {
    const entry = unpack(doc);
    assert.doesNotMatch(JSON.stringify(entry), /FICTIONAL-SECRET|PRIVATE-|upstream.invalid|forged|reb-fixture/);
    assert.ok(doc.expiresAt instanceof Date);
  }
});

test('invalid and unknown catalog identities never call K-apt or create source documents', async () => {
  const h = fixture();
  for (const catalogId of ['', '../secret', 'x'.repeat(65)]) await assert.rejects(h.service.complex({ catalogId }), { code: 'INVALID_CATALOG_ID' });
  await assert.rejects(h.service.complex({ catalogId: 'A10000001' }), { code: 'CATALOG_NOT_FOUND' });
  assert.equal(h.calls.length, 0);
  assert.equal(h.db.documents.size, 0);
});

test('fresh public source rows are reused after cloud cold start, with original evidence expiration', async () => {
  const h = fixture();
  const initial = await h.service.complex({ catalogId: catalog.catalogId });
  h.advance(DAY - 1);
  const later = await h.newService().complex({ catalogId: catalog.catalogId });
  assert.equal(later.cache.hit, true);
  assert.equal(later.cache.expiresAt, initial.cache.expiresAt);
  assert.equal(h.calls.length, 3);
  h.advance(2);
  const refreshed = await h.newService().complex({ catalogId: catalog.catalogId });
  assert.equal(refreshed.cache.hit, false);
  assert.deepEqual(h.calls, ['list', 'basic', 'detail', 'basic', 'detail']);
  h.advance(7 * DAY);
  await h.newService().complex({ catalogId: catalog.catalogId });
  assert.equal(h.calls.filter(part => part === 'list').length, 2);
});

test('concurrent independent cloud instances fetch each public source only once', async () => {
  const h = fixture({ beforeFetch: () => new Promise(resolve => setTimeout(resolve, 8)) });
  const a = h.service, b = h.newService();
  const results = await Promise.all(Array.from({ length: 12 }, (_, index) => (index % 2 ? a : b).complex({ catalogId: catalog.catalogId })));
  assert.ok(results.every(result => result.status === 'matched'));
  assert.deepEqual(h.calls, ['list', 'basic', 'detail']);
});

test('completed unmatched results retain list TTL across instances without facility fabrication', async () => {
  const h = fixture({ data: part => part === 'list' ? [] : null });
  const first = await h.service.complex({ catalogId: catalog.catalogId });
  assert.equal(first.status, 'unmatched');
  assert.equal(Date.parse(first.cache.expiresAt), h.now() + 7 * DAY);
  h.advance(DAY);
  const second = await h.newService().complex({ catalogId: catalog.catalogId });
  assert.equal(second.cache.expiresAt, first.cache.expiresAt);
  assert.equal(second.cache.hit, true);
  assert.equal(second.parking.totalSpaces, null);
  assert.deepEqual(h.calls, ['list']);
});

test('partial public evidence keeps its TTL and upstream errors never persist raw messages', async () => {
  const h = fixture({ beforeFetch(part) { if (part === 'detail') throw new Error('FICTIONAL-SECRET https://secret.invalid/body'); } });
  const result = await h.service.complex({ catalogId: catalog.catalogId });
  assert.equal(result.status, 'partial');
  assert.equal(result.heatingType, '지역난방');
  assert.equal(result.parking.totalSpaces, null);
  assert.equal(Date.parse(result.cache.expiresAt), h.now() + DAY);
  assert.equal(result.errors[0].code, 'NETWORK_ERROR');
  const second = await h.newService().complex({ catalogId: catalog.catalogId });
  assert.equal(second.status, 'partial');
  assert.equal(h.calls.filter(part => part === 'detail').length, 1, 'short shared error cooldown prevents immediate repeats');
  assert.doesNotMatch(JSON.stringify([result, second, ...h.db.documents]), /FICTIONAL-SECRET|secret.invalid/);
});

test('cached wrong legal area, code and corrupt compressed source cannot become identity evidence', async () => {
  for (const kind of ['area', 'code', 'corrupt']) {
    const h = fixture();
    await h.service.complex({ catalogId: catalog.catalogId });
    const key = `${KAPT_CACHE_COLLECTION}/${kind === 'area' ? 'list-41135' : 'basic-A10000001'}`;
    const doc = h.db.documents.get(key), entry = unpack(doc);
    if (kind === 'area') entry.items[0].bjdCode = '1111012345';
    if (kind === 'code') entry.items[0].kaptCode = 'A99999999';
    doc.payload = kind === 'corrupt' ? 'not-gzip' : gzipSync(JSON.stringify(entry)).toString('base64');
    const result = await h.newService().complex({ catalogId: catalog.catalogId });
    assert.equal(result.status, 'matched');
    assert.equal(h.calls.length, 4, kind);
  }
});

test('active lease never triggers duplicate load and a crashed expired owner can be recovered', async () => {
  const db = createMemoryFirestore();
  let now = 1000, loads = 0;
  const key = 'list-41135', path = `${KAPT_CACHE_COLLECTION}/${key}`;
  db.documents.set(path, { state: 'loading', owner: 'crashed', leaseUntil: 2000 });
  const cache = createFirestoreKaptCache({ db, now: () => now, waitMs: 0 });
  const request = { key, validate: value => value?.key === key ? value : null,
    load: async () => { loads++; return { key, fetchedAt: now, expiresAt: now + DAY, items: [] }; } };
  await assert.rejects(cache.getOrLoad(request), { code: 'TIMEOUT' });
  assert.equal(loads, 0);
  now = 2001;
  assert.equal((await cache.getOrLoad(request)).hit, false);
  assert.equal(loads, 1);
  assert.equal(db.documents.get(path).state, 'ready');
});

test('an old lease owner cannot overwrite a newer completed refresh', async () => {
  const db = createMemoryFirestore();
  let now = 1000, resolveFirst;
  const key = 'list-41135', path = `${KAPT_CACHE_COLLECTION}/${key}`;
  const a = createFirestoreKaptCache({ db, now: () => now, leaseMs: 10, waitMs: 0, idFactory: () => 'a' });
  const b = createFirestoreKaptCache({ db, now: () => now, leaseMs: 10, waitMs: 0, idFactory: () => 'b' });
  const validate = value => value?.key === key ? value : null;
  const old = a.getOrLoad({ key, validate, load: () => new Promise(resolve => { resolveFirst = resolve; }) });
  while (!resolveFirst) await new Promise(resolve => setImmediate(resolve));
  now = 1011;
  const current = { key, fetchedAt: now, expiresAt: now + DAY, items: ['new'] };
  await b.getOrLoad({ key, validate, load: async () => current });
  resolveFirst({ ...current, items: ['old'] });
  await old;
  assert.deepEqual(unpack(db.documents.get(path)).items, ['new']);
});

test('database errors fail safely without bypassing the shared cache and calling upstream', async () => {
  const db = createMemoryFirestore();
  db.runTransaction = async () => { throw new Error('SECRET-DATABASE-CONNECTION'); };
  const h = fixture({ db });
  const result = await h.service.complex({ catalogId: catalog.catalogId });
  assert.equal(result.status, 'unavailable');
  assert.equal(h.calls.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /SECRET-DATABASE/);
});
