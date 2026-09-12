import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, collection, query, orderBy, documentId, startAt, endAt, limit, onSnapshot, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { defaultTrip, normalizeTrip, applyTripChange, describeTripChange } from './trip-core.mjs';

// A named app keeps the existing finance/property Firebase initializers intact.
const name='sungso-travel';
const app=getApps().find(app=>app.name===name)||initializeApp({
 apiKey:'AIzaSyBz-P5ycMAjYZBV7hkcZDrmq28EAw7Hsp8',authDomain:'sungso-358cb.firebaseapp.com',projectId:'sungso-358cb',storageBucket:'sungso-358cb.firebasestorage.app',messagingSenderId:'143797950443',appId:'1:143797950443:web:95b0f616246d84aae3bae'
},name);
const db=getFirestore(app),ref=doc(db,'itineraries','honeymoon_2027');
const historyPrefix='honeymoon_2027_log_';
// Reverse-time IDs use Firestore's built-in ascending name index for recent entries.
// Descending name queries need an extra index in this existing project.
const historyQuery=query(collection(db,'itineraries'),orderBy(documentId()),startAt(historyPrefix),endAt(historyPrefix+'\uf8ff'),limit(50));
const actorKey='sungso_trip_actor';
let actor='미지정';
try{const saved=localStorage.getItem(actorKey);if(['성우','소희'].includes(saved))actor=saved;}catch{}
export function getActor(){try{const saved=localStorage.getItem(actorKey);actor=['성우','소희'].includes(saved)?saved:'미지정';}catch{}return actor;}
export function setActor(value){actor=['성우','소희'].includes(value)?value:'미지정';try{localStorage.setItem(actorKey,actor);}catch{}return actor;}

let state={data:defaultTrip(),connection:'loading',saving:false,error:''};
let historyState={entries:[],connection:'loading',error:''};
const subscribers=new Set(),historySubscribers=new Set();
let stop=null,timer=null,historyStop=null,historyTimer=null;
const emit=()=>subscribers.forEach(cb=>cb({...state,data:structuredClone(state.data)}));
const emitHistory=()=>historySubscribers.forEach(cb=>cb(structuredClone(historyState)));
function start(){
 if(stop)return;
 timer=setTimeout(()=>{if(state.connection==='loading'){state={...state,connection:'offline',error:'공동 저장에 연결하지 못했어요. 현재 초안을 보고 있어요.'};emit();}},15000);
 stop=onSnapshot(ref,{includeMetadataChanges:true},snap=>{
  const live=!snap.metadata.fromCache;
  if(live)clearTimeout(timer);
  state={...state,data:normalizeTrip(snap.exists()?snap.data():null),connection:live?'live':(navigator.onLine?'loading':'offline'),error:live?'':state.error};emit();
 },error=>{clearTimeout(timer);state={...state,connection:'error',error:error.code==='permission-denied'?'공동 저장 권한을 확인해야 해요.':'공동 저장을 불러오지 못했어요. 새로고침 후 다시 확인해주세요.'};emit();});
}
function startHistory(){
 if(historyStop)return;
 historyTimer=setTimeout(()=>{if(historyState.connection==='loading'){historyState={...historyState,connection:'offline',error:'변경 기록에 연결하지 못했어요. 새로고침 후 다시 확인해주세요.'};emitHistory();}},15000);
 historyStop=onSnapshot(historyQuery,{includeMetadataChanges:true},snap=>{
  const live=!snap.metadata.fromCache;
  if(live)clearTimeout(historyTimer);
  const entries=snap.docs.map(row=>{
   const data=row.data(),stamp=data.changedAt;
   return {id:row.id,actor:data.actor||'미지정',changedAt:stamp?.toDate?.().toISOString()||(typeof stamp==='string'?stamp:''),type:data.type,target:data.target,before:data.before,after:data.after};
  }).filter(row=>['hotel','decision','day'].includes(row.type)).sort((a,b)=>b.changedAt.localeCompare(a.changedAt)||b.id.localeCompare(a.id));
  historyState={entries,connection:live?'live':(navigator.onLine?'loading':'offline'),error:live?'':historyState.error};emitHistory();
 },()=>{clearTimeout(historyTimer);historyState={...historyState,connection:'error',error:'변경 기록을 불러오지 못했어요. 새로고침 후 다시 확인해주세요.'};emitHistory();});
}
export function subscribeTrip(cb){subscribers.add(cb);cb({...state,data:structuredClone(state.data)});start();return()=>{subscribers.delete(cb);if(!subscribers.size){stop?.();stop=null;clearTimeout(timer);state={...state,connection:'loading'};}};}
export function subscribeTripHistory(cb){historySubscribers.add(cb);cb(structuredClone(historyState));startHistory();return()=>{historySubscribers.delete(cb);if(!historySubscribers.size){historyStop?.();historyStop=null;clearTimeout(historyTimer);historyState={...historyState,connection:'loading'};}};}
async function save(change){
 if(state.connection!=='live'||!navigator.onLine)throw new Error('공동 저장에 연결된 뒤 다시 저장해주세요.');
 if(state.saving)throw new Error('앞선 저장이 끝난 뒤 다시 시도해주세요.');
 applyTripChange(state.data,change);
 const changeActor=getActor();
 const historyRef=doc(db,'itineraries',historyPrefix+String(9999999999999-Date.now()).padStart(13,'0')+'_'+crypto.randomUUID());
 state={...state,saving:true,error:''};emit();
 try{
  await runTransaction(db,async tx=>{
   const snap=await tx.get(ref),raw=snap.exists()?snap.data():null;
   const next=applyTripChange(raw,change),audit=describeTripChange(raw,next,change,changeActor);
   if(!audit)return;
   // The state and its audit entry either both succeed or both fail.
   // itineraries/main and all legacy comments/picks remain untouched.
   tx.set(ref,{...next,updatedAt:serverTimestamp()},{merge:true});
   tx.set(historyRef,{...audit,changedAt:serverTimestamp()});
  });
  state={...state,saving:false,error:''};emit();
 }catch(e){const message=e.code==='permission-denied'?'저장 권한이 없어 반영되지 않았어요.':e.message||'저장하지 못했어요. 내용을 유지한 뒤 다시 시도해주세요.';state={...state,saving:false,error:message};emit();throw new Error(message);}
}
export const saveHotelChoice=(slot,hotelId)=>save({type:'hotel',slot,hotelId});
export const saveDecision=(id,patch,expectedDecision)=>save({type:'decision',id,patch,expectedDecision});
export const saveDay=(date,events,expectedEvents)=>save({type:'day',date,events,expectedEvents});
window.addEventListener('offline',()=>{state={...state,connection:'offline',error:'인터넷 연결이 끊겼어요. 연결 후 다시 저장해주세요.'};emit();historyState={...historyState,connection:'offline',error:'인터넷 연결이 끊겼어요. 마지막으로 받은 기록이에요.'};emitHistory();});
window.addEventListener('online',()=>{
 if(subscribers.size){stop?.();stop=null;clearTimeout(timer);state={...state,connection:'loading',error:''};emit();start();}
 if(historySubscribers.size){historyStop?.();historyStop=null;clearTimeout(historyTimer);historyState={...historyState,connection:'loading',error:''};emitHistory();startHistory();}
});
