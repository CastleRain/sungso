import { marketRateLabel } from './loan-rates.mjs';
import { esc, button } from './planning-ui.mjs';
import { safeFinanceSourceUrl } from '../../../shared/finance/market-rate-evidence.mjs';
export function loanRateHTML(market, mode = 'market') {
  const href = safeFinanceSourceUrl(market?.row?.sourceUrl);
  return `<div class="plan-rate-evidence"><div><strong>${market?.usable ? `공표 평균 연 ${market.value}%` : market?.loading ? '금리 자료 확인 중…' : '최신 금리 확인 필요'}</strong><small>${esc(marketRateLabel(market))}${mode === 'manual' ? ' · 현재 비교는 직접 입력 금리' : ' · 추가 대출 비교에 반영'}</small></div>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">한국은행 자료 ↗</a>` : ''}${button(market?.loading ? '확인 중…' : '금리 새로고침', `data-refresh-loan-rate ${market?.loading ? 'disabled' : ''}`)}<p>새로 공표된 월평균 자료를 사용해요. 회사 대출 등 등록 대출의 약정 금리는 바꾸지 않아요.${market?.error ? ` ${esc(market.error)}` : ''}${!market?.usable && !market?.loading ? ' 유효한 자료가 없으면 직접 금리를 입력해주세요.' : ''}</p></div>`;
}
