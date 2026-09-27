import React from 'react';
import {ResponsiveContainer,BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,ReferenceLine,Cell} from 'recharts';
import {ChartTip,chartAxis} from './charts.jsx';
import {num} from './report-ui.jsx';
export function DemandHistory({plan,target}){
  const rows=(plan.distribution||[]);
  if(!rows.length)return <p className="footnote">비교할 판매 기록이 없습니다.</p>;
  return <div className="prep-history-chart" role="region" aria-label={plan.menu+' 과거 판매와 준비량 비교'}><ResponsiveContainer><BarChart data={rows} margin={{top:14,left:-20,right:8,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} stroke="var(--ss-border)" strokeDasharray="3 5"/><XAxis {...chartAxis} dataKey="date" tickFormatter={s=>s.slice(5)} minTickGap={20}/><YAxis {...chartAxis} width={45} allowDecimals={false}/><Tooltip content={<ChartTip formatter={value=>[num(value,1)+plan.unit,'실제 판매']}/>}/><Bar dataKey="quantity" name="실제 판매" radius={[3,3,0,0]} maxBarSize={18} isAnimationActive={false}>{rows.map(r=><Cell key={r.date} fill={r.quantity>target?'var(--sales-caution)':'var(--ss-accent)'}/>)}</Bar>{target!=null&&<ReferenceLine y={target} ifOverflow="extendDomain" stroke="var(--ss-link)" strokeWidth={2} strokeDasharray="4 4"/>}</BarChart></ResponsiveContainer></div>;
}
