import {menuKey,menuUnit,validateMenuRule} from '../../../../services/sohee/menu-rules.mjs';

// Read-only, browser-local analysis of the authenticated snapshot. All parameters
// are fixed before evaluation; no raw records or stored forecasts are rewritten.
export const PREP_POLICIES=Object.freeze([
  {key:'low',label:'남김 조심',quantile:0.35},
  {key:'balanced',label:'균형',quantile:0.5},
  {key:'high',label:'부족 조심',quantile:0.7},
]);
const DAY=86400000,WINDOW=56,BASELINE=28,MIN_EVALUATIONS=10;
const dayNumber=date=>Date.parse(`${date}T00:00:00Z`)/DAY;
const iso=day=>new Date(day*DAY).toISOString().slice(0,10);
const weekday=date=>(new Date(`${date}T00:00:00Z`).getUTCDay()+6)%7;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const total=values=>values.reduce((sum,value)=>sum+value,0);
const mean=values=>values.length?total(values)/values.length:null;
const normalizeUnit=unit=>unit.replace('팩(','팩 (');
const sourceKey=(date,name)=>JSON.stringify([date,name]);
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(dayNumber(value))&&iso(dayNumber(value))===value;

/** The lower empirical quantile, rounded up to whole units only at preparation. */
export function weightedQuantile(distribution,probability){
  const rows=distribution.filter(row=>finite(row.quantity)&&finite(row.weight)&&row.weight>0).sort((a,b)=>a.quantity-b.quantity);
  const sum=total(rows.map(row=>row.weight));
  if(!sum)return null;
  const threshold=Math.max(0,Math.min(1,probability))*sum;
  let cumulative=0;
  for(const row of rows){cumulative+=row.weight;if(cumulative+1e-12>=threshold)return row.quantity;}
  return rows.at(-1).quantity;
}

/** In-sample scenario comparison, NOT measured waste or recovered lost demand. */
export function policyRisk(plan,target){
  const rows=plan?.distribution||[],weight=total(rows.map(row=>row.weight));
  if(!rows.length||!weight||!finite(target)||target<0)return {n:0,excess:null,shortfall:null,exceed_pct:null,covered_pct:null,basis:'training_sales'};
  const excess=total(rows.map(row=>Math.max(0,target-row.quantity)*row.weight))/weight;
  const shortfall=total(rows.map(row=>Math.max(0,row.quantity-target)*row.weight))/weight;
  const exceed=total(rows.filter(row=>row.quantity>target).map(row=>row.weight))/weight*100;
  return {n:rows.length,excess,shortfall,exceed_pct:exceed,covered_pct:100-exceed,basis:'training_sales'};
}

function fit(history,origin,targetWeekday){
  const end=dayNumber(origin),recent=history.filter(row=>row.day<=end&&row.day>end-WINDOW);
  const baselineRows=recent.filter(row=>row.day>end-BASELINE);
  const same=recent.filter(row=>row.weekday===targetWeekday);
  if(!recent.length||!baselineRows.length||!same.length)return null;
  const baseline=mean(baselineRows.map(row=>row.quantity));
  const strength=same.length/(same.length+4);
  const candidate=strength*mean(same.map(row=>row.quantity))+(1-strength)*baseline;
  return {recent,baselineRows,same,baseline,candidate,strength};
}
function methodFor(prior){
  const rows=prior.slice(-28);
  if(rows.length<MIN_EVALUATIONS)return 'recent_mean';
  const base=total(rows.map(row=>Math.abs(row.actual-row.baseline)));
  const candidate=total(rows.map(row=>Math.abs(row.actual-row.candidate)));
  return base>0&&candidate<base*0.95?'weekday_shrink':'recent_mean';
}
function distributionFor(fitResult,method){
  const {baselineRows,same,strength}=fitResult,weights=new Map();
  for(const row of baselineRows)weights.set(row.date,{date:row.date,quantity:row.quantity,weight:(method==='weekday_shrink'?1-strength:1)/baselineRows.length});
  if(method==='weekday_shrink')for(const row of same){
    const old=weights.get(row.date);
    weights.set(row.date,{date:row.date,quantity:row.quantity,weight:(old?.weight||0)+strength/same.length});
  }
  return [...weights.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function quantities(distribution){
  return Object.fromEntries(PREP_POLICIES.map(policy=>[policy.key,Math.max(0,Math.ceil(weightedQuantile(distribution,policy.quantile)-1e-10))]));
}
function summarize(rows){
  const n=rows.length,actual=total(rows.map(row=>row.actual));
  const baselinePrep=rows.map(row=>Math.max(0,Math.round(row.baseline)));
  const baselineErrors=rows.map((row,index)=>baselinePrep[index]-row.actual);
  const baseline_prep={n,mae:mean(baselineErrors.map(Math.abs)),
    excess:mean(baselineErrors.map(error=>Math.max(0,error))),shortfall:mean(baselineErrors.map(error=>Math.max(0,-error))),
    mean_quantity:mean(baselinePrep),exceed_pct:n?baselineErrors.filter(error=>error<0).length/n*100:null,
    covered_pct:n?baselineErrors.filter(error=>error>=0).length/n*100:null};
  const policies=Object.fromEntries(PREP_POLICIES.map(policy=>{
    const errors=rows.map(row=>row[policy.key]-row.actual);
    return [policy.key,{n,quantile:policy.quantile,mae:mean(errors.map(Math.abs)),
      excess:mean(errors.map(error=>Math.max(0,error))),shortfall:mean(errors.map(error=>Math.max(0,-error))),
      mean_quantity:mean(rows.map(row=>row[policy.key])),
      exceed_pct:n?errors.filter(error=>error<0).length/n*100:null,
      covered_pct:n?errors.filter(error=>error>=0).length/n*100:null,
      pinball:mean(errors.map(error=>error>=0?(1-policy.quantile)*error:-policy.quantile*error))}];
  }));
  const error=total(rows.map(row=>Math.abs(row.actual-row.predicted)));
  return {n,mae:n?error/n:null,baseline_mae:mean(rows.map(row=>Math.abs(row.actual-row.baseline))),
    candidate_mae:mean(rows.map(row=>Math.abs(row.actual-row.candidate))),wape:actual>0?error/actual*100:null,
    actual_quantity:actual,baseline_prep,policies,weekday_selected:n?rows.filter(row=>row.method==='weekday_shrink').length:0};
}

function hourProfile(fitResult,method,expected){
  if(!fitResult)return {hours:Array(24).fill(0),hours_available:false,hour_sample_days:0,hour_excluded_bulk_days:0,hour_basis:'no_sample'};
  // Bulk rows have no hour in the snapshot. Never subtract their quantities from
  // guessed hours: exclude the whole affected day from the hourly profile.
  const clean=fitResult.recent.filter(row=>!row.bulk_affected&&row.hours_available);
  const same=clean.filter(row=>row.weekday===fitResult.same[0].weekday);
  const selected=method==='weekday_shrink'&&same.length>=2?same:clean;
  const hours=Array.from({length:24},(_,hour)=>total(selected.map(row=>row.hours[hour])));
  const all=total(hours),available=selected.length>0&&all>0;
  return {hours:available?hours.map(value=>value/all*expected):Array(24).fill(0),hours_available:available,
    hour_sample_days:selected.length,hour_excluded_bulk_days:fitResult.recent.filter(row=>row.bulk_affected).length,
    hour_basis:available?(selected===same?'same_weekday_clean_sales':'recent_clean_sales'):'no_sample'};
}

/**
 * Forecast observed regular sales after explicit menu composition rules.
 * `cutoff` may move backwards for QA, but never beyond the saved complete day.
 * No network, storage, clock, or browser side effects occur in this function.
 */
export function buildDemandModel(rawData={},rules=[],options={}){
  const daily=rawData.daily||[],saved=rawData.complete_through||rawData.forecast?.cutoff||'';
  const completeDates=daily.filter(row=>row.source==='toss'&&!row.partial_day&&validDate(row.date)).map(row=>row.date).sort();
  const savedCutoff=validDate(saved)?saved:completeDates.at(-1)||null;
  const cutoff=savedCutoff&&validDate(options.cutoff)?(options.cutoff<savedCutoff?options.cutoff:savedCutoff):savedCutoff;
  const active=new Map(rules.filter(rule=>rule.enabled).map(rule=>[rule.sourceName,validateMenuRule(rule)]));
  const recorded=new Map();
  for(const row of daily)if(row.source==='toss'&&!row.partial_day&&row.record_day===true&&validDate(row.date)&&cutoff&&row.date<=cutoff)recorded.set(row.date,row);
  // A recorded payment date does not prove that menu detail was imported.
  // Zero dessert sales are observed only when some valid menu detail exists.
  const detailedDates=new Set((rawData.menu_toss||[]).filter(row=>recorded.has(row.date)&&typeof row.menu_original==='string'&&row.menu_original.length>0&&finite(row.quantity)).map(row=>row.date));
  const eligible=new Map([...recorded].filter(([date])=>detailedDates.has(date)));
  const observedDates=[...eligible.keys()].sort();
  const oldPlans=new Map((rawData.forecast?.plans||[]).map(plan=>[plan.menu,plan]));
  const categories=new Map();
  for(const row of rawData.menu_monthly||[])if(row.source==='toss'&&row.category==='디저트')categories.set(row.menu_original,row.category);
  const dessertSources=new Set([...oldPlans.keys(),...categories.keys()].filter(name=>!(/선물|세트|포장/.test(name))&&name!=='ㅇㅇ'));
  const sourceTotals=new Map(),sourceHours=new Map(),first=new Map(),seenSources=new Set(),bulkTotals=new Map(),bulkDates=new Set(),unknownBulkDates=new Set();
  for(const row of rawData.bulk||[])if(eligible.has(row.date)){
    bulkDates.add(row.date);
    if(typeof row.menu_original!=='string'||!finite(row.quantity)){unknownBulkDates.add(row.date);continue;}
    const key=sourceKey(row.date,row.menu_original);bulkTotals.set(key,(bulkTotals.get(key)||0)+row.quantity);
  }
  for(const row of rawData.menu_toss||[])if(eligible.has(row.date)&&dessertSources.has(row.menu_original)&&finite(row.quantity)){
    seenSources.add(row.menu_original);
    const key=sourceKey(row.date,row.menu_original);sourceTotals.set(key,(sourceTotals.get(key)||0)+row.quantity);
    if(Number.isInteger(row.hour)&&row.hour>=0&&row.hour<24){
      if(!sourceHours.has(key))sourceHours.set(key,Array(24).fill(0));
      sourceHours.get(key)[row.hour]+=row.quantity;
    }
  }
  // Source launch metadata is descriptive; mapped groups may also contain a
  // refund-only source. Keep that source and clip only after group conversion.
  for(const [key,value] of sourceTotals){const [date,name]=JSON.parse(key);if(!unknownBulkDates.has(date)&&Math.max(0,value-(bulkTotals.get(key)||0))>0&&(!first.has(name)||date<first.get(name)))first.set(name,date);}
  const groups=new Map();
  for(const name of dessertSources){
    if(!seenSources.has(name))continue;
    const rule=active.get(name),sourceUnit=normalizeUnit(oldPlans.get(name)?.unit||menuUnit({menu_original:name}));
    const unit=rule?(rule.unit==='팩'&&sourceUnit.includes('4개')?'팩 (4개)':rule.unit):sourceUnit;
    const menu=rule?.targetName||name,key=menuKey(menu,unit);
    if(!groups.has(key))groups.set(key,{key,menu,unit,physical_factor:unit==='개'?1:unit.includes('4개')?4:null,sources:[]});
    groups.get(key).sources.push({source_menu:name,source_unit:sourceUnit,multiplier:rule?.multiplier||1,first_observed:first.get(name)||null});
  }
  const menus=[],plans=[],metrics=[],backtest=[],validationStart=cutoff?iso(dayNumber(cutoff)-27):null;
  for(const group of groups.values()){
    const allHistory=observedDates.filter(date=>!unknownBulkDates.has(date)).map(date=>{
      let quantity=0,bulkQuantity=0;const hours=Array(24).fill(0);let available=false;
      for(const source of group.sources){
        const key=sourceKey(date,source.source_menu),bulk=bulkTotals.get(key)||0;
        quantity+=((sourceTotals.get(key)||0)-bulk)*source.multiplier;
        bulkQuantity+=bulk*source.multiplier;
        const sourceHour=sourceHours.get(key);
        if(sourceHour){available=true;sourceHour.forEach((value,hour)=>{hours[hour]+=value*source.multiplier;});}
      }
      return {date,day:dayNumber(date),weekday:weekday(date),quantity:Math.max(0,quantity),bulk_quantity:bulkQuantity,
        bulk_affected:bulkDates.has(date),hours_available:available,hours:hours.map(value=>Math.max(0,value))};
    });
    const start=allHistory.find(row=>row.quantity>0)?.date;
    if(!start)continue;
    const history=allHistory.filter(row=>row.date>=start);
    const prior=[],evaluated=[];
    for(const row of history){
      const origin=iso(row.day-1),fitted=fit(history,origin,row.weekday);
      if(!fitted||fitted.recent.length<14||fitted.same.length<2)continue;
      const method=methodFor(prior),distribution=distributionFor(fitted,method);
      const prediction={date:row.date,train_end:origin,key:group.key,menu:group.menu,unit:group.unit,actual:row.quantity,
        predicted:method==='weekday_shrink'?fitted.candidate:fitted.baseline,baseline:fitted.baseline,candidate:fitted.candidate,method,
        ...quantities(distribution)};
      // Selection sees only errors already observed strictly before this target.
      if(row.date>=validationStart)evaluated.push(prediction);
      prior.push(prediction);
    }
    const selectedMethod=methodFor(prior),lastSale=history.filter(row=>row.quantity>0).at(-1)?.date||null;
    const menu={...group,history,first_observed:start,last_sale:lastSale};menus.push(menu);
    metrics.push({...group,...summarize(evaluated),method:selectedMethod,
      method_label:selectedMethod==='weekday_shrink'?'요일 보정 평균':'최근 28일 평균'});
    backtest.push(...evaluated);
    for(let wd=0;wd<7;wd++){
      const fitted=fit(history,cutoff,wd),recent=history.filter(row=>row.day>dayNumber(cutoff)-WINDOW);
      const same=recent.filter(row=>row.weekday===wd),distribution=fitted?distributionFor(fitted,selectedMethod):[];
      const expected=fitted?(selectedMethod==='weekday_shrink'?fitted.candidate:fitted.baseline):null;
      const sellingDays=recent.filter(row=>row.quantity>0).length;
      const stale=!lastSale||dayNumber(cutoff)-dayNumber(lastSale)>=14;
      const status=!fitted?'표본 없음':same.length<4||sellingDays<8||distribution.length<8||stale?'참고용':'준비 기준';
      const amounts=distribution.length?quantities(distribution):{low:null,balanced:null,high:null};
      plans.push({...group,weekday:wd,expected,baseline_expected:fitted?.baseline??null,candidate_expected:fitted?.candidate??null,
        ...amounts,base:amounts.balanced,distribution,method:selectedMethod,method_label:selectedMethod==='weekday_shrink'?'요일 보정 평균':'최근 28일 평균',
        sample_days:recent.length,distribution_days:distribution.length,same_weekday_days:same.length,selling_days:sellingDays,
        history_min:same.length?Math.min(...same.map(row=>row.quantity)):null,history_max:same.length?Math.max(...same.map(row=>row.quantity)):null,
        first_observed:start,last_observed:lastSale,last_sale:lastSale,stale,status,start:recent[0]?.date||null,end:cutoff,
        recent_quantity:total(recent.filter(row=>row.day>dayNumber(cutoff)-BASELINE).map(row=>row.quantity)),
        manual_key:JSON.stringify([group.key,wd,group.sources.map(source=>[source.source_menu,source.multiplier]).sort()]),
        ...hourProfile(fitted,selectedMethod,expected)});
    }
  }
  const unitNames=[...new Set(metrics.map(row=>row.unit))];
  const byUnit=unitNames.map(unit=>({unit,...summarize(backtest.filter(row=>row.unit===unit))}));
  const unitsByName=new Map();
  for(const menu of menus){if(!unitsByName.has(menu.menu))unitsByName.set(menu.menu,new Set());unitsByName.get(menu.menu).add(menu.unit);}
  for(const plan of plans)plan.control_name=unitsByName.get(plan.menu).size>1?`${plan.menu} · ${plan.unit}`:plan.menu;
  return {cutoff,window_days:WINDOW,baseline_days:BASELINE,policies:PREP_POLICIES.map(policy=>({...policy})),menus,
    plans:plans.sort((a,b)=>a.weekday-b.weekday||(b.expected||0)-(a.expected||0)),metrics,backtest,
    observed_days:observedDates.length,observed_weekdays:[...new Set(observedDates.filter(date=>dayNumber(date)>dayNumber(cutoff)-WINDOW).map(weekday))].sort(),
    validation:{start:validationStart,end:cutoff,n:backtest.length,selection:'prequential',min_prior_evaluations:MIN_EVALUATIONS,minimum_gain:0.05,by_unit:byUnit},
    excluded:{partial_days:daily.filter(row=>row.source==='toss'&&row.partial_day).length,
      non_record_days:daily.filter(row=>row.source==='toss'&&!row.partial_day&&!row.record_day&&cutoff&&row.date<=cutoff).length,
      bulk_dates:bulkDates.size,unknown_bulk_dates:unknownBulkDates.size,missing_detail_days:recorded.size-eligible.size},
    limitations:['observed_sales_not_demand','no_stockout_or_discard_log','no_unit_cost','unknown_item_availability','hourly_bulk_dates_excluded'],
  };
}
