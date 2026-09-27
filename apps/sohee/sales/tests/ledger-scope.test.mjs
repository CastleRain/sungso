import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {initialSelection,selectedDates,analyzeSelection,dayMenuDetails} from '../src/analysis.mjs';
import {ledgerSourceData,periodAnchorMonth,ledgerPeriodKey,menuDetailAvailability} from '../src/ledger-scope.mjs';
import {operatingSummary} from '../src/operating-summary.mjs';

test('calendar anchor follows range and sparse dates instead of a stale month',()=>{
 const data=fixture(),selection=initialSelection(data);
 assert.equal(periodAnchorMonth(data,{...selection,month:'2026-01',mode:'range',range:['2026-03-01','2026-04-15']}),'2026-04');
 assert.equal(periodAnchorMonth(data,{...selection,month:'2026-01',mode:'multiple',dates:['2026-02-02','2026-03-30']}),'2026-03');
 assert.equal(periodAnchorMonth(data,{...selection,mode:'all'}),'2026-04');
 assert.notEqual(ledgerPeriodKey(selection,'all','detail'),ledgerPeriodKey({...selection,mode:'range',range:['2026-02-01','2026-03-01']},'all','detail'));
});
test('source view keeps only that source in summaries, menus and date choices without mutating raw data',()=>{
 const data=fixture(),before=JSON.stringify(data),payhere=ledgerSourceData(data,'payhere'),toss=ledgerSourceData(data,'toss');
 assert.equal(payhere.start,'2026-01-01');assert.equal(payhere.end,'2026-01-31');assert.equal(toss.start,'2026-02-01');
 const all={...initialSelection(data),mode:'all'};
 for(const [source,view] of [['payhere',payhere],['toss',toss]]){
  const expected=data.daily.filter(row=>row.source===source);
  assert.equal(analyzeSelection(view,all).amount,expected.reduce((s,r)=>s+r.amount,0));
  assert.equal(selectedDates(view,all).length,expected.length);assert.ok(view.monthly.every(r=>r.source===source));
 }
 assert.equal(payhere.menu_toss.length,0);assert.equal(dayMenuDetails(payhere,'2026-01-03').rows.length,0);
 assert.equal(JSON.stringify(data),before);assert.equal(ledgerSourceData(data),data);assert.equal(ledgerSourceData(data,'none'),null);
});
test('interleaved source days never become missing days or alter the other source average',()=>{
 const data=fixture();data.daily.find(r=>r.date==='2026-04-05').source='payhere';
 const view=ledgerSourceData(data,'toss'),selection={...initialSelection(data),mode:'range',range:['2026-04-01','2026-04-06']};
 assert.ok(!selectedDates(view,selection).includes('2026-04-05'));
 assert.equal(analyzeSelection(view,selection).missingDays,0);
 const days=data.daily.filter(r=>r.date>='2026-04-01'&&r.date<='2026-04-06'&&r.source==='toss');
 assert.equal(operatingSummary(view,selection).dailyAverage,days.reduce((s,r)=>s+r.amount,0)/days.length);
});
test('availability distinguishes archived source, partial days, missing details and queryable menu data',()=>{
 const data=fixture(),dates=new Set(data.menu_toss.map(r=>r.date)),status=date=>menuDetailAvailability(data.daily.find(r=>r.date===date),dates);
 assert.equal(status('2026-01-03').kind,'archive');assert.equal(status('2026-04-16').kind,'partial');assert.equal(status('2026-04-15').kind,'available');
 dates.delete('2026-04-15');assert.equal(status('2026-04-15').kind,'missing');
});
