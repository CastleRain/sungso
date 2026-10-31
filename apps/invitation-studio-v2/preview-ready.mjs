// A late-loading parent can ask again without remounting the invitation or audio.
export function mountPreviewHandshake({win=window,getState}={}) {
  if(win.parent===win)return ()=>{};
  const listener=event=>{
    if(event.origin!==win.location.origin||event.source!==win.parent||event.data?.type!=='studio-v2:hello')return;
    win.parent.postMessage({type:'invitation-studio:ready',...getState()},win.location.origin);
  };
  win.addEventListener('message',listener);
  return ()=>win.removeEventListener('message',listener);
}
