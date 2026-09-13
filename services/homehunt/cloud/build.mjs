import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { publicDataPath } from '../paths.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
await mkdir(`${root}/lib`, { recursive: true });
await build({ entryPoints: [`${root}/index.mjs`], outfile: `${root}/lib/index.cjs`,
  platform: 'node', target: 'node22', format: 'cjs', bundle: true,
  external: ['firebase-admin/*', 'firebase-functions/*'], logLevel: 'info' });
await copyFile(publicDataPath('apartment-catalog-seoul-gyeonggi.json'), `${root}/lib/catalog.json`);
