// Persistent LOCAL preview only. No service account or production database connection.
import { readFile,writeFile,mkdir,rename } from 'node:fs/promises';
import { createGuestbookApi,createGuestbookStore } from '../../../services/invitation/server/guestbook.mjs';
import { createAlbumApi,createAlbumStore } from '../../../services/invitation/server/album.mjs';
import { createRenderServer } from '../../../services/homehunt/render/node-server.mjs';
export async function startGuestbookPreview(){
  const directory=new URL('../.local/',import.meta.url),file=new URL('invitation-preview-store.json',directory);await mkdir(directory,{recursive:true});
  let values={};try{values=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;try{values['wedding_guestbooks/sungso_20270306']=JSON.parse(await readFile(new URL('guestbook-preview.json',directory),'utf8'));}catch(previous){if(previous.code!=='ENOENT')throw previous;}}
  const snap=key=>({exists:Object.hasOwn(values,key),data:()=>structuredClone(values[key])});
  const reference=path=>({path,key:path,get:async()=>snap(path)});let tail=Promise.resolve();
  const db={doc:reference,collection:path=>({doc:id=>reference(path+'/'+id)}),runTransaction(action){const run=tail.then(async()=>{const writes=new Map();const result=await action({get:async ref=>snap(ref.path),set:(ref,value)=>writes.set(ref.path,structuredClone(value))});if(writes.size){const next={...values};for(const[key,value]of writes)next[key]=value;const temp=new URL('invitation-preview-store.tmp',directory);await writeFile(temp,JSON.stringify(next));await rename(temp,file);values=next;}return result;});tail=run.catch(()=>{});return run;}};
  const authenticate=async req=>{if(req.headers.authorization!=='Bearer local-preview')throw Object.assign(Error('로컬 미리보기 로그인입니다.'),{code:'AUTH_REQUIRED',status:401});return{uid:'local-preview',role:'sungwoo'};};
  const server=createRenderServer({api:(_req,res)=>res.status(404).json({ok:false}),guestbook:createGuestbookApi({store:createGuestbookStore({db})}),album:createAlbumApi({store:createAlbumStore({db}),authenticate})});
  server.listen(8025,'127.0.0.1',()=>console.log('Local-only invitation API preview: port 8025'));return server;
}