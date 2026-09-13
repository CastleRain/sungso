// Local browser fixtures only. Never registered as a public asset.
import { readFile } from 'node:fs/promises';
import { createStaticServer } from '../../../scripts/dev-site.mjs';
import { buildSite } from '../../../scripts/build-site.mjs';
import { applyChange } from '../js/core.mjs';

await buildSite();
const server = createStaticServer();
const serveStatic = server.listeners('request')[0];
server.removeAllListeners('request');
let state = null, mode = 'live', writes = 0;
// Optional local snapshot preserves a user's preview choices when this server is restarted.
if (process.env.INVITATION_QA_SEED_FILE) {
  const seed = JSON.parse(await readFile(process.env.INVITATION_QA_SEED_FILE, 'utf8'));
  state = seed.state ?? null;
  writes = Number.isSafeInteger(seed.writes) ? seed.writes : 0;
}
const clients = new Set();
const emit = () => { for (const res of clients) res.write(`data: ${JSON.stringify({ state, mode })}\n\n`); };
const json = (res, data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
const js = (res, source) => { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(source); };
const body = async req => { let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 10000) throw new Error('Fixture request too large'); } return JSON.parse(data || '{}'); };
const fixtureModule = `
export function connect() {
  return {
    subscribe(next, fail) {
      const stream = new EventSource('/__qa/events');
      stream.onmessage = event => { const {state, mode} = JSON.parse(event.data); next(state, mode === 'offline' ? 'offline' : 'live'); };
      stream.onerror = () => fail(new Error('로컬 대역 연결 실패'));
      return () => stream.close();
    },
    async transact(change) {
      const response = await fetch('/__qa/change', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(change)});
      const result = await response.json();
      if (!response.ok) throw Object.assign(new Error(result.message), {code:result.code});
    }
  };
}`;
const hubFixtures = `
const data = [
  {id:'qa-photo',date:'2026-09-13',title:'웨딩 촬영',emoji:'📸'},
  {id:'qa-wedding',date:'2027-03-06',title:'결혼식',emoji:'💒',pinned:true},
  {id:'qa-travel',date:'2027-03-07',title:'신혼여행 출발',emoji:'✈️',pinned:true}
];
const snapshot = {empty:false,docs:data.map(item=>({id:item.id,data:()=>item}))};
export const getFirestore=()=>({}), collection=()=>({}), doc=()=>({}), query=()=>({}), orderBy=()=>({}), serverTimestamp=()=>null;
export const getDocs=async()=>snapshot;
export function onSnapshot(query, callback) { queueMicrotask(()=>callback(snapshot)); return ()=>{}; }
export const addDoc=async()=>{throw new Error('Hub QA is read-only');};
export const updateDoc=addDoc, deleteDoc=addDoc;
`;
server.on('request', async (req, res) => {
  // No browser request can connect to a production API on this QA origin.
  res.setHeader('Content-Security-Policy', "connect-src 'self'; object-src 'none'");
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/__qa/state') return json(res, { state, mode, writes });
    if (pathname === '/__qa/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      clients.add(res); res.write(`data: ${JSON.stringify({ state, mode })}\n\n`);
      req.on('close', () => clients.delete(res)); return;
    }
    if (pathname === '/__qa/mode' && req.method === 'POST') {
      const value = await body(req); mode = ['live', 'offline', 'failure'].includes(value.mode) ? value.mode : 'live'; emit(); return json(res, { mode });
    }
    if (pathname === '/__qa/change' && req.method === 'POST') {
      if (mode !== 'live') return json(res, { message: '검증용 저장 실패: 임시 설정은 유지돼요.', code: 'unavailable' }, 503);
      const patch = applyChange(state, await body(req));
      state = { ...state, ...patch, ...(patch.favorites ? { favorites: { ...state?.favorites, ...patch.favorites } } : {}), ...(patch.selection ? { updatedAt: new Date().toISOString() } : {}) };
      writes++; emit(); return json(res, { ok: true });
    }
    if (pathname === '/sungso/invitation/js/firebase.mjs') return js(res, fixtureModule);
    if (pathname === '/__qa/firebase-app.mjs') return js(res, 'export const initializeApp=()=>({});');
    if (pathname === '/__qa/firebase-firestore.mjs') return js(res, hubFixtures);
    if (pathname === '/sungso/js/firebase.js') {
      const source = await readFile(new URL('../../hub/js/firebase.js', import.meta.url), 'utf8');
      return js(res, source.replaceAll('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js', '/__qa/firebase-app.mjs').replaceAll('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js', '/__qa/firebase-firestore.mjs'));
    }
    return serveStatic(req, res);
  } catch (error) { json(res, { message: error.message, code: error.code }, 409); }
});
server.listen(Number(process.env.INVITATION_QA_PORT || 8017), '127.0.0.1', () => {
  console.log(`Invitation QA: http://127.0.0.1:${server.address().port}/sungso/invitation/ (in-memory fixtures; production connections blocked)`);
});
