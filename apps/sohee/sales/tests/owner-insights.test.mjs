import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {initialSelection,shiftDate} from '../src/analysis.mjs';
import {salesDateLabel,weekdayComparison,ownerInsights,menuStrategies} from '../src/owner-insights.mjs';
import {applyMenuRules} from '../../../../services/sohee/menu-rules.mjs';

test('weekday comparison pairs completed dates once without overlapping or mixing POS sources',()=>{
  const D=fixture(),selection=initialSelection(D),C=weekdayComparison(D,selection);
  assert.equal(C.available,true);assert.equal(C.offsetDays,28);
  assert.equal(C.current.length,15);assert.equal(C.previous.length,15);
  assert.ok(C.current.every((row,i)=>row.weekday===C.previous[i].weekday));
  assert.ok(C.current.every(row=>!row.partial_day));
  D.daily.find(row=>row.date===C.previous[0].date).source='payhere';
  assert.equal(weekdayComparison(D,selection).available,false);
  const long=weekdayComparison(fixture(),{...selection,mode:'range',range:['2026-03-01','2026-04-15']});
  assert.equal(long.offsetDays,49); // preserves weekdays even when insufficient older source data.
});
test('missing dates, small samples and refund concentration never become invented statistics',()=>{
  const D=fixture(),selection=initialSelection(D);
  D.daily=D.daily.filter(row=>row.date!=='2026-04-01');
  assert.equal(weekdayComparison(D,selection).available,false);
  assert.equal(ownerInsights(D,{...selection,mode:'multiple',dates:['2026-04-02']}).distribution,null);
  D.menu_monthly.find(row=>row.month==='2026-04').amount=-1;
  assert.equal(ownerInsights(D,selection).concentration,null);
  assert.equal(salesDateLabel('2026-04-06'),'2026-04-06 (월)');
});
test('menu frequency uses observed complete Toss recording days and keeps units separate',()=>{
  const D=fixture(),selection=initialSelection(D),S=menuStrategies(D,selection);
  assert.equal(S.detailDays,13);assert.equal(S.unavailableDays,0);
  assert.ok(S.rows.every(row=>row.detailDays===13&&row.frequency===100));
  assert.equal(S.rows.find(row=>row.menu.includes('4구')).unit,'팩 (4개)');
  const payhere=menuStrategies(D,{...selection,month:'2026-01'});
  assert.equal(payhere.detailDays,0);assert.ok(payhere.rows.every(row=>row.frequency===null&&row.dailyQuantity===null&&row.quantityChange===null));
  D.menu_toss=D.menu_toss.filter(row=>row.date!=='2026-04-02');
  const missing=menuStrategies(D,selection);
  assert.equal(missing.detailDays,12);assert.equal(missing.unavailableDays,1);
  assert.ok(missing.rows.every(row=>row.quantityChange===null));
});
test('saved 4-piece conversion applies once to strategy counts and same units merge',()=>{
  const D=fixture(),selection=initialSelection(D),base=menuStrategies(D,selection);
  const cookie=base.rows.find(row=>row.menu==='예시 쿠키'),pack=base.rows.find(row=>row.menu==='예시 마들렌 4구');
  const mapped=applyMenuRules(D,[{sourceName:'예시 마들렌 4구',targetName:'예시 쿠키',unit:'개',multiplier:4,enabled:true}]);
  const merged=menuStrategies(mapped,selection).rows.find(row=>row.menu==='예시 쿠키');
  assert.equal(merged.quantity,cookie.quantity+pack.quantity*4);
  assert.equal(merged.amount,cookie.amount+pack.amount);
  assert.equal(merged.dailyQuantity,cookie.dailyQuantity+pack.dailyQuantity*4);
  assert.equal(merged.sellingDays,13);
  assert.equal(menuStrategies(D,selection).rows.length,5);
});
test('explicit net-zero detail is observed; wholly missing detail remains unknown',()=>{
  const D=fixture(),selection={...initialSelection(D),mode:'range',range:['2026-04-01','2026-04-03']};
  for(const row of D.menu_toss.filter(row=>row.date==='2026-04-02')){row.quantity=0;row.amount=0;}
  const zero=menuStrategies(D,selection);
  assert.equal(zero.detailDays,3);assert.equal(zero.unavailableDays,0);
  assert.ok(zero.rows.every(row=>row.sellingDays===2&&row.frequency===2/3*100));
  D.menu_toss=D.menu_toss.filter(row=>row.date!=='2026-04-02');
  const missing=menuStrategies(D,selection);
  assert.equal(missing.detailDays,2);assert.equal(missing.unavailableDays,1);
  assert.ok(missing.rows.every(row=>row.sellingDays===2&&row.frequency===100));
});
test('signed refunds aggregate after piece conversion and never merge unlike units',()=>{
  const D=fixture(),selection={...initialSelection(D),mode:'multiple',dates:['2026-04-02']};
  const single=D.menu_toss.find(row=>row.date==='2026-04-02'&&row.menu_original==='예시 쿠키');
  const pack=D.menu_toss.find(row=>row.date==='2026-04-02'&&row.menu_original==='예시 마들렌 4구');
  single.quantity=-2;single.amount=-8000;pack.quantity=1;pack.amount=12000;
  const rule={sourceName:pack.menu_original,targetName:single.menu_original,unit:'개',multiplier:4,enabled:true};
  const piece=menuStrategies(applyMenuRules(D,[rule]),selection).rows.find(row=>row.menu_name===single.menu_original);
  assert.equal(piece.dailyQuantity,2);assert.equal(piece.quantity,2);assert.equal(piece.amount,4000);assert.equal(piece.frequency,100);
  const distinct=menuStrategies(applyMenuRules(D,[{...rule,unit:'팩',multiplier:1}]),selection).rows.filter(row=>row.menu_name===single.menu_original);
  assert.equal(distinct.length,2);assert.deepEqual(distinct.map(row=>row.unit).sort(),['개','팩']);
  assert.equal(distinct.find(row=>row.unit==='개').dailyQuantity,-2);
});
