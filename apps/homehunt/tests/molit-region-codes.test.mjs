import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createMemoryFirestore } from './helpers/firestore-memory.mjs';
const require=createRequire(import.meta.url);
const { sourceRegionCodes, normalizeCatalogRegion }=require('../../../services/homehunt/server/molit-region-codes.cjs');
const { fetchMolitMonthDirect, loadMolitMonthWithFirestoreCache }=require('../../../services/homehunt/server/molit.cjs');
test('source geography is current API geography, not target contract month',()=>{
  assert.deepEqual(sourceRegionCodes('41590',new Date('2026-01-01')),['41590']);
  assert.deepEqual(sourceRegionCodes('41590',new Date('2026-10-11')),['41591','41593','41595','41597']);
  assert.deepEqual(sourceRegionCodes('41117'),['41117']);
  assert.deepEqual(normalizeCatalogRegion({regionCode:'41597',aptSeq:'sample'},'41590','41597'),
    {regionCode:'41590',lawdCd:'41590',sourceRegionCode:'41597',sourceLawdCd:'41597',aptSeq:'sample'});
  assert.throws(()=>normalizeCatalogRegion({regionCode:'41117'},'41590','41597'),/identity/);
});
function mock(t){const original=globalThis.fetch,codes=[];globalThis.fetch=async url=>{
  const u=new URL(url),code=u.searchParams.get('LAWD_CD');codes.push(code);
  return {ok:true,text:async()=>`<response><header><resultCode>000</resultCode></header><body><totalCount>1</totalCount><numOfRows>1000</numOfRows><items><item><sggCd>${code}</sggCd><aptNm>샘플</aptNm><dealYear>2024</dealYear><dealMonth>1</dealMonth><dealDay>2</dealDay><dealAmount>60,000</dealAmount><excluUseAr>59.99</excluUseAr></item></items></body></response>`};};t.after(()=>{globalThis.fetch=original;});return codes;}
test('direct history preserves four source identities and compatible legacy region',async t=>{
  const codes=mock(t),result=await fetchMolitMonthDirect({serviceKey:'test-key',lawdCd:'41590',dealYmd:'202401',type:'sale'});
  assert.deepEqual(codes,['41591','41593','41595','41597']);assert.equal(result.records.length,4);
  assert.equal(result.regionAliasVersion,1);assert.ok(result.records.every(r=>r.regionCode==='41590'&&r.sourceRegionCode));
});
test('signed public cache retains remapped evidence and reuses it without new calls',async t=>{
  const codes=mock(t),db=createMemoryFirestore(),input={db,serviceKey:'test-key',lawdCd:'41590',dealYmd:'202401',type:'sale'};
  const first=await loadMolitMonthWithFirestoreCache(input),second=await loadMolitMonthWithFirestoreCache(input);
  assert.equal(first.records.length,4);assert.equal(second.source,'cache');assert.equal(codes.length,4);
  assert.equal(second.records[0].sourceRegionCode,'41591');
});
