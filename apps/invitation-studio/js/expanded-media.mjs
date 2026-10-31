/** Owns only supplemental media; the original background player is never replaced. */
export function mountExpandedMedia({doc=document,win=window,motion=()=>true,photo,media,photos=()=>[],getOpening=()=>undefined}) {
  const bgm=doc.getElementById('background-audio'),videos=new Set(),videoSync=new Set(),cleanups=[];
  let auxiliary=null,audioButton=null,restoreVolume=null,heroKey='',heroCleanup=()=>{},liveKey='',liveCleanup=()=>{},openingKey='',bridge=null,bridgeKey='',frame=0;
  const el=(tag,cls,text)=>{const n=doc.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;};
  function stopAudio(){auxiliary?.pause();auxiliary=null;if(audioButton){audioButton.textContent=audioButton.dataset.label;audioButton.classList.remove('is-voice-playing');audioButton=null;}if(restoreVolume!==null){bgm.volume=restoreVolume;restoreVolume=null;}}
  function playAudio(source,button,{limit=0}={}){
    if(auxiliary?.src===new URL(source,doc.baseURI).href&&!auxiliary.paused){stopAudio();return;}
    stopAudio();const audio=el('audio');audio.src=source;auxiliary=audio;audioButton=button;const original=button.dataset.label||button.textContent;button.dataset.label=original;
    const finish=()=>{if(auxiliary===audio)stopAudio();button.textContent=original;button.classList.remove('is-voice-playing');};
    audio.addEventListener('play',()=>{if(auxiliary!==audio){audio.pause();return;}restoreVolume=bgm.volume;bgm.volume*=.2;button.textContent='재생 멈추기 Ⅱ';button.classList.add('is-voice-playing');});
    audio.addEventListener('ended',finish);audio.addEventListener('error',()=>{finish();button.textContent='재생하지 못했어요 · 다시 듣기';});
    if(limit)audio.addEventListener('timeupdate',()=>{if(audio.currentTime>=limit)finish();});
    audio.play().catch(()=>{finish();button.textContent='다시 눌러 재생하기';});
  }
  function mountVideo(host,source,hold){
    const video=el('video','expanded-video');video.muted=true;video.playsInline=true;video.loop=true;video.preload='none';host.classList.add('has-expanded-video');host.append(video);videos.add(video);
    const button=el('button','live-badge',hold?'◎ 길게 눌러 LIVE':'영상 멈추기 Ⅱ');button.type='button';host.append(button);let manualPause=false,visible=false,held=false;
    const stop=()=>{video.pause();host.classList.remove('is-live');};
    const play=()=>{if(doc.hidden||!motion()||!visible||manualPause)return;if(!video.src)video.src=source;video.play().then(()=>{if(!visible||doc.hidden||!motion()||manualPause||hold&&!held)stop();else host.classList.add('is-live');}).catch(()=>{stop();button.textContent='영상 재생 ↗';});};
    const down=e=>{if(e.type==='keydown'&&![' ','Enter'].includes(e.key))return;e.preventDefault();held=true;manualPause=false;play();};
    const up=()=>{held=false;stop();};
    if(hold){for(const type of ['pointerdown','keydown'])button.addEventListener(type,down);for(const type of ['pointerup','pointercancel','pointerleave','keyup','blur'])button.addEventListener(type,up);}
    else button.onclick=()=>{manualPause=!manualPause;if(manualPause)stop();else play();button.textContent=manualPause?'영상 재생 ▷':'영상 멈추기 Ⅱ';};
    const observer=new win.IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(!visible)stop();else if(!hold)play();},{threshold:.12});observer.observe(host);
    const visibility=()=>{const enabled=motion();video.hidden=button.hidden=!enabled;if(doc.hidden||!enabled)stop();else if(!hold)play();};videoSync.add(visibility);visibility();doc.addEventListener('visibilitychange',visibility);doc.addEventListener('lab:motion-change',visibility);
    return ()=>{observer.disconnect();doc.removeEventListener('visibilitychange',visibility);doc.removeEventListener('lab:motion-change',visibility);videoSync.delete(visibility);stop();video.removeAttribute('src');video.load();videos.delete(video);video.remove();button.remove();host.classList.remove('has-expanded-video','is-live');};
  }
  function opening(kind){
    doc.querySelector('.expanded-opening')?.remove();if(kind==='none'||!kind||!motion())return;
    const overlay=el('div','expanded-opening'),inner=el('div','opening-envelope'),title=el('p','script-title','A letter for you'),open=el('button','wax-open',kind==='wax'?'S & S':'초대장 열기'),skip=el('button','opening-skip','바로 보기 ↗');
    overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','두 사람의 초대장');overlay.setAttribute('aria-modal','true');open.type=skip.type='button';
    const previous=doc.activeElement,done=()=>{if(!overlay.isConnected)return;overlay.remove();if(motion())win.sungsoIntro?.replay(getOpening(),{preview:true});if(previous?.isConnected)previous.focus({preventScroll:true});};
    open.onclick=skip.onclick=done;overlay.addEventListener('keydown',e=>{if(e.key==='Escape')done();if(e.key==='Tab'){e.preventDefault();(doc.activeElement===open?skip:open).focus();}});
    inner.append(title,el('p','','작은 초대장을 열어 주세요.'),open);overlay.append(inner,skip);doc.body.append(overlay);win.sungsoIntro?.finish();open.focus({preventScroll:true});
    if(kind==='scratch'){
      const canvas=el('canvas','scratch-surface');canvas.width=540;canvas.height=360;canvas.setAttribute('aria-hidden','true');inner.prepend(canvas);const ctx=canvas.getContext('2d');ctx.fillStyle='#bdcdd9';ctx.fillRect(0,0,540,360);ctx.fillStyle='#3c586c';ctx.font='22px serif';ctx.fillText('살짝 문질러 열어 보세요',135,185);let pressed=false,marks=0;
      canvas.onpointerdown=e=>{pressed=true;canvas.setPointerCapture(e.pointerId);};canvas.onpointerup=canvas.onpointercancel=()=>{pressed=false;};canvas.onpointermove=e=>{if(!pressed)return;const r=canvas.getBoundingClientRect();ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc((e.clientX-r.left)*540/r.width,(e.clientY-r.top)*360/r.height,35,0,Math.PI*2);ctx.fill();if(++marks>35)done();};
    }
  }
  function updateBridge(kind){
    const key=JSON.stringify([kind,kind==='sequence'?photos().map(p=>[p.id,p.thumb||p.src]):null]);if(bridgeKey===key)return;bridgeKey=key;bridge?.remove();bridge=null;if(!kind||kind==='none')return;
    bridge=el('div','expanded-bridge');bridge.dataset.kind=kind;bridge.setAttribute('aria-hidden','true');const stage=el('div','bridge-stage');
    if(kind==='walk'){
      const person=(side,dress)=>{const holder=el('span','bridge-person '+side),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 60 110');svg.setAttribute('width','60');svg.setAttribute('height','110');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');
        const head=doc.createElementNS(svg.namespaceURI,'circle');head.setAttribute('cx','30');head.setAttribute('cy','14');head.setAttribute('r','7');const body=doc.createElementNS(svg.namespaceURI,'path');body.setAttribute('d',dress?'M26 23 Q15 25 18 39 L7 73 Q30 80 53 73 L42 39 Q45 25 34 23 M19 32 L10 48 23 57 M41 32 L51 47 38 57 M23 77 L20 98 10 101 M37 77 L42 96 51 99':'M26 23 L18 26 15 58 43 58 42 26 34 23 M20 30 L7 45 19 54 M40 30 L53 43 42 51 M23 59 L18 96 8 101 M36 59 L43 95 53 98 M29 25 L32 42 28 47');svg.append(head,body);holder.append(svg);return holder;};
      stage.append(person('left',false),el('span','bridge-thread','&'),person('right',true));
    }
    else if(kind==='wax'){stage.append(el('span','bridge-flap'),el('span','bridge-seal','S & S'));}
    else {for(const p of photos().slice(0,6)){const image=el('img');image.src=p.thumb||p.src;image.alt='';image.loading='lazy';stage.append(image);}}
    bridge.append(stage);doc.getElementById('gallery').prepend(bridge);paint();
  }
  function paint(){frame=0;if(!bridge)return;const r=bridge.getBoundingClientRect(),p=motion()?Math.min(1,Math.max(0,(win.innerHeight-r.top)/(win.innerHeight+r.height))):.5;bridge.style.setProperty('--bridge-p',p);bridge.classList.toggle('is-static',!motion());}
  const scroll=()=>{if(!frame)frame=win.requestAnimationFrame(paint);};win.addEventListener('scroll',scroll,{passive:true});
  const pause=()=>{if(doc.hidden){stopAudio();videos.forEach(v=>v.pause());}};doc.addEventListener('visibilitychange',pause);
  const motionChanged=()=>{paint();if(!motion())doc.querySelector('.expanded-opening')?.remove();};doc.addEventListener('lab:motion-change',motionChanged);
  const audioState=()=>doc.getElementById('sound-dock').classList.toggle('has-playing-record',!bgm.paused);bgm.addEventListener('play',audioState);bgm.addEventListener('pause',audioState);audioState();
  return {playAudio,stopAudio,
    update(e){const v=e.values,source=media(v.coverVideo),key=JSON.stringify([v.coverMedia,source]);
      if(key!==heroKey){heroKey=key;heroCleanup();heroCleanup=()=>{};if(source&&v.coverMedia!=='photo')heroCleanup=mountVideo(doc.querySelector('.hero-photo'),source,v.coverMedia==='hold');}
      doc.getElementById('sound-dock').dataset.audioStyle=v.audioStyle;
      const nextLive=JSON.stringify([e.lists.livePhotos,doc.getElementById('photo-full')?.getAttribute('src')]);
      if(nextLive!==liveKey){liveKey=nextLive;liveCleanup();liveCleanup=()=>{};const full=doc.getElementById('photo-full'),match=e.lists.livePhotos?.find(row=>photo(row.photo)?.src===full?.getAttribute('src'));if(match&&media(match.video))liveCleanup=mountVideo(full.parentElement,media(match.video),true);}
      if(v.opening!==openingKey){openingKey=v.opening;opening(v.opening);}updateBridge(v.bridge);motionChanged();videoSync.forEach(sync=>sync());
    },
    destroy(){heroCleanup();liveCleanup();stopAudio();cleanups.forEach(fn=>fn());win.cancelAnimationFrame(frame);win.removeEventListener('scroll',scroll);doc.removeEventListener('visibilitychange',pause);doc.removeEventListener('lab:motion-change',motionChanged);bgm.removeEventListener('play',audioState);bgm.removeEventListener('pause',audioState);doc.querySelector('.expanded-opening')?.remove();bridge?.remove();},
  };
}
