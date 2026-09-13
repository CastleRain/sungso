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

test('처음 방문자를 위한 독립 안내 화면과 모든 핵심 화면 바로가기가 있다', async () => {
  const html = await read('index.html');
  assert.match(html, /id="view-guide"[^>]+data-view="guide"/);
  assert.match(html, /id="guideQuickStart"/);
  assert.match(html, /id="guideFeatures"/);
  assert.match(html, /id="guidePhoneAlerts"/);
  assert.match(html, /id="guideSubscriptionProfile"/);
  for (const view of ['recommend', 'map', 'visits', 'supply', 'market', 'connections']) {
    assert.match(html, new RegExp(`data-view-target="${view}"`));
  }
  assert.match(html, /css\/guide\.css\?v=2\.5\.0/);
});

test('청약 준비도는 로컬 저장 프로필과 비확률 원칙을 화면에 명시한다', async () => {
  const [html, app, storage] = await Promise.all([read('index.html'), read('js/app.js'), read('js/storage.js')]);
  assert.match(html, /id="subscriptionProfileForm"/);
  assert.match(html, /당첨 확률은 표시하지 않습니다/);
  assert.match(html, /배우자 통장 가점/);
  assert.match(app, /assessNewlywedReadiness/);
  assert.match(storage, /homehunt_subscription_profile_v1/);
  assert.match(storage, /clearSubscriptionProfile/);
});

test('휴대폰 알림 안내는 Telegram Secrets와 공개 DB 금지 원칙을 포함한다', async () => {
  const [html, readme, keys] = await Promise.all([read('index.html'), read('README.md'), read('docs/api-keys.md')]);
  for (const source of [html, readme, keys]) {
    assert.match(source, /TELEGRAM_BOT_TOKEN/);
    assert.match(source, /TELEGRAM_CHAT_ID/);
  }
  assert.match(html, /Firebase 인증·FCM/);
  assert.match(readme, /공개 Firestore/);
});
