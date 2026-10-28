import test from 'node:test';
import assert from 'node:assert/strict';
import { createJourneyStore, JOURNEY_ROOT, PLAYBACK_PAGE_DAYS, PLAYBACK_PAGE_BYTES } from '../store.mjs';
import { emptyDay, validateDay } from '../../../shared/journey/core.mjs';
import { createMemoryFirestore } from '../../../apps/homehunt/tests/helpers/firestore-memory.mjs';

function fixture() {
  const db = createMemoryFirestore();
  db.doc = path => { const parts = path.split('/'), id = parts.pop(); return db.collection(parts.join('/')).doc(id); };
  return { db, store: createJourneyStore({ db }) };
}
function put(db, date, records, extra = {}) {
  const day = validateDay({ ...emptyDay(date), revision: 1, records, ...extra });
  db.documents.set(`${JOURNEY_ROOT}/days/${date}`, { schema: 1, data: JSON.stringify(day), updatedBy: 'PRIVATE_MEMBER', updatedAt: 1 });
}
function memory(id, extra = {}) {
  return { id, person: 'together', kind: 'manual', title: '검수용 장소', note: 'PRIVATE_NOTE', time: null, timePrecision: 'day', position: { lat: 37.5, lng: 127 }, edited: true, ...extra };
}

test('period read is empty and write-free, and rejects invalid bounds before reading', async () => {
  const { db, store } = fixture();
  assert.deepEqual(await store.playback({ from: '2023-01-01', to: '2026-12-31' }), { days: [], nextCursor: null });
  const reads = db.calls.reads;
  for (const input of [
    {}, { from: '2024-02-30', to: '2024-03-02' }, { from: '2025-01-01', to: '2024-01-01' },
    { from: '2024-01-01', to: '2024-02-01', after: '2023-12-31' },
    { from: '2024-01-01', to: '2024-02-01', after: '../../private' },
    { from: '2024-01-01', to: '2024-02-01', after: '2024-02-02' },
  ]) await assert.rejects(store.playback(input), { status: 400 });
  assert.equal(db.calls.reads, reads);
  assert.equal(db.calls.writes, 0);
  assert.equal(db.documents.size, 0);
});

test('date cursor visits only stored days once across holes, months and years', async () => {
  const { db, store } = fixture(), expected = [];
  for (let i = 0; i < 70; i++) {
    const date = new Date(Date.UTC(2023, 0, 1 + i * 14)).toISOString().slice(0, 10);
    expected.push(date); put(db, date, [memory('record-' + i)]);
  }
  put(db, '2022-12-31', [memory('before')]); put(db, '2026-12-31', [memory('after')]);
  db.documents.set(`${JOURNEY_ROOT}/photos/not-a-day`, { private: true });
  db.documents.set(`${JOURNEY_ROOT}/days/2023-01-01/private/child`, { private: true });
  const before = structuredClone([...db.documents]), actual = [];
  let after = null, pages = 0;
  do {
    const page = await store.playback({ from: expected[0], to: expected.at(-1), after });
    assert.ok(page.days.length <= PLAYBACK_PAGE_DAYS);
    assert.ok(Buffer.byteLength(JSON.stringify({ ok: true, ...page })) <= PLAYBACK_PAGE_BYTES);
    actual.push(...page.days.map(day => day.date)); after = page.nextCursor; pages++;
    assert.ok(pages < 5);
  } while (after);
  assert.deepEqual(actual, expected);
  assert.equal(pages, 3);
  assert.ok(db.calls.reads < 80, 'empty calendar days are not fetched');
  assert.equal(db.calls.writes, 0);
  assert.deepEqual([...db.documents], before);
  assert.deepEqual(await store.playback({ from: expected[0], to: expected.at(-1), after: expected.at(-1) }), { days: [], nextCursor: null });
});

test('period summaries retain null time and track-only days without private source fields', async () => {
  const { db, store } = fixture(), date = '2025-04-27', time = Date.parse(date + 'T11:00:00+09:00');
  const source = { id: 'source-one', hash: 'a'.repeat(64), name: 'PRIVATE_SOURCE_FILENAME', person: 'sungwoo', kind: 'timeline', importedAt: time };
  put(db, date, [memory('memory-one'), memory('missing-position', { position: null })], { title: '그날', note: 'PRIVATE_DAY_NOTE' });
  put(db, '2025-04-28', [], { imports: [source], tracks: [{ id: 'track-one', sourceId: source.id, person: 'sungwoo', points: [
    { lat: 37.5, lng: 127, time: time + 86400000 }, { lat: 37.6, lng: 127.1, time: time + 86460000 },
  ] }] });
  const result = await store.playback({ from: date, to: '2025-04-28' });
  assert.equal(result.days.length, 2);
  assert.ok(result.days[0].candidates.some(scene => scene.recordIds.includes('memory-one') && scene.time === null));
  assert.ok(result.days[1].candidates.some(scene => scene.trackIds.includes('track-one')));
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|updatedBy|importedAt|sourceId|"hash"|"note"/);
  assert.equal(db.calls.writes, 0);
});

test('large summaries stop at the response byte boundary and resume without loss', async () => {
  const { db, store } = fixture(), expected = [];
  const records = Array.from({ length: 850 }, (_, i) => memory('record-' + i, {
    title: `장소${i} ${'가'.repeat(125)}`, note: '', position: { lat: -70 + i * .15, lng: 127 },
  }));
  for (let i = 1; i <= 8; i++) { const date = `2024-01-${String(i).padStart(2, '0')}`; expected.push(date); put(db, date, records); }
  const actual = []; let after = null, count = 0;
  do {
    const page = await store.playback({ from: expected[0], to: expected.at(-1), after });
    assert.ok(page.days.length > 0);
    assert.ok(Buffer.byteLength(JSON.stringify({ ok: true, ...page })) <= PLAYBACK_PAGE_BYTES);
    actual.push(...page.days.map(day => day.date)); after = page.nextCursor; count++;
    assert.ok(count <= 8);
  } while (after);
  assert.ok(count > 1, 'byte bound must paginate before the 31-day limit');
  assert.deepEqual(actual, expected);
  assert.equal(db.calls.writes, 0);
});
