import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createGuestbookStore, createGuestbookApi, validateMessage, GUESTBOOK_PATH } from '../server/guestbook.mjs';
import { createMemoryFirestore } from '../../../apps/homehunt/tests/helpers/firestore-memory.mjs';
import { createRenderServer } from '../../homehunt/render/node-server.mjs';
const message=(extra={})=>({name:'친구',text:'결혼을 축하해요!',clientId:randomUUID(),requestId:randomUUID(),deleteToken:randomBytes(32).toString('hex'),consent:true,website:'',...extra});
const fixture=()=>{const db=createMemoryFirestore();let time=Date.parse('2026-10-20T00:00:00Z');return {db,now:()=>time,advance:n=>{time+=n;},store:createGuestbookStore({db,now:()=>time})};};
test('only public DTOs leave the isolated document; retries and own deletion',async()=>{
 const {db,store}=fixture(),input=message(),row=await store.create(input);
 assert.deepEqual(await store.create(input),row);assert.equal(db.calls.writes,1);
 assert.deepEqual(Object.keys(row),['id','name','text','createdAt']);assert.deepEqual(await store.list(),[row]);
 assert.equal([...db.documents.keys()].join(),'wedding_guestbooks/sungso_20270306');
 await assert.rejects(store.remove(row.id,'0'.repeat(64)),{code:'INVALID_TOKEN'});
 await assert.rejects(store.create({...input,text:'다른 글'}),{code:'REQUEST_CONFLICT'});
 await store.remove(row.id,input.deleteToken);await store.remove(row.id,input.deleteToken);assert.deepEqual(await store.list(),[]);
});
test('Unicode validation, public consent, input bounds and honeypot',()=>{
 assert.equal(validateMessage(message({name:'  소희  '})).name,'소희');
 for(const extra of [{consent:false},{website:'spam'},{name:'가'.repeat(21)},{name:'a\nb'},{text:'😀'.repeat(301)},{text:'a\n'.repeat(9)},{text:'\u0000x'},{clientId:'bad'},{extra:'no'}])assert.throws(()=>validateMessage(message(extra)));
});
test('persistent visitor cooldown and atomic daily limits',async()=>{
 const {store,advance,db}=fixture(),clientId=randomUUID();await store.create(message({clientId}));
 await assert.rejects(store.create(message({clientId})),{code:'TOO_MANY_MESSAGES'});
 advance(60001);await store.create(message({clientId}));advance(60001);await store.create(message({clientId}));advance(60001);
 await assert.rejects(store.create(message({clientId})),{code:'TOO_MANY_MESSAGES'});
 const results=await Promise.allSettled(Array.from({length:100},()=>store.create(message())));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,97);assert.equal((await store.list()).length,100);
 assert.equal(db.documents.get('wedding_guestbooks/sungso_20270306').daily.count,100);
 advance(86400000);await store.create(message({clientId}));assert.equal((await store.list()).length,101);
});
test('HTTP public endpoint keeps private authentication and origin boundary',async t=>{
 const f=fixture(),server=createRenderServer({guestbook:createGuestbookApi(f),api:(_req,res)=>res.status(401).json({ok:false,code:'AUTH_REQUIRED'})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 const base=`http://127.0.0.1:${server.address().port}`,headers={'Content-Type':'application/json',Origin:'https://castlerain.github.io'};
 assert.equal((await fetch(base+'/api/health',{headers})).status,401);
 assert.equal((await fetch(base+GUESTBOOK_PATH,{headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await fetch(base+'/api/health',{headers:{Origin:'http://127.0.0.1:8024'}})).status,403);
 assert.equal((await fetch(base+GUESTBOOK_PATH,{headers:{Origin:'http://127.0.0.1:8024'}})).status,200);
 const input=message();let response=await fetch(base+GUESTBOOK_PATH,{method:'POST',headers,body:JSON.stringify(input)});assert.equal(response.status,201);
 let list=await(await fetch(base+GUESTBOOK_PATH,{headers})).json();assert.equal(list.total,1);assert.equal(JSON.stringify(list).includes('delete'),false);
 response=await fetch(base+GUESTBOOK_PATH+'/'+input.requestId,{method:'DELETE',headers,body:JSON.stringify({deleteToken:input.deleteToken})});assert.equal(response.status,200);
 list=await(await fetch(base+GUESTBOOK_PATH,{headers})).json();assert.equal(list.total,0);
 assert.equal((await fetch(base+GUESTBOOK_PATH,{method:'POST',headers,body:'x'.repeat(6200)})).status,413);
 assert.equal((await fetch(base+GUESTBOOK_PATH,{method:'POST',headers,body:'bad json'})).status,400);
 assert.equal((await fetch(base+GUESTBOOK_PATH+'/private',{headers})).status,401);
});
test('pagination, cached reads, throttling and generic storage failure',async()=>{
 const f=fixture();for(let i=0;i<12;i++)await f.store.create(message());const api=createGuestbookApi(f);
 const request=async(url=GUESTBOOK_PATH)=>{const res={setHeader(){},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};await api({url,method:'GET',headers:{}},res);return res;};
 const first=await request();assert.equal(first.body.messages.length,10);assert.equal(first.body.total,12);
 const second=await request(GUESTBOOK_PATH+'?before='+first.body.next);assert.equal(second.body.messages.length,2);assert.equal(second.body.next,null);
 assert.equal((await request(GUESTBOOK_PATH+'?before=bad')).statusCode,400);
 assert.equal((await request(GUESTBOOK_PATH+'?before='+randomUUID())).statusCode,409);
 for(let i=0;i<120;i++)await request();assert.equal((await request()).statusCode,429);
 const failed=createGuestbookApi({store:{list:async()=>{throw Error('PRIVATE SECRET');}}});
 const res={setHeader(){},status(n){this.statusCode=n;return this;},json(body){this.body=body;}};
 await failed({url:GUESTBOOK_PATH,method:'GET',headers:{}},res);assert.equal(res.statusCode,503);assert.equal(JSON.stringify(res.body).includes('SECRET'),false);
});
