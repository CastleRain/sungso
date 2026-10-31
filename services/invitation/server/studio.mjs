import { createEngagementStore, EngagementError } from './engagement.mjs';
import { createHash } from 'node:crypto';
import { normalizeComposition } from '../../../shared/invitation/studio/composition.mjs';
import { normalizeContentDraft } from '../../../shared/invitation/studio/content-draft.mjs';

export const STUDIO_PATH = '/api/invitation/studio';
export const STUDIO_BODY_LIMIT = 4 * 1024 * 1024;
const ROOT = 'wedding_studio/sungso_20270306';
const ID = /^[a-f0-9-]{36}$/i, HASH = /^[a-f0-9]{64}$/;
export const isStudioRoute = path => new RegExp(`^${STUDIO_PATH}/(?:session|manage|published|draft/[a-f0-9-]{36}|photo/[a-f0-9]{64}|media/[a-f0-9]{64}|engagement|reply|replies)$`, 'i').test(path);
export class StudioError extends Error {
  constructor(message, code = 'INVALID_STUDIO', status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = message => { throw new StudioError(message); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const initial = () => ({ schema: 1, revision: 0, drafts: [], releases: [], published: null, photoIds: [], operations: [] });
function state(raw) {
  if (raw === undefined) return initial();
  if (raw.schema !== 1 || !Number.isSafeInteger(raw.revision) || !Array.isArray(raw.drafts) || !Array.isArray(raw.releases)) throw Error('INVALID_STATE');
  return raw;
}
function string(value, max) { if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail('입력 내용을 확인해 주세요.'); return value.trim(); }
export function validateStudioSnapshot(value) {
  if (!value || Object.keys(value).some(k => !['composition', 'content'].includes(k))) fail('지원하지 않는 초안 형식이에요.');
  const composition = normalizeComposition(value.composition);
  // Only the existing visual schema is accepted; imported endpoint/auth/mode flags never survive.
  if (!value.composition || Object.keys(value.composition).some(k => !Object.hasOwn(composition, k))) fail('지원하지 않는 디자인 설정이에요.');
  let content;
  try { content = normalizeContentDraft(value.content); } catch (e) { fail(e.message); }
  if (content.photos.some(p => p.src.length > 700000)) fail('공동 저장은 사진 한 장당 700KB까지 가능해요. 사진을 다시 추가하거나 크기를 줄여 주세요.');
  if (Buffer.byteLength(JSON.stringify(content)) > 3 * 1024 * 1024) fail('공동 초안의 사진·영상·음성은 합계 3MB까지 가능해요. 파일 크기나 수를 줄여 주세요.');
  return { composition, content };
}
const view = s => ({ revision: s.revision, drafts: s.drafts, releases: s.releases.map(({ snapshot, ...r }) => r), published: s.published });

export function createStudioStore({ db, now = Date.now }) {
  const ref = db.doc(ROOT);
  const engagement = createEngagementStore({db, now});
  async function mediaSource(id) { const meta=await db.doc(`${ROOT}/media/${id}`).get(); if(!meta.exists)throw Error("MISSING_MEDIA"); const count=meta.data().parts; const chunks=await Promise.all(Array.from({length:count},(_,i)=>db.doc(`${ROOT}/media/${id}/chunks/${i}`).get())); if(chunks.some(c=>!c.exists))throw Error("MISSING_MEDIA"); return chunks.map(c=>c.data().text).join(""); }
  const getState = async () => { const doc = await ref.get(); return state(doc.exists ? doc.data() : undefined); };
  async function hydrate(snapshot) {
    const photos = await Promise.all(snapshot.content.photos.map(async p => {
      const file = await db.doc(`${ROOT}/photos/${p.file}`).get();
      if (!file.exists) throw Error('MISSING_PHOTO');
      const { file: ignored, ...meta } = p; return { ...meta, src: file.data().src };
    }));
    const experience=snapshot.content.experience;
    const hydrated=experience?{...experience,media:await Promise.all((experience.media||[]).map(async ({file,...m})=>({...m,src:await mediaSource(file)})))}:null;
    return { ...snapshot, content: { ...snapshot.content, photos, ...(hydrated?{experience:hydrated}:{}) } };
  }
  return {
    engagement,
    async read() { return view(await getState()); },
    async draft(id) {
      if (!ID.test(id)) fail('초안 주소를 확인해 주세요.');
      const s = await getState(), meta = s.drafts.find(d => d.id === id);
      if (!meta) throw new StudioError('초안을 찾을 수 없어요.', 'NOT_FOUND', 404);
      const doc = await db.doc(`${ROOT}/drafts/${id}`).get();
      const stored = doc.data();
      return { ...stored, snapshot: await hydrate(stored.snapshot) };
    },
    async published() {
      const s = await getState(), release = s.releases.find(r => r.id === s.published);
      if (!release || release.legacy) return { revision: s.revision, release: null };
      // Only the active release is public. Draft names, history and editor metadata remain private.
      const snapshot = structuredClone(release.snapshot);
      if(snapshot.content.experience){
        const e=snapshot.content.experience;
        if(e.values.contactMode==='hide'||!e.values.contactMode)delete e.lists.contacts;
        else if(e.values.contactMode==='parents')e.lists.contacts=(e.lists.contacts||[]).filter(row=>!['groom','bride'].includes(row.role));
        if(e.values.coverMedia==='photo'||!e.values.coverMedia)delete e.values.coverVideo;
        if(e.values.storyMode!=='perspective'){delete e.values.groomStory;delete e.values.brideStory;}
        if(e.values.storyMode!=='chat')delete e.lists.dialogue;
        if(!e.values.afterEnabled){delete e.values.afterText;delete e.values.afterAt;}
        if(!e.values.personalized)delete e.editions;
        const hidden=new Set((e.values.hiddenScenes||'').split(','));
        const enabled=new Set([...(snapshot.composition.extras||[]),...Object.values(e.editions||{}).flatMap(c=>c.extras||[])].filter(id=>!hidden.has(id)));
        if(hidden.has('invitation')){delete e.lists.contacts;delete e.values.voice;delete e.values.voiceText;}
        if(hidden.has('gallery'))delete e.lists.livePhotos;
        if(hidden.has('our-story')){delete e.values.groomStory;delete e.values.brideStory;delete e.lists.dialogue;}
        for(const [list,scene]of [['profiles','couple-profile'],['quizzes','wedding-quiz'],['places','busan-guide'],['playlist','playlist']])if(!enabled.has(scene))delete e.lists[list];
        if(!enabled.has('time-machine')){delete e.values.beforePhoto;delete e.values.afterPhoto;}
        if(!enabled.has('day-pass')){delete e.values.walletApple;delete e.values.walletGoogle;}
        const refs=new Set([...Object.values(e.values||{}),...Object.values(e.lists||{}).flat().flatMap(row=>Object.values(row))]);
        e.media=(e.media||[]).filter(m=>refs.has(m.id)).map(({file,id})=>({id,src:`${STUDIO_PATH}/media/${file}`}));
      }
      const experience=snapshot.content.experience;
      const photoRefs=new Set([...Object.values(experience?.values||{}),...Object.values(experience?.lists||{}).flat().flatMap(row=>Object.values(row))]);
      return { revision: s.revision, release: { id: release.id, snapshot: {
        composition: snapshot.composition,
        content: { ...snapshot.content, photos: snapshot.content.photos.filter(p => snapshot.content.albumOrder === null || snapshot.content.albumOrder.includes(p.id) || photoRefs.has(p.id)).map(({ file, ...p }) => ({ ...p, src: `${STUDIO_PATH}/photo/${file}` })) },
      } } };
    },
    async media(id) {
      if(!HASH.test(id))throw new StudioError('파일을 찾을 수 없어요.','NOT_FOUND',404);
      const published=await this.published();
      if(!published.release?.snapshot?.content?.experience?.media?.some(m=>m.src===`${STUDIO_PATH}/media/${id}`))throw new StudioError('파일을 찾을 수 없어요.','NOT_FOUND',404);
      return mediaSource(id);
    },
    async photo(id) {
      if (!HASH.test(id)) throw new StudioError('사진을 찾을 수 없어요.', 'NOT_FOUND', 404);
      const current = await this.published();
      if (!current.release?.snapshot.content.photos.some(p => p.src === `${STUDIO_PATH}/photo/${id}`)) throw new StudioError('사진을 찾을 수 없어요.', 'NOT_FOUND', 404);
      const snap = await db.doc(`${ROOT}/photos/${id}`).get();
      if (!snap.exists) throw Error('MISSING_PHOTO');
      return snap.data().src;
    },
    async change(body, member) {
      if (!body || Object.keys(body).some(k => !['action','operationId','expectedRevision','id','expectedDraftRevision','name','note','rating','snapshot'].includes(k)) || !ID.test(body.operationId || '') || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) fail('저장 요청을 확인해 주세요.');
      if (!['save','publish','restore'].includes(body.action)) fail('지원하지 않는 작업이에요.');
      if (!ID.test(body.id || '') && !(body.action === 'restore' && body.id === 'legacy')) fail('초안 주소를 확인해 주세요.');
      const snapshot = body.action === 'save' ? validateStudioSnapshot(body.snapshot) : null;
      const name = body.action === 'save' ? string(body.name, 32) : null;
      if (body.action === 'save' && (!name || !Number.isInteger(body.rating) || body.rating < 0 || body.rating > 5)) fail('초안 이름과 별점을 확인해 주세요.');
      const note = body.action === 'save' ? string(body.note, 240) : null;
      const fingerprint = hash(body);
      return db.runTransaction(async tx => {
        const doc = await tx.get(ref), old = state(doc.exists ? doc.data() : undefined);
        const retry = old.operations.find(op => op.id === body.operationId);
        if (retry) { if (retry.hash !== fingerprint) fail('같은 요청 번호에 다른 내용이 들어왔어요.'); return view(old); }
        if (old.revision !== body.expectedRevision) throw new StudioError('다른 창에서 공동 초안이 바뀌었어요. 입력은 그대로 두었으니 목록을 새로고침한 뒤 확인해 주세요.', 'CONFLICT', 409);
        const next = structuredClone(old), time = now();
        if (body.action === 'save') {
          const previous = old.drafts.find(d => d.id === body.id);
          if ((previous?.revision || 0) !== body.expectedDraftRevision) throw new StudioError('이 초안의 새 버전을 먼저 불러와 주세요. 현재 작업은 새 초안으로 저장할 수 있어요.', 'CONFLICT', 409);
          if (!previous && old.drafts.length >= 40) fail('공동 초안은 40개까지 보관할 수 있어요. 기존 초안을 선택해 수정해 주세요.');
          const stored = structuredClone(snapshot);
          stored.content.photos = snapshot.content.photos.map(({ src, ...p }) => ({ ...p, file: hash(src) }));
          const additions = stored.content.photos.filter(p => !next.photoIds.includes(p.file));
          if (next.photoIds.length + new Set(additions.map(p => p.file)).size > 200) fail('공동 사진 보관 한도에 도달했어요. 기존 사진첩 관리의 사진을 이용해 주세요.');
          snapshot.content.photos.forEach((p, i) => {
            const file = stored.content.photos[i].file;
            if (!next.photoIds.includes(file)) { tx.set(db.doc(`${ROOT}/photos/${file}`), { src: p.src }); next.photoIds.push(file); }
          });
          next.mediaIds ||= [];
          if(stored.content.experience) stored.content.experience.media=(snapshot.content.experience.media||[]).map(({src,...m})=>{
            const file=hash(src);
            if(!next.mediaIds.includes(file)){
              if(next.mediaIds.length>=80)fail('공동 영상·음성 보관 한도에 도달했어요. 기존 파일을 이용해 주세요.');
              const parts=Math.ceil(src.length/400000); tx.set(db.doc(`${ROOT}/media/${file}`),{parts});
              for(let i=0;i<parts;i++)tx.set(db.doc(`${ROOT}/media/${file}/chunks/${i}`),{text:src.slice(i*400000,(i+1)*400000)});
              next.mediaIds.push(file);
            }
            return {...m,file};
          });
          if(Buffer.byteLength(JSON.stringify(stored))>32000)fail('문구와 설정은 32KB까지 공동 저장할 수 있어요. 긴 문장을 조금 줄여 주세요.');
          const meta = { id: body.id, name, note, rating: body.rating, revision: (previous?.revision || 0) + 1, updatedAt: time, editor: member.role };
          next.drafts = [meta, ...old.drafts.filter(d => d.id !== body.id)];
          tx.set(db.doc(`${ROOT}/drafts/${body.id}`), { ...meta, snapshot: stored });
        } else {
          let snapshot, label, legacy = false;
          if (body.action === 'publish') {
            const meta = old.drafts.find(d => d.id === body.id);
            if (!meta || meta.revision !== body.expectedDraftRevision) throw new StudioError('확인한 초안이 변경되었어요. 다시 불러와 확인해 주세요.', 'CONFLICT', 409);
            const draft = await tx.get(db.doc(`${ROOT}/drafts/${body.id}`));
            snapshot = draft.data().snapshot; label = meta.name;
          } else if (body.id === 'legacy') { legacy = true; label = '기존 VER5.6'; }
          else {
            const release = old.releases.find(r => r.id === body.id);
            if (!release) throw new StudioError('복원할 공개본을 찾지 못했어요.', 'NOT_FOUND', 404);
            snapshot = release.snapshot; label = release.name; legacy = Boolean(release.legacy);
          }
          // A release owns a snapshot, never a mutable draft reference.
          const release = { id: body.operationId, name: label, createdAt: time, editor: member.role, ...(legacy ? { legacy: true } : { snapshot }) };
          next.releases = [release, ...old.releases].slice(0, 20); next.published = release.id;
        }
        next.revision++; next.operations = [{ id: body.operationId, hash: fingerprint }, ...old.operations].slice(0, 80);
        tx.set(ref, next); return view(next);
      });
    },
  };
}

export function createStudioApi({ store, authenticate }) {
  const buckets=new Map();
  const allowVote=req=>{const key=createHash('sha256').update(String(req.headers['x-forwarded-for']||'').split(',').map(s=>s.trim()).filter(Boolean).at(-1)||req.socket?.remoteAddress||'unknown').digest('hex'),time=Date.now();for(const [k,v]of buckets)if(time-v.at>600000)buckets.delete(k);const bucket=buckets.get(key)||{at:time,count:0};if(buckets.size>=2048&&!buckets.has(key)||++bucket.count>60)throw new StudioError('잠시 후 다시 참여해 주세요.','RATE_LIMIT',429);buckets.set(key,bucket);};
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
    const path = new URL(req.url, 'http://studio.invalid').pathname;
    if (!isStudioRoute(path)) return res.status(404).json({ ok: false });
    if (req.method === 'OPTIONS') return res.status(204).end();
    try {
      if (path === STUDIO_PATH + '/published' && req.method === 'GET') return res.status(200).json({ ok: true, ...await store.published() });
      if(path===STUDIO_PATH+'/engagement'&&req.method==='GET')return res.status(200).json({ok:true,...await store.engagement.read()});
      if(path.startsWith(STUDIO_PATH+'/media/')&&req.method==='GET'){
        const src=await store.media(path.split('/').pop()),[header,base64]=src.split(','),bytes=Buffer.from(base64,'base64');
        res.setHeader('Content-Type',header.slice(5,header.indexOf(';')));res.setHeader('Accept-Ranges','bytes');
        const range=req.headers.range;
        if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);let start=match?.[1]?Number(match[1]):match?.[2]?Math.max(0,bytes.length-Number(match[2])):NaN;let end=match?.[1]&&match[2]?Number(match[2]):bytes.length-1;end=Math.min(end,bytes.length-1);if(!Number.isSafeInteger(start)||start>end){res.setHeader('Content-Range',`bytes */${bytes.length}`);return res.status(416).end();}res.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`);res.setHeader('Content-Length',end-start+1);return res.status(206).end(bytes.subarray(start,end+1));}
        res.setHeader('Content-Length',bytes.length);return res.status(200).end(bytes);
      }
      if (path.startsWith(STUDIO_PATH + '/photo/') && req.method === 'GET') {
        const src = await store.photo(path.split('/').pop()), [header, bytes] = src.split(',');
        res.setHeader('Content-Type', header.slice(5, header.indexOf(';'))); return res.status(200).end(Buffer.from(bytes, 'base64'));
      }
      const publicVote=path===STUDIO_PATH+'/engagement'&&req.method==='POST';
      const member = publicVote?null:await authenticate(req);
      if(publicVote)allowVote(req);
      if (req.method === 'GET') {
        if(path.endsWith('/replies'))return res.status(200).json({ok:true,...await store.engagement.read({manage:true})});
        if (path.endsWith('/session')) return res.status(200).json({ ok: true, role: member.role });
        if (path.endsWith('/manage')) return res.status(200).json({ ok: true, ...await store.read() });
        if (path.includes('/draft/')) return res.status(200).json({ ok: true, draft: await store.draft(path.split('/').pop()) });
      }
      if (![STUDIO_PATH+'/manage',STUDIO_PATH+'/engagement',STUDIO_PATH+'/reply'].includes(path) || req.method !== 'POST') return res.status(405).json({ ok: false });
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new StudioError('요청 형식을 확인해 주세요.', 'CONTENT_TYPE', 415);
      const raw = req.rawBody ?? req.body;
      if (Buffer.byteLength(Buffer.isBuffer(raw) ? raw : typeof raw === 'string' ? raw : JSON.stringify(raw || {})) > (publicVote||path.endsWith('/reply')?4096:STUDIO_BODY_LIMIT)) throw new StudioError('요청 크기를 줄여 주세요.', 'TOO_LARGE', 413);
      let body; try { body = typeof raw === 'string' || Buffer.isBuffer(raw) ? JSON.parse(String(raw)) : raw; } catch { fail('요청 형식을 확인해 주세요.'); }
      if(publicVote)return res.status(200).json({ok:true,...await store.engagement.vote(body)});
      if(path.endsWith('/reply'))return res.status(200).json({ok:true,...await store.engagement.reply(body,member)});
      return res.status(200).json({ ok: true, ...await store.change(body, member) });
    } catch (e) {
      const known = e instanceof StudioError || e instanceof EngagementError || ['AUTH_REQUIRED','AUTH_INVALID','MEMBERSHIP_REQUIRED','MEMBERSHIP_UNAVAILABLE'].includes(e.code);
      return res.status(known ? e.status : 503).json({ ok: false, code: known ? e.code : 'STUDIO_UNAVAILABLE', error: known ? e.message : '공동 보관함에 연결하지 못했어요. 현재 작업은 그대로예요.' });
    }
  };
}
