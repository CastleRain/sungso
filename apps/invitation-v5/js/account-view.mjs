import { publishedAccounts } from './core.mjs?v=5.0.0';
import { safePayUrl } from '../../../shared/invitation/account-core.mjs';
const e = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function renderAccounts(groups) {
  const sides = ['groom', 'bride'].map(id => ({
    id, label: id === 'groom' ? '신랑 측' : '신부 측',
    accounts: groups.filter(group => group.id ? group.id === id || group.id === `${id}-parents` : group.label?.includes(id === 'groom' ? '신랑' : '신부')).flatMap(publishedAccounts),
  })).filter(side => side.accounts.length);
  if (!sides.length) return '';
  return `<div class="account-book">
    <div class="account-tabs" role="tablist" aria-label="계좌 안내" hidden>${sides.map(side => `<button type="button" role="tab" id="account-tab-${side.id}" aria-controls="account-panel-${side.id}" aria-selected="false" tabindex="-1" data-account-side="${side.id}"><span>${side.label}</span><small aria-hidden="true">${side.id === 'groom' ? 'GROOM' : 'BRIDE'}</small></button>`).join('')}</div>
    ${sides.map(side => `<section class="account-panel" id="account-panel-${side.id}" data-account-panel="${side.id}">
      <h3 class="account-side-title">${side.label}</h3>
      ${side.accounts.map(account => {
        const relation = account.relation === '신랑' || account.relation === '신부' ? account.relation : `${side.label.replace(' 측', '')} ${account.relation}`;
        const context = `${relation} ${account.holder}`;
        const pay = safePayUrl(account.payUrl);
        return `<article class="account-recipient">
          <div class="account-person"><span>${e(account.relation)}</span><strong>${e(account.holder)}</strong></div>
          <div class="account-transfer">
            <div class="account-destination"><span>${e(account.bank)}</span><span class="account-digits">${e(account.number)}</span></div>
            <button type="button" class="account-copy" data-copy-account="${e(account.number.replace(/\D/g, ''))}" data-account-holder="${e(context)}" aria-label="${e(context)} 계좌번호 복사"><svg viewBox="0 0 24 24" aria-hidden="true"><rect class="copy-sheet" x="8" y="8" width="12" height="13" rx="2"/><path class="copy-sheet" d="M15 5V3H3v13h2"/><path class="copy-tick" d="m5 12 4 4 10-10"/></svg><span>복사</span></button>
          </div>
          ${pay ? `<a class="account-pay" href="${e(pay)}" target="_blank" rel="noopener noreferrer" aria-label="${e(context)} 카카오페이 송금 페이지 새 창"><span class="pay-wordmark">pay</span><span>카카오페이</span><span aria-hidden="true">↗</span></a>` : ''}
        </article>`;
      }).join('')}
    </section>`).join('')}
    <div class="account-receipt" role="status" aria-live="polite" aria-atomic="true"><p class="account-feedback"></p><p class="account-help">계좌번호를 복사해<br>사용하시는 은행 앱에 붙여넣어 주세요.</p></div>
  </div>`;
}
