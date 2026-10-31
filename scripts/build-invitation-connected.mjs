import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { buildInvitation } from './build-invitation-vercel.mjs';
import { buildStudioV2 } from '../apps/invitation-studio-v2/build.mjs';
import { listFiles } from './check-site.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = path.join(ROOT, 'deploy/invitation-connected');
function replaceOnce(text, from, to) { if (!text.includes(from)) throw Error('Publication source contract changed: ' + from.slice(0, 70)); return text.replace(from, to); }
export async function buildConnectedInvitation({ output = path.join(ROOT, '.local/wedding-connected'), staging = path.join(ROOT, '.local/wedding-staging/dist') } = {}) {
  // A fresh output is mandatory: never accidentally leave an older public editor alongside the gateway.
  try { await readFile(path.join(output, '.vercel/output/config.json')); throw Error('Use a fresh connected output directory.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  await buildInvitation({ distDir: staging });
  await buildStudioV2({ outDir: path.join(staging, 'lab/studio-v2') });
  const base = path.join(output, '.vercel/output'), staticDir = path.join(base, 'static'), fn = path.join(base, 'functions/gateway.func');
  await mkdir(staticDir, { recursive: true }); await mkdir(fn, { recursive: true });
  const files = await listFiles(staging), privateFiles = [];
  for (const file of files) {
    if (file === 'vercel.json') continue;
    const privateFile = file.startsWith('lab/');
    const target = file === 'index.html' ? path.join(fn, 'legacy.html') : path.join(privateFile ? path.join(fn, 'private') : staticDir, file);
    await mkdir(path.dirname(target), { recursive: true }); await cp(path.join(staging, file), target);
    if (privateFile) privateFiles.push('/' + file);
  }
  for (const file of ['gateway.mjs']) await cp(path.join(SOURCE, file), path.join(fn, file));
  await mkdir(path.join(staticDir, 'studio-login'), { recursive: true });
  await cp(path.join(SOURCE, 'session.mjs'), path.join(staticDir, 'studio-login/session.mjs'));
  await cp(path.join(SOURCE, 'login.html'), path.join(staticDir, 'studio-login/index.html'));
  const studio = path.join(fn, 'private/lab/studio');
  for (const file of ['cloud-panel.mjs', 'cloud.css']) { await cp(path.join(SOURCE, file), path.join(studio, file)); privateFiles.push('/lab/studio/' + file); }
  let catalog = await readFile(path.join(studio, 'catalog.mjs'), 'utf8');
  catalog = `import { mountCloudPanel } from './cloud-panel.mjs';\nconst initialSharedDraft = new URLSearchParams(location.search).get('draft');\n` + catalog;
  catalog += `\nmountCloudPanel({initialDraft:initialSharedDraft,ready:contentEditor.ready,getSnapshot:()=>({composition,content:contentEditor.getDraft()}),loadSnapshot:async value=>{await contentEditor.setDraft(value.content);apply(value.composition,{section:'top'});}});\n`;
  await writeFile(path.join(studio, 'catalog.mjs'), catalog);
  let editor = await readFile(path.join(studio, 'index.html'), 'utf8');
  editor = editor.replace("connect-src 'self'", "connect-src 'self' https://*.googleapis.com https://securetoken.googleapis.com https://www.gstatic.com https://sungso-358cb.firebaseapp.com").replace('</head>', '<link rel="stylesheet" href="./cloud.css"></head>');
  editor = editor.replace('조합 저장 ＋', '이 기기 보관 ＋');
  await writeFile(path.join(studio, 'index.html'), editor);
  let contentEditor = await readFile(path.join(studio, 'js/content-editor.mjs'), 'utf8');
  contentEditor = contentEditor.replace('이곳의 문구와 사진은 조립용 초안이에요. 이 브라우저에 따로 보관되며, 현재 하객용 청첩장에는 반영되지 않아요. 조합 링크에는 포함되지 않으니 내용 파일로 함께 옮겨 주세요.', '편집 중인 내용은 이 브라우저에 자동 보관돼요. 두 사람이 함께 보려면 위의 공동 저장 · 공개에서 초안으로 저장해 주세요. 공개하기 전에는 하객 화면이 바뀌지 않아요.');
  await writeFile(path.join(studio, 'js/content-editor.mjs'), contentEditor);
  // V2 is a separate protected shell; V1 and the guest runtime remain unchanged.
  const studioV2 = path.join(fn, 'private/lab/studio-v2');
  for (const file of ['cloud-panel.mjs', 'cloud.css']) {
    let source = await readFile(path.join(SOURCE, file), 'utf8');
    if (file === 'cloud-panel.mjs') source = source.replaceAll('/lab/studio/', '/lab/studio-v2/');
    await writeFile(path.join(studioV2, file), source); privateFiles.push('/lab/studio-v2/' + file);
  }
  let v2 = await readFile(path.join(studioV2, 'studio.mjs'), 'utf8');
  v2 = `import { mountCloudPanel } from './cloud-panel.mjs';\nconst initialSharedDraft = new URLSearchParams(location.search).get('draft');\n` + v2;
  v2 += `\nmountCloudPanel({initialDraft:initialSharedDraft,ready:contentReady,getSnapshot,loadSnapshot});\n`;
  await writeFile(path.join(studioV2, 'studio.mjs'), v2);
  let v2html = await readFile(path.join(studioV2, 'index.html'), 'utf8');
  v2html = v2html.replace("connect-src 'self'", "connect-src 'self' https://*.googleapis.com https://securetoken.googleapis.com https://www.gstatic.com https://sungso-358cb.firebaseapp.com").replace('</head>', '<link rel="stylesheet" href="./cloud.css"></head>');
  await writeFile(path.join(studioV2, 'index.html'), v2html);
  // Keep the private gate, but avoid dozens of simultaneous membership checks
  // across cold function instances for a single module graph.
  const { build } = createRequire(new URL('../services/homehunt/render/package.json', import.meta.url))('esbuild');
  const entries = new Set();
  for (const file of privateFiles.filter(file => file.endsWith('.html'))) {
    const filename = path.join(fn, 'private', file);
    const html = await readFile(filename, 'utf8');
    for (const match of html.matchAll(/<script type="module" src="([^"]+)"/g)) {
      if (match[1].startsWith('.')) entries.add(path.resolve(path.dirname(filename), match[1]));
    }
  }
  for (const entry of entries) {
    const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['https://*', '/shared/*', '/studio-login/*'], logLevel: 'silent' });
    await writeFile(entry, result.outputFiles[0].contents);
  }
  await writeFile(path.join(fn, 'private-manifest.json'), JSON.stringify(privateFiles));

  // Separate build-selected guest entry. No URL or imported composition can select live API mode.
  const published = path.join(staticDir, 'published');
  for (const folder of ['js','css','themes','assets']) await cp(path.join(staging, 'lab/studio', folder), path.join(published, folder), { recursive: true });
  const runtimeSource = await readFile(path.join(staging, 'lab/studio/runtime.mjs'), 'utf8');
  const config = JSON.parse(/export default\s+({[\s\S]*})\s*;/.exec(runtimeSource)[1]);
  config.mode = 'published'; config.canonicalRoot = 'https://sungso-wedding.vercel.app/'; config.wedding.canonicalUrl = config.canonicalRoot;
  config.photos = config.photos.map(p => ({ ...p, src: p.src.replace('../assets/', '/published/assets/'), thumb: p.thumb.replace('../assets/', '/published/assets/') }));
  await writeFile(path.join(published, 'runtime.mjs'), `const publication=JSON.parse(document.getElementById('wedding-publication').textContent);\nexport default {...${JSON.stringify(config)},publication};\n`);
  await cp(path.join(SOURCE, 'live-adapter.mjs'), path.join(published, 'js/live-adapter.mjs'));
  let app = await readFile(path.join(published, 'js/app.mjs'), 'utf8');
  app = replaceOnce(app, "import { createDemoAdapter } from './demo-data.mjs';", "import { createLiveAdapter, loadPublicPhotos } from './live-adapter.mjs';");
  app = replaceOnce(app, "config.mode !== 'demo'", "config.mode !== 'published'");
  app = replaceOnce(app, "const comparison = window.parent !== window && new URLSearchParams(location.search).get('compare') === '1';", 'const comparison = false;');
  app = replaceOnce(app, 'let composition = readComposition(location.search);', 'let composition = config.publication.snapshot.composition;');
  app = replaceOnce(app, 'canonicalUrl = `${config.canonicalRoot}preview/?${parameters}`;', 'canonicalUrl = config.canonicalRoot;');
  app = replaceOnce(app, "history.replaceState(history.state, '', `${location.pathname}?${parameters}${comparison ? '&compare=1' : ''}${location.hash}`);", "history.replaceState(history.state, '', `${location.pathname}${location.hash}`);");
  app = replaceOnce(app, "document.querySelector('.lab-return').href = `../?${parameters}`;", "document.querySelector('.lab-return')?.remove();");
  app = replaceOnce(app, 'const adapter = createDemoAdapter({ variant, photos: config.photos, storage: storageOrNull() });', 'const adapter = createLiveAdapter();');
  app = replaceOnce(app, 'if (comparison) contentPreview = mountContentPreview({doc:document,win:window,gallery,config,onLayout:()=>themeController?.refresh()});', `contentPreview = mountContentPreview({doc:document,win:window,config,onLayout:()=>themeController?.refresh()});
  contentPreview.setDraft({...config.publication.snapshot.content,photos:[],albumOrder:null});
  void loadPublicPhotos(config.photos,config.publication.snapshot.content).then(photos=>{gallery.render(photos);themeController?.refresh();});`);
  app = app.replaceAll('이 시안의 주소', '청첩장 주소').replaceAll('공유할 시안 주소', '청첩장 주소').replaceAll(' · 비교 시안', '').replaceAll('일부 체험 기능', '일부 기능');
  await writeFile(path.join(published, 'js/app.mjs'), app);
  let boot = await readFile(path.join(published, 'js/intro-boot.js'), 'utf8');
  boot = replaceOnce(boot, "normalize(new URLSearchParams(location.search).get('opening'))", "normalize(JSON.parse(document.getElementById('wedding-publication').textContent).snapshot.composition.opening)");
  await writeFile(path.join(published, 'js/intro-boot.js'), boot);
  let guest = await readFile(path.join(published, 'js/guest-features.mjs'), 'utf8');
  guest = guest.replaceAll('예시 계좌번호', '계좌번호').replaceAll('예시 번호', '계좌번호').replaceAll('체험 메시지', '축하 메시지').replaceAll('이 시안에', '두 사람에게');
  guest = replaceOnce(guest, "adapter.persistent ? '체험 방명록 · 이 시안과 이 기기에만 저장됩니다.' : '체험 방명록 · 저장 공간을 사용할 수 없어 현재 탭에서만 유지됩니다.'", "'이름과 축하 메시지는 모든 하객에게 공개됩니다.'");
  guest = replaceOnce(guest, 'row.append(owner, number, button); panel.append(row);', `row.append(owner, number, button);
      if(account.payUrl){const pay=new URL(account.payUrl);if(pay.protocol==='https:'&&pay.hostname==='qr.kakaopay.com'){const link=document.createElement('a');link.href=pay.href;link.textContent='카카오페이로 마음 전하기 ↗';link.target='_blank';link.rel='noopener';row.append(link);}}
      panel.append(row);`);
  await writeFile(path.join(published, 'js/guest-features.mjs'), guest);
  let html = await readFile(path.join(staging, 'lab/studio/preview/index.html'), 'utf8');
  html = html.replaceAll('../css/', '/published/css/').replaceAll('../js/', '/published/js/').replaceAll('../assets/', '/published/assets/');
  html = html.replaceAll('https://sungso-wedding.vercel.app/lab/studio/preview/', config.canonicalRoot);
  html = html.replace("connect-src 'self'", "connect-src 'self' https://sungso-homehunt-api.onrender.com");
  html = html.replace('<script src="/published/js/intro-boot.js">', '<!--PUBLICATION--><script src="/published/js/intro-boot.js">');
  html = html.replace('data-mode="demo"', 'data-mode="published"').replaceAll('VER6.1 조립 시안', '모바일 청첩장').replaceAll('우리의 조합', '우리의 결혼식').replace('VER6.1 STUDIO · 조합 미리보기', 'SUNGWOO &amp; SOHEE');
  html = html.replace(/<a[^>]*class="lab-return"[\s\S]*?<\/a>/, '').replaceAll('예시 계좌', '계좌').replaceAll('체험 방명록', '축하의 편지');
  html = html.replace(/<p class="demo-note">[\s\S]*?<\/p>/g, '').replace('축하의 편지 · 이 시안과 이 기기에만 저장됩니다.', '이름과 축하 메시지는 모든 하객에게 공개됩니다.').replace('이 시안에 남긴 체험 메시지만 삭제됩니다.', '이 기기에서 남긴 축하 메시지를 삭제합니다.');
  await writeFile(path.join(fn, 'published.html'), html);
  await writeFile(path.join(fn, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: 'gateway.mjs', launcherType: 'Nodejs', maxDuration: 60, regions: ['sin1'] }));
  await writeFile(path.join(base, 'config.json'), JSON.stringify({ version: 3, routes: [
    { src: '/(?:index\\.html)?', dest: '/gateway' },
    { src: '/lab(?:/.*)?', dest: '/gateway' },
    { src: '/api/studio/.*', dest: '/gateway' },
    { src: '/(.*)', headers: { 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'strict-origin-when-cross-origin' }, continue: true },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/404.html', status: 404 },
  ] }, null, 2));
  const publicFiles = await listFiles(staticDir);
  if (publicFiles.some(f => /^(?:lab|homehunt|wecost|honeymoon|wedding|sohee|services)\//.test(f))) throw Error('Private/other app leaked into public output');
  await writeFile(path.join(output, 'vercel.json'), JSON.stringify({ framework: null }));
  return { output, publicFiles: publicFiles.length, protectedFiles: privateFiles.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(await buildConnectedInvitation({ ...(process.argv[2] ? { output: path.resolve(process.argv[2]) } : {}) }));
