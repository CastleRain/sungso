import test from 'node:test';
import assert from 'node:assert/strict';
import {accentProgress,mountSceneAccents} from '../js/scene-accents.mjs';

class Node extends EventTarget {
  constructor(){super();this.children=[];this.attrs={};this.top=900;this.hidden=false;const values=new Map();this.style={setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k),getPropertyValue:k=>values.get(k)};const classes=new Set();this.classList={toggle:(k,on)=>on?classes.add(k):classes.delete(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)};}
  append(child){this.children.push(child);child.parent=this;}
  prepend(child){this.children.unshift(child);child.parent=this;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
  setAttribute(k,v){this.attrs[k]=v;}
  contains(n){return n===this||this.children.some(c=>c.contains(n));}
  getBoundingClientRect(){return {top:this.top};}
}
function fixture(composition={dayPass:'receipt',divider:'breath',motion:'signature'}){
  const doc=new Node(),win=new Node(),media=new Node(),gallery=new Node(),pass=new Node(),receipt=new Node(),frames=new Map();let id=0;
  pass.append(receipt);pass.querySelector=()=>receipt;doc.getElementById=id=>id==='gallery'?gallery:pass;doc.createElement=doc.createElementNS=()=>new Node();doc.querySelector=()=>doc.dialog;
  win.innerHeight=800;win.matchMedia=()=>media;win.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};win.cancelAnimationFrame=id=>frames.delete(id);
  for(const key of ['fetch','localStorage','open','Audio'])Object.defineProperty(win,key,{get(){assert.fail(`No side effect: ${key}`);}});
  const c=mountSceneAccents({doc,win,composition});const bridge=gallery.children[0];
  const flush=()=>{const run=[...frames.values()];frames.clear();run.forEach(fn=>fn());};
  const scroll=()=>{win.dispatchEvent(new Event('scroll'));flush();};
  return {doc,win,media,gallery,pass,receipt,bridge,frames,c,scroll,flush};
}
test('short accents finish before text is reached, remain bounded and do not rewind on return scroll',()=>{
  for(const speed of [.5,1,1.5]){assert.equal(accentProgress(1000,800,speed),0);assert.equal(accentProgress(0,800,speed),1);}
  const f=fixture();f.flush();assert.equal(f.receipt.style.getPropertyValue('--accent-progress'),'0');
  f.receipt.top=f.bridge.top=390;f.scroll();const partial=Number(f.receipt.style.getPropertyValue('--accent-progress'));assert.ok(partial>0&&partial<1);
  f.receipt.top=f.bridge.top=100;f.scroll();assert.equal(f.receipt.style.getPropertyValue('--accent-progress'),'1');
  f.receipt.top=900;f.scroll();assert.equal(f.receipt.style.getPropertyValue('--accent-progress'),'1');f.c.destroy();
});
test('receipt focus, motion off and reduced motion make information readable immediately',()=>{
  const f=fixture();f.flush();const focus=new Event('focusin');Object.defineProperty(focus,'target',{value:f.receipt});f.doc.dispatchEvent(focus);
  assert.equal(f.receipt.style.getPropertyValue('--accent-progress'),'1');
  f.c.prepareDemo('dayPass');f.media.matches=true;f.media.dispatchEvent(new Event('change'));
  assert.equal(f.receipt.classList.contains('receipt-motion'),false);assert.equal(f.bridge.style.getPropertyValue('--accent-progress'),'1');
  f.media.matches=false;f.c.setEnabled(false);assert.equal(f.receipt.classList.contains('receipt-motion'),false);f.c.destroy();
});
test('one bridge follows its album and demo cancellation settles without timers or new sections',()=>{
  const f=fixture();const restore=f.c.prepareDemo('divider');f.flush();restore();assert.equal(f.bridge.style.getPropertyValue('--accent-progress'),'1');
  f.c.setComposition({dayPass:'boarding',divider:'none'});assert.equal(f.bridge.hidden,true);assert.equal(f.gallery.children.length,1);
  f.c.setComposition({dayPass:'receipt',divider:'breath'});assert.equal(f.gallery.children[0],f.bridge);
  f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(f.frames.size,0);
  f.c.destroy();f.c.destroy();assert.equal(f.gallery.children.length,0);assert.equal(f.frames.size,0);
});
