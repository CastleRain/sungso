// Explicit operator command; never called by application reads or builds.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadMigration } from './migration.mjs';
import { publishSnapshot } from './snapshot.mjs';
const { values, positionals } = parseArgs({ allowPositionals: true, options: { apply: { type: 'boolean', default: false }, 'expected-version': { type: 'string' } } });
const root = path.resolve(positionals[0] || 'sohee'), expectedVersion = values['expected-version'] || null;
if (expectedVersion && !/^[a-f0-9]{64}$/.test(expectedVersion)) throw new Error('INVALID_EXPECTED_VERSION');
const { snapshot } = await loadMigration(root);
if (!values.apply) {
  console.log(JSON.stringify({ mode: 'dry-run', valid: true, chunks: snapshot.chunks.length, bytes: snapshot.chunks.reduce((sum,c)=>sum+Buffer.byteLength(c.payload),0) }));
} else {
  if (!process.env.FIRESTORE_EMULATOR_HOST && process.env.SOHEE_WRITES_ENABLED !== '1') throw new Error('Production migration is disabled until separately approved.');
  const { runtime } = await import('./server.mjs'); const { db } = await runtime();
  // Initial migration is create-only; a subsequent manual update names its reviewed base.
  const current = await db.doc('sohee_sales/current').get();
  if (current.exists && current.data().version !== snapshot.version && current.data().version !== expectedVersion) throw new Error('Existing data preserved. Review and name the expected current version.');
  const backup = path.join(root, 'runtime/deployment');
  await mkdir(backup, { recursive: true, mode: 0o700 });
  await writeFile(path.join(backup, `before-${Date.now()}.json`), JSON.stringify({ exists: current.exists, data: current.data() || null }), { mode: 0o600 });
  await publishSnapshot(db, snapshot, expectedVersion);
  console.log('Validated snapshot stored; previous versions preserved.');
}
