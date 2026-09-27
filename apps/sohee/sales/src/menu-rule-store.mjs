import {validateMenuRule} from '../../../../services/sohee/menu-rules.mjs';
// Same raw-name ID across all imports. Revision comparisons prevent lost edits.
export function createMenuRuleStore({list,transact,digest,getMember,timestamp}){
  let retired=false;
  const session=()=>{const member=getMember();if(retired||!member)throw new Error('MEMBER_REQUIRED');return ()=>{if(retired||getMember()?.uid!==member.uid||getMember()?.role!==member.role)throw new Error('STALE_SESSION');return member;};};
  return {
    clear(){retired=true;},
    async load(){const assert=session(),docs=await list();assert();const rules=[];const names=new Set();for(const item of docs){const value=validateMenuRule(item.data);if(!Number.isInteger(item.data.revision)||item.data.revision<1||item.id!==await digest(value.sourceName)||names.has(value.sourceName))throw new Error('INVALID_MENU_RULE');assert();names.add(value.sourceName);rules.push({...value,revision:item.data.revision});}return rules;},
    async save(draft,expectedRevision){const value=validateMenuRule(draft),assert=session();if(!Number.isInteger(expectedRevision)||expectedRevision<0)throw new Error('INVALID_REVISION');const id=await digest(value.sourceName);assert();const saved=await transact(id,previous=>{const member=assert();if((previous?.revision||0)!==expectedRevision)throw new Error('MENU_RULE_CONFLICT');if(previous&&previous.sourceName!==value.sourceName)throw new Error('INVALID_MENU_RULE');return {...value,revision:expectedRevision+1,updatedBy:member.uid,updatedAt:timestamp()};});assert();return {...value,revision:saved.revision};}
  };
}
