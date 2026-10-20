import { createHash, randomBytes } from 'node:crypto';
import { ALBUM_PATH, MAX_SAVED_PHOTOS, PHOTO_UUID, defaultPhotos, validateAlbumItems, photoCaption, validRevision, albumFail, AlbumError } from '../../../shared/invitation/album-core.mjs';
const ROOT = 'wedding_albums/sungso_20270306';
const digest = value => createHash('sha256').update(value).digest('hex');
const initial = () => ({schema:1,revision:0,published:false,publishedRevision:0,items:defaultPhotos.map(p=>({id:p.id,kind:'static',alt:p.alt})),uploads:[]});
function state(raw) {
  if (raw === undefined) return initial();
  if (raw?.schema!==1 || !Number.isSafeInteger(raw.revision) || raw.revision<1 || typeof raw.published!=='boolean' || !Array.isArray(raw.uploads) || raw.uploads.length>MAX_SAVED_PHOTOS) throw Error('INVALID_ALBUM_STATE');
  const next=structuredClone(raw); next.items=validateAlbumItems(raw.items); return next;
}
const internalDto = value => ({revision:value.revision,published:value.published,items:value.items,library:value.uploads.map(({id,alt,width,height})=>({id,kind:'upload',alt,width,height}))});
const publicDto = value => ({configured:value.published,revision:value.publishedRevision,items:value.items.map(item=>({...item,...(item.kind==='static'?{}:Object.fromEntries(['width','height'].map(k=>[k,value.uploads.find(p=>p.id===item.id)?.[k]])))}))});

// JPEG metadata is removed again on the server; dimensions come from JPEG bytes.
export function jpegBytes(dataUrl, limit) {
  if (typeof dataUrl!=='string' || dataUrl.length>limit || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) albumFail('INVALID_IMAGE','웹용 JPG 사진을 다시 선택해 주세요.');
  const text=dataUrl.slice(23), bytes=Buffer.from(text,'base64');
  if (bytes.toString('base64')!==text || bytes[0]!==255 || bytes[1]!==216 || bytes.at(-2)!==255 || bytes.at(-1)!==217) albumFail('INVALID_IMAGE','사진 데이터를 읽지 못했어요.');
  let width=0,height=0,index=2;const removed=[];
  while (index<bytes.length-2) {
    const start=index;if (bytes[index++]!==255) albumFail('INVALID_IMAGE','JPG 형식을 확인해 주세요.');
    while(bytes[index]===255)index++;
    const marker=bytes[index++];
    if (marker===218 || marker===217) break;
    if (index+2>bytes.length) albumFail('INVALID_IMAGE','사진이 잘렸어요.');
    const size=bytes.readUInt16BE(index);
    if (size<2 || index+size>bytes.length) albumFail('INVALID_IMAGE','사진 형식을 확인해 주세요.');
    if(marker>=225&&marker<=239)removed.push([start,index+size]);
    if ([192,194].includes(marker)) { if(size<8)albumFail('INVALID_IMAGE','사진 크기를 확인해 주세요.');height=bytes.readUInt16BE(index+3);width=bytes.readUInt16BE(index+5); }
    index+=size;
  }
  if (!width || !height || Math.max(width,height)>1600) albumFail('INVALID_IMAGE','사진은 긴 변 1600px 이하로 준비해 주세요.');
  let sanitized=bytes;
  if(removed.length){let offset=0;const pieces=[];for(const[start,end]of removed){pieces.push(bytes.subarray(offset,start));offset=end;}pieces.push(bytes.subarray(offset));sanitized=Buffer.concat(pieces);}
  return {bytes:sanitized,width,height};
}
export function validateUpload(body) {
  if (!body || Object.keys(body).some(k=>!['id','expectedRevision','alt','full','thumb'].includes(k)) || !PHOTO_UUID.test(body.id||'')) albumFail('INVALID_UPLOAD','사진 업로드 정보를 확인해 주세요.');
  validRevision(body.expectedRevision);
  const full=jpegBytes(body.full,360000), thumb=jpegBytes(body.thumb,60000);
  if (Math.max(thumb.width,thumb.height)>480 || Math.abs(full.width/full.height-thumb.width/thumb.height)>.02) albumFail('INVALID_IMAGE','미리보기 사진의 크기를 확인해 주세요.');
  return {...body,full:'data:image/jpeg;base64,'+full.bytes.toString('base64'),thumb:'data:image/jpeg;base64,'+thumb.bytes.toString('base64'),alt:photoCaption(body.alt),width:full.width,height:full.height,hash:digest(full.bytes),bytes:full.bytes.length+thumb.bytes.length};
}
export function createAlbumStore({db,now=Date.now}) {
  const ref=db.doc(ROOT);
  const read=async()=>{const snap=await ref.get();return state(snap.exists?snap.data():undefined);};
  return {
    read, async manage(){return internalDto(await read());}, async published(){return publicDto(await read());},
    async upload(raw,uid) {
      const input=validateUpload(raw),photoRef=db.doc(`${ROOT}/photos/${input.id}`);
      return db.runTransaction(async tx=>{
        const snap=await tx.get(ref), next=state(snap.exists?snap.data():undefined), existing=next.uploads.find(p=>p.id===input.id);
        if(existing){if(existing.hash!==input.hash)albumFail('PHOTO_CONFLICT','다른 사진과 번호가 겹쳤어요. 다시 선택해 주세요.',409);if(next.revision!==input.expectedRevision&&!(next.revision===existing.revision&&input.expectedRevision===existing.revision-1))albumFail('ALBUM_CONFLICT','다른 기기에서 사진첩을 바꿨어요. 최신 사진첩을 확인해 주세요.',409);return internalDto(next);}
        if(next.revision!==input.expectedRevision)albumFail('ALBUM_CONFLICT','다른 기기에서 사진첩을 바꿨어요. 최신 사진첩을 확인해 주세요.',409);
        if(next.uploads.length>=MAX_SAVED_PHOTOS)albumFail('LIBRARY_FULL','사진 보관함이 가득 찼어요. 보관 사진 정리를 요청해 주세요.',409);
        const metadata={id:input.id,alt:input.alt,width:input.width,height:input.height,hash:input.hash,bytes:input.bytes,revision:next.revision+1};
        next.uploads.push(metadata);next.revision++;next.updatedBy=uid;next.updatedAt=now();
        tx.set(photoRef,{schema:1,full:input.full,thumb:input.thumb,hash:input.hash,createdBy:uid,createdAt:now()});tx.set(ref,next);
        return internalDto(next);
      });
    },
    async publish(body,uid) {
      if (!body || Object.keys(body).some(k=>!['expectedRevision','items'].includes(k)))albumFail('INVALID_ALBUM','사진 목록을 확인해 주세요.');
      validRevision(body.expectedRevision);const items=validateAlbumItems(body.items);
      return db.runTransaction(async tx=>{
        const snap=await tx.get(ref),next=state(snap.exists?snap.data():undefined);
        if(next.published&&JSON.stringify(next.items)===JSON.stringify(items))return internalDto(next);
        if(next.revision!==body.expectedRevision)albumFail('ALBUM_CONFLICT','다른 기기에서 사진첩을 바꿨어요. 최신 사진첩을 확인해 주세요.',409);
        if(items.some(p=>p.kind==='upload'&&!next.uploads.some(u=>u.id===p.id)))albumFail('PHOTO_MISSING','업로드를 마친 사진만 공개할 수 있어요.');
        next.items=items;next.published=true;next.revision++;next.publishedRevision=next.revision;next.updatedBy=uid;next.updatedAt=now();
        tx.set(ref,next);return internalDto(next);
      });
    },
    async photo(id) {const snap=await db.doc(`${ROOT}/photos/${id}`).get();if(!snap.exists)albumFail('PHOTO_MISSING','사진을 찾지 못했어요.',404);return snap.data();},
  };
}

export function createAlbumApi({store,authenticate,now=Date.now}) {
  let published,cacheAt=0;
  const images=new Map(),rates=new Map(),salt=randomBytes(16).toString('hex');
  async function current(){if(!published||now()-cacheAt>15000){published=await store.published();cacheAt=now();}return published;}
  function allow(req,uid) {
    const peer=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',').at(-1);
    const key=digest(salt+(uid||peer));const time=now();
    for(const[k,v]of rates)if(time-v.at>600000)rates.delete(k);
    if(rates.size>=2048&&!rates.has(key))albumFail('SERVER_BUSY','잠시 후 다시 확인해 주세요.',503);
    const row=rates.get(key)||{at:time,count:0};row.count++;rates.set(key,row);
    if(row.count>(uid?180:600))albumFail('RATE_LIMIT','잠시 후 다시 확인해 주세요.',429);
  }
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    if(req.method==='OPTIONS')return res.status(204).end();
    try {
      const pathname=new URL(req.url,'http://album.invalid').pathname,suffix=pathname.slice(ALBUM_PATH.length);
      const image=/^\/(manage\/)?photos\/([a-f0-9-]{36})\/(full|thumb)$/i.exec(suffix);
      const publicRead=req.method==='GET'&&(!suffix||image&&!image[1]);
      const member=publicRead?null:await authenticate(req);
      allow(req,member?.uid);
      if (req.method==='GET'&&!suffix) return res.status(200).json({ok:true,...await current()});
      if (req.method==='GET'&&suffix==='/manage') return res.status(200).json({ok:true,...await store.manage()});
      if (req.method==='GET'&&image) {
        const id=image[2];if(!PHOTO_UUID.test(id))albumFail('PHOTO_MISSING','사진을 찾지 못했어요.',404);
        const manifest=member?await store.manage():await current();
        const allowed=member?manifest.library:manifest.items;
        if(!allowed.some(p=>p.kind==='upload'&&p.id===id))albumFail('PHOTO_MISSING','사진을 찾지 못했어요.',404);
        if(!images.has(id)){const data=await store.photo(id);if(images.size>=24)images.delete(images.keys().next().value);images.set(id,{full:Buffer.from(data.full.slice(23),'base64'),thumb:Buffer.from(data.thumb.slice(23),'base64')});}
        const data=images.get(id)[image[3]];
        res.status(200);res.setHeader('Content-Type','image/jpeg');res.setHeader('Content-Length',data.length);
        if(image[3]==='full'&&new URL(req.url,'http://album.invalid').searchParams.get('download')==='1')res.setHeader('Content-Disposition',`attachment; filename="sungso-${id}.jpg"`);
        res.setHeader('Cache-Control',member?'private, no-store':'public, max-age=60');return res.end(data);
      }
      if(!['/upload','/publish'].includes(suffix) || req.method!==(suffix==='/upload'?'POST':'PUT'))return res.status(405).json({ok:false,error:'지원하지 않는 요청입니다.'});
      if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))albumFail('INVALID_BODY','요청 형식을 확인해 주세요.',415);
      const raw=req.rawBody||req.body;
      if(Buffer.byteLength(Buffer.isBuffer(raw)?raw:typeof raw==='string'?raw:JSON.stringify(raw||{}))>(suffix==='/upload'?440000:12000))albumFail('BODY_TOO_LARGE','사진 용량을 조금 줄여 주세요.',413);
      let body;try{body=Buffer.isBuffer(raw)||typeof raw==='string'?JSON.parse(String(raw)):raw;}catch{albumFail('INVALID_BODY','요청 형식을 확인해 주세요.');}
      const result=suffix==='/upload'?await store.upload(body,member.uid):await store.publish(body,member.uid);
      if(suffix==='/publish'){published=undefined;cacheAt=0;}
      return res.status(200).json({ok:true,...result});
    } catch(error) {const known=error instanceof AlbumError||['AUTH_REQUIRED','AUTH_INVALID','MEMBERSHIP_REQUIRED','MEMBERSHIP_UNAVAILABLE'].includes(error.code);return res.status(known?error.status:503).json({ok:false,code:known?error.code:'ALBUM_UNAVAILABLE',error:known?error.message:'사진첩에 연결하지 못했어요. 잠시 후 다시 확인해 주세요.'});}
  };
}
