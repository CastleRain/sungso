export const WEEKDAYS=['월','화','수','목','금','토','일'];
export const WINDOWS=[{label:'00–08시',start:0,end:8},{label:'08–10시',start:8,end:10},{label:'10–12시',start:10,end:12},{label:'12–14시',start:12,end:14},{label:'14–16시',start:14,end:16},{label:'16–18시',start:16,end:18},{label:'18–24시',start:18,end:24}];
export function distribute(values,total){
  const sum=values.reduce((a,b)=>a+Math.max(0,b),0);
  if(!sum||total<=0)return values.map(()=>0);
  const raw=values.map(v=>Math.max(0,v)/sum*total), result=raw.map(Math.floor);
  const rank=raw.map((v,i)=>({i,f:v-result[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);
  const remainder=total-result.reduce((a,b)=>a+b,0);
  for(let j=0;j<remainder;j++)result[rank[j].i]++;
  return result;
}
export function planRow(p,buffer=0,manual=null){
  const target=manual===null?Math.max(0,Math.round(p.expected*(1+buffer/100))):Math.max(0,Math.round(manual));
  const expected=WINDOWS.map(w=>p.hours.slice(w.start,w.end).reduce((a,b)=>a+b,0));
  const units=distribute(expected,target);
  return {...p,target,windows:units,expected_windows:expected,physical:target*(p.unit.includes('4개')?4:1)};
}
export function deadline(hour,minutes){
  const t=hour*60-minutes;
  if(t<0)return '전날 '+String(Math.floor((t+1440)/60)).padStart(2,'0')+':'+String((t+1440)%60).padStart(2,'0');
  return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
}
