import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createJourneyStore, JOURNEY_ROOT, PHOTO_LIMIT, PHOTO_BYTES_LIMIT, DAY_BYTES_LIMIT, DAY_LIMIT } from '../store.mjs';
import { createJourneyApi, JOURNEY_PATH } from '../api.mjs';
import { emptyDay } from '../../../shared/journey/core.mjs';
import { createSiteMemberGate } from '../../homehunt/server/site-members.cjs';
import { createRenderServer } from '../../homehunt/render/node-server.mjs';
import { createMemoryFirestore } from '../../../apps/homehunt/tests/helpers/firestore-memory.mjs';

const date = '2024-03-02', time = Date.parse(date + 'T12:00:00+09:00');
const jpeg = await readFile(new URL('../../invitation/tests/fixtures/pixel.jpg', import.meta.url));
const data = bytes => 'data:image/jpeg;base64,' + bytes.toString('base64');
const upload = (extra = {}) => ({ id: randomUUID(), full: data(jpeg), thumb: data(jpeg), ...extra });
const manual = (extra = {}) => ({ id: 'manual-one', person: 'together', kind: 'manual', title: '함께 산책', note: '사진으로 날짜만 확인', time: null, timePrecision: 'day', position: null, ...extra });
const draft = (extra = {}) => ({ ...emptyDay(date), records: [manual()], ...extra });
const source = (extra = {}) => ({ id: 'source-a', hash: 'a'.repeat(64), name: 'timeline.json', person: 'sungwoo', kind: 'timeline', importedAt: time, ...extra });
function incoming(extra = {}) {
  const input = { source: source(), records: [manual({ id: 'import-one', person: 'sungwoo', kind: 'visit', time, timePrecision: 'exact', sourceId: 'source-a' })], tracks: [{ id: 'track-one', person: 'sungwoo', sourceId: 'source-a', points: [{ lat: 37, lng: 127, time }, { lat: 37.1, lng: 127.1, time: time + 60000 }] }] };
  return { ...input, ...extra };
}
function fixture() {
  const db = createMemoryFirestore();
  db.doc = path => { const parts = path.split('/'), id = parts.pop(); return db.collection(parts.join('/')).doc(id); };
  let clock = time;
  return { db, now: () => clock, advance: amount => clock += amount, store: createJourneyStore({ db, now: () => clock }) };
}

test('empty archive and day reads do not seed or expose server metadata', async () => {
  const f = fixture();
  assert.deepEqual(await f.store.month(), { months: [], latestDate: null });
  assert.deepEqual(await f.store.month('2024-03'), { month: '2024-03', days: [] });
  assert.deepEqual(await f.store.day(date), emptyDay(date));
  assert.equal(f.db.calls.writes, 0);
  await f.store.save(date, { expectedRevision: 0, day: draft() }, 'first');
  const reopened = await createJourneyStore({ db: f.db }).day(date);
  assert.equal(reopened.records[0].time, null); assert.equal(reopened.records[0].position, null);
  assert.equal(reopened.revision, 1); assert.equal('updatedBy' in reopened, false);
  assert.deepEqual(await f.store.month(), { months: ['2024-03'], latestDate: date });
  const month = await f.store.month('2024-03');
  assert.equal(month.days[0].title, '함께 산책'); assert.equal(month.days[0].recordCount, 1);
  assert.equal(/updatedBy|data|hash/.test(JSON.stringify(month)), false);
});

test('day, monthly summaries, archive manifest and capacity counter commit together', async () => {
  const f = fixture();
  for (const nextDate of ['2025-02-04', '2023-01-01', date]) {
    await f.store.save(nextDate, { expectedRevision: 0, day: { ...emptyDay(nextDate), title: '기억', records: [manual()] } }, 'first');
  }
  assert.deepEqual(await f.store.month(), { months: ['2025-02', '2024-03', '2023-01'], latestDate: '2025-02-04' });
  const ledger = f.db.documents.get(JOURNEY_ROOT);
  assert.equal(ledger.dayCount, 3);
  const savedBytes = [...f.db.documents].filter(([key]) => key.startsWith(JOURNEY_ROOT + '/days/')).reduce((sum, [, value]) => sum + Buffer.byteLength(value.data), 0);
  assert.equal(ledger.dayBytes, savedBytes);
  assert.ok([...f.db.documents.keys()].every(key => key.startsWith(JOURNEY_ROOT)));
  const day = await f.store.day(date); day.note = '수정';
  await f.store.save(date, { expectedRevision: day.revision, day }, 'second');
  assert.equal(f.db.documents.get(JOURNEY_ROOT).dayCount, 3);
});

test('identical save replay is write-free; stale edits and simultaneous partner edits cannot overwrite', async () => {
  const f = fixture(), input = { expectedRevision: 0, day: draft() };
  await f.store.save(date, input, 'first');
  const writes = f.db.calls.writes;
  assert.equal((await f.store.save(date, input, 'first')).unchanged, true);
  assert.equal(f.db.calls.writes, writes);
  await assert.rejects(f.store.save(date, { ...input, day: { ...draft(), title: '오래된 수정' } }, 'second'), { code: 'JOURNEY_CONFLICT', status: 409 });
  const before = await f.store.day(date);
  const results = await Promise.allSettled(['성우 메모', '소희 메모'].map(note => f.store.save(date, { expectedRevision: 1, day: { ...before, note } }, 'first')));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'JOURNEY_CONFLICT');
  assert.equal((await f.store.day(date)).revision, 2);
});

test('timeline additions preserve manual and edited imported records; overlap retries do not write', async () => {
  const f = fixture(); await f.store.save(date, { expectedRevision: 0, day: draft() }, 'first');
  const first = await f.store.import(date, incoming(), 'first');
  assert.equal(first.addedRecords, 1); assert.equal(first.addedTracks, 1); assert.equal(first.day.revision, 2);
  const edited = { ...first.day, records: first.day.records.map(record => record.kind === 'visit' ? { ...record, title: '기억을 보완한 장소', edited: true } : record) };
  await f.store.save(date, { expectedRevision: 2, day: edited }, 'second');
  const writes = f.db.calls.writes, replay = await f.store.import(date, incoming(), 'first');
  assert.equal(replay.unchanged, true); assert.equal(f.db.calls.writes, writes);
  assert.equal(replay.day.records.find(record => record.id === 'import-one').title, '기억을 보완한 장소');
  assert.equal(replay.day.records.find(record => record.id === 'manual-one').title, '함께 산책');
  const another = incoming({ source: source({ id: 'source-b', hash: 'b'.repeat(64) }) });
  another.records[0].sourceId = 'source-b'; another.tracks[0].sourceId = 'source-b'; another.tracks[0].id = 'another-file-track';
  assert.equal((await f.store.import(date, another, 'second')).unchanged, true);
  assert.equal(f.db.calls.writes, writes);
});

test('missing photo references, invalid dates and forged input fail before any writes', async () => {
  const f = fixture();
  await assert.rejects(f.store.save(date, { expectedRevision: 0, day: draft({ records: [manual({ photoId: randomUUID(), kind: 'photo' })] }) }, 'first'), { code: 'PHOTO_MISSING' });
  for (const value of [null, [], {}, { expectedRevision: 0, day: { ...draft(), uid: 'forged' } }, { expectedRevision: -1, day: draft() }, { expectedRevision: 0, day: { ...draft(), date: '2024-02-30' } }]) await assert.rejects(f.store.save(date, value, 'first'), { status: 400 });
  for (const value of [null, [], {}, { ...incoming(), updatedBy: 'forged' }, { ...incoming(), records: [manual()] }]) await assert.rejects(f.store.import(date, value, 'first'), { status: 400 });
  for (const value of ['2024-02-30', '../private', '2024-2-01']) await assert.rejects(f.store.day(value), { status: 400 });
  for (const value of ['', '2024-00', '2024-13', '../private']) await assert.rejects(f.store.month(value), { status: 400 });
  assert.equal(f.db.calls.writes, 0);
});

test('import provenance cannot be rewritten with a manual save', async () => {
  const f = fixture(), result = await f.store.import(date, incoming(), 'first'), writes = f.db.calls.writes;
  await assert.rejects(f.store.save(date, { expectedRevision: 1, day: { ...result.day, imports: [] } }, 'first'), { status: 400 });
  for (const partial of [{ tracks: [] }, { records: [] }, { records: result.day.records.map(record => ({ ...record, kind: 'manual' })) }]) await assert.rejects(f.store.save(date, { expectedRevision: 1, day: { ...result.day, ...partial } }, 'first'), { status: 400 });
  assert.equal(f.db.calls.writes, writes);
});

test('photo uploads are private, immutable and UUID-idempotent with sanitized location metadata', async () => {
  const f = fixture(), payload = Buffer.from('Exif\0\0PRIVATE_LOCATION'), length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  const tagged = Buffer.concat([jpeg.subarray(0, 2), Buffer.from([255, 225]), length, payload, jpeg.subarray(2)]);
  const input = upload({ full: data(tagged), thumb: data(tagged) });
  const result = await f.store.upload(input, 'first');
  assert.deepEqual(result.photo, { id: input.id, width: 12, height: 18 });
  assert.deepEqual(await f.store.photo(input.id), jpeg); assert.deepEqual(await f.store.photo(input.id, 'full'), jpeg);
  assert.equal(f.db.documents.get(JOURNEY_ROOT).bytes, jpeg.toString('base64').length * 2);
  const writes = f.db.calls.writes;
  assert.equal((await f.store.upload({ ...input, full: data(jpeg), thumb: data(jpeg) }, 'first')).unchanged, true);
  assert.equal(f.db.calls.writes, writes);
  const comment = Buffer.concat([jpeg.subarray(0, 2), Buffer.from([255, 254, 0, 5, 97, 98, 99]), jpeg.subarray(2)]);
  await assert.rejects(f.store.upload({ ...input, full: data(comment), thumb: data(comment) }, 'second'), { code: 'PHOTO_CONFLICT' });
  await f.store.save(date, { expectedRevision: 0, day: draft({ records: [manual({ kind: 'photo', photoId: input.id })] }) }, 'second');
  assert.equal((await f.store.month('2024-03')).days[0].photoCount, 1);
  for (const invalid of [null, { ...input, createdBy: 'forged' }, { ...input, id: '../private' }, { ...input, full: 'data:image/svg+xml;base64,AAAA' }]) await assert.rejects(f.store.upload(invalid, 'first'), { status: 400 });
  await assert.rejects(f.store.photo(randomUUID()), { status: 404 });
  await assert.rejects(f.store.photo(input.id, 'source'), { status: 404 });
});

test('photo count and byte quotas reject atomically while retries and saved photos remain accessible', async () => {
  for (const mode of ['count', 'bytes']) {
    const f = fixture(), input = upload(); await f.store.upload(input, 'first');
    const ledger = f.db.documents.get(JOURNEY_ROOT);
    if (mode === 'count') ledger.photos = [ledger.photos[0], ...Array.from({ length: PHOTO_LIMIT - 1 }, () => ({ id: randomUUID() }))];
    else ledger.bytes = PHOTO_BYTES_LIMIT;
    f.db.documents.set(JOURNEY_ROOT, ledger); const writes = f.db.calls.writes;
    await assert.rejects(f.store.upload(upload(), 'second'), { code: 'PHOTO_LIMIT', status: 409 });
    assert.equal((await f.store.upload(input, 'first')).unchanged, true);
    assert.deepEqual(await f.store.photo(input.id), jpeg); assert.equal(f.db.calls.writes, writes);
  }
});

test('day storage limits keep failed day and month creation atomic', async () => {
  for (const mode of ['count', 'bytes']) {
    const f = fixture(); await f.store.upload(upload(), 'first');
    const ledger = f.db.documents.get(JOURNEY_ROOT);
    if (mode === 'count') ledger.dayCount = DAY_LIMIT; else ledger.dayBytes = DAY_BYTES_LIMIT;
    f.db.documents.set(JOURNEY_ROOT, ledger); const writes = f.db.calls.writes;
    await assert.rejects(f.store.save(date, { expectedRevision: 0, day: draft() }, 'first'), { code: 'JOURNEY_LIMIT' });
    assert.equal(f.db.calls.writes, writes); assert.equal((await f.store.day(date)).revision, 0);
    assert.deepEqual(await f.store.month(), { months: [], latestDate: null });
  }
});

async function httpFixture(t, options = {}) {
  const f = fixture(), verified = [];
  for (const [uid, role, active] of [['first', 'sungwoo', true], ['second', 'sohee', true], ['disabled', 'sungwoo', false], ['wrong', 'admin', true]]) f.db.documents.set('site_members/' + uid, { role, active });
  const authenticate = createSiteMemberGate({ db: f.db, auth: { async verifyIdToken(token, checkRevoked) {
    verified.push(checkRevoked);
    if (token === 'revoked') throw Error('private-auth-details');
    return { uid: token, email: 'fixture@example.test', email_verified: token !== 'unverified', firebase: { sign_in_provider: token === 'password' ? 'password' : 'google.com' } };
  } } });
  const handler = createJourneyApi({ ...f, authenticate, ...options });
  const server = createRenderServer({ journey: handler, api: (_req, res) => res.status(401).json({ code: 'AUTH_REQUIRED' }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = uid => ({ Origin: 'https://castlerain.github.io', 'Content-Type': 'application/json', ...(uid ? { Authorization: 'Bearer ' + uid } : {}) });
  const request = (path, uid = 'first', opts = {}) => fetch(base + JOURNEY_PATH + path, { ...opts, headers: { ...headers(uid), ...opts.headers } });
  return { ...f, base, headers, request, verified };
}

test('HTTP: all records and photos require verified active membership on every read and write', async t => {
  const f = await httpFixture(t);
  for (const uid of ['', 'revoked', 'outsider', 'disabled', 'wrong', 'unverified', 'password']) {
    const expected = ['', 'revoked'].includes(uid) ? 401 : 403;
    for (const path of ['/months', '/days/' + date, '/photos/' + randomUUID()]) assert.equal((await f.request(path, uid)).status, expected);
    assert.equal((await f.request('/days/' + date, uid, { method: 'PUT', body: JSON.stringify({ expectedRevision: 0, day: draft() }) })).status, expected);
  }
  for (const uid of ['first', 'second']) assert.equal((await f.request('/months', uid)).status, 200);
  assert.equal(f.db.calls.writes, 0); assert.ok(f.verified.every(Boolean));
  await f.request('/days/' + date, 'first', { method: 'PUT', body: JSON.stringify({ expectedRevision: 0, day: draft() }) });
  const reopened = await f.request('/days/' + date, 'second');
  assert.equal(reopened.headers.get('cache-control'), 'private, no-store');
  assert.equal((await reopened.json()).day.revision, 1);
  f.db.documents.set('site_members/second', { role: 'sohee', active: false });
  assert.equal((await f.request('/days/' + date, 'second')).status, 403);
});

test('HTTP: upload, thumbnail and import use private responses and exact route boundaries', async t => {
  const f = await httpFixture(t), input = upload();
  let response = await f.request('/photos', 'first', { method: 'POST', body: JSON.stringify(input) });
  assert.equal(response.status, 200); assert.equal((await response.json()).photo.id, input.id);
  response = await f.request('/photos/' + input.id + '?size=full', 'second');
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), jpeg);
  response = await f.request('/days/' + date + '/import', 'first', { method: 'POST', body: JSON.stringify(incoming()) });
  assert.equal(response.status, 200); assert.equal((await response.json()).addedTracks, 1);
  assert.equal((await f.request('/days/' + date + '/import/extra')).status, 404);
  assert.equal((await f.request('/days/' + date, 'first', { method: 'DELETE' })).status, 405);
  assert.equal((await fetch(f.base + '/api/journey/v10/months', { headers: f.headers('first') })).status, 401);
  assert.equal((await fetch(f.base + '/api/health', { headers: f.headers('first') })).status, 401);
  for (const Origin of ['https://evil.example', 'https://sungso-wedding.vercel.app', 'http://localhost:8024']) assert.equal((await f.request('/months', 'first', { headers: { Origin } })).status, 403);
  response = await f.request('/months', '', { method: 'OPTIONS' });
  assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type, Authorization');
});

test('HTTP: malformed bodies and invalid fields are client errors with no writes', async t => {
  const f = await httpFixture(t), path = '/days/' + date;
  for (const body of ['{bad', 'null', '[]', '{}', JSON.stringify({ expectedRevision: 0, day: { ...draft(), unknown: true } })]) {
    const result = await f.request(path, 'first', { method: 'PUT', body }); assert.equal(result.status, 400);
  }
  assert.equal((await f.request(path, 'first', { method: 'PUT', body: '{}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await f.request(path, 'first', { method: 'PUT', body: JSON.stringify({ data: 'x'.repeat(660 * 1024) }) })).status, 413);
  assert.equal((await f.request('/months?month=2024-00')).status, 400);
  assert.equal((await f.request('/days/2024-02-30')).status, 400);
  assert.equal((await f.request('/days/2024-02-30/import', 'first', { method: 'POST', body: JSON.stringify(incoming()) })).status, 400);
  assert.equal(f.db.calls.writes, 0);
});

test('HTTP: storage failures are sanitized and rate limits do not write storage', async t => {
  const f = await httpFixture(t, { store: { async month() { throw Error('PRIVATE_PROVIDER_CREDENTIAL'); } } });
  const response = await f.request('/months');
  assert.equal(response.status, 503); const text = await response.text();
  assert.equal(text.includes('PRIVATE_PROVIDER_CREDENTIAL'), false); assert.equal(JSON.parse(text).code, 'JOURNEY_UNAVAILABLE');
  const api = createJourneyApi({ store: { async month() { return { months: [], latestDate: null }; } }, authenticate: async () => ({ uid: 'first' }), now: f.now });
  function res() { return { statusCode: null, setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.value = value; return this; } }; }
  let result;
  for (let i = 0; i < 601; i++) { result = res(); await api({ method: 'GET', url: JOURNEY_PATH + '/months', headers: {} }, result); }
  assert.equal(result.statusCode, 429); assert.equal(result.value.code, 'RATE_LIMIT');
  assert.equal(f.db.calls.writes, 0);
});

test('HTTP: period playback is member-only, read-only and uses the existing origin boundary', async t => {
  const f = await httpFixture(t), path = '/playback?from=2023-01-01&to=2026-12-31';
  for (const token of ['', 'unknown', 'inactive', 'outsider']) assert.notEqual((await f.request(path, token)).status, 200);
  for (const Origin of ['https://evil.example', 'https://sungso-wedding.vercel.app']) assert.equal((await f.request(path, 'first', { headers: { Origin } })).status, 403);
  for (const member of ['first', 'second']) {
    const response = await f.request(path, member);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await response.json(), { ok: true, days: [], nextCursor: null });
  }
  assert.equal((await f.request('/playback?from=2026-01-01&to=2025-01-01')).status, 400);
  assert.equal((await f.request('/playback')).status, 400);
  assert.equal((await f.request(path, 'first', { method: 'POST', body: '{}' })).status, 405);
  assert.equal(f.db.calls.writes, 0);
});
