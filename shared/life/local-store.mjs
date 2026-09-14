import { blankState, validateState } from './core.mjs';

export class LifeConflictError extends Error {
  constructor(latest) { super('다른 탭에서 생활 기록이 바뀌었어요. 입력한 내용은 그대로 두고 최신 기록을 확인해 주세요.'); this.name = 'LifeConflictError'; this.latest = latest; }
}
export class LifeStorageError extends Error {
  constructor(message, code) { super(message); this.name = 'LifeStorageError'; this.code = code; }
}
const storageError = (message, code) => new LifeStorageError(message, code);

export function createLifeStore({ uid, isCurrent, storage, locks, eventTarget } = {}) {
  if (typeof uid !== 'string' || !uid.trim() || uid.length > 128 || typeof isCurrent !== 'function') throw storageError('회원 로그인 후 생활 기록을 열어 주세요.', 'auth-required');
  const key = `sungso.life.v1.${encodeURIComponent(uid)}`;
  const lockName = `sungso.life.lock.v1.${encodeURIComponent(uid)}`;
  let closed = false;
  const listeners = new Set();
  try { storage ??= globalThis.localStorage; } catch { throw storageError('이 브라우저에서 저장소에 접근할 수 없어요. 저장소 허용 설정을 확인해 주세요.', 'storage-unavailable'); }
  locks ??= globalThis.navigator?.locks;
  eventTarget ??= globalThis.window;
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw storageError('이 브라우저에서 로컬 저장소를 사용할 수 없어요.', 'storage-unavailable');
  const assertCurrent = () => { if (closed || !isCurrent()) throw storageError('로그인 상태가 바뀌었어요. 다시 로그인해 주세요.', 'account-changed'); };
  const read = () => {
    assertCurrent();
    let raw;
    try { raw = storage.getItem(key); } catch { throw storageError('생활 기록을 읽지 못했어요. 브라우저 저장소 설정을 확인해 주세요.', 'storage-unavailable'); }
    assertCurrent();
    if (raw === null) return blankState();
    try { return validateState(JSON.parse(raw)); }
    catch { throw storageError('저장된 생활 기록을 읽을 수 없어요. 원본을 지우거나 새 기록으로 덮어쓰지 않았어요.', 'corrupt-data'); }
  };
  const emit = state => {
    if (closed || !isCurrent()) return;
    for (const listener of [...listeners]) {
      if (closed || !isCurrent()) return;
      listener(structuredClone(state));
    }
  };
  const onStorage = event => {
    if (closed || !isCurrent() || (event.storageArea && event.storageArea !== storage) || (event.key !== null && event.key !== key)) return;
    try { emit(read()); }
    catch (error) {
      // Subscribers receive an error separately; damaged bytes stay untouched.
      for (const listener of [...listeners]) { if (closed || !isCurrent()) return; listener(null, error); }
    }
  };
  eventTarget?.addEventListener('storage', onStorage);
  return {
    read,
    async commit(next, { expectedRevision } = {}) {
      assertCurrent();
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw storageError('편집을 다시 열어 주세요.', 'invalid-revision');
      const clean = validateState(next);
      if (clean.revision !== expectedRevision) throw storageError('편집한 기록의 버전을 다시 확인해 주세요.', 'invalid-revision');
      if (typeof locks?.request !== 'function') throw storageError('이 브라우저는 여러 탭의 안전한 저장을 지원하지 않아요. 최신 브라우저에서 다시 열어 주세요.', 'locks-unavailable');
      return locks.request(lockName, { mode: 'exclusive' }, async () => {
        assertCurrent();
        const latest = read();
        if (latest.revision !== expectedRevision) throw new LifeConflictError(latest);
        if (latest.revision >= Number.MAX_SAFE_INTEGER) throw storageError('기록 버전의 저장 한도에 도달했어요.', 'revision-limit');
        const saved = { ...clean, revision: latest.revision + 1 };
        const serialized = JSON.stringify(saved);
        assertCurrent();
        try { storage.setItem(key, serialized); }
        catch { throw storageError('저장 공간이 부족하거나 저장이 차단됐어요. 이전 기록과 입력한 내용을 그대로 두었으니 다시 시도해 주세요.', 'write-failed'); }
        assertCurrent();
        emit(saved);
        return structuredClone(saved);
      });
    },
    subscribe(listener) {
      assertCurrent();
      if (typeof listener !== 'function') throw new TypeError('Subscriber must be a function.');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (closed) return;
      closed = true; listeners.clear(); eventTarget?.removeEventListener('storage', onStorage);
    },
  };
}
