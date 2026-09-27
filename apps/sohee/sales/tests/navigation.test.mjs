import test from 'node:test';
import assert from 'node:assert/strict';
import {internalSalesLink,salesRoute} from '../src/navigation.mjs';
test('only plain clicks within known sales routes use in-app navigation',()=>{
  const origin='https://example.test';
  const link={href:origin+'/sungso/sohee/sales/menus/',target:'',hasAttribute:()=>false};
  const event={target:{closest:()=>link},button:0};
  assert.equal(internalSalesLink(event,origin)?.pathname,'/sungso/sohee/sales/menus/');
  assert.equal(internalSalesLink({...event,ctrlKey:true},origin),null);
  assert.equal(internalSalesLink({...event,defaultPrevented:true},origin),null);
  link.href='https://another.test/sungso/sohee/sales/menus/';assert.equal(internalSalesLink(event,origin),null);
  link.href=origin+'/sungso/sohee/workspace/';assert.equal(internalSalesLink(event,origin),null);
  assert.equal(salesRoute('/sungso/sohee/sales/'),'changes');assert.equal(salesRoute('/sungso/sohee/sales/not-a-page/'),null);
});
