import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createMemberWork } from '../shared/firebase/member-work.mjs';

function loadModule(relative, names, overrides = {}) {
  const source = readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').replaceAll('\r\n','\n')
    .replace(/^import\s[\s\S]*?;\n/gm,'').replace(/^await (?:syncAppAuth\(app\)|requireMember\(\));\n/gm,'').replace(/^export /gm,'');
  let member = {uid:'member-a',role:'sohee',name:'소희'};
  const cleanups = new Set(), subscriptions = [], writes = [], bridge = [];
  const snap = data => ({exists:()=>data!==null,data:()=>data,docs:[],metadata:{hasPendingWrites:false}});
  const context = vm.createContext({
    createMemberWork, FIREBASE_CONFIG:{}, getMember:()=>member,
    registerPrivateCleanup:fn=>{cleanups.add(fn);return()=>cleanups.delete(fn);},
    initializeApp:()=>({name:'[DEFAULT]'}),getApps:()=>[],getFirestore:()=>({}),
    doc:(_db,...parts)=>({path:parts.join('/')}),collection:(_db,...parts)=>({path:parts.join('/')}),query:value=>value,orderBy:()=>({}),
    onSnapshot:(ref,next,error)=>{const sub={ref,next,error,active:true};subscriptions.push(sub);return()=>{sub.active=false;};},
    getDoc:async()=>snap(null), serverTimestamp:()=> 'server-time',increment:value=>({increment:value}),
    setDoc:async(ref,data)=>writes.push({ref,data:structuredClone(data)}),
    updateDoc:async(ref,data)=>writes.push({ref,data:structuredClone(data)}),
    addDoc:async(ref,data)=>{writes.push({ref,data:structuredClone(data)});return{id:'new-comment'};},deleteDoc:async ref=>writes.push({ref,delete:true}),
    homeTargetPriceBridge:{publish:value=>bridge.push({publish:value}),clear:reason=>bridge.push({clear:reason})},isTravelItem:()=>false,
    fetch:async()=>({json:async()=>({result:'success',rates:{KRW:1000}})}),console:{warn(){}}, ...overrides
  });
  vm.runInContext(source+`;this.api={${names.join(',')}}`,context);
  return {api:context.api,subscriptions,writes,bridge,snap,retire(){for(const fn of [...cleanups])fn();member=null;},switchMember(){member={uid:'member-b',role:'sungwoo',name:'성우'};}};
}

test('WeCost reads missing settings/savings without seeding and ignores queued callbacks after cleanup',()=>{
  const env=loadModule('apps/wecost/js/firebase.js',['subscribeAll']);const results=[];
  env.api.subscribeAll(value=>results.push(structuredClone(value)));
  assert.equal(env.subscriptions.length,5);
  for(const sub of env.subscriptions)sub.next(env.snap(null));
  assert.equal(results.length,1);assert.equal(env.writes.length,0);assert.equal(results[0].settings.targetHousePrice,0);
  env.retire();assert.ok(env.subscriptions.every(sub=>!sub.active));
  const prior=env.bridge.length;env.subscriptions[0].next(env.snap({targetHousePrice:999}));
  assert.equal(env.bridge.length,prior);assert.equal(results.length,1);
});
test('a pending WeCost target-price update cannot republish private state after logout',async()=>{
  let finish;const env=loadModule('apps/wecost/js/firebase.js',['updateSettings'],{updateDoc:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=env.api.updateSettings({targetHousePrice:123});env.retire();finish();
  await assert.rejects(pending,/계정이 바뀌었어요/);assert.equal(env.bridge.filter(event=>'publish'in event).length,0);
});

test('a pending WeCost item creation does not signal success to a signed-out editor',async()=>{
  let finish;const env=loadModule('apps/wecost/js/firebase.js',['addItem'],{addDoc:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=env.api.addItem({name:'인공 항목'});env.retire();finish({id:'new-item'});
  await assert.rejects(pending,/계정이 바뀌었어요/);
});
test('all Honeymoon subscription families unsubscribe and suppress already queued callbacks',()=>{
  for(const [file,names,start] of [
    ['firebase-fx.js',['subscribeFx'],api=>api.subscribeFx(()=>received++)],
    ['firebase-notes.js',['subscribeComments','subscribeAllMetaCounts'],api=>{api.subscribeComments('sample',()=>received++);api.subscribeAllMetaCounts(()=>received++);}],
    ['firebase-picks.js',['subscribePicks','subscribeItinerary'],api=>{api.subscribePicks(()=>received++);api.subscribeItinerary(()=>received++);}]
    ,['firebase-naver.js',['subscribeReviewPrefs','subscribeNaverMeta'],api=>{api.subscribeReviewPrefs('sample',()=>received++);api.subscribeNaverMeta(()=>received++);}]
  ]){
    var received=0;const env=loadModule(`apps/honeymoon/js/${file}`,names);start(env.api);env.retire();
    assert.ok(env.subscriptions.every(sub=>!sub.active));for(const sub of env.subscriptions){sub.next(env.snap({}));sub.error(new Error('late'));}assert.equal(received,0);
  }
});
test('Honeymoon images and picks reject late reads without revealing data or starting follow-up writes',async()=>{
  for(const [file,name,args]of [['firebase-notes.js','getCustomImages',['sample']],['firebase-picks.js','setPick',['sohee',0,'sample']],['firebase-picks.js','removePick',['sohee',0]],['firebase-naver.js','getNaverCache',['sample']],['firebase-naver.js','pinReview',['sample',{linkHash:'sample'}]],['firebase-naver.js','hideReview',['sample',{linkHash:'sample'}]]]){
    let finish;const env=loadModule(`apps/honeymoon/js/${file}`,[name],{getDoc:()=>new Promise(resolve=>{finish=resolve;})});
    const pending=env.api[name](...args);env.switchMember();finish(env.snap({urls:['private-image'],sohee:['old']}));
    await assert.rejects(pending,/계정이 바뀌었어요/);assert.equal(env.writes.length,0);
  }
});
test('logout during exchange-rate fetch prevents the automatic Firestore write',async()=>{
  let finish;const env=loadModule('apps/honeymoon/js/firebase-fx.js',['fetchAndSaveFx'],{fetch:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=env.api.fetchAndSaveFx();env.retire();finish({json:async()=>({result:'success',rates:{KRW:1000}})});
  await assert.rejects(pending,/계정이 바뀌었어요/);assert.equal(env.writes.length,0);
});
test('a stale cached-rate read cannot start a new provider request under a switched member',async()=>{
  let finish,calls=0;const env=loadModule('apps/honeymoon/js/firebase-fx.js',['autoRefreshFx'],{getDoc:()=>new Promise(resolve=>{finish=resolve;}),fetch:()=>{calls++;throw Error('unexpected');}});
  const pending=env.api.autoRefreshFx();env.switchMember();finish(env.snap(null));await pending;
  assert.equal(calls,0);assert.equal(env.writes.length,0);
});
