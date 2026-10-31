import {parseLibrary,selectSaved,parseImport,exportSelection,cleanName,cleanNote,cleanRating,updateSaved,LIBRARY_LIMIT} from './js/saved-library.mjs';
import {normalizeComposition} from './js/composition.mjs';
import {CONTENT_FILE_BYTES} from './js/content-draft.mjs';
import {validateSnapshot} from './model.mjs';
export const LIBRARY_KEY='sungso_invitation_studio_combinations_v1';
export function mountLibrary({getSnapshot,loadSnapshot,notify}) {
  const $=id=>document.getElementById(id),dialog=$('library-dialog');
  let records=[],raw=null,readFailed=false,visible=6,editing=null;
  const metadata=()=>({name:cleanName($('combination-name').value)||'우리의 조합',note:cleanNote($('combination-note').value),rating:cleanRating(Number($('combination-rating').value))});
  const fill=record=>{$('combination-name').value=record.name;$('combination-note').value=record.note;$('combination-rating').value=String(record.rating);};
  function read(){try{raw=localStorage.getItem(LIBRARY_KEY);records=parseLibrary(raw);readFailed=false;}catch{readFailed=true;$('library-status').textContent='기존 보관함을 읽지 못했어요. 덮어쓰지 않고 파일 보관을 사용할 수 있어요.';}}
  function persist(next){
    if(readFailed){notify('보관함을 읽지 못해 덮어쓰지 않았어요.');return false;}
    try{if(localStorage.getItem(LIBRARY_KEY)!==raw){read();render();notify('다른 창의 변경을 불러왔어요. 다시 저장해 주세요.');return false;}
      const encoded=JSON.stringify(next);localStorage.setItem(LIBRARY_KEY,encoded);raw=encoded;records=next;render();return true;
    }catch{notify('기기에 저장하지 못했어요. 파일로 보관해 주세요.');return false;}
  }
  function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function render(){
    const found=selectSaved(records,{search:$('library-search').value,favorites:$('library-favorites').checked,sort:$('library-sort').value});
    $('library-list').replaceChildren();$('library-more').hidden=found.length<=visible;
    if(!readFailed)$('library-status').textContent=`이 기기에 ${records.length} / ${LIBRARY_LIMIT}개 · 검색 결과 ${found.length}개`;
    for(const item of found.slice(0,visible)){
      const li=document.createElement('li'),name=document.createElement('strong'),note=document.createElement('p');name.textContent=item.name;note.textContent=`${'★'.repeat(item.rating)} ${item.note}`;
      const load=document.createElement('button');load.textContent='불러오기';load.onclick=async()=>{await loadSnapshot({...getSnapshot(),composition:item.composition});fill(item);dialog.close();notify('디자인을 불러왔어요. 현재 문구·사진은 유지해요.');};
      const edit=document.createElement('button');edit.textContent='이름·별점 수정';edit.onclick=()=>{editing=item.id;fill(item);$('save-combination').textContent='이름·별점·메모 저장';$('combination-name').focus();};
      const remove=document.createElement('button');remove.textContent='보관 해제';remove.onclick=()=>{if(confirm(`‘${item.name}’을 이 기기 보관함에서 삭제할까요?`))persist(records.filter(r=>r.id!==item.id));};
      li.append(name,note,load,edit,remove);$('library-list').append(li);
    }
  }
  $('save-combination').onclick=()=>{
    if(editing){if(persist(updateSaved(records,editing,metadata()))){editing=null;$('save-combination').textContent='디자인 새로 보관 ＋';notify('이름과 메모를 저장했어요.');}return;}
    if(records.length>=LIBRARY_LIMIT){notify('디자인은 40개까지 보관할 수 있어요.');return;}
    const now=Date.now();if(persist([{id:crypto.randomUUID(),...metadata(),createdAt:now,updatedAt:now,composition:normalizeComposition(getSnapshot().composition)},...records]))notify('디자인을 이 기기 보관함에 저장했어요.');
  };
  for(const id of ['library-search','library-favorites','library-sort'])$(id).addEventListener('input',()=>{visible=6;render();});
  $('library-more').onclick=()=>{visible+=6;render();};
  $('export-current').onclick=()=>download({kind:'sungso-studio-v2-project',version:1,...metadata(),...getSnapshot()},'sungso-studio-project.json');
  $('export-library').onclick=()=>download({version:1,kind:'sungso-studio-library',items:records},'sungso-studio-library.json');
  $('import-file').onchange=async event=>{
    try{const file=event.target.files[0];if(!file)return;if(file.size>CONTENT_FILE_BYTES)throw Error('파일 용량이 너무 커요.');const text=await file.text(),rawData=JSON.parse(text);
      if(rawData.kind==='sungso-studio-v2-project'){const value=validateSnapshot(rawData);await loadSnapshot(value);fill({name:cleanName(rawData.name),note:cleanNote(rawData.note),rating:cleanRating(rawData.rating)});dialog.close();notify('디자인과 문구·사진을 함께 불러왔어요.');}
      else {const data=parseImport(text);if(data.kind==='library'){if(records.length+data.items.length>LIBRARY_LIMIT)throw Error('모두 더하면 보관함 40개를 넘어요.');persist([...data.items.map(r=>({...r,id:crypto.randomUUID(),updatedAt:Date.now()})),...records]);}
        else{await loadSnapshot({...getSnapshot(),composition:data.composition});fill(data);dialog.close();notify('V1 디자인 파일을 불러왔어요.');}}
    }catch(e){notify(e.message||'이 스튜디오에서 저장한 파일을 선택해 주세요.');}finally{event.target.value='';}
  };
  window.addEventListener('storage',event=>{if(event.key===LIBRARY_KEY){read();render();}});
  read();render();
  return {open(){render();dialog.showModal();},metadata};
}
