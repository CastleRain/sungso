import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAccounts } from '../js/account-view.mjs';
import { accountGroups, emptyAccounts } from '../../../shared/invitation/account-core.mjs';
test('guest account copy contains only digits, labels are escaped and transfer links are allowlisted', () => {
  const rows=emptyAccounts(); rows[0]={...rows[0],enabled:true,bank:'예시은행',holder:'<script>bad</script>',number:'123-456',payUrl:'https://qr.kakaopay.com/fixture'};
  const html=renderAccounts(accountGroups(rows));
  assert.match(html,/data-copy-account="123456"/);
  assert.doesNotMatch(html,/<script>/); assert.match(html,/&lt;script&gt;/);
  assert.match(html,/rel="noopener noreferrer"/);
  const unsafe=renderAccounts([{label:'신랑',accounts:[{...rows[0],relation:'신랑',payUrl:'javascript:alert(1)'}]}]);
  assert.doesNotMatch(unsafe,/javascript:|account-pay/);
  rows[0].enabled=false; assert.equal(renderAccounts(accountGroups(rows)),'');
});
test('four management groups become two family lists without losing parents or mixing recipients', () => {
  const rows=emptyAccounts().map((row,index)=>({...row,enabled:true,bank:'예시은행',holder:`예금주${index}`,number:`123-00${index}`}));
  const html=renderAccounts(accountGroups(rows));
  assert.equal((html.match(/role="tab"/g)||[]).length,2);
  assert.equal((html.match(/data-copy-account=/g)||[]).length,6);
  const [groom,bride]=html.split('id="account-panel-groom"')[1].split('id="account-panel-bride"');
  for(const n of [0,1,2]) {assert.match(groom,new RegExp(`123-00${n}`));assert.doesNotMatch(bride,new RegExp(`123-00${n}`));}
  for(const n of [3,4,5]) {assert.match(bride,new RegExp(`123-00${n}`));assert.doesNotMatch(groom,new RegExp(`123-00${n}`));}
  assert.match(html,/aria-label="신랑 아버지 예금주1 계좌번호 복사"/);
});
test('a single parent account remains usable without empty partner tabs or invented placeholders', () => {
  const rows=emptyAccounts();rows[5]={...rows[5],enabled:true,holder:'예시',bank:'예시은행',number:'123-456'};
  const html=renderAccounts(accountGroups(rows));
  assert.equal((html.match(/role="tab"/g)||[]).length,1);
  assert.doesNotMatch(html,/account-panel-groom|신랑 측/);
  assert.match(html,/신부 어머니 예시 계좌번호 복사/);
  assert.match(html,/class="account-digits">123-456/);
});
