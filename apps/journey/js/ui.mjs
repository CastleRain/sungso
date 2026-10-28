import { emptyDay, validateDay, dateInKorea, koreanDateTime, timeFromKorea, validDate } from '../../../shared/journey/core.mjs';
import { createJourneyMap } from './map.mjs';
import { prepareJourneyPhoto } from './photo.mjs';

const names={sungwoo:'성우',sohee:'소희',together:'함께'};
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const today=()=>dateInKorea(Date.now());
const dayLabel=date=>new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Seoul'}).format(new Date(date+'T12:00:00+09:00'));
const monthLabel=month=>`${Number(month.slice(0,4))}년 ${Number(month.slice(5))}월`;
export function mountJourney({root,request,member,mapFactory=createJourneyMap,preparePhoto=prepareJourneyPhoto,workerFactory=url=>new Worker(url,{type:'module'})}){
  const $=id=>root.querySelector('#'+id),life=new AbortController(),urls=new Map(),photoViewImage=$('fullPhoto'),photoViewStatus=$('photoViewStatus');
  let disposed=false,date=today(),month=date.slice(0,7),day=emptyDay(date),days=[],months=[],person='all',daySeq=0,monthSeq=0,photoSeq=0,navigationTouched=false;
  let editing=null,preparedPhoto=null,photoUploaded=false,formSaving=false,importing=false,importResult=null,importDone=new Set(),worker=null,recordLimit=18,returnFocus=null,photoInputSeq=0,importSeq=0,recordId=null,mapReady=false,photoInvalid=false,conflictBase=null,photoViewSeq=0,photoViewUrl=null;
  const on=(target,type,fn)=>target.addEventListener(type,fn,{signal:life.signal});
  const message=(value,error=false)=>{if(disposed)return;$('globalError').hidden=!error;$('globalError').textContent=error?value:'';$('saveState').textContent=error?'불러오기·저장 상태를 확인해주세요':value;};
  function showDialog(id){returnFocus=document.activeElement;$(id).showModal();}
  function closeDialog(id){if(formSaving||importing)return;$(id).close();returnFocus?.focus?.();}
  function clearPhotoViewer(){photoViewSeq++;if(photoViewUrl){URL.revokeObjectURL(photoViewUrl);photoViewUrl=null;}photoViewImage?.removeAttribute('src');if(photoViewImage)photoViewImage.hidden=true;if(photoViewStatus)photoViewStatus.textContent='';}
  function closePhotoViewer(restoreFocus=true){clearPhotoViewer();if($('photoDialog')?.open)$('photoDialog').close();if(restoreFocus&&$('recordDialog')?.open)$('viewPhoto')?.focus();}
  function updatePhotoViewButton(){$('viewPhoto').hidden=photoInvalid||!(preparedPhoto||editing?.record.photoId);}
  async function openPhotoViewer(){
    const photo=preparedPhoto,id=editing?.record.photoId;if(disposed||formSaving||photoInvalid||(!photo&&!id))return;
    clearPhotoViewer();const seq=photoViewSeq;$('fullPhoto').alt=$('recordTitle').value.trim()||'이날의 사진';$('photoViewStatus').textContent='사진을 크게 불러오는 중…';$('photoDialog').showModal();
    try{let url=photo?.full;if(!url){const blob=await request('/photos/'+id+'?size=full',{blob:true});if(disposed||seq!==photoViewSeq||!$('photoDialog').open)return;url=URL.createObjectURL(blob);photoViewUrl=url;}
      if(disposed||seq!==photoViewSeq)return;$('fullPhoto').src=url;$('fullPhoto').hidden=false;$('photoViewStatus').textContent='';
    }catch(error){if(!disposed&&seq===photoViewSeq)$('photoViewStatus').textContent=error.message||'사진을 불러오지 못했어요. 닫은 뒤 다시 시도해주세요.';}
  }
  on($('viewPhoto'),'click',()=>void openPhotoViewer());on($('closePhotoView'),'click',()=>closePhotoViewer());
  on($('photoDialog'),'cancel',event=>{event.preventDefault();closePhotoViewer();});
  const map=mapFactory({element:$('journeyMap'),onStatus:status=>{mapReady=status.ready;if(!disposed){$('pickLocation').disabled=!mapReady;$('playDay').disabled=!mapReady||!hasPlayableTrack();}},onPick:position=>{if(disposed)return;$('recordLat').value=position.lat.toFixed(6);$('recordLng').value=position.lng.toFixed(6);stopPicking();$('recordDialog').showModal();},onSelect:id=>{const record=day.records.find(r=>r.id===id);if(record)openRecord(record);}});
  function hasPlayableTrack(){return day.tracks.some(t=>(person==='all'||t.person===person)&&t.points.length>1&&t.points.at(-1).time>t.points[0].time);}
  Promise.resolve(map.ready).then(ready=>{if(disposed)return;mapReady=!!ready;$('pickLocation').disabled=!mapReady;$('playDay').disabled=!mapReady||!hasPlayableTrack();});
  function lockRecord(locked){for(const input of $('recordForm').querySelectorAll('input,select,textarea,button'))input.disabled=locked;if(!locked){$('recordDate').disabled=!!editing;$('pickLocation').disabled=!mapReady;$('saveRecord').disabled=photoInvalid;}}
  function stopPicking(){map.setPicking(false);$('pickNotice').hidden=true;}
  function renderCalendar(){
    $('monthTitle').textContent=monthLabel(month);const [year,m]=month.split('-').map(Number),first=new Date(Date.UTC(year,m-1,1)),start=new Date(Date.UTC(year,m-1,1-first.getUTCDay()));
    const byDate=new Map(days.map(d=>[d.date,d]));$('calendar').replaceChildren();
    for(let i=0;i<42;i++){const key=new Date(start.getTime()+i*86400000).toISOString().slice(0,10),summary=byDate.get(key),button=el('button',[key.slice(0,7)!==month?'outside':'',key===date?'selected':'',key===today()?'today':'',summary?'has-record':''].join(' '),String(Number(key.slice(8))));button.type='button';button.setAttribute('aria-label',`${key}${summary?`, ${summary.recordCount}개 기록, ${summary.trackCount}개 경로`:''}`);button.setAttribute('aria-pressed',String(key===date));on(button,'click',()=>void selectDate(key));$('calendar').append(button);}
    $('dayList').replaceChildren();
    if(!days.length)$('dayList').append(el('p','field-note','아직 이달의 기록이 없어요.'));
    for(const summary of [...days].sort((a,b)=>b.date.localeCompare(a.date))){const b=el('button','day-item');b.type='button';b.append(el('time','',summary.date.slice(5).replace('-','.')),el('span','',summary.title||'이동 기록'));if(summary.date===date)b.setAttribute('aria-current','date');on(b,'click',()=>void selectDate(summary.date));$('dayList').append(b);}
    const choices=[...new Set([month,...months])].sort().reverse();$('archiveMonth').replaceChildren(...choices.map(value=>{const option=el('option','',monthLabel(value));option.value=value;option.selected=value===month;return option;}));
  }
  async function loadMonth(value=month){const seq=++monthSeq;month=value;days=[];renderCalendar();try{const data=await request('/months?month='+value);if(disposed||seq!==monthSeq)return;days=data.days||[];renderCalendar();}catch(error){if(!disposed&&seq===monthSeq)message(error.message,true);}}
  async function loadArchive(){const result=await request('/months');if(disposed)return null;months=(result.months||[]).map(m=>typeof m==='string'?m:m.month).filter(Boolean);return result.latestDate;}
  async function selectDate(value){if(formSaving||importing||!validDate(value)||disposed)return;const seq=++daySeq;date=value;day=emptyDay(date);recordLimit=18;renderDay();if(month!==date.slice(0,7))void loadMonth(date.slice(0,7));else renderCalendar();message('저장한 기록을 불러오는 중…');try{const data=await request('/days/'+value);if(disposed||seq!==daySeq)return;day=validateDay(data.day);renderDay();message(day.revision?'저장됨 · 둘만 보기':'아직 저장한 기록이 없어요');}catch(error){if(!disposed&&seq===daySeq)message(error.message,true);}}
  function visibleRecords(){return day.records.filter(r=>person==='all'||r.person===person).sort((a,b)=>Number(!!b.photoId)-Number(!!a.photoId)||(a.time??Infinity)-(b.time??Infinity));}
  function renderDay(){
    map.stop();$('stopDay').hidden=true;$('playDay').hidden=false;$('playState').textContent='';$('selectedDate').textContent=dayLabel(date);$('dayTitle').textContent=day.title||day.records[0]?.title||(day.tracks.length?'서로에게 향한 길':'우리의 하루를 기록해요');
    map.render(day,{person});$('playDay').disabled=!mapReady||!hasPlayableTrack();$('records').replaceChildren();
    const records=visibleRecords();$('recordCount').textContent=records.length?`${records.length}개`:'';
    if(!records.length){const block=el('div','empty-records');block.append(el('h3','',day.tracks.length?'이동한 길에 기억을 더해요':'이날의 기억을 남겨볼까요?'),el('p','',day.tracks.length?'사진이나 짧은 이야기를 추가해 주세요.':'타임라인을 가져오거나 사진·장소를 직접 기록할 수 있어요.'));const b=el('button','', '기록 남기기');on(b,'click',()=>openRecord());block.append(b);$('records').append(block);}
    const images=[];
    for(const record of records.slice(0,recordLimit)){const b=el('button','record-card');b.type='button';b.setAttribute('aria-label',`${record.title} 기록 수정`);if(record.photoId){const img=el('img');img.alt=record.title;img.loading='lazy';images.push([img,record.photoId]);b.append(img);}else{const box=el('div','record-no-photo');box.append(el('small','',record.kind==='visit'?'타임라인에서 남긴 장소':'직접 남긴 기억'),el('strong','',record.title));b.append(box);}
      const time=record.time===null?'시간 미기록':koreanDateTime(record.time).slice(11,16);b.append(el('small','',`${names[record.person]} · ${time}${record.edited?' · 직접 보완':''}`));if(record.photoId)b.append(el('strong','',record.title));if(record.note)b.append(el('p','',record.note));if(!record.position)b.append(el('span','unlocated','위치 없이 보관 중'));on(b,'click',()=>openRecord(record));$('records').append(b);}
    if(records.length>recordLimit){const more=el('button','text-action',`기억 더 보기 (${records.length-recordLimit}개)`);on(more,'click',()=>{recordLimit+=18;renderDay();});$('records').append(more);}
    $('sourceSummary').replaceChildren(el('span','',`타임라인 경로 ${day.tracks.length}개`),el('span','',`사진 ${day.records.filter(r=>r.photoId).length}장`),el('span','',`직접 기록 ${day.records.filter(r=>r.kind==='manual'||r.edited).length}개`));
    const seq=++photoSeq;void(async()=>{for(const [img,id]of images){if(disposed||seq!==photoSeq)return;try{let url=urls.get(id);if(!url){const blob=await request('/photos/'+id+'?size=thumb',{blob:true});if(disposed||seq!==photoSeq)return;url=URL.createObjectURL(blob);urls.set(id,url);}img.src=url;}catch{if(!disposed&&seq===photoSeq){img.alt='사진을 불러오지 못했어요. 새로 불러오기를 눌러주세요.';}}}})();
  }
  async function refresh(){try{await loadArchive();await loadMonth();await selectDate(date);}catch(error){message(error.message,true);}}
  function openRecord(record=null,wantsPhoto=false){
    if(formSaving||importing)return;closePhotoViewer(false);photoInputSeq++;recordId=record?.id||crypto.randomUUID();editing=record?{record:structuredClone(record),day:structuredClone(day)}:null;preparedPhoto=null;photoUploaded=false;photoInvalid=false;conflictBase=null;lockRecord(false);updatePhotoViewButton();$('saveRecord').textContent='기록 저장';$('recordForm').reset();$('recordError').textContent='';$('photoNote').textContent='';$('photoPreview').hidden=true;$('recordDialogTitle').textContent=record?'이날의 기억 다듬기':'기억 한 장 남기기';
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
    formSaving=true;lockRecord(true);message('기록을 저장하고 있어요…');
    try{
      const base=conflictBase?.date===targetDate?conflictBase:editing?editing.day:targetDate===day.date?structuredClone(day):validateDay((await request('/days/'+targetDate)).day);
      const exactTime=photo?.time??editing?.record.time;
      const time=exactTime!=null&&koreanDateTime(exactTime).slice(0,16)===targetDate+'T'+draft.time?exactTime:draft.time?timeFromKorea(targetDate+'T'+draft.time):null;
      if(draft.time&&time===null)throw Error('시간을 확인해주세요.');
      const record={...(editing?.record||{}),id:recordId,person:draft.person,kind:editing?.record.kind||(photo?'photo':'manual'),title:draft.title,note:draft.note,time,timePrecision:time===null?'day':'exact',position:lat?{lat:Number(lat),lng:Number(lng)}:null,edited:true};
      if(photo)record.photoId=photo.id;
      const next=validateDay({...base,records:[...base.records.filter(r=>r.id!==record.id),record]});
      if(photo&&!photoUploaded){await request('/photos',{method:'POST',body:{id:photo.id,full:photo.full,thumb:photo.thumb}});photoUploaded=true;}
      if(disposed)return;
      const response=await request('/days/'+targetDate,{method:'PUT',body:{expectedRevision:base.revision,day:next}});if(disposed)return;
      ++daySeq;day=validateDay(response.day);date=targetDate;formSaving=false;$('recordDialog').close();renderDay();message('저장됨 · 둘만 보기');try{await loadArchive();await loadMonth(targetDate.slice(0,7));}catch{message('기록은 저장됐어요. 달력은 새로 불러와주세요.');}returnFocus?.focus?.();
    }catch(error){if(!disposed){$('recordError').textContent=error.message;if(error.status===409){try{const latest=validateDay((await request('/days/'+targetDate)).day);if(disposed)return;conflictBase=latest;const updated=latest.records.find(r=>r.id===recordId);$('recordError').textContent=updated&&JSON.stringify(updated)!==JSON.stringify(editing?.record)?`이 기억이 다른 곳에서 수정됐어요. 최신 제목: ${updated.title}\n최신 메모: ${updated.note||'(없음)'}\n입력 내용은 유지했습니다. 다시 저장하면 이 기억에 내 수정을 적용하고 다른 기록은 유지해요.`:'다른 곳에서 추가·수정한 기록을 불러왔어요. 입력 내용은 유지했습니다. 다시 저장하면 최신 기록에 추가해요.';$('saveRecord').textContent='내 수정으로 다시 저장';}catch{if(!disposed)$('recordError').textContent='최신 기록을 불러오지 못했어요. 입력은 유지했으니 연결 후 다시 저장해주세요.';}}message('저장하지 못했어요 · 입력 내용 유지');}}
    finally{formSaving=false;if(!disposed)lockRecord(false);}
  });
  on($('pickLocation'),'click',()=>{$('recordDialog').close();$('pickNotice').hidden=false;map.setPicking(true);$('journeyMap').scrollIntoView({block:'center',behavior:'auto'});});
  on($('cancelPick'),'click',()=>{stopPicking();$('recordDialog').showModal();});
  function stopWorker(){worker?.terminate();worker=null;}
  async function previewImport(){if(importing)return;const seq=++importSeq,file=$('timelineFile').files[0],selectedPerson=$('importPerson').value;stopWorker();importResult=null;importDone=new Set();$('saveImport').disabled=true;$('saveImport').textContent='확인한 기록 추가';$('importError').textContent='';$('importPreview').replaceChildren();$('importProgress').textContent=file?'파일을 읽고 날짜별로 정리하는 중…':'';if(!file)return;if(file.size>150*1024*1024){$('importError').textContent='150MB 이하의 타임라인 파일을 선택해주세요.';$('importProgress').textContent='';return;}
    try{const text=await file.text();if(disposed||seq!==importSeq)return;const active=workerFactory(new URL('./import-worker.mjs',import.meta.url));worker=active;active.onmessage=({data})=>{if(disposed||worker!==active||seq!==importSeq)return;stopWorker();if(!data.ok){$('importError').textContent=data.error;$('importProgress').textContent='';return;}importResult=data.result;const list=importResult.days;$('importProgress').textContent=`${list.length}일의 기록을 확인했어요. 아직 저장하지 않았습니다.`;const count=list.reduce((n,d)=>n+d.records.length,0),tracks=list.reduce((n,d)=>n+d.tracks.length,0);$('importPreview').append(el('strong','',`${count.toLocaleString()}개 장소 · ${tracks.toLocaleString()}개 경로`));const rows=el('div');for(const d of list.slice(0,120)){const row=el('div','import-day');row.append(el('span','',d.date),el('span','',`${d.records.length}개 장소 · ${d.tracks.length}개 경로`));rows.append(row);}$('importPreview').append(rows);if(importResult.warnings?.length){const ul=el('ul');for(const warning of importResult.warnings.slice(0,8))ul.append(el('li','',warning));$('importPreview').append(ul);}$('saveImport').disabled=!list.length;};active.onerror=()=>{if(disposed||worker!==active)return;stopWorker();$('importError').textContent='파일을 처리하지 못했어요. 올바른 타임라인 JSON인지 확인해주세요.';$('importProgress').textContent='';};active.postMessage({text,options:{person:selectedPerson,name:file.name,importedAt:Date.now()}});
    }catch(error){if(!disposed&&seq===importSeq){$('importError').textContent=error.message;$('importProgress').textContent='';}}
  }
  on($('timelineFile'),'change',()=>void previewImport());on($('importPerson'),'change',()=>void previewImport());
  on($('importForm'),'submit',async event=>{event.preventDefault();if(importing||!importResult)return;importing=true;$('saveImport').disabled=true;$('timelineFile').disabled=true;$('importPerson').disabled=true;$('importError').textContent='';
    try{for(const d of importResult.days){if(disposed)return;if(importDone.has(d.date))continue;$('importProgress').textContent=`${d.date} 저장 중 · ${importDone.size}/${importResult.days.length}일`;await request('/days/'+d.date+'/import',{method:'POST',body:{source:importResult.source,records:d.records,tracks:d.tracks}});if(disposed)return;importDone.add(d.date);}
      const last=importResult.days.at(-1)?.date;$('importProgress').textContent=`${importDone.size}일의 기록을 저장했어요. 같은 기록은 중복 저장하지 않았습니다.`;message('저장됨 · 둘만 보기');importing=false;await loadArchive();if(last){await loadMonth(last.slice(0,7));await selectDate(last);}
    }catch(error){if(!disposed){$('importError').textContent=`${error.message}\n${importDone.size}일은 저장됐어요. 다시 누르면 남은 날짜부터 이어갑니다.`;$('saveImport').disabled=false;$('saveImport').textContent='남은 기록 다시 추가';message('일부 기록 저장됨 · 다시 시도할 수 있어요');}}
    finally{importing=false;if(!disposed){$('timelineFile').disabled=false;$('importPerson').disabled=false;}}
  });
  for(const b of root.querySelectorAll('[data-close]'))on(b,'click',()=>closeDialog(b.dataset.close));
  for(const d of root.querySelectorAll('dialog'))on(d,'cancel',event=>{if(formSaving||importing)event.preventDefault();});
  for(const b of root.querySelectorAll('[data-person]'))on(b,'click',()=>{person=b.dataset.person;root.querySelectorAll('[data-person]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderDay();});
  on($('addRecord'),'click',()=>openRecord());on($('addPhoto'),'click',()=>openRecord(null,true));on($('addOldPhoto'),'click',()=>openRecord(null,true));
  on($('openImport'),'click',()=>{if(formSaving)return;$('saveImport').textContent='확인한 기록 추가';showDialog('importDialog');});
  on($('refreshDay'),'click',()=>void refresh());
  on($('archiveMonth'),'change',()=>{navigationTouched=true;if($('archiveMonth').value)void loadMonth($('archiveMonth').value);});
  const shiftMonth=delta=>{if(formSaving||importing)return;navigationTouched=true;const [y,m]=month.split('-').map(Number);void loadMonth(new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7));};
  on($('previousMonth'),'click',()=>shiftMonth(-1));on($('nextMonth'),'click',()=>shiftMonth(1));
  on($('playDay'),'click',()=>{const playing=map.play({duration:20,onProgress:value=>{if(!disposed)$('playState').textContent=`${Math.round(value.progress*100)}%`;},onComplete:()=>{if(!disposed){$('stopDay').hidden=true;$('playDay').hidden=false;$('playState').textContent='다시 보기를 마쳤어요';}}});if(playing){$('playDay').hidden=true;$('stopDay').hidden=false;}});
  on($('stopDay'),'click',()=>{map.stop();$('stopDay').hidden=true;$('playDay').hidden=false;$('playState').textContent='';});
  on(document,'visibilitychange',()=>{if(document.hidden){map.stop();$('stopDay').hidden=true;$('playDay').hidden=false;$('playState').textContent='';}});
  renderCalendar();renderDay();void(async()=>{const seq=daySeq;try{const latest=await loadArchive();if(disposed||seq!==daySeq||formSaving||navigationTouched)return;if(latest&&validDate(latest))date=latest;await loadMonth(date.slice(0,7));if(seq===daySeq&&!formSaving&&!navigationTouched)await selectDate(date);}catch(error){message(error.message,true);}})();
  return {dispose(){disposed=true;life.abort();stopWorker();map.destroy();clearPhotoViewer();urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();for(const d of root.querySelectorAll('dialog[open]'))d.close();day=null;days=[];months=[];preparedPhoto=null;editing=null;importResult=null;root.replaceChildren();}};
}
