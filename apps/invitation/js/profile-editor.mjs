import { emptyProfile, MAX_GALLERY, validateProfile } from './profile-core.mjs?v=20260915-venue-map';
import { preparePhoto } from './profile-images.mjs?v=20260915-venue-map';
import { escapeHtml as e } from './core.mjs?v=20260915-venue-map';

export function profileErrorMessage(error) {
  const code=String(error?.code || '').replace(/^firestore\//,'');
  const messages={
    'permission-denied':'사진·예식장을 저장하거나 불러올 권한이 없어요. 승인된 계정인지 확인해주세요.',
    unauthenticated:'로그인이 만료됐어요. 다시 로그인한 뒤 시도해주세요.',
    unavailable:'인터넷 연결이 원활하지 않아요. 연결을 확인하고 다시 시도해주세요.',
    'deadline-exceeded':'응답을 기다리는 시간이 길어졌어요. 잠시 후 다시 시도해주세요.',
    'resource-exhausted':'지금은 저장 서비스의 이용 한도에 도달했어요. 잠시 후 다시 시도해주세요.',
    aborted:'다른 변경과 저장이 겹쳤어요. 최신 설정을 확인한 뒤 다시 저장해주세요.',
    cancelled:'요청이 중단됐어요. 연결을 확인하고 다시 시도해주세요.',
  };
  if(messages[code])return messages[code];
  const message=typeof error==='string'?error:error?.message;
  return typeof message==='string'&&/[가-힣]/.test(message)?message:'사진·예식장 작업을 마치지 못했어요. 연결을 확인하고 다시 시도해주세요.';
}

export function createProfileEditor({dialog, getState, save, onSaved = () => {}, isActive = () => true}) {
  let draft, photos = {}, added = {}, revision = 0, epoch = 0, busy = false, disposed = false;
  const content = () => dialog.querySelector('.profile-editor-content');
  const status = (message,error=false) => { const node=dialog.querySelector('[data-profile-status]');if(node){node.textContent=message;node.dataset.error=String(error);} };
  const fieldNames = ['name','hall','address','mapUrl','naverUrl','kakaoUrl','transport','parking'];
  function readFields() { if(draft) for(const key of fieldNames) draft.venue[key]=dialog.querySelector(`[name="venue-${key}"]`)?.value.trim() || ''; }
  function actionsDisabled(value) { busy=value;dialog.querySelectorAll('input,textarea,[data-profile-action]').forEach(node=>{node.disabled=value;}); }
  const photoCard = (id,index,cover=false) => `<div class="profile-photo-card${cover?' profile-cover-photo':''}"><img src="${e(photos[id]?.dataUrl || '')}" alt="${cover?'대표사진':`갤러리 사진 ${index+1}`}" width="${photos[id]?.width || 1}" height="${photos[id]?.height || 1}"><div>${cover ? '<span>대표사진</span>' : `<span>${index+1}</span><button type="button" data-profile-action="use-cover" data-photo="${id}">${draft.coverId===id?'대표사진으로 사용 중':'대표사진으로'}</button>`}<button type="button" data-profile-action="${cover?'remove-cover':'remove-photo'}" data-photo="${id}" aria-label="${cover?'대표사진':`갤러리 사진 ${index+1}`} 빼기">×</button></div>${cover?'':`<div class="profile-photo-order"><button type="button" data-profile-action="earlier" data-photo="${id}" ${index===0?'disabled':''} aria-label="사진 ${index+1} 앞으로">←</button><button type="button" data-profile-action="later" data-photo="${id}" ${index===draft.galleryIds.length-1?'disabled':''} aria-label="사진 ${index+1} 뒤로">→</button></div>`}</div>`;
  function renderPhotos() {
    dialog.querySelector('[data-profile-cover]').innerHTML=draft.coverId?photoCard(draft.coverId,0,true):'<div class="profile-photo-empty">사진을 담으면<br>사진 표지에 함께 적용돼요.</div>';
    dialog.querySelector('[data-profile-gallery]').innerHTML=draft.galleryIds.map((id,index)=>photoCard(id,index)).join('');
    dialog.querySelector('[data-profile-count]').textContent=`${draft.galleryIds.length} / ${MAX_GALLERY}`;
    const map=dialog.querySelector('[data-profile-map]'),mapPhoto=photos[draft.mapImageId];
    if(map)map.innerHTML=mapPhoto?`<div class="profile-map-preview"><img src="${e(mapPhoto.dataUrl)}" alt="등록한 약도" width="${mapPhoto.width}" height="${mapPhoto.height}"><button type="button" class="text-button" data-profile-action="remove-map">약도 빼기</button></div>`:'<div class="profile-map-empty">예식장에서 제공한 약도를 담아주세요.<br>사진 갤러리와 별도로 보여드려요.</div>';
  }
  function render() {
    content().innerHTML=`<div class="profile-editor-intro"><p>한 번 저장하면 모든 디자인에 함께 적용돼요.</p><small>두 사람의 계정에서 같은 사진과 예식장을 봅니다.</small></div><div class="profile-editor-grid"><section><div class="profile-section-heading"><h3>대표사진</h3><label class="profile-upload">사진 선택<input type="file" accept="image/jpeg,image/png,image/webp" data-profile-upload="cover"></label></div><div data-profile-cover></div><p class="profile-help">사진을 쓰는 표지의 첫 사진으로 보여요.</p></section><section><div class="profile-section-heading"><h3>우리의 사진들 <small data-profile-count></small></h3><label class="profile-upload">사진 추가<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-profile-upload="gallery"></label></div><div class="profile-gallery-editor" data-profile-gallery></div><p class="profile-help">화살표로 순서를 바꿀 수 있어요. JPG·PNG·WebP 사진은 웹에 알맞은 크기로 저장돼요.</p></section></div><section class="profile-venue-editor"><h3>소중한 날, 만날 곳</h3><div class="profile-field-grid">${[['name','예식장 이름','예식장 이름',80],['hall','홀 · 층','예: 3층 가든홀',80],['address','주소','정확한 도로명 주소',300],['naverUrl','네이버지도 링크','네이버지도에서 공유한 주소',1000],['kakaoUrl','카카오맵 링크','카카오맵에서 공유한 주소',1000],['mapUrl','추가 지도 링크','기존 지도 또는 다른 지도 주소',1000]].map(([key,label,placeholder,max])=>`<label>${label}<input name="venue-${key}" type="${key.endsWith('Url')?'url':'text'}" maxlength="${max}" value="${e(draft.venue[key])}" placeholder="${placeholder}" ${key.endsWith('Url')?'inputmode="url"':''}></label>`).join('')}${[['transport','오시는 길','대중교통과 찾아오는 길을 적어주세요.'],['parking','주차 안내','주차 위치와 이용 안내를 적어주세요.']].map(([key,label,placeholder])=>`<label>${label}<textarea name="venue-${key}" maxlength="1000" rows="3" placeholder="${placeholder}">${e(draft.venue[key])}</textarea></label>`).join('')}</div><p class="profile-help">네이버지도·카카오맵에서 장소를 찾고 공유 링크를 붙여 넣어주세요. 입력한 지도만 버튼으로 보여요.</p><section class="profile-map-editor"><div class="profile-section-heading"><h3>오시는 길 약도</h3><label class="profile-upload">약도 선택<input type="file" accept="image/jpeg,image/png,image/webp" data-profile-upload="map"></label></div><div data-profile-map></div><p class="profile-help">JPG·PNG·WebP 약도 한 장을 저장할 수 있어요. 청첩장에서 누르면 크게 볼 수 있어요.</p></section></section><div class="profile-editor-status"><p data-profile-status role="status" aria-live="polite"></p><button type="button" class="text-button" data-profile-action="reload" hidden>최신 설정 다시 불러오기</button></div><footer class="profile-editor-actions"><button type="button" class="button secondary" data-profile-action="close">취소</button><button type="button" class="button primary" data-profile-action="save">저장하고 모든 디자인에 적용</button></footer>`;
    renderPhotos();
  }
  function load() {
    const state=getState();
    if(!state?.data?.ready) {status('설정을 불러온 뒤 다시 열어주세요.',true);return false;}
    const value=state.data.profile || emptyProfile();
    draft={coverId:value.coverId,galleryIds:[...value.galleryIds],mapImageId:value.mapImageId||null,venue:{...value.venue}};
    photos={...state.data.photos};added={};revision=value.revision;epoch++;busy=false;render();return true;
  }
  async function upload(event) {
    if(disposed||!isActive()||busy||!draft||!dialog.open)return;
    const input=event.target;
    if(!input.matches('[data-profile-upload]'))return;
    const files=[...input.files];input.value='';if(!files.length)return;
    if(input.dataset.profileUpload==='gallery'&&draft.galleryIds.length+files.length>MAX_GALLERY){status(`사진은 ${MAX_GALLERY}장까지 담을 수 있어요.`,true);return;}
    readFields();const token=++epoch;actionsDisabled(true);let prepared=[];
    try {
      for(const [index,file] of files.entries()) {
        status(`사진을 준비하고 있어요 (${index+1}/${files.length})`);
        const photo=await preparePhoto(file);
        if(disposed||token!==epoch||!isActive())return;
        prepared.push({id:crypto.randomUUID(),...photo});
      }
      for(const {id,...photo} of prepared){photos[id]=photo;added[id]=photo;if(input.dataset.profileUpload==='cover')draft.coverId=id;else if(input.dataset.profileUpload==='map')draft.mapImageId=id;else draft.galleryIds.push(id);}
      renderPhotos();status('사진을 담았어요. 저장하면 함께 반영돼요.');
    } catch(error){if(token===epoch&&isActive())status(profileErrorMessage(error),true);}
    finally{if(token===epoch&&isActive()){actionsDisabled(false);renderPhotos();}}
  }
  async function click(event) {
    const button=event.target.closest('[data-profile-action]');if(!button||disposed||!isActive()||busy)return;
    readFields();const id=button.dataset.photo,action=button.dataset.profileAction;
    if(action==='close'){dialog.close();return;}
    if(action==='reload'){load();return;}
    if(action==='remove-cover')draft.coverId=null;
    if(action==='remove-map')draft.mapImageId=null;
    if(action==='use-cover')draft.coverId=id;
    if(action==='remove-photo')draft.galleryIds=draft.galleryIds.filter(value=>value!==id);
    if(action==='earlier'||action==='later'){
      const from=draft.galleryIds.indexOf(id),to=from+(action==='earlier'?-1:1);
      if(from>=0&&to>=0&&to<draft.galleryIds.length)[draft.galleryIds[from],draft.galleryIds[to]]=[draft.galleryIds[to],draft.galleryIds[from]];
    }
    if(action!=='save'){renderPhotos();return;}
    if(draft.venue.name===''&&(Object.values(draft.venue).some(Boolean)||draft.mapImageId)){status('예식장 이름을 함께 입력해주세요.',true);return;}
    const token=epoch;
    try{
      validateProfile({...emptyProfile(),...draft});
      actionsDisabled(true);status('두 사람의 설정을 저장하고 있어요…');
      const referenced=new Set([draft.coverId,...draft.galleryIds,draft.mapImageId].filter(Boolean));
      const newPhotos=Object.fromEntries(Object.entries(added).filter(([key])=>referenced.has(key)));
      const result=await save({expectedRevision:revision,profile:draft,newPhotos});
      if(token!==epoch||!isActive())return;
      dialog.close();onSaved(result);
    }catch(error){if(token===epoch&&isActive()){status(`${profileErrorMessage(error)} 입력한 내용은 그대로예요.`,true);dialog.querySelector('[data-profile-action="reload"]').hidden=error.code!=='profile-conflict';}}
    finally{if(token===epoch&&isActive()){actionsDisabled(false);renderPhotos();}}
  }
  const close=()=>{epoch++;busy=false;draft=null;photos={};added={};content()?.replaceChildren();};
  const cancel=event=>{if(busy)event.preventDefault();};
  dialog.addEventListener('change',upload);dialog.addEventListener('click',click);dialog.addEventListener('close',close);dialog.addEventListener('cancel',cancel);
  return {open(){if(disposed||!isActive()||!load())return false;dialog.showModal();return true;},isBusy:()=>busy,dispose(){disposed=true;epoch++;dialog.close();close();dialog.removeEventListener('change',upload);dialog.removeEventListener('click',click);dialog.removeEventListener('close',close);dialog.removeEventListener('cancel',cancel);}};
}
