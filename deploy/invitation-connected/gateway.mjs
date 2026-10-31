import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://sungso-wedding.vercel.app';
const API = 'https://sungso-homehunt-api.onrender.com/api/invitation/studio';
const COOKIE = '__Host-wedding_studio';
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.ics': 'text/calendar; charset=utf-8' };
const escapeJSON = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export function createGateway({ directory = ROOT, fetcher = fetch, origin = ORIGIN, api = API } = {}) {
  const authenticated = new Map();
  async function remote(suffix, options = {}) {
    return fetcher(api + suffix, { ...options, redirect: 'error', signal: AbortSignal.timeout(55000) });
  }
  async function member(token) {
    if (!token || token.length > 3800 || /[\s;]/.test(token)) return false;
    const old = authenticated.get(token);
    if (old && old.expires > Date.now()) return old.pending;
    if (authenticated.size > 100) authenticated.clear();
    const pending = (async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await remote('/session', { headers: { Authorization: `Bearer ${token}` } });
        if (response.ok) return true;
        if (![429, 502, 503, 504].includes(response.status)) return false;
        await delay(500 + attempt * 300 + Math.random() * 700);
      }
      return false;
    })().catch(() => false);
    // Coalesce parallel module requests; never cache an authorization for more than ten seconds.
    authenticated.set(token, { pending, expires: Date.now() + 10000 });
    void pending.then(ok => { if (!ok && authenticated.get(token)?.pending === pending) authenticated.delete(token); });
    return pending;
  }
  async function bytes(req, limit) {
    if (Number(req.headers['content-length'] || 0) > limit) throw Error('TOO_LARGE');
    const parts = []; let size = 0;
    for await (const part of req) { size += Buffer.byteLength(part); if (size > limit) throw Error('TOO_LARGE'); parts.push(Buffer.from(part)); }
    return Buffer.concat(parts);
  }
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex'); res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Vary', 'Cookie');
    const send = (status, body, type = 'application/json; charset=utf-8') => { res.statusCode = status; res.setHeader('Content-Type', type); res.end(req.method === 'HEAD' ? undefined : body); };
    try {
      const url = new URL(req.url, origin), pathname = url.pathname;
      const token = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
      if (pathname === '/api/studio/session') {
        if (!['POST','DELETE'].includes(req.method)) return send(405, '{"ok":false}');
        if (req.headers.origin !== origin) return send(403, '{"ok":false}');
        if (req.method === 'DELETE') { authenticated.delete(token); res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`); return send(200, '{"ok":true}'); }
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, '{"ok":false}');
        const data = JSON.parse(String(await bytes(req, 8192)));
        if (typeof data.token !== 'string' || !await member(data.token)) return send(403, '{"ok":false,"error":"승인된 두 사람의 계정으로 로그인해 주세요."}');
        res.setHeader('Set-Cookie', `${COOKIE}=${data.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3500`);
        return send(200, '{"ok":true}');
      }
      if (pathname === '/' || pathname === '/index.html') {
        if (!['GET','HEAD'].includes(req.method)) return send(405, '{"ok":false}');
        const response = await remote('/published');
        if (!response.ok) throw Error('PUBLISH_UNAVAILABLE');
        const data = await response.json(); if (data.ok !== true) throw Error('INVALID_PUBLICATION');
        let html = await readFile(path.join(directory, data.release ? 'published.html' : 'legacy.html'), 'utf8');
        if (data.release) html = html.replace('<!--PUBLICATION-->', `<script id="wedding-publication" type="application/json">${escapeJSON(data.release)}</script>`);
        // Public HTML only. Changes appear on the permanent address within 10 seconds.
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=86400'); res.removeHeader('Vary');
        return send(200, html, MIME['.html']);
      }
      if (pathname.startsWith('/api/studio/')) {
        const suffix = pathname.slice('/api/studio'.length);
        if (!/^\/(?:manage|draft\/[a-f0-9-]{36})$/i.test(suffix)) return send(404, '{"ok":false}');
        if (!await member(token)) return send(401, '{"ok":false,"error":"로그인을 다시 확인해 주세요."}');
        if (!['GET','POST'].includes(req.method) || (req.method === 'POST' && suffix !== '/manage')) return send(405, '{"ok":false}');
        if (req.method === 'POST' && (req.headers.origin !== origin || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))) return send(403, '{"ok":false}');
        const response = await remote(suffix, { method: req.method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(req.method === 'POST' ? { body: await bytes(req, 4 * 1024 * 1024) } : {}) });
        return send(response.status, await response.text());
      }
      if (pathname === '/lab' || pathname.startsWith('/lab/')) {
        if (!['GET','HEAD'].includes(req.method)) return send(405, '{"ok":false}');
        if (!await member(token)) {
          if (req.headers['sec-fetch-dest'] === 'document' || String(req.headers.accept).includes('text/html')) {
            res.statusCode = 303; res.setHeader('Location', '/studio-login/?next=' + encodeURIComponent(pathname + url.search)); return res.end();
          }
          return send(401, '{"ok":false}');
        }
        let key = decodeURIComponent(pathname);
        if (key.includes('\\') || key.includes('..') || /[\x00-\x1f]/.test(key)) return send(404, '{"ok":false}');
        const manifest = JSON.parse(await readFile(path.join(directory, 'private-manifest.json'), 'utf8'));
        if (key.endsWith('/')) key += 'index.html';
        else if (manifest.includes(key + '/index.html')) { res.statusCode = 308; res.setHeader('Location', pathname + '/' + url.search); return res.end(); }
        if (!manifest.includes(key)) return send(404, '{"ok":false}');
        const data = await readFile(path.join(directory, 'private', key));
        return send(200, data, MIME[path.extname(key)] || 'application/octet-stream');
      }
      return send(404, '{"ok":false}');
    } catch (error) {
      return send(error.message === 'TOO_LARGE' ? 413 : 503, '{"ok":false,"error":"서버 연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요."}');
    }
  };
}
export default createGateway();
