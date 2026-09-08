import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
await mkdir(path.join(root, 'lib'), { recursive: true });
await build({ absWorkingDir: root, entryPoints: [path.join(root, 'index.mjs')], outfile: path.join(root, 'lib', 'index.cjs'),
  platform: 'node', target: 'node22', format: 'cjs', bundle: true,
  external: ['firebase-admin/*'], logLevel: 'info' });
await copyFile(new URL('../data/apartment-catalog-seoul-gyeonggi.json', import.meta.url), path.join(root, 'lib', 'catalog.json'));
