import {CHOICES,PRESETS,DEFAULT_COMPOSITION,OPTIONAL_SECTIONS,normalizeComposition,compositionParams,readComposition,moveSection} from './js/composition.mjs';
import {CONTENT_FIELDS,createContentStore,normalizeContentDraft} from './js/content-draft.mjs';
import {mountContentEditor} from './js/content-editor.mjs';
import {readSectionTuning,setSectionTuning} from './js/fine-tuning.mjs';
import {APPEARANCE_PALETTES,APPEARANCE_FONTS} from './js/appearance.mjs';
import runtime from './runtime.mjs';
import {GLOBAL_KEYS,LABELS,SCENE_KEYS,CONTENT_GROUPS,sectionFor,scenes,settingsFor,snapshot,createHistory} from './model.mjs';
import {mountLibrary} from './library.mjs';
import {V2_PRESETS} from './recommendations.mjs';
import {experienceDefaults,normalizeExperience} from './js/experience-config.mjs';
import {mountExperienceEditor} from './experience-editor.mjs';

const $=id=>document.getElementById(id),frame=$('invitation-preview'),WORKING='sungso_studio_v2_working_design';
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const post=data=>frame.contentWindow?.postMessage(data,location.origin);
let composition=readComposition(location.search);
if(!new URLSearchParams(location.search).has('version'))try{const saved=JSON.parse(localStorage.getItem(WORKING));if(saved?.version===1)composition=normalizeComposition(saved.composition);}catch{}
let currentContent=normalizeContentDraft(),ready=false,contentLoaded=false,muting=false,selectedKey='cover',activeScene='top',orderEditing=false,pickerEnabled=true,audioPhase='paused';
let lastReviewKey='cover';
let experienceEditor;
const hiddenScenes=()=>new Set((currentContent.experience?.values?.hiddenScenes||'').split(',').filter(Boolean));
async function toggleScene(id){const e=experienceDefaults(currentContent.experience),hidden=hiddenScenes();if(hidden.has(id))hidden.delete(id);else hidden.add(id);e.values.hiddenScenes=[...hidden].join(',');await contentEditor.setDraft({...currentContent,experience:normalizeExperience(e)});renderRail();}
let serial=0,request=null,baseline=null,comparing=false,noticeTimer,contentTimer,saveTimer,lastTyping=0,lastContentSection=null,pointerDrag=null;
const history=createHistory(snapshot(composition,currentContent));
const rangeControls=[],optionStates=new Map();
let contentEditor;
export function getSnapshot(){return snapshot(composition,currentContent);}
function notify(message){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,4200);}
function stopDemo(){if(request){request.key=null;request.section=null;post({type:'invitation-studio:demo-stop',requestId:request.id});}$('stop-demo').hidden=true;}
function preview(value=getSnapshot(),{key=null,section=null,preserve=true}={}){
  if(key)lastReviewKey=key;stopDemo();request={id:++serial,key,section,snapshot:value,preserve,sent:false};
  if(!ready)return;
  post({type:'studio-v2:prepare',requestId:request.id,preserve});
  const fingerprint=JSON.stringify(value.content);
  if(preview.lastContent!==fingerprint){preview.lastContent=fingerprint;post({type:'invitation-studio:content',draft:value.content});}
  post({type:'invitation-studio:apply',composition:value.composition,requestId:request.id,previewOnly:comparing});
  $('preview-status').textContent=key?`${LABELS[key]} · 시연 준비 중`:'변경한 부분을 반영하고 있어요.';
}
function syncPicker(){post({type:'invitation-studio:picker',enabled:pickerEnabled&&!comparing,section:activeScene==='opening'?'top':activeScene});post({type:'studio-v2:editing',enabled:pickerEnabled&&!comparing});}
function exitComparison(){if(!comparing)return;comparing=false;document.body.dataset.compare='false';$('compare').setAttribute('aria-pressed','false');$('compare').textContent='기준과 비교';syncPicker();}
function updateURL(){const url=new URL(location.href);url.search=compositionParams(composition).toString();window.history.replaceState(null,'',url);const full=new URL('./preview/',location.href);full.search=url.search;$('open-preview').href=full.href;}
function record({coalesce=false}={}){history.commit(getSnapshot(),{coalesce});$('undo').disabled=!history.canUndo;$('redo').disabled=!history.canRedo;}
function persistWorking(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(WORKING,JSON.stringify({version:1,composition}));$('save-status').textContent='디자인은 이 기기에 보관됨';}catch{$('save-status').textContent='기기 저장 불가 · 파일로 보관해 주세요.';}},350);}
function apply(next,{demo=false,demoKey=selectedKey,coalesce=false,recordChange=true}={}){
  exitComparison();composition=normalizeComposition(next);if(recordChange)record({coalesce});
  if(!GLOBAL_KEYS.includes(selectedKey)&&!scenes(composition).some(s=>s.key===selectedKey)&&!['coverFocus','calendarMark','albumColumns','albumRatio'].includes(selectedKey))selectScene('invitation',{jump:false});
  updateURL();renderRail();updateSelections();updateRanges();persistWorking();
  preview(getSnapshot(),{key:demo?demoKey:null,preserve:!demo});
}
export async function loadSnapshot(value){
  await contentEditor.ready;exitComparison();stopDemo();muting=true;
  try{await contentEditor.setDraft(value.content);currentContent=contentEditor.getDraft();composition=normalizeComposition(value.composition);}finally{muting=false;}
  record();updateURL();renderRail();renderInspector();persistWorking();preview();
}
function thumb(photo=runtime.photos[0]){return new URL(photo.thumb||photo.src,new URL('./preview/',location.href)).href;}
function rowFocusToken(){const a=document.activeElement;return a?.closest('#scene-list')?{scene:a.closest('[data-scene]')?.dataset.scene,action:a.dataset.action||'select'}:null;}
function renderRail(){
  const token=rowFocusToken(),list=$('scene-list'),rail=document.querySelector('.scene-rail'),scrollTop=rail.scrollTop;list.replaceChildren();
  for(const item of scenes(composition)){
    const li=node('li','scene-row');li.dataset.scene=item.id;if(hiddenScenes().has(item.id))li.classList.add('scene-hidden');if(item.id===activeScene)li.classList.add('selected');
    const button=node('button','scene-select');button.dataset.action='select';button.setAttribute('aria-pressed',String(item.id===activeScene));button.onclick=()=>selectScene(item.id);
    if(item.id==='top'){const img=node('img','scene-thumb');img.src=thumb();img.alt='';button.append(img);}else button.append(node('span','scene-number',item.movable?String(composition.order.indexOf(item.id)+1).padStart(2,'0'):item.id==='opening'?'✎':item.id==='navigation'?'≡':'&'));
    const copy=node('span','scene-copy');copy.append(node('strong','',item.label),node('small','',CHOICES[item.key].find(c=>c.id===composition[item.key])?.label));button.append(copy);li.append(button);if(item.movable){const visible=node('button','scene-visibility',hiddenScenes().has(item.id)?'◌':'◉');visible.setAttribute('aria-label',`${item.label} ${hiddenScenes().has(item.id)?'보이기':'숨기기'}`);visible.onclick=()=>void toggleScene(item.id);li.append(visible);}
    if(orderEditing&&item.movable){
      const controls=node('div','scene-order-tools'),handle=node('button','drag-handle','⠿');handle.dataset.action='drag';handle.setAttribute('aria-label',`${item.label} 순서 드래그`);handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointerDrag={id:item.id,pointer:e.pointerId,x:e.clientX,y:e.clientY,moved:false,target:null,handle};handle.setPointerCapture(e.pointerId);});
      const position=node('select');position.dataset.action='position';position.setAttribute('aria-label',`${item.label} 위치`);composition.order.forEach((_,i)=>{const option=node('option','',`${i+1}번째 (${LABELS[SCENE_KEYS[composition.order[i]]]} 자리)`);option.value=i;position.append(option);});position.value=composition.order.indexOf(item.id);position.onchange=()=>reorder(item.id,Number(position.value));
      const up=node('button','','↑'),down=node('button','','↓');up.dataset.action='up';down.dataset.action='down';up.setAttribute('aria-label',`${item.label} 위로`);down.setAttribute('aria-label',`${item.label} 아래로`);const index=composition.order.indexOf(item.id);up.disabled=index===0;down.disabled=index===composition.order.length-1;up.onclick=()=>reorder(item.id,index-1);down.onclick=()=>reorder(item.id,index+1);controls.append(handle,position,up,down);li.append(controls);
    }
    list.append(li);if(orderEditing&&item.movable){const insert=node('button','scene-insert','＋ 여기에 장면 넣기');insert.onclick=()=>{activeScene=item.id;$('add-scene').click();};li.append(insert);}
  }
  if(token){const row=[...list.children].find(r=>r.dataset.scene===token.scene),control=row?.querySelector(`[data-action="${token.action}"]`);(control?.disabled?row.querySelector('[data-action=position]'):control)?.focus({preventScroll:true});}
  rail.scrollTop=scrollTop;
}
function reorder(id,index){apply({...composition,order:moveSection(composition.order,id,index,composition.extras)});$('order-status').textContent=`${LABELS[SCENE_KEYS[id]]} · ${index+1}번째로 이동했어요.`;}
window.addEventListener('pointermove',event=>{if(!pointerDrag||event.pointerId!==pointerDrag.pointer)return;if(Math.hypot(event.clientX-pointerDrag.x,event.clientY-pointerDrag.y)>7)pointerDrag.moved=true;if(!pointerDrag.moved)return;document.querySelectorAll('.scene-row').forEach(n=>n.classList.remove('drop-target','dragging'));document.querySelector(`[data-scene="${pointerDrag.id}"]`)?.classList.add('dragging');const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest('#scene-list [data-scene]');if(hit&&composition.order.includes(hit.dataset.scene)){pointerDrag.target=hit.dataset.scene;hit.classList.add('drop-target');}else pointerDrag.target=null;});
function finishDrag(event){if(!pointerDrag)return;const drag=pointerDrag;pointerDrag=null;document.querySelectorAll('.scene-row').forEach(n=>n.classList.remove('drop-target','dragging'));if(event.type==='pointerup'&&drag.moved&&drag.target&&drag.target!==drag.id)reorder(drag.id,composition.order.indexOf(drag.target));}
window.addEventListener('pointerup',finishDrag);window.addEventListener('pointercancel',finishDrag);window.addEventListener('keydown',e=>{if(e.key==='Escape'){finishDrag({type:'cancel'});stopDemo();if(comparing){exitComparison();preview();}}});
function selectScene(id,{jump=true,focus=false}={}){
  const scene=scenes(composition).find(s=>s.id===id);if(!scene)return;exitComparison();stopDemo();activeScene=id;selectedKey=scene.key;lastReviewKey=scene.key;renderRail();renderInspector();syncPicker();document.body.dataset.rail='closed';
  if(matchMedia('(max-width:740px)').matches)document.body.dataset.sheet='half';
  if(jump)preview(getSnapshot(),{section:id==='opening'?'top':id==='navigation'?null:id,preserve:false});
  if(focus)$('inspector-title').focus({preventScroll:true});
}
function selectGlobal(key){if(!GLOBAL_KEYS.includes(key))return;const wasComparing=comparing;exitComparison();stopDemo();selectedKey=key;lastReviewKey=key;renderInspector();document.body.dataset.rail='closed';document.body.dataset.sheet='half';$('mood-dialog').close();if(wasComparing)preview();}
function sample(key,id){
  const wrap=node('div','option-sample');wrap.setAttribute('aria-hidden','true');wrap.dataset.sampleKey=key;wrap.dataset.sampleValue=id;
  if(key==='dayPass'&&id==='receipt'){wrap.classList.add('receipt-sample');wrap.append(node('small','','A TABLE FOR TWO'),node('strong','','성우 & 소희'),node('span','','2027. 03. 06'),node('small','','목화웨딩홀 · 15F'));return wrap;}
  if(key==='album'&&id==='film'){wrap.classList.add('film-sample');for(const photo of runtime.photos.slice(0,3)){const img=node('img');img.src=thumb(photo);img.alt='';img.loading='lazy';wrap.append(img);}return wrap;}
  if(key==='wishes'&&id==='polaroid'){wrap.classList.add('print-sample');wrap.append(node('span','','A little note'),node('small','','두 사람에게, 축하의 마음'));return wrap;}
  if(key==='divider'&&id==='breath'){wrap.classList.add('breath-sample');wrap.append(node('span','','〰'),node('i','','ʚɞ'),node('span','','〰'));return wrap;}
  if(key==='palette'){wrap.classList.add('palette-sample');const p=APPEARANCE_PALETTES[id];for(const tone of [p.paper,p.soft,p.accent,p.ink]){const dot=node('i');dot.style.background=tone;wrap.append(dot);}}
  else if(key==='font'){wrap.classList.add('font-sample');wrap.style.fontFamily=id==='modern'?'Pretendard Variable':APPEARANCE_FONTS[id].body;wrap.append(node('div','','성우 & 소희'),node('small','','함께해 주셔서 고마워요. 03.06'));}
  else if(key==='motion'){wrap.classList.add('motion-sample');wrap.dataset.motion=id;wrap.append(node('i'),node('i'));}
  else if(['textSize','lineSpace','spacing','divider'].includes(key)){wrap.classList.add('font-sample');wrap.style.fontFamily='RIDIBatang';wrap.style.fontSize=key==='textSize'?({original:12,comfortable:14,large:16}[id]+'px'):'13px';wrap.style.lineHeight=id==='relaxed'?'2':'1.5';wrap.append(node('div','','우리의 새로운 시작'),node('small','','2027. 03. 06'));}
  else if(['date','calendarMark'].includes(key)){wrap.classList.add('date-sample');wrap.append(node('small','','MARCH 2027'),node('b','','06'));}
  else if(['gifting','arrival','wishes','navigation','intro','ending'].includes(key)){wrap.classList.add('words-sample');wrap.append(node('span','',{gifting:'With love',arrival:'Meet us here',wishes:'A little note',navigation:'Our day',intro:'With you',ending:'See you'}[key]),node('small','',{gifting:'성우 · 소희',arrival:'목화웨딩홀 15F',wishes:'두 사람에게',navigation:'예식 · 길찾기 · 사진',intro:'저희 두 사람, 결혼합니다.',ending:'함께해 주셔서 고마워요.'}[key]));}
  else {const img=node('img');img.src=thumb(runtime.photos[key==='album'?2:0]||runtime.photos[0]);img.alt='';img.loading='lazy';if(key==='photoTone')img.style.filter=id==='mono'?'grayscale(1)':id==='soft'?'contrast(.88) saturate(.85)':'';wrap.append(img);if(key==='album'&&['grid','masonry','contact'].includes(id)){for(const photo of runtime.photos.slice(1,4)){const image=node('img');image.src=thumb(photo);image.alt='';wrap.append(image);}wrap.classList.add('album-sample');}if(['opening','cover'].includes(key))wrap.append(node('span','','With love'));}
  return wrap;
}
function mountOptions(key){
  const box=node('section','setting-group');box.dataset.optionGroup=key;box.append(node('h3','',LABELS[key]));const grid=node('div','option-grid'),more=node('button','more-options','더 보기');let state=optionStates.get(key)||{search:'',limit:6};optionStates.set(key,state);
  let search;if(CHOICES[key].length>6){search=node('input','option-search');search.type='search';search.placeholder='표현 찾기';search.setAttribute('aria-label',`${LABELS[key]} 검색`);search.value=state.search;box.append(search);search.oninput=()=>{state.search=search.value;state.limit=6;paint();};}
  function paint(){grid.replaceChildren();const found=CHOICES[key].filter(c=>`${c.label} ${c.detail}`.includes(state.search.trim()));for(const choice of found.slice(0,state.limit)){const button=node('button','option-card');button.dataset.choice=key;button.dataset.value=choice.id;button.setAttribute('aria-pressed',String(composition[key]===choice.id));button.append(sample(key,choice.id),node('strong','',choice.label),node('small','',choice.detail));button.onclick=()=>{const topology=key==='album';apply({...composition,[key]:choice.id},{demo:!GLOBAL_KEYS.includes(key)||(key==='divider'&&choice.id==='breath'),demoKey:key});if(topology)renderInspector();};grid.append(button);}more.hidden=found.length<=state.limit;}
  more.onclick=()=>{state.limit+=6;paint();};box.append(grid,more);paint();return box;
}
function updateSelections(){document.querySelectorAll('[data-choice]').forEach(b=>b.setAttribute('aria-pressed',String(composition[b.dataset.choice]===b.dataset.value)));document.querySelectorAll('[data-global]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.global===selectedKey)));}
function range(root,{name,field,min,max,step=.05,get,set}){
  const label=node('label','range-field'),line=node('span','range-label'),number=node('input','range-number'),input=node('input');number.type='number';input.type='range';for(const el of [input,number]){el.min=min;el.max=max;el.step=step;el.setAttribute('aria-label',`${name}${el===number?' 수치':''}`);el.dataset.rangeField=field;}
  line.append(node('span','',name),number);label.append(line,input);root.append(label);let gesture=false;
  input.oninput=()=>{set(Number(input.value),gesture);gesture=true;number.value=input.value;};input.onchange=()=>{gesture=false;};
  let numberGesture=false;
  number.oninput=()=>{const v=Number(number.value);if(number.value!==''&&Number.isFinite(v)&&v>=min&&v<=max){set(v,numberGesture);numberGesture=true;}};
  number.onchange=()=>{const v=Number(number.value);if(number.value!==''&&Number.isFinite(v)&&v>=min&&v<=max)set(v,numberGesture);else notify(`${min}~${max} 사이로 입력해 주세요.`);numberGesture=false;updateRanges();};
  rangeControls.push({input,number,get});
}
function updateRanges(){rangeControls.forEach(({input,number,get})=>{input.value=get();if(document.activeElement!==number)number.value=get();});}
function renderMobileChips(){const host=$('mobile-options');host.replaceChildren();for(const choice of CHOICES[selectedKey]||[]){const b=node('button','',choice.label);b.setAttribute('aria-pressed',String(composition[selectedKey]===choice.id));b.onclick=()=>{apply({...composition,[selectedKey]:choice.id},{demo:!GLOBAL_KEYS.includes(selectedKey)});renderMobileChips();};host.append(b);}}
function renderInspector(){
  $('inspector-title').textContent=LABELS[selectedKey];$('inspector-kicker').textContent=GLOBAL_KEYS.includes(selectedKey)?'THE OVERALL MOOD':'EDIT THIS SCENE';$('inspector-subtitle').textContent=GLOBAL_KEYS.includes(selectedKey)?'지금 보는 위치에서 바로 비교해요.':'디자인부터 문구까지, 이 장면을 한곳에서.';
  const keys=selectedKey==='textSize'?['textSize','lineSpace']:selectedKey==='spacing'?['spacing','divider']:settingsFor(selectedKey,composition);
  $('design-settings').replaceChildren(...keys.map(mountOptions));$('fine-settings').replaceChildren();rangeControls.length=0;
  const fine=node('div','fine-box');
  if(GLOBAL_KEYS.includes(selectedKey)){
    if(['textSize','font','lineSpace','spacing'].includes(selectedKey)){fine.append(node('h3','','전체 세부 조절'));for(const [field,name,min,max] of [['textScale','글자 크기',.9,1.2],['lineScale','줄 간격',.9,1.4],['sectionSpace','장면 여백',.7,1.4]])range(fine,{name:`${name} (배)`,field,min,max,get:()=>composition[field],set:(v,coalesce)=>apply({...composition,[field]:v},{coalesce})});}
    if(selectedKey==='motion'){fine.append(node('h3','','움직임을 천천히 비교해요'));for(const [field,name] of [['motionSpeed','속도'],['motionStrength','강도']])range(fine,{name:`${name} (배)`,field,min:.5,max:1.5,get:()=>composition[field],set:(v,coalesce)=>apply({...composition,[field]:v},{coalesce})});fine.append(node('p','helper','선택만으로 스크롤하지 않아요. 아래 ‘효과 시연’으로 같은 구간을 비교해 보세요.'));}
  }else if(!['opening','navigation'].includes(selectedKey)){
    const section=sectionFor(selectedKey);fine.append(node('h3','','이 장면의 글자와 여백'));const label=node('label','inherit-toggle'),check=node('input');check.type='checkbox';check.checked=Boolean(readSectionTuning(composition.sectionTuning)[section]);label.append(check,node('span','','이 장면만 따로 조절'));fine.append(label);const fields=node('div');fine.append(fields);
    check.onchange=()=>{apply({...composition,sectionTuning:setSectionTuning(composition.sectionTuning,section,check.checked?{textScale:composition.textScale,lineScale:composition.lineScale,sectionSpace:composition.sectionSpace}:null)});renderInspector();};fields.hidden=!check.checked;
    for(const [field,name,min,max] of [['textScale','글자 크기',.9,1.2],['lineScale','줄 간격',.9,1.4],['sectionSpace','장면 여백',.7,1.4]])range(fields,{name:`${name} (배)`,field,min,max,get:()=>readSectionTuning(composition.sectionTuning)[section]?.[field]??composition[field],set:(v,coalesce)=>apply({...composition,sectionTuning:setSectionTuning(composition.sectionTuning,section,{[field]:v})},{coalesce})});
  }
  if(fine.children.length)$('fine-settings').append(fine);
  const groups=GLOBAL_KEYS.includes(selectedKey)?[]:CONTENT_GROUPS[sectionFor(selectedKey)]||[];
  $('content-wrap').hidden=!groups.length;
  document.querySelectorAll('[data-content-step]').forEach(group=>{group.hidden=!groups.includes(group.dataset.contentStep);group.open=!group.hidden;});
  $('scene-notes').replaceChildren();
  const notes={date:'날짜·시간은 표지와 일정 파일에 같은 예식 정보를 사용해요.',arrival:'길찾기·교통 안내는 유지돼요. 시연으로 외부 지도는 열지 않아요.',gifting:'계좌는 예시로 보여요. 실제 계좌 등록은 공동 저장 창의 사진·계좌 관리에서 할 수 있어요.',wishes:'이곳은 체험 방명록이에요. 공개 청첩장의 축하 메시지는 그대로 유지돼요.'};
  if(!GLOBAL_KEYS.includes(selectedKey)){const reset=node('button','reset-scene','이 장면의 디자인 초기화');reset.onclick=()=>{const patch=Object.fromEntries(settingsFor(selectedKey,composition).map(k=>[k,DEFAULT_COMPOSITION[k]]));apply({...composition,...patch,sectionTuning:setSectionTuning(composition.sectionTuning,sectionFor(selectedKey),null)});renderInspector();};$('scene-notes').append(reset);}
  if(notes[selectedKey])$('scene-notes').append(node('p','scene-note',notes[selectedKey]));
  experienceEditor?.render(selectedKey==='opening'?'opening':sectionFor(selectedKey));
  const optional=OPTIONAL_SECTIONS.find(s=>s.key===selectedKey);if(optional){const remove=node('button','','이 장면 빼기');remove.onclick=()=>{apply({...composition,extras:composition.extras.filter(id=>id!==optional.id)});selectScene('invitation');};$('scene-notes').append(remove);}
  const all=scenes(composition),index=all.findIndex(s=>s.id===activeScene);$('previous').disabled=index<=0;$('next').disabled=index===all.length-1;
  $('editor-content').scrollTop=0;updateSelections();updateRanges();renderMobileChips();
}
// A V2 draft never overwrites the V1 working content database.
const v2IDB=window.indexedDB?{open:(_name,version)=>window.indexedDB.open('sungso-invitation-studio-v2-content',version)}:undefined;
contentEditor=mountContentEditor({root:$('content-editor'),config:runtime,store:createContentStore(v2IDB),getComposition:()=>composition,onComposition:next=>apply(next),onChange:(draft,meta)=>{
  currentContent=draft;if(muting)return;
  if(contentLoaded){exitComparison();const now=Date.now();record({coalesce:meta?.section===lastContentSection&&now-lastTyping<650});lastTyping=now;lastContentSection=meta?.section;}
  clearTimeout(contentTimer);contentTimer=setTimeout(()=>preview(),90);
},onNavigate:()=>{},onSectionChange:()=>{}});
export const contentReady=contentEditor.ready.then(()=>{currentContent=contentEditor.getDraft();contentLoaded=true;history.reset(getSnapshot());renderInspector();preview();});
export const studioReady=contentReady;
const experienceRoot=node('section','experience-editor');$('editor-content').insertBefore(experienceRoot,$('scene-notes'));
experienceEditor=mountExperienceEditor({root:experienceRoot,getSnapshot,config:runtime,notify,onDraft:draft=>contentEditor.setDraft(draft)});
const library=mountLibrary({getSnapshot,loadSnapshot,notify});
for(const id of ['open-library','mobile-library'])$(id).onclick=()=>{stopDemo();library.open();};
for(const button of document.querySelectorAll('[data-global]'))button.onclick=()=>selectGlobal(button.dataset.global);
$('edit-order').onclick=()=>{orderEditing=!orderEditing;$('edit-order').setAttribute('aria-pressed',String(orderEditing));renderRail();};
for(const [id,direction] of [['previous',-1],['next',1]])$(id).onclick=()=>{const all=scenes(composition),index=all.findIndex(s=>s.id===activeScene);if(all[index+direction])selectScene(all[index+direction].id);};
$('replay-scene').onclick=()=>{exitComparison();preview(getSnapshot(),{key:lastReviewKey,preserve:false});};$('stop-demo').onclick=stopDemo;
$('pin-baseline').onclick=()=>{exitComparison();baseline=getSnapshot();$('compare').disabled=false;preview();notify('현재 디자인·문구·사진을 비교 기준으로 고정했어요.');};
$('compare').onclick=()=>{if(!baseline)return;comparing=!comparing;document.body.dataset.compare=String(comparing);$('compare').setAttribute('aria-pressed',String(comparing));$('compare').textContent=comparing?'현재 조합 보기':'기준과 비교';syncPicker();preview(comparing?baseline:getSnapshot());};
for(const [id,method] of [['undo','undo'],['redo','redo']])$(id).onclick=async()=>{const value=history[method]();if(!value)return;muting=true;try{await contentEditor.setDraft(value.content);currentContent=contentEditor.getDraft();}finally{muting=false;}apply(value.composition,{recordChange:false});renderInspector();$('undo').disabled=!history.canUndo;$('redo').disabled=!history.canRedo;};
$('picker').onclick=()=>{pickerEnabled=!pickerEnabled;$('picker').setAttribute('aria-pressed',String(pickerEnabled));$('picker').textContent=pickerEnabled?'편집 모드':'하객처럼 보기';syncPicker();};
$('audio-toggle').onclick=()=>post({type:'invitation-lab:control',action:'audio',enabled:!['loading','playing'].includes(audioPhase)});
document.querySelectorAll('[data-width]').forEach(b=>{if(b.tagName!=='BUTTON')return;b.onclick=()=>{document.querySelector('.preview-stage').dataset.width=b.dataset.width;document.querySelectorAll('button[data-width]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));};});
function share(){const url=new URL(location.href);url.search=compositionParams(composition).toString();$('link-value').value=url.href;$('link-dialog').showModal();$('link-value').select();}
$('share').onclick=share;
$('add-scene').onclick=()=>{stopDemo();$('extra-options').replaceChildren();for(const section of OPTIONAL_SECTIONS){const button=node('button','extra-option');const exists=composition.extras.includes(section.id);button.append(node('strong','',`${section.label}${exists?' · 사용 중':''}`),node('small','',section.detail));button.disabled=exists;button.onclick=()=>{const order=[...composition.order],after=order.indexOf(activeScene);order.splice(after<0?order.length:after+1,0,section.id);apply({...composition,extras:[...composition.extras,section.id],order});$('add-dialog').close();selectScene(section.id);};$('extra-options').append(button);}$('add-dialog').showModal();};
$('open-presets').onclick=()=>{stopDemo();$('preset-dialog').showModal();};
const presetArchive=node('details','preset-archive');presetArchive.append(node('summary','','이전 추천 조합도 보기'));
for(const preset of [...V2_PRESETS,...PRESETS]){const button=node('button','preset-option');button.dataset.preset=preset.id;button.append(node('strong','',preset.label),node('small','',preset.detail));button.onclick=()=>{apply(preset.composition);$('preset-dialog').close();selectScene('top');notify('추천 디자인을 적용했어요. 문구와 사진은 유지돼요.');};(V2_PRESETS.includes(preset)?$('presets'):presetArchive).append(button);}
$('presets').append(presetArchive);
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('import-v1-content').onclick=async()=>{if(!confirm('V1의 문구·사진을 V2 작업 초안으로 가져올까요? V1 원본은 유지되고 현재 V2 내용은 바뀝니다.'))return;const store=createContentStore(window.indexedDB);try{const result=await store.read();await loadSnapshot({...getSnapshot(),content:result.draft});notify('V1 내용을 V2로 가져왔어요. V1 원본은 그대로예요.');}catch{notify('V1 초안을 읽지 못했어요. 원본은 바꾸지 않았어요.');}finally{await store.close();}};
$('sheet-toggle').onclick=()=>{const heights=['peek','half','full'];document.body.dataset.sheet=heights[(heights.indexOf(document.body.dataset.sheet)+1)%3];};
$('mobile-mood').onclick=()=>{$('mood-dialog').showModal();};
$('mobile-presets').onclick=()=>{$('mood-dialog').close();$('preset-dialog').showModal();};
$('mobile-scenes').onclick=()=>{document.body.dataset.rail=document.body.dataset.rail==='open'?'closed':'open';document.body.dataset.sheet='peek';};
$('mobile-design').onclick=()=>{document.body.dataset.rail='closed';document.body.dataset.sheet='half';$('editor-content').scrollTop=0;};
$('mobile-content').onclick=()=>{if(!CONTENT_GROUPS[activeScene]?.length)selectScene('invitation',{jump:false});document.body.dataset.sheet='full';requestAnimationFrame(()=>$('content-wrap').scrollIntoView({block:'start'}));};
window.addEventListener('message',async event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow||!event.data)return;const d=event.data;
  if(d.type==='invitation-studio:ready'){if(ready)return;ready=d.motionReady!==false;if(!ready){$('preview-status').textContent='미리보기를 준비하지 못했어요. 페이지를 새로 열어 주세요.';return;}syncPicker();const queued=request;preview(getSnapshot(),queued?{key:queued.key,section:queued.section,preserve:queued.preserve}:{});}
  else if(d.type==='invitation-studio:applied'&&request&&d.requestId===request.id&&!request.sent){request.sent=true;if(request.preserve)post({type:'studio-v2:settle',requestId:request.id});if(request.key){post({type:'invitation-studio:demo',requestId:request.id,key:request.key});$('stop-demo').hidden=false;}else if(request.section)post({type:'invitation-studio:jump',section:request.section});$('preview-status').textContent=comparing?'고정한 기준 조합을 보고 있어요.':'현재 조합 · 변경한 내용을 반영했어요.';}
  else if(d.type==='invitation-studio:demo-state'&&d.requestId===request?.id){$('stop-demo').hidden=!['preparing','playing'].includes(d.phase);if(['cancelled','complete','static','blocked'].includes(d.phase))$('preview-status').textContent={cancelled:'직접 조작해 시연을 멈췄어요.',complete:'시연 완료 · 다른 표현도 비교해 보세요.',static:'움직임을 줄인 상태로 보여요.',blocked:'열린 창을 닫고 시연해 주세요.'}[d.phase];if(d.phase==='cancelled'){request.key=null;request.section=null;}}
  else if(d.type==='invitation-studio:select'&&pickerEnabled&&!comparing&&scenes(composition).some(s=>s.id===d.section))selectScene(d.section,{jump:false});
  else if(d.type==='invitation-lab:audio-state'&&['paused','loading','playing','blocked','error'].includes(d.phase)){audioPhase=d.phase;$('audio-toggle').setAttribute('aria-pressed',String(d.phase==='playing'));$('audio-toggle').setAttribute('aria-label',d.phase==='playing'?'음악 끄기':'음악 켜기');$('audio-toggle').textContent=d.phase==='playing'?'♫ 켜짐':'♫';if(d.phase==='blocked')notify('청첩장 오른쪽 위 음악 아이콘을 눌러 주세요.');}
  else if(d.type==='studio-v2:text'&&pickerEnabled&&!comparing){const field=CONTENT_FIELDS.find(f=>f.id===d.field);if(!field||typeof d.value!=='string'||d.value.length>field.limit)return;try{await loadSnapshot({...getSnapshot(),content:{...currentContent,text:{...currentContent.text,[field.id]:d.value}}});selectScene(field.section,{jump:false});notify('문구를 반영했어요.');}catch{notify('문구를 확인해 주세요.');}}
  else if(d.type==='studio-v2:cover-photo'&&pickerEnabled&&!comparing){selectScene('top',{jump:false});document.querySelector('[aria-label="대표 사진"]')?.focus();}
  else if(d.type==='studio-v2:photos'&&pickerEnabled&&!comparing){selectScene('gallery',{jump:false});$('content-wrap').scrollIntoView({block:'start'});}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopDemo();if(comparing){exitComparison();preview();}}});
for(const type of ['wheel','touchstart','keydown'])document.querySelector('.inspector').addEventListener(type,()=>{if(!$('stop-demo').hidden)stopDemo();},{passive:true});
window.addEventListener('pagehide',()=>{stopDemo();experienceEditor?.stop();void contentEditor.flush();});
window.addEventListener('popstate',()=>apply(readComposition(location.search)));
const compact=node('button','compact-toggle','작게 보기');compact.setAttribute('aria-pressed','false');compact.onclick=()=>{const on=document.body.dataset.compact!=='true';document.body.dataset.compact=String(on);compact.setAttribute('aria-pressed',String(on));compact.textContent=on?'크게 보기':'작게 보기';};document.querySelector('.inspector-heading').append(compact);
renderRail();renderInspector();updateURL();
post({type:'studio-v2:hello'});
