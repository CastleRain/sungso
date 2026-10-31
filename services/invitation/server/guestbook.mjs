import { createHash, randomBytes } from 'node:crypto';

export const GUESTBOOK_PATH = '/api/invitation/v3/guestbook';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[a-f0-9]{64}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const day = now => new Date(now + 9 * 3600000).toISOString().slice(0,10);
export class GuestbookError extends Error { constructor(code, message, status = 400) { super(message); this.code=code; this.status=status; } }
const reject = (code, message, status) => { throw new GuestbookError(code,message,status); };
export function validateMessage(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k=>!['name','text','clientId','requestId','deleteToken','consent','website','stamp','paper'].includes(k))) reject('INVALID_MESSAGE','입력 내용을 확인해 주세요.');
  if (body.consent !== true || body.website) reject('INVALID_MESSAGE','이름과 메시지 공개에 동의해 주세요.');
  if (!UUID.test(body.clientId || '') || !UUID.test(body.requestId || '') || !TOKEN.test(body.deleteToken || '')) reject('INVALID_MESSAGE','페이지를 다시 열고 작성해 주세요.');
  if (typeof body.name !== 'string' || typeof body.text !== 'string') reject('INVALID_MESSAGE','이름과 축하 메시지를 입력해 주세요.');
  const name=body.name.trim().normalize('NFC'), text=body.text.trim().replace(/\r\n?/g,'\n').normalize('NFC');
  if (![...name].length || [...name].length>20 || ![...text].length || [...text].length>300 || /[\x00-\x08\x0b-\x1f\x7f]/.test(name+text) || /\n/.test(name) || text.split('\n').length>8) reject('INVALID_MESSAGE','이름은 20자, 메시지는 300자 이내로 적어 주세요.');
  if(body.stamp!==undefined&&!['coffee','flowers','ring','cheers','heart'].includes(body.stamp)||body.paper!==undefined&&!['mist','rose','cream'].includes(body.paper))reject('INVALID_MESSAGE','엽서 선택을 확인해 주세요.');
  return {name,text,...(body.stamp?{stamp:body.stamp}:{}),...(body.paper?{paper:body.paper}:{}),clientId:body.clientId,requestId:body.requestId,deleteToken:body.deleteToken};
}
const publicMessage = ({id,name,text,createdAt,stamp,paper}) => ({id,name,text,createdAt,...(stamp?{stamp}:{}),...(paper?{paper}:{})});
function state(value) {
  if (value === undefined) return {schema:1,messages:[],daily:{date:'',count:0},visitors:[]};
  if (value?.schema!==1 || !Array.isArray(value.messages) || value.messages.length>300 || !value.daily || !Number.isSafeInteger(value.daily.count) || value.daily.count<0 || !Array.isArray(value.visitors) || value.visitors.length>300) throw Error('INVALID_GUESTBOOK_STATE');
  if(value.messages.some(m=>!UUID.test(m?.id||'') || typeof m.name!=='string' || typeof m.text!=='string' || !Number.isSafeInteger(m.createdAt) || !TOKEN.test(m.deleteHash||''))) throw Error('INVALID_GUESTBOOK_STATE');
  return structuredClone(value);
}
/** Only this document is used. Existing member/private collections are never read. */
export function createGuestbookStore({ db, now = Date.now }) {
  const ref = db.collection('wedding_guestbooks').doc('sungso_20270306');
  return {
    async list() { const snap=await ref.get(); return state(snap.exists?snap.data():undefined).messages.map(publicMessage).sort((a,b)=>b.createdAt-a.createdAt || b.id.localeCompare(a.id)); },
    async create(raw) {
      const input=validateMessage(raw), time=now(), date=day(time), key=hash(input.clientId);
      return db.runTransaction(async tx=>{
        const snap=await tx.get(ref), next=state(snap.exists?snap.data():undefined);
        const existing=next.messages.find(m=>m.id===input.requestId);
        if(existing){ if(existing.deleteHash!==hash(input.deleteToken) || existing.name!==input.name || existing.text!==input.text || existing.stamp!==input.stamp || existing.paper!==input.paper) reject('REQUEST_CONFLICT','이미 처리된 요청입니다.',409); return publicMessage(existing); }
        if(next.messages.length>=300) reject('GUESTBOOK_FULL','방명록이 가득 찼어요. 두 사람에게 직접 마음을 전해 주세요.',409);
        const daily=next.daily.date===date?next.daily:{date,count:0};
        if(daily.count>=100) reject('DAILY_LIMIT','오늘은 많은 축하가 도착했어요. 내일 다시 남겨 주세요.',429);
        const visitors=next.visitors.filter(v=>v.date===date), visitor=visitors.find(v=>v.key===key);
        if(visitor && (visitor.count>=3 || time-visitor.lastAt<60000)) reject('TOO_MANY_MESSAGES','잠시 기다린 뒤 남겨 주세요. 하루 세 번까지 작성할 수 있어요.',429);
        const row={id:input.requestId,name:input.name,text:input.text,...(input.stamp?{stamp:input.stamp}:{}),...(input.paper?{paper:input.paper}:{}),createdAt:time,deleteHash:hash(input.deleteToken)};
        next.messages.push(row); next.daily={date,count:daily.count+1};
        next.visitors=[...visitors.filter(v=>v.key!==key).slice(-299),{key,date,count:(visitor?.count||0)+1,lastAt:time}];
        tx.set(ref,next); return publicMessage(row);
      });
    },
    async remove(id, token) {
      if(!UUID.test(id)||!TOKEN.test(token||'')) reject('INVALID_TOKEN','이 기기에서 작성한 메시지만 삭제할 수 있어요.',403);
      return db.runTransaction(async tx=>{
        const snap=await tx.get(ref), next=state(snap.exists?snap.data():undefined), row=next.messages.find(m=>m.id===id);
        if(!row)return;
        if(row.deleteHash!==hash(token))reject('INVALID_TOKEN','이 기기에서 작성한 메시지만 삭제할 수 있어요.',403);
        next.messages=next.messages.filter(m=>m.id!==id);tx.set(ref,next);
      });
    },
  };
}

export function createGuestbookApi({store,now=Date.now}={}) {
  const buckets=new Map(), salt=randomBytes(24).toString('hex');
  let cached=null,cacheAt=0;
  function allow(req,write) {
    const forwarded=String(req.headers['x-forwarded-for']||'').split(',').map(x=>x.trim()).filter(Boolean);
    const peer=forwarded.at(-1)||req.socket?.remoteAddress||'unknown';
    const key=hash(salt+peer), time=now();
    for(const [k,v]of buckets)if(time-v.at>3600000)buckets.delete(k);
    if(buckets.size>=2048&&!buckets.has(key))reject('SERVER_BUSY','잠시 후 다시 시도해 주세요.',503);
    const current=buckets.get(key)||{at:time,reads:0,writes:0};
    current[write?'writes':'reads']++; buckets.set(key,current);
    if(current.reads>120||current.writes>12)reject('RATE_LIMIT','요청이 많아요. 잠시 후 다시 시도해 주세요.',429);
  }
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');
    if(req.method==='OPTIONS')return res.status(204).end();
    try{
      const url=new URL(req.url,'http://guestbook.invalid'), suffix=url.pathname.slice(GUESTBOOK_PATH.length);
      if(suffix && !/^\/[0-9a-f-]{36}$/i.test(suffix))return res.status(404).json({ok:false,error:'지원하지 않는 요청입니다.'});
      if(req.method==='GET'&&!suffix){
        allow(req,false);
        if(url.searchParams.size>1||[...url.searchParams.keys()].some(k=>k!=='before'))reject('INVALID_PAGE','페이지 주소를 확인해 주세요.');
        const before=url.searchParams.get('before');if(before&&!UUID.test(before))reject('INVALID_PAGE','페이지 주소를 확인해 주세요.');
        if(!cached||now()-cacheAt>15000){cached=await store.list();cacheAt=now();}
        const index=before?cached.findIndex(m=>m.id===before)+1:0;
        if(before&&index===0)reject('STALE_PAGE','목록이 바뀌었어요. 새로고침해 주세요.',409);
        const messages=cached.slice(index,index+10), next=index+10<cached.length?messages.at(-1)?.id:null;
        return res.status(200).json({ok:true,messages,next,total:cached.length});
      }
      if(!['POST','DELETE'].includes(req.method)||req.method==='POST'&&suffix||req.method==='DELETE'&&!suffix)return res.status(405).json({ok:false,error:'지원하지 않는 요청입니다.'});
      allow(req,true);
      if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))reject('INVALID_BODY','요청 형식을 확인해 주세요.',415);
      const raw=req.rawBody||req.body;
      if(Buffer.byteLength(Buffer.isBuffer(raw)?raw:typeof raw==='string'?raw:JSON.stringify(raw||{}))>6144)reject('BODY_TOO_LARGE','메시지가 너무 길어요.',413);
      let body;try{body=Buffer.isBuffer(raw)||typeof raw==='string'?JSON.parse(String(raw)):raw;}catch{reject('INVALID_BODY','요청 형식을 확인해 주세요.');}
      if(req.method==='POST'){const message=await store.create(body);cached=null;return res.status(201).json({ok:true,message});}
      if(!body||Object.keys(body).some(k=>k!=='deleteToken'))reject('INVALID_BODY','요청 형식을 확인해 주세요.');
      await store.remove(suffix.slice(1),body.deleteToken);cached=null;return res.status(200).json({ok:true});
    }catch(error){
      const known=error instanceof GuestbookError;
      if(known&&error.status===429)res.setHeader('Retry-After','60');
      return res.status(known?error.status:503).json({ok:false,code:known?error.code:'SERVICE_UNAVAILABLE',error:known?error.message:'방명록에 연결하지 못했어요. 작성한 글은 그대로 두고 다시 시도해 주세요.'});
    }
  };
}
