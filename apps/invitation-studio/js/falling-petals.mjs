/** A bounded, decorative hero layer. Never captures input or creates a scroll loop. */
export function mountFallingPetals({doc=document,win=window,motion=()=>true}={}) {
  const hero=doc.querySelector('.hero'),layer=doc.createElement('div');layer.className='falling-petals';layer.setAttribute('aria-hidden','true');hero.append(layer);
  let kind='none',visible=false,disposed=false;
  const reduced=win.matchMedia('(prefers-reduced-motion: reduce)');
  function sync(){if(disposed)return;const active=kind!=='none'&&visible&&!doc.hidden&&!reduced.matches&&motion()&&!doc.querySelector('dialog[open],.expanded-opening');layer.hidden=!active;layer.dataset.kind=kind;
    if(!active){layer.replaceChildren();return;}if(layer.childElementCount)return;
    for(let i=0;i<14;i++){const petal=doc.createElement('i');petal.style.cssText=`--x:${(i*37+7)%100}%;--delay:${-i*.83}s;--duration:${9+i%5}s;--drift:${(i%2?1:-1)*(35+i%4*14)}px;--size:${9+i%4*2}px;--turn:${180+i*31}deg`;layer.append(petal);}}
  const observer=new win.IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();},{threshold:.03});observer.observe(hero);
  const events=['visibilitychange','lab:motion-change','lab:dialog-change'];events.forEach(e=>doc.addEventListener(e,sync));reduced.addEventListener('change',sync);
  // Extra opening overlays have their own lifetime; notice them without owning it.
  const overlays=new win.MutationObserver(sync);overlays.observe(doc.body,{childList:true});
  return {update(value){if(kind!==value){kind=['rose','ivory'].includes(value)?value:'none';layer.replaceChildren();}sync();},destroy(){disposed=true;observer.disconnect();overlays.disconnect();events.forEach(e=>doc.removeEventListener(e,sync));reduced.removeEventListener('change',sync);layer.remove();}};
}
