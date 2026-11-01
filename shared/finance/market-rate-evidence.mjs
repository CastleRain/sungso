const DAY_MS = 86_400_000;

export function financeNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Only ordinary HTTPS source links are rendered; never accept credentials or code URLs. */
export function safeFinanceSourceUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) return '';
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port
      ? parsed.href : '';
  } catch { return ''; }
}

function parsedDate(value, monthEnd = false) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3] || 1);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (!match[3] && monthEnd) return Date.UTC(year, month, 0, 23, 59, 59);
  const instant = Date.parse(value.length === 7 ? `${value}-01T00:00:00Z` : value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isFinite(instant) ? instant : null;
}

export function financeDateLabel(value, { time = false } = {}) {
  if (parsedDate(value) === null) return '미확인';
  if (value.length === 7) return `${value.slice(0, 4)}년 ${Number(value.slice(5, 7))}월`;
  if (value.length === 10 || !time) return value.slice(0, 10).replaceAll('-', '.');
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** A recent fetch never makes an old monthly observation current. Decision rates can remain unchanged. */
export function financeSeriesState(row, { now = new Date(), checkedMaxDays = 7, observationMaxDays = 100 } = {}) {
  const numeric = financeNumber(row?.value);
  const sourceUrl = safeFinanceSourceUrl(row?.sourceUrl);
  const checkedAt = parsedDate(row?.checkedAt);
  const observationStart = parsedDate(row?.observationDate);
  const observationEnd = parsedDate(row?.observationDate, true);
  const publishedAt = parsedDate(row?.publishedAt);
  const instant = new Date(now).getTime();
  if (!row || !Number.isFinite(instant) || numeric === null || numeric < 0 || numeric > 100 || !sourceUrl
      || row.status === 'unavailable' || !['ok', 'stale'].includes(row.status)
      || checkedAt === null || observationStart === null || (row.publishedAt != null && publishedAt === null)) {
    return { status: 'unavailable', label: '확인 필요', usable: false, value: null, sourceUrl,
      reason: row?.statusMessage || '공식 수치와 기준일을 함께 확인하지 못했습니다.' };
  }
  // An observation/publication expressed as a Korean calendar date can precede UTC midnight.
  const koreanDayEnd = Date.UTC(new Date(instant + 9 * 3_600_000).getUTCFullYear(),
    new Date(instant + 9 * 3_600_000).getUTCMonth(), new Date(instant + 9 * 3_600_000).getUTCDate(), 23, 59, 59);
  if (checkedAt > instant + 5 * 60_000 || observationStart > koreanDayEnd || (publishedAt !== null && publishedAt > koreanDayEnd)) {
    return { status: 'unavailable', label: '날짜 확인 필요', usable: false, value: null, sourceUrl,
      reason: '아직 도래하지 않은 기준일 또는 확인 시각입니다.' };
  }
  const checkedAgeDays = Math.max(0, (instant - checkedAt) / DAY_MS);
  const observationAgeDays = Math.max(0, (instant - observationEnd) / DAY_MS);
  const oldCheck = checkedAgeDays > checkedMaxDays;
  const oldObservation = row.frequency === 'monthly' && observationAgeDays > observationMaxDays;
  const stale = row.status === 'stale' || oldCheck || oldObservation;
  return { status: stale ? 'stale' : 'ok', label: stale ? '갱신 확인 필요' : '공식 자료', usable: !stale,
    value: numeric, sourceUrl, checkedAgeDays, observationAgeDays,
    reason: stale ? oldObservation ? '기준월이 오래되었습니다. 현재 금리로 사용하지 않습니다.'
      : '이전 확인값입니다. 최신 공표자료를 다시 확인해주세요.' : '' };
}
