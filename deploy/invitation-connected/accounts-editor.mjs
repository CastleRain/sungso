import {studioRequest, registerStudioCleanup} from '/studio-login/session.mjs';
import {ACCOUNT_SLOTS, validateAccounts} from './account-core.mjs';
import {validateAccountOrder, orderedAccountData} from './account-order.mjs';

// Financial drafts stay in memory, separate from composition history, URLs and browser storage.
export function mountAccountEditor({getSelectedKey, stopDemo}) {
  const host=document.createElement('section');host.className='studio-accounts';host.hidden=true;
  document.querySelector('#editor-content').prepend(host);
  let loaded=false, busy=false, disposed=false, baseline, draft, side='groom', selected='groom', epoch=0, reviewSnapshot;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
  const title=el('h3','','계좌 등록 · 표시 순서');
  const help=el('p','accounts-help','신랑·신부 측에서 받는 분을 골라 입력해요. 위아래 화살표로 먼저 보일 분을 정할 수 있어요.');
  const status=el('p','accounts-status','기존 계좌를 확인해 주세요.');status.setAttribute('role','status');
  const panel=el('fieldset','accounts-fields');panel.disabled=true;
  const tabs=el('div','accounts-side-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','계좌를 등록할 측');
  const sideButtons={};for(const [id,label]of [['groom','신랑 측'],['bride','신부 측']]){const b=el('button','',label);b.type='button';b.onclick=()=>{side=id;selected=draft.order.find(v=>v.startsWith(side));paint();};tabs.append(b);sideButtons[id]=b;}
  const recipients=el('ol','accounts-recipients');recipients.setAttribute('aria-label','받는 분 표시 순서');
  const formTitle=el('h4');
  const inputs={};const form=el('div','accounts-inputs');
  for(const [key,label,placeholder,max]of [['bank','은행','예: 국민은행',40],['holder','예금주','통장에 표시된 이름',40],['number','계좌번호','숫자 또는 하이픈',40],['payUrl','카카오페이 송금 링크 · 선택','https://qr.kakaopay.com/…',300]]){
    const wrap=el('label','',label),input=el('input');input.type=key==='payUrl'?'url':'text';input.autocomplete='off';input.spellcheck=false;input.maxLength=max;input.placeholder=placeholder;input.name=`studio-account-${key}`;if(key==='number')input.inputMode='numeric';
    input.addEventListener('input',()=>{row()[key]=input.value;changed();});wrap.append(input);inputs[key]=input;
    if(key==='payUrl'){const details=el('details','accounts-pay');details.append(el('summary','','송금 바로가기 추가'),wrap,el('p','accounts-help','카카오페이에서 복사한 송금 링크가 있을 때만 넣어 주세요.'));form.append(details);}else form.append(wrap);
  }
  const enabled=el('input');enabled.type='checkbox';enabled.onchange=()=>{row().enabled=enabled.checked;changed();paintRecipients();};
  const enableLabel=el('label','accounts-enable');enableLabel.append(enabled,el('span','','하객에게 이 계좌 공개'));
  const preview=el('div','accounts-order-preview');preview.setAttribute('aria-label','현재 공개 예정 순서');
  const save=el('button','accounts-save','변경 내용 확인');save.type='button';save.onclick=openReview;
  const reset=el('button','accounts-reset','변경 취소');reset.type='button';reset.onclick=()=>{if(!dirty()||confirm('입력한 계좌와 순서 변경을 취소할까요?')){draft=structuredClone(baseline);paint();status.textContent='저장된 계좌로 돌아왔어요.';}};
  const reload=el('button','accounts-reload','기존 계좌 불러오기');reload.type='button';reload.onclick=()=>void load();
  panel.append(tabs,recipients,formTitle,form,enableLabel,el('h4','','하객에게 보일 순서'),preview,save,reset);
  const note=el('p','accounts-help','계좌는 조합 보관과 별도로 저장돼요. ‘계좌와 순서 반영’을 누르면 기존 공개 청첩장에도 바로 적용돼요. 입력 중인 내용은 이 탭에서만 유지돼요.');
  host.append(title,help,reload,status,panel,note);
  const dialog=el('dialog','accounts-review');dialog.setAttribute('aria-label','계좌와 순서 반영 확인');const reviewBody=el('div');const reviewStatus=el('p','accounts-status');reviewStatus.setAttribute('role','status');
  const confirmSave=el('button','accounts-save','계좌와 순서 반영');confirmSave.type='button';confirmSave.onclick=()=>void commit();const cancel=el('button','accounts-reset','계속 수정');cancel.type='button';cancel.onclick=()=>dialog.close();dialog.append(el('h2','','이 계좌와 순서로 반영할까요?'),el('p','accounts-help','공개로 선택한 계좌만 하객에게 보여요. 계좌번호와 예금주를 한 번 더 확인해 주세요.'),reviewBody,reviewStatus,confirmSave,cancel);document.body.append(dialog);
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>{reviewBody.replaceChildren();reviewSnapshot=undefined;});
  function row(){return draft.accounts.find(a=>a.id===selected);}
  function value(state){return JSON.stringify({accounts:state?.accounts,order:state?.order});}
  function dirty(){return loaded&&value(draft)!==value(baseline);}
  function label(id){return ACCOUNT_SLOTS.find(s=>s.id===id).relation;}
  function setBusy(on){busy=on;panel.disabled=on||!loaded;reload.disabled=on;confirmSave.disabled=on;cancel.disabled=on;}
  function publicDraft(){
    // Incomplete edits are never previewed as valid public accounts.
    const valid=draft.accounts.flatMap(a=>{try{return validateAccounts([a]).filter(v=>v.id===a.id);}catch{return [];}});
    return orderedAccountData(valid,draft.order);
  }
  function sendPreview(){if(disposed||!loaded)return;document.querySelector('#invitation-preview')?.contentWindow?.postMessage({type:'studio-v2:accounts-preview',sides:publicDraft().sides,side},location.origin);}
  function changed(){reviewSnapshot=undefined;save.disabled=!dirty();reset.disabled=!dirty();status.textContent=dirty()?'아직 반영하지 않은 변경이 있어요.':'현재 저장된 계좌예요.';paintPreview();sendPreview();}
  function paintRecipients(){recipients.replaceChildren();const ids=draft.order.filter(id=>id.startsWith(side));ids.forEach((id,i)=>{
    const li=el('li'),b=el('button','accounts-recipient');b.type='button';b.setAttribute('aria-pressed',String(id===selected));b.append(el('span','',label(id)),el('small','',draft.accounts.find(a=>a.id===id).enabled?'공개':'숨김'));b.onclick=()=>{selected=id;paint();};li.append(b);
    for(const [delta,icon,word]of [[-1,'↑','위로'],[1,'↓','아래로']]){const arrow=el('button','accounts-move',icon);arrow.type='button';arrow.setAttribute('aria-label',`${label(id)} ${word}`);arrow.disabled=i+delta<0||i+delta>=ids.length;arrow.onclick=()=>{const index=draft.order.indexOf(id),target=index+delta;[draft.order[index],draft.order[target]]=[draft.order[target],draft.order[index]];paintRecipients();changed();recipients.querySelector(`[aria-label="${label(id)} ${word}"]`)?.focus({preventScroll:true});};li.append(arrow);}recipients.append(li);
  });}
  function paintPreview(){preview.replaceChildren();const accounts=publicDraft().sides.find(g=>g.id===side).accounts;if(!accounts.length)preview.append(el('p','accounts-help','공개할 계좌를 입력하고 공개를 켜 주세요.'));else accounts.forEach((a,i)=>preview.append(el('p','',`${i+1}. ${a.relation} · ${a.holder} · ${a.bank}`)));}
  function paint(){if(!loaded||disposed)return;for(const [id,b]of Object.entries(sideButtons))b.setAttribute('aria-pressed',String(id===side));paintRecipients();formTitle.textContent=`${side==='groom'?'신랑':'신부'} 측 · ${label(selected)}`;for(const [key,input]of Object.entries(inputs))input.value=row()[key];enabled.checked=row().enabled;changed();}
  async function load(){if(busy||disposed)return;if(dirty()&&!confirm('저장하지 않은 변경을 버리고 최신 계좌를 불러올까요?'))return;const request=++epoch;setBusy(true);status.textContent='기존 계좌를 불러오고 있어요.';
    try{const data=await studioRequest('accounts');if(disposed||request!==epoch)return;baseline={revision:data.revision,accounts:validateAccounts(data.accounts),order:validateAccountOrder(data.order)};draft=structuredClone(baseline);loaded=true;reload.textContent='최신 계좌 다시 불러오기';paint();}
    catch(e){if(!disposed&&request===epoch)status.textContent=e.message;}
    finally{if(!disposed&&request===epoch)setBusy(false);}
  }
  function openReview(){if(!dirty()||busy)return;try{reviewSnapshot={accounts:validateAccounts(draft.accounts),order:validateAccountOrder(draft.order),expectedRevision:baseline.revision};const data=orderedAccountData(reviewSnapshot.accounts,reviewSnapshot.order);reviewBody.replaceChildren();for(const group of data.sides){reviewBody.append(el('h3','',group.id==='groom'?'신랑 측':'신부 측'));if(!group.accounts.length)reviewBody.append(el('p','','공개할 계좌 없음'));for(const a of group.accounts){const item=el('p');item.append(el('strong','',`${a.relation} · ${a.holder}`),el('span','',`${a.bank} ${a.number}`));if(a.payUrl)item.append(el('small','','카카오페이 송금 링크 포함'));reviewBody.append(item);}}reviewStatus.textContent='';dialog.showModal();}
    catch(e){status.textContent=e.message;}
  }
  async function commit(){if(!reviewSnapshot||busy||disposed)return;const request=++epoch,payload=structuredClone(reviewSnapshot);setBusy(true);reviewStatus.textContent='계좌와 순서를 반영하고 있어요.';
    try{const data=await studioRequest('accounts',{method:'PUT',body:JSON.stringify(payload)});if(disposed||request!==epoch)return;baseline={revision:data.revision,accounts:validateAccounts(data.accounts),order:validateAccountOrder(data.order)};draft=structuredClone(baseline);paint();dialog.close();status.textContent='계좌와 순서를 하객 화면에 반영했어요.';}
    catch(e){if(!disposed&&request===epoch){reviewStatus.textContent=e.message;status.textContent=e.message;}}
    finally{if(!disposed&&request===epoch)setBusy(false);}
  }
  function show(){host.hidden=getSelectedKey()!=='gifting';if(!host.hidden){stopDemo();if(!loaded&&!busy)void load();}}
  const onMessage=e=>{if(e.origin===location.origin&&e.source===document.querySelector('#invitation-preview')?.contentWindow&&e.data?.type==='studio-v2:accounts-ready')sendPreview();};
  const beforeUnload=e=>{if(dirty()){e.preventDefault();e.returnValue='';}};
  document.addEventListener('studio-v2:selection',show);window.addEventListener('message',onMessage);window.addEventListener('beforeunload',beforeUnload);
  registerStudioCleanup(()=>{disposed=true;epoch++;baseline=draft=reviewSnapshot=undefined;loaded=false;for(const input of Object.values(inputs))input.value='';dialog.close();dialog.remove();host.replaceChildren();host.remove();window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('message',onMessage);document.removeEventListener('studio-v2:selection',show);});
  show();return {show};
}
