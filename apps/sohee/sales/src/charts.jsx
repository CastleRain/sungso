import React from 'react';
import {Progress,UnstyledButton} from '@mantine/core';
import {ResponsiveContainer,ComposedChart,BarChart,Bar,Line,XAxis,YAxis,CartesianGrid,Tooltip,Cell,LabelList} from 'recharts';
import {num,money} from './report-ui.jsx';

export const chartAxis={axisLine:false,tickLine:false,tick:{fontSize:11,fill:'var(--ss-muted)'},minTickGap:24};
export const amountAxis={...chartAxis,width:48,tickFormatter:value=>Math.abs(value)>=10000?num(value/10000,1)+'만':num(value)};
export function ChartTip({active,payload,label,formatter}){
  if(!active||!payload?.length)return null;
  const entries=payload.filter(item=>item.value!=null);
  return <div className="sales-chart-tip"><strong>{entries[0]?.payload?.date||label}</strong>{entries.map((item,index)=>{const result=formatter?formatter(item.value,item.name,item):[num(item.value),item.name];return <div key={item.dataKey||index}><span><i style={{background:item.color||'var(--ss-link)'}}/>{Array.isArray(result)?result[1]:item.name}</span><b>{Array.isArray(result)?result[0]:result}</b></div>;})}</div>;
}
export function ChartLegend({items}){return <div className="sales-chart-legend">{items.map(item=><span key={item.label}><i className={item.line?'line':''} style={{background:item.color||'var(--ss-link)'}}/>{item.label}</span>)}</div>}
export function RankedMenuChart({rows,metric,selected,onSelect}){
  const top=rows.slice(0,10),maximum=Math.max(1,...top.map(row=>Math.abs(row[metric])));
  return <><ol className="menu-rankings" aria-label={metric==='amount'?'메뉴 매출 순위':'메뉴 수량 순위'}>{top.map((row,index)=><li key={row.menu_key}><UnstyledButton className="ranking-item" onClick={()=>onSelect(row.menu_key)} aria-label={row.menu+' 상세 보기'} aria-pressed={selected===row.menu_key}>
    <span className="ranking-number">{String(index+1).padStart(2,'0')}</span><div className="ranking-body"><div className="ranking-label"><strong>{row.menu}</strong><b>{metric==='amount'?money(row.amount):num(row.quantity)+row.unit}</b></div><Progress value={Math.abs(row[metric])/maximum*100} size={6} color={selected===row.menu_key?'var(--ss-link)':'var(--ss-accent)'} data-negative={row[metric]<0||undefined} aria-label={row.menu+' 상대 크기'}/><div className="ranking-caption"><span>{metric==='amount'?num(row.quantity)+row.unit:money(row.amount)}</span><span>{row.share==null?'금액 비중 —':`메뉴 금액의 ${num(row.share,1)}%`}</span></div></div>
  </UnstyledButton></li>)}</ol>{!top.length&&<p className="empty">표시할 메뉴 기록이 없습니다.</p>}<p className="ranking-help">메뉴를 누르면 아래 상세가 바뀝니다.{metric==='quantity'?' 개·팩 단위를 함께 확인하세요.':''}{top.some(r=>r[metric]<0)?' 음수는 취소·환불을 반영한 값입니다.':''}</p></>;
}
export function MenuTrend({rows,unit}){
  return <><ChartLegend items={[{label:'매출 · 왼쪽 축',color:'var(--ss-accent)'},{label:`수량 (${unit}) · 오른쪽 축`,color:'var(--ss-link)',line:true}]}/><div className="chart menu-trend-chart"><ResponsiveContainer><ComposedChart data={rows} margin={{top:20,right:0,left:0,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} stroke="var(--ss-border)" strokeDasharray="3 5"/><XAxis {...chartAxis} dataKey="label"/><YAxis {...amountAxis} yAxisId="amount"/><YAxis {...chartAxis} yAxisId="quantity" orientation="right" width={40}/><Tooltip cursor={{fill:'var(--ss-soft)'}} content={<ChartTip formatter={(value,name)=>[name==='매출'?money(value):num(value)+unit,name]}/>}/><Bar yAxisId="amount" name="매출" dataKey="amount" fill="var(--ss-accent)" radius={[5,5,0,0]} maxBarSize={46} isAnimationActive={false}/><Line yAxisId="quantity" name="판매 수량" dataKey="quantity" type="linear" stroke="var(--ss-link)" strokeWidth={2.5} dot={{r:4,fill:'var(--ss-surface)',strokeWidth:2}} activeDot={{r:6}} isAnimationActive={false}/></ComposedChart></ResponsiveContainer></div></>;
}
export function HourBars({rows,unit='개'}){
  const max=Math.max(0,...rows.map(r=>r.quantity));
  return <><ChartLegend items={[{label:`판매 수량 (${unit})`,color:'var(--ss-accent)'},{label:'가장 많은 시간',color:'var(--ss-link)'}]}/><div className="chart hour-bars"><ResponsiveContainer><BarChart data={rows} margin={{top:20,right:8,left:-10,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} stroke="var(--ss-border)" strokeDasharray="3 5"/><XAxis {...chartAxis} dataKey="hour" interval={3}/><YAxis {...chartAxis} width={42} allowDecimals={false}/><Tooltip cursor={{fill:'var(--ss-soft)'}} content={<ChartTip formatter={value=>[num(value)+unit,'판매 수량']}/>}/><Bar dataKey="quantity" radius={[4,4,0,0]} maxBarSize={20} isAnimationActive={false}>{rows.map(r=><Cell key={r.hour} fill={max>0&&r.quantity===max?'var(--ss-link)':'var(--ss-accent)'}/>)}</Bar></BarChart></ResponsiveContainer></div></>;
}
export function PrepFlow({rows}){
  const maximum=Math.max(0,...rows.map(r=>r.quantity));
  return <div className="chart prep-flow-chart"><ResponsiveContainer><BarChart data={rows} layout="vertical" margin={{top:0,right:48,left:0,bottom:0}} accessibilityLayer><XAxis type="number" hide/><YAxis {...chartAxis} type="category" dataKey="window" width={78} interval={0}/><Tooltip cursor={{fill:'var(--ss-soft)'}} content={<ChartTip formatter={value=>[num(value)+'개','추가 준비']}/>}/><Bar dataKey="quantity" radius={[0,5,5,0]} barSize={14} isAnimationActive={false}>{rows.map(r=><Cell key={r.window} fill={r.quantity===maximum?'var(--ss-link)':'var(--ss-accent)'}/>)}<LabelList dataKey="quantity" position="right" formatter={value=>num(value)+'개'} fill="var(--ss-text)" fontSize={12} offset={10}/></Bar></BarChart></ResponsiveContainer></div>;
}
