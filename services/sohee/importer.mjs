import { cp, mkdir, mkdtemp, readFile, writeFile, rm, realpath, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { hash, packSnapshot } from './snapshot.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));

export function runPython(python, script, args, password) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(here, 'import', script), ...args], { env: { ...process.env, ...(password ? { TOSS_EXPORT_PASSWORD: password } : {}) }, stdio: ['ignore', 'ignore', 'pipe'] });
    // Never return a traceback (which may contain source rows, paths or passwords) to the client/log.
    child.stderr.resume();
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 180000);
    child.on('error', () => { clearTimeout(timer); reject(new Error('IMPORT_RUNTIME_UNAVAILABLE')); });
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('IMPORT_VALIDATION_FAILED')); });
  });
}

export async function loadPrivateSnapshot(root) {
  const data = JSON.parse(await readFile(path.join(root, 'combined/analysis/dashboard-data.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(root, 'metadata/collection_manifest.json'), 'utf8'));
  return packSnapshot(data, { capturedAt: manifest.source_export_created_local, sourceHashes: [...new Set((manifest.sources || []).map(s => s.zip_sha256))] });
}

export async function verifyArchivedSources(root, { archiveRoots = [] } = {}) {
  const manifest = JSON.parse(await readFile(path.join(root, 'metadata/collection_manifest.json'), 'utf8'));
  for (const source of manifest.sources || []) {
    if (!source.archive_id || path.basename(source.archive_id) !== source.archive_id) throw new Error('INVALID_ARCHIVE_REFERENCE');
    let folder;
    for (const archiveRoot of [root, ...archiveRoots]) {
      const candidate = path.join(archiveRoot, 'raw', source.archive_id);
      try { await realpath(candidate); folder = candidate; break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (!folder) throw new Error('SOURCE_ARCHIVE_MISSING');
    const names = await readdir(folder);
    const archives = names.filter(name => name.endsWith('.zip'));
    const workbooks = names.filter(name => name.endsWith('.xlsx'));
    if (archives.length !== 1 || workbooks.length !== 1 || hash(await readFile(path.join(folder, archives[0]))) !== source.zip_sha256 || hash(await readFile(path.join(folder, workbooks[0]))) !== source.xlsx_sha256) throw new Error('SOURCE_HASH_MISMATCH');
  }
  const data = JSON.parse(await readFile(path.join(root, 'combined/analysis/dashboard-data.json'), 'utf8'));
  for (const file of data.files) {
    if (path.basename(file.file) !== file.file || hash(await readFile(path.join(root, 'combined/payhere/raw/exports', file.file))) !== file.sha256) throw new Error('SOURCE_HASH_MISMATCH');
  }
}

export function createImporter({ privateRoot, python = 'python3', run = runPython }) {
  const candidates = new Map(); let preparing = false;
  const runtime = path.join(privateRoot, 'runtime');
  async function baseRoot(version) {
    if (!version) return privateRoot;
    const candidate = path.join(runtime, 'versions', version);
    try { await realpath(candidate); return candidate; }
    catch { const baseline = await loadPrivateSnapshot(privateRoot); if (baseline.version !== version) throw new Error('BASELINE_UNAVAILABLE'); return privateRoot; }
  }
  return {
    async prepare(input, actor) {
      if (preparing) throw new Error('IMPORT_BUSY');
      if (!input || typeof input.archive !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.archive) || typeof input.password !== 'string' || input.password.length > 256 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(input.capturedAt) || !Number.isFinite(Date.parse(input.capturedAt)) || Date.parse(input.capturedAt) > Date.now() + 60000) throw new Error('INVALID_INPUT');
      const archive = Buffer.from(input.archive, 'base64');
      if (!archive.length || archive.length > 15 * 1024 * 1024 || archive.subarray(0,2).toString() !== 'PK') throw new Error('INVALID_ARCHIVE');
      preparing = true; let stage;
      try {
        for (const [id, value] of candidates) if (value.expires < Date.now()) { candidates.delete(id); await rm(value.stage, { recursive: true, force: true }); }
        if (candidates.size >= 3) throw new Error('TOO_MANY_CANDIDATES');
        const base = await baseRoot(input.expectedVersion);
        const old = JSON.parse(await readFile(path.join(base, 'metadata/collection_manifest.json'), 'utf8'));
        if (old.sources?.some(item => item.zip_sha256 === hash(archive))) throw new Error('DUPLICATE_ARCHIVE');
        await mkdir(path.join(runtime, 'candidates'), { recursive: true, mode: 0o700 });
        stage = await mkdtemp(path.join(runtime, 'candidates', 'import-'));
        for (const dir of ['normalized', 'analysis', 'metadata', 'payhere/normalized', 'combined/payhere/raw/exports']) await cp(path.join(base, dir), path.join(stage, dir), { recursive: true });
        await mkdir(path.join(stage, 'combined/analysis'), { recursive: true });
        await mkdir(path.join(stage, 'combined/metadata'), { recursive: true });
        const archiveFile = path.join(stage, 'incoming.zip'); await writeFile(archiveFile, archive, { mode: 0o600 });
        await run(python, 'process_sales.py', ['--zip', archiveFile, '--out', stage, '--captured-at', input.capturedAt], input.password);
        await run(python, 'build_data.py', ['--root', stage, '--out', path.join(stage, 'combined')]);
        const snapshot = await loadPrivateSnapshot(stage);
        const previous = JSON.parse(await readFile(path.join(base, 'combined/analysis/dashboard-data.json'), 'utf8'));
        const next = JSON.parse(snapshot.chunks.map(c => c.payload).join('')).data;
        for (const key of ['daily','monthly','menu_monthly']) if (JSON.stringify(previous[key].filter(r=>r.source==='payhere')) !== JSON.stringify(next[key].filter(r=>r.source==='payhere'))) throw new Error('PAYHERE_CHANGED');
        const currentManifest = JSON.parse(await readFile(path.join(stage, 'metadata/collection_manifest.json'), 'utf8'));
        const source = currentManifest.sources.at(-1), id = randomUUID();
        candidates.set(id, { stage, snapshot, actor, expectedVersion: input.expectedVersion || null, expires: Date.now() + 30 * 60 * 1000 });
        return { id, start: source.start, end: source.end, completeThrough: next.complete_through, partialDates: next.partial_dates };
      } catch (error) { if (stage) await rm(stage, { recursive: true, force: true }); throw error; }
      finally { preparing = false; }
    },
    async commit(id, actor, expectedVersion, publish) {
      const item = candidates.get(id);
      if (!item || item.actor !== actor || item.expires < Date.now() || item.expectedVersion !== expectedVersion) throw new Error('CANDIDATE_UNAVAILABLE');
      const destination = path.join(runtime, 'versions', item.snapshot.version);
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      // Durable local baseline is prepared before the Firestore pointer is committed.
      await cp(item.stage, destination, { recursive: true, force: false, errorOnExist: false });
      const result = await publish(item.snapshot, expectedVersion);
      candidates.delete(id); await rm(item.stage, { recursive: true, force: true });
      return result;
    }
  };
}
