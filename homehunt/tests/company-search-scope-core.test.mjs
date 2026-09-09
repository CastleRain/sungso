import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCompanySearchScope } from '../js/company-search-scope-core.mjs';

const districts = [
  { code: '41135', name: '경기도 성남시 분당구' },
  { code: '41465', name: '경기도 용인시 수지구' },
  { code: '11110', name: '서울특별시 종로구' },
  { code: '41220', name: '경기도 평택시' },
];
const reference = (address, lat, lng = 127.1, extra = {}) => ({
  name: '공식 역', coordinateRole: 'official-station-reference', address, lat, lng, ...extra,
});
const stations = [
  reference('경기도 성남시 분당구 정자동 1', 37.36),
  reference('경기 용인시 수지구 풍덕천동 1', 37.32),
  reference('서울시 종로구 세종로 1', 37.57),
  reference('경기도 평택시 평택동 1', 36.99),
];
const companies = [
  { id: 'a', lat: 37.36, lng: 127.1, weightPercent: 40, required: true, maxMinutes: 60 },
  { id: 'b', lat: 37.40, lng: 127.1, weightPercent: 50, required: true, maxMinutes: 60 },
  { id: 'c', lat: 37.57, lng: 127.1, weightPercent: 10, required: false, maxMinutes: 60 },
];
const plan = overrides => buildCompanySearchScope({ districts, railStations: stations,
  destinations: companies, limit: 2, ...overrides });

test('company weights select nearby districts before northern or distant cheap areas', () => {
  const result = plan();
  assert.equal(result.mode, 'nearby');
  assert.deepEqual(result.districtCodes, ['41135', '41465']);
  assert.equal(result.totalDistrictCount, 4);
  assert.equal(result.referencedDistrictCount, 4);
  assert.match(result.explanation, /2개 지역만 먼저/);
  assert.match(result.explanation, /실제 통근 가능 시간은 경로 확인/);
});

test('ten percent soft company is weighted without creating a mandatory time intersection', () => {
  const result = plan({ destinations: companies.map(company => company.id === 'c'
    ? { ...company, maxMinutes: 1 } : company) });
  assert.deepEqual(result.districtCodes, plan().districtCodes);
  const northern = plan({ destinations: companies.map(company => ({ ...company,
    weightPercent: company.id === 'c' ? 90 : 5 })) });
  assert.equal(northern.districtCodes[0], '11110');
});

test('all positive-weight company locations are required before narrowing, including optional company', () => {
  for (const bad of [null, '', false, Infinity, 91]) {
    const result = plan({ destinations: companies.map(company => company.id === 'c'
      ? { ...company, lat: bad } : company) });
    assert.equal(result.mode, 'all');
    assert.equal(result.reason, 'unconfirmed-destinations');
    assert.deepEqual(result.districtCodes, []);
  }
  assert.equal(plan({ destinations: [...companies, { id: 'unused', weightPercent: 0 }] }).mode, 'nearby');
});

test('missing destinations or zero weight cannot invent a search anchor', () => {
  for (const destinations of [[], companies.map(company => ({ ...company, weightPercent: 0 }))]) {
    assert.equal(plan({ destinations }).reason, 'missing-destinations');
  }
});

test('reference must have official provenance and exact full address district', () => {
  const railStations = [stations[0],
    reference('용인시 수지구 풍덕천동 1', 37.32),
    reference('서울특별시 종로구청로 1', 37.57),
    reference('경기도 평택시 평택동 1', 36.99, 127.1, { coordinateRole: 'provider-result' })];
  const result = plan({ railStations });
  assert.equal(result.reason, 'insufficient-station-references');
  assert.equal(result.referencedDistrictCount, 1);
});

test('selected provinces constrain codes and a small search stays whole', () => {
  const gyeonggi = plan({ regions: ['gyeonggi'] });
  assert.equal(gyeonggi.totalDistrictCount, 3);
  assert.ok(gyeonggi.districtCodes.every(code => code.startsWith('41')));
  assert.equal(plan({ regions: ['seoul'] }).reason, 'already-small-region');
});

test('catalog codes supersede incompatible parent/new district entries', () => {
  const candidateCatalog = [
    { regionCode: '41135', regionName: '경기도 성남시 분당구' },
    { regionCode: '41135', regionName: '경기도 성남시 분당구' },
    { regionCode: '41465', regionName: '경기도 용인시 수지구' },
    { regionCode: '41220', regionName: '경기도 평택시' },
  ];
  const result = plan({ candidateCatalog,
    districts: [...districts, { code: '41130', name: '경기도 성남시' }] });
  assert.equal(result.totalDistrictCount, 3);
  assert.deepEqual(result.districtCodes, ['41135', '41465']);
});

test('unknown or inconsistent district code/label cannot be used to join station addresses', () => {
  const result = plan({ districts: [
    ...districts,
    { code: '41135', name: '서울특별시 강남구' },
    { code: 'bad', name: '경기도 성남시 분당구' },
    { code: '26110', name: '경기도 성남시 분당구' },
  ] });
  assert.deepEqual(result.districtCodes, ['41135', '41465']);
  const conflict = plan({ districts: [...districts, { code: '41135', name: '경기도 성남시 중원구' }] });
  assert.ok(!conflict.districtCodes.includes('41135'));
});

test('ties and duplicate station rows have stable output and inputs are unchanged', () => {
  const inputs = { districts, railStations: [...stations, ...stations], destinations: companies, limit: 2 };
  const before = structuredClone(inputs);
  const first = buildCompanySearchScope(inputs);
  const second = buildCompanySearchScope({ ...inputs, districts: [...districts].reverse(), railStations: [...inputs.railStations].reverse() });
  assert.deepEqual(first, second);
  assert.deepEqual(inputs, before);
  assert.ok(!JSON.stringify(first).includes('127.1'));
  assert.deepEqual(Object.keys(first.districts[0]).sort(), ['code', 'name']);
});

test('actual public catalogs produce eight valid district codes without provider requests', () => {
  const candidateCatalog = JSON.parse(fs.readFileSync(new URL('../data/apartment-catalog-seoul-gyeonggi.json', import.meta.url))).apartments;
  const railStations = JSON.parse(fs.readFileSync(new URL('../data/rail-stations.json', import.meta.url))).stations;
  const result = buildCompanySearchScope({ candidateCatalog, railStations, destinations: companies });
  const officialCodes = new Set(candidateCatalog.map(candidate => candidate.regionCode));
  assert.equal(result.mode, 'nearby');
  assert.equal(result.districtCodes.length, 8);
  assert.ok(result.districtCodes.every(code => officialCodes.has(code)));
  assert.ok(result.districtCodes.includes('41135'));
  assert.ok(result.districtCodes.includes('41465'));
  assert.ok(!result.districtCodes.includes('41220'));
});
