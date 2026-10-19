// Labelled, persistent LOCAL preview. Production uses the same contract in Firestore.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createGuestbookApi, createGuestbookStore } from '../../../services/invitation/server/guestbook.mjs';
import { createRenderServer } from '../../../services/homehunt/render/node-server.mjs';
export async function startGuestbookPreview(){
 const directory=new URL('../.local/',import.meta.url),file=new URL('guestbook-preview.json',directory);
 await mkdir(directory,{recursive:true});let value;
 try{value=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 let tail=Promise.resolve();const snapshot=()=>({exists:value!==undefined,data:()=>structuredClone(value)}),ref={get:async()=>snapshot()};
 const db={collection:()=>({doc:()=>ref}),runTransaction(action){const run=tail.then(async()=>{let staged;const result=await action({get:async()=>snapshot(),set:(_ref,next)=>{staged=next;}});if(staged){const temp=new URL('guestbook-preview.tmp',directory);await writeFile(temp,JSON.stringify(staged));await rename(temp,file);value=staged;}return result;});tail=run.catch(()=>{});return run;}};
 const server=createRenderServer({api:(_req,res)=>res.status(404).json({ok:false}),guestbook:createGuestbookApi({store:createGuestbookStore({db})})});
 server.listen(8025,'127.0.0.1',()=>console.log('Local-only guestbook preview: port 8025'));return server;
}
