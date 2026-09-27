import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import { spawnSync } from 'node:child_process';
import { createImporter,loadPrivateSnapshot } from '../importer.mjs';
import { importLocal } from '../local-import.mjs';
const temp=await mkdtemp(path.join(os.tmpdir(),'sohee-synthetic-')),python=process.env.SOHEE_PYTHON||'python3';
try{
 const run=spawnSync(python,[new URL('./make_private_fixture.py',import.meta.url).pathname,temp],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 const base=await loadPrivateSnapshot(temp), before=await readFile(path.join(temp,'normalized/item_lines.csv'));
 const importer=createImporter({privateRoot:temp,python}), input={archive:(await readFile(path.join(temp,'next.zip'))).toString('base64'),password:'synthetic',capturedAt:'2026-05-04T12:00:00+09:00',expectedVersion:base.version};
 const candidate=await importer.prepare(input,'synthetic-user');assert.equal(candidate.start,'2026-05-02');assert.equal(candidate.end,'2026-05-04');assert.deepEqual(before,await readFile(path.join(temp,'normalized/item_lines.csv')));
 await assert.rejects(importer.commit(candidate.id,'other-user',base.version,()=>{}),/CANDIDATE_UNAVAILABLE/);
 let published;await importer.commit(candidate.id,'synthetic-user',base.version,async(snapshot,version)=>{published=snapshot;assert.equal(version,base.version);return{stored:true};});
 const data=JSON.parse(published.chunks.map(c=>c.payload).join('')).data;assert.equal(data.total,42000);assert.equal(data.daily.filter(v=>v.source==='payhere').reduce((s,v)=>s+v.amount,0),6000);assert.deepEqual(data.partial_dates,['2026-05-04']);
 assert.deepEqual(before,await readFile(path.join(temp,'normalized/item_lines.csv')));
 await assert.rejects(importer.prepare({...input,expectedVersion:published.version},'synthetic-user'),/DUPLICATE_ARCHIVE/);
 const localInput={privateRoot:temp,zip:path.join(temp,'next.zip'),capturedAt:input.capturedAt,password:'synthetic',python};
 const localResult=await importLocal(localInput);assert.equal(localResult.localOnly,true);
 const pointerPath=path.join(temp,'runtime/local-current.json'), pointer=await readFile(pointerPath,'utf8');
 const localCurrent=JSON.parse(pointer);assert.equal(localCurrent.storage,'local-only');assert.equal(localCurrent.end,'2026-05-04');
 assert.equal((await loadPrivateSnapshot(path.join(temp,'runtime/versions',localCurrent.version))).version,localCurrent.version);
 await assert.rejects(importLocal(localInput),/DUPLICATE_ARCHIVE/);
 assert.equal(await readFile(pointerPath,'utf8'),pointer);assert.deepEqual(before,await readFile(path.join(temp,'normalized/item_lines.csv')));
 console.log('PASS: synthetic ZIP → validation → overlap replacement → immutable snapshot → commit; original archive unchanged; Payhere preserved; duplicate rejected.');
 console.log('PASS: local-only publication, verified version pointer, next-run duplicate protection and unchanged original archive.');
}finally{await rm(temp,{recursive:true,force:true});}
