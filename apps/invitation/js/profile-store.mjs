import { emptyProfileSnapshot, validateProfileChange, completeProfileSnapshot } from './profile-core.mjs?v=20260915-venue-map';

export function createProfileStore(adapter) {
  let disposed = false;
  let state = { data: emptyProfileSnapshot(), connection: 'loading', saving: false, error: '' };
  const listeners = new Set();
  const emit = () => { for (const listener of listeners) listener(structuredClone(state)); };
  const stop = adapter.subscribe((data, connection = 'live') => {
    if (disposed) return;
    try {
      const next = data.ready ? completeProfileSnapshot(data.profile, data.photos) : { profile: data.profile, photos: data.photos, ready: false };
      state = { ...state, data: next, connection, error: connection === 'live' ? '' : state.error };
    } catch (error) { state = { ...state, data: { ...state.data, ready: false }, connection: 'error', error: error.message }; }
    emit();
  }, error => {
    if (disposed) return;
    state = { ...state, data: { ...state.data, ready: false }, connection: error.code === 'profile-offline' ? 'offline' : 'error', error: error.message || '공통 사진과 예식장 정보를 불러오지 못했어요.' };
    emit();
  });
  return {
    subscribe(listener) { if (!disposed) listeners.add(listener); listener(structuredClone(state)); return () => listeners.delete(listener); },
    async save(change) {
      if (disposed) throw new Error('승인된 계정으로 다시 로그인해주세요.');
      if (state.connection !== 'live' || !state.data.ready) throw new Error('최신 사진과 예식장 정보를 불러온 뒤 다시 저장해주세요.');
      if (state.saving) throw new Error('앞선 저장이 끝나면 다시 시도해주세요.');
      const normalized = validateProfileChange(change);
      state = { ...state, saving: true, error: '' }; emit();
      try {
        const result = await adapter.transact(normalized);
        if (disposed) throw new Error('로그인 계정이 바뀌었어요.');
        return result;
      } catch (error) {
        if (!disposed) state = { ...state, error: error.code === 'permission-denied' ? '저장 권한이 없어 반영되지 않았어요.' : error.message || '공통 설정을 저장하지 못했어요.' };
        throw error;
      } finally { if (!disposed) { state = { ...state, saving: false }; emit(); } }
    },
    retry() { if (!disposed) adapter.retry?.(); },
    dispose() { disposed = true; stop?.(); adapter.dispose?.(); listeners.clear(); state = { data: emptyProfileSnapshot(), connection: 'signed-out', saving: false, error: '' }; },
  };
}
