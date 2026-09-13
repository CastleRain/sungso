import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const PRIVATE_COLLECTIONS = ['events', 'travel_places', 'site_members', 'site_settings', 'site_home', 'home_settings', 'home_notes', 'private_data', 'private_files', 'wecost_items', 'wecost_savings', 'wecost_settings', 'wecost_income', 'wecost_expenses', 'wecost_assets', 'wecost_loans', 'wecost_adjustments', 'itineraries', 'couplePicks', 'resort_notes', 'resort_note_meta', 'resort_images', 'resort_custom_images', 'honeymoon_fx', 'blog_review_prefs', 'homehunt_user_snapshots', 'homehunt_members'];
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const sha256 = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(canonical(value))).digest('hex');
const readJSON = async filename => JSON.parse(await readFile(filename, 'utf8'));
const writeJSON = (filename, value) => writeFile(filename, JSON.stringify(value, null, 2));
const allowedPath = value => typeof value === 'string' && value.split('/').length % 2 === 0 && PRIVATE_COLLECTIONS.includes(value.split('/')[0]) && value.split('/').every(part => part && part !== '.' && part !== '..');
export function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isFinite(value)) return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  throw new Error('Unsupported migration value');
}
const encodeFields = data => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)]));

// Inject credentials externally. Never persist/log the token, request headers,
// member identifiers, data values, or provider secrets in public evidence.
export function createFirestoreRest({ projectId, getAccessToken, fetchImpl = fetch }) {
  if (!/^[a-z][a-z0-9-]+$/.test(projectId)) throw new Error('Invalid project');
  const prefix = `projects/${projectId}/databases/(default)/documents`;
  const base = `https://firestore.googleapis.com/v1/${prefix}`;
  async function request(suffix, options = {}, allowMissing = false) {
    const token = await getAccessToken();
    const response = await fetchImpl(base + suffix, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`FIRESTORE_HTTP_${response.status}`);
    return response.json();
  }
  async function listCollections(parent = '') {
    const found = []; let pageToken;
    do {
      const response = await request(`${parent ? '/' + parent : ''}:listCollectionIds`, { method: 'POST', body: JSON.stringify({ pageSize: 1000, ...(pageToken ? { pageToken } : {}) }) });
      found.push(...response.collectionIds || []); pageToken = response.nextPageToken;
    } while (pageToken);
    return found;
  }
  async function listDocuments(collection) {
    const documents = []; let pageToken;
    do {
      const params = new URLSearchParams({ pageSize: '1000', showMissing: 'true', ...(pageToken ? { pageToken } : {}) });
      const response = await request(`/${collection}?${params}`);
      documents.push(...response.documents || []); pageToken = response.nextPageToken;
    } while (pageToken);
    return documents;
  }
  return {
    prefix, listCollections, listDocuments,
    get: name => request(`/${name}`, {}, true),
    async createMany(documents) {
      if (documents.length > 450) throw new Error('Review a smaller atomic migration');
      if (!documents.length) return;
      return request(':commit', { method: 'POST', body: JSON.stringify({ writes: documents.map(({ path: name, data }) => ({ update: { name: `${prefix}/${name}`, fields: encodeFields(data) }, currentDocument: { exists: false } })) }) });
    }
  };
}

export async function backupPrivateDatabase(client, outputDirectory) {
  const output = path.resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, '.gitignore'), '*\n');
  const discovered = await client.listCollections();
  const unknown = discovered.filter(name => !PRIVATE_COLLECTIONS.includes(name) && !/^(?:homehunt_(?:cache|market|price|public|search|commute|facility|facilities|rate|quota)|naver_blog_(?:cache|meta))/.test(name));
  const roots = discovered.filter(name => PRIVATE_COLLECTIONS.includes(name));
  const documents = [];
  async function collect(collection) {
    for (const document of await client.listDocuments(collection)) {
      const relative = document.name.slice(client.prefix.length + 1);
      if (document.fields) documents.push(document);
      for (const child of await client.listCollections(relative)) await collect(`${relative}/${child}`);
    }
  }
  for (const root of roots) await collect(root);
  documents.sort((a, b) => a.name.localeCompare(b.name));
  const backup = { schemaVersion: 1, createdAt: new Date().toISOString(), prefix: client.prefix, roots, discovered, unknown, documents };
  await writeJSON(path.join(output, 'database-backup.json'), backup);
  const written = await readJSON(path.join(output, 'database-backup.json'));
  if (sha256(written) !== sha256(backup)) throw new Error('Backup verification failed');
  const evidence = { verified: true, collectionCount: roots.length, documentCount: documents.length, unknownCollectionCount: unknown.length, backupSha256: sha256(backup) };
  await writeJSON(path.join(output, 'backup-evidence.json'), evidence);
  return evidence;
}

export async function dryRunMigration(client, { manifestPath, outputDirectory }) {
  const output = path.resolve(outputDirectory), manifest = await readJSON(manifestPath);
  const backup = await readJSON(path.join(output, 'database-backup.json'));
  const evidence = await readJSON(path.join(output, 'backup-evidence.json'));
  if (!evidence.verified || evidence.backupSha256 !== sha256(backup) || backup.prefix !== client.prefix) throw new Error('A verified backup of this database is required');
  const documents = manifest.documents;
  if (!Array.isArray(documents) || new Set(documents.map(doc => doc.path)).size !== documents.length || documents.some(doc => !allowedPath(doc.path) || !doc.data || typeof doc.data !== 'object')) throw new Error('Invalid migration manifest');
  const changes = [];
  for (const document of documents) {
    const existing = await client.get(document.path);
    changes.push({ path: document.path, sourceSha256: sha256(document.data), operation: existing ? 'preserve' : 'create', ...(existing ? { existingSha256: sha256(existing) } : {}) });
  }
  const plan = { schemaVersion: 1, createdAt: new Date().toISOString(), prefix: client.prefix, backupSha256: evidence.backupSha256, manifestSha256: sha256(manifest), changes };
  await writeJSON(path.join(output, 'dry-run.json'), plan);
  const summary = { createCount: changes.filter(item => item.operation === 'create').length, preserveCount: changes.filter(item => item.operation === 'preserve').length, dryRunSha256: sha256(plan), backupSha256: evidence.backupSha256, manifestSha256: plan.manifestSha256 };
  await writeJSON(path.join(output, 'dry-run-evidence.json'), summary);
  return summary;
}

export async function applyMigration(client, { manifestPath, outputDirectory, expectedDryRunSha256 }) {
  const output = path.resolve(outputDirectory), plan = await readJSON(path.join(output, 'dry-run.json'));
  const manifest = await readJSON(manifestPath), backup = await readJSON(path.join(output, 'database-backup.json'));
  if (!expectedDryRunSha256 || sha256(plan) !== expectedDryRunSha256 || plan.manifestSha256 !== sha256(manifest) || plan.backupSha256 !== sha256(backup) || plan.prefix !== client.prefix) throw new Error('Reviewed dry-run and backup must match');
  const creates = [];
  for (const change of plan.changes) {
    const existing = await client.get(change.path);
    // Existing data always wins, including records created after the dry run.
    if (existing) continue;
    if (change.operation === 'preserve') throw new Error('Existing record disappeared; review a fresh backup');
    const document = manifest.documents.find(item => item.path === change.path);
    if (sha256(document.data) !== change.sourceSha256) throw new Error('Source changed after review');
    creates.push(document);
  }
  await client.createMany(creates);
  for (const document of creates) {
    const stored = await client.get(document.path);
    if (!stored || sha256(stored.fields) !== sha256(encodeFields(document.data))) throw new Error('Post-import verification failed');
  }
  const evidence = { createdCount: creates.length, preservedCount: manifest.documents.length - creates.length, verifiedCount: creates.length, dryRunSha256: sha256(plan), backupSha256: plan.backupSha256, manifestSha256: plan.manifestSha256 };
  await writeJSON(path.join(output, 'apply-evidence.json'), evidence);
  return evidence;
}
