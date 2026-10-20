import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createAlbumStore,createAlbumApi,jpegBytes } from '../server/album.mjs';
import { ALBUM_PATH,defaultPhotos } from '../../../shared/invitation/album-core.mjs';
import { createSiteMemberGate } from '../../homehunt/server/site-members.cjs';
import { createMemoryFirestore } from '../../../apps/homehunt/tests/helpers/firestore-memory.mjs';
import { createRenderServer } from '../../homehunt/render/node-server.mjs';
const jpeg=await readFile(new URL('./fixtures/pixel.jpg',import.meta.url));
const data=bytes=>'data:image/jpeg;base64,'+bytes.toString('base64');
const upload=(extra={})=>({id:randomUUID(),expectedRevision:0,alt:'두 사람의 사진',full:data(jpeg),thumb:data(jpeg),...extra});
function fixture(){
  const db=createMemoryFirestore();db.doc=path=>{const parts=path.split('/'),id=parts.pop();return db.collection(parts.join('/')).doc(id);};
  let time=1;return{db,now:()=>time,advance:n=>time+=n,store:createAlbumStore({db,now:()=>time})};
}
const item=p=>({id:p.id,kind:'upload',alt:p.alt});

test('unconfigured reads never seed; private pending uploads are excluded from public metadata',async()=>{
  const f=fixture();assert.equal((await f.store.published()).configured,false);assert.equal((await f.store.manage()).revision,0);assert.equal(f.db.calls.writes,0);
  const input=upload(),result=await f.store.upload(input,'first');
  assert.equal(result.revision,1);assert.equal(result.library.length,1);assert.equal((await f.store.published()).configured,false);
  assert.equal(JSON.stringify(await f.store.published()).includes(input.id),false);
  assert.deepEqual(await f.store.upload(input,'first'),result);assert.equal(f.db.calls.writes,2);
  assert.ok([...f.db.documents.keys()].every(key=>key.startsWith('wedding_albums/sungso_20270306')));
});

test('JPEG dimensions are verified and location/source metadata is stripped before persistence',async()=>{
  const payload=Buffer.from('Exif\0\0PRIVATE_METADATA'),size=Buffer.alloc(2);size.writeUInt16BE(payload.length+2);
  const tagged=Buffer.concat([jpeg.subarray(0,2),Buffer.from([255,225]),size,payload,jpeg.subarray(2)]);
  const parsed=jpegBytes(data(tagged),360000);assert.equal(parsed.width,12);assert.equal(parsed.height,18);assert.deepEqual(parsed.bytes,jpeg);
  const f=fixture(),input=upload({full:data(tagged),thumb:data(tagged)});await f.store.upload(input,'first');
  const photo=await f.store.photo(input.id);assert.equal(photo.full,data(jpeg));
  for(const invalid of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/jpeg;base64,AAAA',data(jpeg.subarray(0,-1)), 'x'.repeat(360001)])assert.throws(()=>jpegBytes(invalid,360000));
  assert.equal(f.db.calls.writes,2);
});

test('publishing, reordering, exclusion and restoration preserve original bytes and private fields',async()=>{
  const f=fixture(),input=upload();await f.store.upload(input,'first');
  let result=await f.store.publish({expectedRevision:1,items:[item(input),{id:'sea',kind:'static',alt:'바닷가'}]},'first');
  const visible=await f.store.published();assert.equal(visible.configured,true);assert.deepEqual(visible.items.map(p=>p.id),[input.id,'sea']);
  assert.equal(/createdBy|updatedBy|hash|full|thumb|library/.test(JSON.stringify(visible)),false);
  result=await f.store.publish({expectedRevision:result.revision,items:[]},'second');assert.equal((await f.store.published()).configured,true);assert.deepEqual((await f.store.published()).items,[]);
  assert.equal((await f.store.photo(input.id)).full,data(jpeg));assert.equal((await f.store.manage()).library.length,1);
  result=await f.store.publish({expectedRevision:result.revision,items:[item(input)]},'second');
  const writes=f.db.calls.writes;await f.store.publish({expectedRevision:0,items:[item(input)]},'first');assert.equal(f.db.calls.writes,writes);
  assert.equal((await f.store.published()).items[0].id,input.id);
});

test('concurrent updates and delayed upload retries cannot overwrite a partner edit',async()=>{
  const f=fixture(),input=upload();await f.store.upload(input,'first');await f.store.publish({expectedRevision:1,items:[]},'second');
  await assert.rejects(f.store.upload(input,'first'),{code:'ALBUM_CONFLICT'});
  await assert.rejects(f.store.publish({expectedRevision:1,items:[item(input)]},'first'),{code:'ALBUM_CONFLICT'});
  const results=await Promise.allSettled([
    f.store.publish({expectedRevision:2,items:[item(input)]},'first'),
    f.store.publish({expectedRevision:2,items:defaultPhotos.map(p=>({id:p.id,kind:'static',alt:p.alt}))},'second'),
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'ALBUM_CONFLICT');
});

test('invalid IDs, duplicate selection, unknown upload, forged fields and photo limits do not write',async()=>{
  const f=fixture();
  for(const items of [[{id:'../private',kind:'static',alt:'x'}],[{id:'sea',kind:'static',alt:'x'},{id:'sea',kind:'static',alt:'x'}],[{id:randomUUID(),kind:'upload',alt:'x'}],Array.from({length:21},()=>({id:randomUUID(),kind:'upload',alt:'x'}))])await assert.rejects(f.store.publish({expectedRevision:0,items},'first'));
  await assert.rejects(f.store.upload(upload({updatedBy:'partner'}),'first'));
  await assert.rejects(f.store.upload(upload({alt:'x'.repeat(161)}),'first'));assert.equal(f.db.calls.writes,0);
});

test('HTTP: public selection only; both verified member roles can edit; other APIs keep authentication',async t=>{
  const f=fixture();for(const[uid,role,active]of [['first','sungwoo',true],['second','sohee',true],['disabled','sungwoo',false],['wrong','admin',true]])f.db.documents.set('site_members/'+uid,{role,active});
  const authenticate=createSiteMemberGate({db:f.db,auth:{async verifyIdToken(token){if(!['first','second','disabled','wrong','unverified'].includes(token))throw Error('bad');return{uid:token,email:'fixture@example.test',email_verified:token!=='unverified',firebase:{sign_in_provider:'google.com'}};}}});
  const api=createAlbumApi({...f,authenticate}),server=createRenderServer({album:api,api:(_req,res)=>res.status(401).json({code:'AUTH_REQUIRED'})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}`,headers={Origin:'https://castlerain.github.io','Content-Type':'application/json'},member=uid=>({...headers,Authorization:'Bearer '+uid});
  const get=path=>fetch(base+ALBUM_PATH+path,{headers});
  assert.equal((await get('')).status,200);assert.equal(f.db.calls.writes,0);
  assert.equal((await get('/manage')).status,401);
  for(const uid of ['disabled','wrong','unverified'])assert.equal((await fetch(base+ALBUM_PATH+'/manage',{headers:member(uid)})).status,403);
  for(const uid of ['first','second'])assert.equal((await fetch(base+ALBUM_PATH+'/manage',{headers:member(uid)})).status,200);
  assert.equal((await fetch(base+'/api/health',{headers})).status,401);
  assert.equal((await fetch(base+ALBUM_PATH,{headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(base+'/api/health',{headers:{Origin:'http://127.0.0.1:8024'}})).status,403);
  assert.equal((await fetch(base+ALBUM_PATH+'/private',{headers})).status,401);
  const input=upload();assert.equal((await fetch(base+ALBUM_PATH+'/upload',{method:'POST',headers:member('first'),body:JSON.stringify(input)})).status,200);
  assert.equal((await get(`/photos/${input.id}/thumb`)).status,404);
  assert.equal((await fetch(base+ALBUM_PATH+`/manage/photos/${input.id}/thumb`,{headers:member('second')})).status,200);
  const publish=items=>fetch(base+ALBUM_PATH+'/publish',{method:'PUT',headers:member('first'),body:JSON.stringify({expectedRevision:items.length?1:2,items})});
  assert.equal((await publish([item(input)])).status,200);
  const image=await get(`/photos/${input.id}/full`);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/jpeg');assert.deepEqual(Buffer.from(await image.arrayBuffer()),jpeg);
  const download=await get(`/photos/${input.id}/full?download=1`);assert.equal(download.status,200);assert.equal(download.headers.get('content-disposition'),`attachment; filename="sungso-${input.id}.jpg"`);
  const publicBody=await(await get('')).json();assert.equal(publicBody.items[0].id,input.id);assert.equal(JSON.stringify(publicBody).includes('first'),false);
  await publish([]);assert.equal((await get(`/photos/${input.id}/full`)).status,404);
  assert.equal((await fetch(base+ALBUM_PATH+'/upload',{method:'POST',headers:member('first'),body:'x'.repeat(450000)})).status,413);
});

test('unavailable storage never returns provider errors or credentials',async()=>{
  const api=createAlbumApi({store:{published:async()=>{throw Object.assign(Error('PRIVATE_CREDENTIAL'),{status:403});}},authenticate:async()=>({uid:'first'})});
  const response={setHeader(){},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}};
  await api({url:ALBUM_PATH,method:'GET',headers:{}},response);assert.equal(response.statusCode,503);assert.equal(JSON.stringify(response.body).includes('CREDENTIAL'),false);
});
