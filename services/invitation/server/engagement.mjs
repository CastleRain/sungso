import { createHash } from 'node:crypto';
import { quizKey } from '../../../shared/invitation/studio/experience-config.mjs';

const ROOT='wedding_studio/sungso_20270306', UUID=/^[a-f0-9-]{36}$/i;
export class EngagementError extends Error { constructor(message,status=400){super(message);this.status=status;this.code='INVALID_ENGAGEMENT';} }
const fail=(message,status)=>{throw new EngagementError(message,status);};
const digest=value=>createHash('sha256').update(value).digest('hex');
const empty=()=>({revision:0,counts:{},replies:{},visitors:[],daily:{date:'',count:0}});
const publicView=s=>({revision:s.revision,counts:s.counts,replies:s.replies});
/** Bounded aggregate document. No names, IP addresses or raw client identifiers are stored. */
export function createEngagementStore({db,now=Date.now}) {
  const ref=db.doc(`${ROOT}/engagement/current`);
  const current=raw=>raw?structuredClone(raw):empty();
  const active=async tx=>{const s=await tx.get(db.doc(ROOT)),data=s.data();return data?.releases?.find(r=>r.id===data.published)?.snapshot;};
  return {
    async read({manage=false}={}){const [snap,book]=await Promise.all([ref.get(),db.doc('wedding_guestbooks/sungso_20270306').get()]);const data=publicView(current(snap.data())),messages=(book.data()?.messages||[]).map(({id,name,text,createdAt})=>({id,name,text,createdAt}));const ids=new Set(messages.map(m=>m.id));data.replies=Object.fromEntries(Object.entries(data.replies).filter(([id])=>ids.has(id)));data.counts=Object.fromEntries(Object.entries(data.counts).filter(([key])=>!key.startsWith('heart:')||ids.has(key.slice(6))));return {...data,...(manage?{messages}:{})};},
    async vote(body){
      if(!body||Object.keys(body).some(k=>!['clientId','kind','key','choice'].includes(k))||!UUID.test(body.clientId||'')||!['quiz','celebrate','heart'].includes(body.kind))fail('축하 요청을 확인해 주세요.');
      return db.runTransaction(async tx=>{
        const snapshot=await active(tx),experience=snapshot?.content?.experience; if(!experience)fail('공개된 참여 기능이 없어요.',404);
        const {kind}=body;let key;
        if(kind==='quiz'){
          const enabled=new Set([...(snapshot.composition.extras||[]),...(experience.values?.personalized?Object.values(experience.editions||{}).flatMap(c=>c.extras||[]):[])]);
          if(!enabled.has('wedding-quiz')||(experience.values?.hiddenScenes||'').split(',').includes('wedding-quiz'))fail('퀴즈가 꺼져 있어요.',404);
          const q=experience.lists?.quizzes?.find(q=>quizKey(q)===body.key);
          if(!q||!['a','b'].includes(body.choice))fail('퀴즈가 바뀌었어요. 다시 열어 주세요.',409);
          key=`quiz:${body.key}`;
        } else if(kind==='celebrate') {if(!experience.values?.celebration)fail('축하 기능이 꺼져 있어요.',404);key='celebrate';}
        else {
          if(!experience.values?.reactions||!UUID.test(body.key||''))fail('메시지를 확인해 주세요.');
          const book=await tx.get(db.doc('wedding_guestbooks/sungso_20270306'));
          if(!book.data()?.messages?.some(m=>m.id===body.key))fail('메시지가 없어졌어요.',404);
          key=`heart:${body.key}`;
        }
        const snap=await tx.get(ref),s=current(snap.data()),time=now(),date=new Date(time+32400000).toISOString().slice(0,10),visitor=digest(`${body.clientId}:${key}`);
        if(s.visitors.some(v=>v.id===visitor))return publicView(s);
        if(s.visitors.length>=6000||Object.keys(s.counts).length>=400&&!s.counts[key])fail('참여 보관 한도에 도달했어요.',429);
        const day=s.daily.date===date?s.daily:{date,count:0};if(day.count>=1000)fail('오늘의 참여가 많아요. 내일 다시 들러 주세요.',429);
        const count=s.counts[key]||{a:0,b:0,total:0};if(kind==='quiz')count[body.choice]++;count.total++;
        s.counts[key]=count;s.visitors.push({id:visitor});s.daily={date,count:day.count+1};s.revision++;
        tx.set(ref,s);return publicView(s);
      });
    },
    async reply(body,member){
      if(!body||Object.keys(body).some(k=>!['id','text','expectedRevision'].includes(k))||!UUID.test(body.id||'')||typeof body.text!=='string'||[...body.text].length>300||/[\x00-\x08\x0b-\x1f]/.test(body.text)||!Number.isSafeInteger(body.expectedRevision))fail('답장 내용을 확인해 주세요.');
      return db.runTransaction(async tx=>{
        const book=await tx.get(db.doc('wedding_guestbooks/sungso_20270306'));
        if(!book.data()?.messages?.some(m=>m.id===body.id))fail('메시지가 없어졌어요.',404);
        const snap=await tx.get(ref),s=current(snap.data());if(s.revision!==body.expectedRevision)fail('새로운 반응이 도착했어요. 목록을 새로고침해 주세요.',409);
        if(body.text.trim())s.replies[body.id]={text:body.text.trim(),author:member.role==='sungwoo'?'성우':'소희',updatedAt:now()};else delete s.replies[body.id];
        s.revision++;tx.set(ref,s);return publicView(s);
      });
    },
  };
}
