// Local-only synthetic UI fixture. Never imports credentials or calls an operational API.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createMemoryFirestore } from '../../../apps/homehunt/tests/helpers/firestore-memory.mjs';
import { createStudioStore } from '../server/studio.mjs';
const build = path.resolve(process.argv[2]);
if (!build.includes(`${path.sep}.local${path.sep}`)) throw Error('A local generated fixture is required');
const db = createMemoryFirestore(); db.doc = p => { const a = p.split('/'), id = a.pop(); return db.collection(a.join('/')).doc(id); };
const store = createStudioStore({ db });
const files = path.join(build, '.vercel/output/static'), privateDir = path.join(build, '.vercel/output/functions/gateway.func');
const MIME = { '.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webp':'image/webp', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.mp3':'audio/mpeg', '.svg':'image/svg+xml' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8041'), p = url.pathname;
  const send = (code, text, type='application/json') => { res.writeHead(code, {'Content-Type':type,'Cache-Control':'no-store'});res.end(text); };
  try {
    if (p === '/studio-login/session.mjs') return send(200, `export async function studioRequest(path,opts={}){const r=await fetch('/api/studio/'+path,{...opts,headers:{'Content-Type':'application/json'}});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}export const logout=()=>{};`, 'text/javascript');
    if (p === '/api/studio/manage' && req.method === 'GET') return send(200, JSON.stringify({ok:true,...await store.read()}));
    if (p === '/api/studio/manage' && req.method === 'POST') {
      let raw='';for await(const c of req)raw+=c;if(raw.length>4*1024*1024)throw Error('Too large');
      return send(200,JSON.stringify({ok:true,...await store.change(JSON.parse(raw),{uid:'fixture-only',role:'sungwoo'})}));
    }
    if (p.startsWith('/api/studio/draft/')) return send(200, JSON.stringify({ok:true,draft:await store.draft(p.split('/').pop())}));
    if (p.startsWith('/qa-live/')) {
      if(req.method!=='GET')return send(403,'{"ok":false,"error":"QA blocks all guest writes"}');
      if(p.includes('/studio/photo/')){const src=await store.photo(p.split('/').pop());return send(200,Buffer.from(src.split(',')[1],'base64'),src.slice(5,src.indexOf(';')));}
      if(p.endsWith('/accounts'))return send(200,'{"ok":true,"groups":[]}');
      if(p.endsWith('/album'))return send(200,'{"ok":true,"configured":false}');
      if(p.endsWith('/guestbook'))return send(200,'{"ok":true,"messages":[],"next":null,"total":0}');
      return send(404,'{"ok":false}');
    }
    if (p==='/' || p==='/index.html') {
      const data=await store.published();let html=await readFile(path.join(privateDir,data.release?'published.html':'legacy.html'),'utf8');
      if(data.release)html=html.replace('<!--PUBLICATION-->',`<script id="wedding-publication" type="application/json">${JSON.stringify(data.release).replaceAll('<','\\u003c')}</script>`);
      return send(200,html,'text/html');
    }
    if(p.includes('..')||p.includes('\\'))return send(404,'');
    const filename=path.join(p.startsWith('/lab/')?path.join(privateDir,'private'):files,p.endsWith('/')?p+'index.html':p);
    let data=await readFile(filename);if(p.endsWith('/live-adapter.mjs'))data=data.toString().replace('https://sungso-homehunt-api.onrender.com','http://127.0.0.1:8041/qa-live');
    send(200,data,MIME[path.extname(filename)]||'application/octet-stream');
  }catch(e){send(e.code==='ENOENT'?404:e.status||400,JSON.stringify({ok:false,error:e.message}));}
});
server.listen(8041,'127.0.0.1',()=>console.log('Synthetic studio UI: http://127.0.0.1:8041/lab/studio/'));
