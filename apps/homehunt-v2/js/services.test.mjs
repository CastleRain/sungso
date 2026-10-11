import test from 'node:test';
import assert from 'node:assert/strict';
import { createServices, waitForPoll } from './services.mjs';

test('membership denial blocks even the localhost provider adapter', async () => {
  let calls = 0;
  const services = createServices({ config: { isLocalRuntime: true },
    fetchImpl: async () => { calls++; return response({ ok: true }); },
    memberAccess: async () => ({ requireMember: async () => { throw new Error('denied'); } }) });
  await assert.rejects(services.searchPlaces('회사'), /denied/);
  assert.equal(calls, 0);
});

test('private cleanup rejects a body that finishes after retirement', async () => {
  let finish;
  const body = new Promise(resolve => { finish = resolve; });
  const { services } = fixture(async () => ({ ok: true, status: 200, json: () => body }));
  const pending = services.searchPlaces('회사');
  await new Promise(resolve => setImmediate(resolve));
  services.destroy(); finish({ ok: true, items: [{ title: '늦은 결과' }] });
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(services.loadCatalog(), { code: 'ACCOUNT_CHANGED' });
});

const response = body => ({ ok: true, status: 200, json: async () => body });
function fixture(fetchImpl, config = {}) {
  let user = { uid: 'owner' };
  const session = { init: async () => {}, getState: () => ({ user }),
    apiFetch: fetchImpl, subscribe: () => () => {}, setUser: value => { user = value; } };
  return { session, services: createServices({ fetchImpl, session,
    config: { isLocalRuntime: true, ...config }, pause: async () => {} }) };
}
test('price requests omit companies, finance and Ver2-specific state', async () => {
  const calls = [];
  const { services } = fixture(async (url, options) => {
    calls.push({ url, options });
    return response({ ok: true, jobId: 'example', status: 'complete', results: [{ catalogId: 'one' }] });
  });
  const result = await services.searchCandidates({ maxPriceManWon: 70000, minAreaM2: 59,
    workplaces: [{ lat: 37, lng: 127 }], availableCashWon: 100000000, districtCodes: ['41117'] });
  assert.equal(result.candidates.length, 1);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.maxPriceManWon, 70000); assert.deepEqual(body.districtCodes, ['41117']);
  assert.equal('workplaces' in body, false); assert.equal('availableCashWon' in body, false);
});
test('cloud price jobs advance real tasks and retain partial evidence', async () => {
  const calls = [], progress = [];
  const { services } = fixture(async path => {
    calls.push(path);
    return response(calls.length === 1 ? { ok: true, jobId: 'abc', status: 'running', advanceRequired: true,
      progress: { completed: 0, total: 3 } } : { ok: true, jobId: 'abc', status: 'complete',
      progress: { completed: 3, total: 3 }, partial: true, failedRequestCount: 1, results: [], pendingPriceCandidates: [{ catalogId: 'waiting' }] });
  }, { isLocalRuntime: false });
  const result = await services.searchCandidates({}, { onProgress: item => progress.push(item) });
  assert.deepEqual(calls, ['/recommendations', '/recommendations/abc/advance']);
  assert.equal(progress[0].progress.completed, 0); assert.equal(result.partial, true);
  assert.equal(result.pendingCandidates.length, 1);
});
test('cancellation cannot publish late price responses', async () => {
  const controller = new AbortController(); let progress = 0;
  const { services } = fixture(async () => { controller.abort(); return response({ ok: true, jobId: 'abc', status: 'complete', results: [] }); });
  await assert.rejects(services.searchCandidates({}, { signal: controller.signal, onProgress: () => progress++ }), { name: 'AbortError' });
  assert.equal(progress, 0);
});
test('upstream error text and URLs are never exposed to UI', async () => {
  const { services } = fixture(async () => ({ ok: false, status: 503, json: async () => ({ error: 'secret-key=example' }) }));
  await assert.rejects(services.searchPlaces('KT'), error => !error.message.includes('secret'));
});
test('route requests are bounded and do not silently select TMAP', async () => {
  const calls = [];
  const { services } = fixture(async (url, options) => { calls.push({ url, options }); return response({ ok: true, items: [] }); });
  const conditions = { workplaces: [{ id: 'work', label: '회사', lat: 37.4, lng: 127.1, modes: ['transit'], maxMinutes: 60 }] };
  await services.verifyCommute([{ catalogId: 'home', lat: 37.3, lng: 127.2 }], conditions);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.maxTransitCalls, 10); assert.equal('transitProvider' in body, false);
  assert.equal(body.destinations[0].maxMinutes, 60);
  await assert.rejects(services.verifyCommute(Array(11).fill({ lat: 37, lng: 127 }), conditions));
  assert.equal(calls.length, 1);
});
test('backup keeps remote Ver1 conditions and uses its current revision', async () => {
  const { services, session } = fixture(async () => response({}));
  session.loadSnapshot = async () => ({ snapshot: { recommendationFilters: { maxPriceManWon: 90000 } }, revision: 7 });
  let saved;
  session.saveSnapshot = async (snapshot, revision) => { saved = { snapshot, revision }; return saved; };
  await services.backupRecords({ getShared: () => ({ visits: [],shortlist: [],supplyFavorites: [],parkingObservations: {} }), getBackupSnapshot: remote => ({ ...remote, visits: [] }) });
  assert.equal(saved.snapshot.recommendationFilters.maxPriceManWon, 90000); assert.equal(saved.revision, 7);
});
test('account switch while loading backup never applies another UID record', async () => {
  const { services, session } = fixture(async () => response({}));
  session.loadSnapshot = async () => { session.setUser({ uid: 'different' }); return { snapshot: { visits: [] }, revision: 4 }; };
  let applied = false;
  await assert.rejects(services.restoreRecords({ getShared: () => ({}), applyBackupSnapshot: () => { applied = true; } }), error => error.code === 'ACCOUNT_CHANGED');
  assert.equal(applied, false);
});
test('poll waiting responds immediately to cancellation', async () => {
  const controller = new AbortController();
  const wait = waitForPoll(10000, controller.signal); controller.abort();
  await assert.rejects(wait, { name: 'AbortError' });
});
test('a new empty device cannot replace a nonempty existing backup', async () => {
  const {services,session}=fixture(async()=>response({}));
  session.loadSnapshot=async()=>({snapshot:{visits:[{id:'original'}]},revision:9});
  session.saveSnapshot=async()=>{throw new Error('must not save');};
  await assert.rejects(services.backupRecords({getShared:()=>({visits:[],shortlist:[],supplyFavorites:[],parkingObservations:{}})}),e=>e.code==='EMPTY_BACKUP_BLOCKED');
});
test('local edits arriving during restore cannot be overwritten', async()=>{
  const {services,session}=fixture(async()=>response({}));let shared={visits:[]},applied=false;
  session.loadSnapshot=async()=>{shared={visits:[{id:'new'}]};return {snapshot:{visits:[]},revision:1};};
  await assert.rejects(services.restoreRecords({getShared:()=>shared,applyBackupSnapshot:()=>{applied=true;}}),e=>e.code==='LOCAL_RECORDS_CHANGED');
  assert.equal(applied,false);
});
test('another owner UID cannot upload local records to a new account', async()=>{
  let loads=0;
  const session={init:async()=>{},getState:()=>({user:{uid:'new'}}),loadSnapshot:async()=>{loads++;},subscribe:()=>()=>{}};
  const services=createServices({config:{isLocalRuntime:true},session,storage:{getItem:()=> 'old'}});
  await assert.rejects(services.backupRecords({getShared:()=>({visits:[{id:'old'}]})}),e=>e.code==='RECORD_OWNER_MISMATCH');
  assert.equal(loads,0);
});
