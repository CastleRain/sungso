import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { appForPath, readSurface, writeSurface, searchApps, SURFACE_KEY } from '../../shared/theme/suite-core.mjs';
import { mountSuite } from '../../shared/theme/suite.mjs';
const require = createRequire(new URL('../../apps/sohee/sales/package.json',import.meta.url));
const { JSDOM } = require('jsdom');
const tick = () => new Promise(resolve => setTimeout(resolve,35));

test('first visit, invalid preferences and unavailable storage use the original screen',()=>{
  assert.equal(readSurface({getItem:()=>null}),'solid');
  assert.equal(readSurface({getItem:()=> 'dark'}),'solid');
  assert.equal(readSurface({getItem(){throw Error('blocked');}}),'solid');
  const values = new Map();const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  assert.equal(writeSurface(storage,'glass'),true);assert.equal(readSurface(storage),'glass');
  assert.deepEqual([...values.keys()],[SURFACE_KEY]);assert.equal(writeSurface(undefined,'solid'),false);
});
test('managed routes and search leave public invitations and portfolio untouched',()=>{
  for(const url of ['/sungso/','/sungso/index.html','/'])assert.equal(appForPath(url).id,'hub');
  assert.equal(appForPath('/sungso/sohee/sales/menus/').id,'sohee-sales');
  for(const url of ['/sungso/invitation-v2/','/sungso/invitation-v5/responses.html','/sungso/sohee/portfolio/','/sungso/no-such-app/'])assert.equal(appForPath(url),null);
  assert.equal(searchApps('ＷｅＣｏｓｔ').length,1);
  assert.deepEqual(searchApps('','home').map(x=>x.id),['homehunt','homehunt-v2']);
});
test('prepaint boot only reads the separate appearance key and does not affect excluded pages',async()=>{
  const source=await readFile(new URL('../../shared/theme/suite-boot.js',import.meta.url),'utf8');
  for(const [pathname,expected]of [['/sungso/wecost/','wecost'],['/sungso/sohee/workspace/','sohee-workspace'],['/sungso/invitation-v5/',null]]){
    const dataset={},keys=[];vm.runInNewContext(source,{location:{pathname},document:{documentElement:{dataset}},localStorage:{getItem(k){keys.push(k);return 'glass';}}});
    assert.equal(dataset.ssSuite,expected??undefined);
    if(expected){assert.equal(dataset.ssSurface,'glass');assert.deepEqual(keys,[SURFACE_KEY]);}else assert.deepEqual(keys,[]);
  }
});

test('appearance switching preserves live form and tab, mirrors replaced navigation and hides on signout',async t=>{
  const dom=new JSDOM('<html data-ss-suite="wecost" data-ss-surface="solid"><body><main data-private-root hidden><nav id="app-nav"><button class="nav-item active" data-tab="dashboard">대시보드</button><button class="nav-item" data-tab="funds">우리 자금</button></nav><form><input id="draft" value="saving draft"></form></main></body></html>',{url:'http://localhost/sungso/wecost/',pretendToBeVisual:true});
  const win=dom.window,doc=win.document,saved={};
  const bindings={window:win,document:doc,location:win.location,MutationObserver:win.MutationObserver,CustomEvent:win.CustomEvent,Event:win.Event,requestAnimationFrame:win.requestAnimationFrame.bind(win),matchMedia:()=>({addEventListener(){}}),scrollX:0,scrollY:0};
  for(const[k,v]of Object.entries(bindings)){saved[k]=globalThis[k];globalThis[k]=v;}
  win.scrollTo=()=>{};
  const cleanup=mountSuite(appForPath(win.location.pathname));
  t.after(async()=>{doc.querySelector('[data-private-root]').hidden=true;await tick();cleanup();win.close();for(const k of Object.keys(bindings)){if(saved[k]===undefined)delete globalThis[k];else globalThis[k]=saved[k];}});
  assert.equal(doc.querySelector('.ss-appearance').hidden,true);
  const main=doc.querySelector('main');main.hidden=false;await tick();
  const draft=doc.querySelector('#draft');draft.value='unfinished 123';
  const styles=[...doc.querySelectorAll('.ss-surface-choice')];let changes=0;win.addEventListener('sungso:surface-change',()=>changes++);
  styles[1].click();await tick();assert.equal(doc.documentElement.dataset.ssSurface,'glass');
  assert.equal(doc.querySelector('#draft'),draft);assert.equal(draft.value,'unfinished 123');assert.equal(win.localStorage.getItem(SURFACE_KEY),'glass');
  let selected='dashboard';const bind=node=>node.addEventListener('click',()=>{selected=node.dataset.tab;doc.querySelectorAll('#app-nav button').forEach(b=>b.classList.toggle('active',b===node));});doc.querySelectorAll('#app-nav button').forEach(bind);
  const proxy=()=>[...doc.querySelectorAll('.ss-context-item')].find(x=>x.textContent==='우리 자금');proxy().click();await tick();assert.equal(selected,'funds');assert.equal(proxy().getAttribute('aria-current'),'page');
  const original=doc.querySelector('[data-tab="funds"]'),replacement=original.cloneNode(true);let replacements=0;replacement.addEventListener('click',()=>replacements++);original.replaceWith(replacement);await tick();proxy().click();assert.equal(replacements,1);
  styles[0].click();await tick();assert.equal(selected,'funds');assert.equal(draft.value,'unfinished 123');assert.equal(changes,2);
  main.hidden=true;await tick();assert.equal(doc.querySelector('.ss-appearance').hidden,true);assert.equal(doc.querySelector('.ss-shell').hidden,true);assert.equal(doc.documentElement.dataset.ssReady,undefined);
});
