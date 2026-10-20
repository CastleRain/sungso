import { ACCOUNTS_PATH, AccountError, emptyAccounts, validateAccounts, accountGroups } from '../../../shared/invitation/account-core.mjs';
const ROOT = 'wedding_accounts/sungso_20270306';
function state(raw) {
  if (raw === undefined) return { revision: 0, accounts: emptyAccounts() };
  if (raw.schema !== 1 || !Number.isSafeInteger(raw.revision) || raw.revision < 1) throw Error('INVALID_STATE');
  return { revision: raw.revision, accounts: validateAccounts(raw.accounts) };
}
export function createAccountStore({ db, now = Date.now }) {
  const ref = db.doc(ROOT);
  return {
    async read() { const snap = await ref.get(); return state(snap.exists ? snap.data() : undefined); },
    async save(body, member) {
      if (!body || Array.isArray(body) || Object.keys(body).some(k => !['accounts', 'expectedRevision'].includes(k)) ||
        !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw new AccountError('저장할 내용을 확인해 주세요.');
      const accounts = validateAccounts(body.accounts);
      return db.runTransaction(async tx => {
        const snap = await tx.get(ref), old = state(snap.exists ? snap.data() : undefined);
        // Exact retries are idempotent; a different stale edit must never overwrite.
        if (JSON.stringify(old.accounts) === JSON.stringify(accounts)) return old;
        if (old.revision !== body.expectedRevision) throw new AccountError('다른 기기에서 수정했어요. 입력한 내용은 남겨 두었으니 최신 내용을 확인해 주세요.', 'CONFLICT', 409);
        const next = { schema: 1, revision: old.revision + 1, accounts, updatedBy: member.uid, updatedAt: now() };
        tx.set(ref, next);
        return { revision: next.revision, accounts };
      });
    },
  };
}
export function createAccountApi({ store, authenticate }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    const path = new URL(req.url, 'http://accounts.invalid').pathname;
    if (![ACCOUNTS_PATH, ACCOUNTS_PATH + '/manage'].includes(path)) return res.status(404).json({ ok: false });
    if (req.method === 'OPTIONS') return res.status(204).end();
    try {
      if (path.endsWith('/manage')) {
        const member = await authenticate(req);
        if (req.method === 'GET') return res.status(200).json({ ok: true, ...await store.read() });
        if (req.method !== 'PUT') return res.status(405).json({ ok: false });
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new AccountError('요청 형식을 확인해 주세요.', 'INVALID_BODY', 415);
        const raw = req.rawBody ?? req.body;
        if (Buffer.byteLength(Buffer.isBuffer(raw) ? raw : typeof raw === 'string' ? raw : JSON.stringify(raw ?? {})) > 8192) throw new AccountError('입력한 내용이 너무 길어요.', 'TOO_LARGE', 413);
        let body;
        try { body = Buffer.isBuffer(raw) || typeof raw === 'string' ? JSON.parse(String(raw)) : raw; }
        catch { throw new AccountError('요청 형식을 확인해 주세요.'); }
        return res.status(200).json({ ok: true, ...await store.save(body, member) });
      }
      if (req.method !== 'GET') return res.status(405).json({ ok: false });
      const data = await store.read();
      return res.status(200).json({ ok: true, revision: data.revision, groups: accountGroups(data.accounts) });
    } catch (error) {
      const known = error instanceof AccountError || ['AUTH_REQUIRED', 'AUTH_INVALID', 'MEMBERSHIP_REQUIRED', 'MEMBERSHIP_UNAVAILABLE'].includes(error.code);
      return res.status(known ? error.status : 503).json({ ok: false, code: known ? error.code : 'ACCOUNTS_UNAVAILABLE', error: known ? error.message : '계좌 정보를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.' });
    }
  };
}
