import React,{useEffect,useState} from 'react';
import {Drawer} from '@mantine/core';
import {ChartNoAxesCombined,Pencil} from 'lucide-react';
import {Button,Select,CheckField} from './ui.jsx';
import {num,money,monthShort,sum,Note,Section,Header,Table,numeric,textCol} from './report-ui.jsx';
import {MenuRuleEditor} from './menu-editor.jsx';
import {RankedMenuChart,MenuTrend,HourBars} from './charts.jsx';
import {menuUnit} from '../../../../services/sohee/menu-rules.mjs';
import {DateFilter,usePeriod} from './date-filter.jsx';
import {selectedMenuData,groupMenus} from './analysis.mjs';

export function MenuSales({data:D}){
  const {selection}=usePeriod(),selectedData=selectedMenuData(D,selection);
  const [group,setGroup]=useState(true),[selected,setSelected]=useState(''),[metric,setMetric]=useState('amount');
  const [editorOpen,setEditorOpen]=useState(false),[detailOpen,setDetailOpen]=useState(false);
  const key=group?'menu_group':'menu_original',grouped=groupMenus(selectedData.rows,key),menuAmount=sum(grouped,'amount');
  const rows=grouped.map(row=>({...row,share:menuAmount>0?row.amount/menuAmount*100:null})).sort((a,b)=>b[metric]-a[metric]);
  const names=rows.map(row=>({value:row.menu_key,label:row.menu})),selectedRow=rows.find(row=>row.menu_key===selected);
  useEffect(()=>{if(!rows.some(row=>row.menu_key===selected))setSelected(rows[0]?.menu_key||'')},[key,selection,D]);
  const monthly=[...new Set(D.monthly.map(row=>row.month))].map(month=>{const r=D.menu_monthly.filter(row=>row.month===month&&row[key]===selectedRow?.menu_name&&menuUnit(row)===selectedRow?.unit);return {month,label:monthShort(month),amount:sum(r,'amount'),quantity:sum(r,'quantity')}});
  const detail=selectedData.detail.filter(row=>row[key]===selectedRow?.menu_name&&menuUnit(row)===selectedRow?.unit);
  const hours=Array.from({length:24},(_,hour)=>({hour:hour+'시',quantity:sum(detail.filter(row=>row.hour===hour),'quantity')}));
  const dates=[...new Set(detail.map(row=>row.date))].sort().map(date=>({date,quantity:sum(detail.filter(row=>row.date===date),'quantity'),amount:sum(detail.filter(row=>row.date===date),'amount')}));
  function openDetail(menu){setSelected(menu);setDetailOpen(true)}

  return <>
    <Header label="02 / MENU EXPLORER" title="메뉴 판매" description="무엇이 잘 팔리는지, 메뉴별 수량과 금액의 변화를 확인하세요." action={<Button onClick={()=>setEditorOpen(true)}><Pencil size={16}/> 메뉴 이름·수량 수정</Button>}/>
    <MenuRuleEditor opened={editorOpen} onClose={()=>setEditorOpen(false)}/>
    <DateFilter data={D}/>
    <div className="menu-compact-board">
      <div className="menu-context">
        <span><b>{num(rows.length)}</b>개 메뉴 · 메뉴 집계 금액 <b>{money(menuAmount)}</b></span>
        <div className="menu-context-actions"><CheckField label="아메리카노 명칭 통합" checked={group} onChange={event=>setGroup(event.target.checked)}/><Button className="menu-detail-trigger" disabled={!selectedRow} onClick={()=>setDetailOpen(true)}><ChartNoAxesCombined size={15}/> 선택 메뉴 분석</Button></div>
      </div>
      <div className="ledger-workbench menu-workbench">
        <Section className="menu-ledger-panel" title="메뉴별 판매 내역" desc="메뉴를 누르면 월별·시간대별 상세를 엽니다.">
          <Table data={rows} pageSize={7} columns={[
            {accessorKey:'menu',header:'메뉴',cell:item=><Button className="menu-link" aria-pressed={selected===item.row.original.menu_key} aria-haspopup="dialog" onClick={()=>openDetail(item.row.original.menu_key)}>{item.getValue()}</Button>},
            numeric('quantity','판매 수량'),textCol('unit','단위'),numeric('amount','매출',money),numeric('share','메뉴 금액 비중',value=>value==null?'—':num(value,1)+'%'),numeric('average','수량당 매출',value=>value==null?'—':money(value))
          ]} selectedRow={row=>row.menu_key===selected} filename="선택기간_메뉴.csv"/>
        </Section>
        <Section className="menu-ranking-panel" eyebrow="BEST SELLERS" title="메뉴 순위 10" action={<div className="segmented"><Button aria-pressed={metric==='amount'} className={metric==='amount'?'active':''} onClick={()=>setMetric('amount')}>매출순</Button><Button aria-pressed={metric==='quantity'} className={metric==='quantity'?'active':''} onClick={()=>setMetric('quantity')}>수량순</Button></div>}>
          <RankedMenuChart rows={rows} metric={metric} selected={selected} onSelect={openDetail}/>
          <p className="menu-ranking-caption">메뉴를 누르면 상세 패널이 열립니다.{metric==='quantity'?' 개·팩 단위를 함께 확인하세요.':''}{rows.slice(0,10).some(row=>row[metric]<0)?' 음수는 취소·환불을 반영한 값입니다.':''}</p>
        </Section>
      </div>
      <div className="menu-source-note"><Note>{selectedData.dailyOnly?`일별 선택은 토스 완결일 메뉴 상세만 사용합니다. 페이히어 ${selectedData.omittedPayhereDays}일·부분일 ${selectedData.omittedPartialDays}일은 메뉴 집계에서 제외합니다.`:'월 단위 메뉴는 두 출처의 검증된 월별 집계를 사용합니다. 마지막 월은 부분일이 포함될 수 있습니다.'} 단위는 저장한 메뉴 설정을 우선합니다. 미수정 4구 상품은 팩 단위입니다.</Note></div>
    </div>
    <Drawer opened={detailOpen} onClose={()=>setDetailOpen(false)} title="메뉴 판매 상세" size={920} position="right" closeButtonProps={{'aria-label':'메뉴 상세 닫기'}} withinPortal={false} trapFocus returnFocus classNames={{content:'sales-drawer menu-analysis-drawer',header:'sales-drawer-header',body:'sales-drawer-body'}}>
      {selectedRow?<>
        <div className="menu-analysis-choice"><Select label="메뉴 선택" value={selected} onChange={setSelected} options={names}/><p>선택한 분석 기간은 유지됩니다.</p></div>
        <div className="menu-analysis-summary" aria-label="선택 기간 메뉴 요약"><div><span>메뉴 매출</span><strong>{money(selectedRow.amount)}</strong></div><div><span>판매 수량</span><strong>{num(selectedRow.quantity)}<small>{selectedRow.unit}</small></strong></div><div><span>메뉴 금액 비중</span><strong>{selectedRow.share==null?'—':num(selectedRow.share,1)+'%'}</strong></div></div>
        <Section title={selectedRow.menu+' · 월별 변화'} desc="전체 월별 이력입니다. 위 날짜 선택과 별도로 장기 흐름을 확인합니다."><MenuTrend rows={monthly} unit={selectedRow.unit||'개'}/></Section>
        {!detail.length?<Note>선택한 날짜의 이 메뉴에는 토스 완결일 상세 기록이 없습니다. 페이히어의 메뉴 거래 시각은 추정하지 않습니다.</Note>:<div className="two-col menu-analysis-daily"><Section title="선택일 메뉴 판매 시간" desc="토스 주문 시작 시각 · 대량 주문 포함 · 부분일 제외"><HourBars rows={hours} unit={selectedRow.unit||'개'}/></Section><Section title="선택일 메뉴 판매 내역" desc="날짜별 정확한 수량과 금액"><Table data={dates} search={false} pageSize={7} columns={[textCol('date','날짜'),numeric('quantity','수량'),numeric('amount','매출',money)]}/></Section></div>}
      </>:<Note>선택한 기간에 표시할 메뉴 기록이 없습니다.</Note>}
    </Drawer>
  </>;
}
