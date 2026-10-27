// Only a family key may persist for this tab's session; never names or account details.
export function mountAccountTabs(root, { remember = false } = {}) {
  let selected = '';
  const keyName = 'sungso_invitation_v5_account_side';
  if (remember) {
    try { const value = sessionStorage.getItem(keyName); if (['groom','bride'].includes(value)) selected = value; } catch {}
  }
  function select(id, focus = false) {
    const tabs = [...root.querySelectorAll('[data-account-side]')];
    const active = tabs.find(tab => tab.dataset.accountSide === id) || tabs[0];
    if (selected && selected !== active?.dataset.accountSide) {
      const book = root.querySelector('.account-book');
      book.querySelector('.account-feedback').textContent = '';
      book.querySelector('.account-receipt').classList.remove('has-copy');
      for (const button of book.querySelectorAll('.is-copied')) {
        button.classList.remove('is-copied');
        button.querySelector('span').textContent = '복사';
      }
    }
    selected = active?.dataset.accountSide || '';
    if (remember && selected) { try { sessionStorage.setItem(keyName, selected); } catch {} }
    for (const tab of tabs) {
      const current = tab === active;
      tab.setAttribute('aria-selected', String(current));
      tab.tabIndex = current ? 0 : -1;
    }
    for (const panel of root.querySelectorAll('[data-account-panel]')) {
      panel.hidden = panel.dataset.accountPanel !== selected;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `account-tab-${panel.dataset.accountPanel}`);
      panel.tabIndex = 0;
    }
    if (focus) active?.focus({preventScroll:true});
  }
  const click = event => {
    const tab = event.target.closest?.('[data-account-side]');
    if (tab && root.contains(tab)) select(tab.dataset.accountSide);
  };
  const key = event => {
    const tab = event.target.closest?.('[data-account-side]');
    if (!tab || !root.contains(tab)) return;
    const tabs = [...root.querySelectorAll('[data-account-side]')], index = tabs.indexOf(tab);
    const next = {ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1}[event.key];
    if (next === undefined) return;
    event.preventDefault(); select(tabs[next].dataset.accountSide, true);
  };
  root.addEventListener('click', click);
  root.addEventListener('keydown', key);
  return {
    refresh() {
      const bar = root.querySelector('.account-tabs');
      if (!bar) return;
      bar.hidden = false;
      root.querySelector('.account-book').classList.add('is-enhanced');
      select(selected);
    },
    dispose() { root.removeEventListener('click', click); root.removeEventListener('keydown', key); selected = ''; },
  };
}

export function showAccountCopyResult(button, success) {
  if (!button.isConnected || button.closest('[data-account-panel]')?.hidden) return;
  const book = button.closest('.account-book');
  for (const other of book.querySelectorAll('[data-copy-account]')) {
    other.classList.remove('is-copied');
    other.querySelector('span').textContent = '복사';
  }
  const feedback = book.querySelector('.account-feedback');
  feedback.textContent = success
    ? `${button.dataset.accountHolder}님의 계좌를 복사했어요.`
    : '복사가 되지 않았어요. 계좌번호를 길게 눌러 복사해 주세요.';
  book.querySelector('.account-receipt').classList.toggle('has-copy', success);
  if (success) { button.classList.add('is-copied'); button.querySelector('span').textContent = '복사됨'; }
}
