import http from 'node:http';
import { createReadStream, watch } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSite, PROJECT_ROOT, loadRegistry } from './build-site.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.pdf': 'application/pdf', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.csv': 'text/csv; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

/** Serve only dist. Both /sungso/ and / emulate the unchanged public layout. */
export function createStaticServer({ distDir = path.join(PROJECT_ROOT, 'dist') } = {}) {
  const root = path.resolve(distDir);
  return http.createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/sungso') { res.writeHead(308, { Location: `/sungso/${url.search}` }); res.end(); return; }
      let relative = decodeURIComponent(url.pathname.startsWith('/sungso/') ? url.pathname.slice(8) : url.pathname.slice(1));
      if (relative.includes('\\') || relative.includes('\0') || relative.split('/').some(part => part === '..' || part.startsWith('.'))) {
        res.writeHead(404); res.end('Not found'); return;
      }
      let filename = path.resolve(root, relative || '.');
      if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) { res.writeHead(404); res.end('Not found'); return; }
      let info = await stat(filename);
      if (info.isDirectory()) {
        if (!url.pathname.endsWith('/')) { res.writeHead(308, { Location: `${url.pathname}/${url.search}` }); res.end(); return; }
        filename = path.join(filename, 'index.html');
        info = await stat(filename);
      }
      if (!info.isFile()) { res.writeHead(404); res.end('Not found'); return; }
      const headers = { 'Content-Type': MIME[path.extname(filename)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store' };
      res.writeHead(200, headers);
      if (req.method === 'HEAD') res.end();
      else createReadStream(filename).on('error', () => res.destroy()).pipe(res);
    } catch (error) {
      res.writeHead(error instanceof URIError ? 400 : error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500);
      res.end(error.code === 'ENOENT' ? 'Not found' : 'Cannot serve this resource');
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
  const port = Number(option('--port', '8000'));
  const host = option('--host', '127.0.0.1');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Use --port with a valid port number.');
  const built = await buildSite();
  const server = createStaticServer({ distDir: built.distDir });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  console.log(`sungso preview: http://${host}:${server.address().port}/sungso/ (also available at /)`);
  if (args.includes('--no-watch')) return;
  const registry = await loadRegistry();
  const roots = new Set(['apps', 'shared', 'config', ...(registry.compatibility?.files || []).map(entry => path.dirname(entry.source))]);
  let timer;
  let rebuilding = false;
  let pending = false;
  async function rebuild() {
    if (rebuilding) { pending = true; return; }
    rebuilding = true;
    try { const result = await buildSite(); console.log(`Rebuilt ${result.files.length} files. Refresh the browser to see changes.`); }
    catch (error) { console.error(`Build failed: ${error.message}`); }
    finally { rebuilding = false; if (pending) { pending = false; void rebuild(); } }
  }
  for (const directory of roots) watch(path.join(PROJECT_ROOT, directory), { recursive: true }, () => {
    clearTimeout(timer); timer = setTimeout(rebuild, 150);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
