import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_ROOT, createFilePlan, loadRegistry } from '../../scripts/build-site.mjs';

test('production registry preserves existing entrypoints and adds invitation without losing historical routes', async () => {
  const registry = await loadRegistry();
  const { files } = await createFilePlan({ registry });
  assert.deepEqual(registry.apps.map(app => app.output), ['', 'wecost', 'honeymoon', 'homehunt', 'travel', 'invitation']);
  for (const pathname of ['index.html', 'wecost/index.html', 'honeymoon/index.html', 'homehunt/index.html', 'travel/index.html', 'invitation/index.html',
    'homehunt/data/apartment-catalog.json', 'homehunt/data/rail-stations.json', 'honeymoon/maldives_report.html',
    'honeymoon/data/maldives_resorts_data.xml', 'wecost/backup/index.html', 'wecost/_reference/결혼비용_템플릿.csv']) {
    assert.ok(files.has(pathname), `Missing historical URL: ${pathname}`);
  }
  assert.equal([...files.keys()].filter(filename => filename.endsWith('.pdf')).length, 10);
});

test('only named compatibility exceptions publish documentation or archive content', async () => {
  const registry = await loadRegistry();
  const exceptions = new Set(registry.compatibility.files.map(file => file.output));
  const { files } = await createFilePlan({ registry });
  for (const [output, entry] of files) {
    assert.ok(!/^(?:services|apps|archive|config|tests)\//.test(output), output);
    assert.ok(!/(?:^|\/)(?:node_modules|\.local|\.env|server|scripts|state|tests)(?:\/|$)/.test(output), output);
    assert.ok(!/(?:AGENTS|CLAUDE|README)\.md$|package(?:-lock)?\.json$/.test(output), output);
    if (entry.source?.startsWith('archive/') || output.includes('/docs/') || output.endsWith('.md')) assert.ok(exceptions.has(output), output);
  }
});

test('moved sources keep their original public module URLs without wrappers or duplicate outputs', async () => {
  const registry = await loadRegistry();
  const { files, sourceOutputs } = await createFilePlan({ registry });
  for (const [source, output] of [
    ['shared/homehunt/cloud-snapshot-core.mjs', 'homehunt/js/cloud-snapshot-core.mjs'],
    ['shared/finance/home-target-price.mjs', 'shared/home-target-price.mjs'],
    ['shared/travel/trip-store.mjs', 'shared/trip-store.mjs'],
    ['apps/travel/decision-panel.mjs', 'shared/decision-panel.mjs'],
    ['apps/travel/decision-panel.css', 'shared/decision-panel.css'],
  ]) {
    assert.equal(sourceOutputs.get(path.join(PROJECT_ROOT, source)), output);
    assert.equal(files.get(output).source, source);
    assert.equal(files.get(output).compatibility, false);
  }
  assert.ok(![...files.keys()].some(file => /^shared\/(?:homehunt|travel|finance)\//.test(file)));
  assert.ok(!files.has('travel/decision-panel.mjs'));
});

test('only Travel loads the decision panel and its site root remains output-relative', async () => {
  for (const id of ['hub', 'wecost', 'honeymoon', 'homehunt', 'travel', 'invitation']) {
    const html = await readFile(path.join(PROJECT_ROOT, 'apps', id, 'index.html'), 'utf8');
    assert.equal(html.includes('decision-panel'), id === 'travel', id);
  }
  const panel = await readFile(path.join(PROJECT_ROOT, 'apps/travel/decision-panel.mjs'), 'utf8');
  assert.match(panel, /new URL\(['"]\.\.\/['"], import\.meta\.url\)/);
});
