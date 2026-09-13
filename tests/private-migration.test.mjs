import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backupPrivateDatabase, dryRunMigration, applyMigration, encodeValue, sha256 } from '../scripts/private-migration/runner.mjs';
import { hydrateTripReference, clearTripReference, TRIP_DAYS } from '../shared/travel/trip-data.mjs';
const encoded = data => Object.fromEntries(Object.entries(data).map(([key,value])=>[key,encodeValue(value)]));
async function setup(t) {
  const outputDirectory=await mkdtemp(path.join(tmpdir(),'sungso-migration-test-'));
  t.after(()=>rm(outputDirectory,{recursive:true,force:true}));
  const prefix='projects/test-only/databases/(default)/documents';
  const docs=new Map([['wecost_settings/main',{name:`${prefix}/wecost_settings/main`,fields:encoded({value:'existing'})}],['resort_notes/sample/comments/one',{name:`${prefix}/resort_notes/sample/comments/one`,fields:encoded({text:'synthetic'})}]]);
  const commits=[];
  const client={prefix,
    listCollections:async parent=>!parent?['wecost_settings','resort_notes']:parent==='resort_notes/sample'?['comments']:[],
    listDocuments:async collection=>collection==='resort_notes'?[{name:`${prefix}/resort_notes/sample`}]:[...docs.entries()].filter(([name])=>name.slice(0,name.lastIndexOf('/'))===collection).map(([,doc])=>doc),
    get:async name=>docs.get(name)||null,
    createMany:async rows=>{assert.ok(rows.every(row=>!docs.has(row.path)));commits.push(rows);for(const row of rows)docs.set(row.path,{name:`${prefix}/${row.path}`,fields:encoded(row.data)});}
  };
  const manifestPath=path.join(outputDirectory,'migration.json');
  await writeFile(manifestPath,JSON.stringify({documents:[{path:'wecost_settings/main',data:{value:'fallback'}},{path:'private_data/travel_reference',data:{payload:'synthetic'}}]}));
  return {client,docs,commits,manifestPath,outputDirectory};
}
test('verified backup includes subcollection below a missing parent and dry-run performs no writes',async t=>{
  const env=await setup(t);const backup=await backupPrivateDatabase(env.client,env.outputDirectory);
  assert.equal(backup.documentCount,2);assert.equal(backup.verified,true);
  const result=await dryRunMigration(env.client,env);assert.equal(result.createCount,1);assert.equal(result.preserveCount,1);assert.equal(env.commits.length,0);
});
test('create-only import preserves current data, verifies writes and can run again safely',async t=>{
  const env=await setup(t);await backupPrivateDatabase(env.client,env.outputDirectory);const plan=await dryRunMigration(env.client,env);
  const before=sha256(env.docs.get('wecost_settings/main'));
  const applied=await applyMigration(env.client,{...env,expectedDryRunSha256:plan.dryRunSha256});
  assert.equal(applied.createdCount,1);assert.equal(applied.verifiedCount,1);assert.equal(sha256(env.docs.get('wecost_settings/main')),before);
  const repeated=await applyMigration(env.client,{...env,expectedDryRunSha256:plan.dryRunSha256});assert.equal(repeated.createdCount,0);
});
test('a concurrent existing document takes precedence over a proposed source default',async t=>{
  const env=await setup(t);await backupPrivateDatabase(env.client,env.outputDirectory);const plan=await dryRunMigration(env.client,env);
  env.docs.set('private_data/travel_reference',{name:`${env.client.prefix}/private_data/travel_reference`,fields:encoded({payload:'new shared value'})});
  const result=await applyMigration(env.client,{...env,expectedDryRunSha256:plan.dryRunSha256});assert.equal(result.createdCount,0);assert.equal(result.preservedCount,2);
});
test('apply rejects changed source or backup before any write',async t=>{
  const env=await setup(t);await backupPrivateDatabase(env.client,env.outputDirectory);const plan=await dryRunMigration(env.client,env);
  await writeFile(env.manifestPath,JSON.stringify({documents:[]}));
  await assert.rejects(applyMigration(env.client,{...env,expectedDryRunSha256:plan.dryRunSha256}),/must match/);assert.equal(env.commits.length,0);
});
test('dry-run requires a verified backup and refuses paths outside private collections',async t=>{
  const env=await setup(t);await assert.rejects(dryRunMigration(env.client,env));
  await backupPrivateDatabase(env.client,env.outputDirectory);
  await writeFile(env.manifestPath,JSON.stringify({documents:[{path:'server_secrets/key',data:{value:'fake'}}]}));
  await assert.rejects(dryRunMigration(env.client,env),/manifest/);assert.equal(env.commits.length,0);
});
test('canonical hashes ignore Firestore field order and private reference clears in place',()=>{
  assert.equal(sha256({a:1,b:{z:2,y:3}}),sha256({b:{y:3,z:2},a:1}));
  const original=TRIP_DAYS;
  hydrateTripReference({TRIP_DAYS:[{date:'2035-06-10',events:[]}],HOTELS:[{id:'sample'}],DECISIONS:[]});
  assert.equal(original.length,1);clearTripReference();assert.equal(original.length,0);assert.throws(()=>hydrateTripReference({}),/기준 자료/);
});
