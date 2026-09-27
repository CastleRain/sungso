import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createImporter } from './importer.mjs';

// This entry point has no Firebase dependency or network access.
export async function importLocal({ privateRoot, zip, capturedAt, password, python }) {
  const runtime = path.join(privateRoot, 'runtime');
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const lock = path.join(runtime, '.local-update.lock');
  await mkdir(lock, { mode: 0o700 });
  try {
    const currentPath = path.join(runtime, 'local-current.json');
    let current = null;
    try { current = JSON.parse(await readFile(currentPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current && !/^[a-f0-9]{64}$/.test(current.version)) throw new Error('INVALID_LOCAL_VERSION');
    if ((await stat(zip)).size > 15 * 1024 * 1024) throw new Error('INVALID_ARCHIVE');
    const importer = createImporter({ privateRoot, python });
    const expectedVersion = current?.version || null;
    const candidate = await importer.prepare({ archive: (await readFile(zip)).toString('base64'), password, capturedAt, expectedVersion }, 'local-manual');
    await importer.commit(candidate.id, 'local-manual', expectedVersion, async snapshot => {
      if (current && (Date.parse(snapshot.manifest.capturedAt) < Date.parse(current.capturedAt) || snapshot.manifest.end < current.end)) throw new Error('OLDER_EXPORT');
      const next = { ...snapshot.manifest, storage: 'local-only', updatedAt: new Date().toISOString() };
      const temporary = path.join(runtime, 'local-current.tmp');
      await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
      await rename(temporary, currentPath);
    });
    return { localOnly: true, start: candidate.start, end: candidate.end, completeThrough: candidate.completeThrough, partialDates: candidate.partialDates };
  } finally { await rm(lock, { recursive: true, force: true }); }
}

async function secretPrompt() {
  if (!process.stdin.isTTY) throw new Error('PASSWORD_REQUIRES_LOCAL_TERMINAL');
  const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const input = createInterface({ input: process.stdin, output, terminal: true });
  process.stdout.write('ZIP 암호 (표시·저장하지 않음, 암호 없으면 Enter): ');
  try { return await input.question(''); }
  finally { input.close(); process.stdout.write('\n'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
  if (!args.includes('--zip') || !args.includes('--captured-at')) {
    console.error('Usage: node services/sohee/local-import.mjs --zip <downloaded.zip> --captured-at <ISO time with +09:00>');
    process.exitCode = 1;
  } else {
    try {
      const result = await importLocal({ privateRoot: path.resolve(process.env.SOHEE_PRIVATE_ROOT || 'sohee'), zip: path.resolve(value('--zip')), capturedAt: value('--captured-at'), password: await secretPrompt(), python: process.env.SOHEE_PYTHON || 'python3' });
      console.log(JSON.stringify(result));
    } catch { console.error('로컬 가져오기를 완료하지 못했습니다. 암호·원본·기간·다른 갱신 실행 여부를 확인해주세요. 기존 자료는 유지됩니다.'); process.exitCode = 1; }
  }
}
