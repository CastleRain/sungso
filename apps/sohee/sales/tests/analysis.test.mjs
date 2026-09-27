import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {initialSelection,selectedDates,dateRange,shiftDate,analyzeSelection,selectedMenuData,groupMenus,selectedBulk} from '../src/analysis.mjs';

test('date selections cross months, include both endpoints, deduplicate and respect archived limits',()=>{
  const data=fixture(), selection={...initialSelection(data),mode:'range',range:['2026-03-30','2026-04-02']};
  assert.deepEqual(selectedDates(data,selection),['2026-03-30','2026-03-31','2026-04-01','2026-04-02']);
  assert.deepEqual(selectedDates(data,{...selection,mode:'multiple',dates:['2026-04-16','2026-04-17','2026-04-01','2026-04-01']}),['2026-04-01','2026-04-16']);
  assert.deepEqual(dateRange('2024-02-28','2024-03-01'),['2024-02-28','2024-02-29','2024-03-01']);
  assert.equal(shiftDate('2026-03-01',-1),'2026-02-28');
  assert.deepEqual(selectedDates(data,{...selection,range:['2026-04-01',null]}),['2026-04-01']);
});
test('selected amounts, payments and record days retain zero and partial-day distinctions',()=>{
  const data=fixture(), before=JSON.stringify(data), selection={...initialSelection(data),mode:'multiple',dates:['2026-04-14','2026-04-15','2026-04-16']};
  const chosen=data.daily.filter(row=>selection.dates.includes(row.date)), result=analyzeSelection(data,selection);
  assert.equal(result.amount,chosen.reduce((sum,row)=>sum+row.amount,0));
  assert.equal(result.payments,chosen.reduce((sum,row)=>sum+row.payment_count,0));
  assert.equal(result.recordDays,2);assert.equal(result.days,3);assert.equal(result.partialDays,1);
  assert.equal(result.comparison.current.days,2);assert.equal(result.comparison.previous.days,2);
  assert.equal(analyzeSelection(data,{...selection,includePartial:false}).amount,result.amount-chosen.at(-1).amount);
  const zero=analyzeSelection(data,{...selection,dates:['2026-04-14']});
  assert.equal(zero.amount,0);assert.equal(zero.perPayment,null);assert.equal(zero.perRecordDay,null);assert.equal(zero.comparison.perDayPercent,null);
  assert.equal(JSON.stringify(data),before);
});
test('comparison preserves sparse date spacing and refuses missing or partial reference days',()=>{
  const data=fixture(), selection={...initialSelection(data),mode:'multiple',dates:['2026-04-05','2026-04-09']};
  const result=analyzeSelection(data,selection);
  assert.deepEqual(result.comparison.previousDates,['2026-03-31','2026-04-04']);assert.equal(result.comparison.comparable,true);
  data.daily=data.daily.filter(row=>row.date!=='2026-04-04');
  assert.equal(analyzeSelection(data,selection).comparison.percent,null);
  assert.equal(analyzeSelection(data,selection).comparison.delta,null);
  const missing=analyzeSelection(data,{...selection,dates:['2026-04-04']});assert.equal(missing.missingDays,1);assert.equal(missing.rows.length,0);
});
test('day-level menus never allocate Payhere month values or include partial-day items; pack units remain explicit',()=>{
  const data=fixture(), selection={...initialSelection(data),mode:'multiple',dates:['2026-01-03','2026-04-15','2026-04-16']};
  const result=selectedMenuData(data,selection);
  assert.equal(result.dailyOnly,true);assert.equal(result.omittedPayhereDays,1);assert.equal(result.omittedPartialDays,1);
  assert.ok(result.rows.every(row=>row.date==='2026-04-15'));
  assert.equal(groupMenus(result.rows).find(row=>row.menu.includes('4구')).unit,'팩 (4개)');
  assert.equal(selectedMenuData(data,{...selection,mode:'month',month:'2026-01'}).dailyOnly,false);
  assert.equal(selectedMenuData(data,{...selection,mode:'month',month:'2026-04',includePartial:false}).dailyOnly,true);
});
test('bulk impact counts each order once and excludes unselected and partial days',()=>{
  const data=fixture();data.bulk=[{order_key:'a',date:'2026-04-15',amount:70000},{order_key:'a',date:'2026-04-15',amount:40000},{order_key:'b',date:'2026-04-16',amount:130000},{order_key:'c',date:'2026-04-01',amount:150000}];
  const result=selectedBulk(data,{...initialSelection(data),mode:'multiple',dates:['2026-04-15','2026-04-16']});
  assert.equal(result.count,1);assert.equal(result.amount,110000);assert.equal(result.days,1);
  assert.equal(result.without,data.daily.find(row=>row.date==='2026-04-15').amount-110000);
});
