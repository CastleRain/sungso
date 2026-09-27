import React,{useContext,useState} from 'react';
import {Popover} from '@mantine/core';
import {CalendarCheck2,RefreshCw,Info} from 'lucide-react';
import {Button} from './ui.jsx';
import {UpdateContext} from './update-panel.jsx';

export function DataStatus({data}) {
  const context=useContext(UpdateContext),[opened,setOpened]=useState(false),[busy,setBusy]=useState(false);
  if(!data)return null;
  async function reload(){setBusy(true);try{await context.reload();}finally{setBusy(false);}}
  return <div className="data-status">
    <CalendarCheck2 size={15}/><span>자료 {data.end}까지 <span className="data-status-separator">·</span> 완결일 {data.complete_through}</span>
    <Popover opened={opened} onChange={setOpened} position="top-end" width={310} withinPortal={false} hideDetached={false} trapFocus returnFocus>
      <Popover.Target><Button className="text-button" aria-label="자료 기준 보기" aria-expanded={opened} onClick={()=>setOpened(v=>!v)}><Info size={15}/><span>자료 기준</span></Button></Popover.Target>
      <Popover.Dropdown className="data-status-popover"><strong>이 화면의 자료 범위</strong><dl><div><dt>수집 기간</dt><dd>{data.start} – {data.end}</dd></div><div><dt>부분일</dt><dd>{data.partial_dates.join(', ')||'없음'}</dd></div></dl><p>새 토스 자료는 요청할 때 로컬 PC에서 수집합니다. 페이히어는 과거 기록으로 유지합니다.</p><Button disabled={!context||busy} onClick={reload}><RefreshCw size={14}/>{busy?'불러오는 중…':'저장된 분석 다시 불러오기'}</Button><small>이미 저장된 자료를 확인합니다. 새 수집은 시작하지 않습니다.</small></Popover.Dropdown>
    </Popover>
  </div>;
}
