import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { loadPrivateSnapshot, verifyArchivedSources } from './importer.mjs';

// Prefer the reviewed local version. Never silently fall back to the initial archive.
export async function loadMigration(privateRoot) {
  let pointer = null;
  try { pointer = JSON.parse(await readFile(path.join(privateRoot, 'runtime/local-current.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (pointer && !/^[a-f0-9]{64}$/.test(pointer.version)) throw new Error('INVALID_LOCAL_VERSION');
  const versions = path.join(privateRoot, 'runtime/versions');
  const root = pointer ? path.join(versions, pointer.version) : privateRoot;
  const snapshot = await loadPrivateSnapshot(root);
  if (pointer && snapshot.version !== pointer.version) throw new Error('LOCAL_VERSION_MISMATCH');
  let archiveRoots = [privateRoot];
  try { archiveRoots.push(...(await readdir(versions)).filter(name => /^[a-f0-9]{64}$/.test(name)).map(name => path.join(versions, name))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await verifyArchivedSources(root, { archiveRoots });
  return { snapshot, root, localVersion: pointer?.version || null };
}
