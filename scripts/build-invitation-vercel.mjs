import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { init, parse } from 'es-module-lexer';
import { buildSite, PROJECT_ROOT } from './build-site.mjs';
import { listFiles } from './check-site.mjs';

export const INVITATION_ORIGIN = 'https://sungso-wedding.vercel.app';
export const INVITATION_DIST = path.join(PROJECT_ROOT, 'deploy/invitation/dist');
const SOURCE = 'apps/invitation-v5';
const OLD_URL = 'https://castlerain.github.io/sungso/invitation-v5/';
const V6_SOURCE = 'apps/invitation-v6';
const V6_OLD_URL = 'https://castlerain.github.io/sungso/invitation-v6/';
const SHARED_FILES = [
  'firebase/site-auth.mjs', 'firebase/auth-core.mjs', 'firebase/config.mjs',
  'invitation/album-core.mjs', 'invitation/account-core.mjs',
  'theme/brand.css', 'theme/reading-font.css', 'theme/fonts/PretendardVariable.woff2',
  'theme/fonts/Pretendard-LICENSE.txt',
];

async function editionFiles(sourceRoot) {
  const files = new Set(['index.html', 'map.html', 'wedding.ics', 'manage.html', 'accounts.html',
    'css/typography.css', 'css/style.css', 'css/accounts.css', 'css/manage.css', 'js/intro-boot.js']);
  if (sourceRoot === V6_SOURCE) files.add('css/ver6.css');
  await init;
  async function addModule(relative) {
    if (files.has(relative)) return;
    files.add(relative);
    const source = await readFile(path.join(PROJECT_ROOT, sourceRoot, relative), 'utf8');
    for (const item of parse(source)[0]) {
      if (!item.n || /^https?:/.test(item.n)) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), item.n.split(/[?#]/)[0]));
      if (target.startsWith('../')) {
        const shared = path.posix.normalize(path.posix.join(sourceRoot, target));
        if (!SHARED_FILES.some(file => shared === `shared/${file}`)) throw Error(`Unapproved shared dependency: ${shared}`);
      } else await addModule(target);
    }
  }
  for (const entry of ['js/app.mjs', 'js/manage.mjs', 'js/accounts-manage.mjs']) await addModule(entry);
  const runtimeText = (await Promise.all([...files].filter(file => /\.(html|css|js|mjs)$/.test(file))
    .map(file => readFile(path.join(PROJECT_ROOT, sourceRoot, file), 'utf8')))).join('\n')
    + await readFile(path.join(PROJECT_ROOT, 'shared/invitation/album-core.mjs'), 'utf8');
  // Only literal assets referenced by this release, including its six default album photos.
  for (const match of runtimeText.matchAll(/assets\/[\w./-]+\.(?:webp|jpg|png|svg|mp3|ttf|woff2)/g)) files.add(match[0]);
  for (const file of ['AnticDidone-OFL.txt', 'Pinyon-OFL.txt', 'RIDIBatang-OFL.txt', 'Hahmlet-OFL.txt']) files.add('assets/fonts/' + file);
  for (const file of ['assets/SOURCES.txt', 'assets/icons/LICENSE.txt', 'assets/icons/MAP-SOURCES.txt']) files.add(file);
  return [...files].sort();
}

export async function buildInvitation({ distDir = INVITATION_DIST } = {}) {
  // Keep VER5.6 at the original root. VER6 is a separate /v6/ edition.
  const version = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'docs/invitation-versions.json'), 'utf8')).latest;
  if (version.path !== SOURCE || version.deployment !== 'success') throw Error('The preserved VER5.6 release is required.');
  const editions = [
    { id: 'invitation-v5', source: SOURCE, output: '', files: await editionFiles(SOURCE) },
    { id: 'invitation-v6', source: V6_SOURCE, output: 'v6', files: await editionFiles(V6_SOURCE) },
  ];
  const registry = {
    apps: editions,
    shared: [
      { source: 'shared', output: 'shared', files: SHARED_FILES },
      { source: 'deploy/invitation', output: 'standalone', files: ['auth-boot.mjs', 'auth.css', '404.html'] },
    ],
  };
  const built = await buildSite({ distDir, registry });
  for (const file of built.files) {
    if (!/\.(html|mjs|js|ics|css)$/.test(file)) continue;
    let text = await readFile(path.join(distDir, file), 'utf8');
    text = text.replaceAll(OLD_URL, INVITATION_ORIGIN + '/');
    text = text.replaceAll(V6_OLD_URL, INVITATION_ORIGIN + '/v6/');
    // iCalendar requires CRLF even when a Linux checkout supplies LF text.
    if (file.endsWith('.ics')) text = text.replace(/\r?\n/g, '\r\n');
    const isV6 = file.startsWith('v6/');
    if (file.endsWith('.html') && !isV6) text = text.replaceAll('../shared/', './shared/');
    if (['accounts.html', 'manage.html', 'v6/accounts.html', 'v6/manage.html'].includes(file)) {
      const prefix = isV6 ? '../' : './';
      text = text.replace(prefix + 'shared/firebase/boot.mjs', prefix + 'standalone/auth-boot.mjs');
      text = text.replace('</head>', `<link rel="stylesheet" href="./css/typography.css?v=${isV6 ? '6.1.0' : '5.6.0'}"><link rel="stylesheet" href="${prefix}standalone/auth.css"></head>`);
      // RSVP is absent from the completed guest release; existing Pages history remains available separately.
      text = text.replace(/<br><a href="\.\/responses\.html">.*?<\/a>/, '');
    }
    // The unused shared return helper must also remain rooted on this site.
    if (file === 'shared/firebase/auth-core.mjs') text = text.replace("base = '/sungso/'", "base = '/'");
    await writeFile(path.join(distDir, file), text);
  }
  await cp(path.join(distDir, 'standalone/404.html'), path.join(distDir, '404.html'));
  await cp(path.join(PROJECT_ROOT, 'deploy/invitation/vercel.json'), path.join(distDir, 'vercel.json'));
  const result = await verifyInvitation(distDir);
  // The manifest stays outside the uploaded folder.
  await mkdir(path.join(PROJECT_ROOT, '.local'), { recursive: true });
  await writeFile(path.join(PROJECT_ROOT, '.local/invitation-vercel-manifest.json'),
    JSON.stringify({ version: version.version, sourceCommit: version.commit, separateEdition: '6.1.0', origin: INVITATION_ORIGIN, ...result }, null, 2) + '\n');
  return { distDir, ...result };
}

export async function verifyInvitation(distDir) {
  const files = await listFiles(distDir), allowed = new Set(files);
  const forbidden = /(?:^|\/)(?:homehunt(?:-v2)?|wecost|honeymoon|hub|sohee|travel|services|config|tests|archive|node_modules)(?:\/|$)/;
  for (const file of files) {
    if (forbidden.test(file) || file.split('/').some(part => part.startsWith('.') && file !== '.nojekyll')
      || /(?:AGENTS|README|package(?:-lock)?)\.(?:md|json)$/.test(file)) throw Error(`Forbidden output: ${file}`);
  }
  function verify(value, from) {
    if (!value || /^(?:#|[a-z][\w+.-]*:|\/\/)/i.test(value)) return;
    const url = new URL(value.replaceAll('&amp;', '&'), `${INVITATION_ORIGIN}/${from}`);
    const pathname = decodeURIComponent(url.pathname.slice(1));
    const target = !pathname ? 'index.html' : pathname.endsWith('/') ? pathname + 'index.html' : pathname;
    if (!allowed.has(target)) throw Error(`${from}: missing local resource ${value} -> ${target}`);
  }
  await init;
  for (const file of files) {
    if (!/\.(?:html|js|mjs|css|ics)$/.test(file)) continue;
    const source = await readFile(path.join(distDir, file), 'utf8');
    if (/https:\/\/castlerain\.github\.io|["'`]\/sungso\/|href=["'][^"']*(?:homehunt|wecost|honeymoon)/i.test(source)) throw Error(`Old site navigation in ${file}`);
    if (/\.(mjs|js)$/.test(file)) {
      for (const entry of parse(source)[0]) if (entry.d !== -2 && entry.n) verify(entry.n, file);
    } else if (file.endsWith('.html')) {
      const markup = source.replace(/<(script|style)\b([^>]*)>[\s\S]*?<\/\1\s*>/gi, '<$1$2></$1>');
      for (const tag of markup.matchAll(/<(?:script|link|a|img|iframe|source|audio)\b[^>]*>/gi))
        for (const attr of tag[0].matchAll(/\b(?:src|href|data-src)=["']([^"']+)["']/gi)) verify(attr[1], file);
    } else if (file.endsWith('.css')) {
      for (const match of source.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) verify(match[2], file);
    }
  }
  const configuration = JSON.parse(await readFile(path.join(distDir, 'vercel.json'), 'utf8'));
  if (configuration.rewrites || configuration.redirects || configuration.routes) throw Error('The isolated static deployment must not rewrite missing app paths.');
  if (!(await readFile(path.join(distDir, 'index.html'), 'utf8')).includes('data-version="5.6.0"')) throw Error('Unexpected release.');
  if (!(await readFile(path.join(distDir, 'v6/index.html'), 'utf8')).includes('data-version="6.1.0"')) throw Error('Unexpected separate edition.');
  return { fileCount: files.length, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await buildInvitation();
  console.log(`Invitation-only build: ${result.fileCount} files → ${result.distDir}`);
}
