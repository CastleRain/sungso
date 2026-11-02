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

function suiteFixture(t,appId,content){
  const dom=new JSDOM(`<html data-ss-suite="${appId}" data-ss-surface="glass"><body>${content}</body></html>`,{url:`http://localhost/sungso/${appId}/`,pretendToBeVisual:true});
  const win=dom.window,doc=win.document,saved={};
  const bindings={window:win,document:doc,location:win.location,MutationObserver:win.MutationObserver,CustomEvent:win.CustomEvent,Event:win.Event,requestAnimationFrame:win.requestAnimationFrame.bind(win),matchMedia:()=>({addEventListener(){}}),scrollX:0,scrollY:0};
  for(const[k,v]of Object.entries(bindings)){saved[k]=globalThis[k];globalThis[k]=v;}
  win.scrollTo=()=>{};
  const cleanup=mountSuite(appForPath(win.location.pathname));
  t.after(async()=>{doc.querySelector('[data-private-root]').hidden=true;await tick();cleanup();win.close();for(const k of Object.keys(bindings)){if(saved[k]===undefined)delete globalThis[k];else globalThis[k]=saved[k];}});
  return {win,doc};
}

test('both font family names resolve to the same local asset while artwork controls retain their typeface',async()=>{
  const css=await readFile(new URL('../../shared/theme/suite.css',import.meta.url),'utf8');
  const dom=new JSDOM('<html data-ss-suite="invitation"><head></head><body><button id="manage">관리</button><div class="invitation"><button id="artwork">작품</button></div></body></html>');
  try{
    const style=dom.window.document.createElement('style');style.textContent=css;dom.window.document.head.append(style);
    const faces=[...style.sheet.cssRules].filter(rule=>rule.type===5);
    const face=name=>faces.find(rule=>rule.style.getPropertyValue('font-family').replace(/["']/g,'')===name);
    assert.ok(face('Pretendard'));assert.ok(face('Pretendard Variable'));
    assert.equal(face('Pretendard').style.getPropertyValue('src'),face('Pretendard Variable').style.getPropertyValue('src'));
    const bytes=await readFile(new URL('../../shared/theme/fonts/PretendardVariable.woff2',import.meta.url));assert.equal(bytes.subarray(0,4).toString(),'wOF2');
    const forced=[...style.sheet.cssRules].find(rule=>rule.selectorText?.includes('button')&&rule.style.getPropertyPriority('font-family')==='important');
    assert.ok(dom.window.document.querySelector('#manage').matches(forced.selectorText));
    assert.equal(dom.window.document.querySelector('#artwork').matches(forced.selectorText),false);
    const artworkCss=await readFile(new URL('../../apps/invitation/css/glass.css',import.meta.url),'utf8');
    assert.equal(/--sans\s*:/.test(artworkCss),false,'glass chrome must not replace the artwork font variable');
  }finally{dom.window.close();}
});

test('Travel groups all eight original destinations without replacing navigation actions or drafts',async t=>{
  const views=[['itinerary','전체 일정'],['hotels','숙소'],['transport','항공·크루즈'],['stay','리조트·이동'],['activities','관광·식사'],['budget','여행 비용'],['readiness','출발 준비'],['history','변경 기록']];
  const {doc}=suiteFixture(t,'travel','<main data-private-root><nav>'+views.map(([id,label])=>`<button data-travel-view-link="${id}">${label}</button>`).join('')+'</nav><input id="draft" value="미저장 여행 조건"></main>');
  const draft=doc.querySelector('#draft'),clicked=[];
  doc.querySelectorAll('[data-travel-view-link]').forEach(target=>target.addEventListener('click',()=>{clicked.push(target.dataset.travelViewLink);doc.querySelectorAll('[data-travel-view-link]').forEach(item=>item.setAttribute('aria-current',item===target?'page':'false'));}));
  const groups=[...doc.querySelectorAll('.ss-context-group')];
  assert.deepEqual(groups.map(group=>group.getAttribute('aria-label')),['일정·지도','예약·이동','비용','출발 준비']);
  assert.deepEqual(groups.map(group=>[...group.querySelectorAll('button')].map(button=>button.textContent)),[['전체 일정','관광·식사'],['숙소','항공·크루즈','리조트·이동'],['여행 비용'],['출발 준비']]);
  assert.equal(doc.querySelector('.ss-auxiliary button').textContent,'변경 기록');
  for(const[,label]of views){const proxy=[...doc.querySelectorAll('.ss-context-item')].find(button=>button.textContent===label);proxy.click();await tick();assert.equal(proxy.getAttribute('aria-current'),'page');}
  assert.deepEqual(clicked,views.map(([id])=>id));assert.equal(doc.querySelector('#draft'),draft);assert.equal(draft.value,'미저장 여행 조건');
});

test('mobile menu keyboard wrap reaches the separate member logout control in DOM order',t=>{
  const {win,doc}=suiteFixture(t,'wecost','<div class="site-member-bar"><span>합성 회원</span><button id="logout">로그아웃</button></div><main data-private-root><nav id="app-nav"><button class="nav-item" data-tab="dashboard">대시보드</button></nav></main>');
  // jsdom has no layout; provide only the visibility result used by the trap.
  win.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{}];};
  const opener=doc.querySelector('.ss-menu-open'),logout=doc.querySelector('#logout'),last=doc.querySelector('.ss-surface-choice:last-child');
  let signedOut=0;logout.addEventListener('click',()=>signedOut++);
  opener.focus();opener.click();assert.equal(doc.querySelector('[data-private-root]').inert,true);
  last.focus();last.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(doc.activeElement,logout);
  logout.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(doc.activeElement,last);
  logout.focus();logout.click();assert.equal(signedOut,1);
  doc.querySelector('.ss-menu-close').click();assert.equal(doc.activeElement,opener);assert.ok(!doc.querySelector('[data-private-root]').inert);
});
