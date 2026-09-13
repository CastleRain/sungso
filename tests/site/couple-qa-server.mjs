// Local synthetic QA only. Never proxies provider or production database requests.
import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { normalizeHomeConfig } from '../../shared/home/home-core.mjs';
import { normalizeCloudSnapshot } from '../../shared/homehunt/cloud-snapshot-core.mjs';
import { makeSyntheticTravel, makeSyntheticResorts } from './couple-qa/reference-fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dist = path.join(root, 'dist');
const fixtures = path.join(root, 'tests/site/couple-qa');
const dateOffset = offset => new Date(Date.now() + 9 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
const now = Date.now();
const docs = new Map([
  ['site_members/qa-sungwoo', { active: true, role: 'sungwoo' }],
  ['site_members/qa-sohee', { active: true, role: 'sohee' }],
  ['site_home/shared', { ...normalizeHomeConfig(), revision: 1, updatedBy: 'qa-sungwoo', updatedAt: { $qaTimestamp: now } }],
  ...['약속 하나', '약속 둘', '함께하는 날', '다음 일정'].map((title, index) => [`events/qa-event-${index}`, { title, date: dateOffset(index + 2), emoji: index === 2 ? '💒' : '📅', pinned: index === 2, createdAt: { $qaTimestamp: now - index * 1000 } }]),
  ...Array.from({ length: 11 }, (_, index) => [`home_notes/qa-note-${index}`, { text: index === 1 ? '<img src=x onerror=alert(1)> 도 글자로 보여요.\n이 기록은 테스트 대역이에요.' : `테스트 메모 ${index + 1} · 함께 나눌 작은 이야기`, authorUid: index % 2 ? 'qa-sohee' : 'qa-sungwoo', createdAt: { $qaTimestamp: now - index * 3600000 } }]),
  ['couplePicks/invitation_templates', { schemaVersion: 1, favorites: { sungwoo: [], sohee: [] }, selection: null, selectionRevision: 0 }],
  ['wecost_items/qa-trip', { cat: '✈️신혼여행', name: '테스트 여행', planned: 3000000, deposit: 1000000, actual: 0, balance: 2000000, payer: '공동', memo: 'QA 가상 장부' }],
  ['wecost_settings/main', { weddingDate: dateOffset(180), targetWeddingBudget: 10000000, targetHousePrice: 300000000, monthlyPaymentLimit: 1500000, parentSupportSohee: 0, parentSupportSunwo: 0, includeSupportSohee: false, includeSupportSunwo: false }],
  ['wecost_savings/main', { soheeCurrent: 10000000, soheeMonthly: 500000, sunwoCurrent: 10000000, sunwoMonthly: 500000 }],
  ['wecost_loans/qa-loan', { name: '테스트 대출', amount: 50000000, rate: 3.5, term: 30, grace: 0, type: '원리금', enabled: true }],
  ['wecost_adjustments/qa-adjustment', { name: '테스트 조정', amount: 100000, sign: '+' }],
  ['honeymoon_fx/usd_krw', { rate: 1300, value: 1300, date: dateOffset(0), fetchedAt: { $qaTimestamp: now }, updatedAt: { $qaTimestamp: now } }],
]);
let referenceSource = 'synthetic';
let travel = makeSyntheticTravel(dateOffset), honeymoon = makeSyntheticResorts();
// Explicit opt-in accepts only an already gitignored local migration input.
// Import only reference documents; real members/finances are never imported.
if (process.env.QA_PRIVATE_REFERENCE_INPUT) {
  const input = path.resolve(process.env.QA_PRIVATE_REFERENCE_INPUT);
  if (spawnSync('git', ['check-ignore', '-q', '--', input], { cwd: root }).status !== 0) throw new Error('QA private input must be gitignored before use.');
  const source = JSON.parse(await readFile(input, 'utf8'));
  const readReference = id => {
    const data = source.documents?.find(item => item.path === `private_data/${id}`)?.data;
    if (!data) throw new Error('Required QA reference is missing.');
    return typeof data.payload === 'string' ? JSON.parse(data.payload) : data;
  };
  travel = readReference('travel_reference'); honeymoon = readReference('honeymoon_reference'); referenceSource = 'private-local-opt-in';
}
docs.set('private_data/travel_reference', { schemaVersion: 1, payload: JSON.stringify(travel) });
docs.set('private_data/honeymoon_reference', { schemaVersion: 1, payload: JSON.stringify(honeymoon) });
docs.set('itineraries/honeymoon_2027', { schemaVersion: 1, days: structuredClone(travel.reference.TRIP_DAYS), hotels: { arrival: travel.reference.HOTELS[0].id, return: null }, decisions: Object.fromEntries(travel.reference.DECISIONS.map(item => [item.id, { status: item.status || 'pending', note: '대역 확인 메모' }])) });
docs.set('itineraries/main', { days: [{ date: dateOffset(10), title: '이전 일정 대역', items: ['읽기 전용 일정 확인'] }] });
docs.set('itineraries/honeymoon_2027_budget', { linkedItemId: 'qa-trip', baselineTotal: 3000000, availableCash: 2000000, fxRate: 1300, rows: ['항공', '숙소', '크루즈', '리조트', '교통', '예비비'].map((name, index) => ({ id: `qa-budget-${index}`, name, amount: 500000, currency: 'KRW', note: '대역 금액' })), note: '운영 장부와 무관한 대역 예산' });
docs.set('couplePicks/main', { sungwoo: [honeymoon.RESORTS[0]?.id || null, null, null], sohee: [honeymoon.RESORTS[1]?.id || null, null, null], finalCandidates: [], confirmedResort: null });
for (const [uid, label] of [['qa-sungwoo', '성우 대역'], ['qa-sohee', '소희 대역']]) docs.set(`homehunt_user_snapshots/${uid}`, { revision: 1, updatedAt: new Date(now).toISOString(), updatedBy: uid, snapshot: normalizeCloudSnapshot({ schemaVersion: 1, visits: [{ id: `visit-${uid}`, name: `${label} 테스트 아파트`, address: '테스트 주소', memo: '본인 UID 대역 확인', tags: [] }] }) });
const versions = new Map([...docs.keys()].map(key => [key, 1]));
const counters = { reads: 0, writes: 0, denied: 0, transactions: 0, productionRequests: 0, providerRequests: 0 };
let failNextWrite = false;
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const deny = (message = 'QA permission denied') => Object.assign(new Error(message), { code: 'permission-denied', status: 403 });
const allowed = uid => docs.get(`site_members/${uid}`)?.active === true && ['qa-sungwoo', 'qa-sohee'].includes(uid);
function authorize(uid, pathname, write = false) {
  if (pathname.startsWith('site_members/')) { if (write || pathname !== `site_members/${uid}` || !uid) throw deny(); return; }
  if (!allowed(uid)) throw deny();
  if (pathname.startsWith('homehunt_user_snapshots/') && pathname.split('/')[1] !== uid) throw deny();
}
const field = (value, key) => key === '__name__' ? value.id : key.split('.').reduce((item, part) => item?.[part], value.data);
const scalar = value => value?.$qaTimestamp ?? value;
function queryRows(ref) {
  const depth = ref.path.split('/').length + 1;
  let rows = [...docs].filter(([key]) => key.startsWith(`${ref.path}/`) && key.split('/').length === depth).map(([key, data]) => ({ id: key.split('/').at(-1), path: key, data, version: versions.get(key) || 0 }));
  let order = [];
  for (const constraint of ref.constraints || []) {
    if (constraint.kind === 'where') rows = rows.filter(row => { const value = field(row, constraint.field); return constraint.op === '==' ? value === constraint.value : constraint.op === 'in' ? constraint.value.includes(value) : constraint.op === '>=' ? value >= constraint.value : constraint.op === '<=' ? value <= constraint.value : true; });
    if (constraint.kind === 'orderBy') order.push(constraint);
  }
  if (!order.length) order = [{ field: '__name__', direction: 'asc' }];
  rows.sort((a, b) => { for (const item of order) { const av = scalar(field(a, item.field)), bv = scalar(field(b, item.field)); if (av < bv) return item.direction === 'desc' ? 1 : -1; if (av > bv) return item.direction === 'desc' ? -1 : 1; } return a.id.localeCompare(b.id); });
  for (const constraint of ref.constraints || []) {
    if (constraint.kind === 'startAt') rows = rows.filter(row => field(row, order[0].field) >= constraint.value);
    if (constraint.kind === 'endAt') rows = rows.filter(row => field(row, order[0].field) <= constraint.value);
    if (constraint.kind === 'limit') rows = rows.slice(0, constraint.value);
  }
  return rows;
}
function stamp(value, old) { if (value?.$qaServerTimestamp) return { $qaTimestamp: Date.now() }; if (value?.$qaIncrement !== undefined) return (Number(old) || 0) + value.$qaIncrement; if (Array.isArray(value)) return value.map((item, index) => stamp(item, old?.[index])); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stamp(item, key.split('.').reduce((target, part) => target?.[part], old))])); return value; }
function merge(old, patch) { const result = structuredClone(old || {}); for (const [key, value] of Object.entries(patch)) { if (key.includes('.')) { const parts = key.split('.'); let target = result; for (const part of parts.slice(0, -1)) target = target[part] ||= {}; if (value?.$qaDeleteField) delete target[parts.at(-1)]; else target[parts.at(-1)] = value; } else if (value?.$qaDeleteField) delete result[key]; else if (value && typeof value === 'object' && !Array.isArray(value) && !value.$qaTimestamp && result[key] && typeof result[key] === 'object') result[key] = merge(result[key], value); else result[key] = value; } return result; }
function validateWrites(uid, pending) {
  for (const change of pending) {
    authorize(uid, change.path, true);
    if (change.path.startsWith('home_notes/')) {
      const old = docs.get(change.path);
      if (change.type === 'delete') { if (old?.authorUid !== uid) throw deny(); }
      else if (old || change.value?.authorUid !== uid || typeof change.value?.text !== 'string' || !change.value.text.trim() || change.value.text.length > 500 || !change.value.createdAt?.$qaServerTimestamp) throw deny();
    }
  }
}
function applyWrites(pending) { for (const change of pending) { if (change.type === 'delete') docs.delete(change.path); else { const value = stamp(change.value, docs.get(change.path)); docs.set(change.path, change.merge || change.type === 'update' ? merge(docs.get(change.path), value) : value); } versions.set(change.path, (versions.get(change.path) || 0) + 1); counters.writes++; } }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__qa/state') return json(res, 200, { counters, failNextWrite, referenceSource, home: docs.get('site_home/shared'), noteCount: [...docs.keys()].filter(key => key.startsWith('home_notes/')).length });
    if (url.pathname === '/__qa/data' && req.method === 'POST') {
      let input = ''; for await (const chunk of req) input += chunk; const body = JSON.parse(input); const uid = req.headers['x-qa-uid'] || '';
      if (body.op === 'read') { authorize(uid, body.ref.path); counters.reads++; if (body.ref.kind === 'doc') return json(res, 200, { id: body.ref.path.split('/').at(-1), path: body.ref.path, data: docs.get(body.ref.path) ?? null, version: versions.get(body.ref.path) || 0 }); return json(res, 200, { rows: queryRows(body.ref) }); }
      if (body.op === 'write' || body.op === 'commit') {
        const pending = body.changes || []; validateWrites(uid, pending);
        if (failNextWrite) { failNextWrite = false; return json(res, 503, { error: { code: 'unavailable', message: 'QA simulated write failure' } }); }
        for (const [key, version] of Object.entries(body.readVersions || {})) if ((versions.get(key) || 0) !== version) return json(res, 409, { error: { code: 'aborted', message: 'QA concurrent update' } });
        if (body.op === 'commit') counters.transactions++; applyWrites(pending); return json(res, 200, { ok: true });
      }
      return json(res, 400, { error: { code: 'invalid-argument', message: 'Unknown QA operation' } });
    }
    if (url.pathname.startsWith('/__qa/api/')) {
      const uid = String(req.headers.authorization || '').replace('Bearer qa-synthetic-', '');
      if (!allowed(uid)) return json(res, 401, { error: 'QA_AUTH_REQUIRED' });
      if (url.pathname.endsWith('/health')) return json(res, 200, { ok: true, version: '2.11.0', providers: {}, synthetic: true });
      if (url.pathname.endsWith('/quota')) return json(res, 200, { provider: 'kakao', used: 0, limit: 1000, remaining: 1000, synthetic: true });
      return json(res, 503, { error: 'QA_PROVIDER_DISABLED', message: '대역에서는 공급자 조회를 실행하지 않습니다.' });
    }
    if (url.pathname === '/__qa/control' && req.method === 'POST') {
      let input = ''; for await (const chunk of req) input += chunk; const body = JSON.parse(input);
      if (body.action === 'fail-next-write') failNextWrite = true;
      if (body.action === 'remote-home-edit') { const value = structuredClone(docs.get('site_home/shared')); value.revision++; value.groups[0].name = `다른 기기 편집 ${value.revision}`; value.updatedBy = 'qa-sohee'; value.updatedAt = { $qaTimestamp: Date.now() }; docs.set('site_home/shared', value); versions.set('site_home/shared', (versions.get('site_home/shared') || 0) + 1); }
      if (body.action === 'revoke') { docs.set(`site_members/${body.uid}`, { ...docs.get(`site_members/${body.uid}`), active: false }); }
      if (body.action === 'restore-members') { docs.set('site_members/qa-sungwoo', { active: true, role: 'sungwoo' }); docs.set('site_members/qa-sohee', { active: true, role: 'sohee' }); }
      if (body.action === 'fixture-doc' && typeof body.path === 'string' && !body.path.startsWith('site_members/')) { docs.set(body.path, body.value); versions.set(body.path, (versions.get(body.path) || 0) + 1); }
      return json(res, 200, { ok: true });
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    if (/^\/(?:sungso\/)?(?:api|__provider)(?:\/|$)/.test(url.pathname)) { counters.providerRequests++; return json(res, 403, { error: 'QA blocks provider routes' }); }
    let pathname = decodeURIComponent(url.pathname);
    const base = pathname.startsWith('/__qa/') ? fixtures : dist;
    pathname = pathname.startsWith('/__qa/') ? pathname.slice(6) : pathname.startsWith('/sungso/') ? pathname.slice(8) : pathname.slice(1);
    if (pathname.includes('\\') || pathname.split('/').some(part => part === '..' || part.startsWith('.'))) { res.writeHead(404); res.end(); return; }
    if (base === fixtures && /^firebase-(?:app|auth|firestore)\.js$/.test(pathname)) pathname = pathname.replace(/\.js$/, '.mjs');
    let filename = path.resolve(base, pathname || '.'); if (filename !== base && !filename.startsWith(base + path.sep)) { res.writeHead(404); res.end(); return; }
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    let content = await readFile(filename), ext = path.extname(filename);
    if (['.html', '.js', '.mjs', '.css'].includes(ext)) {
      content = content.toString().replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/firebase-(app|auth|firestore)\.js/g, '/__qa/firebase-$1.mjs');
      content = content.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/\$\{FIREBASE_VERSION\}\//g, '/__qa/');
      content = content.replaceAll('https://sungso-homehunt-api.onrender.com/api', `http://${req.headers.host}/__qa/api`);
      if (ext === '.html') content = content.replace('</head>', '<script type="module" src="/__qa/controls.mjs"></script></head>');
    }
    // No browser request can reach a live DB or transport provider in this origin.
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Security-Policy': "connect-src 'self'; form-action 'self'; frame-src 'self';" }); res.end(content);
  } catch (error) { if (error.code === 'permission-denied') counters.denied++; if (error.code === 'ENOENT' || error.code === 'ENOTDIR') { res.writeHead(404); res.end('QA file not found'); } else json(res, error.status || 500, { error: { code: error.code || 'internal', message: error.message } }); }
});
const port = Number(process.env.COUPLE_QA_PORT || 8766);
server.listen(port, '127.0.0.1', () => console.log(`Synthetic couple QA: http://127.0.0.1:${port}/sungso/ · No production connections`));
