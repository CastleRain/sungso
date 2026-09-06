import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildMarketSummary, validateMarketSummary } from '../js/market-core.mjs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const publicSummary = JSON.parse(fs.readFileSync(new URL('../data/market-summary.json', import.meta.url), 'utf8'));
const publicHistory = JSON.parse(fs.readFileSync(new URL('../data/apartment-history.json', import.meta.url), 'utf8'));
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

function harness({ summary = publicSummary, history = publicHistory, local = false, enabled = false, fetcher } = {}) {
  const nodes = new Map();
  const $ = selector => {
    if (!nodes.has(selector)) nodes.set(selector, node());
    return nodes.get(selector);
  };
  const calls = [];
  const state = { marketSummary: null, staticApartmentHistoryMeta: null, placeSearchConfigured: true };
  const sandbox = { state, $, validateMarketSummary,
    APP_CONFIG: { localMarketEnabled: local, apartmentHistoryEnabled: enabled,
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
  for (const name of ['loadMarketSummary', 'updateMarketConnection', 'loadStaticApartmentHistory', 'updateLocalConnectionUi']) {
    const match = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
    assert.ok(match, `Actual app function ${name} exists`);
    vm.runInContext(match[0], sandbox);
  }
  return { sandbox, state, $, calls, nodes };
}

test('Pages의 실제 빈 공개 JSON은 수집 완료·공식 연결로 표시되지 않는다', async () => {
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
