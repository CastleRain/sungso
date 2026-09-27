import React,{useContext,useMemo,useState} from 'react';
import {Drawer,SegmentedControl} from '@mantine/core';
import {DatePickerInput} from '@mantine/dates';
import {ArrowUpRight,CalendarDays,Download,Info,Printer,RotateCcw,SlidersHorizontal,ChevronRight,ClipboardList,Clock3,Layers3} from 'lucide-react';
import {Button,CheckField,QuantityField,Select,ExtraMenus} from './ui.jsx';
import {Header,Section,Note,Table,numeric,textCol,num,money,download,csv} from './report-ui.jsx';
import {MenuRuleContext} from './menu-editor.jsx';
import {DateFilter,usePeriod} from './date-filter.jsx';
import {selectedMenuData,groupMenus,shiftDate} from './analysis.mjs';
import {WEEKDAYS,deadline} from './planning.mjs';
import {applyMenuRules} from '../../../../services/sohee/menu-rules.mjs';
import {buildDemandModel,policyRisk} from './demand-model.mjs';
import {PREP_PHASES,defaultPrepDate,prepDateForWeekday,prepWeekday,makePrepRow,prepTotals,koreaToday} from './prep-workflow.mjs';
import {DemandHistory} from './prep-charts.jsx';

const EMPTY_RULES=[];
const POLICIES=[{value:'low',label:'적게 준비',hint:'남는 쪽을 더 경계',q:35},{value:'balanced',label:'기준 준비',hint:'초과·부족을 함께 확인',q:50},{value:'high',label:'넉넉히 준비',hint:'부족한 쪽을 더 경계',q:70}];
const quantity=(value,unit='개')=>value==null?'—':`${num(value,Number.isInteger(value)?0:1)}${unit}`;
function Validation({model,legacy}){
  const metrics=model.metrics||[],byUnit=model.validation?.by_unit||[];
  const units=Array.isArray(byUnit)?byUnit:Object.values(byUnit);
  const [unit,setUnit]=useState('');
  const current=units.find(r=>r.unit===unit)||units[0];
  const scenarios=current?[{label:'최근 평균 반올림',...current.baseline_prep},...POLICIES.map(p=>({label:p.label,...current.policies?.[p.value]}))]:[];
  return <Section className="prep-accuracy-panel" title="정확도와 준비량을 따로 검증합니다" desc="과거 날짜 직전의 자료만 사용한 순차 검증 · 이름·단위 통합 후 다시 계산">
    <div className="prep-validation-intro"><div><strong>① 판매량 예측</strong><p>최근 28일 평균을 기준으로, 이전 검증에서 충분히 나았던 경우만 요일 보정을 선택합니다.</p></div><div><strong>② 준비 성향</strong><p>적게·기준·넉넉히 준비했을 때 판매보다 초과하거나 부족했을 양을 비교합니다. 실제 폐기량은 아닙니다.</p></div></div>
    <div className="prep-policy-validation"><div className="prep-policy-validation-head"><strong>과거 검증일에 실제로 이만큼 준비했다면</strong>{units.length>1&&<Select label="검증 단위" value={current?.unit} options={units.map(r=>r.unit)} onChange={setUnit}/>}</div><div className="prep-policy-validation-table" role="region" tabIndex="0" aria-label="준비 성향 검증표"><table><thead><tr><th>준비 방식</th><th>메뉴당 하루 평균 초과</th><th>메뉴당 하루 평균 부족</th><th>평균 차이</th><th>검증 조합</th></tr></thead><tbody>{scenarios.map(r=><tr key={r.label}><td>{r.label}</td><td>{quantity(r.excess,current.unit)}</td><td>{quantity(r.shortfall,current.unit)}</td><td>{quantity(r.mae,current.unit)}</td><td>{num(r.n)}개</td></tr>)}</tbody></table></div><p className="footnote">각 날짜 이전 자료만 사용했습니다. 판매량과 준비량의 차이이며 실제 로스·품절은 아닙니다. {current?.unit||'단위'}끼리의 메뉴·날짜 조합만 비교합니다.</p></div>
    <div className="prep-validation-table"><Table search={false} pageSize={6} data={metrics} columns={[textCol('menu','메뉴'),textCol('unit','단위'),numeric('n','검증일'),numeric('mae','선택 예측 오차',v=>v==null?'—':num(v,2)),numeric('baseline_mae','최근 평균 오차',v=>v==null?'—':num(v,2)),numeric('candidate_mae','요일 보정 오차',v=>v==null?'—':num(v,2))]}/></div>
    <p className="footnote">평균 절대 오차(MAE)는 하루 판매량과 예측의 차이입니다. 낮을수록 좋습니다. 팩과 개의 오차를 더하지 않습니다. 검증 {model.validation?.start||'—'}–{model.validation?.end||'—'} · 모델 선택도 각 날짜 이전의 평가만 사용합니다.</p>
    <div className="prep-legacy"><ExtraMenus title="기존에 저장한 예측 검증도 확인하기"><p>아래는 이전 원본 메뉴·판매단위 기준 검증입니다. 기존 결과를 덮어쓰지 않았습니다.</p><Table search={false} pageSize={5} data={(legacy?.metrics||[]).filter(r=>r.menu!=='전체')} columns={[textCol('menu','원본 메뉴'),numeric('mae','기존 오차',v=>num(v,2)),numeric('baseline_mae','당시 단순 평균',v=>num(v,2))]}/></ExtraMenus></div>
    {!units.length&&<p className="footnote">검증 표본이 부족한 메뉴는 오차를 제시하지 않습니다.</p>}
  </Section>;
}
export function DessertPrep({data:mapped}){
  const context=useContext(MenuRuleContext),D=context?.rawData||mapped,rules=context?.rules||EMPTY_RULES;
  const model=useMemo(()=>buildDemandModel(D,rules),[D,rules]);
  const {selection}=usePeriod();
  const [date,setDate]=useState(()=>defaultPrepDate(model)),[policy,setPolicy]=useState('balanced'),[view,setView]=useState('plan'),[manual,setManual]=useState({}),[localPolicy,setLocalPolicy]=useState({}),[reserved,setReserved]=useState({}),[extra,setExtra]=useState(false),[chosen,setChosen]=useState(''),[reference,setReference]=useState(null),[lead,setLead]=useState(60);
  const wd=prepWeekday(date),available=model.plans.filter(p=>p.weekday===wd&&p.status!=='표본 없음'),unsupported=model.plans.filter(p=>p.weekday===wd&&p.status==='표본 없음');
  const core=available.filter(p=>p.status==='준비 기준'),rare=available.filter(p=>p.status!=='준비 기준');
  const rows=[...core,...(extra?rare:[])].map(p=>makePrepRow(p,policy,manual[p.manual_key]??null,reserved[p.manual_key]||0)).sort((a,b)=>(b.expected*(b.physical_factor||1))-(a.expected*(a.physical_factor||1)));
  const active=rows.find(r=>r.key===chosen)||rows[0],risk=active&&active.target!=null?policyRisk(active,active.target):null,totals=prepTotals(rows);
  const scenario=POLICIES.find(p=>p.value===policy),known=rows.length>0;
  const mappedDesserts=useMemo(()=>{const sources=new Set(model.menus.flatMap(m=>(m.sources||[]).map(s=>typeof s==='string'?s:s.sourceName||s.source_menu||s.menu)));return applyMenuRules({...D,menu_toss:D.menu_toss.filter(r=>sources.has(r.menu_original))},rules)},[D,rules,model]);
  const actualRows=groupMenus(selectedMenuData(mappedDesserts,selection).detail,'menu_original').sort((a,b)=>b.quantity-a.quantity);
  const weekMenus=[...new Map(model.plans.filter(p=>p.status==='준비 기준').map(p=>[p.key,p])).values()];
  const staleDays=Math.max(0,Math.round((Date.parse(koreaToday())-Date.parse(model.cutoff))/86400000));
  function changeDate(next){if(next&&next!==date){setDate(next);setManual({});setLocalPolicy({});setReserved({});}}
  function changePolicy(next){setPolicy(next);setManual({});setLocalPolicy({});}
  function exportPlan(){
    const exported=rows.map(r=>{
      const rowPolicy=localPolicy[r.manual_key]?POLICIES.find(p=>p.value===localPolicy[r.manual_key]):manual[r.manual_key]!=null?null:scenario;
      return {준비날짜:date,요일:WEEKDAYS[wd],메뉴:r.menu,단위:r.unit,준비성향:rowPolicy?.label||'직접 조절',분위수:rowPolicy?.q??'',판매량예측:r.expected,일반준비:r.target,확정주문별도:r.reservation,총준비:r.total,실물개수:r.physical,오전:r.phases?.[0],점심오후:r.phases?.[1],늦은오후:r.phases?.[2],시간표본일:r.hour_sample_days,표본일:r.sample_days,같은요일표본:r.same_weekday_days,자료기준:model.cutoff,안내:'당일 판매·이월 없음. 단계별 수량은 일반 판매분, 확정 주문 시각 별도. 생산·폐기 기록 아님.'};
    });
    download(`디저트_준비초안_${date}.csv`,csv(exported));
  }
  return <>
    <Header title="디저트 준비" description="덜 남기고, 필요한 때 나눠 만들기. 판매 기록으로 조절하는 준비 초안입니다." action={<div className="head-actions"><Button onClick={()=>window.print()}><Printer size={15}/> 인쇄</Button><Button className="primary" onClick={exportPlan} disabled={!known}><Download size={15}/> 준비표 저장</Button></div>}/>
    <section className="prep-decision-bar" aria-label="준비 날짜와 성향">
      <div className="prep-date-choice"><span className="prep-field-label"><CalendarDays size={15}/> 준비할 날짜</span><DatePickerInput aria-label="준비 날짜" value={date} onChange={changeDate} minDate={model.cutoff?shiftDate(model.cutoff,1):undefined} valueFormat="M월 D일 (ddd)" monthLabelFormat="YYYY년 M월" nextLabel="준비 달력 다음 달" previousLabel="준비 달력 이전 달" clearable={false} popoverProps={{withinPortal:false}}/><small>자료가 있는 다음 요일을 기본 선택 · 영업일 확인 필요</small></div>
      <div className="prep-policy-choice"><span className="prep-field-label"><SlidersHorizontal size={15}/> 전체 메뉴 준비 성향 <small>변경 시 직접 조절 초기화</small></span><SegmentedControl fullWidth value={policy} onChange={changePolicy} aria-label="준비 성향" data={POLICIES.map(p=>({value:p.value,label:<span>{p.label}<small>{p.hint}</small></span>}))}/></div>
      <div className="prep-data-anchor"><span>완결 토스 자료</span><strong>{model.cutoff||'자료 없음'}</strong><small>최근 {model.window_days}일 · 큰 주문 별도</small><Button className="text-button" onClick={()=>setReference('basis')}>기준 확인 <ChevronRight size={12}/></Button></div>
    </section>
    <div className="prep-weekline"><div className="weekday-buttons" aria-label="준비 요일">{WEEKDAYS.map((w,i)=><Button key={w} aria-label={w+' 요일'} aria-pressed={wd===i} className={wd===i?'active':''} onClick={()=>changeDate(prepDateForWeekday(date,i))}>{w}<span className={!model.plans.some(p=>p.weekday===i&&p.status==='준비 기준')?'no-sample-dot':'sample-dot'} aria-hidden="true"/></Button>)}</div><p>{date} · {WEEKDAYS[wd]}요일 패턴 <span>날씨·행사·품절은 반영되지 않습니다.</span></p><Button className="text-button" onClick={()=>{setManual({});setLocalPolicy({});setReserved({});setPolicy('balanced');setExtra(false)}}><RotateCcw size={13}/> 수량 초기화</Button></div>
    {staleDays>7&&<p className="prep-stale" role="note">마지막 완결 자료가 {staleDays}일 전입니다. 최근 상황과 다를 수 있으니 새 토스 원본을 갱신한 뒤 판단하세요.</p>}
    <div className="prep-owner-summary">
      <div className="prep-total"><span><ClipboardList size={16}/> {scenario.label} · 당일 총량</span><strong>{known?(totals.physical==null?'단위별 확인':num(totals.physical)):'—'}<small>{known&&totals.physical!=null?'개':''}</small></strong><small>{known?totals.units.map(u=>quantity(u.quantity,u.unit)).join(' + '):'해당 요일 표본 없음'} · 전날 재고 이월 0</small></div>
      <div><span><Layers3 size={16}/> 준비할 메뉴</span><strong>{rows.length}<small>종</small></strong><small>직접 조절 {rows.filter(r=>manual[r.manual_key]!=null).length}종 · 확인 필요 {rare.length}종</small></div>
      <div><span><Clock3 size={16}/> 한 번에 만들지 않기</span><strong>오전 → 오후</strong><small>{totals.unallocated?`${totals.unallocated}종은 시간 자료 부족`:'과거 판매 시간으로 일반 준비량 배분'} · 예약은 시간 별도</small></div>
      <div className="prep-summary-action"><Button onClick={()=>setView('accuracy')}>예측이 얼마나 맞았나 <ArrowUpRight size={14}/></Button><small>새 방법도 최근 평균과 비교합니다.</small></div>
    </div>
    <div className="prep-view-row"><div className="local-tabs"><Button aria-pressed={view==='plan'} className={view==='plan'?'active':''} onClick={()=>setView('plan')}>시간대별 준비표</Button><Button aria-pressed={view==='week'} className={view==='week'?'active':''} onClick={()=>setView('week')}>요일 비교</Button><Button aria-pressed={view==='accuracy'} className={view==='accuracy'?'active':''} onClick={()=>setView('accuracy')}>예측 검증</Button></div><div className="prep-reference-actions"><Button onClick={()=>setReference('actual')}>과거 판매와 비교하기</Button><Button onClick={()=>setReference('basis')}>표본·계산 기준</Button></div></div>
    {view==='plan'&&<div className="prep-owner-grid">
      <Section className="prep-worktable" title={`${WEEKDAYS[wd]}요일 · 조절할 준비량`} desc="행을 누르면 판매 편차와 과다·부족을 비교합니다." action={<CheckField label={`표본 적은 메뉴 ${rare.length}종 포함`} checked={extra} onChange={e=>setExtra(e.target.checked)} disabled={!rare.length}/> }>
        {known?<><div className="table-scroll prep-table" role="region" tabIndex="0" aria-label="메뉴별 준비표"><table><thead><tr><th>메뉴 · 단위</th><th>판매 예측<small>평균 예상량</small></th><th>일반 준비<small>직접 조절</small></th>{PREP_PHASES.map(p=><th key={p.key}>{p.short}<small>{p.start===0?'먼저 준비':deadline(p.start,lead)+' 시작'}</small></th>)}<th>확정 주문<small>별도 추가</small></th></tr></thead><tbody>{rows.map(r=><tr key={r.key} className={r.key===active?.key?'selected-row':''}><td><Button className="prep-menu-choice" aria-pressed={r.key===active?.key} onClick={()=>setChosen(r.key)}>{r.menu}</Button><small>{r.unit} · 같은 요일 {r.same_weekday_days}일{r.status==='참고용'?' · 표본 적음':''}{r.sources?.length>1?` · 원본 ${r.sources.length}종 합산`:''}</small></td><td>{num(r.expected,1)}</td><td><QuantityField aria-label={r.menu+' '+r.unit+' 당일 준비 수량'} min={0} max={999} value={r.target} onChange={v=>{setChosen(r.key);setLocalPolicy({...localPolicy,[r.manual_key]:null});setManual({...manual,[r.manual_key]:v})}}/></td>{PREP_PHASES.map((p,i)=><td key={p.key} className={'prep-phase-cell phase-'+i}>{r.phases?.[i]??'—'}</td>)}<td><span>{r.reservation||'—'}</span><Button className="text-button prep-reserve-edit" aria-label={r.menu+' '+r.unit+' 확정 주문 입력'} onClick={()=>{setChosen(r.key);setReference('reserve')}}>입력</Button></td></tr>)}</tbody></table></div><div className="prep-worktable-footer"><span>단계별 합 = 일반 준비 · 확정 주문 수량은 별도</span><div><span>제조 시간</span><QuantityField aria-label="준비 소요 시간 분" min={0} max={240} step={15} value={lead} onChange={setLead} suffix="분"/></div></div></>:<div className="prep-no-data"><CalendarDays size={30}/><h3>이 요일은 계산할 기록이 부족합니다</h3><p>판매 0개로 판단하지 않습니다. 표본이 있는 요일을 선택하거나, 표본 적은 메뉴를 확인하세요.</p>{model.plans.some(p=>p.status==='준비 기준')&&<Button onClick={()=>changeDate(defaultPrepDate(model))}>표본 있는 다음 요일 보기</Button>}</div>}
        {!!unsupported.length&&<p className="prep-small-note">같은 요일 기록이 없는 메뉴 {unsupported.length}종은 수량을 제시하지 않았습니다.</p>}
      </Section>
      <Section className="prep-risk-panel" title={active?active.menu+' · 준비 판단':'판매 기록이 쌓이면'} desc={active?`${active.distribution.length}일의 과거 판매 · ${active.unit} 기준`:'판매량의 흔들림과 준비 수량을 함께 봅니다.'}>
        {active?<><div className="prep-range-options" aria-label="선택 메뉴의 준비 성향별 수량">{POLICIES.map(p=><Button key={p.value} aria-label={active.menu+' '+p.label+' '+quantity(active[p.value],active.unit)} aria-pressed={(localPolicy[active.manual_key]||(manual[active.manual_key]==null?policy:null))===p.value} className={(localPolicy[active.manual_key]||(manual[active.manual_key]==null?policy:null))===p.value?'selected':''} onClick={()=>{setChosen(active.key);setLocalPolicy({...localPolicy,[active.manual_key]:p.value});setManual({...manual,[active.manual_key]:active[p.value]})}}><span>{p.label}</span><strong>{quantity(active[p.value],active.unit)}</strong></Button>)}</div><DemandHistory plan={active} target={active.target}/><div className="prep-chart-key"><span><i/> 실제 판매</span><span><i className="line"/> 일반 준비 {quantity(active.target,active.unit)}</span><span><i className="exceed"/> 준비보다 많이 팔린 날</span></div><div className="prep-risk-caption">이 수량을 과거 판매에 대입했다면 <small>학습 표본 비교 · 실제 폐기·품절 아님</small></div><div className="prep-risk-values"><div className="over"><span>하루 평균 초과</span><strong>{quantity(risk?.excess,active.unit)}</strong></div><div className="under"><span>하루 평균 부족</span><strong>{quantity(risk?.shortfall,active.unit)}</strong></div></div><p className="prep-small-note">{active.method_label||'최근 평균과 요일 보정 비교'} · 시간 배분: {active.hours_available?`${active.hour_basis==='same_weekday_clean_sales'?'같은 요일':'최근 전체 요일'} ${active.hour_sample_days}일`:'표본 없음'}{active.hour_excluded_bulk_days>0?` · 큰 주문일 ${active.hour_excluded_bulk_days}일은 시간 배분에서 제외`:''}</p></>:<p className="prep-small-note">표본이 없는 메뉴의 수량을 임의로 만들지 않습니다.</p>}
      </Section>
    </div>}
    {view==='week'&&<Section className="prep-week-panel" title="같은 메뉴, 다른 요일" desc={`${scenario.label} 기준 · 저장한 메뉴 구성 반영 · ‘—’는 표본 부족 · 수동 수정/예약은 현재 준비표만 적용`}><div className="table-scroll prep-week-scroll" role="region" tabIndex="0" aria-label="요일별 준비 비교"><table className="week-heatmap"><thead><tr><th>메뉴</th>{WEEKDAYS.map(w=><th key={w}>{w}요일</th>)}</tr></thead><tbody>{weekMenus.map(m=><tr key={m.key}><td>{m.menu}<small>{m.unit}</small></td>{WEEKDAYS.map((w,i)=>{const p=model.plans.find(p=>p.key===m.key&&p.weekday===i&&p.status==='준비 기준');return <td key={w}>{p?Math.round(p[policy]):'—'}</td>})}</tr>)}</tbody></table></div><p className="footnote">35·50·70 분위수로 준비 성향을 비교합니다. 최적 생산량이나 판매 보장 확률이 아닙니다.</p></Section>}
    {view==='accuracy'&&<Validation model={model} legacy={D.forecast}/>}
    <p className="prep-session-note"><Info size={13}/> 생산·폐기·품절 기록이 없어 실제 로스와 놓친 수요는 계산할 수 없습니다. 조절 수량은 이 화면에서만 유지되며 준비표로 내려받을 수 있습니다.</p>
    <Drawer opened={reference!==null} onClose={()=>setReference(null)} title={reference==='actual'?'과거 판매와 비교하기':reference==='reserve'?'확정 주문 별도 추가':'표본·계산 기준'} size={700} position="right" closeButtonProps={{'aria-label':'준비 참고 닫기'}} withinPortal={false} trapFocus returnFocus classNames={{content:'sales-drawer prep-reference-drawer',header:'sales-drawer-header',body:'sales-drawer-body'}}>
      {reference==='reserve'&&active&&<><Note>예약·단체 주문 중 실제로 확정된 수량만 더하세요. 일반 판매 예측이나 과거 매출을 늘리지 않습니다.</Note><Section title={active.menu} desc={`현재 일반 준비 ${quantity(active.target,active.unit)} · 전날 이월 없음`}><label className="prep-reserve-label">추가할 확정 수량 ({active.unit})</label><QuantityField aria-label="확정 주문 추가 수량" min={0} max={999} value={active.reservation} onChange={v=>setReserved({...reserved,[active.manual_key]:v})}/><p>당일 총 준비 <strong>{quantity(active.total,active.unit)}</strong></p><p className="footnote">확정 주문의 수령 시각은 직접 확인하세요. 시간대에 임의로 나누지 않았습니다.</p></Section><Button className="primary" onClick={()=>setReference(null)}>준비표로 돌아가기</Button></>}
      {reference==='actual'&&<><DateFilter data={D}/><Note>아래 날짜 선택은 과거 판매 조회에 적용됩니다. 준비 초안은 {model.cutoff}까지의 자료로 계산합니다. 판매는 생산량이나 폐기량이 아닙니다.</Note><Section title="준비 메뉴의 선택일 실제 판매" desc="토스 완결일 상세 · 저장한 메뉴 구성 반영"><Table search={false} pageSize={7} data={actualRows} columns={[textCol('menu','메뉴'),numeric('quantity','판매 수량'),textCol('unit','단위'),numeric('amount','매출',money)]}/></Section></>}
      {reference==='basis'&&<>
        <Section title="로스를 줄이기 위한 사용 순서"><ol className="method-list"><li><strong>① 적게·기준·넉넉히 비교</strong><p>과거 판매 분포의 35·50·70 분위수입니다. 원가·품절 비용이 없어 어느 것이 최적인지는 정하지 않습니다.</p></li><li><strong>② 오전분부터 나눠 준비</strong><p>과거 시간별 판매 비중으로 일반 준비량만 배분합니다. 이미 준비한 재고와 당일 판매를 확인한 뒤 추가하세요. 시간표는 실시간 추가 생산 지시가 아닙니다.</p></li><li><strong>③ 확정 주문은 별도로</strong><p>큰 주문은 평소 판매에서 분리합니다. 오늘 확정된 주문은 직접 추가하고 수령 시각을 확인하세요.</p></li><li><strong>④ 마감 후 실제 결과 기록</strong><p>생산량·판매량·폐기량·품절 시각이 있어야 실제 로스와 놓친 수요를 구분할 수 있습니다. 현재 앱에 생산/폐기 기록은 저장하지 않습니다.</p></li></ol></Section>
        <Section title="예측을 검증하는 방법"><p>메뉴 상세를 확인할 수 있는 토스 완결 결제 기록일만 사용합니다. 첫 판매 이전과 부분일·페이히어는 제외하며, 판매가 없었던 관측일은 0으로 포함합니다. 저장한 메뉴 이름·수량·단위를 적용한 뒤 같은 메뉴를 합산합니다.</p><p>최근 28일 평균과 요일 보정을 날짜 순서로 비교합니다. 그 날짜 이전의 검증에서 충분한 개선이 확인된 경우만 요일 보정을 사용합니다. 새 방법의 오차가 작다는 보장은 하지 않습니다.</p><p>큰 주문은 메뉴·날짜의 수량에서 분리합니다. 시간별 큰 주문 상세가 없어 해당 큰 주문일은 시간 배분에서 제외합니다. 표본이 없으면 시간표를 만들지 않습니다.</p><a className="source-link" href="https://otexts.com/fpp3/tscv.html" target="_blank" rel="noreferrer">시계열 순차 검증 방법 <ArrowUpRight size={14}/></a><a className="source-link" href="https://otexts.com/fpp3/distaccuracy.html" target="_blank" rel="noreferrer">분위수 예측과 검증 <ArrowUpRight size={14}/></a></Section>
        <Note>판매량은 수요 전체가 아닙니다. 품절 이후 놓친 판매를 복원하지 않았으며 날씨·행사·운영 변경·상품 진열 여부도 알 수 없습니다. 준비 날짜가 멀수록 현재의 요일 패턴을 그대로 적용하는 한계가 커집니다.</Note>
      </>}
    </Drawer>
  </>;
}
