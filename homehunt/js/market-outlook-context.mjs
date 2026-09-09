import { average, buildMarketSummary, getSeries, normalizeTransaction } from './market-core.mjs?v=4.17.0';

function monthIndex(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  return match && Number(match[1]) > 0 ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

function validMonthIndex(value) {
  return Number.isInteger(value) && value >= 12 && value <= 119999;
}

function monthFromIndex(value) {
  return validMonthIndex(value)
    ? `${String(Math.floor(value / 12)).padStart(4, '0')}-${String(value % 12 + 1).padStart(2, '0')}`
    : null;
}

function usableRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = normalizeTransaction(raw);
  if (!record || monthIndex(record.month) === null) return null;
  const year = Math.floor(record.monthIndex / 12);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][record.monthIndex % 12];
  // Day 0 means only the contract month is known. Impossible supplied days are rejected.
  if (!Number.isInteger(record.day) || record.day < 0 || record.day > daysInMonth) return null;
  return record;
}

/**
 * Builds observations for ONE already selected apartment, independently of its
 * display range. The caller supplies the validated loaded range and an explicit
 * reference month; observed transaction dates never imply complete coverage.
 *
 * With no loaded range, only the supplied display range is trusted. A malformed
 * or half-supplied loaded range fails closed instead of silently expanding it.
 * `trainingRange.months` counts calendar coverage, not months with transactions.
 * The recent reference always uses the reference month and its two predecessors,
 * including empty months, and never substitutes older trades for missing ones.
 * All prices are arithmetic contract averages in 만원 (rentals: deposit only).
 */
export function buildMarketOutlookContext(records = [], {
  dealType = '매매', areaM2, rangeStart, rangeEnd,
  loadedRangeStart, loadedRangeEnd, asOfMonthIndex, partial = false,
} = {}) {
  const asOf = validMonthIndex(asOfMonthIndex) ? asOfMonthIndex : null;
  const hasLoadedRange = loadedRangeStart !== undefined || loadedRangeEnd !== undefined;
  const suppliedStart = monthIndex(hasLoadedRange ? loadedRangeStart : rangeStart);
  const suppliedEnd = monthIndex(hasLoadedRange ? loadedRangeEnd : rangeEnd);
  let start = null;
  let end = null;
  if (asOf !== null && suppliedStart !== null && suppliedEnd !== null && suppliedStart <= suppliedEnd) {
    const clippedEnd = Math.min(suppliedEnd, asOf);
    if (suppliedStart <= clippedEnd) {
      end = clippedEnd;
      start = Math.max(suppliedStart, clippedEnd - 59);
    }
  }
  const trainingRange = {
    rangeStart: monthFromIndex(start), rangeEnd: monthFromIndex(end),
    months: start === null ? 0 : end - start + 1,
  };
  const selectedArea = Math.round(Number(areaM2) * 10) / 10;
  const normalized = start === null || !Number.isFinite(selectedArea) || selectedArea <= 0
    ? [] : (Array.isArray(records) ? records : []).map(usableRecord).filter(Boolean);
  const accepted = [...new Map(normalized.map((record) => [record.id, record])).values()]
    .filter((record) => record.dealType === dealType
      && Math.round(record.areaM2 * 10) / 10 === selectedArea
      && record.monthIndex >= start && record.monthIndex <= end)
    .sort((left, right) => left.monthIndex - right.monthIndex || left.day - right.day);
  // The input is one apartment. Missing/differing region metadata must not drop
  // accepted contracts from its series while leaving them in reference prices.
  const seriesRegion = 'selected-complex';
  const summary = buildMarketSummary(accepted.map((record) => ({ ...record, regionCode: seriesRegion })), {
    sourceType: 'complex', generatedAt: `${monthFromIndex(asOf) || '1970-01'}-01T00:00:00.000Z`,
  });
  const series = getSeries(summary, seriesRegion, dealType, 'all');
  const latestIndex = accepted.at(-1)?.monthIndex ?? null;
  const latest = accepted.filter((record) => record.monthIndex === latestIndex);
  const recentStart = asOf === null ? null : asOf - 2;
  const recent = accepted.filter((record) => recentStart !== null && record.monthIndex >= recentStart && record.monthIndex <= asOf);
  const recentAmounts = recent.map((record) => record.amountManWon);
  return {
    records: accepted,
    series,
    trainingRange,
    reference: {
      latestMonth: monthFromIndex(latestIndex),
      latestAverageManWon: average(latest.map((record) => record.amountManWon)),
      latestCount: latest.length,
      recentStartMonth: monthFromIndex(recentStart),
      recentEndMonth: monthFromIndex(asOf),
      recentAverageManWon: average(recentAmounts),
      recentMinManWon: recentAmounts.length ? recentAmounts.reduce((minimum, value) => Math.min(minimum, value), Infinity) : null,
      recentMaxManWon: recentAmounts.length ? recentAmounts.reduce((maximum, value) => Math.max(maximum, value), -Infinity) : null,
      recentCount: recent.length,
      staleMonths: latestIndex === null ? null : asOf - latestIndex,
      provisional: latestIndex !== null && latestIndex >= asOf - 1,
      partial: partial === true,
    },
  };
}
