import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { packSnapshot, publishSnapshot, hash } from '../../../../services/sohee/snapshot.mjs';
import { createSalesStore } from '../src/store.mjs';
import { fixture } from './fixture.mjs';
const require=createRequire(new URL('../../../../services/homehunt/cloud/package.json',import.meta.url));
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing'),sdk=require('firebase/firestore');
const endpoint=process.env.FIRESTORE_EMULATOR_HOST;
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(endpoint||''))throw new Error('Loopback Firestore Emulator required.');
const [host,port]=endpoint.split(':');let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-homehunt',firestore:{host,port:Number(port),rules:await readFile(new URL('../../../../firestore.rules',import.meta.url),'utf8')}});});
after(async()=>env?.cleanup());
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{for(const role of ['sohee','sungwoo'])await sdk.setDoc(sdk.doc(ctx.firestore(),'site_members',role),{active:true,role});await sdk.setDoc(sdk.doc(ctx.firestore(),'sohee_sales/current'),{value:'synthetic-secret'});await sdk.setDoc(sdk.doc(ctx.firestore(),'sohee_sales_versions/example/chunks/0'),{payload:'synthetic-secret'});});});
const client=(uid='sohee',extra={})=>env.authenticatedContext(uid,{email_verified:true,firebase:{sign_in_provider:'google.com'},...extra}).firestore();
for(const role of ['sohee','sungwoo'])test(`${role} may read private pointer and chunks, but cannot write or list`,async()=>{const db=client(role);for(const path of ['sohee_sales/current','sohee_sales_versions/example/chunks/0']){await assertSucceeds(sdk.getDoc(sdk.doc(db,path)));await assertFails(sdk.setDoc(sdk.doc(db,path),{payload:'tamper'}));await assertFails(sdk.deleteDoc(sdk.doc(db,path)));}await assertFails(sdk.getDocs(sdk.collection(db,'sohee_sales_versions')));});
for(const kind of ['anonymous','nonmember','unverified','password','inactive'])test(`${kind} cannot read private sales by direct path`,async()=>{if(kind==='inactive')await env.withSecurityRulesDisabled(ctx=>sdk.updateDoc(sdk.doc(ctx.firestore(),'site_members/sohee'),{active:false}));const db=kind==='anonymous'?env.unauthenticatedContext().firestore():kind==='nonmember'?client('outsider'):kind==='unverified'?client('sohee',{email_verified:false}):kind==='password'?client('sohee',{firebase:{sign_in_provider:'password'}}):client();for(const path of ['sohee_sales/current','sohee_sales_versions/example/chunks/0'])await assertFails(sdk.getDoc(sdk.doc(db,path)));});
test('Firebase version publication and authenticated read round trip; concurrent revisions conflict',async()=>{
 await env.withSecurityRulesDisabled(ctx=>sdk.deleteDoc(sdk.doc(ctx.firestore(),'sohee_sales/current')));
 const adminRequire=createRequire(new URL('../../../../services/sohee/package.json',import.meta.url));
 const { initializeApp, deleteApp }=adminRequire('firebase-admin/app');
 const { getFirestore }=adminRequire('firebase-admin/firestore');
 const app=initializeApp({projectId:'demo-homehunt'},'sohee-emulator-test'), db=getFirestore(app),p=packSnapshot(fixture(),{capturedAt:'2026-04-16T12:00:00+09:00',sourceHashes:['a'.repeat(64)]});
 try{await publishSnapshot(db,p);const reader=client(),store=createSalesStore({getMember:()=>({uid:'sohee',role:'sohee'}),digest:hash,read:async path=>{const r=await sdk.getDocFromServer(sdk.doc(reader,path));return r.exists()?r.data():null;}});assert.deepEqual((await store.load()).data,fixture());
 const contenders=[1,2].map(n=>{const data=fixture();data.generated_at=`2026-04-${16+n}`;return packSnapshot(data,{capturedAt:`2026-04-${16+n}T12:00:00+09:00`,sourceHashes:['b'.repeat(64)]});});const results=await Promise.allSettled(contenders.map(next=>publishSnapshot(db,next,p.version)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 }finally{await deleteApp(app);}
});
