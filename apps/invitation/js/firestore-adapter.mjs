import { DOCUMENT_PATH, applyChange } from './core.mjs?v=20260913-signature';

// Inject the SDK so the exact transaction code can also run against the Emulator.
export function firestoreAdapter(sdk, db, { online = () => true, events = null, timeout = 15000, member = () => null } = {}) {
  const ref = sdk.doc(db, ...DOCUMENT_PATH.split('/'));
  let callback, failure, unsubscribe, timer, active = true, generation = 0;
  const begin = () => {
    if (!active) return;
    unsubscribe?.(); clearTimeout(timer);
    const caller = member(), epoch = ++generation;
    const current = () => active && generation === epoch && member()?.uid === caller?.uid && member()?.role === caller?.role;
    if (!caller) { failure?.(new Error('승인된 계정으로 로그인해주세요.')); return; }
    timer = setTimeout(() => { if (current()) failure?.(new Error('공동 저장 연결이 늦어지고 있어요. 예시는 계속 볼 수 있어요.')); }, timeout);
    unsubscribe = sdk.onSnapshot(ref, { includeMetadataChanges: true }, snapshot => {
      if (!current()) return;
      if (!snapshot.metadata.fromCache) clearTimeout(timer);
      callback?.(snapshot.exists() ? snapshot.data() : null, !online() ? 'offline' : snapshot.metadata.fromCache ? 'loading' : 'live');
    }, error => { if (current()) { clearTimeout(timer); failure?.(error); } });
  };
  const reconnect = () => begin();
  const offline = () => failure?.(new Error('인터넷 연결이 끊겼어요. 임시 설정은 유지되며, 연결 후 다시 저장할 수 있어요.'));
  return {
    subscribe(next, error) { callback = next; failure = error; begin(); events?.addEventListener('online', reconnect); events?.addEventListener('offline', offline); return () => { active = false; generation++; unsubscribe?.(); clearTimeout(timer); callback = null; failure = null; events?.removeEventListener('online', reconnect); events?.removeEventListener('offline', offline); }; },
    retry: begin,
    async transact(change) {
      const caller = member();
      if (!active || !caller || change.actor !== caller.role) throw new Error('로그인한 사람의 선택만 변경할 수 있어요.');
      const assertCurrent = () => { if (!active || member()?.uid !== caller.uid || member()?.role !== caller.role) throw new Error('로그인 계정이 바뀌었어요.'); };
      if (!online()) throw new Error('인터넷에 연결한 뒤 다시 저장해주세요.');
      await sdk.runTransaction(db, async tx => {
        assertCurrent();
        const snapshot = await tx.get(ref);
        assertCurrent();
        const patch = applyChange(snapshot.exists() ? snapshot.data() : null, change);
        patch.updatedAt = sdk.serverTimestamp();
        patch.updatedBy = caller.uid;
        // Nested merge only touches this person's favorites; selection writes are atomic.
        tx.set(ref, patch, { merge: true });
      });
      assertCurrent();
    },
  };
}
