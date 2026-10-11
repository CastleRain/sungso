import test from 'node:test';
import assert from 'node:assert/strict';
import { validationContext } from '../js/core.mjs';
import { parseMoneyManWon, money, filterCatalog, queryMatches, monthlySeries, latestThreeMonthAverage, forecastDisplay, priceAttractiveness, safeExternal, evaluateActualCommute, supplyBudgetDecision } from '../js/core.mjs';
test('Korean budget formats normalize to equal manwon values',()=>{for(const s of ['9억 3,000만원','9.3억','9억 3천만원','93,000만원'])assert.equal(parseMoneyManWon(s),93000);assert.equal(money(93000),'9억 3,000만원');assert.equal(parseMoneyManWon('알 수 없음'),null);});
test('an older published operating model never certifies a newer failed experiment', () => {
  const manifest={modelVersion:'verified-v1',status:'validated',deploymentGate:{passed:true}};
  const failed=validationContext({manifest,backtest:{modelVersion:'experiment-v2',status:'tested_withheld'}});
  assert.equal(failed.sameVersion,false); assert.equal(failed.operatingPassed,true);
  assert.equal(failed.experimentPassed,false);
  const rejected=validationContext({manifest,backtest:{modelVersion:'verified-v1',status:'tested_withheld'}});
  assert.equal(rejected.experimentPassed,false);
  const validated=validationContext({manifest,backtest:{modelVersion:'verified-v1',status:'validated'}});
  assert.equal(validated.experimentPassed,true);
});
test('missing official household and year cannot satisfy hard requirements',()=>{const rows=[{name:'A',households:600,builtYear:2015},{name:'B',households:null,builtYear:2016},{name:'C',households:700,builtYear:null}];assert.deepEqual(filterCatalog(rows,{minHouseholds:500,maxAgeYears:20},'','all',new Date('2026-10-11')).map(x=>x.name),['A']);});
test('canonical research statuses publish only normalized six-month probabilities', () => {
  const now = new Date('2026-10-11');
  const forecast = {status:'validated_reconstruction',asOfMonth:'2026-09',targetMonth:'2027-03',probabilities:{up:.3,flat:.4,down:.3}};
  for (const status of ['validated_reconstruction','validated_strict']) assert.equal(forecastDisplay({...forecast,status},now).available,true);
  for (const patch of [{status:'withheld',publishable:true},{targetMonth:'2027-04'},{asOfMonth:'2026-13'},{probabilities:{up:.3,flat:.4,down:.31}}]) assert.equal(forecastDisplay({...forecast,...patch},now).available,false);
});
test('the same model code in a newer failed month cannot overwrite an older validated run', () => {
  const manifest = {modelVersion:'same-code',asOfMonth:'2026-08',status:'validated_reconstruction',deploymentGate:{passed:true}};
  const backtest = {modelVersion:'same-code',asOfMonth:'2026-09',status:'tested_withheld',deploymentGate:{passed:false}};
  const context = validationContext({manifest,backtest,updateStatus:{previousValidatedRetained:true}});
  assert.equal(context.operatingPassed,true); assert.equal(context.experimentPassed,false);
  assert.equal(context.sameVersion,false); assert.equal(context.retainedOperatingModel,true);
  assert.equal(context.operatingAsOfMonth,'2026-08'); assert.equal(context.experimentAsOfMonth,'2026-09');
});
test('free search supports aliases, district tokens, and known Raemian spelling',()=>{const c={name:'래미안아파트',address:'안양시 만안구',aliases:['메가트리아']};assert.ok(queryMatches(c,'안양 레미안'));assert.ok(queryMatches(c,'메가트리아'));assert.equal(queryMatches(c,'광주 래미안'),false);});
const rows=[{dealType:'매매',areaM2:59.96,month:'2026-01',amountManWon:50000},{dealType:'매매',areaM2:59.96,month:'2026-01',amountManWon:52000},{dealType:'매매',areaM2:59.96,month:'2026-03',amountManWon:60000},{dealType:'매매',areaM2:84.9,month:'2026-03',amountManWon:100000},{dealType:'매매',areaM2:59.96,month:'2026-03',amountManWon:1,cancelled:true}];
test('exact-area chart shows missing month as null, not zero or interpolated price',()=>{const series=monthlySeries(rows,'매매',59.96);assert.equal(series.length,3);assert.equal(series[0].average,51000);assert.equal(series[1].average,null);assert.equal(series[2].average,60000);assert.equal(series[2].count,1);});
test('three-month reference excludes other areas and canceled records',()=>{const value=latestThreeMonthAverage(rows,'매매',59.96);assert.equal(value.count,3);assert.equal(value.average,54000);});
test('forecast publication blocks withheld, stale, invalid and future probabilities',()=>{const now=new Date('2026-10-11');const f={status:'validated',asOfMonth:'2026-09',probabilities:{up:.5,flat:.3,down:.2}};assert.ok(forecastDisplay(f,now).available);for(const patch of [{status:'withheld'},{asOfMonth:'2024-09'},{asOfMonth:'2027-09'},{asOfMonth:null},{probabilities:{up:1.1,flat:0,down:-.1}}])assert.equal(forecastDisplay({...f,...patch},now).available,false);});
test('price attractiveness withholds until five comparable observations',()=>{const c={regionCode:'41117',builtYear:2010,bestArea:{areaM2:59,averagePriceManWon:50000}};assert.equal(priceAttractiveness(c,[c]),null);const peers=[49000,50000,51000,52000,60000].map(p=>({...c,bestArea:{areaM2:59,averagePriceManWon:p}}));assert.equal(priceAttractiveness(c,peers).count,5);assert.equal(priceAttractiveness(c,peers).score,80);});
test('external references reject active URLs',()=>{assert.equal(safeExternal('javascript:alert(1)'),'#');assert.equal(safeExternal('https://www.applyhome.co.kr/'),'https://www.applyhome.co.kr/');});
test('partial actual routes never create a pass or made-up whole-trip average',()=>{const d={required:true,individualMaxMinutes:60};const good={d,route:{verified:true,durationMinutes:50}},missing={d,route:null},bad={d,route:{verified:true,durationMinutes:80}};assert.equal(evaluateActualCommute([good,missing]).decision,'pending');assert.equal(evaluateActualCommute([good,missing]).weightedMeanMinutes,null);assert.equal(evaluateActualCommute([bad,missing]).decision,'excluded');assert.equal(evaluateActualCommute([bad,missing]).worstMinutes,null);assert.equal(evaluateActualCommute([good,good]).decision,'matched');assert.equal(evaluateActualCommute([good,good]).weightedMeanMinutes,50);});
test('supply filters do not join different home types or treat supply area as exclusive',()=>{const conditions={minAreaM2:59,maxPriceManWon:70000};assert.equal(supplyBudgetDecision({homes:[{houseType:'059.96A',maxPriceManWon:65000}]},conditions).status,'matched');assert.equal(supplyBudgetDecision({homes:[{areaM2:100,maxPriceManWon:65000}]},conditions).status,'unknown');assert.equal(supplyBudgetDecision({homes:[{houseType:'049A',maxPriceManWon:40000},{houseType:'084B',maxPriceManWon:null}]},conditions).status,'unknown');assert.equal(supplyBudgetDecision({homes:[{houseType:'049A',maxPriceManWon:40000}]},conditions).status,'excluded');});
