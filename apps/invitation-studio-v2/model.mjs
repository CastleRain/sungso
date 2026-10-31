import { normalizeComposition, ORDER_SECTIONS, OPTIONAL_SECTIONS, CHOICE_KEYS, DEFAULT_COMPOSITION } from './js/composition.mjs';
import { normalizeContentDraft } from './js/content-draft.mjs';

export const GLOBAL_KEYS = ['palette','font','textSize','lineSpace','photoTone','motion','spacing','divider'];
export const LABELS = {palette:'색감',font:'글씨체',textSize:'글자 크기',lineSpace:'줄 간격',photoTone:'사진 톤',motion:'공통 스크롤',spacing:'여백',divider:'장면 연결',cover:'첫 화면',opening:'첫 손글씨',intro:'초대글 · 가족',date:'예식 날짜',story:'우리의 이야기',album:'사진첩',arrival:'오시는 길',gifting:'마음 전하실 곳',wishes:'축하의 편지',navigation:'빠른 메뉴',ending:'마지막 인사',coverFocus:'표지 구도',calendarMark:'날짜 강조',albumColumns:'사진첩 열 수',albumRatio:'사진 비율',...Object.fromEntries(OPTIONAL_SECTIONS.map(s=>[s.key,s.label]))};
export const SCENE_KEYS = {top:'cover',invitation:'intro','wedding-day':'date',location:'arrival','our-story':'story',gallery:'album',accounts:'gifting',guestbook:'wishes',closing:'ending',navigation:'navigation',...Object.fromEntries(OPTIONAL_SECTIONS.map(s=>[s.id,s.key]))};
export const CONTENT_GROUPS = {top:['family'],invitation:['family','invitation'],'our-story':['story1','story2','story3'],gallery:['photos'],closing:['closing']};
export const sectionFor = key => key==='opening'||key==='coverFocus'?'top':key==='calendarMark'?'wedding-day':['albumColumns','albumRatio'].includes(key)?'gallery':Object.keys(SCENE_KEYS).find(id=>SCENE_KEYS[id]===key)||null;
export function scenes(value) {
  const c=normalizeComposition(value);
  return [{id:'top',key:'cover',label:'첫 화면'},{id:'opening',key:'opening',label:'첫 손글씨'},...c.order.map(id=>({id,key:SCENE_KEYS[id],label:ORDER_SECTIONS.find(s=>s.id===id).label,movable:true,optional:OPTIONAL_SECTIONS.some(s=>s.id===id)})),{id:'closing',key:'ending',label:'마지막 인사'},{id:'navigation',key:'navigation',label:'빠른 메뉴'}];
}
export function sceneVisibility(composition, content) {
  const hidden=new Set((content?.experience?.values?.hiddenScenes||'').split(','));
  const all=scenes(composition);
  return {visible:all.filter(s=>!s.movable||!hidden.has(s.id)),removed:all.filter(s=>s.movable&&hidden.has(s.id))};
}
export function settingsFor(key,c) {
  if(key==='cover')return ['cover','coverFocus'];
  if(key==='date')return ['date','calendarMark'];
  if(key==='album')return ['album',...(['grid','masonry'].includes(c.album)?['albumColumns','albumRatio']:[])];
  return CHOICE_KEYS.includes(key)?[key]:[];
}
export function snapshot(composition=DEFAULT_COMPOSITION,content={}) {return {composition:normalizeComposition(composition),content:normalizeContentDraft(content)};}
export function validateSnapshot(value) {
  if(!value||typeof value!=='object'||[value.version,value.composition?.version].some(version=>version!==undefined&&String(version)!=='1'))throw Error('지원하지 않는 조합 버전이에요. 원본 파일은 그대로 두었어요.');
  return snapshot(value.composition,value.content);
}
export function createHistory(initial,limit=30) {
  let current=snapshot(initial.composition,initial.content),past=[],future=[];
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  return {
    get current(){return structuredClone(current);},get canUndo(){return past.length>0;},get canRedo(){return future.length>0;},
    commit(next,{coalesce=false}={}){next=snapshot(next.composition,next.content);if(equal(current,next))return false;if(!coalesce){past.push(current);if(past.length>limit)past.shift();}current=next;future=[];return true;},
    undo(){if(!past.length)return null;future.push(current);current=past.pop();return this.current;},
    redo(){if(!future.length)return null;past.push(current);current=future.pop();return this.current;},
    reset(next){current=snapshot(next.composition,next.content);past=[];future=[];}
  };
}
