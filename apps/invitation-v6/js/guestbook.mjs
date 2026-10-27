const local=['localhost','127.0.0.1'].includes(location.hostname);
const endpoint=(local?'http://127.0.0.1:8025':'https://sungso-homehunt-api.onrender.com')+'/api/invitation/v3/guestbook';
const key='sungso_guestbook_v3',$=selector=>document.querySelector(selector);
let identity,proofs={};
function save(){try{localStorage.setItem(key,JSON.stringify({clientId:identity,proofs}));}catch{/* Session-only proof. */}}
try{const saved=JSON.parse(localStorage.getItem(key)||'null');identity=saved?.clientId;proofs=saved?.proofs||{};}catch{/* First visit. */}
if(!/^[a-f0-9-]{36}$/i.test(identity||''))identity=crypto.randomUUID();save();
const list=$('#guestbook-list'),form=$('#guestbook-form'),status=$('#guestbook-status'),more=$('#guestbook-more'),refresh=$('#guestbook-refresh');
const allList=$('#guestbook-all-list'),allDialog=$('#guestbook-all'),viewAll=$('#guestbook-view-all');
viewAll.addEventListener('click',()=>allDialog.showModal());
allDialog.addEventListener('close',()=>viewAll.focus({preventScroll:true}));
new MutationObserver(()=>{$('#guestbook-all-status').textContent=status.textContent;}).observe(status,{childList:true,characterData:true,subtree:true});
let next=null,busy=false,loaded=false,draft=null;
if(local)$('#guestbook-preview').hidden=false;
const date=new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Seoul'});
async function request(path='',options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
 try{const response=await fetch(endpoint+path,{...options,headers:{'Content-Type':'application/json'},signal:controller.signal,credentials:'omit'});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'연결을 확인한 뒤 다시 시도해 주세요.');return data;}
 catch(error){if(error.name==='AbortError')throw Error('서버가 준비되는 데 시간이 걸리고 있어요. 잠시 후 다시 시도해 주세요.');throw error;}finally{clearTimeout(timer);}
}
function messageElement(row){
 const article=document.createElement('li');article.className='guest-message';article.dataset.messageId=row.id;
 const header=document.createElement('div'),name=document.createElement('strong'),time=document.createElement('time'),text=document.createElement('p');
 name.textContent=row.name;time.dateTime=new Date(row.createdAt).toISOString();time.textContent=date.format(row.createdAt);text.textContent=row.text;header.append(name,time);article.append(header,text);
 if(proofs[row.id]){const remove=document.createElement('button');remove.type='button';remove.className='text-link guest-delete';remove.textContent='내 글 삭제';remove.addEventListener('click',()=>confirmDelete(row,remove));article.append(remove);}return article;
}
function renderMessage(row){
 if([...allList.children].some(child=>child.dataset.messageId===row.id))return;
 allList.append(messageElement(row));
 if(list.children.length<2)list.append(messageElement(row));
}
async function load(append=false){
 if(busy)return;busy=true;more.disabled=refresh.disabled=true;list.setAttribute('aria-busy','true');status.textContent='축하 메시지를 불러오는 중이에요. 처음 연결은 잠시 걸릴 수 있어요.';
 try{const data=await request(append&&next?'?before='+encodeURIComponent(next):'');if(!append){list.replaceChildren();allList.replaceChildren();}data.messages.forEach(renderMessage);next=data.next;more.hidden=!next;$('#guestbook-count').textContent=String(data.total);viewAll.hidden=!data.total;viewAll.textContent=`모든 축하 메시지 · ${data.total} ↗`;status.textContent=data.total?'따뜻한 마음을 남겨 주셔서 고마워요.':'아직 도착한 메시지가 없어요. 첫 축하를 남겨 주세요.';loaded=true;}
 catch(error){status.textContent=error.message==='Failed to fetch'?'방명록에 연결하지 못했어요. 새로고침 버튼으로 다시 시도해 주세요.':error.message;}finally{busy=false;more.disabled=refresh.disabled=false;list.setAttribute('aria-busy','false');}
}
more.addEventListener('click',()=>load(true));refresh.addEventListener('click',()=>load());
const open=$('#guestbook-write'),composer=$('#guestbook-composer');
open.addEventListener('click',()=>{composer.showModal();$('#guest-name').focus();if(!loaded)load();});
$('#guest-text').addEventListener('input',()=>{$('#guest-count').textContent=String([...$('#guest-text').value].length);});
form.addEventListener('submit',async event=>{
 event.preventDefault();const button=$('#guest-submit');if(button.disabled)return;
 const name=$('#guest-name').value.trim(),text=$('#guest-text').value.trim();
 if(!name||!text||[...name].length>20||[...text].length>300||!$('#guest-consent').checked){$('#guest-form-status').textContent='이름과 메시지, 공개 동의를 확인해 주세요.';return;}
 if(!draft||draft.name!==name||draft.text!==text){const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');draft={name,text,clientId:identity,requestId:crypto.randomUUID(),deleteToken:token,consent:true,website:$('#guest-website').value};proofs[draft.requestId]=token;save();}
 button.disabled=true;$('#guest-form-status').textContent='마음을 전하고 있어요. 잠시만 기다려 주세요.';
 try{const data=await request('',{method:'POST',body:JSON.stringify(draft)});proofs[data.message.id]=draft.deleteToken;save();draft=null;form.reset();$('#guest-count').textContent='0';$('#guest-form-status').textContent='축하 메시지가 등록되었어요. 고맙습니다!';await load();}
 catch(error){$('#guest-form-status').textContent=error.message==='Failed to fetch'?'연결하지 못했어요. 작성한 내용은 그대로 두었으니 다시 등록해 주세요.':error.message;}finally{button.disabled=false;}
});
const deleteDialog=$('#guest-delete-dialog');let deletion;
function confirmDelete(row,trigger){deletion={row,trigger};$('#delete-guest-name').textContent=row.name;$('#delete-guest-status').textContent='';deleteDialog.showModal();$('#cancel-guest-delete').focus();}
$('#cancel-guest-delete').addEventListener('click',()=>deleteDialog.close());
$('#confirm-guest-delete').addEventListener('click',async()=>{if(!deletion)return;const button=$('#confirm-guest-delete');button.disabled=true;try{await request('/'+deletion.row.id,{method:'DELETE',body:JSON.stringify({deleteToken:proofs[deletion.row.id]})});delete proofs[deletion.row.id];save();deleteDialog.close();await load();}catch(error){$('#delete-guest-status').textContent=error.message;}finally{button.disabled=false;}});
deleteDialog.addEventListener('close',()=>{if(deletion?.trigger.isConnected)deletion.trigger.focus({preventScroll:true});else refresh.focus({preventScroll:true});});
if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();load();}},{rootMargin:'200px'});observer.observe($('#guestbook'));}else load();

composer.addEventListener('close',()=>open.focus({preventScroll:true}));
