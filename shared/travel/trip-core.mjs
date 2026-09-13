import { TRIP_DAYS, HOTELS, PLACES, DECISIONS } from './trip-data.mjs';
const clone=value=>JSON.parse(JSON.stringify(value));
const statuses=new Set(['pending','candidate','confirmed']);
const hotelIds=new Set(HOTELS.map(h=>h.id));
const dates=new Set(TRIP_DAYS.map(d=>d.date));
const decisionIds=new Set(DECISIONS.map(d=>d.id));
export function defaultTrip(){return {schemaVersion:1,days:clone(TRIP_DAYS),hotels:{arrival:null,return:null},decisions:Object.fromEntries(DECISIONS.map(d=>[d.id,{status:d.status,note:''}]))};}
function safeText(value,max=1500){return typeof value==='string'?value.slice(0,max):'';}
export function normalizeEvents(events){
 if(!Array.isArray(events))return null;
 return events.slice(0,40).filter(e=>e&&typeof e==='object').map(e=>({time:safeText(e.time,80),title:safeText(e.title,180),text:safeText(e.text),...(Object.hasOwn(PLACES,e.place)?{place:e.place}:{})}));
}
export function normalizeTrip(raw){
 const next=defaultTrip();
 if(!raw||typeof raw!=='object')return next;
 for(const slot of ['arrival','return'])if(hotelIds.has(raw.hotels?.[slot]))next.hotels[slot]=raw.hotels[slot];
 for(const id of decisionIds){const entry=raw.decisions?.[id];if(entry){if(statuses.has(entry.status))next.decisions[id].status=entry.status;next.decisions[id].note=safeText(entry.note);}}
 if(Array.isArray(raw.days)){const saved=new Map(raw.days.filter(d=>d&&dates.has(d.date)).map(d=>[d.date,d]));next.days=next.days.map(day=>{const found=saved.get(day.date);const events=normalizeEvents(found?.events);return events?{...day,events}:day;});}
 return next;
}
export function applyTripChange(raw,change){
 const next=normalizeTrip(raw);
 if(change.type==='hotel'){
  if(!['arrival','return'].includes(change.slot)||!(change.hotelId===null||hotelIds.has(change.hotelId)))throw new Error('호텔 후보를 다시 선택해주세요.');
  next.hotels[change.slot]=change.hotelId;
 }else if(change.type==='decision'){
  if(!decisionIds.has(change.id))throw new Error('확인할 항목을 찾지 못했어요.');
  const patch=change.patch;
  if(!patch||!statuses.has(patch.status)||typeof patch.note!=='string'||patch.note.length>1500)throw new Error('상태와 메모를 확인해주세요. 메모는 1,500자까지 저장할 수 있어요.');
  if(change.expectedDecision&&(next.decisions[change.id].status!==change.expectedDecision.status||next.decisions[change.id].note!==change.expectedDecision.note))throw new Error('편집하는 동안 이 항목이 바뀌었어요. 작성한 내용을 보관한 뒤 최신 상태·메모와 비교해주세요.');
  next.decisions[change.id]={status:patch.status,note:patch.note};
 }else if(change.type==='day'){
  if(!dates.has(change.date)||!Array.isArray(change.events)||change.events.length>40)throw new Error('날짜와 일정 개수를 확인해주세요.');
  if(change.events.some(e=>!e||typeof e.title!=='string'||!e.title.trim()||e.title.length>180||typeof e.time!=='string'||e.time.length>80||typeof e.text!=='string'||e.text.length>1500||(e.place&&!Object.hasOwn(PLACES,e.place))))throw new Error('각 일정의 제목과 시간을 확인해주세요.');
  const index=next.days.findIndex(d=>d.date===change.date);
  if(change.expectedEvents&&JSON.stringify(next.days[index].events)!==JSON.stringify(normalizeEvents(change.expectedEvents)))throw new Error('편집하는 동안 이 날짜의 일정이 바뀌었어요. 작성한 내용을 보관한 뒤 최신 일정과 비교해주세요.');
  next.days[index].events=normalizeEvents(change.events);
 }else throw new Error('저장할 항목을 확인해주세요.');
 return next;
}

// Audit only the edited field, using the transaction's latest server value.
export function describeTripChange(raw,next,change,actor='미지정'){
 const previous=normalizeTrip(raw);
 let target,before,after;
 if(change.type==='hotel'){target=change.slot;before=previous.hotels[target];after=next.hotels[target];}
 else if(change.type==='decision'){target=change.id;before=previous.decisions[target];after=next.decisions[target];}
 else if(change.type==='day'){target=change.date;before=previous.days.find(d=>d.date===target).events;after=next.days.find(d=>d.date===target).events;}
 else throw new Error('기록할 변경을 확인해주세요.');
 if(JSON.stringify(before)===JSON.stringify(after))return null;
 return {tripId:'honeymoon_2027',type:change.type,target,actor:['성우','소희'].includes(actor)?actor:'미지정',before:clone(before),after:clone(after)};
}
