// Public reference rate only. No wallet amount, identity, or DB writes leave this module.
export const FX_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_KEY = 'wecost.public-usd-krw.v1';
const HOUR = 3600000;
export function validateQuote(value, now = Date.now()) {
  if (!value || typeof value.rate !== 'number' || !Number.isFinite(value.rate) || value.rate <= 0 || value.rate > 1e7
      || !Number.isSafeInteger(value.asOf) || value.asOf <= 0 || value.asOf > now + 300000
      || !Number.isSafeInteger(value.nextAt) || value.nextAt <= value.asOf || value.nextAt > value.asOf + 48 * HOUR) throw Error('환율 응답의 금액과 고시 시각을 확인할 수 없어요.');
  return { rate: value.rate, asOf: value.asOf, nextAt: value.nextAt };
}
export function parseQuote(payload, now = Date.now()) {
  if (payload?.result !== 'success' || payload.base_code !== 'USD' || payload.rates?.USD !== 1) throw Error('달러 기준 환율을 불러오지 못했어요.');
  return validateQuote({ rate: payload.rates.KRW, asOf: payload.time_last_update_unix * 1000, nextAt: payload.time_next_update_unix * 1000 }, now);
}
export function dollarValuation(balance, cost, quote) {
  if (![balance, cost].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return null;
  if (!quote) return null;
  const value = Math.round(balance * quote.rate);
  return Number.isSafeInteger(value) ? { value, difference: value - cost } : null;
}
export const quoteIsOld = (quote, now = Date.now()) => now > quote.nextAt || now - quote.asOf > 36 * HOUR;

export function createFxReader({ fetcher = globalThis.fetch, storage = null, now = Date.now, onChange = () => {} } = {}) {
  let quote = null, loading = false, error = '', pending = null, controller = null, retired = false, lastAttempt = -Infinity;
  try { quote = validateQuote(JSON.parse(storage?.getItem(CACHE_KEY) || 'null'), now()); } catch { /* Missing or malformed public cache is not a rate. */ }
  const snapshot = () => ({ quote: quote && { ...quote }, loading, error });
  const emit = () => { if (!retired) onChange(snapshot()); };
  const request = async signal => fetcher(FX_URL, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  function refresh(force = false) {
    if (retired) return Promise.resolve(snapshot());
    if (pending) return pending;
    if (!force && quote && !quoteIsOld(quote, now())) { emit(); return Promise.resolve(snapshot()); }
    if (now() - lastAttempt < 60000) {
      if (force) error = '방금 조회했어요. 1분 뒤 다시 확인할 수 있어요.';
      emit(); return Promise.resolve(snapshot());
    }
    lastAttempt = now(); loading = true; error = ''; controller = new AbortController(); emit();
    pending = (async () => {
      const timer = setTimeout(() => controller?.abort(), 10000);
      try {
        const response = await request(controller.signal);
        if (!response.ok) throw Error('환율 조회에 실패했어요.');
        const next = parseQuote(await response.json(), now());
        if (retired) return snapshot();
        quote = next;
        // Cache only the public quotation, never the user's dollar balance or cost.
        try { storage?.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* Cache is optional. */ }
      } catch {
        if (!retired) error = quote ? '최신 조회 실패 · 마지막 고시 환율을 표시해요.' : '환율을 가져오지 못했어요. 잠시 후 다시 확인해주세요.';
      } finally {
        clearTimeout(timer); loading = false; controller = null; pending = null; emit();
      }
      return snapshot();
    })();
    return pending;
  }
  return { snapshot, refresh, dispose() { retired = true; controller?.abort(); quote = null; error = ''; } };
}
