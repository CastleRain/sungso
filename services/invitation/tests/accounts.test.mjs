import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryFirestore } from '../../../apps/homehunt/tests/helpers/firestore-memory.mjs';
import { createAccountStore, createAccountApi } from '../server/accounts.mjs';
import { ACCOUNTS_PATH, emptyAccounts, validateAccounts, accountGroups, safePayUrl } from '../../../shared/invitation/account-core.mjs';
import { createRenderServer } from '../../homehunt/render/node-server.mjs';
import { createSiteMemberGate } from '../../homehunt/server/site-members.cjs';
function fixture() {
  const db = createMemoryFirestore();
  db.doc = path => { const parts = path.split('/'), id = parts.pop(); return db.collection(parts.join('/')).doc(id); };
  return { db, store: createAccountStore({db}), member: {uid:'test-sungwoo'} };
}
const filled = () => emptyAccounts().map((a,i) => ({...a,enabled:true,bank:'예시은행',holder:'예시 '+i,number:'123-'+String(i).padStart(3,'0')}));
test('account read never seeds; fixed six slots map into four groups, hidden drafts stay private', async () => {
  const f = fixture(), first = await f.store.read();
  assert.equal(first.revision,0); assert.equal(f.db.calls.writes,0);
  const accounts = filled(); accounts[1].enabled = false; accounts[1].holder = 'PRIVATE DRAFT';
  const data = await f.store.save({accounts,expectedRevision:0},f.member);
  const groups = accountGroups(data.accounts);
  assert.deepEqual(groups.map(g => g.label), ['신랑','신랑 부모님','신부','신부 부모님']);
  assert.equal(groups[1].accounts.length,1);
  assert.ok(!JSON.stringify(groups).includes('PRIVATE DRAFT'));
  assert.ok(!JSON.stringify(data).includes('updatedBy'));
  assert.deepEqual([...f.db.documents.keys()], ['wedding_accounts/sungso_20270306']);
});
test('concurrent account edits reject lost updates; retry is idempotent and hiding all removes public groups', async () => {
  const f = fixture(), accounts = filled();
  await f.store.save({accounts,expectedRevision:0},f.member);
  await f.store.save({accounts,expectedRevision:0},f.member); assert.equal(f.db.calls.writes,1);
  accounts[0].number='987-654';
  await assert.rejects(f.store.save({accounts,expectedRevision:0},f.member),{code:'CONFLICT'});
  const changed = await f.store.save({accounts,expectedRevision:1},f.member);
  assert.equal(changed.revision,2);
  const hidden = await f.store.save({accounts:accounts.map(a=>({...a,enabled:false})),expectedRevision:2},f.member);
  assert.deepEqual(accountGroups(hidden.accounts),[]); assert.equal(hidden.accounts[0].number,'987-654');
});
test('account validation rejects malformed numbers, forged fields, duplicates and unsafe transfer destinations', () => {
  for (const change of [{number:'12345'}, {number:'a123456'}, {number:'1'.repeat(21)}, {holder:''}, {bank:''}, {enabled:'true'}, {uid:'other'}, {holder:'x\nx'}, {id:'other'},
    ...['javascript:alert(1)','https://qr.kakaopay.com.evil.test/abc','https://qr.kakaopay.com@evil.test/abc','http://qr.kakaopay.com/abc','https://qr.kakaopay.com:444/abc','https://qr.kakaopay.com/'].map(payUrl=>({payUrl}))]) {
    assert.throws(()=>validateAccounts([{...filled()[0],...change}]), JSON.stringify(change));
  }
  assert.throws(()=>validateAccounts([filled()[0],filled()[0]]));
  assert.equal(safePayUrl('https://qr.kakaopay.com/fixture-code'),'https://qr.kakaopay.com/fixture-code');
  assert.equal(validateAccounts(emptyAccounts()).length,6);
});
test('account routes enforce real member gate, no direct public writes, strict CORS and bounded requests', async () => {
  const f = fixture();
  await f.db.doc('site_members/test-sungwoo').set({active:true,role:'sungwoo'});
  await f.db.doc('site_members/test-disabled').set({active:false,role:'sohee'});
  const authenticate = createSiteMemberGate({db:f.db,auth:{async verifyIdToken(token){if(!['test-sungwoo','test-disabled'].includes(token))throw Error();return{uid:token,email:'fixture@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'}};}}});
  const server = createRenderServer({api:(_q,r)=>r.status(401).json({ok:false}),accounts:createAccountApi({store:f.store,authenticate})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port, body=JSON.stringify({accounts:filled(),expectedRevision:0});
  const write=(token,payload=body)=>fetch(url+ACCOUNTS_PATH+'/manage',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:payload});
  try {
    assert.deepEqual(await (await fetch(url+ACCOUNTS_PATH)).json(),{ok:true,revision:0,groups:[]});
    assert.equal((await fetch(url+ACCOUNTS_PATH+'/manage')).status,401);
    assert.equal((await write('test-disabled')).status,403);
    assert.equal((await write('outsider')).status,401);
    assert.equal((await fetch(url+ACCOUNTS_PATH,{method:'PUT',body})).status,405);
    assert.equal((await write('test-sungwoo')).status,200);
    const pub=await (await fetch(url+ACCOUNTS_PATH)).json();
    assert.equal(pub.groups.length,4); assert.ok(!JSON.stringify(pub).includes('updatedBy'));
    assert.equal((await fetch(url+ACCOUNTS_PATH+'/manage',{headers:{Authorization:'Bearer test-sungwoo'}})).status,200);
    assert.equal((await write('test-sungwoo','x'.repeat(8193))).status,413);
    assert.equal((await fetch(url+ACCOUNTS_PATH,{headers:{Origin:'https://evil.test'}})).status,403);
    assert.equal((await fetch(url+ACCOUNTS_PATH+'/extra')).status,401);
    assert.equal((await fetch(url+'/api/health')).status,401);
    assert.equal((await write('test-sungwoo',JSON.stringify({accounts:filled(),expectedRevision:1,owner:true}))).status,400);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
