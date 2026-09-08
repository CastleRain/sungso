import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
await mkdir(`${root}/lib`, { recursive: true });
await build({ entryPoints: [`${root}/index.mjs`], outfile: `${root}/lib/index.cjs`,
  platform: 'node', target: 'node22', format: 'cjs', bundle: true,
  external: ['firebase-admin/*', 'firebase-functions/*'], logLevel: 'info' });
await copyFile(new URL('../data/apartment-catalog-seoul-gyeonggi.json', import.meta.url), `${root}/lib/catalog.json`);
