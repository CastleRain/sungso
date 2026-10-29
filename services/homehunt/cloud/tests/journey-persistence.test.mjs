import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Firestore } from 'firebase-admin/firestore';
import { createJourneyStore, JOURNEY_ROOT } from '../../../journey/store.mjs';
import { emptyDay } from '../../../../shared/journey/core.mjs';

const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
if (!endpoint || !/^(?:127\.0\.0\.1|localhost):\d+$/.test(endpoint)) throw Error('A localhost Firestore Emulator is required; production is never used.');
const [host, port] = endpoint.split(':'), projectId = 'demo-homehunt';
const previousMetadataDetection = process.env.METADATA_SERVER_DETECTION;
process.env.METADATA_SERVER_DETECTION = 'none';
let environment, db;
before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port) } });
  db = new Firestore({ projectId, host: endpoint, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => environment.clearFirestore());
after(async () => {
  await db?.terminate(); await environment?.cleanup();
  if (previousMetadataDetection === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadataDetection;
});

const date = '2024-03-02', time = Date.parse(date + 'T12:00:00+09:00');
const source = { id: 'fixture-source', hash: 'a'.repeat(64), name: 'synthetic.json', person: 'sungwoo', kind: 'timeline', importedAt: time };
const manual = { id: 'manual-fixture', kind: 'manual', person: 'together', title: '합성 기록', note: '', time: null, position: null, timePrecision: 'day' };

test('real Firestore transactions persist photos, imported tracks and manual records for a fresh store', async () => {
  const store = createJourneyStore({ db, now: () => time });
  assert.deepEqual(await store.month(), { months: [], latestDate: null });
  assert.equal((await db.doc(JOURNEY_ROOT).get()).exists, false);
  const jpeg = await readFile(new URL('../../../invitation/tests/fixtures/pixel.jpg', import.meta.url));
  const image = 'data:image/jpeg;base64,' + jpeg.toString('base64'), photoId = randomUUID();
  await store.upload({ id: photoId, full: image, thumb: image }, 'fixture-first');
  await store.save(date, { expectedRevision: 0, day: { ...emptyDay(date), records: [manual, { ...manual, id: 'photo-fixture', kind: 'photo', photoId }] } }, 'fixture-first');
  const input = { source, records: [], tracks: [{ id: 'path-fixture', person: 'sungwoo', sourceId: source.id, points: [{ lat: 37, lng: 127, time }, { lat: 37.1, lng: 127.1, time: time + 60000 }] }] };
  const imported = await store.import(date, input, 'fixture-second');
  assert.equal(imported.day.revision, 2); assert.equal(imported.addedTracks, 1);
  const fresh = createJourneyStore({ db });
  assert.deepEqual(await fresh.day(date), imported.day);
  assert.deepEqual(await fresh.photo(photoId, 'full'), jpeg);
  assert.deepEqual(await fresh.month(), { months: ['2024-03'], latestDate: date });
  assert.equal((await fresh.month('2024-03')).days[0].photoCount, 1);
  const before = await db.doc(JOURNEY_ROOT + '/days/' + date).get();
  assert.equal((await fresh.import(date, input, 'fixture-first')).unchanged, true);
  const after = await db.doc(JOURNEY_ROOT + '/days/' + date).get();
  assert.equal(after.updateTime.isEqual(before.updateTime), true);
  assert.equal(typeof after.data().data, 'string');
  const ledger = (await db.doc(JOURNEY_ROOT).get()).data();
  assert.equal(ledger.dayBytes, Buffer.byteLength(after.data().data)); assert.equal(ledger.photos.length, 1);
});

test('real Firestore retries preserve partner revisions and an upload concurrently with day edits', async () => {
  const first = createJourneyStore({ db }), second = createJourneyStore({ db });
  const saved = await first.save(date, { expectedRevision: 0, day: { ...emptyDay(date), records: [manual] } }, 'fixture-first');
  const results = await Promise.allSettled([first, second].map((store, i) => store.save(date, { expectedRevision: 1, day: { ...saved.day, note: 'concurrent-' + i } }, 'fixture-' + i)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'JOURNEY_CONFLICT');
  const jpeg = await readFile(new URL('../../../invitation/tests/fixtures/pixel.jpg', import.meta.url));
  const image = 'data:image/jpeg;base64,' + jpeg.toString('base64'), photoId = randomUUID();
  const day = await first.day(date);
  await Promise.all([
    first.upload({ id: photoId, full: image, thumb: image }, 'fixture-first'),
    second.save(date, { expectedRevision: day.revision, day: { ...day, title: '수정한 제목' } }, 'fixture-second'),
  ]);
  const ledger = (await db.doc(JOURNEY_ROOT).get()).data();
  assert.equal(ledger.dayCount, 1); assert.equal(ledger.photos.length, 1); assert.equal(ledger.photos[0].id, photoId);
  assert.equal((await first.day(date)).title, '수정한 제목');
  assert.equal((await first.month('2024-03')).days[0].revision, 3);
});

test('real Firestore period query pages document IDs, preserves originals and requires no summary migration', async () => {
  const store = createJourneyStore({ db }), dates = [];
  const batch = db.batch();
  for (let i = 0; i < 34; i++) {
    const dayDate = new Date(Date.UTC(2023, 11, 20 + i * 5)).toISOString().slice(0, 10);
    dates.push(dayDate);
    const day = { ...emptyDay(dayDate), revision: 1, records: [{ ...manual, id: `memory-${i}`, position: { lat: 37.5, lng: 127 } }] };
    batch.set(db.doc(`${JOURNEY_ROOT}/days/${dayDate}`), { schema: 1, data: JSON.stringify(day), updatedBy: 'private-fixture', updatedAt: time });
  }
  await batch.commit();
  const first = await store.playback({ from: dates[0], to: dates.at(-1) });
  assert.equal(first.days.length, 31); assert.equal(first.nextCursor, dates[30]);
  const second = await store.playback({ from: dates[0], to: dates.at(-1), after: first.nextCursor });
  assert.equal(second.nextCursor, null);
  assert.deepEqual([...first.days, ...second.days].map(day => day.date), dates);
  assert.equal((await db.doc(JOURNEY_ROOT).get()).exists, false, 'reads never create a root ledger or migration');
  assert.equal((await store.day(dates[0])).revision, 1);
  assert.equal((await store.day(dates[0])).records[0].note, manual.note);
  assert.doesNotMatch(JSON.stringify(first), /updatedBy|private-fixture|sourceId|"note"/);
  const motionFirst=await store.playback({from:dates[0],to:dates.at(-1),geometry:'motion'});
  const motionSecond=await store.playback({from:dates[0],to:dates.at(-1),after:motionFirst.nextCursor,geometry:'motion'});
  assert.equal(motionFirst.format,'journey-motion-v1');
  assert.deepEqual([...motionFirst.motionScenes,...motionSecond.motionScenes].map(scene=>scene.date),dates);
  assert.ok(motionFirst.motionScenes.every(scene=>scene.records[0].time===null));
  assert.doesNotMatch(JSON.stringify(motionFirst),/updatedBy|private-fixture|sourceId|"note"/);
  assert.equal((await db.doc(JOURNEY_ROOT).get()).exists,false);
});
