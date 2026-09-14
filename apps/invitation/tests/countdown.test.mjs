import test from 'node:test';
import assert from 'node:assert/strict';
import { WEDDING_INSTANT, remainingTime, createCountdown } from '../js/countdown.mjs';

test('countdown uses the Korean ceremony instant and rolls days/hours/minutes without drift',()=>{
  assert.equal(new Date(WEDDING_INSTANT).toISOString(),'2027-03-06T05:00:00.000Z');
  assert.deepEqual(remainingTime(WEDDING_INSTANT-(86400+3661)*1000),{days:1,hours:1,minutes:1,seconds:1,arrived:false});
  assert.deepEqual(remainingTime(WEDDING_INSTANT-1),{days:0,hours:0,minutes:0,seconds:1,arrived:false});
  assert.deepEqual(remainingTime(WEDDING_INSTANT+86400000),{days:0,hours:0,minutes:0,seconds:0,arrived:true});
});
test('timer recomputes from clock after a hidden tab and stops all work on cleanup',()=>{
  const listeners=new Map(),tasks=new Map();let id=0,clock=WEDDING_INSTANT-3661000;
  const cells=['days','hours','minutes','seconds'].map(key=>({dataset:{countdown:key},textContent:''})),message={},arrived={};
  const timerNode={querySelectorAll:()=>cells,querySelector:s=>s==='[data-countdown-message]'?message:arrived,setAttribute(){}};
  const root={hidden:false,querySelectorAll:()=>[timerNode],addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:(n)=>listeners.delete(n)};
  const timer=createCountdown({root,now:()=>clock,schedule:f=>{tasks.set(++id,f);return id;},cancel:i=>tasks.delete(i)});
  timer.mount();assert.equal(tasks.size,1);assert.deepEqual(cells.map(x=>x.textContent),['00','01','01','01']);
  root.hidden=true;listeners.get('visibilitychange')();assert.equal(tasks.size,0);
  clock=WEDDING_INSTANT+1000;root.hidden=false;listeners.get('visibilitychange')();assert.equal(arrived.hidden,false);assert.deepEqual(cells.map(x=>x.textContent),['00','00','00','00']);
  timer.dispose();assert.equal(tasks.size,0);assert.equal(listeners.size,0);
});
