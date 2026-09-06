import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const RAIL_SOURCE_URL = 'https://data.kric.go.kr/rips/M_01_01/detail.do?id=32';
export const RAIL_DOWNLOAD_URL = 'https://data.kric.go.kr/rips/dataset/download.file?type=filedata&id=32&operation=1';

function xmlText(value = '') {
  return value.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

// Read the small public workbook without Excel, an API key, or third-party packages.
// Unsupported ZIP/XLSX formats fail closed instead of publishing a partial table.
export function parseRailWorkbook(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('Invalid XLSX file');
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) throw new Error('Unsupported XLSX ZIP');
  const entryCount = buffer.readUInt16LE(end + 10);
  if (entryCount === 65535) throw new Error('ZIP64 is not supported');
  const files = new Map();
  let cursor = buffer.readUInt32LE(end + 16);
  for (let index = 0; index < entryCount; index++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP directory');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const expandedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    const localOffset = buffer.readUInt32LE(cursor + 42);
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid ZIP entry');
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    if (start + compressedSize > buffer.length || expandedSize > 15_000_000) throw new Error('Unexpected XLSX entry size');
    if (/^xl\/(sharedStrings\.xml|workbook\.xml|worksheets\/sheet1\.xml)$/.test(name)) {
      const compressed = buffer.subarray(start, start + compressedSize);
      const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed, { maxOutputLength: 15_000_000 }) : null;
      if (!data || data.length !== expandedSize) throw new Error('Unsupported XLSX compression');
      files.set(name, data.toString('utf8'));
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  const sheet = files.get('xl/worksheets/sheet1.xml');
  if (!sheet || /<workbookPr\b[^>]*date1904="(?:1|true)"/.test(files.get('xl/workbook.xml') || '')) throw new Error('Unsupported XLSX worksheet/calendar');
  const strings = [...(files.get('xl/sharedStrings.xml') || '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)]
    .map(([, value]) => [...value.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(([, part]) => xmlText(part)).join(''));
  return [...sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(([, row]) => {
    const values = [];
    for (const [, attrs, body = ''] of row.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const reference = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      if (!reference) throw new Error('Missing XLSX cell reference');
      const column = [...reference].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
      const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || '';
      values[column] = /\bt="s"/.test(attrs) ? strings[Number(raw)]
        : /\bt="inlineStr"/.test(attrs) ? [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(([, part]) => xmlText(part)).join('')
          : xmlText(raw);
    }
    return values;
  }).filter(row => row.some(value => value !== '' && value != null));
}

export async function readRailSource(inputPath) {
  if (inputPath) return { buffer: await readFile(inputPath), filename: inputPath.split(/[\\/]/).pop() };
  const response = await fetch(RAIL_DOWNLOAD_URL, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Official railway download HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 5_000_000) throw new Error('Unexpected railway workbook size');
  const encodedName = response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/)?.[1] || '';
  const filename = Buffer.from(encodedName, 'latin1').toString('utf8');
  return { buffer, filename };
}

function sourceDate(value) {
  const raw = String(value || '').trim();
  const text = /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text)) && new Date(text).toISOString().slice(0, 10) === text) return text;
  if (/^\d{5}(?:\.0+)?$/.test(text)) return new Date(Date.UTC(1899, 11, 30) + Number(text) * 86_400_000).toISOString().slice(0, 10);
  return null;
}

export function buildRailDataset(table, { filename, sha256, retrievedAt = new Date().toISOString() } = {}) {
  const expected = ['역번호', '역사명', '노선번호', '노선명', '영문역사명', '한자역사명', '환승역구분', '환승노선번호', '환승노선명', '역위도', '역경도', '운영기관명', '역사도로명주소', '역사전화번호', '데이터기준일자'];
  if (JSON.stringify(table?.[0]) !== JSON.stringify(expected)) throw new Error('Official railway worksheet columns changed');
  const fileDate = filename?.match(/_(\d{4})(\d{2})(\d{2})\.xlsx$/);
  if (!fileDate) throw new Error('Missing dated official railway workbook filename');
  const sourceReferenceDate = sourceDate(`${fileDate[1]}-${fileDate[2]}-${fileDate[3]}`);
  if (!sourceReferenceDate) throw new Error('Invalid official railway workbook reference date');
  const stations = [];
  const excluded = { invalidCoordinates: 0, proposedOrClosed: 0, sightseeingRail: 0, duplicateRows: 0 };
  const excludedCoordinateRows = [];
  const ids = new Map();
  for (const row of table.slice(1)) {
    const text = index => String(row[index] ?? '').trim().replace(/\s+/g, ' ');
    const address = text(12);
    const metropolitan = address.match(/^(인천|부산|대구|대전|울산)(?:광역시|시)?\s/)?.[1];
    const province = address.match(/^(광주광역시|강원특별자치도|강원도|충청남도|충남|경상북도|경북|경상남도|경남)(?:\s|$)/)?.[1];
    const regionName = /^서울(?:특별시|시)?\s/.test(address) ? '서울특별시' : /^경기(?:도)?\s/.test(address) ? '경기도'
      : metropolitan ? `${metropolitan}광역시` : ({ 충남: '충청남도', 경북: '경상북도', 경남: '경상남도' }[province] || province || null);
    if (/예정|미개통|폐역|폐지|운행중단/.test([text(1), text(3), address].join(' '))) { excluded.proposedOrClosed++; continue; }
    // Incheon officially reclassified this line as a sightseeing/support tram in 2025.
    // It is outside the regular urban/commuter rail proximity scope.
    if (text(3) === '자기부상철도') { excluded.sightseeingRail++; continue; }
    const lat = Number(text(9)), lng = Number(text(10));
    const outsideKorea = !(lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132);
    const outsideSeoulGyeonggi = ['서울특별시', '경기도'].includes(regionName) && !(lat >= 36.8 && lat <= 38.4 && lng >= 126.3 && lng <= 127.9);
    if (outsideKorea || outsideSeoulGyeonggi) {
      excluded.invalidCoordinates++;
      excludedCoordinateRows.push({ name: text(1), line: text(3), lat: text(9), lng: text(10), reason: outsideKorea ? '원본 좌표가 대한민국 검증 범위 밖' : '서울·경기 주소의 원본 좌표가 해당 지역 검증 범위 밖' });
      continue;
    }
    if (!text(0) || !text(1) || !text(2) || !text(3) || !text(11)) throw new Error('Missing official station identity');
    const station = {
      id: `kric:${text(2)}:${text(0)}:${text(3)}`,
      name: text(1),
      lines: [text(3)],
      lineId: text(2),
      stationCode: text(0),
      lat, lng, regionName, address,
      operator: text(11),
      source: '국가철도공단 · 전국 도시철도 운영기관',
      sourceUrl: RAIL_SOURCE_URL,
      updatedAt: sourceDate(row[14]),
      coordinateType: 'station',
      coordinateRole: 'official-station-reference',
    };
    if (!station.updatedAt) station.sourceDateRaw = text(14);
    if (ids.has(station.id)) {
      const previous = ids.get(station.id);
      if (previous.lat !== station.lat || previous.lng !== station.lng || previous.address !== station.address || previous.operator !== station.operator) {
        throw new Error(`Conflicting official station geometry: ${JSON.stringify([previous, station])}`);
      }
      const names = [...new Set([previous.name, ...(previous.aliases || []), station.name])];
      if ((station.updatedAt || '') > (previous.updatedAt || '')) Object.assign(previous, station);
      const aliases = names.filter(name => name !== previous.name);
      if (aliases.length) previous.aliases = aliases;
      excluded.duplicateRows++;
      continue;
    }
    ids.set(station.id, station);
    stations.push(station);
  }
  const gangnam = stations.find(station => station.name === '강남' && station.lineId === 'S1102');
  if (!gangnam || stations.length < 900) throw new Error('Incomplete national railway source');
  stations.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const dates = stations.map(station => station.updatedAt).filter(Boolean).sort();
  const regions = [...new Set(stations.map(station => station.regionName || '원본 주소 지역 미표기'))].sort();
  return {
    schemaVersion: 1,
    source: {
      name: '국가철도공단 도시광역철도 역사정보 · 전국 도시철도 운영기관',
      url: RAIL_SOURCE_URL,
      catalogUrl: 'https://www.data.go.kr/data/15013205/standard.do',
      downloadUrl: RAIL_DOWNLOAD_URL,
      filename,
      publishedDate: null,
      referenceDate: sourceReferenceDate,
      retrievedAt,
      sha256,
      license: '이용허락범위 제한 없음',
      licenseUrl: 'https://www.data.go.kr/data/15013205/standard.do',
      coordinateType: 'station',
      earliestRecordDate: dates[0],
      latestRecordDate: dates.at(-1),
    },
    coverage: {
      regions,
      homeSearchRegions: ['서울특별시', '경기도'],
      stationCount: stations.length,
      sourceRowCount: table.length - 1,
      regionCounts: Object.fromEntries(regions.map(region => [region, stations.filter(station => (station.regionName || '원본 주소 지역 미표기') === region).length])),
      lineNames: [...new Set(stations.flatMap(station => station.lines))].sort(),
      excluded,
      excludedCoordinateRows,
      invalidRecordDateCount: stations.filter(station => !station.updatedAt).length,
      completeness: 'source-records-only',
      label: '공식 자료에 수록된 역 중 가까운 역',
      notes: [
        '경계 지역의 가장 가까운 역을 놓치지 않도록 전국 자료의 유효한 역사 좌표를 포함합니다. 집 검색 범위는 서울·경기를 유지합니다.',
        '미수록 역·신설 노선의 전체 포함을 보장하지 않습니다. 원본에 GTX 노선이 없어 포함하지 않았습니다.',
        '환승역은 노선별 원본 좌표를 보존하며 같은 이름만으로 합치지 않습니다. 행 수는 고유 환승역 수와 다릅니다.',
        '파일 기준일과 개별 역 기준일이 다릅니다. 실시간 운행·휴업·출입구 개방 여부를 제공하지 않습니다.',
        '역사 대표 좌표까지의 직선거리용입니다. 출입구 위치·도보 경로·열차 소요시간·환승시간이 아닙니다.',
        '체험형·공항이동지원형 궤도시설로 전환된 인천공항 자기부상철도는 일반 도시·광역철도 근접 평가에서 제외합니다.',
      ],
    },
    anchor: {
      id: gangnam.id,
      name: '강남역',
      stationName: gangnam.name,
      lines: gangnam.lines,
      lat: gangnam.lat,
      lng: gangnam.lng,
      coordinateType: gangnam.coordinateType,
      source: gangnam.source,
      sourceUrl: gangnam.sourceUrl,
      updatedAt: gangnam.updatedAt,
      note: '공식 2호선 강남역 역사 좌표를 강남 접근성의 한 기준점으로 사용합니다.',
    },
    stations,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const inputPath = process.argv.includes('--input') ? process.argv[process.argv.indexOf('--input') + 1] : null;
  const { buffer, filename } = await readRailSource(inputPath);
  const table = parseRailWorkbook(buffer);
  const dataset = buildRailDataset(table, { filename, sha256: createHash('sha256').update(buffer).digest('hex') });
  if (process.argv.includes('--inspect')) {
    console.log(JSON.stringify({ source: dataset.source, coverage: dataset.coverage, anchor: dataset.anchor, stations: dataset.stations.map(({ name, lines, updatedAt }) => [name, lines.join('/'), updatedAt]) }, null, 2));
  } else {
    await writeFile(new URL('../data/rail-stations.json', import.meta.url), `${JSON.stringify(dataset, null, 2)}\n`);
    console.log(JSON.stringify({ source: dataset.source.filename, count: dataset.stations.length, coverage: dataset.coverage.regionCounts, anchor: dataset.anchor }));
  }
}
