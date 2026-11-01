import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as core from '../apps/wecost/js/fixed-costs-core.mjs';
import { createFixedCostsRepository } from '../apps/wecost/js/fixed-costs-repository.mjs';
import { createMemberWork } from '../shared/firebase/member-work.mjs';
const item = (fields = {}) => ({ ...core.emptyCost(),name:'합성 통신비',amount:55000,day:31,...fields });
const catalog = JSON.parse(readFileSync(new URL('../apps/wecost/assets/fixed-cost-icons/catalog.json',import.meta.url)));
test('monthly normalization counts all items and shared costs once; zero differs from unregistered',() => {
  const items = Array.from({length:12},(_,i) => item({id:`item${i}`}));
  items.push(item({id:'yearly',owner:'shared',frequency:'yearly',month:11,amount:120000}));
  items.push(item({id:'paused',amount:900000,active:false}),item({id:'ended',endDate:'2026-10-31'}),item({id:'future',startDate:'2026-12-01'}));
  const summary = core.fixedSummary(items,'2026-11');
  assert.equal(summary.active.length,13); assert.equal(summary.total,670000);
  assert.equal(summary.owners[0].items.length,12); assert.equal(summary.owners[2].total,10000);
  assert.equal(summary.scheduled,780000);
  assert.equal(core.fixedSummary([item({amount:0})],'2026-11').active.length,1);
  assert.equal(core.fixedSummary([],'2026-11').active.length,0);
});
test('annual split rounds display only; month-end, leap day and validity windows determine actual due dates',() => {
  assert.equal(core.monthlyCost(item({amount:100,frequency:'yearly'})),100/12);
  assert.equal(core.dueInMonth(item(),'2026-02'),'2026-02-28');
  assert.equal(core.dueInMonth(item(),'2028-02'),'2028-02-29');
  assert.equal(core.nextDue(item({day:5}),'2026-11-06'),'2026-12-05');
  assert.equal(core.nextDue(item({frequency:'yearly',month:2,day:29}),'2026-03-01'),'2027-02-28');
  assert.equal(core.nextDue(item({day:1,startDate:'2026-12-10'}),'2026-11-01'),'2027-01-01');
  assert.equal(core.nextDue(item({endDate:'2026-11-10'}),'2026-11-01'),null);
  assert.equal(core.nextDue(item({day:null})),null);
});
test('fixed cost validators reject malformed money/dates while supporting zero and unknown due day',() => {
  assert.doesNotThrow(() => core.validateCost(item({amount:0,day:null})));
  for (const fields of [{amount:null},{amount:-1},{amount:0.5},{frequency:'weekly'},{day:32},{owner:'anyone'},{category:'oops'},{startDate:'2026-02-30'},{startDate:'2026-12-01',endDate:'2026-11-01'},{frequency:'yearly',month:null},{month:12},{iconId:'../secret'}]) assert.throws(() => core.validateCost(item(fields)));
});
test('144 icons cover 16 groups; manual choice wins over rename/category and stale id has safe fallback',() => {
  assert.equal(catalog.icons.length,144); assert.equal(catalog.groups.length,16);
  for (const group of catalog.groups) assert.equal(core.searchIcons(catalog,'',group.id).length,9);
  assert.equal(core.resolveIcon(item({category:'communication',iconId:''}),catalog).id,'smartphone');
  assert.equal(core.resolveIcon(item({name:'새 이름',category:'transport',iconId:'dog'}),catalog).id,'dog');
  assert.equal(core.resolveIcon(item({iconId:'missing'}),catalog).id,'wallet');
  assert.ok(core.searchIcons(catalog,'넷플릭스').some(icon => icon.id === 'tv'));
  assert.ok(core.searchIcons(catalog,'헬스').some(icon => icon.id === 'dumbbell'));
});
function env() {
  const docs = new Map(), cleanup = []; let member = {uid:'fixture',role:'sungwoo'}, fail = false, count = 0, callback;
  const work = createMemberWork({getMember:() => member,registerPrivateCleanup:fn => cleanup.push(fn)});
  const repo = createFixedCostsRepository({db:{},doc:(_,col,id) => `${col}/${id}`,work,serverTimestamp:() => 'fixture-time',
    onSnapshot:(_,options,next) => { callback = next; return () => {}; },
    runTransaction:async (_,handler) => {
      const writes = [];
      await handler({get:async ref => ({exists:() => docs.has(ref),data:() => structuredClone(docs.get(ref))}),set:(ref,value) => writes.push([ref,structuredClone(value)])});
      if (fail) throw Error('합성 네트워크 실패');
      for (const [ref,value] of writes) { docs.set(ref,value); count++; }
    }});
  return {repo,docs,fail:v => fail = v,writes:() => count,emit:data => callback({exists:() => !!data,data:() => data,metadata:{fromCache:false}}),retire() {cleanup.forEach(fn => fn());member = null;}};
}
test('subscription does not seed records; schema errors are visible and retired callbacks are ignored',() => {
  const e = env(); let values = [],errors = [];
  e.repo.subscribe(data => values.push(data),error => errors.push(error));
  e.emit(null); assert.deepEqual(values[0].items,[]); assert.equal(e.writes(),0);
  e.emit({schemaVersion:5,items:{}}); assert.equal(errors.length,1);
  e.retire(); e.emit(null); assert.equal(values.length,1);
});
test('failed save preserves documents; same-operation retries are idempotent and write an atomic author log',async () => {
  const e = env(),command = {action:'create',id:'one',values:item()};
  e.fail(true); await assert.rejects(e.repo.save(command,'request1')); assert.equal(e.writes(),0);
  e.fail(false); await e.repo.save(command,'request1'); await e.repo.save(command,'request1');
  assert.equal(e.writes(),2); assert.equal(e.docs.get('wecost_settings/fixed_costs').revision,1);
  assert.equal(e.docs.get('wecost_settings/fixed_costs_log_request1').actor,'성우');
  await assert.rejects(e.repo.save({...command,values:item({amount:5})},'request1'),/다른 저장 요청/);
  assert.equal([...e.docs.keys()].some(key => /wecost_savings|wecost_loans/.test(key)),false);
});
test('independent field edits merge; stale same-field edits cannot overwrite and pause is reversible',async () => {
  const e = env(),initial = item();
  await e.repo.save({action:'create',id:'one',values:initial},'create');
  await e.repo.save({action:'update',id:'one',expected:initial,values:{...initial,amount:60000}},'amount');
  await e.repo.save({action:'update',id:'one',expected:initial,values:{...initial,memo:'공유 메모'}},'memo');
  const saved = e.docs.get('wecost_settings/fixed_costs').items.one;
  assert.equal(saved.amount,60000); assert.equal(saved.memo,'공유 메모');
  await assert.rejects(e.repo.save({action:'update',id:'one',expected:initial,values:{...initial,amount:70000}},'conflict'),{code:'fixed/conflict'});
  await e.repo.save({action:'update',id:'one',expected:saved,values:{...saved,active:false}},'pause');
  assert.equal(core.fixedSummary(Object.values(e.docs.get('wecost_settings/fixed_costs').items),'2026-11').total,0);
  e.retire(); await assert.rejects(e.repo.save({action:'create',id:'two',values:item()},'retired'),/로그인/);
});
