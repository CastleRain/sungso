import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {projectPrepPlans,groupPrepPlans} from '../src/prep-rules.mjs';
import {planRow} from '../src/planning.mjs';
const rule={sourceName:'예시 마들렌 4구',targetName:'예시 쿠키',unit:'개',multiplier:4,enabled:true};

test('prep converts forecast quantities, hours and ranges once without retraining or altering raw evidence',()=>{
  const data=fixture(),before=JSON.stringify(data),plans=projectPrepPlans(data.forecast.plans,[rule]);
  const original=data.forecast.plans.find(p=>p.menu===rule.sourceName),mapped=plans.find(p=>p.source_menu===rule.sourceName);
  assert.equal(mapped.menu,'예시 쿠키');assert.equal(mapped.unit,'개');assert.equal(mapped.expected,original.expected*4);
  assert.deepEqual(mapped.hours,original.hours.map(v=>v*4));assert.equal(mapped.history_max,original.history_max*4);
  assert.equal(mapped.source_expected,original.expected);assert.equal(mapped.source_unit,original.unit);
  assert.equal(JSON.stringify(data),before);
});
test('compatible prep menus sum before rounding; sample days are a range, never added',()=>{
  const rows=fixture().forecast.plans.filter(p=>p.weekday===0&&p.status==='준비 기준').map((p,i)=>({...p,same_weekday_days:i?7:2}));
  const projected=projectPrepPlans(rows,[rule]),groups=groupPrepPlans(projected);assert.equal(groups.length,1);
  const group=groups[0];assert.equal(group.expected,2.7+3.7*4);assert.equal(group.sources.length,2);assert.equal(group.sample_label,'2–7');
  assert.ok(Math.abs(group.hours.reduce((a,b)=>a+b)-group.expected)<1e-8);
  const plan=planRow(group);assert.equal(plan.target,18);assert.equal(plan.physical,18);assert.equal(plan.windows.reduce((a,b)=>a+b),18);
  assert.equal(planRow(group,30,0).physical,0);
});
test('names do not imply quantities and pack units cannot silently merge into pieces',()=>{
  const rows=fixture().forecast.plans.filter(p=>p.weekday===0&&p.status==='준비 기준');
  const groups=groupPrepPlans(projectPrepPlans(rows,[{...rule,targetName:'예시 쿠키',unit:'팩',multiplier:1}]));
  assert.equal(groups.length,2);assert.equal(groups.find(p=>p.unit==='팩 (4개)').expected,3.7);
  assert.equal(planRow(groups.find(p=>p.unit==='팩 (4개)')).physical,16);
  const namedOnly=projectPrepPlans(rows,[{...rule,targetName:'예시 4개',multiplier:1}]).find(p=>p.source_menu===rule.sourceName);
  assert.equal(namedOnly.expected,3.7);
});
test('rare sources remain opt-in and unit/rule changes do not reuse an incompatible manual quantity',()=>{
  const rows=fixture().forecast.plans.filter(p=>p.weekday===0),rules=[rule,{...rule,sourceName:'예시 신메뉴',targetName:'예시 쿠키',multiplier:1}];
  const projected=projectPrepPlans(rows,rules),core=projected.filter(p=>p.status==='준비 기준');
  const base=groupPrepPlans(core)[0],withExtra=groupPrepPlans(projected)[0];
  assert.equal(base.sources.length,2);assert.equal(withExtra.sources.length,3);assert.notEqual(base.manual_key,withExtra.manual_key);
  const changed=groupPrepPlans(projectPrepPlans(rows.filter(p=>p.status==='준비 기준'),[{...rule,multiplier:2}]))[0];
  assert.notEqual(base.manual_key,changed.manual_key);
});
test('unknown set contents are not counted as one physical dessert',()=>{
 const group=groupPrepPlans(projectPrepPlans(fixture().forecast.plans.filter(p=>p.weekday===0&&p.menu===rule.sourceName),[{...rule,unit:'세트',multiplier:1}]))[0];
 assert.equal(planRow(group).physical,null);assert.equal(planRow(group,0,0).physical,0);assert.equal(planRow(group).target,4);
});
