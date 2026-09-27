import { buildSite, PROJECT_ROOT } from '../../../scripts/build-site.mjs';
import { createStaticServer } from '../../../scripts/dev-site.mjs';
import { buildSales } from './build.mjs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
const qa = process.argv.includes('--qa'), port = Number(process.env.PORT || (qa ? 4176 : 4177));
const distDir = path.join(PROJECT_ROOT, '.local', qa ? 'sohee-qa' : 'sohee-preview', 'dist');
await buildSite({ distDir });
if (qa) {
const prototype = path.join(PROJECT_ROOT, 'apps/sohee/prototype');
const built = spawnSync(process.execPath, [path.join(prototype,'node_modules/vite/bin/vite.js'), 'build'], { cwd: prototype, stdio: 'inherit' });
if (built.status !== 0) throw new Error('Prototype build failed.');
await cp(path.join(prototype, 'dist/client/assets'), path.join(distDir, 'sohee/assets'), { recursive: true });
const html = await readFile(path.join(prototype, 'dist/client/index.html'), 'utf8');
for (const route of ['', 'workspace', 'portfolio', 'portfolio/cases/dessert-set', 'portfolio/about']) {
  await mkdir(path.join(distDir, 'sohee', route), { recursive: true }); await writeFile(path.join(distDir, 'sohee', route, 'index.html'), html);
}
await buildSales({ outdir: path.join(distDir, 'sohee/sales'), qa });
}
const staticServer = createStaticServer({ distDir });
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/sohee/')) {
    if (qa) { res.writeHead(404); res.end(); return; }
    const upstream = http.request({ hostname: '127.0.0.1', port: 8791, path: req.url, method: req.method, headers: req.headers }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
    upstream.on('error', () => { res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ message: '로컬 원본 갱신 서비스가 연결되지 않았습니다.' })); });
    req.pipe(upstream);
  } else staticServer.emit('request', req, res);
});
server.listen(port, '127.0.0.1', () => console.log(`Sohee ${qa?'synthetic QA':'member-authenticated'} preview: http://127.0.0.1:${port}/sungso/sohee/workspace/`));
