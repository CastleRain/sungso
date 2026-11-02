import { mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildSales } from './sales/build.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(new URL('./sales/package.json', import.meta.url));

// Only compiled member shells, example portfolio assets and sales code are emitted.
export async function buildApp({ outdir = path.join(here, 'dist') } = {}) {
  const { build } = require('esbuild');
  await rm(outdir, { recursive: true, force: true });
  await mkdir(path.join(outdir, 'assets'), { recursive: true });
  await build({ entryPoints: [path.join(here, 'workspace/main.jsx')], outfile: path.join(outdir, 'assets/workspace.js'), bundle: true, minify: true, format: 'esm', target: ['chrome110', 'safari16'], legalComments: 'eof', loader: { '.png': 'file' }, assetNames: 'example-[hash]', publicPath: '/sungso/sohee/assets', define: { 'process.env.NODE_ENV': '"production"' }, alias: { react: path.dirname(require.resolve('react/package.json')), 'react-dom': path.dirname(require.resolve('react-dom/package.json')) }, plugins: [{ name: 'shared-auth', setup(api) { api.onResolve({ filter: /site-auth\.mjs$/ }, () => ({ path: '../../shared/firebase/site-auth.mjs', external: true })); } }] });
  let html = await readFile(path.join(here, 'workspace/index.html'), 'utf8');
  for (const ext of ['js', 'css']) {
    const version = createHash('sha256').update(await readFile(path.join(outdir, `assets/workspace.${ext}`))).digest('hex').slice(0, 16);
    html = html.replace(`/assets/workspace.${ext}"`, `/assets/workspace.${ext}?v=${version}"`);
  }
  // The portfolio reuses this template and bundle. Add member presentation
  // assets only to workspace routes so its existing output remains unchanged.
  await cp(path.join(here, 'workspace/glass.css'), path.join(outdir, 'assets/workspace-glass.css'));
  const suiteHead = '<script src="/sungso/shared/theme/suite-boot.js?v=20261103-glass-1"></script><link rel="stylesheet" href="/sungso/shared/theme/suite.css?v=20261103-glass-1"><link rel="stylesheet" href="/sungso/shared/theme/suite-controls.css?v=20261103-glass-1"><link rel="stylesheet" href="/sungso/sohee/assets/workspace-glass.css?v=20261103-glass-workspace-1"><script type="module" src="/sungso/shared/theme/suite.mjs?v=20261103-glass-1"></script>';
  const memberHtml = html.replace('</head>', `${suiteHead}</head>`);
  for (const route of ['', 'workspace', 'portfolio', 'portfolio/cases/dessert-set', 'portfolio/about']) {
    await mkdir(path.join(outdir, route), { recursive: true });
    await writeFile(path.join(outdir, route, 'index.html'), route.startsWith('portfolio') ? html : memberHtml);
  }
  await cp(path.join(here, 'sales/THIRD_PARTY_NOTICES.txt'), path.join(outdir, 'THIRD_PARTY_NOTICES.txt'));
  await buildSales({ outdir: path.join(outdir, 'sales') });
  return outdir;
}
