import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const HOMEHUNT_DIR = path.resolve(TEST_DIR, '..');

async function read(relativePath) {
  return readFile(path.join(HOMEHUNT_DIR, relativePath), 'utf8');
}

test('supply screen, alert settings, and official application links remain wired', async () => {
  const html = await read('index.html');

  assert.match(html, /data-view-target="supply"/);
  assert.match(html, /id="view-supply"/);
  assert.match(html, /id="supplyAlertModal"/);
  assert.match(html, /data\/15098547\/openapi\.do/);
  assert.match(html, /data\/15058530\/openapi\.do/);
  assert.match(html, /i-sh\.co\.kr/);
  assert.match(html, /gh\.or\.kr\/gh\/announcement-of-salerental001\.do/);
  assert.match(html, /gh\.or\.kr\/gh\/saleslease-notification\.do/);
  assert.match(html, /css\/supply\.css\?v=2\.5\.0/);
  assert.match(html, /id="supplyMatchModal"/);
  assert.match(html, /id="supplyMatchDistricts"/);
  assert.match(html, /id="supplyMatchMinUnits"/);
});

test('public initial supply snapshot is empty, explicit, and covers all official providers', async () => {
  const snapshot = JSON.parse(await read('data/home-supply.json'));

  assert.equal(snapshot.complete, false);
  assert.deepEqual(snapshot.notices, []);
  assert.deepEqual(snapshot.sources.map(({ id }) => id).sort(), ['applyhome', 'lh', 'sh']);
  assert.equal(snapshot.baseline.suppressInitialNotifications, true);
  assert.deepEqual(snapshot.query.regions, ['서울', '경기']);
  assert.deepEqual(snapshot.query.exclusions, [{
    source: 'lh',
    providerTypeCode: '06',
    reason: '임대주택은 분양 목록에서 제외',
  }]);
});

test('local and hosted supply feeds use their intended endpoints', async () => {
  const config = await read('js/config.js');

  assert.match(config, /supplyStaticUrl:\s*'\.\/data\/home-supply\.json'/);
  assert.match(config, /supplyFeedUrl:\s*IS_LOCAL_RUNTIME\s*\?\s*`\$\{LOCAL_MARKET_API\}\/supply`/);
  assert.match(config, /appVersion:\s*'2\.5\.1'/);
});

test('scheduled collection refreshes branch-based GitHub Pages after data changes', async () => {
  const workflow = await readFile(
    path.resolve(HOMEHUNT_DIR, '../.github/workflows/update-homehunt-supply.yml'),
    'utf8',
  );

  assert.match(workflow, /cron:\s*["']17 3,9,22 \* \* \*["']/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /청약홈·LH·SH/);
  assert.match(workflow, /bySource\.sh/);
  assert.match(workflow, /changed=true/);
  assert.match(workflow, /repos\/\$\{GITHUB_REPOSITORY\}\/pages\/builds/);
});
