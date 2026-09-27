import test from 'node:test';import assert from 'node:assert/strict';
import {defaultPrepDate,makePrepRow,prepTotals,prepDateForWeekday} from '../src/prep-workflow.mjs';
const plan={unit:'개',physical_factor:1,balanced:7,low:3,high:10,hours_available:true,hours:Array.from({length:24},(_,h)=>h>=9&&h<18?1:0)};
test('prep stages conserve ordinary quantity; reservation remains a separate timed task',()=>{const r=makePrepRow(plan,'balanced',null,4);assert.equal(r.target,7);assert.equal(r.total,11);assert.equal(r.phases.reduce((a,b)=>a+b,0),7);assert.equal(r.physical,11);assert.equal(makePrepRow(plan,'high',0,0).target,0);});
test('missing hourly basis never invents a production schedule and mixed units are not summed',()=>{const a=makePrepRow({...plan,hours_available:false},'low');assert.equal(a.phases,null);const b=makePrepRow({...plan,unit:'세트',physical_factor:null},'balanced');const s=prepTotals([a,b]);assert.equal(s.physical,null);assert.equal(s.units.length,2);assert.equal(s.unallocated,1);});
test('default moves explicitly to next sampled weekday without treating no observations as zero',()=>{const model={cutoff:'2026-09-26',plans:[{weekday:0,status:'준비 기준'}]};assert.equal(defaultPrepDate(model,'2026-09-27'),'2026-09-28');assert.equal(prepDateForWeekday('2026-09-28',6),'2026-10-04');assert.equal(defaultPrepDate({...model,plans:[]},'2026-09-27'),'2026-09-27');});

test('empty cutoff shows a safe no-sample date',()=>{assert.equal(defaultPrepDate({cutoff:null,plans:[]},'2026-09-27'),'2026-09-27');});
