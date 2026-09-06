import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  APPLYHOME_ENDPOINTS,
  collectHomeSupply,
  normalizeApplyhomeNotice,
} from '../scripts/fetch-home-supply.mjs';
import { normalizeLhNoticeForHomeSupply } from '../scripts/lh-supply-adapter.mjs';

const NOW = new Date('2026-09-04T03:00:00.000Z');
const GENERATED_AT = NOW.toISOString();

function applyhomeNotice(number, name = `청약홈 단지 ${number}`) {
  return normalizeApplyhomeNotice({
    HOUSE_MANAGE_NO: `H-${number}`,
    PBLANC_NO: `P-${number}`,
    HOUSE_NM: name,
    HSSPLY_ADRES: '서울특별시 송파구 테스트로 1',
    SUBSCRPT_AREA_CODE_NM: '서울',
    RCRIT_PBLANC_DE: '2026-09-01',
    SPSPLY_RCEPT_BGNDE: '2026-09-10',
    SPSPLY_RCEPT_ENDDE: '2026-09-10',
  }, APPLYHOME_ENDPOINTS[0], [{
    MODEL_NO: '01',
    HOUSE_TY: '84',
    SUPLY_AR: '84.9',
    SUPLY_HSHLDCO: '10',
    SPSPLY_HSHLDCO: '5',
    NWWDS_HSHLDCO: '2',
    LTTOT_TOP_AMOUNT: '60000',
  }], { generatedAt: GENERATED_AT, today: '2026-09-04' });
}

function lhNotice(id, regionCodes = ['11'], overrides = {}) {
  return normalizeLhNoticeForHomeSupply({
    id: `lh:${id}`,
    sourceNoticeId: id,
    idStability: 'official',
    categoryCode: '05',
    name: `LH 단지 ${id}`,
    noticeDate: '2026-09-01',
    closeDate: '2026-09-30',
    status: '공고중',
    officialUrl: `https://apply.lh.or.kr/notice?PAN_ID=${id}`,
    matchedRegionCodes: regionCodes,
    ...overrides,
  }, { generatedAt: GENERATED_AT });
}

function shNotice(seq, overrides = {}) {
  const notice = {
    id: `sh:${seq}`,
    source: 'sh',
    sourceLabel: '서울주택도시개발공사',
    sourceNoticeId: String(seq),
    idStability: 'official',
    notificationEligible: true,
    category: 'sh-housing-sale',
    categoryLabel: 'SH 주택분양',
    title: `SH 분양주택 입주자모집공고 ${seq}`,
    name: `SH 분양주택 입주자모집공고 ${seq}`,
    regionName: '서울',
    region: '서울',
    locations: [{
      regionKey: 'seoul',
      sidoCode: '11',
      sido: '서울특별시',
      district: '',
      address: '',
      lat: null,
      lng: null,
      coordinateAccuracy: 'none',
    }],
    program: 'public-sale',
    tenure: 'sale',
    providerStatus: '공고 게시',
    status: 'unknown',
    noticeDate: '2026-09-01',
    closeDate: null,
    schedule: { applyStart: null, applyEnd: null },
    schedules: [],
    targetGroups: [],
    newlywedSupplyAvailable: null,
    newlywedClassification: 'none',
    classification: 'housing-sale-notice',
    eligibilityTags: [],
    officialUrl: `https://www.i-sh.co.kr/app/notice/view.do?seq=${seq}`,
    summary: '',
    fingerprint: `sh-fingerprint-${seq}`,
    ...overrides,
  };
  return notice;
}

function sourceResult(source, status, notices, overrides = {}) {
  const successful = status === 'ok' || status === 'partial';
  const baseCoverage = source === 'applyhome'
    ? {
      status,
      requestedEndpointCount: 3,
      successfulEndpointCount: successful ? (status === 'ok' ? 3 : 2) : 0,
      failedEndpointCount: status === 'partial' ? 1 : status === 'error' ? 3 : 0,
      endpoints: [],
      errors: status === 'ok' ? [] : [{ source, message: 'safe failure' }],
    }
    : source === 'lh' ? {
      status,
      requestedQueryCount: 4,
      successfulQueryCount: successful ? (status === 'ok' ? 4 : 3) : 0,
      failedQueryCount: status === 'partial' ? 1 : status === 'error' ? 4 : 0,
      requestCount: successful ? 4 : 0,
      typeCodes: ['05', '39'],
      regionCodes: ['11', '41'],
      includeRental: false,
      queries: [],
      errors: status === 'ok' ? [] : [{ source, message: 'safe failure' }],
    } : {
      status,
      requestedFeedCount: 1,
      successfulFeedCount: successful ? 1 : 0,
      failedFeedCount: successful ? 0 : 1,
      requestCount: successful ? 1 : 0,
      feeds: [{ url: 'https://www.i-sh.co.kr/rss', status }],
      errors: status === 'ok' ? [] : [{ source, message: 'safe failure' }],
    };
  return {
    source,
    label: source === 'applyhome'
      ? '한국부동산원 청약홈'
      : source === 'lh' ? '한국토지주택공사 청약플러스' : '서울주택도시개발공사',
    status,
    generatedAt: GENERATED_AT,
    lastSuccessfulAt: successful ? GENERATED_AT : null,
    notices,
    coverage: baseCoverage,
    ...overrides,
  };
}

function previousSnapshot(notices, { integrated = true } = {}) {
  const generatedAt = '2026-09-03T03:00:00.000Z';
  return {
    schemaVersion: 1,
    version: 1,
    status: 'ok',
    complete: true,
    generatedAt,
    lastSuccessfulAt: generatedAt,
    sources: [
      { id: 'applyhome', label: '한국부동산원 청약홈', status: 'ok', generatedAt, lastSuccessfulAt: generatedAt },
      ...(integrated ? [
        { id: 'lh', label: '한국토지주택공사 청약플러스', status: 'ok', generatedAt, lastSuccessfulAt: generatedAt },
        { id: 'sh', label: '서울주택도시개발공사', status: 'ok', generatedAt, lastSuccessfulAt: generatedAt },
      ] : []),
    ],
    baseline: integrated ? {
      established: true,
      establishedAt: generatedAt,
      suppressInitialNotifications: false,
      providers: {
        applyhome: { established: true, establishedAt: generatedAt, lastSuccessfulAt: generatedAt },
        lh: { established: true, establishedAt: generatedAt, lastSuccessfulAt: generatedAt },
        sh: { established: true, establishedAt: generatedAt, lastSuccessfulAt: generatedAt },
      },
    } : {
      established: true,
      establishedAt: generatedAt,
      suppressInitialNotifications: false,
    },
    notices: notices.map((notice) => ({
      ...notice,
      firstSeenAt: generatedAt,
      lastSeenAt: generatedAt,
      fetchedAt: generatedAt,
    })),
  };
}

function collectors(applyhome, lh, sh = sourceResult('sh', 'ok', [])) {
  return {
    collectApplyhomeSourceImpl: async () => applyhome,
    collectLhSourceImpl: async () => lh,
    collectShSourceImpl: async () => sh,
  };
}

test('기존 청약홈 baseline에 LH를 처음 합칠 때 LH 전체를 신규 알림으로 만들지 않는다', async () => {
  const oldApplyhome = applyhomeNotice('1');
  const newApplyhome = applyhomeNotice('2');
  const firstLh = lhNotice('LH-1');
  const previous = previousSnapshot([oldApplyhome], { integrated: false });
  const snapshot = await collectHomeSupply({
    previous,
    write: false,
    now: NOW,
    ...collectors(
      sourceResult('applyhome', 'ok', [oldApplyhome, newApplyhome]),
      sourceResult('lh', 'ok', [firstLh]),
    ),
  });

  assert.equal(snapshot.complete, true);
  assert.deepEqual(snapshot.changes.suppressedSources, ['lh', 'sh']);
  assert.equal(snapshot.changes.baselineRun, false);
  assert.deepEqual(snapshot.changes.new.map(({ id }) => id), [newApplyhome.id]);
  assert.equal(snapshot.baseline.providers.applyhome.established, true);
  assert.equal(snapshot.baseline.providers.lh.established, true);
});

test('청약홈 장애와 LH 성공이 함께 오면 이전 청약홈 공고를 stale로 보존한다', async () => {
  const oldApplyhome = applyhomeNotice('1');
  const oldLh = lhNotice('LH-1');
  const newLh = lhNotice('LH-2');
  const previous = previousSnapshot([oldApplyhome, oldLh]);
  const snapshot = await collectHomeSupply({
    previous,
    write: false,
    now: NOW,
    ...collectors(
      sourceResult('applyhome', 'error', []),
      sourceResult('lh', 'ok', [oldLh, newLh]),
    ),
  });

  assert.equal(snapshot.status, 'partial');
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.sources.find(({ id }) => id === 'applyhome').status, 'error');
  const retained = snapshot.notices.find(({ id }) => id === oldApplyhome.id);
  assert.equal(retained.stale, true);
  assert.equal(retained.dataStatus, 'stale');
  assert.equal(snapshot.changes.removed.length, 0);
  assert.deepEqual(snapshot.changes.new.map(({ id }) => id), [newLh.id]);
});

test('LH 부분 실패는 실패 query에서 사라진 이전 공고와 서울·경기 query-match를 보존한다', async () => {
  const currentApplyhome = applyhomeNotice('1');
  const twoRegionLh = lhNotice('LH-1', ['11', '41']);
  const missingLh = lhNotice('LH-OLD', ['41']);
  const previous = previousSnapshot([currentApplyhome, twoRegionLh, missingLh]);
  const snapshot = await collectHomeSupply({
    previous,
    write: false,
    now: NOW,
    ...collectors(
      sourceResult('applyhome', 'ok', [currentApplyhome]),
      sourceResult('lh', 'partial', [lhNotice('LH-1', ['11'])]),
    ),
  });

  const merged = snapshot.notices.find(({ id }) => id === twoRegionLh.id);
  const retained = snapshot.notices.find(({ id }) => id === missingLh.id);
  assert.deepEqual(merged.matchedRegionCodes, ['11', '41']);
  assert.equal(merged.locations.length, 2);
  assert.equal(merged.stale, false);
  assert.equal(retained.stale, true);
  assert.equal(snapshot.coverage.staleNoticeCount, 1);
  assert.equal(snapshot.changes.removed.length, 0);
});

test('SH RSS 장애 시 다른 공급원 결과를 저장하면서 이전 SH 공고를 stale로 보존한다', async () => {
  const currentApplyhome = applyhomeNotice('1');
  const currentLh = lhNotice('LH-1');
  const oldSh = shNotice('309749');
  const previous = previousSnapshot([currentApplyhome, currentLh, oldSh]);
  const snapshot = await collectHomeSupply({
    previous,
    write: false,
    now: NOW,
    ...collectors(
      sourceResult('applyhome', 'ok', [currentApplyhome]),
      sourceResult('lh', 'ok', [currentLh]),
      sourceResult('sh', 'error', []),
    ),
  });

  assert.equal(snapshot.status, 'partial');
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.sources.find(({ id }) => id === 'sh').status, 'error');
  const retained = snapshot.notices.find(({ id }) => id === oldSh.id);
  assert.equal(retained.stale, true);
  assert.equal(retained.dataStatus, 'stale');
  assert.equal(snapshot.changes.removed.length, 0);
});

test('기존 청약홈·LH snapshot에 SH를 처음 연결하면 SH 공고를 기준선으로만 저장한다', async () => {
  const currentApplyhome = applyhomeNotice('1');
  const currentLh = lhNotice('LH-1');
  const firstSh = shNotice('309749');
  const previous = previousSnapshot([currentApplyhome, currentLh]);
  previous.sources = previous.sources.filter(({ id }) => id !== 'sh');
  delete previous.baseline.providers.sh;

  const snapshot = await collectHomeSupply({
    previous,
    write: false,
    now: NOW,
    ...collectors(
      sourceResult('applyhome', 'ok', [currentApplyhome]),
      sourceResult('lh', 'ok', [currentLh]),
      sourceResult('sh', 'ok', [firstSh]),
    ),
  });

  assert.deepEqual(snapshot.changes.suppressedSources, ['sh']);
  assert.equal(snapshot.changes.new.length, 0);
  assert.equal(snapshot.baseline.providers.sh.established, true);
  assert.equal(snapshot.notices.find(({ id }) => id === firstSh.id).stale, false);
});

test('SH RSS 최신 목록에서 빠진 기존 공고는 제한된 feed 특성상 삭제로 오인하지 않는다', async () => {
  const currentApplyhome = applyhomeNotice('1');
  const currentLh = lhNotice('LH-1');
  const oldSh = shNotice('309749');
  const previous = previousSnapshot([currentApplyhome, currentLh, oldSh]);

  const snapshot = await collectHomeSupply({
    previous,
    write: false,
    now: NOW,
    ...collectors(
      sourceResult('applyhome', 'ok', [currentApplyhome]),
      sourceResult('lh', 'ok', [currentLh]),
      sourceResult('sh', 'ok', []),
    ),
  });

  const retained = snapshot.notices.find(({ id }) => id === oldSh.id);
  assert.equal(retained.dataStatus, 'historical');
  assert.equal(retained.stale, false);
  assert.equal(retained.notInLatestFeed, true);
  assert.equal(snapshot.sources.find(({ id }) => id === 'sh').retainedHistoricalNoticeCount, 1);
  assert.equal(snapshot.changes.removed.length, 0);
});

test('모든 공급자 조회가 실패하면 기존 JSON을 덮어쓰지 않는다', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'homehunt-supply-'));
  const file = path.join(directory, 'home-supply.json');
  const original = `${JSON.stringify(previousSnapshot([applyhomeNotice('1')]), null, 2)}\n`;
  await writeFile(file, original, 'utf8');

  await assert.rejects(() => collectHomeSupply({
    outputPath: file,
    write: true,
    now: NOW,
    ...collectors(
      sourceResult('applyhome', 'error', []),
      sourceResult('lh', 'error', []),
      sourceResult('sh', 'error', []),
    ),
  }), /모두 갱신하지 못했습니다/);
  assert.equal(await readFile(file, 'utf8'), original);
});

test('한쪽만 성공한 첫 실행도 유효 JSON을 원자적으로 저장하고 그 공급자 baseline만 세운다', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'homehunt-supply-'));
  const file = path.join(directory, 'home-supply.json');
  const oneLh = lhNotice('LH-1');
  const snapshot = await collectHomeSupply({
    previous: null,
    outputPath: file,
    write: true,
    now: NOW,
    ...collectors(
      sourceResult('applyhome', 'error', []),
      sourceResult('lh', 'ok', [oneLh]),
      sourceResult('sh', 'error', []),
    ),
  });
  const persisted = JSON.parse(await readFile(file, 'utf8'));

  assert.equal(snapshot.status, 'partial');
  assert.equal(snapshot.changes.baselineRun, true);
  assert.equal(snapshot.baseline.suppressInitialNotifications, true);
  assert.deepEqual(snapshot.changes.new, []);
  assert.equal(snapshot.baseline.providers.applyhome.established, false);
  assert.equal(snapshot.baseline.providers.lh.established, true);
  assert.equal(snapshot.baseline.providers.sh.established, false);
  assert.equal(persisted.baseline.suppressInitialNotifications, true);
  assert.equal(persisted.notices[0].id, oneLh.id);
  assert.equal(persisted.notices[0].source, 'lh');
});
