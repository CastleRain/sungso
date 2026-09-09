import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildFinanceMarketContext } from '../js/finance-market-context.mjs';

const now = new Date('2026-09-10T00:00:00Z');
const row = (month, dealType, band, count, meanTotal = 80000, meanP33 = 4000) => ({ month, dealType, band, count, meanTotal, meanP33 });
function summary(rows, extra = {}) {
  return { source: '국토부 아파트 실거래', sourceType: 'official', generatedAt: '2026-09-08T00:00:00Z',
    rangeStart: '2025-01', endMonth: '2026-08', provisionalMonths: 2,
    regions: [{ code: '11110', name: '서울 종로구', monthly: rows }], ...extra };
}
function context(rows, extra = {}) { return buildFinanceMarketContext({ marketSummary: summary(rows, extra), now }).market; }
const baseRows = [
  row('2025-06', '매매', 'all', 50), row('2026-05', '매매', 'all', 80), row('2026-06', '매매', 'all', 100),
  row('2026-06', '매매', '60_85', 20, 100000, 5000), row('2026-05', '매매', '60_85', 10, 100000, 4000),
  row('2026-06', '전세', '60_85', 30, 50000, 3000), row('2026-05', '전세', '60_85', 20, 45000, 2800),
  row('2026-06', '매매', '40_60', 60, 50000, 3000), row('2026-06', '전세', 'all', 400),
  row('2026-07', '매매', 'all', 150), row('2026-08', '매매', 'all', 1),
];

test('지역 전체 거래량은 all 집계 한 번만 사용하고 최신 신고월 급감을 비교하지 않는다', () => {
  const value = context(baseRows);
  assert.equal(value.regionCode, '11110');
  assert.equal(value.comparisonMonth, '2026-06');
  assert.equal(value.volume.count, 100);
  assert.equal(value.volume.previousCount, 80);
  assert.equal(value.volume.momPct, 25);
  assert.equal(value.volume.yoyPct, 100);
  assert.equal(value.volume.latestReportedCount, 1);
  assert.match(value.coverageLabel, /1개.*전체 통계 아님/);
});

test('가격은 같은 지역·면적 구간의 3.3㎡당 평균을 비교하며 거래가 섞인 총액 상승률을 만들지 않는다', () => {
  const value = context(baseRows);
  assert.equal(value.sale.amountManWon, 100000);
  assert.equal(value.sale.momPct, 25); // Same mean total, different per-area means.
  assert.equal(value.jeonseToSalePct, 60); // Not the 50% mean-total ratio.
  assert.match(value.notes.join(' '), /같은 집의 상승률과 다릅니다/);
  assert.match(value.notes.join(' '), /보증금 안전성/);
});

test('사용자가 선택한 지역만 사용하며 다른 지역의 가격으로 누락을 채우지 않는다', () => {
  const marketSummary = summary(baseRows);
  marketSummary.regions.push({ code: '41465', name: '경기 용인시 수지구', monthly: [row('2026-06', '매매', 'all', 7)] });
  const value = buildFinanceMarketContext({ marketSummary, regionCode: '41465', now }).market;
  assert.equal(value.regionCode, '41465');
  assert.equal(value.volume.count, 7);
  assert.equal(value.sale, null);
  assert.equal(value.regions.length, 2);
  assert.equal(buildFinanceMarketContext({ marketSummary, now }).market.regionCode, '11110');
});

test('다른 평형으로 전환하면 비교도 그 평형 안에서만 수행한다', () => {
  const value = buildFinanceMarketContext({ marketSummary: summary(baseRows), band: '40_60', now }).market;
  assert.equal(value.sale.amountManWon, 50000);
  assert.equal(value.sale.momPct, null);
  assert.equal(value.jeonseToSalePct, null);
  assert.equal(value.volume.count, 100); // volume is explicitly all areas in the selected district.
});

test('누락·중복 집계·이전월 0건은 증감률 계산에서 빠지고 5건 미만 가격은 보류한다', () => {
  const rows = [row('2026-06', '매매', 'all', 3), row('2026-05', '매매', 'all', 0),
    row('2026-06', '매매', '60_85', 4), row('2026-06', '전세', '60_85', 20)];
  const value = context(rows);
  assert.equal(value.volume.momPct, null);
  assert.equal(value.volume.yoyPct, null);
  assert.equal(value.sale, null);
  assert.equal(value.jeonseToSalePct, null);
  assert.equal(context([...rows, row('2026-06', '매매', 'all', 3)]).volume.count, null);
  assert.equal(context([]).volume.count, null);
});

test('오래된 파일은 당시 신고 중이던 월을 확정월로 바꾸지 않는다', () => {
  const marketSummary = summary(baseRows);
  const value = buildFinanceMarketContext({ marketSummary, now: new Date('2027-01-10T00:00:00Z') }).market;
  assert.equal(value.status, 'stale');
  assert.equal(value.comparisonMonth, '2026-06');
  assert.equal(value.generatedAt, marketSummary.generatedAt);
});

test('부분 수집이면 수록값은 보존하되 증감과 비율을 보류한다', () => {
  const value = context(baseRows, { complete: false });
  assert.equal(value.status, 'partial');
  assert.equal(value.volume.count, 100);
  assert.equal(value.volume.momPct, null);
  assert.equal(value.sale.momPct, null);
  assert.equal(value.jeonseToSalePct, null);
});

test('샘플·출처 없는 자료와 미래 수집일을 실제 현재 통계로 사용하지 않는다', () => {
  for (const extra of [{ sourceType: 'demo' }, { sourceType: 'empty' }, { generatedAt: null }, { generatedAt: '2027-01-01' }]) {
    const value = context(baseRows, extra);
    assert.equal(value.status, 'unavailable');
    assert.equal(value.volume.count, null);
    assert.equal(value.sale, null);
  }
});

const notice = (id, startDate, endDate = startDate) => ({ id, title: id, source: 'applyhome', program: 'private-sale', tenure: 'sale',
  locations: [{ regionKey: 'seoul', sidoCode: '11', sido: '서울특별시' }],
  schedules: [{ kind: 'application', startDate, endDate }] });

test('수집 실패·불완전 빈 공고를 분양 0건으로 표시하지 않는다', () => {
  for (const supplyFeed of [null, { notices: [] }, { generatedAt: '2026-09-09', complete: false, notices: [] },
    { generatedAt: '2026-09-09', complete: true, notices: [], loadError: 'offline' }]) {
    const value = buildFinanceMarketContext({ supplyFeed, now }).supply;
    assert.equal(value.status, 'unavailable');
    assert.equal(value.openCount, null);
  }
  const value = buildFinanceMarketContext({ supplyFeed: { generatedAt: '2026-09-09', complete: true, notices: [] }, now }).supply;
  assert.equal(value.status, 'ready');
  assert.equal(value.openCount, 0);
});

test('공고는 한국 현재일 접수 중·7일 안 시작만 집계하며 중복과 마감을 제외한다', () => {
  const open = notice('open', '2026-09-10');
  const supplyFeed = { generatedAt: '2026-09-09', complete: true,
    notices: [open, open, notice('closed', '2026-09-09'), notice('soon', '2026-09-17'), notice('later', '2026-09-18')] };
  const value = buildFinanceMarketContext({ supplyFeed, now }).supply;
  assert.equal(value.openCount, 1);
  assert.equal(value.soonCount, 1);
  const stale = buildFinanceMarketContext({ supplyFeed: { ...supplyFeed, generatedAt: '2026-09-01' }, now }).supply;
  assert.equal(stale.status, 'stale');
  assert.match(stale.note, /이전에 수집/);
});

test('실제 보관 자료에서 지역·기간·거래량을 대조한다', async () => {
  const marketSummary = JSON.parse(await readFile(new URL('../data/market-summary.json', import.meta.url), 'utf8'));
  const value = buildFinanceMarketContext({ marketSummary, regionCode: marketSummary.regions[0].code,
    now: new Date(Date.parse(marketSummary.generatedAt) + 86400000) }).market;
  const raw = marketSummary.regions[0].monthly.find((item) => item.month === value.comparisonMonth && item.dealType === '매매' && item.band === 'all');
  assert.equal(value.volume.count, raw?.count ?? null);
  assert.equal(value.regions.length, marketSummary.regions.length);
});
