const API = 'https://sungso-homehunt-api.onrender.com';
const BOOK = '/api/invitation/v3/guestbook', ALBUM = '/api/invitation/v3/album';
async function request(path, options = {}) {
  const response = await fetch(API + path, { ...options, cache: 'no-store', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(55000) });
  const data = await response.json();
  if (!response.ok || !data.ok) throw Error(data.error || '연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
  return data;
}
export function createLiveAdapter() {
  const key = 'sungso_guestbook_v3'; let clientId, proofs = {}, draft;
  try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); clientId = saved?.clientId; proofs = saved?.proofs || {}; } catch {}
  if (!/^[a-f0-9-]{36}$/i.test(clientId || '')) clientId = crypto.randomUUID();
  const persist = () => { try { localStorage.setItem(key, JSON.stringify({ clientId, proofs })); } catch {} };
  persist();
  return {
    live: true, persistent: true,
    async accounts() {
      const data = await request('/api/invitation/v5/accounts');
      return ['groom','bride'].map(side => ({ id: side, accounts: data.groups.filter(g => g.id === side || g.id === side + '-parents').flatMap(g => g.accounts) }));
    },
    async messages() {
      const rows = []; let next = null;
      for (let page = 0; page < 20; page++) {
        const data = await request(BOOK + (next ? '?before=' + encodeURIComponent(next) : ''));
        rows.push(...data.messages); if (!data.next || data.next === next) break; next = data.next;
      }
      return rows.map(m => ({ id: m.id, name: m.name, message: m.text, createdAt: new Date(m.createdAt).toISOString(), owned: Boolean(proofs[m.id]) }));
    },
    async write({ name, message, consent, website }) {
      name = name.trim(); const text = message.trim();
      if (!consent || !name || !text || [...name].length > 20 || [...text].length > 300) throw Error('이름 20자, 메시지 300자 이내와 공개 동의를 확인해 주세요.');
      if (!draft || draft.name !== name || draft.text !== text) {
        const deleteToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
        draft = { name, text, consent: true, website, clientId, requestId: crypto.randomUUID(), deleteToken };
        proofs[draft.requestId] = deleteToken; persist();
      }
      const result = await request(BOOK, { method: 'POST', body: JSON.stringify(draft) });
      proofs[result.message.id] = draft.deleteToken; persist(); draft = null;
    },
    async remove(id) { if (!proofs[id]) throw Error('이 기기에서 작성한 글만 삭제할 수 있어요.'); await request(BOOK + '/' + id, { method: 'DELETE', body: JSON.stringify({ deleteToken: proofs[id] }) }); delete proofs[id]; persist(); },
  };
}
export async function loadPublicPhotos(fallback, content) {
  let photos = fallback;
  try {
    const data = await request(ALBUM);
    if (data.configured === true) photos = data.items.map(p => p.kind === 'static' ? fallback.find(f => f.id === p.id) : { ...p, src: API + ALBUM + '/photos/' + p.id + '/full', thumb: API + ALBUM + '/photos/' + p.id + '/thumb', alt: '두 사람의 사진' }).filter(Boolean);
  } catch { /* Existing bundled public images remain readable during a transient album outage. */ }
  const all = new Map(photos.map(p => [p.id, p]));
  for (const p of content.photos || []) all.set(p.id, { ...p, src: API + p.src, thumb: API + p.src, alt: '두 사람의 사진' });
  return (content.albumOrder || [...all.keys()]).map(id => all.get(id)).filter(Boolean).slice(0, 20);
}
