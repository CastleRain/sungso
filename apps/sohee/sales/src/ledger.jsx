import React, {useState} from 'react';
import {ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell} from 'recharts';
import {Download} from 'lucide-react';
import {Button, SalesCalendar, ExtraMenus} from './ui.jsx';
import {DateFilter, usePeriod} from './date-filter.jsx';
import {SegmentedControl} from '@mantine/core';
import {DayDetail} from './day-detail.jsx';
import {analyzeSelection} from './analysis.mjs';
import {num,money,sourceName,monthShort,colors,tipStyle,Pill,Note,Section,Header,Table,numeric,textCol,download,csv} from './report-ui.jsx';

export function SalesLedger({data:D}) {
  const {selection,setSelection}=usePeriod(), A=analyzeSelection(D,selection);
  const [basis,setBasis]=useState('total'),[calendarMonth,setCalendarMonth]=useState(selection.month),[detailDate,setDetailDate]=useState(null),[calendarMode,setCalendarMode]=useState('detail');
  const months=[...new Set(D.monthly.map(row=>row.month))], activeMonth=selection.mode==='month'?selection.month:calendarMonth;
  const selectMonth=month=>{setCalendarMonth(month);setSelection(old=>({...old,mode:'month',month}));};
  const toggleDay=day=>{setCalendarMonth(day.slice(0,7));setSelection(old=>{const dates=old.mode==='multiple'?[...old.dates]:[];return {...old,mode:'multiple',dates:dates.includes(day)?dates.filter(d=>d!==day):[...dates,day].sort()};});};
  return <>
    <Header label="SALES RECORDS" title="매출 내역" description="날짜별 금액을 확인하고, 달력에서 비교할 날을 골라보세요." action={<Button onClick={()=>download('선택일_매출.csv',csv(A.rows))}><Download size={16}/> 선택 내역 저장</Button>}/>
    <DateFilter data={D}/>
    <div className="ledger-summary" aria-label="선택 매출 요약"><div><span>선택 기간 실매출</span><strong>{money(A.amount)}</strong></div><div><span>결제 순건수</span><strong>{num(A.payments)}<small>건</small></strong></div><div><span>집계된 날짜</span><strong>{A.rows.length}<small>일 · 부분일 {A.includedPartialDays}일</small></strong></div></div>
    {A.missingDays>0&&<Note>선택한 날짜 중 {A.missingDays}일은 수집 기록이 없습니다. 매출 0원으로 채우지 않았습니다.</Note>}
    <div className="ledger-day-layout">
      <Section title="일별 매출 내역" desc="결제·환불을 반영한 실매출 · 머리글을 눌러 정렬">
        <Table data={A.rows} pageSize={10} filename="선택일_매출.csv" searchPlaceholder="날짜·출처 검색" initialSort={[{id:'date',desc:true}]} columns={[{accessorKey:'date',header:'날짜',cell:item=><Button className="menu-link" aria-label={item.getValue()+' 판매 상세'} onClick={()=>setDetailDate(item.getValue())}>{item.getValue()}</Button>},numeric('amount','실매출',money),numeric('payment_count','결제 순건수'),{accessorKey:'source',header:'출처',cell:item=>sourceName(item.getValue())},{accessorKey:'partial_day',header:'범위',cell:item=>item.getValue()?<Pill>부분일</Pill>:'완결일'}]}/>
      </Section>
      <Section title="매출 달력" desc="날짜를 누르면 그날 판매한 메뉴를 확인할 수 있습니다." action={<Pill>{activeMonth}</Pill>}>
        <SegmentedControl className="calendar-mode" aria-label="달력 클릭 방식" value={calendarMode} onChange={setCalendarMode} data={[{value:'detail',label:'일자 상세'},{value:'multiple',label:'여러 날짜 선택'}]}/><SalesCalendar months={months} month={activeMonth} onMonthChange={month=>{setCalendarMonth(month);if(selection.mode==='month')selectMonth(month);}} daily={D.daily.filter(row=>row.month===activeMonth)} start={D.start} end={D.end} selectedDates={calendarMode==='detail'?(detailDate?[detailDate]:[]):selection.mode==='multiple'?selection.dates:A.dates} onSelectDate={calendarMode==='detail'?setDetailDate:toggleDay}/>
        <p className="footnote">단위 만원 · 기록 없는 날을 휴무로 단정하지 않습니다.</p>
      </Section>
    </div>
    <DayDetail data={D} date={detailDate} onClose={()=>setDetailDate(null)}/>
    <ExtraMenus title="월별 매출 원장">
      <Section title="월별 매출" desc="전체 수집 이력 · 월을 선택하면 위 일별 내역에 적용합니다." action={<div className="segmented"><Button aria-pressed={basis==='total'} className={basis==='total'?'active':''} onClick={()=>setBasis('total')}>월 합계</Button><Button aria-pressed={basis==='daily'} className={basis==='daily'?'active':''} onClick={()=>setBasis('daily')}>기록일당</Button></div>}>
        <div className="chart"><ResponsiveContainer><BarChart data={D.monthly.map(row=>({...row,label:monthShort(row.month),value:basis==='total'?row.amount:row.per_record_day}))} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 5" stroke="var(--ss-border)"/><XAxis dataKey="label" tickLine={false} axisLine={false}/><YAxis tickFormatter={value=>num(value/10000)+'만'} tickLine={false} axisLine={false}/><Tooltip contentStyle={tipStyle} formatter={value=>[money(value),basis==='total'?'실매출':'기록일당 매출']}/><Bar dataKey="value" radius={[5,5,0,0]} maxBarSize={38} isAnimationActive={false}>{D.monthly.map(row=><Cell key={row.month+row.source} fill={row.source==='toss'?colors[0]:colors[1]} fillOpacity={row.partial?.45:1}/>)}</Bar></BarChart></ResponsiveContainer></div>
        <Table data={D.monthly} columns={[{accessorKey:'month',header:'기간',cell:item=><Button className="menu-link" aria-pressed={selection.mode==='month'&&selection.month===item.getValue()} onClick={()=>selectMonth(item.getValue())}>{item.getValue()}</Button>},{accessorKey:'source',header:'출처',cell:item=>sourceName(item.getValue())},numeric('amount','매출',money),numeric('record_days','기록일'),numeric('per_record_day','기록일당 매출',money),{accessorKey:'partial',header:'범위',cell:item=>item.getValue()?<Pill>부분월</Pill>:'수집 완료'}]} initialSort={[{id:'month',desc:true}]} selectedRow={row=>selection.mode==='month'&&row.month===selection.month} filename="월별_매출.csv" searchPlaceholder="월 검색"/>
      </Section>
    </ExtraMenus>
  </>;
}
