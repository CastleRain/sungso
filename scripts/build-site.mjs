import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { init, parse } from 'es-module-lexer';

export const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const WEB_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.xml', '.csv', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.pdf', '.woff', '.woff2', '.webmanifest']);
const PRIVATE_PARTS = new Set(['node_modules', 'tests', 'docs', 'server', 'scripts', 'cloud', 'render', 'state', 'archive']);

function relativePath(value, label, { empty = false } = {}) {
  if (typeof value !== 'string' || (!value && !empty) || value.includes('\\') || value.startsWith('/')
      || value.split('/').some(part => part === '..' || (part === '.' && value !== '.')) || /[?#\0]/.test(value)) {
    throw new Error(`${label} must be a repository-relative path: ${String(value)}`);
  }
  return value === '.' ? '' : value.replace(/\/$/, '');
}

function publicPath(value, label, { allowDocs = false } = {}) {
  const result = relativePath(value, label);
  if (result.split('/').some(part => part.startsWith('.') || PRIVATE_PARTS.has(part) && !(allowDocs && part === 'docs'))
      || /(?:^|\/)(?:AGENTS|CLAUDE|README)\.md$|(?:^|\/)(?:package(?:-lock)?\.json|automation\.toml)$/.test(result)
      || /\.(?:test|spec)\.[cm]?js$/.test(result)) {
    throw new Error(`${label} is not a public runtime path: ${value}`);
  }
  return result;
}

function outputRelative(from, to) {
  const relative = path.posix.relative(path.posix.dirname(from), to);
  return relative.startsWith('.') ? relative : `./${relative}`;
}

export async function loadRegistry(rootDir = PROJECT_ROOT, registryFile = 'config/apps.json') {
  const registry = JSON.parse(await readFile(path.join(rootDir, registryFile), 'utf8'));
  if (!Array.isArray(registry.apps) || !registry.apps.length || !Array.isArray(registry.shared)) {
    throw new Error('The app registry requires apps and shared arrays.');
  }
  const ids = new Set();
  const destinations = new Set();
  for (const app of registry.apps) {
    if (!/^[a-z][a-z0-9-]*$/.test(app.id) || ids.has(app.id)) throw new Error(`Duplicate or invalid app id: ${app.id}`);
    ids.add(app.id);
    relativePath(app.source, `App ${app.id} source`);
    const output = relativePath(app.output, `App ${app.id} output`, { empty: true });
    if (destinations.has(output)) throw new Error(`Duplicate app output: ${output || '/'}`);
    destinations.add(output);
    if (!Array.isArray(app.files) || !app.files.includes('index.html')) throw new Error(`App ${app.id} must explicitly include index.html.`);
  }
  return registry;
}

/** The registry is an allowlist; discovery never scans the repository root. */
export async function createFilePlan({ rootDir = PROJECT_ROOT, registry } = {}) {
  registry ||= await loadRegistry(rootDir);
  const files = new Map();
  const sourceOutputs = new Map();
  async function add(source, output, { explicitCompatibility = false } = {}) {
    relativePath(source, 'Source');
    publicPath(output, 'Output', { allowDocs: explicitCompatibility });
    if (files.has(output)) throw new Error(`Two entries publish the same output: ${output}`);
    const absolute = path.resolve(rootDir, source);
    const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Public source must be a regular file: ${source}`);
    if (!explicitCompatibility && !WEB_EXTENSIONS.has(path.extname(source).toLowerCase())) return;
    files.set(output, { source, output, compatibility: explicitCompatibility });
    if (!explicitCompatibility) {
      if (sourceOutputs.has(absolute)) throw new Error(`A runtime module needs one canonical output: ${source}`);
      sourceOutputs.set(absolute, output);
    }
  }
  async function walk(source, output) {
    const absolute = path.join(rootDir, source);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`Symlinks cannot be published: ${source}`);
    if (info.isFile()) return add(source, output);
    if (!info.isDirectory()) throw new Error(`Unsupported public source: ${source}`);
    for (const item of (await readdir(absolute, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (item.name.startsWith('.') || PRIVATE_PARTS.has(item.name) || /\.(?:test|spec)\.[cm]?js$/.test(item.name)) continue;
      if (item.isFile() && !WEB_EXTENSIONS.has(path.extname(item.name).toLowerCase())) continue;
      await walk(path.posix.join(source, item.name), path.posix.join(output, item.name));
    }
  }
  for (const entry of [...registry.apps, ...registry.shared]) {
    const source = relativePath(entry.source, 'Source root');
    const output = relativePath(entry.output, 'Output root', { empty: true });
    if (!Array.isArray(entry.files) || !entry.files.length) throw new Error(`An explicit file allowlist is required: ${source}`);
    for (const selector of entry.files) {
      relativePath(selector, 'Public file selector');
      await walk(path.posix.join(source, selector), path.posix.join(output, selector));
    }
  }
  for (const entry of registry.compatibility?.files || []) await add(entry.source, entry.output, { explicitCompatibility: true });
  return { files, sourceOutputs };
}

/** Rewrite only parsed module specifiers. CDN URLs, ordinary strings and import.meta stay intact. */
export async function rewriteModuleImports(source, { sourceFile, outputFile, sourceOutputs }) {
  await init;
  const [imports] = parse(source, sourceFile);
  const edits = [];
  for (const entry of imports) {
    if (entry.d === -2 || entry.n === undefined) continue;
    const specifier = entry.n;
    if (/^(?:https?:|data:|blob:)/.test(specifier)) continue;
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
      throw new Error(`Browser import must be relative or a CDN URL: ${sourceFile}: ${specifier}`);
    }
    const split = specifier.search(/[?#]/);
    const pathname = split < 0 ? specifier : specifier.slice(0, split);
    const suffix = split < 0 ? '' : specifier.slice(split);
    const target = sourceOutputs.get(path.resolve(path.dirname(sourceFile), decodeURIComponent(pathname)));
    if (!target) throw new Error(`Import is outside the public allowlist or missing: ${sourceFile}: ${specifier}`);
    const replacement = outputRelative(outputFile, target).split('/').map(part => encodeURI(part)).join('/') + suffix;
    if (replacement === specifier) continue;
    // Static positions exclude quotes; dynamic string-import positions include them.
    const dynamic = entry.d >= 0;
    const quote = dynamic ? source[entry.s] : source[entry.s - 1];
    const escaped = replacement.replaceAll('\\', '\\\\').replaceAll(quote, `\\${quote}`);
    edits.push({ start: entry.s, end: entry.e, value: dynamic ? `${quote}${escaped}${quote}` : escaped });
  }
  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
  return result;
}

export async function buildSite({ rootDir = PROJECT_ROOT, distDir = path.join(rootDir, 'dist'), registry } = {}) {
  rootDir = path.resolve(rootDir);
  distDir = path.resolve(distDir);
  // This command owns only a directory named dist; do not accept source directories.
  if (path.basename(distDir) !== 'dist' || distDir === rootDir || rootDir.startsWith(`${distDir}${path.sep}`)) {
    throw new Error('The site builder only replaces its dedicated dist directory.');
  }
  registry ||= await loadRegistry(rootDir);
  const { files, sourceOutputs } = await createFilePlan({ rootDir, registry });
  const prepared = new Map();
  // Resolve and validate every module before replacing the previous build.
  for (const [output, entry] of files) {
    if (!entry.compatibility && /\.(?:js|mjs)$/.test(output)) {
      prepared.set(output, await rewriteModuleImports(await readFile(path.join(rootDir, entry.source), 'utf8'), {
        sourceFile: path.resolve(rootDir, entry.source), outputFile: output, sourceOutputs,
      }));
    }
  }
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  for (const [output, entry] of [...files].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const destination = path.join(distDir, output);
    await mkdir(path.dirname(destination), { recursive: true });
    if (prepared.has(output)) await writeFile(destination, prepared.get(output));
    else await cp(path.join(rootDir, entry.source), destination);
  }
  await writeFile(path.join(distDir, '.nojekyll'), '');
  return { distDir, files: [...files.keys()].sort(), apps: registry.apps.map(app => ({ id: app.id, output: app.output })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await buildSite();
  console.log(`Built ${result.apps.length} apps and ${result.files.length} public files in ${result.distDir}`);
}
