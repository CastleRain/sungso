import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
export const RSVP_PATH='/api/invitation/v5/rsvp';
export const RSVP_EXPIRES=Date.parse('2027-04-05T15:30:00+09:00');
const ROOT='wedding_rsvps/sungso_20270306',uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,token=/^[0-9a-f]{64}$/;
const hash=s=>createHash('sha256').update(s).digest('hex');
export class RsvpError extends Error{constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}
const fail=(...args)=>{throw new RsvpError(...args);};
export function validateRsvp(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['id','editToken','name','side','attendance','phoneLast4','consent'].includes(k)))fail('INVALID_RESPONSE','참석 응답 형식을 확인해 주세요.');
 if(!uuid.test(body.id||'')||!token.test(body.editToken||'')||!['groom','bride'].includes(body.side)||!['yes','no'].includes(body.attendance)||body.consent!==true)fail('INVALID_RESPONSE','참석 여부와 정보 이용 동의를 확인해 주세요.');
 const name=typeof body.name==='string'?body.name.trim():'';
 if(!name||[...name].length>30||/[\x00-\x1f\x7f]/.test(name)||typeof body.phoneLast4!=='string'||!/^([0-9]{4})?$/.test(body.phoneLast4))fail('INVALID_RESPONSE','성함과 전화번호 뒤 4자리를 확인해 주세요.');
 return {id:body.id.toLowerCase(),editToken:body.editToken,name,side:body.side,attendance:body.attendance,phoneLast4:body.phoneLast4};
}
function state(raw){if(raw===undefined)return{schema:1,rows:[],day:'',writes:0};if(raw.schema!==1||!Array.isArray(raw.rows)||raw.rows.length>1000)throw Error('INVALID_STATE');return structuredClone(raw);}
const receipt=row=>({ok:true,id:row.id,updatedAt:row.updatedAt});
const dto=({id,name,side,attendance,phoneLast4,createdAt,updatedAt})=>({id,name,side,attendance,phoneLast4,createdAt,updatedAt});
export function createRsvpStore({db,now=Date.now}){
 const ref=db.doc(ROOT);
 return {
  async purgeExpired(){if(now()<=RSVP_EXPIRES)return;await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.exists&&snap.data()?.rows?.length)tx.set(ref,{schema:1,rows:[],day:'',writes:0,expiredAt:now()});});},
  async list(){if(now()>RSVP_EXPIRES)return{responses:[],expired:true};const snap=await ref.get();return{responses:state(snap.exists?snap.data():undefined).rows.map(dto).sort((a,b)=>b.updatedAt-a.updatedAt),expired:false};},
  async save(raw){const input=validateRsvp(raw),time=now();if(time>RSVP_EXPIRES)fail('CLOSED','참석 응답 접수가 종료되었습니다.',410);
   return db.runTransaction(async tx=>{const snap=await tx.get(ref),next=state(snap.exists?snap.data():undefined),old=next.rows.find(r=>r.id===input.id),editHash=hash(input.editToken);
    if(old&&!timingSafeEqual(Buffer.from(old.editHash,'hex'),Buffer.from(editHash,'hex')))fail('EDIT_DENIED','이 기기에서 작성한 응답만 수정할 수 있어요.',403);
    const fields={name:input.name,side:input.side,attendance:input.attendance,phoneLast4:input.phoneLast4};
    if(old&&Object.entries(fields).every(([k,v])=>old[k]===v))return receipt(old);
    if(old&&time-old.updatedAt<30000)fail('RATE_LIMIT','잠시 후 다시 수정해 주세요.',429);
    if(!old&&next.rows.length>=1000)fail('FULL','응답 접수가 마감되었습니다.',409);
    const day=new Date(time+9*3600000).toISOString().slice(0,10);if(next.day!==day){next.day=day;next.writes=0;}
    if(next.writes>=300)fail('DAILY_LIMIT','오늘 응답이 많아요. 잠시 후 다시 확인해 주세요.',429);
    const row={id:input.id,...fields,editHash,createdAt:old?.createdAt??time,updatedAt:time};if(old)next.rows[next.rows.indexOf(old)]=row;else next.rows.push(row);next.writes++;next.day=day;tx.set(ref,next);return receipt(row);
   });
  }
 };
}
export function createRsvpApi({store,authenticate,now=Date.now}){
 const rates=new Map(),salt=randomBytes(16).toString('hex');
 return async(req,res)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');if(req.method==='OPTIONS')return res.status(204).end();
  try{
   const path=new URL(req.url,'http://rsvp.invalid').pathname;
   if(req.method==='GET'&&path===RSVP_PATH+'/manage'){await authenticate(req);return res.status(200).json({ok:true,...await store.list()});}
   if(path!==RSVP_PATH)return res.status(404).json({ok:false,error:'지원하지 않는 요청입니다.'});
   if(req.method==='GET')return res.status(200).json({ok:true,available:now()<=RSVP_EXPIRES});
   if(req.method!=='POST')return res.status(405).json({ok:false,error:'지원하지 않는 요청입니다.'});
   if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))fail('INVALID_BODY','요청 형식을 확인해 주세요.',415);
   const raw=req.rawBody||req.body;if(Buffer.byteLength(Buffer.isBuffer(raw)?raw:typeof raw==='string'?raw:JSON.stringify(raw||{}))>4096)fail('TOO_LARGE','응답 내용이 너무 길어요.',413);
   const time=now();for(const[k,v]of rates)if(time-v.at>600000)rates.delete(k);
   const peer=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',').at(-1),key=hash(salt+peer);
   if(rates.size>=2048&&!rates.has(key))fail('BUSY','잠시 후 다시 응답해 주세요.',503);
   const rate=rates.get(key)||{at:time,count:0};rates.set(key,rate);if(++rate.count>30)fail('RATE_LIMIT','잠시 후 다시 응답해 주세요.',429);
   let body;try{body=Buffer.isBuffer(raw)||typeof raw==='string'?JSON.parse(String(raw)):raw;}catch{fail('INVALID_BODY','요청 형식을 확인해 주세요.');}
   return res.status(200).json(await store.save(body));
  }catch(error){const known=error instanceof RsvpError||['AUTH_REQUIRED','AUTH_INVALID','MEMBERSHIP_REQUIRED','MEMBERSHIP_UNAVAILABLE'].includes(error.code);return res.status(known?error.status:503).json({ok:false,code:known?error.code:'RSVP_UNAVAILABLE',error:known?error.message:'참석 응답에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'});}
 };
}
