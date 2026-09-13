export function nextWeekdaySearchDateTime(time = '08:00', nowMs = Date.now()) {
  const raw = String(time ?? '').trim() || '08:00';
  const match = /^(\d{2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  const korea = new Date(nowMs + 9 * 60 * 60 * 1000);
  const candidate = new Date(Date.UTC(korea.getUTCFullYear(), korea.getUTCMonth(), korea.getUTCDate(), hour, minute));
  const nowMinute = Date.UTC(korea.getUTCFullYear(), korea.getUTCMonth(), korea.getUTCDate(), korea.getUTCHours(), korea.getUTCMinutes());
  if (candidate.getTime() <= nowMinute) candidate.setUTCDate(candidate.getUTCDate() + 1);
  while (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) candidate.setUTCDate(candidate.getUTCDate() + 1);

  return `${candidate.getUTCFullYear()}${String(candidate.getUTCMonth() + 1).padStart(2, '0')}${String(candidate.getUTCDate()).padStart(2, '0')}${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`;
}
