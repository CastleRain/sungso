import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { emptyDay, mergeDayImport, summarizeDay, validateDay } from '../../../shared/journey/core.mjs';
import { buildDayCandidates, selectJourneyScenes, prepareJourneyScene } from '../../../shared/journey/playback-core.mjs';
import { createJourneyPlayback } from '../js/playback.mjs';
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
  const db = { days: new Map([[initial.date, clone(initial)]]), photos: new Map(), calls: [], pageSize: 31, beforePut: null, afterPut: null, beforeImport: null, beforeArchive: null, beforePhotoRead: null, beforePlayback: null, beforeDayRead: null };
  db.request = async (path, options = {}) => {
    const method = options.method || 'GET';
    db.calls.push({ path, method, body: options.body ? clone(options.body) : undefined });
    if (path === '/months') { await db.beforeArchive?.(); return { months: [...new Set([...db.days.keys()].map(date => date.slice(0, 7)))], latestDate: [...db.days.keys()].sort().at(-1) }; }
    if (path.startsWith('/months?')) { const month = new URLSearchParams(path.split('?')[1]).get('month'); return { month, days: [...db.days.values()].filter(day => day.date.startsWith(month) && (day.revision || day.records.length || day.tracks.length)).map(summarizeDay) }; }
    if (path.startsWith('/playback?')) { const query = new URLSearchParams(path.split('?')[1]); await db.beforePlayback?.(query, options); const remaining = [...db.days.values()].filter(day => day.date >= query.get('from') && day.date <= query.get('to') && (!query.get('after') || day.date > query.get('after'))).sort((a, b) => a.date.localeCompare(b.date)); const page = remaining.slice(0, db.pageSize); return { days: page.map(buildDayCandidates), nextCursor: remaining.length > page.length ? page.at(-1).date : null }; }
    if (path === '/photos' && method === 'POST') { db.photos.set(options.body.id, clone(options.body)); return { photo: { id: options.body.id } }; }
    if (path.startsWith('/photos/') && method === 'GET') { await db.beforePhotoRead?.(path); return new Blob(['synthetic-image'], { type: 'image/jpeg' }); }
    const match = /^\/days\/(\d{4}-\d{2}-\d{2})(\/import)?$/.exec(path);
    assert.ok(match, `Unexpected mock API route: ${method} ${path}`);
    const date = match[1];
    if (method === 'GET') { await db.beforeDayRead?.(date, options); return { day: clone(db.days.get(date) || emptyDay(date)) }; }
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

async function harness(t, { db = database(), preparePhoto, waitForReady = true, storyProcessor, width = 1440 } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/sungso/journey/', pretendToBeVisual: true });
  const saved = new Map(['window', 'document', 'AbortController'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.AbortController = dom.window.AbortController;
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: width });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  const root = dom.window.document.querySelector('[data-private-root]'); root.hidden = false;
  let clock = 0, frameId = 0; const frames = new Map(), storyCalls = [];
  const $ = id => root.querySelector('#' + id), workers = [], map = {
    ready: Promise.resolve(true), renders: [], sceneRenders: [], resizeCount: 0, fitCount: 0, overview: null,
    render(day, options) { this.renders.push({ day: clone(day), options }); },
    renderScene(scene, options) { this.sceneRenders.push({ scene: clone(scene), options: clone(options) }); },
    showAllScenes(scenes) { this.overview = clone(scenes); }, fitCurrentScene() { this.fitCount++; },
    resize() { this.resizeCount++; }, setPicking() {}, destroy() {}
  };
  const app = mountJourney({ root, request: db.request, member: { name: '성우' }, mapFactory: ({ onStatus }) => { map.reportStatus=onStatus;onStatus({ ready: true }); return map; }, storyProcessor: async (type, payload) => { storyCalls.push({ type, payload: clone(payload) }); return storyProcessor ? storyProcessor(type, payload) : type === 'select' ? selectJourneyScenes(payload.days, payload.options) : prepareJourneyScene(payload.scene, payload.day); }, playbackFactory: options => createJourneyPlayback({ ...options, now: () => clock, requestFrame: callback => { const id = ++frameId; frames.set(id, callback); return id; }, cancelFrame: id => frames.delete(id) }), ...(preparePhoto ? { preparePhoto } : {}), workerFactory: url => {
    assert.match(String(url), /import-worker\.mjs$/);
    const worker = { payload: null, terminated: false, postMessage(payload) { this.payload = payload; }, terminate() { this.terminated = true; }, respond(result) { this.onmessage?.({ data: { ok: true, result } }); } };
    workers.push(worker); return worker;
  } });
  let closed = false;
  const close = () => { if (closed) return; closed = true; app.dispose(); dom.window.close(); for (const [key, descriptor] of saved) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; };
  t.after(close);
  if (waitForReady) await until(() => /저장됨|아직 저장한|지도에 표시할 장소가 없어요/.test($('saveState').textContent), 'initial period load');
  return { $, root, db, workers, map, app, storyCalls, frames, close, advance(ms) { clock += ms; const batch = [...frames.values()]; frames.clear(); for (const callback of batch) callback(clock); }, async openDay(value = DATE) { if ($('calendarPanel').hidden) $('toggleCalendar').click(); const target = root.querySelector(`#calendar [aria-label^="${value}"]`); assert.ok(target, `calendar has ${value}`); target.click(); await until(() => !$('recordsPanel').hidden && !$('detailStatus').textContent.includes('불러오는 중'), 'day detail load'); }, change(id, value) { $(id).value = value; $(id).dispatchEvent(new dom.window.Event('change', { bubbles: true })); }, file(id, value) { Object.defineProperty($(id), 'files', { configurable: true, value: value ? [value] : [] }); $(id).dispatchEvent(new dom.window.Event('change', { bubbles: true })); }, submit(id = 'recordForm') { $(id).dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); }, event(name, options) { return new dom.window.Event(name, options); } };
}

function timelineResult(person = 'sungwoo', date = DATE) {
  const ownerSource = { ...source, person, id: `timeline_${person}_test` };
  const day = validateDay({ ...emptyDay(date), imports: [ownerSource], records: [memory(`${person}-visit`, `${person} 장소`, { person, kind: 'visit', sourceId: ownerSource.id })] });
  return { source: ownerSource, days: [day], warnings: [] };
}

function periodDatabase() {
  const days = [
    ['2024-01-05', 'sungwoo', '처음 향했던 곳', { lat: 37.5, lng: 127 }],
    ['2025-07-08', 'sohee', '다시 만난 동네', { lat: 36.3, lng: 127.4 }],
    [DATE, 'together', '함께 머문 바다', { lat: 35.1, lng: 129.1 }]
  ].map(([date, person, title, position], index) => validateDay({ ...emptyDay(date), revision: 1, records: [memory(`period-${index}`, title, { person, position, note: '상세에서만 읽는 메모' })] }));
  const db = database(days[0]); for (const day of days.slice(1)) db.days.set(day.date, day); return db;
}

test('manual record without time or position saves, reopens from DB and remains editable', async t => {
  const db = database(); const h = await harness(t, { db });
  h.$('addRecord').click(); h.$('recordTitle').value = '함께 걸었던 날'; h.$('recordNote').value = '사진을 보고 기억한 이야기'; h.$('recordPerson').value = 'sohee'; h.submit();
  await until(() => !h.$('recordDialog').open, 'manual save');
  const saved = db.days.get(DATE).records[0];
  assert.equal(saved.kind, 'manual'); assert.equal(saved.person, 'sohee'); assert.equal(saved.time, null); assert.equal(saved.position, null); assert.equal(saved.timePrecision, 'day');
  assert.match(h.$('records').textContent, /함께 걸었던 날.*소희/s);
  assert.equal(db.days.get(DATE).revision, 1);
  h.close();
  const reopened = await harness(t, { db });
  await reopened.openDay(); reopened.root.querySelector('.record-edit').click();
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
  await h.openDay(); h.root.querySelector('.record-edit').click(); h.file('photoFile', { name: 'memory.jpg' });
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
  await h.openDay(); h.root.querySelector('.record-edit').click(); h.$('recordTime').value = '14:05'; h.submit(); await until(() => !h.$('recordDialog').open);
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
  const h = await harness(t, { db }); await h.openDay(); h.root.querySelector('.record-edit').click(); h.$('recordTitle').value = '내가 보완한 제목'; h.$('recordNote').value = '지우면 안 되는 입력'; h.$('recordPerson').value = 'sohee'; h.submit();
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

test('whole-period playback drives map progress from one clock and pauses at completion', async t => {
  const db = database(fixtureDay([], { imports: [source], tracks: [{ id: 'track-a', person: 'sungwoo', sourceId: source.id, points: [{ lat: 37.5, lng: 127, time: TIME }, { lat: 37.501, lng: 127.001, time: TIME + 60000 }] }] }));
  const h = await harness(t, { db }); assert.equal(h.$('playDay').disabled, false); h.$('playDay').click(); assert.equal(h.$('stopDay').hidden, false);
  h.advance(25200); assert.equal(h.app.getPlayback().progress, .42); assert.equal(h.$('playTime').textContent, '00:25'); assert.equal(h.map.sceneRenders.at(-1).options.progress, .42);
  h.advance(34800); assert.equal(h.$('stopDay').hidden, true); assert.equal(h.$('playDay').hidden, false); assert.equal(h.app.getPlayback().progress, 1); assert.equal(h.$('playTime').textContent, '01:00'); assert.equal(h.frames.size, 0);
});

test('saved full photo opens through authenticated transport and returns to the unchanged editor', async t => {
  const db = database(fixtureDay([memory('photo-memory', '저장한 사진', { kind: 'photo', photoId: PHOTO_ID })], { revision: 1 }));
  const h = await harness(t, { db }), revoked = [], revoke = URL.revokeObjectURL;
  URL.revokeObjectURL = url => { revoked.push(url); revoke(url); }; t.after(() => { URL.revokeObjectURL = revoke; });
  await h.openDay(); h.root.querySelector('.record-edit').click(); h.$('recordTitle').value = '아직 저장 안 한 제목'; h.$('recordNote').value = '사진을 봐도 남아야 하는 메모'; assert.equal(h.$('viewPhoto').hidden, false); h.$('viewPhoto').click();
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
  await h.openDay(); h.root.querySelector('.record-edit').click(); h.$('viewPhoto').click(); await until(() => db.calls.some(call => call.path.endsWith('size=full'))); h.$('closePhotoView').click(); const count = created.length; pending = false; gate.resolve(); await tick(); await tick();
  assert.equal(h.$('photoDialog').open, false); assert.equal(h.$('fullPhoto').getAttribute('src'), null); assert.equal(created.length, count, 'late responses must not create retained blob URLs');
  h.$('viewPhoto').click(); await until(() => !h.$('fullPhoto').hidden); const image = h.$('fullPhoto'), url = image.src;
  // Auth clears the private root before invoking module cleanup on logout.
  h.root.replaceChildren(); assert.doesNotThrow(() => h.close()); assert.ok(revoked.includes(url)); assert.equal(image.getAttribute('src'), null);
});

test('startup archive response cannot undo a month navigation made while it was loading', async t => {
  const db = database(emptyDay('2002-02-03')), gate = deferred(); db.beforeArchive = () => gate.promise;
  const h = await harness(t, { db, waitForReady: false }); h.$('toggleCalendar').click(); h.$('nextMonth').click(); const chosenMonth = h.$('monthTitle').textContent;
  await until(() => db.calls.some(call => call.path.startsWith('/months?'))); gate.resolve(); await tick(); await tick();
  assert.equal(h.$('monthTitle').textContent, chosenMonth); assert.equal(h.$('recordsPanel').hidden, true); assert.equal(h.$('recordDialog').open, false);
});

test('map keeps the current journey while the story rail and calendar collapse independently', async t => {
  const db = database(fixtureDay([visit()], { imports: [source], tracks: [{ id: 'track-a', person: 'sungwoo', sourceId: source.id, points: [{ lat: 37.5, lng: 127, time: TIME }, { lat: 37.501, lng: 127.001, time: TIME + 60000 }] }] }));
  const h = await harness(t, { db });
  assert.equal(h.$('calendarPanel').hidden, true); assert.equal(h.$('recordsPanel').hidden, true); assert.equal(h.$('storyPanel').hidden, false);
  h.$('playDay').click(); h.advance(15000); const before = h.app.getPlayback();
  h.$('toggleCalendar').click(); assert.equal(h.$('calendarPanel').hidden, false); assert.equal(h.$('recordsPanel').hidden, true);
  h.$('closeStory').click(); assert.equal(h.$('storyPanel').hidden, true); assert.equal(h.$('toggleStory').getAttribute('aria-expanded'), 'false');
  h.$('closeCalendar').click(); h.$('toggleStory').click(); assert.equal(h.$('calendarPanel').hidden, true); assert.equal(h.$('storyPanel').hidden, false);
  assert.equal(h.app.getPlayback().playing, true); assert.equal(h.app.getPlayback().progress, before.progress); assert.equal(h.app.getPlayback().scene.id, before.scene.id);
  h.$('toggleRecords').click(); await until(() => h.$('records').textContent.includes('원본 장소')); assert.equal(h.$('recordsPanel').hidden, false); assert.equal(h.app.getPlayback().playing, false); assert.equal(h.$('recordDialog').open, false);
  h.$('closeRecords').click(); assert.equal(h.root.ownerDocument.activeElement, h.$('toggleRecords')); assert.equal(h.$('recordsPanel').hidden, true); assert.equal(h.app.getPlayback().progress, before.progress);
});

test('previous and next date controls skip empty dates and cross saved months with the calendar collapsed', async t => {
  const db = database(fixtureDay([memory('latest', '마지막 기록')], { revision: 1 }));
  db.days.set('2026-10-02', validateDay({ ...emptyDay('2026-10-02'), revision: 1, records: [memory('earlier', '이달의 이전 기록')] }));
  db.days.set('2026-09-30', validateDay({ ...emptyDay('2026-09-30'), revision: 1, records: [memory('last-month', '지난달 기록')] }));
  const h = await harness(t, { db }); await h.openDay(); h.$('closeCalendar').click(); assert.equal(h.$('nextDay').disabled, true); assert.equal(h.$('previousDay').disabled, false);
  h.$('previousDay').click(); await until(() => h.$('records').textContent.includes('이달의 이전 기록')); assert.equal(h.$('calendarPanel').hidden, true);
  h.$('previousDay').click(); await until(() => h.$('records').textContent.includes('지난달 기록')); await until(() => h.$('previousDay').disabled); assert.equal(h.$('nextDay').disabled, false);
  h.$('nextDay').click(); await until(() => h.$('records').textContent.includes('이달의 이전 기록'));
  assert.ok(!db.calls.some(call => call.path === '/days/2026-10-01'), 'empty dates are never fetched as a navigation destination');
});

test('whole-period seeking, mode durations and staged person filters preserve scene identity', async t => {
  const db = database(fixtureDay([], { imports: [source], tracks: [{ id: 'track-a', person: 'sungwoo', sourceId: source.id, points: [{ lat: 37.5, lng: 127, time: TIME }, { lat: 37.501, lng: 127.001, time: TIME + 60000 }] }] }));
  const h = await harness(t, { db }); assert.equal(h.$('playTime').textContent, '00:00'); assert.equal(h.$('playRange').textContent, '01:00'); h.$('playDay').click();
  h.$('playSeek').value = '500'; h.$('playSeek').dispatchEvent(h.event('input', { bubbles: true })); assert.equal(h.app.getPlayback().progress, .5); assert.equal(h.$('playTime').textContent, '00:30'); assert.match(h.$('playSeek').getAttribute('aria-valuetext'), /50퍼센트/);
  const current = h.app.getPlayback(), reads = db.calls.length, calculations = h.storyCalls.length;
  h.root.querySelector('[data-mode="slow"]').click(); assert.equal(h.app.getPlayback().scene.id, current.scene.id); assert.equal(h.app.getPlayback().sceneProgress, current.sceneProgress); assert.equal(h.app.getPlayback().playing, true); assert.equal(h.$('playRange').textContent, '05:00');
  h.root.querySelector('[data-duration="600"]').click(); assert.equal(h.app.getPlayback().duration, 600); assert.equal(h.app.getPlayback().progress, .5); assert.equal(db.calls.length, reads); assert.equal(h.storyCalls.length, calculations, 'mode and duration changes reuse prepared scenes');
  h.$('stopDay').click(); assert.equal(h.app.getPlayback().playing, false); h.$('playDay').click(); assert.equal(h.app.getPlayback().progress, .5); h.$('restartDay').click(); assert.equal(h.app.getPlayback().progress, 0); assert.equal(h.app.getPlayback().playing, false);
  h.$('openPeriod').click(); h.root.querySelector('[data-person="sohee"]').click(); assert.equal(h.app.getPlayback().scenes.length, 1, 'filter selection applies only on submit'); h.submit('periodForm'); await until(() => h.app.getPlayback().scenes.length === 0);
  assert.equal(h.$('playDay').disabled, true); assert.equal(h.$('playSeek').disabled, true); assert.match(h.$('saveState').textContent, /지도에 표시할 장소가 없어요/);
  h.$('openPeriod').click(); h.root.querySelector('[data-person="sungwoo"]').click(); h.submit('periodForm'); await until(() => !h.$('playDay').disabled); assert.equal(h.app.getPlayback().duration, 600); assert.equal(h.app.getPlayback().playing, false);
});

test('a single date-only place remains visible without inventing a playback time or route', async t => {
  const record = memory('one-place', '함께 본 바다', { position: { lat: 35.1, lng: 129.1 } });
  const h = await harness(t, { db: database(fixtureDay([record], { revision: 1 })) });
  assert.equal(h.$('playDay').disabled, true); assert.equal(h.$('playSeek').disabled, true); assert.equal(h.$('showAllScenes').disabled, false); assert.equal(h.$('toggleRecords').disabled, false);
  const state = h.app.getPlayback(); assert.equal(state.scenes.length, 1); assert.equal(state.scene.time, null); assert.equal(state.scene.endTime, null); assert.deepEqual(state.scene.segments, []); assert.equal(state.time, null);
  h.$('showAllScenes').click(); assert.equal(h.map.overview[0].title, record.title); h.$('toggleRecords').click(); await until(() => h.$('records').textContent.includes(record.title));
  assert.doesNotMatch(h.$('records').textContent, /GPS|수동|시간 미기록|사진 기록/); assert.equal(h.$('recordDialog').open, false); assert.equal(h.db.calls.filter(call => call.method !== 'GET').length, 0);
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
  await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(wrap.style.getPropertyValue('--journey-map-height'), '647px');
  top = 350.5; Object.defineProperty(win, 'innerHeight', { configurable: true, value: 844 }); win.dispatchEvent(h.event('resize'));
  await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(wrap.style.getPropertyValue('--journey-map-height'), '492px');
  Object.defineProperty(win, 'scrollY', { configurable: true, value: 100 }); top = 250.5; win.dispatchEvent(h.event('resize'));
  await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(wrap.style.getPropertyValue('--journey-map-height'), '492px', 'scroll position must not inflate the map');
});

test('three years of sparse records load in date order and list navigation follows the same scenes', async t => {
  const db = periodDatabase(); db.pageSize = 1; const h = await harness(t, { db });
  const state = h.app.getPlayback(); assert.deepEqual(state.scenes.map(scene => scene.date), ['2024-01-05', '2025-07-08', DATE]); assert.equal(state.duration, 60); assert.equal(state.index, 0); assert.equal(state.playing, false);
  assert.deepEqual([...h.$('storyList').children].map(item => item.dataset.scene), state.scenes.map(scene => scene.id)); assert.doesNotMatch(h.$('storyList').textContent, /상세에서만|GPS|사진|수동/);
  assert.equal(db.calls.filter(call => call.path.startsWith('/playback?')).length, 3); assert.equal(db.calls.filter(call => /^\/days\//.test(call.path)).length, 3);
  h.$('nextScene').click(); assert.equal(h.app.getPlayback().date, '2025-07-08'); assert.equal(h.$('storyList').children[1].getAttribute('aria-current'), 'step');
  h.$('storyList').children[2].click(); assert.equal(h.app.getPlayback().date, DATE); assert.equal(h.app.getPlayback().playing, false); assert.equal(h.map.sceneRenders.at(-1).scene.date, DATE);
  h.$('previousScene').click(); assert.equal(h.app.getPlayback().date, '2025-07-08'); h.$('showAllScenes').click(); assert.deepEqual(h.map.overview.map(scene => scene.id), state.scenes.map(scene => scene.id));
});

test('failed period pagination retries from the failed page without replaying a partial story', async t => {
  const db = periodDatabase(); db.pageSize = 1; let fail = true;
  db.beforePlayback = query => { if (query.get('after') && fail) { fail = false; throw Error('중간 목록 연결 오류'); } };
  const h = await harness(t, { db, waitForReady: false }); await until(() => !h.$('retryPlayback').hidden);
  assert.equal(h.app.getPlayback().scenes.length, 0); assert.equal(h.$('playDay').disabled, true); assert.match(h.$('globalError').textContent, /중간 목록 연결 오류/);
  h.root.querySelector('[data-mode="slow"]').click(); assert.equal(h.$('playDay').disabled, true); h.$('retryPlayback').click(); await until(() => h.app.getPlayback().scenes.length === 3);
  const queries = db.calls.filter(call => call.path.startsWith('/playback?')).map(call => new URLSearchParams(call.path.split('?')[1]));
  assert.equal(queries.filter(query => !query.get('after')).length, 1); assert.equal(queries.filter(query => query.get('after') === '2024-01-05').length, 2); assert.equal(h.app.getPlayback().playing, false); assert.equal(h.$('retryPlayback').hidden, true);
});

test('changing period and person ignores an older pending period response', async t => {
  const db = periodDatabase(), gate = deferred(); db.beforePlayback = query => query.get('from') === '2024-01-05' ? gate.promise : undefined;
  const h = await harness(t, { db, waitForReady: false }); await until(() => db.calls.some(call => call.path.startsWith('/playback?')));
  h.$('openPeriod').click(); h.change('periodPreset', 'custom'); h.$('periodFrom').value = '2025-07-08'; h.$('periodTo').value = '2025-07-08'; h.root.querySelector('[data-person="sohee"]').click(); h.submit('periodForm');
  await until(() => h.app.getPlayback().scenes.length === 1); assert.equal(h.app.getPlayback().scene.person, 'sohee'); assert.equal(h.app.getPlayback().date, '2025-07-08');
  gate.resolve(); await tick(); await tick(); assert.equal(h.app.getPlayback().scenes.length, 1); assert.equal(h.app.getPlayback().scene.person, 'sohee'); assert.equal(h.app.getPlayback().date, '2025-07-08'); assert.equal(h.$('periodTitle').textContent, '선택한 기간'); assert.equal(h.$('recordsPanel').hidden, true);
});

test('preparing a story and opening a day share the two-request limit', async t => {
  const db = periodDatabase(), gates = new Map([...db.days.keys()].map(date => [date, deferred()])); let active = 0, maximum = 0;
  db.beforeDayRead = async date => { active++; maximum = Math.max(maximum, active); await gates.get(date).promise; active--; };
  const h = await harness(t, { db, waitForReady: false }); await until(() => active === 2);
  h.$('toggleCalendar').click(); h.root.querySelector(`#calendar [aria-label^="${DATE}"]`).click(); await tick(); await tick(); assert.equal(active, 2); assert.equal(db.calls.filter(call => /^\/days\//.test(call.path)).length, 2);
  for (const gate of gates.values()) gate.resolve(); await until(() => h.app.getPlayback().scenes.length === 3 && !h.$('detailStatus').textContent.includes('불러오는 중'));
  assert.equal(maximum, 2); assert.equal(h.$('recordsPanel').hidden, false); assert.match(h.$('records').textContent, /함께 머문 바다/);
});

test('mobile list selection collapses the rail and a hidden tab pauses without resetting', async t => {
  const h = await harness(t, { db: periodDatabase(), width: 390 }); assert.equal(h.$('storyPanel').hidden, true);
  h.$('toggleStory').click(); assert.equal(h.$('storyPanel').hidden, false); h.$('storyList').children[1].click(); assert.equal(h.$('storyPanel').hidden, true); assert.equal(h.app.getPlayback().index, 1);
  h.$('playDay').click(); h.advance(5000); const before = h.app.getPlayback(); Object.defineProperty(h.root.ownerDocument, 'hidden', { configurable: true, value: true }); h.root.ownerDocument.dispatchEvent(h.event('visibilitychange'));
  assert.equal(h.app.getPlayback().playing, false); assert.equal(h.app.getPlayback().progress, before.progress); assert.equal(h.frames.size, 0);
  Object.defineProperty(h.root.ownerDocument, 'hidden', { configurable: true, value: false }); h.root.ownerDocument.dispatchEvent(h.event('visibilitychange')); assert.equal(h.app.getPlayback().playing, false, 'returning to a tab never starts playback');
  h.$('toggleRecords').click(); await until(() => h.$('records').textContent.includes('다시 만난 동네')); h.$('showDayRoute').click(); assert.equal(h.$('recordsPanel').hidden, true); assert.equal(h.map.renders.at(-1).day.date, '2025-07-08'); assert.equal(h.app.getPlayback().progress, before.progress);
  h.$('playDay').click(); assert.equal(h.app.getPlayback().playing, true); assert.equal(h.map.sceneRenders.at(-1).scene.date, '2025-07-08');
});

test('period validation and cancellation leave the active story unchanged', async t => {
  const h = await harness(t, { db: periodDatabase() }); h.$('nextScene').click(); const prior = h.app.getPlayback(), requests = h.db.calls.length;
  h.$('openPeriod').click(); h.change('periodPreset', 'custom'); h.$('periodFrom').value = DATE; h.$('periodTo').value = '2024-01-05'; h.submit('periodForm'); assert.equal(h.$('periodDialog').open, true); assert.match(h.$('periodError').textContent, /시작일과 종료일/); assert.equal(h.db.calls.length, requests);
  h.root.querySelector('[data-person="sohee"]').click(); h.$('periodDialog').querySelector('[data-close]').click(); assert.equal(h.$('periodDialog').open, false); assert.equal(h.app.getPlayback().scene.id, prior.scene.id); assert.equal(h.app.getPlayback().progress, prior.progress); assert.equal(h.app.getPlayback().scenes.length, 3);
  h.$('openPeriod').click(); assert.equal(h.root.querySelector('[data-person="all"]').getAttribute('aria-pressed'), 'true');
});

test('refreshing a changed scene keeps its position and never starts automatically', async t => {
  const db = periodDatabase(), h = await harness(t, { db }); h.$('nextScene').click(); h.$('playDay').click(); h.advance(5000); const prior = h.app.getPlayback(), changed = clone(db.days.get('2025-07-08'));
  changed.records[0].title = '함께 다시 찾은 동네'; changed.revision++; db.days.set(changed.date, validateDay(changed)); h.$('refreshDay').click();
  await until(() => h.app.getPlayback().scene?.title === changed.records[0].title); const result = h.app.getPlayback(); assert.equal(result.scene.id, prior.scene.id); assert.equal(result.sceneProgress, prior.sceneProgress); assert.equal(result.playing, false); assert.equal(result.scene.revision, changed.revision); assert.match(h.$('storyList').textContent, /함께 다시 찾은 동네/);
});

test('disposing a pending period load clears private scenes and ignores its response', async t => {
  const db = periodDatabase(), h = await harness(t, { db }); h.$('playDay').click(); h.advance(1000); const gate = deferred(); db.beforePlayback = () => gate.promise; h.$('refreshDay').click();
  await until(() => db.calls.filter(call => call.path.startsWith('/playback?')).length === 2); const requestCount = db.calls.length, processingCount = h.storyCalls.length; h.close(); gate.resolve(); await tick(); await tick();
  assert.equal(h.frames.size, 0); assert.equal(h.root.childNodes.length, 0); assert.equal(h.app.getPlayback().scenes.length, 0); assert.equal(h.app.getPlayback().playing, false); assert.equal(db.calls.length, requestCount); assert.equal(h.storyCalls.length, processingCount);
});

test('read-only photo details open the full image and restore focus without creating an edit draft', async t => {
  const db = database(fixtureDay([memory('view-photo', '함께 본 풍경', { kind: 'photo', photoId: PHOTO_ID, position: { lat: 37.5, lng: 127 } })], { revision: 1 }));
  const h = await harness(t, { db }); assert.equal(db.calls.filter(call => call.path.startsWith('/photos')).length, 0, 'hidden details do not fetch photos');
  h.$('toggleRecords').click(); await until(() => h.root.querySelector('.record-photo')); const photo = h.root.querySelector('.record-photo'); photo.focus(); photo.click(); await until(() => !h.$('fullPhoto').hidden);
  assert.equal(h.$('recordDialog').open, false); assert.equal(h.$('photoDialog').open, true); assert.equal(h.$('fullPhoto').alt, '함께 본 풍경'); h.$('closePhotoView').click();
  assert.equal(h.root.ownerDocument.activeElement, photo); assert.equal(h.$('recordsPanel').hidden, false); assert.equal(h.$('recordDialog').open, false); assert.equal(h.$('fullPhoto').getAttribute('src'), null); assert.equal(db.calls.filter(call => call.method !== 'GET').length, 0);
});

test('a day revision changing during preparation requires an explicit fresh retry', async t => {
  const db = periodDatabase(); let change = true;
  db.beforeDayRead = date => { if (change) { change = false; const updated = clone(db.days.get(date)); updated.revision++; updated.records[0].title = '새로 확인한 첫 장소'; db.days.set(date, validateDay(updated)); } };
  const h = await harness(t, { db, waitForReady: false }); await until(() => !h.$('retryPlayback').hidden); assert.match(h.$('globalError').textContent, /기록이 새로 바뀌었어요/); assert.equal(h.$('playDay').disabled, true); assert.equal(h.app.getPlayback().scenes.length, 0);
  const before = db.calls.filter(call => call.path === '/months').length; h.$('retryPlayback').click(); await until(() => h.app.getPlayback().scenes.length === 3);
  assert.equal(db.calls.filter(call => call.path === '/months').length, before + 1); assert.equal(h.app.getPlayback().scene.title, '새로 확인한 첫 장소'); assert.equal(h.app.getPlayback().scene.revision, 2); assert.equal(h.app.getPlayback().playing, false);
});

test('calendar selection restores the selected scene after inspecting a full-day route', async t => {
  const h = await harness(t, { db: periodDatabase() }); h.$('nextScene').click(); h.$('toggleRecords').click(); await until(() => h.$('records').textContent.includes('다시 만난 동네'));
  h.$('showDayRoute').click(); assert.equal(h.map.renders.at(-1).day.date, '2025-07-08'); const renders = h.map.sceneRenders.length;
  await h.openDay('2025-07-08'); assert.ok(h.map.sceneRenders.length > renders); assert.equal(h.map.sceneRenders.at(-1).scene.date, '2025-07-08'); assert.equal(h.app.getPlayback().playing, false); assert.equal(h.app.getPlayback().index, 1);
});

test('empty and failed period notices remain below a visible map connection notice and recover its space', async t => {
  const h=await harness(t),win=h.root.ownerDocument.defaultView,wrap=h.root.querySelector('.map-wrap'),notice=h.root.ownerDocument.createElement('p');
  notice.className='journey-map-message';notice.textContent='지도에 연결하지 못했어요.';let noticeHeight=48;
  notice.getBoundingClientRect=()=>({height:noticeHeight});h.$('journeyMap').append(notice);
  h.map.reportStatus({ready:false,error:notice.textContent});
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(wrap.style.getPropertyValue('--journey-map-message-offset'),'56px');
  assert.match(h.$('saveState').textContent,/지도에 표시할 장소가 없어요/);
  h.db.beforePlayback=()=>{throw Error('기간을 불러오지 못했어요.');};h.$('refreshDay').click();
  await until(()=>!h.$('globalError').hidden);assert.match(h.$('globalError').textContent,/기간을 불러오지 못했어요/);
  assert.equal(wrap.style.getPropertyValue('--journey-map-message-offset'),'56px');
  noticeHeight=106;Object.defineProperty(win,'innerWidth',{configurable:true,value:320});win.dispatchEvent(h.event('resize'));
  await new Promise(resolve=>setTimeout(resolve,25));assert.equal(wrap.style.getPropertyValue('--journey-map-message-offset'),'114px','wrapped connection text reserves its whole visible height');
  notice.hidden=true;h.map.reportStatus({ready:true});
  await new Promise(resolve=>setTimeout(resolve,25));assert.equal(wrap.style.getPropertyValue('--journey-map-message-offset'),'0px','a recovered map returns the period notice to its normal position');
});
