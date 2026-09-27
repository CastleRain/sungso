import test from 'node:test';
import assert from 'node:assert/strict';
import { createSalesStore, chunkPath, CURRENT } from '../src/store.mjs';
import { packSnapshot, hash } from '../../../../services/sohee/snapshot.mjs';
import { fixture } from './fixture.mjs';
const packed=()=>packSnapshot(fixture(),{capturedAt:'2026-04-16T12:00:00+09:00',sourceHashes:['a'.repeat(64)]});
function setup() { const p=packed(), rows=new Map([[CURRENT,p.manifest],...p.chunks.map((c,i)=>[chunkPath(p.version,i),c])]); let member={uid:'synthetic-member',role:'sohee'}; const read=async key=>rows.get(key)||null;return{p,rows,read,getMember:()=>member,switchMember:()=>{member={uid:'other',role:'sungwoo'};}}; }
test('server snapshot round trips with hash checking and no writes',async()=>{const s=setup(),store=createSalesStore({...s,digest:hash});assert.deepEqual((await store.load()).data,fixture());});
test('empty store remains empty without seeding',async()=>{const s=setup();s.rows.clear();assert.deepEqual(await createSalesStore({...s,digest:hash}).load(),{data:null,manifest:null});});
test('anonymous readers cannot start a request',async()=>{let reads=0;const store=createSalesStore({getMember:()=>null,read:()=>reads++,digest:hash});await assert.rejects(store.load(),/MEMBER_REQUIRED/);assert.equal(reads,0);});
test('member switch and cleanup discard late responses',async()=>{for(const cleanup of [false,true]){const s=setup();let resolve;const store=createSalesStore({...s,digest:hash,read:()=>new Promise(r=>resolve=r)});const pending=store.load();if(cleanup)store.clear();else s.switchMember();resolve(s.p.manifest);await assert.rejects(pending,/STALE_SESSION/);}});
test('missing chunk, invalid hash, malformed manifest fail closed',async()=>{for(const kind of ['missing','tamper','manifest']){const s=setup();if(kind==='missing')s.rows.delete(chunkPath(s.p.version,0));if(kind==='tamper')s.rows.get(chunkPath(s.p.version,0)).payload+='x';if(kind==='manifest')s.rows.get(CURRENT).chunkCount=100000;await assert.rejects(createSalesStore({...s,digest:hash}).load(),/INCOMPLETE|INVALID/);}});
