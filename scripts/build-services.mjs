import { spawnSync } from 'node:child_process';
import { PROJECT_ROOT } from './build-site.mjs';

// Dependencies are installed explicitly per service; this command never deploys.
for (const service of ['services/homehunt/render', 'services/homehunt/cloud', 'services/firebase-default']) {
  // All three packages use their local build.mjs. Launch Node directly so
  // Windows does not need to execute npm.cmd through an extra command shell.
  const result = spawnSync(process.execPath, [`${service}/build.mjs`], { cwd: PROJECT_ROOT, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Render, Firebase HomeHunt and default Firebase service bundles built.');
