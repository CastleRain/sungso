import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { buildSite, PROJECT_ROOT } from './build-site.mjs';
import { checkSite, listFiles } from './check-site.mjs';

const built = await buildSite();
const checked = await checkSite();
const syntaxFiles = [
  ...built.files.filter(file => /\.(?:js|mjs)$/.test(file)).map(file => path.join('dist', file)),
  ...(await listFiles(path.join(PROJECT_ROOT, 'scripts'))).filter(file => file.endsWith('.mjs')).map(file => path.join('scripts', file)),
];
for (const filename of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', filename], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Syntax check failed: ${filename}\n${result.stderr || result.error || ''}`);
}
console.log(`Site checks passed: ${checked.references} local references, ${syntaxFiles.length} JavaScript files.`);
const tests = spawnSync(process.execPath, ['scripts/test.mjs'], { cwd: PROJECT_ROOT, stdio: 'inherit' });
if (tests.error) throw tests.error;
process.exitCode = tests.status ?? 1;
