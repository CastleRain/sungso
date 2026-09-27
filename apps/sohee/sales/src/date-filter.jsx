import React, {createContext, useContext, useState} from 'react';
import {Popover, SegmentedControl} from '@mantine/core';
import {DatePicker} from '@mantine/dates';
import {CalendarDays, ChevronDown, X} from 'lucide-react';
import {Button, Select, CheckField} from './ui.jsx';
import {periodAnchorMonth} from './ledger-scope.mjs';
import {selectedDates, selectionLabel, shiftDate, initialSelection} from './analysis.mjs';

export const PeriodContext = createContext(null);
export const usePeriod = () => useContext(PeriodContext);
export function DateFilter({data}) {
  const {selection, setSelection} = usePeriod();
  const [opened, setOpened] = useState(false), [mode, setMode] = useState('range'), [range, setRange] = useState([null,null]), [dates, setDates] = useState([]);
  const change = patch => setSelection(old => ({...old, ...patch}));
  const count = selectedDates(data, selection).length;
  const [pickerMonth,setPickerMonth]=useState(()=>periodAnchorMonth(data,selection)+'-01');
  function open() {
    setPickerMonth(periodAnchorMonth(data,selection)+'-01');
    setMode(selection.mode === 'multiple' ? 'multiple' : 'range');
    setRange(selection.mode === 'range' ? selection.range : [null,null]);
    setDates(selection.mode === 'multiple' ? selection.dates : []);
    setOpened(value => !value);
  }
  function apply() { change(mode === 'multiple' ? {mode,dates:[...dates].sort()} : {mode,range:[range[0],range[1]||range[0]]}); setOpened(false); }
  return <section className="date-filter" aria-label="분석 날짜 선택">
    <div className="period-title"><CalendarDays size={20}/><div><span>분석 기간</span><strong aria-live="polite">{selectionLabel(selection)}</strong></div></div>
    <div className="period-actions">
      <Select label="월" value={selection.mode==='month'?selection.month:'custom'} onChange={month=>{if(month!=='custom')change({mode:'month',month});}} options={[...(selection.mode==='month'?[]:[{value:'custom',label:'날짜 직접 선택'}]),...new Set(data.monthly.map(row=>row.month))]}/>
      <Popover opened={opened} onChange={setOpened} withinPortal={false} position="bottom-end" width={326} hideDetached={false} middlewares={{flip:true,shift:true}} shadow="md" trapFocus returnFocus>
        <Popover.Target><Button className={opened?'active':''} onClick={open} aria-expanded={opened}><CalendarDays size={16}/> 날짜 선택 <ChevronDown size={14}/></Button></Popover.Target>
        <Popover.Dropdown className="period-popover">
          <div className="period-picker-head"><strong>날짜를 골라 분석하기</strong><Button aria-label="날짜 선택 닫기" onClick={()=>setOpened(false)}><X size={15}/></Button></div>
          <SegmentedControl fullWidth aria-label="날짜 선택 방식" value={mode} onChange={setMode} data={[{label:'연속 기간',value:'range'},{label:'여러 날짜',value:'multiple'}]}/>
          <p className="footnote">{mode==='range'?'시작일과 종료일을 누르세요. 하루만 선택해도 됩니다.':'떨어진 날짜도 하나씩 누르세요. 다시 누르면 해제됩니다.'}</p>
          <DatePicker key={mode} type={mode} value={mode==='range'?range:dates} onChange={mode==='range'?setRange:setDates} allowSingleDateInRange date={pickerMonth} onDateChange={setPickerMonth} minDate={data.start} maxDate={data.end} numberOfColumns={1} hideOutsideDates highlightToday={false} monthLabelFormat="YYYY년 M월" nextLabel="선택 달력 다음 달" previousLabel="선택 달력 이전 달" getDayProps={date=>({'aria-label':`분석일 ${date}`,disabled:!!data.scopeDates&&!data.scopeDates.has(date)})}/>
          <div className="period-picker-footer"><span>{mode==='multiple'?`${dates.length}일 선택`:range[0]?`${range[0]}${range[1]?' – '+range[1]:''}`:'선택 전'}</span><Button className="primary" disabled={mode==='multiple'?!dates.length:!range[0]} onClick={apply}>선택 적용</Button></div>
        </Popover.Dropdown>
      </Popover>
      <Button className="period-preset" disabled={!data.complete_through} onClick={()=>change({mode:'range',range:[shiftDate(data.complete_through,-6),data.complete_through]})}>최근 7일</Button>
      <Button className="period-preset" onClick={()=>change({mode:'all'})}>전체 기간</Button>
    </div>
    <div className="period-footer"><Button className="period-month-reset" onClick={()=>setSelection(initialSelection(data))}>최신 월 전체</Button><span>{count}일 {data.scopeDates?'출처 기록 · 현재 내역에 적용':'선택 · 화면 이동 시 유지'}</span><CheckField label="부분일 포함" checked={selection.includePartial} onChange={event=>change({includePartial:event.target.checked})}/></div>
  </section>;
}
