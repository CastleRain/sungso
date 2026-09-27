import React,{useContext,useState} from 'react';
import {Drawer} from '@mantine/core';
import {ArrowUpRight,CalendarDays,Download,Info,Printer,RotateCcw} from 'lucide-react';
import {Button,CheckField,QuantityField,BufferSlider} from './ui.jsx';
import {Header,Section,Note,Table,numeric,textCol,num,money,sum,download,csv} from './report-ui.jsx';
import {MenuRuleContext} from './menu-editor.jsx';
import {DateFilter,usePeriod} from './date-filter.jsx';
import {selectedMenuData,groupMenus} from './analysis.mjs';
import {WEEKDAYS,WINDOWS,planRow,deadline} from './planning.mjs';
import {PrepFlow} from './charts.jsx';

export function DessertPrep({data:mapped}){
  const menuRules=useContext(MenuRuleContext),D=menuRules?.rawData||mapped,F=D.forecast;
  const {selection}=usePeriod();
  const [wd,setWd]=useState((new Date().getDay()+6)%7),[buffer,setBuffer]=useState(0),[lead,setLead]=useState(60),[view,setView]=useState('plan'),[manual,setManual]=useState({}),[extra,setExtra]=useState([]),[reference,setReference]=useState(null);
  const actual=selectedMenuData(D,selection),dessertNames=new Set(F.plans.map(row=>row.menu));
  const actualRows=groupMenus(actual.detail.filter(row=>dessertNames.has(row.menu_original)),'menu_original').sort((a,b)=>b.quantity-a.quantity);
  const available=F.plans.filter(p=>p.weekday===wd).sort((a,b)=>b.expected-a.expected);
  const noSample=[...new Set(F.plans.map(p=>p.menu))].filter(m=>!available.some(p=>p.menu===m));
  const core=available.filter(p=>p.status==='준비 기준'),rare=available.filter(p=>p.status!=='준비 기준');
  const planned=[...core,...rare.filter(p=>extra.includes(p.menu))].map(p=>planRow(p,buffer,Object.hasOwn(manual,p.menu)?manual[p.menu]:null));
  const metric=F.metrics.find(x=>x.menu==='전체')||{mae:null,baseline_mae:null,n:0,wape:null};
  const totals=WINDOWS.map((w,i)=>planned.reduce((s,r)=>s+r.windows[i]*(r.unit.includes('4개')?4:1),0));
  const menus=[...new Set(F.plans.filter(p=>p.status==='준비 기준').map(p=>p.menu))];
  const warning=metric.mae==null?'검증할 표본이 부족합니다.':metric.baseline_mae==null?'단순 평균과 비교할 표본이 부족합니다.':metric.mae>=metric.baseline_mae?'과거 검증에서 단순 평균보다 정확하지 않았습니다.':'검증 기간 밖의 정확도는 보장하지 않습니다.';
  const prepExport=()=>download(`디저트_${WEEKDAYS[wd]}요일_당일준비.csv`,csv(planned.map(r=>({메뉴:r.menu,단위:r.unit,예상판매:r.expected,여유분퍼센트:buffer,당일준비:r.target,실물개수:r.physical,같은요일표본:r.same_weekday_days,...Object.fromEntries(WINDOWS.map((w,i)=>[w.label,r.windows[i]]))}))));
  return <>
    <Header label="03 / DESSERT PREPARATION" title="오늘 만들 디저트" description="요일별 수량을 조절하고 시간대에 맞춰 준비하세요. 확정 생산량이 아닌 준비 초안입니다." action={<div className="head-actions"><Button onClick={()=>window.print()}><Printer size={15}/> 인쇄</Button><Button className="primary" onClick={prepExport} disabled={!planned.length}><Download size={15}/> 준비표 저장</Button></div>}/>
    <div className="prep-brief">
      <div className="prep-total"><span>{WEEKDAYS[wd]}요일 당일 준비 초안</span><strong>{available.length?num(sum(planned,'physical')):'—'}<small>{available.length?'개':'표본 없음'}</small></strong></div>
      <div className="prep-brief-item"><span>준비 품목</span><strong>{num(planned.length)}<small>종</small></strong><small>선택한 소량 메뉴 {planned.filter(p=>p.status!=='준비 기준').length}종 포함</small></div>
      <div className="prep-brief-item prep-training"><span>예측 기준</span><strong>{F.cutoff}<small>까지</small></strong><small>완결일 · 최근 {F.window_days}일 · 큰 주문 제외</small></div>
      <div className="prep-brief-rule"><strong>당일 판매 · 이월 0</strong><span>4구는 실물 4개로 환산</span><span>예약·단체 주문은 별도 추가</span></div>
    </div>
    <div className="prep-controls">
      <div className="weekday-buttons" aria-label="준비 요일">{WEEKDAYS.map((w,i)=><Button key={w} className={i===wd?'active':''} onClick={()=>{setWd(i);setManual({})}} aria-pressed={wd===i}>{w}<small>요일</small></Button>)}</div>
      <div className="adjust-controls"><div className="buffer-control"><div>여유분 <strong>{buffer}%</strong></div><BufferSlider value={buffer} onChange={setBuffer}/></div><div className="lead-control"><span>준비 소요 시간</span><QuantityField aria-label="준비 소요 시간 분" min={0} max={240} step={15} value={lead} onChange={setLead} suffix="분"/></div><Button className="text-button" onClick={()=>{setBuffer(0);setLead(60);setManual({});setExtra([])}}><RotateCcw size={14}/> 초기화</Button></div>
    </div>
    <div className="prep-error-strip" role="note"><Info size={16}/><div><span>하루·메뉴 평균 오차 <b>{metric.mae==null?'미검증':num(metric.mae,2)}</b> / 단순 최근 평균 <b>{metric.baseline_mae==null?'미검증':num(metric.baseline_mae,2)}</b> 판매단위</span><strong>{warning}</strong></div><Button onClick={()=>setView('accuracy')}>검증 보기</Button></div>
    {menuRules?.rules.some(rule=>rule.enabled)&&<p className="prep-rules-note">준비 초안·검증은 기존 원본 메뉴·판매단위 기준입니다. 저장한 메뉴 통합 설정으로 재학습하지 않았습니다.</p>}
    <div className="prep-view-row"><div className="local-tabs"><Button aria-pressed={view==='plan'} className={view==='plan'?'active':''} onClick={()=>setView('plan')}>시간대별 준비표</Button><Button aria-pressed={view==='week'} className={view==='week'?'active':''} onClick={()=>setView('week')}>요일 비교</Button><Button aria-pressed={view==='accuracy'} className={view==='accuracy'?'active':''} onClick={()=>setView('accuracy')}>예측 검증</Button></div><div className="prep-reference-actions"><Button onClick={()=>setReference('actual')}>과거 판매와 비교하기</Button><Button onClick={()=>setReference('basis')}>표본·계산 기준</Button></div></div>
    {view==='plan'&&(!available.length?<Section className="prep-empty-panel" title="이 요일은 계산할 기록이 부족합니다"><div className="empty"><CalendarDays size={30}/><p>최근 기간에 같은 요일의 매출 기록이 없습니다.<br/>예상 수량을 0으로 단정하지 않았습니다.</p></div></Section>:<div className="prep-plan-grid">
      <Section className="prep-plan-panel" title={`${WEEKDAYS[wd]}요일 준비표`} desc="당일 준비 수량을 수정하면 시간대별 추가 준비량도 함께 바뀝니다." action={rare.length>0&&<Button onClick={()=>setReference('extra')}>{`신규·소량·최근 미판매 메뉴 ${rare.length}종`}</Button>}>
        <p className="table-hint">표 안에서 상하·좌우로 이동해 모든 메뉴와 시간대를 확인하세요.</p>
        <div className="table-scroll prep-table" tabIndex="0" role="region" aria-label="준비표 가로 스크롤"><table><thead><tr><th>디저트</th><th>예상 판매</th><th>당일 준비</th>{WINDOWS.map(w=><th key={w.label}>{w.label}<small>{w.start===0?'주문 별도 확인':deadline(w.start,lead)+' 시작'}</small></th>)}<th>표본</th></tr></thead><tbody>{planned.map(r=><tr key={r.menu}><td><strong>{r.menu}</strong><small>{r.unit} {r.status==='참고용'?'· 표본 적음':''}</small></td><td>{num(r.expected,1)}</td><td><QuantityField min={0} max={999} aria-label={r.menu+' 당일 준비 수량'} value={r.target} onChange={v=>setManual({...manual,[r.menu]:v})}/></td>{r.windows.map((v,i)=><td key={i} className={v?'has-qty':''}>{v||'—'}</td>)}<td>{r.same_weekday_days}일<small>같은 요일</small></td></tr>)}</tbody><tfoot><tr><td colSpan="3">실물 개수 합계 <small>4구는 ×4</small></td>{totals.map((v,i)=><td key={i}>{v||'—'}</td>)}<td>{sum(planned,'physical')}개</td></tr></tfoot></table></div>
        <div className="prep-table-caption"><span>시간대 수량은 판매단위 · 합계는 실물 개수</span>{noSample.length>0&&<Button onClick={()=>setReference('basis')}>이 요일 표본 없는 메뉴 {noSample.length}종</Button>}</div>
      </Section>
      <Section className="prep-flow-panel" title="시간대별 준비 흐름" desc="선택한 품목 전체 · 실물 개수"><PrepFlow rows={WINDOWS.map((w,i)=>({window:w.label,quantity:totals[i]}))}/><p className="footnote">각 시간에 추가할 양입니다. 00–08시 주문은 별도 확인하세요.</p></Section>
    </div>)}
    {view==='week'&&<Section className="prep-week-panel" title="같은 메뉴, 다른 요일" desc="여유분을 적용한 당일 총량 · ‘—’는 표본 부족 · 직접 수정한 수량은 현재 준비표에만 적용"><p className="table-hint">표 안에서 이동해 모든 메뉴와 요일을 확인하세요.</p><div className="table-scroll prep-week-scroll" tabIndex="0" role="region" aria-label="요일별 표 가로 스크롤"><table className="week-heatmap"><thead><tr><th>메뉴</th>{WEEKDAYS.map(w=><th key={w}>{w}요일</th>)}</tr></thead><tbody>{menus.map(m=><tr key={m}><td>{m}<small>{F.plans.find(p=>p.menu===m).unit}</small></td>{WEEKDAYS.map((w,i)=>{const p=F.plans.find(p=>p.menu===m&&p.weekday===i);const n=p?planRow(p,buffer).target:null;return <td key={w} style={{background:n?`color-mix(in srgb, var(--ss-accent) ${Math.min(90,15+n*9)}%, var(--ss-surface))`:''}}>{n??'—'}</td>})}</tr>)}</tbody></table></div><p className="footnote">최근 같은 요일 평균과 전체 평균을 섞습니다. 품목별 첫 판매 이전 날짜는 0으로 넣지 않습니다.</p></Section>}
    {view==='accuracy'&&<Section className="prep-accuracy-panel" title="과거 날짜를 하루씩 예측한 결과" desc={`${F.holdout_start}–${F.holdout_end} · 해당 날짜 이전 자료로만 계산 · 참고용 메뉴 제외`} action={<div className="prep-validation-summary"><span>검증 <b>{num(metric.n)}</b>개 조합</span><span>수량 오차율 <b>{metric.wape==null?'—':num(metric.wape,1)+'%'}</b></span></div>}><Table search={false} pageSize={5} data={F.metrics.filter(x=>x.menu!=='전체')} columns={[textCol('menu','메뉴'),numeric('n','검증일'),numeric('mae','평균 오차',v=>num(v,2)),numeric('baseline_mae','단순 평균 오차',v=>num(v,2)),{accessorKey:'wape',header:'수량 오차율',cell:i=>i.getValue()==null?'분모 0':num(i.getValue(),1)+'%'}]}/><p className="footnote">판매단위 기준 오차입니다. 4구 1단위 오차는 낱개 4개 차이이며, 검증일이 적으면 비교도 불안정합니다. 오차율은 절대 오차 합계 ÷ 실제 판매 수량입니다.</p></Section>}
    <p className="prep-session-note">수정한 수량은 이 화면에서만 유지됩니다. 현재 선택은 준비표 저장으로 보관하세요. 품절·폐기·원가 기록이 없어 이익이나 놓친 수요는 계산하지 않습니다.</p>
    <Drawer opened={reference!==null} onClose={()=>setReference(null)} title={reference==='actual'?'과거 판매와 비교하기':reference==='extra'?'신규·소량 메뉴 추가':'표본·계산 기준'} size={650} position="right" closeButtonProps={{'aria-label':'준비 참고 닫기'}} withinPortal={false} trapFocus returnFocus classNames={{content:'sales-drawer prep-reference-drawer',header:'sales-drawer-header',body:'sales-drawer-body'}}>
      {reference==='extra'&&<><Note>표본이 적거나 최근 14일간 판매가 없어 기본 준비표에서 제외했습니다. 선택하면 참고 수량을 더할 수 있습니다.</Note><div className="rare-grid">{rare.map(r=><CheckField key={r.menu} checked={extra.includes(r.menu)} onChange={e=>setExtra(e.target.checked?[...extra,r.menu]:extra.filter(m=>m!==r.menu))} label={<span>{r.menu}<small>예상 {num(r.expected,1)}{r.unit} · 마지막 {r.last_observed.slice(5)}</small></span>}/>)}</div><Button className="primary prep-drawer-done" onClick={()=>setReference(null)}>준비표로 돌아가기</Button></>}
      {reference==='actual'&&<><DateFilter data={D}/><Note>날짜 선택은 실제 판매에 적용됩니다. 준비 초안은 {F.cutoff}까지 최근 {F.window_days}일 기준이며 선택 기간으로 다시 학습하지 않습니다.</Note><Section title="준비 메뉴의 선택일 실제 판매" desc="토스 완결일 상세만 집계 · 부분일과 페이히어 제외 · 생산량이나 폐기량이 아닙니다."><Table search={false} pageSize={5} data={actualRows} columns={[textCol('menu','메뉴'),numeric('quantity','판매 수량'),textCol('unit','단위'),numeric('amount','매출',money)]}/></Section></>}
      {reference==='basis'&&<>
        {noSample.length>0&&<Note>이 요일 표본이 없어 수량을 제시하지 않은 메뉴: {noSample.join(', ')}. 최근에 등장한 메뉴는 며칠 더 기록이 쌓이면 계산할 수 있습니다.</Note>}
        <Section title="판매 편차도 함께 보기" desc="최근 같은 요일의 최저–최고 순수량. 예측 구간이나 품절 확률은 아닙니다."><div className="range-list">{core.map(r=><div key={r.menu}><span>{r.menu}</span><strong>{r.history_min}–{r.history_max}<small>{r.unit}</small></strong><span className="muted">예상 {num(r.expected,1)}</span></div>)}</div>{!core.length&&<p className="footnote">선택한 요일의 준비 기준 메뉴가 없습니다.</p>}</Section>
        <Section title="수량과 준비 시각"><div className="prep-notes"><p><strong>수량 기준</strong>평균 예상량을 반올림한 뒤 시간대 비중으로 배분합니다. 각 시간대를 따로 올림해 당일 총량이 늘어나지 않게 했습니다.</p><p><strong>준비 시각</strong>기본 60분은 가정입니다. 실제 제조 시간에 맞춰 조절하세요. 00–08시는 밤·이른 아침 기록을 묶었으므로 주문 확인이 필요합니다.</p></div></Section>
        <Section title="계산 기준"><ol className="method-list"><li><strong>최근 56일</strong><p>완결일만 사용하고 최근 기록에 더 큰 비중을 줍니다. 21일 전 기록의 비중은 최신 기록의 절반입니다.</p></li><li><strong>비슷한 요일 + 최근 전체</strong><p>같은 요일 표본 n일의 가중치는 n / (n + 4). 나머지는 전체 요일 평균으로 보완합니다.</p></li><li><strong>일반 판매 흐름</strong><p>총액 10만원 이상 주문은 제외합니다. 해당 메뉴 판매가 없는 매출 기록일은 0으로 포함하고, 첫 판매 이전은 제외합니다.</p></li><li><strong>시간 배분</strong><p>같은 방식의 시간별 판매 비중으로 하루 수량을 나눕니다. 전체 수량은 반올림하고 잔여 수량을 소수 부분이 큰 시간대에 배분합니다.</p></li></ol><a className="source-link" href="https://otexts.com/fpp3/tscv.html" target="_blank" rel="noreferrer">검증 방법 참고: Forecasting — Time series cross-validation <ArrowUpRight size={14}/></a></Section>
        <Note>당일 판매량은 재고 소진으로 놓친 수요를 포함하지 못합니다. 예약·단체 주문은 이 초안에 별도로 더하세요. 보관 가능 시간과 제조 배치 제약이 없어 생산 최적화까지 계산한 값은 아닙니다.</Note>
      </>}
    </Drawer>
  </>;
}
