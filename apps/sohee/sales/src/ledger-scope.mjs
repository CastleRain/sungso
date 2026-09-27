import {selectedDates} from './analysis.mjs';

// This is an in-memory view of the authenticated snapshot, never a new dataset.
export function ledgerSourceData(data, source='all') {
  if(source==='all')return data;
  const daily=data.daily.filter(row=>row.source===source).sort((a,b)=>a.date.localeCompare(b.date));
  if(!daily.length)return null;
  const scopeDates=new Set(daily.map(row=>row.date));
  return {...data,daily,scopeDates,start:daily[0].date,end:daily.at(-1).date,
    complete_through:daily.filter(row=>!row.partial_day).at(-1)?.date||null,
    partial_dates:daily.filter(row=>row.partial_day).map(row=>row.date),
    monthly:data.monthly.filter(row=>row.source===source),
    menu_monthly:data.menu_monthly.filter(row=>row.source===source),
    menu_toss:source==='toss'?data.menu_toss.filter(row=>scopeDates.has(row.date)):[]};
}
export function periodAnchorMonth(data, selection) {
  return (selectedDates(data,selection).at(-1)||data.end).slice(0,7);
}
export function ledgerPeriodKey(selection,source,mode) {
  return JSON.stringify([source,mode,selection.mode,selection.month,selection.range,selection.dates,selection.includePartial]);
}
export function menuDetailAvailability(day,detailDates) {
  if(day.source!=='toss')return {kind:'archive',label:'월별만',hint:'페이히어 · 일별 매출만 보관, 메뉴는 월별 집계만 조회 가능'};
  if(day.partial_day)return {kind:'partial',label:'부분일',hint:'토스 · 부분일 메뉴 상세는 완결 원본 갱신 후 조회 가능'};
  if(!detailDates.has(day.date))return {kind:'missing',label:'상세 없음',hint:'토스 · 저장된 일별 메뉴 상세 없음. 판매 0개를 의미하지 않음'};
  return {kind:'available',label:'메뉴 보기',hint:'토스 · 이 날짜의 판매 메뉴·수량·금액 조회 가능'};
}
