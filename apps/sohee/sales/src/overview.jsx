import React,{useState} from 'react';
import {ResponsiveContainer,ComposedChart,LabelList,BarChart,Bar,AreaChart,Area,XAxis,YAxis,CartesianGrid,Tooltip,Cell,ReferenceLine} from 'recharts';
import {ArrowUpRight,CalendarDays,ShoppingBag,TrendingUp,ReceiptText} from 'lucide-react';
import {Progress,RingProgress,Drawer} from '@mantine/core';
import {ChartTip,chartAxis,amountAxis} from './charts.jsx';
import {Button} from './ui.jsx';
import {DateFilter,usePeriod} from './date-filter.jsx';
import {analyzeSelection,selectedMenuData,groupMenus,selectedBulk,total} from './analysis.mjs';
import {operatingSummary} from './operating-summary.mjs';
import {RecordDetails} from './record-details.jsx';
import {WEEKDAYS} from './planning.mjs';
import {num,money,pct,tipStyle,Pill,Note,Section,Header} from './report-ui.jsx';

const axis=chartAxis,moneyAxis=amountAxis;
export function Dashboard({data:D,children}) {
  const {selection}=usePeriod(),A=analyzeSelection(D,selection),C=A.comparison;
  const [cumulative,setCumulative]=useState(false),[recordsOpen,setRecordsOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false);
  const S=operatingSummary(D,selection);
  const menu=selectedMenuData(D,selection),ranked=groupMenus(menu.rows).sort((a,b)=>b.amount-a.amount),top=ranked.slice(0,5),menuTotal=total(ranked,'amount');
  const bulk=selectedBulk(D,selection),monthlyHours=['month','all'].includes(selection.mode);
  const hours=Array.from({length:24},(_,hour)=>({hour:hour+'시',amount:total((monthlyHours?D.receipt_hour.filter(row=>selection.mode==='all'||row.month===selection.month):menu.detail).filter(row=>row.hour===hour),'amount')}));
  const peak=hours.reduce((best,row)=>row.amount>best.amount?row:best,{amount:0,hour:'—'});
  let running=0;const plot=A.rows.map(row=>({...row,label:row.date.slice(5),value:cumulative?(running+=row.amount):row.amount}));
  return <>
    <Header label="STORE DASHBOARD" title="대시보드" description="매출의 흐름을 읽고, 오늘 운영에 필요한 단서를 찾아보세요." action={<a className="owner-text-link" href="/sungso/sohee/sales/prep/">디저트 준비하기 <ArrowUpRight size={16}/></a>}/>
    <DateFilter data={D}/>
    <section className="owner-summary" aria-label="선택 기간 주요 지표">
      <div className="owner-sales"><span className="owner-metric-label">선택 기간 실매출</span><strong>{money(A.amount)}</strong><Button className="metric-comparison" onClick={()=>setRecordsOpen(true)}>{C.percent==null?'이전 기간 비교 기준 부족':`완결일 이전 대비 ${pct(C.percent)}`} <ArrowUpRight size={12}/></Button></div>
      <div className="owner-metric record-metric"><span>매출 기록일</span><strong>{S.completeRecordedDays}<small>일</small></strong><Button className="metric-detail" onClick={()=>setRecordsOpen(true)} aria-label="매출 기록일 상세 보기">완결일 기준 · 날짜 확인 <ArrowUpRight size={12}/></Button></div>
      <div className="owner-metric average-metric"><span>일평균 매출</span><strong>{S.dailyAverage==null?'—':money(S.dailyAverage)}</strong><small>완결된 결제 기록일만</small></div>
      <div className="owner-metric"><span>결제 순건수</span><strong>{num(A.payments)}<small>건</small></strong><small>결제·환불 집계 기준</small></div>
      <div className="owner-metric"><span>결제 1건당 실매출</span><strong>{A.perPayment==null?'—':money(A.perPayment)}</strong><small>방문객당 매출과 다름</small></div>
    </section>
    <div className="coverage-line"><span>선택 {S.selectedDays}일 · 완결 기록 {S.completeRecordedDays}일 · 결제 기록일 아님 {S.zeroRecordDays}일 · 부분일 {A.includedPartialDays}일 포함{S.excludedPartialDays?` / ${S.excludedPartialDays}일 제외`:''}{S.missingDays?` · 미수집 ${S.missingDays}일`:''}</span><span>POS 기록 기준 · 실제 근무일시 미확인</span></div>
    {(!A.rows.length||A.missingDays>0||C.sourceChanged)&&<div className="compact-data-note" role="status">{!A.rows.length?'선택한 날짜에 집계 가능한 기록이 없습니다. ':''}{A.missingDays>0?`미수집 ${A.missingDays}일을 0원으로 채우지 않습니다. `:''}{C.sourceChanged?'이전 기간과 POS 출처가 다릅니다.':''}</div>}
    <div className="owner-main-grid">
      <Section title="매출 흐름" desc={cumulative?'선택한 날짜만 더한 누적 실매출':'선택 날짜의 실매출 · 점선은 완결 기록일 평균'} action={<div className="segmented"><Button aria-pressed={!cumulative} className={!cumulative?'active':''} onClick={()=>setCumulative(false)}>일별</Button><Button aria-pressed={cumulative} className={cumulative?'active':''} onClick={()=>setCumulative(true)}>누적</Button></div>}>
        <div className="chart owner-trend"><ResponsiveContainer><ComposedChart data={plot} margin={{top:20,right:12,left:0,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 5" stroke="var(--ss-border)"/><XAxis {...axis} dataKey="label"/><YAxis {...moneyAxis}/><Tooltip cursor={cumulative?{stroke:'var(--ss-border-strong)',strokeDasharray:'4 4'}:{fill:'var(--ss-soft)'}} content={<ChartTip formatter={(value,name,item)=>[money(value),`${cumulative?'선택일 누적':'실매출'}${item.payload.partial_day?' · 부분일':''}`]}/>}/>{!cumulative&&S.dailyAverage!=null&&<ReferenceLine y={S.dailyAverage} stroke="var(--ss-muted)" strokeDasharray="5 5"/>}{cumulative?<Area dataKey="value" type="linear" stroke="var(--ss-link)" fill="var(--ss-accent)" fillOpacity={.28} strokeWidth={2.5} activeDot={{r:5,strokeWidth:2,stroke:'var(--ss-surface)'}} isAnimationActive={false}/>:<Bar dataKey="value" radius={[5,5,0,0]} maxBarSize={24} isAnimationActive={false}>{plot.map(row=><Cell key={row.date} fill={row.partial_day?'var(--ss-border-strong)':'var(--ss-link)'} fillOpacity={row.partial_day?.6:1}/>)}</Bar>}</ComposedChart></ResponsiveContainer></div>
        <div className="owner-chart-bottom"><div className="chart-legend"><span><i/> {cumulative?'선택일 누적':'실매출'}</span>{!cumulative&&<span><i className="partial"/> 부분일</span>}</div><span className="best-day-inline">{A.bestDay?`최고 ${A.bestDay.date.slice(5)} · ${money(A.bestDay.amount)}`:'완결일 없음'}</span><a href="/sungso/sohee/sales/overview/">일별 내역 <ArrowUpRight size={14}/></a></div>
      </Section>
      <Section title="잘 팔리는 메뉴" desc={menu.dailyOnly?'선택한 토스 완결일 · 메뉴 금액 순':'선택 기간 월별 집계 · 메뉴 금액 순'} action={<Pill>TOP 5</Pill>}>
        <div className="owner-menu-list">{top.length?top.map((row,index)=><div key={row.menu}><span className="rank">{String(index+1).padStart(2,'0')}</span><div><div className="owner-menu-title"><strong>{row.menu}</strong><span>{money(row.amount)}</span></div><Progress value={menuTotal>0?Math.max(0,Math.min(100,row.amount/menuTotal*100)):0} color={index===0?'var(--ss-link)':'var(--ss-accent)'} size={5} aria-label={`${row.menu} 메뉴 금액 비중`}/><small>{num(row.quantity)}{row.unit} <span>메뉴 금액의 {menuTotal>0?num(row.amount/menuTotal*100,1)+'%':'—'}</span></small></div></div>):<p className="empty">선택일의 메뉴 상세 기록이 없습니다.</p>}</div>
        <a className="owner-panel-link" href="/sungso/sohee/sales/menus/">메뉴별 수량과 변화 보기 <ArrowUpRight size={15}/></a>
      </Section>
    </div>
    <div className="owner-secondary-grid">
      <Section title="요일별 매출" desc="완결일의 기록일당 매출 · 영업일 확정값 아님">
        <div className="chart weekday-chart"><ResponsiveContainer><BarChart data={S.weekday.map(row=>({...row,label:WEEKDAYS[row.weekday]}))} margin={{top:24,right:8,left:8,bottom:0}} accessibilityLayer><XAxis {...axis} dataKey="label" interval={0}/><YAxis hide domain={[0,'auto']}/><Tooltip cursor={{fill:'var(--ss-soft)'}} content={<ChartTip formatter={(value,name,item)=>[money(value),`${item.payload.recordDays}개 기록일 평균`]}/>}/><Bar dataKey="perRecordDay" radius={[5,5,0,0]} maxBarSize={24} isAnimationActive={false}>{S.weekday.map(row=><Cell key={row.weekday} fill={row.perRecordDay===Math.max(...S.weekday.map(r=>r.perRecordDay||0))?'var(--ss-link)':'var(--ss-accent)'}/>)}<LabelList dataKey="perRecordDay" position="top" formatter={value=>value==null?'—':num(value/10000,1)+'만'} fill="var(--ss-muted)" fontSize={10}/></Bar></BarChart></ResponsiveContainer></div><div className="weekday-samples">{S.weekday.map(row=><span key={row.weekday}>{WEEKDAYS[row.weekday]} {row.recordDays}일</span>)}</div>
      </Section>
      <Section title="매출이 몰린 시간" desc={monthlyHours?'월별 결제 시각 집계 · 완결일만':'선택일 토스 메뉴 주문 시작 시각 · 완결일만'}>
        <div className="owner-peak"><strong>{peak.hour}</strong><span>{peak.amount>0?`${monthlyHours?'결제 매출':'메뉴 주문액'} 최다`:'집계 기록 없음'}</span></div>
        <div className="chart owner-hours"><ResponsiveContainer><AreaChart data={hours} margin={{top:12,right:4,left:0,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 5" stroke="var(--ss-border)"/><XAxis {...axis} dataKey="hour" interval={5}/><YAxis {...moneyAxis}/><Tooltip content={<ChartTip formatter={value=>[money(value),monthlyHours?'결제 매출':'메뉴 주문액']}/>}/><Area dataKey="amount" type="linear" stroke="var(--ss-link)" fill="var(--ss-accent)" fillOpacity={.35} strokeWidth={2.5} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div><p className="footnote">{monthlyHours?'매출이 몰린 시간이며 방문객 수를 뜻하지 않습니다.':'날짜별 결제 시각 집계는 없어 메뉴 주문액으로 구분합니다. 페이히어·부분일 제외.'}</p>
      </Section>
      <Section title="큰 주문의 영향" desc="토스 완결일 · 한 주문 10만원 이상">
        {bulk?.days?<><div className="owner-bulk"><RingProgress size={98} thickness={9} roundCaps rootColor="var(--ss-soft)" sections={[{value:Math.max(0,Math.min(100,bulk.share||0)),color:'var(--ss-link)'}]} aria-label="대량 주문 비중" label={<div className="bulk-ring-label"><strong>{bulk.share==null?'—':num(bulk.share,1)+'%'}</strong><span>큰 주문 비중</span></div>}/><div className="bulk-compact-values"><span>큰 주문 {num(bulk.count)}건</span><strong>{money(bulk.amount)}</strong><span>큰 주문 제외 매출</span><b>{money(bulk.without)}</b></div></div></>:<div className="owner-no-data"><ShoppingBag size={28}/><strong>분리 자료 없음</strong><p>이 기간의 토스 대량 주문 상세가 없습니다. 0건으로 단정하지 않습니다.</p></div>}
        <p className="footnote">{bulk?.days||0}개 토스 완결일 기준 · 큰 주문 영향 분리</p>
      </Section>
    </div>
    <div className="dashboard-bottom"><span>원가·인건비 자료가 없어 순이익은 계산하지 않습니다.</span><div><Button onClick={()=>setRecordsOpen(true)}>집계 기준·기록일</Button><Button onClick={()=>setHistoryOpen(true)}>과거 변화와 비교 근거</Button></div></div>
    <RecordDetails data={D} selection={selection} opened={recordsOpen} onClose={()=>setRecordsOpen(false)}/>
    <Drawer opened={historyOpen} onClose={()=>setHistoryOpen(false)} title="과거 변화와 비교 근거" position="right" size={940} withinPortal={false} trapFocus returnFocus closeButtonProps={{'aria-label':'과거 비교 닫기'}} classNames={{content:'sales-drawer',header:'sales-drawer-header',body:'sales-drawer-body'}}>{children}<Note>단체 고객이나 개인의 성과로 확정한 분류가 아닙니다. 운영 활동 날짜와 함께 비교하세요.</Note></Drawer>
  </>;
}
