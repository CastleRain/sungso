import { publishedAccounts } from './core.mjs';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export function safeHttps(value, hosts) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (!hosts || hosts.includes(url.hostname)) ? url.href : '';
  } catch { return ''; }
}

export function renderAccounts(groups) {
  const e = escapeHtml;
  return groups.filter(group => publishedAccounts(group).length).map(group =>
    `<details class="account-group"><summary><span>${e(group.label)}</span><span class="disclosure-plus" aria-hidden="true">＋</span></summary><div class="account-body">${
      publishedAccounts(group).map((account, index) => {
        const pay = safeHttps(account.payUrl, ['qr.kakaopay.com']);
        return `<div class="account-row"><div><p class="account-owner">${e(account.relation)} ${e(account.holder)}</p><p>${e(account.bank)}</p><p class="account-number">${e(account.number)}</p></div><div class="account-actions"><button type="button" class="text-link" data-account="${e(group.id)}-${index}" aria-label="${e(account.holder)} 계좌번호 복사">번호 복사</button>${pay ? `<a class="text-link" href="${e(pay)}" target="_blank" rel="noopener noreferrer">카카오페이 ↗</a>` : ''}</div></div>`;
      }).join('')
    }</div></details>`).join('');
}

export function renderGuestDetails(config) {
  const e = escapeHtml;
  const contacts = (config.contacts || []).filter(item => item.name && /^0\d{8,10}$/.test(String(item.phone).replace(/[- ]/g, '')));
  const contactsHtml = contacts.length ? `<details class="guest-contacts"><summary>두 사람에게 연락하기 <span aria-hidden="true">＋</span></summary>${contacts.map(item => {
    const phone = item.phone.replace(/[- ]/g, '');
    return `<div class="contact-row"><span>${e(item.role)} ${e(item.name)}</span><a href="tel:${phone}" aria-label="${e(item.name)}에게 전화">전화 ↗</a><a href="sms:${phone}" aria-label="${e(item.name)}에게 문자">문자 ↗</a></div>`;
  }).join('')}</details>` : '';
  const rsvp = safeHttps(config.attendanceUrl);
  return {
    contacts: contactsHtml,
    attendance: rsvp ? `<div class="attendance"><p>오실 수 있다면, 미리 알려 주세요.</p><a class="text-link" href="${e(rsvp)}" target="_blank" rel="noopener noreferrer">참석 여부 전하기 ↗</a><p class="form-hint">별도 응답 페이지로 연결됩니다.</p></div>` : '',
    guide: (config.guide || []).filter(item => item.title && item.text).map(item => `<details><summary>${e(item.title)}<span aria-hidden="true">＋</span></summary><p>${e(item.text).replace(/\n/g, '<br>')}</p></details>`).join(''),
  };
}

export function googleCalendarUrl(wedding) {
  const utc = new Date(wedding.startsAt).toISOString().replace(/[-:]|\.\d{3}/g, '');
  // A zero-duration event avoids inventing the ceremony's end time.
  const params = new URLSearchParams({
    action: 'TEMPLATE', text: wedding.title, dates: `${utc}/${utc}`,
    ctz: wedding.timezone, location: `${wedding.venue} ${wedding.room}, ${wedding.address}`,
    details: wedding.canonicalUrl,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
