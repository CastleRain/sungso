import { spawnSync } from 'node:child_process';
import { PROJECT_ROOT } from './build-site.mjs';

// Dependencies are installed explicitly per service; this command never deploys.
for (const service of ['services/homehunt/render', 'services/homehunt/cloud', 'services/firebase-default']) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build', '--prefix', service], { cwd: PROJECT_ROOT, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Render, Firebase HomeHunt and default Firebase service bundles built.');
