import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, sep, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ics': 'text/calendar; charset=utf-8' };
export function previewServer(root) {
  root = resolve(root);
  return http.createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
      const url = new URL(request.url, 'http://127.0.0.1');
      const path = decodeURIComponent(url.pathname);
      if (path.includes('\\') || path.split('/').some(part => part.startsWith('.'))) throw Object.assign(Error(), { code: 'ENOENT' });
      let filename = resolve(root, '.' + path);
      if (filename !== root && !filename.startsWith(root + sep)) throw Object.assign(Error(), { code: 'ENOENT' });
      let info = await stat(filename);
      if (info.isDirectory()) {
        if (!path.endsWith('/')) { response.writeHead(308, { Location: url.pathname + '/' + url.search }); response.end(); return; }
        filename = join(filename, 'index.html'); info = await stat(filename);
      }
      if (!info.isFile()) throw Object.assign(Error(), { code: 'ENOENT' });
      const headers = { 'Content-Type': types[extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      let start = 0, end = info.size - 1, status = 200;
      if (range) {
        start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end;
        if (start > end || start >= info.size) { response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); response.end(); return; }
        headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`; status = 206;
      }
      headers['Content-Length'] = end - start + 1; response.writeHead(status, headers);
      if (request.method === 'HEAD') response.end(); else createReadStream(filename, { start, end }).on('error', () => response.destroy()).pipe(response);
    } catch (error) { response.writeHead(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500); response.end('Not found'); }
  });
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = process.argv[2] || fileURLToPath(new URL('../../../deploy/invitation/dist', import.meta.url));
  const port = Number(process.argv[3] || 8031);
  const server = previewServer(root); server.listen(port, '127.0.0.1', () => console.log(`Invitation-only preview http://127.0.0.1:${port}/lab/v6-1/`));
}
