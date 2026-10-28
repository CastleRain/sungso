import { getMember, registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { mountJourney } from './ui.mjs?v=2.0.2';
const member=getMember(),controllers=new Set();let disposed=false;
if(!member?.uid)throw Error('회원 로그인이 필요해요.');
const current=()=>!disposed&&getMember()?.uid===member.uid;
async function request(path,{method='GET',body,blob=false,signal}={}){
  if(signal?.aborted)throw new DOMException('불러오기를 취소했어요.','AbortError');
  if(!current())throw Error('로그인 상태가 바뀌었어요.');
  const user=getAuth(getApp('homehunt-private-cloud')).currentUser;
  if(user?.uid!==member.uid)throw Error('로그인 계정을 확인해주세요.');
  const token=await user.getIdToken();if(!current())throw Error('로그인 상태가 바뀌었어요.');
  if(signal?.aborted)throw new DOMException('불러오기를 취소했어요.','AbortError');
  const controller=new AbortController(),abort=()=>controller.abort();controllers.add(controller);signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,90000);
  try{
    const response=await fetch('https://sungso-homehunt-api.onrender.com/api/journey/v1'+path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',signal:controller.signal});
    const data=await(blob&&response.ok?response.blob():response.json());
    if(!current())throw Error('로그인 상태가 바뀌었어요.');
    if(!response.ok||!blob&&data.ok!==true){const error=Error(data.error||'저장소에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');error.status=response.status;error.code=data.code;throw error;}return data;
  }catch(error){if(error.name==='AbortError'&&!signal?.aborted&&current())throw Error('연결이 지연되고 있어요. 입력 내용은 유지되니 다시 시도해주세요.');throw error;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controllers.delete(controller);}
}
const ui=mountJourney({root:document.querySelector('[data-private-root]'),request,member});
registerPrivateCleanup(()=>{disposed=true;controllers.forEach(c=>c.abort());controllers.clear();ui.dispose();});
