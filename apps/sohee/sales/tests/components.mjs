import { build } from 'esbuild';
import { rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import React from 'react';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { fixture } from './fixture.mjs';

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/sungso/sohee/sales/',pretendToBeVisual:true});
for(const name of ['window','document','navigator','HTMLElement','Element','ShadowRoot','Document','Node','HTMLInputElement','HTMLAnchorElement','HTMLButtonElement','HTMLSelectElement','Event','MouseEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{configurable:true,value:typeof dom.window[name]==='function'&&name==='getComputedStyle'?dom.window[name].bind(dom.window):dom.window[name]});
globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
Element.prototype.scrollIntoView=()=>{};window.scrollTo=()=>{};
const {render,screen,fireEvent,cleanup,waitFor}=await import('@testing-library/react');
const user=(await import('@testing-library/user-event')).default.setup({document});
const here=path.dirname(fileURLToPath(import.meta.url)),output=path.join(here,'.component-test.cjs');
const charts=['ComposedChart','LabelList','ResponsiveContainer','AreaChart','Area','BarChart','Bar','LineChart','Line','XAxis','YAxis','CartesianGrid','Tooltip','Legend','Cell','ReferenceLine','Brush'];
await build({stdin:{contents:"export * from '../src/pages.jsx'; export * from '../src/update-panel.jsx'; export * from '../src/ui.jsx'; export * from '../src/menu-editor.jsx'; export {applyMenuRules} from '../../../../services/sohee/menu-rules.mjs';",loader:'jsx',resolveDir:here},bundle:true,platform:'node',format:'cjs',outfile:output,external:['react','react-dom','react-dom/*'],plugins:[{name:'charts-only',setup(api){api.onResolve({filter:/^recharts$/},()=>({path:'charts',namespace:'test'}));api.onLoad({filter:/.*/,namespace:'test'},()=>({contents:"import React from 'react';"+charts.map(name=>`export function ${name}(props){return React.createElement('div',null,props.children)}`).join('\n'),resolveDir:here}));}}]});
const {SalesApp,SalesUI,SourceDateTime,UpdateContext,UpdatePanel,MenuRuleContext,applyMenuRules}=createRequire(import.meta.url)(output);
const mount=child=>render(React.createElement(SalesUI,{env:'test'},child));
try {
 for(const route of ['overview','menus','prep','changes','data']){
  const r=mount(React.createElement(SalesApp,{data:fixture(),route,status:'synthetic'}));
  assert.equal(screen.getAllByRole('heading',{level:1}).length,1);assert.ok(!r.container.textContent.includes('NaN'));
  if(route==='overview'){
   await user.click(screen.getByRole('button',{name:'월별 매출 원장',exact:true}));
   await user.click(await screen.findByRole('button',{name:'2026-01',exact:true}));
   assert.equal(screen.getByRole('textbox',{name:'월',exact:true}).value,'2026-01');
   assert.equal(r.container.querySelector('.ledger-summary strong').textContent,'3,363,500원');
   await user.click(screen.getByRole('textbox',{name:'월',exact:true}));await user.click(screen.getByRole('option',{name:'2026-04',exact:true}));
   await user.click(screen.getByRole('button',{name:'2026-04-15 판매 상세',exact:true}));
   assert.ok(await screen.findByRole('dialog',{name:'2026-04-15 판매 상세'}));
   assert.equal(r.container.querySelector('.ledger-summary strong').textContent,'1,718,500원');
   await user.click(screen.getByRole('button',{name:'판매 상세 닫기'}));
   await user.click(screen.getByRole('radio',{name:'여러 날짜 선택',exact:true}));
   await user.click(screen.getByRole('button',{name:'2026-04-16 · 132,000원 · 부분일',exact:true}));assert.match(r.container.querySelector('.calendar-reading').textContent,/부분일/);
   assert.equal(r.container.querySelector('.ledger-summary strong').textContent,'132,000원');
   await user.click(screen.getByRole('button',{name:/^2026-04-15 ·/}));assert.match(r.container.querySelector('.period-title').textContent,/2일 선택/);
   await user.click(screen.getByRole('link',{name:'메뉴 판매',exact:true}));assert.ok(screen.getByRole('heading',{name:'메뉴 판매',exact:true}));
   assert.equal(window.location.pathname,'/sungso/sohee/sales/menus/');assert.match(r.container.querySelector('.period-title').textContent,/2일 선택/);assert.match(r.container.textContent,/부분일 1일은 메뉴 집계에서 제외/);
   window.history.replaceState(null,'','/sungso/sohee/sales/overview/');fireEvent(window,new window.PopStateEvent('popstate'));assert.ok(screen.getByRole('heading',{name:'매출 내역'}));
   assert.match(r.container.querySelector('.period-title').textContent,/2일 선택/);
   await user.click(screen.getByRole('button',{name:'날짜 선택',exact:true}));
   await user.click(screen.getByRole('radio',{name:'연속 기간',exact:true}));
   await user.click(screen.getByRole('button',{name:'분석일 2026-04-01',exact:true}));await user.click(screen.getByRole('button',{name:'분석일 2026-04-03',exact:true}));
   await user.click(screen.getByRole('button',{name:'선택 적용',exact:true}));assert.match(r.container.querySelector('.period-title').textContent,/2026-04-01 – 2026-04-03/);
   const expected=fixture().daily.filter(row=>row.date>='2026-04-01'&&row.date<='2026-04-03').reduce((sum,row)=>sum+row.amount,0);
   assert.equal(r.container.querySelector('.ledger-summary strong').textContent,expected.toLocaleString('ko-KR')+'원');
   await user.click(screen.getByRole('button',{name:'날짜 선택',exact:true}));await user.click(screen.getByRole('radio',{name:'여러 날짜',exact:true}));
   await user.click(screen.getByRole('button',{name:'분석일 2026-04-02',exact:true}));await user.click(screen.getByRole('button',{name:'분석일 2026-04-06',exact:true}));await user.click(screen.getByRole('button',{name:'선택 적용',exact:true}));
   assert.match(r.container.querySelector('.period-title').textContent,/2일 선택/);
   await user.click(screen.getByRole('button',{name:'월별 매출 원장',exact:true}));
   await user.click(await screen.findByRole('button',{name:'기록일당',exact:true}));assert.equal(screen.getByRole('button',{name:'기록일당',exact:true}).getAttribute('aria-pressed'),'true');
  }
  if(route==='changes'){
   assert.ok(screen.getByRole('heading',{name:'대시보드',exact:true}));
   const navigation=screen.getByRole('navigation',{name:'매출 분석'});
   assert.deepEqual([...navigation.querySelectorAll('a')].map(a=>a.textContent),['대시보드','매출 내역','메뉴 판매','디저트 준비']);
   assert.equal(screen.queryByRole('link',{name:'데이터 관리'}),null);
   assert.equal(screen.queryByRole('heading',{name:'매출 달력'}),null);
   const expected=fixture().daily.filter(row=>row.month==='2026-04').reduce((sum,row)=>sum+row.amount,0);
   assert.equal(r.container.querySelector('.owner-sales strong').textContent,expected.toLocaleString('ko-KR')+'원');
   const completeDays=fixture().daily.filter(row=>row.month==='2026-04'&&!row.partial_day&&row.record_day);
   const average=completeDays.reduce((sum,row)=>sum+row.amount,0)/completeDays.length;
   assert.equal(r.container.querySelector('.average-metric>strong').textContent,average.toLocaleString('ko-KR',{maximumFractionDigits:0})+'원');
   assert.equal(r.container.querySelector('.record-metric>strong').textContent,completeDays.length+'일');
   await user.click(screen.getByRole('button',{name:'매출 기록일 상세 보기',exact:true}));
   assert.ok(await screen.findByRole('dialog',{name:'선택 기간의 기록일',exact:true}));
   assert.match(screen.getByRole('dialog',{name:'선택 기간의 기록일'}).textContent,/근무·출퇴근 기록은 없습니다/);
   assert.match(screen.getByRole('dialog',{name:'선택 기간의 기록일'}).textContent,/토스 주문 시간대/);
   await user.click(screen.getByRole('button',{name:'기록일 상세 닫기',exact:true}));
   await user.click(screen.getByRole('button',{name:'누적',exact:true}));assert.equal(screen.getByRole('button',{name:'누적',exact:true}).getAttribute('aria-pressed'),'true');
   await user.click(screen.getByRole('button',{name:'자료 기준 보기'}));assert.ok(screen.getByText('이 화면의 자료 범위'));assert.equal(screen.getByRole('button',{name:'저장된 분석 다시 불러오기'}).disabled,true);
   await user.click(screen.getByRole('button',{name:'자료 기준 보기'}));
   await user.click(screen.getByRole('button',{name:'과거 변화와 비교 근거'}));assert.ok(await screen.findByRole('heading',{name:'월별 대량 주문 이력'}));
  }
  if(route==='prep'){
   assert.equal(screen.queryByRole('button',{name:'날짜 선택',exact:true}),null);
   await user.click(screen.getByRole('button',{name:'월 요일',exact:true}));
   const input=screen.getByRole('textbox',{name:'예시 마들렌 4구 당일 준비 수량',exact:true});await user.clear(input);await user.type(input,'0');await user.tab();assert.equal(input.value,'0');assert.match(r.container.querySelector('.prep-total').textContent,/3개/);
   fireEvent.keyDown(screen.getByRole('slider',{name:'준비 여유분'}),{key:'ArrowRight'});assert.equal(screen.getByRole('slider',{name:'준비 여유분'}).getAttribute('aria-valuenow'),'5');
   await user.click(screen.getByRole('button',{name:'신규·소량·최근 미판매 메뉴 1종'}));await user.click(await screen.findByRole('checkbox',{name:/예시 신메뉴/}));assert.equal(r.container.querySelectorAll('.prep-table tbody tr').length,3);
   await user.click(screen.getByRole('button',{name:'준비 참고 닫기',exact:true}));
   await user.click(screen.getByRole('button',{name:'요일 비교',exact:true}));assert.ok(screen.getByRole('heading',{name:'같은 메뉴, 다른 요일'}));
   await user.click(screen.getByRole('button',{name:'예측 검증',exact:true}));assert.match(r.container.textContent,/정확하지 않았습니다/);
   await user.click(screen.getByRole('button',{name:'일 요일',exact:true}));await user.click(screen.getByRole('button',{name:'시간대별 준비표',exact:true}));assert.ok(screen.getByRole('heading',{name:'이 요일은 계산할 기록이 부족합니다'}));
  }
  if(route==='menus'){
   await user.click(screen.getByRole('button',{name:'수량순',exact:true}));
   assert.equal(r.container.querySelector('.menu-rankings .ranking-label strong').textContent,'예시 쿠키');
   await user.click(screen.getByRole('button',{name:'예시 신메뉴 상세 보기',exact:true}));
   assert.ok(screen.getByRole('heading',{name:'예시 신메뉴 · 월별 변화',exact:true}));
   await user.click(screen.getByRole('button',{name:'메뉴 상세 닫기',exact:true}));
   await user.click(screen.getByRole('button',{name:'매출순',exact:true}));
   const shareSort=screen.getByRole('button',{name:/메뉴 금액 비중/});
   await user.click(shareSort);assert.equal(shareSort.closest('th').getAttribute('aria-sort'),'descending');
   const shares=()=>[...r.container.querySelectorAll('.menu-workbench tbody tr')].map(row=>parseFloat(row.children[4].textContent));
   assert.deepEqual(shares(),[...shares()].sort((a,b)=>b-a));
   await user.click(shareSort);assert.deepEqual(shares(),[...shares()].sort((a,b)=>a-b));
   await user.type(screen.getAllByRole('textbox',{name:'표 검색'})[0],'없는 메뉴');assert.ok(screen.getByText('해당 조건에 맞는 기록이 없습니다.'));
  }
  cleanup();
 }
 // A calendar browsed to the archive must follow a new cross-month analysis range.
 const sourceView=mount(React.createElement(SalesApp,{data:fixture(),route:'overview'}));
 await user.click(screen.getByRole('textbox',{name:'월',exact:true}));await user.click(screen.getByRole('option',{name:'2026-01',exact:true}));
 await user.click(screen.getByRole('button',{name:'날짜 선택',exact:true}));
 await user.click(screen.getByRole('button',{name:'선택 달력 다음 달',exact:true}));await user.click(screen.getByRole('button',{name:'선택 달력 다음 달',exact:true}));
 await user.click(screen.getByRole('button',{name:'분석일 2026-03-30',exact:true}));await user.click(screen.getByRole('button',{name:'선택 달력 다음 달',exact:true}));
 await user.click(screen.getByRole('button',{name:'분석일 2026-04-02',exact:true}));await user.click(screen.getByRole('button',{name:'선택 적용',exact:true}));
 assert.match(sourceView.container.querySelector('.sales-calendar').textContent,/2026년 4월/);
 await user.click(screen.getByRole('button',{name:'이전 매출 월',exact:true}));
 assert.match(sourceView.container.querySelector('.sales-calendar').textContent,/2026년 3월/);
 assert.match(sourceView.container.querySelector('.period-title').textContent,/2026-03-30 – 2026-04-02/);
 assert.equal(screen.getByRole('button',{name:/^2026-03-29 ·/}).disabled,true);
 await user.click(screen.getByRole('button',{name:/^2026-03-30 ·/}));
 assert.ok(await screen.findByRole('dialog',{name:'2026-03-30 판매 상세'}));await user.click(screen.getByRole('button',{name:'판매 상세 닫기'}));
 await user.click(screen.getByRole('button',{name:'날짜 선택',exact:true}));
 assert.ok(screen.getByRole('button',{name:'2026년 4월',exact:true}));
 await user.click(screen.getByRole('button',{name:'날짜 선택 닫기',exact:true}));
 await user.click(screen.getByRole('radio',{name:'페이히어',exact:true}));
 assert.equal(screen.getByRole('textbox',{name:'월',exact:true}).value,'2026-01');
 assert.match(sourceView.container.querySelector('.calendar-availability').textContent,/페이히어 기록.*메뉴는 월별/);
 assert.ok([...sourceView.container.querySelectorAll('.ledger-day-layout .data-table tbody tr')].every(row=>row.textContent.includes('페이히어')&&row.textContent.includes('월별만')));
 assert.equal(sourceView.container.querySelector('.ledger-summary strong').textContent,'3,363,500원');
 await user.click(screen.getByRole('button',{name:'2026-01-31 판매 상세',exact:true}));
 assert.match(screen.getByRole('dialog').textContent,/저장된 페이히어 자료/);
 await user.click(screen.getByRole('link',{name:'2026-01 월별 메뉴 판매 보기 →',exact:true}));
 assert.ok(screen.getByRole('heading',{name:'메뉴 판매',exact:true}));assert.match(sourceView.container.querySelector('.period-title').textContent,/2026-01/);cleanup();
 // Explicit editing changes reporting quantities, keeps revenue, and restores originals.
 const rawMenus=fixture();let writes=0;
 function RulesHarness(){const [rules,setRules]=React.useState([]);return React.createElement(MenuRuleContext.Provider,{value:{rawData:rawMenus,rules,saveRule:async(draft,revision)=>{writes++;const saved={...draft,revision:revision+1};setRules([saved]);return saved;}}},React.createElement(SalesApp,{data:applyMenuRules(rawMenus,rules),route:'menus'}));}
 const edited=mount(React.createElement(RulesHarness));
 await user.click(screen.getByRole('button',{name:'메뉴 이름·수량 수정',exact:true}));
 const sourceSelect=await screen.findByRole('textbox',{name:'원본 메뉴',exact:true});await waitFor(()=>assert.equal(sourceSelect.disabled,false));await user.click(sourceSelect);await user.click(screen.getByRole('option',{name:'예시 마들렌 4구',exact:true}));
 await user.clear(screen.getByRole('textbox',{name:'집계할 메뉴 이름',exact:true}));await user.type(screen.getByRole('textbox',{name:'집계할 메뉴 이름',exact:true}),'예시 쿠키');
 await user.click(screen.getByRole('textbox',{name:'집계 단위',exact:true}));await user.click(screen.getByRole('option',{name:'개',exact:true}));
 const multiple=screen.getByRole('textbox',{name:'원본 1단위당 수량',exact:true});await user.clear(multiple);await user.type(multiple,'4');await user.tab();
 assert.equal(writes,0);await user.click(screen.getByRole('button',{name:'Firebase에 저장',exact:true}));await screen.findByText('Firebase에 저장했습니다. 판매 분석에 적용되었습니다.');assert.equal(writes,1);
 assert.match(edited.container.querySelector('.menu-workbench tbody tr').textContent,/예시 쿠키321개1,032,000원/);
 await user.click(screen.getByRole('button',{name:'원본 집계로 되돌리기'}));await screen.findByText('원본 이름과 수량으로 되돌렸습니다.');assert.equal(writes,2);assert.match(edited.container.querySelector('.menu-workbench tbody').textContent,/예시 마들렌 4구63팩/);cleanup();
 // The compact source panel only reloads stored data; it never starts collection.
 let sourceReloads=0,sourceRequests=0;
 const missingBulk=fixture();delete missingBulk.bulk;
 mount(React.createElement(UpdateContext.Provider,{value:{reload:async()=>sourceReloads++,connection:{request:async()=>sourceRequests++}}},React.createElement(SalesApp,{data:missingBulk,route:'changes'})));
 assert.ok(screen.getByText('분리 자료 없음'));
 await user.click(screen.getByRole('button',{name:'자료 기준 보기'}));
 await user.click(await screen.findByRole('button',{name:'저장된 분석 다시 불러오기'}));
 await waitFor(()=>assert.equal(sourceReloads,1));assert.equal(sourceRequests,0);cleanup();
 // Real date picker: selecting a wall-clock time must keep its date even across UTC boundaries.
 let picked;function DateHarness(){const [value,setValue]=React.useState('2026-05-02T00:30');return React.createElement(SourceDateTime,{value,onChange:v=>{picked=v;setValue(v)}})}mount(React.createElement(DateHarness));
 await user.click(screen.getByRole('button',{name:/원본 추출 시각/}));
 const candidates=Array.from(document.querySelectorAll('.mantine-DateTimePicker-day')).filter(b=>b.textContent==='3'&&!b.hasAttribute('data-outside'));
 assert.equal(candidates.length,1);await user.click(candidates[0]);assert.equal(picked,'2026-05-03T00:30');await user.click(screen.getByRole('spinbutton',{name:'시',exact:true}));await user.keyboard('14');await user.click(screen.getByRole('spinbutton',{name:'분',exact:true}));await user.keyboard('32');assert.equal(picked,'2026-05-03T14:32');cleanup();
 let calls=[],reloads=0;const context={manifest:{version:'test-version'},reload:async()=>reloads++,connection:{request:async(route,body)=>{calls.push({route,body});if(route==='status')return{mode:'upload',writesEnabled:true};if(route==='prepare')return{id:'candidate',start:'2026-05-01',end:'2026-05-02',completeThrough:'2026-05-01',partialDates:['2026-05-02']};return{stored:true};}}};
 const r=mount(React.createElement(UpdateContext.Provider,{value:context},React.createElement(UpdatePanel)));
 const file=new window.File([new Uint8Array([80,75,1,2])],'example.zip',{type:'application/zip'});file.arrayBuffer=async()=>new Uint8Array([80,75,1,2]).buffer;
 await user.upload(r.container.querySelector('input[type=file]'),file);
 await user.click(screen.getByRole('button',{name:/원본 추출 시각/}));
 const available=Array.from(document.querySelectorAll('.mantine-DateTimePicker-day')).find(b=>!b.disabled&&!b.hasAttribute('data-outside'));
 await user.click(available);await user.click(screen.getByRole('button',{name:'추출 시각 선택 완료'}));
 await user.type(screen.getByLabelText('ZIP 암호'),'synthetic-password');
 await user.click(screen.getByRole('button',{name:'새 원본 검증하기'}));
 await waitFor(()=>assert.equal(calls.filter(v=>v.route==='prepare').length,1));
 assert.match(calls.find(v=>v.route==='prepare').body.capturedAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/);assert.equal(screen.getByLabelText('ZIP 암호').value,'');assert.ok(screen.getByRole('heading',{name:'저장 전 확인'}));
 assert.equal(calls.filter(v=>v.route==='commit').length,0);
 await user.click(screen.getByRole('button',{name:'검증한 분석을 Firebase에 저장'}));await waitFor(()=>assert.equal(reloads,1));assert.equal(calls.filter(v=>v.route==='commit').length,1);cleanup();
 const readOnlyContext={...context,connection:{request:async()=>({mode:'local-only',writesEnabled:false})}};
 mount(React.createElement(UpdateContext.Provider,{value:readOnlyContext},React.createElement(UpdatePanel)));
 await screen.findByText('저장된 분석을 조회하고 있습니다. 새 토스 원본은 요청할 때 Codex가 PC에서 가져와 반영합니다.');
 assert.equal(screen.queryByRole('button',{name:'새 원본 검증하기'}),null);cleanup();
 // The shared auth layer removes private shell children before calling React cleanup.
 // Unmount must also succeed after that removal (logout and bfcache restoration).
 const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');
 for(const [file,id] of [['../index.html','sales-root'],['../../workspace/index.html','workspace-root']]){
  const parsed=new JSDOM(await readFile(path.resolve(here,file),'utf8'));
  const host=document.createElement('div');host.innerHTML=parsed.window.document.querySelector('[data-private-root]').outerHTML;document.body.append(host);parsed.window.close();
  const container=host.querySelector('#'+id),shell=host.querySelector('[data-private-root]'),errors=[];
  const root=createRoot(container,{onUncaughtError:error=>errors.push(error)});
  flushSync(()=>root.render(React.createElement('strong',null,'합성 회원 화면')));
  shell.hidden=true;shell.inert=true;shell.replaceChildren();
  assert.equal(host.textContent,'');flushSync(()=>root.unmount());
  assert.equal(errors.length,0,`${id}: React cleanup must survive auth shell removal`);assert.equal(container.textContent,'');host.remove();
 }
 console.log('PASS: four primary pages plus compatible source route, stored-data-only reload, real Mantine controls, month/date selection, calendar boundaries, pack zero override, buffer/extra menus, empty sample/search, Korea-time picker, explicit source review → save, auth-shell removal before React cleanup. Charts alone use doubles.');
} finally {cleanup();dom.window.close();await rm(output,{force:true});}
