import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fixture } from '../../../apps/sohee/sales/tests/fixture.mjs';
import { loadMigration } from '../migration.mjs';
import { packSnapshot, hash } from '../snapshot.mjs';

test('migration selects the verified latest local version and checks historical raw sources', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'sohee-migration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const data = fixture(); data.files = [];
  const raw = Buffer.from('synthetic raw source');
  const source = { archive_id: 'synthetic', zip_sha256: hash(raw), xlsx_sha256: hash(raw) };
  async function put(base, file, value) { await mkdir(path.dirname(path.join(base, file)), { recursive: true }); await writeFile(path.join(base, file), value); }
  async function analysis(base, capturedAt, value) {
    await put(base, 'combined/analysis/dashboard-data.json', JSON.stringify(value));
    await put(base, 'metadata/collection_manifest.json', JSON.stringify({ source_export_created_local: capturedAt, sources: [source] }));
  }
  await put(root, 'raw/synthetic/source.zip', raw); await put(root, 'raw/synthetic/source.xlsx', raw);
  await analysis(root, '2026-04-16T12:00:00+09:00', data);
  const initial = await loadMigration(root); assert.equal(initial.localVersion, null);
  const capturedAt = '2026-04-16T18:30:00+09:00';
  const latest = packSnapshot(data, { capturedAt, sourceHashes: [source.zip_sha256] });
  await analysis(path.join(root, 'runtime/versions', latest.version), capturedAt, data);
  await put(root, 'runtime/local-current.json', JSON.stringify({ version: latest.version }));
  assert.equal((await loadMigration(root)).snapshot.version, latest.version);
  assert.notEqual(latest.version, initial.snapshot.version);
  await put(root, 'raw/synthetic/source.zip', 'damaged');
  await assert.rejects(loadMigration(root), /SOURCE_HASH_MISMATCH/);
  await put(root, 'runtime/local-current.json', JSON.stringify({ version: '../unexpected' }));
  await assert.rejects(loadMigration(root), /INVALID_LOCAL_VERSION/);
});
