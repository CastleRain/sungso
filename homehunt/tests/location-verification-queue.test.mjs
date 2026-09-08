import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { orderLocationVerificationQueue } from '../js/personalized-context-core.mjs';
import { createCandidateLocationService } from '../js/candidate-location-service.mjs';
import { orderCommuteVerificationCandidates } from '../js/recommendation-verification-core.mjs';
import { isGeoPoint } from '../js/transport-core.mjs';

const region = '경기도 성남시 분당구';
const reference = { lat: 37.5, lng: 127.1, precision: 'district', label: region };
const workplaces = [
  { id: 'bundang', lat: 37.4, lng: 127.1, weightPercent: 40 },
  { id: 'pangyo', lat: 37.45, lng: 127.1, weightPercent: 50 },
  { id: 'gwanghwamun', lat: 37.8, lng: 127.1, weightPercent: 10 },
];
const apartment = (id, dong, more = {}) => ({ catalogId: id, name: `단지 ${id}`, regionName: region,
  regionCode: '41135', dong, address: `${region} ${dong} ${id.replace(/\D/g, '') || 1}`,
  households: 600, builtYear: 2010, locationReference: { ...reference }, ...more });
const station = (id, dong, lat, more = {}) => ({ id, name: `${dong}역`, lat, lng: 127.1,
  address: `${region} 테스트로 지하 100(${dong} 123)`, coordinateRole: 'official-station-reference', ...more });

test('the fortieth-address boundary no longer allows a cheap locality to hide a closer forty-first candidate', async () => {
  const rows = [
    ...Array.from({ length: 40 }, (_, i) => apartment(`cheap-${i}`, '구미동', { bestArea: { averagePriceManWon: 40000 + i } })),
    apartment('closer-41', '백현동', { bestArea: { averagePriceManWon: 55000 } }),
  ];
  const before = structuredClone(rows);
  const calls = [];
  const service = createCandidateLocationService({ geocode: async address => {
    calls.push(address);
    return { lat: address.includes('백현동') ? 37.44 : 37.6, lng: 127.1 };
  } });
  const ordered = orderLocationVerificationQueue(rows, workplaces);
  const resolved = await service.enrichExactCandidates(ordered, { limit: 40 });
  const selected = orderCommuteVerificationCandidates(resolved.candidates.filter(isGeoPoint), workplaces).slice(0, 10);
  assert.equal(calls.length, 40);
  assert.ok(calls.includes(rows.at(-1).address));
  assert.equal(selected[0].catalogId, 'closer-41');
  assert.deepEqual(rows, before);
});

test('equal district references alternate legal dongs and do not depend on input price ordering', () => {
  const rows = ['구미동', '백현동', '정자동', '야탑동'].flatMap((dong, group) =>
    Array.from({ length: 40 }, (_, i) => apartment(`g${group}-${i}`, dong, { bestArea: { averagePriceManWon: 30000 + group * 10000 + i } })));
  const order = input => orderLocationVerificationQueue(input, workplaces);
  const expected = order(rows).map(c => c.catalogId);
  assert.deepEqual(order([...rows].reverse()).map(c => c.catalogId), expected);
  const differentPrices = rows.map((c, i) => ({ ...c, bestArea: { averagePriceManWon: 70000 - i } }));
  assert.deepEqual(order(differentPrices).map(c => c.catalogId), expected);
  const count = Object.fromEntries(['구미동', '백현동', '정자동', '야탑동'].map(dong => [dong, order(rows).slice(0, 40).filter(c => c.dong === dong).length]));
  assert.deepEqual(Object.values(count), [10, 10, 10, 10]);
});

test('official station addresses refine company-weighted queue priority but never populate candidate coordinates', () => {
  const rows = [apartment('north', '야탑동'), apartment('south', '정자동')];
  const stations = [station('n', '야탑동', 37.8), station('s', '정자동', 37.4)];
  const before = structuredClone(rows);
  const ordered = orderLocationVerificationQueue(rows, workplaces, { stations });
  assert.equal(ordered[0], rows[1]);
  assert.deepEqual(rows, before);
  assert.ok(ordered.every(c => !Object.hasOwn(c, 'lat') && !Object.hasOwn(c, 'lng')));
  assert.ok(ordered.every(c => c.locationReference.precision === 'district' && c.locationReference.lat === 37.5));
  assert.ok(ordered.every(c => !Object.hasOwn(c, 'commuteBalance') && !Object.hasOwn(c, 'commuteVerification')));
  const northHeavy = workplaces.map((d, i) => ({ ...d, weightPercent: i === 2 ? 90 : 5 }));
  assert.equal(orderLocationVerificationQueue(rows, northHeavy, { stations })[0], rows[0]);
});

test('station names, roads, partial regions and conflicting candidate addresses cannot imply a dong match', () => {
  const rows = [apartment('a', '야탑동'), apartment('z', '정자동')];
  const baseline = orderLocationVerificationQueue(rows, workplaces).map(c => c.catalogId);
  for (const invalid of [
    station('name-only', '정자동', 37.44, { address: `${region} 성남대로 지하 333` }),
    station('wrong-city', '정자동', 37.44, { address: '경기도 수원시 장안구 정자동 123' }),
    station('wrong-dong', '정자동', 37.44, { address: `${region} 정자로 지하 333(구미동)` }),
    station('partial-region', '정자동', 37.44, { address: '성남시 분당구 정자동 123' }),
    station('not-official', '정자동', 37.44, { coordinateRole: 'unverified' }),
  ]) assert.deepEqual(orderLocationVerificationQueue(rows, workplaces, { stations: [invalid] }).map(c => c.catalogId), baseline);
  const conflicting = [{ ...rows[0] }, { ...rows[1], address: '경기도 수원시 장안구 정자동 123' }];
  assert.deepEqual(orderLocationVerificationQueue(conflicting, workplaces, { stations: [station('s', '정자동', 37.44)] }).map(c => c.catalogId), baseline);
  const wrongDong = [{ ...rows[0] }, { ...rows[1], address: `${region} 구미동 123` }];
  assert.deepEqual(orderLocationVerificationQueue(wrongDong, workplaces, { stations: [station('s', '정자동', 37.44)] }).map(c => c.catalogId), baseline);
});

test('road-only candidates are distributed by road without pretending their road is a legal dong', () => {
  const rows = [
    ...Array.from({ length: 40 }, (_, i) => apartment(`road-a-${i}`, '', { address: `${region} 느티로 ${i + 1}` })),
    apartment('road-b', '', { address: `${region} 정자일로 30` }),
  ];
  assert.ok(orderLocationVerificationQueue(rows, workplaces).slice(0, 40).includes(rows.at(-1)));
  assert.deepEqual(orderLocationVerificationQueue(rows, workplaces).map(c => c.catalogId), orderLocationVerificationQueue([...rows].reverse(), workplaces).map(c => c.catalogId));
});

test('already located homes consume no address slots and are not overwritten by a station reference', async () => {
  const exact = apartment('exact', '정자동', { lat: 37.3, lng: 127.15, locationPrecision: 'address' });
  const rows = [exact, ...Array.from({ length: 50 }, (_, i) => apartment(`missing-${i}`, i % 2 ? '정자동' : '야탑동'))];
  let calls = 0;
  const result = await createCandidateLocationService({ geocode: async () => { calls++; return { lat: 37.44, lng: 127.1 }; } })
    .enrichExactCandidates(orderLocationVerificationQueue(rows, workplaces, { stations: [station('s', '정자동', 37.4)] }), { limit: 40 });
  assert.equal(calls, 40);
  assert.equal(result.coverage.exact, 41);
  assert.deepEqual(result.candidates.find(c => c.catalogId === 'exact'), exact);
});

test('the real official station schema supports explicit legal-dong addresses and keeps all references internal', () => {
  const stations = JSON.parse(fs.readFileSync(new URL('../data/rail-stations.json', import.meta.url), 'utf8')).stations;
  const jeongja = stations.find(s => s.id === 'kric:I4105:1857:분당선');
  const ori = stations.find(s => s.id === 'kric:I4105:1859:분당선');
  assert.match(jeongja.address, /분당구.*정자동/);
  assert.match(ori.address, /분당구.*구미동/);
  const rows = [apartment('south', '구미동'), apartment('north', '정자동')];
  const target = [{ id: 'company', lat: jeongja.lat, lng: jeongja.lng, weightPercent: 100 }];
  const ordered = orderLocationVerificationQueue(rows, target, { stations });
  assert.equal(ordered[0].dong, '정자동');
  assert.ok(ordered.every(c => c.lat === undefined && c.lng === undefined));
});
