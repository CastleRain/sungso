import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
import{wedding,accountGroups,guestDetails,extras}from'../js/config.mjs';import{calendarEvent,publishedAccounts}from'../js/core.mjs';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
test('VER5 uses actual wedding details, a single dynamic album and no vendor sample or video',()=>{assert.equal(wedding.startsAt,'2027-03-06T15:30:00+09:00');assert.match(html,/15층 벨리스홀/);assert.equal((html.match(/id="gallery"/g)||[]).length,1);assert.equal((html.match(/<audio /g)||[]).length,1);assert.doesNotMatch(html,/youtube|민호|하윤|TO OUR GUEST|type="password"/i);assert.match(calendarEvent(wedding),/DTSTART:20270306T063000Z/);assert.match(calendarEvent(wedding),/invitation-v5/);});
test('unprovided accounts, contacts, meal and reception are not published as placeholder facts',()=>{assert.equal(accountGroups.flatMap(publishedAccounts).length,0);assert.equal(guestDetails.contacts.length,0);assert.equal(extras.reception,null);assert.match(html,/id="accounts" hidden/);assert.doesNotMatch(html,/class="account-number"|무료 주차|RECEPTION|OUR SPOTS/);});
test('RSVP disclosures are explicit and management is a separately authenticated entry',async()=>{assert.match(html,/응답은 성우와 소희만/);assert.match(html,/예식 후 30일/);const manager=await readFile(new URL('../responses.html',import.meta.url),'utf8');assert.match(manager,/data-private-root hidden/);assert.match(manager,/firebase\/boot.mjs/);assert.match(manager,/application\/x-sungso-script/);});

test('configured accounts are escaped, copy digits only and omit incomplete rows',async()=>{
 const {renderAccounts}=await import('../js/account-view.mjs');const markup=renderAccounts([{label:'신랑 측',accounts:[{holder:'<홍길동>',relation:'신랑',bank:'은행 & 은행',number:'123-456-789'},{holder:'미정',bank:'',number:''}]}]);
 assert.match(markup,/data-copy-account="123456789"/);assert.match(markup,/&lt;홍길동&gt;/);assert.match(markup,/은행 &amp; 은행/);assert.doesNotMatch(markup,/미정|<홍길동>/);assert.match(markup,/은행 앱/);
});
