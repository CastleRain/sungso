// User-authored presentation rules. Immutable imported sales are never rewritten.
export const MENU_RULES_COLLECTION='sohee_menu_rules';
export const MENU_UNITS=['개','잔','팩','세트'];
export function validateMenuRule(value){
  if(!value||typeof value.sourceName!=='string'||!value.sourceName.trim()||value.sourceName.length>160||/[\x00-\x1f]/.test(value.sourceName))throw new Error('원본 메뉴 이름을 확인해주세요.');
  if(typeof value.targetName!=='string'||!value.targetName.trim()||value.targetName.trim().length>120||/[\x00-\x1f]/.test(value.targetName))throw new Error('집계할 메뉴 이름을 120자 이내로 입력해주세요.');
  if(!MENU_UNITS.includes(value.unit)||!Number.isInteger(value.multiplier)||value.multiplier<1||value.multiplier>100||typeof value.enabled!=='boolean')throw new Error('단위와 수량 배수(1–100)를 확인해주세요.');
  return {sourceName:value.sourceName,targetName:value.targetName.trim(),unit:value.unit,multiplier:value.multiplier,enabled:value.enabled};
}
export const menuUnit=row=>row.sales_unit||((row.menu_original||row.menu||'').includes('4구')?'팩 (4개)':'개');
export const menuKey=(name,unit)=>JSON.stringify([name,unit]);
export function applyMenuRules(data,rules=[]){
  if(!data)return data;
  const active=new Map(rules.filter(r=>r.enabled).map(r=>[r.sourceName,validateMenuRule(r)]));
  const mapRow=row=>{const rule=active.get(row.menu_original);return rule?{...row,original_menu:row.menu_original,original_quantity:row.quantity,original_unit:menuUnit(row),menu_original:rule.targetName,menu_group:rule.targetName,sales_unit:rule.unit,quantity:row.quantity*rule.multiplier,menu_multiplier:rule.multiplier}:row;};
  return {...data,menu_monthly:data.menu_monthly.map(mapRow),menu_toss:data.menu_toss.map(mapRow)};
}
