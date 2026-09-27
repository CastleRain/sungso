import {shiftDate} from './analysis.mjs';
import {distribute} from './planning.mjs';

export const PREP_PHASES=[{key:'opening',label:'오전 판매분',short:'오전',start:0,end:12},{key:'midday',label:'점심·오후분',short:'12–16시',start:12,end:16},{key:'late',label:'늦은 오후분',short:'16시 이후',start:16,end:24}];
export const prepWeekday=date=>(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
export const koreaToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function defaultPrepDate(model,today=koreaToday()){
  const start=!model.cutoff||today>model.cutoff?today:shiftDate(model.cutoff,1);
  for(const status of ['준비 기준','참고용'])for(let n=0;n<7;n++){const date=shiftDate(start,n);if(model.plans.some(p=>p.weekday===prepWeekday(date)&&p.status===status))return date;}
  return start;
}
export function prepDateForWeekday(date,weekday){return shiftDate(date,(weekday-prepWeekday(date)+7)%7);}
export function makePrepRow(plan,policy,manual=null,reserved=0){
  const suggested=plan[policy];
  const target=manual==null?(Number.isFinite(suggested)?Math.max(0,Math.round(suggested)):null):Math.max(0,Math.round(manual));
  const reservation=Math.max(0,Math.round(Number(reserved)||0));
  const phases=target!=null&&plan.hours_available&&plan.hours.some(h=>h>0)?distribute(PREP_PHASES.map(p=>plan.hours.slice(p.start,p.end).reduce((a,b)=>a+b,0)),target):null;
  const total=target==null?null:target+reservation;
  return {...plan,suggested,target,reservation,total,phases,physical:total===0?0:total==null||plan.physical_factor==null?null:total*plan.physical_factor};
}
export function prepTotals(rows){
  const units=new Map();for(const r of rows)if(r.total!=null)units.set(r.unit,(units.get(r.unit)||0)+r.total);
  return {physical:rows.some(r=>r.physical==null)?null:rows.reduce((n,r)=>n+r.physical,0),units:[...units].map(([unit,quantity])=>({unit,quantity})),unallocated:rows.filter(r=>r.total>0&&!r.phases).length,reservations:rows.filter(r=>r.reservation>0).length};
}
