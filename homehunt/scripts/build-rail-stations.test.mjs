import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildRailDataset, parseRailWorkbook } from './build-rail-stations.mjs';

const dataset = JSON.parse(await readFile(new URL('../data/rail-stations.json', import.meta.url), 'utf8'));
const header = ['역번호', '역사명', '노선번호', '노선명', '영문역사명', '한자역사명', '환승역구분', '환승노선번호', '환승노선명', '역위도', '역경도', '운영기관명', '역사도로명주소', '역사전화번호', '데이터기준일자'];
const rows = dataset.stations.map(station => [station.stationCode, station.name, station.lineId, station.lines[0], '', '', '', '', '', station.lat, station.lng, station.operator, station.address, '', station.updatedAt || station.sourceDateRaw || '']);
const metadata = { filename: dataset.source.filename, sha256: dataset.source.sha256, retrievedAt: dataset.source.retrievedAt };

test('committed snapshot accounts for every source row and keeps border-region stations', () => {
  assert.equal(dataset.stations.length, dataset.coverage.stationCount);
  assert.equal(dataset.coverage.sourceRowCount, dataset.stations.length + Object.values(dataset.coverage.excluded).reduce((sum, count) => sum + count, 0));
  assert.equal(new Set(dataset.stations.map(station => station.id)).size, dataset.stations.length);
  assert.ok(dataset.stations.some(station => station.regionName === '인천광역시'));
  assert.ok(dataset.stations.some(station => station.regionName === '충청남도'));
  assert.ok(dataset.stations.every(station => station.coordinateType === 'station'));
  assert.ok(dataset.stations.every(station => Number.isFinite(station.lat) && Number.isFinite(station.lng)));
  assert.equal(dataset.source.publishedDate, null);
  assert.match(dataset.source.sha256, /^[a-f0-9]{64}$/);
});

test('Gangnam anchor uses the official line-specific row without averaging transfer coordinates', () => {
  const gangnam = dataset.stations.find(station => station.id === dataset.anchor.id);
  assert.equal(gangnam.name, '강남');
  assert.equal(gangnam.lineId, 'S1102');
  assert.equal(dataset.anchor.lat, gangnam.lat);
  assert.equal(dataset.anchor.lng, gangnam.lng);
  assert.equal(dataset.anchor.updatedAt, gangnam.updatedAt);
  assert.ok(dataset.stations.filter(station => station.name === '강남').length > 1);
});

test('same source ID and geometry retains newer official name and old alias', () => {
  const original = rows.find(row => row[2] === 'S1107' && row[0] === '0736');
  const older = [...original];
  older[1] = '총신대입구(이수)';
  older[14] = '2024-12-31';
  const result = buildRailDataset([header, older, ...rows], metadata);
  const merged = result.stations.find(station => station.stationCode === '0736' && station.lineId === 'S1107');
  assert.equal(merged.name, '이수');
  assert.deepEqual(merged.aliases, ['총신대입구(이수)']);
  assert.equal(result.coverage.excluded.duplicateRows, 1);
  assert.equal(result.stations.length, rows.length);
});

test('invalid regional coordinates and planned stations never acquire usable fabricated points', () => {
  const badCoordinate = [...rows[0]];
  badCoordinate[0] = 'invalid-coordinate';
  badCoordinate[9] = 36.963729;
  badCoordinate[10] = 129.091321;
  badCoordinate[12] = '서울시 중랑구 송림길 147';
  const planned = [...rows[0]];
  planned[0] = 'planned-station';
  planned[1] = '미개통역(예정)';
  const result = buildRailDataset([header, ...rows, badCoordinate, planned], metadata);
  assert.equal(result.stations.length, rows.length);
  assert.equal(result.coverage.excluded.invalidCoordinates, 1);
  assert.equal(result.coverage.excluded.proposedOrClosed, 1);
  assert.equal(result.coverage.excludedCoordinateRows[0].lng, '129.091321');
});

test('compact, Excel and invalid dates preserve observation uncertainty', () => {
  const copy = rows.map(row => [...row]);
  copy[0][14] = '20240812';
  copy[1][14] = '46191';
  copy[2][14] = '1900-01-00';
  const result = buildRailDataset([header, ...copy], metadata);
  const find = row => result.stations.find(station => station.id === `kric:${row[2]}:${row[0]}:${row[3]}`);
  assert.equal(find(copy[0]).updatedAt, '2024-08-12');
  assert.equal(find(copy[1]).updatedAt, '2026-06-18');
  assert.equal(find(copy[2]).updatedAt, null);
  assert.equal(find(copy[2]).sourceDateRaw, '1900-01-00');
});

test('source geometry conflicts and changed schemas stop generation', () => {
  const conflict = [...rows[0]];
  conflict[9] = Number(conflict[9]) + 0.001;
  assert.throws(() => buildRailDataset([header, ...rows, conflict], metadata), /Conflicting official station geometry/);
  assert.throws(() => buildRailDataset([['다른 형식'], ...rows], metadata), /columns changed/);
  assert.throws(() => buildRailDataset([header, ...rows.slice(0, 2)], metadata), /Incomplete/);
  assert.throws(() => parseRailWorkbook(Buffer.from('<html>download unavailable</html>')), /ZIP/);
});
