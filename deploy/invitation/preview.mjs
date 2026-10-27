import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const defaultRoot = fileURLToPath(new URL('./dist/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ics': 'text/calendar; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
export function createInvitationPreview(root = defaultRoot) {
  root = path.resolve(root);
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const requested = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const relative = !requested ? 'index.html' : requested.endsWith('/') ? requested + 'index.html' : requested;
      const filename = path.resolve(root, relative);
      if (!filename.startsWith(root + path.sep) || !['GET', 'HEAD'].includes(req.method)) throw Error();
      const info = await stat(filename);
      if (!info.isFile() || !types[path.extname(filename)]) throw Error();
      const headers = { 'Content-Type': types[path.extname(filename)], 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
      const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
      const start = match ? Number(match[1]) : 0;
      const end = match && match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
      if (start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); }
      if (match) headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      headers['Content-Length'] = end - start + 1;
      res.writeHead(match ? 206 : 200, headers);
      if (req.method === 'HEAD') return res.end();
      createReadStream(filename, { start, end }).pipe(res);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(path.join(root, '404.html')));
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  createInvitationPreview().listen(8031, '127.0.0.1', () => console.log('Invitation-only preview: http://127.0.0.1:8031/'));
}
