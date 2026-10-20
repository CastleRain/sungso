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
