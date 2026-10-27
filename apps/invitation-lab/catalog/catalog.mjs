export const studies = Object.freeze({
  a:{name:'한 줄로 이어지는 초대',description:'손글씨에서 시작한 한 줄이 날짜와 이야기, 사진의 가장자리로 이어집니다.'},
  b:{name:'사진이 놓이는 순간',description:'꽉 찬 사진이 한 장의 프레임이 되고, 겹쳐 있던 순간들이 차분하게 펼쳐집니다.'},
  c:{name:'빛이 머무는 장면',description:'사진 위를 지나는 부드러운 빛과 작은 여백으로, 읽는 순간에 집중합니다.'},
  d:{name:'우리의 작은 별자리',description:'처음 만난 날, 함께할 확신, 그리고 결혼. 세 장의 이야기를 빛으로 연결합니다.'},
  e:{name:'처음 만난 테이블',description:'커피숍에서 시작된 두 사람의 이야기를, 한 장의 편지와 테이블 위 사진으로 펼칩니다.'},
});
export const criteria = Object.freeze([
  ['mood','우리다운 분위기',25], ['motion','모션과 자연스러움',20],
  ['usability','정보 찾기와 사용',25], ['performance','속도와 가독성',20], ['maintainability','변경하기 편한 구성',10],
]);
const noteKey='sungso_invitation_lab_v61_comparison_v1';
const sections=new Set(['top','wedding-day','location','our-story','gallery','accounts','guestbook']);
export function normalizeNotes(value) {
  const clean={};
  if (!value || typeof value!=='object' || Array.isArray(value)) return clean;
  for (const id of Object.keys(studies)) {
    const row=value[id];
    if (!row || typeof row!=='object') continue;
    const ratings={};
    for (const [key] of criteria) {
      const score=row.ratings?.[key];
      if(Number.isInteger(score) && score>=1 && score<=5) ratings[key]=score;
    }
    clean[id]={text:typeof row.text==='string'?row.text.slice(0,1500):'',ratings};
  }
  return clean;
}
export function isTrustedFrameMessage(event, panes, origin) {
  return Boolean(event.source && event.origin===origin && Object.values(panes).some(pane=>pane.frame?.contentWindow===event.source));
}

export function setupCatalog(doc=document, win=window) {
  const byId=id=>doc.getElementById(id);
  const narrow=win.matchMedia('(max-width:760px)');
  const panes={left:{id:'a',frame:null,ready:false,playing:false},right:{id:'b',frame:null,ready:false,playing:false}};
  let split=false, audioPane='none', audioGeneration=0, disposed=false, saveTimer, resizeTimer;
  let notes={}, noteStudy='a', storageAvailable=true, notesInitialized=false;
  try { notes=normalizeNotes(JSON.parse(win.localStorage.getItem(noteKey)||'{}')); } catch { storageAvailable=false; }

  function post(pane, message) {
    if (pane?.frame?.contentWindow) pane.frame.contentWindow.postMessage({type:'invitation-lab:control',...message},win.location.origin);
  }
  function pauseAll() {
    for(const pane of Object.values(panes)) post(pane,{action:'audio',enabled:false});
  }
  function setAudio(value) {
    audioPane=['left','right'].includes(value)?value:'none';
    if(audioPane==='right' && !panes.right.frame) audioPane='none';
    byId('audio-select').value=audioPane;
    const generation=++audioGeneration;
    pauseAll();
    // Wait for both children to acknowledge silence before handing audio to one.
    const started=Date.now();
    function handover(){
      if(disposed || generation!==audioGeneration || audioPane==='none') return;
      const other=audioPane==='left'?panes.right:panes.left;
      if(other.playing){
        if(Date.now()-started<1200){win.setTimeout(handover,40);return;}
        audioPane='none';byId('audio-select').value='none';
        byId('comparison-status').textContent='음악을 멈추는 중이에요. 잠시 후 다시 선택해 주세요.';
        return;
      }
      post(panes[audioPane],{action:'audio',enabled:true});
      byId('comparison-status').textContent='선택한 시안의 음악만 사용할 수 있어요. 재생되지 않으면 시안 안의 음악 버튼을 눌러 주세요.';
    }
    handover();
    if(audioPane==='none') byId('comparison-status').textContent='음악을 껐어요. 시안 안에서 스크롤하며 비교해 보세요.';
  }
  function mount(side,id) {
    const pane=panes[side];
    if(!Object.hasOwn(studies,id)) return;
    post(pane,{action:'audio',enabled:false});
    pane.frame?.remove();pane.id=id;pane.ready=false;pane.playing=false;
    const frame=doc.createElement('iframe');
    frame.title=`${id.toUpperCase()} · ${studies[id].name} 청첩장 시안`;
    frame.src=`./${id}/?compare=1`;
    frame.allow='autoplay; clipboard-write; web-share';
    frame.referrerPolicy='same-origin';
    frame.addEventListener('load',()=>{
      if(pane.frame!==frame)return;
      post(pane,{action:'audio',enabled:false});
      const section=byId('section-select').value;
      if(section!=='top') post(pane,{action:'section',section});
      // The module may announce ready before the iframe load event. Reapply
      // the selected owner after that event's safety pause.
      if(pane.ready && audioPane===side) setAudio(side);
    });
    pane.frame=frame;
    byId(`${side}-frame`).replaceChildren(frame);
    byId(`${side}-study`).value=id;
    byId(`${side}-open`).href=`./${id}/`;
    byId(`${side}-open`).setAttribute('aria-label',`${id.toUpperCase()} · ${studies[id].name} 전체 화면으로 열기`);
    byId(`${side}-description`).textContent=studies[id].description;
    if(side==='left'){
      doc.querySelectorAll('[data-study]').forEach(button=>{
        const active=button.dataset.study===id;
        button.classList.toggle('is-selected',active);button.setAttribute('aria-pressed',String(active));
      });
      saveCurrent(false);noteStudy=id;byId('note-study').value=id;renderNotes();
    }
  }
  function setSplit(value) {
    split=Boolean(value) && !narrow.matches;
    byId('preview-layout').classList.toggle('is-split',split);
    doc.querySelector('[data-pane="right"]').hidden=!split;
    byId('single-view').setAttribute('aria-pressed',String(!split));
    byId('split-view').setAttribute('aria-pressed',String(split));
    byId('audio-select').querySelector('[value="right"]').disabled=!split;
    if(split && !panes.right.frame)mount('right',panes.right.id);
    if(!split && panes.right.frame){
      post(panes.right,{action:'audio',enabled:false});
      panes.right.frame.remove();panes.right.frame=null;panes.right.ready=false;panes.right.playing=false;
      if(audioPane==='right')setAudio('none');
    }
    if(audioPane!=='none')setAudio(audioPane);
  }
  function jump(section) {
    if(!sections.has(section))return;
    for(const pane of Object.values(panes))post(pane,{action:'section',section});
    const selected=byId('section-select').selectedOptions[0]?.textContent||'';
    byId('comparison-status').textContent=`${selected} 장면으로 이동했어요.`;
  }
  function renderNotes() {
    const row=notes[noteStudy]||{text:'',ratings:{}};
    byId('study-note').value=row.text;
    for(const [key] of criteria)for(const input of doc.querySelectorAll(`[name="rating-${key}"]`))input.checked=Number(input.value)===row.ratings[key];
    byId('note-status').textContent=storageAvailable?'':'브라우저 저장이 제한돼 현재 화면에서만 보관돼요.';
    notesInitialized=true;
  }
  function saveCurrent(report=true) {
    if(!notesInitialized || !byId('rating-grid').children.length)return;
    const ratings={};
    for(const [key] of criteria){const input=doc.querySelector(`[name="rating-${key}"]:checked`);if(input)ratings[key]=Number(input.value);}
    notes[noteStudy]={text:byId('study-note').value.slice(0,1500),ratings};
    try {win.localStorage.setItem(noteKey,JSON.stringify(normalizeNotes(notes)));storageAvailable=true;}
    catch {storageAvailable=false;}
    if(report)byId('note-status').textContent=storageAvailable?'이 기기에 보관했어요.':'저장이 제한돼 현재 화면에서만 보관했어요.';
  }
  for(const [key,label,weight] of criteria){
    const row=doc.createElement('div');row.className='rating-row';
    const text=doc.createElement('label');text.textContent=`${label} · ${weight}%`;text.id=`criterion-${key}`;
    const group=doc.createElement('div');group.className='rating-options';group.setAttribute('role','radiogroup');group.setAttribute('aria-labelledby',text.id);
    for(let score=1;score<=5;score++){
      const choice=doc.createElement('label'),input=doc.createElement('input'),number=doc.createElement('span');
      input.type='radio';input.name=`rating-${key}`;input.value=String(score);input.setAttribute('aria-label',`${label} ${score}점`);number.textContent=String(score);
      choice.append(input,number);group.append(choice);
    }
    row.append(text,group);byId('rating-grid').append(row);
  }
  const listeners=new AbortController(),options={signal:listeners.signal};
  doc.querySelectorAll('[data-study]').forEach(button=>button.addEventListener('click',()=>{
    mount('left',button.dataset.study);byId('section-select').value='top';
    byId('comparison').scrollIntoView({behavior:win.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});
  },options));
  for(const side of ['left','right'])byId(`${side}-study`).addEventListener('change',event=>mount(side,event.target.value),options);
  byId('single-view').addEventListener('click',()=>setSplit(false),options);
  byId('split-view').addEventListener('click',()=>setSplit(true),options);
  byId('section-select').addEventListener('change',event=>jump(event.target.value),options);
  byId('replay-all').addEventListener('click',()=>{
    byId('section-select').value='top';
    for(const pane of Object.values(panes))post(pane,{action:'replay'});
    byId('comparison-status').textContent='첫 화면의 손글씨를 다시 보고 있어요.';
  },options);
  byId('audio-select').addEventListener('change',event=>setAudio(event.target.value),options);
  byId('note-study').addEventListener('change',event=>{saveCurrent(false);noteStudy=event.target.value;renderNotes();},options);
  byId('notes-form').addEventListener('submit',event=>{event.preventDefault();clearTimeout(saveTimer);saveCurrent();},options);
  byId('notes-form').addEventListener('input',()=>{clearTimeout(saveTimer);saveTimer=win.setTimeout(()=>saveCurrent(),600);},options);
  narrow.addEventListener('change',()=>{clearTimeout(resizeTimer);resizeTimer=win.setTimeout(()=>{if(narrow.matches)setSplit(false);},100);},options);
  win.addEventListener('message',event=>{
    if(!isTrustedFrameMessage(event,panes,win.location.origin)||!event.data||typeof event.data!=='object')return;
    const side=Object.keys(panes).find(key=>panes[key].frame?.contentWindow===event.source),pane=panes[side];
    if(event.data.type==='invitation-lab:ready'){
      pane.ready=true;post(pane,{action:'audio',enabled:false});
      const section=byId('section-select').value;if(section!=='top')post(pane,{action:'section',section});
      if(audioPane===side)setAudio(side);
    }else if(event.data.type==='invitation-lab:audio-state'){
      pane.playing=event.data.playing===true;
      if(pane.playing && audioPane!==side)post(pane,{action:'audio',enabled:false});
    }
  },options);
  win.addEventListener('pagehide',()=>{saveCurrent(false);pauseAll();},options);
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden)pauseAll();else if(audioPane!=='none')setAudio(audioPane);},options);
  mount('left','a');setSplit(false);renderNotes();
  return {destroy(){disposed=true;audioGeneration++;pauseAll();listeners.abort();clearTimeout(saveTimer);clearTimeout(resizeTimer);for(const pane of Object.values(panes))pane.frame?.remove();},panes};
}
if(typeof document!=='undefined')setupCatalog();
