import { parseScenarioMoney } from '../../homehunt/js/financial-scenario-core.mjs';
export const FOCUS_REGIONS = Object.freeze([
  { id: 'yeongtong', label: '영통 · 망포', code: '41117', words: ['영통동','망포동'], center: [37.248,127.059], description: '수인분당선과 생활권을 함께 확인' },
  { id: 'giheung', label: '구성 · 마북', code: '41463', words: ['언남동','마북동','청덕동','보정동'], center: [37.292,127.126], description: '구성역·GTX 접근은 실제 경로로 확인' },
  { id: 'gwangju', label: '태전 · 고산', code: '41610', words: ['태전동','고산동'], center: [37.388,127.229], description: '역까지 이동과 출근시간을 먼저 확인' },
  { id: 'dongtan', label: '동탄2', code: '41590', words: ['청계동','영천동','오산동','목동','산척동','송동','장지동','신동'], center: [37.188,127.108], description: 'GTX·SRT·입주 물량을 함께 비교' },
  { id: 'segyo', label: '오산 · 세교', code: '41370', words: ['금암동','수청동','세교동','궐동','청학동','가수동'], center: [37.166,127.052], description: '분양 기회와 서울 출근 부담을 비교' },
]);
export const NAV = Object.freeze([
  ['board','판단 보드','layout-dashboard','OUR DECISION'],['find','집 찾기','map-search','HOME FINDER'],['records','내 후보 / 기록','bookmark','OUR COLLECTION'],['market','실거래 / 전망','chart-line','PRICE & OUTLOOK'],['supply','분양 / 청약','building-estate','NEW OPPORTUNITIES'],['model','모델 검증','flask','MODEL EVIDENCE'],['guide','사용 안내','help-circle','GETTING STARTED'],['connection','연결 상태','plug-connected','DATA CONNECTION'],
]);
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function number(value) { const n = Number(value); return value == null || value === '' || !Number.isFinite(n) ? null : n; }
export function money(value) { const n=number(value); if(n==null||n<=0)return '가격 확인 필요';const rounded=Math.round(n),eok=Math.floor(rounded/10000),rest=rounded%10000;return `${eok ? `${eok}억` : ''}${rest ? `${eok?' ':''}${rest.toLocaleString('ko-KR')}만원` : eok ? '원' : ''}`; }
export function moneyWon(value) { return number(value)==null?'입력 필요':Number(value)===0?'0원':money(Number(value)/10000); }
export function area(value) { return number(value)>0?`전용 ${Number(value).toFixed(1)}㎡ · ${(Number(value)/3.305785).toFixed(1)}평`:'면적 확인 필요'; }
export function parseMoneyManWon(value) { const won=parseScenarioMoney(value);return won==null?null:won/10000; }
export function candidateId(c) { return String(c?.catalogId || c?.id || c?.aptSeq || ''); }
export function price(c) { return number(c?.bestArea?.averagePriceManWon ?? c?.averagePriceManWon ?? c?.priceManWon ?? c?.meanPriceManWon); }
export function candidateArea(c) { return number(c?.bestArea?.areaM2 ?? c?.areaM2); }
export function normalizeSearch(text='') { return String(text).normalize('NFKC').toLowerCase().replace(/레미안/g,'래미안').replace(/[()·,\s-]+/g,''); }
export function queryMatches(c,text='') { const tokens=String(text).trim().split(/\s+/).map(normalizeSearch).filter(Boolean);const name=normalizeSearch([c.name,c.apartmentName,c.regionName,c.dong,c.address,...(c.aliases||[])].join(' '));return tokens.every(t=>name.includes(t)); }
export function focusMatches(c,id) { if(!id||id==='all')return true;const r=FOCUS_REGIONS.find(r=>r.id===id);return r?String(c.regionCode)===r.code&&r.words.some(w=>[c.address,c.dong,c.name].some(v=>String(v||'').includes(w))):String(c.regionCode)===id; }
export function filterCatalog(rows,conditions={},query='',focus='all',now=new Date()) { return rows.filter(c=>queryMatches(c,query)&&focusMatches(c,focus)&&(!conditions.minHouseholds||(number(c.households)!=null&&c.households>=conditions.minHouseholds))&&(!conditions.maxAgeYears||(number(c.builtYear)>0&&now.getFullYear()-c.builtYear<=conditions.maxAgeYears))); }
export function monthlySeries(rows=[],dealType='매매',exactArea=null) { const groups=new Map();rows.forEach(t=>{if(t.cancelled||t.dealType!==dealType||!(t.amountManWon>0)||!(t.areaM2>0)||!t.month)return;if(exactArea!=null&&Math.abs(Number(t.areaM2)-Number(exactArea))>.001)return;const key=t.month;const g=groups.get(key)||{month:key,count:0,total:0};g.count++;g.total+=Number(t.amountManWon);groups.set(key,g);});const sorted=[...groups.values()].sort((a,b)=>a.month.localeCompare(b.month));if(!sorted.length)return[];const index=m=>{const[y,n]=m.split('-').map(Number);return y*12+n-1;};const out=[];for(let i=index(sorted[0].month);i<=index(sorted.at(-1).month);i++){const month=`${Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`;const g=groups.get(month);out.push(g?{...g,average:g.total/g.count}:{month,count:0,total:null,average:null});}return out; }
export function latestThreeMonthAverage(rows=[],dealType='매매',exactArea=null) { const filtered=rows.filter(t=>t.dealType===dealType&&!t.cancelled&&t.amountManWon>0&&(exactArea==null||Math.abs(t.areaM2-exactArea)<.001)).sort((a,b)=>b.month.localeCompare(a.month));if(!filtered.length)return null;const [y,m]=filtered[0].month.split('-').map(Number),end=y*12+m;const sample=filtered.filter(t=>{const[a,b]=t.month.split('-').map(Number);return end-(a*12+b)<3;});return {average:sample.reduce((s,t)=>s+t.amountManWon,0)/sample.length,count:sample.length,month:filtered[0].month,low:Math.min(...sample.map(t=>t.amountManWon)),high:Math.max(...sample.map(t=>t.amountManWon))}; }
export function resolveForecast(rows,c,exactArea) { return (rows||[]).find(f=>String(f.catalogId||f.apartmentId||f.seriesId?.split(':')[0])===candidateId(c)&&Number(f.areaM2)===Number(exactArea))||null; }
const VALIDATED_STATUSES = new Set(['validated_reconstruction', 'validated_strict', 'validated', 'published']);
export function forecastDisplay(f, now = new Date()) {
  const reasons = [];
  if (!f) return { available:false, reasons:['이 단지·면적의 검증된 전망이 아직 없습니다.'] };
  if (!VALIDATED_STATUSES.has(f.status)) reasons.push(f.reason || (f.reasons || []).join(' ') || '검증 기준을 통과하지 못해 숫자 전망을 보류합니다.');
  if (!f.asOfMonth || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(f.asOfMonth)) reasons.push('전망 기준월을 확인하지 못했습니다.');
  else {
    const d = new Date(`${f.asOfMonth}-01T00:00:00+09:00`);
    if (!Number.isFinite(d.getTime()) || d > now) reasons.push('전망 기준월을 확인하지 못했습니다.');
    else if (now.getTime() - d.getTime() > 120 * 86400000) reasons.push('전망 기준월이 오래되어 재학습이 필요합니다.');
  }
  if (String(f.status || '').startsWith('validated_')) {
    const monthIndex = value => /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value || '') ? Number(value.slice(0,4)) * 12 + Number(value.slice(5)) : null;
    if (monthIndex(f.asOfMonth) == null || monthIndex(f.targetMonth) - monthIndex(f.asOfMonth) !== 6) reasons.push('6개월 전망 목표월을 확인하지 못했습니다.');
  }
  const p = f.probabilities || {}, up = number(p.up ?? p.rise), flat = number(p.flat ?? p.stable), down = number(p.down ?? p.fall);
  if ([up,flat,down].some(v => v == null || v < 0 || v > 1) || Math.abs(up + flat + down - 1) > 1e-6) reasons.push('검증된 방향 확률이 제공되지 않았습니다.');
  return { available:!reasons.length, reasons, up:up == null ? null : Math.round(up * 100), flat:flat == null ? null : Math.round(flat * 100), down:down == null ? null : Math.round(down * 100) };
}
export function priceAttractiveness(c,peers=[]) { const p=price(c),a=candidateArea(c);if(!(p>0&&a>0))return null;const sample=peers.filter(x=>x.regionCode===c.regionCode&&candidateArea(x)>0&&price(x)>0&&Math.abs(candidateArea(x)-a)<=5&&(!c.builtYear||!x.builtYear||Math.abs(c.builtYear-x.builtYear)<=10)).map(x=>price(x)/candidateArea(x));if(sample.length<5)return null;return {score:Math.round(sample.filter(v=>v>=p/a).length/sample.length*100),count:sample.length,basis:'같은 시군구·면적 ±5㎡·연식 ±10년 후보의 ㎡당 가격 위치'}; }
export function safeExternal(url) { try {const u=new URL(url);return u.protocol==='https:'?u.href:'#';}catch{return '#';} }
export function evaluateActualCommute(evaluations=[]) { const required=evaluations.filter(x=>x.d.required!==false);if(!required.length)return {decision:'pending',worstMinutes:null,weightedMeanMinutes:null};const known=required.filter(x=>x.route?.verified&&Number(x.route.durationMinutes)>0);const excluded=known.some(x=>x.route.durationMinutes>Number(x.d.individualMaxMinutes||x.d.maxMinutes||60));const complete=known.length===required.length;const weight=required.reduce((s,x)=>s+Number(x.d.daysPerWeek||x.d.weight||1),0);return {decision:excluded?'excluded':complete?'matched':'pending',worstMinutes:complete?Math.max(...known.map(x=>Number(x.route.durationMinutes))):null,weightedMeanMinutes:complete?required.reduce((s,x)=>s+Number(x.route.durationMinutes)*Number(x.d.daysPerWeek||x.d.weight||1),0)/weight:null}; }
export function progressLabel(p) { if(typeof p==='string')return p;const done=number(p?.completed??p?.completedMonths??p?.processed),total=number(p?.total??p?.totalMonths);return [p?.message||p?.label||p?.stage||'공식 자료 확인 중',done!=null&&total>0?`${done}/${total}`:''].filter(Boolean).join(' · '); }
export const FEATURE_LABELS = Object.freeze({momentum3:'3개월 가격 변화',momentum6:'6개월 가격 변화',momentum12:'12개월 가격 변화',volatility12:'12개월 가격 흔들림',volume3:'3개월 거래량',volumeChange6:'6개월 거래량 변화',activeMonthRatio12:'거래 발생 월 비율',priceSpread12:'거래가격 분포',baseRate:'기준금리',mortgageRate:'주담대 금리',listingCount:'현재·과거 매물 수',listingChange6:'매물 수 변화',askDealGap:'호가·실거래 차이',dsrLimit:'DSR 제한',ltvLimit:'LTV 제한',age:'연식',households:'세대수',areaM2:'전용면적',stationWalkMinutes:'역 도보시간',transferStation:'환승역 여부',lineCount:'이용 노선 수',businessAccessMinutes:'업무지역 접근시간',rentRatio:'전세가율',rentMomentum6:'전세가격 변화',rentVolume3:'전세 거래량',futureMoveIn:'예정 입주 물량',unsold:'미분양',completedUnsold:'준공 후 미분양',auctionNew:'경매 신규 건수',auctionOngoing:'경매 진행 건수',auctionSaleRatio:'낙찰률',auctionPriceRatio:'낙찰가율',auctionFailed:'유찰 횟수',auctionBidders:'응찰자 수'});
export const featureLabel = key => FEATURE_LABELS[key] || key;
export function validationContext(data = {}) {
  const operating = data.manifest || {};
  const experiment = data.backtest || {};
  const operatingVersion = operating.modelVersion || null;
  const experimentVersion = experiment.modelVersion || null;
  const operatingAsOfMonth = operating.asOfMonth || null;
  const experimentAsOfMonth = experiment.asOfMonth || null;
  // A monthly run of the same code version is not the same fitted model.
  const sameVersion = !!operatingVersion && operatingVersion === experimentVersion && operatingAsOfMonth === experimentAsOfMonth;
  const experimentGate = experiment.deploymentGate || (sameVersion ? operating.deploymentGate : null);
  const operatingPassed = operating.deploymentGate?.passed === true && VALIDATED_STATUSES.has(operating.status);
  return { operatingVersion, experimentVersion, operatingAsOfMonth, experimentAsOfMonth, sameVersion,
    experimentPassed: VALIDATED_STATUSES.has(experiment.status) && experimentGate?.passed === true,
    operatingPassed,
    retainedOperatingModel: operatingPassed && (!sameVersion || data.updateStatus?.previousValidatedRetained === true),
    experimentGate, status: experiment.status || 'unavailable' };
}
export function explainModelReason(reason='') {
  const text = String(reason);
  const reasons = [
    ['Macro F1 did not beat', '세 방향 예측력이 단순 기준 모델보다 충분히 좋아지지 않았어요.'],
    ['Change error did not improve', '가격 변화 오차가 단순 기준 모델보다 줄지 않았어요.'],
    ['uncertainty includes zero', '개선 효과가 통계적으로 분명하지 않아요.'],
    ['Under 30', '일부 방향의 실제 사례가 30건 미만이에요.'],
    ['Unseen-region', '다른 지역에 적용해도 잘 맞는지 아직 입증되지 않았어요.'],
    ['Latest normalized snapshots', '최신 자료로는 과거 신고·취소·정정 당시의 상태를 증명할 수 없어요. 일부 단지의 거래도 부족합니다.'],
    ['Base-rate decision history', '기준금리 변경 이력은 있지만 주담대 금리는 8개월만 확보했고 과거 공표 시점은 검증되지 않았어요.'],
    ['Construction year/area', '준공연도·면적은 재구성에 사용했지만 과거 세대수 변화는 확인하지 못했어요.'],
    ['Current station references', '과거 역 개통·환승 시점과 실제 도보 경로 이력이 없어 과거 모델에서 제외했어요.'],
    ['No compatible historical observations', '모델에 연결할 수 있는 공식 과거 이력이 아직 없어요. 공표일이 확인된 공식 CSV를 가져올 수 있습니다.'],
    ['No permitted free historical listing', '이용이 허용된 무료 과거 매물·호가 자료를 확보하지 못했어요. 임의로 만들지 않습니다.'],
  ];
  return reasons.find(([match]) => text.includes(match))?.[1] || text;
}
export function supplyBudgetDecision(notice,conditions) {
  const homes=Array.isArray(notice.homes)?notice.homes:[];
  if(!homes.length)return {status:'unknown',label:'주택형별 가격·전용면적 확인 필요'};
  const exactArea=h=>{const match=String(h.houseType||'').match(/^(\d+(?:\.\d+)?)(?:[A-Z가-힣]|$)/);return match?Number(match[1]):h.areaBasis==='exclusive'?number(h.areaM2):null;};
  const possible=homes.filter(h=>exactArea(h)==null||exactArea(h)>=conditions.minAreaM2);
  if(!possible.length)return {status:'excluded',label:'최소 전용면적 미충족'};
  if(possible.some(h=>exactArea(h)!=null&&number(h.maxPriceManWon)>0&&h.maxPriceManWon<=conditions.maxPriceManWon))return {status:'matched',label:'면적·최고 분양가 조건 확인'};
  return {status:'unknown',label:'주택형·층별 가격 원문 확인 필요'};
}
