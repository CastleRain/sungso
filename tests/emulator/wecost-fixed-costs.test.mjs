import test, { before,after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../services/homehunt/cloud/package.json',import.meta.url));
const { initializeTestEnvironment,assertFails } = require('@firebase/rules-unit-testing');
const { doc,getDoc,setDoc,getDocs,collection,runTransaction,serverTimestamp,onSnapshot } = require('firebase/firestore');
import { createFixedCostsRepository } from '../../apps/wecost/js/fixed-costs-repository.mjs';
import { emptyCost } from '../../apps/wecost/js/fixed-costs-core.mjs';
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!endpoint || !/^(127\.0\.0\.1|localhost):\d+$/.test(endpoint)) throw Error('Local Firestore Emulator required');
const [host,port] = endpoint.split(':'); let env;
const projectId = 'demo-homehunt';
const client = uid => env.authenticatedContext(uid,{email:'fixture@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'}}).firestore();
const member = (uid,db) => createFixedCostsRepository({db,doc,runTransaction,serverTimestamp,onSnapshot,work:{capture:() => ({member:{uid,role:uid === 'first' ? 'sungwoo' : 'sohee'},assert(){}}),observe:(fn,ref,...args) => fn(ref,...args)}});
before(async () => {
  env = await initializeTestEnvironment({projectId,firestore:{host,port:Number(port),rules:await readFile(new URL('../../firestore.rules',import.meta.url),'utf8')}});
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    for (const [uid,role] of [['first','sungwoo'],['second','sohee']]) await setDoc(doc(context.firestore(),'site_members',uid),{active:true,role});
  });
});
after(async () => env?.cleanup());
const values = {...emptyCost(),name:'에뮬레이터 전용 통신비',amount:55000,day:5};
test('real Firestore transaction saves/reloads with both members, retries once and does not touch savings',async () => {
  const db = client('first'),db2 = client('second'),one = member('first',db),two = member('second',db2);
  const cmd = {id:'phone',action:'create',values};
  await one.save(cmd,'create'); await one.save(cmd,'create');
  let snap = await getDoc(doc(db2,'wecost_settings','fixed_costs'));
  assert.equal(snap.data().items.phone.amount,55000); assert.equal(snap.data().revision,1);
  const updates = await Promise.allSettled([
    one.save({id:'phone',action:'update',expected:values,values:{...values,amount:60000}},'edit-amount'),
    two.save({id:'phone',action:'update',expected:values,values:{...values,memo:'동시 메모'}},'edit-memo'),
  ]);
  assert.ok(updates.every(result => result.status === 'fulfilled'));
  snap = await getDoc(doc(db,'wecost_settings','fixed_costs'));
  assert.equal(snap.data().items.phone.amount,60000); assert.equal(snap.data().items.phone.memo,'동시 메모');
  await assert.rejects(two.save({id:'phone',action:'update',expected:values,values:{...values,amount:70000}},'stale'),{code:'fixed/conflict'});
  assert.equal((await getDoc(doc(db,'wecost_settings','fixed_costs_log_edit-memo'))).data().actor,'소희');
  assert.equal((await getDocs(collection(db,'wecost_savings'))).size,0);
});
test('real onSnapshot sees committed records and anonymous/unregistered writes and reads are denied',async () => {
  const db = client('second'),repo = member('second',db);
  await new Promise((resolve,reject) => {
    const timer = setTimeout(() => {stop();reject(Error('Snapshot timeout'));},10000);
    const stop = repo.subscribe(snap => {if (!snap.fromCache && snap.items.some(item => item.id === 'phone')) {clearTimeout(timer);stop();resolve();}},reject);
  });
  for (const denied of [env.unauthenticatedContext().firestore(),client('outsider')]) {
    await assertFails(getDoc(doc(denied,'wecost_settings','fixed_costs')));
    await assertFails(setDoc(doc(denied,'wecost_settings','fixed_costs'),{schemaVersion:1,items:{}}));
    await assertFails(setDoc(doc(denied,'wecost_settings','fixed_costs_log_denied'),{signature:'bad'}));
  }
});
