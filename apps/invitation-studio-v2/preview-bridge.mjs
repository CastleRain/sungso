import {CONTENT_FIELDS} from './js/content-draft.mjs';
// Editor-only additions. Independent preview/guest pages do not install editing handlers.
if(window.parent!==window && new URLSearchParams(location.search).get('compare')==='1'){
  const origin=location.origin,send=data=>parent.postMessage(data,origin);
  let enabled=true,anchor=null,generation=0,observer,timeout;
  const root=id=>id==='top'?document.querySelector('.hero'):id==='closing'?document.querySelector('.closing-section'):document.getElementById(id);
  function cancelAnchor(){anchor=null;observer?.disconnect();clearTimeout(timeout);}
  function remember(id){cancelAnchor();generation=id;const sections=[...document.querySelectorAll('main.paper > section, main.paper > header')].filter(n=>n.offsetHeight>0);const node=sections.find(n=>n.getBoundingClientRect().bottom>32);if(node)anchor={node,ratio:Math.max(0,-node.getBoundingClientRect().top)/Math.max(1,node.offsetHeight),top:Math.max(0,node.getBoundingClientRect().top),id};}
  function restore(id){if(!anchor||anchor.id!==id||generation!==id||document.querySelector('dialog[open]'))return;const {node,ratio,top}=anchor;if(!node.isConnected)return;window.scrollTo({top:Math.max(0,scrollY+node.getBoundingClientRect().top+ratio*node.offsetHeight-top),behavior:'instant'});}
  window.addEventListener('message',event=>{
    if(event.origin!==origin||event.source!==parent)return;const d=event.data;
    if(d?.type==='studio-v2:prepare'&&Number.isSafeInteger(d.requestId)){if(d.preserve===true)remember(d.requestId);else{cancelAnchor();generation=d.requestId;}}
    if(d?.type==='studio-v2:settle'&&d.requestId===generation&&anchor){restore(d.requestId);observer=new ResizeObserver(()=>restore(d.requestId));observer.observe(document.querySelector('main.paper'));timeout=setTimeout(cancelAnchor,1600);}
    if(d?.type==='studio-v2:editing'&&typeof d.enabled==='boolean'){enabled=d.enabled;if(!enabled)editor?.close();}
  });
  for(const type of ['wheel','pointerdown','touchstart','keydown'])window.addEventListener(type,cancelAnchor,{capture:true,passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnchor();editor?.close();}});
  const maps=[['.invitation-copy','invitation'],['.closing-copy','closing'],['.family-person:first-child strong','groom'],['.family-person:nth-child(2) strong','bride'],...Array.from({length:3},(_,i)=>[['h3','Title'],['p:not(.story-note)','Body'],['blockquote','Quote'],['.story-note','Note']].map(([selector,suffix])=>[`.story-page[data-chapter="${i}"] .story-page-copy ${selector}`,`story${i+1}${suffix}`])).flat()];
  const style=document.createElement('style');style.textContent='.v2-inline-dialog{width:min(340px,90vw);padding:22px;border:1px solid var(--line);border-radius:12px;background:var(--paper);color:var(--ink);font:14px var(--font-body,serif)}.v2-inline-dialog::backdrop{background:rgb(20 40 60 / 25%)}.v2-inline-dialog textarea{box-sizing:border-box;width:100%;min-height:150px;margin:12px 0;padding:12px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font:inherit;line-height:1.8}.v2-inline-dialog button{font:inherit;min-height:44px;padding:8px 14px;border:1px solid var(--line);background:var(--soft);color:var(--ink);border-radius:6px;margin-right:8px}';document.head.append(style);
  const editor=document.createElement('dialog');editor.className='v2-inline-dialog';editor.setAttribute('aria-labelledby','v2-inline-title');
  const title=document.createElement('h3');title.id='v2-inline-title';const input=document.createElement('textarea');input.setAttribute('aria-label','문구 직접 편집');const save=document.createElement('button'),close=document.createElement('button');save.textContent='문구 반영';close.textContent='취소';editor.append(title,input,save,close);document.body.append(editor);
  let field,trigger;close.onclick=()=>editor.close();editor.addEventListener('close',()=>trigger?.focus?.({preventScroll:true}));
  save.onclick=()=>{if(!field)return;send({type:'studio-v2:text',field:field.id,value:input.value});editor.close();};
  document.addEventListener('dblclick',event=>{if(!enabled||event.target.closest('button,a,input,textarea,select'))return;for(const [selector,id] of maps){const node=event.target.closest(selector);if(!node)continue;field=CONTENT_FIELDS.find(f=>f.id===id);if(!field)return;event.preventDefault();trigger=node;title.textContent=field.label;input.maxLength=field.limit;input.value=node.textContent.trim();editor.showModal();input.focus();return;}if(event.target.closest('#gallery'))send({type:'studio-v2:photos'});});
}
