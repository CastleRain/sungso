const dayMs = 86_400_000;
const pad = value => String(value).padStart(2, '0');

export function koreanDateParts(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) throw new TypeError('올바른 예식 날짜가 필요합니다.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute) };
}

export function calendarDays(iso) {
  const { year, month, day } = koreanDateParts(iso);
  const offset = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const total = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((offset + total) / 7) * 7 }, (_, index) => {
    const number = index - offset + 1;
    return number < 1 || number > total ? null : { day: number, wedding: number === day };
  });
  return { year, month, day, cells };
}

export function daysUntil(iso, now = new Date()) {
  const target = koreanDateParts(iso), today = koreanDateParts(now);
  return Math.round((Date.UTC(target.year, target.month - 1, target.day) - Date.UTC(today.year, today.month - 1, today.day)) / dayMs);
}

export function formatWedding(iso) {
  const { year, month, day, hour, minute } = koreanDateParts(iso);
  const weekday = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'long' }).format(new Date(iso));
  return {
    date: `${year}. ${pad(month)}. ${pad(day)}`,
    dateKorean: `${year}년 ${month}월 ${day}일 ${weekday}`,
    time: `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}시${minute ? ` ${minute}분` : ''}`,
    weekday,
  };
}

const icsEscape = value => String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const utcStamp = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
export function calendarEvent(config) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//sungso//Wedding Invitation//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', 'UID:sungso-wedding-20270306@sungso', 'DTSTAMP:20261019T000000Z',
    `DTSTART:${utcStamp(config.startsAt)}`, ...(config.endsAt ? [`DTEND:${utcStamp(config.endsAt)}`] : []),
    `SUMMARY:${icsEscape(config.title)}`, `LOCATION:${icsEscape(`${config.venue} ${config.room}, ${config.address}`)}`,
    `DESCRIPTION:${icsEscape(`${config.groom}와 ${config.bride}의 결혼식에 초대합니다.\n${config.room}`)}`,
    `URL:${config.canonicalUrl}`, 'END:VEVENT', 'END:VCALENDAR', '',
  ];
  // RFC 5545 folds at 75 octets, not 75 characters (Korean characters are UTF-8).
  return lines.map(line => {
    const folded = []; let current = '', bytes = 0;
    for (const char of line) {
      const size = new TextEncoder().encode(char).length;
      if (bytes + size > 75) { folded.push(current); current = ' '; bytes = 1; }
      current += char; bytes += size;
    }
    folded.push(current); return folded.join('\r\n');
  }).join('\r\n');
}

export function photoIndex(index, length) { return ((index % length) + length) % length; }

export function countdown(startsAt, now = new Date()) {
  const remaining = Math.max(0, Math.ceil((new Date(startsAt).getTime() - new Date(now).getTime()) / 1000));
  const calendarDaysLeft = daysUntil(startsAt, now);
  return {
    days: Math.floor(remaining / 86400), hours: Math.floor(remaining / 3600) % 24,
    minutes: Math.floor(remaining / 60) % 60, seconds: remaining % 60,
    calendarDaysLeft,
    phase: remaining > 0 ? 'waiting' : calendarDaysLeft === 0 ? 'today' : 'past',
  };
}

export function publishedAccounts(group) {
  return (group.accounts || []).filter(account => {
    const number = String(account.number || '').trim();
    return account.holder?.trim() && account.bank?.trim() && /^[0-9 -]{6,40}$/.test(number) && number.replace(/\D/g, '').length >= 6;
  });
}

export function shareUrl(config, location) {
  // A local preview shares its own reachable URL; the published page uses its canonical URL.
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return `${location.origin}${location.pathname}`;
  return config.canonicalUrl;
}
