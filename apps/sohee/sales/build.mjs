import { build } from 'esbuild';
import { mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export async function buildSales({ outdir = path.join(here, 'dist'), qa = false } = {}) {
  await rm(outdir, { recursive: true, force: true }); await mkdir(path.join(outdir, 'assets'), { recursive: true });
  const result = await build({ entryPoints: [path.join(here, 'src/main.jsx')], outfile: path.join(outdir, 'assets/app.js'), bundle: true, minify: true, format: 'esm', target: ['chrome110', 'safari16'], metafile: true, legalComments: 'eof', define: { 'process.env.NODE_ENV': '"production"' }, external: ['https://*'], plugins: [{ name: 'shared-auth', setup(api) {
    api.onResolve({ filter: /site-auth\.mjs$/ }, () => ({ path: '../../../shared/firebase/site-auth.mjs', external: true }));
    if (qa) api.onResolve({ filter: /^\.\/firebase\.mjs$/ }, () => ({ path: path.join(here, 'tests/qa-connection.mjs') }));
  } }] });
  if (Object.keys(result.metafile.inputs).some(name => /(?:^|\/)sohee\/(?:combined|normalized|payhere|raw)\//.test(name))) throw new Error('Private data entered the build graph.');
  let html = await readFile(path.join(here, 'index.html'), 'utf8');
  if (qa) html = html.replace('<script type="module" src="/sungso/shared/firebase/boot.mjs"></script>', '').replace('type="application/x-sungso-script" data-type="module" data-src=', 'type="module" src=');
  for (const route of ['', 'overview', 'menus', 'prep', 'changes', 'data']) {
    await mkdir(path.join(outdir, route), { recursive: true }); await writeFile(path.join(outdir, route, 'index.html'), html);
  }
  await cp(path.join(here, 'THIRD_PARTY_NOTICES.txt'), path.join(outdir, 'THIRD_PARTY_NOTICES.txt'));
  return outdir;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) { await buildSales(); console.log('Sales app built: code only, no private data.'); }
