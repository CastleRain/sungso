import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDemandModel,weightedQuantile,policyRisk} from '../src/demand-model.mjs';

// Deliberately invented quantities/dates. Never derive fixtures from private POS.
function synthetic({days=112,quantity=(index,wd)=>wd===0?22:4,skipSunday=true}={}){
  const daily=[],menu_toss=[],start=Date.parse('2025-01-06T00:00:00Z');
  for(let index=0;index<days;index++){
    const date=new Date(start+index*86400000).toISOString().slice(0,10),wd=index%7;
    const record_day=!skipSunday||wd!==6;
    daily.push({date,source:'toss',record_day,partial_day:false,weekday:wd});
    if(record_day)menu_toss.push({date,menu_original:'가상 쿠키',quantity:quantity(index,wd),hour:10});
  }
  return {daily,menu_toss,bulk:[],menu_monthly:[{menu_original:'가상 쿠키',source:'toss',category:'디저트'}],complete_through:daily.at(-1).date,forecast:{plans:[]}};
}
function frozen(value){if(value&&typeof value==='object'){for(const item of Object.values(value))frozen(item);Object.freeze(value);}return value;}

test('Toss complete recorded days only, after first observed sale; partial, Payhere, and non-recorded days never become zero demand',()=>{
  const data=synthetic({days:20,quantity:index=>index<5?0:index===8?0:3});
  data.daily[10].partial_day=true;data.menu_toss.find(row=>row.date===data.daily[10].date).quantity=999;
  data.daily[11].source='payhere';data.daily[12].record_day=false;
  const model=buildDemandModel(data),history=model.menus[0].history;
  assert.equal(history[0].date,data.daily[5].date);
  assert.ok(history.some(row=>row.date===data.daily[8].date&&row.quantity===0));
  for(const index of [10,11,12])assert.ok(!history.some(row=>row.date===data.daily[index].date));
  assert.ok(!history.some(row=>row.weekday===6));
  const sunday=model.plans.find(row=>row.weekday===6);
  assert.equal(sunday.expected,null);assert.equal(sunday.balanced,null);assert.equal(sunday.status,'표본 없음');
  assert.equal(sunday.hours_available,false);assert.equal(model.excluded.partial_days,1);
});

test('signed refunds and bulk subtract before daily clipping; hourly profiles exclude the whole bulk day',()=>{
  const data=synthetic({days:42,quantity:()=>5});
  const date=data.daily[7].date;
  data.menu_toss.find(row=>row.date===date).quantity=25;
  data.menu_toss.push({date,menu_original:'가상 쿠키',quantity:-2,hour:10});
  data.bulk.push({date,menu_original:'가상 쿠키',quantity:20,order_key:'test-only'});
  const model=buildDemandModel(data),history=model.menus[0].history,row=history.find(row=>row.date===date);
  assert.equal(row.quantity,3);assert.equal(row.bulk_quantity,20);assert.equal(row.bulk_affected,true);
  const plan=model.plans.find(row=>row.weekday===0);assert.equal(plan.hour_excluded_bulk_days,1);
  assert.ok(plan.hour_sample_days>0);assert.ok(plan.hours_available);
  assert.ok(Math.abs(plan.hours.reduce((sum,q)=>sum+q,0)-plan.expected)<1e-8);
  data.bulk.push({date:data.daily[8].date,amount:123});
  const unknown=buildDemandModel(data);
  assert.equal(unknown.excluded.unknown_bulk_dates,1);
  assert.ok(!unknown.menus[0].history.some(row=>row.date===data.daily[8].date));
});

test('complete payment days without any menu details are missing, while other-menu-only days observe zero dessert',()=>{
  const data=synthetic({days:70,quantity:()=>4}),missing=data.daily[35].date,onlyDrink=data.daily[36].date;
  data.menu_toss=data.menu_toss.filter(row=>row.date!==missing&&row.date!==onlyDrink);
  data.menu_toss.push({date:onlyDrink,menu_original:'가상 음료',quantity:5,hour:9});
  const model=buildDemandModel(data),history=model.menus[0].history;
  assert.equal(model.excluded.missing_detail_days,1);
  assert.ok(!history.some(row=>row.date===missing));
  assert.equal(history.find(row=>row.date===onlyDrink).quantity,0);
});

test('mapped refunds offset converted pack sales before clipping, including refund-only source aliases',()=>{
  const data=synthetic({days:42,quantity:()=>2}),date=data.daily[14].date;
  data.menu_toss.find(row=>row.date===date).quantity=-2;
  data.menu_toss.push({date,menu_original:'가상 쿠키 4구',quantity:1,hour:10});
  data.menu_toss.push({date,menu_original:'가상 쿠키 환불 별칭',quantity:-1,hour:10});
  data.menu_monthly.push(...['가상 쿠키 4구','가상 쿠키 환불 별칭'].map(menu_original=>({menu_original,source:'toss',category:'디저트'})));
  const rule={targetName:'가상 쿠키',unit:'개',enabled:true};
  const rules=[{...rule,sourceName:'가상 쿠키 4구',multiplier:4},{...rule,sourceName:'가상 쿠키 환불 별칭',multiplier:1}];
  const model=buildDemandModel(data,rules),row=model.menus[0].history.find(row=>row.date===date);
  assert.equal(model.menus.length,1);assert.equal(model.menus[0].sources.length,3);
  assert.equal(row.quantity,1);assert.equal(row.hours[10],1);
  assert.equal(row.hours.reduce((sum,value)=>sum+value,0),1);
});

test('saved composition merges original daily series before fitting and applies exactly once without mutations',()=>{
  const data=synthetic({days:70,quantity:()=>2});
  const original=[...data.menu_toss];
  data.menu_toss.push(...original.map(row=>({...row,menu_original:'가상 쿠키 4구',quantity:1})));
  data.menu_monthly.push({menu_original:'가상 쿠키 4구',source:'toss',category:'디저트'});
  const rules=[{sourceName:'가상 쿠키 4구',targetName:'가상 쿠키',multiplier:4,unit:'개',enabled:true}];
  const before=JSON.stringify(data);frozen(data);frozen(rules);
  const model=buildDemandModel(data,rules),again=buildDemandModel(data,rules);
  assert.equal(model.menus.length,1);assert.ok(model.menus[0].history.every(row=>row.quantity===6));
  assert.equal(model.plans.find(row=>row.weekday===0).balanced,6);
  assert.deepEqual(model,again);assert.equal(JSON.stringify(data),before);
  const unmapped=buildDemandModel(data);assert.equal(unmapped.menus.length,2);
  assert.deepEqual(unmapped.validation.by_unit.map(row=>row.unit).sort(),['개','팩 (4개)']);
});

test('rolling-origin predictions and selection never see the target or future observations',()=>{
  const data=synthetic({days:140}),first=buildDemandModel(data);
  const target=first.backtest[5].date;
  const changed=structuredClone(data);
  for(const row of changed.menu_toss)if(row.date>=target)row.quantity+=250;
  const second=buildDemandModel(changed);
  const a=first.backtest.find(row=>row.date===target),b=second.backtest.find(row=>row.date===target);
  for(const key of ['predicted','baseline','candidate','method','low','balanced','high'])assert.equal(a[key],b[key],key);
  assert.notEqual(a.actual,b.actual);
  assert.ok(first.backtest.every(row=>row.train_end<row.date));
  assert.deepEqual(buildDemandModel(data,[],{cutoff:first.validation.start}),buildDemandModel(changed,[],{cutoff:first.validation.start}));
});

test('baseline stays default for insufficient evidence or ties; past evidence may select weekday adjustment',()=>{
  const small=buildDemandModel(synthetic({days:21}));
  assert.ok(small.metrics.every(row=>row.method==='recent_mean'));
  const constant=buildDemandModel(synthetic({days:140,quantity:()=>5}));
  assert.ok(constant.metrics.every(row=>row.method==='recent_mean'));
  assert.equal(constant.metrics[0].mae,0);assert.equal(constant.metrics[0].baseline_mae,0);
  const seasonal=buildDemandModel(synthetic({days:140,quantity:(_index,wd)=>wd*8+2}));
  assert.equal(seasonal.metrics[0].method,'weekday_shrink');
  assert.ok(seasonal.metrics[0].mae<seasonal.metrics[0].baseline_mae);
  assert.equal(seasonal.validation.selection,'prequential');
});

test('policies are explicit ordered quantiles; retrospective excess/shortfall are not labelled actual waste',()=>{
  const model=buildDemandModel(synthetic({days:140,quantity:index=>index%5}));
  for(const plan of model.plans.filter(row=>row.status!=='표본 없음')){
    assert.ok(plan.low<=plan.balanced&&plan.balanced<=plan.high);
    assert.equal(plan.base,plan.balanced);
    const risk=policyRisk(plan,0);assert.equal(risk.excess,0);assert.ok(risk.shortfall>=0);
    assert.equal(risk.basis,'training_sales');assert.ok(risk.n>0);
  }
  const policies=model.metrics[0].policies;
  assert.ok(policies.low.excess<=policies.high.excess);
  assert.ok(policies.low.shortfall>=policies.high.shortfall);
  assert.ok(policies.balanced.pinball>=0);
  const baseline=model.metrics[0].baseline_prep;
  assert.equal(baseline.n,model.metrics[0].n);
  assert.ok(Math.abs(baseline.mae-baseline.excess-baseline.shortfall)<1e-8);
  assert.equal(weightedQuantile([{quantity:2,weight:.7},{quantity:10,weight:.3}],.5),2);
  assert.equal(weightedQuantile([],0.5),null);
  assert.equal(policyRisk(null,2).n,0);
});

test('no valid hours means no invented allocation; stale and sparse menus remain references; gifts stay out',()=>{
  const data=synthetic({days:84,quantity:index=>index<14?3:0});
  for(const row of data.menu_toss)delete row.hour;
  data.menu_monthly.push({menu_original:'가상 선물 세트',source:'toss',category:'디저트'});
  data.menu_toss.push({date:data.daily[70].date,menu_original:'가상 선물 세트',quantity:300,hour:11});
  const model=buildDemandModel(data);
  assert.equal(model.menus.length,1);
  assert.ok(model.plans.every(row=>!row.hours_available&&row.hour_sample_days===0));
  assert.ok(model.plans.filter(row=>row.weekday!==6).every(row=>row.status==='참고용'&&row.stale));
});

test('many old observations cannot hide a sparse selected 28-day preparation distribution',()=>{
  const data=synthetic({days:56,quantity:()=>4,skipSunday:false});
  for(let index=28;index<55;index++)data.daily[index].record_day=false;
  const model=buildDemandModel(data),plan=model.plans.find(row=>row.weekday===0);
  assert.ok(plan.sample_days>=28);assert.ok(plan.same_weekday_days>=4);assert.ok(plan.selling_days>=8);
  assert.equal(plan.method,'recent_mean');assert.equal(plan.distribution_days,1);assert.equal(plan.status,'참고용');
});

test('empty snapshots are explicit empty results and cutoff cannot pass the saved complete date',()=>{
  const empty=buildDemandModel({});assert.equal(empty.cutoff,null);assert.equal(empty.plans.length,0);assert.equal(empty.validation.n,0);
  const data=synthetic({days:35});
  assert.deepEqual(buildDemandModel(data),buildDemandModel(data,[],{cutoff:'2099-01-01'}));
});
