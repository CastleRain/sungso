import { average, normalizeTransaction } from './market-core.mjs';

function usableRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = normalizeTransaction(raw);
  if (!record) return null;
  const month = record.month.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!month || Number(month[1]) < 1) return null;
  // Missing contract day (0) does not invalidate a known month or price. An
  // impossible supplied date does, and must never appear as a latest contract.
  const endOfMonth = new Date(0);
  endOfMonth.setUTCFullYear(Number(month[1]), Number(month[2]), 0);
  if (!Number.isInteger(record.day) || record.day < 0 || record.day > endOfMonth.getUTCDate()) return null;
  return record;
}

/**
 * Summarizes one selected apartment's already period/type-filtered transactions.
 *
 * `averageManWon` is the arithmetic mean of individual contracts across ALL
 * supplied months, not the average of monthly averages and not the latest month.
 * `latestMonth*` describes only the most recent month WITH accepted contracts.
 * The caller owns the selected/actual response range and its completeness label;
 * first/last observed contracts cannot establish complete monthly coverage.
 *
 * The 0.1㎡ key exactly matches the history select and detail filter contract.
 * Different transaction types are never merged even if the caller accidentally
 * supplies mixed input. Duplicate ids follow buildMarketSummary's last-row-wins
 * rule. Re-normalization reuses its cancellation, price, and per-3.3㎡ semantics.
 */
export function buildMarketAreaOverview(records = []) {
  const normalized = (Array.isArray(records) ? records : []).map(usableRecord).filter(Boolean);
  const deduped = [...new Map(normalized.map((record) => [record.id, record])).values()];
  const groups = new Map();
  deduped.forEach((record) => {
    const areaM2 = Math.round(record.areaM2 * 10) / 10;
    if (areaM2 <= 0) return;
    const areaKey = areaM2.toFixed(1);
    const key = `${record.dealType}|${areaKey}`;
    if (!groups.has(key)) groups.set(key, { areaM2, areaKey, dealType: record.dealType, records: [] });
    groups.get(key).records.push(record);
  });
  return [...groups.values()].map((group) => {
    const amounts = group.records.map((record) => record.amountManWon);
    const latestMonth = group.records.reduce((latest, record) => record.month > latest ? record.month : latest, '');
    const latestRecords = group.records.filter((record) => record.month === latestMonth);
    const latestDay = latestRecords.reduce((latest, record) => Math.max(latest, record.day), 0);
    const latestContractDate = latestRecords.some((record) => !record.day)
      ? null : `${latestMonth}-${String(latestDay).padStart(2, '0')}`;
    return {
      areaKey: group.areaKey,
      areaM2: group.areaM2,
      dealType: group.dealType,
      count: group.records.length,
      averageManWon: average(amounts),
      minManWon: amounts.reduce((minimum, value) => Math.min(minimum, value), Infinity),
      maxManWon: amounts.reduce((maximum, value) => Math.max(maximum, value), -Infinity),
      averageP33: average(group.records.map((record) => record.priceP33)),
      latestContractDate,
      latestMonth,
      latestMonthCount: latestRecords.length,
      latestMonthAverageManWon: average(latestRecords.map((record) => record.amountManWon)),
      averageBasis: 'selected-period',
    };
  }).sort((left, right) => left.areaM2 - right.areaM2 || left.dealType.localeCompare(right.dealType, 'ko'));
}
