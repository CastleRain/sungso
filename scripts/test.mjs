import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PROJECT_ROOT, prepareAppBuilds } from './build-site.mjs';

// Generate registered compiled shells once, before parallel test workers read them.
await prepareAppBuilds();

const directories = ['tests', 'tests/site', 'apps/hub/tests', 'apps/homehunt/tests', 'apps/homehunt-v2/tests', 'apps/homehunt-v2/js', 'apps/invitation/tests', 'apps/invitation-v2/tests', 'apps/invitation-v3/tests', 'apps/invitation-v4/tests', 'apps/invitation-v5/tests', 'apps/sohee/sales/tests', 'services/sohee/tests', 'services/invitation/tests'];
const files = [];
directories.push('apps/journey/tests', 'services/journey/tests', 'tests/theme');
// An app activation can be reverted independently, removing its new test directory.
const optionalDirectories = ['apps/wecost/tests', 'apps/travel/tests', 'apps/honeymoon/tests', 'apps/table/tests'];
for (const directory of [...directories, ...optionalDirectories]) {
  let entries;
  try {
    entries = await readdir(path.join(PROJECT_ROOT, directory));
  } catch (error) {
    if (error.code === 'ENOENT' && optionalDirectories.includes(directory)) continue;
    throw error;
  }
  for (const file of entries.sort()) {
    if (file.endsWith('.test.mjs')) files.push(path.join(directory, file));
  }
}
files.push('services/homehunt/scripts/build-rail-stations.test.mjs');
const result = spawnSync(process.execPath, ['--test', ...files, ...process.argv.slice(2)], { cwd: PROJECT_ROOT, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
