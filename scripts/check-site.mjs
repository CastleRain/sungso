import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { init, parse } from 'es-module-lexer';
import { PROJECT_ROOT, loadRegistry } from './build-site.mjs';

export async function listFiles(directory) {
  const result = [];
  async function walk(relative = '') {
    for (const item of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      const filename = path.posix.join(relative, item.name);
      if (item.isDirectory()) await walk(filename);
      else if (item.isFile()) result.push(filename);
    }
  }
  await walk();
  return result.sort();
}

function localTarget(value, document, prefix = '/sungso/') {
  if (!value || value.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return null;
  const url = new URL(value.replaceAll('&amp;', '&'), `https://site.invalid${prefix}${document}`);
  if (url.pathname === prefix.slice(0, -1)) return 'index.html';
  if (!url.pathname.startsWith(prefix)) throw new Error(`${document}: URL leaves the site prefix: ${value}`);
  let target = decodeURIComponent(url.pathname.slice(prefix.length));
  if (!target || target.endsWith('/')) target += 'index.html';
  return target;
}

export async function checkSite({ rootDir = PROJECT_ROOT, distDir = path.join(rootDir, 'dist'), registry } = {}) {
  registry ||= await loadRegistry(rootDir);
  const files = await listFiles(distDir);
  const fileSet = new Set(files);
  let references = 0;
  let dynamicImports = 0;
  await init;
  function verify(value, base) {
    const target = localTarget(value, base);
    if (!target) return;
    references++;
    if (!fileSet.has(target) && !fileSet.has(`${target}/index.html`)) throw new Error(`${base}: Missing public URL ${value} (expected ${target})`);
  }
  for (const filename of files) {
    if (!/\.(?:html|css|js|mjs|md)$/.test(filename)) continue;
    const source = await readFile(path.join(distDir, filename), 'utf8');
    if (/\.(?:js|mjs)$/.test(filename)) {
      const [imports] = parse(source, filename);
      for (const entry of imports) {
        if (entry.d === -2) continue;
        if (entry.n === undefined) { dynamicImports++; continue; }
        verify(entry.n, filename);
      }
      // These are document-relative resources, not module-relative imports.
      const app = registry.apps.filter(entry => entry.output && filename.startsWith(`${entry.output}/`))
        .sort((a, b) => b.output.length - a.output.length)[0];
      const document = app ? `${app.output}/index.html` : 'index.html';
      for (const match of source.matchAll(/(['"])((?:\.\/)?data\/[^'"\n\\]+\.(?:json|pdf|png)(?:\?[^'"\n]*)?)\1/g)) verify(match[2], document);
    } else if (filename.endsWith('.html')) {
      // Keep opening tags, but do not mistake JavaScript templates for HTML resources.
      const markup = source.replace(/<(script|style)\b([^>]*)>[\s\S]*?<\/\1\s*>/gi, '<$1$2></$1>');
      for (const tag of markup.matchAll(/<(?:script|link|a|img|iframe|source|video|audio|embed|object)\b[^>]*>/gi)) {
        for (const attribute of tag[0].matchAll(/\b(?:src|href|poster|data)\s*=\s*(['"])(.*?)\1/gi)) verify(attribute[2], filename);
      }
    } else if (filename.endsWith('.md')) {
      for (const match of source.replace(/```[\s\S]*?```/g, '').matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) verify(match[1], filename);
    } else {
      for (const match of source.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) verify(match[2], filename);
    }
  }
  for (const app of registry.apps) await access(path.join(distDir, app.output, 'index.html'));
  return { files: files.length, references, dynamicImports };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await checkSite();
  console.log(`Verified ${result.references} local references in ${result.files} public files; ${result.dynamicImports} dynamic CDN expressions retained.`);
}
