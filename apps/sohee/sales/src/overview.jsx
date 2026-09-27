import React,{useState} from 'react';
import {ResponsiveContainer,ComposedChart,LabelList,BarChart,Bar,AreaChart,Area,XAxis,YAxis,CartesianGrid,Tooltip,Cell,ReferenceLine} from 'recharts';
import {ArrowUpRight,ShoppingBag,ChevronLeft,ChevronRight,ScanLine} from 'lucide-react';
import {Progress,RingProgress,Drawer} from '@mantine/core';
import {ChartTip,chartAxis,amountAxis} from './charts.jsx';
import {Button} from './ui.jsx';
import {DateFilter,usePeriod} from './date-filter.jsx';
import {analyzeSelection,selectedMenuData,groupMenus,selectedBulk,total} from './analysis.mjs';
import {operatingSummary} from './operating-summary.mjs';
import {ownerInsights,salesDateLabel} from './owner-insights.mjs';
import {RecordDetails} from './record-details.jsx';
import {WEEKDAYS} from './planning.mjs';
import {num,money,pct,tipStyle,Pill,Note,Section,Header} from './report-ui.jsx';

const axis=chartAxis,moneyAxis=amountAxis;
export function Dashboard({data:D,children}) {
  const {selection}=usePeriod(),A=analyzeSelection(D,selection),C=A.comparison;
  const [cumulative,setCumulative]=useState(false),[recordsOpen,setRecordsOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[insightsOpen,setInsightsOpen]=useState(false),[chartDate,setChartDate]=useState('');
  const S=operatingSummary(D,selection);
  const menu=selectedMenuData(D,selection),ranked=groupMenus(menu.rows).sort((a,b)=>b.amount-a.amount),top=ranked.slice(0,5),menuTotal=total(ranked,'amount');
  const bulk=selectedBulk(D,selection),monthlyHours=['month','all'].includes(selection.mode);
  const hours=Array.from({length:24},(_,hour)=>({hour:hour+'시',amount:total((monthlyHours?D.receipt_hour.filter(row=>selection.mode==='all'||row.month===selection.month):menu.detail).filter(row=>row.hour===hour),'amount')}));
  const peak=hours.reduce((best,row)=>row.amount>best.amount?row:best,{amount:0,hour:'—'});
  const insights=ownerInsights(D,selection),bulkByDate=new Map();
  for(const row of D.bulk||[]){if(!bulkByDate.has(row.date))bulkByDate.set(row.date,new Set());bulkByDate.get(row.date).add(row.order_key);}
  let running=0;const plot=A.rows.map(row=>({...row,label:row.date.slice(5),bulkCount:bulkByDate.get(row.date)?.size||0,
    semanticColor:row.partial_day?'var(--ss-muted)':row.amount<0?'var(--sales-negative)':bulkByDate.has(row.date)?'var(--sales-caution)':row.weekday>=5?'var(--sales-positive)':'var(--ss-link)',
    value:cumulative?(running+=row.amount):row.amount}));
  const activeRow=plot.find(row=>row.date===chartDate)||plot.at(-1),activeIndex=plot.indexOf(activeRow);
  function readChart(event){const rawIndex=event?.activeTooltipIndex??event?.activeIndex,index=rawIndex==null||rawIndex===''?NaN:Number(rawIndex);const row=Number.isInteger(index)?plot[index]:plot.find(row=>row.label===event?.activeLabel);if(row)setChartDate(row.date);}

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
        <div className="chart owner-trend"><ResponsiveContainer><ComposedChart data={plot} margin={{top:12,right:12,left:0,bottom:0}} accessibilityLayer onMouseMove={readChart} onClick={readChart}><CartesianGrid vertical={false} strokeDasharray="3 5" stroke="var(--ss-border)"/><XAxis {...axis} dataKey="label"/><YAxis {...moneyAxis}/><Tooltip cursor={cumulative?{stroke:'var(--ss-border-strong)',strokeDasharray:'4 4'}:{fill:'var(--ss-soft)'}} content={<ChartTip onActiveDate={setChartDate} formatter={(value,name,item)=>[money(value),`${cumulative?'선택일 누적':'실매출'}${item.payload.partial_day?' · 부분일':''}`]}/>}/>{!cumulative&&S.dailyAverage!=null&&<ReferenceLine y={S.dailyAverage} stroke="var(--ss-muted)" strokeDasharray="5 5"/>}{cumulative?<Area dataKey="value" type="linear" stroke="var(--ss-link)" fill="var(--ss-accent)" fillOpacity={.28} strokeWidth={2.5} activeDot={{r:5,strokeWidth:2,stroke:'var(--ss-surface)'}} isAnimationActive={false}/>:<Bar dataKey="value" radius={[5,5,0,0]} maxBarSize={24} isAnimationActive={false}>{plot.map(row=><Cell key={row.date} fill={row.semanticColor} fillOpacity={row.partial_day?.55:1}/>)}</Bar>}</ComposedChart></ResponsiveContainer></div>
        <div className="owner-chart-bottom owner-trend-bottom"><div className="chart-legend">{cumulative?<span><i/>선택일 누적</span>:<><span><i/>평일</span><span><i style={{background:'var(--sales-positive)'}}/>주말</span><span><i style={{background:'var(--sales-caution)'}}/>큰 주문 포함</span><span><i style={{background:'var(--ss-muted)',opacity:.55}}/>부분일</span>{plot.some(row=>row.amount<0)&&<span><i style={{background:'var(--sales-negative)'}}/>음수 순매출</span>}</>}</div><a href="/sungso/sohee/sales/overview/">일별 내역 <ArrowUpRight size={14}/></a></div>
        <div className="chart-date-reading" aria-label="차트 날짜별 금액"><div>{activeRow?<><span>{salesDateLabel(activeRow.date)}</span><strong>{money(activeRow.value)}</strong><small>{cumulative?'선택일 누적':activeRow.partial_day?'부분일':activeRow.bulkCount?'큰 주문 포함':'실매출'}</small></>:<span>선택한 기간에 기록이 없습니다.</span>}</div><div className="chart-date-buttons"><Button aria-label="차트 이전 날짜" disabled={activeIndex<=0} onClick={()=>setChartDate(plot[activeIndex-1].date)}><ChevronLeft size={14}/></Button><Button aria-label="차트 다음 날짜" disabled={activeIndex<0||activeIndex>=plot.length-1} onClick={()=>setChartDate(plot[activeIndex+1].date)}><ChevronRight size={14}/></Button></div></div>
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
    <div className="dashboard-bottom"><span>원가·인건비 자료가 없어 순이익은 계산하지 않습니다.</span><div><Button className="insights-trigger" onClick={()=>setInsightsOpen(true)}><ScanLine size={13}/> 운영 인사이트</Button><Button onClick={()=>setRecordsOpen(true)}>집계 기준·기록일</Button><Button onClick={()=>setHistoryOpen(true)}>과거 변화와 비교 근거</Button></div></div>
    <OwnerInsights opened={insightsOpen} onClose={()=>setInsightsOpen(false)} insights={insights} menu={menu}/>
    <RecordDetails data={D} selection={selection} opened={recordsOpen} onClose={()=>setRecordsOpen(false)}/>
    <Drawer opened={historyOpen} onClose={()=>setHistoryOpen(false)} title="과거 변화와 비교 근거" position="right" size={940} withinPortal={false} trapFocus returnFocus closeButtonProps={{'aria-label':'과거 비교 닫기'}} classNames={{content:'sales-drawer',header:'sales-drawer-header',body:'sales-drawer-body'}}>{children}<Note>단체 고객이나 개인의 성과로 확정한 분류가 아닙니다. 운영 활동 날짜와 함께 비교하세요.</Note></Drawer>
  </>;
}

function OwnerInsights({opened,onClose,insights:I,menu}){
  const C=I.comparison,R=I.distribution;
  return <Drawer opened={opened} onClose={onClose} title="운영 인사이트" position="right" size={780} withinPortal={false} trapFocus returnFocus closeButtonProps={{'aria-label':'운영 인사이트 닫기'}} classNames={{content:'sales-drawer owner-insights-drawer',header:'sales-drawer-header',body:'sales-drawer-body'}}>
    <p className="insights-intro">매출이 달라진 이유를 좁히고, 다음에 확인할 메뉴를 고릅니다. 선택한 분석 기간을 기준으로 계산합니다.</p>
    <Section eyebrow="01 / SAME WEEKDAY" title="결제 건수와 건당 매출, 무엇이 달라졌나" desc={C.available?`${C.offsetDays/7}주 전 같은 요일끼리 비교 · 부분일 제외 · ${C.current.length}일 대응`:'같은 요일과 같은 POS 출처의 완결일만 비교합니다.'}>
      {C.available?<><div className="owner-insight-metrics"><div><span>실매출 변화</span><strong>{C.amountChange==null?'—':pct(C.amountChange)}</strong><small>{money(C.before.amount)} → {money(C.now.amount)}</small></div><div><span>결제 순건수 변화</span><strong>{C.paymentsChange==null?'—':pct(C.paymentsChange)}</strong><small>{num(C.before.payments)} → {num(C.now.payments)}건</small></div><div><span>결제 1건당 매출 변화</span><strong>{C.perPaymentChange==null?'—':pct(C.perPaymentChange)}</strong><small>{C.before.perPayment==null?'—':money(C.before.perPayment)} → {C.now.perPayment==null?'—':money(C.now.perPayment)}</small></div></div><p className="insight-explainer">건수는 주문 규모와 함께 확인하세요. 결제 건수를 방문객 수로 보거나, 건당 매출 변화를 가격 인상의 효과로 단정할 수는 없습니다.</p><p className="insight-basis">현재 {C.current[0].date}–{C.current.at(-1).date} · 이전 {C.previous[0].date}–{C.previous.at(-1).date}{C.current.length!==Math.round((Date.parse(C.current.at(-1).date)-Date.parse(C.current[0].date))/86400000)+1?' · 선택한 날짜만 짝지어 비교':''}</p></>:<Note>{C.reason}</Note>}
    </Section>
    <Section eyebrow="02 / A TYPICAL DAY" title="평소 하루 매출은 어느 정도인가" desc="완결된 결제 기록일의 매출 분포 · 큰 주문도 포함">
      {R?<><div className="owner-insight-metrics"><div><span>중앙값</span><strong>{money(R.median)}</strong><small>높은 매출일의 영향을 덜 받는 중간값</small></div><div><span>가운데 50%의 기록일</span><strong className="insight-range">{money(R.lower)}–{money(R.upper)}</strong><small>예측 범위나 보장 매출이 아닙니다.</small></div><div><span>평균과의 차이</span><strong>{money(R.average-R.median)}</strong><small>평균 − 중앙값 · 표본 {R.days}일</small></div></div><p className="insight-explainer">평균만 보면 큰 매출이 나온 날에 계획이 끌려갈 수 있습니다. 인력·발주를 검토할 때 중앙값과 하루 편차를 함께 보세요.</p></>:<Note>완결된 결제 기록일이 5일 이상일 때 표시합니다.</Note>}
    </Section>
    <Section eyebrow="03 / MENU MIX" title="상위 메뉴에 얼마나 집중되어 있나" desc={menu.dailyOnly?'토스 완결일 메뉴 상세 기준':'선택 월 메뉴 집계 기준 · 부분일 포함 가능'}>
      <div className="menu-concentration"><div><span>상위 5개 메뉴의 금액 비중</span><strong>{I.concentration==null?'—':num(I.concentration,1)+'%'}</strong></div><Progress value={I.concentration??0} color="var(--ss-link)" size={9} aria-label="상위 다섯 메뉴 금액 비중"/></div>
      <p className="insight-explainer">매출 비중이 높은 메뉴의 품절 여부와 재료 준비를 먼저 점검하세요. 많이 팔리는 메뉴가 이익도 높다는 뜻은 아닙니다.{I.concentration==null?' 순금액이 음수인 메뉴가 있거나 합계가 0이면 비중을 표시하지 않습니다.':''}</p>
      <a className="owner-panel-link" href="/sungso/sohee/sales/menus/">메뉴별 판매 빈도·수량 변화 확인 <ArrowUpRight size={15}/></a>
    </Section>
    <Note>현재 자료로 재구매율·고객 수·메뉴 이익률·실제 로스율은 알 수 없습니다. 방문 고객, 원가, 준비·품절·폐기 기록을 추가해야 합니다.</Note>
  </Drawer>;
}
