import { promises as fs } from 'node:fs';
import { publicDataPath, sourceDataPath } from '../paths.mjs';

const sourcePath = sourceDataPath('apartment-catalog.json');
const outputPath = publicDataPath('apartment-catalog-seoul-gyeonggi.json');
const metaPath = publicDataPath('apartment-catalog-seoul-gyeonggi-meta.json');
const payload = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
const apartments = (payload.apartments || []).filter((item) => /^(11|41)/.test(String(item.regionCode || '')));
const output = {
  ...payload,
  source: {
    ...(payload.source || {}),
    catalogCount: apartments.length,
    parentCatalogCount: payload.apartments?.length || 0,
    regionFilter: ['서울특별시', '경기도'],
  },
  apartments,
};
await fs.writeFile(outputPath, JSON.stringify(output), 'utf8');
await fs.writeFile(metaPath, JSON.stringify({ schemaVersion: output.schemaVersion, source: output.source }, null, 2), 'utf8');
console.log(`서울·경기 아파트 ${apartments.length.toLocaleString('ko-KR')}개 → ${outputPath}`);
