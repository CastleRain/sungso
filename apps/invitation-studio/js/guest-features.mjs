import { $, $$, openDialog, copyText, toast, readPreference, savePreference } from './ui.mjs';

export async function setupAccounts(adapter) {
  let groups = await adapter.accounts(); const panel = $('#account-panel');
  let previewOnly = false;
  let side = readPreference('sungso_invitation_experience_account_side', 'groom');
  function render(next) {
    side = groups.some(group => group.id === next) ? next : groups[0]?.id;
    const accounts = groups.find(group => group.id === side)?.accounts || [];
    panel.replaceChildren();
    for (const account of accounts) {
      const row = document.createElement('div'); row.className = 'account-row';
      const owner = document.createElement('p'); owner.className = 'account-owner';
      const role = document.createElement('small'); role.textContent = account.relation;
      const holder = document.createElement('span'); holder.textContent = account.holder; owner.append(role, holder);
      const number = document.createElement('p'); number.className = 'account-number';
      const bank = document.createElement('span'); bank.className = 'account-bank'; bank.textContent = account.bank;
      number.append(bank, document.createTextNode(account.number));
      const button = document.createElement('button'); button.className = 'account-copy'; button.textContent = '계좌번호 복사';
      button.setAttribute('aria-label', `${account.relation} ${account.holder} 예시 계좌번호 복사`);
      button.addEventListener('click', async () => {
        if (previewOnly) return;
        button.disabled = true;
        try {
          const ok = await copyText(account.number.replace(/\D/g, ''), `${account.holder}님의 예시 번호를 복사했어요.`);
          if (ok && button.isConnected) { button.textContent = '복사했어요'; button.classList.add('is-copied'); setTimeout(() => { if (button.isConnected) { button.textContent = '계좌번호 복사'; button.classList.remove('is-copied'); } }, 2200); }
        } finally { button.disabled = false; }
      });
      if (previewOnly) { button.disabled = true; button.textContent = '계좌 미리보기'; button.setAttribute('aria-label', `${account.relation} 계좌 미리보기`); }
      row.append(owner, number, button); panel.append(row);
    }
    $$('[data-account-side]').forEach(button => {
      const selected = button.dataset.accountSide === side;
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `tab-${side}`);
    if (previewOnly && !accounts.length) { const empty = document.createElement('p'); empty.className = 'section-subtitle'; empty.textContent = '공개할 계좌를 등록하면 이곳에 보여요.'; panel.append(empty); }
    $('#accounts').hidden = !previewOnly && !groups.some(group => group.accounts.length);
    savePreference('sungso_invitation_experience_account_side', side);
    document.dispatchEvent(new Event('lab:layout-changed'));
  }
  $$('[data-account-side]').forEach(button => {
    button.addEventListener('click', () => render(button.dataset.accountSide));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'Home' ? 'groom' : event.key === 'End' ? 'bride' : side === 'groom' ? 'bride' : 'groom';
      render(target); $(`[data-account-side="${target}"]`).focus();
    });
  });
  render(side);
  return { render, replaceGroups(next, options = {}) { groups = next; previewOnly = Boolean(options.previewOnly); render(side); } };
}

export async function setupGuestbook(adapter) {
  let entries = [], deleting;
  const form = $('#guestbook-form'), submit = $('button[type=submit]', form);
  function messageNode(entry) {
    const item = document.createElement('li'); item.dataset.messageId=entry.id;if(entry.paper)item.dataset.paper=entry.paper;if(entry.stamp){const stamp=document.createElement('span');stamp.className='message-stamp';stamp.textContent=({coffee:'☕',flowers:'💐',ring:'💍',cheers:'🥂',heart:'♡'})[entry.stamp]||'';stamp.setAttribute('aria-hidden','true');item.append(stamp);}
    const header = document.createElement('div'); header.className = 'guest-head';
    const name = document.createElement('strong'); name.textContent = entry.name;
    const date = document.createElement('time'); date.dateTime = entry.createdAt;
    date.textContent = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(entry.createdAt));
    header.append(name, date);
    const message = document.createElement('p'); message.className = 'guest-message'; message.textContent = entry.message;
    item.append(header, message);
    if (entry.owned) {
      const remove = document.createElement('button'); remove.className = 'guest-delete'; remove.textContent = '내 메시지 삭제';
      remove.addEventListener('click', () => { deleting = entry.id; $('#delete-status').textContent = ''; openDialog('delete-dialog', remove); }); item.append(remove);
    }
    return item;
  }
  async function refresh() {
    try {
      entries = await adapter.messages(); queueMicrotask(()=>document.dispatchEvent(new Event('experience:messages-rendered')));
      $('#guestbook-list').replaceChildren(...entries.slice(0, 2).map(messageNode));
      $('#guestbook-all-list').replaceChildren(...entries.map(messageNode));
      $('#guestbook-all-open').hidden = entries.length <= 2;
      $('#guestbook-status').textContent = entries.length ? '따뜻한 마음을 남겨 주셔서 고마워요.' : '첫 번째 축하의 마음을 남겨 주세요.';
      $('#demo-storage-note').textContent = adapter.persistent ? '체험 방명록 · 이 시안과 이 기기에만 저장됩니다.' : '체험 방명록 · 저장 공간을 사용할 수 없어 현재 탭에서만 유지됩니다.';
      document.dispatchEvent(new Event('lab:layout-changed'));
    } catch { $('#guestbook-status').textContent = '메시지를 불러오지 못했어요. 다시 시도해 주세요.'; }
  }
  $('#guestbook-write').addEventListener('click', event => openDialog('guestbook-composer', event.currentTarget));
  $('#guestbook-all-open').addEventListener('click', event => openDialog('guestbook-all', event.currentTarget));
  $('#guestbook-refresh').addEventListener('click', refresh);
  $('#guest-message').addEventListener('input', event => { $('#message-count').textContent = [...event.target.value].length; });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (submit.disabled) return; submit.disabled = true;
    $('#guest-form-status').textContent = '체험 메시지를 저장하고 있어요.';
    try {
      await adapter.write({ name: $('#guest-name').value, message: $('#guest-message').value, consent: $('#guest-consent').checked, website: $('#guest-website').value, ...(!form.querySelector('.message-decoration')?.hidden ? {stamp:form.elements.stamp?.value,paper:form.elements.paper?.value}:{}) });
      form.reset(); $('#message-count').textContent = '0'; $('#guest-form-status').textContent = '';
      $('#guestbook-composer').close(); await refresh(); document.dispatchEvent(new Event('experience:message-saved')); toast('이 시안에 체험 메시지를 남겼어요.');
    } catch (error) { $('#guest-form-status').textContent = error.message || '저장하지 못했어요. 내용을 유지한 채 다시 시도해 주세요.'; }
    finally { submit.disabled = false; }
  });
  $('#confirm-delete').addEventListener('click', async event => {
    const button = event.currentTarget; if (button.disabled || !deleting) return; button.disabled = true;
    try { await adapter.remove(deleting); deleting = undefined; $('#delete-dialog').close(); await refresh(); toast('체험 메시지를 삭제했어요.'); }
    catch (error) { $('#delete-status').textContent = error.message; }
    finally { button.disabled = false; }
  });
  await refresh();
  return { refresh };
}
