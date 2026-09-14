// The couple explicitly chose this date for every invitation preview.
const date = {year: 2027, month: 3, day: 6, hour: 14, minute: 0};
const pad = value => String(value).padStart(2, '0');
const instant = new Date(Date.UTC(date.year, date.month - 1, date.day));
const weekdayIndex = instant.getUTCDay();
const weekday = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'][weekdayIndex];
const weekdayEnglish = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][weekdayIndex];
const monthFull = ['January','February','March','April','May','June','July','August','September','October','November','December'][date.month-1];
const monthEn = monthFull.slice(0,3).toUpperCase();
const monthKo = ['일월','이월','삼월','사월','오월','유월','칠월','팔월','구월','시월','십일월','십이월'][date.month-1];
const dayKo = ['첫','두 번째','세 번째','네 번째','다섯 번째','여섯 번째','일곱 번째','여덟 번째','아홉 번째','열 번째'][date.day-1] || `${date.day}번째`;
const yearText = String(date.year), monthPadded = pad(date.month), dayPadded = pad(date.day);
const hour12 = date.hour % 12 || 12;
const time24 = `${pad(date.hour)}:${pad(date.minute)}`;
const time12 = `${hour12}:${pad(date.minute)} ${date.hour < 12 ? 'AM' : 'PM'}`;
const koDate = `${date.year}년 ${date.month}월 ${date.day}일`;
const koTime = `${date.hour < 12 ? '오전' : '오후'} ${hour12}시${date.minute ? ` ${date.minute}분` : ''}`;
export const WEDDING = Object.freeze({
  ...date, yearText, monthPadded, dayPadded,
  iso: `${yearText}-${monthPadded}-${dayPadded}`,
  dotted: `${yearText}. ${monthPadded}. ${dayPadded}`,
  compact: `${yearText}.${monthPadded}.${dayPadded}`,
  middleDots: `${yearText} · ${monthPadded} · ${dayPadded}`,
  dashes: `${yearText} — ${monthPadded} — ${dayPadded}`,
  monthDay: `${monthPadded}.${dayPadded}`, code: `${monthPadded}${dayPadded}`,
  koDate, koLong: `${koDate} ${weekday}`, koTime, koFull: `${koDate} ${weekday} ${koTime}`,
  time24, time12, weekday, weekdayEn: weekdayEnglish.toUpperCase(), weekdayShort: weekdayEnglish.slice(0,3).toUpperCase(),
  monthEn, monthFull, monthKo, dayKo: `${dayKo} 날.`,
  enDate: `${date.day} ${monthEn} ${date.year}`,
  enMonthFirst: `${monthEn} ${date.day}, ${date.year}`,
  enLong: `${weekdayEnglish}, ${monthFull} ${date.day}, ${date.year}`,
  monthYear: `${monthEn} ${date.year}`,
});

export function weddingCalendarCells() {
  const first = new Date(Date.UTC(WEDDING.year, WEDDING.month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(WEDDING.year, WEDDING.month, 0)).getUTCDate();
  return [...Array(first).fill(null), ...Array.from({length: days}, (_, index) => index + 1)];
}
