import {menuUnit,menuKey} from '../../../../services/sohee/menu-rules.mjs';
// Pure calculations over the authenticated snapshot. No fetching or storage.
const DAY = 86400000;
const epoch = date => Date.parse(date + 'T00:00:00Z');
export const shiftDate = (date, days) => new Date(epoch(date) + days * DAY).toISOString().slice(0, 10);
export const total = (rows, key) => rows.reduce((value, row) => value + Number(row[key] || 0), 0);
export function dateRange(start, end) {
  if (!start || !end || start > end || !Number.isFinite(epoch(start)) || !Number.isFinite(epoch(end))) return [];
  const count = Math.round((epoch(end) - epoch(start)) / DAY) + 1;
  return Array.from({ length: count }, (_, index) => shiftDate(start, index));
}
export const initialSelection = data => ({ mode: 'month', month: data.end.slice(0, 7), dates: [], range: [null, null], includePartial: true });
export function selectedDates(data, selection) {
  let dates;
  if (selection.mode === 'multiple') dates = selection.dates;
  else if (selection.mode === 'range') dates = dateRange(selection.range[0], selection.range[1] || selection.range[0]);
  else if (selection.mode === 'all') dates = dateRange(data.start, data.end);
  else {
    const [year, month] = selection.month.split('-').map(Number);
    dates = dateRange(selection.month + '-01', new Date(Date.UTC(year, month, 0)).toISOString().slice(0,10));
  }
  return [...new Set(dates)].filter(date => date >= data.start && date <= data.end).sort();
}
export function selectionLabel(selection) {
  if (selection.mode === 'month') return selection.month + ' · 월 전체';
  if (selection.mode === 'all') return '전체 수집 기간';
  const dates = selection.mode === 'multiple' ? [...selection.dates].sort() : selection.range.filter(Boolean);
  if (!dates.length) return '날짜를 선택하세요';
  return selection.mode === 'multiple' ? dates.length===1 ? `${dates[0]} · 1일 선택` : `${dates[0]} 외 ${dates.length - 1}일 · ${dates.length}일 선택` : dates.join(' – ');
}
function summarize(rows) {
  const amount = total(rows, 'amount'), payments = total(rows, 'payment_count'), recordDays = rows.filter(row => row.record_day).length;
  return { amount, payments, recordDays, days: rows.length, perPayment: payments > 0 ? amount / payments : null, perRecordDay: recordDays ? amount / recordDays : null };
}
export function analyzeSelection(data, selection) {
  const dates = selectedDates(data, selection), chosen = new Set(dates), byDate = new Map(data.daily.map(row => [row.date, row]));
  const raw = data.daily.filter(row => chosen.has(row.date)).sort((a,b) => a.date.localeCompare(b.date));
  const rows = raw.filter(row => selection.includePartial || !row.partial_day), complete = rows.filter(row => !row.partial_day);
  const currentDates = dates.filter(date => !byDate.get(date)?.partial_day);
  const span = currentDates.length ? Math.round((epoch(currentDates.at(-1)) - epoch(currentDates[0])) / DAY) + 1 : 0;
  const previousDates = currentDates.map(date => shiftDate(date, -span));
  const previous = previousDates.map(date => byDate.get(date)).filter(row => row && !row.partial_day);
  const currentStats = summarize(complete), previousStats = summarize(previous);
  const comparable = currentDates.length > 0 && complete.length === currentDates.length && previous.length === currentDates.length;
  const pct = (now, before) => comparable && Number.isFinite(now) && before > 0 ? (now / before - 1) * 100 : null;
  const completeRecorded = complete.filter(row => row.record_day);
  return { ...summarize(rows), dates, rows, complete, partialDays: raw.filter(row => row.partial_day).length,
    includedPartialDays: rows.filter(row => row.partial_day).length, missingDays: dates.length - raw.length,
    bestDay: [...completeRecorded].sort((a,b) => b.amount - a.amount)[0] || null,
    weekday: Array.from({length:7}, (_, weekday) => ({weekday, ...summarize(complete.filter(row => row.weekday === weekday))})),
    comparison: { current: currentStats, previous: previousStats, previousDates, comparable,
      delta: comparable ? currentStats.amount - previousStats.amount : null,
      percent: pct(currentStats.amount, previousStats.amount), perDayPercent: pct(currentStats.perRecordDay, previousStats.perRecordDay),
      sourceChanged: [...new Set(complete.map(row => row.source))].sort().join() !== [...new Set(previous.map(row => row.source))].sort().join() },
  };
}
export function selectedMenuData(data, selection) {
  const analysis = analyzeSelection(data, selection), dates = new Set(analysis.rows.filter(row => !row.partial_day && row.source === 'toss').map(row => row.date));
  const detail = data.menu_toss.filter(row => dates.has(row.date));
  const wholeMonths = ['month', 'all'].includes(selection.mode) && (selection.includePartial || !analysis.partialDays);
  const monthly = data.menu_monthly.filter(row => selection.mode === 'all' || row.month === selection.month);
  return { rows: wholeMonths ? monthly : detail, detail, dailyOnly: !wholeMonths,
    omittedPayhereDays: wholeMonths ? 0 : analysis.rows.filter(row => row.source === 'payhere').length,
    omittedPartialDays: wholeMonths ? 0 : analysis.includedPartialDays,
  };
}
export function groupMenus(rows, key = 'menu_group') {
  const groups=new Map(),unitsByName=new Map();
  for(const row of rows){const name=row[key],unit=menuUnit(row),id=menuKey(name,unit),current=groups.get(id)||{menu:name,menu_name:name,menu_key:id,unit,amount:0,quantity:0};current.amount+=row.amount;current.quantity+=row.quantity;groups.set(id,current);if(!unitsByName.has(name))unitsByName.set(name,new Set());unitsByName.get(name).add(unit);}
  return [...groups.values()].map(row=>({...row,menu:unitsByName.get(row.menu_name).size>1?`${row.menu_name} · ${row.unit}`:row.menu_name,average:row.quantity>0?row.amount/row.quantity:null}));
}
export function dayMenuDetails(data,date){
  const day=data.daily.find(row=>row.date===date);
  if(!day)return {day:null,rows:[],reason:'해당 날짜의 매출 기록이 없습니다.'};
  if(day.source!=='toss')return {day,rows:[],reason:'페이히어는 메뉴별 날짜 기록이 없어 이 날의 판매 메뉴를 만들 수 없습니다. 월별 메뉴 판매를 확인해주세요.'};
  if(day.partial_day)return {day,rows:[],reason:'부분일의 메뉴 상세는 검증된 저장 집계에서 제외되어 있습니다. 새 토스 원본으로 완결일을 갱신한 뒤 확인할 수 있습니다.'};
  const rows=groupMenus(data.menu_toss.filter(row=>row.date===date));
  return {day,rows:rows.sort((a,b)=>b.amount-a.amount),reason:rows.length?'':'이 날짜에 저장된 메뉴 상세가 없습니다. 상세가 없다는 이유만으로 판매 0개로 판단하지 않습니다.'};
}
export function selectedBulk(data, selection) {
  const analysis = analyzeSelection(data, selection), dates = new Set(analysis.complete.filter(row => row.source === 'toss').map(row => row.date));
  if (!Array.isArray(data.bulk)) return null;
  const bulk = data.bulk.filter(row => dates.has(row.date));
  const amount = total(bulk, 'amount'), sales = total(analysis.complete.filter(row => row.source === 'toss'), 'amount');
  return { amount, count: new Set(bulk.map(row => row.order_key)).size, sales, without: sales - amount, share: sales > 0 ? amount / sales * 100 : null, days:dates.size };
}
