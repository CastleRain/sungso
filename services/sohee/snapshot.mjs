import { createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
export function validateData(data) {
  if (!data || !date(data.start) || !date(data.end) || !date(data.complete_through) || data.start > data.end || data.complete_through > data.end) throw new Error('INVALID_RANGE');
  for (const key of ['daily', 'monthly', 'menu_monthly', 'menu_toss', 'receipt_hour', 'partial_dates', 'files']) if (!Array.isArray(data[key])) throw new Error('INVALID_DATA');
  if (!data.monthly.length || !data.daily.length || !data.forecast?.plans || !data.forecast?.metrics) throw new Error('EMPTY_DATA');
  for (const rows of [data.daily, data.monthly, data.menu_monthly, data.menu_toss, data.receipt_hour]) if (rows.some(row => !Number.isFinite(row.amount))) throw new Error('INVALID_AMOUNT');
  if (new Set(data.daily.map(row => row.date)).size !== data.daily.length) throw new Error('OVERLAPPING_DATES');
  if (data.daily.some(row => !date(row.date) || row.date < data.start || row.date > data.end || !['toss', 'payhere'].includes(row.source))) throw new Error('INVALID_SOURCE');
  if (![sum(data.daily, 'amount'), sum(data.monthly, 'amount'), sum(data.menu_monthly, 'amount')].every(value => Math.abs(value - data.total) < 0.01)) throw new Error('TOTAL_MISMATCH');
  for (const row of data.monthly) {
    for (const rows of [data.daily, data.menu_monthly]) if (Math.abs(sum(rows.filter(v => v.month === row.month && v.source === row.source), 'amount') - row.amount) > 0.01) throw new Error('MONTH_MISMATCH');
  }
  const tossDays = new Set(data.daily.filter(row => row.source === 'toss' && !row.partial_day).map(row => row.date));
  if (data.menu_toss.some(row => !tossDays.has(row.date) || !Number.isFinite(row.quantity) || !Number.isInteger(row.hour) || row.hour < 0 || row.hour > 23)) throw new Error('INVALID_MENU_TIME');
  if (data.forecast.cutoff > data.complete_through || data.forecast.plans.some(row => row.end > data.complete_through || !Array.isArray(row.hours) || row.hours.length !== 24 || row.hours.some(v => !Number.isFinite(v) || v < 0))) throw new Error('INVALID_FORECAST');
  if (data.partial_dates.some(day => !date(day)) || data.daily.some(row => !!row.partial_day !== data.partial_dates.includes(row.date))) throw new Error('PARTIAL_MISMATCH');
  return data;
}

export function packSnapshot(data, provenance) {
  validateData(data);
  if (!provenance || !Number.isFinite(Date.parse(provenance.capturedAt)) || !Array.isArray(provenance.sourceHashes) || !provenance.sourceHashes.length || provenance.sourceHashes.some(v => !/^[a-f0-9]{64}$/.test(v))) throw new Error('INVALID_PROVENANCE');
  const text = JSON.stringify({ schemaVersion: 1, data, provenance });
  const version = hash(text), chunks = [];
  // UTF-16 slices are rejoined before parsing. Even 4-byte characters fit well below 1MiB/doc.
  for (let i = 0; i < text.length; i += 100000) chunks.push({ index: chunks.length, payload: text.slice(i, i + 100000) });
  if (chunks.length > 64) throw new Error('SNAPSHOT_TOO_LARGE');
  return { version, chunks, manifest: { schemaVersion: 1, version, chunkCount: chunks.length, capturedAt: provenance.capturedAt, end: data.end, completeThrough: data.complete_through, partialDates: data.partial_dates, sourceHashes: provenance.sourceHashes } };
}

export async function publishSnapshot(db, snapshot, expectedVersion = null, assertAuthorized = async () => {}) {
  await assertAuthorized();
  const currentRef = db.doc('sohee_sales/current');
  // Unreachable immutable chunks may remain after a failed publish; the pointer never exposes half a version.
  for (let i = 0; i < snapshot.chunks.length; i++) await db.doc(`sohee_sales_versions/${snapshot.version}/chunks/${i}`).set(snapshot.chunks[i]);
  await assertAuthorized();
  return db.runTransaction(async tx => {
    const current = await tx.get(currentRef), previous = current.exists ? current.data() : null;
    if (previous?.version === snapshot.version) return { unchanged: true, version: snapshot.version };
    if ((previous?.version || null) !== expectedVersion) throw new Error('REVISION_CONFLICT');
    if (previous && Date.parse(snapshot.manifest.capturedAt) < Date.parse(previous.capturedAt)) throw new Error('OLDER_EXPORT');
    if (previous && snapshot.manifest.end < previous.end) throw new Error('RANGE_REGRESSION');
    const manifest = { ...snapshot.manifest, revision: (previous?.revision || 0) + 1, updatedAt: new Date().toISOString() };
    tx.set(db.doc(`sohee_sales_versions/${snapshot.version}`), manifest);
    tx.set(currentRef, manifest);
    return { unchanged: false, version: snapshot.version };
  });
}
