import { emptyDay, validateDay, dateInKorea, koreanDateTime, timeFromKorea, validDate } from '../../../shared/journey/core.mjs';
import { createJourneyMap } from './world-map.mjs?v=3.1.0';
import { createJourneyPlayback } from './playback.mjs?v=3.0.0';
import { prepareJourneyPhoto } from './photo.mjs';

const names={sungwoo:'성우',sohee:'소희',together:'함께'};
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const today=()=>dateInKorea(Date.now());
const dayFormatter=new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short',timeZone:'Asia/Seoul'});
const dayLabel=date=>dayFormatter.format(new Date(date+'T12:00:00+09:00'));
const setText=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
const monthLabel=month=>`${Number(month.slice(0,4))}년 ${Number(month.slice(5))}월`;
const elapsedLabel=seconds=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const abortError=()=>Object.assign(new Error('불러오기를 취소했어요.'),{name:'AbortError'});

export function mountJourney({root,request,member,mapFactory=createJourneyMap,preparePhoto=prepareJourneyPhoto,workerFactory=url=>new Worker(url,{type:'module'}),playbackWorkerFactory=url=>new Worker(url,{type:'module'}),storyProcessor,playbackFactory=createJourneyPlayback}){
  const $=id=>root.querySelector('#'+id),life=new AbortController(),urls=new Map(),photoViewImage=$('fullPhoto'),photoViewStatus=$('photoViewStatus'),mapWrap=root.querySelector('.map-wrap');
  let disposed=false,date=today(),month=date.slice(0,7),day=emptyDay(date),days=[],months=[],person='all',daySeq=0,monthSeq=0,photoSeq=0,navigationTouched=false,dateNavSeq=0,dateNavPending=false;
  let editing=null,preparedPhoto=null,photoUploaded=false,formSaving=false,importing=false,importResult=null,importDone=new Set(),worker=null,recordLimit=18,returnFocus=null,photoInputSeq=0,importSeq=0,recordId=null,mapReady=false,photoInvalid=false,conflictBase=null,photoViewSeq=0,photoViewUrl=null,formSaveSeq=0,measureFrame=0;
  let bounds={from:'',to:''},period={kind:'all',from:'',to:''},draftPerson='all',playbackState={},loading=false,storyFailed=false,storySeq=0,storyAbort=null,storyWorker=null,jobId=0,retryContext=null,detailRoute=false,picking=false,lastListKey=null,lastActive=-1,photoReturnFocus=null,lastScenes=null,lastTickScenes=null,lastTickWidth=0,cameraMode='follow';
  const rawDays=new Map(),dayInflight=new Map(),jobs=new Map(),dayQueue=[];let activeDayRequests=0;
  const on=(target,type,fn)=>target.addEventListener(type,fn,{signal:life.signal});
  const message=(value,error=false)=>{if(disposed)return;$('globalError').hidden=!error;$('globalError').textContent=error?value:'';$('saveState').textContent=error?'기록을 불러오지 못했어요':value;$('statusPanel').classList.toggle('important',error||loading);$('statusPanel').classList.toggle('quiet',!error&&!loading&&!!playbackState.scenes?.length);};
  function showDialog(id){returnFocus=document.activeElement;$(id).showModal();}
  function closeDialog(id){if(formSaving||importing)return;$(id).close();returnFocus?.focus?.();}
  function clearPhotoViewer(){photoViewSeq++;if(photoViewUrl){URL.revokeObjectURL(photoViewUrl);photoViewUrl=null;}photoViewImage?.removeAttribute('src');if(photoViewImage)photoViewImage.hidden=true;if(photoViewStatus)photoViewStatus.textContent='';}
  function closePhotoViewer(restoreFocus=true){clearPhotoViewer();if($('photoDialog')?.open)$('photoDialog').close();if(restoreFocus){if($('recordDialog')?.open)$('viewPhoto')?.focus();else if(photoReturnFocus?.isConnected)photoReturnFocus.focus();}photoReturnFocus=null;}
  function updatePhotoViewButton(){$('viewPhoto').hidden=photoInvalid||!(preparedPhoto||editing?.record.photoId);}
  async function openPhotoViewer(record=null){
    const photo=record?null:preparedPhoto,id=record?.photoId||editing?.record.photoId;if(disposed||formSaving||(!record&&photoInvalid)||(!photo&&!id))return;
    playback.pause();photoReturnFocus=document.activeElement;clearPhotoViewer();const seq=photoViewSeq;$('fullPhoto').alt=record?.title||$('recordTitle').value.trim()||'이날의 사진';$('photoViewStatus').textContent='사진을 크게 불러오는 중…';$('photoDialog').showModal();
    try{let url=photo?.full;if(!url){const blob=await request('/photos/'+id+'?size=full',{blob:true});if(disposed||seq!==photoViewSeq||!$('photoDialog').open)return;url=URL.createObjectURL(blob);photoViewUrl=url;}
      if(disposed||seq!==photoViewSeq)return;$('fullPhoto').src=url;$('fullPhoto').hidden=false;$('photoViewStatus').textContent='';
    }catch(error){if(!disposed&&seq===photoViewSeq)$('photoViewStatus').textContent=error.message||'사진을 불러오지 못했어요. 닫은 뒤 다시 시도해주세요.';}
  }
  on($('viewPhoto'),'click',()=>void openPhotoViewer());on($('closePhotoView'),'click',()=>closePhotoViewer());on($('photoDialog'),'cancel',event=>{event.preventDefault();closePhotoViewer();});
  function cacheDay(value){rawDays.delete(value.date);rawDays.set(value.date,value);while(rawDays.size>6)rawDays.delete(rawDays.keys().next().value);return value;}
  function drainDayQueue(){while(activeDayRequests<2&&dayQueue.length){const item=dayQueue.shift();item.signal?.removeEventListener('abort',item.abort);if(disposed||item.signal?.aborted){item.reject(abortError());continue;}activeDayRequests++;Promise.resolve().then(()=>request('/days/'+item.date,{signal:item.signal})).then(item.resolve,item.reject).finally(()=>{activeDayRequests--;drainDayQueue();});}}
  function requestDay(value,signal){return new Promise((resolve,reject)=>{const item={date:value,signal,resolve,reject,abort:null};item.abort=()=>{const index=dayQueue.indexOf(item);if(index>=0){dayQueue.splice(index,1);reject(abortError());}};signal?.addEventListener('abort',item.abort,{once:true});dayQueue.push(item);drainDayQueue();});}
  async function getDay(value,{signal,revision,fresh=false}={}){
    if(signal?.aborted||disposed)throw abortError();const cached=rawDays.get(value);if(!fresh&&cached&&(revision===undefined||cached.revision===revision))return cacheDay(cached);
    const key=value+':'+(revision??'latest');if(!fresh&&dayInflight.has(key))return dayInflight.get(key);
    const pending=requestDay(value,signal).then(result=>{if(signal?.aborted||disposed)throw abortError();return cacheDay(validateDay(result.day));}).finally(()=>{if(dayInflight.get(key)===pending)dayInflight.delete(key);});dayInflight.set(key,pending);return pending;
  }
  function stopStoryWorker(){storyWorker?.terminate();storyWorker=null;for(const job of jobs.values())job.reject(abortError());jobs.clear();}
  function storyTask(type,payload){
    if(storyProcessor)return Promise.resolve().then(()=>storyProcessor(type,payload));
    if(!storyWorker){const active=playbackWorkerFactory(new URL('./playback-worker.mjs?v=3.0.0',import.meta.url));storyWorker=active;active.onmessage=({data})=>{if(disposed||storyWorker!==active)return;const job=jobs.get(data.requestId);if(!job)return;jobs.delete(data.requestId);data.ok?job.resolve(data.result):job.reject(Object.assign(Error(data.error||'기록을 정리하지 못했어요.'),{code:data.code}));};active.onerror=()=>{if(storyWorker!==active)return;for(const job of jobs.values())job.reject(Error('기록을 정리하지 못했어요. 다시 불러와주세요.'));jobs.clear();active.terminate();storyWorker=null;};}
    return new Promise((resolve,reject)=>{const requestId=++jobId;jobs.set(requestId,{resolve,reject});storyWorker.postMessage({requestId,type,...payload});});
  }
  function cancelStoryLoad(){storySeq++;storyAbort?.abort();storyAbort=null;stopStoryWorker();dayInflight.clear();}
  function renderDurations(){const values=playbackState.mode==='slow'?[180,300,600]:[30,60,120];const key=values.join(',');if($('durationChoices').dataset.key!==key){$('durationChoices').dataset.key=key;$('durationChoices').replaceChildren(...values.map(value=>{const button=el('button','',value<60?`${value}초`:`${value/60}분`);button.type='button';button.dataset.duration=String(value);on(button,'click',()=>playback.setDuration(value));return button;}));}for(const button of $('durationChoices').children)button.setAttribute('aria-pressed',String(Number(button.dataset.duration)===playbackState.duration));}
  function renderStoryList(scenes){
    if(lastScenes===scenes)return;lastScenes=scenes;
    const key=scenes.map(scene=>scene.id+':'+scene.revision+':'+scene.title+':'+(scene.people||[scene.person]).join(',')).join('|');if(key===lastListKey)return;lastListKey=key;lastActive=-1;$('storyList').replaceChildren();$('storyEmpty').hidden=!!scenes.length;
    const owners=new Set(scenes.flatMap(scene=>scene.people||[scene.person]));$('motionLegend').replaceChildren(...Object.keys(names).filter(owner=>owners.has(owner)).map(owner=>{const item=el('span','motion-person');item.dataset.owner=owner;item.append(el('i','person-dot'),document.createTextNode(names[owner]));return item;}));
    for(const [index,scene]of scenes.entries()){const button=el('button','story-item');button.type='button';button.dataset.scene=scene.id;button.dataset.index=String(index);button.append(el('span','story-dot '+scene.person),el('time','',scene.date.replaceAll('-','.')),el('strong','',scene.segments?.length?'이날의 이동':scene.title||'이날의 기억'),el('small','',(scene.people||[scene.person]).map(value=>names[value]).filter(Boolean).join(' · ')||'우리'));on(button,'click',()=>{closeDetails(false);playback.seekScene(scene.id);if(window.innerWidth<=1023)setStoryPanel(false);});$('storyList').append(button);}
  }
  function renderPlaybackTicks(scenes){
    const width=Math.max(1,Math.round($('playTicks').clientWidth||window.innerWidth-64));
    if(lastTickScenes===scenes&&lastTickWidth===width)return;lastTickScenes=scenes;lastTickWidth=width;
    if(!scenes.length){$('playTicks').replaceChildren();return;}
    const spacing=window.innerWidth<=720?55:70,first=scenes[0].date.slice(0,7),last=scenes.at(-1).date.slice(0,7);
    const selected=[{position:0,value:first,edge:'first'}];
    if(last!==first)selected.push({position:1,value:last,edge:'last'});
    const candidates=[];
    for(let index=1;index<scenes.length;index++){
      const value=scenes[index].date.slice(0,7),previous=scenes[index-1].date.slice(0,7);
      if(value===previous||value===first||value===last)continue;
      const position=playbackState.sceneStarts?.[index]??index/scenes.length;
      candidates.push({position:Math.max(0,Math.min(1,position)),value,yearChange:value.slice(0,4)!==previous.slice(0,4)});
    }
    const separated=(a,b)=>Math.abs(a.position-b.position)*width>=spacing*(a.edge||b.edge?1.5:1);
    while(candidates.length&&selected.length<(width<600?4:8)){
      let best=-1,score=-1;
      for(let index=0;index<candidates.length;index++){
        const item=candidates[index];if(selected.some(existing=>existing.value===item.value||!separated(item,existing)))continue;
        const distance=Math.min(...selected.map(existing=>Math.abs(existing.position-item.position)))*(item.yearChange?1.25:1);
        if(distance>score){score=distance;best=index;}
      }
      if(best===-1)break;selected.push(candidates.splice(best,1)[0]);
    }
    $('playTicks').replaceChildren(...selected.sort((a,b)=>a.position-b.position).map(({position,value})=>{const item=el('span','',value.replace('-','.'));item.style.left=`${position*100}%`;return item;}));
  }
  function showPlayback(state){
    if(disposed)return;playbackState=state||playbackState;const available=mapReady&&!loading&&!storyFailed&&!!playbackState.available,playing=available&&!!playbackState.playing,scenes=playbackState.scenes||[];
    const overview=playbackState.mode==='fast';root.dataset.playbackMode=playbackState.mode;
    $('motionDate').hidden=!mapReady||loading||storyFailed||!playbackState.date||detailRoute||picking;
    $('motionYear').textContent=playbackState.date?.slice(0,4)||'';
    setText($('motionDay'),playbackState.date?playbackState.date.slice(5).replace('-','.'): '');
    $('motionDate').setAttribute('aria-label',playbackState.date?dayLabel(playbackState.date):'재생 날짜');
    setText($('motionClock'),Number.isFinite(playbackState.time)?koreanDateTime(playbackState.time).slice(11,16)+' · 한국 시간':'');
    $('motionClock').hidden=overview||!Number.isFinite(playbackState.time);
    $('motionLegend').hidden=$('motionDate').hidden;
    $('followMotion').disabled=!scenes.length||loading||!mapReady;
    setText($('followMotion'),overview?'이동 보기':'따라가기');$('followMotion').setAttribute('aria-label',overview?'전체 이동 보기':'이동 따라가기');
    $('playDay').disabled=!available;$('playDay').hidden=playing;$('stopDay').hidden=!playing;$('restartDay').disabled=!available;$('playSeek').disabled=!available;$('previousScene').disabled=!available||playbackState.index<=0;$('nextScene').disabled=!available||playbackState.index>=scenes.length-1;$('toggleRecords').disabled=!playbackState.scene;$('showAllScenes').disabled=!scenes.length;
    $('playSeek').value=String(Math.round((playbackState.progress||0)*1000));$('playSeek').setAttribute('aria-valuetext',playbackState.scene?`${dayLabel(playbackState.date)}, ${Math.round((playbackState.progress||0)*100)}퍼센트`:'재생할 기록 없음');$('playDate').textContent=playbackState.date?dayLabel(playbackState.date):'기록을 기다리는 중';$('playTime').textContent=elapsedLabel(playbackState.elapsed||0);$('playRange').textContent=elapsedLabel(playbackState.duration||60);$('playState').textContent=playing?'재생 중':'일시정지';
    for(const button of root.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===playbackState.mode));renderDurations();renderStoryList(scenes);renderPlaybackTicks(scenes);
    if(lastActive!==playbackState.index){lastActive=playbackState.index;for(const [index,button]of [...$('storyList').children].entries()){button.classList.toggle('is-current',index===lastActive);button.classList.toggle('is-past',index<lastActive);button.setAttribute('aria-current',index===lastActive?'step':'false');if(index===lastActive&&!$('storyPanel').hidden){const list=$('storyList'),offset=button.offsetTop-list.offsetTop;if(offset<list.scrollTop||offset+button.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=Math.max(0,offset-list.clientHeight/2);}}}
    if(map&&!detailRoute&&!picking){if(map.renderMotion)map.renderMotion(scenes,playbackState);else map.renderScene?.(playbackState.scene||null,{progress:playbackState.sceneProgress||0,history:scenes.slice(0,Math.max(0,playbackState.index)),next:scenes[playbackState.index+1]||null});}
  }
  function updateCameraMode(value){cameraMode=value;$('followMotion').setAttribute('aria-pressed',String(value==='follow'));$('showAllScenes').setAttribute('aria-pressed',String(value==='all'));}
  let map;const playback=playbackFactory({onChange:showPlayback});playbackState=playback.getState();
  map=mapFactory({element:$('journeyMap'),onCameraChange:updateCameraMode,onStatus:status=>{mapReady=status.ready;if(!disposed){$('pickLocation').disabled=!mapReady;showPlayback(playback.getState());scheduleMapMeasure();}},onPick:position=>{if(disposed)return;$('recordLat').value=position.lat.toFixed(6);$('recordLng').value=position.lng.toFixed(6);stopPicking();$('recordDialog').showModal();},onSelect:()=>void openCurrentDetails()});
  Promise.resolve(map.ready).then(ready=>{if(disposed)return;mapReady=!!ready;$('pickLocation').disabled=!mapReady;showPlayback(playback.getState());});
  function scheduleMapMeasure(){if(disposed||measureFrame)return;measureFrame=window.requestAnimationFrame(()=>{measureFrame=0;if(disposed)return;const top=Math.max(0,mapWrap.getBoundingClientRect().top+window.scrollY),height=Math.max(260,Math.floor(window.innerHeight-top-1)),value=height+'px';if(mapWrap.style.getPropertyValue('--journey-map-height')!==value)mapWrap.style.setProperty('--journey-map-height',value);$('journeyLayout').style.setProperty('--journey-map-height',value);const mapMessage=$('journeyMap').querySelector('.journey-map-message'),messageHeight=mapMessage&&!mapMessage.hidden?mapMessage.getBoundingClientRect().height:0,offset=messageHeight>0?Math.ceil(messageHeight)+8:0;mapWrap.style.setProperty('--journey-map-message-offset',offset+'px');renderPlaybackTicks(playbackState.scenes||[]);map.resize?.();});}
  const mapMeasureObserver=typeof window.ResizeObserver==='function'?new window.ResizeObserver(scheduleMapMeasure):null;mapMeasureObserver?.observe(document.body);const mapMessage=$('journeyMap').querySelector('.journey-map-message');if(mapMessage)mapMeasureObserver?.observe(mapMessage);on(window,'resize',scheduleMapMeasure);if(window.visualViewport)on(window.visualViewport,'resize',scheduleMapMeasure);
  function setStoryPanel(open){if(!open&&$('storyPanel').contains(document.activeElement))$('toggleStory').focus();$('storyPanel').hidden=!open;$('journeyLayout').classList.toggle('story-open',open);$('toggleStory').setAttribute('aria-expanded',String(open));scheduleMapMeasure();}
  function setCalendar(open){$('calendarPanel').hidden=!open;$('toggleCalendar').setAttribute('aria-expanded',String(open));if(open)void loadMonth(month);}
  function closeDetails(restoreFocus=true){daySeq++;photoSeq++;$('recordsPanel').hidden=true;$('toggleRecords').setAttribute('aria-expanded','false');if(detailRoute){detailRoute=false;showPlayback(playback.getState());}if(restoreFocus)($('toggleRecords').disabled?$('toggleStory'):$('toggleRecords')).focus();}
  function updateDateNavigation(){const currentMonth=date.slice(0,7),known=month===currentMonth?days:null,previous=months.some(value=>value<currentMonth)||(known?known.some(value=>value.date<date):months.includes(currentMonth)),next=months.some(value=>value>currentMonth)||(known?known.some(value=>value.date>date):months.includes(currentMonth));$('previousDay').disabled=dateNavPending||!previous;$('nextDay').disabled=dateNavPending||!next;}
  async function navigateRecordedDay(direction){if(disposed||formSaving||importing||dateNavPending)return;navigationTouched=true;const seq=++dateNavSeq,from=date,currentMonth=date.slice(0,7);dateNavPending=true;updateDateNavigation();try{const candidates=[...new Set([currentMonth,...months])].filter(value=>direction<0?value<=currentMonth:value>=currentMonth).sort((a,b)=>direction<0?b.localeCompare(a):a.localeCompare(b));for(const candidate of candidates){const result=await request('/months?month='+candidate);if(disposed||seq!==dateNavSeq)return;const found=(result.days||[]).map(item=>item.date).filter(value=>validDate(value)&&(direction<0?value<from:value>from)).sort((a,b)=>direction<0?b.localeCompare(a):a.localeCompare(b))[0];if(found){await selectDate(found);return;}}message(direction<0?'이전 날짜에 저장한 기록이 없어요':'다음 날짜에 저장한 기록이 없어요');}catch(error){if(!disposed&&seq===dateNavSeq)message(error.message,true);}finally{if(!disposed&&seq===dateNavSeq){dateNavPending=false;updateDateNavigation();}}}
  function lockRecord(locked){for(const input of $('recordForm').querySelectorAll('input,select,textarea,button'))input.disabled=locked;if(!locked){$('recordDate').disabled=!!editing;$('pickLocation').disabled=!mapReady;$('saveRecord').disabled=photoInvalid;}}
  function stopPicking(){picking=false;map.setPicking(false);$('pickNotice').hidden=true;showPlayback(playback.getState());}
  function renderCalendar(){
    $('monthTitle').textContent=monthLabel(month);const [year,m]=month.split('-').map(Number),first=new Date(Date.UTC(year,m-1,1)),start=new Date(Date.UTC(year,m-1,1-first.getUTCDay()));
    const byDate=new Map(days.map(value=>[value.date,value]));$('calendar').replaceChildren();
    for(let index=0;index<42;index++){const key=new Date(start.getTime()+index*86400000).toISOString().slice(0,10),summary=byDate.get(key),button=el('button',[key.slice(0,7)!==month?'outside':'',key===date?'selected':'',key===today()?'today':'',summary?'has-record':''].join(' '),String(Number(key.slice(8))));button.type='button';button.setAttribute('aria-label',`${key}${summary?`, ${summary.recordCount}개 기록, ${summary.trackCount}개 경로`:''}`);button.setAttribute('aria-pressed',String(key===date));on(button,'click',()=>void selectDate(key));$('calendar').append(button);}
    $('dayList').replaceChildren();if(!days.length)$('dayList').append(el('p','field-note','아직 이달의 기록이 없어요.'));
    for(const summary of [...days].sort((a,b)=>b.date.localeCompare(a.date))){const button=el('button','day-item');button.type='button';button.append(el('time','',summary.date.slice(5).replace('-','.')),el('span','',summary.title||'이동 기록'));if(summary.date===date)button.setAttribute('aria-current','date');on(button,'click',()=>void selectDate(summary.date));$('dayList').append(button);}
    const choices=[...new Set([month,...months])].sort().reverse();$('archiveMonth').replaceChildren(...choices.map(value=>{const option=el('option','',monthLabel(value));option.value=value;option.selected=value===month;return option;}));updateDateNavigation();
  }
  async function loadMonth(value=month){const seq=++monthSeq;month=value;days=[];renderCalendar();try{const data=await request('/months?month='+value);if(disposed||seq!==monthSeq)return;days=data.days||[];renderCalendar();}catch(error){if(!disposed&&seq===monthSeq)message(error.message,true);}}
  async function loadArchive(){const result=await request('/months');if(disposed)return null;months=(result.months||[]).map(value=>typeof value==='string'?value:value.month).filter(value=>/^\d{4}-\d{2}$/.test(value)).sort();const latest=result.latestDate;if(months.length&&validDate(latest)){const first=await request('/months?month='+months[0]);if(disposed)return null;const dates=(first.days||[]).map(value=>value.date).filter(validDate).sort();bounds={from:dates[0]||latest,to:latest};}else bounds={from:'',to:''};updateDateNavigation();return latest;}
  async function selectDate(value){
    if(formSaving||importing||!validDate(value)||disposed)return;navigationTouched=true;detailRoute=false;playback.pause();const selected=(playbackState.scenes||[]).find(scene=>scene.date===value);if(selected&&playbackState.date!==value)playback.seekScene(selected.id);
    detailRoute=false;dateNavSeq++;dateNavPending=false;const seq=++daySeq;date=value;day=emptyDay(date);recordLimit=18;$('recordsPanel').hidden=false;$('toggleRecords').setAttribute('aria-expanded','true');$('detailStatus').textContent='이날의 기록을 불러오는 중…';renderDay();if(month!==date.slice(0,7))void loadMonth(date.slice(0,7));else renderCalendar();
    try{const result=await getDay(value);if(disposed||seq!==daySeq)return;day=result;renderDay();$('detailStatus').textContent=day.revision||day.records.length||day.tracks.length?'':'아직 저장한 기록이 없어요';if(window.innerWidth<=720)setCalendar(false);}catch(error){if(!disposed&&seq===daySeq)$('detailStatus').textContent=error.message;}
  }
  function openCurrentDetails(){if(playbackState.date)return selectDate(playbackState.date);return selectDate(date);}
  function renderPeriod(){$('periodTitle').textContent=period.kind==='all'?'전체 기간':period.kind==='custom'?'선택한 기간':period.kind+'년';$('periodRange').textContent=period.from&&period.to?`${period.from.replaceAll('-','.')} — ${period.to.replaceAll('-','.')}`:'첫 번째 기억을 남겨보세요';}
  async function loadStory({resume=false,anchor=null}={}){
    const previous=anchor||playback.getState();playback.pause();cancelStoryLoad();const seq=storySeq,controller=new AbortController();storyAbort=controller;loading=true;storyFailed=false;detailRoute=false;$('retryPlayback').hidden=true;showPlayback(playback.getState());renderPeriod();
    const context=resume&&retryContext?retryContext:{from:period.from,to:period.to,person,days:[],cursor:null,complete:false,prepared:new Map(),anchor:previous};retryContext=context;
    try{
      if(!context.from||!context.to){loading=false;retryContext=null;playback.load([]);message('아직 저장한 기록이 없어요');return;}
      while(!context.complete){message('저장한 시간을 모으고 있어요…');const query=new URLSearchParams({from:context.from,to:context.to,geometry:'motion',person:context.person});if(context.cursor)query.set('after',context.cursor);const result=await request('/playback?'+query,{signal:controller.signal});if(disposed||seq!==storySeq)return;if(result.format==='journey-motion-v1')for(const scene of result.motionScenes||[])context.prepared.set(scene.id+':'+scene.revision,scene);const byDate=new Map(context.days.map(value=>[value.date,value]));for(const value of result.days||[])byDate.set(value.date,value);context.days=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));const next=result.nextCursor||null;if(next&&next===context.cursor)throw Error('기록 목록을 이어서 불러오지 못했어요.');context.cursor=next;context.complete=!next;}
      const scenes=await storyTask('motion-select',{days:context.days,options:{from:context.from,to:context.to,person:context.person}});if(disposed||seq!==storySeq)return;
      let nextIndex=0,complete=0;const prepared=new Array(scenes.length);const prepare=async()=>{while(nextIndex<scenes.length){const index=nextIndex++,scene=scenes[index],key=scene.id+':'+scene.revision;let result=context.prepared.get(key);if(!result){const sourceDay=await getDay(scene.date,{signal:controller.signal,revision:scene.revision});if(disposed||seq!==storySeq)return;result=await storyTask('motion-prepare',{scene,day:sourceDay});if(disposed||seq!==storySeq)return;context.prepared.set(key,result);}prepared[index]=result;complete++;message(`우리의 길을 준비하고 있어요 · ${complete}/${scenes.length}일`);}};
      await Promise.all([prepare(),prepare()]);if(disposed||seq!==storySeq)return;loading=false;storyFailed=false;retryContext=null;playback.load(prepared,{anchor:context.anchor});map.fitCurrentScene?.();updateCameraMode('follow');message(prepared.length?'저장됨 · 둘만 보기':'이 기간에 지도에 표시할 장소가 없어요');
    }catch(error){if(disposed||seq!==storySeq||error.name==='AbortError')return;loading=false;storyFailed=true;controller.abort();stopStoryWorker();if(error.code==='JOURNEY_SCENE_CHANGED'){retryContext=null;rawDays.clear();}showPlayback(playback.getState());$('retryPlayback').hidden=false;message(error.code==='JOURNEY_SCENE_CHANGED'?'기록이 새로 바뀌었어요. 다시 불러오면 최신 기록으로 이어갈 수 있어요.':error.message,true);}
  }
  function visibleRecords(){return day.records.filter(record=>person==='all'||record.person===person).sort((a,b)=>Number(!!b.photoId)-Number(!!a.photoId)||(a.time??Infinity)-(b.time??Infinity));}
  function renderDay(){
    $('selectedDate').textContent=dayLabel(date);$('dayTitle').textContent=day.title||'이날 남긴 기억';updateDateNavigation();$('records').replaceChildren();const records=visibleRecords();
    if(!records.length){const block=el('div','empty-records');block.append(el('h3','',day.tracks.length?'이동한 길에 기억을 더해요':'이날의 기억을 남겨볼까요?'),el('p','',day.tracks.length?'사진이나 짧은 이야기를 추가해 주세요.':'사진·장소를 직접 기록할 수 있어요.'));const button=el('button','','기록 남기기');on(button,'click',()=>openRecord());block.append(button);$('records').append(block);}
    const images=[];for(const record of records.slice(0,recordLimit)){const card=el('article','record-card');if(record.photoId){const button=el('button','record-photo');button.type='button';button.setAttribute('aria-label',record.title+' 사진 크게 보기');const img=el('img');img.alt=record.title;img.loading='lazy';images.push([img,record.photoId]);button.append(img);on(button,'click',()=>void openPhotoViewer(record));card.append(button);}card.append(el('h3','',record.title),el('small','',`${names[record.person]}${record.time===null?'':' · '+koreanDateTime(record.time).slice(11,16)}`));if(record.note)card.append(el('p','',record.note));const edit=el('button','text-action record-edit','기록 수정');edit.type='button';edit.dataset.recordId=record.id;edit.setAttribute('aria-label',record.title+' 기록 수정');on(edit,'click',()=>openRecord(record));card.append(edit);$('records').append(card);}
    if(records.length>recordLimit){const more=el('button','text-action',`기억 더 보기 (${records.length-recordLimit}개)`);on(more,'click',()=>{recordLimit+=18;renderDay();});$('records').append(more);}
    const seq=++photoSeq;if($('recordsPanel').hidden)return;void(async()=>{for(const [img,id]of images){if(disposed||seq!==photoSeq)return;try{let url=urls.get(id);if(!url){const blob=await request('/photos/'+id+'?size=thumb',{blob:true});if(disposed||seq!==photoSeq)return;url=URL.createObjectURL(blob);urls.set(id,url);}img.src=url;}catch{if(!disposed&&seq===photoSeq)img.alt='사진을 불러오지 못했어요. 새로 불러오기를 눌러주세요.';}}})();
  }
  async function refresh(){playback.pause();cancelStoryLoad();rawDays.clear();try{await loadArchive();if(disposed)return;if(period.kind==='all')period={kind:'all',...bounds};await loadMonth();if(disposed)return;await loadStory({anchor:playback.getState()});if(!$('recordsPanel').hidden)await selectDate(date);}catch(error){if(!disposed){storyFailed=true;$('retryPlayback').hidden=false;message(error.message,true);}}}

  function openRecord(record=null,wantsPhoto=false){
    if(formSaving||importing)return;playback.pause();if(!record&&$('recordsPanel').hidden&&playbackState.date)date=playbackState.date;formSaveSeq++;closePhotoViewer(false);photoInputSeq++;recordId=record?.id||crypto.randomUUID();editing=record?{record:structuredClone(record),day:structuredClone(day)}:null;preparedPhoto=null;photoUploaded=false;photoInvalid=false;conflictBase=null;lockRecord(false);updatePhotoViewButton();$('saveRecord').textContent='기록 저장';$('recordForm').reset();$('recordError').textContent='';$('photoNote').textContent='';$('photoPreview').hidden=true;$('recordDialogTitle').textContent=record?'이날의 기억 다듬기':'기억 한 장 남기기';
    $('recordDate').value=date;$('recordDate').disabled=!!record;$('recordTime').value=record?.time!=null?koreanDateTime(record.time).slice(11,16):'';$('recordPerson').value=record?.person||'together';$('recordTitle').value=record?.title||'';$('recordNote').value=record?.note||'';$('recordLat').value=record?.position?.lat??'';$('recordLng').value=record?.position?.lng??'';
    if(record?.photoId&&urls.has(record.photoId)){$('photoPreview').src=urls.get(record.photoId);$('photoPreview').hidden=false;}
    showDialog('recordDialog');if(wantsPhoto)$('photoFile').click();
  }
  on($('photoFile'),'change',async()=>{const file=$('photoFile').files[0],seq=++photoInputSeq;closePhotoViewer(false);preparedPhoto=null;photoUploaded=false;photoInvalid=!!file;updatePhotoViewButton();if(!file){$('saveRecord').disabled=false;$('photoNote').textContent='';$('photoPreview').hidden=true;return;}$('photoNote').textContent='사진의 날짜·위치를 확인하고 있어요…';$('photoPreview').hidden=true;$('saveRecord').disabled=true;try{const photo=await preparePhoto(file);if(disposed||seq!==photoInputSeq)return;preparedPhoto=photo;photoInvalid=false;$('photoPreview').src=photo.thumb;$('photoPreview').hidden=false;if(photo.date&&!editing)$('recordDate').value=photo.date;if(photo.time!=null&&(!editing||photo.date===date))$('recordTime').value=koreanDateTime(photo.time).slice(11,16);if(photo.position){$('recordLat').value=photo.position.lat;$('recordLng').value=photo.position.lng;}$('photoNote').textContent=(photo.warnings||[]).join(' ')||'사진에서 읽은 날짜와 위치를 확인해주세요.';}catch(error){if(!disposed&&seq===photoInputSeq){preparedPhoto=null;$('photoNote').textContent=error.message+' 다른 사진을 선택하거나 파일 선택을 비워주세요.';}}finally{if(!disposed&&seq===photoInputSeq){$('saveRecord').disabled=photoInvalid;updatePhotoViewButton();}}});
  on($('recordForm'),'submit',async event=>{
    event.preventDefault();if(formSaving||disposed||photoInvalid)return;$('recordError').textContent='';
    const targetDate=$('recordDate').value,lat=$('recordLat').value.trim(),lng=$('recordLng').value.trim();
    if(!validDate(targetDate)){ $('recordError').textContent='날짜를 확인해주세요.';return; }
    if(!!lat!==!!lng){$('recordError').textContent='위도와 경도를 함께 입력하거나 둘 다 비워주세요.';return;}
    const draft={time:$('recordTime').value,person:$('recordPerson').value,title:$('recordTitle').value.trim(),note:$('recordNote').value.trim()},photo=preparedPhoto;
    const operation=++formSaveSeq;formSaving=true;lockRecord(true);message('기록을 저장하고 있어요…');
    try{
      const base=conflictBase?.date===targetDate?conflictBase:editing?editing.day:await getDay(targetDate,{fresh:true});
      const exactTime=photo?.time??editing?.record.time;
      const time=exactTime!=null&&koreanDateTime(exactTime).slice(0,16)===targetDate+'T'+draft.time?exactTime:draft.time?timeFromKorea(targetDate+'T'+draft.time):null;
      if(draft.time&&time===null)throw Error('시간을 확인해주세요.');
      const record={...(editing?.record||{}),id:recordId,person:draft.person,kind:editing?.record.kind||(photo?'photo':'manual'),title:draft.title,note:draft.note,time,timePrecision:time===null?'day':'exact',position:lat?{lat:Number(lat),lng:Number(lng)}:null,edited:true};
      if(photo)record.photoId=photo.id;
      const next=validateDay({...base,records:[...base.records.filter(r=>r.id!==record.id),record]});
      if(photo&&!photoUploaded){await request('/photos',{method:'POST',body:{id:photo.id,full:photo.full,thumb:photo.thumb}});photoUploaded=true;}
      if(disposed)return;
      const response=await request('/days/'+targetDate,{method:'PUT',body:{expectedRevision:base.revision,day:next}});if(disposed)return;
      const savedDaySeq=++daySeq;day=cacheDay(validateDay(response.day));date=targetDate;formSaving=false;lockRecord(false);$('recordDialog').close();renderDay();message('저장됨 · 둘만 보기');if(returnFocus?.isConnected)returnFocus.focus();else [...$('records').querySelectorAll('.record-edit')].find(button=>button.dataset.recordId===recordId)?.focus();try{await loadArchive();if(disposed||operation!==formSaveSeq||savedDaySeq!==daySeq)return;await loadMonth(targetDate.slice(0,7));if(disposed||operation!==formSaveSeq||savedDaySeq!==daySeq)return;if(period.kind==='all')period={kind:'all',...bounds};await loadStory({anchor:playback.getState()});}catch{if(!disposed&&operation===formSaveSeq&&savedDaySeq===daySeq)message('기록은 저장됐어요. 달력은 새로 불러와주세요.');}
    }catch(error){if(!disposed){$('recordError').textContent=error.message;if(error.status===409){try{const latest=validateDay((await request('/days/'+targetDate)).day);if(disposed)return;conflictBase=latest;const updated=latest.records.find(r=>r.id===recordId);$('recordError').textContent=updated&&JSON.stringify(updated)!==JSON.stringify(editing?.record)?`이 기억이 다른 곳에서 수정됐어요. 최신 제목: ${updated.title}\n최신 메모: ${updated.note||'(없음)'}\n입력 내용은 유지했습니다. 다시 저장하면 이 기억에 내 수정을 적용하고 다른 기록은 유지해요.`:'다른 곳에서 추가·수정한 기록을 불러왔어요. 입력 내용은 유지했습니다. 다시 저장하면 최신 기록에 추가해요.';$('saveRecord').textContent='내 수정으로 다시 저장';}catch{if(!disposed)$('recordError').textContent='최신 기록을 불러오지 못했어요. 입력은 유지했으니 연결 후 다시 저장해주세요.';}}message('저장하지 못했어요 · 입력 내용 유지');}}
    finally{if(operation===formSaveSeq){formSaving=false;if(!disposed)lockRecord(false);}}
  });
  on($('pickLocation'),'click',()=>{playback.pause();picking=true;$('motionDate').hidden=true;$('motionLegend').hidden=true;$('recordDialog').close();$('pickNotice').hidden=false;map.setPicking(true);$('journeyMap').scrollIntoView({block:'center',behavior:'auto'});});
  on($('cancelPick'),'click',()=>{stopPicking();$('recordDialog').showModal();});
  function stopWorker(){worker?.terminate();worker=null;}
  async function previewImport(){if(importing)return;const seq=++importSeq,file=$('timelineFile').files[0],selectedPerson=$('importPerson').value;stopWorker();importResult=null;importDone=new Set();$('saveImport').disabled=true;$('saveImport').textContent='확인한 기록 추가';$('importError').textContent='';$('importPreview').replaceChildren();$('importProgress').textContent=file?'파일을 읽고 날짜별로 정리하는 중…':'';if(!file)return;if(file.size>128*1024*1024){$('importError').textContent='128MB 이하의 타임라인 파일을 선택해주세요.';$('importProgress').textContent='';return;}
    try{const text=await file.text();if(disposed||seq!==importSeq)return;const active=workerFactory(new URL('./import-worker.mjs',import.meta.url));worker=active;active.onmessage=({data})=>{if(disposed||worker!==active||seq!==importSeq)return;stopWorker();if(!data.ok){$('importError').textContent=data.error;$('importProgress').textContent='';return;}importResult=data.result;const list=importResult.days;$('importProgress').textContent=`${list.length}일의 기록을 확인했어요. 아직 저장하지 않았습니다.`;const count=list.reduce((n,d)=>n+d.records.length,0),tracks=list.reduce((n,d)=>n+d.tracks.length,0);$('importPreview').append(el('strong','',`${count.toLocaleString()}개 장소 · ${tracks.toLocaleString()}개 경로`));const rows=el('div');for(const d of list.slice(0,120)){const row=el('div','import-day');row.append(el('span','',d.date),el('span','',`${d.records.length}개 장소 · ${d.tracks.length}개 경로`));rows.append(row);}$('importPreview').append(rows);if(importResult.warnings?.length){const ul=el('ul');for(const warning of importResult.warnings.slice(0,8))ul.append(el('li','',warning));$('importPreview').append(ul);}$('saveImport').disabled=!list.length;};active.onerror=()=>{if(disposed||worker!==active)return;stopWorker();$('importError').textContent='파일을 처리하지 못했어요. 올바른 타임라인 JSON인지 확인해주세요.';$('importProgress').textContent='';};active.postMessage({text,options:{person:selectedPerson,name:file.name,importedAt:Date.now()}});
    }catch(error){if(!disposed&&seq===importSeq){$('importError').textContent=error.message;$('importProgress').textContent='';}}
  }
  on($('timelineFile'),'change',()=>void previewImport());on($('importPerson'),'change',()=>void previewImport());
  on($('importForm'),'submit',async event=>{event.preventDefault();if(importing||!importResult)return;playback.pause();cancelStoryLoad();importing=true;$('saveImport').disabled=true;$('timelineFile').disabled=true;$('importPerson').disabled=true;$('importError').textContent='';
    try{for(const d of importResult.days){if(disposed)return;if(importDone.has(d.date))continue;$('importProgress').textContent=`${d.date} 저장 중 · ${importDone.size}/${importResult.days.length}일`;await request('/days/'+d.date+'/import',{method:'POST',body:{source:importResult.source,records:d.records,tracks:d.tracks}});if(disposed)return;importDone.add(d.date);}
      const last=importResult.days.at(-1)?.date;$('importProgress').textContent=`${importDone.size}일의 기록을 저장했어요. 같은 기록은 중복 저장하지 않았습니다.`;message('저장됨 · 둘만 보기');importing=false;rawDays.clear();await loadArchive();if(disposed)return;if(period.kind==='all')period={kind:'all',...bounds};await loadStory({anchor:playback.getState()});if(last){await loadMonth(last.slice(0,7));await selectDate(last);}
    }catch(error){if(!disposed){$('importError').textContent=`${error.message}\n${importDone.size}일은 저장됐어요. 다시 누르면 남은 날짜부터 이어갑니다.`;$('saveImport').disabled=false;$('saveImport').textContent='남은 기록 다시 추가';message('일부 기록 저장됨 · 다시 시도할 수 있어요');}}
    finally{importing=false;if(!disposed){$('timelineFile').disabled=false;$('importPerson').disabled=false;}}
  });

  for(const button of root.querySelectorAll('[data-close]'))on(button,'click',()=>closeDialog(button.dataset.close));
  for(const dialog of root.querySelectorAll('dialog'))on(dialog,'cancel',event=>{if(formSaving||importing)event.preventDefault();});
  for(const button of root.querySelectorAll('[data-person]'))on(button,'click',()=>{draftPerson=button.dataset.person;root.querySelectorAll('[data-person]').forEach(value=>value.setAttribute('aria-pressed',String(value===button)));});
  for(const button of root.querySelectorAll('[data-mode]'))on(button,'click',()=>{closeDetails(false);playback.setMode(button.dataset.mode);});
  on($('addRecord'),'click',()=>openRecord());on($('addPhoto'),'click',()=>openRecord(null,true));on($('addOldPhoto'),'click',()=>openRecord(null,true));
  on($('openImport'),'click',()=>{if(formSaving)return;playback.pause();$('moreMenu').open=false;$('saveImport').textContent='확인한 기록 추가';showDialog('importDialog');});
  on($('refreshDay'),'click',()=>{$('moreMenu').open=false;void refresh();});on($('retryPlayback'),'click',()=>void(retryContext?loadStory({resume:true}):refresh()));
  on($('archiveMonth'),'change',()=>{navigationTouched=true;if($('archiveMonth').value)void loadMonth($('archiveMonth').value);});
  const shiftMonth=delta=>{if(formSaving||importing)return;navigationTouched=true;const [year,value]=month.split('-').map(Number);void loadMonth(new Date(Date.UTC(year,value-1+delta,1)).toISOString().slice(0,7));};
  on($('previousMonth'),'click',()=>shiftMonth(-1));on($('nextMonth'),'click',()=>shiftMonth(1));on($('previousDay'),'click',()=>void navigateRecordedDay(-1));on($('nextDay'),'click',()=>void navigateRecordedDay(1));
  on($('toggleStory'),'click',()=>setStoryPanel($('storyPanel').hidden));on($('closeStory'),'click',()=>setStoryPanel(false));on($('toggleCalendar'),'click',()=>setCalendar($('calendarPanel').hidden));on($('closeCalendar'),'click',()=>{setCalendar(false);$('toggleCalendar').focus();});
  on($('toggleRecords'),'click',()=>{if($('recordsPanel').hidden)void openCurrentDetails();else closeDetails();});on($('closeRecords'),'click',()=>closeDetails());
  on($('showAllScenes'),'click',()=>{map.showAllScenes?.(playback.getState().scenes);updateCameraMode('all');});
  on($('followMotion'),'click',()=>{map.fitCurrentScene?.();updateCameraMode('follow');});
  on($('showDayRoute'),'click',()=>{playback.pause();detailRoute=true;$('motionDate').hidden=true;$('motionLegend').hidden=true;map.render(day,{person});if(window.innerWidth<=720){$('recordsPanel').hidden=true;$('toggleRecords').setAttribute('aria-expanded','false');}});
  on($('playDay'),'click',()=>{if(loading||storyFailed||!mapReady)return;closeDetails(false);playback.play();});on($('stopDay'),'click',()=>playback.pause());on($('restartDay'),'click',()=>{closeDetails(false);playback.restart();});
  on($('previousScene'),'click',()=>{closeDetails(false);playback.step(-1);});on($('nextScene'),'click',()=>{closeDetails(false);playback.step(1);});on($('playSeek'),'input',()=>{closeDetails(false);playback.seek(Number($('playSeek').value)/1000);});
  on(document,'visibilitychange',()=>{if(document.hidden)playback.pause();});
  function fillPeriodPreset(){const value=$('periodPreset').value;let from=period.from,to=period.to;if(value==='all'){from=bounds.from;to=bounds.to;}else if(value!=='custom'){from=[value+'-01-01',bounds.from].sort().at(-1);to=[value+'-12-31',bounds.to].sort()[0];}$('periodFrom').value=from;$('periodTo').value=to;$('periodFrom').disabled=$('periodTo').disabled=value!=='custom';}
  on($('openPeriod'),'click',()=>{playback.pause();draftPerson=person;$('periodError').textContent='';const years=months.map(value=>value.slice(0,4));$('periodPreset').replaceChildren(...['all',...new Set(years),'custom'].map(value=>{const option=el('option','',value==='all'?'전체 기간':value==='custom'?'직접 선택':value+'년');option.value=value;return option;}));$('periodPreset').value=period.kind;for(const button of root.querySelectorAll('[data-person]'))button.setAttribute('aria-pressed',String(button.dataset.person===person));fillPeriodPreset();showDialog('periodDialog');});
  on($('periodPreset'),'change',fillPeriodPreset);
  on($('periodForm'),'submit',event=>{event.preventDefault();const from=$('periodFrom').value,to=$('periodTo').value;if(!validDate(from)||!validDate(to)||from>to){$('periodError').textContent='시작일과 종료일을 확인해주세요.';return;}person=draftPerson;period={kind:$('periodPreset').value,from,to};closeDialog('periodDialog');closeDetails(false);void loadStory({anchor:playback.getState()});});
  setStoryPanel(false);renderCalendar();renderPeriod();showPlayback(playback.getState());scheduleMapMeasure();
  void(async()=>{try{const latest=await loadArchive();if(disposed)return;if(!navigationTouched&&validDate(latest)){date=latest;month=date.slice(0,7);}await loadMonth(month);if(disposed)return;period={kind:'all',...bounds};await loadStory();}catch(error){if(!disposed){storyFailed=true;$('retryPlayback').hidden=false;message(error.message,true);}}})();
  return {getPlayback:()=>playback.getState(),dispose(){disposed=true;life.abort();cancelStoryLoad();drainDayQueue();stopWorker();playback.destroy();mapMeasureObserver?.disconnect();if(measureFrame)window.cancelAnimationFrame(measureFrame);map.destroy();clearPhotoViewer();urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();rawDays.clear();for(const dialog of root.querySelectorAll('dialog[open]'))dialog.close();day=null;days=[];months=[];preparedPhoto=null;editing=null;importResult=null;retryContext=null;conflictBase=null;importDone.clear();returnFocus=null;photoReturnFocus=null;recordId=null;playbackState={};lastListKey=null;lastScenes=null;lastTickScenes=null;bounds={from:'',to:''};period={kind:'all',...bounds};root.replaceChildren();}};
}
