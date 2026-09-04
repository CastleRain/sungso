import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  HOMEHUNT_SUPPLY_URL,
  LEDGER_ENTRY_LIMIT,
  TELEGRAM_API_ORIGIN,
  TELEGRAM_MESSAGE_COUNT_LIMIT,
  TELEGRAM_MESSAGE_LIMIT,
  appendLedgerEntries,
  collectEligibleAlerts,
  describeAlertPreferences,
  importantChangedFields,
  normalizeLedger,
  noticeAlertKey,
  officialNoticeUrl,
  packAlertMessages,
  parseAlertPreferences,
  runSupplyTelegram,
  sendTelegramMessage,
} from '../scripts/send-supply-telegram.mjs';

const TOKEN = `123456:${'safe_test_token_'.repeat(3)}`;
const CHAT_ID = '-1001234567890';

function notice(id, overrides = {}) {
  const source = overrides.source || 'applyhome';
  const sourceUrls = {
    applyhome: 'https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?id=1',
    lh: 'https://apply.lh.or.kr/notice?PAN_ID=1',
    sh: 'https://www.i-sh.co.kr/app/notice/view.do?seq=1',
  };
  return {
    id,
    source,
    sourceLabel: source,
    name: `분양 공고 ${id}`,
    regionName: source === 'lh' ? '경기' : '서울',
    district: '송파구',
    locations: [{
      regionKey: source === 'lh' ? 'gyeonggi' : 'seoul',
      sidoCode: source === 'lh' ? '41' : '11',
      sido: source === 'lh' ? '경기도' : '서울특별시',
      district: '송파구',
      address: source === 'lh' ? '경기도 송파구 테스트로 1' : '서울특별시 송파구 테스트로 1',
    }],
    categoryLabel: 'APT 분양',
    noticeDate: '2026-09-04',
    schedule: { applyStart: '2026-09-10', applyEnd: '2026-09-12' },
    eligibilityTags: ['신혼부부 특별공급'],
    newlywedSupplyAvailable: true,
    totalUnits: 600,
    maxPriceManWon: 55_000,
    homes: [{ areaM2: 84.9 }],
    notificationEligible: true,
    dataStatus: 'fresh',
    stale: false,
    officialUrl: sourceUrls[source],
    fingerprint: 'a'.repeat(64),
    ...overrides,
  };
}

function snapshot(notices, changes = {}) {
  return {
    version: 1,
    generatedAt: '2026-09-04T03:00:00.000Z',
    notices,
    changes: {
      baselineRun: false,
      suppressedSources: [],
      new: [],
      updated: [],
      removed: [],
      expiredFromWindow: [],
      ...changes,
    },
  };
}

function telegramResponse(status = 200, body = { ok: true }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function memoryOutput() {
  let text = '';
  return {
    stream: { write(value) { text += String(value); } },
    read() { return text; },
  };
}

test('최초 baseline은 changes에 값이 있어도 전부 알림 억제한다', () => {
  const current = notice('applyhome:apt:H-1:P-1');
  const data = snapshot([current], {
    baselineRun: true,
    new: [{ id: current.id, source: current.source }],
  });
  assert.deepEqual(collectEligibleAlerts(data), []);
});

test('신규와 중요한 변경만 원본 공고 상태·공급원 기준선·공식 URL을 다시 확인한다', () => {
  const fresh = notice('applyhome:apt:H-1:P-1');
  const important = notice('lh:important', { source: 'lh', fingerprint: 'b'.repeat(64) });
  const cosmetic = notice('lh:cosmetic', { source: 'lh', fingerprint: 'c'.repeat(64) });
  const stale = notice('applyhome:apt:stale', { stale: true, dataStatus: 'stale', fingerprint: 'd'.repeat(64) });
  const ineligible = notice('sh:ineligible', { source: 'sh', notificationEligible: false, fingerprint: 'e'.repeat(64) });
  const suppressed = notice('sh:suppressed', { source: 'sh', fingerprint: 'f'.repeat(64) });
  const phishing = notice('applyhome:apt:evil', {
    officialUrl: 'https://www.applyhome.co.kr.evil.example/phish',
    fingerprint: '1'.repeat(64),
  });
  const removed = notice('applyhome:apt:removed', { fingerprint: '2'.repeat(64) });
  const data = snapshot([
    fresh,
    important,
    cosmetic,
    stale,
    ineligible,
    suppressed,
    phishing,
    removed,
  ], {
    suppressedSources: ['sh'],
    new: [fresh, stale, ineligible, suppressed, phishing].map(({ id, source }) => ({ id, source })),
    updated: [
      { id: important.id, source: important.source, changedFields: ['schedule', 'summary'] },
      { id: cosmetic.id, source: cosmetic.source, changedFields: ['summary', 'builder'] },
    ],
    removed: [{ id: removed.id, source: removed.source }],
  });

  const alerts = collectEligibleAlerts(data);
  assert.deepEqual(alerts.map(({ kind, notice: value }) => [kind, value.id]), [
    ['new', fresh.id],
    ['updated', important.id],
  ]);
  assert.deepEqual(alerts[1].changedFields, ['schedule']);
});

test('공식 링크는 HTTPS·무인증정보·정확한 기관 hostname만 허용한다', () => {
  assert.match(officialNoticeUrl('applyhome', 'https://www.applyhome.co.kr/path#fragment'), /^https:\/\/www\.applyhome\.co\.kr\/path$/);
  assert.match(officialNoticeUrl('lh', 'https://apply.lh.or.kr/notice?id=1'), /^https:\/\/apply\.lh\.or\.kr\/notice/);
  assert.match(officialNoticeUrl('sh', 'https://www.i-sh.co.kr/app/'), /^https:\/\/www\.i-sh\.co\.kr\/app\/$/);
  assert.equal(officialNoticeUrl('applyhome', 'http://www.applyhome.co.kr/path'), '');
  assert.equal(officialNoticeUrl('applyhome', 'https://www.applyhome.co.kr.evil.example/path'), '');
  assert.equal(officialNoticeUrl('applyhome', 'https://user:pass@www.applyhome.co.kr/path'), '');
  assert.equal(officialNoticeUrl('sh', 'https://www.i-sh.co.kr:444/app/'), '');
  assert.equal(officialNoticeUrl('unknown', 'https://www.applyhome.co.kr/path'), '');
});

test('중요 변경 필드만 선별하고 같은 공고 fingerprint는 ledger로 중복 억제한다', () => {
  const current = notice('applyhome:apt:H-1:P-1');
  assert.deepEqual(importantChangedFields({
    changedFields: ['summary', 'applyEnd', 'models', 'summary', 'builder'],
  }), ['applyEnd', 'models']);

  const key = noticeAlertKey('new', current);
  assert.match(key, /^[a-f0-9]{64}$/);
  const data = snapshot([current], { new: [{ id: current.id, source: current.source }] });
  assert.equal(collectEligibleAlerts(data, { schemaVersion: 1, sent: [key] }).length, 0);
  assert.notEqual(noticeAlertKey('updated', current), key);
});

test('Repository Variables 기본값과 억·평 단위 조건을 화면 필터 계약으로 변환한다', () => {
  const defaults = parseAlertPreferences({});
  assert.deepEqual(defaults.preferences, {
    regions: ['서울', '경기'],
    districts: [],
    newlywedOnly: false,
    maxPriceManWon: null,
    minAreaM2: null,
    maxAreaM2: null,
    minSupplyUnits: null,
    includeUnknownPrice: true,
    includeUnknownArea: true,
    includeUnknownUnits: true,
    excludeClosed: true,
  });
  assert.deepEqual(defaults.warnings, []);

  const parsed = parseAlertPreferences({
    HOMEHUNT_ALERT_REGIONS: '서울, 경기',
    HOMEHUNT_ALERT_DISTRICTS: '강남구, 성남시 분당구,강남구',
    HOMEHUNT_ALERT_NEWLYWED_ONLY: 'true',
    HOMEHUNT_ALERT_MAX_PRICE_EOK: '6.5',
    HOMEHUNT_ALERT_MIN_PYEONG: '20',
    HOMEHUNT_ALERT_MAX_PYEONG: '30.5',
    HOMEHUNT_ALERT_MIN_UNITS: '500',
    HOMEHUNT_ALERT_INCLUDE_UNKNOWN_PRICE: 'false',
    HOMEHUNT_ALERT_INCLUDE_UNKNOWN_AREA: '0',
    HOMEHUNT_ALERT_INCLUDE_UNKNOWN_UNITS: 'no',
  });
  assert.deepEqual(parsed.preferences.regions, ['서울', '경기']);
  assert.deepEqual(parsed.preferences.districts, ['강남구', '성남시 분당구']);
  assert.equal(parsed.preferences.newlywedOnly, true);
  assert.equal(parsed.preferences.maxPriceManWon, 65_000);
  assert.equal(parsed.preferences.minAreaM2, 20 * 3.305785);
  assert.equal(parsed.preferences.maxAreaM2, 30.5 * 3.305785);
  assert.equal(parsed.preferences.minSupplyUnits, 500);
  assert.equal(parsed.preferences.includeUnknownPrice, false);
  assert.equal(parsed.preferences.includeUnknownArea, false);
  assert.equal(parsed.preferences.includeUnknownUnits, false);
  assert.match(describeAlertPreferences(parsed.preferences), /분양가 6\.5억원 이하/);
  assert.deepEqual(parsed.warnings, []);
});

test('잘못된 숫자·불리언은 값 자체를 로그에 싣지 않고 조건만 안전하게 무시한다', () => {
  const secretLikeInvalid = 'bad-secret-like-value';
  const parsed = parseAlertPreferences({
    HOMEHUNT_ALERT_REGIONS: '부산',
    HOMEHUNT_ALERT_NEWLYWED_ONLY: secretLikeInvalid,
    HOMEHUNT_ALERT_MAX_PRICE_EOK: secretLikeInvalid,
    HOMEHUNT_ALERT_MIN_PYEONG: '40',
    HOMEHUNT_ALERT_MAX_PYEONG: '20',
    HOMEHUNT_ALERT_MIN_UNITS: '500.5',
    HOMEHUNT_ALERT_INCLUDE_UNKNOWN_PRICE: secretLikeInvalid,
  });

  assert.deepEqual(parsed.preferences.regions, ['서울', '경기']);
  assert.equal(parsed.preferences.newlywedOnly, false);
  assert.equal(parsed.preferences.maxPriceManWon, null);
  assert.equal(parsed.preferences.minAreaM2, null);
  assert.equal(parsed.preferences.maxAreaM2, null);
  assert.equal(parsed.preferences.minSupplyUnits, null);
  assert.equal(parsed.preferences.includeUnknownPrice, true);
  assert.equal(parsed.warnings.length, 6);
  assert.equal(parsed.warnings.every((warning) => !warning.includes(secretLikeInvalid)), true);
});

test('지역·시군구·신혼·가격·평형·세대수 조건을 모두 만족한 이벤트만 남긴다', () => {
  const matching = notice('applyhome:apt:matching', {
    district: '강남구',
    locations: [{ regionKey: 'seoul', sidoCode: '11', sido: '서울특별시', district: '강남구', address: '서울특별시 강남구' }],
    fingerprint: '3'.repeat(64),
  });
  const wrongDistrict = notice('applyhome:apt:district', { fingerprint: '4'.repeat(64) });
  const expensive = notice('applyhome:apt:expensive', {
    district: '강남구',
    locations: matching.locations,
    maxPriceManWon: 70_000,
    fingerprint: '5'.repeat(64),
  });
  const small = notice('applyhome:apt:small', {
    district: '강남구',
    locations: matching.locations,
    homes: [{ areaM2: 50 }],
    fingerprint: '6'.repeat(64),
  });
  const fewUnits = notice('applyhome:apt:few', {
    district: '강남구',
    locations: matching.locations,
    totalUnits: 300,
    fingerprint: '7'.repeat(64),
  });
  const notNewlywed = notice('applyhome:apt:general', {
    district: '강남구',
    locations: matching.locations,
    newlywedSupplyAvailable: false,
    eligibilityTags: [],
    fingerprint: '8'.repeat(64),
  });
  const notices = [matching, wrongDistrict, expensive, small, fewUnits, notNewlywed];
  const data = snapshot(notices, {
    new: notices.map(({ id, source }) => ({ id, source })),
  });
  const { preferences } = parseAlertPreferences({
    HOMEHUNT_ALERT_REGIONS: '서울',
    HOMEHUNT_ALERT_DISTRICTS: '강남구',
    HOMEHUNT_ALERT_NEWLYWED_ONLY: 'true',
    HOMEHUNT_ALERT_MAX_PRICE_EOK: '6',
    HOMEHUNT_ALERT_MIN_PYEONG: '20',
    HOMEHUNT_ALERT_MAX_PYEONG: '30',
    HOMEHUNT_ALERT_MIN_UNITS: '500',
    HOMEHUNT_ALERT_INCLUDE_UNKNOWN_PRICE: 'false',
    HOMEHUNT_ALERT_INCLUDE_UNKNOWN_AREA: 'false',
    HOMEHUNT_ALERT_INCLUDE_UNKNOWN_UNITS: 'false',
  });

  const alerts = collectEligibleAlerts(data, normalizeLedger(null), {
    preferences,
    now: new Date('2026-09-04T03:00:00.000Z'),
  });
  assert.deepEqual(alerts.map(({ notice: value }) => value.id), [matching.id]);
});

test('미공개 가격·면적·세대수 포함 여부는 각각 독립적으로 적용된다', () => {
  const unknown = notice('lh:unknown', {
    source: 'lh',
    locations: [{ regionKey: 'gyeonggi', sidoCode: '41', sido: '경기도', district: '', address: '' }],
    maxPriceManWon: null,
    homes: [],
    minAreaM2: null,
    maxAreaM2: null,
    totalUnits: null,
    fingerprint: '9'.repeat(64),
  });
  const data = snapshot([unknown], { new: [{ id: unknown.id, source: unknown.source }] });
  const baseEnvironment = {
    HOMEHUNT_ALERT_MAX_PRICE_EOK: '6',
    HOMEHUNT_ALERT_MIN_PYEONG: '20',
    HOMEHUNT_ALERT_MIN_UNITS: '500',
  };
  const included = parseAlertPreferences(baseEnvironment).preferences;
  assert.equal(collectEligibleAlerts(data, normalizeLedger(null), {
    preferences: included,
    now: new Date('2026-09-04T03:00:00.000Z'),
  }).length, 1);

  for (const variable of [
    'HOMEHUNT_ALERT_INCLUDE_UNKNOWN_PRICE',
    'HOMEHUNT_ALERT_INCLUDE_UNKNOWN_AREA',
    'HOMEHUNT_ALERT_INCLUDE_UNKNOWN_UNITS',
  ]) {
    const preferences = parseAlertPreferences({ ...baseEnvironment, [variable]: 'false' }).preferences;
    assert.equal(collectEligibleAlerts(data, normalizeLedger(null), {
      preferences,
      now: new Date('2026-09-04T03:00:00.000Z'),
    }).length, 0, variable);
  }
});

test('Actions는 수동 알림을 기본 해제하고 모든 비민감 맞춤 조건을 Repository Variables로 전달한다', async () => {
  const workflow = await readFile(path.resolve('.github/workflows/update-homehunt-supply.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:\s+[\s\S]*?notify:\s+[\s\S]*?default:\s*false/);
  for (const name of [
    'HOMEHUNT_ALERT_REGIONS',
    'HOMEHUNT_ALERT_DISTRICTS',
    'HOMEHUNT_ALERT_NEWLYWED_ONLY',
    'HOMEHUNT_ALERT_MAX_PRICE_EOK',
    'HOMEHUNT_ALERT_MIN_PYEONG',
    'HOMEHUNT_ALERT_MAX_PYEONG',
    'HOMEHUNT_ALERT_MIN_UNITS',
    'HOMEHUNT_ALERT_INCLUDE_UNKNOWN_PRICE',
    'HOMEHUNT_ALERT_INCLUDE_UNKNOWN_AREA',
    'HOMEHUNT_ALERT_INCLUDE_UNKNOWN_UNITS',
  ]) {
    assert.match(workflow, new RegExp(`${name}: \\$\\{\\{ vars\\.${name} \\}\\}`), name);
  }
  assert.match(workflow, /github\.event_name == 'schedule' \|\| inputs\.notify == true/);
});

test('메시지는 3500자·5개로 제한하고 초과분은 HomeHunt 요약 한 건으로 합친다', () => {
  const alerts = Array.from({ length: 220 }, (_, index) => {
    const current = notice(`applyhome:apt:${index}:${index}`, {
      name: `아주 긴 분양 공고 ${index} ${'가'.repeat(300)}`,
      fingerprint: index.toString(16).padStart(64, '0'),
    });
    return {
      kind: 'new',
      key: noticeAlertKey('new', current),
      notice: current,
      officialUrl: officialNoticeUrl(current.source, current.officialUrl),
      changedFields: [],
    };
  });
  const packets = packAlertMessages(alerts);

  assert.equal(packets.length, TELEGRAM_MESSAGE_COUNT_LIMIT);
  assert.equal(packets.every(({ text }) => text.length <= TELEGRAM_MESSAGE_LIMIT), true);
  assert.equal(packets.flatMap(({ alerts: values }) => values).length, alerts.length);
  assert.equal(packets.at(-1).summary, true);
  assert.match(packets.at(-1).text, new RegExp(HOMEHUNT_SUPPLY_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('dry run은 네트워크와 ledger를 변경하지 않고 안전한 대상 요약만 출력한다', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'homehunt-telegram-dry-'));
  const ledgerPath = path.join(directory, 'ledger.json');
  const originalLedger = `${JSON.stringify({ schemaVersion: 1, sent: [] }, null, 2)}\n`;
  await writeFile(ledgerPath, originalLedger, 'utf8');
  const current = notice('applyhome:apt:H-1:P-1', { name: '새 공고\u001b[31m 위험 제어문자' });
  const output = memoryOutput();
  let fetchCount = 0;

  const result = await runSupplyTelegram({
    notify: false,
    snapshot: snapshot([current], { new: [{ id: current.id, source: current.source }] }),
    ledgerPath,
    token: TOKEN,
    chatId: CHAT_ID,
    stdout: output.stream,
    fetchImpl: async () => { fetchCount += 1; return telegramResponse(); },
  });

  assert.equal(result.status, 'dry_run');
  assert.equal(fetchCount, 0);
  assert.equal(await readFile(ledgerPath, 'utf8'), originalLedger);
  assert.doesNotMatch(output.read(), /\u001b/);
  assert.doesNotMatch(output.read(), new RegExp(TOKEN));
  assert.doesNotMatch(output.read(), new RegExp(CHAT_ID));
});

test('notify 모드에서 Secret이 없으면 전송과 ledger 변경을 안전하게 건너뛴다', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'homehunt-telegram-missing-'));
  const ledgerPath = path.join(directory, 'ledger.json');
  const current = notice('applyhome:apt:H-1:P-1');
  let fetchCount = 0;

  const result = await runSupplyTelegram({
    notify: true,
    snapshot: snapshot([current], { new: [{ id: current.id, source: current.source }] }),
    ledger: normalizeLedger(null),
    ledgerPath,
    token: '',
    chatId: '',
    stdout: memoryOutput().stream,
    fetchImpl: async () => { fetchCount += 1; return telegramResponse(); },
  });

  assert.equal(result.status, 'skipped_missing_secrets');
  assert.equal(fetchCount, 0);
  await assert.rejects(access(ledgerPath), (error) => error.code === 'ENOENT');
});

test('실전송은 고정 Telegram origin·POST JSON·plain text·no redirect를 쓰고 성공 해시만 저장한다', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'homehunt-telegram-send-'));
  const ledgerPath = path.join(directory, 'ledger.json');
  const current = notice('applyhome:apt:H-1:P-1');
  const requests = [];
  const output = memoryOutput();

  const result = await runSupplyTelegram({
    notify: true,
    snapshot: snapshot([current], { new: [{ id: current.id, source: current.source }] }),
    ledger: normalizeLedger(null),
    ledgerPath,
    token: TOKEN,
    chatId: CHAT_ID,
    stdout: output.stream,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return telegramResponse();
    },
  });

  assert.equal(result.status, 'sent');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${TELEGRAM_API_ORIGIN}/bot${TOKEN}/sendMessage`);
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.redirect, 'error');
  assert.equal(requests[0].init.signal instanceof AbortSignal, true);
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.chat_id, CHAT_ID);
  assert.equal(body.link_preview_options.is_disabled, true);
  assert.equal(Object.hasOwn(body, 'parse_mode'), false);
  assert.match(body.text, /공식 공고: https:\/\/www\.applyhome\.co\.kr/);
  const stored = JSON.parse(await readFile(ledgerPath, 'utf8'));
  assert.deepEqual(Object.keys(stored).sort(), ['schemaVersion', 'sent']);
  assert.deepEqual(stored.sent, [noticeAlertKey('new', current)]);
  assert.doesNotMatch(output.read(), new RegExp(TOKEN));
  assert.doesNotMatch(output.read(), new RegExp(CHAT_ID));
});

test('Telegram 429는 retry_after를 기다린 뒤 정확히 한 번만 재시도한다', async () => {
  const waits = [];
  let calls = 0;
  const result = await sendTelegramMessage({
    token: TOKEN,
    chatId: CHAT_ID,
    text: '테스트 알림',
    sleepImpl: async (milliseconds) => { waits.push(milliseconds); },
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? telegramResponse(429, { ok: false, parameters: { retry_after: 3 } })
        : telegramResponse();
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [3000]);
});

test('두 번째 429와 네트워크 오류는 비밀값이 없는 고정 오류로 끝낸다', async () => {
  let calls = 0;
  await assert.rejects(sendTelegramMessage({
    token: TOKEN,
    chatId: CHAT_ID,
    text: '테스트 알림',
    sleepImpl: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return telegramResponse(429, { ok: false, parameters: { retry_after: 1 } });
    },
  }), (error) => error.code === 'API_ERROR' && !error.message.includes(TOKEN));
  assert.equal(calls, 2);

  await assert.rejects(sendTelegramMessage({
    token: TOKEN,
    chatId: CHAT_ID,
    text: '테스트 알림',
    fetchImpl: async () => { throw new Error(`request failed: ${TOKEN}`); },
  }), (error) => error.code === 'NETWORK_ERROR' && !error.message.includes(TOKEN));
});

test('ledger에는 최대 2000개의 공개 해시만 남기고 잘못된 값은 조용히 초기화하지 않는다', () => {
  const hashes = Array.from({ length: LEDGER_ENTRY_LIMIT + 10 }, (_, index) => (
    index.toString(16).padStart(64, '0')
  ));
  const ledger = appendLedgerEntries(normalizeLedger(null), hashes);
  assert.equal(ledger.sent.length, LEDGER_ENTRY_LIMIT);
  assert.equal(ledger.sent[0], hashes[10]);
  assert.throws(
    () => normalizeLedger({ schemaVersion: 1, sent: ['not-a-hash'] }),
    (error) => error.code === 'INVALID_LEDGER',
  );
});
