import React, { useEffect, useState } from 'react';
import { Hub } from './home/Hub.jsx';
import { Workspace } from './workspace/Workspace.jsx';
import { Portfolio, CaseStudy, About } from './portfolio/Portfolio.jsx';
import { BASE, Link } from './navigation.jsx';
export { BASE, Link } from './navigation.jsx';
export function App() {
 const [path,setPath] = useState(location.pathname);
 useEffect(() => {
  const change=()=>setPath(location.pathname);
  const click=event=>{const a=event.target.closest('a');if(!a||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||a.target||a.hasAttribute('download'))return;const url=new URL(a.href);if(url.origin!==location.origin||!url.pathname.startsWith(BASE)||url.pathname.startsWith(BASE+'sales/')||url.hash)return;event.preventDefault();history.pushState({},'',url.pathname);change();window.scrollTo({top:0,behavior:"instant"});};
  document.addEventListener('click',click);window.addEventListener('popstate',change);return()=>{document.removeEventListener('click',click);window.removeEventListener('popstate',change);};
 },[]);
 useEffect(()=>{const titles={'':'대문 예시','workspace/':'소희의 작업실','portfolio/':'소희 포트폴리오','portfolio/cases/dessert-set/':'오후의 디저트를 하나의 제안으로','portfolio/about/':'소희 소개'};document.title=`${titles[path.slice(BASE.length)]||'페이지를 찾을 수 없어요'} · sungso 시안`;document.getElementById('page-title')?.focus({preventScroll:true}); if (!location.hash) window.scrollTo({top:0,behavior:'instant'});},[path]);
 const route=path.slice(BASE.length);
 const page=route===''?<Hub/>:route==='workspace/'?<Workspace/>:route==='portfolio/'?<Portfolio/>:route==='portfolio/cases/dessert-set/'?<CaseStudy/>:route==='portfolio/about/'?<About/>:<main className="container section"><h1 id="page-title" tabIndex="-1">페이지를 찾을 수 없어요.</h1><Link>대문 예시로 돌아가기</Link></main>;
 return <><a className="skip" href="#content">본문으로 이동</a><div className="demo-bar"><span>DESIGN PREVIEW</span><span>탐색용 예시 · 실제 프로젝트·개인 데이터 없음</span><Link>대문 예시</Link></div>{page}</>;
}
