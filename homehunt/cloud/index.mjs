import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { createConfiguredHomehuntApi } from '../server/create-api.mjs';

const providerSettings = defineSecret('HOMEHUNT_PROVIDER_CONFIG');
initializeApp();
let handler;
function api() {
  if (handler) return handler;
  const catalogPromise = readFile(path.join(__dirname, 'catalog.json'), 'utf8').then(JSON.parse);
  handler = createConfiguredHomehuntApi({ db: getFirestore(), auth: getAuth(),
    env: JSON.parse(providerSettings.value()), loadCatalog: () => catalogPromise });
  return handler;
}

export const homehuntApi = onRequest({ region: 'asia-northeast3', timeoutSeconds: 540,
  memory: '512MiB', minInstances: 0, maxInstances: 2, concurrency: 1,
  secrets: [providerSettings], invoker: 'public' }, (req, res) => api()(req, res));
