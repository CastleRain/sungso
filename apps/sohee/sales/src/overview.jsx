import React,{useState} from 'react';
import {ResponsiveContainer,ComposedChart,LabelList,BarChart,Bar,AreaChart,Area,XAxis,YAxis,CartesianGrid,Tooltip,Cell,ReferenceLine} from 'recharts';
import {ArrowUpRight,CalendarDays,ShoppingBag,TrendingUp,ReceiptText} from 'lucide-react';
import {Progress,RingProgress} from '@mantine/core';
import {ChartTip,chartAxis,amountAxis} from './charts.jsx';
import {Button} from './ui.jsx';
import {DateFilter,usePeriod} from './date-filter.jsx';
import {analyzeSelection,selectedMenuData,groupMenus,selectedBulk,total} from './analysis.mjs';
import {WEEKDAYS} from './planning.mjs';
import {num,money,pct,tipStyle,Pill,Note,Section,Header} from './report-ui.jsx';

const axis=chartAxis,moneyAxis=amountAxis;
export function Dashboard({data:D,children}) {
  const {selection}=usePeriod(),A=analyzeSelection(D,selection),C=A.comparison;
  const [cumulative,setCumulative]=useState(false);
  const menu=selectedMenuData(D,selection),ranked=groupMenus(menu.rows).sort((a,b)=>b.amount-a.amount),top=ranked.slice(0,5),menuTotal=total(ranked,'amount');
  const bulk=selectedBulk(D,selection),monthlyHours=['month','all'].includes(selection.mode);
  const hours=Array.from({length:24},(_,hour)=>({hour:hour+'시',amount:total((monthlyHours?D.receipt_hour.filter(row=>selection.mode==='all'||row.month===selection.month):menu.detail).filter(row=>row.hour===hour),'amount')}));
  const peak=hours.reduce((best,row)=>row.amount>best.amount?row:best,{amount:0,hour:'—'});
  let running=0;const plot=A.rows.map(row=>({...row,label:row.date.slice(5),value:cumulative?(running+=row.amount):row.amount}));
  return <>
    <Header label="STORE DASHBOARD" title="대시보드" description="매출의 흐름을 읽고, 오늘 운영에 필요한 단서를 찾아보세요." action={<a className="owner-text-link" href="/sungso/sohee/sales/prep/">디저트 준비하기 <ArrowUpRight size={16}/></a>}/>
    <DateFilter data={D}/>
    <section className="owner-summary" aria-label="선택 기간 주요 지표">
      <div className="owner-sales"><span className="owner-metric-label">선택 기간 실매출</span><strong>{money(A.amount)}</strong><p>{A.rows.length}일 집계{A.includedPartialDays?` · 부분일 ${A.includedPartialDays}일 포함`:''}</p></div>
      <div className="owner-metric"><TrendingUp size={19}/><span>기록일당 매출</span><strong>{A.perRecordDay==null?'—':money(A.perRecordDay)}</strong><small>결제 기록이 있는 {A.recordDays}일 기준</small></div>
      <div className="owner-metric"><ReceiptText size={19}/><span>결제 순건수</span><strong>{num(A.payments)}<small>건</small></strong><small>결제·환불 집계 기준</small></div>
      <div className="owner-metric"><ShoppingBag size={19}/><span>결제 1건당 실매출</span><strong>{A.perPayment==null?'—':money(A.perPayment)}</strong><small>실매출 ÷ 순건수 · 방문객 수 아님</small></div>
    </section>
    <div className="owner-comparison" aria-label="완결일 매출 비교"><div><span>완결일끼리 비교</span><strong>{C.percent==null?'비교 기준 부족':`${pct(C.percent)} ${C.delta>=0?'증가':'감소'}`}</strong></div><p>선택 {C.current.days}일 <b>{money(C.current.amount)}</b><span>이전 {C.previous.days}일 <b>{C.comparable?money(C.previous.amount):'자료 부족'}</b></span></p><small>{C.previousDates.length?`${C.previousDates[0]} – ${C.previousDates.at(-1)}와 비교`:'날짜 선택 전'}<br/>부분일 제외 · 떨어진 날짜는 같은 간격 유지</small></div>
    {(!A.rows.length||A.missingDays>0||C.sourceChanged)&&<Note>{!A.rows.length?'선택한 날짜에 집계 가능한 기록이 없습니다. ':''}{A.missingDays>0?`수집되지 않은 ${A.missingDays}일은 0원으로 계산하지 않습니다. `:''}{C.sourceChanged?'이전 기간과 POS 출처가 달라 집계 기준의 영향을 함께 확인하세요.':''}</Note>}
    <div className="owner-main-grid">
      <Section title="매출 흐름" desc={cumulative?'선택한 날짜만 더한 누적 실매출':'선택한 날짜의 실매출 · 점선은 기록일당 평균'} action={<div className="segmented"><Button aria-pressed={!cumulative} className={!cumulative?'active':''} onClick={()=>setCumulative(false)}>일별</Button><Button aria-pressed={cumulative} className={cumulative?'active':''} onClick={()=>setCumulative(true)}>누적</Button></div>}>
        <div className="chart owner-trend"><ResponsiveContainer><ComposedChart data={plot} margin={{top:20,right:12,left:0,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 5" stroke="var(--ss-border)"/><XAxis {...axis} dataKey="label"/><YAxis {...moneyAxis}/><Tooltip cursor={cumulative?{stroke:'var(--ss-border-strong)',strokeDasharray:'4 4'}:{fill:'var(--ss-soft)'}} content={<ChartTip formatter={(value,name,item)=>[money(value),`${cumulative?'선택일 누적':'실매출'}${item.payload.partial_day?' · 부분일':''}`]}/>}/>{!cumulative&&A.perRecordDay!=null&&<ReferenceLine y={A.perRecordDay} stroke="var(--ss-muted)" strokeDasharray="5 5"/>}{cumulative?<Area dataKey="value" type="linear" stroke="var(--ss-link)" fill="var(--ss-accent)" fillOpacity={.28} strokeWidth={2.5} activeDot={{r:5,strokeWidth:2,stroke:'var(--ss-surface)'}} isAnimationActive={false}/>:<Bar dataKey="value" radius={[5,5,0,0]} maxBarSize={24} isAnimationActive={false}>{plot.map(row=><Cell key={row.date} fill={row.partial_day?'var(--ss-border-strong)':'var(--ss-link)'} fillOpacity={row.partial_day?.6:1}/>)}</Bar>}</ComposedChart></ResponsiveContainer></div>
        <div className="owner-chart-bottom"><div className="chart-legend"><span><i/> {cumulative?'선택일 누적':'실매출'}</span>{!cumulative&&<span><i className="partial"/> 부분일</span>}</div><a href="/sungso/sohee/sales/overview/">매출 내역 보기 <ArrowUpRight size={14}/></a></div>
      </Section>
      <Section title="잘 팔리는 메뉴" desc={menu.dailyOnly?'선택한 토스 완결일 · 메뉴 금액 순':'선택 기간 월별 집계 · 메뉴 금액 순'} action={<Pill>TOP 5</Pill>}>
        <div className="owner-menu-list">{top.length?top.map((row,index)=><div key={row.menu}><span className="rank">{String(index+1).padStart(2,'0')}</span><div><div className="owner-menu-title"><strong>{row.menu}</strong><span>{money(row.amount)}</span></div><Progress value={menuTotal>0?Math.max(0,Math.min(100,row.amount/menuTotal*100)):0} color={index===0?'var(--ss-link)':'var(--ss-accent)'} size={5} aria-label={`${row.menu} 메뉴 금액 비중`}/><small>{num(row.quantity)}{row.unit} <span>메뉴 금액의 {menuTotal>0?num(row.amount/menuTotal*100,1)+'%':'—'}</span></small></div></div>):<p className="empty">선택일의 메뉴 상세 기록이 없습니다.</p>}</div>
        <a className="owner-panel-link" href="/sungso/sohee/sales/menus/">메뉴별 수량과 변화 보기 <ArrowUpRight size={15}/></a>
      </Section>
    </div>
    <div className="owner-secondary-grid">
      <Section title="어느 요일이 잘될까?" desc="완결일의 기록일당 매출 · 영업일 확정값 아님">
        <div className="chart weekday-chart"><ResponsiveContainer><BarChart data={A.weekday.map(row=>({...row,label:WEEKDAYS[row.weekday]}))} margin={{top:24,right:8,left:8,bottom:0}} accessibilityLayer><XAxis {...axis} dataKey="label" interval={0}/><YAxis hide domain={[0,'auto']}/><Tooltip cursor={{fill:'var(--ss-soft)'}} content={<ChartTip formatter={(value,name,item)=>[money(value),`${item.payload.recordDays}개 기록일 평균`]}/>}/><Bar dataKey="perRecordDay" radius={[5,5,0,0]} maxBarSize={24} isAnimationActive={false}>{A.weekday.map(row=><Cell key={row.weekday} fill={row.perRecordDay===Math.max(...A.weekday.map(r=>r.perRecordDay||0))?'var(--ss-link)':'var(--ss-accent)'}/>)}<LabelList dataKey="perRecordDay" position="top" formatter={value=>value==null?'—':num(value/10000,1)+'만'} fill="var(--ss-muted)" fontSize={10}/></Bar></BarChart></ResponsiveContainer></div><div className="weekday-samples">{A.weekday.map(row=><span key={row.weekday}>{WEEKDAYS[row.weekday]} {row.recordDays}일</span>)}</div>
      </Section>
      <Section title="바쁜 시간의 단서" desc={monthlyHours?'월별 결제 시각 집계 · 완결일만':'선택일 토스 메뉴 주문 시작 시각 · 완결일만'}>
        <div className="owner-peak"><strong>{peak.hour}</strong><span>{peak.amount>0?`${monthlyHours?'결제 매출':'메뉴 주문액'} 최다`:'집계 기록 없음'}</span></div>
        <div className="chart owner-hours"><ResponsiveContainer><AreaChart data={hours} margin={{top:12,right:4,left:0,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 5" stroke="var(--ss-border)"/><XAxis {...axis} dataKey="hour" interval={5}/><YAxis {...moneyAxis}/><Tooltip content={<ChartTip formatter={value=>[money(value),monthlyHours?'결제 매출':'메뉴 주문액']}/>}/><Area dataKey="amount" type="linear" stroke="var(--ss-link)" fill="var(--ss-accent)" fillOpacity={.35} strokeWidth={2.5} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div><p className="footnote">{monthlyHours?'매출이 몰린 시간이며 방문객 수를 뜻하지 않습니다.':'날짜별 결제 시각 집계는 없어 메뉴 주문액으로 구분합니다. 페이히어·부분일 제외.'}</p>
      </Section>
      <Section title="큰 주문의 영향" desc="토스 완결일 · 한 주문 10만원 이상">
        {bulk?.days?<><div className="owner-bulk"><RingProgress size={144} thickness={11} roundCaps rootColor="var(--ss-soft)" sections={[{value:Math.max(0,Math.min(100,bulk.share||0)),color:'var(--ss-link)'}]} aria-label="대량 주문 비중" label={<div className="bulk-ring-label"><strong>{bulk.share==null?'—':num(bulk.share,1)+'%'}</strong><span>큰 주문 비중</span></div>}/><p>전체 토스 매출 중<br/><strong>{num(bulk.count)}건의 큰 주문</strong>이<br/>차지하는 비중입니다.</p></div><dl className="owner-bulk-details"><div><dt>큰 주문 {num(bulk.count)}건</dt><dd>{money(bulk.amount)}</dd></div><div><dt>큰 주문 제외 매출</dt><dd>{money(bulk.without)}</dd></div><div><dt>분석한 토스 완결일</dt><dd>{bulk.days}일</dd></div></dl></>:<div className="owner-no-data"><ShoppingBag size={28}/><strong>분리 자료 없음</strong><p>이 기간의 토스 대량 주문 상세가 없습니다. 0건으로 단정하지 않습니다.</p></div>}
        <p className="footnote">큰 주문을 뺀 흐름도 함께 확인하세요. 단체 고객이나 개인의 성과로 확정한 분류는 아닙니다.</p>
      </Section>
    </div>
    <div className="dashboard-reading"><CalendarDays size={20}/><p>{A.bestDay?<><strong>선택한 완결일 중 {A.bestDay.date}의 매출이 가장 큽니다.</strong><span>{money(A.bestDay.amount)} · 당시 주문과 운영 기록을 함께 살펴보세요.</span></>:<strong>최고 매출일을 비교할 완결일 기록이 없습니다.</strong>}</p><a href="/sungso/sohee/sales/overview/">달력에서 확인 <ArrowUpRight size={15}/></a></div>
    {children}
    <p className="footnote">실매출은 출처의 할인·환불 기준을 유지합니다. 원가·인건비·폐기 자료가 없어 순이익은 계산하지 않습니다. 기간 비교는 선택한 완결일 구간의 길이만큼 이전으로 옮겨 계산합니다.</p>
  </>;
}
