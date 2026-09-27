import { fixture } from './fixture.mjs';
export async function connectSales(onClear) {
  const bar=document.createElement('div'); bar.className='qa-bar';
  bar.textContent='로컬 검증 · 모든 매출은 가상 자료 · 운영 요청 없음';
  document.body.prepend(bar);
  let retired=false;
  const logout=document.createElement('button');logout.textContent='QA 로그아웃';bar.append(logout);
  logout.onclick=()=>{retired=true;onClear();document.getElementById('sales-root').hidden=true;bar.textContent='로그아웃됨 · 개인 화면 제거 완료';};
  const root=document.getElementById('sales-root');root.hidden=false;root.inert=false;
  return { label:'가상 자료 · 로컬 화면 검증', async load(){if(retired)throw new Error('STALE');return {data:fixture(),manifest:{version:'a'.repeat(64)}};}, async request(route){if(route==='status')return {mode:'upload',writesEnabled:false};throw new Error('가상 화면 검증입니다. 실제 원본 검증은 회원 서비스에서 실행하세요.');} };
}
