import React from 'react';
import { createRoot } from 'react-dom/client';
import { getMember, registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { Workspace } from '../prototype/src/workspace/Workspace.jsx';
import { Portfolio, CaseStudy, About } from '../prototype/src/portfolio/Portfolio.jsx';
import '../prototype/src/styles.css';

if (!getMember()) throw new Error('회원 로그인이 필요합니다.');
const root = createRoot(document.getElementById('workspace-root'));
registerPrivateCleanup(() => root.unmount());
const route = location.pathname.replace(/^\/sungso\/sohee\/?/, '').replace(/\/$/, '');
const pages = { portfolio: <Portfolio/>, 'portfolio/cases/dessert-set': <CaseStudy/>, 'portfolio/about': <About/> };
const isPortfolio = route.startsWith('portfolio');
document.title = `${isPortfolio ? '소희 포트폴리오 예시' : '소희의 작업실'} · sungso`;
root.render(<><a className="skip" href="#content">본문으로 이동</a>{isPortfolio && <div className="demo-bar"><span>PORTFOLIO PREVIEW</span><span>구성 예시 · 실제 경력·성과와 구분합니다</span><a href="/sungso/sohee/workspace/">소희 작업실</a></div>}{pages[route] || <Workspace homeHref="/sungso/"/>}</>);
