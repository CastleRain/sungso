import {shiftDate} from './analysis.mjs';

// Use the archive's complete date, never the computer's current date.
// Patches leave the independent partial-day setting unchanged.
export function periodMonths(data) {
  const months = new Set([
    ...(data.monthly || []).map(row => row.month),
    ...(data.daily || []).map(row => row.date.slice(0, 7)),
  ]);
  return [...months].filter(month => month >= data.start.slice(0, 7) && month <= data.end.slice(0, 7)).sort();
}

export function recentPeriod(data, days) {
  if (!data.complete_through || !Number.isInteger(days) || days < 1) return null;
  const end = data.complete_through < data.end ? data.complete_through : data.end;
  if (end < data.start) return null;
  const from = shiftDate(end, 1 - days);
  return {mode: 'range', range: [from < data.start ? data.start : from, end]};
}

export function matchesPeriodPreset(selection, patch) {
  if (!patch || selection.mode !== patch.mode) return false;
  if (patch.mode === 'range') return selection.range?.[0] === patch.range[0] && (selection.range?.[1] || selection.range?.[0]) === patch.range[1];
  if (patch.mode === 'month') return selection.month === patch.month;
  return patch.mode === 'all';
}

export function adjacentPeriodMonth(months, month, direction) {
  if (direction < 0) return [...months].reverse().find(value => value < month) || null;
  if (direction > 0) return months.find(value => value > month) || null;
  return null;
}
