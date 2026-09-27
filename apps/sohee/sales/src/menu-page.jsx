import React,{useEffect,useState} from 'react';
import {Drawer} from '@mantine/core';
import {ArrowUpRight,ChartNoAxesCombined,Pencil} from 'lucide-react';
import {Button,Select,CheckField} from './ui.jsx';
import {num,money,pct,monthShort,sum,Note,Section,Header,Table,numeric,textCol} from './report-ui.jsx';
import {MenuRuleEditor} from './menu-editor.jsx';
import {MenuTrend,HourBars,MenuWeekdayChart} from './charts.jsx';
import {menuUnit} from '../../../../services/sohee/menu-rules.mjs';
import {DateFilter,usePeriod} from './date-filter.jsx';
import {selectedMenuData} from './analysis.mjs';
import {menuStrategies} from './owner-insights.mjs';

export function MenuSales({data:D}){
  const {selection}=usePeriod(),selectedData=selectedMenuData(D,selection);
  const [group,setGroup]=useState(true),[selected,setSelected]=useState(''),[metric,setMetric]=useState('amount');
  const [editorOpen,setEditorOpen]=useState(false),[detailOpen,setDetailOpen]=useState(false);
  const key=group?'menu_group':'menu_original',strategy=menuStrategies(D,selection,key),grouped=strategy.rows,menuAmount=sum(grouped,'amount');
  const rows=grouped.map(row=>({...row,share:menuAmount>0?row.amount/menuAmount*100:null})).sort((a,b)=>b[metric]-a[metric]);
  const names=rows.map(row=>({value:row.menu_key,label:row.menu})),selectedRow=rows.find(row=>row.menu_key===selected);
  useEffect(()=>{if(!rows.some(row=>row.menu_key===selected))setSelected(rows[0]?.menu_key||'')},[key,selection,D]);
  const monthly=[...new Set(D.monthly.map(row=>row.month))].map(month=>{const r=D.menu_monthly.filter(row=>row.month===month&&row[key]===selectedRow?.menu_name&&menuUnit(row)===selectedRow?.unit);return {month,label:monthShort(month),amount:sum(r,'amount'),quantity:sum(r,'quantity')}});
  const detail=selectedData.detail.filter(row=>row[key]===selectedRow?.menu_name&&menuUnit(row)===selectedRow?.unit);
  const hours=Array.from({length:24},(_,hour)=>({hour:hour+'시',quantity:sum(detail.filter(row=>row.hour===hour),'quantity')}));
  const dates=[...new Set(detail.map(row=>row.date))].sort().map(date=>({date,quantity:sum(detail.filter(row=>row.date===date),'quantity'),amount:sum(detail.filter(row=>row.date===date),'amount')}));
  function openDetail(menu){setSelected(menu);setDetailOpen(true)}

  return <>
    <Header label="02 / MENU EXPLORER" title="메뉴 전략" description="어떤 메뉴를 꾸준히 준비할지, 판매 빈도와 하루 수량으로 판단하세요." action={<Button onClick={()=>setEditorOpen(true)}><Pencil size={16}/> 메뉴 이름·수량 수정</Button>}/>
    <MenuRuleEditor opened={editorOpen} onClose={()=>setEditorOpen(false)}/>
    <DateFilter data={D}/>
    <div className="menu-compact-board">
      <div className="menu-context">
        <span>매출 내역은 <b>날짜별 정산</b>, 여기는 <b>메뉴별 준비·구성 판단</b> · {num(rows.length)}개 메뉴</span>
        <div className="menu-context-actions"><CheckField label="아메리카노 명칭 통합" checked={group} onChange={event=>setGroup(event.target.checked)}/><Button className="menu-detail-trigger" disabled={!selectedRow} onClick={()=>setDetailOpen(true)}><ChartNoAxesCombined size={15}/> 선택 메뉴 분석</Button></div>
      </div>
      <div className="ledger-workbench menu-workbench">
        <Section className="menu-ledger-panel" title="메뉴별 실적과 판매 빈도" desc="금액·수량은 선택 기간, 빈도는 토스 상세가 있는 완결 기록일입니다." action={<div className="segmented"><Button aria-pressed={metric==='amount'} className={metric==='amount'?'active':''} onClick={()=>setMetric('amount')}>매출순</Button><Button aria-pressed={metric==='quantity'} className={metric==='quantity'?'active':''} onClick={()=>setMetric('quantity')}>수량순</Button></div>}>
          <Table data={rows} pageSize={7} columns={[
            {accessorKey:'menu',header:'메뉴',cell:item=><Button className="menu-link" aria-pressed={selected===item.row.original.menu_key} aria-haspopup="dialog" onClick={()=>openDetail(item.row.original.menu_key)}>{item.getValue()}</Button>},
            numeric('quantity','판매 수량'),textCol('unit','단위'),numeric('amount','매출',money),numeric('share','메뉴 금액 비중',value=>value==null?'—':num(value,1)+'%'),numeric('frequency','판매 빈도',value=>value==null?'상세 없음':num(value,0)+'%')
          ]} selectedRow={row=>row.menu_key===selected} filename="선택기간_메뉴.csv"/>
        </Section>
        <Section className="menu-strategy-panel" eyebrow="MENU DECISIONS" title="이 메뉴, 얼마나 꾸준히 팔리나" desc={`토스 완결 기록 ${strategy.detailDays}일 기준 · 월별 금액 순위와 구분`}>
          {selectedRow?<>
            <Select label="판단할 메뉴" value={selected} onChange={setSelected} options={names}/>
            <div className="menu-strategy-metrics"><div><span>순판매가 있는 날</span><strong>{selectedRow.detailDays?`${selectedRow.sellingDays} / ${selectedRow.detailDays}`:'—'}<small>일</small></strong><small>{selectedRow.frequency==null?'일별 상세 없음':`판매 빈도 ${num(selectedRow.frequency)}%`}</small></div><div><span>기록일당 순수량</span><strong>{selectedRow.dailyQuantity==null?'—':num(selectedRow.dailyQuantity,1)}<small>{selectedRow.unit}</small></strong><small>메뉴 판매 0인 기록일 포함</small></div><div><span>{selectedRow.comparison?`${selectedRow.comparison.offsetDays/7}주 전 동요일 대비`:'이전 기간 수량 변화'}</span><strong>{selectedRow.quantityChange==null?'—':pct(selectedRow.quantityChange)}</strong><small>{selectedRow.comparison?selectedRow.comparison.previousAverage<=0?'이전 순수량이 0 이하 · 증감률 미표시':`기록일당 수량 · 현재 ${selectedRow.comparison.currentDays}일 / 이전 ${selectedRow.comparison.previousDays}일`:'동일 토스 완결일 표본 부족'}</small></div><div><span>하루 판매 중간값</span><strong>{selectedRow.medianQuantity==null?'—':num(selectedRow.medianQuantity,1)}<small>{selectedRow.unit}</small></strong><small>준비 권장량과 다릅니다.</small></div></div>
            <div className="strategy-weekday-head"><strong>요일별 기록일당 수량</strong><span>{selectedRow.unit} · 메뉴 판매 0 포함</span></div>
            {selectedRow.detailDays?<MenuWeekdayChart rows={selectedRow.weekday} unit={selectedRow.unit}/>:<p className="strategy-empty">페이히어는 월별 메뉴 자료만 있어 판매 빈도나 요일별 수량을 만들지 않습니다.</p>}
            <p className="strategy-reading">{selectedRow.detailDays<5?'판단할 완결 기록이 부족합니다. 월별 이력을 확인하고 기록을 더 모아주세요.':selectedRow.frequency<35?'순판매가 기록된 날이 드뭅니다. 상시 판매 메뉴인지, 이벤트·품절이 있었는지 확인한 뒤 준비량을 정하세요.':'반복 판매 정도와 요일별 수량을 함께 보세요. 실제 판매 가능 기간·품절 여부가 없어 수요를 확정하지 않습니다.'}</p>
            <div className="strategy-actions"><Button onClick={()=>setDetailOpen(true)}>월별·시간대 상세 <ArrowUpRight size={13}/></Button><a href="/sungso/sohee/sales/prep/">디저트 준비량 조절 <ArrowUpRight size={14}/></a></div>
          </>:<p className="empty">선택한 기간에 메뉴 기록이 없습니다.</p>}
        </Section>
      </div>
      <div className="menu-source-note"><Note>{selectedData.dailyOnly?`일별 선택은 토스 완결일 메뉴 상세만 사용합니다. 페이히어 ${selectedData.omittedPayhereDays}일·부분일 ${selectedData.omittedPartialDays}일은 메뉴 집계에서 제외합니다.`:'월 단위 메뉴는 두 출처의 검증된 월별 집계를 사용합니다. 마지막 월은 부분일이 포함될 수 있습니다.'} 판매 빈도·하루 수량은 토스 상세가 있는 완결 결제 기록일만 계산하며 메뉴 판매 가능일·품절률을 뜻하지 않습니다. 단위는 저장한 메뉴 설정을 우선하며 미수정 4구 상품은 팩 단위입니다.</Note></div>
    </div>
    <Drawer opened={detailOpen} onClose={()=>setDetailOpen(false)} title="메뉴 전략 상세" size={920} position="right" closeButtonProps={{'aria-label':'메뉴 상세 닫기'}} withinPortal={false} trapFocus returnFocus classNames={{content:'sales-drawer menu-analysis-drawer',header:'sales-drawer-header',body:'sales-drawer-body'}}>
      {selectedRow?<>
        <div className="menu-analysis-choice"><Select label="메뉴 선택" value={selected} onChange={setSelected} options={names}/><p>선택한 분석 기간은 유지됩니다.</p></div>
        <div className="menu-analysis-summary" aria-label="선택 기간 메뉴 요약"><div><span>메뉴 매출</span><strong>{money(selectedRow.amount)}</strong></div><div><span>판매 수량</span><strong>{num(selectedRow.quantity)}<small>{selectedRow.unit}</small></strong></div><div><span>메뉴 금액 비중</span><strong>{selectedRow.share==null?'—':num(selectedRow.share,1)+'%'}</strong></div></div>
        <Section title={selectedRow.menu+' · 월별 변화'} desc="전체 월별 이력입니다. 위 날짜 선택과 별도로 장기 흐름을 확인합니다."><MenuTrend rows={monthly} unit={selectedRow.unit||'개'}/></Section>
        {!detail.length?<Note>선택한 날짜의 이 메뉴에는 토스 완결일 상세 기록이 없습니다. 페이히어의 메뉴 거래 시각은 추정하지 않습니다.</Note>:<div className="two-col menu-analysis-daily"><Section title="선택일 메뉴 판매 시간" desc="토스 주문 시작 시각 · 대량 주문 포함 · 부분일 제외"><HourBars rows={hours} unit={selectedRow.unit||'개'}/></Section><Section title="선택일 메뉴 판매 내역" desc="날짜별 정확한 수량과 금액"><Table data={dates} search={false} pageSize={7} columns={[textCol('date','날짜'),numeric('quantity','수량'),numeric('amount','매출',money)]}/></Section></div>}
      </>:<Note>선택한 기간에 표시할 메뉴 기록이 없습니다.</Note>}
    </Drawer>
  </>;
}
