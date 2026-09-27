import {analyzeSelection, total} from './analysis.mjs';

/**
 * Evidence available in the authenticated sales snapshot, not attendance data.
 * record_day is the source's payment-record flag, not amount > 0. A net-zero
 * payment day may be recorded; a refund-only day may have a negative amount
 * without that flag. Never interpret an unrecorded day as a closed store.
 */
export function operatingSummary(data, selection) {
  const analysis = analyzeSelection(data, selection);
  const byDate = new Map(data.daily.map(row => [row.date, row]));
  const included = new Set(analysis.rows.map(row => row.date));
  const chosen = new Set(analysis.dates);
  const hoursByDate = new Map();
  for (const row of data.menu_toss || []) {
    const day = byDate.get(row.date);
    if (!chosen.has(row.date) || day?.source !== 'toss' || day.partial_day
      || !Number.isInteger(row.hour) || row.hour < 0 || row.hour > 23
      || !(Number(row.quantity) !== 0 || Number(row.amount) !== 0)) continue;
    const range = hoursByDate.get(row.date);
    hoursByDate.set(row.date, {
      firstHour: range ? Math.min(range.firstHour, row.hour) : row.hour,
      lastHour: range ? Math.max(range.lastHour, row.hour) : row.hour,
    });
  }
  const rows = analysis.dates.map(date => {
    const day = byDate.get(date);
    if (!day) return {date, source: null, amount: null, recordDay: null, partialDay: false,
      included: false, status: 'missing', observedHours: null};
    return {date, source: day.source, amount: day.amount, recordDay: !!day.record_day,
      partialDay: !!day.partial_day, included: included.has(date),
      status: day.partial_day ? 'partial' : day.record_day ? 'recorded' : 'no-record',
      // These are hour buckets of menu order records, including retained refunds.
      // They cannot establish exact first/last transactions or hours worked.
      observedHours: hoursByDate.get(date) || null};
  });
  const datesWhere = predicate => rows.filter(predicate).map(row => row.date);
  const completeRecordedDates = datesWhere(row => row.recordDay && !row.partialDay);
  const recordedDates = datesWhere(row => row.recordDay);
  const zeroRecordDates = datesWhere(row => row.recordDay === false && !row.partialDay);
  const partialDates = datesWhere(row => row.partialDay);
  const missingDates = datesWhere(row => row.status === 'missing');
  const completeRecordedAmount = total(rows.filter(row => row.recordDay && !row.partialDay), 'amount');
  const completeRecorded = completeRecordedDates.map(date => byDate.get(date));
  const weekday = Array.from({length: 7}, (_, day) => {
    const records = completeRecorded.filter(row => row.weekday === day);
    const amount = total(records, 'amount'), recordDays = records.length;
    return {weekday: day, amount, recordDays, perRecordDay: recordDays ? amount / recordDays : null};
  });
  return {
    selectedDays: rows.length,
    recordedDates, recordedDays: recordedDates.length,
    completeRecordedDates, completeRecordedDays: completeRecordedDates.length,
    zeroRecordDates, zeroRecordDays: zeroRecordDates.length,
    partialDates, partialDays: partialDates.length,
    missingDates, missingDays: missingDates.length,
    excludedPartialDays: rows.filter(row => row.partialDay && !row.included).length,
    completeRecordedAmount,
    dailyAverage: completeRecordedDates.length ? completeRecordedAmount / completeRecordedDates.length : null,
    rows, weekday,
  };
}
