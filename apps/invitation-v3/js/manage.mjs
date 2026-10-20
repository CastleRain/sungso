import { getMember, registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { mountAlbumManager } from './manage-ui.mjs?v=3.5.0';
import { ALBUM_PATH } from '../../../shared/invitation/album-core.mjs?v=3.5.0';
const uid=getMember()?.uid,requests=new Set();let disposed=false;
const base='https://sungso-homehunt-api.onrender.com'+ALBUM_PATH;
async function request(path,{method='GET',body,blob=false}={}) {
  if(disposed||!uid||getMember()?.uid!==uid)throw Error('승인된 계정으로 다시 로그인해 주세요.');
  const user=getAuth(getApp('homehunt-private-cloud')).currentUser;
  if(user?.uid!==uid)throw Error('로그인 계정이 바뀌었어요.');
  const token=await user.getIdToken();if(disposed||getMember()?.uid!==uid)throw Error('로그인 계정이 바뀌었어요.');
  const controller=new AbortController();requests.add(controller);const timeout=setTimeout(()=>controller.abort(),45000);
  try{
    const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store',credentials:'omit'});
    if(disposed||getMember()?.uid!==uid)throw Error('로그인 계정이 바뀌었어요.');
    const data=await (blob&&response.ok?response.blob():response.json());
    if(disposed||getMember()?.uid!==uid)throw Error('로그인 계정이 바뀌었어요.');
    if(blob&&response.ok)return data;
    if(!response.ok||data.ok!==true)throw Error(data.error||'사진첩에 연결하지 못했어요.');return data;
  }finally{clearTimeout(timeout);requests.delete(controller);}
}
if(!uid)throw Error('Google 로그인이 필요해요.');
const manager=mountAlbumManager({root:document.querySelector('#album-manager'),api:{request,photo:id=>request(`/manage/photos/${id}/thumb`,{blob:true})}});
registerPrivateCleanup(()=>{disposed=true;requests.forEach(controller=>controller.abort());requests.clear();manager.dispose();});
