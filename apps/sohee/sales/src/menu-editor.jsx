import React,{createContext,useContext,useEffect,useState} from 'react';
import {Drawer,Autocomplete,Alert} from '@mantine/core';
import {Check,RotateCcw,Save} from 'lucide-react';
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
  async function save(reset=false){setError('');setMessage('');try{const draft=validateMenuRule({sourceName:source,targetName:reset?source:target,unit:reset?(menuUnit({menu_original:source}).startsWith('팩')?'팩':'개'):unit,multiplier:reset?1:multiplier,enabled:!reset});setBusy(true);const result=await context.saveRule(draft,revision);setRevision(result.revision);setEnabled(result.enabled);if(reset){setTarget(source);setMultiplier(1);setUnit(draft.unit);}setMessage(reset?'원본 이름과 수량으로 되돌렸습니다.':'Firebase에 저장했습니다. 판매 분석에 적용되었습니다.');}catch(err){setError(err.message==='MENU_RULE_CONFLICT'?'다른 화면에서 이 메뉴 설정을 변경했습니다. 입력한 내용은 유지했습니다. 화면을 닫고 다시 열어 최신 설정을 확인해주세요.':'저장하지 못했습니다. 입력한 이름·단위·배수와 회원 연결을 확인하고 다시 시도해주세요.');}finally{setBusy(false);}}
  return <Drawer opened={opened} onClose={()=>!busy&&onClose()} title="메뉴 이름·수량 수정" size={570} position="right" closeButtonProps={{'aria-label':'메뉴 수정 닫기'}} withinPortal={false} trapFocus returnFocus closeOnEscape={!busy} closeOnClickOutside={!busy} withCloseButton={!busy} classNames={{content:'sales-drawer',header:'sales-drawer-header',body:'sales-drawer-body'}}>
    <p className="editor-intro">원본 메뉴를 어떤 이름과 단위로 모아볼지 직접 정하세요. 과거 전체 기간과 앞으로 같은 원본 이름으로 들어오는 자료에 적용됩니다.</p>
    <div className="menu-edit-form">
      <Select disabled={busy} label="원본 메뉴" value={source||null} onChange={choose} options={names}/>
      <Autocomplete label="집계할 메뉴 이름" value={target} onChange={setTarget} data={[...new Set([...names,...(context?.rules||[]).filter(r=>r.enabled).map(r=>r.targetName)])]} maxLength={120} disabled={busy} comboboxProps={{withinPortal:false}} description="같은 이름·같은 단위로 지정한 메뉴끼리 합산합니다."/>
      <div className="menu-edit-units"><Select disabled={busy} label="집계 단위" value={unit} onChange={setUnit} options={MENU_UNITS}/><div><label htmlFor="menu-multiplier">원본 1단위당 수량</label><QuantityField id="menu-multiplier" aria-label="원본 1단위당 수량" value={multiplier} onChange={setMultiplier} min={1} max={100} disabled={busy}/></div></div>
      <div className="menu-edit-preview" aria-live="polite"><span>저장하면 이렇게 집계합니다</span><strong>원본 1{menuUnit({menu_original:source})} → {target||'메뉴 이름'} {multiplier}{unit}</strong><p>전체 이력 {num(quantity)}{menuUnit({menu_original:source})} → <b>{num(quantity*multiplier)}{unit}</b></p><p>해당 원본의 메뉴 금액 {money(sum(original,'amount'))}은 그대로 유지합니다.</p></div>
      <p className="footnote">이름에 ‘4개’를 적는 것만으로 수량이 바뀌지 않습니다. 낱개 4개로 합치려면 집계 이름을 단품과 같게 정하고, 단위를 ‘개’, 수량을 ‘4’로 직접 설정하세요. 다른 이름에 연결된 규칙을 연쇄 적용하지 않습니다.</p>
      <p className="footnote">원본은 보존하며 매출 합계는 바꾸지 않습니다. 디저트 준비 초안·예측 검증은 기존 원본 메뉴와 학습 단위를 유지합니다.</p>
      {error&&<Alert color="red" role="alert">{error}</Alert>}{message&&<Alert icon={<Check size={16}/>} role="status">{message}</Alert>}
      <div className="menu-edit-actions"><Button className="primary" disabled={busy||!ready||!context?.saveRule||!source||!target.trim()} onClick={()=>save()}><Save size={16}/>{busy?'저장 중…':'Firebase에 저장'}</Button><Button disabled={busy||!ready||!enabled} onClick={()=>save(true)}><RotateCcw size={15}/> 원본 집계로 되돌리기</Button></div>
      <p className="footnote">회원끼리 공유되는 설정입니다. 적용 설정 {revision?`${revision}차`:'없음'} · 버튼을 누를 때만 저장합니다.</p>
    </div>
  </Drawer>;
}
