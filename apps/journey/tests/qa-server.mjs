// Local browser QA only. This directory is outside the deployment allowlist.
// Auth is replaced in HTTP responses; production entry/boot files stay intact.
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStaticServer } from '../../../scripts/dev-site.mjs';
import { createJourneyApi, JOURNEY_PATH } from '../../../services/journey/api.mjs';
import { createJourneyStore, JOURNEY_ROOT, JourneyError } from '../../../services/journey/store.mjs';
import { createMemoryFirestore } from '../../homehunt/tests/helpers/firestore-memory.mjs';
import { emptyDay } from '../../../shared/journey/core.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SAMPLE_DATE = '2026-10-18';
const SAMPLE_PHOTO_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER = Object.freeze({ uid: 'qa-member', name: '검수용 성우', role: 'sungwoo', status: 'active' });
const PHOTO_PATH = new URL('./fixtures/no-gps-photo.jpg', import.meta.url);
const TIME = Date.parse(SAMPLE_DATE + 'T14:00:00+09:00');
const sampleRecord = (id, title, extra = {}) => ({ id, title, note: '실제 두 사람의 기록이 아닌 로컬 검수용 가상 자료입니다.', person: 'together', kind: 'manual', time: null, timePrecision: 'day', position: null, ...extra });

export const sampleTimeline = {
  semanticSegments: [
    { startTime: '2026-10-18T14:00:00+09:00', endTime: '2026-10-18T14:06:00+09:00', timelinePath: [
      { point: 'geo:37.5445,127.0434', durationMinutesOffsetFromStartTime: 0 },
      { point: 'geo:37.5447,127.0429', durationMinutesOffsetFromStartTime: 3 },
      { point: 'geo:37.5450,127.0422', durationMinutesOffsetFromStartTime: 6 },
    ] },
    { startTime: '2026-10-18T14:10:00+09:00', visit: { topCandidate: { name: '검수용 · 서울숲 입구', placeId: 'qa-public-park', placeLocation: { latLng: 'geo:37.5450,127.0422' } } } },
    { startTime: '2026-10-18T15:00:00+09:00', endTime: '2026-10-18T15:03:00+09:00', timelinePath: [
      { point: 'geo:37.5458,127.0391', durationMinutesOffsetFromStartTime: 0 },
      { point: 'geo:37.5461,127.0385', durationMinutesOffsetFromStartTime: 3 },
    ] },
    { startTime: '2026-10-19T13:30:00+09:00', visit: { topCandidate: { name: '검수용 · 한강공원', placeId: 'qa-public-river', placeLocation: { latLng: 'geo:37.5283,126.9344' } } } },
  ],
};

export async function seedJourneyQa(store) {
  const jpeg = 'data:image/jpeg;base64,' + (await readFile(PHOTO_PATH)).toString('base64');
  await store.upload({ id: SAMPLE_PHOTO_ID, full: jpeg, thumb: jpeg }, MEMBER.uid);
  for (const [person, letter, offset, coordinates] of [
    ['sungwoo', 'a', 0, [[37.5445, 127.0434], [37.5447, 127.0429], [37.545, 127.0422]]],
    ['sohee', 'b', 120000, [[37.5462, 127.0411], [37.5456, 127.0417], [37.545, 127.0422]]],
  ]) {
    const source = { id: 'qa-source-' + person, hash: letter.repeat(64), name: '검수용-' + person + '.json', person, kind: 'timeline', importedAt: TIME };
    await store.import(SAMPLE_DATE, { source, records: [sampleRecord('qa-visit-' + person, '검수용 · 서울숲에서 만난 날', { person, kind: 'visit', time: TIME + offset + 360000, timePrecision: 'exact', position: { lat: 37.545, lng: 127.0422 }, sourceId: source.id })], tracks: [{ id: 'qa-path-' + person, person, sourceId: source.id, points: coordinates.map(([lat, lng], index) => ({ lat, lng, time: TIME + offset + index * 180000 })) }] }, MEMBER.uid);
  }
  const day = await store.day(SAMPLE_DATE);
  await store.save(SAMPLE_DATE, { expectedRevision: day.revision, day: { ...day, title: '검수용 · 함께 걷던 가을 오후', records: [...day.records,
    sampleRecord('qa-photo-memory', '검수용 · 사진으로 채운 기억', { kind: 'photo', photoId: SAMPLE_PHOTO_ID, position: { lat: 37.5458, lng: 127.0391 } }),
    sampleRecord('qa-no-position', '검수용 · 위치를 모르는 기억'),
  ] } }, MEMBER.uid);
  for (const date of ['2026-09-27', '2026-10-03', '2026-10-10']) await store.save(date, { expectedRevision: 0, day: { ...emptyDay(date), records: [sampleRecord('qa-memory-' + date, '검수용 · 날짜만 남은 기억')] } }, MEMBER.uid);
}

const QA_ENTRY = `import { mountJourney } from '/sungso/journey/js/ui.mjs';
const root=document.querySelector('[data-private-root]'),controllers=new Set();let disposed=false;
root.hidden=false;
const initial=await fetch('/__qa/session',{cache:'no-store'}).then(r=>r.json());
const current=()=>!disposed;
async function request(path,{method='GET',body,blob=false}={}){
 if(!current())throw Error('로그인 상태가 바뀌었어요.');
 const controller=new AbortController();controllers.add(controller);const timer=setTimeout(()=>controller.abort(),90000);
 try{const response=await fetch('/api/journey/v1'+path,{method,headers:{Authorization:'Bearer qa-member',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',signal:controller.signal});
 const data=await(blob&&response.ok?response.blob():response.json());if(!current())throw Error('로그인 상태가 바뀌었어요.');
 if(!response.ok||!blob&&data.ok!==true){const error=Error(data.error||'저장소에 연결하지 못했어요.');error.status=response.status;throw error;}return data;
 }catch(error){if(error.name==='AbortError')throw Error('연결이 지연되고 있어요. 입력 내용은 유지되니 다시 시도해주세요.');throw error;}finally{clearTimeout(timer);controllers.delete(controller);}
}
const ui=mountJourney({root,request,member:${JSON.stringify(MEMBER)}});
function dispose(){if(disposed)return;disposed=true;controllers.forEach(c=>c.abort());controllers.clear();clearInterval(poll);ui.dispose();document.querySelector('#qaStatus').textContent='로컬 QA 로그아웃 · 화면과 요청 정리됨';}
const poll=setInterval(async()=>{try{const session=await fetch('/__qa/session',{cache:'no-store'}).then(r=>r.json());if(!session.authorized||session.generation!==initial.generation)dispose();}catch{}},500);
document.querySelector('#qaLogout').addEventListener('click',async()=>{await fetch('/__qa/logout',{method:'POST'});dispose();});
window.addEventListener('pagehide',dispose,{once:true});
`;

const QA_BAR = '<aside aria-label="로컬 검수 도구" style="padding:8px 18px;background:#edf7fe;color:#343b44;font:13px sans-serif;display:flex;gap:14px;align-items:center;flex-wrap:wrap"><span id="qaStatus">로컬 QA · 가상 자료 · 메모리 DB (서버 종료 시 삭제)</span><a href="/__qa/timeline.json" download="qa-timeline.json">검수용 타임라인 파일</a><a href="/__qa/photo.jpg" download="qa-photo.jpg">검수용 사진</a><button id="qaLogout" type="button">QA 로그아웃</button></aside>';

function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
async function readBody(req, maximum = 700 * 1024) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > maximum) throw new JourneyError('BODY_TOO_LARGE', 'QA 요청이 너무 큽니다.', 413); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

export function createJourneyQaServer({ distDir = path.join(ROOT, 'dist') } = {}) {
  const staticServer = createStaticServer({ distDir });
  let db, store, api, seeded = false, seeding = null, failure = null, authorized = true, generation = 1;
  let history = [];
  function reset() {
    db = createMemoryFirestore();
    db.doc = value => { const parts = value.split('/'), id = parts.pop(); return db.collection(parts.join('/')).doc(id); };
    store = createJourneyStore({ db });
    api = createJourneyApi({ store, authenticate: async req => {
      if (!authorized || req.headers.authorization !== 'Bearer qa-member') throw new JourneyError('AUTH_REQUIRED', '로컬 QA 로그인이 필요합니다.', 401);
      return MEMBER;
    } });
    seeded = false; seeding = null; failure = null; authorized = true; generation++; history = [];
  }
  reset();
  async function seed() { if (!seeded && db.documents.size === 0) { seeding ||= seedJourneyQa(store).then(() => { seeded = true; }); await seeding; } }
  const server = http.createServer(async (req, res) => {
    // No CORS and no remote listener: controls cannot be called cross-origin.
    const host = req.headers.host || '';
    if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host) || req.headers.origin && req.headers.origin !== 'http://' + host) return json(res, 403, { ok: false, error: 'Local QA only' });
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://oapi.map.naver.com https://openapi.map.naver.com; connect-src 'self' https://*.naver.com; img-src 'self' data: blob: https://*.pstatic.net https://*.naver.com; style-src 'self' 'unsafe-inline'; font-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'");
    try {
      const url = new URL(req.url, 'http://' + host), pathname = url.pathname;
      if (pathname === '/__qa/state' && req.method === 'GET') return json(res, 200, { ok: true, syntheticOnly: true, seeded, authorized, generation, calls: db.calls, documents: db.documents.size, days: [...db.documents].filter(([key]) => key.startsWith(JOURNEY_ROOT + '/days/')).map(([, value]) => JSON.parse(value.data)), requests: history, failNext: failure });
      if (pathname === '/__qa/session' && req.method === 'GET') return json(res, 200, { authorized, generation });
      if (pathname === '/__qa/reset' && req.method === 'POST') { reset(); if (url.searchParams.get('sample') === '1') await seed(); return json(res, 200, { ok: true, seeded }); }
      if (pathname === '/__qa/logout' && req.method === 'POST') { authorized = false; generation++; return json(res, 200, { ok: true }); }
      if (pathname === '/__qa/fail-next' && req.method === 'POST') {
        const input = JSON.parse((await readBody(req, 2000)).toString() || '{}');
        failure = { method: ['GET', 'POST', 'PUT'].includes(input.method) ? input.method : 'PUT', path: typeof input.path === 'string' ? input.path.slice(0, 200) : '/days/', status: [409, 429, 503].includes(input.status) ? input.status : 503, remaining: Math.min(10, Math.max(1, Number(input.count) || 1)), delayMs: Math.min(5000, Math.max(0, Number(input.delayMs) || 0)) };
        return json(res, 200, { ok: true, failNext: failure });
      }
      if (pathname === '/__qa/timeline.json' && req.method === 'GET') return json(res, 200, sampleTimeline);
      if (pathname === '/__qa/photo.jpg' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }); return res.end(await readFile(PHOTO_PATH)); }
      if (pathname === '/__qa/entry.mjs' || pathname === '/sungso/journey/js/entry.mjs') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(QA_ENTRY); }
      if (pathname === '/__qa/auth.mjs' || pathname === '/sungso/shared/firebase/boot.mjs') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end('// Auth bypass exists only in the localhost QA response.\n'); }
      if (pathname.startsWith(JOURNEY_PATH + '/')) {
        const record = { method: req.method, path: req.url, status: null }; history.push(record); if (history.length > 250) history.shift(); res.once('finish', () => { record.status = res.statusCode; });
        req.rawBody = await readBody(req);
        if (failure && req.method === failure.method && pathname.includes(failure.path)) { const next = { ...failure }; if (--failure.remaining <= 0) failure = null; if (next.delayMs) await new Promise(resolve => setTimeout(resolve, next.delayMs)); return json(res, next.status, { ok: false, code: 'QA_FAILURE', error: '검수용 저장 실패 · 입력을 유지하고 다시 시도해주세요.' }); }
        res.status = code => { res.statusCode = code; return res; }; res.json = value => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); return res; };
        return await api(req, res);
      }
      if ((pathname === '/sungso/journey/' || pathname === '/sungso/journey/index.html') && ['GET', 'HEAD'].includes(req.method)) {
        if (url.searchParams.get('qa') === 'sample') await seed();
        const html = (await readFile(path.join(distDir, 'journey/index.html'), 'utf8'))
          .replace(/<script\b[^>]*src=["'][^"']*firebase\/boot\.mjs[^"']*["'][^>]*><\/script>/, '<script type="module" src="/__qa/auth.mjs"></script>')
          .replace(/<script\b[^>]*type=["']application\/x-sungso-script["'][^>]*><\/script>/, '<script type="module" src="/__qa/entry.mjs"></script>')
          .replace(/(<body\b[^>]*>)/, '$1' + QA_BAR);
        if (html.includes('application/x-sungso-script') || !html.includes('/__qa/entry.mjs')) throw Error('QA auth rewrite does not match the built page.');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(req.method === 'HEAD' ? undefined : html);
      }
      if (pathname.startsWith('/__qa/') || !['/sungso/journey', '/sungso/journey/', '/sungso/shared/'].some(prefix => pathname === prefix || pathname.startsWith(prefix + (prefix.endsWith('/') ? '' : '/')))) return json(res, 404, { ok: false });
      staticServer.emit('request', req, res);
    } catch (error) { if (!res.headersSent) json(res, error.status || 500, { ok: false, error: error.message }); else res.end(); }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.JOURNEY_QA_PORT || 8047);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('JOURNEY_QA_PORT must be a valid port.');
  const server = createJourneyQaServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  console.log(`Journey QA (memory only): http://127.0.0.1:${port}/sungso/journey/?qa=sample`);
}
