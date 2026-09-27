import React from 'react';
import {Drawer} from '@mantine/core';
import {dayMenuDetails,total} from './analysis.mjs';
import {money,num,Table,numeric,textCol,Note,Pill} from './report-ui.jsx';
export function DayDetail({data,date,onClose}){
  const detail=date?dayMenuDetails(data,date):{day:null,rows:[]};
  return <Drawer opened={!!date} onClose={onClose} title={date?`${date} 판매 상세`:'일별 판매 상세'} size={680} position="right" closeButtonProps={{'aria-label':'판매 상세 닫기'}} withinPortal={false} trapFocus returnFocus classNames={{content:'sales-drawer',header:'sales-drawer-header',body:'sales-drawer-body'}}>
    {detail.day&&<><div className="day-detail-summary"><div><span>이 날의 실매출</span><strong>{money(detail.day.amount)}</strong></div><div><span>결제 순건수</span><strong>{num(detail.day.payment_count)}건</strong></div><Pill>{detail.day.partial_day?'부분일':'완결일'}</Pill></div><p className="editor-intro">판매 메뉴와 수량을 확인하세요. 선택한 분석 기간은 유지됩니다.</p></>}
    {detail.reason?<Note>{detail.reason}</Note>:<><Table search={false} pageSize={12} data={detail.rows} columns={[textCol('menu','판매 메뉴'),numeric('quantity','판매 수량'),textCol('unit','단위'),numeric('amount','메뉴 금액',money)]}/><div className="day-menu-total"><span>메뉴 금액 합계</span><strong>{money(total(detail.rows,'amount'))}</strong></div><p className="footnote">토스 메뉴 상세 기준 · 취소/환불과 주문/결제 시각의 집계 기준으로 위 실매출과 차이가 있을 수 있습니다. 사용자가 저장한 메뉴 이름·수량 규칙을 적용하며, 개와 팩은 같은 수량으로 더하지 않습니다.</p></>}
  </Drawer>;
}
