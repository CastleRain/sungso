const DAY_MS = 24 * 60 * 60 * 1000;

function finiteNumber(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(String(value).replaceAll(',', ''));
  return Number.isFinite(number) ? number : null;
}

function isoDate(date) {
  return Number.isFinite(date?.getTime?.()) ? date.toISOString().slice(0, 10) : null;
}

function parseDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const source = String(value ?? '').trim();
  if (!source) return null;
  const compact = source.replace(/[^0-9]/g, '');
  if (compact.length < 6) return null;
  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = compact.length >= 8 ? Number(compact.slice(6, 8)) : 1;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return date;
}

function recordDate(record) {
  const direct = parseDate(
    record?.contractDate
    ?? record?.dealDate
    ?? record?.date
    ?? record?.transactionDate,
  );
  if (direct) return direct;
  const month = String(record?.month ?? record?.dealMonth ?? '').replace(/[^0-9]/g, '');
  if (month.length < 6) return null;
  const day = String(Math.max(1, Math.trunc(finiteNumber(record?.day) ?? 1))).padStart(2, '0');
  return parseDate(`${month.slice(0, 6)}${day}`);
}

function amount(record) {
  const value = finiteNumber(record?.amountManWon ?? record?.amount ?? record?.priceManWon);
  return value !== null && value > 0 ? value : null;
}

function isCancelled(record) {
  return Boolean(
    String(record?.canceled ?? record?.cancelled ?? '').toLowerCase() === 'true'
    || String(record?.canceled ?? record?.cancelled ?? '') === '1'
    || String(record?.cancelDate ?? record?.cancellationDate ?? record?.해제사유발생일 ?? '').trim(),
  );
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function canonicalRecords(records = [], options = {}) {
  const targetArea = finiteNumber(options.areaM2);
  const areaTolerance = Math.max(0, finiteNumber(options.areaToleranceM2) ?? 0.05);
  const dealType = String(options.dealType ?? '').trim();
  return records.flatMap((record, index) => {
    const date = recordDate(record);
    const amountManWon = amount(record);
    const areaM2 = finiteNumber(record?.areaM2 ?? record?.exclusiveAreaM2);
    if (!date || amountManWon === null || isCancelled(record)) return [];
    if (targetArea !== null && (areaM2 === null || Math.abs(areaM2 - targetArea) > areaTolerance)) return [];
    if (dealType && String(record?.dealType ?? '').trim() !== dealType) return [];
    return [{
      record,
      id: record?.id ?? `record-${index}`,
      date,
      dateText: isoDate(date),
      amountManWon,
      areaM2,
    }];
  }).sort((a, b) => a.date - b.date || a.amountManWon - b.amountManWon);
}

function summarize(selection, method, windowDays) {
  if (!selection.length) {
    return {
      available: false,
      method,
      windowDays,
      medianManWon: null,
      averageManWon: null,
      sampleSize: 0,
      rangeManWon: { min: null, max: null },
      startDate: null,
      endDate: null,
      recordIds: [],
    };
  }
  const values = selection.map((item) => item.amountManWon);
  return {
    available: true,
    method,
    windowDays,
    medianManWon: median(values),
    averageManWon: average(values),
    sampleSize: selection.length,
    rangeManWon: { min: Math.min(...values), max: Math.max(...values) },
    startDate: selection[0].dateText,
    endDate: selection.at(-1).dateText,
    recordIds: selection.map((item) => item.id),
  };
}

/**
 * Uses only transactions on/before the visit for the preferred baseline.
 * When that sample is too small, it explicitly widens to ±windowDays.
 */
export function selectVisitActualBaseline(records = [], visitDate, options = {}) {
  const visit = parseDate(visitDate);
  const windowDays = Math.max(1, Math.trunc(finiteNumber(options.windowDays) ?? 90));
  const minSamples = Math.max(1, Math.trunc(finiteNumber(options.minSamples) ?? 3));
  if (!visit) return summarize([], 'invalid-visit-date', windowDays);
  const normalized = canonicalRecords(records, options);
  const before = normalized.filter((item) => {
    const daysBefore = (visit - item.date) / DAY_MS;
    return daysBefore >= 0 && daysBefore <= windowDays;
  });
  if (before.length >= minSamples) return summarize(before, 'preceding-window', windowDays);
  const symmetric = normalized.filter((item) => Math.abs(item.date - visit) / DAY_MS <= windowDays);
  return summarize(symmetric, 'symmetric-window-fallback', windowDays);
}

function firstDayOfLatestMonthWindow(date, months) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() - (months - 1),
    1,
  ));
}

/**
 * The current reference is the latest three calendar months when that window
 * has enough observations; otherwise it falls back to the latest N deals.
 * When a visit boundary is supplied, both paths use post-visit deals only.
 */
export function selectCurrentActualReference(records = [], options = {}) {
  const normalized = canonicalRecords(records, options);
  const months = Math.max(1, Math.trunc(finiteNumber(options.currentWindowMonths) ?? 3));
  const minSamples = Math.max(1, Math.trunc(finiteNumber(options.minCurrentSamples) ?? 3));
  const recentN = Math.max(1, Math.trunc(finiteNumber(options.latestN) ?? 3));
  const hasVisitBoundary = Object.prototype.hasOwnProperty.call(options, 'visitDate')
    || Object.prototype.hasOwnProperty.call(options, 'afterDate');
  const visitBoundary = parseDate(options.visitDate ?? options.afterDate);
  if (hasVisitBoundary && !visitBoundary) {
    return {
      ...summarize([], 'invalid-visit-date', null),
      sparse: true,
      confidence: 'none',
      reason: 'invalid-visit-date',
      requiredSampleSize: minSamples,
      postVisitOnly: true,
      afterDate: null,
      asOfDate: null,
    };
  }
  const eligible = visitBoundary
    ? normalized.filter((item) => item.date > visitBoundary)
    : normalized;
  if (!eligible.length) {
    return {
      ...summarize([], visitBoundary ? 'no-post-visit-transactions' : 'latest-window', null),
      sparse: true,
      confidence: 'none',
      reason: visitBoundary ? 'no-post-visit-transactions' : 'no-transactions',
      requiredSampleSize: minSamples,
      postVisitOnly: Boolean(visitBoundary),
      afterDate: isoDate(visitBoundary),
      asOfDate: null,
    };
  }
  const latestDate = eligible.at(-1).date;
  const windowStart = firstDayOfLatestMonthWindow(latestDate, months);
  const recentWindow = eligible.filter((item) => item.date >= windowStart && item.date <= latestDate);
  if (recentWindow.length >= minSamples) {
    return {
      ...summarize(recentWindow, 'latest-month-window', null),
      windowMonths: months,
      asOfDate: isoDate(latestDate),
      sparse: false,
      confidence: 'standard',
      reason: null,
      requiredSampleSize: minSamples,
      postVisitOnly: Boolean(visitBoundary),
      afterDate: isoDate(visitBoundary),
    };
  }
  const latest = eligible.slice(-recentN);
  return {
    ...summarize(latest, 'latest-n-fallback', null),
    latestN: recentN,
    asOfDate: isoDate(latestDate),
    sparse: true,
    confidence: 'low',
    reason: 'insufficient-latest-window-samples',
    requiredSampleSize: minSamples,
    postVisitOnly: Boolean(visitBoundary),
    afterDate: isoDate(visitBoundary),
  };
}

function difference(current, baseline) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline <= 0) {
    return { available: false, amountManWon: null, percent: null, direction: 'unknown' };
  }
  const amountManWon = current - baseline;
  return {
    available: true,
    amountManWon,
    percent: amountManWon / baseline * 100,
    direction: amountManWon > 0 ? 'up' : (amountManWon < 0 ? 'down' : 'flat'),
  };
}

/**
 * Keeps three different facts separate:
 * 1) the asking/checked price saved at the visit,
 * 2) actual deals around the visit date,
 * 3) the latest actual-deal reference.
 * `marketChange` is calculated only from (2) and (3).
 */
export function buildVisitBenchmark(records = [], visit = {}, options = {}) {
  const visitDate = visit.visitDate ?? options.visitDate;
  const askingPriceManWon = finiteNumber(
    visit.askingPriceManWon
    ?? visit.askingPrice
    ?? options.askingPriceManWon
    ?? options.askingPrice,
  );
  const shared = {
    ...options,
    areaM2: visit.areaM2 ?? options.areaM2,
    dealType: visit.dealType ?? options.dealType,
  };
  const visitActualBaseline = selectVisitActualBaseline(records, visitDate, shared);
  const currentActualReference = selectCurrentActualReference(records, {
    ...shared,
    visitDate,
  });
  const parsedVisitDate = parseDate(visitDate);
  const currentAsOfDate = parseDate(currentActualReference.asOfDate);
  const hasPostVisitEvidence = Boolean(
    parsedVisitDate
    && currentAsOfDate
    && currentAsOfDate > parsedVisitDate,
  );
  const marketChange = hasPostVisitEvidence
    ? {
      ...difference(currentActualReference.averageManWon, visitActualBaseline.averageManWon),
      sparse: currentActualReference.sparse,
      confidence: currentActualReference.confidence,
      currentSampleSize: currentActualReference.sampleSize,
    }
    : {
      available: false,
      amountManWon: null,
      percent: null,
      direction: 'unknown',
      reason: 'no-post-visit-transaction',
      sparse: true,
      confidence: 'none',
      currentSampleSize: currentActualReference.sampleSize,
    };
  const askingVsVisitMarket = difference(
    askingPriceManWon,
    visitActualBaseline.averageManWon,
  );

  return {
    visitDate: isoDate(parsedVisitDate),
    areaM2: finiteNumber(shared.areaM2),
    dealType: String(shared.dealType ?? '').trim() || null,
    askingPriceManWon,
    visitActualBaseline,
    currentActualReference,
    marketChange,
    askingVsVisitMarket,
    hasPostVisitEvidence,
    marketChangeBasis: 'currentActualReference.averageManWon - visitActualBaseline.averageManWon',
    askingPriceExcludedFromMarketChange: true,
  };
}
