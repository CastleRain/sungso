import test from 'node:test';
import assert from 'node:assert/strict';
import { countdown, calendarEvent, calendarDays, koreanDateParts, formatWedding, shareUrl } from '../js/core.mjs';
import { wedding } from '../../invitation-v6/js/config.mjs';

test('countdown switches calendar day at Korean midnight while keeping time-to-ceremony accurate', () => {
  const before = countdown(wedding.startsAt, '2027-03-05T23:59:59+09:00');
  assert.deepEqual(before, { days: 0, hours: 15, minutes: 30, seconds: 1, calendarDaysLeft: 1, phase: 'waiting' });
  const midnight = countdown(wedding.startsAt, '2027-03-06T00:00:00+09:00');
  assert.deepEqual(midnight, { days: 0, hours: 15, minutes: 30, seconds: 0, calendarDaysLeft: 0, phase: 'waiting' });
  assert.deepEqual(countdown(wedding.startsAt, '2027-03-05T15:00:00Z'), midnight);
});

test('countdown never turns negative and distinguishes ceremony day from the following day', () => {
  assert.equal(countdown(wedding.startsAt, '2027-03-06T15:29:59.250+09:00').seconds, 1);
  for (const now of ['2027-03-06T15:30:00+09:00', '2027-03-06T18:00:00+09:00', '2027-03-06T23:59:59+09:00']) {
    assert.deepEqual(countdown(wedding.startsAt, now), { days: 0, hours: 0, minutes: 0, seconds: 0, calendarDaysLeft: 0, phase: 'today' });
  }
  assert.deepEqual(countdown(wedding.startsAt, '2027-03-07T00:00:00+09:00'), { days: 0, hours: 0, minutes: 0, seconds: 0, calendarDaysLeft: -1, phase: 'past' });
});

test('actual wedding calendar and text use Korean Saturday 6 March at 15:30', () => {
  assert.deepEqual(koreanDateParts('2027-03-06T06:30:00Z'), { year: 2027, month: 3, day: 6, hour: 15, minute: 30 });
  const calendar = calendarDays(wedding.startsAt);
  assert.equal(calendar.cells.length, 35); assert.equal(calendar.cells[0], null);
  assert.deepEqual(calendar.cells[6], { day: 6, wedding: true });
  assert.equal(calendar.cells.filter(cell => cell?.wedding).length, 1);
  assert.deepEqual(calendar.cells.filter(Boolean).map(cell => cell.day), Array.from({ length: 31 }, (_, index) => index + 1));
  assert.deepEqual(formatWedding(wedding.startsAt), { date: '2027. 03. 06', dateKorean: '2027년 3월 6일 토요일', time: '오후 3시 30분', weekday: '토요일' });
});

test('each ICS preserves its own lab URL, UTC ceremony time and CRLF-compatible folded lines', () => {
  for (const variant of ['a', 'b', 'c', 'd', 'e']) {
    const canonicalUrl = `https://sungso-wedding.vercel.app/lab/v6-1/${variant}/`;
    const text = calendarEvent({ ...wedding, canonicalUrl });
    assert.equal(text.replaceAll('\r\n', '').includes('\n'), false);
    assert.equal(text.replaceAll('\r\n', '').includes('\r'), false);
    assert.ok(text.endsWith('\r\n'));
    const physicalLines = text.split('\r\n');
    assert.ok(physicalLines.every(line => Buffer.byteLength(line, 'utf8') <= 75));
    const lines = text.replace(/\r\n[ \t]/g, '').split('\r\n');
    assert.equal(lines.filter(line => line === `URL:${canonicalUrl}`).length, 1);
    assert.ok(lines.includes('DTSTART:20270306T063000Z'));
    assert.ok(lines.includes(`SUMMARY:${wedding.title.replace(',', '\\,')}`));
    assert.ok(lines.includes(`DESCRIPTION:성우와 소희의 결혼식에 초대합니다.\\n${wedding.room}`));
    assert.equal(lines.some(line => line.startsWith('DTEND:')), false);
    assert.equal(lines.some(line => /homehunt|honeymoon|wecost|castlerain\.github\.io/i.test(line)), false);
    assert.equal(lines[0], 'BEGIN:VCALENDAR'); assert.ok(lines.includes('END:VEVENT')); assert.equal(lines.at(-2), 'END:VCALENDAR');
  }
});

test('ICS folds long Korean content without losing Unicode or allowing text newlines to become properties', () => {
  const title = '가나다라마바사'.repeat(10) + ', 축하; 함께\\여기\n다음 줄';
  const text = calendarEvent({ ...wedding, title, canonicalUrl: 'https://sungso-wedding.vercel.app/lab/v6-1/e/' });
  const physicalLines = text.split('\r\n');
  assert.ok(physicalLines.some(line => line.startsWith(' ')));
  assert.ok(physicalLines.every(line => Buffer.byteLength(line, 'utf8') <= 75));
  const summary = text.replace(/\r\n[ \t]/g, '').split('\r\n').find(line => line.startsWith('SUMMARY:'));
  assert.equal(summary, `SUMMARY:${'가나다라마바사'.repeat(10)}\\, 축하\\; 함께\\\\여기\\n다음 줄`);
  assert.equal(text.includes('\uFFFD'), false);
});

test('share address uses the current preview path locally and published canonical URL on production', () => {
  const canonicalUrl = 'https://sungso-wedding.vercel.app/lab/v6-1/d/';
  const local = new URL('http://127.0.0.1:8031/lab/v6-1/d/?compare=1#photo/4');
  assert.equal(shareUrl({ canonicalUrl }, local), 'http://127.0.0.1:8031/lab/v6-1/d/');
  assert.equal(shareUrl({ canonicalUrl }, new URL('https://sungso-wedding.vercel.app/lab/v6-1/d/#story/2')), canonicalUrl);
});
