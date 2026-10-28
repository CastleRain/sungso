import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { emptyDay, mergeDayImport, summarizeDay, validateDay } from '../../../shared/journey/core.mjs';
import { mountJourney } from '../js/ui.mjs';

const require = createRequire(new URL('../../sohee/sales/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const DATE = '2026-10-18';
const TIME = Date.parse(DATE + 'T14:00:00+09:00');
const PHOTO_ID = 'a39a966c-6635-4f86-adcb-6b0c125ad872';
const source = { id: 'timeline_sungwoo_test', hash: 'a'.repeat(64), name: 'test.json', person: 'sungwoo', kind: 'timeline', importedAt: TIME };
const memory = (id, title, extra = {}) => ({ id, person: 'together', kind: 'manual', title, note: '', time: null, timePrecision: 'day', position: null, ...extra });
const visit = () => memory('imported-visit', '원본 장소', { person: 'sungwoo', kind: 'visit', sourceId: source.id, time: TIME, timePrecision: 'exact', position: { lat: 37.5, lng: 127 } });
const fixtureDay = (records = [], extra = {}) => validateDay({ ...emptyDay(DATE), records, ...extra });
const clone = value => structuredClone(value);
const conflict = () => Object.assign(new Error('다른 기기의 변경'), { status: 409 });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check, label = 'UI update') { for (let i = 0; i < 50; i++) { if (check()) return; await tick(); } assert.fail(`Timed out waiting for ${label}`); }

// Only transport and browser-only dependencies are replaced. The rendered HTML,
// event handlers, schemas, import merge and optimistic concurrency are real.
function database(initial = fixtureDay()) {
  const db = { days: new Map([[initial.date, clone(initial)]]), photos: new Map(), calls: [], beforePut: null, afterPut: null, beforeImport: null, beforeArchive: null, beforePhotoRead: null };
  db.request = async (path, options = {}) => {
    const method = options.method || 'GET';
    db.calls.push({ path, method, body: options.body ? clone(options.body) : undefined });
    if (path === '/months') { await db.beforeArchive?.(); return { months: [...new Set([...db.days.keys()].map(date => date.slice(0, 7)))], latestDate: [...db.days.keys()].sort().at(-1) }; }
    if (path.startsWith('/months?')) { const month = new URLSearchParams(path.split('?')[1]).get('month'); return { month, days: [...db.days.values()].filter(day => day.date.startsWith(month) && (day.revision || day.records.length || day.tracks.length)).map(summarizeDay) }; }
    if (path === '/photos' && method === 'POST') { db.photos.set(options.body.id, clone(options.body)); return { photo: { id: options.body.id } }; }
    if (path.startsWith('/photos/') && method === 'GET') { await db.beforePhotoRead?.(path); return new Blob(['synthetic-image'], { type: 'image/jpeg' }); }
    const match = /^\/days\/(\d{4}-\d{2}-\d{2})(\/import)?$/.exec(path);
    assert.ok(match, `Unexpected mock API route: ${method} ${path}`);
    const date = match[1];
    if (method === 'GET') return { day: clone(db.days.get(date) || emptyDay(date)) };
    if (match[2]) {
      await db.beforeImport?.(date, options.body);
      const result = mergeDayImport(db.days.get(date) || emptyDay(date), options.body);
      if (result.changed) { result.day.revision++; db.days.set(date, clone(result.day)); }
      return result;
    }
    assert.equal(method, 'PUT');
    await db.beforePut?.(date, options.body);
    const next = validateDay(options.body.day), prior = db.days.get(date) || emptyDay(date);
    const unchanged = JSON.stringify({ ...next, revision: 0 }) === JSON.stringify({ ...prior, revision: 0 });
    if (!unchanged && options.body.expectedRevision !== prior.revision) throw conflict();
    const saved = unchanged ? prior : validateDay({ ...next, revision: prior.revision + 1 });
    db.days.set(date, clone(saved));
    await db.afterPut?.(date, saved);
    return { day: clone(saved), unchanged };
  };
  return db;
}

async function harness(t, { db = database(), preparePhoto, waitForReady = true } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/sungso/journey/', pretendToBeVisual: true });
  const saved = new Map(['window', 'document', 'AbortController'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.AbortController = dom.window.AbortController;
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  const root = dom.window.document.querySelector('[data-private-root]'); root.hidden = false;
  const $ = id => root.querySelector('#' + id), workers = [], map = {
    ready: Promise.resolve(true), renders: [], range: null, resizeCount: 0, state: { progress: 0, time: null, playing: false, speed: 1, available: false },
    render(day, options) { this.renders.push({ day: clone(day), options }); const points = day.tracks.filter(track => options.person === 'all' || track.person === options.person).flatMap(track => track.points); this.range = points.length ? [Math.min(...points.map(point => point.time)), Math.max(...points.map(point => point.time))] : null; this.state = { ...this.state, progress: 0, time: this.range?.[0] ?? null, startTime: this.range?.[0] ?? null, endTime: this.range?.[1] ?? null, playing: false, available: !!this.range && this.range[1] > this.range[0] }; },
    getPlayback() { return clone(this.state); },
    stop() { this.state = { ...this.state, playing: false, progress: 0, time: this.range?.[0] ?? null }; return this.getPlayback(); },
    pause() { this.state.playing = false; return this.getPlayback(); },
    seek(progress) { this.state.progress = progress; this.state.time = this.range ? this.range[0] + (this.range[1] - this.range[0]) * progress : null; return this.getPlayback(); },
    setSpeed(speed) { this.state.speed = speed; return this.getPlayback(); },
    resize() { this.resizeCount++; }, setPicking() {}, destroy() {},
    play(options) { this.playOptions = options; if (!this.state.available) return false; if (this.state.progress === 1) this.seek(0); this.state.playing = true; this.state.speed = options.speed; return true; }
  };
  const app = mountJourney({ root, request: db.request, member: { name: '성우' }, mapFactory: ({ onStatus }) => { onStatus({ ready: true }); return map; }, ...(preparePhoto ? { preparePhoto } : {}), workerFactory: url => {
    assert.match(String(url), /import-worker\.mjs$/);
    const worker = { payload: null, terminated: false, postMessage(payload) { this.payload = payload; }, terminate() { this.terminated = true; }, respond(result) { this.onmessage?.({ data: { ok: true, result } }); } };
    workers.push(worker); return worker;
  } });
  let closed = false;
  const close = () => { if (closed) return; closed = true; app.dispose(); dom.window.close(); for (const [key, descriptor] of saved) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; };
  t.after(close);
  if (waitForReady) await until(() => /저장됨|아직 저장한/.test($('saveState').textContent), 'initial day load');
  return { $, root, db, workers, map, close, change(id, value) { $(id).value = value; $(id).dispatchEvent(new dom.window.Event('change', { bubbles: true })); }, file(id, value) { Object.defineProperty($(id), 'files', { configurable: true, value: value ? [value] : [] }); $(id).dispatchEvent(new dom.window.Event('change', { bubbles: true })); }, submit(id = 'recordForm') { $(id).dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); }, event(name, options) { return new dom.window.Event(name, options); } };
}

function timelineResult(person = 'sungwoo', date = DATE) {
  const ownerSource = { ...source, person, id: `timeline_${person}_test` };
  const day = validateDay({ ...emptyDay(date), imports: [ownerSource], records: [memory(`${person}-visit`, `${person} 장소`, { person, kind: 'visit', sourceId: ownerSource.id })] });
  return { source: ownerSource, days: [day], warnings: [] };
}

test('manual record without time or position saves, reopens from DB and remains editable', async t => {
  const db = database(); const h = await harness(t, { db });
  h.$('addRecord').click(); h.$('recordTitle').value = '함께 걸었던 날'; h.$('recordNote').value = '사진을 보고 기억한 이야기'; h.$('recordPerson').value = 'sohee'; h.submit();
  await until(() => !h.$('recordDialog').open, 'manual save');
  const saved = db.days.get(DATE).records[0];
  assert.equal(saved.kind, 'manual'); assert.equal(saved.person, 'sohee'); assert.equal(saved.time, null); assert.equal(saved.position, null); assert.equal(saved.timePrecision, 'day');
  assert.match(h.$('records').textContent, /함께 걸었던 날.*소희 · 시간 미기록/s);
  assert.equal(db.days.get(DATE).revision, 1);
  h.close();
  const reopened = await harness(t, { db });
  reopened.root.querySelector('.record-card').click();
  assert.equal(reopened.$('recordTitle').value, saved.title); assert.equal(reopened.$('recordNote').value, saved.note); assert.equal(reopened.$('recordTime').value, ''); assert.equal(reopened.$('recordDate').disabled, true);
  reopened.$('recordNote').value = '다시 확인한 이야기'; reopened.submit();
  await until(() => !reopened.$('recordDialog').open, 'reopened edit save');
  assert.equal(db.days.get(DATE).records.length, 1); assert.equal(db.days.get(DATE).records[0].id, saved.id); assert.equal(db.days.get(DATE).records[0].note, '다시 확인한 이야기');
});

test('attaching a photo to an imported visit preserves its kind, source and original identity', async t => {
  const original = { ...visit(), time: TIME + 37123 };
  const db = database(fixtureDay([original], { imports: [source], revision: 2 }));
  const photo = { id: PHOTO_ID, full: 'data:image/jpeg;base64,ZmFrZQ==', thumb: 'data:image/jpeg;base64,ZmFrZQ==', date: DATE, time: null, position: null, warnings: ['촬영 위치 없음'] };
  const h = await harness(t, { db, preparePhoto: async () => photo });
  h.root.querySelector('.record-card').click(); h.file('photoFile', { name: 'memory.jpg' });
  await until(() => !h.$('saveRecord').disabled, 'photo prepared');
  h.$('recordTitle').value = '사진으로 확인한 장소'; h.submit();
  await until(() => !h.$('recordDialog').open, 'photo save');
  const saved = db.days.get(DATE).records[0];
  assert.equal(saved.kind, 'visit'); assert.equal(saved.sourceId, source.id); assert.equal(saved.id, original.id); assert.equal(saved.photoId, PHOTO_ID); assert.deepEqual(saved.position, original.position); assert.equal(saved.time, original.time, 'editing a title or photo must preserve original timestamp precision');
  assert.equal(db.photos.size, 1); assert.equal(db.calls.filter(call => call.method === 'POST' && call.path === '/photos').length, 1);
  const put = db.calls.findIndex(call => call.method === 'PUT'); const upload = db.calls.findIndex(call => call.path === '/photos'); assert.ok(upload < put, 'photo must persist before its day reference');
});

test('new photo record keeps EXIF seconds until the user changes its displayed minute', async t => {
  const photo = { id: PHOTO_ID, full: 'data:image/jpeg;base64,ZmFrZQ==', thumb: 'data:image/jpeg;base64,ZmFrZQ==', date: DATE, time: TIME + 37123, position: null, warnings: [] };
  const h = await harness(t, { preparePhoto: async () => photo }); h.$('addRecord').click(); h.$('recordTitle').value = '사진으로 남긴 순간'; h.file('photoFile', { name: 'timed.jpg' });
  await until(() => !h.$('saveRecord').disabled); assert.equal(h.$('recordTime').value, '14:00'); h.submit(); await until(() => !h.$('recordDialog').open);
  assert.equal(h.db.days.get(DATE).records[0].time, photo.time);
  h.root.querySelector('.record-card').click(); h.$('recordTime').value = '14:05'; h.submit(); await until(() => !h.$('recordDialog').open);
  assert.equal(h.db.days.get(DATE).records[0].time, TIME + 5 * 60000);
});

test('a slow older file read cannot replace the latest file and person import preview', async t => {
  const h = await harness(t); const oldRead = deferred();
  h.$('openImport').click(); h.file('timelineFile', { name: 'old.json', size: 100, text: () => oldRead.promise });
  h.$('importPerson').value = 'sohee'; h.file('timelineFile', { name: 'latest.json', size: 100, text: async () => 'latest-data' });
  await until(() => h.workers.length === 1, 'latest worker');
  const active = h.workers[0]; assert.equal(active.payload.text, 'latest-data'); assert.equal(active.payload.options.person, 'sohee'); assert.equal(active.payload.options.name, 'latest.json');
  oldRead.resolve('old-data'); await tick(); await tick();
  assert.equal(h.workers.length, 1); assert.equal(active.terminated, false);
  active.respond(timelineResult('sohee')); assert.equal(h.$('saveImport').disabled, false); h.submit('importForm');
  await until(() => h.db.calls.some(call => call.path.endsWith('/import')), 'import write');
  const request = h.db.calls.find(call => call.path.endsWith('/import')); assert.equal(request.body.source.person, 'sohee');
  await until(() => h.$('records').textContent.includes('sohee 장소'), 'saved latest import');
});

test('changing the timeline owner ignores a terminated worker and clearing the file invalidates the preview', async t => {
  const h = await harness(t); h.$('openImport').click();
  h.file('timelineFile', { name: 'same.json', size: 100, text: async () => 'data' }); await until(() => h.workers.length === 1);
  const old = h.workers[0]; h.change('importPerson', 'sohee'); await until(() => h.workers.length === 2);
  assert.equal(old.terminated, true); old.respond(timelineResult('sungwoo')); assert.equal(h.$('saveImport').disabled, true);
  h.workers[1].respond(timelineResult('sohee')); assert.equal(h.$('saveImport').disabled, false);
  h.file('timelineFile', null); assert.equal(h.$('saveImport').disabled, true); assert.equal(h.$('importPreview').textContent, ''); h.submit('importForm'); await tick();
  assert.equal(h.db.calls.filter(call => call.method === 'POST').length, 0);
});

test('retry after a lost success response uses the same record ID and creates only one record', async t => {
  const db = database(); let loseResponse = true;
  db.afterPut = () => { if (loseResponse) { loseResponse = false; throw new Error('응답 연결 끊김'); } };
  const h = await harness(t, { db }); h.$('addRecord').click(); h.$('recordTitle').value = '한 번만 남길 기억'; h.submit();
  await until(() => h.$('recordError').textContent.includes('응답 연결 끊김'));
  assert.equal(h.$('recordDialog').open, true); assert.equal(h.$('recordTitle').value, '한 번만 남길 기억'); h.submit();
  await until(() => !h.$('recordDialog').open, 'idempotent save retry');
  const puts = db.calls.filter(call => call.method === 'PUT'); assert.equal(puts.length, 2); assert.equal(puts[0].body.day.records[0].id, puts[1].body.day.records[0].id); assert.equal(db.days.get(DATE).records.length, 1); assert.equal(db.days.get(DATE).revision, 1);
});

test('revision conflict keeps typed input and explicit retry preserves other device additions', async t => {
  const original = memory('shared-memory', '원래 기억', { note: '원래 메모' }); const db = database(fixtureDay([original], { revision: 1 })); let concurrent = true;
  db.beforePut = () => { if (concurrent) { concurrent = false; db.days.set(DATE, fixtureDay([{ ...original, title: '다른 기기의 제목', note: '상대가 남긴 메모' }, memory('other-memory', '상대가 추가한 기억')], { revision: 2 })); } };
  const h = await harness(t, { db }); h.root.querySelector('.record-card').click(); h.$('recordTitle').value = '내가 보완한 제목'; h.$('recordNote').value = '지우면 안 되는 입력'; h.$('recordPerson').value = 'sohee'; h.submit();
  await until(() => h.$('saveRecord').textContent.includes('다시 저장'), 'conflict rebase');
  assert.equal(h.$('recordDialog').open, true); assert.equal(h.$('recordTitle').value, '내가 보완한 제목'); assert.equal(h.$('recordNote').value, '지우면 안 되는 입력'); assert.equal(h.$('recordPerson').value, 'sohee'); assert.match(h.$('recordError').textContent, /다른 기기의 제목/);
  assert.equal(db.calls.filter(call => call.method === 'PUT').length, 1, 'conflict must not silently retry');
  h.submit(); await until(() => !h.$('recordDialog').open);
  const saved = db.days.get(DATE); assert.equal(saved.revision, 3); assert.equal(saved.records.length, 2); assert.equal(saved.records.find(record => record.id === 'other-memory').title, '상대가 추가한 기억'); assert.equal(saved.records.find(record => record.id === original.id).note, '지우면 안 되는 입력'); assert.equal(saved.records.find(record => record.id === original.id).person, 'sohee');
});

test('a pending save locks the form and captures one consistent draft', async t => {
  const db = database(), gate = deferred(); db.beforePut = () => gate.promise;
  const h = await harness(t, { db }); h.$('addRecord').click(); h.$('recordTitle').value = '전송할 제목'; h.$('recordNote').value = '전송할 메모'; h.submit();
  await until(() => db.calls.some(call => call.method === 'PUT'));
  for (const id of ['recordTitle', 'recordNote', 'recordDate', 'recordPerson', 'photoFile', 'saveRecord']) assert.equal(h.$(id).disabled, true, `${id} stays locked`);
  const cancel = h.event('cancel', { cancelable: true }); h.$('recordDialog').dispatchEvent(cancel); assert.equal(cancel.defaultPrevented, true);
  h.$('recordTitle').value = '프로그램으로 바뀐 제목'; h.submit(); gate.resolve();
  await until(() => !h.$('recordDialog').open);
  assert.equal(db.calls.filter(call => call.method === 'PUT').length, 1); assert.equal(db.days.get(DATE).records[0].title, '전송할 제목'); assert.equal(db.days.get(DATE).records[0].note, '전송할 메모');
});

test('invalid photo processing blocks save until the selection is cleared', async t => {
  const h = await harness(t, { preparePhoto: async () => { throw new Error('깨진 사진'); } }); h.$('addRecord').click(); h.$('recordTitle').value = '날짜만 기억하는 사진'; h.file('photoFile', { name: 'broken.jpg' });
  await until(() => h.$('photoNote').textContent.includes('깨진 사진')); assert.equal(h.$('saveRecord').disabled, true); h.submit(); await tick(); assert.equal(h.db.calls.filter(call => call.method === 'PUT').length, 0);
  h.file('photoFile', null); assert.equal(h.$('saveRecord').disabled, false); h.submit(); await until(() => !h.$('recordDialog').open); assert.equal(h.db.days.get(DATE).records[0].kind, 'manual');
});

test('partial timeline save retries only pending days and preserves an already saved day', async t => {
  const db = database(); let fail = true; db.beforeImport = date => { if (date === '2026-10-19' && fail) { fail = false; throw new Error('일시적인 연결 오류'); } };
  const h = await harness(t, { db }); h.$('openImport').click(); h.file('timelineFile', { name: 'two-days.json', size: 100, text: async () => 'data' }); await until(() => h.workers.length === 1);
  const first = timelineResult(), second = timelineResult('sungwoo', '2026-10-19'); second.days[0].records[0].id = 'second-day-visit'; h.workers[0].respond({ ...first, days: [...first.days, ...second.days] }); h.submit('importForm');
  await until(() => h.$('importError').textContent.includes('1일은 저장됐어요')); assert.equal(db.days.get(DATE).revision, 1); h.submit('importForm');
  await until(() => h.$('importProgress').textContent.includes('2일의 기록을 저장했어요'));
  assert.equal(db.calls.filter(call => call.path === `/days/${DATE}/import`).length, 1); assert.equal(db.calls.filter(call => call.path === '/days/2026-10-19/import').length, 2); assert.equal(db.days.get(DATE).revision, 1); assert.equal(db.days.get('2026-10-19').records.length, 1);
  await until(() => h.$('records').textContent.includes('sungwoo 장소'));
});

test('map playback shows fractional progress from the map callback and resets on completion', async t => {
  const db = database(fixtureDay([], { imports: [source], tracks: [{ id: 'track-a', person: 'sungwoo', sourceId: source.id, points: [{ lat: 37.5, lng: 127, time: TIME }, { lat: 37.501, lng: 127.001, time: TIME + 60000 }] }] }));
  const h = await harness(t, { db }); assert.equal(h.$('playDay').disabled, false); h.$('playDay').click(); assert.equal(h.$('stopDay').hidden, false);
  h.map.playOptions.onProgress({ progress: .42, time: TIME }); assert.equal(h.$('playState').textContent, '42%');
  h.map.playOptions.onComplete(); assert.equal(h.$('stopDay').hidden, true); assert.equal(h.$('playDay').hidden, false); assert.match(h.$('playState').textContent, /마쳤어요/);
});

test('saved full photo opens through authenticated transport and returns to the unchanged editor', async t => {
  const db = database(fixtureDay([memory('photo-memory', '저장한 사진', { kind: 'photo', photoId: PHOTO_ID })], { revision: 1 }));
  const h = await harness(t, { db }), revoked = [], revoke = URL.revokeObjectURL;
  URL.revokeObjectURL = url => { revoked.push(url); revoke(url); }; t.after(() => { URL.revokeObjectURL = revoke; });
  h.root.querySelector('.record-card').click(); h.$('recordTitle').value = '아직 저장 안 한 제목'; h.$('recordNote').value = '사진을 봐도 남아야 하는 메모'; assert.equal(h.$('viewPhoto').hidden, false); h.$('viewPhoto').click();
  await until(() => !h.$('fullPhoto').hidden, 'saved full photo');
  assert.equal(h.$('recordDialog').open, true); assert.equal(h.$('photoDialog').open, true); assert.equal(h.$('fullPhoto').alt, '아직 저장 안 한 제목');
  assert.equal(db.calls.filter(call => call.path === `/photos/${PHOTO_ID}?size=full`).length, 1);
  const url = h.$('fullPhoto').src; assert.match(url, /^blob:/); h.$('closePhotoView').click();
  assert.equal(h.$('photoDialog').open, false); assert.equal(h.$('recordDialog').open, true); assert.equal(h.$('recordTitle').value, '아직 저장 안 한 제목'); assert.equal(h.$('recordNote').value, '사진을 봐도 남아야 하는 메모'); assert.equal(h.$('fullPhoto').getAttribute('src'), null); assert.ok(revoked.includes(url)); assert.equal(h.root.ownerDocument.activeElement, h.$('viewPhoto')); assert.equal(db.calls.filter(call => call.method === 'PUT').length, 0);
  h.close();
});

test('prepared photo opens locally without uploading and Escape restores the draft', async t => {
  const photo = { id: PHOTO_ID, full: 'data:image/jpeg;base64,ZnVsbA==', thumb: 'data:image/jpeg;base64,dGh1bWI=', date: DATE, time: null, position: null, warnings: [] };
  const h = await harness(t, { preparePhoto: async () => photo }); h.$('addRecord').click(); assert.equal(h.$('viewPhoto').hidden, true); h.$('recordTitle').value = '미저장 사진'; h.file('photoFile', { name: 'new.jpg' }); await until(() => !h.$('saveRecord').disabled);
  h.$('viewPhoto').click(); assert.equal(h.$('fullPhoto').src, photo.full); assert.equal(h.$('photoDialog').open, true); assert.equal(h.db.calls.filter(call => call.path.startsWith('/photos')).length, 0);
  const cancel = h.event('cancel', { cancelable: true }); h.$('photoDialog').dispatchEvent(cancel); assert.equal(cancel.defaultPrevented, true); assert.equal(h.$('photoDialog').open, false); assert.equal(h.$('recordDialog').open, true); assert.equal(h.$('recordTitle').value, '미저장 사진'); assert.equal(h.$('photoPreview').src, photo.thumb);
});

test('closing a pending full-photo request ignores its late response and disposal clears its URL', async t => {
  const db = database(fixtureDay([memory('photo-memory', '저장한 사진', { kind: 'photo', photoId: PHOTO_ID })], { revision: 1 }));
  const gate = deferred(); let pending = true; db.beforePhotoRead = path => path.endsWith('size=full') && pending ? gate.promise : undefined;
  const h = await harness(t, { db }), created = [], revoked = [], create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  URL.createObjectURL = blob => { const url = create(blob); created.push(url); return url; }; URL.revokeObjectURL = url => { revoked.push(url); revoke(url); }; t.after(() => { URL.createObjectURL = create; URL.revokeObjectURL = revoke; });
  h.root.querySelector('.record-card').click(); h.$('viewPhoto').click(); await until(() => db.calls.some(call => call.path.endsWith('size=full'))); h.$('closePhotoView').click(); const count = created.length; pending = false; gate.resolve(); await tick(); await tick();
  assert.equal(h.$('photoDialog').open, false); assert.equal(h.$('fullPhoto').getAttribute('src'), null); assert.equal(created.length, count, 'late responses must not create retained blob URLs');
  h.$('viewPhoto').click(); await until(() => !h.$('fullPhoto').hidden); const image = h.$('fullPhoto'), url = image.src;
  // Auth clears the private root before invoking module cleanup on logout.
  h.root.replaceChildren(); assert.doesNotThrow(() => h.close()); assert.ok(revoked.includes(url)); assert.equal(image.getAttribute('src'), null);
});

test('startup archive response cannot undo a month navigation made while it was loading', async t => {
  const db = database(emptyDay('2002-02-03')), gate = deferred(); db.beforeArchive = () => gate.promise;
  const h = await harness(t, { db, waitForReady: false }); h.$('toggleCalendar').click(); h.$('nextMonth').click(); const chosenMonth = h.$('monthTitle').textContent;
  await until(() => db.calls.some(call => call.path.startsWith('/months?'))); gate.resolve(); await tick(); await tick();
  assert.equal(h.$('monthTitle').textContent, chosenMonth); assert.equal(db.calls.filter(call => call.path.startsWith('/days/')).length, 0); assert.ok(!db.calls.some(call => call.path === '/months?month=2002-02'));
});

test('map is primary by default and calendar and memory panels toggle independently without resetting playback', async t => {
  const h = await harness(t); const renders = h.map.renders.length;
  assert.equal(h.$('calendarPanel').hidden, true); assert.equal(h.$('recordsPanel').hidden, true); assert.equal(h.$('toggleCalendar').getAttribute('aria-expanded'), 'false'); assert.equal(h.$('toggleRecords').getAttribute('aria-expanded'), 'false');
  h.$('toggleCalendar').click(); assert.equal(h.$('calendarPanel').hidden, false); assert.equal(h.$('recordsPanel').hidden, true); assert.equal(h.$('journeyLayout').classList.contains('calendar-open'), true); assert.equal(h.$('toggleCalendar').getAttribute('aria-expanded'), 'true');
  h.$('toggleRecords').click(); assert.equal(h.$('recordsPanel').hidden, false); assert.equal(h.$('calendarPanel').hidden, false); assert.equal(h.$('toggleRecords').getAttribute('aria-expanded'), 'true');
  h.$('closeCalendar').click(); assert.equal(h.$('calendarPanel').hidden, true); assert.equal(h.$('recordsPanel').hidden, false);
  h.$('toggleCalendar').click(); h.$('focusMap').click(); assert.equal(h.$('calendarPanel').hidden, true); assert.equal(h.$('recordsPanel').hidden, true); assert.equal(h.$('focusMap').getAttribute('aria-pressed'), 'true'); assert.equal(h.map.renders.length, renders, 'layout controls do not redraw or restart the journey');
  h.$('toggleRecords').click(); h.$('closeRecords').click(); assert.equal(h.root.ownerDocument.activeElement, h.$('toggleRecords')); assert.equal(h.$('recordsPanel').hidden, true);
});

test('previous and next date controls skip empty dates and cross saved months with the calendar collapsed', async t => {
  const db = database(fixtureDay([memory('latest', '마지막 기록')], { revision: 1 }));
  db.days.set('2026-10-02', validateDay({ ...emptyDay('2026-10-02'), revision: 1, records: [memory('earlier', '이달의 이전 기록')] }));
  db.days.set('2026-09-30', validateDay({ ...emptyDay('2026-09-30'), revision: 1, records: [memory('last-month', '지난달 기록')] }));
  const h = await harness(t, { db }); assert.equal(h.$('nextDay').disabled, true); assert.equal(h.$('previousDay').disabled, false);
  h.$('previousDay').click(); await until(() => h.$('dayTitle').textContent === '이달의 이전 기록'); assert.equal(h.$('calendarPanel').hidden, true);
  h.$('previousDay').click(); await until(() => h.$('dayTitle').textContent === '지난달 기록'); await until(() => h.$('previousDay').disabled); assert.equal(h.$('nextDay').disabled, false);
  h.$('nextDay').click(); await until(() => h.$('dayTitle').textContent === '이달의 이전 기록');
  assert.ok(!db.calls.some(call => call.path === '/days/2026-10-01'), 'empty dates are never fetched as a navigation destination');
});

test('playback supports seeking, pause and resume, speed changes, restart and person filtering', async t => {
  const db = database(fixtureDay([], { imports: [source], tracks: [{ id: 'track-a', person: 'sungwoo', sourceId: source.id, points: [{ lat: 37.5, lng: 127, time: TIME }, { lat: 37.501, lng: 127.001, time: TIME + 60000 }] }] }));
  const h = await harness(t, { db }); assert.equal(h.$('playTime').textContent, '14:00:00'); assert.match(h.$('playRange').textContent, /14:01:00/); h.$('playDay').click(); assert.equal(h.map.state.playing, true);
  h.$('playSeek').value = '500'; h.$('playSeek').dispatchEvent(h.event('input', { bubbles: true })); assert.equal(h.map.state.progress, .5); assert.equal(h.$('playTime').textContent, '14:00:30'); assert.match(h.$('playSeek').getAttribute('aria-valuetext'), /50퍼센트/);
  h.$('stopDay').click(); assert.equal(h.map.state.playing, false); assert.equal(h.$('playSeek').value, '500'); assert.equal(h.$('playDay').hidden, false); h.change('playSpeed', '4'); assert.equal(h.map.state.speed, 4);
  h.$('playDay').click(); assert.equal(h.map.state.progress, .5); assert.equal(h.map.playOptions.speed, 4); h.$('restartDay').click(); assert.equal(h.map.state.progress, 0); assert.equal(h.map.state.playing, false); assert.equal(h.$('playTime').textContent, '14:00:00');
  h.root.querySelector('[data-person="sohee"]').click(); assert.equal(h.$('playDay').disabled, true); assert.equal(h.$('playSeek').disabled, true); assert.equal(h.$('playTime').textContent, '--:--');
  h.root.querySelector('[data-person="sungwoo"]').click(); assert.equal(h.$('playDay').disabled, false); assert.equal(h.map.state.speed, 4);
});

test('playback clock uses the map range including singleton boundary samples', async t => {
  const point = time => ({ lat: 37.5, lng: 127, time });
  const db = database(fixtureDay([], { imports: [source], tracks: [{ id: 'single-early', person: 'sungwoo', sourceId: source.id, points: [point(TIME - 60000)] }, { id: 'regular', person: 'sungwoo', sourceId: source.id, points: [point(TIME), point(TIME + 60000)] }] }));
  const h = await harness(t, { db }); assert.equal(h.$('playTime').textContent, '13:59:00'); assert.equal(h.$('playRange').textContent, '13:59:00 — 14:01:00');
  h.$('playSeek').value = '500'; h.$('playSeek').dispatchEvent(h.event('input', { bubbles: true })); assert.equal(h.$('playTime').textContent, '14:00:00');
  h.close();
  const singles = database(fixtureDay([], { imports: [source], tracks: [{ id: 'single-early', person: 'sungwoo', sourceId: source.id, points: [point(TIME)] }, { id: 'single-late', person: 'sungwoo', sourceId: source.id, points: [point(TIME + 60000)] }] }));
  const second = await harness(t, { db: singles }); assert.equal(second.$('playDay').disabled, false); assert.equal(second.$('playRange').textContent, '14:00:00 — 14:01:00');
});

test('an earlier save refresh cannot unlock a newer in-flight save', async t => {
  const db = database(), archiveGate = deferred(), secondSaveGate = deferred(); const h = await harness(t, { db });
  db.beforeArchive = () => archiveGate.promise;
  h.$('addRecord').click(); h.$('recordTitle').value = '첫 번째 기록'; h.submit(); await until(() => !h.$('recordDialog').open);
  db.beforePut = () => secondSaveGate.promise; h.$('addRecord').click(); h.$('recordTitle').value = '두 번째 기록'; h.submit(); await until(() => db.calls.filter(call => call.method === 'PUT').length === 2);
  archiveGate.resolve(); await tick(); await tick(); assert.equal(h.$('recordTitle').disabled, true); assert.equal(h.$('saveRecord').disabled, true); assert.equal(h.$('recordDialog').open, true);
  h.submit(); await tick(); assert.equal(db.calls.filter(call => call.method === 'PUT').length, 2, 'older finally must not release the newer save lock');
  secondSaveGate.resolve(); await until(() => !h.$('recordDialog').open); assert.equal(db.days.get(DATE).records.length, 2);
});

test('map height fits the viewport after measuring headers and responds to resized mobile layout', async t => {
  const h = await harness(t), win = h.root.ownerDocument.defaultView, wrap = h.root.querySelector('.map-wrap'); let top = 252;
  wrap.getBoundingClientRect = () => ({ top }); Object.defineProperty(win, 'innerHeight', { configurable: true, value: 900 }); win.dispatchEvent(h.event('resize'));
  await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(wrap.style.getPropertyValue('--journey-map-height'), '632px');
  top = 350.5; Object.defineProperty(win, 'innerHeight', { configurable: true, value: 844 }); win.dispatchEvent(h.event('resize'));
  await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(wrap.style.getPropertyValue('--journey-map-height'), '477px');
  Object.defineProperty(win, 'scrollY', { configurable: true, value: 100 }); top = 250.5; win.dispatchEvent(h.event('resize'));
  await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(wrap.style.getPropertyValue('--journey-map-height'), '477px', 'scroll position must not inflate the map');
});
