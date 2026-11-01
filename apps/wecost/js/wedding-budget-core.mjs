import { paymentState, validDate } from './wedding-core.mjs';

// A separate projection policy: item prices and actual payments remain intact.
export function validateWeddingBudget(value) {
  if (!value || Object.keys(value).some(k => !['excludedIds', 'incomes'].includes(k)) || !Array.isArray(value.excludedIds) || !Array.isArray(value.incomes)) throw Error('예산 범위와 예상 수입을 확인해주세요.');
  const id = v => typeof v === 'string' && v.length > 0 && v.length <= 500;
  if (value.excludedIds.length > 1000 || value.excludedIds.some(v => !id(v)) || new Set(value.excludedIds).size !== value.excludedIds.length) throw Error('제외 항목을 확인해주세요.');
  if (value.incomes.length > 100) throw Error('예상 수입은 100개까지 기록할 수 있어요.');
  const ids = new Set();
  for (const row of value.incomes) {
    if (!row || !id(row.id) || ids.has(row.id) || Object.keys(row).some(k => !['id', 'name', 'amount', 'date', 'itemId', 'enabled'].includes(k))) throw Error('수입 항목을 확인해주세요.');
    ids.add(row.id);
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 100) throw Error('수입 이름을 1~100자로 입력해주세요.');
    if (!Number.isSafeInteger(row.amount) || row.amount < 0 || row.amount > 1e12) throw Error('예상 수입은 0원 이상 원 단위로 입력해주세요.');
    if (row.date !== '' && !validDate(row.date)) throw Error('수입 예정일을 확인해주세요.');
    if (row.itemId !== '' && !id(row.itemId)) throw Error('충당할 비용 항목을 확인해주세요.');
    if (typeof row.enabled !== 'boolean') throw Error('수입 포함 여부를 확인해주세요.');
  }
  return value;
}
export function isBudgetIncluded(item, policy = {}) {
  return !(policy?.excludedIds || []).includes(item.id) && !(item.travelParentId && (policy?.excludedIds || []).includes(item.travelParentId));
}
export function budgetPayment(item) {
  const p = item.payment || paymentState(item);
  return item.travelRowId && item.currency === 'USD' ? { ...p, remaining: item.balance } : p;
}
export function weddingBudgetSummary(items, policy = {}, available = null) {
  const included = items.filter(i => isBudgetIncluded(i, policy)), excluded = items.filter(i => !isBudgetIncluded(i, policy));
  const sum = (rows, key) => rows.reduce((s, i) => s + budgetPayment(i)[key], 0);
  const activeIds = new Set(included.flatMap(i => [i.id, i.travelParentId].filter(Boolean)));
  const incomeRows = (policy?.incomes || []).map(i => ({ ...i, applied: i.enabled && (!i.itemId || activeIds.has(i.itemId)) }));
  const expectedIncome = incomeRows.filter(i => i.applied).reduce((s, i) => s + i.amount, 0);
  const planned = sum(included, 'planned'), remaining = sum(included, 'remaining');
  return {
    included, excluded, incomeRows, expectedIncome,
    planned, paid: sum(included, 'paid'), remaining,
    allPlanned: sum(items, 'planned'), excludedPlanned: sum(excluded, 'planned'),
    excludedRemaining: sum(excluded, 'remaining'),
    ownBudget: planned - expectedIncome,
    neededBeforeIncome: available == null ? null : Math.max(remaining - available, 0),
    needed: available == null ? null : Math.max(remaining - available - expectedIncome, 0),
    surplus: available == null ? null : Math.max(available + expectedIncome - remaining, 0),
    undatedIncome: incomeRows.some(i => i.applied && !i.date),
  };
}
