import React from 'react';
import {Drawer} from '@mantine/core';
import {money,pct,Note,Table,textCol} from './report-ui.jsx';
import {operatingSummary} from './operating-summary.mjs';
import {analyzeSelection} from './analysis.mjs';
export function RecordDetails({data,selection,opened,onClose}){
 const S=operatingSummary(data,selection),C=analyzeSelection(data,selection).comparison;
 const rows=S.rows.map(({observedHours,...row})=>({...row,observedHourLabel:observedHours?`${String(observedHours.firstHour).padStart(2,'0')}시대 – ${String(observedHours.lastHour).padStart(2,'0')}시대`:'자료 없음'}));
 const status=row=>row.status==='missing'?'미수집':row.partialDay?(row.included?'부분일 포함':'부분일 제외'):row.recordDay?'결제 기록일':'결제 기록일 아님';
 return <Drawer opened={opened} onClose={onClose} title="선택 기간의 기록일" size={760} position="right" withinPortal={false} trapFocus returnFocus closeButtonProps={{'aria-label':'기록일 상세 닫기'}} classNames={{content:'sales-drawer',header:'sales-drawer-header',body:'sales-drawer-body'}}>
  <div className="record-summary"><div><span>완결된 결제 기록일</span><strong>{S.completeRecordedDays}일</strong></div><div><span>일평균 매출</span><strong>{S.dailyAverage==null?'—':money(S.dailyAverage)}</strong></div></div>
  <p className="record-formula">{S.completeRecordedDays?`${money(S.completeRecordedAmount)} ÷ ${S.completeRecordedDays}일 · 해당 완결 기록일의 실매출 평균`:'완결된 결제 기록일이 없어 일평균을 계산하지 않습니다.'}</p>
  <Note>근무·출퇴근 기록은 없습니다. POS의 결제 기록일을 표시하며, 기록이 없다는 이유로 휴무로 보지 않습니다. 일평균에서는 부분일·미수집일·결제 기록일이 아닌 날짜를 제외합니다. 이 날짜들의 금액은 선택 기간 총매출에는 원래 기준대로 반영됩니다.</Note>
  <div className="record-coverage"><span>선택 {S.selectedDays}일</span><span>부분일 {S.partialDays}일{S.excludedPartialDays?' · 제외 중':''}</span><span>결제 기록일 아님 {S.zeroRecordDays}일</span><span>미수집 {S.missingDays}일</span></div>
  <Table data={rows} pageSize={10} searchPlaceholder="날짜 검색" filename="선택기간_기록일.csv" columns={[textCol('date','날짜'),{accessorKey:'status',header:'구분',cell:i=>status(i.row.original)},{accessorKey:'amount',header:'실매출',meta:{numeric:true},cell:i=>i.getValue()==null?'—':money(i.getValue())},textCol('observedHourLabel','토스 주문 시간대')]}/>
  <p className="footnote">시간대는 저장된 토스 완결일 메뉴 주문 기록의 첫·마지막 시간 구간입니다. 정확한 개점·폐점·근무 시각이나 근무 시간 합계가 아닙니다. 페이히어와 부분일의 시간대를 만들지 않습니다.</p>
  <section className="record-comparison"><h3>이전 기간과 비교</h3><p>{C.percent==null?'비교할 완결일 자료가 부족합니다.':`완결일 총매출 ${pct(C.percent)} · 선택 ${money(C.current.amount)} / 이전 ${money(C.previous.amount)}`}</p>{C.previousDates.length>0&&<p>{C.previousDates[0]} – {C.previousDates.at(-1)} · 부분일 제외 · 떨어진 날짜는 같은 간격 유지</p>}{C.sourceChanged&&<p>POS 출처가 달라 집계 기준의 영향도 함께 확인하세요.</p>}</section>
 </Drawer>;
}
