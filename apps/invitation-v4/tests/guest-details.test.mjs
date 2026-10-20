import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAccounts, renderGuestDetails, googleCalendarUrl } from '../js/guest-details.mjs';
import { wedding, accountGroups, guestDetails } from '../js/config.mjs';

test('미정인 계좌·연락처·참석 링크는 공개 화면에 빈 조작 항목을 만들지 않는다', () => {
  assert.equal(renderAccounts(accountGroups), '');
  assert.deepEqual(renderGuestDetails(guestDetails), { contacts: '', attendance: '', guide: '' });
});

test('입력된 계좌만 공개하며 번호와 예금주를 탈출하고 실제 카카오페이 주소만 연결한다', () => {
  const accounts = [{ relation: '신랑', holder: '<테스트>', bank: '은행', number: '123-456-789012', payUrl: 'javascript:alert(1)' }];
  const html = renderAccounts([{ id: 'groom', label: '신랑 측', accounts }]);
  assert.match(html, /&lt;테스트&gt;/); assert.match(html, /data-account="groom-0"/);
  assert.doesNotMatch(html, /javascript:|카카오페이/);
  accounts[0].payUrl = 'https://qr.kakaopay.com/example';
  assert.match(renderAccounts([{ id: 'groom', accounts }]), /카카오페이/);
  accounts[0].number = ''; assert.equal(renderAccounts([{ accounts }]), '');
});

test('연락·안내·참석은 유효한 실제 입력을 받으며 스크립트 주소를 거부한다', () => {
  const details = renderGuestDetails({
    contacts: [{ role: '신랑', name: '테스트', phone: '010-1234-5678' }, { name: '미정', phone: '' }],
    guide: [{ title: '안내', text: '<img>\n다음 줄' }],
    attendanceUrl: 'javascript:alert(1)',
  });
  assert.match(details.contacts, /href="tel:01012345678"/);
  assert.match(details.contacts, /href="sms:01012345678"/);
  assert.doesNotMatch(details.contacts, /미정/);
  assert.match(details.guide, /&lt;img&gt;<br>다음 줄/);
  assert.equal(details.attendance, '');
});

test('Google 일정은 한국 예식 시각·장소·VER4 링크를 보존한다', () => {
  const url = new URL(googleCalendarUrl(wedding));
  assert.equal(url.searchParams.get('dates'), '20270306T063000Z/20270306T063000Z');
  assert.equal(url.searchParams.get('ctz'), 'Asia/Seoul');
  assert.ok(url.searchParams.get('location').includes('15층 벨리스홀'));
  assert.equal(url.searchParams.get('details'), wedding.canonicalUrl);
});
