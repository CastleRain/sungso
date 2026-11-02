import { APPS, GROUPS, NAV_SELECTORS, AUXILIARY_LABELS, appForPath, normalizeSurface, writeSurface } from './suite-core.mjs';
import { installSuiteControls } from './suite-controls.mjs';

const app = typeof location === 'undefined' ? null : appForPath(location.pathname);
if (app && document.documentElement.dataset.ssSuite) {
  const ready = document.readyState === 'loading' ? new Promise(resolve => document.addEventListener('DOMContentLoaded',resolve,{once:true})) : Promise.resolve();
  await ready;
  mountSuite(app);
}

function element(tag, className, text) {
  const node=document.createElement(tag); if(className)node.className=className;
  if(text!==undefined)node.textContent=text;return node;
}
function icon(name) {
  const img=element('img','ss-icon');img.src=new URL('./icons/'+name+'.svg',import.meta.url).href;img.alt='';img.width=22;img.height=22;return img;
}
function button(label, name, action, className='ss-button') {
  const node=element('button',className);node.type='button';if(name)node.append(icon(name));if(label)node.append(element('span','',label));
  if(action)node.addEventListener('click',action);return node;
}
function appLink(item) {
  const link=element('a','ss-app-link');link.href='/sungso/'+item.path;link.style.setProperty('--ss-app-accent',item.accent);
  link.append(icon(item.icon),element('span','',item.short||item.title));return link;
}
function selected(target) {
  return target.matches('[aria-current="page"],[aria-selected="true"],.active,.is-active,[aria-pressed="true"]');
}
function navigationLabel(target, app) {
  if(app.id==='hub')return target.dataset.homeView==='apps'?'모든 앱':'우리 홈';
  const explicit=target.getAttribute('data-ss-label');if(explicit)return explicit;
  return target.textContent.replace(/\p{Extended_Pictographic}|\uFE0F/gu,'').replace(/\s+/g,' ').trim();
}
function navigationIcon(label) {
  if(/대시보드|판단 보드|한눈에/.test(label))return 'layout-dashboard';
  if(/자금|비용|매출|견적/.test(label))return 'wallet';
  if(/고정비/.test(label))return 'credit-card';
  if(/집|후보|분양/.test(label))return 'house';
  if(/일정|달력|준비/.test(label))return 'calendar-days';
  if(/지도|이동|방문|기록/.test(label))return 'route';
  if(/리조트|숙소/.test(label))return 'palm-tree';
  if(/하객|결혼|선택/.test(label))return 'heart';
  if(/장보기|레시피|먹지/.test(label))return 'utensils';
  if(/검증|연결/.test(label))return 'shield-check';
  if(/정보|안내|기준/.test(label))return 'book-open';
  return 'notebook-pen';
}
export function mountSuite(app) {
  const html=document.documentElement;
  html.style.setProperty('--ss-app-accent',app.accent);
  const shell=element('div','ss-shell');shell.id='ss-suite-shell';shell.hidden=true;
  const rail=element('nav','ss-rail');rail.setAttribute('aria-label','업무 공간');
  const home=appLink(APPS[0]);home.className='ss-rail-home';home.title='우리 홈';home.setAttribute('aria-label','우리 홈');
  if(app.id==='hub')home.setAttribute('aria-current','page');
  rail.append(home);
  const searchButton=button('','search',()=>openLauncher(),'ss-rail-item');searchButton.title='앱 찾기';searchButton.setAttribute('aria-label','앱 찾기');rail.append(searchButton);
  const railGroups=element('div','ss-rail-groups');
  for(const group of GROUPS){
    const item=button('',group.icon,()=>openLauncher(group.id),'ss-rail-item');
    item.title=group.title;item.setAttribute('aria-label',group.title+' 공간');
    if(app.group===group.id)item.setAttribute('aria-current','page');
    railGroups.append(item);
  }
  rail.append(railGroups);
  const all=button('','grid-2x2',()=>openLauncher(),'ss-rail-item');all.title='모든 앱';all.setAttribute('aria-label','모든 앱 열기');rail.append(all);
  const sidebar=element('aside','ss-sidebar');sidebar.setAttribute('aria-label',app.title+' 메뉴');
  const brand=element('a','ss-wordmark');brand.href='/sungso/';
  const wordmark=element('img','sungso-wordmark');wordmark.src=new URL('./sungso-wordmark-sky.png',import.meta.url).href;wordmark.alt='sungso';wordmark.width=144;wordmark.height=42;brand.append(wordmark);
  const close=button('','x',()=>closeMenu(),'ss-menu-close');close.setAttribute('aria-label','메뉴 닫기');
  const sidebarHead=element('div','ss-sidebar-heading');sidebarHead.append(brand,close,element('h2','',app.title),element('p','',app.description));
  const nav=element('nav','ss-context-nav');nav.setAttribute('aria-label','현재 앱 메뉴');
  const auxiliary=element('details','ss-auxiliary');const auxSummary=element('summary','','도구·도움');auxSummary.append(icon('chevron-right'));
  const auxNav=element('nav');auxNav.setAttribute('aria-label','도구와 도움 메뉴');auxiliary.append(auxSummary,auxNav);
  const related=element('div','ss-related');related.append(element('p','ss-nav-caption','함께 쓰는 도구'));
  for(const item of APPS.filter(item=>item.group===app.group && item.id!==app.id))related.append(appLink(item));
  if(app.id==='hub'){
    for(const group of GROUPS){
      const item=button(group.title,group.icon,()=>openLauncher(group.id),'ss-context-item');related.append(item);
    }
  }
  const sideFooter=element('div','ss-sidebar-footer');sideFooter.append(icon('sun'),element('span','','밝은 글래스'));
  const sidebarContent=element('div','ss-sidebar-content');sidebarContent.append(sidebarHead,nav,auxiliary,related);
  sidebar.append(sidebarContent,sideFooter);
  shell.append(rail,sidebar);
  const mask=button('','',()=>closeMenu(),'ss-menu-mask');mask.setAttribute('aria-label','메뉴 닫기');mask.tabIndex=-1;mask.hidden=true;
  const topbar=element('header','ss-topbar');topbar.hidden=true;
  const menuButton=button('','menu',()=>openMenu(),'ss-menu-open');menuButton.setAttribute('aria-label','앱 메뉴 열기');menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-controls',shell.id);
  const breadcrumb=element('div','ss-breadcrumb');const homeCrumb=element('a','','우리 홈');homeCrumb.href='/sungso/';const currentTitle=element('span','ss-current-title',app.title);
  breadcrumb.append(homeCrumb,icon('chevron-right'),currentTitle);
  const date=element('time','ss-current-date',new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long'}).format(new Date()));
  topbar.append(menuButton,breadcrumb,date);
  const appearance=element('div','ss-appearance');appearance.hidden=true;appearance.setAttribute('role','group');appearance.setAttribute('aria-label','화면 스타일');
  const solid=button('기본','layers',()=>setSurface('solid'),'ss-surface-choice');
  const glass=button('글래스','sun',()=>setSurface('glass'),'ss-surface-choice');
  appearance.append(solid,glass);
  const modeStatus=element('div','ss-announcement');modeStatus.setAttribute('role','status');modeStatus.setAttribute('aria-live','polite');
  const launcher=element('dialog','ss-launcher');launcher.setAttribute('aria-labelledby','ss-launcher-title');
  const launcherHeader=element('header','ss-launcher-heading');const launcherClose=button('','x',()=>launcher.close(),'ss-icon-button');launcherClose.setAttribute('aria-label','앱 찾기 닫기');
  launcherHeader.append(element('h2','','함께 쓰는 도구'),launcherClose);launcherHeader.querySelector('h2').id='ss-launcher-title';
  const search=element('input','ss-app-search');search.type='search';search.placeholder='앱 이름이나 용도로 찾기';search.setAttribute('aria-label','앱 검색');search.autocomplete='off';
  const groups=element('div','ss-launcher-groups');groups.setAttribute('role','group');groups.setAttribute('aria-label','업무 분류');
  const results=element('div','ss-launcher-results');const resultStatus=element('p','ss-search-count');resultStatus.setAttribute('role','status');
  launcher.append(launcherHeader,search,groups,resultStatus,results);
  document.body.append(mask,shell,topbar,appearance,launcher,modeStatus);
  let groupFilter='all',menuOpen=false,returnFocus=null,privateInert=null,previousOverflow='';
  let navSignature='',navControls=[],refreshQueued=false,controlsCleanup=null,disposed=false;
  const groupButtons=[];
  for(const group of [{id:'all',title:'전체'},...GROUPS]){
    const control=button(group.title,null,()=>{groupFilter=group.id;renderLauncher();},'ss-filter');
    groups.append(control);groupButtons.push([control,group.id]);
  }
  search.addEventListener('input',renderLauncher);
  function renderLauncher(){
    for(const[control,id]of groupButtons)control.setAttribute('aria-pressed',String(groupFilter===id));
    const needle=search.value.normalize('NFKC').trim().toLocaleLowerCase('ko-KR');
    const visible=APPS.filter(item=>(groupFilter==='all'||item.group===groupFilter)&&(!needle||[item.title,item.short,item.description,item.id].join(' ').toLocaleLowerCase('ko-KR').includes(needle)));
    results.replaceChildren();resultStatus.textContent=visible.length+'개 도구';
    for(const item of visible){const link=appLink(item);const label=link.querySelector('span');label.append(element('small','',item.description));results.append(link);}
    if(!visible.length)results.append(element('p','ss-empty','찾는 앱이 없어요. 다른 이름이나 용도로 찾아보세요.'));
  }
  function openLauncher(group='all'){
    closeMenu();groupFilter=group;search.value='';renderLauncher();launcher.showModal();search.focus();
  }
  launcher.addEventListener('click',event=>{if(event.target===launcher){const b=launcher.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)launcher.close();}});
  function openMenu(){
    if(html.dataset.ssSurface!=='glass')return;
    menuOpen=true;returnFocus=document.activeElement;html.dataset.ssMenu='open';mask.hidden=false;menuButton.setAttribute('aria-expanded','true');
    const root=document.querySelector('[data-private-root]');privateInert=root?{root,value:root.inert}:null;if(root)root.inert=true;
    previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';close.focus({preventScroll:true});
  }
  function closeMenu(){
    if(!menuOpen)return;menuOpen=false;delete html.dataset.ssMenu;mask.hidden=true;menuButton.setAttribute('aria-expanded','false');
    if(privateInert)privateInert.root.inert=privateInert.root.hidden||privateInert.value;privateInert=null;document.body.style.overflow=previousOverflow;
    if(returnFocus?.isConnected)returnFocus.focus();returnFocus=null;
  }
  document.addEventListener('keydown',event=>{
    if(!menuOpen)return;
    if(event.key==='Escape'){event.preventDefault();closeMenu();return;}
    if(event.key==='Tab'){
      const nodes=[...shell.querySelectorAll('button,a,summary'),...appearance.querySelectorAll('button')].filter(node=>!node.disabled&&node.getClientRects().length);
      const first=nodes[0],last=nodes.at(-1);if(!nodes.includes(document.activeElement)){event.preventDefault();(event.shiftKey?last:first)?.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
  function setSurface(value){
    closeMenu();const surface=normalizeSurface(value);const scroll={x:scrollX,y:scrollY};
    html.dataset.ssSurface=surface;let storage;try{storage=window.localStorage;}catch{}const stored=writeSurface(storage,surface);
    modeStatus.textContent=surface==='glass'?'밝은 글래스 화면으로 바꿨어요.':'기본 화면으로 바꿨어요.';
    if(!stored)modeStatus.textContent+=' 이 브라우저에서는 다음 방문까지 설정을 저장할 수 없어요.';
    refresh();window.dispatchEvent(new CustomEvent('sungso:surface-change',{detail:{surface}}));
    requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));window.scrollTo(scroll.x,scroll.y);});
  }
  function queueRefresh(){
    if(disposed||refreshQueued)return;refreshQueued=true;requestAnimationFrame(()=>{refreshQueued=false;if(!disposed)refresh();});
  }
  function refresh(){
    const roots=[...document.querySelectorAll('[data-private-root]')];const authenticated=roots.some(root=>!root.hidden);
    const isGlass=html.dataset.ssSurface==='glass';
    if(!authenticated){delete html.dataset.ssReady;closeMenu();}else html.dataset.ssReady='true';
    shell.hidden=!authenticated||!isGlass;topbar.hidden=!authenticated||!isGlass;appearance.hidden=!authenticated;
    solid.setAttribute('aria-pressed',String(!isGlass));glass.setAttribute('aria-pressed',String(isGlass));
    if(!authenticated){if(launcher.open)launcher.close();controlsCleanup?.();controlsCleanup=null;return;}
    if(!controlsCleanup)controlsCleanup=installSuiteControls({root:document});
    const selector=NAV_SELECTORS[app.id];const seen=new Set();
    const targets=selector?[...document.querySelectorAll(selector)].filter(target=>{
      if(target.closest('.ss-shell'))return false;
      const key=app.id==='hub'?target.dataset.homeView:target.dataset.tab||target.dataset.viewTarget||target.dataset.viewLink||target.dataset.travelViewLink||target.id||target.getAttribute('href');
      if(seen.has(key))return false;seen.add(key);return true;
    }):[];
    const signature=targets.map(target=>navigationLabel(target,app)+'|'+(target.id||target.getAttribute('href')||target.dataset.tab||target.dataset.viewTarget||target.dataset.viewLink||target.dataset.travelViewLink||'')).join(';;');
    if(signature!==navSignature){
      navSignature=signature;nav.replaceChildren();auxNav.replaceChildren();navControls=[];
      for(const target of targets){
        const label=navigationLabel(target,app);
        const entry={target,control:null,label};
        const control=button(label,navigationIcon(label),()=>{entry.target.click();closeMenu();queueRefresh();},'ss-context-item');
        entry.control=control;(AUXILIARY_LABELS.test(label)?auxNav:nav).append(control);navControls.push(entry);
      }
    }else{
      navControls.forEach((entry,index)=>entry.target=targets[index]);
    }
    let selectedLabel='';
    for(const entry of navControls){
      const active=selected(entry.target);const disabled=entry.target.disabled===true;
      entry.control.disabled=disabled;
      if(active){entry.control.setAttribute('aria-current','page');selectedLabel=entry.label;}
      else entry.control.removeAttribute('aria-current');
    }
    auxiliary.hidden=!auxNav.children.length;
    related.hidden=!related.querySelector('a,button');
    const title=selectedLabel||app.title;if(currentTitle.textContent!==title)currentTitle.textContent=title;
    if(app.id==='sohee-workspace'&&!nav.children.length){
      const sales=APPS.find(item=>item.id==='sohee-sales');nav.append(appLink(sales));
      const portfolio=element('a','ss-context-item','포트폴리오 예시');portfolio.href='/sungso/sohee/portfolio/';nav.append(portfolio);
    }
    if(app.id==='journey'&&!nav.children.length){
      for(const[id,label,name]of [['toggleStory','기록 목록','route'],['addRecord','기록 추가','plus'],['openImport','타임라인 가져오기','calendar-days']]){
        const control=button(label,name,()=>{document.getElementById(id)?.click();closeMenu();},'ss-context-item');nav.append(control);
      }
    }
  }
  const observer=new MutationObserver(records=>{
    if(records.every(record=>[shell,appearance,topbar,launcher,modeStatus].some(root=>root===record.target||root.contains(record.target))))return;
    queueRefresh();
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-current','aria-selected','aria-pressed','class','disabled']});
  window.addEventListener('sungso:ready',queueRefresh);window.addEventListener('popstate',queueRefresh);window.addEventListener('hashchange',queueRefresh);
  document.addEventListener('travel:view-changed',queueRefresh);
  window.addEventListener('storage',event=>{if(event.key==='sungso.ui.surface.v1'){html.dataset.ssSurface=normalizeSurface(event.newValue);closeMenu();refresh();window.dispatchEvent(new CustomEvent('sungso:surface-change',{detail:{surface:html.dataset.ssSurface}}));window.dispatchEvent(new Event('resize'));}});
  matchMedia('(min-width: 981px)').addEventListener('change',event=>{if(event.matches)closeMenu();});
  refresh();
  return () => { disposed=true;observer.disconnect();controlsCleanup?.();closeMenu(); };
}
