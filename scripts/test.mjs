import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PROJECT_ROOT } from './build-site.mjs';

const directories = ['tests', 'tests/site', 'apps/homehunt/tests', 'apps/invitation/tests'];
const files = [];
for (const directory of directories) {
  for (const file of (await readdir(path.join(PROJECT_ROOT, directory))).sort()) {
    if (file.endsWith('.test.mjs')) files.push(path.join(directory, file));
  }
}
files.push('services/homehunt/scripts/build-rail-stations.test.mjs');
const result = spawnSync(process.execPath, ['--test', ...files, ...process.argv.slice(2)], { cwd: PROJECT_ROOT, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
