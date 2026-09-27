import React, {useState,useMemo} from 'react';
import {ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell} from 'recharts';
import {Download,ChevronRight} from 'lucide-react';
import {Button, SalesCalendar, ExtraMenus} from './ui.jsx';
import {DateFilter, usePeriod} from './date-filter.jsx';
import {SegmentedControl} from '@mantine/core';
import {ChartTip,chartAxis,amountAxis,ChartLegend} from './charts.jsx';
import {DayDetail} from './day-detail.jsx';
import {RecordDetails} from './record-details.jsx';
import {operatingSummary} from './operating-summary.mjs';
import {analyzeSelection,initialSelection,selectedDates} from './analysis.mjs';
import {ledgerSourceData,periodAnchorMonth,ledgerPeriodKey,menuDetailAvailability} from './ledger-scope.mjs';
import {num,money,sourceName,monthShort,colors,tipStyle,Pill,Note,Section,Header,Table,numeric,textCol,download,csv} from './report-ui.jsx';

export function SalesLedger({data:D}) {
  const {selection,setSelection}=usePeriod();
  const [source,setSource]=useState('all'),[browse,setBrowse]=useState(null),[recordsOpen,setRecordsOpen]=useState(false);
  const [basis,setBasis]=useState('total'),[detailDate,setDetailDate]=useState(null),[calendarMode,setCalendarMode]=useState('detail');
  const scoped=useMemo(()=>ledgerSourceData(D,source)||D,[D,source]);
  const A=analyzeSelection(scoped,selection),S=operatingSummary(scoped,selection);
  const months=[...new Set(scoped.monthly.map(row=>row.month))].sort();
  const periodKey=ledgerPeriodKey(selection,source,calendarMode),anchor=periodAnchorMonth(scoped,selection);
  const selectedMonths=months.filter(month=>A.dates.some(date=>date.startsWith(month)));
  const calendarMonths=calendarMode==='multiple'||selection.mode==='month'?months:selectedMonths;
  const activeMonth=browse?.key===periodKey&&calendarMonths.includes(browse.month)?browse.month:anchor;
  const chosen=new Set(A.dates),detailDates=useMemo(()=>new Set(D.menu_toss.map(row=>row.date)),[D]);
  const calendarRows=scoped.daily.filter(row=>row.month===activeMonth&&(calendarMode==='multiple'||chosen.has(row.date)));
  const calendarSources=[...new Set(calendarRows.map(row=>row.source))];
  const availableDays=calendarRows.filter(row=>menuDetailAvailability(row,detailDates).kind==='available').length;
  const selectMonth=month=>{setBrowse(null);setSelection(old=>({...old,mode:'month',month}));};
  function changeSource(nextSource){
    const next=ledgerSourceData(D,nextSource);if(!next)return;
    setSource(nextSource);setBrowse(null);setDetailDate(null);
    if(!selectedDates(next,selection).length)setSelection(initialSelection(next));
  }
  function browseMonth(month){if(selection.mode==='month'&&calendarMode==='detail')selectMonth(month);else setBrowse({key:periodKey,month});}
  function toggleDay(day){
    const dates=selection.mode==='multiple'?[...selection.dates]:[];
    const next={...selection,mode:'multiple',dates:dates.includes(day)?dates.filter(d=>d!==day):[...dates,day].sort()};
    setSelection(next);setBrowse({key:ledgerPeriodKey(next,source,calendarMode),month:day.slice(0,7)});
  }
  const sourceDescription=source==='toss'?'토스 · 완결일에 저장된 메뉴 상세 조회':source==='payhere'?'페이히어 · 일별 매출 / 메뉴는 월별 집계만':'토스는 일별 메뉴 · 페이히어는 매출만';
  return <>
    <Header label="SALES RECORDS" title="매출 내역" description={<span className="ledger-source-description"><span>{sourceDescription}</span><small>{scoped.start} – {scoped.end} 수집</small></span>} action={<div className="ledger-header-actions"><SegmentedControl aria-label="내역 출처" value={source} onChange={changeSource} data={[{value:'all',label:'전체'},{value:'toss',label:'토스',disabled:!D.daily.some(row=>row.source==='toss')},{value:'payhere',label:'페이히어',disabled:!D.daily.some(row=>row.source==='payhere')}]}/><Button onClick={()=>download('선택일_매출.csv',csv(A.rows))}><Download size={16}/> 선택 내역 저장</Button></div>}/>
    <DateFilter data={scoped}/>
    <div className="ledger-summary" aria-label="선택 매출 요약"><div><span>선택 기간 실매출</span><strong>{money(A.amount)}</strong></div><div><span>결제 순건수</span><strong>{num(A.payments)}<small>건</small></strong></div><div><span>매출 기록일</span><strong>{S.completeRecordedDays}<small>일</small></strong><Button className="metric-detail" onClick={()=>setRecordsOpen(true)}>날짜·기준 확인</Button></div><div><span>일평균 매출</span><strong>{S.dailyAverage==null?'—':money(S.dailyAverage)}</strong><small>완결된 결제 기록일만</small></div></div>
    {A.missingDays>0&&<Note>선택한 날짜 중 {A.missingDays}일은 수집 기록이 없습니다. 매출 0원으로 채우지 않았습니다.</Note>}
    <div className="ledger-day-layout">
      <Section title="일별 매출 내역" desc="날짜 또는 메뉴 보기를 눌러 상세 조회">
        <Table data={A.rows} pageSize={7} filename="선택일_매출.csv" searchPlaceholder="날짜·출처 검색" initialSort={[{id:'date',desc:true}]} columns={[{accessorKey:'date',header:'날짜',cell:item=><Button className="menu-link" aria-label={item.getValue()+' 판매 상세'} onClick={()=>setDetailDate(item.getValue())}>{item.getValue()}</Button>},numeric('amount','실매출',money),numeric('payment_count','결제 순건수'),{accessorKey:'source',header:'출처',cell:item=><span className={'source-badge source-'+item.getValue()}>{item.getValue()==='toss'?'토스':'페이히어'}</span>},{id:'detail',accessorFn:row=>menuDetailAvailability(row,detailDates).label,header:'메뉴 상세',cell:item=>{const info=menuDetailAvailability(item.row.original,detailDates);return info.kind==='available'?<Button className="day-menu-link" aria-label={item.row.original.date+' 메뉴 보기'} onClick={()=>setDetailDate(item.row.original.date)}>메뉴 보기 <ChevronRight size={12}/></Button>:<span className={'detail-availability '+info.kind} title={info.hint}>{info.label}</span>;}}]}/>
      </Section>
      <Section title="매출 달력" desc={calendarMode==='multiple'?'원하는 날짜를 추가·해제하면 분석 기간에 반영됩니다.':'분석 기간과 연결 · 날짜를 눌러 상세 확인'} action={<Pill>{activeMonth}</Pill>}>
        <div className="calendar-source-tools"><SegmentedControl className="calendar-mode" aria-label="달력 클릭 방식" value={calendarMode} onChange={setCalendarMode} data={[{value:'detail',label:'일자 상세'},{value:'multiple',label:'여러 날짜 선택'}]}/><span className="calendar-source-label">{calendarSources.map(value=><span key={value} className={'source-badge source-'+value}>{value==='toss'?'토스':'페이히어'}</span>)}</span></div>
        <SalesCalendar key={activeMonth} months={calendarMonths.length?calendarMonths:[activeMonth]} month={activeMonth} onMonthChange={browseMonth} daily={calendarRows} start={calendarMode==='detail'&&selection.mode!=='month'?(A.dates[0]||scoped.start):scoped.start} end={calendarMode==='detail'&&selection.mode!=='month'?(A.dates.at(-1)||scoped.end):scoped.end} selectedDates={calendarMode==='multiple'||['range','multiple'].includes(selection.mode)?A.dates:detailDate?[detailDate]:[]} onSelectDate={calendarMode==='detail'?setDetailDate:toggleDay} dayStatus={row=>menuDetailAvailability(row,detailDates)}/>
        <p className="calendar-availability" aria-live="polite">{calendarSources.length===1&&calendarSources[0]==='payhere'?'페이히어 기록 · 일별 매출만 조회, 메뉴는 월별 집계':`● 메뉴 상세 ${availableDays}일 · ○ 매출만 / 부분일 / 상세 없음`}</p>
      </Section>
    </div>
    <RecordDetails data={scoped} selection={selection} opened={recordsOpen} onClose={()=>setRecordsOpen(false)}/><DayDetail data={D} date={detailDate} onClose={()=>setDetailDate(null)} onViewMonth={month=>{setSelection(old=>({...old,mode:'month',month}));setDetailDate(null);}}/>
    <ExtraMenus title="월별 매출 원장">
      <Section title="월별 매출" desc="선택 출처의 전체 월 이력 · 월을 누르면 일별 내역에 적용" action={<div className="segmented"><Button aria-pressed={basis==='total'} className={basis==='total'?'active':''} onClick={()=>setBasis('total')}>월 합계</Button><Button aria-pressed={basis==='daily'} className={basis==='daily'?'active':''} onClick={()=>setBasis('daily')}>기록일당</Button></div>}>
        <ChartLegend items={[{label:'Toss POS'},{label:'Payhere',color:'var(--ss-accent)'},{label:'옅은 막대 · 부분월',color:'var(--ss-border-strong)'}]}/><div className="chart"><ResponsiveContainer><BarChart margin={{top:20,right:8,left:0,bottom:0}} data={scoped.monthly.map(row=>({...row,label:monthShort(row.month),value:basis==='total'?row.amount:row.per_record_day}))} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 5" stroke="var(--ss-border)"/><XAxis {...chartAxis} dataKey="label"/><YAxis {...amountAxis}/><Tooltip cursor={{fill:'var(--ss-soft)'}} content={<ChartTip formatter={value=>[money(value),basis==='total'?'실매출':'기록일당 매출']}/>}/><Bar dataKey="value" radius={[5,5,0,0]} maxBarSize={38} isAnimationActive={false}>{scoped.monthly.map(row=><Cell key={row.month+row.source} fill={row.source==='toss'?colors[0]:colors[1]} fillOpacity={row.partial?.45:1}/>)}</Bar></BarChart></ResponsiveContainer></div>
        <Table data={scoped.monthly} columns={[{accessorKey:'month',header:'기간',cell:item=><Button className="menu-link" aria-pressed={selection.mode==='month'&&selection.month===item.getValue()} onClick={()=>selectMonth(item.getValue())}>{item.getValue()}</Button>},{accessorKey:'source',header:'출처',cell:item=>sourceName(item.getValue())},numeric('amount','매출',money),numeric('record_days','기록일'),numeric('per_record_day','기록일당 매출',money),{accessorKey:'partial',header:'범위',cell:item=>item.getValue()?<Pill>부분월</Pill>:'수집 완료'}]} initialSort={[{id:'month',desc:true}]} selectedRow={row=>selection.mode==='month'&&row.month===selection.month} filename="월별_매출.csv" searchPlaceholder="월 검색"/>
      </Section>
    </ExtraMenus>
  </>;
}
