import {analyzeSelection,groupMenus,selectedMenuData,shiftDate,total} from './analysis.mjs';
import {menuKey,menuUnit} from '../../../../services/sohee/menu-rules.mjs';

const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
export const percentile = (values,p) => {
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),at=(sorted.length-1)*p,lower=Math.floor(at);
  return sorted[lower]+(sorted[Math.ceil(at)]-sorted[lower])*(at-lower);
};
export function salesDateLabel(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return date||'';
  const day=new Date(date+'T00:00:00Z');
  return `${date} (${['일','월','화','수','목','금','토'][day.getUTCDay()]})`;
}
const change=(now,before)=>before>0?(now/before-1)*100:null;
const summary=rows=>{const amount=total(rows,'amount'),payments=total(rows,'payment_count');return {amount,payments,perPayment:payments>0?amount/payments:null,recordDays:rows.filter(row=>row.record_day).length};};

// Pair every completed selected date with the same weekday in a non-overlapping
// earlier window. Do not quietly drop unmatched days or compare POS sources.
export function weekdayComparison(data,selection){
  const A=analyzeSelection(data,selection),current=A.complete;
  if(A.missingDays||current.length<7)return {available:false,reason:'미수집 없이 완결일 7일 이상을 선택하면 비교합니다.'};
  const span=Math.round((Date.parse(current.at(-1).date)-Date.parse(current[0].date))/86400000)+1;
  const offsetDays=Math.max(28,Math.ceil(span/7)*7),byDate=new Map(data.daily.map(row=>[row.date,row]));
  const previous=current.map(row=>byDate.get(shiftDate(row.date,-offsetDays)));
  if(previous.some((row,i)=>!row||row.partial_day||row.source!==current[i].source))return {available:false,reason:'대응하는 이전 완결일 또는 동일 POS 자료가 부족합니다.',offsetDays};
  const now=summary(current),before=summary(previous);
  if(now.recordDays<5||before.recordDays<5)return {available:false,reason:'두 기간에 결제 기록일이 각각 5일 이상 필요합니다.',offsetDays};
  return {available:true,offsetDays,current,previous,now,before,
    amountChange:change(now.amount,before.amount),paymentsChange:change(now.payments,before.payments),
    perPaymentChange:now.perPayment!=null&&before.perPayment!=null?change(now.perPayment,before.perPayment):null};
}

export function ownerInsights(data,selection){
  const A=analyzeSelection(data,selection),recorded=A.complete.filter(row=>row.record_day),amounts=recorded.map(row=>row.amount);
  const menus=groupMenus(selectedMenuData(data,selection).rows).sort((a,b)=>b.amount-a.amount),menuTotal=total(menus,'amount');
  const concentration=menuTotal>0&&menus.every(row=>row.amount>=0)?total(menus.slice(0,5),'amount')/menuTotal*100:null;
  return {comparison:weekdayComparison(data,selection),distribution:amounts.length>=5?{
    days:amounts.length,median:percentile(amounts,.5),lower:percentile(amounts,.25),upper:percentile(amounts,.75),average:mean(amounts),
  }:null,concentration,menuCount:menus.length};
}

export function menuStrategies(data,selection,key='menu_group'){
  const A=analyzeSelection(data,selection),M=selectedMenuData(data,selection),byDate=new Map(data.daily.map(row=>[row.date,row]));
  // Explicit zero/net-zero lines still establish observed detail. A date with
  // no detail at all does not: never fill a missing export with zero sales.
  const observedDates=new Set(data.menu_toss.map(row=>row.date));
  const eligible=A.complete.filter(row=>row.source==='toss'&&row.record_day&&observedDates.has(row.date));
  const eligibleDates=new Set(eligible.map(row=>row.date));
  const comparison=weekdayComparison(data,selection);
  const paired=comparison.available&&comparison.current.every(row=>row.source==='toss')&&[...comparison.current,...comparison.previous].every(row=>!row.record_day||observedDates.has(row.date));
  const previousDays=paired?comparison.previous.filter(row=>row.record_day):[];
  const previousDates=new Set(previousDays.map(row=>row.date));
  const allGroups=new Map();
  for(const row of data.menu_toss){
    const id=menuKey(row[key],menuUnit(row));
    if(!allGroups.has(id))allGroups.set(id,[]);
    allGroups.get(id).push(row);
  }
  const rows=groupMenus(M.rows,key).map(menu=>{
    const all=allGroups.get(menu.menu_key)||[],detail=all.filter(row=>eligibleDates.has(row.date));
    const dateQuantities=new Map();for(const row of detail)dateQuantities.set(row.date,(dateQuantities.get(row.date)||0)+row.quantity);
    const quantities=eligible.map(row=>dateQuantities.get(row.date)||0),quantity=total(detail,'quantity');
    const sellingDays=quantities.filter(q=>q>0).length;
    const weekday=Array.from({length:7},(_,day)=>{const dates=eligible.filter(row=>row.weekday===day);return {weekday:day,days:dates.length,average:dates.length?dates.reduce((sum,row)=>sum+(dateQuantities.get(row.date)||0),0)/dates.length:null};});
    const previousQuantity=total(all.filter(row=>previousDates.has(row.date)),'quantity'),previousAverage=previousDays.length?previousQuantity/previousDays.length:null;
    const average=eligible.length?quantity/eligible.length:null;
    return {...menu,detailDays:eligible.length,sellingDays,frequency:eligible.length?sellingDays/eligible.length*100:null,
      dailyQuantity:average,medianQuantity:percentile(quantities,.5),upperQuantity:percentile(quantities,.75),weekday,
      quantityChange:paired&&average!=null?change(average,previousAverage):null,
      comparison:paired?{offsetDays:comparison.offsetDays,currentDays:eligible.length,previousDays:previousDays.length,previousAverage}:null,
      hasObservedSales:all.some(row=>row.quantity>0&&byDate.get(row.date)?.source==='toss')};
  });
  return {rows,detailDays:eligible.length,unavailableDays:A.complete.filter(row=>row.record_day).length-eligible.length};
}
