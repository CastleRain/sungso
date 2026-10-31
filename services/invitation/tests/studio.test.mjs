import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMemoryFirestore } from '../../../apps/homehunt/tests/helpers/firestore-memory.mjs';
import { createStudioStore, createStudioApi, validateStudioSnapshot, STUDIO_PATH } from '../server/studio.mjs';
import { normalizeComposition } from '../../../shared/invitation/studio/composition.mjs';
import { createRenderServer } from '../../homehunt/render/node-server.mjs';
import { createSiteMemberGate } from '../../homehunt/server/site-members.cjs';
function fixture() {
  const db = createMemoryFirestore(); db.doc = p => { const a = p.split('/'), id = a.pop(); return db.collection(a.join('/')).doc(id); };
  return { db, store: createStudioStore({ db }), member: { uid: 'fixture-first', role: 'sungwoo' } };
}
const shot = text => ({ composition: normalizeComposition({ palette: 'rose', motionSpeed: .75 }), content: { version: 1, text: { invitation: text }, photos: [], albumOrder: null } });
const save = (revision = 0, extra = {}) => ({ action: 'save', operationId: randomUUID(), expectedRevision: revision, id: randomUUID(), expectedDraftRevision: 0, name: '합성 초안', rating: 4, note: '개인 메모', snapshot: shot('초대 문구'), ...extra });
test('new V2 scene selections persist privately and reach an explicit public release unchanged', async()=>{
  const f=fixture(),a=save();
  a.snapshot.composition=normalizeComposition({album:'film',dayPass:'receipt',wishes:'polaroid',divider:'breath',extras:['day-pass']});
  await f.store.change(a,f.member);
  assert.equal((await f.store.published()).release,null);
  assert.deepEqual((await f.store.draft(a.id)).snapshot.composition,a.snapshot.composition);
  await f.store.change({action:'publish',id:a.id,operationId:randomUUID(),expectedRevision:1,expectedDraftRevision:1},f.member);
  assert.deepEqual((await f.store.published()).release.snapshot.composition,a.snapshot.composition);
});
test('studio read never seeds; shared drafts stay private until explicit immutable publication', async () => {
  const f = fixture(); assert.equal((await f.store.read()).revision, 0); assert.equal((await f.store.published()).release, null); assert.equal(f.db.calls.writes, 0);
  const a = save(); await f.store.change(a, f.member); assert.equal((await f.store.published()).release, null);
  const first = await f.store.draft(a.id); assert.deepEqual(first.snapshot, a.snapshot);
  await f.store.change({ action: 'publish', id: a.id, operationId: randomUUID(), expectedRevision: 1, expectedDraftRevision: 1 }, { ...f.member, role: 'sohee' });
  await f.store.change(save(2, { id: a.id, expectedDraftRevision: 1, snapshot: shot('수정 중인 비공개 문구') }), f.member);
  const publicData = await f.store.published(); assert.equal(publicData.release.snapshot.content.text.invitation, '초대 문구');
  assert.ok(!JSON.stringify(publicData).includes('개인 메모')); assert.ok(!JSON.stringify(publicData).includes('editor')); assert.ok(!JSON.stringify(publicData).includes('합성 초안'));
  assert.equal((await f.store.draft(a.id)).snapshot.content.text.invitation, '수정 중인 비공개 문구');
});
test('lost responses are idempotent, concurrent edits and stale publish cannot overwrite, rollback retains drafts', async () => {
  const f = fixture(), a = save(); await f.store.change(a, f.member); const writes = f.db.calls.writes;
  await f.store.change(a, f.member); assert.equal(f.db.calls.writes, writes);
  await assert.rejects(f.store.change({ ...a, note: 'different' }, f.member));
  await assert.rejects(f.store.change(save(0), f.member), { code: 'CONFLICT' });
  await assert.rejects(f.store.change({ action: 'publish', id: a.id, operationId: randomUUID(), expectedRevision: 1, expectedDraftRevision: 0 }, f.member), { code: 'CONFLICT' });
  const p = { action: 'publish', id: a.id, operationId: randomUUID(), expectedRevision: 1, expectedDraftRevision: 1 };
  await f.store.change(p, f.member); await f.store.change(p, f.member); assert.equal((await f.store.read()).releases.length, 1);
  await f.store.change({ action: 'restore', id: 'legacy', operationId: randomUUID(), expectedRevision: 2 }, f.member); assert.equal((await f.store.published()).release, null);
  await f.store.change({ action: 'restore', id: p.operationId, operationId: randomUUID(), expectedRevision: 3 }, f.member);
  assert.equal((await f.store.published()).release.snapshot.content.text.invitation, '초대 문구'); assert.equal((await f.store.read()).drafts.length, 1);
});
test('photos round trip privately; only selected current-release raster bytes are public', async () => {
  const f = fixture(), a = save();
  a.snapshot.content.photos = [{ id: 'local_fixture', src: 'data:image/jpeg;base64,/9j/AAAA', width: 10, height: 10 }]; a.snapshot.content.albumOrder = ['local_fixture'];
  await f.store.change(a, f.member);
  const photoKey = [...f.db.documents.keys()].find(k => k.includes('/photos/')).split('/').pop();
  await assert.rejects(f.store.photo(photoKey), { status: 404 }); assert.deepEqual((await f.store.draft(a.id)).snapshot.content.photos, a.snapshot.content.photos);
  await f.store.change({ action: 'publish', id: a.id, operationId: randomUUID(), expectedRevision: 1, expectedDraftRevision: 1 }, f.member);
  assert.equal(await f.store.photo(photoKey), a.snapshot.content.photos[0].src);
  const dto = await f.store.published(); assert.ok(dto.release.snapshot.content.photos[0].src.endsWith(photoKey)); assert.ok(!JSON.stringify(dto).includes('base64'));
  await f.store.change({ action: 'restore', id: 'legacy', operationId: randomUUID(), expectedRevision: 2 }, f.member);
  await assert.rejects(f.store.photo(photoKey), { status: 404 });
});
test('publication validates bounded content, strips no side-effect flags into a live schema', () => {
  assert.throws(() => validateStudioSnapshot({ ...shot('a'), mode: 'live' }));
  assert.throws(() => validateStudioSnapshot({ ...shot('a'), composition: { mode: 'live' } }));
  assert.throws(() => validateStudioSnapshot({ ...shot('a'), content: { text: { invitation: 'x'.repeat(601) } } }));
  assert.throws(() => validateStudioSnapshot({ ...shot('a'), content: { photos: [{ id: 'local_x', src: 'data:image/svg+xml;base64,AAAA', width: 10, height: 10 }] } }));
});
test('studio API has the same two-member gate, exact invitation CORS and no public draft writes', async () => {
  const f = fixture(); await f.db.doc('site_members/first').set({ active: true, role: 'sungwoo' }); await f.db.doc('site_members/second').set({ active: true, role: 'sohee' }); await f.db.doc('site_members/denied').set({ active: false, role: 'sohee' });
  const authenticate = createSiteMemberGate({ db: f.db, auth: { async verifyIdToken(token) { if (!['first','second','denied','outsider'].includes(token)) throw Error(); return { uid: token, email: 'fixture@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } }; } } });
  const server = createRenderServer({ api: (_q, r) => r.status(401).json({ ok: false }), studio: createStudioApi({ store: f.store, authenticate }) });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const get = (p, token, origin = 'https://sungso-wedding.vercel.app') => fetch(base + p, { headers: { Origin: origin, ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
    assert.equal((await get(STUDIO_PATH + '/published')).status, 200);
    assert.equal((await get(STUDIO_PATH + '/manage')).status, 401);
    for (const token of ['denied','outsider']) assert.equal((await get(STUDIO_PATH + '/manage', token)).status, 403);
    for (const token of ['first','second']) assert.equal((await get(STUDIO_PATH + '/manage', token)).status, 200);
    assert.equal((await get(STUDIO_PATH + '/manage', 'first', 'https://other.vercel.app')).status, 403);
    assert.equal((await get('/api/health', 'first')).status, 403);
    const request = save();
    assert.equal((await fetch(base + STUDIO_PATH + '/manage', { method: 'POST', headers: { Authorization: 'Bearer first', 'Content-Type': 'application/json' }, body: JSON.stringify(request) })).status, 200);
    assert.equal((await get(STUDIO_PATH + '/draft/' + request.id, 'second')).status, 200);
    assert.equal((await get(STUDIO_PATH + '/draft/' + request.id)).status, 401);
    assert.equal((await fetch(base + STUDIO_PATH + '/published', { method: 'POST', body: '{}' })).status, 401);
  } finally { await new Promise(r => server.close(r)); }
});
