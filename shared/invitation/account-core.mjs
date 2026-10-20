export const ACCOUNTS_PATH = '/api/invitation/v5/accounts';
export const ACCOUNT_SLOTS = Object.freeze([
  { id: 'groom', group: 'groom', label: '신랑', relation: '신랑' },
  { id: 'groom-father', group: 'groom-parents', label: '신랑 부모님', relation: '아버지' },
  { id: 'groom-mother', group: 'groom-parents', label: '신랑 부모님', relation: '어머니' },
  { id: 'bride', group: 'bride', label: '신부', relation: '신부' },
  { id: 'bride-father', group: 'bride-parents', label: '신부 부모님', relation: '아버지' },
  { id: 'bride-mother', group: 'bride-parents', label: '신부 부모님', relation: '어머니' },
]);
export class AccountError extends Error {
  constructor(message, code = 'INVALID_ACCOUNT', status = 400) { super(message); this.code = code; this.status = status; }
}
export const emptyAccounts = () => ACCOUNT_SLOTS.map(({ id }) => ({ id, enabled: false, bank: '', holder: '', number: '', payUrl: '' }));
export function safePayUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'qr.kakaopay.com' && !url.username && !url.password && !url.port && url.pathname.length > 1 ? url.href : '';
  } catch { return ''; }
}
export function validateAccounts(rows) {
  if (!Array.isArray(rows) || rows.length > 6) throw new AccountError('계좌는 최대 여섯 개까지 등록할 수 있어요.');
  const seen = new Set();
  const normalized = rows.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
      Object.keys(row).some(k => !['id', 'enabled', 'bank', 'holder', 'number', 'payUrl'].includes(k)) ||
      !ACCOUNT_SLOTS.some(slot => slot.id === row.id) || seen.has(row.id) || typeof row.enabled !== 'boolean') throw new AccountError('계좌 구분을 확인해 주세요.');
    seen.add(row.id);
    const next = { id: row.id, enabled: row.enabled };
    for (const key of ['bank', 'holder', 'number', 'payUrl']) {
      if (typeof row[key] !== 'string' || /[\x00-\x1f\x7f]/.test(row[key])) throw new AccountError('입력한 내용을 확인해 주세요.');
      next[key] = row[key].trim();
      if (next[key].length > (key === 'payUrl' ? 300 : 40)) throw new AccountError('입력한 내용이 너무 길어요.');
    }
    if (next.number && (!/^[0-9 -]+$/.test(next.number) || !/^\d{6,20}$/.test(next.number.replace(/\D/g, '')))) throw new AccountError('계좌번호는 숫자 6~20자리로 입력해 주세요.');
    if (next.payUrl && !safePayUrl(next.payUrl)) throw new AccountError('카카오페이에서 복사한 qr.kakaopay.com 송금 링크를 입력해 주세요.');
    if (next.enabled && (!next.bank || !next.holder || !next.number)) throw new AccountError('공개할 계좌의 은행·예금주·번호를 모두 입력해 주세요.');
    return next;
  });
  return emptyAccounts().map(blank => normalized.find(row => row.id === blank.id) || blank);
}
export function accountGroups(rows) {
  const valid = validateAccounts(rows), groups = [];
  for (const slot of ACCOUNT_SLOTS) {
    const row = valid.find(item => item.id === slot.id);
    if (!row.enabled) continue;
    let group = groups.find(item => item.id === slot.group);
    if (!group) { group = { id: slot.group, label: slot.label, accounts: [] }; groups.push(group); }
    group.accounts.push({ relation: slot.relation, holder: row.holder, bank: row.bank, number: row.number, payUrl: safePayUrl(row.payUrl) });
  }
  return groups;
}
