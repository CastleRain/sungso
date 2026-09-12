import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultTrip,normalizeTrip,applyTripChange,describeTripChange} from '../shared/trip-core.mjs';
test('shared plan has eleven dates and no hotel reservation assumed',()=>{const d=defaultTrip();assert.equal(d.days.length,11);assert.equal(d.days[0].date,'2027-03-07');assert.equal(d.days.at(-1).date,'2027-03-17');assert.deepEqual(d.hotels,{arrival:null,return:null});assert.equal(d.decisions.resort.status,'pending');});
test('legacy/corrupt data cannot replace trip with eight day schedule',()=>{const d=normalizeTrip({days:[{date:'2027-03-09',items:[{text:'legacy'}]}],hotels:{arrival:'unknown'},decisions:{hotels:{status:'bogus'}}});assert.equal(d.days.length,11);assert.equal(d.days[2].focus,'port');assert.equal(d.hotels.arrival,null);assert.equal(d.decisions.hotels.status,'candidate');});
test('different clients patch current state without clobbering separate slots or tasks',()=>{const a=applyTripChange(null,{type:'hotel',slot:'arrival',hotelId:'fair'});const b=applyTripChange(a,{type:'hotel',slot:'return',hotelId:'park'});const c=applyTripChange(b,{type:'decision',id:'flights',patch:{status:'confirmed',note:'발권 확인'}});assert.deepEqual(c.hotels,{arrival:'fair',return:'park'});assert.equal(c.decisions.flights.status,'confirmed');assert.equal(c.decisions.hotels.status,'candidate');assert.equal(a.hotels.return,null);});
test('editing same day rejects stale draft and preserves edits on other dates',()=>{const start=defaultTrip();const events=[{time:'18:00',title:'저녁',text:'확인한 식당',place:'merlion'}];const a=applyTripChange(start,{type:'day',date:'2027-03-07',events,expectedEvents:start.days[0].events});assert.throws(()=>applyTripChange(a,{type:'day',date:'2027-03-07',events:[],expectedEvents:start.days[0].events}),/바뀌었어요/);const b=applyTripChange(a,{type:'day',date:'2027-03-11',events:[],expectedEvents:start.days[4].events});assert.deepEqual(b.days[0].events,events);assert.deepEqual(b.days[4].events,[]);});
test('unknown target, forged place and oversized note are rejected',()=>{assert.throws(()=>applyTripChange(null,{type:'hotel',slot:'arrival',hotelId:'fake'}));assert.throws(()=>applyTripChange(null,{type:'decision',id:'flights',patch:{status:'confirmed',note:'a'.repeat(1501)}}));assert.throws(()=>applyTripChange(null,{type:'day',date:'2027-03-07',events:[{title:'x',time:'',text:'',place:'evil'}]}));});
test('audit records exact previous field and selected author, without unrelated data',()=>{
 const raw=defaultTrip(),change={type:'hotel',slot:'arrival',hotelId:'fair'};
 const next=applyTripChange(raw,change),audit=describeTripChange(raw,next,change,'소희');
 assert.deepEqual(audit,{tripId:'honeymoon_2027',type:'hotel',target:'arrival',actor:'소희',before:null,after:'fair'});
 assert.equal(describeTripChange(next,next,change),null);
 const task={type:'decision',id:'flights',patch:{status:'confirmed',note:'발권 확인'}};
 const event=describeTripChange(next,applyTripChange(next,task),task,'unknown');
 assert.equal(event.actor,'미지정');assert.deepEqual(event.before,{status:'candidate',note:''});assert.deepEqual(event.after,task.patch);
 event.after.note='mutation';assert.equal(task.patch.note,'발권 확인');
});
test('a shared decision rejects a stale note instead of reverting a newer status',()=>{
 const initial=defaultTrip(),change={type:'decision',id:'flights',patch:{status:'confirmed',note:'발권 완료'}};
 const latest=applyTripChange(initial,change);
 assert.throws(()=>applyTripChange(latest,{type:'decision',id:'flights',patch:{status:'candidate',note:'수하물 확인'},expectedDecision:initial.decisions.flights}),/바뀌었어요/);
 const separate=applyTripChange(latest,{type:'decision',id:'hotels',patch:{status:'candidate',note:'위치 비교'},expectedDecision:initial.decisions.hotels});
 assert.equal(separate.decisions.flights.status,'confirmed');
});
