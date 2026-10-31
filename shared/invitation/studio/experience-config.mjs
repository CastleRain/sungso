import {normalizeComposition,ORDER_SECTIONS} from './composition.mjs';

// Additive content contract. Personal text/media never enters composition URLs.
export const EXPERIENCE_VERSION = 1;
export const MEDIA_LIMIT = 1800000;
export const MEDIA_TOTAL = 2400000;
const field=(id,label,group,type='text',extra={})=>({id,label,group,type,...extra});
export const EXPERIENCE_FIELDS = [
  field('hiddenScenes','숨긴 장면','internal'),
  field('coverMedia','표지 사진·영상','top','select',{options:['photo','loop','hold'],labels:['정지 사진','무음 영상 반복','길게 눌러 라이브 포토']}),
  field('coverVideo','표지 영상','top','media',{accept:'video'}),
  field('coverPhoto','대표 사진','top','photo'),field('coverX','가로 초점 (%)','top','number',{min:0,max:100,default:50}),field('coverY','세로 초점 (%)','top','number',{min:0,max:100,default:50}),
  field('opening','추가 오프닝','opening','select',{options:['none','wax','scratch'],labels:['기존 손글씨만','실링 봉투 열기','문질러 드러내기']}),
  field('bridge','사진첩 앞 연결','gallery','select',{options:['none','wax','walk','sequence'],labels:['기존 연결 유지','실링이 열리는 순간','마주 걷는 두 사람','사진 프레임 시퀀스']}),
  field('audioStyle','음악 버튼 디자인','top','select',{options:['minimal','vinyl','cassette'],labels:['작은 음악 버튼','돌아가는 LP','카세트 플레이어']}),
  field('voice','두 사람의 음성 인사','invitation','media',{accept:'audio'}),field('voiceText','음성 인사 자막','invitation','textarea'),
  ...['groom','bride'].flatMap((side,i)=>[
    field(side+'Relation',i?'신부 호칭':'신랑 호칭','invitation','select',{options:i?['딸','장녀','차녀','외동딸']:['아들','장남','차남','외동아들']}),
    ...['Father','Mother'].map((parent,j)=>field(side+parent+'Late',`${i?'신부':'신랑'} ${j?'어머니':'아버지'} 고인 표기`,'invitation','checkbox')),
  ]),
  field('contactMode','연락처 공개','invitation','select',{options:['hide','all','parents'],labels:['숨김','등록한 연락처','부모님 연락처만']}),
  field('storyMode','두 사람의 시선','our-story','select',{options:['original','perspective','chat'],labels:['기존 이야기','시점 전환','함께 나눈 대화']}),
  field('groomStory','성우의 기억','our-story','textarea'),field('brideStory','소희의 기억','our-story','textarea'),
  field('weddingDate','예식 날짜 (미입력 시 기존)','wedding-day','date'),field('weddingTime','예식 시각','wedding-day','time'),
  field('dayMode','예식 당일 안내 배너','wedding-day','checkbox'),field('weather','예식 7일 전 날씨 안내','wedding-day','checkbox'),
  field('venue','예식장 이름 (미입력 시 기존)','location'),field('room','홀·층','location'),field('address','도로명 주소','location'),field('venuePhone','예식장 전화','location','tel'),
  field('parking','주차 안내','location','textarea'),field('dining','식사 안내','location','textarea'),field('bus','시내버스 안내','location','textarea'),field('ktx','KTX 안내','location','textarea'),field('airport','공항 안내','location','textarea'),
  field('flowers','화환 정중히 사양 안내','guest-guide','checkbox'),field('charter','전세버스 안내','guest-guide','textarea'),field('reception','피로연 안내','guest-guide','textarea'),
  field('passStyle','당일 초대권','day-pass','select',{options:['original','receipt','train'],labels:['고른 디자인 유지','카페 영수증','부산행 기차표']}),
  field('walletApple','이미 발급한 Apple Wallet 패스 주소','day-pass','url',{kind:'wallet'}),field('walletGoogle','이미 발급한 Google Wallet 패스 주소','day-pass','url',{kind:'googleWallet'}),
  field('messageStyle','축하 편지 확장','guestbook','select',{options:['original','stamp','rolling'],labels:['고른 디자인 유지','색과 스탬프 고르기','함께 쓰는 롤링페이퍼']}),
  field('reactions','축하 메시지 공감 버튼','guestbook','checkbox'),field('celebration','꽃잎으로 축하하기','closing','checkbox'),
  field('readable','하객용 읽기 편한 모드 버튼','top','checkbox'),field('personalized','이름별 초대 링크 허용','top','checkbox'),
  field('afterEnabled','예식 후 감사장으로 전환','closing','checkbox'),field('afterAt','감사장 전환 시각 (한국 시간)','closing','datetime-local'),field('afterText','예식 후 감사 인사','closing','textarea'),
  field('kakaoKey','카카오 JavaScript 앱 키 (공개 키)','closing','key'),field('shareImage','공유 카드 이미지 HTTPS 주소','closing','url',{kind:'image'}),
  field('beforePhoto','어릴 적 사진','time-machine','photo'),field('afterPhoto','지금의 사진','time-machine','photo'),
];
export const EXPERIENCE_LISTS = {
  contacts:{label:'연락처',group:'invitation',max:6,fields:[field('role','구분','','select',{options:['groom','bride','groomFather','groomMother','brideFather','brideMother'],labels:['신랑','신부','신랑 아버지','신랑 어머니','신부 아버지','신부 어머니']}),field('name','표시 이름',''),field('phone','전화번호','','tel')]},
  dialogue:{label:'실제로 나눈 대화',group:'our-story',max:8,fields:[field('side','말한 사람','','select',{options:['groom','bride'],labels:['성우','소희']}),field('text','내용','','textarea')]},
  profiles:{label:'두 사람 소개·인터뷰',group:'couple-profile',max:6,fields:[field('side','주인공','','select',{options:['groom','bride'],labels:['성우','소희']}),field('question','질문',''),field('answer','답변','','textarea'),field('photo','사진','','photo')]},
  quizzes:{label:'우리의 작은 퀴즈',group:'wedding-quiz',max:3,fields:[field('question','질문',''),field('a','A 보기',''),field('b','B 보기',''),field('answer','정답','','select',{options:['a','b','balance'],labels:['A','B','정답 없는 밸런스']}),field('story','답을 고른 뒤 보여줄 이야기','','textarea'),field('photo','공개할 사진','','photo')]},
  places:{label:'두 사람이 추천하는 부산',group:'busan-guide',max:6,fields:[field('name','장소 이름',''),field('description','추천 이유','','textarea'),field('url','지도 HTTPS 링크','','url',{kind:'map'})]},
  timeline:{label:'당일 시간표',group:'wedding-day',max:8,fields:[field('time','시각','','time'),field('title','일정',''),field('detail','안내','','textarea')]},
  floors:{label:'층별 안내',group:'location',max:6,fields:[field('floor','층',''),field('name','시설',''),field('detail','안내','')]},
  playlist:{label:'우리의 플레이리스트',group:'playlist',max:6,fields:[field('title','곡 이름',''),field('artist','아티스트',''),field('audio','직접 준비한 15초 미리듣기','','media',{accept:'audio'}),field('url','공식 스트리밍 링크','','url',{kind:'music'}),field('photo','앨범 이미지','','photo')]},
  livePhotos:{label:'길게 누르는 사진',group:'gallery',max:6,fields:[field('photo','사진','','photo'),field('video','라이브 영상','','media',{accept:'video'})]},
};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const safeId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v);
const hostGroups={map:['map.naver.com','naver.me','place.map.kakao.com','map.kakao.com','maps.app.goo.gl','www.google.com'],music:['www.youtube.com','youtu.be','music.youtube.com','open.spotify.com','music.apple.com','www.melon.com','music.bugs.co.kr'],googleWallet:['pay.google.com'],wallet:[],image:[]};
export function safeExperienceURL(value,kind='image') {
  if(!value)return '';let url;try{url=new URL(value);}catch{throw Error('HTTPS 주소를 입력해 주세요.');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.href.length>1500||/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/i.test(url.hostname))throw Error('공개 HTTPS 주소만 사용할 수 있어요.');
  if(hostGroups[kind]?.length&&!hostGroups[kind].includes(url.hostname))throw Error('지원하는 공식 서비스 주소를 사용해 주세요.');
  if(kind==='wallet'&&!url.pathname.endsWith('.pkpass'))throw Error('발급된 .pkpass 주소를 입력해 주세요.');
  return url.href;
}
function normalizeField(value,f) {
  if(f.type==='checkbox')return value===true;
  if(f.type==='number'){const n=Number(value??f.default);if(!Number.isFinite(n)||n<f.min||n>f.max)throw Error(f.label+' 범위를 확인해 주세요.');return n;}
  if(f.type==='select'){if(value===undefined||value==='')return f.options[0];if(!f.options.includes(value))throw Error(f.label+' 선택을 확인해 주세요.');return value;}
  if(typeof value!=='string'&&value!==undefined)throw Error(f.label+' 형식을 확인해 주세요.');
  const text=(value||'').trim().replace(/\r\n?/g,'\n');
  if(text.length>(f.type==='textarea'?1500:1500)||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))throw Error(f.label+' 내용을 줄여 주세요.');
  if(!text)return '';
  if(f.id==='hiddenScenes')return [...new Set(text.split(','))].filter(id=>ORDER_SECTIONS.some(s=>s.id===id)).join(',');
  if(f.type==='url')return safeExperienceURL(text,f.kind);
  if(f.type==='key'&&!/^[a-f0-9]{32}$/i.test(text))throw Error('카카오 JavaScript 키를 확인해 주세요.');
  if(['photo','media'].includes(f.type)&&!safeId(text))throw Error('등록한 자료를 선택해 주세요.');
  if(f.type==='tel'&&!/^\+?[\d ()-]{7,24}$/.test(text))throw Error('전화번호를 확인해 주세요.');
  if(f.type==='time'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(text))throw Error('시각을 확인해 주세요.');
  if(['date','datetime-local'].includes(f.type)){
    const pattern=f.type==='date'?/^\d{4}-\d{2}-\d{2}$/:/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
    const date=text.slice(0,10),d=new Date(date+'T00:00:00Z');
    if(!pattern.test(text)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)throw Error('날짜를 확인해 주세요.');
  }
  return text;
}
export function validateMedia(src) {
  if(typeof src!=='string'||src.length>MEDIA_LIMIT)throw Error('영상·음성 한 개는 약 1.3MB 이하로 준비해 주세요.');
  const m=/^data:(video\/mp4|video\/webm|audio\/mpeg|audio\/mp4|audio\/webm|audio\/ogg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
  if(!m||m[2].length%4)throw Error('MP4·WebM 영상 또는 MP3·M4A·WebM·Ogg 음성을 선택해 주세요.');
  const b=atob(m[2].slice(0,64)),n=i=>b.charCodeAt(i);
  const ok=m[1].endsWith('mp4')?b.slice(4,8)==='ftyp':m[1].endsWith('webm')?n(0)===0x1a&&n(1)===0x45&&n(2)===0xdf&&n(3)===0xa3:m[1].endsWith('ogg')?b.startsWith('OggS'):b.startsWith('ID3')||n(0)===255&&(n(1)&224)===224;
  if(!ok)throw Error('파일 형식과 내용이 맞지 않아요.');return src;
}
export function normalizeExperience(value) {
  if(value===undefined)return undefined;
  if(!plain(value)||value.version!==1)throw Error('확장 기능 형식을 확인해 주세요.');
  const values={};if(value.values!==undefined&&!plain(value.values))throw Error('확장 설정 형식이 올바르지 않아요.');
  for(const f of EXPERIENCE_FIELDS)if(Object.hasOwn(value.values||{},f.id))values[f.id]=normalizeField(value.values[f.id],f);
  const lists={};if(value.lists!==undefined&&!plain(value.lists))throw Error('추가 안내 목록을 확인해 주세요.');
  for(const [key,spec]of Object.entries(EXPERIENCE_LISTS)){if(value.lists?.[key]===undefined)continue;const rows=value.lists[key];if(!Array.isArray(rows)||rows.length>spec.max)throw Error(`${spec.label}는 ${spec.max}개까지 가능해요.`);lists[key]=rows.map(row=>{if(!plain(row))throw Error('목록 형식이 올바르지 않아요.');return Object.fromEntries(spec.fields.map(f=>[f.id,normalizeField(row[f.id],f)]));});}
  const media=(value.media||[]);if(!Array.isArray(media)||media.length>8)throw Error('영상·음성은 8개까지 등록할 수 있어요.');
  const files=media.map(file=>{if(!plain(file)||!safeId(file.id)||!file.id.startsWith('media_'))throw Error('미디어 정보를 확인해 주세요.');return {id:file.id,name:String(file.name||'미디어').slice(0,80),src:validateMedia(file.src)};});
  if(new Set(files.map(f=>f.id)).size!==files.length||files.reduce((s,f)=>s+f.src.length,0)>MEDIA_TOTAL)throw Error('영상·음성 합계는 약 1.8MB까지 준비할 수 있어요.');
  const editions={};for(const key of ['parents','friends'])if(value.editions?.[key])editions[key]=normalizeComposition(value.editions[key]);
  return {version:1,values,lists,media:files,editions};
}
export function experienceDefaults(value){const e=normalizeExperience(value)||{version:1,values:{},lists:{},media:[],editions:{}};return {...e,values:{...Object.fromEntries(EXPERIENCE_FIELDS.map(f=>[f.id,normalizeField(undefined,f)])),...e.values}};}
export function effectiveWedding(wedding,experience){const v=experience?.values||{};const startsAt=`${v.weddingDate||wedding.startsAt.slice(0,10)}T${v.weddingTime||wedding.startsAt.slice(11,16)}:00+09:00`;const duration=Date.parse(wedding.endsAt)-Date.parse(wedding.startsAt);return {...wedding,...Object.fromEntries(['venue','room','address'].filter(k=>v[k]).map(k=>[k,v[k]])),...(v.venuePhone?{phone:v.venuePhone}:{}),...((v.weddingDate||v.weddingTime)?{startsAt,...(Number.isFinite(duration)&&duration>0?{endsAt:new Date(Date.parse(startsAt)+duration).toISOString()}:{})}:{})};}
export function personalizedLink(base,{name='',edition='standard'}={}){const url=new URL(base);url.search='';url.hash='';if(name.trim())url.searchParams.set('to',name.trim().slice(0,40));if(['parents','friends'].includes(edition))url.searchParams.set('for',edition);return url.href;}
export function quizKey(question){let h=2166136261;for(const char of JSON.stringify([question.question,question.a,question.b])){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
