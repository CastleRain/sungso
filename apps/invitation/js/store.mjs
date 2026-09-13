import { normalizeDocument, applyChange } from './core.mjs';

export function createStore(adapter) {
  let state = { data: normalizeDocument(null), connection: 'loading', saving: false, error: '' };
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn(structuredClone(state)));
  const stop = adapter.subscribe((raw, connection = 'live') => { state = { ...state, data: normalizeDocument(raw), connection, error: connection === 'live' ? '' : state.error }; emit(); }, error => { state = { ...state, connection: 'error', error: error.message || '함께 저장한 선택을 불러오지 못했어요.' }; emit(); });
  return {
    subscribe(fn) { listeners.add(fn); fn(structuredClone(state)); return () => listeners.delete(fn); },
    async save(change) {
      if (state.connection !== 'live') throw new Error('공동 저장에 연결된 뒤 다시 시도해주세요. 임시 설정은 유지돼요.');
      if (state.saving) throw new Error('앞선 저장이 끝나면 다시 시도해주세요.');
      applyChange(state.data, change);
      state = { ...state, saving: true, error: '' }; emit();
      try { await adapter.transact(change); }
      catch (error) { state = { ...state, error: error.code === 'permission-denied' ? '저장 권한이 없어 반영되지 않았어요.' : error.message || '저장하지 못했어요. 잠시 후 다시 시도해주세요.' }; throw error; }
      finally { state = { ...state, saving: false }; emit(); }
    },
    retry() { adapter.retry?.(); },
    dispose() { stop?.(); listeners.clear(); },
  };
}
