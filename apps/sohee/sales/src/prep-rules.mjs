import {menuKey,validateMenuRule} from '../../../../services/sohee/menu-rules.mjs';

// Convert the existing forecast for display. Never mutate or retrain it.
export function projectPrepPlans(plans,rules=[]){
  const active=new Map(rules.filter(rule=>rule.enabled).map(rule=>[rule.sourceName,validateMenuRule(rule)]));
  return plans.map(plan=>{
    const rule=active.get(plan.menu),factor=rule?.multiplier||1;
    // A rename that keeps packs also keeps their known four-piece size.
    const unit=rule?(rule.unit==='팩'&&plan.unit.includes('4개')?'팩 (4개)':rule.unit):plan.unit.replace('팩(', '팩 (');
    return {...plan,source_menu:plan.menu,source_unit:plan.unit,source_expected:plan.expected,multiplier:factor,
      physical_factor:unit==='개'?1:unit.includes('4개')?4:null,
      menu:rule?.targetName||plan.menu,unit,expected:plan.expected*factor,
      hours:plan.hours.map(value=>value*factor),history_min:plan.history_min*factor,history_max:plan.history_max*factor};
  });
}

// Sum only compatible display quantities; sample counts and error metrics are
// not additive. Original rows remain available as the calculation evidence.
export function groupPrepPlans(plans){
  const groups=new Map();
  for(const plan of plans){
    const key=menuKey(plan.menu,plan.unit),id=JSON.stringify([plan.weekday,key]);
    if(!groups.has(id))groups.set(id,{menu:plan.menu,unit:plan.unit,physical_factor:plan.physical_factor,key,weekday:plan.weekday,expected:0,hours:Array(24).fill(0),sources:[]});
    const group=groups.get(id);group.expected+=plan.expected;group.hours=group.hours.map((value,hour)=>value+plan.hours[hour]);group.sources.push(plan);
  }
  const units=new Map();for(const group of groups.values()){if(!units.has(group.menu))units.set(group.menu,new Set());units.get(group.menu).add(group.unit);}
  return [...groups.values()].map(group=>{
    const samples=group.sources.map(plan=>plan.same_weekday_days),min=Math.min(...samples),max=Math.max(...samples);
    return {...group,control_name:units.get(group.menu).size>1?`${group.menu} · ${group.unit}`:group.menu,status:group.sources.some(plan=>plan.status==='준비 기준')?'준비 기준':'참고용',
      sample_label:min===max?String(min):`${min}–${max}`,
      manual_key:JSON.stringify([group.key,group.sources.map(plan=>[plan.source_menu,plan.multiplier]).sort((a,b)=>a[0].localeCompare(b[0]))])};
  }).sort((a,b)=>b.expected-a.expected);
}
