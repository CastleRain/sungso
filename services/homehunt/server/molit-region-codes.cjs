// Current MOLIT endpoints re-key even historical Hwaseong contracts to the new
// districts. Catalog IDs/legacy region filters remain stable across both UIs.
// Official change: https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000052&nttId=122595
const HWASEONG_REGION_ALIAS_VERSION = 1;
const HWASEONG_DISTRICTS = Object.freeze(['41591', '41593', '41595', '41597']);
function sourceRegionCodes(code, now = new Date()) {
  return String(code) === '41590' && now >= new Date('2026-01-31T15:00:00Z')
    ? [...HWASEONG_DISTRICTS] : [String(code)];
}
function normalizeCatalogRegion(record, catalogCode, sourceCode) {
  if (String(catalogCode) !== '41590' || !HWASEONG_DISTRICTS.includes(String(sourceCode))) return record;
  if (String(record.regionCode || record.lawdCd) !== String(sourceCode)) throw new Error('MOLIT region identity mismatch');
  return { ...record, sourceRegionCode: String(sourceCode), sourceLawdCd: String(sourceCode),
    regionCode: '41590', lawdCd: '41590' };
}
module.exports = { HWASEONG_REGION_ALIAS_VERSION, sourceRegionCodes, normalizeCatalogRegion };
