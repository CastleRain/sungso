import React,{createContext,useContext,useEffect,useState} from 'react';
import {Drawer,Autocomplete,Alert} from '@mantine/core';
import {ArrowDown,Check,Package,RotateCcw,Save} from 'lucide-react';
import {Button,Select,QuantityField} from './ui.jsx';
import {MENU_UNITS,menuUnit,validateMenuRule} from '../../../../services/sohee/menu-rules.mjs';
import {num,money,sum} from './report-ui.jsx';
export const MenuRuleContext=createContext(null);
export function MenuRuleEditor({opened,onClose}){
  const context=useContext(MenuRuleContext),raw=context?.rawData;
  const names=[...new Set(raw?.menu_monthly.map(row=>row.menu_original)||[])].sort();
  const [source,setSource]=useState(''),[target,setTarget]=useState(''),[unit,setUnit]=useState('개'),[multiplier,setMultiplier]=useState(1),[revision,setRevision]=useState(0),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[ready,setReady]=useState(false);
  function choose(name,rules=context.rules){const saved=rules.find(row=>row.sourceName===name);setSource(name);setTarget(saved?.enabled?saved.targetName:name);setUnit(saved?.enabled?saved.unit:menuUnit({menu_original:name}).startsWith('팩')?'팩':'개');setMultiplier(saved?.enabled?saved.multiplier:1);setRevision(saved?.revision||0);setEnabled(!!saved?.enabled);setError('');setMessage('');}
  useEffect(()=>{if(!opened||!names.length)return;let active=true;setBusy(true);setReady(false);setError('');Promise.resolve(context.refreshRules?context.refreshRules():context.rules).then(rules=>{if(active){choose(names.includes(source)?source:names[0],rules);setReady(true);}}).catch(()=>{if(active)setError('최신 설정을 불러오지 못했습니다. 닫고 다시 열어주세요.');}).finally(()=>{if(active)setBusy(false);});return ()=>{active=false;};},[opened]);
  const original=raw?.menu_monthly.filter(row=>row.menu_original===source)||[],quantity=sum(original,'quantity');
  const sourceUnit=menuUnit({menu_original:source}),saleUnit=sourceUnit.startsWith('팩')?'팩':sourceUnit;
  const validQuantity=Number.isInteger(multiplier)&&multiplier>=1&&multiplier<=100;
  const targetName=target.trim();
  const linkedSources=(context?.rules||[]).filter(rule=>rule.enabled&&rule.sourceName!==source&&rule.targetName===targetName&&rule.unit===unit);
  async function save(reset=false){setError('');setMessage('');try{const draft=validateMenuRule({sourceName:source,targetName:reset?source:target,unit:reset?(menuUnit({menu_original:source}).startsWith('팩')?'팩':'개'):unit,multiplier:reset?1:multiplier,enabled:!reset});setBusy(true);const result=await context.saveRule(draft,revision);setRevision(result.revision);setEnabled(result.enabled);if(reset){setTarget(source);setMultiplier(1);setUnit(draft.unit);}setMessage(reset?'원본 이름과 수량으로 되돌렸습니다.':'Firebase에 저장했습니다. 판매 분석에 적용되었습니다.');}catch(err){setError(err.message==='MENU_RULE_CONFLICT'?'다른 화면에서 이 메뉴 설정을 변경했습니다. 입력한 내용은 유지했습니다. 화면을 닫고 다시 열어 최신 설정을 확인해주세요.':'저장하지 못했습니다. 입력한 이름·단위·배수와 회원 연결을 확인하고 다시 시도해주세요.');}finally{setBusy(false);}}
  return <Drawer opened={opened} onClose={()=>!busy&&onClose()} title="메뉴 이름·수량 수정" size={570} position="right" closeButtonProps={{'aria-label':'메뉴 수정 닫기'}} withinPortal={false} trapFocus returnFocus closeOnEscape={!busy} closeOnClickOutside={!busy} withCloseButton={!busy} classNames={{content:'sales-drawer',header:'sales-drawer-header',body:'sales-drawer-body menu-composition-editor'}}>
    <p className="editor-intro">판매 상품 하나에 어떤 메뉴가 몇 개 들어있는지 지정하세요. 묶음 상품도 지정한 메뉴의 수량으로 모아볼 수 있습니다.</p>
    <div className="menu-edit-form">
      <div className="menu-composition">
        <section className="composition-source" aria-label="판매 상품 선택"><div className="composition-step"><span>1</span><strong>판매된 상품</strong><Package size={16}/></div><Select disabled={busy} label="원본 메뉴" value={source||null} onChange={choose} options={names}/><p>이 상품 <b>1{saleUnit}</b>이 팔릴 때</p></section>
        <div className="composition-arrow" aria-hidden="true"><ArrowDown size={18}/></div>
        <section className="composition-target" aria-label="메뉴 구성 지정"><div className="composition-step"><span>2</span><strong>어떤 메뉴가 몇 개 들어있나요?</strong></div>
          <Autocomplete label="집계할 메뉴" value={target} onChange={setTarget} data={[...new Set([...(context?.rules||[]).filter(r=>r.enabled).map(r=>r.targetName),...names])]} maxLength={120} disabled={busy} comboboxProps={{withinPortal:false}} placeholder="메뉴를 선택하거나 새 이름 입력" description="기존 메뉴를 고르거나 새 이름을 직접 입력하세요."/>
          <div className="composition-quantity"><div><label htmlFor="menu-multiplier">들어있는 수량</label><QuantityField id="menu-multiplier" aria-label="들어있는 수량" value={multiplier} onChange={setMultiplier} min={1} max={100} disabled={busy}/></div><Select disabled={busy} label="수량 단위" value={unit} onChange={setUnit} options={MENU_UNITS}/></div>
        </section>
      </div>
      <div className="menu-edit-preview composition-preview" aria-live="polite"><span>저장 후 판매 집계</span><div className="composition-equation"><span>{source||'판매 상품'} <b>1{saleUnit}</b></span><ArrowDown size={16} aria-hidden="true"/><strong>{targetName||'집계할 메뉴'} {validQuantity?`${multiplier}${unit}`:'· 수량을 입력하세요'}</strong></div><p>전체 이력 {num(quantity)}{sourceUnit} → <b>{validQuantity?`${num(quantity*multiplier)}${unit}`:'수량 입력 필요'}</b></p><p>매출 금액 {money(sum(original,'amount'))}은 그대로 유지합니다.</p></div>
      <div className="composition-help"><p>다른 상품도 같은 집계 메뉴·단위로 지정하면 함께 합산합니다. 낱개 상품은 들어있는 수량을 1로 지정하세요.</p>{linkedSources.length>0&&<p className="composition-linked">같이 모을 상품: {linkedSources.map(rule=>rule.sourceName).join(', ')}</p>}<p>과거 전체 기간과 앞으로 들어오는 같은 원본 상품에 적용됩니다. 준비표에도 이름·수량 환산을 적용합니다. 예측 재학습과 검증 오차는 원본 기준을 유지합니다.</p></div>
      {error&&<Alert color="red" role="alert">{error}</Alert>}{message&&<Alert icon={<Check size={16}/>} role="status">{message}</Alert>}
      <div className="menu-edit-actions"><Button className="primary" disabled={busy||!ready||!context?.saveRule||!source||!targetName||!validQuantity} onClick={()=>save()}><Save size={16}/>{busy?'저장 중…':'Firebase에 저장'}</Button><Button disabled={busy||!ready||!enabled} onClick={()=>save(true)}><RotateCcw size={15}/> 원본 집계로 되돌리기</Button></div>
      <p className="footnote">회원끼리 공유되는 설정입니다. 적용 설정 {revision?`${revision}차`:'없음'} · 같은 원본의 설정을 갱신하며 새 매출을 추가하지 않습니다.</p>
    </div>
  </Drawer>;
}
