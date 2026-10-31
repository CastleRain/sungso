const STORAGE='sungso_studio_v2_panel_widths';
export function panelWidths(width, wanted={}) {
  const budget=Math.max(440,width-(width<1000?260:360)-16);
  let left=Math.max(160,Math.min(360,Number(wanted.left)||210));
  let right=Math.max(280,Math.min(520,Number(wanted.right)||340));
  if(left+right>budget){left=Math.max(160,Math.min(left,budget-right));right=Math.max(280,Math.min(right,budget-left));}
  return {left,right};
}
export function mountPanelLayout({doc=document,win=window}={}) {
  const workbench=doc.querySelector('.workbench');let wanted={},drag=null;
  try{wanted=JSON.parse(win.localStorage.getItem(STORAGE))||{};}catch{}
  const bars=['left','right'].map(side=>{const bar=doc.createElement('div');bar.className='panel-resizer';bar.dataset.side=side;bar.tabIndex=0;bar.role='separator';bar.setAttribute('aria-orientation','vertical');bar.setAttribute('aria-label',side==='left'?'장면 목록 너비 조절':'설정 패널 너비 조절');bar.title='드래그 또는 방향키로 너비 조절 · 두 번 눌러 기본 너비';workbench.insertBefore(bar,doc.querySelector(side==='left'?'.preview-panel':'.inspector'));return bar;});
  function render(){if(win.innerWidth<=740)return;const widths=panelWidths(workbench.clientWidth,wanted);for(const side of ['left','right']){workbench.style.setProperty('--panel-'+side,widths[side]+'px');const bar=bars[side==='left'?0:1];bar.setAttribute('aria-valuemin',side==='left'?160:280);bar.setAttribute('aria-valuemax',Math.min(side==='left'?360:520,workbench.clientWidth-(workbench.clientWidth<1000?276:376)-widths[side==='left'?'right':'left']));bar.setAttribute('aria-valuenow',widths[side]);}return widths;}
  function save(){try{win.localStorage.setItem(STORAGE,JSON.stringify(wanted));}catch{}}
  function finish(){if(!drag)return;drag=null;doc.body.classList.remove('resizing-panels');save();}
  for(const bar of bars){const side=bar.dataset.side;bar.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();drag={id:e.pointerId,x:e.clientX,widths:render()};bar.setPointerCapture(e.pointerId);doc.body.classList.add('resizing-panels');};bar.onpointermove=e=>{if(!drag||e.pointerId!==drag.id)return;const delta=(e.clientX-drag.x)*(side==='left'?1:-1),other=side==='left'?'right':'left';wanted=panelWidths(workbench.clientWidth,{...drag.widths,[side]:Math.min(drag.widths[side]+delta,workbench.clientWidth-(workbench.clientWidth<1000?276:376)-drag.widths[other])});render();};bar.onpointerup=bar.onpointercancel=bar.onlostpointercapture=finish;bar.ondblclick=()=>{wanted={};render();save();};bar.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const widths=render(),other=side==='left'?'right':'left';const delta=(e.key==='ArrowRight'?1:-1)*(side==='left'?1:-1)*(e.shiftKey?40:10);wanted={...widths,[side]:e.key==='Home'?(side==='left'?160:280):e.key==='End'?Number(bar.getAttribute('aria-valuemax')):Math.min(widths[side]+delta,workbench.clientWidth-(workbench.clientWidth<1000?276:376)-widths[other])};render();save();};}
  win.addEventListener('resize',render);render();return {destroy(){finish();win.removeEventListener('resize',render);bars.forEach(b=>b.remove());}};
}
