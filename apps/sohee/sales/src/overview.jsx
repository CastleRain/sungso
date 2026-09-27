import React, {useState} from 'react';
import {ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine} from 'recharts';
import {CalendarDays, ReceiptText, TrendingUp, Coins, ArrowUpRight} from 'lucide-react';
import {Button, SalesCalendar} from './ui.jsx';
import {usePeriod} from './date-filter.jsx';
import {analyzeSelection, selectedMenuData, groupMenus, selectionLabel, total} from './analysis.mjs';
import {WEEKDAYS} from './planning.mjs';
import {num,money,pct,sourceName,monthShort,colors,tipStyle,Pill,Note,Section,Header,Stat,Table,numeric,download,csv} from './report-ui.jsx';

const axis = {tickLine:false,axisLine:false,tick:{fontSize:11,fill:'var(--ss-muted)'},minTickGap:20};
const moneyAxis = {...axis,width:52,tickFormatter:value=>Math.abs(value)>=10000?num(value/10000,1)+'만':num(value)};
export function Overview({data:D}) {
  const {selection,setSelection} = usePeriod(), A = analyzeSelection(D, selection), C = A.comparison;
  const [basis,setBasis] = useState('total'), [calendarMonth,setCalendarMonth] = useState(selection.month);
  const menu = selectedMenuData(D,selection), top = groupMenus(menu.rows).sort((a,b)=>b.amount-a.amount).slice(0,5);
  const monthOptions = [...new Set(D.monthly.map(row=>row.month))];
  const activeMonth = selection.mode==='month'?selection.month:calendarMonth;
  const monthRows = D.monthly.map(row=>({...row,label:monthShort(row.month),value:basis==='total'?row.amount:row.per_record_day}));
  const monthlyHours = ['month','all'].includes(selection.mode);
  const hours = Array.from({length:24},(_,hour)=>({hour:hour+'시',amount:total((monthlyHours?D.receipt_hour.filter(row=>selection.mode==='all'||row.month===selection.month):menu.detail).filter(row=>row.hour===hour),'amount')}));
  const peak = hours.reduce((best,row)=>row.amount>best.amount?row:best,{amount:0,hour:'—'});
  const plot = A.rows.map(row=>({...row,label:row.date.slice(5),full:!row.partial_day}));
  const selectMonth = month=>{setCalendarMonth(month);setSelection(old=>({...old,mode:'month',month}));};
  const toggleDay = day=>{setCalendarMonth(day.slice(0,7));setSelection(old=>{const dates=old.mode==='multiple'?[...old.dates]:[];return {...old,mode:'multiple',dates:dates.includes(day)?dates.filter(d=>d!==day):[...dates,day].sort()};});};
  return <><Header label="01 / SALES OVERVIEW" title="매출 원장과 추이" description="매출이 얼마나, 어떤 날과 시간에 발생했는지 선택한 날짜로 살펴보세요." action={<Pill><CalendarDays size={15}/>원본 {D.end} · 완결일 {D.complete_through}</Pill>}/>
    <div className="dashboard-stats" aria-label="선택 기간 주요 지표">
      <Stat label="선택 기간 실매출" value={money(A.amount)} detail={`${A.rows.length}일 집계${A.includedPartialDays?` · 부분일 ${A.includedPartialDays}일 포함`:''}`} icon={Coins} accent/>
      <Stat label="기록일당 매출" value={A.perRecordDay==null?'—':money(A.perRecordDay)} detail={`결제 기록이 있는 ${A.recordDays}일 기준 · 영업일 확정값 아님`} icon={TrendingUp}/>
      <Stat label="결제 순건수" value={num(A.payments)} unit="건" detail="출처의 결제·환불 집계 기준 유지" icon={ReceiptText}/>
      <Stat label="결제 1건당 실매출" value={A.perPayment==null?'—':money(A.perPayment)} detail="실매출 ÷ 결제 순건수 · 방문객 수 아님" icon={Coins}/>
    </div>
    <section className="period-comparison" aria-label="선택 기간 비교"><div><span className="eyebrow">완결일끼리 비교</span><h2>{C.percent==null?'비교 기준 확인':`${pct(C.percent)} · ${C.delta>=0?'증가':'감소'}`}</h2><p>{C.comparable?`직전 비교일보다 ${money(Math.abs(C.delta))} ${C.delta>=0?'많습니다':'적습니다'}.`:'이전 기간의 수집 범위가 부족해 변화율을 계산하지 않았습니다.'}</p></div><div><span>선택한 완결일 {C.current.days}일</span><strong>{money(C.current.amount)}</strong><small>부분일은 비교에서 제외</small></div><div><span>이전 비교일 {C.previous.days}일</span><strong>{C.comparable?money(C.previous.amount):'자료 부족'}</strong><small>{C.previousDates.length?`${C.previousDates[0]} – ${C.previousDates.at(-1)}`:'날짜 선택 전'}</small></div><a href="/sungso/sohee/sales/changes/">비교 근거 <ArrowUpRight size={16}/></a></section>
    <p className="footnote comparison-explainer">선택한 완결일의 시작~끝 길이만큼 이전으로 옮긴 날짜를 비교합니다. 떨어진 날짜는 같은 간격을 유지합니다.{C.sourceChanged?' POS 출처가 달라 집계 기준의 영향을 함께 확인하세요.':''}{A.missingDays?` 수집되지 않은 ${A.missingDays}일은 0원으로 계산하지 않습니다.`:''}</p>
    {!A.rows.length&&<Note>선택한 날짜에 집계 가능한 기록이 없습니다. 날짜 또는 부분일 포함 조건을 바꿔주세요.</Note>}
    <div className="dashboard-chart-grid">
      <Section title="선택일 매출" desc={`${selectionLabel(selection)} · 선택한 날짜만 표시`} action={<Button className="text-button" onClick={()=>download('선택일_매출.csv',csv(A.rows))}>일별 CSV</Button>}>
        <div className="chart dashboard-main-chart"><ResponsiveContainer><BarChart data={plot} margin={{top:16,right:8,left:0,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 5" stroke="var(--ss-border)"/><XAxis {...axis} dataKey="label"/><YAxis {...moneyAxis}/><Tooltip contentStyle={tipStyle} labelFormatter={label=>`${label} 매출`} formatter={(value,name,item)=>[money(value),item.payload.partial_day?'부분일 실매출':'실매출']}/>{A.perRecordDay!=null&&<ReferenceLine y={A.perRecordDay} stroke="var(--ss-muted)" strokeDasharray="5 5"/>}<Bar dataKey="amount" name="실매출" radius={[5,5,0,0]} maxBarSize={34} isAnimationActive={false}>{plot.map(row=><Cell key={row.date} fill="var(--ss-link)" fillOpacity={row.partial_day?.4:1}/>)}</Bar></BarChart></ResponsiveContainer></div>
        <div className="chart-legend"><span><i/> 실매출</span><span><i className="partial"/> 부분일</span><span>점선 · 선택 기간 기록일당 매출</span></div>
      </Section>
      <Section title="요일별 매출 흐름" desc="완결일의 기록일당 매출 · 요일마다 표본 수를 함께 확인">
        <div className="chart dashboard-main-chart"><ResponsiveContainer><BarChart data={A.weekday.map(row=>({...row,label:WEEKDAYS[row.weekday]}))} margin={{top:16,right:8,left:0,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 5" stroke="var(--ss-border)"/><XAxis {...axis} dataKey="label"/><YAxis {...moneyAxis}/><Tooltip contentStyle={tipStyle} formatter={(value,name,item)=>[money(value),`${item.payload.recordDays}개 기록일 평균`]}/><Bar dataKey="perRecordDay" name="기록일당 매출" radius={[5,5,0,0]} fill="var(--ss-accent)" stroke="var(--ss-border-strong)" maxBarSize={38} isAnimationActive={false}/></BarChart></ResponsiveContainer></div><div className="weekday-samples">{A.weekday.map(row=><span key={row.weekday}>{WEEKDAYS[row.weekday]} {row.recordDays}일</span>)}</div>
      </Section>
    </div>
    <div className="dashboard-chart-grid secondary-charts">
      <Section title={monthlyHours?'결제 시간대별 매출':'선택일 메뉴 주문 시간대'} desc={monthlyHours?'월별 결제 시각 집계 · 완결일만':'토스 메뉴 상세의 주문 시작 시각 · 완결일만'} action={<Pill>가장 큰 시간대 {peak.hour}</Pill>}>
        <div className="chart"><ResponsiveContainer><AreaChart data={hours} margin={{top:16,right:10,left:0,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 5" stroke="var(--ss-border)"/><XAxis {...axis} dataKey="hour" interval={3}/><YAxis {...moneyAxis}/><Tooltip contentStyle={tipStyle} formatter={value=>[money(value),monthlyHours?'결제 매출':'메뉴 주문액']}/><Area dataKey="amount" type="linear" stroke="var(--ss-link)" fill="var(--ss-accent)" fillOpacity={.35} strokeWidth={2.5} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div><p className="footnote">{monthlyHours?'메뉴 준비 분석은 결제 시각과 다른 주문 시작 시각을 사용합니다.':'날짜별 결제 시간대는 저장 집계에 없어 대체하지 않았습니다. 페이히어·부분일의 메뉴 시간은 제외합니다.'}</p>
      </Section>
      <Section title="매출 상위 메뉴" desc={menu.dailyOnly?'선택한 토스 완결일 · 페이히어 메뉴 일별 자료 없음':'선택 기간의 월별 집계 · 개와 팩을 구분'} action={<a href="/sungso/sohee/sales/menus/">전체 메뉴 <ArrowUpRight size={14}/></a>}>
        <div className="top-menu-list">{top.length?top.map((row,index)=><div key={row.menu}><span className="rank">{index+1}</span><div><strong>{row.menu}</strong><div className="menu-meter"><span style={{width:Math.max(0,top[0].amount?row.amount/top[0].amount*100:0)+'%'}}/></div><small>{num(row.quantity)}{row.unit} · 매출 {money(row.amount)}</small></div></div>):<p className="empty">선택일의 메뉴 상세 기록이 없습니다.</p>}</div>
      </Section>
    </div>
    <div className="dashboard-reading"><CalendarDays size={20}/><p>{A.bestDay?<><strong>선택한 완결일 중 {A.bestDay.date}의 매출이 가장 큽니다.</strong><span>{money(A.bestDay.amount)} · 대량 주문 여부와 당시 운영 기록을 함께 살펴보세요.</span></>:<strong>최고 매출일을 비교할 완결일 기록이 없습니다.</strong>}</p></div>
    <div className="two-col overview-secondary">
      <Section title="매출 달력" desc="날짜를 누르면 선택일 분석에 추가됩니다. 다른 달의 날짜도 함께 고를 수 있습니다." action={<Pill>{activeMonth}</Pill>}>
        <SalesCalendar months={monthOptions} month={activeMonth} onMonthChange={month=>{setCalendarMonth(month);if(selection.mode==='month')selectMonth(month)}} daily={D.daily.filter(row=>row.month===activeMonth)} start={D.start} end={D.end} selectedDates={selection.mode==='multiple'?selection.dates:A.dates} onSelectDate={toggleDay}/><p className="footnote">단위 만원 · 달력에 기록이 없는 날을 휴무로 단정하지 않습니다.</p>
      </Section>
      <Section title="월별 매출" desc="전체 수집 이력 · 날짜 선택과 별개로 장기 흐름을 봅니다." action={<div className="segmented"><Button aria-pressed={basis==='total'} className={basis==='total'?'active':''} onClick={()=>setBasis('total')}>월 합계</Button><Button aria-pressed={basis==='daily'} className={basis==='daily'?'active':''} onClick={()=>setBasis('daily')}>기록일당</Button></div>}>
        <div className="chart tall"><ResponsiveContainer><BarChart data={monthRows} margin={{top:16,right:8,left:0,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 5" stroke="var(--ss-border)"/><XAxis {...axis} dataKey="label"/><YAxis {...moneyAxis}/><Tooltip contentStyle={tipStyle} formatter={value=>[money(value),basis==='total'?'매출':'기록일당 매출']}/><Bar dataKey="value" radius={[5,5,0,0]} maxBarSize={38} isAnimationActive={false}>{monthRows.map(row=><Cell key={row.month+row.source} fill={row.source==='toss'?colors[0]:colors[1]} fillOpacity={row.partial?.45:1}/>)}</Bar></BarChart></ResponsiveContainer></div><div className="chart-legend"><span>Toss · 진한 막대</span><span>Payhere · 옅은 막대</span><span>부분월은 투명하게 표시</span></div>
      </Section>
    </div>
    <Section title="월별 원장" desc="전체 이력에서 월을 누르면 분석 기간을 해당 월로 바꿉니다."><Table data={D.monthly} columns={[{accessorKey:'month',header:'기간',cell:item=><Button className="menu-link" aria-pressed={selection.mode==='month'&&selection.month===item.getValue()} onClick={()=>selectMonth(item.getValue())}>{item.getValue()}</Button>},{accessorKey:'source',header:'출처',cell:item=>sourceName(item.getValue())},numeric('amount','매출',money),numeric('record_days','기록일'),numeric('per_record_day','기록일당 매출',money),{accessorKey:'partial',header:'범위',cell:item=>item.getValue()?<Pill>부분월</Pill>:'수집 완료'}]} initialSort={[{id:'month',desc:true}]} selectedRow={row=>selection.mode==='month'&&row.month===selection.month} filename="월별_매출.csv" searchPlaceholder="월 검색"/></Section>
    <Note>실매출에는 출처의 할인·환불 기준을 유지합니다. 원가·인건비·폐기 자료가 없어 순이익을 계산하지 않습니다. 건당 실매출은 방문 고객의 객단가와 다를 수 있습니다.</Note>
  </>;
}
