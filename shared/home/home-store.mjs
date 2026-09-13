import { normalizeHomeConfig, validateHomeConfig, noteText, canDeleteNote } from './home-core.mjs';

export class HomeConflictError extends Error {
  constructor(latest) { super('다른 기기에서 홈 구성이 바뀌었어요. 초안은 그대로 두었으니 최신 구성을 확인해 주세요.'); this.name = 'HomeConflictError'; this.latest = latest; }
}

// SDK injection permits transaction and failure QA without touching production.
export function createHomeStore({ db, sdk, member, isCurrent = () => true }) {
  if (!member?.uid) throw new Error('회원 로그인 후 사용할 수 있어요.');
  const homeRef = sdk.doc(db, 'site_home', 'shared');
  const notesRef = sdk.collection(db, 'home_notes');
  const stops = new Set();
  let closed = false;
  const assertCurrent = () => { if (closed || !isCurrent()) throw new Error('로그인 상태가 바뀌었어요. 다시 로그인해 주세요.'); };
  const watch = (ref, callback, onError = () => {}) => {
    assertCurrent();
    let active = true;
    const unsubscribe = sdk.onSnapshot(ref, snapshot => { if (active && !closed && isCurrent()) callback(snapshot); }, error => { if (active && !closed && isCurrent()) onError(error); });
    const stop = () => { active = false; unsubscribe(); };
    stops.add(stop);
    return () => { stop(); stops.delete(stop); };
  };
  return {
    watchHome(callback, onError) { return watch(homeRef, snap => callback(normalizeHomeConfig(snap.exists() ? snap.data() : {})), onError); },
    watchEvents(callback, onError) { return watch(sdk.query(sdk.collection(db, 'events'), sdk.orderBy('date')), snap => callback(snap.docs.map(doc => ({ ...doc.data(), id: doc.id }))), onError); },
    watchNotes(callback, onError, count = 3) {
      // Growing the live window keeps removals and changes consistent across pages.
      const size = Number.isSafeInteger(count) ? Math.max(3, count) : 3;
      return watch(sdk.query(notesRef, sdk.orderBy('createdAt', 'desc'), sdk.limit(size + 1)), snap => callback({ notes: snap.docs.slice(0, size).map(doc => ({ ...doc.data(), id: doc.id })), hasMore: snap.docs.length > size, count: size }), onError);
    },
    async saveHome(draft, expectedRevision) {
      assertCurrent();
      const clean = validateHomeConfig(draft);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('편집을 다시 열어 주세요.');
      return sdk.runTransaction(db, async transaction => {
        assertCurrent();
        const snapshot = await transaction.get(homeRef);
        assertCurrent();
        const latest = normalizeHomeConfig(snapshot.exists() ? snapshot.data() : {});
        if (latest.revision !== expectedRevision) throw new HomeConflictError(latest);
        const value = { groups: clean.groups, apps: clean.apps, revision: latest.revision + 1, updatedBy: member.uid, updatedAt: sdk.serverTimestamp() };
        transaction.set(homeRef, value);
        return normalizeHomeConfig(value);
      });
    },
    async addNote(value) {
      assertCurrent();
      return sdk.addDoc(notesRef, { text: noteText(value), authorUid: member.uid, createdAt: sdk.serverTimestamp() });
    },
    async deleteNote(note) {
      assertCurrent();
      if (!canDeleteNote(note, member)) throw new Error('내가 쓴 메모만 삭제할 수 있어요.');
      return sdk.deleteDoc(sdk.doc(db, 'home_notes', note.id));
    },
    close() { closed = true; for (const stop of stops) stop(); stops.clear(); },
  };
}
