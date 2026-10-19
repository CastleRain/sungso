import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { wedding, photos } from '../js/config.mjs';
import { koreanDateParts, calendarDays, daysUntil, formatWedding, calendarEvent, photoIndex, shareUrl, countdown, publishedAccounts } from '../js/core.mjs';

test('예식의 한국 시각·요일·새 장소가 일치한다', () => {
  assert.deepEqual(koreanDateParts(wedding.startsAt), { year: 2027, month: 3, day: 6, hour: 15, minute: 30 });
  assert.deepEqual(formatWedding(wedding.startsAt), { date: '2027. 03. 06', dateKorean: '2027년 3월 6일 토요일', time: '오후 3시 30분', weekday: '토요일' });
  assert.equal(wedding.room, '15층 벨리스홀');
});
test('3월 달력은 월요일 1일·토요일 6일과 실제 31일을 표시한다', () => {
  const { cells } = calendarDays(wedding.startsAt);
  assert.equal(cells.length, 35);
  assert.equal(cells[0], null);
  assert.deepEqual(cells[1], { day: 1, wedding: false });
  assert.deepEqual(cells[6], { day: 6, wedding: true });
  assert.equal(cells.filter(Boolean).length, 31);
  assert.equal(cells.filter(cell => cell?.wedding).length, 1);
});
test('달력은 윤년과 시작 요일이 다른 월도 정확하게 계산한다', () => {
  assert.equal(calendarDays('2028-02-06T15:30:00+09:00').cells.filter(Boolean).length, 29);
  assert.equal(calendarDays('2027-02-06T15:30:00+09:00').cells.filter(Boolean).length, 28);
});
test('D-day는 실행 기기의 시간대 대신 한국 자정에 바뀐다', () => {
  assert.equal(daysUntil(wedding.startsAt, new Date('2027-03-05T14:59:59Z')), 1);
  assert.equal(daysUntil(wedding.startsAt, new Date('2027-03-05T15:00:00Z')), 0);
  assert.equal(daysUntil(wedding.startsAt, new Date('2027-03-06T15:00:00Z')), -1);
});
test('실시간 카운트다운은 예식 시작 시각까지의 실제 일·시·분·초를 센다', () => {
  assert.deepEqual(countdown(wedding.startsAt, '2027-03-05T06:29:59Z'), { days: 1, hours: 0, minutes: 0, seconds: 1, calendarDaysLeft: 1, phase: 'waiting' });
  const near = countdown(wedding.startsAt, '2027-03-06T06:29:59.500Z');
  assert.equal(near.seconds, 1);
  assert.equal(near.phase, 'waiting');
});
test('예식 시각 이후에는 음수가 나오지 않고 당일·이후 감사 상태를 구분한다', () => {
  const today = countdown(wedding.startsAt, wedding.startsAt);
  assert.deepEqual([today.days,today.hours,today.minutes,today.seconds,today.phase], [0,0,0,0,'today']);
  assert.equal(countdown(wedding.startsAt, '2027-03-06T15:00:00Z').phase, 'past');
});
test('계좌는 은행·예금주·실제 번호가 모두 입력된 항목만 노출한다', () => {
  const base = { relation: '신랑', holder: '테스트', bank: '검증은행', number: '123-456-789012' };
  assert.deepEqual(publishedAccounts({accounts:[base,{...base,bank:''},{...base,holder:' '},{...base,number:''},{...base,number:'123'},{...base,number:'<script>'}]}), [base]);
  assert.equal(publishedAccounts({accounts:[{...base,relation:'아버지'}, {...base,relation:'어머니',number:''}]}).length, 1);
});
test('일정 파일은 15:30 한국 시각과 장소·배포본의 CRLF를 보존한다', async () => {
  const result = calendarEvent(wedding);
  assert.ok(result.includes('DTSTART:20270306T063000Z\r\n'));
  assert.ok(!result.includes('DTEND:'));
  assert.ok(result.replace(/\r\n /g, '').includes('15층 벨리스홀'));
  assert.ok(result.endsWith('END:VCALENDAR\r\n'));
  const published = await readFile(new URL('../wedding.ics', import.meta.url), 'utf8');
  assert.ok(published.includes('DTSTART:20270306T063000Z\r\n'));
  assert.ok(!/(?<!\r)\n/.test(published));
});
test('종료 시각이 따로 확정된 경우에만 일정에 종료 시각을 넣는다', () => {
  assert.ok(calendarEvent({ ...wedding, endsAt: '2027-03-06T16:30:00+09:00' }).includes('DTEND:20270306T073000Z\r\n'));
});
test('한국어 일정 줄은 UTF-8 75바이트 안에서 접히고 원문을 보존한다', () => {
  const result = calendarEvent({ ...wedding, title: '가'.repeat(80) });
  assert.ok(result.split('\r\n').every(line => Buffer.byteLength(line, 'utf8') <= 75));
  assert.ok(result.replace(/\r\n /g, '').includes(`SUMMARY:${'가'.repeat(80)}`));
});
test('일정 문구의 쉼표·줄바꿈은 다른 필드로 주입되지 않는다', () => {
  const result = calendarEvent({ ...wedding, title: '초대, 함께;해요\nBEGIN:BAD' });
  assert.ok(result.includes('SUMMARY:초대\\, 함께\\;해요\\nBEGIN:BAD'));
  assert.ok(!result.includes('\r\nBEGIN:BAD'));
});
test('갤러리의 처음·마지막 순환이 맞는다', () => {
  assert.equal(photoIndex(-1, 5), 4);
  assert.equal(photoIndex(5, 5), 0);
  assert.equal(photoIndex(1, 5), 1);
});
test('미배포 로컬 화면은 로컬 주소를, 공개 화면은 정식 주소를 공유한다', () => {
  assert.equal(shareUrl(wedding, new URL('http://127.0.0.1:8021/sungso/invitation-v2/#gallery')), 'http://127.0.0.1:8021/sungso/invitation-v2/');
  assert.equal(shareUrl(wedding, new URL(wedding.canonicalUrl)), wedding.canonicalUrl);
});
test('생성된 HTML의 공유 정보·본문·사진은 공통 설정과 일치한다', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('{{'));
  assert.ok(html.includes(`datetime="${wedding.startsAt}"`));
  assert.ok(html.includes(`${wedding.venue} ${wedding.room}`));
  assert.ok(html.includes('토요일 오후 3시 30분'));
  assert.ok(html.includes(`content="${wedding.canonicalUrl}assets/photos/share.jpg"`));
  assert.ok(!html.includes('다비다'));
  for (const photo of photos) { await access(new URL(`../${photo.src}`, import.meta.url)); await access(new URL(`../${photo.thumb}`, import.meta.url)); }
});
