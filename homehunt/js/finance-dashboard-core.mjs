const DAY_MS = 86_400_000;
const FIELDS = ['housePriceManWon', 'principalManWon', 'annualRatePct', 'termYears'];

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

function payment(principal, rate, months) {
  if (principal === 0) return 0;
  const monthlyRate = rate / 1200;
  // expm1/log1p preserve precision for small but nonzero rates.
  return monthlyRate === 0 ? principal / months
    : principal * monthlyRate / -Math.expm1(-months * Math.log1p(monthlyRate));
}

/** All money is in 만원. Fixed-rate, monthly annuity, no fees, grace period or rate changes. */
export function calculateMortgage(input = {}) {
  const house = financeNumber(input.housePriceManWon), principal = financeNumber(input.principalManWon);
  const rate = financeNumber(input.annualRatePct), years = financeNumber(input.termYears);
  const errors = {};
  if (house === null || house <= 0 || house > 100_000_000) errors.housePriceManWon = '집값을 0보다 크게 입력해주세요.';
  if (principal === null || principal < 0 || principal > 100_000_000) errors.principalManWon = '대출금액을 0 이상으로 입력해주세요.';
  else if (house !== null && house > 0 && principal > house) errors.principalManWon = '대출금액은 집값 이내로 입력해주세요.';
  if (rate === null || rate < 0 || rate > 100) errors.annualRatePct = '연 금리를 0~100%로 입력해주세요.';
  if (years === null || !Number.isInteger(years) || years < 1 || years > 50) errors.termYears = '상환기간을 1~50년의 정수로 입력해주세요.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const months = years * 12, monthlyPaymentManWon = payment(principal, rate, months);
  const totalRepaymentManWon = monthlyPaymentManWon * months;
  return {
    ok: true, errors: {}, months, housePriceManWon: house, principalManWon: principal, annualRatePct: rate, termYears: years,
    ownFundsManWon: house - principal, loanRatioPct: principal / house * 100,
    monthlyPaymentManWon, totalRepaymentManWon, totalInterestManWon: Math.max(0, totalRepaymentManWon - principal),
    sensitivity: [-1, 0, 1].map(delta => {
      const scenarioRate = Math.max(0, Math.min(100, rate + delta));
      const monthly = payment(principal, scenarioRate, months);
      return { delta, annualRatePct: scenarioRate, monthlyPaymentManWon: monthly,
        differenceManWon: monthly - monthlyPaymentManWon, clipped: scenarioRate !== rate + delta };
    }),
  };
}

export function createFinanceCalculatorState() {
  return { housePriceManWon: '', principalManWon: '', annualRatePct: '', termYears: '30', edited: {},
    amountDefaultSource: '', rateDefaultSource: '', defaultPrincipal: false };
}

export function editFinanceCalculator(state, field, value) {
  if (!FIELDS.includes(field)) return state;
  return { ...state, [field]: String(value), edited: { ...state.edited, [field]: true },
    ...(field === 'annualRatePct' ? { rateDefaultSource: '직접 입력한 계산 가정' } : {}),
    ...(field === 'principalManWon' ? { defaultPrincipal: false } : {}),
    ...(field === 'housePriceManWon' ? { amountDefaultSource: '직접 입력한 집값', defaultPrincipal: false } : {}) };
}

export function synchronizeFinanceDefaults(state, context = {}, snapshot = null, options = {}) {
  const next = { ...state, edited: { ...state.edited } };
  const target = financeNumber(context.targetPriceManWon);
  if (!state.edited.housePriceManWon && target !== null && target > 0) {
    next.housePriceManWon = String(target);
    next.amountDefaultSource = context.targetPriceSource === 'wecost' ? 'WeCost에서 연결한 목표가격'
      : typeof context.targetPriceSource === 'string' && context.targetPriceSource ? context.targetPriceSource : '현재 집 찾기 목표가격';
    if (!state.edited.principalManWon) {
      next.principalManWon = String(Math.round(target / 2));
      next.defaultPrincipal = true;
    }
  }
  if (!state.edited.annualRatePct) {
    const rates = snapshot?.series || snapshot?.rates || [];
    const row = Array.isArray(rates) ? rates.find(value => value.id === 'mortgage_new' && value.kind === 'average') : null;
    const evidence = financeSeriesState(row, options);
    next.annualRatePct = evidence.usable ? String(evidence.value) : '';
    next.rateDefaultSource = evidence.usable
      ? `${financeDateLabel(row.observationDate)} 신규 주담대 평균 · 계산 가정` : '적용할 연 금리를 직접 입력해주세요.';
  }
  return next;
}
