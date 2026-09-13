import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createConfiguredHomehuntApi } from '../server/create-api.mjs';
import { createFirestoreMaintenance } from '../server/firestore-maintenance.mjs';
import { readRenderConfiguration } from './config.mjs';
import { createRenderServer } from './node-server.mjs';

async function start() {
  const config = readRenderConfiguration();
  const catalog = JSON.parse(await readFile(path.join(__dirname, 'catalog.json'), 'utf8'));
  if (!Array.isArray(catalog?.apartments) || !catalog.apartments.length) throw new Error('INVALID_CATALOG');
  const app = initializeApp({ credential: cert(config.serviceAccount), projectId: config.projectId });
  const db = getFirestore(app);
  const api = createConfiguredHomehuntApi({ db, auth: getAuth(app), env: config.providers,
    loadCatalog: async () => catalog, runtime: 'render', keySource: 'server-environment' });
  const server = createRenderServer({ api });
  const maintenance = createFirestoreMaintenance({ db });
  const clean = () => { void maintenance.runIfDue().catch(() => {}); };
  const interval = setInterval(clean, 6 * 60 * 60 * 1000);
  interval.unref();
  server.listen(config.port, '0.0.0.0', () => { console.info('HomeHunt API ready'); clean(); });
  server.on('error', () => { console.error('HomeHunt API could not start'); process.exitCode = 1; });
  const shutdown = () => {
    clearInterval(interval);
    server.close(() => process.exit(0));
    const timer = setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 25000);
    timer.unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
start().catch(() => {
  console.error('HomeHunt API startup failed. Check server secret settings.');
  process.exitCode = 1;
});
