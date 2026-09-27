import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture} from './fixture.mjs';
import {applyMenuRules,validateMenuRule} from '../../../../services/sohee/menu-rules.mjs';
import {initialSelection,groupMenus,dayMenuDetails} from '../src/analysis.mjs';
import {createMenuRuleStore} from '../src/menu-rule-store.mjs';
const digest=async text=>createHash('sha256').update(text).digest('hex');
const draft={sourceName:'예시 마들렌 4구',targetName:'예시 쿠키',multiplier:4,unit:'개',enabled:true};
test('explicit conversions merge historical and future originals without changing money or immutable snapshots',()=>{
 const data=fixture(),before=JSON.stringify(data),mapped=applyMenuRules(data,[draft]);
 assert.equal(JSON.stringify(data),before);assert.equal(mapped.total,data.total);assert.deepEqual(mapped.daily,data.daily);assert.deepEqual(mapped.forecast,data.forecast);
 const april=groupMenus(mapped.menu_monthly.filter(row=>row.month==='2026-04')).find(row=>row.menu==='예시 쿠키');assert.equal(april.quantity,321);assert.equal(april.amount,1032000);assert.equal(april.unit,'개');
 assert.deepEqual(applyMenuRules(data,[{...draft,enabled:false}]).menu_monthly,data.menu_monthly);
 const namedOnly=applyMenuRules(data,[{...draft,multiplier:1,targetName:'예시 디저트 4개'}]);assert.equal(namedOnly.menu_monthly[3].quantity,data.menu_monthly[3].quantity);
 assert.equal(applyMenuRules({...data,menu_toss:[{date:'2026-05-01',menu_original:draft.sourceName,quantity:-2,amount:-24000}]},[draft]).menu_toss[0].quantity,-8);
 const twice=applyMenuRules(data,[draft,{sourceName:'예시 쿠키',targetName:'예시 신메뉴',multiplier:2,unit:'개',enabled:true}]);assert.equal(twice.menu_monthly.find(row=>row.original_menu===draft.sourceName).quantity,data.menu_monthly.find(row=>row.menu_original===draft.sourceName).quantity*4);
});
test('same reporting name with different units never adds incompatible quantities',()=>{
 const rows=groupMenus([{menu_group:'예시',menu_original:'예시',sales_unit:'개',quantity:4,amount:12000},{menu_group:'예시',menu_original:'예시',sales_unit:'팩',quantity:1,amount:12000}]);assert.equal(rows.length,2);assert.notEqual(rows[0].menu_key,rows[1].menu_key);assert.deepEqual(rows.map(row=>row.quantity),[4,1]);
});
test('day detail uses only verified Toss days while new entry is a whole month',()=>{
 const data=fixture();assert.equal(initialSelection(data).mode,'month');assert.equal(initialSelection(data).month,'2026-04');
 assert.ok(dayMenuDetails(data,'2026-04-15').rows.length);assert.equal(dayMenuDetails(data,'2026-01-03').rows.length,0);assert.match(dayMenuDetails(data,'2026-01-03').reason,/페이히어/);assert.match(dayMenuDetails(data,'2026-04-16').reason,/부분일/);assert.match(dayMenuDetails(data,'2026-12-01').reason,/없습니다/);
});
test('rule input rejects missing names and invalid quantity/unit choices',()=>{for(const patch of [{targetName:''},{multiplier:0},{multiplier:101},{multiplier:1.5},{unit:'추측'}])assert.throws(()=>validateMenuRule({...draft,...patch}));});
test('server-backed rule storage reads without seeding and rejects stale revisions',async()=>{
 let member={uid:'a',role:'sohee'},writes=0;const docs=new Map();const make=()=>createMenuRuleStore({getMember:()=>member,digest,timestamp:()=>123,list:async()=>[...docs].map(([id,data])=>({id,data})),transact:async(id,update)=>{const next=update(docs.get(id));docs.set(id,next);writes++;return next;}});
 const store=make();assert.deepEqual(await store.load(),[]);assert.equal(writes,0);await store.save(draft,0);assert.equal((await make().load())[0].multiplier,4);assert.equal(writes,1);await assert.rejects(store.save({...draft,multiplier:3},0),/MENU_RULE_CONFLICT/);assert.equal(writes,1);await store.save({...draft,enabled:false},1);assert.equal((await store.load())[0].enabled,false);store.clear();await assert.rejects(store.save(draft,2),/MEMBER_REQUIRED/);
});
test('account switch during reads or before transactional writes cannot publish or return private values',async()=>{
 let member={uid:'a',role:'sohee'},release,writes=0;const gate=new Promise(resolve=>release=resolve);const store=createMenuRuleStore({getMember:()=>member,digest,timestamp:()=>1,list:async()=>{await gate;return [];},transact:async(id,update)=>{await gate;const next=update(null);writes++;return next;}});
 const read=store.load(),write=store.save(draft,0);await Promise.resolve();member={uid:'b',role:'sungwoo'};release();await assert.rejects(read,/STALE_SESSION/);await assert.rejects(write,/STALE_SESSION/);assert.equal(writes,0);
});
test('saving the same rule twice replaces one document and never multiplies sales twice',async()=>{
 const docs=new Map();let writes=0;
 const store=createMenuRuleStore({getMember:()=>({uid:'synthetic-member',role:'sohee'}),digest,timestamp:()=>1,list:async()=>[...docs].map(([id,data])=>({id,data})),transact:async(id,update)=>{const next=update(docs.get(id));docs.set(id,next);writes++;return next;}});
 const raw=fixture(),before=JSON.stringify(raw);
 await store.save(draft,0);const once=applyMenuRules(raw,await store.load());
 await store.save(draft,1);const twice=applyMenuRules(raw,await store.load());
 assert.equal(writes,2);assert.equal(docs.size,1);assert.equal((await store.load())[0].revision,2);
 assert.deepEqual(twice,once);assert.equal(JSON.stringify(raw),before);
 assert.equal(twice.menu_monthly.reduce((n,row)=>n+row.amount,0),raw.menu_monthly.reduce((n,row)=>n+row.amount,0));
 await assert.rejects(store.save(draft,1),/MENU_RULE_CONFLICT/);assert.equal(docs.size,1);assert.equal(writes,2);
});
