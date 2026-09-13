import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSite, createFilePlan, loadRegistry } from '../../scripts/build-site.mjs';
import { checkSite, listFiles } from '../../scripts/check-site.mjs';

async function fixture(t) {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'sungso-site-build-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  async function put(filename, content) {
    await mkdir(path.dirname(path.join(rootDir, filename)), { recursive: true });
    await writeFile(path.join(rootDir, filename), content);
  }
  const registry = {
    apps: [
      { id: 'hub', source: 'apps/hub', output: '', files: ['index.html', 'js'] },
      { id: 'sample', source: 'apps/sample', output: 'sample', files: ['index.html', 'js', 'data', 'style.css'] },
    ],
    shared: [{ source: 'shared/domain', output: 'shared', files: ['.'] }],
    compatibility: {
      files: [{ source: 'archive/report.html', output: 'sample/report.html' }],
    },
  };
  const state = 'export const token = {};\nexport class SharedError extends Error {}\nexport default token;\n';
  await put('config/apps.json', JSON.stringify(registry));
  await put('apps/hub/index.html', '<!doctype html><script>window.pin = "sync";</script><a href="./sample/">Sample</a><script type="module" src="./js/main.mjs"></script>');
  await put('apps/hub/js/main.mjs', "export { token } from '../../../shared/domain/state.mjs';\n");
  await put('apps/sample/index.html', '<!doctype html><link rel="stylesheet" href="style.css"><a href="../">Home</a><script type="module" src="js/main.mjs?v=1"></script>');
  await put('apps/sample/js/main.mjs', "import { token, SharedError } from '../../../shared/domain/state.mjs?version=4#part';\nexport { token, SharedError };\nexport const load = () => import('../../../shared/domain/state.mjs');\nconst resource = './data/items.json';\nconst self = import.meta.url;\n");
  await put('apps/sample/js/classic.js', '(function () { window.guard = true; })();\n');
  await put('apps/sample/style.css', '.sample { color: coral; }\n');
  await put('apps/sample/data/items.json', '{"items":[]}\n');
  await put('shared/domain/state.mjs', state);
  await put('shared/domain/README.md', 'Internal module guidance');
  await put('shared/domain/tests/private.test.mjs', 'throw new Error("not published");');
  await put('shared/domain/.env', 'PRIVATE=fixture-only');
  await put('archive/report.html', '<!doctype html><h1>Preserved report</h1>');
  await put('archive/private.html', 'Not an approved historical URL');
  await put('services/private.mjs', 'throw new Error("server-only");');
  return { rootDir, put, registry, distDir: path.join(rootDir, 'dist') };
}

test('maps source-relative static, re-export and dynamic imports while preserving query and ordinary strings', async t => {
  const f = await fixture(t);
  await buildSite(f);
  const hub = await readFile(path.join(f.distDir, 'js/main.mjs'), 'utf8');
  const app = await readFile(path.join(f.distDir, 'sample/js/main.mjs'), 'utf8');
  assert.match(hub, /from '\.\.\/shared\/state\.mjs'/);
  assert.match(app, /from '\.\.\/\.\.\/shared\/state\.mjs\?version=4#part'/);
  assert.match(app, /import\('\.\.\/\.\.\/shared\/state\.mjs'\)/);
  assert.match(app, /const resource = '\.\/data\/items\.json'/);
  assert.match(app, /const self = import\.meta\.url/);
  assert.equal(await readFile(path.join(f.distDir, 'sample/js/classic.js'), 'utf8'), '(function () { window.guard = true; })();\n');
  assert.ok((await checkSite(f)).references > 8);
});

test('preserves CDN imports, CDN expressions, comments and classic PIN script order byte-for-byte', async t => {
  const f = await fixture(t);
  const cdn = "import { sdk } from 'https://cdn.example/sdk.mjs?v=1';\nconst base = 'https://cdn.example/';\nconst load = () => import(`${base}sdk.mjs`);\n// import('../../../unrelated.mjs')\n";
  await f.put('apps/sample/js/cdn.mjs', cdn);
  await buildSite(f);
  assert.equal(await readFile(path.join(f.distDir, 'sample/js/cdn.mjs'), 'utf8'), cdn);
  assert.equal(await readFile(path.join(f.distDir, 'index.html'), 'utf8'), await readFile(path.join(f.rootDir, 'apps/hub/index.html'), 'utf8'));
  assert.equal((await checkSite(f)).dynamicImports, 1);
});

test('source modules remain directly importable by Node tests', async t => {
  const f = await fixture(t);
  const source = await import(pathToFileURL(path.join(f.rootDir, 'apps/hub/js/main.mjs')));
  const canonical = await import(pathToFileURL(path.join(f.rootDir, 'shared/domain/state.mjs')));
  assert.strictEqual(source.token, canonical.token);
});

test('new and cached consumers retain the exact same versioned public URL, state and error class', async t => {
  const f = await fixture(t);
  await buildSite(f);
  // Simulate an earlier consumer whose dependency still has its original public URL.
  await f.put('dist/sample/js/previous.mjs', "export { token, SharedError } from '../../shared/state.mjs?version=4#part';\n");
  const current = await import(pathToFileURL(path.join(f.distDir, 'sample/js/main.mjs')));
  const previous = await import(pathToFileURL(path.join(f.distDir, 'sample/js/previous.mjs')));
  const publicModule = await import(`${pathToFileURL(path.join(f.distDir, 'shared/state.mjs'))}?version=4#part`);
  assert.strictEqual(current.token, previous.token);
  assert.strictEqual(current.SharedError, previous.SharedError);
  assert.ok(new previous.SharedError('conflict') instanceof current.SharedError);
  assert.strictEqual(current.token, publicModule.default);
  assert.ok(!(await listFiles(f.distDir)).includes('shared/domain/state.mjs'));
});

test('copies only approved archive URLs and public runtime assets', async t => {
  const f = await fixture(t);
  await buildSite(f);
  const files = await listFiles(f.distDir);
  assert.ok(files.includes('sample/report.html'));
  assert.ok(files.includes('sample/data/items.json'));
  assert.ok(!files.some(file => /archive|private|README|tests|\.env/.test(file)));
  assert.ok(!files.includes('config/apps.json'));
});

test('repeated builds are deterministic and remove stale output', async t => {
  const f = await fixture(t);
  await buildSite(f);
  const firstFiles = await listFiles(f.distDir);
  const firstContents = await Promise.all(firstFiles.map(file => readFile(path.join(f.distDir, file), 'utf8')));
  await f.put('dist/old-file.js', 'stale');
  await buildSite(f);
  assert.deepEqual(await listFiles(f.distDir), firstFiles);
  assert.deepEqual(await Promise.all(firstFiles.map(file => readFile(path.join(f.distDir, file), 'utf8'))), firstContents);
});

test('missing module dependencies fail before replacing the previous build', async t => {
  const f = await fixture(t);
  await buildSite(f);
  const previous = await readFile(path.join(f.distDir, 'sample/js/main.mjs'), 'utf8');
  await f.put('apps/sample/js/main.mjs', "import './missing.mjs';\n");
  await assert.rejects(buildSite(f), /outside the public allowlist or missing/);
  assert.equal(await readFile(path.join(f.distDir, 'sample/js/main.mjs'), 'utf8'), previous);
});

test('browser imports cannot pull a service module into the public build', async t => {
  const f = await fixture(t);
  await f.put('apps/sample/js/main.mjs', "import '../../../services/private.mjs';\n");
  await assert.rejects(buildSite(f), /outside the public allowlist/);
});

test('new applications only need a registry entry and their source files', async t => {
  const f = await fixture(t);
  f.registry.apps.push({ id: 'next', source: 'apps/next', output: 'next', files: ['index.html'] });
  await f.put('apps/next/index.html', '<!doctype html><h1>Next app</h1>');
  const built = await buildSite(f);
  assert.ok(built.files.includes('next/index.html'));
  assert.equal(built.apps.length, 3);
});

test('registry rejects duplicate IDs, duplicate outputs and omitted entrypoints', async t => {
  const f = await fixture(t);
  for (const [entry, pattern] of [
    [{ ...f.registry.apps[0] }, /Duplicate or invalid app id/],
    [{ ...f.registry.apps[0], id: 'duplicate' }, /Duplicate app output/],
    [{ id: 'missing', source: 'apps/missing', output: 'missing', files: ['js'] }, /include index.html/],
  ]) {
    await f.put('config/apps.json', JSON.stringify({ ...f.registry, apps: [...f.registry.apps, entry] }));
    await assert.rejects(loadRegistry(f.rootDir), pattern);
  }
});

test('registry rejects collisions, source traversal and duplicate canonical module outputs', async t => {
  const f = await fixture(t);
  const collision = structuredClone(f.registry);
  collision.compatibility.files.push({ source: 'archive/report.html', output: 'sample/index.html' });
  await assert.rejects(createFilePlan({ ...f, registry: collision }), /same output/);
  const traversal = structuredClone(f.registry);
  traversal.apps[0].files.push('../../../outside.html');
  await assert.rejects(createFilePlan({ ...f, registry: traversal }), /repository-relative/);
  const duplicate = structuredClone(f.registry);
  duplicate.shared.push({ source: 'shared/domain', output: 'shared/duplicate', files: ['.'] });
  await assert.rejects(createFilePlan({ ...f, registry: duplicate }), /one canonical output/);
});

test('does not publish symlinks or overwrite source directories', async t => {
  const f = await fixture(t);
  if (process.platform === 'win32') {
    // A junction exercises the same no-link boundary without requiring the
    // Windows privilege needed to create file symlinks.
    await symlink(path.join(f.rootDir, 'services'), path.join(f.rootDir, 'apps/sample/js/link'), 'junction');
  } else {
    await symlink(path.join(f.rootDir, 'services/private.mjs'), path.join(f.rootDir, 'apps/sample/js/link.mjs'));
  }
  await assert.rejects(buildSite(f), /Symlinks cannot be published/);
  await assert.rejects(buildSite({ ...f, distDir: path.join(f.rootDir, 'apps') }), /dedicated dist/);
});

test('output checker catches broken document-relative data paths and CSS imports', async t => {
  const f = await fixture(t);
  await buildSite(f);
  await f.put('dist/sample/js/missing.mjs', "const url = './data/missing.json';");
  await assert.rejects(checkSite(f), /Missing public URL.*data\/missing.json/);
  await rm(path.join(f.distDir, 'sample/js/missing.mjs'));
  await f.put('dist/sample/style.css', '@import url("missing.css");');
  await assert.rejects(checkSite(f), /Missing public URL.*missing.css/);
});
