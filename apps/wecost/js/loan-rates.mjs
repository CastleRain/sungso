import { financeSeriesState, financeDateLabel } from '../../../shared/finance/market-rate-evidence.mjs';

export const MARKET_RATES_URL = new URL('../../homehunt/data/finance-dashboard.json', import.meta.url).href;
export function mortgageEvidence(snapshot, now = new Date()) {
  const row = snapshot?.series?.find(r => r.id === 'mortgage_new' && r.kind === 'average' && r.unit === '%' && r.frequency === 'monthly');
  return { ...financeSeriesState(row, { now }), row: row || null };
}
export function createLoanRateReader({ fetchImpl = globalThis.fetch, now = () => new Date(), onChange = () => {} } = {}) {
  let snapshot = null, loading = false, error = '', generation = 0, stopped = false;
  const get = () => ({ ...mortgageEvidence(snapshot, now()), loading, error });
  const publish = () => { if (!stopped) onChange(get()); };
  return {
    get,
    async refresh() {
      if (loading || stopped) return;
      loading = true; error = ''; const token = ++generation; publish();
      try {
        const response = await fetchImpl(MARKET_RATES_URL, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw Error('공식 금리 자료를 불러오지 못했어요.');
        const next = await response.json();
        if (token !== generation || stopped) return;
        snapshot = next;
      } catch { if (token === generation) error = '자료 조회 실패 · 이전 확인값 또는 직접 입력 조건을 확인해주세요.'; }
      finally { if (token === generation && !stopped) { loading = false; publish(); } }
    },
    stop() { stopped = true; generation++; snapshot = null; },
  };
}
export function scenarioWithRate(scenario = {}, market) {
  const automatic = scenario.rateMode === 'market' || (!scenario.rateMode && !scenario.terms);
  if (!automatic) return { ...scenario, rateMode: 'manual' };
  // Unavailable evidence is never replaced by a silent 3.5% default.
  return { ...scenario, rateMode: 'market', terms: { ...(scenario.terms || { term: 30, grace: 0, type: '원리금' }), rate: market?.usable ? market.value : null } };
}
export const marketRateLabel = market => market?.row ? `${financeDateLabel(market.row.observationDate)} 신규 주담대 평균` : '주담대 평균금리 확인 중';
