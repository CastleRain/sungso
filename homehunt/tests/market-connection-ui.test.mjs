import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildMarketSummary, validateMarketSummary } from '../js/market-core.mjs';
import { cloudSessionErrorMessage } from '../js/cloud-session.js';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const publicSummary = JSON.parse(fs.readFileSync(new URL('../data/market-summary.json', import.meta.url), 'utf8'));
const publicHistory = JSON.parse(fs.readFileSync(new URL('../data/apartment-history.json', import.meta.url), 'utf8'));
// Empty-state behavior must not depend on the current scheduled collection.
// The shipped public artifacts are checked separately below.
const emptySummary = { version: 1, source: 'not-connected', sourceType: 'empty', generatedAt: null, regions: [], months: [] };
const emptyHistory = { version: 1, source: 'not-connected', generatedAt: null, apartments: [] };
const trade = { apartmentName: '검증 단지', regionCode: '41171', regionName: '검증 지역',
  dealType: '매매', month: '2026-08', day: 10, areaM2: 84, amountManWon: 90000 };
const collectedSummary = buildMarketSummary([trade], { source: '검증 공식 집계', sourceType: 'official', generatedAt: '2026-09-01T00:00:00Z' });

function node() {
  const value = { textContent: '', className: '' };
  value.classList = {
    contains(name) { return value.className.split(/\s+/).includes(name); },
    toggle(name, on) {
      const classes = new Set(value.className.split(/\s+/).filter(Boolean));
      if (on ?? !classes.has(name)) classes.add(name);
      else classes.delete(name);
      value.className = [...classes].join(' ');
    },
    add(name) { this.toggle(name, true); }, remove(name) { this.toggle(name, false); },
  };
  return value;
}

function harness({ summary = emptySummary, history = emptyHistory, local = false, cloud = false, enabled = false, fetcher } = {}) {
  const nodes = new Map();
  const $ = selector => {
    if (!nodes.has(selector)) nodes.set(selector, node());
    return nodes.get(selector);
  };
  const calls = [];
  const state = { marketSummary: null, staticApartmentHistoryMeta: null, placeSearchConfigured: true };
  const sandbox = { state, $, validateMarketSummary, cloudSessionErrorMessage,
    APP_CONFIG: { localMarketEnabled: local || cloud, isLocalRuntime: !cloud, apartmentHistoryEnabled: enabled,
      localApiContractVersion: '2.10.1',
      marketSummaryUrl: 'fixture:summary', apartmentHistoryStaticUrl: 'fixture:history' },
    loadImportedMarket: async () => null, populateMarketRegions() {}, renderMarket() {}, updateCompanySearchCapability() {},
    fetch: async (url, options) => {
      calls.push(url);
      if (fetcher) return fetcher(url, options);
      return { ok: true, json: async () => String(url).startsWith('fixture:summary') ? summary : history };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext('let staticApartmentHistoryPromise;', sandbox);
  for (const name of ['versionIsOlder', 'routeDiagnosticLabel', 'loadMarketSummary', 'updateMarketConnection', 'loadStaticApartmentHistory', 'updateLocalConnectionUi']) {
    const match = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
    assert.ok(match, `Actual app function ${name} exists`);
    vm.runInContext(match[0], sandbox);
  }
  return { sandbox, state, $, calls, nodes };
}

test('Pages의 빈 공개 JSON 응답은 수집 완료·공식 연결로 표시되지 않는다', async () => {
  const { sandbox, state, $, calls } = harness();
  await sandbox.loadMarketSummary();
  assert.equal($('#molitState').textContent, '데이터 미수집');
  assert.equal($('#molitState').classList.contains('connected'), false);
  assert.equal($('#marketSourceChip').classList.contains('official'), false);
  assert.equal($('strong').textContent, '실거래 데이터 미수집');
  assert.match($('#apartmentHistoryApiCheck').textContent, /단지 이력 데이터 미수집/);
  assert.match($('#apartmentHistoryApiCheck').textContent, /실시간 이력 API 미배포/);
  assert.equal($('#apartmentHistoryApiCheck').classList.contains('connection-warning'), true);
  assert.equal(state.staticApartmentHistoryMeta.status, 'empty');
  assert.equal(calls.length, 2);
  assert.ok(calls.every(url => url.startsWith('fixture:summary') || url === 'fixture:history'));
});

test('배포된 공식 집계의 유효한 실제 행은 공식 연결로 표시하고 단지 이력은 별도로 판단한다', async () => {
  assert.equal(publicSummary.sourceType, 'official');
  assert.ok(publicSummary.source && publicSummary.source !== 'not-connected');
  assert.ok(Number.isFinite(Date.parse(publicSummary.generatedAt)));
  assert.equal(validateMarketSummary(publicSummary), true);
  for (const region of publicSummary.regions) {
    assert.match(String(region.code), /^(11|41)\d{3}$/);
    assert.ok(Array.isArray(region.monthly));
    for (const row of region.monthly) {
      assert.match(row.month, /^\d{4}-(0[1-9]|1[0-2])$/);
      assert.ok(Number.isSafeInteger(row.count) && row.count > 0);
      assert.ok(Number.isFinite(row.averageTotal) && row.averageTotal >= 0);
    }
  }
  assert.ok(Array.isArray(publicHistory.apartments));
  for (const apartment of publicHistory.apartments) assert.ok(Array.isArray(apartment.transactions));
  const historyCount = publicHistory.apartments.filter(apartment => apartment.transactions.length > 0).length;
  if (historyCount) {
    assert.notEqual(publicHistory.source, 'not-connected');
    assert.ok(Number.isFinite(Date.parse(publicHistory.generatedAt)));
  }
  const { sandbox, state, $, calls } = harness({ summary: publicSummary, history: publicHistory });
  await sandbox.loadMarketSummary();
  assert.equal($('#molitState').textContent, '배포 공식 집계');
  assert.equal($('#molitState').classList.contains('connected'), true);
  assert.equal($('#marketSourceChip').classList.contains('official'), true);
  assert.equal(state.staticApartmentHistoryMeta.status, historyCount ? 'ready' : 'empty');
  assert.equal(state.staticApartmentHistoryMeta.apartmentCount, historyCount);
  assert.match($('#apartmentHistoryApiCheck').textContent, /실시간 이력 API 미배포/);
  assert.equal(calls.length, 2);
});

test('집계의 실제 행·출처 종류·기준일에 맞춰 공식·CSV·샘플·확인 필요 상태를 구분한다', () => {
  const { sandbox, state, $ } = harness();
  for (const [summary, text, connected] of [
    [collectedSummary, '배포 공식 집계', true],
    [{ ...collectedSummary, sourceType: 'imported' }, '브라우저 CSV', false],
    [{ ...collectedSummary, sourceType: 'demo' }, '지역 집계 샘플', false],
    [{ ...collectedSummary, generatedAt: null }, '집계 기준일 확인 필요', false],
    [{ ...collectedSummary, generatedAt: 'invalid' }, '집계 기준일 확인 필요', false],
    [{ ...collectedSummary, regions: [] }, '데이터 미수집', false],
    [{ ...collectedSummary, source: 'not-connected' }, '데이터 미수집', false],
  ]) {
    state.marketSummary = summary;
    sandbox.updateMarketConnection();
    assert.equal($('#molitState').textContent, text);
    assert.equal($('#molitState').classList.contains('connected'), connected);
    assert.equal($('#marketSourceChip').classList.contains('official'), connected);
    assert.doesNotMatch($('#marketUpdatedAt').textContent, /Invalid Date/);
  }
});

test('단지명만 있는 빈 이력과 기준일 없는 저장본을 수집 완료로 오인하지 않는다', async () => {
  for (const [history, expected] of [
    [{ source: 'official', generatedAt: '2026-09-01', apartments: [{ name: '검증 단지', transactions: [] }] }, 'empty'],
    [{ source: 'official', generatedAt: null, apartments: [{ transactions: [trade] }] }, 'undated'],
    [{ source: 'official', generatedAt: '2026-09-01', apartments: [{ transactions: [trade] }] }, 'ready'],
  ]) {
    const { sandbox, state, $ } = harness({ summary: collectedSummary, history });
    await sandbox.loadMarketSummary();
    assert.equal(state.staticApartmentHistoryMeta.status, expected);
    if (expected === 'ready') assert.match($('#apartmentHistoryApiCheck').textContent, /1개 저장본/);
    else assert.doesNotMatch($('#apartmentHistoryApiCheck').textContent, /개 저장본/);
    assert.match($('#apartmentHistoryApiCheck').textContent, /실시간 이력 API 미배포/);
  }
});

test('공개 이력 실패와 잘못된 응답은 확인 실패로 표시하고 원본 오류를 노출하지 않는다', async () => {
  for (const response of [null, { ok: false }, { ok: true, json: async () => null }, { ok: true, json: async () => ({ apartments: {} }) }]) {
    const { sandbox, state, $, nodes } = harness({ fetcher: async url => {
      if (String(url).startsWith('fixture:summary')) return { ok: true, json: async () => collectedSummary };
      if (!response) throw new Error('sensitive-fixture-error-must-not-be-rendered');
      return response;
    } });
    await sandbox.loadMarketSummary();
    assert.equal(state.staticApartmentHistoryMeta.status, 'error');
    assert.match($('#apartmentHistoryApiCheck').textContent, /공개 단지 이력 확인 실패/);
    assert.ok([...nodes.values()].every(element => !element.textContent.includes('sensitive-fixture')));
  }
});

test('Pages 연결 재확인이 미수집 판정과 API 미배포 상태를 덮어쓰지 않는다', async () => {
  const { sandbox, $ } = harness();
  await sandbox.loadMarketSummary();
  const before = $('#apartmentHistoryApiCheck').textContent;
  sandbox.updateLocalConnectionUi();
  assert.equal($('#molitState').textContent, '데이터 미수집');
  assert.equal($('#apartmentHistoryApiCheck').textContent, before);
  assert.equal($('#molitState').classList.contains('connected'), false);
});

test('로컬 서버의 실제 연결 상태는 빈 공개 저장본 때문에 덮어쓰거나 추가 조회하지 않는다', async () => {
  const { sandbox, $, calls } = harness({ local: true });
  $('#molitState').textContent = '실거래 연결';
  $('#molitState').className = 'service-state connected';
  $('#apartmentHistoryApiCheck').textContent = '로컬 실제 연결 확인';
  await sandbox.loadMarketSummary();
  assert.equal($('#molitState').textContent, '실거래 연결');
  assert.equal($('#molitState').className, 'service-state connected');
  assert.equal($('#apartmentHistoryApiCheck').textContent, '로컬 실제 연결 확인');
  assert.equal(calls.length, 1);
  assert.equal(calls.includes('fixture:history'), false);
});

test('온라인은 로그인 필요와 실제 서버 연결을 구분하고 없는 캐시 건수를 0으로 표시하지 않는다', async () => {
  const { sandbox, $, state, calls } = harness({ cloud: true });
  sandbox.updateLocalConnectionUi(null, { status: 401, code: 'CLOUD_AUTH_REQUIRED' });
  assert.equal($('#molitState').textContent, '로그인 필요');
  assert.match($('#localMarketServerCheck').textContent, /Google 로그인/);
  assert.equal($('#commuteState').textContent, '로그인 필요');
  assert.equal(state.localMarketConnected, false);
  sandbox.updateLocalConnectionUi({ ok: true, runtime: 'render', version: '2.10.1', keyConfigured: true,
    keySource: 'server-environment', catalogCount: 1000, limits: { historyMonthsMax: 60 },
    commute: { transitConfigured: true, transitProvider: 'kakao', providers: { kakaoTransitConfigured: true } },
    placeSearch: { configured: true } });
  assert.equal(state.localMarketConnected, true);
  assert.equal($('#molitState').textContent, '실거래 연결');
  assert.match($('#localMarketServerCheck').textContent, /온라인 서버 정상/);
  assert.match($('#apartmentHistoryApiCheck').textContent, /서버 비밀 설정 연결.*공공 월 자료 재사용/);
  assert.doesNotMatch($('#apartmentHistoryApiCheck').textContent, /월 캐시 0개|로컬|\.env/);
  assert.match($('#transitRouteCheck').textContent, /Kakao 버스·지하철 키 설정됨 · 실제 경로 조회 전/);
  assert.doesNotMatch($('#commuteState').textContent, /실제 확인/);
  await sandbox.loadMarketSummary();
  assert.equal($('#molitState').textContent, '실거래 연결');
  assert.equal(calls.length, 1);
});

test('로컬의 제공된 캐시 건수는 유지하고 온라인 연결 실패는 서버 미배포로 오인하지 않는다', () => {
  const local = harness({ local: true });
  local.sandbox.updateLocalConnectionUi({ ok: true, version: '2.10.1', keyConfigured: true,
    keySource: 'environment', cache: { months: 22 } });
  assert.match(local.$('#localMarketServerCheck').textContent, /로컬 서버 정상/);
  assert.match(local.$('#apartmentHistoryApiCheck').textContent, /\.env\/환경변수 자동 연결.*월 캐시 22개/);
  const cloud = harness({ cloud: true });
  cloud.sandbox.updateLocalConnectionUi(null, new Error('offline'));
  assert.equal(cloud.$('#molitState').textContent, '온라인 연결 확인');
  assert.equal(cloud.state.localMarketConnected, false);
  assert.doesNotMatch(cloud.$('#localMarketServerCheck').textContent, /로컬|시작 명령|미배포/);
});
