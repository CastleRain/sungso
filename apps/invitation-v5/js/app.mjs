import { wedding,photos as initialPhotos } from './config.mjs?v=5.0.0';
import { countdown,shareUrl,photoIndex } from './core.mjs?v=5.0.0';
import { renderNumber,settleDigits } from './countdown-view.mjs?v=5.0.0';
import { connectPublicAlbum } from './public-album.mjs?v=5.0.0';
import './background-audio.mjs?v=5.0.0';
import './guestbook.mjs?v=5.0.0';
import './rsvp.mjs?v=5.0.0';
import { setupEditorialMotion } from './editorial-motion.mjs?v=5.1.0';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');let effects=true;try{effects=localStorage.getItem('sungso_invitation_v5_motion')!=='off';}catch{}
const motion=()=>effects&&!reduced.matches;
let editorialMotion;
function updateEffects(){document.documentElement.classList.toggle('motion-off',!motion());$('#motion-toggle').setAttribute('aria-pressed',String(!effects));$('#motion-toggle').textContent=effects?'화면 효과 끄기':'화면 효과 켜기';if(!motion())$$('.countdown strong').forEach(settleDigits);editorialMotion?.setEnabled(motion());}
updateEffects();reduced.addEventListener('change',updateEffects);$('#motion-toggle').addEventListener('click',()=>{effects=!effects;try{localStorage.setItem('sungso_invitation_v5_motion',effects?'on':'off');}catch{}updateEffects();});
editorialMotion=setupEditorialMotion({enabled:motion()});
for(let i=0;i<13;i++){const p=document.createElement('img');p.src=`./assets/petals/tuliip_${i%4+1}.png`;p.alt='';p.className='petal';p.style.cssText=`--x:${(i*37)%100}%;--size:${8+(i%4)*3}px;--duration:${12+i%5*2}s;--delay:${-i*1.9}s;--drift:${(i%2?1:-1)*(25+i*3)}px`;$('.petals').append(p);}
let toastTimer;export function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3000);}
async function copy(text,message){try{await navigator.clipboard.writeText(text);toast(message);return true;}catch{const input=document.createElement('textarea');input.value=text;input.style.cssText='position:fixed;left:-9999px';document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();toast(ok?message:'복사하지 못했어요. 길게 눌러 직접 복사해 주세요.');return ok;}}
$$('[data-copy-address]').forEach(b=>b.addEventListener('click',()=>copy(wedding.address,'예식장 주소를 복사했어요.')));
$$('[data-copy-account]').forEach(b=>b.addEventListener('click',async()=>{if(await copy(b.dataset.copyAccount,'계좌번호를 복사했어요. 은행 앱에 붙여넣어 주세요.')){b.querySelector('span').textContent='복사됨';setTimeout(()=>b.querySelector('span').textContent='복사',2500);}}));
$('#copy-link').addEventListener('click',()=>copy(shareUrl(wedding,location),'청첩장 링크를 복사했어요.'));
$('#share-invitation').addEventListener('click',async()=>{if(navigator.share){try{await navigator.share({title:wedding.title,text:'3월 6일, 성우와 소희의 결혼식에 초대합니다.',url:shareUrl(wedding,location)});return;}catch(e){if(e.name==='AbortError')return;}}await copy(shareUrl(wedding,location),'공유할 청첩장 링크를 복사했어요.');});
const openers=new WeakMap();
function openDialog(dialog,trigger){openers.set(dialog,trigger||document.activeElement);dialog.showModal();}
$$('[data-open]').forEach(b=>b.addEventListener('click',()=>openDialog(document.getElementById(b.dataset.open),b)));
$$('dialog').forEach(d=>{d.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>d.close()));d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});d.addEventListener('close',()=>{const b=openers.get(d);if(b?.isConnected)b.focus({preventScroll:true});});});
$('#reception-ack')?.addEventListener('click',e=>{const b=e.currentTarget;b.setAttribute('aria-pressed',String(b.getAttribute('aria-pressed')!=='true'));b.classList.toggle('acknowledged');b.firstChild.textContent=b.classList.contains('acknowledged')?'확인했어요 ':'확인하셨나요? ';});
function updateCountdown(){const c=countdown(wedding.startsAt);$$('[data-count]').forEach(el=>renderNumber(el,String(c[el.dataset.count]).padStart(2,'0'),{animate:motion()&&!document.hidden}));$('#dday-text').innerHTML=c.phase==='waiting'?`성우 ♥ 소희의 결혼식이 <b>${c.calendarDaysLeft}일</b> 남았습니다.`:c.phase==='today'?'오늘, 저희 결혼합니다.':'함께해 주셔서 감사합니다.';}
updateCountdown();let timer=setInterval(()=>{if(!document.hidden)updateCountdown();},1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateCountdown();});
const map=$('#venue-map');const loadMap=()=>{if(!map.src)map.src=map.dataset.src;};if('IntersectionObserver'in window){const obs=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){loadMap();obs.disconnect();}},{rootMargin:'200px'});obs.observe(map);}else loadMap();
let photos=initialPhotos,index=0;const track=$('#gallery-track'),dialog=$('#photo-dialog');
function sync(){const slides=[...track.children];slides.forEach((s,i)=>{s.classList.toggle('is-current',i===index);s.setAttribute('aria-current',String(i===index));});$('#gallery-counter').textContent=`${index+1} / ${photos.length}`;}
function move(delta){if(!photos.length)return;index=photoIndex(index+delta,photos.length);const slide=track.children[index];track.scrollTo({left:slide.offsetLeft-(track.clientWidth-slide.clientWidth)/2,behavior:motion()?'smooth':'instant'});sync();}
let scrollFrame;track.addEventListener('scroll',()=>{cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(()=>{const center=track.scrollLeft+track.clientWidth/2;let best=Infinity;[...track.children].forEach((s,i)=>{const distance=Math.abs(s.offsetLeft+s.clientWidth/2-center);if(distance<best){best=distance;index=i;}});sync();});},{passive:true});
$$('[data-gallery-prev]').forEach(b=>b.addEventListener('click',()=>move(-1)));$$('[data-gallery-next]').forEach(b=>b.addEventListener('click',()=>move(1)));
function showPhoto(){const p=photos[index];if(!p)return;$('#photo-full').src=p.src;$('#photo-full').alt=p.alt;$('#photo-counter').textContent=`${index+1} / ${photos.length}`;const save=$('#photo-save');save.href=p.kind==='upload'?p.src+'?download=1':p.src;save.download=`sungso-${p.id}.webp`;}
track.addEventListener('click',e=>{const button=e.target.closest('[data-photo]');if(!button)return;index=Number(button.dataset.photo);showPhoto();openDialog(dialog,button);});
function advancePhoto(delta){if(!photos.length)return;index=photoIndex(index+delta,photos.length);showPhoto();sync();}
$('#photo-prev').addEventListener('click',()=>advancePhoto(-1));$('#photo-next').addEventListener('click',()=>advancePhoto(1));dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();advancePhoto(-1);}if(e.key==='ArrowRight'){e.preventDefault();advancePhoto(1);}});dialog.addEventListener('close',()=>move(0));
let touchStart;$('.photo-stage').addEventListener('touchstart',e=>{if(e.touches.length===1)touchStart=[e.touches[0].clientX,e.touches[0].clientY];else touchStart=null;},{passive:true});$('.photo-stage').addEventListener('touchend',e=>{if(!touchStart)return;const dx=e.changedTouches[0].clientX-touchStart[0],dy=e.changedTouches[0].clientY-touchStart[1];touchStart=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.4)advancePhoto(dx<0?1:-1);},{passive:true});
connectPublicAlbum(next=>{const id=photos[index]?.id;photos=next;$('#gallery').hidden=!photos.length;if(!photos.length){dialog.close();return;}index=Math.max(0,photos.findIndex(p=>p.id===id));track.replaceChildren(...photos.map((p,i)=>{const button=document.createElement('button'),img=document.createElement('img');button.className='gallery-slide';button.dataset.photo=i;button.setAttribute('aria-label',`${i+1}번째 사진 크게 보기`);img.src=p.src;img.alt=p.alt;img.width=p.width;img.height=p.height;img.loading='lazy';img.decoding='async';button.append(img);return button;}));sync();if(dialog.open)showPhoto();});
sync();

function positionDock(){document.documentElement.style.setProperty('--dock-top',Math.max(2,50-scrollY)+'px');}addEventListener('scroll',positionDock,{passive:true});positionDock();
