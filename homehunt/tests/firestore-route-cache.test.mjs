import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFirestoreRouteCache, createRouteCacheKey, ROUTE_CACHE_COLLECTION,
  DEFAULT_ROUTE_CACHE_TTL_MS, MAX_ROUTE_CACHE_TTL_MS,
} from '../server/route-cache.mjs';
import { createMemoryFirestore } from './helpers/firestore-memory.mjs';

const epoch = Date.parse('2026-09-08T01:00:00Z');
const request = {
  provider: 'tmap-transit', mode: 'transit', origin: { lat: 37.3, lng: 127.1 },
  destination: { lat: 37.4, lng: 127.2 }, searchDateTime: '202609090800',
};
const route = (changes = {}) => ({
  provider: 'tmap-transit', mode: 'transit', status: 'verified', verified: true,
  durationMinutes: 40, durationSeconds: 2400, walkingMinutes: 6, walkMinutes: 6,
  walkSeconds: 360, transferCount: 1, busMinutes: null, subwayMinutes: null,
  transitComposition: 'subway', queriedAt: new Date(epoch).toISOString(), ...changes,
});

test('TMAP pair cache survives adapter restart and stores no original coordinates or scoring preferences', async () => {
  const db = createMemoryFirestore();
  const cache = createFirestoreRouteCache({ db, now: () => epoch });
  assert.equal(await cache.set(request, route({ origin: request.origin, apiKey: 'not-a-real-key', score: 98 })), true);
  const restored = createFirestoreRouteCache({ db, now: () => epoch + 1000 });
  assert.deepEqual(await restored.get({ ...request, weight: 90, targetPrice: 60000, budget: 70000 }), route());
  assert.match([...db.documents.keys()][0], new RegExp(`^${ROUTE_CACHE_COLLECTION}/[a-f0-9]{64}$`));
  const encoded = JSON.stringify([...db.documents.values()]);
  assert.doesNotMatch(encoded, /origin|destination|apiKey|score|37\.3|127\.1/);
});

test('cache distinguishes every provider request dimension but ignores names, percentages and prices', () => {
  const baseline = createRouteCacheKey(request);
  const changes = [
    { origin: { ...request.origin, lat: 37.30000001 } },
    { destination: { ...request.destination, lng: 127.21 } },
    { searchDateTime: '202609100800' }, { option: 'other-route-option' },
    { schemaVersion: 2 }, { count: 5 }, { language: 1 },
  ];
  for (const change of changes) assert.notEqual(createRouteCacheKey({ ...request, ...change }), baseline);
  assert.equal(createRouteCacheKey({ ...request, company: 'A', weight: 10, budget: 9,
    options: { weight: 50, price: 6 }, origin: { ...request.origin, lat: '37.3' } }), baseline);
  assert.equal(createRouteCacheKey({ ...request, mode: 'car' }), null);
});

test('Kakao, NAVER and unknown providers never read or write Firestore, even when coordinates are invalid', async () => {
  const db = createMemoryFirestore();
  const cache = createFirestoreRouteCache({ db, now: () => epoch });
  for (const provider of ['kakao-transit', 'naver-directions5', 'odsay', 'unknown', undefined]) {
    assert.equal(await cache.get({ provider }), null);
    assert.equal(await cache.set({ provider }, route()), false);
  }
  assert.deepEqual(db.calls, { reads: 0, writes: 0, transactions: 0 });
});

test('expired records are rejected before asynchronous Firestore TTL deletion', async () => {
  let now = epoch;
  const db = createMemoryFirestore();
  const cache = createFirestoreRouteCache({ db, now: () => now });
  await cache.set(request, route());
  now += DEFAULT_ROUTE_CACHE_TTL_MS - 1;
  assert.ok(await cache.get(request));
  now++;
  assert.equal(await cache.get(request), null);
  assert.equal(db.documents.size, 1);
});

test('old/future results cannot renew their lifetime and excessive TTL is clamped below 24 hours', async () => {
  const db = createMemoryFirestore();
  const cache = createFirestoreRouteCache({ db, now: () => epoch + 1000, ttlMs: 48 * 60 * 60 * 1000 });
  await cache.set(request, route());
  const stored = [...db.documents.values()][0];
  assert.equal(stored.expiresAt.getTime(), epoch + MAX_ROUTE_CACHE_TTL_MS);
  assert.equal(await cache.set(request, route({ queriedAt: new Date(epoch - 24 * 60 * 60 * 1000).toISOString() })), false);
  assert.equal(await cache.set(request, route({ queriedAt: new Date(epoch + 2000).toISOString() })), false);
});

test('reducing configured TTL immediately rejects older entries written by an earlier server', async () => {
  const db = createMemoryFirestore();
  await createFirestoreRouteCache({ db, now: () => epoch }).set(request, route());
  const shortened = createFirestoreRouteCache({ db, now: () => epoch + 2000, ttlMs: 1000 });
  assert.equal(await shortened.get(request), null);
});

test('legacy records with a 24 hour or greater lifetime and mismatched result timestamp are ignored', async () => {
  const db = createMemoryFirestore();
  const cache = createFirestoreRouteCache({ db, now: () => epoch + 1000 });
  await cache.set(request, route());
  const key = [...db.documents.keys()][0];
  const valid = structuredClone(db.documents.get(key));
  for (const change of [
    { expiresAt: new Date(epoch + 24 * 60 * 60 * 1000) },
    { schemaVersion: 0 }, { provider: 'kakao-transit' },
    { fetchedAt: new Date(epoch - 1000) }, { expiresAt: 'invalid' },
  ]) {
    db.documents.set(key, { ...valid, ...change });
    assert.equal(await cache.get(request), null);
  }
});

test('failed, incomplete, inconsistent or mixed-provider results are not cached', async () => {
  const db = createMemoryFirestore();
  const cache = createFirestoreRouteCache({ db, now: () => epoch });
  for (const change of [
    { verified: false }, { status: 'unavailable' }, { error: 'failed' }, { reasonCode: 'NO_ROUTE' },
    { provider: 'kakao-transit' }, { queriedAt: undefined }, { durationMinutes: 50 },
    { walkingMinutes: null }, { walkingMinutes: 41 }, { transferCount: null }, { transferCount: -1 },
    { routes: [route(), route({ provider: 'naver-directions5' })] }, { routes: [] },
  ]) assert.equal(await cache.set(request, route(change)), false);
  assert.equal(db.documents.size, 0);
  assert.equal(await cache.set(request, route({ routes: [route(), route({ durationSeconds: 2700, durationMinutes: 45 })] })), true);
  const result = await cache.get(request);
  assert.equal(result.validRouteCount, 2);
  assert.equal(result.routes[1].durationMinutes, 45);
});

test('malformed TMAP request or unsafe cache configuration fails before database access', async () => {
  const db = createMemoryFirestore();
  for (const ttlMs of [0, -1, NaN, Infinity, 1.1]) assert.throws(() => createFirestoreRouteCache({ db, ttlMs }));
  const cache = createFirestoreRouteCache({ db, now: () => epoch });
  for (const change of [{ origin: null }, { origin: { lat: null, lng: 0 } },
    { destination: { lat: 100, lng: 0 } }, { count: 11 }, { searchDateTime: 'Monday' }]) {
    await assert.rejects(cache.get({ ...request, ...change }));
  }
  assert.equal(db.calls.reads, 0);
});
