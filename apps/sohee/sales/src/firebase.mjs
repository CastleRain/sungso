import { getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDocFromServer } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getMember, syncAppAuth, registerPrivateCleanup } from '../../../../shared/firebase/site-auth.mjs';
import { createSalesStore } from './store.mjs';

export async function connectSales(onClear) {
  const app = getApps().find(item => item.name === 'homehunt-private-cloud');
  await syncAppAuth(app);
  const db = getFirestore(app);
  const store = createSalesStore({
    getMember,
    read: async path => { const value = await getDocFromServer(doc(db, path)); return value.exists() ? value.data() : null; },
    digest: async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('')
  });
  const controllers = new Set();
  let retired = false;
  registerPrivateCleanup(() => { retired = true; store.clear(); for (const c of controllers) c.abort(); onClear(); });
  return {
    load: () => store.load(),
    async request(path, body) {
      if (!['127.0.0.1', 'localhost'].includes(location.hostname)) {
        if (path === 'status') return { mode: 'local-only', writesEnabled: false };
        throw new Error('원본 갱신은 Codex에 요청해 이 컴퓨터에서 진행해주세요.');
      }
      const member = getMember(), controller = new AbortController();
      if (retired || !member) throw new Error('로그인이 필요합니다.');
      controllers.add(controller);
      try {
        const token = await getAuth(app).currentUser.getIdToken();
        if (retired || getMember()?.uid !== member.uid) throw new Error('계정이 변경되었습니다.');
        const response = await fetch(`/api/sohee/${path}`, { method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
        if (retired || getMember()?.uid !== member.uid) throw new Error('계정이 변경되었습니다.');
        const result = await response.json().catch(() => ({ message: '토스 갱신 서비스가 연결되지 않았습니다. 연결 후 다시 시도해주세요.' }));
        if (retired || getMember()?.uid !== member.uid || getMember()?.role !== member.role) throw new Error('계정이 변경되었습니다.');
        if (!response.ok) throw new Error(result.message || '요청을 완료하지 못했습니다.');
        return result;
      } finally { controllers.delete(controller); }
    }
  };
}
