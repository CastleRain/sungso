import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
await mkdir(path.join(root, 'lib'), { recursive: true });
// Include the shared MOLIT implementation in the uploaded Functions source.
// SDKs remain production dependencies installed by Firebase for Node 20.
await build({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'index.js')],
  outfile: path.join(root, 'lib', 'index.cjs'),
  platform: 'node', target: 'node20', format: 'cjs', bundle: true,
  external: ['firebase-admin', 'firebase-functions'],
  logLevel: 'info',
});
