import { buildSupplyQuickFilterView } from './supply-core.mjs?v=4.16.0';

export const FINANCE_MARKET_BANDS = Object.freeze([
  { value: 'lt40', label: '40㎡ 미만' },
  { value: '40_60', label: '40~60㎡ 미만' },
  { value: '60_85', label: '60~85㎡ 미만' },
  { value: '85_102', label: '85~102㎡ 미만' },
  { value: 'gte102', label: '102㎡ 이상' },
]);

const DAY = 86400000;
const PRICE_MINIMUM_COUNT = 5;
const finite = (value) => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const positive = (value) => finite(value) > 0 ? Number(value) : null;

function monthIndex(value) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value || ''));
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

function monthKey(value) {
  return `${Math.floor(value / 12)}-${String(value % 12 + 1).padStart(2, '0')}`;
}

function ageDays(value, now) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) && timestamp <= now.getTime() + DAY
    ? Math.max(0, (now.getTime() - timestamp) / DAY) : null;
}

function percentChange(current, previous) {
  return finite(current) !== null && positive(previous) !== null ? (current / previous - 1) * 100 : null;
}

function singleRow(rows, month, dealType, band) {
  const matches = rows.filter((row) => row.month === month && row.dealType === dealType && row.band === band);
  // A repeated group is ambiguous; summing it could silently double the volume.
  return matches.length === 1 ? matches[0] : null;
}

function priceObservation(row) {
  const count = finite(row?.count);
  if (count === null || count < PRICE_MINIMUM_COUNT) return null;
  const amountManWon = positive(row?.meanTotal ?? row?.averageTotal);
  const priceP33 = positive(row?.meanP33 ?? row?.averageP33);
  return amountManWon !== null && priceP33 !== null
    ? { month: row.month, count, amountManWon, priceP33 } : null;
}

function supplyContext(feed, now) {
  const age = ageDays(feed?.generatedAt, now);
  const notices = Array.isArray(feed?.notices) ? feed.notices : [];
  const partial = feed?.complete === false || ['partial', 'error', 'failed'].includes(feed?.status)
    || ['partial', 'error', 'failed'].includes(feed?.coverage?.status);
  const available = Boolean(feed && !feed.loadError && age !== null && (notices.length || (!partial && feed.complete === true)));
  const result = available ? buildSupplyQuickFilterView(notices, { regions: ['서울', '경기'] }, { now }) : null;
  return {
    status: !available ? 'unavailable' : age > 3 ? 'stale' : partial ? 'partial' : 'ready',
    generatedAt: feed?.generatedAt || null,
    scopeLabel: '수집한 서울·경기 공식 공고',
    openCount: result?.counts.open ?? null,
    soonCount: result?.counts.soon ?? null,
    noticeCount: available ? notices.length : null,
    partial,
    note: !available ? '수집 상태를 확인하지 못해 공고 수를 표시하지 않습니다.'
      : age > 3 ? '이전에 수집한 공고의 현재 일정입니다. 새 공고·변경 일정은 공식 페이지에서 확인하세요.'
        : partial ? '일부 공급원만 수집한 공고 수입니다. 전체 분양 물량이 아닙니다.'
          : '공고 건수이며 공급 세대수·입주 예정 물량과 다릅니다.',
  };
}

/** Read-only dashboard context; never starts a market, commute or private-data request. */
export function buildFinanceMarketContext({ marketSummary, supplyFeed, regionCode, band = '60_85', now = new Date() } = {}) {
  const clock = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const regions = (Array.isArray(marketSummary?.regions) ? marketSummary.regions : [])
    .filter((region) => region?.code && region?.name && Array.isArray(region.monthly));
  const selected = regions.find((region) => String(region.code) === String(regionCode)) || regions[0];
  const selectedBand = FINANCE_MARKET_BANDS.find((item) => item.value === band) || FINANCE_MARKET_BANDS[2];
  const generatedAt = marketSummary?.generatedAt || null;
  const age = ageDays(generatedAt, clock);
  const sourceType = marketSummary?.sourceType || 'empty';
  const usable = selected && ['official', 'imported'].includes(sourceType) && age !== null;
  const rows = usable ? selected.monthly : [];
  const availableMonths = rows.map((row) => monthIndex(row.month)).filter((value) => value !== null);
  const statedEnd = monthIndex(marketSummary?.endMonth || marketSummary?.rangeEnd);
  const end = statedEnd ?? (availableMonths.length ? Math.max(...availableMonths) : null);
  const kst = new Date(clock.getTime() + 9 * 60 * 60 * 1000);
  const current = kst.getUTCFullYear() * 12 + kst.getUTCMonth();
  // Keep the original collection's late-report window even when an old file ages.
  const provisionalMonths = Math.max(2, Math.min(12, Math.trunc(finite(marketSummary?.provisionalMonths) ?? 2)));
  const comparisonIndex = end === null ? null : Math.min(end - provisionalMonths, current - 3);
  const comparisonMonth = comparisonIndex === null ? null : monthKey(comparisonIndex);
  const previousMonth = comparisonIndex === null ? null : monthKey(comparisonIndex - 1);
  const yearAgoMonth = comparisonIndex === null ? null : monthKey(comparisonIndex - 12);
  const partial = marketSummary?.complete === false || ['partial', 'error', 'failed'].includes(marketSummary?.status)
    || marketSummary?.coverage?.complete === false;
  const countAt = (month) => {
    const value = finite(singleRow(rows, month, '매매', 'all')?.count);
    return value !== null && Number.isInteger(value) && value >= 0 ? value : null;
  };
  const sale = priceObservation(singleRow(rows, comparisonMonth, '매매', selectedBand.value));
  const previousSale = priceObservation(singleRow(rows, previousMonth, '매매', selectedBand.value));
  const jeonse = priceObservation(singleRow(rows, comparisonMonth, '전세', selectedBand.value));
  const previousJeonse = priceObservation(singleRow(rows, previousMonth, '전세', selectedBand.value));
  const volume = countAt(comparisonMonth);
  const previousVolume = countAt(previousMonth);
  const yearAgoVolume = countAt(yearAgoMonth);
  const comparable = usable && !partial;
  const market = {
    status: !usable || comparisonIndex === null ? 'unavailable' : age > 45 || current - end > 2 ? 'stale' : partial ? 'partial' : 'ready',
    sourceType, sourceLabel: marketSummary?.source || null, generatedAt,
    regions: regions.map(({ code, name }) => ({ code: String(code), name })),
    regionCode: selected ? String(selected.code) : null,
    regionName: selected?.name || null,
    coverageLabel: `수집된 ${regions.length}개 시군구 중 선택 지역 · 서울·경기 전체 통계 아님`,
    band: selectedBand.value, bandLabel: selectedBand.label,
    comparisonMonth, previousMonth, yearAgoMonth,
    latestMonth: end === null ? null : monthKey(end),
    provisionalMonths,
    volume: { count: volume, previousCount: previousVolume, yearAgoCount: yearAgoVolume,
      momPct: comparable ? percentChange(volume, previousVolume) : null,
      yoyPct: comparable ? percentChange(volume, yearAgoVolume) : null,
      latestReportedCount: end === null ? null : countAt(monthKey(end)) },
    sale: sale ? { ...sale, momPct: comparable ? percentChange(sale.priceP33, previousSale?.priceP33) : null } : null,
    jeonse: jeonse ? { ...jeonse, momPct: comparable ? percentChange(jeonse.priceP33, previousJeonse?.priceP33) : null } : null,
    jeonseToSalePct: comparable && sale && jeonse ? jeonse.priceP33 / sale.priceP33 * 100 : null,
    notes: [
      `수집 종료월의 최근 ${provisionalMonths}개월은 신고 진행 영향으로 증감 비교에서 제외했습니다. 이후에도 정정될 수 있습니다.`,
      '계약 건수는 선택 지역의 전 면적 매매 수록건수입니다. 누락 월은 0건으로 보지 않습니다. 계약일 기준 자료이므로 신고일 기준 국가승인 거래량 통계와 다릅니다.',
      '평균 차이는 같은 면적 구간의 3.3㎡당 산술평균끼리 비교합니다. 매달 거래된 단지·층·세부 면적이 달라 지역 가격변동률·가격지수나 같은 집의 상승률과 다릅니다.',
      '전세/매매 비율은 서로 다른 거래 집단의 단위면적 평균을 나눈 참고값입니다. 개별 집의 전세가율·보증금 안전성 판단에 쓰지 않습니다.',
      ...(partial ? ['수집이 불완전하여 증감률과 전세/매매 비율을 보류합니다.'] : []),
      ...(sourceType === 'imported' ? ['가져온 CSV 범위이며 지역 전체 거래를 뜻하지 않을 수 있습니다.'] : []),
    ],
  };
  return { market, supply: supplyContext(supplyFeed, clock) };
}
