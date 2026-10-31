import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeExperience} from '../../../shared/invitation/studio/experience-config.mjs';
import {normalizeComposition} from '../../../shared/invitation/studio/composition.mjs';
import {pngResolution} from '../js/print-ticket.mjs';
import {guestEdition} from '../js/expanded-scenes.mjs';
import {mountExpandedMedia} from '../js/expanded-media.mjs';
const exp=changes=>normalizeExperience({version:1,...changes});
test('edition override needs explicit personalized enablement and never admits URL design overrides',()=>{const c=normalizeComposition({palette:'mist'});assert.deepEqual(guestEdition(c,undefined,'?for=parents&mode=live'),c);const e=exp({values:{personalized:true},editions:{friends:normalizeComposition({palette:'rose'})}});assert.equal(guestEdition(c,e,'?for=friends').palette,'rose');assert.equal(guestEdition(c,e,'?for=parents').motion,'still');assert.equal(guestEdition(c,e,'?palette=rose').palette,'mist');});
test('print PNG encodes 300 dpi in standard pHYs metadata',()=>{const png=Uint8Array.from([137,80,78,71,13,10,26,10,...Array(25).fill(0)]),out=pngResolution(png);assert.equal(String.fromCharCode(...out.slice(37,41)),'pHYs');assert.equal(new DataView(out.buffer).getUint32(41),11811);assert.equal(out[49],1);});
test('publication metadata escapes names and uses the selected ceremony date without editor labels',async()=>{const {publicationMetadata}=await import('../../../deploy/invitation-connected/gateway.mjs');const html=publicationMetadata('<title>VER6.1</title><meta property="og:title" content="old"><meta property="og:description" content="old">',{snapshot:{content:{text:{groom:'<성우>',bride:'소희'},experience:{values:{weddingDate:'2027-04-03',weddingTime:'14:00'}}}}});assert.ok(html.includes('&lt;성우&gt;'));assert.ok(html.includes('2027-04-03 14:00'));assert.ok(!html.includes('VER6.1'));assert.ok(!html.includes('<성우>'));});
test('legacy visual library preserves optional wording snapshots across forty records and export',async()=>{const {parseLibrary,parseImport}=await import('../../../apps/invitation-studio/js/saved-library.mjs');const records=Array.from({length:40},(_,i)=>({id:String(i),composition:normalizeComposition(),name:'검사',text:{invitation:'합성 문구 '+i}}));const parsed=parseLibrary(JSON.stringify(records));assert.equal(parsed.length,40);assert.equal(parseImport(JSON.stringify({version:1,kind:'sungso-studio-library',items:parsed})).items[39].text.invitation,'합성 문구 39');});

test('static media hides controls without loading video, cancels late play and preserves explicit pause',async()=>{
  class Node extends EventTarget {
    constructor(tag){super();this.tag=tag;this.children=[];this.dataset={};this.paused=true;this.src='';const names=new Set();this.classList={add:(...v)=>v.forEach(n=>names.add(n)),remove:(...v)=>v.forEach(n=>names.delete(n)),toggle:(n,v)=>v?names.add(n):names.delete(n),contains:n=>names.has(n)};}
    append(...nodes){this.children.push(...nodes);}remove(){}removeAttribute(n){this[n]='';}getAttribute(){return null;}load(){}pause(){this.paused=true;}play(){this.paused=false;return Promise.resolve();}
  }
  const hero=new Node('div'),bgm=new Node('audio'),dock=new Node('div'),full=new Node('img');
  const doc=new EventTarget();Object.assign(doc,{hidden:false,createElement:tag=>new Node(tag),getElementById:id=>({'background-audio':bgm,'sound-dock':dock,'photo-full':full}[id]),querySelector:s=>s==='.hero-photo'?hero:null});
  const win=new EventTarget();let observe;Object.assign(win,{IntersectionObserver:class{constructor(cb){observe=cb;}observe(){}disconnect(){}},cancelAnimationFrame(){}});
  let enabled=false;const controller=mountExpandedMedia({doc,win,motion:()=>enabled,media:()=>'/example.mp4',photo:()=>null});const settings=exp({values:{coverMedia:'loop'}});controller.update(settings);const [video,button]=hero.children;
  observe([{isIntersecting:true}]);assert.equal(video.src,'');assert.equal(button.hidden,true);assert.equal(video.hidden,true);
  enabled=true;doc.dispatchEvent(new Event('lab:motion-change'));enabled=false;doc.dispatchEvent(new Event('lab:motion-change'));await Promise.resolve();assert.equal(video.paused,true);assert.equal(hero.classList.contains('is-live'),false);
  enabled=true;doc.dispatchEvent(new Event('lab:motion-change'));await Promise.resolve();assert.equal(button.hidden,false);assert.equal(video.paused,false);
  button.onclick();assert.equal(video.paused,true);controller.update(settings);observe([{isIntersecting:true}]);assert.equal(video.paused,true);controller.destroy();
});


test('falling petals remain bounded and release every particle when hidden, motion disabled or dialog opens',async()=>{
  const {mountFallingPetals}=await import('../js/falling-petals.mjs');
  class Element{constructor(){this.children=[];this.style={};this.dataset={};}get childElementCount(){return this.children.length;}append(n){this.children.push(n);}replaceChildren(){this.children=[];}setAttribute(){}remove(){this.removed=true;}}
  const hero=new Element(),doc=new EventTarget(),reduced=new EventTarget();let intersect,mutation,enabled=true,dialog=false;
  reduced.matches=false;Object.assign(doc,{hidden:false,body:new Element(),createElement:()=>new Element(),querySelector:s=>s==='.hero'?hero:dialog?{}:null});
  const win={matchMedia:()=>reduced,IntersectionObserver:class{constructor(cb){intersect=cb;}observe(){}disconnect(){}},MutationObserver:class{constructor(cb){mutation=cb;}observe(){}disconnect(){}}};
  const c=mountFallingPetals({doc,win,motion:()=>enabled}),layer=hero.children[0];c.update('rose');assert.equal(layer.childElementCount,0);intersect([{isIntersecting:true}]);assert.equal(layer.childElementCount,14);
  for(let i=0;i<10;i++)c.update('rose');assert.equal(layer.childElementCount,14);
  enabled=false;doc.dispatchEvent(new Event('lab:motion-change'));assert.equal(layer.childElementCount,0);
  enabled=true;doc.dispatchEvent(new Event('lab:motion-change'));assert.equal(layer.childElementCount,14);
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(layer.childElementCount,0);doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));
  dialog=true;mutation();assert.equal(layer.childElementCount,0);dialog=false;mutation();assert.equal(layer.childElementCount,14);
  reduced.matches=true;reduced.dispatchEvent(new Event('change'));assert.equal(layer.childElementCount,0);reduced.matches=false;reduced.dispatchEvent(new Event('change'));
  intersect([{isIntersecting:false}]);assert.equal(layer.childElementCount,0);c.destroy();assert.equal(layer.removed,true);
});
