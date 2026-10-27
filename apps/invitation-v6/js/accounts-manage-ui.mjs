import { ACCOUNT_SLOTS, emptyAccounts, validateAccounts, accountGroups } from '../../../shared/invitation/account-core.mjs';
import { renderAccounts } from './account-view.mjs?v=5.5.0';
import { mountAccountTabs } from './account-interactions.mjs?v=5.5.0';

export function mountAccountManager({ root, request, preview = false }) {
  let disposed = false, ready = false, pending = false, revision = 0, saved = '';
  root.className = 'manager account-manager';
  root.innerHTML = `
    ${preview ? '<p class="manager-preview-note">로컬 미리보기 · 예시 번호이며 실제 청첩장에 저장되지 않습니다.</p>' : ''}
    <header class="manager-header"><div><p class="manager-eyebrow">FOR OUR GUESTS</p><h1>마음 전하실 곳</h1></div><a href="./manage.html">사진첩 관리 ↗</a></header>
    <p class="manager-copy">계좌를 입력한 뒤 ‘청첩장에 반영’을 누르면 하객에게 공개돼요.<br>부모님 계좌는 각각 등록할 수 있고, 공개 표시를 끄면 숨겨집니다.</p>
    <form id="account-form" autocomplete="off">
      <fieldset class="account-fields" disabled>${['groom','groom-parents','bride','bride-parents'].map(group => {
        const slots = ACCOUNT_SLOTS.filter(slot => slot.group === group);
        return `<section class="account-editor-group"><h2>${slots[0].label}</h2>${slots.map(slot => `
          <fieldset class="account-editor" data-account-id="${slot.id}"><legend>${slot.relation}</legend>
            <label class="account-enabled"><input type="checkbox" name="enabled"> 청첩장에 공개</label>
            <div class="account-inputs">
              <label>은행<input name="bank" maxlength="40" placeholder="은행명" aria-label="${slot.label} ${slot.relation} 은행"></label>
              <label>예금주<input name="holder" maxlength="40" placeholder="예금주 이름" aria-label="${slot.label} ${slot.relation} 예금주"></label>
              <label class="account-full">계좌번호<input name="number" maxlength="40" inputmode="numeric" placeholder="숫자와 하이픈 입력" aria-label="${slot.label} ${slot.relation} 계좌번호"></label>
            </div>
            <details class="pay-settings"><summary>카카오페이 연결 <span>선택</span></summary><p>카카오페이 → 송금코드에서 복사한 링크를 넣어 주세요. 등록하면 계좌 옆에 송금 링크가 표시돼요.</p><label>송금 링크<input name="payUrl" type="url" maxlength="300" placeholder="https://qr.kakaopay.com/…" aria-label="${slot.label} ${slot.relation} 카카오페이 링크"></label></details>
          </fieldset>`).join('')}</section>`;
      }).join('')}</fieldset>
      <div class="manager-toolbar"><button type="button" id="accounts-reload" disabled>최신 내용 불러오기</button>${preview ? '<button type="button" id="accounts-sample" disabled>예시 번호 채워 보기</button>' : ''}<a href="./#accounts" target="_blank" rel="noopener">청첩장 보기 ↗</a></div>
      <p class="manager-status" id="accounts-status" role="status" aria-live="polite">계좌 정보를 불러오고 있어요.</p>
      <details class="accounts-preview-wrap" open><summary>하객에게 보이는 모습</summary><div class="account-preview"><p class="accounts-eyebrow">With gratitude</p><h2>마음 전하실 곳</h2><p class="account-preview-intro">보내주시는 따뜻한 마음,<br>감사히 간직하겠습니다.</p><div id="account-preview-content"></div></div></details>
      <footer class="manager-footer"><p>공개를 선택한 계좌만 청첩장에 표시됩니다.</p><button class="manager-primary" id="accounts-save" disabled>청첩장에 반영</button></footer>
    </form>`;
  const $ = selector => root.querySelector(selector), form = $('#account-form'), fields = $('.account-fields'), status = $('#accounts-status');
  const previewTabs = mountAccountTabs($('#account-preview-content'));
  function read() {
    return [...root.querySelectorAll('[data-account-id]')].map(field => ({
      id: field.dataset.accountId, enabled: field.querySelector('[name=enabled]').checked,
      ...Object.fromEntries(['bank','holder','number','payUrl'].map(key => [key, field.querySelector(`[name=${key}]`).value])),
    }));
  }
  const dirty = () => ready && JSON.stringify(read()) !== saved;
  function controls() {
    fields.disabled = !ready || pending;
    $('#accounts-reload').disabled = pending;
    $('#accounts-save').disabled = !ready || pending || !dirty();
    if ($('#accounts-sample')) $('#accounts-sample').disabled = !ready || pending;
  }
  function showPreview() {
    const area = $('#account-preview-content');
    try {
      const groups = accountGroups(read());
      area.innerHTML = groups.length ? renderAccounts(groups) : '<p class="manager-note">공개할 계좌를 입력하면 여기에 보여요.</p>';
      previewTabs.refresh();
      area.querySelectorAll('[data-copy-account]').forEach(button => {
        button.disabled = true;
        button.title = '미리보기입니다. 실제 청첩장에서 복사할 수 있어요.';
      });
      // Preview must not launch a financial action.
      area.querySelectorAll('.account-pay').forEach(link => { link.removeAttribute('href'); link.setAttribute('aria-disabled','true'); });
    } catch { area.innerHTML = '<p class="manager-note">은행·예금주·계좌번호를 완성하면 미리보기가 표시돼요.</p>'; }
    controls();
  }
  function fill(rows) {
    for (const row of rows) {
      const field = root.querySelector(`[data-account-id="${row.id}"]`);
      field.querySelector('[name=enabled]').checked = row.enabled;
      for (const key of ['bank','holder','number','payUrl']) field.querySelector(`[name=${key}]`).value = row[key];
    }
  }
  async function load() {
    pending = true; controls(); status.textContent = '계좌 정보를 불러오고 있어요.';
    try {
      const data = await request('/manage');
      if (disposed) return;
      const accounts = validateAccounts(data.accounts);
      if (!Number.isSafeInteger(data.revision)) throw Error('계좌 정보를 확인할 수 없어요.');
      revision = data.revision; fill(accounts); ready = true; saved = JSON.stringify(read());
      status.textContent = '저장된 내용을 불러왔어요.';
    } catch (error) { if (!disposed) status.textContent = error.message; }
    finally { if (!disposed) { pending = false; showPreview(); } }
  }
  form.addEventListener('input', () => { status.textContent = '아직 반영하지 않은 변경이 있어요.'; showPreview(); });
  $('#accounts-reload').addEventListener('click', () => {
    if (!dirty() || window.confirm('입력 중인 내용을 버리고 저장된 최신 내용을 불러올까요?')) void load();
  });
  $('#accounts-sample')?.addEventListener('click', () => {
    fill(emptyAccounts().map((row,index) => ({...row,enabled:true,bank:'예시은행',holder:['성우','아버지 예시','어머니 예시','소희','아버지 예시','어머니 예시'][index],number:`123-${String(index+1).padStart(3,'0')}`})));
    status.textContent = '미리보기용 예시 번호입니다. 실제 계좌가 아니에요.'; showPreview();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!ready || pending || !dirty()) return;
    let accounts;
    try { accounts = validateAccounts(read()); } catch (error) { status.textContent = error.message; return; }
    pending = true; controls(); status.textContent = '청첩장에 반영하고 있어요.';
    try {
      const data = await request('/manage', { method:'PUT', body:{accounts,expectedRevision:revision} });
      if (disposed) return;
      const next = validateAccounts(data.accounts); revision = data.revision; fill(next); saved = JSON.stringify(read());
      status.textContent = preview ? '로컬 미리보기에 반영했어요. 실제 청첩장은 바뀌지 않았습니다.' : '청첩장에 반영했어요.';
    } catch (error) { if (!disposed) status.textContent = error.message; }
    finally { if (!disposed) { pending = false; showPreview(); } }
  });
  const beforeLeave = event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeLeave);
  void load();
  return { dispose() { disposed = true; saved = ''; window.removeEventListener('beforeunload', beforeLeave); previewTabs.dispose(); root.replaceChildren(); } };
}
