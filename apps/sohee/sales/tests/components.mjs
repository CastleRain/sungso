import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import React from 'react';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { fixture } from './fixture.mjs';

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/sungso/sohee/sales/',pretendToBeVisual:true});
for(const name of ['window','document','navigator','HTMLElement','Element','ShadowRoot','Document','Node','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Event','MouseEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{configurable:true,value:typeof dom.window[name]==='function'&&name==='getComputedStyle'?dom.window[name].bind(dom.window):dom.window[name]});
globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
Element.prototype.scrollIntoView=()=>{};
const {render,screen,fireEvent,cleanup,waitFor}=await import('@testing-library/react');
const user=(await import('@testing-library/user-event')).default.setup({document});
const here=path.dirname(fileURLToPath(import.meta.url)),output=path.join(here,'.component-test.cjs');
const charts=['ResponsiveContainer','AreaChart','Area','BarChart','Bar','LineChart','Line','XAxis','YAxis','CartesianGrid','Tooltip','Legend','Cell','ReferenceLine','Brush'];
await build({stdin:{contents:"export * from '../src/pages.jsx'; export * from '../src/update-panel.jsx'; export * from '../src/ui.jsx';",loader:'jsx',resolveDir:here},bundle:true,platform:'node',format:'cjs',outfile:output,external:['react','react-dom','react-dom/*'],plugins:[{name:'charts-only',setup(api){api.onResolve({filter:/^recharts$/},()=>({path:'charts',namespace:'test'}));api.onLoad({filter:/.*/,namespace:'test'},()=>({contents:"import React from 'react';"+charts.map(name=>`export function ${name}(props){return React.createElement('div',null,props.children)}`).join('\n'),resolveDir:here}));}}]});
const {SalesApp,SalesUI,SourceDateTime,UpdateContext,UpdatePanel}=createRequire(import.meta.url)(output);
const mount=child=>render(React.createElement(SalesUI,{env:'test'},child));
try {
 for(const route of ['overview','menus','prep','changes','data']){
  const r=mount(React.createElement(SalesApp,{data:fixture(),route,status:'synthetic'}));
  assert.equal(screen.getAllByRole('heading',{level:1}).length,1);assert.ok(!r.container.textContent.includes('NaN'));
  if(route==='overview'){
   await user.click(screen.getByRole('button',{name:'2026-01',exact:true}));
   assert.equal(screen.getByRole('textbox',{name:'월',exact:true}).value,'2026-01');
   assert.equal(r.container.querySelector('.selected-month-summary strong').textContent,'수집 완료 · 총 3,363,500원');
   await user.click(screen.getByRole('textbox',{name:'월',exact:true}));await user.click(screen.getByRole('option',{name:'2026-04',exact:true}));
   assert.equal(screen.getByRole('textbox',{name:'월',exact:true}).value,'2026-04');
   await user.click(screen.getByRole('button',{name:'2026-04-16 · 132,000원 · 부분일',exact:true}));assert.match(r.container.querySelector('.calendar-reading').textContent,/부분일/);
   await user.click(screen.getByRole('button',{name:'이전 매출 월',exact:true}));assert.equal(screen.getByRole('textbox',{name:'월',exact:true}).value,'2026-03');
   await user.click(screen.getByRole('button',{name:'기록일당',exact:true}));assert.equal(screen.getByRole('button',{name:'기록일당',exact:true}).getAttribute('aria-pressed'),'true');
  }
  if(route==='prep'){
   await user.click(screen.getByRole('button',{name:'월 요일',exact:true}));
   const input=screen.getByRole('textbox',{name:'예시 마들렌 4구 당일 준비 수량',exact:true});await user.clear(input);await user.type(input,'0');await user.tab();assert.equal(input.value,'0');assert.match(r.container.querySelector('.prep-total').textContent,/3개/);
   fireEvent.keyDown(screen.getByRole('slider',{name:'준비 여유분'}),{key:'ArrowRight'});assert.equal(screen.getByRole('slider',{name:'준비 여유분'}).getAttribute('aria-valuenow'),'5');
   await user.click(screen.getByRole('button',{name:'신규·소량·최근 미판매 메뉴 1종'}));await user.click(await screen.findByRole('checkbox',{name:/예시 신메뉴/}));assert.equal(r.container.querySelectorAll('.prep-table tbody tr').length,3);
   await user.click(screen.getByRole('button',{name:'요일 비교',exact:true}));assert.ok(screen.getByRole('heading',{name:'같은 메뉴, 다른 요일'}));
   await user.click(screen.getByRole('button',{name:'예측 검증',exact:true}));assert.match(r.container.textContent,/정확하지 않았습니다/);
   await user.click(screen.getByRole('button',{name:'일 요일',exact:true}));await user.click(screen.getByRole('button',{name:'시간대별 준비표',exact:true}));assert.ok(screen.getByRole('heading',{name:'이 요일은 계산할 기록이 부족합니다'}));
  }
  if(route==='menus'){
   await user.type(screen.getAllByRole('textbox',{name:'표 검색'})[0],'없는 메뉴');assert.ok(screen.getByText('해당 조건에 맞는 기록이 없습니다.'));
  }
  cleanup();
 }
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
 console.log('PASS: five routes with real Mantine controls, month/date selection, calendar boundaries, pack zero override, buffer/extra menus, empty sample/search, Korea-time picker, explicit source review → save. Charts alone use doubles.');
} finally {cleanup();dom.window.close();await rm(output,{force:true});}
