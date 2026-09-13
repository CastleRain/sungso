import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Service state never belongs in the public site artifact. Collectors and
// service bundles share the same committed public snapshots as the browser.
const serviceRoot = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const HOMEHUNT_PATHS = Object.freeze({
  repoRoot,
  serviceRoot,
  publicDataDir: path.join(repoRoot, 'apps', 'homehunt', 'data'),
  sourceDataDir: path.join(serviceRoot, 'data', 'source'),
  configDir: path.join(serviceRoot, 'config'),
  stateDir: path.join(serviceRoot, 'state'),
  localStateDir: path.join(serviceRoot, '.local'),
});

export const publicDataPath = (...parts) => path.join(HOMEHUNT_PATHS.publicDataDir, ...parts);
export const sourceDataPath = (...parts) => path.join(HOMEHUNT_PATHS.sourceDataDir, ...parts);
export const configPath = (...parts) => path.join(HOMEHUNT_PATHS.configDir, ...parts);
export const statePath = (...parts) => path.join(HOMEHUNT_PATHS.stateDir, ...parts);
export const localStatePath = (...parts) => path.join(HOMEHUNT_PATHS.localStateDir, ...parts);
