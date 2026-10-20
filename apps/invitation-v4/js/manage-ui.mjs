import { defaultPhotos, MAX_ALBUM_PHOTOS, validateAlbumItems } from '../../../shared/invitation/album-core.mjs?v=4.0.0';
import { prepareAlbumPhoto } from './album-image.mjs?v=4.0.0';
const itemOf=p=>({id:p.id,kind:p.kind,alt:p.alt});
export function mountAlbumManager({root,api,preview=false}) {
  let disposed=false,ready=false,busy=false,revision=0,draft=[],saved=[],library=[],dragged;
  const blobs=new Map(),loading=new Set();
  const imageQueue=[];let activeImages=0;
  function readPhoto(id){return new Promise((resolve,reject)=>{imageQueue.push({id,resolve,reject});pumpImages();});}
  function pumpImages(){while(!disposed&&activeImages<2&&imageQueue.length){const task=imageQueue.shift();activeImages++;Promise.resolve().then(()=>api.photo(task.id)).then(task.resolve,task.reject).finally(()=>{activeImages--;pumpImages();});}}
  root.innerHTML='<div class="manager"><p class="manager-preview-note" id="manager-preview" hidden>로컬 미리보기 · 운영 사진첩과 분리되어 있어요</p><header class="manager-header"><div><p class="manager-eyebrow">SUNGWOO &amp; SOHEE</p><h1>사진첩 관리</h1></div><a href="./" target="_blank" rel="noopener">청첩장 보기 ↗</a></header><p class="manager-copy">사진을 추가하고 순서를 바꿔 보세요.<br>‘청첩장에 반영’을 눌러야 하객에게 보이는 사진이 바뀝니다.</p><div class="manager-toolbar"><button type="button" id="manager-add">사진 추가</button><input class="manager-file" id="manager-files" type="file" accept="image/jpeg,image/png,image/webp" multiple><button type="button" id="manager-reload">최신 사진첩 불러오기</button><p class="manager-count" id="manager-count"></p></div><p class="manager-status" id="manager-status" role="status">사진첩을 불러오고 있어요.</p><ol class="editor-grid" id="editor-grid" aria-label="공개할 사진 순서"></ol><details class="manager-library"><summary>사진 보관함에서 다시 넣기</summary><p class="manager-note">사진첩에서 뺀 사진도 여기에서 다시 넣을 수 있어요.</p><div class="library-grid" id="library-grid"></div></details><footer class="manager-footer"><p>앞으로·뒤로 버튼으로 순서를 바꿀 수 있어요.<br>컴퓨터에서는 사진을 끌어서 옮길 수도 있어요.</p><button type="button" class="manager-primary" id="manager-publish">청첩장에 반영</button></footer></div>';
  const q=s=>root.querySelector(s),status=text=>{if(!disposed)q('#manager-status').textContent=text;};
  q('#manager-preview').hidden=!preview;
  const dirty=()=>JSON.stringify(draft.map(itemOf))!==JSON.stringify(saved);
  const metadata=p=>p.kind==='static'?defaultPhotos.find(photo=>photo.id===p.id):p.local||library.find(photo=>photo.id===p.id);
  async function setImage(image,p) {
    if(p.kind==='static'){image.src=metadata(p).thumb;return;}
    if(p.local){image.src=p.local.thumb;return;}
    if(blobs.has(p.id)){image.src=blobs.get(p.id);return;}
    if(loading.has(p.id))return;loading.add(p.id);
    try{const blob=await readPhoto(p.id);if(disposed)return;const url=URL.createObjectURL(blob);blobs.set(p.id,url);root.querySelectorAll(`img[data-manager-image="${p.id}"]`).forEach(node=>{node.src=url;});}
    catch{if(!disposed)image.alt='사진을 불러오지 못했어요. 최신 사진첩을 다시 확인해 주세요.';}
    finally{loading.delete(p.id);}
  }
  function controls(){q('#manager-add').disabled=!ready||busy;q('#manager-reload').disabled=busy;q('#manager-publish').disabled=!ready||busy||!dirty();q('#manager-count').textContent=`${draft.length} / ${MAX_ALBUM_PHOTOS}장`;} 
  function move(id,to){if(busy)return;const from=draft.findIndex(p=>p.id===id);if(from<0||to<0||to>=draft.length)return;const[p]=draft.splice(from,1);draft.splice(to,0,p);render();q(`[data-editor-photo="${id}"] button`)?.focus({preventScroll:true});}
  function addFromLibrary(p){if(draft.length>=MAX_ALBUM_PHOTOS){status('사진첩에는 최대 20장을 넣을 수 있어요.');return;}draft.push(itemOf(p));render();status('사진을 넣었어요. 반영 버튼을 누르면 공개됩니다.');}
  function render() {
    if(disposed)return;const grid=q('#editor-grid');grid.replaceChildren();
    draft.forEach((p,index)=>{
      const card=document.createElement('li');card.className='editor-card';card.dataset.editorPhoto=p.id;card.draggable=!busy;
      const image=document.createElement('img');image.alt=p.alt;image.dataset.managerImage=p.id;void setImage(image,p);
      const label=document.createElement('p');label.className='editor-photo-number';label.textContent=`${index+1}번째 사진`;
      const buttons=document.createElement('div');buttons.className='editor-card-controls';
      for(const[title,offset]of [['앞으로',-1],['뒤로',1]]){const button=document.createElement('button');button.type='button';button.textContent=title;button.setAttribute('aria-label',`${index+1}번째 사진 ${title}`);button.disabled=busy||index+offset<0||index+offset>=draft.length;button.addEventListener('click',()=>move(p.id,index+offset));buttons.append(button);}
      const remove=document.createElement('button');remove.type='button';remove.className='editor-remove';remove.textContent='사진첩에서 빼기';remove.setAttribute('aria-label',`${index+1}번째 사진 빼기`);remove.disabled=busy;remove.addEventListener('click',()=>{draft=draft.filter(photo=>photo.id!==p.id);render();status('사진첩에서 뺐어요. 반영 전에는 하객 화면이 바뀌지 않아요.');});buttons.append(remove);
      card.append(image,label,buttons);grid.append(card);
      card.addEventListener('dragstart',event=>{if(busy||event.target.closest('input,button')){event.preventDefault();return;}dragged=p.id;event.dataTransfer.setData('text/plain',p.id);});
      card.addEventListener('dragover',event=>{if(dragged)event.preventDefault();});card.addEventListener('drop',event=>{event.preventDefault();if(dragged)move(dragged,index);dragged=undefined;});card.addEventListener('dragend',()=>{dragged=undefined;});
    });
    if(!draft.length){const empty=document.createElement('li');empty.className='manager-empty';empty.textContent='사진을 추가하거나 보관함에서 골라 주세요.';grid.append(empty);}
    const remaining=[...defaultPhotos.map(p=>({...p,kind:'static'})),...library].filter(p=>!draft.some(photo=>photo.id===p.id));
    const shelf=q('#library-grid');shelf.replaceChildren();
    remaining.forEach(p=>{const card=document.createElement('div');card.className='library-card';const image=document.createElement('img');image.alt=p.alt;image.dataset.managerImage=p.id;if(p.kind==='static'||q('.manager-library').open)void setImage(image,p);const button=document.createElement('button');button.type='button';button.textContent='사진첩에 넣기';button.disabled=busy;button.addEventListener('click',()=>addFromLibrary(p));card.append(image,button);shelf.append(card);});
    if(!remaining.length){const empty=document.createElement('p');empty.className='manager-empty';empty.textContent='보관함의 사진이 모두 사진첩에 있어요.';shelf.append(empty);}
    controls();
  }
  async function load(){busy=true;controls();status('최신 사진첩을 불러오고 있어요.');try{const data=await api.request('/manage');if(disposed)return;revision=data.revision;saved=validateAlbumItems(data.items);library=data.library;draft=saved.map(p=>({...p}));ready=true;render();status('사진을 편집한 뒤 청첩장에 반영해 주세요.');}catch(error){status(error.message);}finally{if(!disposed){busy=false;render();}}}
  q('#manager-add').addEventListener('click',()=>q('#manager-files').click());
  q('.manager-library').addEventListener('toggle',()=>{if(q('.manager-library').open)render();});
  q('#manager-files').addEventListener('change',async event=>{
    const files=[...event.target.files];event.target.value='';if(!files.length)return;
    if(files.length+draft.length>MAX_ALBUM_PHOTOS){status('사진첩에는 최대 20장을 넣을 수 있어요.');return;}
    busy=true;render();
    try{for(const[fileIndex,file]of files.entries()){status(`사진 준비 중 ${fileIndex+1} / ${files.length}`);const local=await prepareAlbumPhoto(file);if(disposed)return;draft.push({id:crypto.randomUUID(),kind:'upload',alt:'성우와 소희의 사진',local});}status('사진을 추가했어요. 반영 버튼을 누르면 공개됩니다.');}
    catch(error){status(error.message);}finally{if(!disposed){busy=false;render();}}
  });
  q('#manager-reload').addEventListener('click',()=>{if(dirty()&&!confirm('아직 반영하지 않은 변경을 버리고 최신 사진첩을 불러올까요?'))return;void load();});
  q('#manager-publish').addEventListener('click',async()=>{
    if(busy||!ready)return;busy=true;render();
    try{
      validateAlbumItems(draft.map(itemOf));
      for(const p of draft.filter(photo=>photo.local)){
        status('새 사진을 업로드하고 있어요.');const data=await api.request('/upload',{method:'POST',body:{id:p.id,expectedRevision:revision,alt:p.alt,full:p.local.full,thumb:p.local.thumb}});if(disposed)return;
        revision=data.revision;library=data.library;delete p.local;
      }
      status('청첩장에 반영하고 있어요.');const data=await api.request('/publish',{method:'PUT',body:{expectedRevision:revision,items:draft.map(itemOf)}});if(disposed)return;
      revision=data.revision;saved=validateAlbumItems(data.items);draft=saved.map(p=>({...p}));library=data.library;status('반영했어요. 청첩장을 새로 열면 변경한 사진을 볼 수 있어요.');
    }catch(error){status(error.message+' 편집 중인 내용은 남아 있어요.');}finally{if(!disposed){busy=false;render();}}
  });
  function beforeLeave(event){if(dirty()){event.preventDefault();event.returnValue='';}}
  addEventListener('beforeunload',beforeLeave);void load();
  return {dispose(){disposed=true;imageQueue.splice(0).forEach(task=>task.reject(Error('Signed out')));removeEventListener('beforeunload',beforeLeave);blobs.forEach(url=>URL.revokeObjectURL(url));blobs.clear();draft=[];library=[];saved=[];root.replaceChildren();}};
}
