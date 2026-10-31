import { ACCOUNT_SLOTS, AccountError, validateAccounts, safePayUrl } from './account-core.mjs';
export const DEFAULT_ACCOUNT_ORDER = Object.freeze(ACCOUNT_SLOTS.map(slot => slot.id));
export function validateAccountOrder(order = DEFAULT_ACCOUNT_ORDER) {
  if (!Array.isArray(order) || order.length !== 6 || new Set(order).size !== 6 || order.some((id, i) => typeof id !== 'string' || !DEFAULT_ACCOUNT_ORDER.includes(id) || !id.startsWith(i < 3 ? 'groom' : 'bride'))) throw new AccountError('신랑·신부 측 각각 세 분의 순서를 확인해 주세요.');
  return [...order];
}
export function orderedAccountData(accounts, order) {
  const rows = validateAccounts(accounts), groups = [], sides = ['groom', 'bride'].map(id => ({id, accounts:[]}));
  for (const id of validateAccountOrder(order)) {
    const row = rows.find(item => item.id === id), slot = ACCOUNT_SLOTS.find(item => item.id === id);
    if (!row.enabled) continue;
    const account = {relation:slot.relation, holder:row.holder, bank:row.bank, number:row.number, payUrl:safePayUrl(row.payUrl)};
    let group = groups.find(item => item.id === slot.group);
    if (!group) { group = {id:slot.group, label:slot.label, accounts:[]}; groups.push(group); }
    group.accounts.push(account); sides.find(item => id.startsWith(item.id)).accounts.push(account);
  }
  return {groups, sides};
}
