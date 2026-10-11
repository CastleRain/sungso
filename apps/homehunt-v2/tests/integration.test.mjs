import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFilePlan, loadRegistry } from '../../../scripts/build-site.mjs';

test('two HomeHunt versions keep separate entries and one shared store URL', async () => {
  const { files } = await createFilePlan({ registry: await loadRegistry() });
  assert.equal(files.get('homehunt/index.html').source, 'apps/homehunt/index.html');
  assert.equal(files.get('homehunt-v2/index.html').source, 'apps/homehunt-v2/index.html');
  assert.equal(files.get('homehunt/js/homehunt-version-store.mjs').source, 'shared/homehunt/homehunt-version-store.mjs');
  for (const file of ['manifest','forecasts','backtest','availability','market-prices']) {
    assert.ok(files.has(`homehunt-v2/data/${file}.json`));
  }
  assert.ok(!files.has('homehunt-v2/research/pipeline.py'));
  assert.ok(!files.has('homehunt-v2/docs/model-report.md'));
  assert.ok(!files.has('homehunt-v2/js/services.test.mjs'));
  assert.ok(![...files.keys()].some(file => file.includes('.local') || file.includes('__pycache__')));
});

test('public research files contain neither individual records nor household settings', async () => {
  const forbidden = new Set(['uid','email','token','serviceKey','clientSecret','workplaces','destinations',
    'parkingObservations','supplyFavorites','availableCashWon','monthlyPaymentLimit']);
  function inspect(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(inspect);
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!forbidden.has(key), `Private research key: ${key}`); inspect(child);
    }
  }
  for (const file of ['manifest','forecasts','backtest','availability','analysis-targets','market-prices','update-status']) {
    inspect(JSON.parse(await readFile(new URL(`../data/${file}.json`, import.meta.url), 'utf8')));
  }
});
