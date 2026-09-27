import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createSalesApi } from '../server.mjs';
async function call({ token='valid', origin='http://local.test', method='GET', route='status', body, active=true, writesEnabled=false }={}) {
  let calls=0;
  const db={doc:path=>({get:async()=>({data:()=>path.startsWith('site_members/')?{active,role:'sohee'}:undefined})})};
  const importer={prepare:async()=>{calls++;return{id:'test-candidate',partialDates:[]};},commit:async()=>{calls++;return{stored:true};}};
  const api=createSalesApi({db,importer,writesEnabled,origin:'http://local.test',verifyToken:async value=>{if(value!=='valid')throw new Error('bad token');return{uid:'synthetic',email_verified:true,firebase:{sign_in_provider:'google.com'}};}});
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.url='/api/sohee/'+route;req.method=method;req.headers={origin,authorization:token?'Bearer '+token:undefined,'content-type':'application/json'};
  let status,headers,data;const res={writeHead:(s,h)=>{status=s;headers=h;},end:text=>{data=JSON.parse(text);}};
  await api(req,res);return{status,headers,data,calls};
}
test('API denies anonymous, invalid tokens, inactive members and foreign origins before import',async()=>{for(const args of [{token:null},{token:'expired'},{active:false},{origin:'https://foreign.test'}]){const r=await call({...args,method:'POST',route:'prepare',body:{}});assert.ok([401,403].includes(r.status));assert.equal(r.calls,0);}});
test('status is private and no-store; preparing is explicit; production commit stays disabled',async()=>{const status=await call();assert.equal(status.status,200);assert.equal(status.headers['Cache-Control'],'no-store');assert.equal(status.data.automaticCollection,false);const prep=await call({method:'POST',route:'prepare',body:{expectedVersion:null}});assert.equal(prep.status,200);assert.equal(prep.calls,1);const commit=await call({method:'POST',route:'commit',body:{candidateId:'test'}});assert.equal(commit.status,403);assert.equal(commit.calls,0);});
