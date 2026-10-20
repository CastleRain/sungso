import { ALBUM_PATH, defaultPhotos, validateAlbumItems } from '../../../shared/invitation/album-core.mjs?v=4.0.0';
const api = ['localhost','127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:8025' : 'https://sungso-homehunt-api.onrender.com';
const key='sungso_invitation_v3_public_album';
function resolvePhotos(data) {
  if(data?.configured!==true)return defaultPhotos;
  const items=validateAlbumItems(data.items.map(({id,kind,alt})=>({id,kind,alt})));
  return items.map(p=>{
    if(p.kind==='static')return {...defaultPhotos.find(photo=>photo.id===p.id),alt:p.alt};
    const meta=data.items.find(photo=>photo.id===p.id);
    if(!Number.isSafeInteger(meta.width)||!Number.isSafeInteger(meta.height)||meta.width<1||meta.height<1||Math.max(meta.width,meta.height)>1600)throw Error('Invalid photo size');
    return {...p,src:`${api}${ALBUM_PATH}/photos/${p.id}/full`,thumb:`${api}${ALBUM_PATH}/photos/${p.id}/thumb`,width:meta.width,height:meta.height};
  });
}
export function connectPublicAlbum(onAlbum,onError=()=>{}) {
  try{const text=localStorage.getItem(key);if(text&&text.length<50000)onAlbum(resolvePhotos(JSON.parse(text)));}catch{/* A missing cache never changes published data. */}
  let pending=false;
  async function refresh(){
    if(pending)return;pending=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
    try{
      const response=await fetch(api+ALBUM_PATH,{signal:controller.signal,cache:'no-store',credentials:'omit'});
      if(!response.ok)throw Error('Album unavailable');const data=await response.json();if(data.ok!==true)throw Error('Album unavailable');
      const photos=resolvePhotos(data);onAlbum(photos);onError(false);
      try{localStorage.setItem(key,JSON.stringify(data));}catch{/* Public metadata can remain session-only. */}
    }catch{onError(true);}finally{pending=false;clearTimeout(timeout);}
  }
  void refresh();return {refresh};
}
