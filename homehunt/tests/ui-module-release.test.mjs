import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const app = await readFile(new URL('js/app.js', root), 'utf8');
const config = await readFile(new URL('js/config.js', root), 'utf8');
const release = config.match(/uiVersion:\s*['"]([^'"]+)['"]/)[1];
const importRows = [...app.matchAll(/import\s*\{([^}]+)\}\s*from\s*(['"])([^'"]+)\2/g)]
  .map(match => ({ statement: match[0], names: match[1].split(',').map(name => name.trim()).filter(Boolean), path: match[3] }));
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

test('visible UI release, module entry points and configuration import stay on one release', () => {
  assert.equal(html.match(/data-ui-version=['"]([^'"]+)/)[1], release);
  for (const name of ['app', 'ui-shell']) {
    const entry = html.match(new RegExp(`<script[^>]+src=['"]([^'"]*/${name}\\.js[^'"]*)['"]`));
    assert.ok(entry, `The ${name} module entry is present`);
    assert.equal(new URL(entry[1], root).searchParams.get('v'), release);
  }
  const configImport = importRows.find(row => row.names.includes('APP_CONFIG'));
  assert.equal(new URL(configImport.path, new URL('js/app.js', root)).searchParams.get('v'), release);
});

test('the new evidenceTierMeta named import cannot reuse the previously cached formatter URL', async () => {
  const formatter = importRows.find(row => row.names.includes('evidenceTierMeta'));
  assert.ok(formatter, 'The actual app imports the shared provisional evidence renderer');
  const url = new URL(formatter.path, new URL('js/app.js', root));
  assert.equal(url.searchParams.get('v'), release,
    'A new named export must ship under the current release URL, not the earlier cached ui-format URL');
  assert.equal(url.pathname.split('/').at(-1), 'ui-format.js');
  const linked = await import(dataModule(formatter.statement.replace(formatter.path, url.href)
    + '\nexport const initialized = typeof evidenceTierMeta === "function";'));
  assert.equal(linked.initialized, true, 'The actual named imports link before application initialization');
});

test('the retry price helper import links to the real module exports under the current release', async () => {
  const helpers = importRows.find(row => row.names.includes('mergeRetriedPriceResults'));
  assert.ok(helpers);
  const url = new URL(helpers.path, new URL('js/app.js', root));
  assert.equal(url.searchParams.get('v'), release);
  const linked = await import(dataModule(helpers.statement.replace(helpers.path, url.href)
    + '\nexport const initialized = typeof priceCoverageLabel === "function" && typeof mergeRetriedPriceResults === "function";'));
  assert.equal(linked.initialized, true);
});

test('the quick filter controller links under the same UI release before click binding', async () => {
  const controller = importRows.find(row => row.names.includes('createRecommendationQuickFilters'));
  assert.ok(controller);
  const url = new URL(controller.path, new URL('js/app.js', root));
  assert.equal(url.searchParams.get('v'), release);
  const linked = await import(dataModule(controller.statement.replace(controller.path, url.href)
    + '\nexport const initialized = typeof createRecommendationQuickFilters === "function";'));
  assert.equal(linked.initialized, true);
});

test('an old cached formatter lacking the new export prevents module initialization instead of just disabling one badge', async () => {
  const formatter = importRows.find(row => row.names.includes('evidenceTierMeta'));
  const oldFormatter = dataModule('export const EVIDENCE_TIERS = {}; export function createEvidenceViewModel() {} export function renderValueText() {}');
  const oldImporter = dataModule(formatter.statement.replace(formatter.path, oldFormatter)
    + '\nexport const initialized = true;');
  await assert.rejects(import(oldImporter), error => error instanceof SyntaxError
    && /does not provide an export named ['"]evidenceTierMeta['"]/.test(error.message));
});
