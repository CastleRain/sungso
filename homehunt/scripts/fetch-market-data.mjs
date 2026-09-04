import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalizeTransaction, buildMarketSummary } from '../js/market-core.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const regionConfig = JSON.parse(await readFile(path.join(projectDir, 'config', 'regions.json'), 'utf8'));
const trackedConfig = JSON.parse(await readFile(path.join(projectDir, 'config', 'tracked-apartments.json'), 'utf8'));

function decodeServiceKey(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  try { return decodeURIComponent(trimmed); } catch (_) { return trimmed; }
}

const serviceKey = decodeServiceKey(process.env.DATA_GO_KR_SERVICE_KEY);
if (!serviceKey) throw new Error('DATA_GO_KR_SERVICE_KEY is required. Store it as a GitHub Actions Secret; never commit it.');

const ENDPOINTS = {
  sale: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade',
  rent: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
};

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeXml(value) {
  return String(value || '')
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function tagValue(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${escapeRegex(name)}>([\\s\\S]*?)<\\/${escapeRegex(name)}>`));
    if (match) return decodeXml(match[1]);
  }
  return '';
}

function parseResponse(xml, type, region, pageNo = 1) {
  const resultCode = tagValue(xml, ['resultCode']);
  const resultMessage = tagValue(xml, ['resultMsg']);
  if (resultCode && !['000', '00'].includes(resultCode)) throw new Error(`MOLIT ${resultCode}: ${resultMessage}`);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  return items.map((block, index) => normalizeTransaction({
    id: tagValue(block, ['dealAmountSn', '거래일련번호']) || `${type}-${region.code}-${pageNo}-${index}-${tagValue(block, ['dealYear', '년'])}${tagValue(block, ['dealMonth', '월'])}${tagValue(block, ['dealDay', '일'])}-${tagValue(block, ['aptNm', '아파트'])}`,
    aptSeq: tagValue(block, ['aptSeq', '아파트일련번호']),
    dealType: type === 'sale' ? '매매' : Number(String(tagValue(block, ['monthlyRent', '월세금액'])).replace(/,/g, '')) > 0 ? '월세' : '전세',
    regionCode: tagValue(block, ['sggCd', '지역코드']) || region.code,
    regionName: region.name,
    dong: tagValue(block, ['umdNm', '법정동']),
    apartmentName: tagValue(block, ['aptNm', '아파트']),
    month: `${tagValue(block, ['dealYear', '년'])}${String(tagValue(block, ['dealMonth', '월'])).padStart(2, '0')}`,
    day: tagValue(block, ['dealDay', '일']),
    areaM2: tagValue(block, ['excluUseAr', '전용면적']),
    amountManWon: type === 'sale' ? tagValue(block, ['dealAmount', '거래금액']) : 0,
    depositManWon: type === 'rent' ? tagValue(block, ['deposit', '보증금액']) : 0,
    monthlyRentManWon: type === 'rent' ? tagValue(block, ['monthlyRent', '월세금액']) : 0,
    floor: tagValue(block, ['floor', '층']),
    builtYear: tagValue(block, ['buildYear', '건축년도']),
    roadName: tagValue(block, ['roadNm', '도로명']),
    cancelled: Boolean(tagValue(block, ['cdealDay', '해제사유발생일', 'cdealType'])),
  })).filter(Boolean);
}

function seoulCurrentMonthIndex(now = new Date()) {
  const seoul = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return seoul.getUTCFullYear() * 12 + seoul.getUTCMonth();
}

function compactMonth(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}${String(month).padStart(2, '0')}`;
}

function monthValue(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function totalCountFrom(xml) {
  const count = Number(tagValue(xml, ['totalCount']));
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

async function fetchPage(region, dealYmd, type, pageNo, numOfRows) {
  const url = new URL(ENDPOINTS[type]);
  url.searchParams.set('serviceKey', serviceKey);
  url.searchParams.set('LAWD_CD', region.code);
  url.searchParams.set('DEAL_YMD', dealYmd);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(numOfRows));
  const response = await fetch(url, { headers: { Accept: 'application/xml' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${type} ${region.code} ${dealYmd}: HTTP ${response.status}`);
  const xml = await response.text();
  return { records: parseResponse(xml, type, region, pageNo), totalCount: totalCountFrom(xml) };
}

async function fetchMonth(region, dealYmd, type) {
  const pageSize = 9999;
  const first = await fetchPage(region, dealYmd, type, 1, pageSize);
  const pageCount = Math.max(1, Math.ceil(first.totalCount / pageSize));
  const records = [...first.records];
  for (let pageNo = 2; pageNo <= pageCount; pageNo += 1) {
    const page = await fetchPage(region, dealYmd, type, pageNo, pageSize);
    records.push(...page.records);
  }
  return records;
}

async function workerPool(tasks, concurrency = 4) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      const task = tasks[index];
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          results[index] = await task();
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, attempt * 700));
        }
      }
      if (lastError) throw lastError;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results.flat();
}

const regionByCode = new Map(regionConfig.regions.map((region) => [String(region.code), region]));
for (const apartment of trackedConfig.apartments || []) {
  if (apartment.lawdCd && !regionByCode.has(String(apartment.lawdCd))) {
    regionByCode.set(String(apartment.lawdCd), { code: String(apartment.lawdCd), name: apartment.regionName || apartment.lawdCd });
  }
}
const regions = [...regionByCode.values()];
const currentMonthIndex = seoulCurrentMonthIndex();
const endIndex = currentMonthIndex - 1;
const lookback = Math.max(24, Math.min(Number(regionConfig.lookbackMonths) || 40, 60));
const months = Array.from({ length: lookback }, (_, offset) => compactMonth(endIndex - (lookback - 1 - offset)));
const historyRange = {
  months: lookback,
  rangeStart: monthValue(endIndex - lookback + 1),
  rangeEnd: monthValue(endIndex),
  endMonth: monthValue(endIndex),
  includesCurrentMonth: endIndex === currentMonthIndex,
};
const tasks = [];
for (const region of regions) {
  for (const dealYmd of months) {
    tasks.push(() => fetchMonth(region, dealYmd, 'sale'));
    tasks.push(() => fetchMonth(region, dealYmd, 'rent'));
  }
}

const records = await workerPool(tasks, 4);
const generatedAt = new Date().toISOString();
const summary = {
  ...buildMarketSummary(records, {
  source: '국토부 아파트 실거래',
  sourceType: 'official',
  generatedAt,
  provisionalMonths: Number(regionConfig.provisionalMonths) || 2,
  }),
  ...historyRange,
};
const minimumRecords = Math.max(50, regions.length * 10);
const minimumRegions = Math.max(1, Math.ceil(regions.length * .7));
if (records.length < minimumRecords || summary.regions.length < minimumRegions) {
  throw new Error(`Refusing to overwrite market data: only ${records.length} records across ${summary.regions.length}/${regions.length} regions.`);
}
await writeFile(path.join(projectDir, 'data', 'market-summary.json'), `${JSON.stringify(summary)}\n`, 'utf8');

const normalizeApt = (value) => String(value || '').replace(/\s+/g, '').toLowerCase();
const apartments = (trackedConfig.apartments || []).map((tracked) => {
  const target = normalizeApt(tracked.name);
  const apartmentRecords = records.filter((record) => String(record.regionCode) === String(tracked.lawdCd)
    && (tracked.aptSeq ? String(record.aptSeq) === String(tracked.aptSeq) : normalizeApt(record.apartmentName) === target));
  return {
    id: tracked.id || `${tracked.lawdCd}-${target}`,
    name: tracked.name,
    lawdCd: String(tracked.lawdCd),
    aptSeq: String(tracked.aptSeq || apartmentRecords[0]?.aptSeq || ''),
    regionName: tracked.regionName || regionByCode.get(String(tracked.lawdCd))?.name || '',
    coveredMonths: lookback,
    ...historyRange,
    updatedAt: generatedAt,
    transactions: apartmentRecords,
  };
});
await writeFile(path.join(projectDir, 'data', 'apartment-history.json'), `${JSON.stringify({ version: 2, source: '국토부 아파트 실거래', generatedAt, coveredMonths: lookback, ...historyRange, apartments })}\n`, 'utf8');

process.stdout.write(`Saved ${records.length} transactions across ${summary.regions.length} regions and ${apartments.length} tracked apartments.\n`);
