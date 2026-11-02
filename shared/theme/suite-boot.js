/* Synchronous display-only preference. Never reads application records. */
(() => {
  const path=location.pathname.replace(/^\/sungso(?:\/|$)/,'/').replace(/^\//,'');
  let app=path.split('/')[0]||'hub';
  if(app==='index.html')app='hub';
  if(app==='sohee')app=path.includes('/sales')?'sohee-sales':(!path.includes('/portfolio')?'sohee-workspace':'');
  if(!['hub','wecost','homehunt','homehunt-v2','honeymoon','travel','dates','invitation','journey','table','footprints','wedding','sohee-workspace','sohee-sales'].includes(app))return;
  document.documentElement.dataset.ssSuite=app;
  let surface='solid';try{if(localStorage.getItem('sungso.ui.surface.v1')==='glass')surface='glass';}catch{}
  document.documentElement.dataset.ssSurface=surface;
})();
