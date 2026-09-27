import { fixture } from './fixture.mjs';
import {layoutFixture} from './layout-fixture.mjs';
export async function connectSales(onClear) {
  const bar=document.createElement('div'); bar.className='qa-bar';
  bar.textContent='로컬 검증 · 모든 매출은 가상 자료 · 운영 요청 없음';
  document.body.prepend(bar);
  let retired=false; let menuRules=[];
  const logout=document.createElement('button');logout.textContent='QA 로그아웃';bar.append(logout);
  const shell=document.querySelector('[data-private-root]');
  logout.onclick=()=>{retired=true;shell.hidden=true;shell.inert=true;shell.replaceChildren();onClear();bar.textContent='로그아웃됨 · 개인 화면 제거 완료';};
  shell.hidden=false;shell.inert=false;
  return { label:'가상 자료 · 로컬 화면 검증', async loadMenuRules(){if(retired)throw new Error('STALE');return structuredClone(menuRules);},async saveMenuRule(draft,revision){if(retired)throw new Error('STALE');const old=menuRules.find(r=>r.sourceName===draft.sourceName);if((old?.revision||0)!==revision)throw new Error('MENU_RULE_CONFLICT');const saved={...draft,revision:revision+1};menuRules=[...menuRules.filter(r=>r.sourceName!==draft.sourceName),saved];return saved;}, async load(){if(retired)throw new Error('STALE');return {data:new URL(location.href).searchParams.has('layout')?layoutFixture(fixture()):fixture(),menuRules:structuredClone(menuRules),manifest:{version:'a'.repeat(64)}};}, async request(route){if(route==='status')return {mode:'upload',writesEnabled:false};throw new Error('가상 화면 검증입니다. 실제 원본 검증은 회원 서비스에서 실행하세요.');} };
}
