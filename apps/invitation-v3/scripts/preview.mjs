import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../../../scripts/build-site.mjs';
import { startGuestbookPreview } from './guestbook-dev.mjs';
await startGuestbookPreview();
await buildSite();

const root = fileURLToPath(new URL('../../../dist/', import.meta.url));
const base = '/sungso/invitation-v3/';
const args = process.argv.slice(2);
const flag = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
const port = Number(flag('--port', '8024'));
const host = flag('--host', '127.0.0.1');
const types = { '.mp3': 'audio/mpeg', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ics': 'text/calendar; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/' || pathname === base.slice(0, -1)) { res.writeHead(302, { Location: base }); res.end(); return; }
    const harness = pathname === base+'manage-preview.html' || pathname === base+'manage-preview.mjs';
    if (harness) {
      const name=pathname.endsWith('.mjs')?'manage-preview.mjs':'manage-preview.html';
      res.writeHead(200,{'Content-Type':types[extname(name)],'Cache-Control':'no-store'});res.end(await readFile(new URL(name,import.meta.url)));return;
    }
    if (!/^\/sungso\/(?:invitation-v3\/|shared\/(?:firebase|theme|invitation)\/)/.test(pathname)) {res.writeHead(404);res.end();return;}
    const relative=pathname.slice('/sungso/'.length).replace(/\/$/,'/index.html');
    const file=resolve(root,relative);
    if (!file.startsWith(resolve(root) + sep) || !(await stat(file)).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
}).listen(port, host, () => console.log(`Invitation VER3: http://${host}:${port}${base}`));
