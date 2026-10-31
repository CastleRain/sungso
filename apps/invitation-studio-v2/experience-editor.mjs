import {EXPERIENCE_FIELDS,EXPERIENCE_LISTS,experienceDefaults,normalizeExperience,MEDIA_LIMIT,personalizedLink} from './js/experience-config.mjs';
import {resolveDraftPhotos} from './js/content-draft.mjs';

export function mountExperienceEditor({root,getSnapshot,onDraft,config,notify,doc=document,win=window}) {
  let queue=Promise.resolve();
  let group='top',generation=0,recording,stream,recordTimer;
  const el=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
  const state=()=>experienceDefaults(getSnapshot().content.experience);
  const save=change=>{const job=queue.then(async()=>{try{const current=state();change(current);await onDraft({...getSnapshot().content,experience:normalizeExperience(current)});return true;}catch(e){notify(e.message);return false;}});queue=job.catch(()=>{});return job;};
  function inputFor(f,value,change){
    const label=el('label','experience-field'),title=el('span','',f.label);label.append(title);
    const input=el(f.type==='textarea'?'textarea':['select','photo','media'].includes(f.type)?'select':'input');
    if(input.tagName==='INPUT')input.type=['text','tel','time','date','datetime-local','checkbox','number','url'].includes(f.type)?f.type:'text';
    if(input.tagName==='SELECT'){
      let opts=f.options?.map((v,i)=>[v,f.labels?.[i]||v]);
      if(f.type==='photo')opts=[['','선택 안 함'],...resolveDraftPhotos(getSnapshot().content,config.photos).map((p,i)=>[p.id,`${i+1}번째 사진`])];
      if(f.type==='media')opts=[['','선택 안 함'],...state().media.filter(m=>m.src.startsWith(`data:${f.accept||'audio'}/`)).map(m=>[m.id,m.name])];
      for(const [v,t]of opts||[]) {const o=el('option','',t);o.value=v;input.append(o);}
    }
    if(f.type==='checkbox')input.checked=value===true;else input.value=value??f.default??'';
    if(f.type==='number'){input.type='range';input.min=f.min;input.max=f.max;input.step=1;}
    if(f.type==='textarea')input.rows=3;
    input.setAttribute('aria-label',f.label);if(f.type==='number'){const valueLabel=el('output','',String(input.value)+'%');input.oninput=()=>valueLabel.textContent=input.value+'%';label.append(valueLabel);}
    input.onchange=async()=>{const value=f.type==='checkbox'?input.checked:f.type==='number'?Number(input.value):input.value;input.setAttribute('aria-invalid',String(!await change(value)));};
    label.append(input);return label;
  }
  async function addMedia(file){
    if(!file)return;if(file.size*4/3>MEDIA_LIMIT){notify('짧게 편집한 1.3MB 이하 파일을 선택해 주세요. 사진과 합쳐 공동 초안 3MB 한도를 사용해요.');return;}
    const type=file.type||(/\.mp3$/i.test(file.name)?'audio/mpeg':/\.m4a$/i.test(file.name)?'audio/mp4':'');
    const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const media={id:'media_'+win.crypto.randomUUID(),name:file.name||'두 사람의 음성',src:`data:${type};base64,${btoa(binary)}`};
    if(await save(e=>e.media.push(media))){notify('자료를 이 초안에 추가했어요. 사용할 곳에서 선택해 주세요.');render(group);}
  }
  function stopRecording(){clearTimeout(recordTimer);if(recording?.state==='recording')recording.stop();stream?.getTracks().forEach(t=>t.stop());stream=null;}
  function render(id){group=id;generation++;root.replaceChildren();const fields=EXPERIENCE_FIELDS.filter(f=>f.group===id);const lists=Object.entries(EXPERIENCE_LISTS).filter(([,s])=>s.group===id);root.hidden=!fields.length&&!lists.length; if(root.hidden)return;
    root.append(el('h3','','이 장면에 더할 내용'),el('p','helper','입력한 내용만 보여요. 공동 저장 후 공개하기 전까지 하객 화면은 바뀌지 않아요.'));
    const e=state();
    for(const f of fields)root.append(inputFor(f,e.values[f.id],v=>save(e=>e.values[f.id]=v)));
    for(const [key,spec]of lists){const details=el('details','experience-repeater');details.open=true;const summary=el('summary','',`${spec.label} · ${(e.lists[key]||[]).length}/${spec.max}`);details.append(summary);
      (e.lists[key]||[]).forEach((row,i)=>{const box=el('fieldset');box.append(el('legend','',`${i+1}번째`));for(const f of spec.fields)box.append(inputFor(f,row[f.id],v=>save(e=>e.lists[key][i][f.id]=v)));const remove=el('button','','이 항목 제외');remove.type='button';remove.onclick=async()=>{if(await save(e=>e.lists[key].splice(i,1)))render(group);};box.append(remove);details.append(box);});
      const add=el('button','experience-add','＋ 항목 추가');add.type='button';add.disabled=(e.lists[key]||[]).length>=spec.max;add.onclick=async()=>{if(await save(e=>(e.lists[key]??=[]).push({})))render(group);};details.append(add);root.append(details);
    }
    if(['top','invitation','gallery','playlist'].includes(id)){
      const details=el('details','experience-repeater'),summary=el('summary','','영상·음성 자료 보관함');details.append(summary,el('p','helper','MP4/WebM · MP3/M4A/Ogg/WebM, 파일 약 1.3MB·합계 약 1.8MB. 자동으로 공개되지 않아요. 긴 원본은 짧고 가벼운 사본으로 준비해 주세요.'));
      const upload=el('input');upload.type='file';upload.accept='video/mp4,video/webm,audio/mpeg,audio/mp4,audio/webm,audio/ogg';upload.setAttribute('aria-label','영상·음성 파일 추가');upload.onchange=()=>{void addMedia(upload.files?.[0]).catch(()=>notify('파일을 읽지 못했어요. 다시 선택해 주세요.'));upload.value='';};details.append(upload);
      for(const media of e.media){const row=el('div','media-row');row.append(el('span','',media.name));const remove=el('button','','제외');remove.onclick=async()=>{if(await save(e=>{e.media=e.media.filter(m=>m.id!==media.id);for(const key of Object.keys(e.values))if(e.values[key]===media.id)e.values[key]='';for(const rows of Object.values(e.lists))for(const row of rows)for(const k of Object.keys(row))if(row[k]===media.id)row[k]='';}))render(group);};row.append(remove);details.append(row);}
      const record=el('button','','마이크로 15초 녹음'),stop=el('button','','녹음 마치기');stop.hidden=true;
      record.onclick=async()=>{const startedAt=generation;record.disabled=true;let activeStream;
        try{activeStream=await win.navigator.mediaDevices.getUserMedia({audio:true});if(generation!==startedAt){activeStream.getTracks().forEach(t=>t.stop());return;}stream=activeStream;
          const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(m=>win.MediaRecorder.isTypeSupported(m));
          const activeRecorder=new win.MediaRecorder(activeStream,mime?{mimeType:mime,audioBitsPerSecond:64000}:{audioBitsPerSecond:64000});recording=activeRecorder;const chunks=[];
          activeRecorder.ondataavailable=ev=>chunks.push(ev.data);
          activeRecorder.onstop=()=>{activeStream.getTracks().forEach(t=>t.stop());if(recording===activeRecorder){clearTimeout(recordTimer);recording=null;stream=null;}record.disabled=false;stop.hidden=true;const type=activeRecorder.mimeType.split(';')[0];void addMedia(new File(chunks,'두 사람의 음성 인사',{type})).catch(()=>notify('녹음 파일을 저장하지 못했어요. 다시 시도해 주세요.'));};
          activeRecorder.start();stop.hidden=false;recordTimer=setTimeout(stopRecording,15000);
        }catch{activeStream?.getTracks().forEach(t=>t.stop());record.disabled=false;notify('마이크 사용을 허용하거나 녹음 파일을 추가해 주세요.');}};
      stop.onclick=stopRecording;details.append(record,stop);root.append(details);
    }
    if(id==='top'||id==='closing'){
      const details=el('details','experience-repeater');details.append(el('summary','','맞춤 초대 · 에디션 링크'));
      for(const [key,title]of [['parents','부모님·어르신용'],['friends','친구·지인용']]){const b=el('button','',`현재 디자인을 ${title}으로 보관`);b.onclick=()=>save(e=>{e.editions[key]=getSnapshot().composition;}).then(ok=>ok&&notify(`${title} 디자인을 이 초안에 보관했어요.`));details.append(b);}
      const people=el('textarea');people.placeholder='초대할 이름을 한 줄씩 (최대 30명)';people.setAttribute('aria-label','맞춤 초대 이름');const edition=el('select');for(const [id,name]of [['standard','기본 초대'],['parents','부모님·어르신용'],['friends','친구용']]){const option=el('option','',name);option.value=id;edition.append(option);}const result=el('textarea');result.readOnly=true;result.setAttribute('aria-label','생성한 초대 링크');const make=el('button','','링크 만들기');make.onclick=()=>{const names=people.value.split('\n').map(n=>n.trim()).filter(Boolean).slice(0,30);result.value=(names.length?names:['']).map(name=>`${name?name+' · ':''}${personalizedLink('https://sungso-wedding.vercel.app/',{name,edition:edition.value})}`).join('\n');};const copy=el('button','','만든 링크 복사');copy.onclick=()=>win.navigator.clipboard.writeText(result.value).then(()=>notify('초대 링크 목록을 복사했어요.'),()=>{result.focus();result.select();notify('선택한 주소를 복사해 주세요.');});details.append(copy);details.append(el('p','helper','이름별 초대를 켜고 이 초안을 공개한 뒤 사용해 주세요. 이름은 링크를 전달받은 사람도 볼 수 있어요. 이름 목록은 저장하지 않아요.'),people,edition,make,result);root.append(details);
    }
  }
  return {render,stop:stopRecording,destroy:()=>{generation++;stopRecording();root.replaceChildren();}};
}
