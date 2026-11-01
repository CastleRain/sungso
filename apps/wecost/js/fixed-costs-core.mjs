export const OWNERS = [
  { id: 'sungwoo', label: '성우', icon: 'coins', tone: 'rose' },
  { id: 'sohee', label: '소희', icon: 'wallet', tone: 'cream' },
  { id: 'shared', label: '공동', icon: 'house', tone: 'sage' },
];
export const FIELDS = ['name', 'owner', 'category', 'amount', 'frequency', 'day', 'month', 'startDate', 'endDate', 'paymentMethod', 'memo', 'active', 'iconId'];
export const CATEGORY_IDS = ['communication','housing','utilities','health','transport','subscriptions','digital','food','housekeeping','beauty','exercise','learning','pets','family','finance','other'];
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const localMonth = (date = new Date()) => localDate(date).slice(0, 7);
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d] = value.split('-').map(Number), date = new Date(y,m - 1,d,12);
  return y >= 1900 && y <= 2199 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}
export function emptyCost(owner = 'sungwoo') {
  return { name: '', owner, category: 'other', amount: null, frequency: 'monthly', day: null, month: null, startDate: '', endDate: '', paymentMethod: '', memo: '', active: true, iconId: '' };
}
export function validateCost(item) {
  for (const [key,max] of [['name',80],['paymentMethod',60],['memo',1000]]) {
    if (typeof item[key] !== 'string' || item[key].length > max || (key === 'name' && !item[key].trim())) throw Error(key === 'name' ? '항목명을 1~80자로 입력해주세요.' : '결제수단·메모 길이를 확인해주세요.');
  }
  if (!OWNERS.some(o => o.id === item.owner) || !CATEGORY_IDS.includes(item.category)) throw Error('담당자와 카테고리를 선택해주세요.');
  if (!Number.isSafeInteger(item.amount) || item.amount < 0 || item.amount > 1e10) throw Error('금액을 0원 이상, 100억원 이하의 원 단위 정수로 입력해주세요.');
  if (!['monthly','yearly'].includes(item.frequency)) throw Error('결제 주기를 확인해주세요.');
  if (item.day !== null && (!Number.isInteger(item.day) || item.day < 1 || item.day > 31)) throw Error('출금일은 1~31일 또는 미정으로 입력해주세요.');
  if (item.frequency === 'yearly' && (!Number.isInteger(item.month) || item.month < 1 || item.month > 12)) throw Error('연간 결제 월을 선택해주세요.');
  if (item.frequency === 'monthly' && item.month !== null) throw Error('월 결제에는 별도 월을 지정하지 않아요.');
  for (const date of [item.startDate,item.endDate]) if (date !== '' && !validDate(date)) throw Error('시작일과 종료일을 확인해주세요.');
  if (item.startDate && item.endDate && item.endDate < item.startDate) throw Error('종료일은 시작일 이후로 지정해주세요.');
  if (typeof item.active !== 'boolean' || typeof item.iconId !== 'string' || (item.iconId && !/^[a-z0-9-]{1,60}$/.test(item.iconId))) throw Error('상태와 아이콘을 확인해주세요.');
  return item;
}
export function costFields(item) { return Object.fromEntries(FIELDS.map(key => [key,item[key]])); }
export function costPatch(current, expected, values) {
  if (Object.keys(values).some(key => !FIELDS.includes(key))) throw Error('저장할 필드를 확인해주세요.');
  const patch = {};
  for (const [key,value] of Object.entries(values)) {
    if (value === expected[key]) continue;
    if ((current[key] ?? null) !== (expected[key] ?? null)) {
      const error = Error('다른 기기에서 같은 항목을 수정했어요. 최신 내용을 확인하고 다시 저장해주세요.');
      error.code = 'fixed/conflict'; throw error;
    }
    patch[key] = value;
  }
  validateCost({ ...current,...patch });
  return patch;
}
export function isActiveInMonth(item, month) {
  return item.active && (!item.startDate || item.startDate.slice(0,7) <= month) && (!item.endDate || item.endDate.slice(0,7) >= month);
}
export const monthlyCost = item => item.amount / (item.frequency === 'yearly' ? 12 : 1);
export function dueInMonth(item, month) {
  if (!/^\d{4}-\d{2}$/.test(month) || !isActiveInMonth(item,month) || !item.day) return null;
  const [y,m] = month.split('-').map(Number);
  if (item.frequency === 'yearly' && item.month !== m) return null;
  const last = new Date(y,m,0,12).getDate();
  const date = `${month}-${String(Math.min(item.day,last)).padStart(2,'0')}`;
  if ((item.startDate && date < item.startDate) || (item.endDate && date > item.endDate)) return null;
  return date;
}
export function nextDue(item, from = localDate()) {
  if (!item.active || !item.day || !validDate(from)) return null;
  const start = item.startDate && item.startDate > from ? item.startDate : from;
  const [y,m] = start.split('-').map(Number);
  for (let i=0; i<13; i++) {
    const date = dueInMonth(item,localMonth(new Date(y,m - 1 + i,1,12)));
    if (date && date >= from) return date;
  }
  return null;
}
export function fixedSummary(items, month = localMonth()) {
  const active = items.filter(item => isActiveInMonth(item,month));
  const owners = OWNERS.map(owner => ({ ...owner, items: active.filter(item => item.owner === owner.id) }));
  for (const owner of owners) owner.total = owner.items.reduce((sum,item) => sum + monthlyCost(item),0);
  return { active, owners, total: owners.reduce((sum,o) => sum + o.total,0), scheduled: active.filter(item => dueInMonth(item,month)).reduce((sum,item) => sum + item.amount,0), unknownDays: active.filter(item => !item.day).length };
}
export function sortCosts(items, sort = 'amount', today = localDate()) {
  return [...items].sort((a,b) => (sort === 'date'
    ? (nextDue(a,today) || '9999').localeCompare(nextDue(b,today) || '9999')
    : monthlyCost(b) - monthlyCost(a)) || a.name.localeCompare(b.name,'ko') || a.id.localeCompare(b.id));
}
export function resolveIcon(item,catalog) {
  const desired = item.iconId || catalog.groups.find(group => group.id === item.category)?.defaultIcon;
  return catalog.icons.find(icon => icon.id === desired) || catalog.icons.find(icon => icon.id === catalog.fallback);
}
export function searchIcons(catalog, query = '', group = 'all') {
  const text = query.trim().toLocaleLowerCase().replaceAll(' ','');
  return catalog.icons.filter(icon => (group === 'all' || icon.group === group) && (!text || [icon.id,icon.label,...icon.keywords].some(s => s.toLocaleLowerCase().replaceAll(' ','').includes(text))));
}
