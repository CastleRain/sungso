import React,{useState} from 'react';
import {Button,SearchField} from './ui.jsx';
import {useReactTable,getCoreRowModel,getSortedRowModel,getFilteredRowModel,getPaginationRowModel,flexRender} from '@tanstack/react-table';
import {ChartNoAxesCombined,ChevronLeft,ChevronRight,Download,Info} from 'lucide-react';
const num=(v,d=0)=>Number(v||0).toLocaleString('ko-KR',{maximumFractionDigits:d,minimumFractionDigits:d});
const money=v=>num(v)+'원';
const pct=v=>(v>0?'+':'')+num(v,1)+'%';
const sourceName=s=>s==='toss'?'Toss POS':'Payhere';
const colors=['var(--ss-link)','var(--ss-accent)','var(--ss-muted)','var(--ss-text)','var(--ss-border-strong)'];
const monthShort=m=>m.slice(2,4)+'.'+m.slice(5);
const sum=(a,k)=>a.reduce((s,r)=>s+Number(r[k]||0),0);
const tipStyle={border:'1px solid var(--ss-border)',borderRadius:6,fontSize:13,boxShadow:'0 8px 24px var(--ss-shadow)'};


function download(filename,content,type='text/csv;charset=utf-8'){
  const blob=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function csv(rows){if(!rows.length)return '';const keys=Object.keys(rows[0]);const quote=v=>{let s=String(v??'');if(typeof v==='string'&&/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};return '\ufeff'+[keys,...rows.map(r=>keys.map(k=>r[k]))].map(row=>row.map(quote).join(',')).join('\r\n')}
function Pill({children,kind=''}){return <span className={'pill '+kind}>{children}</span>}
function Note({children}){return <div className="note"><Info size={16}/><div>{children}</div></div>}
function Section({eyebrow,title,desc,action,children,className=''}){return <section className={'panel '+className}><div className="section-head"><div>{eyebrow&&<div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2>{desc&&<p>{desc}</p>}</div>{action}</div>{children}</section>}
function Header({label,title,description,action}){return <header className="page-head"><div><div className="eyebrow page-label">{label}</div><h1>{title}</h1><p>{description}</p></div>{action}</header>}
function Stat({label,value,unit,detail,icon:Icon=ChartNoAxesCombined,accent=false}){return <div className={'stat '+(accent?'accent':'')}><div className="stat-label">{label}<Icon size={18}/></div><div className="stat-value">{value}<span>{unit}</span></div><p>{detail}</p></div>}

function Table({data,columns,search=true,filename='분석.csv',pageSize=10,initialSort=[],searchPlaceholder='메뉴·날짜 검색',selectedRow}){
  const [sorting,setSorting]=useState(initialSort),[filter,setFilter]=useState('');
  const table=useReactTable({data,columns,state:{sorting,globalFilter:filter},onSortingChange:setSorting,onGlobalFilterChange:setFilter,getCoreRowModel:getCoreRowModel(),getFilteredRowModel:getFilteredRowModel(),getSortedRowModel:getSortedRowModel(),getPaginationRowModel:getPaginationRowModel(),initialState:{pagination:{pageSize}}});
  return <div className="data-table">{search&&<div className="table-tools"><SearchField placeholder={searchPlaceholder} value={filter} onChange={e=>setFilter(e.target.value)}/><Button className="text-button" onClick={()=>download(filename,csv(table.getFilteredRowModel().rows.map(x=>x.original)))}><Download size={16}/> CSV</Button></div>}<p className="table-hint">표가 잘리면 좌우로 밀어 나머지 열을 확인하세요.</p><div className="table-scroll" tabIndex="0" role="region" aria-label="표 가로 스크롤"><table><thead>{table.getHeaderGroups().map(h=><tr key={h.id}>{h.headers.map(c=><th key={c.id} className={c.column.columnDef.meta?.numeric?'numeric-cell':undefined} aria-sort={c.column.getIsSorted()==='desc'?'descending':c.column.getIsSorted()==='asc'?'ascending':'none'}><Button onClick={c.column.getToggleSortingHandler()}>{flexRender(c.column.columnDef.header,c.getContext())}<span className="sortmark">{c.column.getIsSorted()==='desc'?' ↓':c.column.getIsSorted()==='asc'?' ↑':' ↕'}</span></Button></th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map(r=><tr key={r.id} className={selectedRow?.(r.original)?'selected-row':undefined}>{r.getVisibleCells().map(c=><td key={c.id} className={c.column.columnDef.meta?.numeric?'numeric-cell':undefined}>{flexRender(c.column.columnDef.cell,c.getContext())}</td>)}</tr>)}</tbody></table>{!table.getRowModel().rows.length&&<div className="empty">해당 조건에 맞는 기록이 없습니다.</div>}</div><div className="pagination"><span>{num(table.getFilteredRowModel().rows.length)}개 기록</span><div><Button aria-label="이전 표 페이지" disabled={!table.getCanPreviousPage()} onClick={()=>table.previousPage()}><ChevronLeft size={17}/></Button><span>{table.getState().pagination.pageIndex+1} / {Math.max(1,table.getPageCount())}</span><Button aria-label="다음 표 페이지" disabled={!table.getCanNextPage()} onClick={()=>table.nextPage()}><ChevronRight size={17}/></Button></div></div></div>
}
const numeric=(id,title,format=num)=>({accessorKey:id,header:title,meta:{numeric:true},cell:i=><span className="number">{format(i.getValue())}</span>});
const textCol=(id,title)=>({accessorKey:id,header:title});


export {num,money,pct,sourceName,colors,monthShort,sum,tipStyle,download,csv,Pill,Note,Section,Header,Stat,Table,numeric,textCol};
