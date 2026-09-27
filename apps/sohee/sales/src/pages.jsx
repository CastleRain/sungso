import React,{useState,useEffect,useContext,createContext} from 'react';
import {Button, Select, CheckField, QuantityField, BufferSlider, ExtraMenus} from './ui.jsx';
import {UpdatePanel} from './update-panel.jsx';
import {ResponsiveContainer,BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip} from 'recharts';
import {Coffee,Pencil,ArrowUpRight,Download,Check,CalendarDays,RotateCcw,Printer,Menu as MenuIcon} from 'lucide-react';
import {WEEKDAYS,WINDOWS,planRow,deadline} from './planning.mjs';

export const DataContext=createContext(null);
export const BASE='/sungso/sohee/sales/';
import {num,money,pct,colors,monthShort,sum,download,csv,Pill,Note,Section,Header,Stat,Table,numeric,textCol} from './report-ui.jsx';
import {DessertPrep} from './prep-page.jsx';
import {MenuSales} from './menu-page.jsx';
import {Dashboard} from './overview.jsx';
import {SalesLedger} from './ledger.jsx';
import {DataStatus} from './data-status.jsx';
import {MenuRuleEditor,MenuRuleContext} from './menu-editor.jsx';
import {RankedMenuChart,MenuTrend,HourBars,PrepFlow,ChartTip,ChartLegend,chartAxis,amountAxis} from './charts.jsx';
import {menuUnit} from '../../../../services/sohee/menu-rules.mjs';
import {PeriodContext,DateFilter,usePeriod} from './date-filter.jsx';
import {initialSelection,selectedMenuData,groupMenus} from './analysis.mjs';
import {internalSalesLink,salesRoute} from './navigation.mjs';


function Changes(){
 const D=useContext(DataContext);
 const bulk=D.existing.monthly_large_order_sensitivity||[], am=D.existing.americano_before_after_28d||[];
 const change=(after,before)=>before?(after/before-1)*100:null;
 const amChange=key=>am.length===2?change(am[1][key],am[0][key]):null;
 return <Dashboard data={D}>
 <Section title="월별 대량 주문 이력" desc="전체 월별 이력 · 위 날짜 선택과 별도 · 토스 10만원 이상 주문"><ChartLegend items={[{label:'일반 주문',color:colors[0]},{label:'10만원 이상 주문',color:colors[3]}]}/><div className="chart"><ResponsiveContainer><BarChart data={bulk} margin={{top:15,right:8,left:0,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} stroke="var(--ss-border)" strokeDasharray="3 5"/><XAxis {...chartAxis} dataKey="month"/><YAxis {...amountAxis}/><Tooltip cursor={{fill:'var(--ss-soft)'}} content={<ChartTip formatter={(v,n)=>[money(v),n]}/>}/><Bar maxBarSize={48} stackId="a" name="일반 주문" dataKey="sales_without_100k_orders" fill={colors[0]}/><Bar maxBarSize={48} radius={[5,5,0,0]} stackId="a" name="10만원 이상 주문" dataKey="large_order_sales" fill={colors[3]}/></BarChart></ResponsiveContainer></div><Table search={false} data={bulk} columns={[textCol('month','월'),numeric('all_sales','전체',money),numeric('sales_without_100k_orders','대량 주문 제외',money),numeric('large_order_count','큰 주문 건수')]}/></Section>
 <Section title="아메리카노 포장할인 변화" desc="과거 비교 자료 · 관찰된 판매 명칭의 전환이며 실제 정책 변경일이 아닙니다.">{am.length?<><Table search={false} data={am} columns={[textCol('start','시작'),textCol('end','종료'),numeric('store_payment_days','기록일'),numeric('net_per_unit','수량당 매출',money),numeric('quantity_per_store_day','기록일당 수량',v=>num(v,1))]}/><div className="mini-metrics">{[['수량당 매출','net_per_unit'],['기록일당 수량','quantity_per_store_day'],['기록일당 매출','sales_per_store_day']].map(([label,key])=><div key={key}><span>{label}</span><strong>{amChange(key)==null?'—':pct(amChange(key))}</strong></div>)}</div></>:<Note>비교 원본이 없어 변화율을 계산하지 않았습니다.</Note>}<Note>원래 메뉴명·단가를 보존합니다. 가격 변화만으로 매출 증가나 개인의 성과를 단정하지 않습니다.</Note></Section>
 <Section title="포트폴리오 근거 체크" desc="매출 자료는 공개 포트폴리오에 자동 전달되지 않습니다."><ol className="method-list"><li><strong>활동 날짜 확인</strong><p>신메뉴·진열·홍보·단체 주문 제안의 실제 실행 날짜와 본인의 역할을 확인합니다.</p></li><li><strong>같은 조건으로 비교</strong><p>기록일 수·메뉴 구성·대량 주문·POS 전환을 함께 확인합니다.</p></li><li><strong>근거를 대조</strong><p>사진·게시물·운영 일지와 매출 변화 시점을 대조합니다.</p></li><li><strong>공개할 문장 별도 검토</strong><p>검증된 사실만 골라 외부 공개 여부를 결정합니다.</p></li></ol><a className="outline" href="/sungso/sohee/portfolio/">포트폴리오 구성 예시 보기 <ArrowUpRight size={16}/></a></Section>
 </Dashboard>
}
function DataPage(){
 const D=useContext(DataContext);
 return <><Header label="05 / DATA LIBRARY" title="수집 범위와 데이터 관리" description="앞으로는 토스 원본만 갱신합니다. 과거 페이히어 자료는 보존합니다."/>
 <p className="footnote">이 화면의 출처·수집 범위는 전체 저장 자료 기준입니다. 새 자료 수집은 요청할 때 로컬 PC에서 진행합니다.</p><UpdatePanel/>
 <div className="source-cards"><Section title="토스 · 앞으로의 기록" desc={`상세 원본 마지막 날짜 ${D.end}`}><Pill>완결일 {D.complete_through}까지</Pill><ul className="plain-list"><li>메뉴별 날짜·주문 시간·수량·금액</li><li>중복되는 날짜 범위만 교체·누적</li><li>부분일: {D.partial_dates.join(', ')||'없음'}</li></ul><Note>앱 화면에서 확인한 합계는 상세 거래를 대체하지 않습니다. 새 토스 원본을 받아 검증하기 전에는 매출을 보충하지 않습니다.</Note></Section><Section title="페이히어 · 과거 기록" desc="보관된 원본과 월별 화면을 대조한 자료"><ul className="plain-list"><li>과거 일별·월별 매출과 월별 메뉴 수량</li><li>메뉴별 거래 시각은 제공되지 않음</li><li>메뉴 시간대·준비 예측은 토스만 사용</li></ul><Note>4구 상품은 1팩이 1판매단위입니다. 준비표에서만 실물 4개로 구분합니다.</Note></Section></div>
 <Section title="갱신·수집 범위"><Table search={false} data={D.monthly} columns={[textCol('month','기간'),textCol('source','출처'),numeric('record_days','기록일'),{accessorKey:'partial',header:'수집 상태',cell:i=>i.getValue()?'부분월':'수집 완료'}]}/><p className="footnote">분석 생성일 {D.generated_at} · 분석 생성일과 원본 수집일은 다를 수 있습니다.</p></Section>
 <Section title="원본 대조 기록"><div className="validation-grid">{D.files.map(f=><div key={f.file}><Check size={20}/><div><strong>{f.file}</strong><p>{f.start}–{f.end}</p><small>SHA-256 {f.sha256.slice(0,16)}…</small></div></div>)}</div><div className="download-row"><Button className="outline" onClick={()=>download('통합_일별매출.csv',csv(D.daily))}><Download size={16}/> 일별 매출 CSV</Button><Button className="outline" onClick={()=>download('통합_메뉴월별.csv',csv(D.menu_monthly))}>메뉴 월별 CSV</Button><Button className="outline" onClick={()=>download('예측검증.csv',csv(D.forecast.metrics))}>예측 검증 CSV</Button></div><Note>다운로드 파일에는 비공개 매출이 포함됩니다. 파일의 공유 범위를 직접 확인하세요.</Note></Section>
 <Section title="해석의 한계"><ul className="plain-list"><li>기록 없는 날은 휴무로 단정하지 않습니다.</li><li>원가·폐기·품절 기록이 없어 이익이나 놓친 수요를 계산하지 않습니다.</li><li>기여 시점·운영 변경일은 미확인입니다.</li><li>예측 오차와 표본 부족을 준비 화면에서 함께 표시합니다.</li></ul></Section></>
}
const pages=[{id:'changes',label:'대시보드',component:Changes},{id:'overview',label:'매출 내역',component:SalesLedger},{id:'menus',label:'메뉴 전략',component:MenuSales},{id:'prep',label:'디저트 준비',component:DessertPrep},{id:'data',label:'자료 기준',component:DataPage,hidden:true}];
export function SalesApp({data,route:initialRoute='changes',status='Firebase 회원 전용'}){
 const [navOpen,setNavOpen]=useState(false),[route,setRoute]=useState(initialRoute);
 const [selection,setSelection]=useState(()=>data?initialSelection(data):null);
 useEffect(()=>setRoute(initialRoute),[initialRoute]);
 useEffect(()=>{const back=()=>setRoute(salesRoute(window.location.pathname)||'changes');window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back)},[]);
 function navigate(event){const url=internalSalesLink(event,window.location.origin);if(!url)return;event.preventDefault();if(url.pathname===BASE&&data)setSelection(initialSelection(data));window.history.pushState(null,'',url.pathname+url.search);setRoute(salesRoute(url.pathname));setNavOpen(false);window.scrollTo(0,0);document.getElementById('main')?.focus({preventScroll:true})}
 const selected=pages.find(p=>p.id===route); const Page=selected?.component;
 useEffect(()=>{document.title=`${selected?.label||'페이지 없음'} · 양정커피`;},[route]);
 return <DataContext.Provider value={data}><PeriodContext.Provider value={{selection:selection||(data?initialSelection(data):null),setSelection}}><div className={'app page-'+route} onClick={navigate}>
  <a href="#main" className="skip-link">본문으로 이동</a>
  <header className="app-header"><div className="app-identity"><a href={BASE} className="brand"><span className="brand-mark"><Coffee size={24}/></span><strong>양정커피</strong></a><a className="workspace-link" href="/sungso/sohee/workspace/">소희 작업실</a></div><span className="connection-status">{status}</span></header>
  <div className="navigation-shell"><Button className="mobile-menu" aria-label="페이지 메뉴" aria-expanded={navOpen} aria-controls="sales-navigation" onClick={()=>setNavOpen(!navOpen)}><span>{selected?.label||'매출 분석'}</span><MenuIcon size={20}/></Button><nav id="sales-navigation" aria-label="매출 분석" className={'primary-nav '+(navOpen?'open':'')}>{pages.filter(p=>!p.hidden).map(p=><a href={BASE+p.id+'/'} key={p.id} className={route===p.id?'active':''} aria-current={route===p.id?'page':undefined} onClick={()=>setNavOpen(false)}>{p.label}</a>)}</nav></div>
  <main id="main" tabIndex="-1"><div className="page-content">{!Page?<Section title="페이지를 찾을 수 없어요"><a href={BASE}>대시보드로</a></Section>:!data?<><Header title="아직 저장된 매출이 없습니다" description="회원 전용 Firebase 저장소를 확인했습니다. 검증된 분석본을 이전하거나 새 원본을 가져오면 표시됩니다."/><UpdatePanel/></>:<Page data={data}/>}</div><footer>양정커피 <span>매출을 읽고, 오늘의 준비를 결정합니다.</span><DataStatus data={data}/></footer></main>
 </div></PeriodContext.Provider></DataContext.Provider>
}
export class ErrorBoundary extends React.Component{constructor(p){super(p);this.state={error:false}}static getDerivedStateFromError(){return {error:true}}render(){return this.state.error?<div className="empty"><h1>화면을 불러오지 못했습니다.</h1><p>저장된 자료의 형식을 확인해주세요.</p><Button onClick={()=>location.reload()}>새로고침</Button></div>:this.props.children}}
