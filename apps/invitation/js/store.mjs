import { normalizeDocument, applyChange } from './core.mjs?v=20260914-reference-samples';

export function createStore(adapter) {
  let disposed = false;
  let state = { data: normalizeDocument(null), connection: 'loading', saving: false, error: '' };
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn(structuredClone(state)));
  const stop = adapter.subscribe((raw, connection = 'live') => { if (disposed) return; state = { ...state, data: normalizeDocument(raw), connection, error: connection === 'live' ? '' : state.error }; emit(); }, error => { if (disposed) return; state = { ...state, connection: 'error', error: error.message || '함께 저장한 선택을 불러오지 못했어요.' }; emit(); });
  return {
    subscribe(fn) { if (!disposed) listeners.add(fn); fn(structuredClone(state)); return () => listeners.delete(fn); },
    async save(change) {
      if (disposed) throw new Error('승인된 계정으로 다시 로그인해주세요.');
      if (state.connection !== 'live') throw new Error('공동 저장에 연결된 뒤 다시 시도해주세요. 임시 설정은 유지돼요.');
      if (state.saving) throw new Error('앞선 저장이 끝나면 다시 시도해주세요.');
      applyChange(state.data, change);
      state = { ...state, saving: true, error: '' }; emit();
      try { await adapter.transact(change); if (disposed) throw new Error('로그인 계정이 바뀌었어요.'); }
      catch (error) { if (!disposed) state = { ...state, error: error.code === 'permission-denied' ? '저장 권한이 없어 반영되지 않았어요.' : error.message || '저장하지 못했어요. 잠시 후 다시 시도해주세요.' }; throw error; }
      finally { if (!disposed) { state = { ...state, saving: false }; emit(); } }
    },
    retry() { if (!disposed) adapter.retry?.(); },
    dispose() { disposed = true; stop?.(); listeners.clear(); state = { data: normalizeDocument(null), connection: 'signed-out', saving: false, error: '' }; },
  };
}
