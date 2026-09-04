import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const defaultOutputPath = path.join(projectDir, 'data', 'apartment-catalog.json');
const districtPath = path.join(projectDir, 'data', 'law-districts.json');

function usage() {
  return [
    'Usage: node homehunt/scripts/build-apartment-catalog.mjs <source.csv> [output.json]',
    '',
    'The source must be the UTF-8 nationwide apartment-complex CSV from the Korea Real Estate Board.',
    `The default output is ${path.relative(process.cwd(), defaultOutputPath) || defaultOutputPath}.`,
  ].join('\n');
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function cleanIdentifier(value) {
  return cleanText(value).replace(/^['\"]|['\"]$/g, '');
}

function parseNonNegativeInteger(value) {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  if (!/^\d+(?:\.0+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseBuiltYear(value) {
  const match = String(value ?? '').match(/(?:^|\D)((?:18|19|20)\d{2})(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function parseCsvRecord(record) {
  const fields = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < record.length; index += 1) {
    const character = record[index];
    if (quoted) {
      if (character === '"') {
        if (record[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ',') {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('Unclosed quoted field in CSV record.');
  fields.push(field);
  return fields;
}

function isCompleteCsvRecord(record) {
  let quoted = false;
  for (let index = 0; index < record.length; index += 1) {
    if (record[index] !== '"') continue;
    if (quoted && record[index + 1] === '"') {
      index += 1;
    } else {
      quoted = !quoted;
    }
  }
  return !quoted;
}

async function forEachCsvRecord(filePath, visitor) {
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let pending = '';
  let recordNumber = 0;

  for await (const line of lines) {
    pending = pending ? `${pending}\n${line}` : line;
    if (!isCompleteCsvRecord(pending)) continue;
    recordNumber += 1;
    await visitor(parseCsvRecord(pending), recordNumber);
    pending = '';
  }

  if (pending) throw new Error('CSV ended inside a quoted field.');
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function firstAddressTokenAfterRegion(address, regionName) {
  const normalizedAddress = cleanText(address);
  const legalDong = normalizedAddress.split(' ').filter(Boolean)
    .findLast((token) => /(?:읍|면|동|가|리)$/u.test(token));
  if (legalDong) return legalDong;
  const normalizedRegion = cleanText(regionName);
  const remainder = normalizedAddress.startsWith(`${normalizedRegion} `)
    ? normalizedAddress.slice(normalizedRegion.length + 1)
    : normalizedAddress;
  return remainder.split(' ')[0] || '';
}

function canonicalApartmentAddress(address, regionName) {
  const normalizedAddress = cleanText(address);
  const normalizedRegion = cleanText(regionName);
  if (!normalizedAddress || !normalizedRegion) return normalizedAddress;
  const dong = firstAddressTokenAfterRegion(normalizedAddress, normalizedRegion);
  const dongIndex = dong ? normalizedAddress.lastIndexOf(dong) : -1;
  if (dongIndex < 0) return normalizedAddress;
  return `${normalizedRegion} ${normalizedAddress.slice(dongIndex)}`.replace(/\s+/g, ' ').trim();
}

function inferLegacyRegionName(address, regionCode) {
  const tokens = cleanText(address).split(' ').filter(Boolean);
  if (tokens[0] === '세종특별자치시') return tokens[0];
  if (tokens.length >= 2) return `${tokens[0]} ${tokens[1]}`;
  return tokens[0] || regionCode;
}

function uniqueSorted(values) {
  return [...new Set([...values].map(cleanText).filter(Boolean))].sort(compareText);
}

function chooseDeterministicText(values) {
  return uniqueSorted(values).sort((left, right) => left.length - right.length || compareText(left, right))[0] || '';
}

function mergeCandidate(existing, candidate) {
  if (!existing) {
    return {
      ...candidate,
      namesByPriority: candidate.namesByPriority.map((names) => new Set(names)),
      addresses: new Set(candidate.address ? [candidate.address] : []),
      builtYears: new Set(candidate.builtYear === null ? [] : [candidate.builtYear]),
      householdCounts: new Set(candidate.households === null ? [] : [candidate.households]),
    };
  }

  if (existing.regionCode !== candidate.regionCode) {
    throw new Error(`Catalog ID ${candidate.catalogId} is associated with multiple region codes.`);
  }
  candidate.namesByPriority.forEach((names, priority) => {
    for (const name of names) existing.namesByPriority[priority].add(name);
  });
  if (candidate.address) existing.addresses.add(candidate.address);
  if (candidate.builtYear !== null) existing.builtYears.add(candidate.builtYear);
  if (candidate.households !== null) existing.householdCounts.add(candidate.households);
  return existing;
}

function finalizeCandidate(candidate) {
  const prioritizedNames = candidate.namesByPriority.map((names) => [...names].sort(compareText));
  const name = prioritizedNames.find((names) => names.length)?.[0] || '';
  const aliases = uniqueSorted(prioritizedNames.flat()).filter((alias) => alias !== name);
  const address = canonicalApartmentAddress(chooseDeterministicText(candidate.addresses), candidate.regionName);
  const builtYear = [...candidate.builtYears].sort((left, right) => left - right)[0] ?? null;
  const households = [...candidate.householdCounts].sort((left, right) => right - left)[0] ?? null;

  return {
    catalogId: candidate.catalogId,
    regionCode: candidate.regionCode,
    regionName: candidate.regionName,
    name,
    aliases,
    dong: firstAddressTokenAfterRegion(address, candidate.regionName),
    address,
    builtYear,
    households,
  };
}

const argumentsList = process.argv.slice(2);
if (argumentsList.includes('--help') || argumentsList.includes('-h')) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}
if (argumentsList.length < 1 || argumentsList.length > 2) throw new Error(usage());

const inputPath = path.resolve(argumentsList[0]);
const outputPath = argumentsList[1] ? path.resolve(argumentsList[1]) : defaultOutputPath;
if (inputPath === outputPath) throw new Error('Input and output paths must be different.');

const districtDocument = JSON.parse(await readFile(districtPath, 'utf8'));
const districts = Array.isArray(districtDocument.districts) ? districtDocument.districts : [];
const districtByCode = new Map(districts.map((district) => [String(district.code), district]));
if (!districtByCode.size) throw new Error(`No districts found in ${districtPath}.`);

const requiredHeaders = [
  '단지고유번호',
  '필지고유번호',
  '주소',
  '단지명_공시가격',
  '단지명_건축물대장',
  '단지명_도로명주소',
  '단지종류',
  '세대수',
  '사용승인일',
];
let headerIndex = null;
let sourceRowCount = 0;
let apartmentRowCount = 0;
let skippedMissingIdentity = 0;
let fallbackRegionCount = 0;
let duplicateRowCount = 0;
const candidatesById = new Map();

await forEachCsvRecord(inputPath, (row, recordNumber) => {
  if (recordNumber === 1) {
    const headers = row.map((value, index) => cleanText(index === 0 ? value.replace(/^\uFEFF/, '') : value));
    headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
    const missing = requiredHeaders.filter((header) => headerIndex[header] === undefined);
    if (missing.length) throw new Error(`CSV is missing required headers: ${missing.join(', ')}`);
    return;
  }

  sourceRowCount += 1;
  const read = (header) => row[headerIndex[header]] ?? '';
  if (cleanText(read('단지종류')) !== '1') return;
  apartmentRowCount += 1;

  const catalogId = cleanIdentifier(read('단지고유번호'));
  const pnu = cleanIdentifier(read('필지고유번호'));
  if (!catalogId || !/^\d{5,}$/.test(pnu)) {
    skippedMissingIdentity += 1;
    return;
  }

  const regionCode = pnu.slice(0, 5);
  const district = districtByCode.get(regionCode);
  if (!district) fallbackRegionCount += 1;

  const namesByPriority = [
    uniqueSorted([read('단지명_공시가격')]),
    uniqueSorted([read('단지명_건축물대장')]),
    uniqueSorted([read('단지명_도로명주소')]),
  ];
  if (!namesByPriority.some((names) => names.length)) {
    skippedMissingIdentity += 1;
    return;
  }

  const candidate = {
    catalogId,
    regionCode,
    regionName: district
      ? cleanText(district.name)
      : inferLegacyRegionName(read('주소'), regionCode),
    namesByPriority,
    address: cleanText(read('주소')),
    builtYear: parseBuiltYear(read('사용승인일')),
    households: parseNonNegativeInteger(read('세대수')),
  };
  if (candidatesById.has(catalogId)) duplicateRowCount += 1;
  candidatesById.set(catalogId, mergeCandidate(candidatesById.get(catalogId), candidate));
});

if (!headerIndex) throw new Error('CSV is empty.');
const apartments = [...candidatesById.values()]
  .map(finalizeCandidate)
  .sort((left, right) => compareText(left.regionCode, right.regionCode)
    || compareText(left.name, right.name)
    || compareText(left.dong, right.dong)
    || compareText(left.catalogId, right.catalogId));

const document = {
  schemaVersion: 1,
  source: {
    name: '한국부동산원 전국 공동주택 단지정보 CSV',
    url: 'https://www.data.go.kr/data/15106861/fileData.do',
    publishedDate: '2025-09-18',
    sourceFile: path.basename(inputPath),
    sha256: await sha256(inputPath),
    format: 'CSV (UTF-8)',
    filter: '단지종류=1',
    regionReference: path.basename(districtPath),
    sourceRowCount,
    apartmentRowCount,
    catalogCount: apartments.length,
    skippedMissingIdentity,
    fallbackRegionCount,
    duplicateRowCount,
  },
  apartments,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(document)}\n`, 'utf8');
const metaOutputPath = path.join(path.dirname(outputPath), `${path.basename(outputPath, path.extname(outputPath))}-meta.json`);
await writeFile(metaOutputPath, `${JSON.stringify({ schemaVersion: document.schemaVersion, source: document.source }, null, 2)}\n`, 'utf8');
const outputStats = await stat(outputPath);
process.stdout.write([
  `Saved ${apartments.length.toLocaleString('en-US')} apartments to ${outputPath}.`,
  `Saved lightweight catalog metadata to ${metaOutputPath}.`,
  `Source rows: ${sourceRowCount.toLocaleString('en-US')}; apartment rows: ${apartmentRowCount.toLocaleString('en-US')}; duplicates removed: ${duplicateRowCount.toLocaleString('en-US')}.`,
  `Skipped missing identity: ${skippedMissingIdentity.toLocaleString('en-US')}; legacy region fallbacks: ${fallbackRegionCount.toLocaleString('en-US')}; output bytes: ${outputStats.size.toLocaleString('en-US')}.`,
].join('\n') + '\n');
